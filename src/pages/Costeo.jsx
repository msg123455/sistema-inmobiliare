import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Edit2, RefreshCw, ChevronDown, Search, X, ArrowUpDown, Download, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import CompanyLogo from '@/components/crm/CompanyLogo';

// Modelo de cobro: flat fee = (porcentaje_ahorro / 2)% × factura_promedio
// Socios/Inversionistas: su % aplica sobre el flat fee total

const EMPTY_FORM = {
  consumo_promedio_mensual: '',
  facturas: [],         // array de montos mensuales → se promedia
  valvulas_cantidades: {},
  moneda: 'USD',
  porcentaje_ahorro: '',
  contrato_anios: '',
};

const MESES_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function Costeo() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [facturaInput, setFacturaInput] = useState('');
  const [newAhorro, setNewAhorro] = useState({
    anio: new Date().getFullYear(), mes: new Date().getMonth() + 1,
    ahorro_usd: '', ahorro_m3: '', consumo_real_m3: '',
  });
  const [savingAhorro, setSavingAhorro] = useState(false);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterMoneda, setFilterMoneda] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('');
  const [soloConDatos, setSoloConDatos] = useState(false);
  const [sortKey, setSortKey] = useState('nombre');
  const [sortDir, setSortDir] = useState('asc');
  const { rates, source: ratesSource, isLoading: loadingRates, convert, formatCurrency } = useCurrencyRates();

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: valvulas = [], isLoading: loadingValvulas } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const { data: ahorrosAll = [], refetch: refetchAhorros } = useQuery({
    queryKey: ['ahorros-all'],
    queryFn: () => base44.entities.AhorroMensual.list(),
    enabled: showForm && !!editingId,
  });

  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global || 15;

  const getValvulasDesglose = (cliente) => {
    const cantidades = cliente.valvulas_cantidades || {};
    const idsLegacy = cliente.valvulas_ids || [];
    const items = [];
    Object.entries(cantidades).forEach(([vid, qty]) => {
      const v = valvulas.find(x => x.id === vid);
      if (v && qty > 0) items.push({ ...v, cantidad: qty });
    });
    if (!items.length && idsLegacy.length) {
      idsLegacy.forEach(vid => {
        const v = valvulas.find(x => x.id === vid);
        if (v) items.push({ ...v, cantidad: 1 });
      });
    }
    return items;
  };

  const calcularROI = (cliente) => {
    const desglose = getValvulasDesglose(cliente);
    if (!desglose.length || !cliente.costo_agua_mensual) return null;

    const moneda = cliente.moneda || 'USD';
    const facturaPromUSD = convert(cliente.costo_agua_mensual, moneda, 'USD');
    const costoTotalValvulasUSD = desglose.reduce((s, v) => s + (v.costo_compra || 0) * v.cantidad, 0);
    const totalUnidades = desglose.reduce((s, v) => s + v.cantidad, 0);
    const pct = cliente.porcentaje_ahorro || porcentajeGlobal;

    // Flat fee = (pct/2)% de la factura promedio
    const flatFeeUSD = facturaPromUSD * (pct / 200);
    const flatFeeLocal = convert(flatFeeUSD, 'USD', moneda);

    const sociosAsignados = cliente.socios_asignados || [];
    const tieneSocio = sociosAsignados.length > 0;
    const totalSocioPct = tieneSocio
      ? sociosAsignados.reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100
      : 0;

    const invAsignados = cliente.inversionistas_asignados || [];
    const tieneInv = invAsignados.length > 0;
    const totalInvPct = tieneInv
      ? invAsignados.reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100
      : 0;

    const pagoSociosMes = flatFeeUSD * totalSocioPct;
    const pagoInvMes = flatFeeUSD * totalInvPct;
    const ingresoNetoUSD = flatFeeUSD - pagoSociosMes - pagoInvMes;

    const inversionEmpresaUSD = costoTotalValvulasUSD * (1 - totalSocioPct);
    const mesesROI = ingresoNetoUSD > 0 ? inversionEmpresaUSD / ingresoNetoUSD : 0;

    const numFacturas = (cliente.facturas_historicas || []).length;

    return {
      flatFeeUSD,
      flatFeeLocal,
      pagoSociosMes,
      pagoInvMes,
      ingresoNetoUSD,
      ingresoNetoLocal: convert(ingresoNetoUSD, 'USD', moneda),
      mesesROI: mesesROI.toFixed(1),
      desglose,
      totalUnidades,
      costoTotalValvulasUSD,
      inversionEmpresaUSD,
      moneda,
      tieneSocio,
      tieneInv,
      totalSocioPct,
      totalInvPct,
      numFacturas,
      facturaPromUSD,
    };
  };

  const exportCSV = () => {
    const headers = ['Empresa','Etapa','Moneda','% Ahorro','Factura Promedio','Flat Fee/Mes USD','Ingreso Neto/Mes USD','Inversión USD','ROI (meses)'];
    const rows = clientesFiltrados.map(c => {
      const roi = calcularROI(c);
      return [
        c.nombre_empresa, c.etapa_pipeline, c.moneda || 'USD',
        c.porcentaje_ahorro || porcentajeGlobal,
        c.costo_agua_mensual || '',
        roi ? roi.flatFeeUSD.toFixed(2) : '',
        roi ? roi.ingresoNetoUSD.toFixed(2) : '',
        roi ? roi.costoTotalValvulasUSD.toFixed(0) : '',
        roi ? roi.mesesROI : '',
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `costeo_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const clientesFiltrados = useMemo(() => {
    const q = search.toLowerCase();
    let list = clientes.filter(c => {
      if (q && !c.nombre_empresa?.toLowerCase().includes(q)) return false;
      if (filterMoneda && (c.moneda || 'USD') !== filterMoneda) return false;
      if (filterEtapa && c.etapa_pipeline !== filterEtapa) return false;
      if (soloConDatos && !c.costo_agua_mensual) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const roiA = calcularROI(a);
      const roiB = calcularROI(b);
      let va, vb;
      if (sortKey === 'nombre') {
        va = a.nombre_empresa || ''; vb = b.nombre_empresa || '';
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortKey === 'roi') { va = roiA ? parseFloat(roiA.mesesROI) : Infinity; vb = roiB ? parseFloat(roiB.mesesROI) : Infinity; }
      else if (sortKey === 'neto') { va = roiA?.ingresoNetoUSD ?? -Infinity; vb = roiB?.ingresoNetoUSD ?? -Infinity; }
      else if (sortKey === 'inversion') { va = roiA?.costoTotalValvulasUSD ?? -Infinity; vb = roiB?.costoTotalValvulasUSD ?? -Infinity; }
      else if (sortKey === 'flatfee') { va = roiA?.flatFeeUSD ?? -Infinity; vb = roiB?.flatFeeUSD ?? -Infinity; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [clientes, search, filterMoneda, filterEtapa, soloConDatos, sortKey, sortDir]);

  const hasFilters = search || filterMoneda || filterEtapa || soloConDatos;
  const clearFilters = () => { setSearch(''); setFilterMoneda(''); setFilterEtapa(''); setSoloConDatos(false); };

  const SortBtn = ({ col, label }) => (
    <button onClick={() => toggleSort(col)} className={`flex items-center gap-0.5 hover:text-foreground transition-colors ${sortKey === col ? 'text-primary font-semibold' : ''}`}>
      {label}
      <ArrowUpDown className={`w-3 h-3 ml-0.5 ${sortKey === col ? 'text-primary' : 'text-muted-foreground/50'}`} />
      {sortKey === col && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  const facturaPromedio = useMemo(() => {
    const validos = formData.facturas.filter(f => f > 0);
    if (!validos.length) return null;
    return validos.reduce((s, f) => s + f, 0) / validos.length;
  }, [formData.facturas]);

  const flatFeePreview = useMemo(() => {
    if (!facturaPromedio) return null;
    const pct = parseFloat(formData.porcentaje_ahorro) || porcentajeGlobal;
    return facturaPromedio * (pct / 200);
  }, [facturaPromedio, formData.porcentaje_ahorro, porcentajeGlobal]);

  const addFactura = () => {
    const val = parseFloat(facturaInput);
    if (!val || val <= 0) return;
    setFormData(fd => ({ ...fd, facturas: [...fd.facturas, val] }));
    setFacturaInput('');
  };

  const removeFactura = (idx) => {
    setFormData(fd => ({ ...fd, facturas: fd.facturas.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    const data = { moneda: formData.moneda, valvulas_cantidades: formData.valvulas_cantidades };
    if (formData.consumo_promedio_mensual !== '') data.consumo_promedio_mensual = parseFloat(formData.consumo_promedio_mensual);
    data.porcentaje_ahorro = formData.porcentaje_ahorro !== '' ? parseFloat(formData.porcentaje_ahorro) : null;
    data.contrato_anios = formData.contrato_anios !== '' ? parseFloat(formData.contrato_anios) : null;

    const validas = formData.facturas.filter(f => f > 0);
    if (validas.length > 0) {
      data.facturas_historicas = validas;
      data.costo_agua_mensual = validas.reduce((s, f) => s + f, 0) / validas.length;
    }

    await base44.entities.Cliente.update(editingId, data);
    setFormData(EMPTY_FORM);
    setFacturaInput('');
    setShowForm(false);
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
  };

  const handleGuardarAhorro = async () => {
    if (!newAhorro.ahorro_usd) return;
    setSavingAhorro(true);
    await base44.entities.AhorroMensual.create({
      cliente_id: editingId,
      anio: parseInt(newAhorro.anio),
      mes: parseInt(newAhorro.mes),
      ahorro_m3: parseFloat(newAhorro.ahorro_m3) || null,
      ahorro_usd: parseFloat(newAhorro.ahorro_usd),
      consumo_real_m3: parseFloat(newAhorro.consumo_real_m3) || null,
    });
    setNewAhorro({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, ahorro_m3: '', ahorro_usd: '', consumo_real_m3: '' });
    setSavingAhorro(false);
    refetchAhorros();
  };

  const handleEdit = (cliente) => {
    let cantidades = cliente.valvulas_cantidades || {};
    if (!Object.keys(cantidades).length && cliente.valvulas_ids?.length) {
      cantidades = {};
      cliente.valvulas_ids.forEach(id => { cantidades[id] = (cantidades[id] || 0) + 1; });
    }
    const facturas = cliente.facturas_historicas?.length
      ? [...cliente.facturas_historicas]
      : (cliente.costo_agua_mensual ? [cliente.costo_agua_mensual] : []);
    setFormData({
      consumo_promedio_mensual: cliente.consumo_promedio_mensual || '',
      facturas,
      valvulas_cantidades: cantidades,
      moneda: cliente.moneda || 'USD',
      porcentaje_ahorro: cliente.porcentaje_ahorro || '',
      contrato_anios: cliente.contrato_anios || '',
    });
    setFacturaInput('');
    setEditingId(cliente.id);
    setShowForm(true);
  };

  if (loadingClientes || loadingValvulas) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Costeo y ROI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Flat fee mensual = (% ahorro ÷ 2) × factura promedio
        </p>
      </div>

      {/* Tasas de cambio */}
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${loadingRates ? 'animate-spin' : ''}`} />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasas de Cambio — {ratesSource || 'Cargando...'}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['currency-rates'] })} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className={`w-3 h-3 ${loadingRates ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        <div className="flex gap-4 text-sm">
          <div><span className="text-muted-foreground">USD → COP:</span>{' '}<span className="font-medium text-foreground">${rates.COP?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
          <div><span className="text-muted-foreground">USD → EUR:</span>{' '}<span className="font-medium text-foreground">€{rates.EUR?.toFixed(4)}</span></div>
        </div>
      </div>

      {/* Catálogo de válvulas */}
      <Collapsible open={catalogoOpen} onOpenChange={setCatalogoOpen} className="bg-card rounded-xl">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catálogo de Válvulas (USD)</h2>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${catalogoOpen ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/40 px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...valvulas].sort((a, b) => b.pulgadas - a.pulgadas).map((v) => (
              <div key={v.id} className="bg-muted/40 rounded-xl p-4">
                <p className="font-medium text-sm text-foreground">{v.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{v.pulgadas}" — ${v.costo_compra} USD</p>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{formatCurrency(convert(v.costo_compra, 'USD', 'COP'), 'COP')}</span>
                  <span>{formatCurrency(convert(v.costo_compra, 'USD', 'EUR'), 'EUR')}</span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Tabla */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground mr-2">Análisis de Costeos</h2>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa…" className="pl-8 h-8 text-sm rounded-lg w-44" />
          </div>

          <Select value={filterMoneda || '__all__'} onValueChange={v => setFilterMoneda(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm rounded-lg w-[110px]"><SelectValue placeholder="Moneda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Moneda</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="COP">COP</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterEtapa || '__all__'} onValueChange={v => setFilterEtapa(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm rounded-lg w-[160px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las etapas</SelectItem>
              <SelectItem value="Prospecto">Prospecto</SelectItem>
              <SelectItem value="Lead">Lead</SelectItem>
              <SelectItem value="Evaluacion_tecnica">Hacer Evaluación Técnica</SelectItem>
              <SelectItem value="Instalacion">Pendiente Instalación</SelectItem>
              <SelectItem value="Activo">Activo</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={() => setSoloConDatos(v => !v)}
            className={`h-8 px-3 text-xs rounded-lg border transition-colors ${soloConDatos ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            Solo con costeo
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">{clientesFiltrados.length} empresa{clientesFiltrados.length !== 1 ? 's' : ''}</span>
          <button onClick={exportCSV} className="flex items-center gap-1.5 h-8 px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors">
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><SortBtn col="nombre" label="Empresa" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Válvulas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">% Ahorro</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Factura Prom.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><SortBtn col="flatfee" label="Flat Fee/Mes" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Socios/Inv.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><SortBtn col="neto" label="Ingreso Neto" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><SortBtn col="inversion" label="Inversión" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><SortBtn col="roi" label="ROI" /></th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {clientesFiltrados.map((cliente) => {
                const roi = calcularROI(cliente);
                const moneda = cliente.moneda || 'USD';
                return (
                  <tr key={cliente.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <CompanyLogo cliente={cliente} size="sm" />
                        <span className="text-foreground">{cliente.nombre_empresa}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {roi?.desglose?.length ? roi.desglose.map(v => `${v.cantidad}×${v.nombre}`).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {cliente.porcentaje_ahorro
                        ? <span className="font-medium">{cliente.porcentaje_ahorro}%</span>
                        : <span className="text-muted-foreground">{porcentajeGlobal}%</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {cliente.costo_agua_mensual ? (
                        <span>
                          {formatCurrency(cliente.costo_agua_mensual, moneda)}
                          {roi?.numFacturas > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">({roi.numFacturas}m)</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">
                      {roi ? formatCurrency(roi.flatFeeLocal, moneda) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {roi ? (
                        <div className="space-y-0.5">
                          {roi.tieneSocio && (
                            <span className="text-purple-600 dark:text-purple-400">
                              Socios {Math.round(roi.totalSocioPct * 100)}% (−${roi.pagoSociosMes.toFixed(0)})
                            </span>
                          )}
                          {roi.tieneInv && (
                            <span className="block text-amber-600 dark:text-amber-400">
                              Inv. {Math.round(roi.totalInvPct * 100)}% (−${roi.pagoInvMes.toFixed(0)})
                            </span>
                          )}
                          {!roi.tieneSocio && !roi.tieneInv && <span className="text-muted-foreground">—</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {roi ? formatCurrency(roi.ingresoNetoLocal, moneda) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {roi ? `$${roi.inversionEmpresaUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {roi ? `${roi.mesesROI} meses` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleEdit(cliente)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario de edición */}
      {showForm && (
        <div className="bg-card rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Editar Costeo — {clientes.find(c => c.id === editingId)?.nombre_empresa}
          </h2>
          <div className="space-y-4">

            {/* Moneda */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Moneda del cliente</label>
              <Select value={formData.moneda} onValueChange={(val) => setFormData({ ...formData, moneda: val })}>
                <SelectTrigger className="mt-1 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — Dólar</SelectItem>
                  <SelectItem value="COP">COP — Peso Colombiano</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Facturas históricas */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Facturas mensuales ({formData.moneda})
              </label>
              <p className="text-xs text-muted-foreground/70 mt-0.5 mb-2">
                Agrega una o más facturas para calcular el promedio. El flat fee se calcula sobre ese promedio.
              </p>

              {/* Lista de facturas */}
              {formData.facturas.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {formData.facturas.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                      <span className="text-xs text-muted-foreground w-12">Mes {i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {formatCurrency(f, formData.moneda)}
                      </span>
                      <button type="button" onClick={() => removeFactura(i)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Agregar factura */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={facturaInput}
                  onChange={e => setFacturaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFactura()}
                  placeholder={`Monto en ${formData.moneda}`}
                  className="rounded-lg"
                />
                <Button type="button" onClick={addFactura} variant="outline" size="sm" className="rounded-lg gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </Button>
              </div>

              {/* Resumen de facturas */}
              {facturaPromedio !== null && (
                <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Promedio ({formData.facturas.length} {formData.facturas.length === 1 ? 'factura' : 'facturas'})</span>
                    <span className="font-semibold text-foreground">{formatCurrency(facturaPromedio, formData.moneda)}</span>
                  </div>
                  {flatFeePreview !== null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Flat fee ({parseFloat(formData.porcentaje_ahorro) || porcentajeGlobal}% ÷ 2)
                      </span>
                      <span className="font-bold text-primary">{formatCurrency(flatFeePreview, formData.moneda)}/mes</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Consumo/Mes (m³)</label>
                <Input type="number" value={formData.consumo_promedio_mensual} onChange={(e) => setFormData({ ...formData, consumo_promedio_mensual: e.target.value })} placeholder="100" className="mt-1 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">% Ahorro personalizado</label>
                <Input type="number" value={formData.porcentaje_ahorro} onChange={(e) => setFormData({ ...formData, porcentaje_ahorro: e.target.value })} placeholder={`${porcentajeGlobal} (global)`} className="mt-1 rounded-lg" />
                <p className="text-xs text-muted-foreground mt-0.5">Vacío = global ({porcentajeGlobal}%)</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contrato (años)</label>
                <Input type="number" value={formData.contrato_anios} onChange={(e) => setFormData({ ...formData, contrato_anios: e.target.value })} placeholder="ej: 3" className="mt-1 rounded-lg" />
              </div>
            </div>

            {/* Válvulas */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Válvulas (cantidad por tipo)</label>
              <div className="mt-1 space-y-2">
                {[...valvulas].sort((a, b) => b.pulgadas - a.pulgadas).map((v) => {
                  const qty = formData.valvulas_cantidades[v.id] || 0;
                  return (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 bg-muted/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{v.nombre} ({v.pulgadas}")</p>
                        <p className="text-xs text-muted-foreground">${v.costo_compra} USD / {formatCurrency(convert(v.costo_compra, 'USD', formData.moneda), formData.moneda)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => {
                          const newQty = Math.max(0, qty - 1);
                          const updated = { ...formData.valvulas_cantidades };
                          if (newQty === 0) delete updated[v.id]; else updated[v.id] = newQty;
                          setFormData({ ...formData, valvulas_cantidades: updated });
                        }} className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors">−</button>
                        <span className="w-8 text-center text-sm font-medium text-foreground">{qty}</span>
                        <button type="button" onClick={() => setFormData({ ...formData, valvulas_cantidades: { ...formData.valvulas_cantidades, [v.id]: qty + 1 } })} className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.keys(formData.valvulas_cantidades).length > 0 && (
                <div className="mt-2 p-2 bg-primary/5 rounded-lg text-xs text-muted-foreground">
                  Total: {Object.values(formData.valvulas_cantidades).reduce((s, q) => s + q, 0)} válvulas —{' '}
                  Inversión: ${Object.entries(formData.valvulas_cantidades).reduce((s, [id, qty]) => {
                    const v = valvulas.find(x => x.id === id);
                    return s + (v?.costo_compra || 0) * qty;
                  }, 0).toLocaleString()} USD
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} className="flex-1 rounded-lg">Guardar</Button>
              <Button onClick={() => { setShowForm(false); setEditingId(null); setFormData(EMPTY_FORM); setFacturaInput(''); }} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
            </div>

            {/* Ahorros reales */}
            <div className="pt-4 border-t border-border/40 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Ahorros reales</h3>
              </div>

              {/* History */}
              {(() => {
                const ahorrosCliente = ahorrosAll
                  .filter(a => a.cliente_id === editingId)
                  .sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
                if (!ahorrosCliente.length) return (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-3">
                    Sin registros de ahorro todavía.
                  </p>
                );
                return (
                  <div className="rounded-lg overflow-hidden border border-border/40">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Mes</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Ahorro USD</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">m³</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border/20">
                        {ahorrosCliente.map(a => (
                          <tr key={a.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 text-foreground">{MESES_LABELS[a.mes - 1]} {a.anio}</td>
                            <td className="px-3 py-2 text-right font-medium text-primary">${(a.ahorro_usd || 0).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{a.ahorro_m3 ? a.ahorro_m3.toFixed(1) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Register new month */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Año</label>
                  <Input type="number" value={newAhorro.anio} onChange={e => setNewAhorro({ ...newAhorro, anio: e.target.value })} className="mt-1 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mes</label>
                  <select value={newAhorro.mes} onChange={e => setNewAhorro({ ...newAhorro, mes: e.target.value })}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {MESES_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ahorro USD *</label>
                  <Input type="number" step="0.01" value={newAhorro.ahorro_usd} onChange={e => setNewAhorro({ ...newAhorro, ahorro_usd: e.target.value })} placeholder="0.00" className="mt-1 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">m³ ahorrados</label>
                  <Input type="number" step="0.01" value={newAhorro.ahorro_m3} onChange={e => setNewAhorro({ ...newAhorro, ahorro_m3: e.target.value })} placeholder="0" className="mt-1 rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Consumo real m³</label>
                  <Input type="number" step="0.01" value={newAhorro.consumo_real_m3} onChange={e => setNewAhorro({ ...newAhorro, consumo_real_m3: e.target.value })} placeholder="0" className="mt-1 rounded-lg" />
                </div>
              </div>
              <Button onClick={handleGuardarAhorro} disabled={savingAhorro || !newAhorro.ahorro_usd} size="sm" variant="outline" className="rounded-lg">
                {savingAhorro ? 'Guardando…' : 'Registrar mes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
