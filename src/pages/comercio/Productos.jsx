import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Productos() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nombre: '', pulgadas: '', costo_compra: '', cal: '', mia: '' });

  const { data: valvulas = [], isLoading, refetch } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    const data = { 
      nombre: form.nombre, 
      pulgadas: parseFloat(form.pulgadas), 
      costo_compra: parseFloat(form.costo_compra),
      cal: form.cal ? parseFloat(form.cal) : null,
      mia: form.mia ? parseFloat(form.mia) : null
    };
    if (editingId) {
      await base44.entities.Valvula.update(editingId, data);
    } else {
      await base44.entities.Valvula.create(data);
    }
    setForm({ nombre: '', pulgadas: '', costo_compra: '', cal: '', mia: '' });
    setShowForm(false);
    setEditingId(null);
    refetch();
  };

  const handleEdit = (v) => {
    setForm({ nombre: v.nombre, pulgadas: v.pulgadas, costo_compra: v.costo_compra, cal: v.cal || '', mia: v.mia || '' });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Valvula.delete(id);
    refetch();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">Catálogo de válvulas y costos</p>
        </div>
        <Button onClick={() => { setForm({ nombre: '', pulgadas: '', costo_compra: '', cal: '', mia: '' }); setEditingId(null); setShowForm(true); }} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nueva válvula
        </Button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl p-5 border border-border/60">
          <h3 className="text-sm font-semibold mb-4">{editingId ? 'Editar válvula' : 'Nueva válvula'}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Válvula Estándar" className="mt-1 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Pulgadas</label>
                <Input type="number" step="0.5" value={form.pulgadas} onChange={e => setForm({ ...form, pulgadas: e.target.value })} placeholder="1.5" className="mt-1 rounded-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Costo (USD)</label>
                <Input type="number" value={form.costo_compra} onChange={e => setForm({ ...form, costo_compra: e.target.value })} placeholder="1200" className="mt-1 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">CAL</label>
                <Input type="number" value={form.cal} onChange={e => setForm({ ...form, cal: e.target.value })} placeholder="0" className="mt-1 rounded-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">MIA</label>
                <Input type="number" value={form.mia} onChange={e => setForm({ ...form, mia: e.target.value })} placeholder="0" className="mt-1 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} className="flex-1 rounded-lg">{editingId ? 'Actualizar' : 'Crear'}</Button>
              <Button onClick={() => { setShowForm(false); setEditingId(null); }} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : valvulas.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-xl border border-dashed border-border/60">
          <Tag className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay productos registrados</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="mt-4 rounded-xl gap-2">
            <Plus className="w-3.5 h-3.5" /> Agregar producto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-card rounded-xl border border-border/40 p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">CAL</h2>
            <div className="space-y-2">
              {[...valvulas]
                .filter(v => v.nombre?.toUpperCase().includes('CAL'))
                .sort((a, b) => (b.pulgadas || 0) - (a.pulgadas || 0))
                .map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{v.nombre}</p>
                      <p className="text-xs text-muted-foreground">{v.pulgadas}" • ${v.costo_compra?.toLocaleString('en-US')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground">{v.pulgadas}"</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(v)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/40 p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">MIA</h2>
            <div className="space-y-2">
              {[...valvulas]
                .filter(v => v.nombre?.toUpperCase().includes('MIA'))
                .sort((a, b) => (b.pulgadas || 0) - (a.pulgadas || 0))
                .map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{v.nombre}</p>
                      <p className="text-xs text-muted-foreground">{v.pulgadas}" • ${v.costo_compra?.toLocaleString('en-US')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground">{v.pulgadas}"</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(v)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}