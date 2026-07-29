import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, Circle, Plus, Trash2, Building2, X,
  ClipboardList, Calendar, Filter,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

const FILTROS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'todas',      label: 'Todas' },
  { key: 'completadas', label: 'Completadas' },
];

export default function TareasCRM() {
  const queryClient = useQueryClient();
  const { isAdmin, email: userEmail } = useUserRole();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', fecha_limite: '', hora: '', asignado_a: '', contacto_id: '' });
  const [filtro, setFiltro] = useState('pendientes');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: tareas = [], refetch } = useQuery({
    queryKey: ['tareas-global'],
    queryFn: () => base44.entities.Tarea.list(),
    refetchOnMount: 'always',
  });

  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => base44.entities.Contacto.list(),
  });

  // Tarea todavia tiene cliente_id como required en el esquema, asi que durante la
  // transicion se escriben los dos campos con el mismo valor y se lee contacto_id
  // primero. Al terminar el backfill se elimina cliente_id.
  const refContacto = (t) => t.contacto_id || t.cliente_id;

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 0,
  });

  const handleCrear = async () => {
    if (!form.titulo || !form.fecha_limite) return;
    const payload = {
      titulo: form.titulo,
      fecha_limite: form.fecha_limite,
      asignado_a: form.asignado_a || currentUser?.email || '',
    };
    if (form.hora) payload.hora = form.hora;
    if (form.contacto_id) { payload.contacto_id = form.contacto_id; payload.cliente_id = form.contacto_id; }
    await base44.entities.Tarea.create(payload);
    setForm({ titulo: '', fecha_limite: '', hora: '', asignado_a: '', contacto_id: '' });
    setShowForm(false);
    refetch();
  };

  const handleCompletar = async (tarea) => {
    await base44.entities.Tarea.update(tarea.id, { completada: !tarea.completada });
    refetch();
  };

  const handleEliminar = async (id) => {
    await base44.entities.Tarea.delete(id);
    refetch();
  };

  const tareasFiltradas = useMemo(() => {
    return tareas
      .filter(t => {
        if (filtro === 'pendientes' && t.completada) return false;
        if (filtro === 'completadas' && !t.completada) return false;
        if (filtroCliente === '__general__' && refContacto(t)) return false;
        if (filtroCliente && filtroCliente !== '__general__' && refContacto(t) !== filtroCliente) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.completada !== b.completada) return a.completada ? 1 : -1;
        return new Date(a.fecha_limite) - new Date(b.fecha_limite);
      });
  }, [tareas, filtro, filtroCliente]);

  const pendientes = tareas.filter(t => !t.completada).length;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tareas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendientes > 0 ? `${pendientes} pendiente${pendientes !== 1 ? 's' : ''}` : 'Todo al día'}
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} size="sm" className="gap-1.5 rounded-lg">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nueva tarea'}
        </Button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="bg-card rounded-xl p-5 space-y-3 border border-border/60">
          <h3 className="text-sm font-semibold text-foreground">Nueva tarea</h3>
          <Input
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleCrear()}
            placeholder="Título de la tarea *"
            className="rounded-lg"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Fecha límite *</label>
              <Input type="date" value={form.fecha_limite}
                onChange={e => setForm({ ...form, fecha_limite: e.target.value })}
                className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora (opcional)</label>
              <Input type="time" value={form.hora}
                onChange={e => setForm({ ...form, hora: e.target.value })}
                className="mt-1 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Asignar a</label>
              <select value={form.asignado_a} onChange={e => setForm({ ...form, asignado_a: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Yo mismo</option>
                {users.map(u => <option key={u.id} value={u.email}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Empresa (opcional)</label>
              <select value={form.contacto_id} onChange={e => setForm({ ...form, contacto_id: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">— Tarea general —</option>
                {[...contactos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={handleCrear} disabled={!form.titulo || !form.fecha_limite} className="w-full rounded-lg">
            Crear tarea
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filtro === f.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
        </div>
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
          className="h-8 px-3 text-xs rounded-lg border border-border bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-auto">
          <option value="">Todas las empresas</option>
          <option value="__general__">Solo generales</option>
          {[...contactos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {/* Task list */}
      <div className="bg-card rounded-xl overflow-hidden divide-y divide-border/30">
        {tareasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">Sin tareas en esta vista</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-primary hover:underline">
              Crear la primera tarea
            </button>
          </div>
        ) : (
          tareasFiltradas.map(tarea => {
            const contacto = refContacto(tarea) ? contactos.find(c => c.id === refContacto(tarea)) : null;
            const fechaTarea = new Date(tarea.fecha_limite + 'T12:00:00');
            const vencida = !tarea.completada && fechaTarea < hoy;
            const esHoy = !tarea.completada && fechaTarea.toDateString() === hoy.toDateString();
            const assignee = users.find(u => u.email === tarea.asignado_a);

            return (
              <div key={tarea.id} className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${tarea.completada ? 'opacity-50' : vencida ? 'bg-destructive/5' : esHoy ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                <button onClick={() => handleCompletar(tarea)} className="flex-shrink-0 mt-0.5">
                  {tarea.completada
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <Circle className="w-5 h-5 text-muted-foreground/40 hover:text-primary transition-colors" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${tarea.completada ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                    {tarea.titulo}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`flex items-center gap-1 text-xs ${vencida ? 'text-destructive font-semibold' : esHoy ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                      <Calendar className="w-3 h-3" />
                      {esHoy ? 'Hoy' : fechaTarea.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: fechaTarea.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined })}
                      {tarea.hora && ` · ${tarea.hora}`}
                    </span>
                    {tarea.asignado_a && (
                      <span className="text-xs text-muted-foreground">· {assignee?.full_name || tarea.asignado_a}</span>
                    )}
                    {contacto ? (
                      <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                        <Building2 className="w-2.5 h-2.5" />
                        {contacto.nombre}
                      </span>
                    ) : (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">General</span>
                    )}
                  </div>
                </div>
                {(isAdmin || tarea.created_by === userEmail) && (
                  <button onClick={() => handleEliminar(tarea.id)}
                    className="flex-shrink-0 p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground/40 hover:text-destructive transition-colors mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
