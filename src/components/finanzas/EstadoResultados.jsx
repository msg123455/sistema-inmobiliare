import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const ROWS = [
  { label: 'Ingresos Brutos', key: 'ingreso_clientes', color: 'text-green-600', bold: true },
  { label: '− Comisiones Socios', key: 'pago_socios_ff', color: 'text-purple-500', negative: true },
  { label: '− Pago Inversionistas', key: 'pago_inversionistas', color: 'text-red-500', negative: true },
  { label: 'Ingreso Neto Operativo', key: 'neto_operativo', color: 'text-foreground', bold: true, separator: true },
  { label: '− Gastos Fijos', key: 'gastos_fijos', color: 'text-red-500', negative: true },
  { label: 'EBITDA', computed: (m) => m.neto_operativo - m.gastos_fijos, color: 'text-blue-600', bold: true, separator: true },
  { label: '− Impuestos', key: 'impuestos', color: 'text-red-400', negative: true },
  { label: 'Utilidad Neta', key: 'flujo_neto', color: '', bold: true, separator: true, dynamic: true },
];

function getValue(row, mes) {
  if (row.computed) return row.computed(mes);
  return mes[row.key] || 0;
}

function fmt(v, negative) {
  if (Math.abs(v) < 0.5) return '—';
  const abs = `$${Math.round(Math.abs(v)).toLocaleString()}`;
  return negative && v > 0 ? `-${abs}` : abs;
}

export default function EstadoResultados({ flujoPorMes }) {
  const [periodo, setPeriodo] = useState(12);

  if (!flujoPorMes?.length) return null;

  const datos = flujoPorMes.slice(0, periodo);
  const displayMeses = datos.slice(0, 12); // tabla muestra max 12 cols

  const getTotal = (row) => datos.reduce((s, m) => s + getValue(row, m), 0);

  const chartData = datos.map((m) => ({
    label: m.label,
    'Ingresos': Math.round(m.ingreso_clientes),
    'Egresos': Math.round(m.pago_socios_ff + m.pago_inversionistas + m.gastos_fijos + m.impuestos),
    'Utilidad': Math.round(m.flujo_neto),
  }));

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Estado de Resultados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Proyección basada en contratos activos</p>
        </div>
        <div className="flex gap-1">
          {[12, 24, 36].map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                periodo === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {p}m
            </button>
          ))}
        </div>
      </div>

      {/* Gráfica */}
      <div className="bg-card rounded-xl p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={Math.max(0, Math.floor(periodo / 8) - 1)} />
            <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={(v) => `$${Math.round(v).toLocaleString()}`} />
            <Bar dataKey="Ingresos" fill="hsl(var(--chart-3))" opacity={0.75} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Egresos" fill="hsl(var(--destructive))" opacity={0.55} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Utilidad" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry['Utilidad'] >= 0 ? 'hsl(var(--primary))' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla P&L */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground sticky left-0 bg-muted/30 min-w-[180px]">Concepto</th>
                {displayMeses.map((m) => (
                  <th key={m.mes} className="text-right px-3 py-3 font-semibold text-muted-foreground min-w-[72px]">{m.label}</th>
                ))}
                <th className="text-right px-3 py-3 font-bold text-foreground min-w-[80px] bg-primary/5">
                  {periodo > 12 ? `${periodo}m` : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {ROWS.map((row, ri) => {
                const total = getTotal(row);
                return (
                  <tr
                    key={ri}
                    className={[
                      row.separator ? 'border-t-2 border-border/60' : '',
                      row.bold ? 'bg-muted/20' : '',
                    ].join(' ')}
                  >
                    <td
                      className={`px-4 py-2.5 sticky left-0 ${
                        row.bold ? 'font-semibold text-foreground bg-muted/20' : 'text-muted-foreground bg-card'
                      }`}
                    >
                      {row.label}
                    </td>
                    {displayMeses.map((m) => {
                      const v = getValue(row, m);
                      const color = row.dynamic
                        ? v >= 0 ? 'text-green-600' : 'text-red-600'
                        : row.color;
                      return (
                        <td key={m.mes} className={`text-right px-3 py-2.5 ${color} ${row.bold ? 'font-semibold' : ''}`}>
                          {fmt(v, row.negative)}
                        </td>
                      );
                    })}
                    <td
                      className={`text-right px-3 py-2.5 font-bold bg-primary/5 ${
                        row.dynamic ? (total >= 0 ? 'text-green-600' : 'text-red-600') : row.color
                      }`}
                    >
                      {fmt(total, row.negative)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
