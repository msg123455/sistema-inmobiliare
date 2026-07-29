import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GraduationCap, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, Lightbulb, MessageSquare, SlidersHorizontal, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { construirPrompt, mergeConfigEval } from '@/lib/evaluadorConfig';

const MODELO_FALLBACK = 'claude_sonnet_4_6'; // solo si Base44 rechaza el string de Opus
const MAX_POR_CORRIDA = 60;                   // tope de seguridad por corrida
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scoreColor = (s) => (s >= 75 ? 'text-green-600' : s >= 50 ? 'text-amber-600' : 'text-red-600');
const barColor = (s) => (s >= 75 ? 'bg-green-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500');
const sinGuion = (t) => String(t ?? '').replace(/\s*[—–]\s*/g, ', ').trim();
const norm = (t) => String(t || '').replace(/\D/g, '');
const esNombreGenerico = (n) => !n || /^lead\b/i.test(String(n).trim());

// ── Transcripcion; marca mensajes de operador humano para no culpar a Valentina ──
function construirTranscript(hist) {
  // Cada mensaje = exactamente una linea (los saltos internos se aplanan) para poder numerarlos
  const limpio = (t) => String(t ?? '').replace(/\s*\n+\s*/g, ' ').trim();
  const lines = [];
  for (const m of hist) {
    if (m.role === 'user') lines.push(`Lead: ${limpio(m.content)}`);
    else if (m.role === 'assistant') lines.push(`Valentina${m.humano ? ' (operador humano, NO evaluar este mensaje)' : ''}: ${limpio(m.content)}`);
  }
  return lines.join('\n');
}

function resumenMeta(e) {
  const d = e.datos || {};
  const p = [];
  if (e.nombre) p.push(`Nombre capturado: ${e.nombre}`);
  if (d.operacion) p.push(`Operacion: ${d.operacion}`);
  if (d.presupuesto) p.push(`Presupuesto guardado: $${d.presupuesto}`);
  if (d.tipo_prop) p.push(`Tipo de inmueble: ${d.tipo_prop}`);
  if (d.barrio || d.zona) p.push(`Zona: ${d.barrio || d.zona}`);
  if (d.ciudad) p.push(`Ciudad: ${d.ciudad}`);
  if (d.habitaciones) p.push(`Habitaciones: ${d.habitaciones}`);
  if (e.etapa_ventas) p.push(`Etapa de ventas: ${e.etapa_ventas}`);
  if (e.descalificado) p.push(`ESTADO FINAL: DESCALIFICADO (${e.motivo_desc || 'sin motivo'})`);
  if (e.presupuesto_bajo) p.push('Marca: presupuesto en zona gris');
  if (e.broker) p.push(`Broker asignado: ${e.broker}`);
  return p.join('\n') || 'Sin datos estructurados capturados.';
}

// Contexto de negocio para el juez: catalogo de inmuebles + campana activa (lo mismo que ve Valentina)
function construirContextoNegocio(campanas, propiedades) {
  const props = propiedades || [];
  const detalle = (p) => [p.tipo, p.barrio || p.ciudad, p.precio_venta ? '$' + Math.round(p.precio_venta / 1e6) + 'M' : '', p.canon_arriendo ? '$' + Math.round(p.canon_arriendo / 1e6) + 'M/mes' : '', p.habitaciones ? p.habitaciones + ' hab' : '', p.area_m2 ? p.area_m2 + 'm2' : ''].filter(Boolean).join(', ');

  const catalogo = props.slice(0, 60).map((p, i) => `${i + 1}. ${p.titulo || 'Inmueble'}: ${detalle(p)}`).join('\n');
  const catalogoSection = catalogo
    ? `CATALOGO DE INMUEBLES DISPONIBLES (lo unico que Valentina puede ofrecer; si menciono uno que NO esta aqui se lo invento y es un error; si el lead pidio algo que SI esta y no lo conecto, tambien es error):\n${catalogo}`
    : 'No hay inmuebles cargados en el catalogo.';

  const activa = (campanas || []).find((c) => c.activa);
  let campanaSection = 'No hay ninguna campana de ads activa; no esperes que Valentina conecte al lead con un anuncio.';
  if (activa) {
    const promos = (Array.isArray(activa.inmuebles) ? activa.inmuebles : [])
      .map((id) => props.find((p) => p.id === id)).filter(Boolean)
      .map((p, i) => `${i + 1}. ${p.titulo || 'Inmueble'}: ${detalle(p)}`).join('\n');
    campanaSection = `CAMPANA ACTIVA: "${activa.nombre}". Promociona: ${activa.que_promociona || ''}.${activa.zona ? ' Zona: ' + activa.zona + '.' : ''}${activa.operacion ? ' Operacion: ' + activa.operacion + '.' : ''}${activa.contexto_agente ? ' Contexto: ' + activa.contexto_agente : ''}
${promos ? 'Inmuebles promocionados:\n' + promos + '\n' : ''}Muchos leads escriben POR este anuncio. Si el lead se refiere al anuncio (ej: "la del estado", "la de la publicidad", "la de hoy", "el anuncio", "la que vi"), Valentina DEBIA entender que habla de lo promocionado y conectar con ese inmueble, sin pedir que le aclare. Si hizo la conexion, premiala; si pidio aclaracion en vez de conectar, es un ERROR importante.`;
  }
  return `${catalogoSection}\n\n${campanaSection}`;
}

