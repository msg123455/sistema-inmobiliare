import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import StockSummary from '@/components/inventario/StockSummary';
import StockTable from '@/components/inventario/StockTable';
import MovimientoForm from '@/components/inventario/MovimientoForm';
import MovimientosHistory from '@/components/inventario/MovimientosHistory';
import CompanyLogo from '@/components/crm/CompanyLogo';

export default function Inventario() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: valvulas = [], isLoading: l1 } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const { data: movimientos = [], isLoading: l2 } = useQuery({
    queryKey: ['movimientos'],
    queryFn: () => base44.entities.MovimientoInventario.list('-created_date'),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
    refetchOnMount: 'always',
  });

  const { data: ordenesCompra = [] } = useQuery({
    queryKey: ['ordenes-compra'],
    queryFn: () => base44.entities.OrdenCompra.list(),
    refetchOnMount: 'always',
  });

  const stockMap = useMemo(() => {
    const map = {};
    movimientos.forEach((m) => {
      if (!map[m.valvula_id]) map[m.valvula_id] = 0;
      if (m.tipo === 'entrada') map[m.valvula_id] += m.cantidad;
      else if (m.tipo === 'salida') map[m.valvula_id] -= m.cantidad;
      else map[m.valvula_id] += m.cantidad;
    });
    return map;
  }, [movimientos]);

  // Válvulas en clientes Activos → salen del stock disponible
  const clientesActivos = useMemo(
    () => clientes.filter(c => c.etapa_pipeline === 'Activo' && Object.keys(c.valvulas_cantidades || {}).length > 0),
    [clientes]
  );

  const instaladoMap = useMemo(() => {
    const map = {};
    clientesActivos.forEach(c => {
      Object.entries(c.valvulas_cantidades || {}).forEach(([vid, qty]) => {
        map[vid] = (map[vid] || 0) + qty;
      });
    });
    return map;
  }, [clientesActivos]);

  const availableMap = useMemo(() => {
    const map = {};
    valvulas.forEach(v => {
      map[v.id] = Math.max(0, (stockMap[v.id] || 0) - (instaladoMap[v.id] || 0));
    });
    return map;
  }, [stockMap, instaladoMap, valvulas]);

  // Units in transit from pending purchase orders
  const enTransitoMap = useMemo(() => {
    const map = {};
    ordenesCompra.filter(o => o.estado === 'pendiente').forEach(o => {
      (o.items || []).forEach(item => {
        map[item.valvula_id] = (map[item.valvula_id] || 0) + (item.cantidad || 0);
      });
    });
    return map;
  }, [ordenesCompra]);

  const handleSave = async (data) => {
    await base44.entities.MovimientoInventario.create(data);
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['movimientos'] });
  };

  if (l1 || l2) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Control de stock de válvulas</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm" className="gap-1.5 rounded-lg">
          <Plus className="w-4 h-4" /> Movimiento
        </Button>
      </div>

      <StockSummary valvulas={valvulas} stockMap={stockMap} instaladoMap={instaladoMap} availableMap={availableMap} enTransitoMap={enTransitoMap} />

      {showForm && (
        <MovimientoForm
          valvulas={valvulas}
          clientes={clientes}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      <StockTable valvulas={valvulas} stockMap={stockMap} availableMap={availableMap} instaladoMap={instaladoMap} enTransitoMap={enTransitoMap} />

      {/* Inventario instalado en clientes activos */}
      {clientesActivos.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <h2 className="text-sm font-semibold text-foreground">Inventario Instalado</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Válvulas en campo con clientes activos — no cuentan en el stock disponible</p>
          </div>
          <div className="divide-y divide-border/20">
            {clientesActivos.map(c => {
              const totalUnidades = Object.values(c.valvulas_cantidades || {}).reduce((s, q) => s + q, 0);
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                  <CompanyLogo cliente={c} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.nombre_empresa}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {Object.entries(c.valvulas_cantidades || {}).map(([vid, qty]) => {
                        const v = valvulas.find(x => x.id === vid);
                        if (!v || qty <= 0) return null;
                        return (
                          <span key={vid} className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 rounded-full font-medium">
                            {qty}× {v.nombre} ({v.pulgadas}")
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0">{totalUnidades} ud{totalUnidades !== 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <MovimientosHistory movimientos={movimientos} valvulas={valvulas} clientes={clientes} />
    </div>
  );
}