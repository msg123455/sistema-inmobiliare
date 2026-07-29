import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle, CalendarPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { gcalEventLink } from '@/lib/gcal';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function todayStr() { return new Date().toDateString(); }

export default function Calendario() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-global'],
    queryFn: () => base44.entities.Tarea.list(),
    staleTime: 60_000,
  });
  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => base44.entities.Contacto.list(),
  });

  const contactoMap = useMemo(() => Object.fromEntries(contactos.map(c => [c.id, c])), [contactos]);

  // Tarea todavia guarda el vinculo en cliente_id (herencia del modelo anterior).
  // Se lee contacto_id primero y se cae a cliente_id mientras dura el backfill.
  const refContacto = (t) => t.contacto_id || t.cliente_id;

  const tareasByDay = useMemo(() => {
    const map = {};
    tareas.forEach(t => {
      if (!t.fecha_limite) return;
      const key = t.fecha_limite.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tareas]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const monthTareas = tareas
    .filter(t => { if (!t.fecha_limite) return false; const d = new Date(t.fecha_limite); return d.getMonth() === month && d.getFullYear() === year; })
    .sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite));

  const pendingCount = monthTareas.filter(t => !t.completada).length;
  const overdueCount = monthTareas.filter(t => !t.completada && new Date(t.fecha_limite) < new Date(todayStr())).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Calendario</h1>
          <p className="text-[15px] text-muted-foreground mt-0.5">Actividades y tareas del equipo</p>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdueCount} vencida{overdueCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl overflow-hidden border border-border/40">
        {/* Nav */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{MONTHS[month]} {year}</p>
            {pendingCount > 0 && <p className="text-[10px] text-muted-foreground">{pendingCount} tarea{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}</p>}
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/20 bg-muted/20">
          {DAYS_SHORT.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 border-l border-border/10">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="min-h-[72px] border-r border-b border-border/10 bg-muted/10" />;
            const pad = (n) => String(n).padStart(2, '0');
            const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
            const dayTareas = tareasByDay[dateKey] || [];
            const isToday = new Date(dateKey).toDateString() === todayStr();
            const hasOverdue = dayTareas.some(t => !t.completada && new Date(dateKey) < new Date(todayStr()));

            return (
              <div key={dateKey} className={`min-h-[72px] p-1.5 border-r border-b border-border/10 ${isToday ? 'bg-primary/5' : ''}`}>
                <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-medium mb-1 ${isToday ? 'bg-primary text-primary-foreground' : hasOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayTareas.slice(0, 2).map(t => {
                    const isOv = !t.completada && new Date(dateKey) < new Date(todayStr());
                    const c = contactoMap[refContacto(t)];
                    return (
                      <div
                        key={t.id}
                        onClick={() => refContacto(t) && navigate(`/crm/contactos/${refContacto(t)}`)}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate leading-tight ${
                          t.completada ? 'bg-green-100/60 text-green-700 dark:bg-green-950/30 dark:text-green-400 line-through' :
                          isOv ? 'bg-red-100/60 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                          'bg-primary/10 text-primary'
                        } ${refContacto(t) ? 'cursor-pointer hover:opacity-80' : ''}`}
                        title={`${t.titulo}${c ? ` — ${c.nombre}` : ''}${t.asignado_a ? ` (${t.asignado_a.split('@')[0]})` : ''}`}
                      >
                        {t.titulo}
                      </div>
                    );
                  })}
                  {dayTareas.length > 2 && (
                    <div className="text-[9px] text-muted-foreground/60 pl-1">+{dayTareas.length - 2} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div className="bg-card rounded-xl overflow-hidden border border-border/40">
        <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tareas de {MONTHS[month]}</h2>
          <span className="text-xs text-muted-foreground">{monthTareas.length} tarea{monthTareas.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="divide-y divide-border/20 max-h-96 overflow-y-auto">
          {monthTareas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin tareas este mes</div>
          ) : monthTareas.map(t => {
            const c = contactoMap[refContacto(t)];
            const isOv = !t.completada && new Date(t.fecha_limite) < new Date(todayStr());
            const isToday2 = new Date(t.fecha_limite).toDateString() === todayStr();
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${refContacto(t) ? 'hover:bg-muted/20' : ''}`}
              >
                <button className="flex-shrink-0" onClick={() => refContacto(t) && navigate(`/crm/contactos/${refContacto(t)}`)}>
                  {t.completada
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : isOv
                    ? <AlertTriangle className="w-4 h-4 text-destructive" />
                    : <Clock className="w-4 h-4 text-muted-foreground/40" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => refContacto(t) && navigate(`/crm/contactos/${refContacto(t)}`)}>
                  <p className={`text-sm ${t.completada ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{t.titulo}</p>
                  {c && <p className="text-xs text-muted-foreground truncate">{c.nombre}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.asignado_a && (
                    <span className="text-xs text-muted-foreground hidden sm:block">{t.asignado_a.split('@')[0]}</span>
                  )}
                  <span className={`text-xs font-medium ${isOv ? 'text-destructive' : isToday2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {new Date(t.fecha_limite).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {t.hora && ` · ${t.hora}`}
                    {isOv && ' · Vencida'}
                    {isToday2 && ' · Hoy'}
                  </span>
                  {gcalEventLink({ titulo: t.titulo, fecha_limite: t.fecha_limite, hora: t.hora || '' }) && (
                    <a
                      href={gcalEventLink({ titulo: t.titulo, fecha_limite: t.fecha_limite, hora: t.hora || '', descripcion: c ? `Cliente: ${c.nombre}` : '' })}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      title="Añadir a Google Calendar"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}