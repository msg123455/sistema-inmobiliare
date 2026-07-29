import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarChart3, Calculator } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const INVERSIONES = [
  { key: 'valvula', nombre: 'Tu Modelo (Válvulas)', color: 'hsl(var(--primary))' },
  { key: 'sp500', nombre: 'S&P 500 (Bolsa USA)', retorno_anual: 10, color: '#22c55e' },
  { key: 'bonos', nombre: 'Bonos / CDT', retorno_anual: 6, color: '#eab308' },
  { key: 'finca_raiz', nombre: 'Finca Raíz', retorno_anual: 8, color: '#f97316' },
  { key: 'crypto', nombre: 'Crypto (promedio)', retorno_anual: 15, color: '#8b5cf6' },
];

export default function SimuladorComparador() {
  const [config, setConfig] = useState({
    monto_inversion: 10000,
    ganancia_inv_mes: 400,
    meses_cobro: 24,
    anios_comparacion: 5,
  });
  const [resultado, setResultado] = useState(null);

  const simular = () => {
    const { monto_inversion, ganancia_inv_mes, meses_cobro, anios_comparacion } = config;
    const anios = anios_comparacion;

    const resultados = INVERSIONES.map(inv => {
      if (inv.key === 'valvula') {
        const totalCobrado = ganancia_inv_mes * Math.min(meses_cobro, anios * 12);
        const retornoPct = monto_inversion > 0 ? ((totalCobrado / monto_inversion) * 100) : 0;
        const retornoAnual = meses_cobro > 0 ? (retornoPct / (meses_cobro / 12)) : 0;
        return {
          ...inv,
          monto: monto_inversion,
          ganancia: totalCobrado - monto_inversion,
          total: totalCobrado,
          retorno_pct: retornoPct,
          retorno_anual: retornoAnual,
        };
      } else {
        const total = monto_inversion * Math.pow(1 + inv.retorno_anual / 100, anios);
        return {
          ...inv,
          monto: monto_inversion,
          ganancia: total - monto_inversion,
          total,
          retorno_pct: ((total / monto_inversion) * 100),
          retorno_anual: inv.retorno_anual,
        };
      }
    });

    setResultado(resultados);
  };

  const chartData = resultado?.map(r => ({
    nombre: r.nombre,
    Ganancia: Math.round(r.ganancia),
    color: r.color,
  })) || [];

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '12px' },
  };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-medium text-sm mb-1">Comparador de Inversión</p>
        <p>Compara el retorno de tu modelo de válvulas vs inversiones tradicionales. Ideal para presentar a inversionistas mostrando que tu modelo puede ser más atractivo.</p>
      </div>

      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Parámetros</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Monto inversión (USD)</label>
            <Input type="number" value={config.monto_inversion} onChange={(e) => setConfig({ ...config, monto_inversion: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ganancia inv./mes con válvulas</label>
            <Input type="number" value={config.ganancia_inv_mes} onChange={(e) => setConfig({ ...config, ganancia_inv_mes: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Meses de cobro</label>
            <Input type="number" value={config.meses_cobro} onChange={(e) => setConfig({ ...config, meses_cobro: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Años a comparar</label>
            <Input type="number" value={config.anios_comparacion} onChange={(e) => setConfig({ ...config, anios_comparacion: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
          </div>
        </div>
        <Button onClick={simular} className="w-full mt-4 rounded-lg">
          <Calculator className="w-4 h-4 mr-2" /> Comparar Inversiones
        </Button>
      </div>

      {resultado && (
        <>
          {/* Gráfica */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Ganancia Neta por Tipo de Inversión</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="nombre" type="category" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} width={140} />
                <Tooltip {...tooltipStyle} formatter={v => `$${v.toLocaleString()}`} />
                <Bar dataKey="Ganancia" radius={[0, 6, 6, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla comparativa */}
          <div className="bg-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold text-foreground">Detalle Comparativo</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Inversión</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Inviertes</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Recibes</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Ganancia</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Retorno</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">% Anual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {resultado.map((r, i) => (
                    <tr key={i} className={`${r.key === 'valvula' ? 'bg-primary/5 font-medium' : ''}`}>
                      <td className="px-4 py-2.5 text-foreground flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.nombre}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground">${r.monto.toLocaleString()}</td>
                      <td className="text-right px-4 py-2.5 text-foreground">${Math.round(r.total).toLocaleString()}</td>
                      <td className="text-right px-4 py-2.5 text-green-600 font-medium">${Math.round(r.ganancia).toLocaleString()}</td>
                      <td className="text-right px-4 py-2.5 text-foreground">{r.retorno_pct.toFixed(0)}%</td>
                      <td className="text-right px-4 py-2.5 text-primary font-medium">{r.retorno_anual.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}