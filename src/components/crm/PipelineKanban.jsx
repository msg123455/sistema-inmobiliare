import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { useUserRole } from '@/hooks/useUserRole';

const ETAPAS = [
  { key: 'Prospecto',          label: 'Prospecto',                color: 'bg-slate-400' },
  { key: 'Lead',               label: 'Lead',                     color: 'bg-blue-500' },
  { key: 'Evaluacion_tecnica', label: 'Hacer Evaluación Técnica', color: 'bg-amber-500' },
  { key: 'Instalacion',        label: 'Pendiente Instalación',    color: 'bg-primary' },
  { key: 'Activo',             label: 'Activo',                   color: 'bg-green-500' },
];

function ClienteCard({ cliente, index, onDeleted }) {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${cliente.nombre_empresa}"?`)) return;
    await base44.entities.Cliente.delete(cliente.id);
    onDeleted(cliente.id);
  };

  return (
    <Draggable draggableId={cliente.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          onClick={() => !snapshot.isDragging && navigate(`/crm/cliente/${cliente.id}`)}
          className={`p-3 rounded-xl transition-all cursor-pointer group ${
            snapshot.isDragging
              ? 'shadow-lg bg-card ring-1 ring-primary/30'
              : 'bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              {...provided.dragHandleProps}
              className="mt-0.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <CompanyLogo cliente={cliente} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{cliente.nombre_empresa}</p>
              <p className="text-xs text-muted-foreground truncate">{cliente.contacto_nombre}</p>
            </div>
            {isAdmin && (
              <button
                onClick={handleDelete}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive text-muted-foreground/50 rounded-md transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export default function PipelineKanban({ clientes, onMoveCliente, onDeleteCliente }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const nuevaEtapa = destination.droppableId;
    const cliente = clientes.find(c => c.id === draggableId);
    if (cliente && cliente.etapa_pipeline !== nuevaEtapa) {
      onMoveCliente(cliente, nuevaEtapa);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {ETAPAS.map(({ key, label, color }) => {
          const clientesEnEtapa = clientes.filter(c => c.etapa_pipeline === key);
          return (
            <div key={key} className="flex flex-col bg-muted/30 rounded-xl overflow-hidden flex-shrink-0 w-56">
              {/* Header */}
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <h3 className="font-medium text-xs text-foreground uppercase tracking-wide">{label}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{clientesEnEtapa.length}</span>
                </div>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 px-2 pb-2 space-y-1.5 min-h-[100px] transition-colors ${
                      snapshot.isDraggingOver ? 'bg-primary/5' : ''
                    }`}
                  >
                    {clientesEnEtapa.map((cliente, index) => (
                      <ClienteCard
                        key={cliente.id}
                        cliente={cliente}
                        index={index}
                        onDeleted={onDeleteCliente}
                      />
                    ))}
                    {provided.placeholder}
                    {clientesEnEtapa.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-muted-foreground/40 text-center py-6">
                        Arrastra aquí
                      </p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}