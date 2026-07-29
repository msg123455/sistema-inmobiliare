import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, User, Phone, Home, DollarSign, MessageCircle, Bot, ChevronLeft, ChevronRight, Flame, Zap } from 'lucide-react';
import { toast } from 'sonner';

const TEMP_BADGE = {
  Frio: { label: 'Frío', dot: 'bg-blue-500', cls: 'bg-blue-500/10 text-blue-600' },
  Tibio: { label: 'Tibio', dot: 'bg-amber-500', cls: 'bg-amber-500/10 text-amber-600' },
  Caliente: { label: 'Caliente', dot: 'bg-orange-500', cls: 'bg-orange-500/10 text-orange-600' },
  Urgente: { label: 'Urgente', dot: 'bg-red-500', cls: 'bg-red-500/10 text-red-600 font-semibold' },
};

const Contacto = base44.entities.Contacto;

const ETAPAS_VENTA = ['Lead', 'Visita_Agendada', 'Oferta', 'Negociacion', 'Promesa', 'Escritura'];
const ETAPAS_ARRIENDO = ['Lead', 'Visita_Agendada', 'Aplicacion', 'Verificacion', 'Contrato', 'Activo'];

const ETAPA_LABELS = {
  Lead: 'Lead',
  Visita_Agendada: 'Visita Agendada',
  Oferta: 'Oferta',
  Negociacion: 'Negociación',
  Promesa: 'Promesa',
  Escritura: 'Escritura',
  Aplicacion: 'Aplicación',
  Verificacion: 'Verificación',
  Contrato: 'Contrato',
  Activo: 'Activo',
  Perdido: 'Perdido',
};

