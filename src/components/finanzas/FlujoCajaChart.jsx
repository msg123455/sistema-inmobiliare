import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ComposedChart, Line } from 'recharts';

const tooltipStyle = {
  contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '11px' },
};

export default function FlujoCajaChart({ flujoPorMes }) {
  if (!flujoPorMes?.length) return null;

  const chartData = flujoPorMes.map(m => ({
    mes: m.label,
    'Ingreso Bruto': Math.round(m.ingreso_clientes),
    'Socios': Math.round(m.pago_socios_ff || 0),
    'Inversionistas': Math.round(m.pago_inversionistas || 0),
    'Gastos Fijos': Math.round(m.gastos_fijos),
    'Flujo Neto': Math.round(m.flujo_neto),
    Acumulado: Math.round(m.acumulado),
  }));

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Flujo de Caja Mensual</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} interval={2} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={v => `$${v.toLocaleString()}`} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Bar dataKey="Ingreso Bruto" fill="hsl(var(--chart-3))" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Socios" fill="#a855f7" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Inversionistas" fill="hsl(var(--chart-5))" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Gastos Fijos" fill="hsl(var(--destructive))" opacity={0.5} radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="Flujo Neto" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Caja Acumulada</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} interval={2} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={v => `$${v.toLocaleString()}`} />
            <Area type="monotone" dataKey="Acumulado" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}