function parseVeredicto(input) {
  let obj = null;
  if (input && typeof input === 'object') {
    obj = input;
  } else {
    const text = String(input || '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { obj = JSON.parse(m[0]); } catch { return null; }
  }
  const s = obj.scores || {};
  const clamp = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));
  const scores = {
    calificacion: clamp(s.calificacion),
    humanizacion: clamp(s.humanizacion),
    rapidez: clamp(s.rapidez),
    cierre: clamp(s.cierre),
  };
  const total = Math.round((scores.calificacion + scores.humanizacion + scores.rapidez + scores.cierre) / 4);
  const arr = (x) => (Array.isArray(x) ? x.filter(Boolean).map(sinGuion).slice(0, 3) : []);
  const anotaciones = Array.isArray(obj.anotaciones)
    ? obj.anotaciones
        .map((a) => ({
          msg: Math.max(1, Math.round(Number(a.msg) || 0)),
          tipo: ['error', 'bien', 'mejora'].includes(a.tipo) ? a.tipo : 'mejora',
          comentario: sinGuion(a.comentario).slice(0, 400),
        }))
        .filter((a) => a.msg && a.comentario)
        .slice(0, 40)
    : [];
  return {
    score_total: total,
    scores,
    veredicto: sinGuion(obj.veredicto).slice(0, 300),
    fortalezas: arr(obj.fortalezas),
    errores: arr(obj.errores),
    lecciones: arr(obj.lecciones),
    anotaciones,
  };
}

async function juzgar(modelo, config, transcript, meta, contextoNegocio) {
  const prompt = construirPrompt(config, meta, transcript, contextoNegocio);
  const params = modelo ? { prompt, model: modelo } : { prompt };
  const response = await base44.integrations.Core.InvokeLLM(params);
  return parseVeredicto(response);
}

function ScoreBar({ label, value }) {
  const v = Number(value) || 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{v}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor(v)}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

const ESTILO_ANOT = {
  error:  'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300',
  bien:   'border-green-500 bg-green-500/10 text-green-700 dark:text-green-300',
  mejora: 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300',
};
const ICONO_ANOT = { error: AlertTriangle, bien: CheckCircle2, mejora: Lightbulb };

function parseLineas(transcript) {
  return String(transcript || '').split('\n').filter(Boolean).map((l, i) => ({
    n: i + 1,
    esLead: /^lead:/i.test(l),
    texto: l.replace(/^(lead|valentina[^:]*):\s*/i, ''),
  }));
}

