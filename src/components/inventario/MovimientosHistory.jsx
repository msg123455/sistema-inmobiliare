import React from 'react';
import { ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';

const iconMap = {
  entrada: <ArrowUpCircle className="w-4 h-4 text-green-500" />,
  salida: <ArrowDownCircle className="w-4 h-4 text-destructive" />,
  ajuste: <RefreshCw className="w-4 h-4 text-primary" />,
};

export default function MovimientosHistory({ movimientos, valvulas, clientes }) {
  const getName = (id, list, field) => list.find(x => x.id === id)?.[field] || '—';

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40">
        <h2 className="text-sm font-semibold text-foreground">Últimos Movimientos</h2>
      </div>
      {movimientos.length === 0 ? (
        <p className="text-sm text-muted-foreground p-5">No hay movimientos registrados</p>
      ) : (
        <div className="divide-y divide-border/30">
          {movimientos.slice(0, 20).map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              {iconMap[m.tipo]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '−' : '±'}{m.cantidad} × {getName(m.valvula_id, valvulas, 'nombre')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.motivo || m.tipo}
                  {m.cliente_id ? ` · ${getName(m.cliente_id, clientes, 'nombre_empresa')}` : ''}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.created_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}