import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Phone, Mail, DollarSign, MapPin, MessageSquare, Bot, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const TEMP_CONFIG = {
  Frio: { label: 'Frío', dot: 'bg-blue-500', cls: 'bg-blue-500/10 text-blue-600' },
  Tibio: { label: 'Tibio', dot: 'bg-amber-500', cls: 'bg-amber-500/10 text-amber-600' },
  Caliente: { label: 'Caliente', dot: 'bg-orange-500', cls: 'bg-orange-500/10 text-orange-600' },
  Urgente: { label: 'Urgente', dot: 'bg-red-500', cls: 'bg-red-500/10 text-red-600 font-semibold' },
};

const Contacto = base44.entities.Contacto;

const ETAPA_COLORS = {
  Lead: 'bg-gray-100 text-gray-700',
  Visita_Agendada: 'bg-blue-100 text-blue-700',
  Oferta: 'bg-amber-100 text-amber-700',
  Negociacion: 'bg-orange-100 text-orange-700',
  Promesa: 'bg-purple-100 text-purple-700',
  Escritura: 'bg-green-100 text-green-700',
  Activo: 'bg-green-100 text-green-700',
  Perdido: 'bg-red-100 text-red-700',
};

function formatCOP(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function NuevoContactoDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', tipo_interes: 'Compra',
    presupuesto_max: '', ciudad_interes: '', habitaciones_min: '', notas: '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async () => {
    if (!form.nombre || !form.telefono) { toast.error('Nombre y teléfono son obligatorios'); return; }
    setLoading(true);
    try {
      await Contacto.create({
        ...form,
        presupuesto_max: form.presupuesto_max ? Number(form.presupuesto_max) : undefined,
        habitaciones_min: form.habitaciones_min ? Number(form.habitaciones_min) : undefined,
        pipeline_tipo: form.tipo_interes === 'Arriendo' ? 'Arriendo' : 'Venta',
        etapa_pipeline: 'Lead',
        fecha_primer_contacto: new Date().toISOString().split('T')[0],
      });
      toast.success('Contacto creado');
      setOpen(false);
      setForm({ nombre: '', telefono: '', email: '', tipo_interes: 'Compra', presupuesto_max: '', ciudad_interes: '', habitaciones_min: '', notas: '' });
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
        <Button><Plus className="w-4 h-4 mr-1" />Nuevo contacto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo contacto</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
          <div><Label>Teléfono / WhatsApp *</Label><Input value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><Label>Tipo de interés</Label>
            <Select value={form.tipo_interes} onValueChange={v => set('tipo_interes', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Compra">Compra</SelectItem>
                <SelectItem value="Arriendo">Arriendo</SelectItem>
                <SelectItem value="Compra_y_Arriendo">Compra y Arriendo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Presupuesto máx</Label><Input type="number" value={form.presupuesto_max} onChange={e => set('presupuesto_max', e.target.value)} /></div>
            <div><Label>Ciudad</Label><Input value={form.ciudad_interes} onChange={e => set('ciudad_interes', e.target.value)} /></div>
          </div>
          <div><Label>Notas</Label><Input value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={loading}>{loading ? 'Creando...' : 'Crear contacto'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Contactos() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [syncing, setSyncing] = useState(false);

  const { data: contactos = [], isLoading } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['contactos'] });

  const handleSyncValentina = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.syncCRM({ token: 'SYNCWASI2026' });
      refresh();
      toast.success(`Sync completado: ${res.contactos_actualizados} actualizados, ${res.contactos_creados} nuevos`);
    } catch (err) {
      toast.error(err?.message || 'Error al sincronizar con Valentina');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = contactos.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.nombre?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.telefono?.includes(q) || c.ciudad_interes?.toLowerCase().includes(q);
    const matchEtapa = filterEtapa === 'todos' || c.etapa_pipeline === filterEtapa;
    const matchTipo = filterTipo === 'todos' || c.tipo_interes?.includes(filterTipo);
    return matchSearch && matchEtapa && matchTipo;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground text-[15px]">{contactos.length} contactos registrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncValentina} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sync Valentina'}
          </Button>
          <NuevoContactoDialog onCreated={refresh} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nombre, email, teléfono..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Interés" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="Compra">Compra</SelectItem>
            <SelectItem value="Arriendo">Arriendo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEtapa} onValueChange={setFilterEtapa}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las etapas</SelectItem>
            {['Lead','Visita_Agendada','Oferta','Negociacion','Promesa','Escritura','Activo','Perdido'].map(e =>
              <SelectItem key={e} value={e}>{e.replace(/_/g, ' ')}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando contactos...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card key={c.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-semibold text-sm">{c.nombre?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/crm/contactos/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link>
                      <Badge className={`text-[10px] ${ETAPA_COLORS[c.etapa_pipeline] || ''}`}>{c.etapa_pipeline?.replace(/_/g, ' ')}</Badge>
                      <Badge variant="outline" className="text-[10px]">{c.tipo_interes?.replace('_y_', ' y ')}</Badge>
                      {c.temperatura && TEMP_CONFIG[c.temperatura] && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ${TEMP_CONFIG[c.temperatura].cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${TEMP_CONFIG[c.temperatura].dot}`} />
                          {TEMP_CONFIG[c.temperatura].label}
                        </span>
                      )}
                      {c.ia_calificado && (
                        <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Bot className="w-2.5 h-2.5" />IA
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {c.telefono && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{c.telefono}</span>}
                      {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</span>}
                      {c.ciudad_interes && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{c.ciudad_interes}</span>}
                      {c.presupuesto_max && <span className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="w-3 h-3" />Hasta {formatCOP(c.presupuesto_max)}</span>}
                      {c.asignado_a && <span className="text-xs text-muted-foreground">→ {c.asignado_a.split('@')[0]}</span>}
                    </div>
                    {/* Score bar */}
                    {c.score_lead > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.score_lead >= 70 ? 'bg-green-500' : c.score_lead >= 40 ? 'bg-yellow-400' : 'bg-gray-300'}`}
                            style={{ width: `${c.score_lead}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{c.score_lead}/100</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {c.telefono && (
                      <a href={`https://wa.me/${c.telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <MessageSquare className="w-3 h-3 mr-1" />WhatsApp
                        </Button>
                      </a>
                    )}
                    <Link to={`/crm/contactos/${c.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">Ver</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No se encontraron contactos</div>
          )}
        </div>
      )}
    </div>
  );
}