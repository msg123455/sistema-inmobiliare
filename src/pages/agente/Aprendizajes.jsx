import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Sparkles, RefreshCw, Check, X, Save, Trash2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { mergeConfigEval } from '@/lib/evaluadorConfig';

const MODELO_FALLBACK = 'claude_sonnet_4_6';
const sinGuion = (t) => String(t ?? '').replace(/\s*[—–]\s*/g, ', ').trim();
const normRule = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

async function llamarLLM(model, prompt) {
  const params = model ? { prompt, model } : { prompt };
  return base44.integrations.Core.InvokeLLM(params);
}

function parseReglas(resp) {
  let obj = null;
  if (resp && typeof resp === 'object') obj = resp;
  else { const m = String(resp || '').match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch {} } }
  return Array.isArray(obj?.reglas) ? obj.reglas.map(sinGuion).filter(Boolean).slice(0, 12) : [];
}

export default function Aprendizajes() {
  const qc = useQueryClient();
  const [generando, setGenerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [ediciones, setEdiciones] = useState({}); // id -> texto editado

  const { data: aprendizajes = [], isLoading } = useQuery({
    queryKey: ['aprendizajes'],
    queryFn: () => base44.entities.AprendizajeValentina.list('-fecha', 200),
  });
  const { data: cfgs = [] } = useQuery({
    queryKey: ['config_agente_aprend'],
    queryFn: () => base44.entities.ConfigAgente.list('-created_date', 1),
  });
  const cfg = cfgs[0];
  const aplicadoActual = cfg?.aprendizajes || '';

  const refetch = () => qc.invalidateQueries({ queryKey: ['aprendizajes'] });

  const pendientes = aprendizajes.filter((a) => a.estado === 'pendiente');
  const aprobadas = aprendizajes.filter((a) => a.estado === 'aprobada');

  const generar = async () => {
    setGenerando(true);
    try {
      const [evals, cfgEval] = await Promise.all([
        base44.entities.EvaluacionChat.list('-created_date', 500),
        base44.entities.ConfigEvaluador.list('-created_date', 1).catch(() => []),
      ]);
      const model = mergeConfigEval(cfgEval[0]).modelo;

      const lecciones = uniq(evals.flatMap((e) => e.lecciones || [])).slice(0, 80);
      const errores = uniq(evals.flatMap((e) => e.errores || [])).slice(0, 80);
      if (lecciones.length === 0 && errores.length === 0) {
        toast.info('No hay lecciones todavía. Corre evaluaciones en Autoeducación primero.');
        return;
      }

      const reglasActuales = aprendizajes.filter((a) => a.estado !== 'rechazada').map((a) => `- ${a.regla}`).join('\n') || '(ninguna todavía)';
      const prompt = `Eres el MAESTRO que mejora a Valentina, la agente inmobiliaria de ND Inmobiliaria (Bogota). A partir de los ERRORES y LECCIONES recurrentes de muchas conversaciones evaluadas, sintetiza una lista CORTA (maximo 12) de reglas concretas y accionables para agregar al prompt de Valentina. Cada regla: imperativa, especifica, de una sola linea, sin guiones largos. Prioriza los patrones que MAS se repiten. NO propongas reglas que ya esten en la lista de aplicadas (ni algo equivalente). Responde SOLO con un JSON valido: { "reglas": ["...", "..."] }

REGLAS YA EXISTENTES (no las repitas ni algo equivalente):
${reglasActuales}

LECCIONES SUGERIDAS EN LAS EVALUACIONES:
- ${lecciones.join('\n- ')}

ERRORES DETECTADOS:
- ${errores.join('\n- ')}`;

      let reglas = [];
      try { reglas = parseReglas(await llamarLLM(model, prompt)); }
      catch { try { reglas = parseReglas(await llamarLLM(MODELO_FALLBACK, prompt)); } catch {} }

      const existentes = new Set(aprendizajes.filter((a) => a.estado !== 'rechazada').map((a) => normRule(a.regla)));
      const nuevas = reglas.filter((r) => r && !existentes.has(normRule(r)));
      if (nuevas.length === 0) { toast.info('No salieron reglas nuevas (ya están cubiertas).'); return; }

      const ahora = new Date().toISOString();
      for (const r of nuevas) {
        await base44.entities.AprendizajeValentina.create({ regla: r, estado: 'pendiente', fuente: 'destilado de evaluaciones', fecha: ahora });
      }
      toast.success(`${nuevas.length} regla${nuevas.length === 1 ? '' : 's'} propuesta${nuevas.length === 1 ? '' : 's'}. Revísalas y aprueba.`);
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('Error al generar. ¿La entidad AprendizajeValentina ya existe en Base44?');
    } finally {
      setGenerando(false);
    }
  };

  const setEstado = async (a, estado) => {
    try {
      const regla = ediciones[a.id] !== undefined ? ediciones[a.id].trim() : a.regla;
      await base44.entities.AprendizajeValentina.update(a.id, { regla, estado });
      refetch();
    } catch { toast.error('No se pudo actualizar'); }
  };

  const eliminar = async (a) => {
    try { await base44.entities.AprendizajeValentina.delete(a.id); refetch(); }
    catch { toast.error('No se pudo eliminar'); }
  };

  const aplicar = async () => {
    setAplicando(true);
    try {
      const bloque = aprobadas.map((a, i) => `${i + 1}. ${a.regla}`).join('\n');
      if (cfg) await base44.entities.ConfigAgente.update(cfg.id, { aprendizajes: bloque });
      else await base44.entities.ConfigAgente.create({ clave: 'general', aprendizajes: bloque });
      qc.invalidateQueries({ queryKey: ['config_agente_aprend'] });
      toast.success('Aplicado. Valentina ya usa estos aprendizajes en sus próximas respuestas.');
    } catch {
      toast.error('No se pudo aplicar a Valentina.');
    } finally {
      setAplicando(false);
    }
  };

  const bloqueAprobado = aprobadas.map((a, i) => `${i + 1}. ${a.regla}`).join('\n');
  const hayCambiosSinAplicar = bloqueAprobado.trim() !== String(aplicadoActual).trim();

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7" />Aprendizajes de Valentina
          </h1>
          <p className="text-muted-foreground text-[15px]">Destila las lecciones de las evaluaciones en reglas, tú las apruebas, y se le inyectan a Valentina. Fase B: aprender.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={generar} disabled={generando}>
            {generando ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Generando...</> : <><Sparkles className="w-4 h-4 mr-1" />Generar aprendizajes</>}
          </Button>
          <Button onClick={aplicar} disabled={aplicando || !hayCambiosSinAplicar}>
            <Save className="w-4 h-4 mr-1" />{aplicando ? 'Aplicando...' : `Aplicar a Valentina (${aprobadas.length})`}
          </Button>
        </div>
      </div>

      {hayCambiosSinAplicar && aprobadas.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2">
          Tienes cambios sin aplicar. Dale a "Aplicar a Valentina" para que los use.
        </div>
      )}

      {/* Pendientes de aprobación */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">Propuestas por revisar <Badge variant="outline">{pendientes.length}</Badge></h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin propuestas pendientes. Dale a "Generar aprendizajes" para destilar nuevas de las evaluaciones.</p>
        ) : (
          pendientes.map((a) => (
            <Card key={a.id} className="rounded-xl border-amber-500/30">
              <CardContent className="p-3 space-y-2">
                <Textarea
                  value={ediciones[a.id] !== undefined ? ediciones[a.id] : a.regla}
                  onChange={(e) => setEdiciones((p) => ({ ...p, [a.id]: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => setEstado(a, 'rechazada')}>
                    <X className="w-3.5 h-3.5 mr-1" />Rechazar
                  </Button>
                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => setEstado(a, 'aprobada')}>
                    <Check className="w-3.5 h-3.5 mr-1" />Aprobar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Aprobadas */}
      {aprobadas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-green-700"><Check className="w-4 h-4" />Aprobadas <Badge variant="outline">{aprobadas.length}</Badge></h2>
          {aprobadas.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2">
              <p className="text-sm flex-1">{a.regla}</p>
              <button onClick={() => setEstado(a, 'pendiente')} className="text-xs text-muted-foreground hover:text-foreground shrink-0" title="Devolver a pendientes">Quitar</button>
            </div>
          ))}
        </div>
      )}

      {/* Lo que Valentina tiene aplicado ahora */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-sm font-semibold flex items-center gap-2 mb-2"><GraduationCap className="w-4 h-4" />Lo que Valentina tiene aplicado ahora</p>
          {aplicadoActual ? (
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans bg-muted/50 rounded-lg p-3">{aplicadoActual}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no le has aplicado ningún aprendizaje. Aprueba reglas y dale a "Aplicar a Valentina".</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
