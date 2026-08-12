import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ClipboardCheck, Hand, History, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica,
} from '@/components/modulo';
import { useUserRole } from '@/hooks/useUserRole';

const Orden = base44.entities.OrdenAsistencia;

// 'Sin_asistir' no es un estado de la entidad: es el filtro que la casa
// realmente necesita, "que llego y nadie ha tocado". Se deriva de que la orden
// siga Abierta y no tenga fecha_asistencia. Guardarlo como tercer estado
// obligaria a mantenerlo sincronizado con la fecha, que es justo el tipo de
// duplicacion que se desincroniza sola.
const FILTROS = ['Sin_asistir', 'Abierta', 'Cerrada'];

const ORIGENES = [
  'Reparacion', 'PQR', 'Contacto', 'Avaluo',
  'Consignacion', 'SolicitudMatricula', 'Escalamiento',
];

const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];

// A donde lleva el registro vigente. Solo Contacto tiene ficha por id; para el
// resto se abre el modulo, que es lo honesto: enlazar a una ruta que no existe
// es peor que no enlazar.
const RUTA_ORIGEN = {
  Reparacion: '/operacion/reparaciones',
  PQR: '/operacion/pqr',
  Avaluo: '/operacion/avaluos',
  Consignacion: '/operacion/consignaciones',
  SolicitudMatricula: '/operacion/matriculas',
};

const rutaDe = (o) => (o.origen_tipo === 'Contacto' && o.origen_id
  ? `/crm/contactos/${o.origen_id}`
  : RUTA_ORIGEN[o.origen_tipo] || null);

const sinAsistir = (o) => o.estado !== 'Cerrada' && !o.fecha_asistencia;

