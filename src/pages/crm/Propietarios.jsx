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
import { Plus, Search, Phone, Mail, Building, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const Propietario = base44.entities.Propietario;

function PropietarioForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    nombre: '', tipo: 'Natural', email: '', telefono: '',
    cedula_nit: '', ciudad: '', banco: '', tipo_cuenta: 'Ahorros',
    numero_cuenta: '', porcentaje_administracion: '10', notas: '',
    ...initial,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.nombre || !form.telefono) { toast.error('Nombre y teléfono son obligatorios'); return; }
    setLoading(true);
    try {
      await onSave({ ...form, porcentaje_administracion: Number(form.porcentaje_administracion) });
      toast.success(initial.id ? 'Propietario actualizado' : 'Propietario creado');
    } catch { toast.error('Error al guardar'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nombre / Razón social *</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
        <div><Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Natural">Natural</SelectItem><SelectItem value="Juridico">Jurídico</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Teléfono *</Label><Input value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
        <div><Label>Email</Label><Input value={form.email} onChange={e => set('email', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cédula / NIT</Label><Input value={form.cedula_nit} onChange={e => set('cedula_nit', e.target.value)} /></div>
        <div><Label>Ciudad</Label><Input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Banco</Label><Input value={form.banco} onChange={e => set('banco', e.target.value)} /></div>
        <div><Label>Tipo cuenta</Label>
          <Select value={form.tipo_cuenta} onValueChange={v => set('tipo_cuenta', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Ahorros">Ahorros</SelectItem><SelectItem value="Corriente">Corriente</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Nº cuenta</Label><Input value={form.numero_cuenta} onChange={e => set('numero_cuenta', e.target.value)} /></div>
      </div>
      <div><Label>% Administración (arriendos)</Label><Input type="number" value={form.porcentaje_administracion} onChange={e => set('porcentaje_administracion', e.target.value)} /></div>
      <div><Label>Notas</Label><Input value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Propietarios() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const { data: propietarios = [], isLoading } = useQuery({
    queryKey: ['propietarios'],
    queryFn: () => Propietario.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['propietarios'] });

  const filtered = propietarios.filter(p => {
    const q = search.toLowerCase();
    return !q || p.nombre?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.cedula_nit?.includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Propietarios</h1>
          <p className="text-muted-foreground text-[15px]">{propietarios.length} propietarios registrados</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nuevo propietario</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo propietario</DialogTitle></DialogHeader>
            <PropietarioForm onSave={async d => { await Propietario.create(d); setCreateOpen(false); refresh(); }} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar propietario..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Card key={p.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{p.nombre}</p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">{p.tipo}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditItem(p)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {p.telefono && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{p.telefono}</div>}
                  {p.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{p.email}</div>}
                  {p.cedula_nit && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building className="w-3 h-3" />{p.cedula_nit}</div>}
                  {p.banco && <div className="text-xs text-muted-foreground mt-1">{p.banco} · {p.tipo_cuenta}</div>}
                  {p.porcentaje_administracion && <div className="text-xs font-medium text-primary mt-1">Admin: {p.porcentaje_administracion}%</div>}
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground">No se encontraron propietarios</div>}
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={o => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar propietario</DialogTitle></DialogHeader>
          {editItem && (
            <PropietarioForm
              initial={editItem}
              onSave={async d => { await Propietario.update(editItem.id, d); setEditItem(null); refresh(); }}
              onCancel={() => setEditItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}