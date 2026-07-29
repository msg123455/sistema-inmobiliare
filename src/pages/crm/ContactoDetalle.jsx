import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Contacto, HistorialLead, MensajeConversacion, Conversacion,
  Visita, Tarea, Nota, Propiedad,
} from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Phone, MessageCircle, Calendar, User, Star, Clock,
  TrendingUp, MapPin, Home, Bot, Send, CheckCircle, XCircle,
  AlertCircle, Pencil, Save, X, Tag, Building2, DollarSign,
} from 'lucide-react';

const TEMP_CONFIG = {
  Frio: { label: 'Frío', color: 'bg-blue-500/10 text-blue-600', dot: 'bg-blue-500' },
  Tibio: { label: 'Tibio', color: 'bg-amber-500/10 text-amber-600', dot: 'bg-amber-500' },
  Caliente: { label: 'Caliente', color: 'bg-orange-500/10 text-orange-600', dot: 'bg-orange-500' },
  Urgente: { label: 'Urgente', color: 'bg-red-500/10 text-red-600', dot: 'bg-red-500' },
};

const ETAPAS_VENTA = ['Lead', 'Visita_Agendada', 'Oferta', 'Negociacion', 'Promesa', 'Escritura', 'Perdido'];
const ETAPAS_ARRIENDO = ['Lead', 'Visita_Agendada', 'Aplicacion', 'Verificacion', 'Contrato', 'Activo', 'Perdido'];

const HISTORIAL_ICONS = {
  Llamada: <Phone className="w-4 h-4 text-green-600" />,
  Mensaje_WhatsApp: <MessageCircle className="w-4 h-4 text-green-600" />,
  Mensaje_IG: <Star className="w-4 h-4 text-pink-600" />,
  Mensaje_FB: <User className="w-4 h-4 text-blue-600" />,
  Visita: <Home className="w-4 h-4 text-purple-600" />,
  Cambio_Etapa: <TrendingUp className="w-4 h-4 text-blue-600" />,
  Nota: <Pencil className="w-4 h-4 text-gray-600" />,
  Auto_Mensaje: <Bot className="w-4 h-4 text-blue-600" />,
  Calificacion_IA: <Bot className="w-4 h-4 text-violet-600" />,
  Asignacion: <User className="w-4 h-4 text-orange-600" />,
};

