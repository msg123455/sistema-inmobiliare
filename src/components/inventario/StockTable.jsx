import React from 'react';
import { useUserRole } from '@/hooks/useUserRole';

export default function StockTable({ valvulas, stockMap, availableMap = {}, instaladoMap = {}, enTransitoMap = {} }) {
  const { isAdmin } = useUserRole();
  const hayTransito = Object.values(enTransitoMap).some(q => q > 0);

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40">
        <h2 className="text-sm font-semibold text-foreground">Stock por Válvula</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Válvula</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pulgadas</th>
              {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo Unit.</th>}
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Disponible</th>
              {hayTransito && <th className="text-left px-4 py-3 text-xs font-medium text-amber-500 uppercase tracking-wide">En tránsito</th>}
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Instalado</th>
              {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor disp.</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {valvulas.map((v) => {
              const disponible = availableMap[v.id] ?? (stockMap[v.id] || 0);
              const instalado = instaladoMap[v.id] || 0;
              const enTransito = enTransitoMap[v.id] || 0;
              return (
                <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{v.nombre}</td>
                  <td className="px-4 py-3 text-foreground">{v.pulgadas}"</td>
                  {isAdmin && <td className="px-4 py-3 text-foreground">${v.costo_compra}</td>}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      disponible > 0 ? 'bg-blue-500/10 text-blue-600' : 'bg-destructive/10 text-destructive'
                    }`}>
                      {disponible}
                    </span>
                  </td>
                  {hayTransito && (
                    <td className="px-4 py-3">
                      {enTransito > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                          +{enTransito}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {instalado > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
                        {instalado}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {isAdmin && <td className="px-4 py-3 font-medium text-foreground">${(disponible * v.costo_compra).toLocaleString()}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}