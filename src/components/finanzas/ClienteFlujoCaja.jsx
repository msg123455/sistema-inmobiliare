import React from 'react';
import CompanyLogo from '@/components/crm/CompanyLogo';

export default function ClienteFlujoCaja({ clientesFlujo, costoPromedioValvula }) {
  if (!clientesFlujo?.length) return null;

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground">Desglose por Cliente</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Bruto/mes</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Socios</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Pago Inv.</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Neto/mes</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Contrato</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ingreso Total</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Válvulas/mes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {clientesFlujo.map((c) => (
              <tr key={c.cliente.id}>
                <td className="px-4 py-2.5 text-foreground font-medium flex items-center gap-2">
                  <CompanyLogo cliente={c.cliente} size="sm" />
                  <span className="truncate max-w-[140px]">{c.cliente.nombre_empresa}</span>
                </td>
                <td className="text-right px-4 py-2.5 text-green-600">${c.ingresoBrutoMes.toFixed(0)}</td>
                <td className="text-right px-4 py-2.5 text-purple-500">{c.pagoSociosMes > 0 ? `-$${c.pagoSociosMes.toFixed(0)}` : '—'}</td>
                <td className="text-right px-4 py-2.5 text-red-500">{c.pagoInvMes > 0 ? `-$${c.pagoInvMes.toFixed(0)}` : '—'}</td>
                <td className="text-right px-4 py-2.5 font-semibold text-foreground">${c.netoMes.toFixed(0)}</td>
                <td className="text-right px-4 py-2.5 text-muted-foreground">{c.contratoAnios}a ({c.mesesContrato}m)</td>
                <td className="text-right px-4 py-2.5 font-medium text-primary">${c.ingresoContratoTotal.toFixed(0)}</td>
                <td className="text-right px-4 py-2.5 text-purple-600 font-medium">
                  {costoPromedioValvula > 0 ? (c.netoMes / costoPromedioValvula).toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-4 py-2.5 font-semibold text-foreground">TOTAL</td>
              <td className="text-right px-4 py-2.5 font-semibold text-green-600">${clientesFlujo.reduce((s, c) => s + c.ingresoBrutoMes, 0).toFixed(0)}</td>
              <td className="text-right px-4 py-2.5 font-semibold text-purple-500">{clientesFlujo.reduce((s, c) => s + c.pagoSociosMes, 0) > 0 ? `-$${clientesFlujo.reduce((s, c) => s + c.pagoSociosMes, 0).toFixed(0)}` : '—'}</td>
              <td className="text-right px-4 py-2.5 font-semibold text-red-500">-${clientesFlujo.reduce((s, c) => s + c.pagoInvMes, 0).toFixed(0)}</td>
              <td className="text-right px-4 py-2.5 font-bold text-foreground">${clientesFlujo.reduce((s, c) => s + c.netoMes, 0).toFixed(0)}</td>
              <td className="text-right px-4 py-2.5 text-muted-foreground">—</td>
              <td className="text-right px-4 py-2.5 font-bold text-primary">${clientesFlujo.reduce((s, c) => s + c.ingresoContratoTotal, 0).toFixed(0)}</td>
              <td className="text-right px-4 py-2.5 font-semibold text-purple-600">
                {costoPromedioValvula > 0 ? (clientesFlujo.reduce((s, c) => s + c.netoMes, 0) / costoPromedioValvula).toFixed(2) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}