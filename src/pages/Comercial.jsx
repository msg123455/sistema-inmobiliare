import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Building2 } from 'lucide-react';
import SimuladorComercialCliente from '@/components/crm/SimuladorComercialCliente';

const MONEDAS = [
  { value: 'USD', label: 'USD — Dólar' },
  { value: 'COP', label: 'COP — Peso Colombiano' },
  { value: 'EUR', label: 'EUR — Euro' },
];

export default function Comercial() {
  const queryClient = useQueryClient();
  const [clienteId, setClienteId] = useState('manual');
  const [manual, setManual] = useState({ nombre_empresa: '', dominio_web: '', costo_agua_mensual: '', moneda: 'USD' });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const clienteSeleccionado = clienteId === 'manual'
    ? { ...manual, costo_agua_mensual: parseFloat(manual.costo_agua_mensual) || 0 }
    : clientes.find(c => c.id === clienteId);

  const handleSelectCliente = (id) => {
    setClienteId(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Simulador Comercial</h1>
        <p className="text-sm text-muted-foreground mt-1">Proyección de ahorro en 3 escenarios · Uso exclusivo ventas</p>
      </div>

      {/* Client selector */}
      <div className="bg-card rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Seleccionar empresa
        </h2>
        <Select value={clienteId} onValueChange={handleSelectCliente}>
          <SelectTrigger className="rounded-lg">
            <SelectValue placeholder="Elegir cliente o ingresar manual" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">— Ingresar datos manualmente —</SelectItem>
            {clientes.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre_empresa} {c.costo_agua_mensual ? `· ${c.moneda} ${c.costo_agua_mensual.toLocaleString()}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {clienteId === 'manual' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs text-muted-foreground">Nombre de la empresa</label>
              <Input
                value={manual.nombre_empresa}
                onChange={e => setManual({ ...manual, nombre_empresa: e.target.value })}
                placeholder="Empresa S.A."
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dominio web (para logo)</label>
              <Input
                value={manual.dominio_web}
                onChange={e => setManual({ ...manual, dominio_web: e.target.value })}
                placeholder="empresa.com"
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Moneda</label>
              <select
                value={manual.moneda}
                onChange={e => setManual({ ...manual, moneda: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Costo de agua mensual ({manual.moneda})</label>
              <Input
                type="number"
                value={manual.costo_agua_mensual}
                onChange={e => setManual({ ...manual, costo_agua_mensual: e.target.value })}
                placeholder="0"
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Simulator */}
      {clienteSeleccionado && (clienteSeleccionado.nombre_empresa || clienteId !== 'manual') && (
        <SimuladorComercialCliente
          cliente={clienteSeleccionado}
          onUpdate={(updated) => queryClient.invalidateQueries({ queryKey: ['clientes'] })}
        />
      )}

      {clienteId === 'manual' && !manual.nombre_empresa && (
        <div className="flex items-center justify-center h-40 bg-card rounded-xl">
          <p className="text-sm text-muted-foreground">Seleccioná un cliente o ingresá los datos manualmente para empezar</p>
        </div>
      )}
    </div>
  );
}
