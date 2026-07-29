import React from 'react';
import { ShoppingCart, Zap, TrendingUp, ArrowRight, CheckCircle, Clock } from 'lucide-react';
import CompanyLogo from '@/components/crm/CompanyLogo';

/**
 * Analiza la utilidad neta disponible, los negocios en pipeline y el inventario actual
 * para recomendar en qué orden comprar válvulas y maximizar el rendimiento de la caja.
 */
export default function RecomendacionCompra({ utilidadNeta, valvulas, clientes, clientesFlujo, stockMap, porcentajeGlobal, convert }) {
  if (utilidadNeta <= 0 || !valvulas.length) {
    return (
      <div className="bg-card rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {utilidadNeta <= 0
            ? 'No hay utilidad neta disponible para comprar válvulas este mes.'
            : 'No hay válvulas registradas.'}
        </p>
      </div>
    );
  }

  // Negocios en pipeline que requieren válvulas
  const negociosPendientes = clientes
    .filter(c => c.etapa_pipeline !== 'Activo' && Object.keys(c.valvulas_cantidades || {}).length > 0)
    .map(cliente => {
      const cantidades = cliente.valvulas_cantidades || {};
      const moneda = cliente.moneda || 'USD';
      const costoAguaUSD = convert(cliente.costo_agua_mensual || 0, moneda, 'USD');
      const pctAhorro = (cliente.porcentaje_ahorro || porcentajeGlobal) / 100;
      const ingresoBruto = costoAguaUSD * pctAhorro * 0.5;
      const sociosPct = (cliente.socios_asignados || []).reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100;
      const invPct = (cliente.inversionistas_asignados || []).reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100;
      const ingresoEmpresaMes = ingresoBruto * (1 - sociosPct - invPct);

      // Desglose de válvulas faltantes (no cubiertas por stock)
      const valvulasFaltantes = [];
      let costoTotalFaltante = 0;

      Object.entries(cantidades).forEach(([vid, qty]) => {
        const v = valvulas.find(x => x.id === vid);
        if (!v) return;
        const enStock = stockMap[vid] || 0;
        const faltante = Math.max(0, qty - enStock);
        if (faltante > 0) {
          const costo = faltante * v.costo_compra;
          costoTotalFaltante += costo;
          valvulasFaltantes.push({ valvula: v, cantidad: faltante, costo });
        }
      });

      if (valvulasFaltantes.length === 0) return null;

      const tieneSocio = (cliente.socios_asignados || []).length > 0;
      const inversionEmpresa = tieneSocio ? costoTotalFaltante * (1 - sociosPct) : costoTotalFaltante;

      // ROI: meses para recuperar la inversión con el ingreso que genera este cliente
      const mesesROI = ingresoEmpresaMes > 0 ? inversionEmpresa / ingresoEmpresaMes : Infinity;
      // Rendimiento mensual por dólar invertido
      const rendimientoPorDolar = inversionEmpresa > 0 ? ingresoEmpresaMes / inversionEmpresa : 0;

      return {
        cliente,
        ingresoEmpresaMes,
        costoTotalFaltante,
        inversionEmpresa,
        tieneSocio,
        valvulasFaltantes,
        mesesROI,
        rendimientoPorDolar,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rendimientoPorDolar - a.rendimientoPorDolar); // Mejor rendimiento primero

  if (negociosPendientes.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Todos los negocios en pipeline tienen stock cubierto. No se necesitan compras adicionales.
        </p>
      </div>
    );
  }

  // Simular compra con presupuesto = utilidad neta
  let presupuesto = utilidadNeta;
  const planCompra = negociosPendientes.map((neg, idx) => {
    if (presupuesto <= 0) {
      return { ...neg, prioridad: idx + 1, comprable: false, montoAsignado: 0 };
    }
    if (presupuesto >= neg.inversionEmpresa) {
      presupuesto -= neg.inversionEmpresa;
      return { ...neg, prioridad: idx + 1, comprable: true, montoAsignado: neg.inversionEmpresa };
    }
    // Parcial
    const parcial = presupuesto;
    presupuesto = 0;
    return { ...neg, prioridad: idx + 1, comprable: 'parcial', montoAsignado: parcial };
  });

  const totalNecesario = negociosPendientes.reduce((s, n) => s + n.inversionEmpresa, 0);
  const ingresoTotalPotencial = negociosPendientes.reduce((s, n) => s + n.ingresoEmpresaMes, 0);
  const comprables = planCompra.filter(p => p.comprable === true);
  const ingresoDesbloqueado = comprables.reduce((s, p) => s + p.ingresoEmpresaMes, 0);

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={ShoppingCart} label="Presupuesto (utilidad neta)" value={`$${utilidadNeta.toFixed(0)}`} color="text-primary" />
        <KPI icon={TrendingUp} label="Total necesario" value={`$${totalNecesario.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="text-foreground" />
        <KPI icon={Zap} label="Ingreso potencial/mes" value={`$${ingresoTotalPotencial.toFixed(0)}`} sub="Si se cubren todos" color="text-green-600" />
        <KPI icon={CheckCircle} label="Desbloqueable este mes" value={`$${ingresoDesbloqueado.toFixed(0)}/mes`} sub={`${comprables.length} negocio(s)`} color="text-purple-600" />
      </div>

      {/* Plan de compra priorizado - Tabla */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 bg-primary/5">
          <h3 className="text-sm font-semibold text-foreground">Plan de Compra Priorizado</h3>
          <p className="text-xs text-muted-foreground mt-1">Negocios ordenados por rentabilidad (mayor ROI primero)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Prioridad</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Válvulas Faltantes</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Inversión</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Genera/mes</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">ROI</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Rendimiento</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {planCompra.map((p) => (
                <tr key={p.cliente.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      p.comprable === true ? 'bg-green-600' : p.comprable === 'parcial' ? 'bg-yellow-500' : 'bg-muted'
                    }`}>
                      {p.prioridad}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CompanyLogo cliente={p.cliente} size="sm" />
                      <div>
                        <p className="font-semibold text-foreground">{p.cliente.nombre_empresa}</p>
                        <p className="text-xs text-muted-foreground">
                          {({ Prospecto: 'Prospecto', Lead: 'Lead', Evaluacion_tecnica: 'Hacer eval. técnica', Instalacion: 'Pend. instalación' })[p.cliente.etapa_pipeline] || p.cliente.etapa_pipeline}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {p.valvulasFaltantes.map((v, i) => (
                      <div key={i}>{v.cantidad}× {v.valvula.nombre} ({v.valvula.pulgadas}")</div>
                    ))}
                  </td>
                  <td className="text-right px-4 py-3 font-semibold text-foreground">
                    ${p.inversionEmpresa.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="text-right px-4 py-3 font-semibold text-green-600">${p.ingresoEmpresaMes.toFixed(0)}</td>
                  <td className={`text-right px-4 py-3 font-semibold ${p.mesesROI <= 6 ? 'text-green-600' : p.mesesROI <= 12 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {p.mesesROI === Infinity ? 'N/A' : `${p.mesesROI.toFixed(1)}m`}
                  </td>
                  <td className="text-right px-4 py-3 font-semibold text-purple-600">{(p.rendimientoPorDolar * 100).toFixed(1)}%/m</td>
                  <td className="text-center px-4 py-3">
                    {p.comprable === true && <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-950/40 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> Comprable</span>}
                    {p.comprable === 'parcial' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-700 bg-yellow-100 dark:bg-yellow-950/40 px-2 py-1 rounded-full"><Clock className="w-3 h-3" /> Parcial</span>}
                    {p.comprable === false && <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/60 px-2 py-1 rounded-full"><Clock className="w-3 h-3" /> Próximo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recompra libre por modelo */}
      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Capacidad de Recompra por Modelo</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Con la utilidad neta de <span className="font-semibold text-foreground">${utilidadNeta.toFixed(0)}/mes</span>, ¿cuántas de cada modelo puedes comprar?
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {valvulas.map(v => {
            const comprables = utilidadNeta / v.costo_compra;
            return (
              <div key={v.id} className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs font-medium text-foreground">{v.nombre} ({v.pulgadas}")</p>
                <p className="text-xs text-muted-foreground">${v.costo_compra.toLocaleString()}/ud</p>
                <p className="text-lg font-bold text-purple-600 mt-1">
                  {comprables.toFixed(1)}<span className="text-xs font-normal text-muted-foreground"> uds/mes</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}