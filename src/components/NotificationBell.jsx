import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCircle2, Clock, AlertTriangle, HandHelping, X } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function isDueToday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-global'],
    queryFn: () => base44.entities.Tarea.list(),
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  // Las ordenes que nadie ha tocado. Van aparte de las tareas y no mezcladas:
  // la campana ordena por fecha limite y una orden no tiene, porque el plazo
  // vive en la solicitud que la origino. "Nadie la ha abierto" no es una fecha,
  // es un hecho — y pesa mas que una tarea que vence manana.
  const { data: ordenes = [] } = useQuery({
    queryKey: ['asistidos-sin-atender'],
    queryFn: () => base44.entities.OrdenAsistencia.list('-fecha_solicitud', 50),
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  const sinAtender = ordenes.filter(o => !o.fecha_asistencia && o.estado !== 'Cerrada');

  const pending = tareas.filter(t => !t.completada);
  const overdue = pending.filter(t => isOverdue(t.fecha_limite));
  const today = pending.filter(t => isDueToday(t.fecha_limite));
  const upcoming = pending.filter(t => !isOverdue(t.fecha_limite) && !isDueToday(t.fecha_limite));

  const badgeCount = overdue.length + today.length + sinAtender.length;

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const sorted = [
    ...overdue.map(t => ({ ...t, _group: 'overdue' })),
    ...today.map(t => ({ ...t, _group: 'today' })),
    ...upcoming.sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite)).map(t => ({ ...t, _group: 'upcoming' })),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-5 h-5" />
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border/60 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {sinAtender.length > 0 ? 'Pendientes de atender' : 'Tareas pendientes'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {pending.length + sinAtender.length > 0 && (
                <span className="text-xs text-muted-foreground">{pending.length + sinAtender.length} total</span>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted/60">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/20">
            {sinAtender.map((o) => (
              <Link
                key={o.id}
                to="/operacion/asistidos"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 bg-amber-50/60 dark:bg-amber-950/10 hover:bg-amber-100/60 dark:hover:bg-amber-950/20 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <HandHelping className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{o.asunto}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-medium text-amber-600">Sin atender</span>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {o.solicitante_nombre || o.solicitante_telefono || 'sin nombre'}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {sorted.length === 0 && sinAtender.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 text-green-500/60" />
                <p className="text-xs">Sin tareas pendientes</p>
              </div>
            ) : (
              sorted.map((t) => {
                const isOv = t._group === 'overdue';
                const isTo = t._group === 'today';
                return (
                  <div key={t.id} className={`px-4 py-3 ${isOv ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                    <div className="flex items-start gap-2">
                      {isOv ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      ) : isTo ? (
                        <Clock className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{t.titulo}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-medium ${isOv ? 'text-destructive' : isTo ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {isOv ? 'Vencida · ' : isTo ? 'Hoy · ' : ''}{formatDate(t.fecha_limite)}
                          </span>
                          {t.asignado_a && (
                            <>
                              <span className="text-[10px] text-muted-foreground/40">·</span>
                              <span className="text-[10px] text-muted-foreground truncate">{t.asignado_a.split('@')[0]}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {sorted.length > 0 && overdue.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/40 bg-red-50/50 dark:bg-red-950/10">
              <p className="text-[10px] text-destructive font-medium">{overdue.length} tarea{overdue.length > 1 ? 's' : ''} vencida{overdue.length > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
