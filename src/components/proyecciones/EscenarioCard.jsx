import React from 'react';
import { TrendingUp, Award, AlertTriangle, FileText } from 'lucide-react';

export default function EscenarioCard({ escenario, isBest }) {
  const roiOk = escenario.meses_roi_inversionista <= 12;

  return (
    <div className={`bg-card rounded-xl p-4 border-2 transition-all ${isBest ? 'border-primary shadow-lg' : 'border-transparent'}`}>
      {isBest && (
        <div className="flex items-center gap-1.5 mb-2">
          <Award className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Mejor Opción</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Precio: ${escenario.precio_inversionista.toLocaleString()}
        </h3>
        <span className="text-xs text-muted-foreground">
          +${escenario.sobreprecio.toLocaleString()} sobre costo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/40 rounded-lg p-2.5">
          <p className="text-muted-foreground">Ahorro cliente/mes</p>
          <p className="text-sm font-semibold text-foreground">${escenario.ahorro_cliente_mes.toFixed(2)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5">
          <p className="text-muted-foreground">50% empresa/mes</p>
          <p className="text-sm font-semibold text-foreground">${escenario.parte_empresa_mes.toFixed(2)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5">
          <p className="text-muted-foreground">Inversionista/mes</p>
          <p className="text-sm font-semibold text-primary">${escenario.ganancia_inversionista_mes.toFixed(2)}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${roiOk ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground">ROI inversionista</p>
            {!roiOk && <AlertTriangle className="w-3 h-3 text-destructive" />}
          </div>
          <p className={`text-sm font-semibold ${roiOk ? 'text-green-600' : 'text-destructive'}`}>
            {escenario.meses_roi_inversionista.toFixed(1)} meses
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Ganancia inv. 24 meses</span>
          <span className="font-semibold text-foreground">${escenario.ganancia_inversionista_24m.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Empresa neto/mes (durante inv.)</span>
          <span className="font-semibold text-primary">${escenario.empresa_neto_mes.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Empresa neto 24 meses</span>
          <span className="font-semibold text-primary">${escenario.empresa_neto_24m.toFixed(0)}</span>
        </div>
      </div>

      {/* Contrato */}
      {escenario.meses_contrato > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-medium text-foreground">Contrato ({escenario.meses_contrato / 12} años = {escenario.meses_contrato} meses)</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meses pagando inversionista</span>
              <span className="font-medium text-foreground">{escenario.meses_pago_inv}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meses libres (sin pagar inv.)</span>
              <span className="font-medium text-green-600">{escenario.meses_libres}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingreso post-inversionista</span>
              <span className="font-medium text-green-600">${escenario.ingreso_empresa_post_inv.toFixed(0)}</span>
            </div>
            <div className="flex justify-between bg-green-50 dark:bg-green-950/20 rounded-md px-2 py-1.5">
              <span className="font-medium text-green-700 dark:text-green-300">Utilidad neta contrato</span>
              <span className="font-bold text-green-700 dark:text-green-300">${escenario.utilidad_contrato.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/40">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Efecto Multiplicador</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-primary/5 rounded-lg p-2">
            <p className="text-muted-foreground">Válvulas extra con sobreprecio</p>
            <p className="text-sm font-semibold text-primary">{escenario.valvulas_extra}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-2">
            <p className="text-muted-foreground">Ingreso adicional/mes</p>
            <p className="text-sm font-semibold text-primary">${escenario.ingreso_extra_mes.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}