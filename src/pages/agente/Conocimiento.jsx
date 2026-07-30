import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConocimientoRAG } from '@/api/base44Client';
import { AGENTES, NOMBRE_AGENTE } from '@/lib/agentes';
import { EncabezadoModulo, Cargando, Metrica, Vacio } from '@/components/modulo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS = [
  ['general', 'General'],
  ['base', 'Identidad y servicios'],
  ['voz', 'Voz y estilo'],
  ['antideteccion', 'Naturalidad conversacional'],
  ['politicas', 'Políticas'],
  ['tarifas', 'Tarifas'],
  ['documentos', 'Documentos'],
  ['procesos', 'Procesos'],
  ['mercado', 'Mercado'],
  ['avatar', 'Avatar (legacy)'],
  ['principios', 'Principios (legacy)'],
  ['frases', 'Frases (legacy)'],
  ['conversaciones', 'Conversaciones (legacy)'],
];

const FORM_VACIO = {
  titulo: '',
  contenido: '',
  categoria: 'politicas',
  prioridad: 5,
  agentes: 'todos',
  activo: true,
};

function destinos(valor) {
  return String(valor || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function etiquetaDestinos(valor) {
  const lista = destinos(valor);
  if (lista.includes('todos')) return 'Todos los agentes';
  if (!lista.length) return 'Sin destino';
  return lista.map((clave) => NOMBRE_AGENTE[clave] || clave).join(', ');
}

function Editor({ fila, onCerrar, onGuardado }) {
  const [form, setForm] = useState(() => ({
    ...FORM_VACIO,
    ...(fila || {}),
    prioridad: Number(fila?.prioridad) || 5,
  }));
  const [guardando, setGuardando] = useState(false);
  const seleccion = destinos(form.agentes);
  const paraTodos = seleccion.includes('todos');

  const alternarAgente = (clave, marcado) => {
    const siguiente = new Set(seleccion.filter((item) => item !== 'todos'));
    if (marcado) siguiente.add(clave);
    else siguiente.delete(clave);
    setForm((actual) => ({ ...actual, agentes: [...siguiente].join(',') }));
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.contenido.trim()) {
      return toast.error('Título y contenido son obligatorios');
    }
    if (!destinos(form.agentes).length) {
      return toast.error('Selecciona al menos un agente o “Todos”');
    }
    setGuardando(true);
    const datos = {
      ...(fila || {}),
      titulo: form.titulo.trim(),
      contenido: form.contenido.trim(),
      categoria: form.categoria,
      prioridad: Math.min(10, Math.max(1, Number(form.prioridad) || 5)),
      agentes: form.agentes,
      activo: form.activo,
      origen: fila?.origen || 'negocio:manual',
    };
    try {
      if (fila?.id) await ConocimientoRAG.update(fila.id, datos);
      else await ConocimientoRAG.create(datos);
      toast.success(fila ? 'Conocimiento actualizado' : 'Conocimiento creado');
      await onGuardado();
      onCerrar();
    } catch {
      toast.error('No se pudo guardar el conocimiento');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="rag-titulo">Título</Label>
        <Input
          id="rag-titulo"
          value={form.titulo}
          onChange={(e) => setForm((actual) => ({ ...actual, titulo: e.target.value }))}
          placeholder="Ej. Política de reparaciones locativas"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="rag-contenido">Regla o conocimiento aprobado</Label>
        <Textarea
          id="rag-contenido"
          rows={10}
          value={form.contenido}
          onChange={(e) => setForm((actual) => ({ ...actual, contenido: e.target.value }))}
          placeholder="Escribe la política exacta. Incluye excepciones, montos y cuándo escalar."
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          No cargues supuestos. Si una política aún no está definida, déjala fuera del RAG.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Categoría</Label>
          <Select value={form.categoria} onValueChange={(categoria) => setForm((actual) => ({ ...actual, categoria }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="rag-prioridad">Prioridad (1–10)</Label>
          <Input
            id="rag-prioridad"
            type="number"
            min="1"
            max="10"
            value={form.prioridad}
            onChange={(e) => setForm((actual) => ({ ...actual, prioridad: e.target.value }))}
            className="mt-1"
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-medium">¿Qué agentes reciben este bloque?</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={paraTodos}
            onCheckedChange={(marcado) => setForm((actual) => ({
              ...actual,
              agentes: marcado ? 'todos' : '',
            }))}
          />
          Todos los agentes
        </label>
        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          {AGENTES.map((agente) => (
            <label key={agente.clave} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                disabled={paraTodos}
                checked={!paraTodos && seleccion.includes(agente.clave)}
                onCheckedChange={(marcado) => alternarAgente(agente.clave, marcado)}
              />
              {agente.nombre}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-3">
        <div>
          <p className="text-sm font-medium">Chunk activo</p>
          <p className="text-xs text-muted-foreground">Si se apaga, deja de entrar al prompt inmediatamente.</p>
        </div>
        <Switch
          checked={form.activo}
          onCheckedChange={(activo) => setForm((actual) => ({ ...actual, activo }))}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar conocimiento'}
        </Button>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function Conocimiento() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [agente, setAgente] = useState('todos');
  const [editando, setEditando] = useState(undefined);
  const [eliminando, setEliminando] = useState(null);
  const [borrando, setBorrando] = useState(false);

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['conocimiento_rag'],
    queryFn: () => ConocimientoRAG.list('-prioridad', 200),
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['conocimiento_rag'] });

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return [...filas]
      .filter((fila) => categoria === 'todas' || fila.categoria === categoria)
      .filter((fila) => {
        if (agente === 'todos') return true;
        const lista = destinos(fila.agentes);
        return lista.includes('todos') || lista.includes(agente);
      })
      .filter((fila) => !texto || `${fila.titulo || ''} ${fila.contenido || ''}`.toLowerCase().includes(texto))
      .sort((a, b) => (Number(b.prioridad) || 5) - (Number(a.prioridad) || 5)
        || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
  }, [filas, busqueda, categoria, agente]);

  const confirmarBorrado = async () => {
    if (!eliminando?.id) return;
    setBorrando(true);
    try {
      await ConocimientoRAG.delete(eliminando.id);
      toast.success('Conocimiento eliminado');
      setEliminando(null);
      await refrescar();
    } catch {
      toast.error('No se pudo eliminar');
    } finally {
      setBorrando(false);
    }
  };

  const activos = filas.filter((fila) => fila.activo !== false).length;
  const sinDestino = filas.filter((fila) => !destinos(fila.agentes).length).length;

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Conocimiento RAG"
        resumen="Políticas y datos aprobados que el motor inyecta a cada agente."
      >
        <Button className="gap-2" onClick={() => setEditando(null)}>
          <Plus className="w-4 h-4" /> Nuevo bloque
        </Button>
      </EncabezadoModulo>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metrica etiqueta="Bloques" valor={filas.length} />
        <Metrica etiqueta="Activos" valor={activos} tono="exito" />
        <Metrica etiqueta="Sin destino" valor={sinDestino} tono={sinDestino ? 'peligro' : 'neutro'} />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 grid md:grid-cols-[1fr_190px_190px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar título o contenido"
              className="pl-9"
            />
          </div>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATEGORIAS.map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agente} onValueChange={setAgente}>
            <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los agentes</SelectItem>
              {AGENTES.map((item) => (
                <SelectItem key={item.clave} value={item.clave}>{item.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? <Cargando /> : filtradas.length === 0 ? (
        <Vacio mensaje="No hay conocimiento con esos filtros" icono={BookOpen} />
      ) : (
        <div className="space-y-3">
          {filtradas.map((fila) => {
            const sinAgente = !destinos(fila.agentes).length;
            return (
              <Card key={fila.id} className="rounded-2xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      fila.activo !== false && !sinAgente ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {sinAgente ? <AlertTriangle className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{fila.titulo || 'Sin título'}</p>
                        <Badge variant="secondary">{fila.categoria || 'general'}</Badge>
                        <Badge variant="outline">Prioridad {fila.prioridad || 5}</Badge>
                        {fila.activo === false && <Badge variant="outline">Inactivo</Badge>}
                        {sinAgente && <Badge variant="destructive">No se inyecta</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{etiquetaDestinos(fila.agentes)}</p>
                      <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-3">{fila.contenido}</p>
                      {fila.origen && <p className="text-[11px] text-muted-foreground mt-2">Origen: {fila.origen}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditando(fila)} aria-label="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setEliminando(fila)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editando !== undefined} onOpenChange={(abierto) => !abierto && setEditando(undefined)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar conocimiento' : 'Nuevo conocimiento'}</DialogTitle>
          </DialogHeader>
          {editando !== undefined && (
            <Editor fila={editando} onCerrar={() => setEditando(undefined)} onGuardado={refrescar} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!eliminando} onOpenChange={(abierto) => !abierto && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{eliminando?.titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>
              El bloque dejará de estar disponible para los agentes. Si solo quieres pausarlo, edítalo y apaga “Chunk activo”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado} disabled={borrando}>
              {borrando ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
