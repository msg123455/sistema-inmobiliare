import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wallet, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha, periodo, diasHasta,
} from '@/components/modulo';

const PagoCanon = base44.entities.PagoCanon;
const Arrendatario = base44.entities.Arrendatario;

const ESTADOS = ['Pendiente', 'Parcial', 'Pagado', 'Mora'];
const MEDIOS = ['PSE', 'Consignacion', 'Efectivo', 'Transferencia', 'Otro'];

/** Periodo actual en YYYY-MM. */
function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Estado real del pago, calculado en el momento.
 *
 * El campo `estado` guardado envejece: una fila queda "Pendiente" para siempre
 * aunque su vencimiento ya paso, porque nadie corre un job que la mueva a Mora.
 * La cartera se lee de lo pagado contra lo debido y la fecha, no de un enum que
 * alguien tenia que acordarse de actualizar.
 */
function estadoReal(p) {
  const total = Number(p.valor_total) || 0;
  const pagado = Number(p.valor_pagado) || 0;
  if (pagado >= total && total > 0) return 'Pagado';
  const dias = diasHasta(p.fecha_vencimiento);
  const vencido = dias !== null && dias < 0;
  if (pagado > 0) return vencido ? 'Mora' : 'Parcial';
  return vencido ? 'Mora' : 'Pendiente';
}

function diasMora(p) {
  if (estadoReal(p) !== 'Mora') return 0;
  const d = diasHasta(p.fecha_vencimiento);
  return d === null ? 0 : Math.abs(d);
}

function RegistrarPago({ pago, onCerrar, onGuardado }) {
  const pendiente = (Number(pago?.valor_total) || 0) - (Number(pago?.valor_pagado) || 0);
  const [monto, setMonto] = useState(String(pendiente > 0 ? pendiente : ''));
  const [medio, setMedio] = useState('PSE');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const m = Number(monto) || 0;
    if (m <= 0) return toast.error('El monto debe ser mayor a cero');
    setGuardando(true);
    try {
      const pagadoTotal = (Number(pago.valor_pagado) || 0) + m;
      const total = Number(pago.valor_total) || 0;
      const saldo = Math.max(total - pagadoTotal, 0);
      await PagoCanon.update(pago.id, {
        valor_pagado: pagadoTotal,
        saldo,
        medio,
        referencia,
        estado: saldo === 0 ? 'Pagado' : 'Parcial',
        fecha_pago: new Date().toISOString(),
      });
      toast.success(saldo === 0 ? 'Pago completo registrado' : `Abono registrado, quedan ${moneda(saldo)}`);
      onGuardado();
      onCerrar();
    } catch { toast.error('No se pudo registrar el pago'); }
    finally { setGuardando(false); }
  };

  if (!pago) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted p-3 text-sm">
        <p className="font-medium">{periodo(pago.periodo)}</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          Total {moneda(pago.valor_total)} · pagado {moneda(pago.valor_pagado)} · pendiente <span className="font-semibold text-foreground">{moneda(pendiente)}</span>
        </p>
      </div>
      <div><Label>Monto recibido</Label><Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Medio</Label>
          <Select value={medio} onValueChange={setMedio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MEDIOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Referencia</Label><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Registrando...' : 'Registrar pago'}</Button>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function Recaudo() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [mes, setMes] = useState(periodoActual());
  const [pagoActivo, setPagoActivo] = useState(null);

  const { data: pagos = [], isLoading } = useQuery({ queryKey: ['pagos_canon'], queryFn: () => PagoCanon.list() });
  const { data: arrendatarios = [] } = useQuery({ queryKey: ['arrendatarios'], queryFn: () => Arrendatario.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['pagos_canon'] });

  const nombrePor = useMemo(() => {
    const m = new Map();
    arrendatarios.forEach((a) => m.set(a.id, a.nombre));
    return m;
  }, [arrendatarios]);

  // Periodos existentes, del mas reciente al mas viejo, para el selector de mes.
  const periodos = useMemo(
    () => [...new Set(pagos.map((p) => p.periodo).filter(Boolean))].sort().reverse(),
    [pagos],
  );

  const delMes = pagos.filter((p) => p.periodo === mes);

  const visibles = delMes
    .filter((p) => filtro === 'todos' || estadoReal(p) === filtro)
    .filter((p) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase();
      return (nombrePor.get(p.arrendatario_id) || '').toLowerCase().includes(q)
        || String(p.referencia || '').toLowerCase().includes(q);
    })
    .sort((a, b) => diasMora(b) - diasMora(a));

  const facturado = delMes.reduce((s, p) => s + (Number(p.valor_total) || 0), 0);
  const recaudado = delMes.reduce((s, p) => s + (Number(p.valor_pagado) || 0), 0);
  const enMora = delMes.filter((p) => estadoReal(p) === 'Mora');
  const moraValor = enMora.reduce((s, p) => s + ((Number(p.valor_total) || 0) - (Number(p.valor_pagado) || 0)), 0);
  const pct = facturado > 0 ? Math.round((recaudado / facturado) * 100) : 0;

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Recaudo" resumen={`${delMes.length} cánones en ${periodo(mes)} · ${pct}% recaudado`}>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(periodos.length ? periodos : [mes]).map((p) => <SelectItem key={p} value={p}>{periodo(p)}</SelectItem>)}
          </SelectContent>
        </Select>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Facturado" valor={moneda(facturado)} />
        <Metrica etiqueta="Recaudado" valor={moneda(recaudado)} tono="exito" />
        <Metrica etiqueta="En mora" valor={moneda(moraValor)} tono={moraValor > 0 ? 'peligro' : 'neutro'} />
        <Metrica etiqueta="Contratos en mora" valor={enMora.length} tono={enMora.length ? 'peligro' : 'exito'} />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar arrendatario o referencia..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>
      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje={delMes.length === 0 ? `No hay cánones cargados para ${periodo(mes)}` : 'Nada en este filtro'} icono={Wallet} />
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const est = estadoReal(p);
            const mora = diasMora(p);
            const pendiente = (Number(p.valor_total) || 0) - (Number(p.valor_pagado) || 0);
            return (
              <FilaCard key={p.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{nombrePor.get(p.arrendatario_id) || 'Arrendatario sin nombre'}</span>
                      <EstadoBadge valor={est} />
                      {mora > 0 && (
                        <span className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />{mora}d de mora
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>{periodo(p.periodo)}</span>
                      <span>vence {fecha(p.fecha_vencimiento)}</span>
                      {p.medio && <span>{p.medio}</span>}
                      {p.referencia && <span className="tabular">{p.referencia}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{moneda(p.valor_total)}</p>
                    {pendiente > 0
                      ? <p className="text-[11px] text-destructive tabular">debe {moneda(pendiente)}</p>
                      : <p className="text-[11px] text-success">al dia</p>}
                  </div>
                  {pendiente > 0 && (
                    <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => setPagoActivo(p)}>
                      Registrar pago
                    </Button>
                  )}
                </div>
              </FilaCard>
            );
          })}
        </div>
      )}

      <Dialog open={!!pagoActivo} onOpenChange={(o) => !o && setPagoActivo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          <RegistrarPago pago={pagoActivo} onCerrar={() => setPagoActivo(null)} onGuardado={refrescar} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