// Vista tipo "comentarios de Word": el chat y, al margen, los comentarios anclados a cada mensaje.
function RevisionModal({ ev }) {
  const lineas = parseLineas(ev.transcript);
  let anots = [];
  try { anots = JSON.parse(ev.anotaciones || '[]'); } catch {}
  const porMsg = {};
  for (const a of anots) (porMsg[a.msg] = porMsg[a.msg] || []).push(a);

  return (
    <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <span className="truncate">{ev.nombre_lead || ev.cliente_id || 'Lead'}</span>
          <span className={`text-xl font-bold ${scoreColor(ev.score_total)}`}>{ev.score_total}<span className="text-xs text-muted-foreground font-normal">/100</span></span>
        </DialogTitle>
      </DialogHeader>
      {ev.veredicto && <p className="text-sm italic text-muted-foreground border-l-2 border-border pl-2">{ev.veredicto}</p>}
      <p className="text-[11px] text-muted-foreground">La conversación a la izquierda; los comentarios del juez, anclados a cada mensaje, al lado.</p>
      <div className="space-y-2.5 mt-1">
        {lineas.map(({ n, esLead, texto }) => {
          const coms = porMsg[n] || [];
          return (
            <div key={n} className={`grid md:grid-cols-[1fr,300px] gap-2 items-start ${coms.length ? 'md:bg-muted/30 md:rounded-lg md:p-1' : ''}`}>
              <div className={`flex ${esLead ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${esLead ? 'bg-muted text-foreground rounded-tl-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}`}>
                  <div className="text-[10px] opacity-70 mb-0.5">[{n}] {esLead ? 'Lead' : 'Valentina'}</div>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{texto}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {coms.map((a, j) => {
                  const Icono = ICONO_ANOT[a.tipo] || Lightbulb;
                  return (
                    <div key={j} className={`text-xs rounded-lg border-l-2 p-2 flex gap-1.5 ${ESTILO_ANOT[a.tipo] || ESTILO_ANOT.mejora}`}>
                      <Icono className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{a.comentario}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </DialogContent>
  );
}

function EvalCard({ ev }) {
  const total = Number(ev.score_total) || 0;
  const fecha = ev.fecha_evaluacion ? new Date(ev.fecha_evaluacion).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{ev.nombre_lead || ev.cliente_id || 'Lead sin nombre'}</p>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
              {ev.canal && <Badge variant="outline" className="text-[10px] capitalize">{ev.canal}</Badge>}
              {ev.nombre_lead && ev.cliente_id && <span>{ev.cliente_id}</span>}
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{ev.num_mensajes || 0} msj</span>
              {fecha && <span>{fecha}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-3xl font-bold leading-none ${scoreColor(total)}`}>{total}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">/ 100</div>
          </div>
        </div>

        {ev.veredicto && <p className="text-xs text-foreground/80 italic border-l-2 border-border pl-2">{ev.veredicto}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <ScoreBar label="Calificación" value={ev.score_calificacion} />
          <ScoreBar label="Humanización" value={ev.score_humanizacion} />
          <ScoreBar label="Rapidez" value={ev.score_rapidez} />
          <ScoreBar label="Cierre" value={ev.score_cierre} />
        </div>

        {ev.fortalezas?.length > 0 && (
          <div className="space-y-1">
            {ev.fortalezas.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {ev.errores?.length > 0 && (
          <div className="space-y-1">
            {ev.errores.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {ev.lecciones?.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 p-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" />Sugerencias para mejorar a Valentina
            </p>
            {ev.lecciones.map((l, i) => (
              <div key={i} className="text-xs text-amber-800 dark:text-amber-300/90 pl-1">• {l}</div>
            ))}
          </div>
        )}

        {ev.transcript && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs w-full">
                <FileText className="w-3.5 h-3.5 mr-1" />Ver revisión chat por chat
              </Button>
            </DialogTrigger>
            <RevisionModal ev={ev} />
          </Dialog>
        )}

        {ev.modelo_juez && <p className="text-[10px] text-muted-foreground/70 text-right">Juez: {ev.modelo_juez}</p>}
      </CardContent>
    </Card>
  );
}

export default function Autoeducacion() {
  const qc = useQueryClient();
  const [evaluando, setEvaluando] = useState(false);
  const [progreso, setProgreso] = useState(null); // { hechos, total, actual }

  const { data: evaluaciones = [], isLoading } = useQuery({
    queryKey: ['evaluaciones'],
    queryFn: () => base44.entities.EvaluacionChat.list('-created_date', 200),
  });

  // Corre la evaluacion. borrarTodo = true -> limpia TODO y reevalua todos los contactos.
  const correr = async (borrarTodo) => {
    setEvaluando(true);
    setProgreso(null);
    try {
      const [notas, evalsPrev, memorias, convs, contactos, configs, campanas, propiedades] = await Promise.all([
        base44.entities.Nota.list('-created_date', 500),
        base44.entities.EvaluacionChat.list('-created_date', 500),
        base44.entities.MemoriaChat.list('-created_date', 500).catch(() => []),
        base44.entities.Conversacion.list('-created_date', 500).catch(() => []),
        base44.entities.Contacto.list('-created_date', 1000).catch(() => []),
        base44.entities.ConfigEvaluador.list('-created_date', 1).catch(() => []),
        base44.entities.CampanaAds.list('-created_date', 100).catch(() => []),
        base44.entities.Propiedad.list('-created_date', 1000).catch(() => []),
      ]);
      const config = mergeConfigEval(configs[0]);
      const contextoNegocio = construirContextoNegocio(campanas, propiedades);

      // Canal por telefono (el evaluador NUNCA toma Telegram)
      const canalPorTel = {};
      for (const m of memorias) if (m?.telefono) canalPorTel[norm(m.telefono)] = m.canal || '';
      for (const cv of convs) if (cv?.contacto_telefono && !canalPorTel[norm(cv.contacto_telefono)]) canalPorTel[norm(cv.contacto_telefono)] = cv.canal || '';
      const esTelegram = (tel) => String(canalPorTel[norm(tel)] || '').toLowerCase() === 'telegram';

      // Nombre por telefono (Contacto/Conversacion), ignorando nombres genericos "Lead ..."
      const nombrePorTel = {};
      for (const cv of convs) if (cv?.contacto_telefono && !esNombreGenerico(cv.contacto_nombre)) nombrePorTel[norm(cv.contacto_telefono)] = cv.contacto_nombre;
      for (const ct of contactos) if (ct?.telefono && !nombrePorTel[norm(ct.telefono)] && !esNombreGenerico(ct.nombre)) nombrePorTel[norm(ct.telefono)] = ct.nombre;
      const nombreDe = (tel, e) => (e?.nombre && !esNombreGenerico(e.nombre) ? e.nombre : nombrePorTel[norm(tel)] || e?.nombre || '');

      const evalPorTel = {};
      for (const ev of evalsPrev) if (ev?.cliente_id) evalPorTel[ev.cliente_id] = ev;

      const telsNota = new Set(notas.map((n) => n.cliente_id));
      if (borrarTodo) {
        // Borrar TODAS las evaluaciones
        setProgreso({ hechos: 0, total: evalsPrev.length, actual: 'Borrando evaluaciones anteriores...' });
        for (const ev of evalsPrev) { try { await base44.entities.EvaluacionChat.delete(ev.id); } catch {} }
        for (const k of Object.keys(evalPorTel)) delete evalPorTel[k];
      } else {
        // Limpieza: quitar evaluaciones de Telegram y de chats ya eliminados
        for (const ev of evalsPrev) {
          if (esTelegram(ev.cliente_id) || !telsNota.has(ev.cliente_id)) {
            try { await base44.entities.EvaluacionChat.delete(ev.id); delete evalPorTel[ev.cliente_id]; } catch {}
          }
        }
      }

      const candidatos = [];
      for (const n of notas) {
        if (esTelegram(n.cliente_id)) continue; // nunca Telegram
        let e; try { e = JSON.parse(n.texto || '{}'); } catch { continue; }
        const hist = Array.isArray(e.historial) ? e.historial : [];
        const nUser = hist.filter((m) => m.role === 'user').length;
        const nAsst = hist.filter((m) => m.role === 'assistant').length;
        if (nUser < 2 || nAsst < 2) continue; // muy corta para evaluar
        const prev = evalPorTel[n.cliente_id];
        if (prev && Number(prev.num_mensajes || 0) >= hist.length) continue; // ya evaluada a esta longitud
        candidatos.push({ n, e, hist });
      }
      candidatos.sort((a, b) => {
        const ea = evalPorTel[a.n.cliente_id] ? 1 : 0;
        const eb = evalPorTel[b.n.cliente_id] ? 1 : 0;
        if (ea !== eb) return ea - eb;
        return b.hist.length - a.hist.length;
      });

      if (candidatos.length === 0) {
        toast.info('No hay conversaciones de WhatsApp para evaluar');
        qc.invalidateQueries({ queryKey: ['evaluaciones'] });
        return;
      }

      const lote = candidatos.slice(0, MAX_POR_CORRIDA);
      setProgreso({ hechos: 0, total: lote.length, actual: '' });

      let modelo = config.modelo;
      let hechos = 0, ok = 0;
      for (let i = 0; i < lote.length; i++) {
        const c = lote[i];
        const nombre = nombreDe(c.n.cliente_id, c.e) || c.n.cliente_id;
        setProgreso({ hechos, total: lote.length, actual: nombre });
        if (i > 0) await sleep(config.pausa_ms);
        const transcript = construirTranscript(c.hist);
        let v = null;
        try {
          v = await juzgar(modelo, config, transcript, resumenMeta(c.e), contextoNegocio);
        } catch (err) {
          if (modelo !== MODELO_FALLBACK) {
            modelo = MODELO_FALLBACK;
            try { v = await juzgar(modelo, config, transcript, resumenMeta(c.e), contextoNegocio); }
            catch (e2) { console.error('Eval error', c.n.cliente_id, e2); }
          } else {
            console.error('Eval error', c.n.cliente_id, err);
          }
        }
        if (v) {
          const registro = {
            cliente_id: c.n.cliente_id,
            nombre_lead: nombre,
            canal: canalPorTel[norm(c.n.cliente_id)] || 'WhatsApp',
            num_mensajes: c.hist.length,
            score_total: v.score_total,
            score_calificacion: v.scores.calificacion,
            score_humanizacion: v.scores.humanizacion,
            score_rapidez: v.scores.rapidez,
            score_cierre: v.scores.cierre,
            veredicto: v.veredicto,
            fortalezas: v.fortalezas,
            errores: v.errores,
            lecciones: v.lecciones,
            transcript,
            anotaciones: JSON.stringify(v.anotaciones || []),
            modelo_juez: modelo,
            fecha_evaluacion: new Date().toISOString(),
          };
          const prev = evalPorTel[c.n.cliente_id];
          if (prev) await base44.entities.EvaluacionChat.update(prev.id, registro);
          else await base44.entities.EvaluacionChat.create({ ...registro, estado: 'pendiente' });
          ok++;
        }
        hechos++;
        setProgreso({ hechos, total: lote.length, actual: nombre });
      }

      const restantes = candidatos.length - lote.length;
      if (ok > 0) toast.success(`Evaluadas ${ok} de ${lote.length}${restantes > 0 ? ` (quedan ${restantes}, vuelve a evaluar)` : ''}`);
      else toast.error('No se pudo evaluar. Revisa la consola y que la entidad EvaluacionChat exista en Base44.');
      qc.invalidateQueries({ queryKey: ['evaluaciones'] });
    } catch (err) {
      console.error(err);
      toast.error('Error al evaluar. ¿Las entidades ya están registradas en Base44?');
    } finally {
      setEvaluando(false);
      setProgreso(null);
    }
  };

  const borrarYreevaluar = () => {
    if (!window.confirm('Esto borra TODAS las evaluaciones actuales y vuelve a evaluar todos los contactos de WhatsApp de la bandeja. ¿Seguir?')) return;
    correr(true);
  };

  const ordenadas = [...evaluaciones].sort((a, b) => (a.score_total || 0) - (b.score_total || 0));
  const promedio = evaluaciones.length
    ? Math.round(evaluaciones.reduce((s, e) => s + (e.score_total || 0), 0) / evaluaciones.length)
    : 0;

  const etiquetaBtn = progreso
    ? (progreso.actual ? `Evaluando a ${progreso.actual} (${progreso.hechos}/${progreso.total})` : `${progreso.hechos}/${progreso.total}`)
    : 'Preparando...';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-7 h-7" />Autoeducación de Valentina
          </h1>
          <p className="text-muted-foreground text-[15px]">Un juez con IA (créditos de Base44) revisa cada chat contra tus criterios y detecta qué mejorar. Por ahora solo mide.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/agente/config-evaluador">
            <Button variant="outline"><SlidersHorizontal className="w-4 h-4 mr-1" />Criterios</Button>
          </Link>
          <Button variant="outline" onClick={borrarYreevaluar} disabled={evaluando} className="text-red-600 hover:text-red-700">
            <Trash2 className="w-4 h-4 mr-1" />Borrar todo y reevaluar
          </Button>
          <Button onClick={() => correr(false)} disabled={evaluando}>
            {evaluando ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />{etiquetaBtn}</> : <><Sparkles className="w-4 h-4 mr-1" />Evaluar conversaciones</>}
          </Button>
        </div>
      </div>

      {evaluando && progreso && progreso.total > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="truncate">{progreso.actual || 'Procesando...'}</span>
            <span className="tabular-nums">{progreso.hechos}/{progreso.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.round((progreso.hechos / progreso.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {evaluaciones.length > 0 && (
        <div className="flex items-center gap-6 rounded-2xl border border-border/60 bg-card px-5 py-4">
          <div>
            <div className={`text-4xl font-bold ${scoreColor(promedio)}`}>{promedio}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Promedio general</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <div className="text-4xl font-bold">{evaluaciones.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Conversaciones evaluadas</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando evaluaciones...</div>
      ) : evaluaciones.length === 0 ? (
        <div className="text-center py-14">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Todavía no hay evaluaciones</p>
          <p className="text-sm text-muted-foreground mt-1">Dale a "Evaluar conversaciones" para que el juez puntúe los chats que ya tuvo Valentina.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ordenadas.map((ev) => <EvalCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  );
}
