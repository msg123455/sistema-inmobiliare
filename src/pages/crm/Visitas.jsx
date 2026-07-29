import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, CalendarDays, Home, User, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const Visita = base44.entities.Visita;
const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;

const ESTADO_COLORS = {
  Programada: 'bg-blue-100 text-blue-700',
  Realizada: 'bg-green-100 text-green-700',
  Cancelada: 'bg-red-100 text-red-700',
  No_asistio: 'bg-gray-100 text-gray-600',
};

function VisitaForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    propiedad_id: '', contacto_id: '', fecha_hora: '', tipo: 'Presencial',
    duracion_minutos: '60', notas_resultado: '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });

  const handleSave = async () => {
    if (!form.propiedad_id || !form.contacto_id || !form.fecha_hora) {
      toast.error('Propiedad, contacto y fecha son obligatorios');
      return;
    }
    setLoading(true);
    try {
      const prop = propiedades.find(p => p.id === form.propiedad_id);
      const cont = contactos.find(c => c.id === form.contacto_id);
      await onSave({
        ...form,
        duracion_minutos: Number(form.duracion_minutos),
        propiedad_titulo: prop?.titulo || '',
        contacto_nombre: cont?.nombre || '',
        estado: 'Programada',
      });
      toast.success('Visita agendada');
    } catch { toast.error('Error al agendar visita'); }
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
      <div><Label>Contacto *</Label>
        <Select value={form.contacto_id} onValueChange={v => set('contacto_id', v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
          <SelectContent>{contactos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.telefono}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Fecha y hora *</Label><Input type="datetime-local" value={form.fecha_hora} onChange={e => set('fecha_hora', e.target.value)} /></div>
        <div><Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Presencial">Presencial</SelectItem><SelectItem value="Virtual">Virtual</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Duración (min)</Label><Input type="number" value={form.duracion_minutos} onChange={e => set('duracion_minutos', e.target.value)} /></div>
      <div><Label>Notas</Label><Textarea value={form.notas_resultado} onChange={e => set('notas_resultado', e.target.value)} rows={2} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Agendando...' : 'Agendar visita'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Visitas() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterEstado, setFilterEstado] = useState('todos');

  const { data: visitas = [], isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: () => Visita.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['visitas'] });

  const handleEstado = async (id, estado) => {
    await Visita.update(id, { estado });
    refresh();
    toast.success(`Visita marcada como ${estado.replace('_', ' ')}`);
  };

  const sorted = [...visitas]
    .filter(v => filterEstado === 'todos' || v.estado === filterEstado)
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Visitas</h1>
          <p className="text-muted-foreground text-[15px]">{visitas.filter(v => v.estado === 'Programada').length} programadas</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Agendar visita</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Agendar visita</DialogTitle></DialogHeader>
            <VisitaForm onSave={async d => { await Visita.create(d); setCreateOpen(false); refresh(); }} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2">
        {['todos','Programada','Realizada','Cancelada','No_asistio'].map(e => (
          <Button key={e} variant={filterEstado === e ? 'default' : 'outline'} size="sm" onClick={() => setFilterEstado(e)}>
            {e === 'todos' ? 'Todas' : e.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando...</div> : (
        <div className="space-y-3">
          {sorted.map(v => (
            <Card key={v.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-center flex-shrink-0 w-16">
                    <p className="text-2xl font-bold text-foreground">
                      {v.fecha_hora ? format(new Date(v.fecha_hora), 'dd') : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {v.fecha_hora ? format(new Date(v.fecha_hora), 'MMM', { locale: es }) : ''}
                    </p>
                    <p className="text-xs font-medium text-foreground mt-0.5">
                      {v.fecha_hora ? format(new Date(v.fecha_hora), 'HH:mm') : ''}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{v.propiedad_titulo || 'Propiedad'}</span>
                      <Badge className={`text-[10px] ${ESTADO_COLORS[v.estado] || ''}`}>{v.estado?.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-[10px]">{v.tipo}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.contacto_nombre}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{v.duracion_minutos} min</span>
                    </div>
                    {v.notas_resultado && <p className="text-xs text-muted-foreground mt-1 italic">{v.notas_resultado}</p>}
                  </div>
                  {v.estado === 'Programada' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => handleEstado(v.id, 'Realizada')}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Realizada
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleEstado(v.id, 'Cancelada')}>
                        <XCircle className="w-3 h-3 mr-1" />Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {sorted.length === 0 && (
            <div className="text-center py-12">
              <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay visitas en este estado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}