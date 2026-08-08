import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Home, MapPin, Bed, Bath, Car, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const Propiedad = base44.entities.Propiedad;

const ESTADO_COLORS = {
  Disponible: 'bg-green-100 text-green-700',
  Reservado: 'bg-amber-100 text-amber-700',
  Vendido: 'bg-gray-100 text-gray-700',
  Arrendado: 'bg-blue-100 text-blue-700',
  No_disponible: 'bg-red-100 text-red-700',
};

function formatCOP(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function PropiedadForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    titulo: '', tipo: 'Apartamento', operacion: 'Venta', estado: 'Disponible',
    precio_venta: '', canon_arriendo: '', area_m2: '', habitaciones: '',
    banos: '', parqueaderos: '', estrato: '', ciudad: '', barrio: '', direccion: '',
    descripcion: '', comision_pct: '3', link_web: '', link_instagram: '',
    ...initial,
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const num = k => form[k] ? Number(form[k]) : undefined;

  const handleSave = async () => {
    if (!form.titulo || !form.ciudad) { toast.error('Título y ciudad son obligatorios'); return; }
    setLoading(true);
    try {
      const data = {
        ...form,
        precio_venta: num('precio_venta'),
        canon_arriendo: num('canon_arriendo'),
        area_m2: num('area_m2'),
        habitaciones: num('habitaciones'),
        banos: num('banos'),
        parqueaderos: num('parqueaderos'),
        estrato: num('estrato'),
        comision_pct: num('comision_pct'),
      };
      await onSave(data);
      toast.success(initial.id ? 'Propiedad actualizada' : 'Propiedad creada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div><Label>Título *</Label><Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Apartamento 3 hab en Chapinero" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Apartamento','Casa','Local','Oficina','Bodega','Lote','Finca','Otro'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Operación</Label>
          <Select value={form.operacion} onValueChange={v => set('operacion', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Venta','Arriendo','Venta_y_Arriendo'].map(o => <SelectItem key={o} value={o}>{o.replace('_', ' y ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Estado</Label>
          <Select value={form.estado} onValueChange={v => set('estado', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Disponible','Reservado','Vendido','Arrendado','No_disponible'].map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Comisión %</Label><Input type="number" value={form.comision_pct} onChange={e => set('comision_pct', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Precio venta (COP)</Label><Input type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></div>
        <div><Label>Canon arriendo (COP)</Label><Input type="number" value={form.canon_arriendo} onChange={e => set('canon_arriendo', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div><Label>Área m²</Label><Input type="number" value={form.area_m2} onChange={e => set('area_m2', e.target.value)} /></div>
        <div><Label>Hab.</Label><Input type="number" value={form.habitaciones} onChange={e => set('habitaciones', e.target.value)} /></div>
        <div><Label>Baños</Label><Input type="number" value={form.banos} onChange={e => set('banos', e.target.value)} /></div>
        <div><Label>Parq.</Label><Input type="number" value={form.parqueaderos} onChange={e => set('parqueaderos', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Ciudad *</Label><Input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} /></div>
        <div><Label>Barrio</Label><Input value={form.barrio} onChange={e => set('barrio', e.target.value)} /></div>
        <div><Label>Estrato</Label><Input type="number" min="1" max="6" value={form.estrato} onChange={e => set('estrato', e.target.value)} /></div>
      </div>
      <div><Label>Dirección</Label><Input value={form.direccion} onChange={e => set('direccion', e.target.value)} /></div>
      <div><Label>Descripción</Label><Textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={3} /></div>
      <div>
        <Label>Link en la página web</Label>
        <Input
          value={form.link_web || ''}
          onChange={e => set('link_web', e.target.value)}
          placeholder="https://www.inmobiliarelatam.com/inmueble/..."
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          La ficha de este inmueble en nuestra web. Es el enlace que el agente le manda al
          cliente; si está vacío cae a los portales externos, que llevan el tráfico afuera.
        </p>
      </div>
      <div>
        <Label>Link de Instagram (video)</Label>
        <Input
          value={form.link_instagram || ''}
          onChange={e => set('link_instagram', e.target.value)}
          placeholder="https://instagram.com/..."
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          El agente lo manda cuando el cliente pide ver el inmueble en video.
        </p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

function PropiedadCard({ propiedad, onRefresh }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleUpdate = async (data) => {
    await Propiedad.update(propiedad.id, data);
    setEditOpen(false);
    onRefresh();
  };

  const fotoPortada = propiedad.fotos?.[0];

  return (
    <Card className="hover:shadow-md transition-all duration-300 rounded-2xl border-border/60 overflow-hidden">
      {fotoPortada && (
        <div className="w-full h-40 bg-muted overflow-hidden">
          <img src={fotoPortada} alt={propiedad.titulo} className="w-full h-full object-cover" />
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{propiedad.titulo}</p>
            {propiedad.ciudad && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="w-3 h-3" />
                {propiedad.barrio ? `${propiedad.barrio}, ` : ''}{propiedad.ciudad}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={`text-[10px] ${ESTADO_COLORS[propiedad.estado] || ''}`}>{propiedad.estado?.replace('_', ' ')}</Badge>
            <Badge variant="outline" className="text-[10px]">{propiedad.tipo}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          {propiedad.habitaciones && <span className="flex items-center gap-0.5"><Bed className="w-3 h-3" />{propiedad.habitaciones}</span>}
          {propiedad.banos && <span className="flex items-center gap-0.5"><Bath className="w-3 h-3" />{propiedad.banos}</span>}
          {propiedad.parqueaderos > 0 && <span className="flex items-center gap-0.5"><Car className="w-3 h-3" />{propiedad.parqueaderos}</span>}
          {propiedad.area_m2 && <span>{propiedad.area_m2}m²</span>}
          {propiedad.estrato && <span>E{propiedad.estrato}</span>}
        </div>

        <div className="mb-3">
          {propiedad.precio_venta && <p className="text-sm font-bold text-foreground">{formatCOP(propiedad.precio_venta)}</p>}
          {propiedad.canon_arriendo && <p className="text-xs text-muted-foreground">{formatCOP(propiedad.canon_arriendo)}/mes</p>}
        </div>

        <div className="flex items-center gap-1 flex-wrap mb-3">
          {propiedad.publicado_instagram && <Badge className="text-[10px] bg-pink-100 text-pink-700">IG</Badge>}
          {propiedad.publicado_facebook && <Badge className="text-[10px] bg-indigo-100 text-indigo-700">FB</Badge>}
        </div>

        <div className="flex gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1">
                <Edit2 className="w-3 h-3 mr-1" />Editar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Editar propiedad</DialogTitle></DialogHeader>
              <PropiedadForm initial={propiedad} onSave={handleUpdate} onCancel={() => setEditOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Propiedades() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterOp, setFilterOp] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: propiedades = [], isLoading } = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => Propiedad.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['propiedades'] });

  const handleCreate = async (data) => {
    await Propiedad.create(data);
    setCreateOpen(false);
    refresh();
  };

  const filtered = propiedades.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.titulo?.toLowerCase().includes(q) || p.ciudad?.toLowerCase().includes(q) || p.barrio?.toLowerCase().includes(q) || p.direccion?.toLowerCase().includes(q);
    const matchTipo = filterTipo === 'todos' || p.tipo === filterTipo;
    const matchOp = filterOp === 'todos' || p.operacion?.includes(filterOp);
    const matchEstado = filterEstado === 'todos' || p.estado === filterEstado;
    return matchSearch && matchTipo && matchOp && matchEstado;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground text-[15px]">{propiedades.length} inmuebles en cartera</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" />Nueva propiedad</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Nueva propiedad</DialogTitle></DialogHeader>
            <PropiedadForm onSave={handleCreate} onCancel={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por título, ciudad, barrio..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {['Apartamento','Casa','Local','Oficina','Bodega','Lote','Finca','Otro'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOp} onValueChange={setFilterOp}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Operación" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="Venta">Venta</SelectItem>
            <SelectItem value="Arriendo">Arriendo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {['Disponible','Reservado','Vendido','Arrendado','No_disponible'].map(s => <SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando propiedades...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No se encontraron propiedades</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => <PropiedadCard key={p.id} propiedad={p} onRefresh={refresh} />)}
        </div>
      )}
    </div>
  );
}