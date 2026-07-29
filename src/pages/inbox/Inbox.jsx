import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Nota } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bot, MessageCircle, Search, CheckCheck, Phone, Home, Building2, MapPin, DollarSign, CheckCircle2, XCircle, ChevronLeft, Hand, Play, Send, User } from 'lucide-react';
import { toast } from 'sonner';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'ahora';
  if (m < 60)  return `${m}m`;
  if (m < 1440) return `${Math.floor(m/60)}h`;
  return `${Math.floor(m/1440)}d`;
}

function formatHora(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const hoy = new Date();
    const mismaFecha = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    return mismaFecha ? hora : `${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} ${hora}`;
  } catch { return ''; }
}

function parsarNota(nota) {
  try {
    const estado = JSON.parse(nota.texto || '{}');
    return {
      historial:      estado.historial      || [],
      datos:          estado.datos          || {},
      calificado:     estado.calificado     || false,
      descalificado:  estado.descalificado  || false,
      motivo_desc:    estado.motivo_desc    || '',
      broker:         estado.broker         || '',
      pausada:        estado.pausada        || false,
    };
  } catch {
    return { historial: [], datos: {}, calificado: false, descalificado: false, motivo_desc: '', broker: '', pausada: false };
  }
}

function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{2700}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

// Expande cada respuesta de Valentina en sus globos (como se envía partida a WhatsApp),
// para que en la Bandeja se vea igual que le llega al cliente.
function expandirGlobos(historial) {
  const out = [];
  (historial || []).forEach((m) => {
    const gs = (m.role === 'assistant' && Array.isArray(m.globos) && m.globos.length) ? m.globos : [m.content];
    gs.forEach((g) => out.push({ ...m, content: g }));
  });
  return out;
}

