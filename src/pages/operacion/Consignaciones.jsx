import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha,
} from '@/components/modulo';

const Consignacion = base44.entities.Consignacion;
const Propietario = base44.entities.Propietario;
const Asesor = base44.entities.Asesor;

const ESTADOS = ['Solicitada', 'En_Avaluo', 'Aprobada', 'Publicada', 'Rechazada'];
const TIPOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];
const GESTIONES = ['Venta', 'Arriendo', 'Administracion', 'Venta_y_Arriendo'];

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    direccion: '', tipo_inmueble: 'Apartamento', gestion: 'Arriendo',
    barrio: '', zona: '', valor_esperado: '', canon_esperado: '',
    propietario_id: '', asesor_id: '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const { data: propietarios = [] } = useQuery({ queryKey: ['propietarios'], queryFn: () => Propietario.list() });
  const { data: asesores = [] } = useQuery({ queryKey: ['asesores'], queryFn: () => Asesor.list() });

  // En venta pura el canon no aplica, y al reves. Mostrar los dos campos siempre
  // invita a llenar el que no va y despues nadie sabe cual es el precio real.
  const pideValor = f.gestion === 'Venta' || f.gestion === 'Venta_y_Arriendo';
  const pideCanon = f.gestion !== 'Venta';

  const guardar = async () => {
    if (!f.direccion.trim()) return toast.error('La direccion es obligatoria');
    setGuardando(true);
    try {
      await onSave({
        ...f,
        valor_esperado: pideValor ? Number(f.valor_esperado) || 0 : 0,
        canon_esperado: pideCanon ? Number(f.canon_esperado) || 0 : 0,
        estado: 'Solicitada',
        origen: 'manual',
        fecha_solicitud: new Date().toISOString(),
      });
      toast.success('Consignacion registrada');
    } catch { toast.error('No se pudo registrar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Direccion *</Label><Input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle 81 # 8 - 95" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tipo</Label>
          <Select value={f.tipo_inmueble} onValueChange={(v) => set('tipo_inmueble', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Gestion</Label>
          <Select value={f.gestion} onValueChange={(v) => set('gestion', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GESTIONES.map((g) => <SelectItem key={g} value={g}>{g.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Barrio</Label><Input value={f.barrio} onChange={(e) => set('barrio', e.target.value)} /></div>
        <div><Label>Zona</Label><Input value={f.zona} onChange={(e) => set('zona', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {pideValor && <div><Label>Valor esperado</Label><Input type="number" value={f.valor_esperado} onChange={(e) => set('valor_esperado', e.target.value)} /></div>}
        {pideCanon && <div><Label>Canon esperado</Label><Input type="number" value={f.canon_esperado} onChange={(e) => set('canon_esperado', e.target.value)} /></div>}
      </div>
      <div><Label>Propietario</Label>
        <Select value={f.propietario_id} onValueChange={(v) => set('propietario_id', v)}>
          <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
          <SelectContent>{propietarios.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Asesor</Label>
        <Select value={f.asesor_id} onValueChange={(v) => set('asesor_id', v)}>
          <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
          <SelectContent>{asesores.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar consignacion'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Consignaciones() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['consignaciones'], queryFn: () => Consignacion.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['consignaciones'] });

  const avanzar = async (id, estado) => {
    await Consignacion.update(id, { estado });
    refrescar();
    toast.success(`Marcada como ${estado.replace(/_/g, ' ')}`);
  };

  const visibles = items
    .filter((c) => filtro === 'todos' || c.estado === filtro)
    .sort((a, b) => new Date(b.fecha_solicitud || 0) - new Date(a.fecha_solicitud || 0));

  const enCurso = items.filter((c) => ['Solicitada', 'En_Avaluo'].includes(c.estado)).length;
  const publicadas = items.filter((c) => c.estado === 'Publicada').length;

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Consignaciones" resumen={`${items.length} en total · ${enCurso} en curso`}>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva consignacion</DialogTitle></DialogHeader>
            <Formulario onSave={async (d) => { await Consignacion.create(d); setAbierto(false); refrescar(); }} onCancel={() => setAbierto(false)} />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metrica etiqueta="En curso" valor={enCurso} tono="curso" />
        <Metrica etiqueta="Publicadas" valor={publicadas} tono="exito" />
        <Metrica etiqueta="Rechazadas" valor={items.filter((c) => c.estado === 'Rechazada').length} tono="peligro" />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay consignaciones en este estado" icono={Building2} />
      ) : (
        <div className="space-y-3">
          {visibles.map((c) => (
            <FilaCard key={c.id}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm">{c.direccion || 'Sin direccion'}</span>
                    <EstadoBadge valor={c.estado} />
                    <span className="text-[11px] text-muted-foreground">{c.gestion?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.tipo_inmueble}</span>
                    {(c.barrio || c.zona) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{[c.barrio, c.zona].filter(Boolean).join(', ')}</span>}
                    <span>{fecha(c.fecha_solicitud)}</span>
                  </div>
                </div>
                <div className="text-right">
                  {c.valor_esperado > 0 && <p className="text-sm font-semibold tabular">{moneda(c.valor_esperado)}</p>}
                  {c.canon_esperado > 0 && <p className="text-sm font-semibold tabular">{moneda(c.canon_esperado)}<span className="text-xs font-normal text-muted-foreground">/mes</span></p>}
                </div>
                {!['Publicada', 'Rechazada'].includes(c.estado) && (
                  <div className="flex gap-2">
                    {c.estado === 'Solicitada' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(c.id, 'En_Avaluo')}>A avaluo</Button>}
                    {c.estado === 'En_Avaluo' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(c.id, 'Aprobada')}>Aprobar</Button>}
                    {c.estado === 'Aprobada' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(c.id, 'Publicada')}>Publicar</Button>}
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive presionable" onClick={() => avanzar(c.id, 'Rechazada')}>Rechazar</Button>
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
