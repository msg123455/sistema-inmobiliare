import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, CheckCircle, Clock, FileText } from 'lucide-react';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';

const ESTADOS = [
  { value: 'propuesta', label: 'Propuesta', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'aceptado', label: 'Aceptado', color: 'bg-blue-100 text-blue-700' },
  { value: 'activo', label: 'Activo', color: 'bg-green-100 text-green-700' },
  { value: 'completado', label: 'Completado', color: 'bg-muted text-muted-foreground' },
];

export default function EscenariosGuardados() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    cliente_id: '', nombre_inversionista: '', pct_inversionista: 60,
    precio_venta_valvulas: '', meses_pago: 24, fecha_inicio: '',
  });
  const queryClient = useQueryClient();
  const { convert } = useCurrencyRates();

  const { data: escenarios = [] } = useQuery({
    queryKey: ['escenarios-inv'],
    queryFn: () => base44.entities.EscenarioInversionista.list(),
  });

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

  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global || 15;


  const calcularYGuardar = async () => {
    const cliente = clientes.find(c => c.id === form.cliente_id);
    if (!cliente || !form.precio_venta_valvulas) return;

    const moneda = cliente.moneda || 'USD';
    const costoAguaUSD = convert(cliente.costo_agua_mensual || 0, moneda, 'USD');
    const pctAhorro = (cliente.porcentaje_ahorro || porcentajeGlobal) / 100;

    // Costo real de las válvulas
    const cantidades = cliente.valvulas_cantidades || {};
    let costoRealTotal = 0;
    Object.entries(cantidades).forEach(([vid, qty]) => {
      const v = valvulas.find(x => x.id === vid);
      if (v) costoRealTotal += v.costo_compra * qty;
    });

    const ahorroMes = costoAguaUSD * pctAhorro;
    const parteEmpresaMes = ahorroMes * 0.5;
    const gananciaInvMes = parteEmpresaMes * (form.pct_inversionista / 100);
    const empresaNetoMes = parteEmpresaMes - gananciaInvMes;
    const precioVenta = parseFloat(form.precio_venta_valvulas);
    const mesesROI = gananciaInvMes > 0 ? precioVenta / gananciaInvMes : 0;
    const sobreprecio = precioVenta - costoRealTotal;
    const valvulasExtra = costoRealTotal > 0 && sobreprecio > 0 ? Math.floor(sobreprecio / costoRealTotal) : 0;

    await base44.entities.EscenarioInversionista.create({
      cliente_id: form.cliente_id,
      nombre_cliente: cliente.nombre_empresa,
      nombre_inversionista: form.nombre_inversionista || 'Por definir',
      pct_inversionista: form.pct_inversionista,
      precio_venta_valvulas: precioVenta,
      costo_real_valvulas: costoRealTotal,
      ganancia_inv_mes: gananciaInvMes,
      meses_pago: form.meses_pago,
      meses_roi: mesesROI,
      empresa_neto_mes: empresaNetoMes,
      estado: 'propuesta',
      fecha_inicio: form.fecha_inicio || null,
      valvulas_extra: valvulasExtra,
    });

    setForm({ cliente_id: '', nombre_inversionista: '', pct_inversionista: 60, precio_venta_valvulas: '', meses_pago: 24, fecha_inicio: '' });
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['escenarios-inv'] });
  };

  const updateEstado = async (id, estado) => {
    await base44.entities.EscenarioInversionista.update(id, { estado });
    queryClient.invalidateQueries({ queryKey: ['escenarios-inv'] });
  };

  const handleDelete = async (id) => {
    await base44.entities.EscenarioInversionista.delete(id);
    queryClient.invalidateQueries({ queryKey: ['escenarios-inv'] });
  };

  const clientesConDatos = clientes.filter(c => c.costo_agua_mensual && Object.keys(c.valvulas_cantidades || {}).length);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Escenarios con Inversionistas</h3>
          <p className="text-xs text-muted-foreground">Guarda y trackea propuestas de inversión por cliente</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Nuevo Escenario
        </Button>
      </div>

      {showForm && (
        <div className="bg-muted/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cliente</label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {clientesConDatos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre_empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inversionista</label>
              <Input value={form.nombre_inversionista} onChange={(e) => setForm({ ...form, nombre_inversionista: e.target.value })} placeholder="Nombre" className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Precio venta válvulas (USD)</label>
              <Input type="number" value={form.precio_venta_valvulas} onChange={(e) => setForm({ ...form, precio_venta_valvulas: e.target.value })} placeholder="ej: 20000" className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">% Inversionista</label>
              <Input type="number" value={form.pct_inversionista} onChange={(e) => setForm({ ...form, pct_inversionista: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Meses de pago</label>
              <Input type="number" value={form.meses_pago} onChange={(e) => setForm({ ...form, meses_pago: parseInt(e.target.value) || 24 })} className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fecha inicio</label>
              <Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-1 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={calcularYGuardar} size="sm" className="rounded-lg">Calcular y Guardar</Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="rounded-lg">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Escenarios de inversionistas */}
      <div className="space-y-3">
        {escenarios.map((esc) => {
          const estadoInfo = ESTADOS.find(e => e.value === esc.estado) || ESTADOS[0];
          const cliente = clientes.find(c => c.id === esc.cliente_id);
          return (
            <div key={esc.id} className="bg-card rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {cliente && <CompanyLogo cliente={cliente} size="sm" />}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{esc.nombre_cliente}</p>
                    <p className="text-xs text-muted-foreground">{esc.nombre_inversionista || 'Sin inversionista'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={esc.estado} onValueChange={(v) => updateEstado(esc.id, v)}>
                    <SelectTrigger className={`h-7 text-xs rounded-full px-3 ${estadoInfo.color} border-0`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => handleDelete(esc.id)} className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground">Precio venta</p>
                  <p className="font-semibold text-foreground">${esc.precio_venta_valvulas?.toLocaleString()}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground">Costo real</p>
                  <p className="font-semibold text-foreground">${esc.costo_real_valvulas?.toLocaleString()}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground">Inv. recibe/mes</p>
                  <p className="font-semibold text-green-600">${esc.ganancia_inv_mes?.toFixed(0)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground">ROI</p>
                  <p className={`font-semibold ${esc.meses_roi <= 12 ? 'text-green-600' : 'text-red-600'}`}>{esc.meses_roi?.toFixed(1)} meses</p>
                </div>
              </div>
            </div>
          );
        })}

        {!escenarios.length && <p className="text-sm text-muted-foreground text-center py-8">No hay escenarios guardados.</p>}
      </div>
    </div>
  );
}