function formatCOP(val) {
  if (!val) return 'No definido';
  return '$' + Number(val).toLocaleString('es-CO') + ' COP';
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export default function ContactoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [modalPerdido, setModalPerdido] = useState(false);
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [modalCita, setModalCita] = useState(false);
  const [citaFecha, setCitaFecha] = useState('');
  const [nuevaNota, setNuevaNota] = useState('');
  const [mensajeRapido, setMensajeRapido] = useState('');

  // ── Datos ──
  const { data: contacto, isLoading } = useQuery({
    queryKey: ['contacto', id],
    queryFn: () => Contacto.get(id),
  });

  const { data: historial = [] } = useQuery({
    queryKey: ['historial_lead', id],
    queryFn: () => HistorialLead.list('-fecha', { contacto_id: id }),
    enabled: !!id,
  });

  const { data: conversacion } = useQuery({
    queryKey: ['conversacion_contacto', id],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje', { contacto_id: id }),
    select: (data) => data[0],
    enabled: !!id,
  });

  const { data: mensajesChat = [] } = useQuery({
    queryKey: ['mensajes_chat_contacto', conversacion?.id],
    queryFn: () => MensajeConversacion.list('fecha', { conversacion_id: conversacion.id }),
    enabled: !!conversacion?.id,
  });

  const { data: visitas = [] } = useQuery({
    queryKey: ['visitas_contacto', id],
    queryFn: () => Visita.list('-fecha_hora', { contacto_id: id }),
    enabled: !!id,
  });

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas_contacto', id],
    queryFn: () => Tarea.list('-fecha_vencimiento', { contacto_id: id }),
    enabled: !!id,
  });

  const { data: notas = [] } = useQuery({
    queryKey: ['notas_contacto', id],
    queryFn: () => Nota.list('-fecha_nota', { contacto_id: id }),
    enabled: !!id,
  });

  const { data: matchResult } = useQuery({
    queryKey: ['match_properties', id],
    queryFn: async () => { const r = await base44.functions.leadMatch({ contacto_id: id }); return r?.data ?? r; },
    enabled: !!id,
    staleTime: 60000,
    retry: false,
  });

  // ── Mutaciones ──
  const actualizarContacto = useMutation({
    mutationFn: (data) => Contacto.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contacto', id]);
      setEditando(false);
      toast({ title: 'Guardado' });
    },
  });

  const cambiarEtapa = useMutation({
    mutationFn: async (nuevaEtapa) => {
      if (nuevaEtapa === 'Perdido') {
        setModalPerdido(true);
        return;
      }
      await Contacto.update(id, { etapa_pipeline: nuevaEtapa, ultima_actividad: new Date().toISOString() });
      await HistorialLead.create({
        contacto_id: id,
        tipo: 'Cambio_Etapa',
        descripcion: `Etapa cambiada a ${nuevaEtapa}`,
        fecha: new Date().toISOString(),
        etapa_anterior: contacto.etapa_pipeline,
        etapa_nueva: nuevaEtapa,
        usuario_email: 'agente',
        es_automatico: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
    },
  });

  const marcarPerdido = useMutation({
    mutationFn: async () => {
      await Contacto.update(id, {
        etapa_pipeline: 'Perdido',
        motivo_perdida: motivoPerdida,
        ultima_actividad: new Date().toISOString(),
      });
      await HistorialLead.create({
        contacto_id: id,
        tipo: 'Cambio_Etapa',
        descripcion: `Lead marcado como Perdido. Motivo: ${motivoPerdida}`,
        fecha: new Date().toISOString(),
        etapa_anterior: contacto.etapa_pipeline,
        etapa_nueva: 'Perdido',
        usuario_email: 'agente',
        es_automatico: false,
      });
    },
    onSuccess: () => {
      setModalPerdido(false);
      setMotivoPerdida('');
      queryClient.invalidateQueries(['contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
      toast({ title: 'Lead marcado como perdido' });
    },
  });

  const crearNota = useMutation({
    mutationFn: async () => {
      await Nota.create({ contacto_id: id, texto: nuevaNota, fecha_nota: new Date().toISOString() });
      await HistorialLead.create({
        contacto_id: id,
        tipo: 'Nota',
        descripcion: nuevaNota,
        fecha: new Date().toISOString(),
        usuario_email: 'agente',
        es_automatico: false,
      });
    },
    onSuccess: () => {
      setNuevaNota('');
      queryClient.invalidateQueries(['notas_contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
    },
  });

  const enviarWA = useMutation({
    mutationFn: async () => {
      await base44.functions.leadWhatsApp({
        contacto_id: id,
        variables: { mensaje: mensajeRapido },
      });
      await HistorialLead.create({
        contacto_id: id,
        tipo: 'Mensaje_WhatsApp',
        descripcion: 'WhatsApp enviado: ' + mensajeRapido,
        fecha: new Date().toISOString(),
        usuario_email: 'agente',
        es_automatico: false,
      });
    },
    onSuccess: () => {
      setMensajeRapido('');
      queryClient.invalidateQueries(['historial_lead', id]);
      toast({ title: 'Mensaje enviado' });
    },
    onError: () => toast({ title: 'Error al enviar', variant: 'destructive' }),
  });

  const clasificarIA = useMutation({
    mutationFn: () => base44.functions.leadClassify({ contacto_id: id }),
    onSuccess: (raw) => {
      const res = raw?.data ?? raw;
      queryClient.invalidateQueries(['contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
      toast({ title: `Clasificado: ${res.temperatura} (${res.score}/100)` });
    },
    onError: () => toast({ title: 'Error al clasificar', variant: 'destructive' }),
  });

  // ── Resultado del seguimiento (post-entrega al broker) ──
  const SEG_DESC = {
    Contactado: 'Broker contactó al lead',
    Contesto: 'El lead contestó',
    No_Contesta: 'El lead no contesta',
    Paro_De_Contestar: 'El lead paró de contestar',
    Cerrado_Ganado: 'Negocio cerrado (ganado)',
    Cerrado_Perdido: 'Cerrado sin éxito',
  };
  const marcarSeguimiento = useMutation({
    mutationFn: async (estado) => {
      const patch = { estado_seguimiento: estado, fecha_ultimo_avance: new Date().toISOString(), recordatorios_broker: 0 };
      if (estado === 'Cerrado_Ganado') patch.etapa_pipeline = contacto.pipeline_tipo === 'Arriendo' ? 'Contrato' : 'Promesa';
      await Contacto.update(id, patch);
      await HistorialLead.create({
        contacto_id: id, tipo: 'Cambio_Etapa',
        descripcion: SEG_DESC[estado] || estado,
        fecha: new Date().toISOString(), usuario_email: 'agente', es_automatico: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
      toast({ title: 'Seguimiento actualizado' });
    },
  });

  const agendarCita = useMutation({
    mutationFn: async () => {
      await Visita.create({
        contacto_id: id, contacto_nombre: contacto.nombre,
        fecha_hora: new Date(citaFecha).toISOString(), estado: 'Programada', tipo: 'Presencial',
      });
      await Contacto.update(id, {
        estado_seguimiento: 'Cita_Agendada', etapa_pipeline: 'Visita_Agendada',
        fecha_ultimo_avance: new Date().toISOString(), recordatorios_broker: 0,
      });
      await HistorialLead.create({
        contacto_id: id, tipo: 'Visita',
        descripcion: `Cita agendada para ${new Date(citaFecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
        fecha: new Date().toISOString(), usuario_email: 'agente', es_automatico: false,
      });
    },
    onSuccess: () => {
      setModalCita(false); setCitaFecha('');
      queryClient.invalidateQueries(['contacto', id]);
      queryClient.invalidateQueries(['visitas_contacto', id]);
      queryClient.invalidateQueries(['historial_lead', id]);
      toast({ title: 'Cita agendada' });
    },
    onError: () => toast({ title: 'Error al agendar', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!contacto) {
    return (
      <div className="p-8 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>Contacto no encontrado</p>
        <Button variant="link" onClick={() => navigate('/crm/contactos')}>Volver</Button>
      </div>
    );
  }

  const temp = TEMP_CONFIG[contacto.temperatura] || TEMP_CONFIG.Frio;
  const etapas = contacto.pipeline_tipo === 'Arriendo' ? ETAPAS_ARRIENDO : ETAPAS_VENTA;
  const indiceEtapa = etapas.indexOf(contacto.etapa_pipeline);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{contacto.nombre}</h1>
            <span className={`text-sm px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 ${temp.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${temp.dot}`} />{temp.label}
            </span>
            {contacto.score_lead > 0 && (
              <span className="text-xs text-gray-500">Score: {contacto.score_lead}/100</span>
            )}
            {contacto.ia_calificado && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Bot className="w-3 h-3" /> IA calificado
              </span>
            )}
            {contacto.descalificado && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Descalificada
              </span>
            )}
            {contacto.estado_seguimiento && !contacto.descalificado && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {contacto.estado_seguimiento.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {contacto.descalificado && contacto.motivo_descalificacion && (
            <p className="text-xs text-red-600 mb-1">Motivo: {contacto.motivo_descalificacion}</p>
          )}

          {/* Barra de progreso del pipeline */}
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
            {etapas.filter((e) => e !== 'Perdido').map((etapa, i) => (
              <div key={etapa} className="flex items-center gap-1">
                <span
                  className={`px-2 py-0.5 rounded ${
                    i < indiceEtapa
                      ? 'bg-green-100 text-green-700'
                      : i === indiceEtapa
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {etapa.replace(/_/g, ' ')}
                </span>
                {i < etapas.filter((e) => e !== 'Perdido').length - 1 && (
                  <span className="text-gray-300">›</span>
                )}
              </div>
            ))}
          </div>

          {contacto.score_lead > 0 && (
            <Progress value={contacto.score_lead} className="h-1.5 w-48" />
          )}
        </div>

        {/* Acciones rápidas */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={() => window.open(`https://wa.me/57${contacto.telefono?.replace(/\D/g, '')}`, '_blank')}
          >
            <MessageCircle className="w-3 h-3 text-green-600" /> WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={() => clasificarIA.mutate()}
            disabled={clasificarIA.isPending}
          >
            <Bot className="w-3 h-3 text-violet-600" /> Clasificar IA
          </Button>
          {contacto.etapa_pipeline !== 'Perdido' && (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1 text-xs"
              onClick={() => setModalPerdido(true)}
            >
              <XCircle className="w-3 h-3" /> Perdido
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="perfil">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="chat">
            Chat {conversacion?.mensajes_sin_leer > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
                {conversacion.mensajes_sin_leer}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="visitas">Visitas ({visitas.length})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas ({tareas.length})</TabsTrigger>
          <TabsTrigger value="notas">Notas ({notas.length})</TabsTrigger>
        </TabsList>

        {/* ── PERFIL ── */}
        <TabsContent value="perfil" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Datos del contacto</CardTitle>
              <div className="flex gap-2">
                {editando ? (
                  <>
                    <Button size="sm" onClick={() => actualizarContacto.mutate(editForm)} disabled={actualizarContacto.isPending}>
                      <Save className="w-3 h-3 mr-1" /> Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setEditForm({}); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setEditando(true); setEditForm({ ...contacto }); }}>
                    <Pencil className="w-3 h-3 mr-1" /> Editar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Nombre', field: 'nombre', icon: <User className="w-3 h-3" /> },
                  { label: 'Teléfono', field: 'telefono', icon: <Phone className="w-3 h-3" /> },
                  { label: 'Email', field: 'email', icon: <User className="w-3 h-3" /> },
                  { label: 'Cédula', field: 'cedula', icon: <User className="w-3 h-3" /> },
                  { label: 'Ocupación', field: 'ocupacion', icon: <Building2 className="w-3 h-3" /> },
                ].map(({ label, field, icon }) => (
                  <div key={field}>
                    <Label className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</Label>
                    {editando ? (
                      <Input
                        value={editForm[field] || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                        className="mt-1 h-8 text-sm"
                      />
                    ) : (
                      <p className="text-sm font-medium mt-0.5">{contacto[field] || '—'}</p>
                    )}
                  </div>
                ))}

                <div>
                  <Label className="text-xs text-gray-500">Tipo de interés</Label>
                  {editando ? (
                    <Select value={editForm.tipo_interes} onValueChange={(v) => setEditForm((f) => ({ ...f, tipo_interes: v }))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Compra">Compra</SelectItem>
                        <SelectItem value="Arriendo">Arriendo</SelectItem>
                        <SelectItem value="Compra_y_Arriendo">Compra y Arriendo</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{contacto.tipo_interes || '—'}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" />Presupuesto máx</Label>
                  {editando ? (
                    <Input
                      type="number"
                      value={editForm.presupuesto_max || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, presupuesto_max: Number(e.target.value) }))}
                      className="mt-1 h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{formatCOP(contacto.presupuesto_max)}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ciudad de interés</Label>
                  {editando ? (
                    <Input
                      value={editForm.ciudad_interes || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, ciudad_interes: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{contacto.ciudad_interes || '—'}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Habitaciones mín.</Label>
                  {editando ? (
                    <Input
                      type="number"
                      value={editForm.habitaciones_min || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, habitaciones_min: Number(e.target.value) }))}
                      className="mt-1 h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{contacto.habitaciones_min || '—'}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Agente asignado</Label>
                  {editando ? (
                    <Input
                      value={editForm.asignado_a || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, asignado_a: e.target.value }))}
                      placeholder="email@agente.com"
                      className="mt-1 h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{contacto.asignado_a || 'Sin asignar'}</p>
                  )}
                </div>
              </div>

              {contacto.notas && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-500">Notas generales</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{contacto.notas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultado del seguimiento (post-entrega al broker) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Resultado del seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => marcarSeguimiento.mutate('Contactado')} disabled={marcarSeguimiento.isPending}>
                  <MessageCircle className="w-3 h-3 text-green-600" /> Contactado
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setModalCita(true)}>
                  <Calendar className="w-3 h-3 text-blue-600" /> Cita agendada
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => marcarSeguimiento.mutate('Contesto')} disabled={marcarSeguimiento.isPending}>
                  <CheckCircle className="w-3 h-3 text-emerald-600" /> Contestó
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => marcarSeguimiento.mutate('No_Contesta')} disabled={marcarSeguimiento.isPending}>
                  <Clock className="w-3 h-3 text-amber-600" /> No contesta
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => marcarSeguimiento.mutate('Paro_De_Contestar')} disabled={marcarSeguimiento.isPending}>
                  <AlertCircle className="w-3 h-3 text-orange-600" /> Paró de contestar
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => marcarSeguimiento.mutate('Cerrado_Ganado')} disabled={marcarSeguimiento.isPending}>
                  <CheckCircle className="w-3 h-3" /> Cerrado ganado
                </Button>
              </div>
              {contacto.fecha_asignacion && (
                <p className="text-xs text-muted-foreground mt-3">
                  Asignado a {contacto.asignado_a || 'broker'} · {new Date(contacto.fecha_asignacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                  {contacto.recordatorios_broker > 0 && ` · ${contacto.recordatorios_broker} recordatorio(s) enviado(s)`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cambiar etapa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Avanzar en el pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {etapas.map((etapa) => (
                  <Button
                    key={etapa}
                    size="sm"
                    variant={contacto.etapa_pipeline === etapa ? 'default' : 'outline'}
                    onClick={() => cambiarEtapa.mutate(etapa)}
                    disabled={contacto.etapa_pipeline === etapa}
                    className={`text-xs ${etapa === 'Perdido' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}`}
                  >
                    {etapa.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Propiedades que matchean */}
          {matchResult?.matches?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="w-4 h-4" /> Propiedades que le pueden interesar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {matchResult.matches.map((prop) => (
                    <div key={prop.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium">
                          {prop.tipo} · {prop.barrio || prop.ciudad}
                        </p>
                        <p className="text-xs text-gray-500">
                          {prop.habitaciones}hab · {prop.area_m2}m² · {
                            prop.canon_arriendo ? formatCOP(prop.canon_arriendo) + '/mes' : formatCOP(prop.precio_venta)
                          }
                        </p>
                        <div className="flex gap-1 mt-1">
                          {prop.razones_match.map((r) => (
                            <span key={r} className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{r}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-blue-600">{prop.score_match}%</span>
                        <p className="text-xs text-gray-400">match</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── CHAT ── */}
        <TabsContent value="chat">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-80 p-4">
                {mensajesChat.length === 0 && (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    No hay mensajes en la conversación aún
                  </div>
                )}
                <div className="space-y-3">
                  {mensajesChat.map((msg) => {
                    const esSaliente = msg.direccion === 'Saliente';
                    return (
                      <div key={msg.id} className={`flex ${esSaliente ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                          esSaliente
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        }`}>
                          {msg.contenido}
                          <div className={`text-xs mt-1 flex items-center gap-1 ${esSaliente ? 'text-blue-200 justify-end' : 'text-gray-400'}`}>
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(msg.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {esSaliente && msg.enviado_por_ia && <span className="text-xs">(IA)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t p-3 flex gap-2">
                <Input
                  placeholder="Enviar WhatsApp rápido..."
                  value={mensajeRapido}
                  onChange={(e) => setMensajeRapido(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && enviarWA.mutate()}
                  className="flex-1"
                />
                <Button onClick={() => enviarWA.mutate()} disabled={!mensajeRapido.trim() || enviarWA.isPending} size="icon">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HISTORIAL ── */}
        <TabsContent value="historial">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                <div className="space-y-4">
                  {historial.length === 0 && (
                    <p className="text-sm text-gray-400 pl-10">Sin actividad registrada</p>
                  )}
                  {historial.map((evento) => (
                    <div key={evento.id} className="flex gap-3 relative">
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0 relative z-10">
                        {HISTORIAL_ICONS[evento.tipo] || <Clock className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {evento.descripcion}
                          </span>
                          <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                            {timeAgo(evento.fecha)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            {evento.es_automatico ? <><Bot className="w-3 h-3" />IA automática</> : <><User className="w-3 h-3" />{evento.usuario_email || 'agente'}</>}
                          </span>
                          {evento.etapa_anterior && evento.etapa_nueva && (
                            <span className="text-xs text-gray-400">
                              {evento.etapa_anterior} → {evento.etapa_nueva}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VISITAS ── */}
        <TabsContent value="visitas">
          <div className="space-y-3">
            {visitas.length === 0 && (
              <Card><CardContent className="py-8 text-center text-gray-400 text-sm">Sin visitas agendadas</CardContent></Card>
            )}
            {visitas.map((visita) => (
              <Card key={visita.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        visita.estado === 'Realizada' ? 'default' :
                        visita.estado === 'Programada' ? 'secondary' : 'outline'
                      }>
                        {visita.estado}
                      </Badge>
                      <span className="text-sm font-medium">
                        {new Date(visita.fecha_hora).toLocaleString('es-CO', {
                          weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {visita.notas_resultado && (
                      <p className="text-xs text-gray-500 mt-1">{visita.notas_resultado}</p>
                    )}
                    {visita.calificacion_interes && (
                      <span className="text-xs text-blue-600 mt-1 block">
                        Interés: {visita.calificacion_interes.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{visita.tipo}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── TAREAS ── */}
        <TabsContent value="tareas">
          <div className="space-y-3">
            {tareas.length === 0 && (
              <Card><CardContent className="py-8 text-center text-gray-400 text-sm">Sin tareas asignadas</CardContent></Card>
            )}
            {tareas.map((tarea) => (
              <Card key={tarea.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{tarea.titulo}</p>
                    <p className="text-xs text-gray-500">{tarea.tipo} · Vence: {tarea.fecha_vencimiento}</p>
                  </div>
                  <Badge variant={tarea.estado === 'Completada' ? 'default' : 'secondary'}>
                    {tarea.estado}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── NOTAS ── */}
        <TabsContent value="notas" className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <Textarea
                placeholder="Añadir nota rápida..."
                value={nuevaNota}
                onChange={(e) => setNuevaNota(e.target.value)}
                rows={3}
              />
              <Button
                className="mt-2"
                size="sm"
                disabled={!nuevaNota.trim() || crearNota.isPending}
                onClick={() => crearNota.mutate()}
              >
                Guardar nota
              </Button>
            </CardContent>
          </Card>
          {notas.map((nota) => (
            <Card key={nota.id}>
              <CardContent className="p-3">
                <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(nota.fecha_nota).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* ── Modal Cita ── */}
      <Dialog open={modalCita} onOpenChange={setModalCita}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-600" /> Agendar cita</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fecha y hora</Label>
              <Input type="datetime-local" value={citaFecha} onChange={(e) => setCitaFecha(e.target.value)} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setModalCita(false)}>Cancelar</Button>
              <Button disabled={!citaFecha || agendarCita.isPending} onClick={() => agendarCita.mutate()}>
                Confirmar cita
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Perdido ── */}
      <Dialog open={modalPerdido} onOpenChange={setModalPerdido}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">¿Por qué se perdió este lead?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={motivoPerdida} onValueChange={setMotivoPerdida}>
              <SelectTrigger><SelectValue placeholder="Selecciona el motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Precio fuera de presupuesto">Precio fuera de presupuesto</SelectItem>
                <SelectItem value="No encontró lo que buscaba">No encontró lo que buscaba</SelectItem>
                <SelectItem value="Compró/Arrendó con otra inmobiliaria">Compró/Arrendó con otra inmobiliaria</SelectItem>
                <SelectItem value="No responde">No responde</SelectItem>
                <SelectItem value="Desistió de buscar">Desistió de buscar</SelectItem>
                <SelectItem value="Información de contacto incorrecta">Información de contacto incorrecta</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setModalPerdido(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!motivoPerdida || marcarPerdido.isPending}
                onClick={() => marcarPerdido.mutate()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}