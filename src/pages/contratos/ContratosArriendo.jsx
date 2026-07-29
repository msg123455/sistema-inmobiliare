import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Key, AlertTriangle, Calendar, DollarSign, RefreshCw } from 'lucide-react';
import { format, differenceInDays, addYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const ContratoArriendo = base44.entities.ContratoArriendo;
const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;
const Propietario = base44.entities.Propietario;

function formatCOP(n) {
  if (!n) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function NuevoContratoForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    propiedad_id: '', contacto_id: '', propietario_id: '',
    canon_mensual: '', administracion_pct: '10', deposito: '',
    fecha_inicio: '', fecha_fin: '', duracion_meses: '12',
    incremento_anual_pct: '4', dia_pago: '1', notas: '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: propietarios = [] } = useQuery({ queryKey: ['propietarios'], queryFn: () => Propietario.list() });

  const handleSave = async () => {
    if (!form.propiedad_id || !form.contacto_id || !form.canon_mensual || !form.fecha_inicio || !form.fecha_fin) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    setLoading(true);
    try {
      const prop = propiedades.find(p => p.id === form.propiedad_id);
      const cont = contactos.find(c => c.id === form.contacto_id);
      const prop_owner = propietarios.find(p => p.id === form.propietario_id);
      await onSave({
        ...form,
        canon_mensual: Number(form.canon_mensual),
        administracion_pct: Number(form.administracion_pct),
        deposito: form.deposito ? Number(form.deposito) : undefined,
        duracion_meses: Number(form.duracion_meses),
        incremento_anual_pct: Number(form.incremento_anual_pct),
        dia_pago: Number(form.dia_pago),
        propiedad_titulo: prop?.titulo || '',
        arrendatario_nombre: cont?.nombre || '',
        propietario_nombre: prop_owner?.nombre || '',
        estado: 'Activo',
      });
      toast.success('Contrato de arriendo creado');
    } catch { toast.error('Error al crear contrato'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div><Label>Propiedad *</Label>
        <Select value={form.propiedad_id} onValueChange={v => set('propiedad_id', v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
          <SelectContent>{propiedades.map(p => <SelectItem key={p.id} value={p.id}>{p.titulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Arrendatario *</Label>
        <Select value={form.contacto_id} onValueChange={v => set('contacto_id', v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
          <SelectContent>{contactos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Propietario</Label>
        <Select value={form.propietario_id} onValueChange={v => set('propietario_id', v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar propietario..." /></SelectTrigger>
          <SelectContent>{propietarios.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Canon mensual (COP) *</Label><Input type="number" value={form.canon_mensual} onChange={e => set('canon_mensual', e.target.value)} /></div>
        <div><Label>% Administración</Label><Input type="number" value={form.administracion_pct} onChange={e => set('administracion_pct', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Depósito (COP)</Label><Input type="number" value={form.deposito} onChange={e => set('deposito', e.target.value)} /></div>
        <div><Label>Día de pago</Label><Input type="number" min="1" max="28" value={form.dia_pago} onChange={e => set('dia_pago', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Fecha inicio *</Label><Input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} /></div>
        <div><Label>Fecha fin *</Label><Input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Duración (meses)</Label><Input type="number" value={form.duracion_meses} onChange={e => set('duracion_meses', e.target.value)} /></div>
        <div><Label>Incremento anual %</Label><Input type="number" value={form.incremento_anual_pct} onChange={e => set('incremento_anual_pct', e.target.value)} /></div>
      </div>
      <div><Label>Notas</Label><Input value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Crear contrato'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function ContratosArriendo() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterEstado, setFilterEstado] = useState('todos');

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos-arriendo'],
    queryFn: () => ContratoArriendo.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['contratos-arriendo'] });

  const stats = useMemo(() => {
    const hoy = new Date();
    const activos = contratos.filter(c => c.estado === 'Activo');
    const ingresoMensual = activos.reduce((sum, c) => sum + (c.canon_mensual * (c.administracion_pct || 10) / 100), 0);
    const vencen30 = activos.filter(c => {
      if (!c.fecha_fin) return false;
      const dias = differenceInDays(new Date(c.fecha_fin), hoy);
      return dias >= 0 && dias <= 30;
    }).length;
    return { activos: activos.length, ingresoMensual, vencen30 };
  }, [contratos]);

  const filtered = contratos.filter(c => filterEstado === 'todos' || c.estado === filterEstado);

  const handleRenovar = async (contrato) => {
    const nuevaFechaFin = addYears(new Date(contrato.fecha_fin), 1).toISOString().split('T')[0];
    const nuevoCanon = Math.round(contrato.canon_mensual * (1 + (contrato.incremento_anual_pct || 4) / 100));
    await ContratoArriendo.update(contrato.id, {
      fecha_fin: nuevaFechaFin,
      canon_mensual: nuevoCanon,
      estado: 'Activo',
      renovaciones: [...(contrato.renovaciones || []), { fecha: new Date().toISOString().split('T')[0], nuevo_canon: nuevoCanon, nueva_fecha_fin: nuevaFechaFin }],
    });
    refresh();
    toast.success(`Contrato renovado. Nuevo canon: ${formatCOP(nuevoCanon)}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Contratos de Arriendo</h1>
          <p className="text-muted-foreground text-sm">{stats.activos} activos · {formatCOP(stats.ingresoMensual)}/mes · {stats.vencen30} vencen en 30 días</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nuevo contrato</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nuevo contrato de arriendo</DialogTitle></DialogHeader>
            <NuevoContratoForm onSave={async d => { await ContratoArriendo.create(d); setCreateOpen(false); refresh(); }} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['todos','Activo','Por_vencer','Vencido','Terminado'].map(e => (
          <Button key={e} variant={filterEstado === e ? 'default' : 'outline'} size="sm" onClick={() => setFilterEstado(e)}>
            {e === 'todos' ? 'Todos' : e.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando...</div> : (
        <div className="space-y-3">
          {filtered.map(c => {
            const dias = c.fecha_fin ? differenceInDays(new Date(c.fecha_fin), new Date()) : null;
            const alerta = dias !== null && dias <= 30 && c.estado === 'Activo';
            const advertencia = dias !== null && dias > 30 && dias <= 60 && c.estado === 'Activo';
            return (
              <Card key={c.id} className={`hover:shadow-sm transition-all duration-300 rounded-2xl ${alerta ? 'border-red-200' : advertencia ? 'border-amber-200' : 'border-border/60'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${alerta ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{c.propiedad_titulo || 'Propiedad'}</span>
                        <Badge className={`text-[10px] ${c.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{c.estado?.replace('_', ' ')}</Badge>
                        {alerta && <Badge className="text-[10px] bg-red-100 text-red-700"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Vence pronto</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Arrendatario: <strong>{c.arrendatario_nombre}</strong></span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatCOP(c.canon_mensual)}/mes</span>
                        <span>Admin: {c.administracion_pct || 10}% = {formatCOP(c.canon_mensual * (c.administracion_pct || 10) / 100)}</span>
                      </div>
                      {c.fecha_fin && (
                        <div className="flex items-center gap-1 text-xs mt-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className={alerta ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            Vence: {format(new Date(c.fecha_fin), 'dd MMM yyyy', { locale: es })}
                            {dias !== null && ` (${dias > 0 ? `${dias} días` : 'Vencido'})`}
                          </span>
                        </div>
                      )}
                    </div>
                    {c.estado === 'Activo' && (
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" onClick={() => handleRenovar(c)}>
                        <RefreshCw className="w-3 h-3 mr-1" />Renovar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Key className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay contratos en este estado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}