function estadoBadge(conv) {
  if (conv.pausada)       return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs flex items-center gap-1"><Hand className="w-3 h-3" />Control manual</Badge>;
  if (conv.descalificado) return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" />Descalificado</Badge>;
  if (conv.calificado)    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Calificado</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs flex items-center gap-1"><Bot className="w-3 h-3" />IA activa</Badge>;
}

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedTel, setSelectedTel] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pausando, setPausando] = useState(false);

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['notas_inbox'],
    queryFn: () => Nota.list('-fecha_nota'),
    refetchInterval: 15000,
  });

  const refetchNotas = () => qc.invalidateQueries({ queryKey: ['notas_inbox'] });

  // Pausar / reactivar la IA para una conversación (flag `pausada` dentro de la Nota)
  const togglePausa = async (conv) => {
    setPausando(true);
    try {
      let estado = {};
      try { estado = JSON.parse(conv.rawTexto || '{}'); } catch {}
      estado.pausada = !conv.pausada;
      await Nota.update(conv.notaId, { texto: JSON.stringify(estado), fecha_nota: new Date().toISOString() });
      await refetchNotas();
      toast.success(estado.pausada ? 'Tomaste el control — Valentina está en pausa' : 'Valentina reactivada');
    } catch {
      toast.error('No se pudo cambiar el estado');
    } finally { setPausando(false); }
  };

  // Enviar un mensaje manual al lead por WhatsApp (Meta) — llamada directa al
  // endpoint de la función (más robusto que el SDK, que depende de la versión).
  const enviarManual = async (conv) => {
    const texto = mensaje.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const r = await fetch('https://ndsoftware.base44.app/api/functions/enviarMensajeManual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'SYNCWASI2026', tel: conv.tel, mensaje: texto }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res?.error) throw new Error(res?.error || `Error ${r.status}`);
      setMensaje('');
      await refetchNotas();
      toast.success('Mensaje enviado');
    } catch (err) {
      const m = String(err?.message || '');
      if (m.includes('131047') || m.includes('re-engagement') || m.includes('470') || m.includes('window')) {
        toast.error('Fuera de la ventana de 24h de Meta: el lead tiene que haberte escrito en las últimas 24h para poder responderle en texto libre.');
      } else {
        toast.error(m || 'No se pudo enviar el mensaje');
      }
    } finally { setEnviando(false); }
  };

  const conversaciones = notas
    .filter(n => n.cliente_id && n.texto)
    .map(n => {
      const parsed = parsarNota(n);
      const lastMsg = parsed.historial[parsed.historial.length - 1];
      return {
        tel:          n.cliente_id,
        notaId:       n.id,
        rawTexto:     n.texto,
        fecha:        n.fecha_nota,
        nombre:       parsed.datos.nombre || null,
        operacion:    parsed.datos.operacion || '',
        tipo_prop:    parsed.datos.tipo_prop || '',
        ciudad:       parsed.datos.ciudad || '',
        barrio:       parsed.datos.barrio || '',
        presupuesto:  parsed.datos.presupuesto || null,
        broker:       parsed.broker || '',
        calificado:   parsed.calificado,
        descalificado: parsed.descalificado,
        motivo_desc:  parsed.motivo_desc,
        pausada:      parsed.pausada,
        historial:    parsed.historial,
        lastMsg:      lastMsg?.content || '',
        lastRole:     lastMsg?.role    || '',
      };
    })
    .filter(c =>
      !busqueda ||
      c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.tel.includes(busqueda)
    );

  const seleccionada = conversaciones.find(c => c.tel === selectedTel);

  return (
    <div className="flex h-[calc(100vh-112px)] md:h-[calc(100vh-64px)] bg-background -mx-4 md:mx-0 -my-4 md:my-0">

      {/* ── Panel izquierdo ── */}
      <div className={`w-full md:w-80 border-r border-border bg-card flex flex-col flex-shrink-0 ${selectedTel ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 md:p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-[15px] leading-tight">Bandeja WhatsApp</h2>
              <p className="text-[11px] text-muted-foreground">Valentina · Agente IA</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm rounded-lg bg-muted/60 border-border"
              placeholder="Buscar por nombre o teléfono..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />{conversaciones.filter(c => c.calificado).length} calificados
            </span>
            <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
              <Bot className="w-3 h-3" />{conversaciones.filter(c => !c.calificado && !c.descalificado).length} activos
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {isLoading && (
            <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>
          )}
          {!isLoading && conversaciones.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>Sin conversaciones todavía.</p>
              <p className="mt-1 text-xs">Escríbele al 301 desde WhatsApp.</p>
            </div>
          )}
          {conversaciones.map(conv => (
            <button
              key={conv.tel}
              onClick={() => setSelectedTel(conv.tel)}
              className={`w-full text-left px-3 md:px-4 py-3 border-b border-border transition-colors ${selectedTel === conv.tel ? 'bg-primary/8' : 'hover:bg-muted/50'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${conv.calificado ? 'bg-green-500' : conv.descalificado ? 'bg-red-400' : 'bg-primary'}`}>
                  {(conv.nombre || conv.tel).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[14px] text-foreground truncate">
                      {conv.nombre || `+${conv.tel}`}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">{timeAgo(conv.fecha)}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-1 min-w-0">
                    {conv.lastRole === 'assistant' && <Bot className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{stripEmojis(conv.lastMsg) || 'Sin mensajes'}</span>
                  </p>
                  <div className="mt-1.5">{estadoBadge(conv)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Panel derecho: chat ── */}
      {!seleccionada ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/30">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Selecciona una conversación</p>
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col ${selectedTel ? 'flex' : 'hidden md:flex'}`}>

          {/* Header */}
          <div className="bg-card border-b border-border px-3 md:px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSelectedTel(null)}
              className="md:hidden p-1 -ml-1 rounded-lg hover:bg-muted text-foreground"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
              {(seleccionada.nombre || seleccionada.tel).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-[15px] truncate">{seleccionada.nombre || `+${seleccionada.tel}`}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Phone className="w-3 h-3" /> +{seleccionada.tel}
                {seleccionada.calificado && <span className="hidden sm:inline">· Broker: {seleccionada.broker}</span>}
              </p>
            </div>
            <div className="flex-shrink-0 hidden sm:block">{estadoBadge(seleccionada)}</div>
          </div>

          {/* Datos del lead */}
          {(seleccionada.operacion || seleccionada.ciudad || seleccionada.presupuesto) && (
            <div className="bg-card border-b border-border px-3 md:px-4 py-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {seleccionada.operacion && (
                <span className="flex items-center gap-1">
                  <Home className="w-3 h-3 text-primary" />
                  {seleccionada.operacion} {seleccionada.tipo_prop && `· ${seleccionada.tipo_prop}`}
                </span>
              )}
              {seleccionada.ciudad && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-red-500" />
                  {seleccionada.ciudad}{seleccionada.barrio && `, ${seleccionada.barrio}`}
                </span>
              )}
              {seleccionada.presupuesto && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-green-600" />
                  ${Number(seleccionada.presupuesto).toLocaleString('es-CO')}
                </span>
              )}
              {seleccionada.calificado && (
                <span className="flex items-center gap-1 text-green-700 font-medium">
                  <Building2 className="w-3 h-3" /> Broker: {seleccionada.broker}
                </span>
              )}
              {seleccionada.descalificado && (
                <span className="text-red-600 font-medium">Motivo: {seleccionada.motivo_desc}</span>
              )}
            </div>
          )}

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30">
            <div className="p-3 md:p-4 space-y-2 max-w-3xl mx-auto">
              {seleccionada.historial.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">Sin mensajes en el historial</p>
              )}
              {expandirGlobos(seleccionada.historial).map((msg, i) => {
                const esIA = msg.role === 'assistant';
                const esHumano = msg.humano;
                return (
                  <div key={i} className={`flex ${esIA ? 'justify-end' : 'justify-start'}`}>
                    {!esIA && (
                      <div className="w-7 h-7 rounded-full bg-muted-foreground/30 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">
                        {(seleccionada.nombre || '?').charAt(0)}
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] lg:max-w-md xl:max-w-lg px-3 py-2 rounded-2xl text-sm shadow-sm relative ${
                        esIA
                          ? (esHumano ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-primary text-primary-foreground rounded-tr-sm')
                          : 'bg-card text-card-foreground rounded-tl-sm border border-border'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{stripEmojis(msg.content)}</p>
                      <div className={`flex items-center gap-1 mt-1 ${esIA ? 'justify-end' : 'justify-start'}`}>
                        {esIA && (esHumano ? <User className="w-3 h-3 text-white/70" /> : <Bot className="w-3 h-3 text-primary-foreground/70" />)}
                        {esIA && <CheckCheck className="w-3 h-3 text-white/70" />}
                        <span className={`text-[10px] ${esIA ? 'text-white/70' : 'text-muted-foreground/70'}`}>
                          {esHumano ? 'Tú (manual)' : esIA ? 'Valentina' : (seleccionada.nombre || 'Lead')}
                          {msg.ts ? ` · ${formatHora(msg.ts)}` : ''}
                        </span>
                      </div>
                    </div>
                    {esIA && (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white ml-2 mt-1 flex-shrink-0 ${esHumano ? 'bg-emerald-600' : 'bg-primary'}`}>
                        {esHumano ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer — control manual */}
          <div className="bg-card border-t border-border px-3 md:px-4 py-3 space-y-2">
            {seleccionada.pausada ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-10 rounded-full"
                    placeholder="Escribe un mensaje al lead…"
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarManual(seleccionada); } }}
                    disabled={enviando}
                  />
                  <Button size="icon" className="rounded-full h-10 w-10 flex-shrink-0" onClick={() => enviarManual(seleccionada)} disabled={enviando || !mensaje.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-amber-600 flex items-center gap-1"><Hand className="w-3 h-3" /> Control manual — Valentina en pausa</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => togglePausa(seleccionada)} disabled={pausando}>
                    <Play className="w-3 h-3 mr-1" /> Reactivar Valentina
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-primary" /> Valentina responde automáticamente</span>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => togglePausa(seleccionada)} disabled={pausando}>
                  <Hand className="w-3.5 h-3.5 mr-1" /> Tomar control
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}