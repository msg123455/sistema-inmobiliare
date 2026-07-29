import React from 'react';
import { Download } from 'lucide-react';

function exportCSV(flujoPorMes) {
  const headers = ['Mes', 'Ingreso Bruto', 'Socios', 'Inversionistas', 'Neto Operativo', 'Gastos Fijos', 'Impuestos', 'Flujo Neto', 'Acumulado', 'Válvulas Comprables'];
  const rows = flujoPorMes.map(m => [
    m.label,
    m.ingreso_clientes.toFixed(0),
    m.pago_socios_ff > 0 ? (-m.pago_socios_ff).toFixed(0) : '0',
    m.pago_inversionistas > 0 ? (-m.pago_inversionistas).toFixed(0) : '0',
    m.neto_operativo.toFixed(0),
    (-m.gastos_fijos).toFixed(0),
    (-m.impuestos).toFixed(0),
    m.flujo_neto.toFixed(0),
    m.acumulado.toFixed(0),
    m.valvulas_comprables,
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flujo-caja-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FlujoCajaTable({ flujoPorMes }) {
  if (!flujoPorMes?.length) {
    return <p className="text-sm text-muted-foreground py-4">Configura clientes y gastos para ver el flujo.</p>;
  }

  return (
    <div>
      <div className="flex justify-end px-5 py-2 border-b border-border/40">
        <button
          onClick={() => exportCSV(flujoPorMes)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-card">Mes</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ingreso Bruto</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Socios</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Inversionistas</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Neto Operativo</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Gastos Fijos</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Impuestos</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Flujo Neto</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Acumulado</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Válvulas Comprables</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {flujoPorMes.map((m, i) => (
              <tr key={i} className={m.flujo_neto < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                <td className="px-3 py-2 font-medium text-foreground sticky left-0 bg-card">{m.label}</td>
                <td className="text-right px-3 py-2 text-green-600">${m.ingreso_clientes.toFixed(0)}</td>
                <td className="text-right px-3 py-2 text-purple-500">{m.pago_socios_ff > 0 ? `-$${m.pago_socios_ff.toFixed(0)}` : '—'}</td>
                <td className="text-right px-3 py-2 text-red-500">{m.pago_inversionistas > 0 ? `-$${m.pago_inversionistas.toFixed(0)}` : '—'}</td>
                <td className="text-right px-3 py-2 text-foreground font-medium">${m.neto_operativo.toFixed(0)}</td>
                <td className="text-right px-3 py-2 text-red-500">-${m.gastos_fijos.toFixed(0)}</td>
                <td className="text-right px-3 py-2 text-red-400">-${m.impuestos.toFixed(0)}</td>
                <td className={`text-right px-3 py-2 font-semibold ${m.flujo_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {m.flujo_neto >= 0 ? '' : '-'}${Math.abs(m.flujo_neto).toFixed(0)}
                </td>
                <td className={`text-right px-3 py-2 font-semibold ${m.acumulado >= 0 ? 'text-primary' : 'text-red-600'}`}>
                  {m.acumulado >= 0 ? '' : '-'}${Math.abs(m.acumulado).toFixed(0)}
                </td>
                <td className="text-right px-3 py-2 text-purple-600 font-medium">{m.valvulas_comprables}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
