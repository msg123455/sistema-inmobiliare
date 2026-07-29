import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Target, CheckCircle2, X, Edit2, Trash2, DollarSign, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TIPOS = {
  leads:               { label: 'Leads nuevos',        icon: Users,         color: '#8b5cf6', unit: '' },
  cierres:             { label: 'Cierres (Activo)',     icon: CheckCircle2,  color: '#10b981', unit: '' },
  revenue_usd:         { label: 'Ingresos USD',         icon: DollarSign,    color: '#3b82f6', unit: '$' },
};

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const EMPTY = { titulo: '', tipo: 'cierres', valor_meta: '', valor_actual: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), asignado_a: '', descripcion: '' };

export default function Metas() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filterMes, setFilterMes] = useState(new Date().getMonth() + 1);
  const [filterAnio, setFilterAnio] = useState(new Date().getFullYear());

  const { data: metas = [] } = useQuery({ queryKey: ['metas'], queryFn: () => base44.entities.Meta.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => base44.entities.Contacto.list() });

  const autoActual = useMemo(() => ({
    leads:   contactos.filter(c => c.etapa_pipeline === 'Lead').length,
    cierres: contactos.filter(c => c.etapa_pipeline === 'Activo').length,
  }), [contactos]);

  const filtered = metas.filter(m => m.mes === filterMes && m.anio === filterAnio);

  const openNew  = () => { setEditando(null); setForm({ ...EMPTY, mes: filterMes, anio: filterAnio }); setShowForm(true); };
  const openEdit = (m) => {
    setEditando(m);
    setForm({ titulo: m.titulo, tipo: m.tipo, valor_meta: m.valor_meta || '', valor_actual: m.valor_actual || '', mes: m.mes, anio: m.anio, asignado_a: m.asignado_a || '', descripcion: m.descripcion || '' });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.titulo.trim() || !form.valor_meta) return;
    const data = { ...form, valor_meta: parseFloat(form.valor_meta), valor_actual: parseFloat(form.valor_actual) || 0 };
    if (editando) await base44.entities.Meta.update(editando.id, data);
    else await base44.entities.Meta.create(data);
    queryClient.invalidateQueries(['metas']);
    setShowForm(false); setEditando(null); setForm(EMPTY);
  };

  const handleDelete = async (id) => { await base44.entities.Meta.delete(id); queryClient.invalidateQueries(['metas']); };

  const handleUpdateActual = async (meta, delta) => {
    const newVal = Math.max(0, (meta.valor_actual || 0) + delta);
    await base44.entities.Meta.update(meta.id, { valor_actual: newVal });
    queryClient.invalidateQueries(['metas']);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Metas del equipo</h1>
          <p className="text-[15px] text-muted-foreground mt-0.5">Objetivos mensuales y seguimiento de progreso</p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-xl"><Plus className="w-4 h-4" /> Nueva meta</Button>
      </div>

      {/* Month selector */}
      <div className="bg-card rounded-xl border border-border/40 p-3 flex flex-wrap gap-1 items-center">
        {MONTHS_ES.map((m, i) => (
          <button key={i} onClick={() => setFilterMes(i + 1)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterMes === i + 1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {m}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {[filterAnio - 1, filterAnio, filterAnio + 1].map(y => (
            <button key={y} onClick={() => setFilterAnio(y)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterAnio === y ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-metrics hint */}
      <div className="bg-muted/30 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Datos actuales del sistema: <strong className="text-foreground">{autoActual.leads}</strong> leads · <strong className="text-foreground">{autoActual.cierres}</strong> contactos activos</span>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editando ? 'Editar meta' : 'Nueva meta'}</h3>
            <button onClick={() => { setShowForm(false); setEditando(null); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Título *</label>
              <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="mt-1 rounded-lg" placeholder="Ej: Cerrar 3 nuevos contratos este mes" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Objetivo *</label>
              <Input type="number" value={form.valor_meta} onChange={e => setForm({ ...form, valor_meta: e.target.value })} className="mt-1 rounded-lg" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Progreso actual</label>
              <Input type="number" value={form.valor_actual} onChange={e => setForm({ ...form, valor_actual: e.target.value })} className="mt-1 rounded-lg" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Responsable (email)</label>
              <Input value={form.asignado_a} onChange={e => setForm({ ...form, asignado_a: e.target.value })} className="mt-1 rounded-lg" placeholder="email@empresa.com (opcional)" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Descripción</label>
              <Input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="mt-1 rounded-lg" placeholder="Contexto o criterios de éxito (opcional)" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditando(null); }} className="rounded-lg">Cancelar</Button>
            <Button onClick={handleSubmit} className="rounded-lg" disabled={!form.titulo.trim() || !form.valor_meta}>{editando ? 'Guardar' : 'Crear meta'}</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-dashed border-border/60">
          <Target className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Sin metas para {MONTHS_ES[filterMes - 1]} {filterAnio}</p>
          <Button onClick={openNew} variant="outline" className="mt-4 rounded-xl gap-2"><Plus className="w-3.5 h-3.5" /> Crear primera meta</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(meta => {
            const tipo = TIPOS[meta.tipo] || TIPOS.cierres;
            const Icon = tipo.icon;
            const actual = meta.tipo !== 'revenue_usd' && meta.valor_actual === 0
              ? (autoActual[meta.tipo] ?? 0)
              : (meta.valor_actual || 0);
            const pct = meta.valor_meta > 0 ? Math.min(100, Math.round((actual / meta.valor_meta) * 100)) : 0;
            const done = pct >= 100;

            return (
              <div key={meta.id} className={`bg-card rounded-xl border p-5 space-y-3 transition-all ${done ? 'border-green-300/60 dark:border-green-700/40' : 'border-border/40'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tipo.color}18` }}>
                    <Icon className="w-4 h-4" style={{ color: tipo.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{meta.titulo}</p>
                      {done && <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-950/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">Alcanzada</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{tipo.label}{meta.asignado_a ? ` · ${meta.asignado_a.split('@')[0]}` : ' · Equipo'}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => openEdit(meta)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(meta.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>

                {meta.descripcion && <p className="text-xs text-muted-foreground italic">{meta.descripcion}</p>}

                <div>
                  <div className="flex items-end justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {tipo.unit}{actual.toLocaleString()}
                      </span>
                      {meta.tipo !== 'revenue_usd' && meta.valor_actual === 0 && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">auto</span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">de {tipo.unit}{meta.valor_meta.toLocaleString()}</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: done ? '#10b981' : tipo.color }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleUpdateActual(meta, -1)}
                        className="w-5 h-5 rounded bg-muted/60 text-muted-foreground hover:bg-muted text-xs flex items-center justify-center">−</button>
                      <button onClick={() => handleUpdateActual(meta, 1)}
                        className="w-5 h-5 rounded bg-muted/60 text-muted-foreground hover:bg-muted text-xs flex items-center justify-center">+</button>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: done ? '#10b981' : tipo.color }}>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}