import React, { useMemo } from 'react';
import { Users, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import CompanyLogo from '@/components/crm/CompanyLogo';

export default function PagosDelMes({ clientes, convert, porcentajeGlobal }) {
  const pagos = useMemo(() => {
    const socioMap = {};
    const invMap = {};

    clientes.filter((c) => c.costo_agua_mensual).forEach((cliente) => {
      const moneda = cliente.moneda || 'USD';
      const costoAguaUSD = convert(cliente.costo_agua_mensual, moneda, 'USD');
      const pctAhorro = (cliente.porcentaje_ahorro || porcentajeGlobal) / 100;
      const ingresoBruto = costoAguaUSD * pctAhorro * 0.5;

      (cliente.socios_asignados || []).forEach((s) => {
        if (!socioMap[s.socio_id]) {
          socioMap[s.socio_id] = { nombre: s.nombre, items: [], total: 0 };
        }
        const monto = ingresoBruto * (s.porcentaje / 100);
        socioMap[s.socio_id].items.push({ cliente, porcentaje: s.porcentaje, ingresoBruto, monto });
        socioMap[s.socio_id].total += monto;
      });

      (cliente.inversionistas_asignados || []).forEach((inv) => {
        if (!invMap[inv.inversionista_id]) {
          invMap[inv.inversionista_id] = { nombre: inv.nombre, items: [], total: 0 };
        }
        const monto = ingresoBruto * (inv.porcentaje / 100);
        invMap[inv.inversionista_id].items.push({ cliente, porcentaje: inv.porcentaje, ingresoBruto, monto });
        invMap[inv.inversionista_id].total += monto;
      });
    });

    return {
      socios: Object.entries(socioMap).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.total - a.total),
      inversionistas: Object.entries(invMap).map(([id, i]) => ({ id, ...i })).sort((a, b) => b.total - a.total),
    };
  }, [clientes, convert, porcentajeGlobal]);

  const totalSocios = pagos.socios.reduce((s, x) => s + x.total, 0);
  const totalInv = pagos.inversionistas.reduce((s, x) => s + x.total, 0);
  const totalCompromisos = totalSocios + totalInv;

  if (!pagos.socios.length && !pagos.inversionistas.length) {
    return (
      <div className="bg-card rounded-xl p-10 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Sin compromisos de pago</p>
        <p className="text-xs text-muted-foreground mt-1">
          Asigná socios o inversionistas a tus negocios activos desde el módulo CRM.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={DollarSign} label="Total compromisos/mes" value={`$${totalCompromisos.toFixed(0)}`} color="text-foreground" />
        <KPI icon={Users} label="Pago a socios/mes" value={`$${totalSocios.toFixed(0)}`} color="text-blue-600" />
        <KPI icon={TrendingUp} label="Pago a inversionistas/mes" value={`$${totalInv.toFixed(0)}`} color="text-amber-600" />
        <KPI icon={Users} label="Beneficiarios activos" value={`${pagos.socios.length + pagos.inversionistas.length}`} color="text-muted-foreground" />
      </div>

      {/* Socios */}
      {pagos.socios.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <h3 className="text-sm font-semibold text-foreground">Pagos a Socios</h3>
            <span className="ml-auto text-sm font-bold text-blue-600">${totalSocios.toFixed(0)} / mes</span>
          </div>
          <div className="divide-y divide-border/20">
            {pagos.socios.map((socio) => (
              <div key={socio.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 flex-shrink-0">
                      {socio.nombre?.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{socio.nombre}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-blue-600">${socio.total.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">USD / mes</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {socio.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 pl-10 text-xs">
                      <CompanyLogo cliente={item.cliente} size="sm" />
                      <span className="flex-1 text-muted-foreground truncate">{item.cliente.nombre_empresa}</span>
                      <span className="text-muted-foreground/70 shrink-0">
                        {item.porcentaje}% × ${item.ingresoBruto.toFixed(0)}
                      </span>
                      <span className="font-semibold text-blue-600 w-14 text-right shrink-0">
                        ${item.monto.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inversionistas */}
      {pagos.inversionistas.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Pagos a Inversionistas</h3>
            <span className="ml-auto text-sm font-bold text-amber-600">${totalInv.toFixed(0)} / mes</span>
          </div>
          <div className="divide-y divide-border/20">
            {pagos.inversionistas.map((inv) => (
              <div key={inv.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">
                      {inv.nombre?.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{inv.nombre}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-amber-600">${inv.total.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">USD / mes</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {inv.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 pl-10 text-xs">
                      <CompanyLogo cliente={item.cliente} size="sm" />
                      <span className="flex-1 text-muted-foreground truncate">{item.cliente.nombre_empresa}</span>
                      <span className="text-muted-foreground/70 shrink-0">
                        {item.porcentaje}% × ${item.ingresoBruto.toFixed(0)}
                      </span>
                      <span className="font-semibold text-amber-600 w-14 text-right shrink-0">
                        ${item.monto.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
