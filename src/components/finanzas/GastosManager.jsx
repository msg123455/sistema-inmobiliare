import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, DollarSign } from 'lucide-react';

const CATEGORIAS = [
  { value: 'nomina', label: 'Nómina' },
  { value: 'arriendo', label: 'Arriendo' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'software', label: 'Software' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'legal', label: 'Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'otro', label: 'Otro' },
];

export default function GastosManager() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ concepto: '', monto_mensual: '', categoria: 'otro' });
  const queryClient = useQueryClient();

  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos-fijos'],
    queryFn: () => base44.entities.GastoFijo.list(),
  });

  const handleSave = async () => {
    if (!form.concepto || !form.monto_mensual) return;
    await base44.entities.GastoFijo.create({ ...form, monto_mensual: parseFloat(form.monto_mensual), activo: true });
    setForm({ concepto: '', monto_mensual: '', categoria: 'otro' });
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['gastos-fijos'] });
  };

  const handleDelete = async (id) => {
    await base44.entities.GastoFijo.delete(id);
    queryClient.invalidateQueries({ queryKey: ['gastos-fijos'] });
  };

  const totalMensual = gastos.filter(g => g.activo !== false).reduce((s, g) => s + (g.monto_mensual || 0), 0);

  const gastosPorCategoria = CATEGORIAS.map(cat => ({
    ...cat,
    total: gastos.filter(g => g.categoria === cat.value && g.activo !== false).reduce((s, g) => s + (g.monto_mensual || 0), 0),
    items: gastos.filter(g => g.categoria === cat.value && g.activo !== false),
  })).filter(c => c.items.length > 0);

  if (isLoading) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Gastos Fijos Mensuales</h3>
          <p className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">${totalMensual.toLocaleString()}/mes</span></p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Agregar
        </Button>
      </div>

      {showForm && (
        <div className="bg-muted/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="Concepto" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className="rounded-lg" />
            <Input type="number" placeholder="Monto USD/mes" value={form.monto_mensual} onChange={(e) => setForm({ ...form, monto_mensual: e.target.value })} className="rounded-lg" />
            <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm" className="rounded-lg">Guardar</Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="rounded-lg">Cancelar</Button>
          </div>
        </div>
      )}

      {gastosPorCategoria.map(cat => (
        <div key={cat.value} className="bg-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</span>
            <span className="text-xs font-medium text-foreground">${cat.total.toLocaleString()}/mes</span>
          </div>
          <div className="space-y-1.5">
            {cat.items.map(g => (
              <div key={g.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <span className="text-sm text-foreground">{g.concepto}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">${g.monto_mensual.toLocaleString()}</span>
                  <button onClick={() => handleDelete(g.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!gastosPorCategoria.length && (
        <p className="text-sm text-muted-foreground text-center py-8">No hay gastos registrados. Agrega los gastos fijos de tu empresa.</p>
      )}
    </div>
  );
}