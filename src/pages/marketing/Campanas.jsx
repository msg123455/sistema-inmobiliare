import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Megaphone, MapPin, DollarSign, Edit2, CheckCircle2, X, Home } from 'lucide-react';
import { toast } from 'sonner';

const CampanaAds = base44.entities.CampanaAds;
const Propiedad = base44.entities.Propiedad;

function CampanaForm({ initial = {}, propiedades = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    nombre: '', que_promociona: '', contexto_agente: '', zona: '',
    rango_precio: '', operacion: 'Venta', meta_ad_id: '', activa: false, inmuebles: [],
    trigger_mensaje: '', mensaje_bienvenida: '', link_ficha: '',
    ...initial,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setLoading(true);
    try {
      await onSave(form);
      toast.success(initial.id ? 'Campaña actualizada' : 'Campaña creada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div><Label>Nombre de la campaña *</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Rosales Compra Enero" /></div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <Label className="text-primary font-semibold">Reconocer por el primer mensaje</Label>
        <p className="text-[11px] text-muted-foreground">Pon una frase corta y CONTINUA del mensaje predeterminado de ESTE anuncio (sin el hueco donde el lead pone su nombre). Puedes poner varias, una por línea. Cuando un lead escriba algo que contenga alguna, Valentina lo reconoce y le manda de una la info del inmueble.</p>
        <Textarea value={form.trigger_mensaje} onChange={e => set('trigger_mensaje', e.target.value)} rows={3} placeholder={"quiero mas informacion\ny estoy buscando\ncon gusto mi nombre es"} />
        <Label className="text-xs">Info que Valentina manda de una <span className="text-muted-foreground">(opcional; si se deja vacío, la arma con los inmuebles de abajo)</span></Label>
        <Textarea value={form.mensaje_bienvenida} onChange={e => set('mensaje_bienvenida', e.target.value)} rows={2} placeholder="Ej: La casa en Santa Ana: 480m², 3 hab, $8.700 millones. Con gusto coordinamos una visita." />
        <Label className="text-xs">Link de la ficha (manual) <span className="text-muted-foreground">— pégalo tú para asegurar que sea el correcto; tiene prioridad sobre el de WASI</span></Label>
        <Input value={form.link_ficha} onChange={e => set('link_ficha', e.target.value)} placeholder="https://... (la página con las fotos y detalles de ESTE inmueble)" />
      </div>

      <div><Label>Qué promociona</Label><Textarea value={form.que_promociona} onChange={e => set('que_promociona', e.target.value)} rows={2} placeholder="Ej: Apartamentos de lujo en Rosales con terraza, desde $2.000M" /></div>
      <div>
        <Label>Contexto para Valentina</Label>
        <Textarea value={form.contexto_agente} onChange={e => set('contexto_agente', e.target.value)} rows={3} placeholder="Lo que el agente debe saber y manejar sobre esta campaña (oferta, gancho, condiciones, qué destacar)" />
      </div>
      <div>
        <Label>Inmuebles que se promocionan <span className="text-muted-foreground text-xs">(elige de tu catálogo)</span></Label>
        <Select value="" onValueChange={id => { if (id && !(form.inmuebles || []).includes(id)) set('inmuebles', [...(form.inmuebles || []), id]); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Agregar inmueble..." /></SelectTrigger>
          <SelectContent>
            {propiedades.filter(p => !(form.inmuebles || []).includes(p.id)).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.titulo}{p.barrio ? ` · ${p.barrio}` : p.ciudad ? ` · ${p.ciudad}` : ''}</SelectItem>
            ))}
            {propiedades.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay propiedades en el catálogo</div>}
          </SelectContent>
        </Select>
        {(form.inmuebles || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(form.inmuebles || []).map(id => {
              const p = propiedades.find(x => x.id === id);
              return (
                <Badge key={id} variant="outline" className="text-xs gap-1 pr-1 py-1">
                  <Home className="w-3 h-3" />{p ? p.titulo : id}
                  <button type="button" onClick={() => set('inmuebles', (form.inmuebles || []).filter(x => x !== id))} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Zona</Label><Input value={form.zona} onChange={e => set('zona', e.target.value)} placeholder="Rosales" /></div>
        <div><Label>Precio</Label><Input value={form.rango_precio} onChange={e => set('rango_precio', e.target.value)} placeholder="desde $2.000M" /></div>
        <div><Label>Operación</Label>
          <Select value={form.operacion} onValueChange={v => set('operacion', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Venta', 'Arriendo', 'Ambos'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>ID del anuncio en Meta <span className="text-muted-foreground text-xs">(opcional, para atribución por lead)</span></Label><Input value={form.meta_ad_id} onChange={e => set('meta_ad_id', e.target.value)} placeholder="120xxxxxxxx" /></div>
      <div className="flex items-center gap-2 pt-1">
        <Switch checked={form.activa} onCheckedChange={v => set('activa', v)} />
        <Label>Campaña activa (Valentina usa su contexto)</Label>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

function CampanaCard({ campana, propiedades = [], onRefresh }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleUpdate = async (data) => {
    await CampanaAds.update(campana.id, data);
    setEditOpen(false);
    onRefresh();
  };

  const toggleActiva = async () => {
    await CampanaAds.update(campana.id, { ...campana, activa: !campana.activa });
    onRefresh();
  };

  return (
    <Card className={`rounded-2xl transition-all duration-300 ${campana.activa ? 'border-primary/50 shadow-sm' : 'border-border/60'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{campana.nombre}</p>
              {campana.activa && <Badge className="text-[10px] bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Activa</Badge>}
            </div>
            {campana.que_promociona && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{campana.que_promociona}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
          {campana.zona && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{campana.zona}</span>}
          {campana.rango_precio && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{campana.rango_precio}</span>}
          {campana.operacion && <Badge variant="outline" className="text-[10px]">{campana.operacion}</Badge>}
          {campana.inmuebles?.length > 0 && <span className="flex items-center gap-1"><Home className="w-3 h-3" />{campana.inmuebles.length} inmueble{campana.inmuebles.length > 1 ? 's' : ''}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={campana.activa} onCheckedChange={toggleActiva} />
            <span className="text-xs text-muted-foreground">{campana.activa ? 'Activa' : 'Inactiva'}</span>
          </div>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs"><Edit2 className="w-3 h-3 mr-1" />Editar</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Editar campaña</DialogTitle></DialogHeader>
              <CampanaForm initial={campana} propiedades={propiedades} onSave={handleUpdate} onCancel={() => setEditOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Campanas() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => CampanaAds.list('-fecha_inicio'),
  });
  const { data: propiedades = [] } = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => Propiedad.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['campanas'] });

  const handleCreate = async (data) => {
    await CampanaAds.create(data);
    setCreateOpen(false);
    refresh();
  };

  const activas = campanas.filter(c => c.activa);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Campañas de Ads</h1>
          <p className="text-muted-foreground text-[15px]">Contexto que Valentina usa según lo que se está promocionando</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" />Nueva campaña</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nueva campaña</DialogTitle></DialogHeader>
            <CampanaForm propiedades={propiedades} onSave={handleCreate} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {activas.length > 1 && (
        <div className="text-xs text-emerald-700 bg-emerald-500/10 rounded-lg px-3 py-2">
          Tienes {activas.length} campañas activas a la vez. Valentina reconoce cada lead por el primer mensaje del anuncio (o por el ID de Meta) y le manda la info correcta. Asegúrate de que cada campaña tenga una frase distintiva en "Reconocer por el primer mensaje".
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando campañas...</div>
      ) : campanas.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sin campañas todavía</p>
          <p className="text-sm text-muted-foreground mt-1">Crea una para que Valentina sepa qué se está promocionando.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campanas.map(c => <CampanaCard key={c.id} campana={c} propiedades={propiedades} onRefresh={refresh} />)}
        </div>
      )}
    </div>
  );
}
