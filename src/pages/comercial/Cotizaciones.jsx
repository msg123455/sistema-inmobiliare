import React from 'react';
import { FileText } from 'lucide-react';

export default function Cotizaciones() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cotizaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Generación y seguimiento de cotizaciones</p>
      </div>
      <div className="flex flex-col items-center justify-center py-32 bg-card rounded-xl border border-dashed border-border/60">
        <FileText className="w-12 h-12 text-muted-foreground/20 mb-4" />
        <p className="text-base font-semibold text-muted-foreground">Próximamente</p>
        <p className="text-sm text-muted-foreground/60 mt-1">El módulo de cotizaciones está en construcción</p>
      </div>
    </div>
  );
}
