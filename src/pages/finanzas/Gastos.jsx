import React from 'react';
import GastosManager from '@/components/finanzas/GastosManager';

export default function Gastos() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Gastos</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">Gastos fijos y variables del negocio</p>
      </div>
      <GastosManager />
    </div>
  );
}