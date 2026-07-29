import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShoppingCart, Plus, CheckCircle2, Clock, AlertCircle,
  Truck, Trash2, X, Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

const FILTROS = [
  { key: 'todas',     label: 'Todas' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'recibida',  label: 'Recibidas' },
];

const DIAS_ENTREGA = 21;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function StatusBadge({ orden }) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const esperada = new Date(orden.fecha_esperada + 'T12:00:00');
  const vencida = orden.estado === 'pendiente' && esperada < hoy;

  if (orden.estado === 'recibida') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
        <CheckCircle2 className="w-3 h-3" /> Recibida
      </span>
    );
  }
  if (vencida) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
        <AlertCircle className="w-3 h-3" /> Vencida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <Clock className="w-3 h-3" /> En tránsito
    </span>
  );
}

function ItemRow({ item, valvulas, onChange, onRemove }) {
  const v = valvulas.find(x => x.id === item.valvula_id);
  const total = (v?.costo_compra || 0) * (item.cantidad || 0);

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-6">
        <select
          value={item.valvula_id}
          onChange={e => {
            const selected = valvulas.find(x => x.id === e.target.value);
            onChange({ ...item, valvula_id: e.target.value, costo_unitario: selected?.costo_compra || 0 });
          }}
          className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Seleccionar válvula…</option>
          {valvulas.map(v => (
            <option key={v.id} value={v.id}>{v.nombre} ({v.pulgadas}")</option>
          ))}
        </select>
      </div>
      <div className="col-span-3">
        <Input
          type="number"
          min="1"
          value={item.cantidad}
          onChange={e => onChange({ ...item, cantidad: parseInt(e.target.value) || 1 })}
          placeholder="Cant."
          className="rounded-lg h-9 text-sm"
        />
      </div>
      <div className="col-span-2 text-right">
        {v ? (
          <div>
            <p className="text-sm font-medium text-foreground tabular-nums">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-muted-foreground">${v.costo_compra}/u</p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="col-span-1 flex justify-end">
        <button onClick={onRemove} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function OrdenesCompra() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [filtro, setFiltro] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const emptyForm = {
    notas: '',
    items: [{ valvula_id: '', cantidad: 1, costo_unitario: 0 }],
  };
  const [form, setForm] = useState(emptyForm);

  const { data: ordenes = [], refetch } = useQuery({
    queryKey: ['ordenes-compra'],
    queryFn: () => base44.entities.OrdenCompra.list(),
    refetchOnMount: 'always',
  });

  const { data: valvulas = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 60_000,
  });

  // On load: check for overdue POs and send email notifications
  useEffect(() => {
    if (!ordenes.length || !users.length) return;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencidas = ordenes.filter(o =>
      o.estado === 'pendiente' &&
      !o.notificacion_enviada &&
      new Date(o.fecha_esperada + 'T12:00:00') < hoy
    );
    vencidas.forEach(orden => {
      users.forEach(u => {
        base44.integrations.Core.SendEmail({
          to: u.email,
          subject: `Orden ${orden.numero || orden.id.slice(-6)} — inventario debería haber llegado`,
          body: `Hola ${u.full_name || ''},\n\nLa orden de compra ${orden.numero || '#' + orden.id.slice(-6)}${orden.proveedor ? ' de ' + orden.proveedor : ''} tenía fecha estimada de llegada el ${new Date(orden.fecha_esperada + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\nEl inventario debería haber llegado. Por favor verifica el estado y márcala como recibida cuando confirmes la entrega.\n\nAquaROI`,
          from_name: 'AquaROI',
        }).catch(() => {});
      });
      base44.entities.OrdenCompra.update(orden.id, { notificacion_enviada: true })
        .then(() => queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] }))
        .catch(() => {});
    });
  }, [ordenes.length, users.length]);

  const ordenesFiltradas = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return [...ordenes]
      .filter(o => {
        if (filtro === 'pendiente') return o.estado === 'pendiente';
        if (filtro === 'recibida') return o.estado === 'recibida';
        return true;
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
        return new Date(b.fecha_creacion) - new Date(a.fecha_creacion);
      });
  }, [ordenes, filtro]);

  const updateItem = (idx, newItem) => {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? newItem : it) }));
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { valvula_id: '', cantidad: 1, costo_unitario: 0 }] }));
  };

  const totalOrden = form.items.reduce((s, it) => {
    const v = valvulas.find(x => x.id === it.valvula_id);
    return s + (v?.costo_compra || 0) * (it.cantidad || 0);
  }, 0);
  const fechaEsperada = addDays(new Date(), DIAS_ENTREGA);

  const handleCrear = async () => {
    const itemsValidos = form.items.filter(it => it.valvula_id && it.cantidad > 0);
    if (!itemsValidos.length) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const numero = `OC-${String(ordenes.length + 1).padStart(3, '0')}`;
      const hoy = new Date().toISOString().split('T')[0];
      const itemsConNombre = itemsValidos.map(it => {
        const v = valvulas.find(x => x.id === it.valvula_id);
        return {
          valvula_id: it.valvula_id,
          valvula_nombre: v ? `${v.nombre} (${v.pulgadas}")` : '',
          cantidad: Number(it.cantidad),
          costo_unitario: Number(v?.costo_compra || 0),
        };
      });
      const payload = {
        numero,
        estado: 'pendiente',
        fecha_creacion: hoy,
        fecha_esperada: fechaEsperada,
        items: itemsConNombre,
      };
      if (form.notas) payload.notas = form.notas;
      if (totalOrden > 0) payload.total_usd = totalOrden;
      await base44.entities.OrdenCompra.create(payload);
      setForm(emptyForm);
      setShowForm(false);
      await queryClient.refetchQueries({ queryKey: ['ordenes-compra'] });
    } catch (err) {
      console.error('Error creando orden:', err);
      setErrorMsg(err?.message || JSON.stringify(err) || 'Error desconocido al crear la orden');
    } finally {
      setSaving(false);
    }
  };

  const handleRecibir = async (orden) => {
    setReceiving(orden.id);
    const hoy = new Date().toISOString().split('T')[0];
    for (const item of (orden.items || [])) {
      await base44.entities.MovimientoInventario.create({
        valvula_id: item.valvula_id,
        tipo: 'entrada',
        cantidad: item.cantidad,
        motivo: `Recepción ${orden.numero || 'OC'} — ${item.valvula_nombre || ''}`,
      });
    }
    await base44.entities.OrdenCompra.update(orden.id, {
      estado: 'recibida',
      fecha_recepcion: hoy,
    });
    queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] });
    queryClient.invalidateQueries({ queryKey: ['movimientos'] });
    setReceiving(null);
  };

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar esta orden de compra?')) return;
    await base44.entities.OrdenCompra.delete(id);
    queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] });
  };

  const pendientes = ordenes.filter(o => o.estado === 'pendiente').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Órdenes de Compra</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendientes > 0 ? `${pendientes} orden${pendientes !== 1 ? 'es' : ''} en tránsito` : 'Sin órdenes pendientes'}
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} size="sm" className="gap-1.5 rounded-lg">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nueva orden'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card rounded-xl p-5 space-y-4 border border-border/60">
          <h3 className="text-sm font-semibold text-foreground">Nueva orden de compra</h3>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-amber-600" />
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Llegada estimada</p>
            </div>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {new Date(fechaEsperada + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-[10px] text-muted-foreground">{DIAS_ENTREGA} días hábiles estimados</p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-0">
              <div className="col-span-6">Válvula</div>
              <div className="col-span-3">Cantidad</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {form.items.map((item, idx) => (
              <ItemRow
                key={idx}
                item={item}
                valvulas={valvulas}
                onChange={newItem => updateItem(idx, newItem)}
                onRemove={() => removeItem(idx)}
              />
            ))}
            <button onClick={addItem} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
              <Plus className="w-3 h-3" /> Agregar válvula
            </button>
          </div>

          {totalOrden > 0 && (
            <div className="flex justify-end">
              <div className="bg-muted/40 rounded-lg px-4 py-2 text-right">
                <p className="text-xs text-muted-foreground">Total orden</p>
                <p className="text-lg font-bold text-foreground">${totalOrden.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD</p>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              placeholder="Observaciones opcionales…"
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{errorMsg}</p>
            </div>
          )}

          <Button
            onClick={handleCrear}
            disabled={saving || !form.items.some(it => it.valvula_id)}
            className="w-full rounded-xl gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            {saving ? 'Creando orden…' : 'Crear orden de compra'}
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filtro === f.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {f.label}
            {f.key === 'pendiente' && pendientes > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">{pendientes}</span>
            )}
          </button>
        ))}
      </div>

      {/* Order list */}
      <div className="space-y-3">
        {ordenesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-xl">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">Sin órdenes en esta vista</p>
            <button onClick={() => { setShowForm(true); setFiltro('todas'); }}
              className="mt-3 text-xs text-primary hover:underline">
              Crear primera orden
            </button>
          </div>
        ) : (
          ordenesFiltradas.map(orden => {
            const isExpanded = expandedId === orden.id;
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const esperada = new Date(orden.fecha_esperada + 'T12:00:00');
            const vencida = orden.estado === 'pendiente' && esperada < hoy;
            const diasRestantes = Math.ceil((esperada - hoy) / 86400000);
            const totalItems = (orden.items || []).reduce((s, it) => s + (it.cantidad || 0), 0);

            return (
              <div key={orden.id} className={`bg-card rounded-xl overflow-hidden border ${vencida ? 'border-destructive/30' : 'border-border/40'}`}>
                {/* Card header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : orden.id)}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    orden.estado === 'recibida' ? 'bg-green-100 dark:bg-green-950/40' :
                    vencida ? 'bg-destructive/10' : 'bg-amber-100 dark:bg-amber-950/30'
                  }`}>
                    {orden.estado === 'recibida'
                      ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : vencida ? <AlertCircle className="w-5 h-5 text-destructive" />
                      : <Truck className="w-5 h-5 text-amber-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">
                        {orden.numero || `#${orden.id.slice(-6).toUpperCase()}`}
                      </p>
                      {orden.proveedor && (
                        <span className="text-xs text-muted-foreground">· {orden.proveedor}</span>
                      )}
                      <StatusBadge orden={orden} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {totalItems} válvula{totalItems !== 1 ? 's' : ''}
                        {orden.total_usd ? ` · $${orden.total_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD` : ''}
                      </span>
                      {orden.estado === 'pendiente' && (
                        <span className={`text-xs font-medium ${vencida ? 'text-destructive' : diasRestantes <= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {vencida
                            ? `Venció hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''}`
                            : `Llega en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`
                          }
                        </span>
                      )}
                      {orden.estado === 'recibida' && orden.fecha_recepcion && (
                        <span className="text-xs text-muted-foreground">
                          Recibida: {new Date(orden.fecha_recepcion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {orden.estado === 'pendiente' && (
                      <Button
                        size="sm"
                        onClick={e => { e.stopPropagation(); handleRecibir(orden); }}
                        disabled={receiving === orden.id}
                        className="rounded-lg h-8 gap-1.5 text-xs"
                      >
                        {receiving === orden.id
                          ? <div className="w-3 h-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          : <Package className="w-3.5 h-3.5" />
                        }
                        {receiving === orden.id ? 'Procesando…' : 'Recibida'}
                      </Button>
                    )}
                    {isAdmin && orden.estado === 'pendiente' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleEliminar(orden.id); }}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground/40 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-border/30 pt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Fecha creación</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {orden.fecha_creacion ? new Date(orden.fecha_creacion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Llegada estimada</p>
                        <p className={`font-medium mt-0.5 ${vencida ? 'text-destructive' : 'text-foreground'}`}>
                          {new Date(orden.fecha_esperada + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      {orden.fecha_recepcion && (
                        <div>
                          <p className="text-muted-foreground">Recibida el</p>
                          <p className="font-medium text-green-600 mt-0.5">
                            {new Date(orden.fecha_recepcion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ítems</p>
                      {(orden.items || []).map((item, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg">
                          <span className="text-sm font-medium text-foreground flex-1">{item.valvula_nombre || item.valvula_id}</span>
                          <span className="text-xs text-muted-foreground">×{item.cantidad}</span>
                          {item.costo_unitario > 0 && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              ${(item.costo_unitario * item.cantidad).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {orden.notas && (
                      <div className="bg-muted/30 rounded-lg px-3 py-2">
                        <p className="text-xs text-muted-foreground">Notas: <span className="text-foreground">{orden.notas}</span></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}