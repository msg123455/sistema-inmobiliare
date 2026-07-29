import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Edit2, TrendingUp, X, ChevronDown } from 'lucide-react';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import { useUserRole } from '@/hooks/useUserRole';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TIPOS = ['Individual', 'Empresa', 'Fondo de Capital', 'Otro'];
const MONEDAS = ['USD', 'COP', 'EUR'];

const EMPTY = {
  nombre: '', tipo: 'Individual', email: '', telefono: '',
  monto_invertido: '', porcentaje: '', moneda: 'USD',
  fecha_inversion: '', notas: '',
};

function fmt(amount, moneda = 'USD') {
  if (!amount) return '—';
  if (moneda === 'COP') return `COP ${Math.round(amount).toLocaleString('es-CO')}`;
  if (moneda === 'EUR') return `€ ${Math.round(amount).toLocaleString('de')}`;
  return `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

const TIPO_STYLE = {
  'Individual': 'bg-sky-100 text-sky-700',
  'Empresa': 'bg-violet-100 text-violet-700',
  'Fondo de Capital': 'bg-amber-100 text-amber-700',
  'Otro': 'bg-muted text-muted-foreground',
};

export default function Inversionistas() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [estadoOpen, setEstadoOpen] = useState(false);

  const { convert } = useCurrencyRates();

  const { data: inversionistas = [], isLoading } = useQuery({
    queryKey: ['inversionistas'],
    queryFn: () => base44.entities.Inversionista.list(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global || 15;

  const estadoCuenta = useMemo(() => {
    return inversionistas.map(inv => {
      const negocios = clientes.filter(c =>
        (c.inversionistas_asignados || []).some(ia => ia.inversionista_id === inv.id)
      );
      const detalle = negocios.map(c => {
        const ia = (c.inversionistas_asignados || []).find(x => x.inversionista_id === inv.id);
        const pctInv = (ia?.porcentaje || 0) / 100;
        const costoUSD = convert(c.costo_agua_mensual || 0, c.moneda || 'USD', 'USD');
        const pctAhorro = (c.porcentaje_ahorro || porcentajeGlobal) / 100;
        const gananciaInvMes = costoUSD * pctAhorro * 0.5 * pctInv;
        return { cliente: c, pctInv, gananciaInvMes };
      });
      const totalMes = detalle.reduce((s, d) => s + d.gananciaInvMes, 0);
      return { inv, detalle, totalMes };
    }).filter(e => e.detalle.length > 0);
  }, [inversionistas, clientes, porcentajeGlobal, convert]);

  const openNew = () => { setEditando(null); setForm(EMPTY); setShowForm(true); };

  const openEdit = (inv) => {
    setEditando(inv);
    setForm({
      nombre: inv.nombre || '', tipo: inv.tipo || 'Individual',
      email: inv.email || '', telefono: inv.telefono || '',
      monto_invertido: inv.monto_invertido || '', porcentaje: inv.porcentaje || '',
      moneda: inv.moneda || 'USD', fecha_inversion: inv.fecha_inversion || '',
      notas: inv.notas || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return;
    const data = {
      ...form,
      monto_invertido: parseFloat(form.monto_invertido) || 0,
      porcentaje: parseFloat(form.porcentaje) || 0,
    };
    if (editando) {
      await base44.entities.Inversionista.update(editando.id, data);
    } else {
      await base44.entities.Inversionista.create(data);
    }
    queryClient.invalidateQueries(['inversionistas']);
    setShowForm(false);
    setEditando(null);
    setForm(EMPTY);
  };

  const handleDelete = async (id) => {
    await base44.entities.Inversionista.delete(id);
    queryClient.invalidateQueries(['inversionistas']);
    setConfirmDelete(null);
  };

  const totalInvertido = inversionistas.reduce((sum, inv) => {
    if (inv.moneda === 'USD') return sum + (inv.monto_invertido || 0);
    return sum;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inversionistas</h1>
          <p className="text-sm text-muted-foreground mt-1">Registro centralizado de inversionistas y sus participaciones</p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> Agregar inversionista
        </Button>
      </div>

      {/* Summary */}
      {inversionistas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Total inversionistas</p>
            <p className="text-2xl font-bold text-foreground mt-1">{inversionistas.length}</p>
          </div>
          <div className="bg-card rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Capital total (USD)</p>
            <p className="text-2xl font-bold text-foreground mt-1">{fmt(totalInvertido)}</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">solo inversiones en USD</p>
          </div>
          <div className="bg-card rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Participación total</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {inversionistas.reduce((s, inv) => s + (inv.porcentaje || 0), 0).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-card rounded-xl border border-border/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editando ? 'Editar inversionista' : 'Nuevo inversionista'}</h3>
            <button onClick={() => { setShowForm(false); setEditando(null); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nombre *</label>
              <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-1 rounded-lg" placeholder="Nombre completo o empresa" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 rounded-lg" placeholder="email@ejemplo.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="mt-1 rounded-lg" placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Moneda</label>
              <select
                value={form.moneda}
                onChange={e => setForm({ ...form, moneda: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monto invertido</label>
              <Input type="number" value={form.monto_invertido} onChange={e => setForm({ ...form, monto_invertido: e.target.value })} className="mt-1 rounded-lg" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Participación (%)</label>
              <Input type="number" min={0} max={100} value={form.porcentaje} onChange={e => setForm({ ...form, porcentaje: e.target.value })} className="mt-1 rounded-lg" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha de inversión</label>
              <Input type="date" value={form.fecha_inversion} onChange={e => setForm({ ...form, fecha_inversion: e.target.value })} className="mt-1 rounded-lg" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Notas</label>
              <textarea
                value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })}
                className="mt-1 w-full p-3 border border-border rounded-lg text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows="2" placeholder="Términos, condiciones, observaciones..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditando(null); }} className="rounded-lg">Cancelar</Button>
            <Button onClick={handleSubmit} className="rounded-lg" disabled={!form.nombre.trim()}>
              {editando ? 'Guardar cambios' : 'Crear inversionista'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : inversionistas.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-xl border border-dashed border-border/60">
          <TrendingUp className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay inversionistas registrados</p>
          <Button onClick={openNew} variant="outline" className="mt-4 rounded-xl gap-2">
            <Plus className="w-3.5 h-3.5" /> Agregar inversionista
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/40 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {['Inversionista', 'Tipo', 'Contacto', 'Monto', 'Participación', 'Inversión', ''].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${['Monto', 'Participación', ''].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inversionistas.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 flex-shrink-0">
                        {inv.nombre?.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-foreground">{inv.nombre}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${TIPO_STYLE[inv.tipo] || TIPO_STYLE['Otro']}`}>
                      {inv.tipo || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{inv.email || '—'}</p>
                    <p className="text-xs text-muted-foreground">{inv.telefono || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-foreground">{fmt(inv.monto_invertido, inv.moneda)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.porcentaje > 0 ? (
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className="text-sm font-bold text-foreground">{inv.porcentaje}%</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, inv.porcentaje)}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {inv.fecha_inversion ? new Date(inv.fecha_inversion).toLocaleDateString('es') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (confirmDelete === inv.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(inv.id)} className="text-xs px-2 py-1 bg-destructive text-white rounded-lg">Sí</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 bg-muted rounded-lg">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(inv.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {estadoCuenta.length > 0 && (
        <Collapsible open={estadoOpen} onOpenChange={setEstadoOpen} className="bg-card rounded-xl border border-border/40">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Estado de cuenta por inversionista</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${estadoOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border/40">
            <div className="divide-y divide-border/20">
              {estadoCuenta.map(({ inv, detalle, totalMes }) => (
                <div key={inv.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">
                        {inv.nombre?.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-foreground">{inv.nombre}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">${totalMes.toFixed(2)}/mes</p>
                      <p className="text-xs text-muted-foreground">{detalle.length} negocio{detalle.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-9">
                    {detalle.map(({ cliente: c, pctInv, gananciaInvMes }) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">{c.nombre_empresa}</span>
                        <span className="text-foreground font-medium ml-4 flex-shrink-0">{Math.round(pctInv * 100)}% · ${gananciaInvMes.toFixed(2)}/mes</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}