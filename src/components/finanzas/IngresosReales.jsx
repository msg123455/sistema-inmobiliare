import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, Circle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function IngresosReales({ clientes, porcentajeGlobal }) {
  const { convert } = useCurrencyRates();
  const queryClient = useQueryClient();
  const anioActual = new Date().getFullYear();
  const mesActual = new Date().getMonth() + 1;

  const [anio, setAnio] = useState(anioActual);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ cliente_id: '', mes: mesActual, monto_real_usd: '', notas: '' });
  const [saving, setSaving] = useState(false);

  const { data: ingresos = [] } = useQuery({
    queryKey: ['ingresos-reales', anio],
    queryFn: () => base44.entities.IngresoReal.list(),
  });

  const ingresosAnio = ingresos.filter(i => i.anio === anio);

  const clientesConIngreso = useMemo(
    () => clientes.filter(c => c.costo_agua_mensual && c.etapa_pipeline === 'Activo'),
    [clientes]
  );

  const proyectadoPorCliente = useMemo(() => {
    const map = {};
    clientesConIngreso.forEach(c => {
      const moneda = c.moneda || 'USD';
      const costoUSD = convert(c.costo_agua_mensual, moneda, 'USD');
      const pct = (c.porcentaje_ahorro || porcentajeGlobal) / 100;
      const sociosPct = (c.socios_asignados || []).reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100;
      const invPct = (c.inversionistas_asignados || []).reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100;
      map[c.id] = costoUSD * pct * 0.5 * (1 - sociosPct - invPct);
    });
    return map;
  }, [clientesConIngreso, convert, porcentajeGlobal]);

  const handleGuardar = async () => {
    if (!form.cliente_id || !form.monto_real_usd) return;
    setSaving(true);
    const existing = ingresosAnio.find(i => i.cliente_id === form.cliente_id && i.mes === form.mes);
    if (existing) {
      await base44.entities.IngresoReal.update(existing.id, {
        monto_real_usd: parseFloat(form.monto_real_usd),
        notas: form.notas,
      });
    } else {
      await base44.entities.IngresoReal.create({
        cliente_id: form.cliente_id,
        anio,
        mes: parseInt(form.mes),
        monto_real_usd: parseFloat(form.monto_real_usd),
        notas: form.notas,
      });
    }
    setSaving(false);
    setShowForm(false);
    setForm({ cliente_id: '', mes: mesActual, monto_real_usd: '', notas: '' });
    queryClient.invalidateQueries(['ingresos-reales']);
  };

  // Totales por mes
  const totalesPorMes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const reales = ingresosAnio.filter(ing => ing.mes === m);
      const realTotal = reales.reduce((s, r) => s + r.monto_real_usd, 0);
      const proyectadoTotal = clientesConIngreso.reduce((s, c) => s + (proyectadoPorCliente[c.id] || 0), 0);
      return { mes: m, label: MESES[i], real: realTotal, proyectado: proyectadoTotal, registros: reales.length };
    });
  }, [ingresosAnio, clientesConIngreso, proyectadoPorCliente]);

  const totalRealAnio = totalesPorMes.reduce((s, m) => s + m.real, 0);
  const totalProyAnio = totalesPorMes.reduce((s, m) => s + m.proyectado, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ingresos Reales vs Proyectados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Registrá lo que realmente cobrastés cada mes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[anioActual - 1, anioActual, anioActual + 1].map(a => (
              <button
                key={a}
                onClick={() => setAnio(a)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${anio === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {a}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Registrar
          </Button>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-muted/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cliente</label>
              <Select value={form.cliente_id} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {clientesConIngreso.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre_empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mes</label>
              <Select value={String(form.mes)} onValueChange={v => setForm({ ...form, mes: parseInt(v) })}>
                <SelectTrigger className="mt-1 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Monto real (USD)</label>
              <Input
                type="number"
                value={form.monto_real_usd}
                onChange={e => setForm({ ...form, monto_real_usd: e.target.value })}
                placeholder="0"
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
              <Input
                value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })}
                placeholder="Observaciones"
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGuardar} disabled={saving || !form.cliente_id || !form.monto_real_usd} size="sm" className="rounded-lg">
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="rounded-lg">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Resumen anual */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Proyectado {anio}</p>
          <p className="text-xl font-bold text-muted-foreground">${totalProyAnio.toFixed(0)}</p>
        </div>
        <div className="bg-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Real registrado {anio}</p>
          <p className="text-xl font-bold text-primary">${totalRealAnio.toFixed(0)}</p>
        </div>
        <div className="bg-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Diferencia</p>
          {(() => {
            const diff = totalRealAnio - totalProyAnio;
            const color = diff >= 0 ? 'text-green-600' : 'text-red-600';
            const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
            return (
              <div className="flex items-center gap-1.5">
                <Icon className={`w-4 h-4 ${color}`} />
                <p className={`text-xl font-bold ${color}`}>{diff >= 0 ? '+' : ''}${diff.toFixed(0)}</p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tabla mensual */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Mes</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Proyectado</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Real</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Diferencia</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {totalesPorMes.map(({ mes, label, real, proyectado, registros }) => {
                const diff = real - proyectado;
                const isFuturo = anio > anioActual || (anio === anioActual && mes > mesActual);
                const tieneDatos = registros > 0;
                return (
                  <tr key={mes} className={isFuturo ? 'opacity-40' : ''}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{label}</td>
                    <td className="text-right px-4 py-2.5 text-muted-foreground">${proyectado.toFixed(0)}</td>
                    <td className="text-right px-4 py-2.5 font-semibold text-foreground">
                      {tieneDatos ? `$${real.toFixed(0)}` : '—'}
                    </td>
                    <td className={`text-right px-4 py-2.5 font-semibold ${tieneDatos ? (diff >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                      {tieneDatos ? `${diff >= 0 ? '+' : ''}$${diff.toFixed(0)}` : '—'}
                    </td>
                    <td className="text-center px-4 py-2.5">
                      {isFuturo ? (
                        <span className="text-muted-foreground/50 text-[10px]">futuro</span>
                      ) : tieneDatos ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-4 py-2.5 font-bold text-foreground">Total {anio}</td>
                <td className="text-right px-4 py-2.5 font-bold text-muted-foreground">${totalProyAnio.toFixed(0)}</td>
                <td className="text-right px-4 py-2.5 font-bold text-primary">${totalRealAnio.toFixed(0)}</td>
                <td className={`text-right px-4 py-2.5 font-bold ${totalRealAnio - totalProyAnio >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalRealAnio > 0 ? `${(totalRealAnio - totalProyAnio) >= 0 ? '+' : ''}$${(totalRealAnio - totalProyAnio).toFixed(0)}` : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detalle por cliente del mes actual */}
      {clientesConIngreso.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40">
            <h4 className="text-sm font-semibold text-foreground">Detalle por cliente — {MESES[mesActual - 1]} {anioActual}</h4>
          </div>
          <div className="divide-y divide-border/20">
            {clientesConIngreso.map(c => {
              const proyectado = proyectadoPorCliente[c.id] || 0;
              const real = ingresosAnio.find(i => i.cliente_id === c.id && i.mes === mesActual);
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CompanyLogo cliente={c} size="sm" />
                  <span className="flex-1 text-sm text-foreground truncate">{c.nombre_empresa}</span>
                  <span className="text-xs text-muted-foreground">${proyectado.toFixed(0)} proy.</span>
                  {real ? (
                    <span className="text-xs font-semibold text-green-600">${real.monto_real_usd.toFixed(0)} real</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">sin registrar</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
