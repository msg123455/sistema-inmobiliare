import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Edit2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserRole } from '@/hooks/useUserRole';

const TIPOS = ['Fundador', 'Friends & Family', 'Ángel Inversionista', 'Socio Estratégico', 'Otro'];

const EMPTY = {
  nombre: '', tipo: 'Friends & Family', email: '', telefono: '',
  porcentaje_participacion: '', fecha_incorporacion: '', notas: '',
};

const TIPO_STYLE = {
  'Fundador': 'bg-violet-100 text-violet-700',
  'Friends & Family': 'bg-blue-100 text-blue-700',
  'Ángel Inversionista': 'bg-amber-100 text-amber-700',
  'Socio Estratégico': 'bg-emerald-100 text-emerald-700',
  'Otro': 'bg-muted text-muted-foreground',
};

export default function Socios() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: socios = [], isLoading } = useQuery({
    queryKey: ['socios'],
    queryFn: () => base44.entities.Socio.list(),
  });

  const openNew = () => { setEditando(null); setForm(EMPTY); setShowForm(true); };

  const openEdit = (s) => {
    setEditando(s);
    setForm({
      nombre: s.nombre || '', tipo: s.tipo || 'Friends & Family',
      email: s.email || '', telefono: s.telefono || '',
      porcentaje_participacion: s.porcentaje_participacion || '',
      fecha_incorporacion: s.fecha_incorporacion || '', notas: s.notas || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return;
    const data = { ...form, porcentaje_participacion: parseFloat(form.porcentaje_participacion) || 0 };
    if (editando) {
      await base44.entities.Socio.update(editando.id, data);
    } else {
      await base44.entities.Socio.create(data);
    }
    queryClient.invalidateQueries(['socios']);
    setShowForm(false);
    setEditando(null);
    setForm(EMPTY);
  };

  const handleDelete = async (id) => {
    await base44.entities.Socio.delete(id);
    queryClient.invalidateQueries(['socios']);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Socios</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestión centralizada de socios — un socio puede estar en múltiples negocios</p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> Agregar socio
        </Button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editando ? 'Editar socio' : 'Nuevo socio'}</h3>
            <button onClick={() => { setShowForm(false); setEditando(null); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nombre *</label>
              <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-1 rounded-lg" placeholder="Nombre completo" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 rounded-lg" placeholder="email@ejemplo.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="mt-1 rounded-lg" placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Participación (%)</label>
              <Input
                type="number" min={0} max={100}
                value={form.porcentaje_participacion}
                onChange={e => setForm({ ...form, porcentaje_participacion: e.target.value })}
                className="mt-1 rounded-lg" placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha incorporación</label>
              <Input type="date" value={form.fecha_incorporacion} onChange={e => setForm({ ...form, fecha_incorporacion: e.target.value })} className="mt-1 rounded-lg" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Notas</label>
              <textarea
                value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })}
                className="mt-1 w-full p-3 border border-border rounded-lg text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows="2" placeholder="Acuerdos, observaciones..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditando(null); }} className="rounded-lg">Cancelar</Button>
            <Button onClick={handleSubmit} className="rounded-lg" disabled={!form.nombre.trim()}>
              {editando ? 'Guardar cambios' : 'Crear socio'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : socios.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-xl border border-dashed border-border/60">
          <Users className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay socios registrados</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Agregá el primer socio para empezar</p>
          <Button onClick={openNew} variant="outline" className="mt-4 rounded-xl gap-2">
            <Plus className="w-3.5 h-3.5" /> Agregar socio
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/40 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {['Socio', 'Tipo', 'Contacto', 'Participación', 'Incorporación', ''].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h === '' || h === 'Participación' || h === 'Incorporación' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {socios.map((s, i) => (
                <tr key={s.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {s.nombre?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.nombre}</p>
                        {s.notas && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{s.notas}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${TIPO_STYLE[s.tipo] || TIPO_STYLE['Otro']}`}>
                      {s.tipo || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{s.email || '—'}</p>
                    <p className="text-xs text-muted-foreground">{s.telefono || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.porcentaje_participacion > 0 ? (
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className="text-sm font-bold text-foreground">{s.porcentaje_participacion}%</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, s.porcentaje_participacion)}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {s.fecha_incorporacion ? new Date(s.fecha_incorporacion).toLocaleDateString('es') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (confirmDelete === s.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(s.id)} className="text-xs px-2 py-1 bg-destructive text-white rounded-lg">Sí</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 bg-muted rounded-lg">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(s.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {socios.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t border-border/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{socios.length} socio{socios.length !== 1 ? 's' : ''}</p>
              {socios.some(s => s.porcentaje_participacion > 0) && (
                <p className="text-xs text-muted-foreground">
                  Total participación: <span className="font-semibold text-foreground">
                    {socios.reduce((sum, s) => sum + (s.porcentaje_participacion || 0), 0).toFixed(1)}%
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}