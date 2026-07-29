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
import { Plus, Building, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const ContratoVenta = base44.entities.ContratoVenta;
const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;
const Propietario = base44.entities.Propietario;

function formatCOP(n) {
  if (!n) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

const ESTADOS = ['Promesa','Credito_en_estudio','Aprobado','Escritura','Entregado','Cancelado'];
const ESTADO_COLORS = {
  Promesa: 'bg-blue-100 text-blue-700',
  Credito_en_estudio: 'bg-amber-100 text-amber-700',
  Aprobado: 'bg-green-100 text-green-700',
  Escritura: 'bg-purple-100 text-purple-700',
  Entregado: 'bg-emerald-100 text-emerald-700',
  Cancelado: 'bg-red-100 text-red-700',
};

const TIMELINE = ['Promesa','Credito_en_estudio','Aprobado','Escritura','Entregado'];

function NuevoContratoForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    propiedad_id: '', comprador_id: '', propietario_id: '',
    precio_venta: '', comision_pct: '3', forma_pago: 'Contado',
    entidad_financiera: '', arras: '', fecha_promesa: '', fecha_escritura: '', notas: '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: propietarios = [] } = useQuery({ queryKey: ['propietarios'], queryFn: () => Propietario.list() });

  const precioVenta = Number(form.precio_venta) || 0;
  const comisionPct = Number(form.comision_pct) || 3;
  const valorComision = Math.round(precioVenta * comisionPct / 100);

  const handleSave = async () => {
    if (!form.propiedad_id || !form.comprador_id || !form.precio_venta) {
      toast.error('Propiedad, comprador y precio son obligatorios');
      return;
    }
    setLoading(true);
    try {
      const prop = propiedades.find(p => p.id === form.propiedad_id);
      const comp = contactos.find(c => c.id === form.comprador_id);
      const prop_owner = propietarios.find(p => p.id === form.propietario_id);
      await onSave({
        ...form,
        precio_venta: precioVenta,
        comision_pct: comisionPct,
        valor_comision: valorComision,
        arras: form.arras ? Number(form.arras) : undefined,
        propiedad_titulo: prop?.titulo || '',
        comprador_nombre: comp?.nombre || '',
        propietario_nombre: prop_owner?.nombre || '',
        estado: 'Promesa',
      });
      toast.success('Contrato de venta creado');
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
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Comprador *</Label>
          <Select value={form.comprador_id} onValueChange={v => set('comprador_id', v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>{contactos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Propietario vendedor</Label>
          <Select value={form.propietario_id} onValueChange={v => set('propietario_id', v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>{propietarios.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Precio de venta (COP) *</Label><Input type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></div>
        <div>
          <Label>Comisión %</Label>
          <Input type="number" value={form.comision_pct} onChange={e => set('comision_pct', e.target.value)} />
          {valorComision > 0 && <p className="text-xs text-primary mt-0.5">= {formatCOP(valorComision)}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Forma de pago</Label>
          <Select value={form.forma_pago} onValueChange={v => set('forma_pago', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Contado','Credito_hipotecario','Leasing','Mixto'].map(f => <SelectItem key={f} value={f}>{f.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Entidad financiera</Label><Input value={form.entidad_financiera} onChange={e => set('entidad_financiera', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Arras (COP)</Label><Input type="number" value={form.arras} onChange={e => set('arras', e.target.value)} /></div>
        <div><Label>Fecha promesa</Label><Input type="date" value={form.fecha_promesa} onChange={e => set('fecha_promesa', e.target.value)} /></div>
      </div>
      <div><Label>Fecha escritura</Label><Input type="date" value={form.fecha_escritura} onChange={e => set('fecha_escritura', e.target.value)} /></div>
      <div><Label>Notas</Label><Input value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Crear contrato'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function ContratosVenta() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterEstado, setFilterEstado] = useState('todos');

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos-venta'],
    queryFn: () => ContratoVenta.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['contratos-venta'] });

  const totalComisiones = contratos
    .filter(c => c.estado !== 'Cancelado')
    .reduce((sum, c) => sum + (c.valor_comision || 0), 0);

  const filtered = contratos.filter(c => filterEstado === 'todos' || c.estado === filterEstado);

  const avanzarEstado = async (contrato) => {
    const idx = TIMELINE.indexOf(contrato.estado);
    if (idx < TIMELINE.length - 1) {
      await ContratoVenta.update(contrato.id, { estado: TIMELINE[idx + 1] });
      refresh();
      toast.success(`Estado actualizado a: ${TIMELINE[idx + 1].replace(/_/g, ' ')}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Contratos de Venta</h1>
          <p className="text-muted-foreground text-sm">{contratos.filter(c => c.estado !== 'Cancelado').length} activos · Comisiones: {formatCOP(totalComisiones)}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nuevo contrato</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nuevo contrato de venta</DialogTitle></DialogHeader>
            <NuevoContratoForm onSave={async d => { await ContratoVenta.create(d); setCreateOpen(false); refresh(); }} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterEstado === 'todos' ? 'default' : 'outline'} size="sm" onClick={() => setFilterEstado('todos')}>Todos</Button>
        {ESTADOS.map(e => (
          <Button key={e} variant={filterEstado === e ? 'default' : 'outline'} size="sm" onClick={() => setFilterEstado(e)}>
            {e.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando...</div> : (
        <div className="space-y-3">
          {filtered.map(c => {
            const timelineIdx = TIMELINE.indexOf(c.estado);
            return (
              <Card key={c.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary flex-shrink-0">
                      <Building className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{c.propiedad_titulo || 'Propiedad'}</span>
                        <Badge className={`text-[10px] ${ESTADO_COLORS[c.estado] || ''}`}>{c.estado?.replace(/_/g, ' ')}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Comprador: <strong>{c.comprador_nombre}</strong></span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatCOP(c.precio_venta)}</span>
                        <span className="flex items-center gap-1 text-primary font-medium"><TrendingUp className="w-3 h-3" />Comisión: {formatCOP(c.valor_comision)}</span>
                      </div>
                      {c.fecha_promesa && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Calendar className="w-3 h-3" />
                          Promesa: {format(new Date(c.fecha_promesa), 'dd MMM yyyy', { locale: es })}
                          {c.fecha_escritura && ` · Escritura: ${format(new Date(c.fecha_escritura), 'dd MMM yyyy', { locale: es })}`}
                        </div>
                      )}
                      {/* Timeline progress */}
                      {timelineIdx >= 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          {TIMELINE.map((e, i) => (
                            <React.Fragment key={e}>
                              <div className={`h-1.5 flex-1 rounded-full ${i <= timelineIdx ? 'bg-primary' : 'bg-muted'}`} />
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                    {c.estado !== 'Entregado' && c.estado !== 'Cancelado' && (
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0 rounded-lg" onClick={() => avanzarEstado(c)}>
                        Avanzar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Building className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay contratos de venta</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}