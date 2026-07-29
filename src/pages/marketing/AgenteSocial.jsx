import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Plus, Send, Instagram, MessageSquare, Share2, Calendar, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const MensajeTemplate = base44.entities.MensajeTemplate;
const CampanaSocial = base44.entities.CampanaSocial;
const MensajeEnviado = base44.entities.MensajeEnviado;
const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;

const CANAL_ICONS = {
  WhatsApp: MessageSquare,
  Instagram: Instagram,
  Facebook: Share2,
  Email: Send,
};

const CANAL_COLORS = {
  WhatsApp: 'bg-green-100 text-green-700',
  Instagram: 'bg-pink-100 text-pink-700',
  Facebook: 'bg-indigo-100 text-indigo-700',
  Email: 'bg-blue-100 text-blue-700',
};

const ESTADO_COLORS = {
  Borrador: 'bg-gray-100 text-gray-600',
  Programado: 'bg-blue-100 text-blue-700',
  Publicado: 'bg-green-100 text-green-700',
  Error: 'bg-red-100 text-red-700',
};

function TemplateForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    nombre: '', canal: 'WhatsApp', trigger: 'manual',
    asunto: '', contenido: '', auto_envio: false,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.nombre || !form.contenido) { toast.error('Nombre y contenido son obligatorios'); return; }
    setLoading(true);
    try {
      await onSave(form);
      toast.success('Plantilla creada');
    } catch { toast.error('Error al crear plantilla'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Nombre de la plantilla *</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Bienvenida nuevo lead" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Canal</Label>
          <Select value={form.canal} onValueChange={v => set('canal', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['WhatsApp','Instagram','Facebook','Email'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Trigger</Label>
          <Select value={form.trigger} onValueChange={v => set('trigger', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="nuevo_lead">Nuevo lead</SelectItem>
              <SelectItem value="visita_agendada">Visita agendada</SelectItem>
              <SelectItem value="visita_recordatorio">Recordatorio visita</SelectItem>
              <SelectItem value="seguimiento_post_visita">Seguimiento post-visita</SelectItem>
              <SelectItem value="oferta_recibida">Oferta recibida</SelectItem>
              <SelectItem value="contrato_proximo_vencer">Contrato próx. vencer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.canal === 'Email' && <div><Label>Asunto</Label><Input value={form.asunto} onChange={e => set('asunto', e.target.value)} /></div>}
      <div>
        <Label>Contenido *</Label>
        <Textarea value={form.contenido} onChange={e => set('contenido', e.target.value)} rows={5} placeholder={'Hola {{nombre}},\n\nGracias por tu interés en {{propiedad}}...'} />
        <p className="text-xs text-muted-foreground mt-1">Variables: {'{{nombre}} {{propiedad}} {{precio}} {{fecha}} {{agente}} {{ciudad}}'}</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.auto_envio} onCheckedChange={v => set('auto_envio', v)} />
        <Label>Envío automático al disparar el trigger</Label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Crear plantilla'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

function ProgramarPublicacion({ onSave, onCancel }) {
  const [form, setForm] = useState({ propiedad_id: '', plataforma: 'Instagram', caption: '', fecha_programada: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });

  const handleSave = async () => {
    if (!form.propiedad_id || !form.caption) { toast.error('Propiedad y caption son obligatorios'); return; }
    setLoading(true);
    try {
      const prop = propiedades.find(p => p.id === form.propiedad_id);
      await onSave({ ...form, propiedad_titulo: prop?.titulo || '', estado: form.fecha_programada ? 'Programado' : 'Borrador' });
      toast.success('Publicación guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Propiedad *</Label>
        <Select value={form.propiedad_id} onValueChange={v => set('propiedad_id', v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar propiedad..." /></SelectTrigger>
          <SelectContent>{propiedades.map(p => <SelectItem key={p.id} value={p.id}>{p.titulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Plataforma</Label>
        <Select value={form.plataforma} onValueChange={v => set('plataforma', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Instagram">Instagram</SelectItem>
            <SelectItem value="Facebook">Facebook</SelectItem>
            <SelectItem value="Instagram_y_Facebook">Instagram + Facebook</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Caption *</Label>
        <Textarea value={form.caption} onChange={e => set('caption', e.target.value)} rows={4} placeholder="¡Nueva propiedad disponible!..." />
      </div>
      <div><Label>Fecha y hora programada (opcional)</Label><Input type="datetime-local" value={form.fecha_programada} onChange={e => set('fecha_programada', e.target.value)} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Programar'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function AgenteSocial() {
  const qc = useQueryClient();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sendContacto, setSendContacto] = useState('');
  const [sendVariables, setSendVariables] = useState('');

  const { data: templates = [] } = useQuery({ queryKey: ['msg-templates'], queryFn: () => MensajeTemplate.list() });
  const { data: campanas = [] } = useQuery({ queryKey: ['campanas-sociales'], queryFn: () => CampanaSocial.list() });
  const { data: mensajes = [] } = useQuery({ queryKey: ['mensajes-enviados'], queryFn: () => MensajeEnviado.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['msg-templates'] });
    qc.invalidateQueries({ queryKey: ['campanas-sociales'] });
    qc.invalidateQueries({ queryKey: ['mensajes-enviados'] });
  };

  const handleDeleteTemplate = async (id) => {
    await MensajeTemplate.delete(id);
    qc.invalidateQueries({ queryKey: ['msg-templates'] });
    toast.success('Plantilla eliminada');
  };

  const handlePublicar = async (campana) => {
    try {
      await base44.functions.publishSocialPost({
        campana_id: campana.id,
        propiedad_id: campana.propiedad_id,
        plataformas: campana.plataforma === 'Instagram_y_Facebook' ? ['instagram', 'facebook'] : [campana.plataforma.toLowerCase()],
        caption: campana.caption,
      });
      await CampanaSocial.update(campana.id, { estado: 'Publicado', fecha_publicado: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ['campanas-sociales'] });
      toast.success('Publicación enviada');
    } catch {
      toast.error('Error al publicar. Verifica la configuración de Meta API.');
    }
  };

  const handleEnviarMensaje = async () => {
    if (!selectedTemplate || !sendContacto) { toast.error('Selecciona plantilla y contacto'); return; }
    const contacto = contactos.find(c => c.id === sendContacto);
    try {
      let variables = {};
      try { variables = JSON.parse(sendVariables || '{}'); } catch {}
      await base44.functions.sendWhatsAppMessage({
        contacto_id: sendContacto,
        template_id: selectedTemplate.id,
        variables: { nombre: contacto?.nombre, ...variables },
      });
      toast.success('Mensaje enviado');
      setSendOpen(false);
    } catch { toast.error('Error al enviar. Verifica la configuración de WhatsApp API.'); }
  };

  const stats = {
    publicados: campanas.filter(c => c.estado === 'Publicado').length,
    programados: campanas.filter(c => c.estado === 'Programado').length,
    enviados: mensajes.filter(m => m.estado !== 'Error').length,
    errores: campanas.filter(c => c.estado === 'Error').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Agente Social</h1>
        <p className="text-muted-foreground text-[15px] mt-0.5">Automatización de mensajes y publicaciones en redes sociales</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/60"><CardContent className="p-4 text-center"><p className="text-[22px] font-bold tracking-tight text-green-600">{stats.publicados}</p><p className="text-[12px] text-muted-foreground">Publicados</p></CardContent></Card>
        <Card className="rounded-2xl border-border/60"><CardContent className="p-4 text-center"><p className="text-[22px] font-bold tracking-tight text-blue-600">{stats.programados}</p><p className="text-[12px] text-muted-foreground">Programados</p></CardContent></Card>
        <Card className="rounded-2xl border-border/60"><CardContent className="p-4 text-center"><p className="text-[22px] font-bold tracking-tight text-primary">{stats.enviados}</p><p className="text-[12px] text-muted-foreground">Mensajes enviados</p></CardContent></Card>
        <Card className="rounded-2xl border-border/60"><CardContent className="p-4 text-center"><p className={`text-[22px] font-bold tracking-tight ${stats.errores > 0 ? 'text-red-500' : 'text-muted-foreground/40'}`}>{stats.errores}</p><p className="text-[12px] text-muted-foreground">Errores</p></CardContent></Card>
      </div>

      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas">Plantillas ({templates.length})</TabsTrigger>
          <TabsTrigger value="publicaciones">Publicaciones ({campanas.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial ({mensajes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Plantillas de mensajes automáticos para WhatsApp, Instagram y Facebook</p>
            <div className="flex gap-2">
              <Dialog open={sendOpen} onOpenChange={setSendOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Send className="w-4 h-4 mr-1" />Enviar mensaje</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Enviar mensaje</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div><Label>Plantilla</Label>
                      <Select value={selectedTemplate?.id || ''} onValueChange={id => setSelectedTemplate(templates.find(t => t.id === id))}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar plantilla..." /></SelectTrigger>
                        <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.canal})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Contacto</Label>
                      <Select value={sendContacto} onValueChange={setSendContacto}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
                        <SelectContent>{contactos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.telefono}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {selectedTemplate && (
                      <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">{selectedTemplate.contenido}</div>
                    )}
                    <div><Label>Variables extra (JSON)</Label><Input value={sendVariables} onChange={e => setSendVariables(e.target.value)} placeholder={'{"propiedad": "Apto 3 hab", "precio": "$1.2B"}'} /></div>
                    <Button className="w-full" onClick={handleEnviarMensaje}><Send className="w-4 h-4 mr-1" />Enviar</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
                <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nueva plantilla</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Nueva plantilla de mensaje</DialogTitle></DialogHeader>
                  <TemplateForm onSave={async d => { await MensajeTemplate.create(d); setTemplateOpen(false); refresh(); }} onCancel={() => setTemplateOpen(false)} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="space-y-2">
            {templates.map(t => {
              const Icon = CANAL_ICONS[t.canal] || Send;
              return (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${CANAL_COLORS[t.canal] || ''}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-medium text-sm">{t.nombre}</p>
                        <Badge className={`text-[10px] ${CANAL_COLORS[t.canal] || ''}`}>{t.canal}</Badge>
                        {t.auto_envio && <Badge className="text-[10px] bg-amber-100 text-amber-700">Auto</Badge>}
                      </div>
                      {t.trigger !== 'manual' && <p className="text-xs text-muted-foreground">Trigger: {t.trigger.replace(/_/g, ' ')}</p>}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.contenido}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 flex-shrink-0" onClick={() => handleDeleteTemplate(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {templates.length === 0 && <div className="text-center py-10 text-muted-foreground">Sin plantillas. Crea la primera para empezar.</div>}
          </div>
        </TabsContent>

        <TabsContent value="publicaciones" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={postOpen} onOpenChange={setPostOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Programar publicación</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Programar publicación</DialogTitle></DialogHeader>
                <ProgramarPublicacion onSave={async d => { await CampanaSocial.create(d); setPostOpen(false); refresh(); }} onCancel={() => setPostOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            {campanas.map(c => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${c.plataforma?.includes('Instagram') ? 'bg-pink-100 text-pink-700' : 'bg-indigo-100 text-indigo-700'}`}>
                    {c.plataforma?.includes('Instagram') ? <Instagram className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm truncate">{c.propiedad_titulo}</p>
                      <Badge className={`text-[10px] ${ESTADO_COLORS[c.estado] || ''}`}>{c.estado}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.plataforma?.replace('_y_', ' + ')}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.caption}</p>
                    {c.fecha_programada && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(c.fecha_programada), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                      </p>
                    )}
                  </div>
                  {c.estado === 'Borrador' || c.estado === 'Programado' ? (
                    <Button size="sm" className="h-7 text-xs flex-shrink-0" onClick={() => handlePublicar(c)}>
                      <Send className="w-3 h-3 mr-1" />Publicar
                    </Button>
                  ) : c.estado === 'Publicado' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  )}
                </CardContent>
              </Card>
            ))}
            {campanas.length === 0 && <div className="text-center py-10 text-muted-foreground">Sin publicaciones programadas</div>}
          </div>
        </TabsContent>

        <TabsContent value="historial" className="mt-4 space-y-2">
          {mensajes.slice(0, 50).map(m => (
            <Card key={m.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${CANAL_COLORS[m.canal] || ''}`}>
                  {React.createElement(CANAL_ICONS[m.canal] || Send, { className: 'w-3.5 h-3.5' })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{m.contacto_nombre}</p>
                    <Badge className={`text-[10px] ${m.estado === 'Enviado' || m.estado === 'Leido' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.estado}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.contenido_final}</p>
                </div>
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  {m.fecha_envio ? format(new Date(m.fecha_envio), 'dd MMM HH:mm', { locale: es }) : ''}
                </p>
              </CardContent>
            </Card>
          ))}
          {mensajes.length === 0 && <div className="text-center py-10 text-muted-foreground">Sin mensajes enviados aún</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}