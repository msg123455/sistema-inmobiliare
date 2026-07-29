import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Wrench, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha, diasHasta,
} from '@/components/modulo';

const Reparacion = base44.entities.Reparacion;
const Arrendatario = base44.entities.Arrendatario;

const ESTADOS = ['Reportada', 'En_proceso', 'Programada', 'Resuelta', 'Cerrada', 'Cancelada'];
const CATEGORIAS = ['Plomeria', 'Electrico', 'Gas', 'Cerrajeria', 'Electrodomestico', 'Estructural', 'Humedad', 'Otro'];
const URGENCIAS = ['Emergencia', 'Alta', 'Media', 'Baja'];

// SLA por urgencia, en horas. Emergencia (gas, incendio, inundacion) se atiende
// el mismo turno; el resto escala por dias habiles.
const SLA_HORAS = { Emergencia: 4, Alta: 24, Media: 72, Baja: 168 };

/** Una reparacion esta fuera de SLA si paso su fecha limite sin resolverse. */
function fueraDeSla(r) {
  if (['Resuelta', 'Cerrada', 'Cancelada'].includes(r.estado)) return false;
  const d = diasHasta(r.fecha_limite);
  return d !== null && d < 0;
}

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    descripcion: '', categoria: 'Plomeria', urgencia: 'Media',
    ubicacion: '', arrendatario_id: '', contrato_id: '', costo_estimado: '',
    asume: 'Propietario',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const { data: arrendatarios = [] } = useQuery({ queryKey: ['arrendatarios'], queryFn: () => Arrendatario.list() });

  const guardar = async () => {
    if (!f.descripcion.trim()) return toast.error('La descripcion es obligatoria');
    setGuardando(true);
    try {
      const sla = SLA_HORAS[f.urgencia] ?? 72;
      const ahora = new Date();
      await onSave({
        ...f,
        costo_estimado: Number(f.costo_estimado) || 0,
        estado: 'Reportada',
        origen: 'manual',
        sla_horas: sla,
        fecha_reporte: ahora.toISOString(),
        // La fecha limite se calcula al crear: si se deja para despues, nadie
        // sabe contra que reloj esta corriendo el ticket.
        fecha_limite: new Date(ahora.getTime() + sla * 3600000).toISOString(),
        numero_radicado: `REP-${Date.now().toString().slice(-8)}`,
      });
      toast.success('Reparacion radicada');
    } catch { toast.error('No se pudo radicar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Descripcion *</Label><Textarea rows={3} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Que falla y desde cuando" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Categoria</Label>
          <Select value={f.categoria} onValueChange={(v) => set('categoria', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Urgencia</Label>
          <Select value={f.urgencia} onValueChange={(v) => set('urgencia', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{URGENCIAS.map((u) => <SelectItem key={u} value={u}>{u} · SLA {SLA_HORAS[u]}h</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {f.urgencia === 'Emergencia' && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Emergencia: atencion en 4 horas y escalamiento inmediato.
        </p>
      )}
      <div><Label>Ubicacion en el inmueble</Label><Input value={f.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} placeholder="Bano principal, cocina..." /></div>
      <div><Label>Arrendatario</Label>
        <Select value={f.arrendatario_id} onValueChange={(v) => set('arrendatario_id', v)}>
          <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
          <SelectContent>{arrendatarios.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Costo estimado</Label><Input type="number" value={f.costo_estimado} onChange={(e) => set('costo_estimado', e.target.value)} /></div>
        <div><Label>Asume</Label>
          <Select value={f.asume} onValueChange={(v) => set('asume', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Propietario', 'Arrendatario', 'Inmobiliaria'].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Radicando...' : 'Radicar reparacion'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Reparaciones() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['reparaciones'], queryFn: () => Reparacion.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['reparaciones'] });

  const avanzar = async (id, estado) => {
    const extra = estado === 'Resuelta' ? { fecha_resolucion: new Date().toISOString() } : {};
    await Reparacion.update(id, { estado, ...extra });
    refrescar();
    toast.success(`Marcada como ${estado.replace(/_/g, ' ')}`);
  };

  // Las emergencias y lo vencido van arriba: es una bandeja de trabajo, no un
  // archivo historico.
  const peso = (r) => (fueraDeSla(r) ? 0 : r.urgencia === 'Emergencia' ? 1 : 2);
  const visibles = items
    .filter((r) => filtro === 'todos' || r.estado === filtro)
    .sort((a, b) => peso(a) - peso(b) || new Date(a.fecha_limite || 0) - new Date(b.fecha_limite || 0));

  const abiertas = items.filter((r) => !['Resuelta', 'Cerrada', 'Cancelada'].includes(r.estado));
  const vencidas = items.filter(fueraDeSla);
  const emergencias = abiertas.filter((r) => r.urgencia === 'Emergencia');

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Reparaciones" resumen={`${abiertas.length} abiertas · ${vencidas.length} fuera de SLA`}>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Radicar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Radicar reparacion</DialogTitle></DialogHeader>
            <Formulario onSave={async (d) => { await Reparacion.create(d); setAbierto(false); refrescar(); }} onCancel={() => setAbierto(false)} />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Abiertas" valor={abiertas.length} />
        <Metrica etiqueta="Emergencias" valor={emergencias.length} tono={emergencias.length ? 'peligro' : 'neutro'} />
        <Metrica etiqueta="Fuera de SLA" valor={vencidas.length} tono={vencidas.length ? 'peligro' : 'exito'} />
        <Metrica etiqueta="Costo estimado" valor={moneda(abiertas.reduce((s, r) => s + (Number(r.costo_estimado) || 0), 0))} />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay reparaciones en este estado" icono={Wrench} />
      ) : (
        <div className="space-y-3">
          {visibles.map((r) => {
            const dias = diasHasta(r.fecha_limite);
            const vencida = fueraDeSla(r);
            const cerrada = ['Resuelta', 'Cerrada', 'Cancelada'].includes(r.estado);
            return (
              <FilaCard key={r.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{r.categoria}</span>
                      <EstadoBadge valor={r.estado} />
                      <EstadoBadge valor={r.urgencia} tipo="prioridad" />
                      {vencida && (
                        <span className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />FUERA DE SLA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 mb-1">{r.descripcion}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {r.numero_radicado && <span className="tabular">{r.numero_radicado}</span>}
                      {r.ubicacion && <span>{r.ubicacion}</span>}
                      <span>Reportada {fecha(r.fecha_reporte)}</span>
                      {!cerrada && dias !== null && (
                        <span className={`flex items-center gap-1 ${vencida ? 'text-destructive font-medium' : ''}`}>
                          <Clock className="w-3 h-3" />
                          {vencida ? `vencio hace ${Math.abs(dias)}d` : `vence en ${dias}d`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.costo_final > 0 ? (
                      <p className="text-sm font-semibold tabular">{moneda(r.costo_final)}</p>
                    ) : r.costo_estimado > 0 ? (
                      <p className="text-sm tabular text-muted-foreground">est. {moneda(r.costo_estimado)}</p>
                    ) : null}
                    {r.asume && <p className="text-[11px] text-muted-foreground">paga {r.asume.toLowerCase()}</p>}
                  </div>
                  {!cerrada && (
                    <div className="flex gap-2">
                      {r.estado === 'Reportada' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(r.id, 'En_proceso')}>Tomar</Button>}
                      {['En_proceso', 'Programada'].includes(r.estado) && <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable" onClick={() => avanzar(r.id, 'Resuelta')}>Resolver</Button>}
                    </div>
                  )}
                </div>
              </FilaCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
