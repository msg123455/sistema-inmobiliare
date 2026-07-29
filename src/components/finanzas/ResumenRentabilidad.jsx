import React from 'react';
import { TrendingUp, DollarSign, Percent, PiggyBank, Receipt, Landmark, Users, Target, Zap, Calendar, ArrowRight } from 'lucide-react';

export default function ResumenRentabilidad({ resumen, valvulas, clientes = [], flujoPorMes = [] }) {
  if (!resumen) return null;

  const clientesActivos = clientes.filter(c => c.etapa_pipeline === 'Activo' && c.costo_agua_mensual).length;
  const totalClientesConIngreso = clientes.filter(c => c.costo_agua_mensual).length;
  const arr = resumen.utilidadNeta * 12;
  const breakEvenMes = flujoPorMes.findIndex(m => m.acumulado >= 0);
  const breakEvenLabel = breakEvenMes >= 0 ? `Mes ${flujoPorMes[breakEvenMes].mes}` : '—';
  const mesesPositivos = flujoPorMes.filter(m => m.flujo_neto >= 0).length;

  const valvulasPorModelo = (valvulas || []).map(v => ({
    nombre: `${v.nombre} (${v.pulgadas}")`,
    comprables: resumen.utilidadNeta > 0 ? resumen.utilidadNeta / v.costo_compra : 0,
  }));

  const calGroup = valvulasPorModelo.filter(v => v.nombre.toUpperCase().includes('CAL')).sort((a, b) => b.comprables - a.comprables);
  const miaGroup = valvulasPorModelo.filter(v => v.nombre.toUpperCase().includes('MIA')).sort((a, b) => b.comprables - a.comprables);
  const otrosGroup = valvulasPorModelo.filter(v => !v.nombre.toUpperCase().includes('CAL') && !v.nombre.toUpperCase().includes('MIA')).sort((a, b) => b.comprables - a.comprables);

  return (
    <div className="space-y-3">

      {/* ── NIVEL 1: Resultados principales ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl p-5 border border-border/60">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Ingreso Bruto / mes</p>
          </div>
          <p className="text-2xl font-bold text-green-600">${resumen.ingresoBrutoMes.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">antes de deducciones</p>
        </div>

        <div className="bg-primary/5 rounded-xl p-5 border border-primary/20 relative">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs text-primary font-medium">MRR — Utilidad Neta</p>
          </div>
          <p className={`text-2xl font-bold ${resumen.utilidadNeta >= 0 ? 'text-primary' : 'text-red-600'}`}>
            ${resumen.utilidadNeta.toFixed(0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">lo que realmente queda / mes</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border/60">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">ARR — Anual</p>
          </div>
          <p className={`text-2xl font-bold ${arr >= 0 ? 'text-primary' : 'text-red-600'}`}>
            ${arr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">proyección 12 meses</p>
        </div>
      </div>

      {/* ── NIVEL 2: Deducciones (cascada) ── */}
      <div className="bg-card rounded-xl px-5 py-4 border border-border/60">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Deducciones</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip label="Ingreso Bruto" value={`$${resumen.ingresoBrutoMes.toFixed(0)}`} color="text-green-600" bg="bg-green-50 dark:bg-green-950/20" />

          {resumen.pagoSociosFF > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <Chip label="Socios" value={`-$${resumen.pagoSociosFF.toFixed(0)}`} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-950/20" />
            </>
          )}

          {resumen.pagoInvMes > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <Chip label="Inversionistas" value={`-$${resumen.pagoInvMes.toFixed(0)}`} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/20" />
            </>
          )}

          {resumen.gastosFijosMes > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <Chip label="Gastos Fijos" value={`-$${resumen.gastosFijosMes.toFixed(0)}`} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
            </>
          )}

          {resumen.impuestos > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <Chip label={`Impuestos (${resumen.tasaImpuesto}%)`} value={`-$${resumen.impuestos.toFixed(0)}`} color="text-red-400" bg="bg-red-50 dark:bg-red-950/20" />
            </>
          )}

          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          <Chip
            label="Utilidad Neta"
            value={`$${resumen.utilidadNeta.toFixed(0)}`}
            color={resumen.utilidadNeta >= 0 ? 'text-primary' : 'text-red-600'}
            bg={resumen.utilidadNeta >= 0 ? 'bg-primary/10' : 'bg-red-50 dark:bg-red-950/20'}
            bold
          />
        </div>
      </div>

      {/* ── NIVEL 3: Indicadores de salud ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthCard
          icon={Percent}
          label="Margen Neto"
          value={`${resumen.margenNeto.toFixed(1)}%`}
          color={resumen.margenNeto >= 30 ? 'text-green-600' : resumen.margenNeto >= 10 ? 'text-amber-600' : 'text-red-600'}
          sub={resumen.margenNeto >= 30 ? 'Saludable' : resumen.margenNeto >= 10 ? 'Aceptable' : 'Bajo'}
        />
        <HealthCard
          icon={Users}
          label="Clientes activos"
          value={`${clientesActivos} / ${totalClientesConIngreso}`}
          color="text-blue-600"
          sub="con datos de agua"
        />
        <HealthCard
          icon={Target}
          label="Break-even"
          value={breakEvenLabel}
          color="text-foreground"
          sub="punto de equilibrio"
        />
        <HealthCard
          icon={Zap}
          label="Meses con flujo +"
          value={`${mesesPositivos} / 36`}
          color={mesesPositivos >= 30 ? 'text-green-600' : mesesPositivos >= 18 ? 'text-amber-600' : 'text-red-600'}
          sub="en proyección 36m"
        />
      </div>

      {/* Válvulas comprables */}
      {valvulasPorModelo.length > 0 && resumen.utilidadNeta > 0 && (
        <div className="bg-card rounded-xl p-4 border border-border/60">
          <div className="flex items-center gap-1.5 mb-3">
            <PiggyBank className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Válvulas comprables / mes con la utilidad neta
            </p>
          </div>
          <div className="space-y-3">
            {calGroup.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">CAL</p>
                <div className="flex flex-wrap gap-4">
                  {calGroup.map((v, i) => (
                    <div key={i} className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-purple-600">{v.comprables.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">{v.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {miaGroup.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">MIA</p>
                <div className="flex flex-wrap gap-4">
                  {miaGroup.map((v, i) => (
                    <div key={i} className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-blue-600">{v.comprables.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">{v.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {otrosGroup.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Otros</p>
                <div className="flex flex-wrap gap-4">
                  {otrosGroup.map((v, i) => (
                    <div key={i} className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-purple-600">{v.comprables.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">{v.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, color, bg, bold }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${bg}`}>
      <span className="text-[10px] text-muted-foreground mb-0.5">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</span>
    </div>
  );
}

function HealthCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border/60">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
