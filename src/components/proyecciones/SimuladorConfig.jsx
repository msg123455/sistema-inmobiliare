import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator } from 'lucide-react';

export default function SimuladorConfig({ config, setConfig, valvulas, onSimular }) {
  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Parámetros de Simulación</h2>
      </div>

      <div className="space-y-4">
        {/* Válvula base */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Válvula base</label>
          <Select value={config.valvula_id} onValueChange={(val) => {
            const v = valvulas.find(x => x.id === val);
            setConfig({ ...config, valvula_id: val, costo_real: v?.costo_compra || 0 });
          }}>
            <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar válvula" /></SelectTrigger>
            <SelectContent>
              {valvulas.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.nombre} ({v.pulgadas}") — ${v.costo_compra}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Costo real (USD)</label>
            <Input type="number" value={config.costo_real} onChange={(e) => setConfig({ ...config, costo_real: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Costo agua/mes del cliente (USD)</label>
            <Input type="number" value={config.costo_agua_cliente} onChange={(e) => setConfig({ ...config, costo_agua_cliente: parseFloat(e.target.value) || 0 })} placeholder="500" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">% ahorro agua</label>
            <Input type="number" value={config.pct_ahorro} onChange={(e) => setConfig({ ...config, pct_ahorro: parseFloat(e.target.value) || 0 })} placeholder="15" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">% inversionista (del 50% empresa)</label>
            <Input type="number" value={config.pct_inversionista} onChange={(e) => setConfig({ ...config, pct_inversionista: parseFloat(e.target.value) || 0 })} placeholder="60" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contrato (años)</label>
            <Input type="number" value={config.contrato_anios} onChange={(e) => setConfig({ ...config, contrato_anios: parseFloat(e.target.value) || 0 })} placeholder="3" className="mt-1 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio mínimo al inversionista (USD)</label>
            <Input type="number" value={config.precio_min} onChange={(e) => setConfig({ ...config, precio_min: parseFloat(e.target.value) || 0 })} placeholder="1500" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio máximo al inversionista (USD)</label>
            <Input type="number" value={config.precio_max} onChange={(e) => setConfig({ ...config, precio_max: parseFloat(e.target.value) || 0 })} placeholder="5000" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Incremento entre escenarios (USD)</label>
            <Input type="number" value={config.incremento} onChange={(e) => setConfig({ ...config, incremento: parseFloat(e.target.value) || 0 })} placeholder="500" className="mt-1 rounded-lg" />
          </div>
        </div>

        <Button onClick={onSimular} className="w-full rounded-lg">
          <Calculator className="w-4 h-4 mr-2" /> Simular Escenarios
        </Button>
      </div>
    </div>
  );
}