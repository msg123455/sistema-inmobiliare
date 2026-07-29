import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, UserCheck, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda,
} from '@/components/modulo';

const Asesor = base44.entities.Asesor;

const ESTADOS = ['Activo', 'No_Disponible', 'Vacaciones'];
const TIPOS = ['Venta', 'Arriendo', 'Ambos', 'Avaluos', 'Cartera'];

function Formulario({ inicial, onSave, onCancel }) {
  const [f, setF] = useState({
    nombre: '', telefono: '', email: '', genero: '', tipo: 'Ambos',
    zonas: '', estado: 'Activo', user_email: '', meta_mensual: '',
    ...(inicial || {}),
    zonas: Array.isArray(inicial?.zonas) ? inicial.zonas.join(', ') : (inicial?.zonas || ''),
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim()) return toast.error('El nombre es obligatorio');
    setGuardando(true);
    try {
      await onSave({
        ...f,
        // El telefono va sin + ni espacios: asi lo compara el router del agente
        // contra el `from` de WhatsApp.
        telefono: String(f.telefono).replace(/\D/g, ''),
        zonas: f.zonas.split(',').map((z) => z.trim()).filter(Boolean),
        meta_mensual: Number(f.meta_mensual) || 0,
        dominio_email: (f.email.split('@')[1] || '').toLowerCase(),
      });
      toast.success(inicial ? 'Asesor actualizado' : 'Asesor creado');
    } catch { toast.error('No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div><Label>Nombre *</Label><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Teléfono</Label><Input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="573105771576" /></div>
        <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Tipo</Label>
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Estado</Label>
          <Select value={f.estado} onValueChange={(v) => set('estado', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Género</Label>
          <Select value={f.genero} onValueChange={(v) => set('genero', v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent><SelectItem value="F">F</SelectItem><SelectItem value="M">M</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Zonas</Label>
        <Input value={f.zonas} onChange={(e) => set('zonas', e.target.value)} placeholder="Chicó, Rosales, Usaquén" />
        <p className="text-[11px] text-muted-foreground mt-1">Separadas por coma. Vacío = todas las del tipo.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Meta mensual</Label><Input type="number" value={f.meta_mensual} onChange={(e) => set('meta_mensual', e.target.value)} /></div>
        <div><Label>Email de usuario</Label><Input type="email" value={f.user_email} onChange={(e) => set('user_email', e.target.value)} /></div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export default function Asesores() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['asesores'], queryFn: () => Asesor.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['asesores'] });

  const visibles = items
    .filter((a) => filtro === 'todos' || a.estado === filtro)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));

  const activos = items.filter((a) => a.estado === 'Activo');

  return (
    <div className="space-y-5">
      <EncabezadoModulo titulo="Asesores" resumen={`${activos.length} activos de ${items.length}`}>
        <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setEditando(null); }}>
          <DialogTrigger asChild><Button className="presionable"><Plus className="w-4 h-4 mr-1" />Nuevo asesor</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editando ? 'Editar asesor' : 'Nuevo asesor'}</DialogTitle></DialogHeader>
            <Formulario
              inicial={editando}
              onSave={async (d) => {
                if (editando) await Asesor.update(editando.id, d);
                else await Asesor.create(d);
                setAbierto(false); setEditando(null); refrescar();
              }}
              onCancel={() => { setAbierto(false); setEditando(null); }}
            />
          </DialogContent>
        </Dialog>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metrica etiqueta="Activos" valor={activos.length} tono="exito" />
        <Metrica etiqueta="No disponibles" valor={items.filter((a) => a.estado === 'No_Disponible').length} tono="curso" />
        <Metrica etiqueta="En vacaciones" valor={items.filter((a) => a.estado === 'Vacaciones').length} />
        <Metrica etiqueta="Meta del equipo" valor={moneda(activos.reduce((s, a) => s + (Number(a.meta_mensual) || 0), 0))} tono="info" />
      </div>

      <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS} />

      {isLoading ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje="No hay asesores registrados" icono={UserCheck} />
      ) : (
        <div className="space-y-3">
          {visibles.map((a) => (
            <FilaCard key={a.id} onClick={() => { setEditando(a); setAbierto(true); }}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {(a.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm">{a.nombre}</span>
                    <EstadoBadge valor={a.estado} />
                    <span className="text-[11px] text-muted-foreground">{a.tipo}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {a.telefono && <span className="flex items-center gap-1 tabular"><Phone className="w-3 h-3" />{a.telefono}</span>}
                    {a.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{a.email}</span>}
                    {Array.isArray(a.zonas) && a.zonas.length > 0 && (
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.zonas.join(', ')}</span>
                    )}
                  </div>
                </div>
                {Number(a.meta_mensual) > 0 && (
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Meta</p>
                    <p className="text-sm font-semibold tabular">{moneda(a.meta_mensual)}</p>
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
