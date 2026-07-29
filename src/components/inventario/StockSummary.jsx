import React from 'react';
import { Package, CheckCircle2, ArrowDown, Warehouse, Truck } from 'lucide-react';

export default function StockSummary({ valvulas, stockMap, instaladoMap = {}, availableMap = {}, enTransitoMap = {} }) {
  const totalStock = Object.values(stockMap).reduce((s, q) => s + Math.max(0, q), 0);
  const totalInstalado = Object.values(instaladoMap).reduce((s, q) => s + q, 0);
  const totalDisponible = Object.values(availableMap).reduce((s, q) => s + q, 0);
  const totalEnTransito = Object.values(enTransitoMap).reduce((s, q) => s + q, 0);
  const sinStock = valvulas.filter(v => (availableMap[v.id] ?? stockMap[v.id] ?? 0) <= 0).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Warehouse className="w-4 h-4 text-primary" />
          <p className="text-xs text-muted-foreground">Stock total</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{totalStock}</p>
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-blue-500" />
          <p className="text-xs text-muted-foreground">Disponible</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-blue-600">{totalDisponible}</p>
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <p className="text-xs text-muted-foreground">Instalado</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-green-600">{totalInstalado}</p>
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck className="w-4 h-4 text-amber-500" />
          <p className="text-xs text-muted-foreground">En tránsito</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-amber-600">{totalEnTransito}</p>
        {totalEnTransito > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Proyectado: {totalDisponible + totalEnTransito}</p>
        )}
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <ArrowDown className="w-4 h-4 text-destructive" />
          <p className="text-xs text-muted-foreground">Sin disponible</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{sinStock}</p>
      </div>
    </div>
  );
}