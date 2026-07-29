import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Clock, AlertCircle, X } from 'lucide-react';
import CompanyLogo from './CompanyLogo';

const PRIORIDAD_COLORS = {
  Alta:  'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  Media: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  Baja:  'bg-muted text-muted-foreground',
};

function isOverdue(fecha) {
  return fecha && new Date(fecha) < new Date(new Date().toDateString());
}

function formatDate(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha + 'T00:00:00');
  const today = new Date(new Date().toDateString());
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff < 0) return `Hace ${Math.abs(diff)} días`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export default function TareasPendientesCRM({ filtroClienteId: filtroExterno = null, onClearFiltro, soloAsignadas = false, userEmail = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filtroInterno, setFiltroInterno] = useState(null);
  const filtroClienteId = filtroExterno ?? filtroInterno;
  const setFiltroClienteId = filtroExterno !== null ? () => {} : setFiltroInterno;

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-todas'],
    queryFn: () => base44.entities.Tarea.list(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]));

  const pendientes = tareas
    .filter(t => !t.completada)
    .sort((a, b) => {
      if (!a.fecha_limite) return 1;
      if (!b.fecha_limite) return -1;
      return new Date(a.fecha_limite) - new Date(b.fecha_limite);
    });

  const filtradas = (() => {
    let base = filtroClienteId ? pendientes.filter(t => t.cliente_id === filtroClienteId) : pendientes;
    if (soloAsignadas && userEmail) base = base.filter(t => t.asignado_a === userEmail);
    return base;
  })();

  const handleCompletar = async (e, tarea) => {
    e.stopPropagation();
    await base44.entities.Tarea.update(tarea.id, { completada: true });
    queryClient.invalidateQueries({ queryKey: ['tareas-todas'] });
    queryClient.invalidateQueries({ queryKey: ['tareas', tarea.cliente_id] });
  };

  const handleClickEmpresa = (e, clienteId) => {
    e.stopPropagation();
    setFiltroClienteId(id => id === clienteId ? null : clienteId);
  };

  if (pendientes.length === 0) return null;

  const clienteFiltro = filtroClienteId ? clienteMap[filtroClienteId] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Tareas pendientes</h2>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {filtradas.length}{filtroClienteId ? ` de ${pendientes.length}` : ''}
        </span>
        {clienteFiltro && (
          <button
            onClick={() => setFiltroClienteId(null)}
            className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full hover:bg-primary/20 transition-colors"
          >
            {clienteFiltro.nombre_empresa}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="bg-muted/20 rounded-xl overflow-hidden divide-y divide-border/30">
        {filtradas.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            Sin tareas pendientes para esta empresa
          </p>
        )}
        {filtradas.map(tarea => {
          const cliente = clienteMap[tarea.cliente_id];
          const overdue = isOverdue(tarea.fecha_limite);
          return (
            <div
              key={tarea.id}
              onClick={() => cliente && navigate(`/cliente/${tarea.cliente_id}?tab=tareas`)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              {/* Complete button */}
              <button
                onClick={e => handleCompletar(e, tarea)}
                className="w-5 h-5 rounded-full border-2 border-border hover:border-primary hover:bg-primary/10 flex-shrink-0 transition-colors"
                title="Marcar completada"
              />

              {/* Company logo — clickable to filter */}
              {cliente && (
                <button
                  onClick={e => handleClickEmpresa(e, tarea.cliente_id)}
                  className="flex-shrink-0 hover:scale-110 transition-transform"
                  title={`Filtrar por ${cliente.nombre_empresa}`}
                >
                  <CompanyLogo cliente={cliente} size="sm" />
                </button>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{tarea.titulo}</p>
                {cliente && (
                  <p className="text-xs text-muted-foreground truncate">{cliente.nombre_empresa}</p>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {tarea.prioridad && tarea.prioridad !== 'Media' && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORIDAD_COLORS[tarea.prioridad]}`}>
                    {tarea.prioridad}
                  </span>
                )}
                {tarea.fecha_limite && (
                  <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {overdue && <AlertCircle className="w-3 h-3" />}
                    {formatDate(tarea.fecha_limite)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
