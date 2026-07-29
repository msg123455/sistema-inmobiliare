import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, MessageSquareWarning, Scale, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, fecha, diasHasta,
} from '@/components/modulo';

const PQREntidad = base44.entities.PQR;

const ESTADOS = ['Radicada', 'En_proceso', 'Respondida', 'Cerrada'];
const TIPOS = ['Peticion', 'Queja', 'Reclamo', 'Sugerencia', 'Felicitacion'];
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];

// Dias habiles de ley para responder, por tipo. En Colombia la PQR tiene plazos
// legales: pasarse no es un retraso operativo, es un incumplimiento.
const DIAS_LEY = { Peticion: 15, Queja: 15, Reclamo: 15, Sugerencia: 30, Felicitacion: 30 };

// Palabras que convierten una PQR en asunto legal. Si aparecen, entra en
// prioridad Urgente y hay que escalar de una.
const TERMINOS_LEGALES = /\b(tutela|demanda|superintendencia|abogad|juzgad|fiscal|sic\b|defensor)/i;

/** Suma dias habiles a una fecha, saltando sabados y domingos. */
function sumarHabiles(desde, dias) {
  const d = new Date(desde);
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) restantes -= 1;
  }
  return d;
}

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    tipo: 'Peticion', asunto: '', descripcion: '', prioridad: 'Media',
    contacto_nombre: '', contacto_telefono: '', canal: 'Manual',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const esLegal = TERMINOS_LEGALES.test(`${f.asunto} ${f.descripcion}`);

  const guardar = async () => {
    if (!f.asunto.trim()) return toast.error('El asunto es obligatorio');
    setGuardando(true);
    try {
      const ahora = new Date();
      await onSave({
        ...f,
        prioridad: esLegal ? 'Urgente' : f.prioridad,
        estado: 'Radicada',
        radicado: `PQR-${Date.now().toString().slice(-8)}`,
        fecha_radicacion: ahora.toISOString(),
        fecha_limite_legal: sumarHabiles(ahora, DIAS_LEY[f.tipo] ?? 15).toISOString(),
      });
      toast.success('PQR radicada');
    } catch { toast.error('No se pudo radicar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tipo</Label>
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t} · {DIAS_LEY[t]}d habiles</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Prioridad</Label>
          <Select value={f.prioridad} onValueChange={(v) => set('prioridad', v)} disabled={esLegal}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Asunto *</Label><Input value={f.asunto} onChange={(e) => set('asunto', e.target.value)} /></div>
      <div><Label>Descripcion</Label><Textarea rows={3} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></div>
      {esLegal && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5 shrink-0" />
          Contiene termino legal: se radica como Urgente y hay que escalar de inmediato.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nombre del contacto</Label><Input value={f.contacto_nombre} onChange={(e) => set('contacto_nombre', e.target.value)} /></div>
        <div><Label>Telefono</Label><Input value={f.contacto_telefono} onChange={(e) => set('contacto_telefono', e.target.value)} /></div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Radicando...' : 'Radicar PQR'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function PQR() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['pqr'], queryFn: () => PQREntidad.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['pqr'] });

  const avanzar = async (id, estado) => {
    const extra = estado === 'Respondida' ? { fecha_respuesta: new Date().toISOString() } : {};
    await PQREntidad.update(id, { estado, ...extra });
    refrescar();
    toast.success(`Marcada como ${estado}`);
  };

  const abiertas = items.filter((p) => !['Respondida', 'Cerrada'].includes(p.estado));
  const vencidas = abiertas.filter((p) => { const d = diasHasta(p.fecha_limite_legal); return d !== null && d < 0; });
  const porVencer = abiertas.filter((p) => { const d = diasHasta(p.fecha_limite_legal); return d !== null && d >= 0 && d <= 3; });

  const visibles = items
    .filter((p) => filtro === 'todos' || p.estado === filtro)
    .sort((a, b) => new Date(a.fecha_limite_legal || 8.64e15) - new Date(b.fecha_limite_legal || 8.64e15));

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="PQR" resumen={`${abiertas.length} abiertas · ${vencidas.length} fuera de plazo legal`}>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Radicar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Radicar PQR</DialogTitle></DialogHeader>
            <Formulario onSave={async (d) => { await PQREntidad.create(d); setAbierto(false); refrescar(); }} onCancel={() => setAbierto(false)} />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Abiertas" valor={abiertas.length} />
        <Metrica etiqueta="Vencidas" valor={vencidas.length} tono={vencidas.length ? 'peligro' : 'exito'} />
        <Metrica etiqueta="Vencen en 3d" valor={porVencer.length} tono={porVencer.length ? 'curso' : 'neutro'} />
        <Metrica etiqueta="Urgentes" valor={abiertas.filter((p) => p.prioridad === 'Urgente').length} tono="peligro" />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay PQR en este estado" icono={MessageSquareWarning} />
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const dias = diasHasta(p.fecha_limite_legal);
            const cerrada = ['Respondida', 'Cerrada'].includes(p.estado);
            const vencida = !cerrada && dias !== null && dias < 0;
            return (
              <FilaCard key={p.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{p.asunto || 'Sin asunto'}</span>
                      <EstadoBadge valor={p.estado} />
                      <EstadoBadge valor={p.prioridad} tipo="prioridad" />
                      <span className="text-[11px] text-muted-foreground">{p.tipo}</span>
                    </div>
                    {p.descripcion && <p className="text-sm text-foreground/80 mb-1 line-clamp-2">{p.descripcion}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {p.radicado && <span className="tabular">{p.radicado}</span>}
                      {p.contacto_nombre && <span>{p.contacto_nombre}</span>}
                      <span>Radicada {fecha(p.fecha_radicacion)}</span>
                    </div>
                  </div>
                  {!cerrada && dias !== null && (
                    <div className={`text-right ${vencida ? 'text-destructive' : dias <= 3 ? 'text-warning' : 'text-muted-foreground'}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 justify-end">
                        {vencida && <AlertTriangle className="w-3 h-3" />}Plazo legal
                      </p>
                      <p className="text-sm font-semibold tabular">
                        {vencida ? `vencido hace ${Math.abs(dias)}d` : `${dias}d`}
                      </p>
                    </div>
                  )}
                  {!cerrada && (
                    <div className="flex gap-2">
                      {p.estado === 'Radicada' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(p.id, 'En_proceso')}>Tomar</Button>}
                      <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable" onClick={() => avanzar(p.id, 'Respondida')}>Responder</Button>
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
