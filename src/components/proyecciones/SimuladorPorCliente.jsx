import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Calculator, TrendingUp, DollarSign, Clock, FileText } from 'lucide-react';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';

export default function SimuladorPorCliente() {
  const [clienteId, setClienteId] = useState('');
  const [pctInversionista, setPctInversionista] = useState(60);
  const [resultado, setResultado] = useState(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });
  const { data: valvulas = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });
  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });
  const { convert } = useCurrencyRates();

  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global || 15;

  const simular = () => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente || !cliente.costo_agua_mensual) return;

    const moneda = cliente.moneda || 'USD';
    const costoAguaUSD = convert(cliente.costo_agua_mensual, moneda, 'USD');
    const pctAhorro = (cliente.porcentaje_ahorro || porcentajeGlobal) / 100;
    const contratoAnios = cliente.contrato_anios || 3;
    const mesesContrato = contratoAnios * 12;

    // Desglose de válvulas
    const cantidades = cliente.valvulas_cantidades || {};
    const desglose = [];
    Object.entries(cantidades).forEach(([vid, qty]) => {
      const v = valvulas.find(x => x.id === vid);
      if (v && qty > 0) desglose.push({ ...v, cantidad: qty });
    });

    const costoTotalValvulas = desglose.reduce((s, v) => s + v.costo_compra * v.cantidad, 0);
    const totalUnidades = desglose.reduce((s, v) => s + v.cantidad, 0);

    // Flat fee = (pct/2)% de la factura promedio
    const pct = cliente.porcentaje_ahorro || porcentajeGlobal;
    const parteEmpresaMes = costoAguaUSD * (pct / 200);
    const gananciaInvMes = parteEmpresaMes * (pctInversionista / 100);
    const empresaNetoMes = parteEmpresaMes - gananciaInvMes;

    const mesesPagoInv = Math.min(24, mesesContrato);
    const mesesLibres = Math.max(0, mesesContrato - mesesPagoInv);
    const mesesROI = gananciaInvMes > 0 ? costoTotalValvulas / gananciaInvMes : Infinity;

    const pagoTotalInversionista = gananciaInvMes * mesesPagoInv;
    const ingresoEmpresaDuranteInv = empresaNetoMes * mesesPagoInv;
    const ingresoEmpresaPostInv = parteEmpresaMes * mesesLibres;
    const ingresoContratoTotal = ingresoEmpresaDuranteInv + ingresoEmpresaPostInv;
    const utilidadContrato = ingresoContratoTotal - costoTotalValvulas;

    const retornoInvPct = costoTotalValvulas > 0 ? ((pagoTotalInversionista / costoTotalValvulas) * 100).toFixed(0) : 0;

    setResultado({
      cliente, moneda, costoAguaUSD, pctAhorro, contratoAnios, mesesContrato,
      desglose, costoTotalValvulas, totalUnidades,
      parteEmpresaMes, gananciaInvMes, empresaNetoMes,
      mesesPagoInv, mesesLibres, mesesROI,
      pagoTotalInversionista, ingresoEmpresaDuranteInv, ingresoEmpresaPostInv,
      ingresoContratoTotal, utilidadContrato, retornoInvPct,
    });
  };

  const clientesConDatos = clientes.filter(c => c.costo_agua_mensual && Object.keys(c.valvulas_cantidades || {}).length);

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-medium text-sm mb-1">Simulador por Cliente</p>
        <p>Selecciona un cliente real del CRM y simula cuánto ganaría un inversionista que financie todas sus válvulas como un paquete completo.</p>
      </div>

      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Seleccionar Cliente</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cliente (con datos de costeo)</label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
              <SelectContent>
                {clientesConDatos.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!clientesConDatos.length && (
              <p className="text-xs text-muted-foreground mt-1">No hay clientes con costeo configurado. Ve a Costeo primero.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">% para inversionista (del 50% empresa)</label>
            <Input type="number" value={pctInversionista} onChange={(e) => setPctInversionista(parseFloat(e.target.value) || 0)} className="mt-1 rounded-lg" />
          </div>
        </div>
        <Button onClick={simular} disabled={!clienteId} className="w-full mt-4 rounded-lg">
          <Calculator className="w-4 h-4 mr-2" /> Simular con este Cliente
        </Button>
      </div>

      {resultado && (
        <div className="space-y-4">
          {/* Header del cliente */}
          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <CompanyLogo cliente={resultado.cliente} />
              <div>
                <h3 className="font-semibold text-foreground">{resultado.cliente.nombre_empresa}</h3>
                <p className="text-xs text-muted-foreground">
                  {resultado.totalUnidades} válvulas — Costo agua: ${resultado.costoAguaUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mes USD — Contrato: {resultado.contratoAnios} años
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={DollarSign} label="Inversión total" value={`$${resultado.costoTotalValvulas.toLocaleString()}`} sub="Costo de todas las válvulas" color="text-foreground" />
              <MetricCard icon={TrendingUp} label="Flat fee / mes" value={`$${resultado.parteEmpresaMes.toFixed(0)}`} sub={`${(resultado.pctAhorro * 100 / 2).toFixed(1)}% de la factura`} color="text-green-600" />
              <MetricCard icon={Clock} label="ROI inversionista" value={`${resultado.mesesROI.toFixed(1)} meses`} sub={resultado.mesesROI <= 12 ? 'Recupera en ≤12m' : 'Más de 12 meses'} color={resultado.mesesROI <= 12 ? 'text-green-600' : 'text-red-600'} />
              <MetricCard icon={FileText} label="Utilidad contrato" value={`$${resultado.utilidadContrato.toFixed(0)}`} sub={`En ${resultado.contratoAnios} años`} color="text-primary" />
            </div>
          </div>

          {/* Desglose inversionista */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Propuesta para el Inversionista</h3>
            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-medium text-green-700 dark:text-green-300">
                "Invierte ${resultado.costoTotalValvulas.toLocaleString()} para equipar {resultado.cliente.nombre_empresa}"
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-green-600">Recibes mensual</p>
                  <p className="font-semibold text-green-700 dark:text-green-300 text-base">${resultado.gananciaInvMes.toFixed(2)}/mes</p>
                </div>
                <div>
                  <p className="text-green-600">Durante</p>
                  <p className="font-semibold text-green-700 dark:text-green-300 text-base">{resultado.mesesPagoInv} meses</p>
                </div>
                <div>
                  <p className="text-green-600">Total que recibes</p>
                  <p className="font-semibold text-green-700 dark:text-green-300 text-base">${resultado.pagoTotalInversionista.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-green-600">Retorno sobre inversión</p>
                  <p className="font-semibold text-green-700 dark:text-green-300 text-base">{resultado.retornoInvPct}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Desglose empresa */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Ingresos de la Empresa</h3>
            <div className="space-y-2 text-xs">
              <Row label="Empresa neto/mes (primeros 24m)" value={`$${resultado.empresaNetoMes.toFixed(2)}`} />
              <Row label={`Empresa/mes después del inv. (meses ${resultado.mesesPagoInv + 1}-${resultado.mesesContrato})`} value={`$${resultado.parteEmpresaMes.toFixed(2)}`} highlight />
              <Row label="Total durante inversionista" value={`$${resultado.ingresoEmpresaDuranteInv.toFixed(0)}`} />
              <Row label={`Total post-inversionista (${resultado.mesesLibres} meses)`} value={`$${resultado.ingresoEmpresaPostInv.toFixed(0)}`} />
              <div className="flex justify-between bg-primary/5 rounded-md px-3 py-2 text-sm">
                <span className="font-medium text-foreground">Ingreso total contrato</span>
                <span className="font-bold text-primary">${resultado.ingresoContratoTotal.toFixed(0)}</span>
              </div>
              <div className="flex justify-between bg-green-50 dark:bg-green-950/20 rounded-md px-3 py-2 text-sm">
                <span className="font-medium text-green-700 dark:text-green-300">Utilidad neta (- costo válvulas)</span>
                <span className="font-bold text-green-700 dark:text-green-300">${resultado.utilidadContrato.toFixed(0)}</span>
              </div>
            </div>
          </div>

          {/* Válvulas detalle */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Válvulas del Cliente</h3>
            <div className="space-y-2">
              {resultado.desglose.map((v, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm">
                  <span className="text-foreground">{v.cantidad}x {v.nombre} ({v.pulgadas}")</span>
                  <span className="font-medium text-foreground">${(v.costo_compra * v.cantidad).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className={`flex justify-between px-2 py-1.5 ${highlight ? 'bg-muted/40 rounded-md' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}