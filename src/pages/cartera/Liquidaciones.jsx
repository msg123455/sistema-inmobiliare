import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha, periodo,
} from '@/components/modulo';

const LiquidacionPropietario = base44.entities.LiquidacionPropietario;
const Propietario = base44.entities.Propietario;

const ESTADOS = ['Borrador', 'Aprobada', 'Pagada'];

export default function Liquidaciones() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('todos');
  const [mes, setMes] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['liquidaciones'], queryFn: () => LiquidacionPropietario.list() });
  const { data: propietarios = [] } = useQuery({ queryKey: ['propietarios'], queryFn: () => Propietario.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['liquidaciones'] });

  const nombrePor = useMemo(() => new Map(propietarios.map((p) => [p.id, p.nombre])), [propietarios]);
  const periodos = useMemo(
    () => [...new Set(items.map((l) => l.periodo).filter(Boolean))].sort().reverse(),
    [items],
  );

  const avanzar = async (id, estado) => {
    const extra = estado === 'Pagada' ? { fecha_pago: new Date().toISOString() } : {};
    await LiquidacionPropietario.update(id, { estado, ...extra });
    refrescar();
    toast.success(`Marcada como ${estado}`);
  };

  const delPeriodo = mes === 'todos' ? items : items.filter((l) => l.periodo === mes);
  const visibles = delPeriodo
    .filter((l) => filtro === 'todos' || l.estado === filtro)
    .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));

  const bruto = delPeriodo.reduce((s, l) => s + (Number(l.ingresos_brutos) || 0), 0);
  const comision = delPeriodo.reduce((s, l) => s + (Number(l.comision_inmobiliaria) || 0), 0);
  const neto = delPeriodo.reduce((s, l) => s + (Number(l.neto_a_pagar) || 0), 0);
  const porPagar = delPeriodo.filter((l) => l.estado !== 'Pagada').reduce((s, l) => s + (Number(l.neto_a_pagar) || 0), 0);

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Liquidaciones" resumen={`${delPeriodo.length} liquidaciones · ${moneda(porPagar)} por girar`}>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los periodos</SelectItem>
            {periodos.map((p) => <SelectItem key={p} value={p}>{periodo(p)}</SelectItem>)}
          </SelectContent>
        </Select>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Ingresos brutos" valor={moneda(bruto)} />
        <Metrica etiqueta="Comisión" valor={moneda(comision)} tono="info" />
        <Metrica etiqueta="Neto a propietarios" valor={moneda(neto)} />
        <Metrica etiqueta="Por girar" valor={moneda(porPagar)} tono={porPagar > 0 ? 'curso' : 'exito'} />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay liquidaciones en este filtro" icono={Receipt} />
      ) : (
        <div className="space-y-3">
          {visibles.map((l) => (
            <FilaCard key={l.id}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm">{nombrePor.get(l.propietario_id) || 'Propietario sin nombre'}</span>
                    <EstadoBadge valor={l.estado} />
                    <span className="text-[11px] text-muted-foreground">{periodo(l.periodo)}</span>
                  </div>
                  {/* El desglose importa: el propietario siempre pregunta por que
                      el neto no es el canon completo. */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap tabular">
                    <span>bruto {moneda(l.ingresos_brutos)}</span>
                    <span>− comisión {moneda(l.comision_inmobiliaria)}</span>
                    {Number(l.retenciones) > 0 && <span>− retenciones {moneda(l.retenciones)}</span>}
                    {Number(l.descuentos_reparaciones) > 0 && <span>− reparaciones {moneda(l.descuentos_reparaciones)}</span>}
                    {l.fecha_pago && <span>girada {fecha(l.fecha_pago)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Neto</p>
                  <p className="text-sm font-semibold tabular">{moneda(l.neto_a_pagar)}</p>
                </div>
                {l.estado !== 'Pagada' && (
                  <div className="flex gap-2">
                    {l.estado === 'Borrador' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(l.id, 'Aprobada')}>Aprobar</Button>}
                    {l.estado === 'Aprobada' && <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable" onClick={() => avanzar(l.id, 'Pagada')}>Marcar girada</Button>}
                  </div>
                )}
              </div>
            </FilaCard>
          ))}
        </div>
      )}
    </div>
  );
}
