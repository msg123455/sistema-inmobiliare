import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, BarChart3, Users, Package, Settings, TrendingUp, CheckSquare, Zap } from 'lucide-react';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import ResumenRentabilidad from '@/components/finanzas/ResumenRentabilidad';
import ClienteFlujoCaja from '@/components/finanzas/ClienteFlujoCaja';
import FlujoCajaChart from '@/components/finanzas/FlujoCajaChart';
import FlujoCajaComparado from '@/components/finanzas/FlujoCajaComparado';
import FlujoCajaTable from '@/components/finanzas/FlujoCajaTable';
import EstadoResultados from '@/components/finanzas/EstadoResultados';
import PagosDelMes from '@/components/finanzas/PagosDelMes';
import IngresosReales from '@/components/finanzas/IngresosReales';
import RecomendacionCompra from '@/components/finanzas/RecomendacionCompra';
import InventarioFinanzas from '@/components/finanzas/InventarioFinanzas';
import ConfigFinancieraForm from '@/components/finanzas/ConfigFinancieraForm';

export default function Finanzas() {
  const { convert } = useCurrencyRates();

  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: () => base44.entities.Cliente.list() });
  const { data: valvulas = [] } = useQuery({ queryKey: ['valvulas'], queryFn: () => base44.entities.Valvula.list() });
  const { data: gastos = [] } = useQuery({ queryKey: ['gastos-fijos'], queryFn: () => base44.entities.GastoFijo.list() });
  const { data: configFin = [] } = useQuery({ queryKey: ['config-financiera'], queryFn: () => base44.entities.ConfigFinanciera.list() });
  const { data: appConfigs = [] } = useQuery({ queryKey: ['app-config'], queryFn: () => base44.entities.AppConfig.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.MovimientoInventario.list() });

  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global || 15;
  const finConfig = configFin.find(c => c.clave === 'general') || {};
  const tasaImpuesto = finConfig.tasa_impuesto_renta ?? 0;
  const capitalInicial = finConfig.capital_inicial || 0;

  const stockMap = useMemo(() => {
    const map = {};
    movimientos.forEach((m) => {
      if (!map[m.valvula_id]) map[m.valvula_id] = 0;
      if (m.tipo === 'entrada') map[m.valvula_id] += m.cantidad;
      else if (m.tipo === 'salida') map[m.valvula_id] -= m.cantidad;
      else map[m.valvula_id] += m.cantidad;
    });
    return map;
  }, [movimientos]);

  const costoPromedioValvula = useMemo(() => {
    if (!valvulas.length) return 0;
    return valvulas.reduce((s, v) => s + v.costo_compra, 0) / valvulas.length;
  }, [valvulas]);

  const gastosFijosMes = useMemo(
    () => gastos.filter(g => g.activo !== false).reduce((s, g) => s + (g.monto_mensual || 0), 0),
    [gastos]
  );

  const DEMO_DIAS = 90;
  const hoy = new Date();
  const isDemoCompleto = (cliente) => {
    if (cliente.etapa_pipeline !== 'Activo') return false;
    if (!cliente.fecha_activacion) return false;
    const dias = Math.floor((hoy - new Date(cliente.fecha_activacion + 'T12:00:00')) / 86400000);
    return dias >= DEMO_DIAS;
  };

  const clientesFlujo = useMemo(() => {
    return clientes.filter(c => c.costo_agua_mensual).map(cliente => {
      const moneda = cliente.moneda || 'USD';
      const costoAguaUSD = convert(cliente.costo_agua_mensual, moneda, 'USD');
      const pct = cliente.porcentaje_ahorro || porcentajeGlobal;
      const pctAhorro = pct / 100;
      const contratoAnios = cliente.contrato_anios || 3;
      const mesesContrato = contratoAnios * 12;
      // Flat fee = (pct/2)% de la factura promedio
      const ingresoBrutoMes = costoAguaUSD * (pct / 200);

      const sociosAsignados = cliente.socios_asignados || [];
      const totalSocioPct = sociosAsignados.reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100;
      const pagoSociosMes = ingresoBrutoMes * totalSocioPct;

      const invAsignados = cliente.inversionistas_asignados || [];
      const totalInvPct = invAsignados.reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100;
      const pagoInvMes = ingresoBrutoMes * totalInvPct;
      const mesesPagoInv = mesesContrato;

      const netoMes = ingresoBrutoMes - pagoSociosMes - pagoInvMes;
      const ingresoContratoTotal = netoMes * mesesContrato;

      return {
        cliente, moneda, costoAguaUSD, pctAhorro, contratoAnios, mesesContrato,
        ingresoBrutoMes, pagoSociosMes, pagoInvMes, netoMes, mesesPagoInv,
        ingresoContratoTotal,
      };
    });
  }, [clientes, porcentajeGlobal, convert]);

  // Solo clientes Activo que completaron los 90 días de demo → son los que realmente facturan
  const clientesFlujoReal = useMemo(
    () => clientesFlujo.filter(cf => isDemoCompleto(cf.cliente)),
    [clientesFlujo]
  );

  const resumenReal = useMemo(() => {
    const ingresoBrutoMes = clientesFlujoReal.reduce((s, c) => s + c.ingresoBrutoMes, 0);
    const pagoSociosFF    = clientesFlujoReal.reduce((s, c) => s + c.pagoSociosMes, 0);
    const pagoInvMes      = clientesFlujoReal.reduce((s, c) => s + c.pagoInvMes, 0);
    const netoOperativo   = ingresoBrutoMes - pagoSociosFF - pagoInvMes;
    const utilidadAntesImp = netoOperativo - gastosFijosMes;
    const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * (tasaImpuesto / 100) : 0;
    const utilidadNeta = utilidadAntesImp - impuestos;
    const margenNeto = ingresoBrutoMes > 0 ? (utilidadNeta / ingresoBrutoMes) * 100 : 0;
    return { ingresoBrutoMes, pagoSociosFF, pagoInvMes, netoOperativo, gastosFijosMes, impuestos, utilidadNeta, margenNeto, tasaImpuesto };
  }, [clientesFlujoReal, gastosFijosMes, tasaImpuesto]);

  const resumen = useMemo(() => {
    const ingresoBrutoMes = clientesFlujo.reduce((s, c) => s + c.ingresoBrutoMes, 0);
    const pagoSociosFF = clientesFlujo.reduce((s, c) => s + c.pagoSociosMes, 0);
    const pagoInvMes = clientesFlujo.reduce((s, c) => s + c.pagoInvMes, 0);
    const netoOperativo = ingresoBrutoMes - pagoSociosFF - pagoInvMes;
    const utilidadAntesImp = netoOperativo - gastosFijosMes;
    const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * (tasaImpuesto / 100) : 0;
    const utilidadNeta = utilidadAntesImp - impuestos;
    const margenNeto = ingresoBrutoMes > 0 ? (utilidadNeta / ingresoBrutoMes) * 100 : 0;
    const valvulasComprablesNeto = costoPromedioValvula > 0 && utilidadNeta > 0 ? Math.floor(utilidadNeta / costoPromedioValvula) : 0;
    return {
      ingresoBrutoMes, pagoInvMes, pagoSociosFF, gastosFijosMes, utilidadAntesImp,
      impuestos, utilidadNeta, margenNeto, tasaImpuesto, valvulasComprablesNeto,
    };
  }, [clientesFlujo, gastosFijosMes, tasaImpuesto, costoPromedioValvula]);

  const flujoPorMes = useMemo(() => {
    const meses = 36;
    const datos = [];
    let acumulado = capitalInicial;

    for (let m = 1; m <= meses; m++) {
      let ingresoClientes = 0;
      let pagoInversionistas = 0;
      let pagoSociosFF = 0;

      clientesFlujo.forEach(c => {
        if (m <= c.mesesContrato) {
          ingresoClientes += c.ingresoBrutoMes;
          pagoSociosFF += c.pagoSociosMes;
          pagoInversionistas += c.pagoInvMes;
        }
      });

      const netoOperativo = ingresoClientes - pagoSociosFF - pagoInversionistas;
      const utilidadAntesImp = netoOperativo - gastosFijosMes;
      const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * (tasaImpuesto / 100) : 0;
      const flujoNeto = utilidadAntesImp - impuestos;
      acumulado += flujoNeto;

      datos.push({
        mes: m,
        label: `M${m}`,
        ingreso_clientes: ingresoClientes,
        pago_socios_ff: pagoSociosFF,
        pago_inversionistas: pagoInversionistas,
        neto_operativo: netoOperativo,
        gastos_fijos: gastosFijosMes,
        impuestos,
        flujo_neto: flujoNeto,
        acumulado,
        valvulas_comprables: costoPromedioValvula > 0 && flujoNeto > 0 ? Math.floor(flujoNeto / costoPromedioValvula) : 0,
      });
    }

    return datos;
  }, [clientesFlujo, gastosFijosMes, tasaImpuesto, capitalInicial, costoPromedioValvula]);

  const flujoPorMesReal = useMemo(() => {
    const meses = 36;
    const datos = [];
    let acumulado = capitalInicial;
    for (let m = 1; m <= meses; m++) {
      let ingresos = 0, socios = 0, inv = 0;
      clientesFlujoReal.forEach(c => {
        if (m <= c.mesesContrato) {
          ingresos += c.ingresoBrutoMes;
          socios += c.pagoSociosMes;
          inv += c.pagoInvMes;
        }
      });
      const neto = ingresos - socios - inv;
      const utilidad = neto - gastosFijosMes;
      const imp = utilidad > 0 ? utilidad * (tasaImpuesto / 100) : 0;
      const flujoNeto = utilidad - imp;
      acumulado += flujoNeto;
      datos.push({ mes: m, label: `M${m}`, ingreso_real: ingresos, neto_real: flujoNeto, acumulado_real: acumulado });
    }
    return datos;
  }, [clientesFlujoReal, gastosFijosMes, tasaImpuesto, capitalInicial]);

  const TABS = [
    { value: 'flujo',      label: 'Flujo de Caja',  icon: Zap },
    { value: 'proyeccion', label: 'Proyección',      icon: DollarSign },
    { value: 'pyl',        label: 'P&L',             icon: BarChart3 },
    { value: 'comisiones', label: 'Comisiones',      icon: Users },
    { value: 'ingresos',   label: 'Ahorros reales',  icon: CheckSquare },
    { value: 'inventario', label: 'Inventario',      icon: Package },
    { value: 'config',     label: 'Config',          icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Finanzas</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">Flujo de caja, P&L, comisiones e inversiones</p>
      </div>

      <Tabs defaultValue="flujo" className="w-full">
        <TabsList className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto w-full h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Flujo de Caja — Real vs Proyectado (tab principal) */}
        <TabsContent value="flujo" className="mt-5">
          <FlujoCajaComparado
            flujoPorMes={flujoPorMes}
            flujoPorMesReal={flujoPorMesReal}
            resumen={resumen}
            resumenReal={resumenReal}
            clientes={clientes}
            gastosFijosMes={gastosFijosMes}
          />
        </TabsContent>

        {/* Proyección detallada */}
        <TabsContent value="proyeccion" className="mt-5 space-y-5">
          <ResumenRentabilidad resumen={resumen} valvulas={valvulas} clientes={clientes} flujoPorMes={flujoPorMes} />
          <ClienteFlujoCaja clientesFlujo={clientesFlujo} costoPromedioValvula={costoPromedioValvula} />
          <FlujoCajaChart flujoPorMes={flujoPorMes} />
          <div className="bg-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold text-foreground">Flujo de Caja Mensual — Proyección (36 meses)</h3>
            </div>
            <FlujoCajaTable flujoPorMes={flujoPorMes} />
          </div>
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pyl" className="mt-5">
          <EstadoResultados flujoPorMes={flujoPorMes} />
        </TabsContent>

        {/* Comisiones */}
        <TabsContent value="comisiones" className="mt-5">
          <PagosDelMes clientes={clientes} convert={convert} porcentajeGlobal={porcentajeGlobal} />
        </TabsContent>

        {/* Ingresos Reales */}
        <TabsContent value="ingresos" className="mt-5">
          <IngresosReales clientes={clientes} porcentajeGlobal={porcentajeGlobal} />
        </TabsContent>

        {/* Inventario */}
        <TabsContent value="inventario" className="mt-5 space-y-5">
          <RecomendacionCompra
            utilidadNeta={resumen.utilidadNeta}
            valvulas={valvulas}
            clientes={clientes}
            clientesFlujo={clientesFlujo}
            stockMap={stockMap}
            porcentajeGlobal={porcentajeGlobal}
            convert={convert}
          />
          <InventarioFinanzas
            stockMap={stockMap}
            valvulas={valvulas}
            clientesFlujo={clientesFlujo}
            clientes={clientes}
            costoPromedioValvula={costoPromedioValvula}
            utilidadNetaMes={resumen.utilidadNeta}
          />
        </TabsContent>

        {/* Config */}
        <TabsContent value="config" className="mt-5 space-y-5">
          <ConfigFinancieraForm />
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p className="font-medium text-sm mb-1">Cómo se calculan las finanzas</p>
            <p>• <strong>Ingreso bruto:</strong> 50% del ahorro de agua de cada cliente</p>
            <p>• <strong>Pago socios:</strong> % asignado a cada socio del negocio, descontado del ingreso bruto</p>
            <p>• <strong>Pago inversionistas:</strong> % asignado a cada inversionista del negocio, descontado del ingreso bruto</p>
            <p>• <strong>Gastos fijos:</strong> Se restan del ingreso operativo</p>
            <p>• <strong>Impuestos:</strong> Se aplican sobre la utilidad antes de impuestos ({tasaImpuesto}%)</p>
            <p>• <strong>Flujo de caja:</strong> Proyecta 36 meses considerando contratos y gastos</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}