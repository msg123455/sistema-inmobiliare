import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MemoriaChat } from '@/api/base44Client';
import { callFunction } from '@/lib/backend';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bot, MessageCircle, Search, CheckCheck, Phone, Home, Building2, MapPin, DollarSign, CheckCircle2, XCircle, ChevronLeft, Hand, Play, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { NOMBRE_AGENTE, agentePorClave } from '@/lib/agentes';

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

// Lee el estado v2 de MemoriaChat. Los datos del lead viven en ctx[agente],
// no sueltos en la raíz: el estado plano era del agente de ventas aunque nadie
// lo dijera. `pausada` sale de la columna, no del JSON — es lo que escribe el
// botón de control manual y lo que lee el agente.
function parsarMemoria(fila) {
  const vacio = { historial: [], datos: {}, calificado: false, descalificado: false, motivo_desc: '', asesor: '' };
  try {
    const e = JSON.parse(fila.estado_json || '{}');
    const agente = fila.agente_activo || e.agente_activo || 'ventas';
    const ctx = (e.ctx && e.ctx[agente]) || e.ctx?.ventas || {};
    return {
      historial:     e.historial || [],
      datos:         { ...(ctx.datos || {}), ...(e.compartido || {}) },
      calificado:    ctx.calificado    || false,
      descalificado: ctx.descalificado || false,
      motivo_desc:   ctx.motivo_desc   || '',
      asesor:        ctx.asesor || ctx.broker || fila.broker_asignado || '',
      verificado:    !!e.identidad?.verificado,
    };
  } catch {
    return vacio;
  }
}


function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{2700}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

// Expande cada respuesta del agente en sus globos (como se envía partida a WhatsApp),
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
  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs flex items-center gap-1"><Bot className="w-3 h-3" />{NOMBRE_AGENTE[conv.agente] || 'IA activa'}</Badge>;
}

export default function Inbox() {
  const qc = useQueryClient();
  // La bandeja siempre pertenece a un agente. Sin :agente en la ruta se cae a
  // recepcion, que es el que recibe lo que todavia no esta ruteado.
  const { agente: agenteRuta } = useParams();
  const agente = agentePorClave(agenteRuta);
  const [selectedTel, setSelectedTel] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pausando, setPausando] = useState(false);

  const { data: memorias = [], isLoading } = useQuery({
    queryKey: ['memoria_inbox'],
    queryFn: () => MemoriaChat.list('-fecha_ultimo_mensaje'),
    refetchInterval: 15000,
  });

  const refetchMemorias = () => qc.invalidateQueries({ queryKey: ['memoria_inbox'] });

  // Pausar / reactivar la IA. Escribe la columna `pausada` de MemoriaChat, que
  // es exactamente la que lee agenteInbound: un solo almacén, un solo escritor
  // del flag, sin round-trip por JSON.
  const togglePausa = async (conv) => {
    setPausando(true);
    try {
      const nueva = !conv.pausada;
      await MemoriaChat.update(conv.id, { pausada: nueva });
      await refetchMemorias();
      toast.success(nueva ? 'Tomaste el control — el agente está en pausa' : 'Agente reactivado');
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
      await callFunction('enviarMensajeManual', { tel: conv.tel, canal: conv.canal, mensaje: texto });
      setMensaje('');
      await refetchMemorias();
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

  const conversaciones = memorias
    .filter(m => m.telefono && m.estado_json)
    .map(m => {
      const parsed = parsarMemoria(m);
      const lastMsg = parsed.historial[parsed.historial.length - 1];
      return {
        id:           m.id,
        tel:          m.telefono,
        canal:        String(m.canal || 'WhatsApp').toLowerCase().includes('telegram') ? 'telegram' : 'whatsapp',
        agente:       m.agente_activo || 'ventas',
        fecha:        m.fecha_ultimo_mensaje,
        nombre:       parsed.datos.nombre || m.nombre || null,
        operacion:    parsed.datos.operacion || '',
        tipo_prop:    parsed.datos.tipo_prop || '',
        ciudad:       parsed.datos.ciudad || '',
        barrio:       parsed.datos.barrio || '',
        presupuesto:  parsed.datos.presupuesto || null,
        asesor:       parsed.asesor,
        verificado:   parsed.verificado,
        calificado:   parsed.calificado,
        descalificado: parsed.descalificado,
        motivo_desc:  parsed.motivo_desc,
        pausada:      !!m.pausada,
        historial:    parsed.historial,
        lastMsg:      lastMsg?.content || '',
        lastRole:     lastMsg?.role    || '',
      };
    })
    .filter(c => c.agente === agente.clave)
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
            <Link to="/inbox" className="presionable p-1 -ml-1 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Todos los agentes">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <agente.icono className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground text-[15px] leading-tight truncate">{agente.nombre}</h2>
              <p className="text-[11px] text-muted-foreground">{conversaciones.length} en esta bandeja</p>
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
              <p>Sin conversaciones en {agente.nombre}.</p>
              <p className="mt-1 text-xs">Las conversaciones llegan aquí cuando el router las asigna a este agente.</p>
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
                {seleccionada.calificado && <span className="hidden sm:inline">· Asesor: {seleccionada.asesor}</span>}
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
                  <Building2 className="w-3 h-3" /> Asesor: {seleccionada.asesor}
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
                          {esHumano ? 'Tú (manual)' : esIA ? (NOMBRE_AGENTE[seleccionada.agente] || 'Agente') : (seleccionada.nombre || 'Lead')}
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
                  <span className="text-[11px] text-amber-600 flex items-center gap-1"><Hand className="w-3 h-3" /> Control manual — el agente está en pausa</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => togglePausa(seleccionada)} disabled={pausando}>
                    <Play className="w-3 h-3 mr-1" /> Reactivar agente
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-primary" /> El agente de {NOMBRE_AGENTE[seleccionada.agente] || 'Recepción'} responde automáticamente</span>
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