import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ClipboardCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, fecha,
} from '@/components/modulo';

const SolicitudMatricula = base44.entities.SolicitudMatricula;

const ESTADOS = ['Iniciada', 'En_captura', 'Pendiente_documentos', 'En_estudio', 'Aprobada', 'Rechazada'];

function Formulario({ onSave, onCancel }) {
  const [f, setF] = useState({
    nombre_solicitante: '', documento_solicitante: '', email_solicitante: '',
    telefono_contacto: '', direccion_inmueble: '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.nombre_solicitante.trim()) return toast.error('El nombre del solicitante es obligatorio');
    setGuardando(true);
    try {
      await onSave({
        ...f,
        participantes: [],
        estado: 'Iniciada',
        origen: 'manual',
        // El numero de solicitud es el segundo factor con el que el agente de
        // cartera verifica identidad, asi que se genera al crear, no despues.
        numero_solicitud: `MAT-${Date.now().toString().slice(-8)}`,
        fecha_inicio: new Date().toISOString(),
      });
      toast.success('Matricula iniciada');
    } catch { toast.error('No se pudo iniciar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Nombre del solicitante *</Label><Input value={f.nombre_solicitante} onChange={(e) => set('nombre_solicitante', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Documento</Label><Input value={f.documento_solicitante} onChange={(e) => set('documento_solicitante', e.target.value)} /></div>
        <div><Label>Teléfono</Label><Input value={f.telefono_contacto} onChange={(e) => set('telefono_contacto', e.target.value)} /></div>
      </div>
      <div><Label>Email</Label><Input type="email" value={f.email_solicitante} onChange={(e) => set('email_solicitante', e.target.value)} /></div>
      <div><Label>Dirección del inmueble</Label><Input value={f.direccion_inmueble} onChange={(e) => set('direccion_inmueble', e.target.value)} /></div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Iniciando...' : 'Iniciar matrícula'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Matriculas() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['matriculas'], queryFn: () => SolicitudMatricula.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['matriculas'] });

  const avanzar = async (id, estado) => {
    const extra = estado === 'En_estudio' ? { fecha_cierre_captura: new Date().toISOString() } : {};
    await SolicitudMatricula.update(id, { estado, ...extra });
    refrescar();
    toast.success(`Marcada como ${estado.replace(/_/g, ' ')}`);
  };

  const visibles = items
    .filter((m) => filtro === 'todos' || m.estado === filtro)
    .sort((a, b) => new Date(b.fecha_inicio || 0) - new Date(a.fecha_inicio || 0));

  const enCurso = items.filter((m) => !['Aprobada', 'Rechazada'].includes(m.estado));
  const esperandoDocs = items.filter((m) => m.estado === 'Pendiente_documentos');

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Matrículas" resumen={`${enCurso.length} en curso · reemplaza el F117`}>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Iniciar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Iniciar matrícula</DialogTitle></DialogHeader>
            <Formulario onSave={async (d) => { await SolicitudMatricula.create(d); setAbierto(false); refrescar(); }} onCancel={() => setAbierto(false)} />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="En curso" valor={enCurso.length} tono="curso" />
        <Metrica etiqueta="Esperando documentos" valor={esperandoDocs.length} tono={esperandoDocs.length ? 'curso' : 'neutro'} />
        <Metrica etiqueta="Aprobadas" valor={items.filter((m) => m.estado === 'Aprobada').length} tono="exito" />
        <Metrica etiqueta="Rechazadas" valor={items.filter((m) => m.estado === 'Rechazada').length} tono="peligro" />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay matrículas en este estado" icono={ClipboardCheck} />
      ) : (
        <div className="space-y-3">
          {visibles.map((m) => {
            const cerrada = ['Aprobada', 'Rechazada'].includes(m.estado);
            const participantes = Array.isArray(m.participantes) ? m.participantes : [];
            return (
              <FilaCard key={m.id}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{m.nombre_solicitante || 'Sin solicitante'}</span>
                      <EstadoBadge valor={m.estado} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {m.numero_solicitud && <span className="tabular">{m.numero_solicitud}</span>}
                      {m.direccion_inmueble && <span>{m.direccion_inmueble}</span>}
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {participantes.length} {participantes.length === 1 ? 'participante' : 'participantes'}
                      </span>
                      <span>{fecha(m.fecha_inicio)}</span>
                    </div>
                  </div>
                  {!cerrada && (
                    <div className="flex gap-2 flex-wrap">
                      {m.estado === 'Iniciada' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(m.id, 'En_captura')}>Capturar</Button>}
                      {m.estado === 'En_captura' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(m.id, 'Pendiente_documentos')}>Pedir documentos</Button>}
                      {m.estado === 'Pendiente_documentos' && <Button size="sm" variant="outline" className="h-7 text-xs presionable" onClick={() => avanzar(m.id, 'En_estudio')}>A estudio</Button>}
                      {m.estado === 'En_estudio' && <Button size="sm" variant="outline" className="h-7 text-xs text-success presionable" onClick={() => avanzar(m.id, 'Aprobada')}>Aprobar</Button>}
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive presionable" onClick={() => avanzar(m.id, 'Rechazada')}>Rechazar</Button>
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
