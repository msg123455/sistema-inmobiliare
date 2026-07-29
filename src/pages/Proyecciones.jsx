import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import { TrendingUp, Users, DollarSign, AlertCircle } from 'lucide-react';

// Flat fee mensual = (porcentaje_ahorro / 2)% × factura_promedio
// Socios/Inversionistas: su % aplica sobre el flat fee

const ETAPAS = [
  { key: 'Activo',             label: 'Activos' },
  { key: 'Instalacion',        label: 'Pend. instalación' },
  { key: 'Evaluacion_tecnica', label: 'Hacer eval. técnica' },
  { key: 'Lead',               label: 'Lead' },
  { key: 'Prospecto',          label: 'Prospecto' },
  { key: 'Todos',              label: 'Todos' },
];

const PERIODOS = [6, 12, 24, 36];

function fmt(n, compact = false) {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
    return `$${Math.round(n)}`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const tooltipStyle = {
  contentStyle: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '11px' },
};

export default function Proyecciones() {
  const [etapaFiltro, setEtapaFiltro] = useState('Activo');
  const [meses, setMeses] = useState(12);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });
  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const { convert } = useCurrencyRates();
  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global ?? 15;

  const clientesFiltradosBase = useMemo(() => {
    return clientes.filter(c =>
      etapaFiltro === 'Todos' ? true : c.etapa_pipeline === etapaFiltro
    );
  }, [clientes, etapaFiltro]);

  const sinFactura = clientesFiltradosBase.filter(c => !(c.costo_agua_mensual > 0));

  const rows = useMemo(() => {
    return clientesFiltradosBase
      .filter(c => c.costo_agua_mensual > 0)
      .map(c => {
        const facturaUSD = convert(c.costo_agua_mensual, c.moneda || 'USD', 'USD');
        const pct = c.porcentaje_ahorro || porcentajeGlobal;
        const flatFeeMes = facturaUSD * (pct / 200);

        const sociosAsignados = c.socios_asignados || [];
        const totalSocioPct = sociosAsignados.reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100;
        const invAsignados = c.inversionistas_asignados || [];
        const totalInvPct = invAsignados.reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100;

        const deduccionesPct = totalSocioPct + totalInvPct;
        const ingresoNetoMes = flatFeeMes * (1 - deduccionesPct);
        const numFacturas = (c.facturas_historicas || []).length;

        return { ...c, facturaUSD, pct, flatFeeMes, ingresoNetoMes, totalSocioPct, totalInvPct, numFacturas };
      })
      .sort((a, b) => b.ingresoNetoMes - a.ingresoNetoMes);
  }, [clientesFiltradosBase, porcentajeGlobal, convert]);

  const totalFlatFeeMes = rows.reduce((s, r) => s + r.flatFeeMes, 0);
  const totalNetoMes = rows.reduce((s, r) => s + r.ingresoNetoMes, 0);
  const totalDeducciones = totalFlatFeeMes - totalNetoMes;

  const proyeccionData = useMemo(() => {
    return Array.from({ length: meses }, (_, i) => ({
      mes: `M${i + 1}`,
      'Flat Fee bruto': Math.round(totalFlatFeeMes * (i + 1)),
      'Ingreso neto': Math.round(totalNetoMes * (i + 1)),
    }));
  }, [meses, totalFlatFeeMes, totalNetoMes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Proyecciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Flat fee = (% ahorro ÷ 2) × factura promedio mensual
        </p>
      </div>

      {/* Filtros de etapa */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto">
        {ETAPAS.map(e => (
          <button
            key={e.key}
            onClick={() => setEtapaFiltro(e.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              etapaFiltro === e.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {e.label}
          </button>
        ))}
        <span className="ml-auto flex items-center pr-1 text-xs text-muted-foreground">
          {rows.length} cliente{rows.length !== 1 ? 's' : ''} con datos
        </span>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Flat fee bruto / mes',
            value: fmt(totalFlatFeeMes),
            sub: `${fmt(totalFlatFeeMes * 12)} al año`,
            icon: DollarSign,
            color: 'text-muted-foreground',
          },
          {
            label: 'Deducciones (socios/inv.)',
            value: fmt(totalDeducciones),
            sub: `${totalFlatFeeMes > 0 ? ((totalDeducciones / totalFlatFeeMes) * 100).toFixed(1) : 0}% del flat fee`,
            icon: Users,
            color: 'text-amber-500',
          },
          {
            label: 'Ingreso neto / mes',
            value: fmt(totalNetoMes),
            sub: `${fmt(totalNetoMes * 12)} al año`,
            icon: TrendingUp,
            color: 'text-primary',
          },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-xs text-muted-foreground/70 font-medium">{label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Aviso clientes sin factura */}
      {sinFactura.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">{sinFactura.length} cliente{sinFactura.length !== 1 ? 's' : ''} sin factura configurada</span>
            {' '}(excluidos del cálculo):{' '}
            {sinFactura.map(c => c.nombre_empresa).join(', ')}.
            {' '}Agrégalos en <strong>Costeo</strong>.
          </p>
        </div>
      )}

      {/* Gráfica de proyección acumulada */}
      <div className="bg-card rounded-xl border border-border/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest">
            Ingreso acumulado
          </h2>
          <div className="flex gap-1">
            {PERIODOS.map(p => (
              <button
                key={p}
                onClick={() => setMeses(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  meses === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {p}m
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
            Sin clientes con datos para proyectar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={proyeccionData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => fmt(v, true)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [fmt(v), name]} />
              <Line type="monotone" dataKey="Flat Fee bruto" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="Ingreso neto" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/30">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Flat fee bruto en {meses} meses</p>
              <p className="text-lg font-bold text-muted-foreground">{fmt(totalFlatFeeMes * meses)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Ingreso neto en {meses} meses</p>
              <p className="text-lg font-bold text-primary">{fmt(totalNetoMes * meses)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabla por cliente */}
      <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40">
          <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest">
            Desglose por cliente
          </h2>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Sin clientes con factura configurada en esta etapa
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Factura prom.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">% Ahorro</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Flat fee / mes</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Socios/Inv.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-primary uppercase tracking-wide">Neto / mes</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-primary uppercase tracking-wide">Neto / año</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo cliente={r} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{r.nombre_empresa}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.etapa_pipeline?.replace('_', ' ')}
                            {r.numFacturas > 0 && ` · ${r.numFacturas} facturas`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">
                      {fmt(r.facturaUSD)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.porcentaje_ahorro
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {r.pct}%{!r.porcentaje_ahorro ? ' (global)' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground tabular-nums">
                      {fmt(r.flatFeeMes)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {(r.totalSocioPct + r.totalInvPct) > 0
                        ? `${Math.round((r.totalSocioPct + r.totalInvPct) * 100)}% (−${fmt(r.flatFeeMes - r.ingresoNetoMes)})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums">
                      {fmt(r.ingresoNetoMes)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-primary tabular-nums">
                      {fmt(r.ingresoNetoMes * 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/40 bg-muted/20">
                  <td className="px-4 py-3 text-xs font-semibold text-muted-foreground" colSpan={3}>
                    Total portafolio
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    {fmt(totalFlatFeeMes)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    −{fmt(totalDeducciones)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">
                    {fmt(totalNetoMes)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary tabular-nums">
                    {fmt(totalNetoMes * 12)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}