const ETAPA_COLORS = {
  Lead: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  Visita_Agendada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Oferta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Negociacion: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Promesa: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Escritura: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Aplicacion: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  Verificacion: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  Contrato: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Activo: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

function formatCOP(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

const SEG_LABELS = {
  Asignado: 'Asignado', Contactado: 'Contactado', Cita_Agendada: 'Cita agendada',
  Visita_Realizada: 'Visita hecha', No_Contesta: 'No contesta',
  Paro_De_Contestar: 'Paró de contestar', Cerrado_Ganado: 'Cerrado ✓', Cerrado_Perdido: 'Cerrado ✗',
};

function horasDesde(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function tiempoTexto(iso) {
  const h = horasDesde(iso);
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

// ── Panel de leads delegados a brokers (seguimiento post-entrega) ──
function TablaDelegados({ contactos }) {
  const navigate = useNavigate();
  const delegados = contactos
    .filter(c => c.ia_calificado && !c.descalificado && !['Cerrado_Ganado', 'Cerrado_Perdido'].includes(c.estado_seguimiento))
    .sort((a, b) => (horasDesde(b.fecha_ultimo_avance || b.fecha_asignacion) || 0) - (horasDesde(a.fecha_ultimo_avance || a.fecha_asignacion) || 0));

  if (delegados.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">Aún no hay leads delegados a brokers.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="py-2 px-2">Lead</th>
            <th className="py-2 px-2">Broker</th>
            <th className="py-2 px-2">Estado</th>
            <th className="py-2 px-2">Presupuesto</th>
            <th className="py-2 px-2">Sin avance</th>
          </tr>
        </thead>
        <tbody>
          {delegados.map(c => {
            const h = horasDesde(c.fecha_ultimo_avance || c.fecha_asignacion) || 0;
            const alerta = h > 48 ? 'bg-red-500/10' : h > 24 ? 'bg-amber-500/10' : '';
            return (
              <tr key={c.id} className={`border-b cursor-pointer hover:bg-muted/50 ${alerta}`} onClick={() => navigate(`/crm/contactos/${c.id}`)}>
                <td className="py-2 px-2 font-medium">{c.nombre}<div className="text-xs text-muted-foreground">{c.telefono}</div></td>
                <td className="py-2 px-2">{c.asignado_a || '—'}</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">{SEG_LABELS[c.estado_seguimiento] || c.estado_seguimiento || 'Asignado'}</Badge></td>
                <td className="py-2 px-2 text-muted-foreground">{formatCOP(c.presupuesto_max) || '—'}</td>
                <td className={`py-2 px-2 font-medium ${h > 48 ? 'text-red-600' : h > 24 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {tiempoTexto(c.fecha_ultimo_avance || c.fecha_asignacion)}
                  {h > 48 && <span className="ml-1 text-xs">🥶</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Leads descalificados (fuera del pipeline activo) ──
function TablaDescalificadas({ contactos }) {
  const navigate = useNavigate();
  const desc = contactos.filter(c => c.descalificado);
  if (desc.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">No hay leads descalificados.</p>;
  }
  return (
    <div className="space-y-2">
      {desc.map(c => (
        <Card key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/crm/contactos/${c.id}`)}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium text-sm">{c.nombre}</span>
              <span className="text-xs text-muted-foreground ml-2">{c.telefono}</span>
            </div>
            <span className="text-xs text-red-600 text-right flex-shrink-0">{c.motivo_descalificacion || 'Descalificada'}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ContactoCard({ contacto, onEtapaChange }) {
  const navigate = useNavigate();
  const etapas = contacto.pipeline_tipo === 'Arriendo' ? ETAPAS_ARRIENDO : ETAPAS_VENTA;
  const currentIdx = etapas.indexOf(contacto.etapa_pipeline);
  const temp = TEMP_BADGE[contacto.temperatura];

  const handleMove = async (dir) => {
    const nextEtapa = etapas[currentIdx + dir];
    if (!nextEtapa) return;
    await Contacto.update(contacto.id, { etapa_pipeline: nextEtapa, ultima_actividad: new Date().toISOString() });
    onEtapaChange();
  };

  return (
    <Card
      className="mb-2 hover:shadow-sm transition-all duration-300 cursor-pointer rounded-xl border-border/60"
      onClick={() => navigate(`/crm/contactos/${contacto.id}`)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-medium text-sm hover:underline truncate">{contacto.nombre}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {contacto.en_conversacion && (
              <span title="Chat activo con IA">
                <Bot className="w-3 h-3 text-violet-500" />
              </span>
            )}
            {temp && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ${temp.cls}`} title={temp.label}>
                <span className={`w-1.5 h-1.5 rounded-full ${temp.dot}`} />
                {temp.label}
              </span>
            )}
          </div>
        </div>

        {contacto.telefono && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Phone className="w-3 h-3" /> {contacto.telefono}
          </div>
        )}
        {contacto.presupuesto_max && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <DollarSign className="w-3 h-3" /> Hasta {formatCOP(contacto.presupuesto_max)}
          </div>
        )}
        {contacto.ciudad_interes && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Home className="w-3 h-3" /> {contacto.ciudad_interes}
          </div>
        )}

        {/* Score bar */}
        {contacto.score_lead > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground">Score</span>
              <span className="text-[10px] font-medium">{contacto.score_lead}/100</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1">
              <div
                className={`h-1 rounded-full ${
                  contacto.score_lead >= 70 ? 'bg-green-500' :
                  contacto.score_lead >= 40 ? 'bg-yellow-400' : 'bg-gray-300'
                }`}
                style={{ width: `${contacto.score_lead}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
          {currentIdx > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => handleMove(-1)}><ChevronLeft className="w-3 h-3" />Atrás</Button>
          )}
          {currentIdx < etapas.length - 1 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => handleMove(1)}>Avanzar<ChevronRight className="w-3 h-3" /></Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ etapa, contactos, onEtapaChange }) {
  return (
    <div className="flex-shrink-0 w-60">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold text-foreground">{ETAPA_LABELS[etapa] || etapa}</span>
        <Badge variant="secondary" className="text-xs">{contactos.length}</Badge>
      </div>
      <div className="bg-muted/40 rounded-2xl p-2 min-h-40">
        {contactos.map(c => (
          <ContactoCard key={c.id} contacto={c} onEtapaChange={onEtapaChange} />
        ))}
        {contactos.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Sin contactos</p>
        )}
      </div>
    </div>
  );
}

function NuevoContactoDialog({ tipo, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', presupuesto_max: '', ciudad_interes: '' });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.nombre || !form.telefono) { toast.error('Nombre y teléfono son obligatorios'); return; }
    setLoading(true);
    try {
      await Contacto.create({
        ...form,
        presupuesto_max: form.presupuesto_max ? Number(form.presupuesto_max) : undefined,
        pipeline_tipo: tipo,
        etapa_pipeline: 'Lead',
        fecha_primer_contacto: new Date().toISOString().split('T')[0],
      });
      toast.success('Contacto creado');
      setOpen(false);
      setForm({ nombre: '', telefono: '', email: '', presupuesto_max: '', ciudad_interes: '' });
      onCreated();
    } catch {
      toast.error('Error al crear contacto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="w-4 h-4 mr-1" /> Nuevo lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo lead — {tipo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" /></div>
          <div><Label>Teléfono / WhatsApp *</Label><Input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} placeholder="+57 300..." /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@ejemplo.com" /></div>
          <div><Label>Presupuesto máx (COP)</Label><Input type="number" value={form.presupuesto_max} onChange={e => setForm(p => ({ ...p, presupuesto_max: e.target.value }))} placeholder="500000000" /></div>
          <div><Label>Ciudad de interés</Label><Input value={form.ciudad_interes} onChange={e => setForm(p => ({ ...p, ciudad_interes: e.target.value }))} placeholder="Bogotá" /></div>
          <Button className="w-full" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creando...' : 'Crear lead'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Pipeline() {
  const qc = useQueryClient();
  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['contactos'] });

  const ventaContactos = contactos.filter(c => c.pipeline_tipo !== 'Arriendo' && c.etapa_pipeline !== 'Perdido' && !c.descalificado);
  const arriendoContactos = contactos.filter(c => c.pipeline_tipo === 'Arriendo' && c.etapa_pipeline !== 'Perdido' && !c.descalificado);
  const delegadosCount = contactos.filter(c => c.ia_calificado && !c.descalificado && !['Cerrado_Ganado', 'Cerrado_Perdido'].includes(c.estado_seguimiento)).length;
  const descalificadasCount = contactos.filter(c => c.descalificado).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">Pipeline CRM</h1>
      </div>

      <Tabs defaultValue="venta">
        <TabsList>
          <TabsTrigger value="venta">Ventas ({ventaContactos.length})</TabsTrigger>
          <TabsTrigger value="arriendo">Arriendos ({arriendoContactos.length})</TabsTrigger>
          <TabsTrigger value="delegados">Delegados ({delegadosCount})</TabsTrigger>
          <TabsTrigger value="descalificadas">Descalificadas ({descalificadasCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="venta" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Pipeline de compraventa de inmuebles</p>
            <NuevoContactoDialog tipo="Venta" onCreated={refresh} />
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ETAPAS_VENTA.map(etapa => (
              <KanbanColumn
                key={etapa}
                etapa={etapa}
                contactos={ventaContactos.filter(c => c.etapa_pipeline === etapa)}
                onEtapaChange={refresh}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="arriendo" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Pipeline de arrendamiento de inmuebles</p>
            <NuevoContactoDialog tipo="Arriendo" onCreated={refresh} />
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ETAPAS_ARRIENDO.map(etapa => (
              <KanbanColumn
                key={etapa}
                etapa={etapa}
                contactos={arriendoContactos.filter(c => c.etapa_pipeline === etapa)}
                onEtapaChange={refresh}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="delegados" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">Leads entregados a los brokers. En amarillo los que llevan +24h sin avance; en rojo +48h (enfriándose).</p>
          <TablaDelegados contactos={contactos} />
        </TabsContent>

        <TabsContent value="descalificadas" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">Leads que no encajan (ciudad o presupuesto fuera de rango). No cuentan en el pipeline activo.</p>
          <TablaDescalificadas contactos={contactos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}