/** Fecha con hora: en esta bandeja importa si algo lleva dos horas o dos dias. */
function cuando(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    asunto: '', detalle: '', solicitante_nombre: '', solicitante_telefono: '',
    origen_tipo: 'Escalamiento', origen_radicado: '', prioridad: 'Media',
    direccion_inmueble: '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.asunto.trim()) return toast.error('El asunto es obligatorio');
    setGuardando(true);
    try {
      await onSave({
        ...f,
        solicitante_telefono: f.solicitante_telefono.replace(/\D/g, ''),
        canal: 'Manual',
        estado: 'Abierta',
        fecha_solicitud: new Date().toISOString(),
        numero_orden: `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      });
      toast.success('Orden abierta');
    } catch { toast.error('No se pudo abrir la orden'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Asunto *</Label><Input value={f.asunto} onChange={(e) => set('asunto', e.target.value)} placeholder="Que necesita, en una linea" /></div>
      <div><Label>Detalle</Label><Textarea rows={3} value={f.detalle} onChange={(e) => set('detalle', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nombre del solicitante</Label><Input value={f.solicitante_nombre} onChange={(e) => set('solicitante_nombre', e.target.value)} /></div>
        <div><Label>Telefono</Label><Input value={f.solicitante_telefono} onChange={(e) => set('solicitante_telefono', e.target.value)} placeholder="573001112233" /></div>
      </div>
      <div><Label>Inmueble</Label><Input value={f.direccion_inmueble} onChange={(e) => set('direccion_inmueble', e.target.value)} placeholder="Direccion, si aplica" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Viene de</Label>
          <Select value={f.origen_tipo} onValueChange={(v) => set('origen_tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ORIGENES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Prioridad</Label>
          <Select value={f.prioridad} onValueChange={(v) => set('prioridad', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {f.origen_tipo !== 'Escalamiento' && (
        <div><Label>Radicado del registro</Label><Input value={f.origen_radicado} onChange={(e) => set('origen_radicado', e.target.value)} placeholder="REP-12345678, PQR-2026-..." /></div>
      )}
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Abriendo...' : 'Abrir orden'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

/** Cerrar exige decir que se hizo: sin eso el historial solo dice que alguien la toco. */
function DialogoCierre({ orden, onCerrar, onCancel }) {
  const [resultado, setResultado] = useState('');
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {orden.asunto}
      </p>
      <div>
        <Label>Que se hizo *</Label>
        <Textarea rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)}
          placeholder="Lo que se resolvio y como quedo el cliente" />
        <p className="text-[11px] text-muted-foreground mt-1">
          Esto es lo que el asistente le podra recordar a esta persona la proxima vez que escriba.
        </p>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1 presionable" disabled={!resultado.trim() || guardando}
          onClick={async () => { setGuardando(true); try { await onCerrar(resultado.trim()); } finally { setGuardando(false); } }}>
          {guardando ? 'Cerrando...' : 'Cerrar orden'}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function Asistidos() {
  const qc = useQueryClient();
  const { email } = useUserRole();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('Sin_asistir');
  const [cerrando, setCerrando] = useState(null);
  // Historial por persona: la vista que pide la casa. Se enfoca un telefono y la
  // lista pasa a ser "todo lo que se ha hecho por esta persona".
  const [foco, setFoco] = useState(null);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => { base44.auth.me().then(setUsuario).catch(() => {}); }, []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['ordenes-asistencia'],
    queryFn: () => Orden.list(),
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ordenes-asistencia'] });

  // EL BOTON. Deja el rastro de quien atendio y cuando; el nombre se copia
  // porque la orden tiene que seguir siendo legible si la persona sale.
  const asistir = async (o) => {
    await Orden.update(o.id, {
      fecha_asistencia: new Date().toISOString(),
      broker_email: email || usuario?.email || '',
      broker_nombre: usuario?.full_name || email || '',
    });
    refrescar();
    toast.success('Marcada como asistida');
  };

  const cerrar = async (o, resultado) => {
    await Orden.update(o.id, {
      estado: 'Cerrada',
      resultado,
      fecha_cierre: new Date().toISOString(),
      // Cerrar sin haberla asistido igual deja el rastro: si no, quedaria una
      // orden cerrada sin nadie que responda por ella.
      fecha_asistencia: o.fecha_asistencia || new Date().toISOString(),
      broker_email: o.broker_email || email || usuario?.email || '',
      broker_nombre: o.broker_nombre || usuario?.full_name || email || '',
    });
    setCerrando(null);
    refrescar();
    toast.success('Orden cerrada');
  };

  const abiertas = items.filter((o) => o.estado !== 'Cerrada');
  const pendientes = items.filter(sinAsistir);
  const hoy = new Date().toISOString().slice(0, 10);
  const asistidasHoy = items.filter((o) => String(o.fecha_asistencia || '').slice(0, 10) === hoy);

  const visibles = items
    .filter((o) => (foco ? o.solicitante_telefono === foco : true))
    .filter((o) => {
      if (foco) return true;
      if (filtro === 'todos') return true;
      if (filtro === 'Sin_asistir') return sinAsistir(o);
      return o.estado === filtro;
    })
    // Sin asistir primero: es una bandeja de trabajo, no un archivo. Dentro de
    // eso, lo mas viejo arriba, que es lo que lleva mas tiempo esperando.
    .sort((a, b) => (sinAsistir(b) ? 1 : 0) - (sinAsistir(a) ? 1 : 0)
      || String(a.fecha_solicitud || '').localeCompare(String(b.fecha_solicitud || '')));

  const nombreFoco = foco ? (items.find((o) => o.solicitante_telefono === foco)?.solicitante_nombre || `+${foco}`) : '';

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Control de asistidos"
        resumen={`${pendientes.length} sin asistir · ${abiertas.length} abiertas`}
      >
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Abrir orden</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Abrir orden de asistencia</DialogTitle></DialogHeader>
            <Formulario
              onSave={async (d) => { await Orden.create(d); setAbierto(false); refrescar(); }}
              onCancel={() => setAbierto(false)}
            />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Sin asistir" valor={pendientes.length} tono={pendientes.length ? 'peligro' : 'exito'} />
        <Metrica etiqueta="Abiertas" valor={abiertas.length} />
        <Metrica etiqueta="Asistidas hoy" valor={asistidasHoy.length} tono={asistidasHoy.length ? 'exito' : 'neutro'} />
        <Metrica etiqueta="Total" valor={items.length} />
      </div>

      {foco ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Historial de <span className="font-semibold text-foreground">{nombreFoco}</span>
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => setFoco(null)}>
            <X className="w-3 h-3 mr-1" />Ver todas
          </Button>
        </div>
      ) : (
        <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={FILTROS} />
      )}

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay ordenes en esta vista" icono={ClipboardCheck} />
      ) : (
        <div className="space-y-3">
          {visibles.map((o) => {
            const pendiente = sinAsistir(o);
            const cerrada = o.estado === 'Cerrada';
            const ruta = rutaDe(o);
            return (
              <FilaCard key={o.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{o.asunto || 'Sin asunto'}</span>
                      <EstadoBadge valor={o.estado} />
                      <EstadoBadge valor={o.prioridad} tipo="prioridad" />
                      {pendiente && (
                        <span className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                          <Hand className="w-3 h-3" />SIN ASISTIR
                        </span>
                      )}
                    </div>
                    {o.detalle && <p className="text-sm text-foreground/80 mb-1 line-clamp-2">{o.detalle}</p>}
                    {o.resultado && (
                      <p className="text-sm text-success/90 mb-1">
                        <span className="font-medium">Se hizo: </span>{o.resultado}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {o.numero_orden && <span className="tabular font-medium">{o.numero_orden}</span>}
                      {ruta ? (
                        <Link to={ruta} className="hover:underline text-primary">
                          {o.origen_tipo}{o.origen_radicado ? ` ${o.origen_radicado}` : ''}
                        </Link>
                      ) : (
                        <span>{o.origen_tipo}{o.origen_agente ? ` · ${o.origen_agente}` : ''}</span>
                      )}
                      {o.direccion_inmueble && <span>{o.direccion_inmueble}</span>}
                      <span>{cuando(o.fecha_solicitud)}</span>
                    </div>
                  </div>

                  <div className="text-right min-w-[150px]">
                    <p className="text-sm font-medium">{o.solicitante_nombre || 'Sin nombre'}</p>
                    {o.solicitante_telefono && (
                      <button
                        className="text-xs text-muted-foreground hover:text-primary tabular"
                        onClick={() => setFoco(o.solicitante_telefono)}
                        title="Ver todo el historial de esta persona"
                      >
                        +{o.solicitante_telefono}
                      </button>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {o.fecha_asistencia
                        ? `Asistio ${o.broker_nombre || o.broker_email || 'alguien'} · ${cuando(o.fecha_asistencia)}`
                        : 'Nadie la ha tomado'}
                    </p>
                  </div>

                  {!cerrada && (
                    <div className="flex gap-2">
                      {pendiente && (
                        <Button size="sm" className="h-7 text-xs presionable" onClick={() => asistir(o)}>
                          <Hand className="w-3 h-3 mr-1" />La asistí
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable"
                        onClick={() => setCerrando(o)}>
                        Cerrar
                      </Button>
                    </div>
                  )}
                </div>
              </FilaCard>
            );
          })}
        </div>
      )}

      <Dialog open={!!cerrando} onOpenChange={(v) => !v && setCerrando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cerrar orden {cerrando?.numero_orden || ''}</DialogTitle></DialogHeader>
          {cerrando && (
            <DialogoCierre
              orden={cerrando}
              onCerrar={(resultado) => cerrar(cerrando, resultado)}
              onCancel={() => setCerrando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
