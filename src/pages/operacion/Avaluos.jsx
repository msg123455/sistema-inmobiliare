import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Ruler, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha,
} from '@/components/modulo';

const Avaluo = base44.entities.Avaluo;
const Asesor = base44.entities.Asesor;

const ESTADOS = ['Solicitado', 'Cotizado', 'Aceptado', 'Agendado', 'En_proceso', 'Entregado', 'Cancelado'];
const TIPOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];
// Los seis tipos que ofrece la casa, iguales a los del bot actual y a los que
// ofrece el agente. El viejo 'proposito' (Venta/Arriendo/Credito/Sucesion) era
// una taxonomia generica heredada, no un servicio real de INMOBILIARE.
const TIPOS_AVALUO = [
  ['Renta', 'Renta'],
  ['Comercial', 'Comercial'],
  ['Reposicion_Construccion', 'Reposición / Construcción'],
  ['Urbanos_Rurales', 'Urbanos / Rurales'],
  ['Zonas_Comunes', 'Zonas comunes'],
  ['Retroactivos_Proyectados', 'Retroactivos / Proyectados'],
];

// Tarifa base + valor por m2. Vive aqui como valor por defecto de la cotizacion;
// el numero final siempre es editable porque el perito ajusta por complejidad.
const TARIFA_BASE = 350_000;
const TARIFA_M2 = 1_200;

function cotizar(areaM2) {
  const a = Number(areaM2) || 0;
  if (a <= 0) return TARIFA_BASE;
  return TARIFA_BASE + Math.round(a * TARIFA_M2);
}

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    solicitante_nombre: '', solicitante_telefono: '', solicitante_email: '',
    direccion: '', tipo_inmueble: 'Apartamento', area_m2: '', tipo_avaluo: 'Renta', proposito: '',
    perito_id: '', valor_servicio: '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const { data: asesores = [] } = useQuery({ queryKey: ['asesores'], queryFn: () => Asesor.list() });
  // Solo los de avaluos peritan; mostrar la lista entera invita a asignar mal.
  const peritos = asesores.filter((a) => a.tipo === 'Avaluos' || a.tipo === 'Ambos');

  const sugerido = cotizar(f.area_m2);

  const guardar = async () => {
    if (!f.direccion.trim()) return toast.error('La direccion es obligatoria');
    setGuardando(true);
    try {
      await onSave({
        ...f,
        area_m2: Number(f.area_m2) || 0,
        valor_servicio: Number(f.valor_servicio) || sugerido,
        estado: 'Solicitado',
        origen: 'manual',
        fecha_solicitud: new Date().toISOString(),
      });
      toast.success('Avaluo registrado');
    } catch { toast.error('No se pudo registrar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Direccion *</Label><Input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Tipo</Label>
          <Select value={f.tipo_inmueble} onValueChange={(v) => set('tipo_inmueble', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Area m2</Label><Input type="number" value={f.area_m2} onChange={(e) => set('area_m2', e.target.value)} /></div>
        <div><Label>Tipo de avalúo</Label>
          <Select value={f.tipo_avaluo} onValueChange={(v) => set('tipo_avaluo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_AVALUO.map(([v, etq]) => <SelectItem key={v} value={v}>{etq}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Valor del servicio</Label>
        <Input type="number" value={f.valor_servicio} onChange={(e) => set('valor_servicio', e.target.value)} placeholder={String(sugerido)} />
        <p className="text-[11px] text-muted-foreground mt-1">Sugerido {moneda(sugerido)} (base + {moneda(TARIFA_M2)}/m2). Editable.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Solicitante</Label><Input value={f.solicitante_nombre} onChange={(e) => set('solicitante_nombre', e.target.value)} /></div>
        <div><Label>Telefono</Label><Input value={f.solicitante_telefono} onChange={(e) => set('solicitante_telefono', e.target.value)} /></div>
      </div>
      <div><Label>Perito</Label>
        <Select value={f.perito_id} onValueChange={(v) => set('perito_id', v)}>
          <SelectTrigger><SelectValue placeholder={peritos.length ? 'Sin asignar' : 'No hay peritos registrados'} /></SelectTrigger>
          <SelectContent>{peritos.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar avaluo'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Avaluos() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['avaluos'], queryFn: () => Avaluo.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['avaluos'] });

  const avanzar = async (id, estado) => {
    await Avaluo.update(id, { estado });
    refrescar();
    toast.success(`Marcado como ${estado.replace(/_/g, ' ')}`);
  };

  const visibles = items
    .filter((a) => filtro === 'todos' || a.estado === filtro)
    .sort((a, b) => new Date(b.fecha_solicitud || 0) - new Date(a.fecha_solicitud || 0));

  const enCurso = items.filter((a) => !['Entregado', 'Cancelado'].includes(a.estado));
  const facturado = items.filter((a) => a.estado === 'Entregado').reduce((s, a) => s + (Number(a.valor_servicio) || 0), 0);

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Avaluos" resumen={`${enCurso.length} en curso · ${items.length} en total`}>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Nuevo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo avaluo</DialogTitle></DialogHeader>
            <Formulario onSave={async (d) => { await Avaluo.create(d); setAbierto(false); refrescar(); }} onCancel={() => setAbierto(false)} />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metrica etiqueta="En curso" valor={enCurso.length} tono="curso" />
        <Metrica etiqueta="Entregados" valor={items.filter((a) => a.estado === 'Entregado').length} tono="exito" />
        <Metrica etiqueta="Facturado" valor={moneda(facturado)} tono="info" />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay avaluos en este estado" icono={Ruler} />
      ) : (
        <div className="space-y-3">
          {visibles.map((a) => {
            const cerrado = ['Entregado', 'Cancelado'].includes(a.estado);
            return (
              <FilaCard key={a.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{a.direccion || 'Sin direccion'}</span>
                      <EstadoBadge valor={a.estado} />
                      <span className="text-[11px] text-muted-foreground">{String(a.tipo_avaluo || a.proposito || '').replace(/_/g, ' / ')}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.tipo_inmueble}</span>
                      {a.area_m2 > 0 && <span className="tabular">{a.area_m2} m2</span>}
                      {a.solicitante_nombre && <span>{a.solicitante_nombre}</span>}
                      <span>{fecha(a.fecha_solicitud)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{moneda(a.valor_servicio)}</p>
                    {a.valor_resultante > 0 && <p className="text-[11px] text-muted-foreground">avaluo {moneda(a.valor_resultante)}</p>}
                  </div>
                  {!cerrado && (
                    <div className="flex gap-2">
                      {a.estado === 'Solicitado' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(a.id, 'Cotizado')}>Cotizar</Button>}
                      {a.estado === 'Cotizado' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(a.id, 'Aceptado')}>Aceptar</Button>}
                      {['Aceptado', 'Agendado', 'En_proceso'].includes(a.estado) && <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable" onClick={() => avanzar(a.id, 'Entregado')}>Entregar</Button>}
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
