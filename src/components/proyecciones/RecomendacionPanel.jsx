import React from 'react';
import { Lightbulb, Target, AlertTriangle } from 'lucide-react';

export default function RecomendacionPanel({ escenarios, config }) {
  if (!escenarios.length) return null;

  const viables = escenarios.filter(e => e.meses_roi_inversionista <= 12);
  const best = viables.length > 0
    ? viables.reduce((a, b) => a.score > b.score ? a : b)
    : null;

  const maxMultiplicador = escenarios.reduce((a, b) => a.valvulas_extra > b.valvulas_extra ? a : b);
  const masAtractivo = escenarios.reduce((a, b) => a.meses_roi_inversionista < b.meses_roi_inversionista ? a : b);

  // Cálculo exacto: precio para duplicar inversión en 24 meses
  // Inversionista gana: ganancia_mes * 24 = precio * 2
  // ganancia_mes = costo_agua * (pct_ahorro/100) * 0.5 * (pct_inv/100)
  // precio * 2 = ganancia_mes * 24
  // precio = (ganancia_mes * 24) / 2
  const ganancia_mes_por_dolar = (config.costo_agua_cliente * (config.pct_ahorro / 100) * 0.5 * (config.pct_inversionista / 100));
  const precio_duplicar = ganancia_mes_por_dolar > 0 ? (ganancia_mes_por_dolar * 24) / 2 : 0;
  const sobreprecio_duplicar = precio_duplicar - config.costo_real;
  const valvulas_extra_duplicar = sobreprecio_duplicar > 0 ? Math.floor(sobreprecio_duplicar / config.costo_real) : 0;
  const roi_duplicar = ganancia_mes_por_dolar > 0 ? precio_duplicar / ganancia_mes_por_dolar : 0;
  const ganancia_total_inv = ganancia_mes_por_dolar * 24;
  const retorno_pct = precio_duplicar > 0 ? ((ganancia_total_inv / precio_duplicar) * 100).toFixed(0) : 0;

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-yellow-500" />
        <h2 className="text-sm font-semibold text-foreground">Análisis y Recomendación</h2>
      </div>

      <div className="space-y-3 text-sm">
        {/* Precio exacto para duplicar inversión */}
        <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-purple-600" />
            <p className="font-semibold text-purple-700 dark:text-purple-300">Precio de VENTA al inversionista para que duplique su inversión en 24 meses</p>
          </div>
          {precio_duplicar > 0 ? (
            precio_duplicar < config.costo_real ? (
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />No es viable duplicar la inversión en 24 meses</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  Con estos parámetros, el inversionista solo ganaría <strong>${ganancia_total_inv.toFixed(2)}</strong> en 24 meses 
                  (recibe ${ganancia_mes_por_dolar.toFixed(2)}/mes). Para duplicar su dinero necesitaría que la válvula costara 
                  solo <strong>${precio_duplicar.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>, pero el costo real 
                  es <strong>${config.costo_real.toLocaleString()}</strong>.
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-start gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />Para que funcione, necesitas clientes con mayor costo de agua mensual, mayor % de ahorro, o mayor % para el inversionista.
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-red-400">Ganancia inv./mes</p>
                    <p className="font-semibold text-red-700 dark:text-red-300">${ganancia_mes_por_dolar.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-red-400">Ganancia total 24m</p>
                    <p className="font-semibold text-red-700 dark:text-red-300">${ganancia_total_inv.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-red-400">Meses para recuperar costo real</p>
                    <p className="font-semibold text-red-700 dark:text-red-300">{ganancia_mes_por_dolar > 0 ? (config.costo_real / ganancia_mes_por_dolar).toFixed(1) : '∞'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">${precio_duplicar.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className="text-xs text-purple-600 dark:text-purple-400">USD — precio de venta por válvula (costo real: ${config.costo_real})</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-purple-500">Sobreprecio</p>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">${sobreprecio_duplicar.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-purple-500">Inversionista recibe/mes</p>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">${ganancia_mes_por_dolar.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-purple-500">ROI (recupera inversión)</p>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">{roi_duplicar.toFixed(1)} meses</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                    <p className="text-purple-500">Ganancia total 24m</p>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">${ganancia_total_inv.toFixed(2)} ({retorno_pct}%)</p>
                  </div>
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 pt-1">
                  <p>Le vendes la válvula al inversionista a <strong>${precio_duplicar.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> (tú la compras a ${config.costo_real}). Él invierte eso → recibe ${ganancia_total_inv.toFixed(2)} en 24 meses = <strong>duplica su dinero</strong>.</p>
                  <p>Válvulas extra con sobreprecio: <strong>{valvulas_extra_duplicar}</strong> unidades adicionales para la empresa.</p>
                </div>
              </div>
            )
          ) : (
            <p className="text-xs text-purple-500">No se puede calcular. Verifica que los parámetros estén configurados.</p>
          )}
        </div>

        {best ? (
          <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
            <p className="font-medium text-green-700 dark:text-green-300 mb-1">Mejor opción de los escenarios: ${best.precio_inversionista.toLocaleString()}</p>
            <p className="text-xs text-green-600 dark:text-green-400">
              ROI para inversionista en {best.meses_roi_inversionista.toFixed(1)} meses (≤12). 
              Empresa gana ${best.empresa_neto_mes.toFixed(2)}/mes neto + {best.valvulas_extra} válvulas extra con el sobreprecio.
              Puntaje: {best.score.toFixed(0)}/100.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4">
            <p className="font-medium text-red-700 dark:text-red-300 mb-1">Ningún escenario cumple ROI ≤ 12 meses</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Intenta reducir los precios o aumentar el costo de agua del cliente / % de ahorro.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Más atractivo para inversionista</p>
            <p className="font-medium text-foreground">${masAtractivo.precio_inversionista.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">ROI en {masAtractivo.meses_roi_inversionista.toFixed(1)} meses — gana ${masAtractivo.ganancia_inversionista_24m.toFixed(0)} en 24m</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Máximo multiplicador</p>
            <p className="font-medium text-foreground">${maxMultiplicador.precio_inversionista.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{maxMultiplicador.valvulas_extra} válvulas extra — +${maxMultiplicador.ingreso_extra_mes.toFixed(2)}/mes adicional</p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t border-border/40">
          <p className="font-medium text-foreground mb-1">¿Cómo se calcula el puntaje?</p>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>ROI ≤ 12 meses (obligatorio para ser viable)</li>
            <li>Más válvulas extra con el sobreprecio = más puntos</li>
            <li>Mayor ganancia neta empresa = más puntos</li>
            <li>ROI más rápido para el inversionista = más atractivo</li>
          </ul>
        </div>
      </div>
    </div>
  );
}