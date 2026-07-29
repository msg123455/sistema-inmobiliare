import React from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, MapPin, Clock, Video } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function AlertasCalendario() {
  const { data: alertas = [], isLoading, refetch } = useQuery({
    queryKey: ['alertas-calendario'],
    queryFn: () => base44.entities.AlertaCalendario.list(),
    refetchInterval: 30000,
  });

  const alertasActivas = alertas.filter(a => !a.leido);
  const proximaAlerta = alertasActivas.sort((a, b) =>
    new Date(a.fecha_inicio) - new Date(b.fecha_inicio)
  )[0];

  const handleMarcarLeida = async (id) => {
    await base44.entities.AlertaCalendario.update(id, { leido: true });
    refetch();
  };

  const formatearFecha = (fecha) => {
    return new Date(fecha).toLocaleDateString('es-ES', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) return null;

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Eventos de Servicio</h2>
        {alertasActivas.length > 0 && (
          <span className="ml-auto bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
            {alertasActivas.length}
          </span>
        )}
      </div>

      {proximaAlerta ? (
        <div>
          <div className="bg-muted/40 rounded-lg p-4">
            <p className="font-medium text-sm text-foreground mb-2">{proximaAlerta.titulo}</p>
            <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatearFecha(proximaAlerta.fecha_inicio)}</span>
              </div>
              {proximaAlerta.ubicacion && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{proximaAlerta.ubicacion}</span>
                </div>
              )}
              {proximaAlerta.enlace_meet && (
                <div className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-primary" />
                  <a href={proximaAlerta.enlace_meet} target="_blank" rel="noopener noreferrer" className="text-primary">
                    Unirse a Meet
                  </a>
                </div>
              )}
            </div>
            {proximaAlerta.descripcion && (
              <p className="text-xs text-muted-foreground mb-3">{proximaAlerta.descripcion}</p>
            )}
            <button
              onClick={() => handleMarcarLeida(proximaAlerta.id)}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Marcar como leída
            </button>
          </div>
          {alertasActivas.length > 1 && (
            <p className="text-xs text-muted-foreground mt-2">+{alertasActivas.length - 1} evento(s) más</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No hay eventos programados</p>
      )}
    </div>
  );
}