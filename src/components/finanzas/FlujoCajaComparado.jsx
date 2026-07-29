import React, { useState } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, ReferenceLine,
} from 'recharts';
import { TrendingUp, DollarSign, Zap, Clock, ArrowRight } from 'lucide-react';
import CompanyLogo from '@/components/crm/CompanyLogo';

const DEMO_DIAS = 90;
const TS = {
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 10,
    fontSize: 11,
  },
};

// Custom dot only on month 1 (today marker)
function ActiveDot(props) {
  const { cx, cy } = props;
  return <circle cx={cx} cy={cy} r={3} fill={props.stroke} strokeWidth={0} />;
}

export default function FlujoCajaComparado({
  flujoPorMes,       // projected (all pipeline)
  flujoPorMesReal,   // real (post-demo clients)
  resumen,           // projected summary
  resumenReal,       // real summary
  clientes,
  gastosFijosMes,
}) {
  const [horizon, setHorizon] = useState(24);

  const hoy = new Date();

  const clientesEnDemo = clientes.filter(c => {
    if (c.etapa_pipeline !== 'Activo' || !c.fecha_activacion) return false;
    const dias = Math.floor((hoy - new Date(c.fecha_activacion + 'T12:00:00')) / 86400000);
    return dias < DEMO_DIAS;
  });

  const clientesFacturando = clientes.filter(c => {
    if (c.etapa_pipeline !== 'Activo' || !c.fecha_activacion) return false;
    const dias = Math.floor((hoy - new Date(c.fecha_activacion + 'T12:00:00')) / 86400000);
    return dias >= DEMO_DIAS;
  });

  // Combined chart data
  const chartData = flujoPorMes.slice(0, horizon).map((m, i) => ({
    mes: m.label,
    'Ingreso proyectado': Math.round(m.ingreso_clientes),
    'Ingreso real':       Math.round(flujoPorMesReal[i]?.ingreso_real || 0),
    'Neto proyectado':    Math.round(m.flujo_neto),
    'Neto real':          Math.round(flujoPorMesReal[i]?.neto_real || 0),
  }));

  const acumData = flujoPorMes.slice(0, horizon).map((m, i) => ({
    mes: m.label,
    'Acumulado proyectado': Math.round(m.acumulado),
    'Acumulado real':       Math.round(flujoPorMesReal[i]?.acumulado_real || 0),
  }));

  const gap = resumen.ingresoBrutoMes - resumenReal.ingresoBrutoMes;
  const pctRealizado = resumen.ingresoBrutoMes > 0
    ? Math.round((resumenReal.ingresoBrutoMes / resumen.ingresoBrutoMes) * 100)
    : 0;

  return (
    <div className="space-y-5">

      {/* KPIs — 2×2 Real vs Proyectado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Zap} label="MRR Real" value={`$${resumenReal.ingresoBrutoMes.toFixed(0)}`}
          sub="Clientes facturando" color="text-green-600"
          badge={`${clientesFacturando.length} cliente${clientesFacturando.length !== 1 ? 's' : ''}`}
          badgeColor="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" />

        <KPI icon={TrendingUp} label="MRR Proyectado" value={`$${resumen.ingresoBrutoMes.toFixed(0)}`}
          sub="Todo el pipeline" color="text-blue-600"
          badge={`${clientes.filter(c => c.costo_agua_mensual).length} clientes`}
          badgeColor="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" />

        <KPI icon={Clock} label="En demo" value={`$${gap.toFixed(0)}`}
          sub="Ingreso aún no activo" color="text-amber-600"
          badge={`${clientesEnDemo.length} cliente${clientesEnDemo.length !== 1 ? 's' : ''}`}
          badgeColor="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" />

        <KPI icon={DollarSign} label="Realizado" value={`${pctRealizado}%`}
          sub="del potencial total" color={pctRealizado > 50 ? 'text-green-600' : 'text-amber-600'}>
          <div className="mt-2 w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${pctRealizado}%` }} />
          </div>
        </KPI>
      </div>

      {/* Horizon selector */}
      <div className="bg-card rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Ingresos — Real vs Proyectado</h3>
          <div className="flex gap-1.5">
            {[12, 24, 36].map(h => (
              <button key={h} onClick={() => setHorizon(h)}
                className={`h-7 px-2.5 text-xs rounded-lg border transition-colors ${horizon === h ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {h}m
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} interval={horizon <= 12 ? 0 : 2} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={42} />
            <Tooltip {...TS} formatter={v => `$${v.toLocaleString()}`} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: 8 }} />

            {/* Projected — dashed, lighter */}
            <Line type="monotone" dataKey="Ingreso proyectado" stroke="#3b82f6" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
            <Line type="monotone" dataKey="Neto proyectado" stroke="#94a3b8" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />

            {/* Real — solid, bold */}
            <Line type="monotone" dataKey="Ingreso real" stroke="#22c55e" strokeWidth={2.5}
              dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="Neto real" stroke="hsl(var(--primary))" strokeWidth={2.5}
              dot={false} activeDot={{ r: 4 }} />

            {/* Gastos fijos reference */}
            {gastosFijosMes > 0 && (
              <ReferenceLine y={gastosFijosMes} stroke="hsl(var(--destructive))" strokeDasharray="3 3"
                label={{ value: 'Gastos', position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--destructive))' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend explanation */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border/40 pt-3">
          <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-green-500" /> Ingreso real</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-primary" /> Neto real</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-dashed border-t-2 border-blue-400" /> Ingreso proyectado</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-dashed border-t-2 border-slate-400" /> Neto proyectado</span>
        </div>
      </div>

      {/* Acumulado comparado */}
      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Caja acumulada — Real vs Proyectado</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={acumData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} interval={horizon <= 12 ? 0 : 2} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={42} />
            <Tooltip {...TS} formatter={v => `$${v.toLocaleString()}`} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            <Area type="monotone" dataKey="Acumulado proyectado" stroke="#3b82f6" fill="#3b82f6"
              fillOpacity={0.07} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            <Area type="monotone" dataKey="Acumulado real" stroke="#22c55e" fill="#22c55e"
              fillOpacity={0.12} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Demo vs Facturando */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* En demo */}
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">En período demo</h3>
            </div>
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
              {clientesEnDemo.length}
            </span>
          </div>
          {clientesEnDemo.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Ningún cliente en demo actualmente</p>
          ) : (
            <div className="divide-y divide-border/20">
              {clientesEnDemo.map(c => {
                const dias = Math.floor((hoy - new Date(c.fecha_activacion + 'T12:00:00')) / 86400000);
                const pct = Math.round((dias / DEMO_DIAS) * 100);
                const fechaFin = new Date(new Date(c.fecha_activacion + 'T12:00:00').getTime() + DEMO_DIAS * 86400000);
                const restantes = DEMO_DIAS - dias;
                return (
                  <div key={c.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo cliente={c} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.nombre_empresa}</p>
                        <p className="text-xs text-muted-foreground">Factura desde: {fechaFin.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-600 flex-shrink-0">{restantes}d</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted/40 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, background: pct > 66 ? '#22c55e' : pct > 33 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-9 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Facturando */}
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-500" />
              <h3 className="text-sm font-semibold text-foreground">Facturando</h3>
            </div>
            <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
              {clientesFacturando.length}
            </span>
          </div>
          {clientesFacturando.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Ningún cliente ha completado el demo aún</p>
          ) : (
            <div className="divide-y divide-border/20">
              {clientesFacturando.map(c => {
                const dias = Math.floor((hoy - new Date(c.fecha_activacion + 'T12:00:00')) / 86400000);
                const pct = c.porcentaje_ahorro || 15;
                const flatFee = c.costo_agua_mensual ? c.costo_agua_mensual * (pct / 200) : null;
                return (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-2.5">
                    <CompanyLogo cliente={c} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.nombre_empresa}</p>
                      <p className="text-xs text-muted-foreground">
                        {flatFee ? `Flat fee: $${flatFee.toFixed(0)}/mes · ` : ''}{dias} días activo
                      </p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      Activo
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Deductions waterfall */}
      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Cascada de ingresos — Real</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Ingreso bruto', value: resumenReal.ingresoBrutoMes, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
            resumenReal.pagoSociosFF > 0 && { label: 'Socios', value: -resumenReal.pagoSociosFF, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/20' },
            resumenReal.pagoInvMes > 0 && { label: 'Inv.', value: -resumenReal.pagoInvMes, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20' },
            gastosFijosMes > 0 && { label: 'Gastos', value: -gastosFijosMes, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/20' },
            { label: 'Utilidad neta', value: resumenReal.utilidadNeta, color: resumenReal.utilidadNeta >= 0 ? 'text-primary' : 'text-destructive', bg: 'bg-primary/10', bold: true },
          ].filter(Boolean).map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${item.bg}`}>
                <span className="text-[10px] text-muted-foreground mb-0.5">{item.label}</span>
                <span className={`text-sm ${item.bold ? 'font-bold' : 'font-semibold'} ${item.color}`}>
                  {item.value >= 0 ? '$' : '-$'}{Math.abs(item.value).toFixed(0)}
                </span>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, color, badge, badgeColor, children }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border/60">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      {badge && (
        <span className={`inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
      )}
      {children}
    </div>
  );
}
