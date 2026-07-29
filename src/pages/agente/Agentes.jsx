import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { EncabezadoModulo, FilaCard, Vacio, Cargando, Metrica } from '@/components/modulo';

const AgentePrompt = base44.entities.AgentePrompt;

// Los nueve agentes de la arquitectura. El catalogo vive aqui para poder mostrar
// los que todavia no tienen fila creada: si solo listaramos lo que hay en la
// tabla, un agente sin prompt seria invisible justo cuando hay que escribirselo.
const AGENTES = [
  { clave: 'recepcion',    nombre: 'Recepción',    resumen: 'Orquestador. Desambigua y rutea.' },
  { clave: 'ventas',       nombre: 'Ventas',       resumen: 'Busca inmuebles, califica leads, agenda visitas.' },
  { clave: 'consignacion', nombre: 'Consignación', resumen: 'Capta inmuebles para venta o administración.' },
  { clave: 'cartera',      nombre: 'Cartera',      resumen: 'Estado de cuenta y pagos. Requiere verificación.' },
  { clave: 'mantenimiento',nombre: 'Mantenimiento',resumen: 'Reparaciones y emergencias.' },
  { clave: 'avaluos',      nombre: 'Avalúos',      resumen: 'Cotiza y agenda avalúos.' },
  { clave: 'pqr',          nombre: 'PQR',          resumen: 'Radica peticiones y reclamos. Plazo legal.' },
  { clave: 'matricula',    nombre: 'Matrícula',    resumen: 'Intake del F117 y participantes.' },
  { clave: 'encuestas',    nombre: 'Encuestas',    resumen: 'NPS y satisfacción.' },
];

const MODELOS = [
  { id: 'claude-sonnet-4-5', etiqueta: 'Sonnet 4.5 — conversación' },
  { id: 'claude-haiku-4-5-20251001', etiqueta: 'Haiku 4.5 — rápido y barato' },
];

// Tope duro del prompt. Mas alla de esto el agente se vuelve dificil de razonar
// y empieza a contradecirse; es la disciplina que evita repetir el system prompt
// de 350 lineas que tenia el bot anterior.
const MAX_LINEAS = 80;

function Editor({ agente, fila, onGuardado, onCerrar }) {
  const [prompt, setPrompt] = useState(fila?.prompt || '');
  const [modelo, setModelo] = useState(fila?.modelo || 'claude-sonnet-4-5');
  const [maxTokens, setMaxTokens] = useState(String(fila?.max_tokens || 1500));
  const [activo, setActivo] = useState(fila?.activo ?? true);
  const [guardando, setGuardando] = useState(false);

  const lineas = prompt ? prompt.split('\n').length : 0;
  const excedido = lineas > MAX_LINEAS;

  const guardar = async () => {
    if (!prompt.trim()) return toast.error('El prompt no puede estar vacío');
    setGuardando(true);
    try {
      const datos = {
        agente: agente.clave,
        prompt,
        modelo,
        max_tokens: Number(maxTokens) || 1500,
        activo,
        // La version sube en cada guardado: permite volver atras si un cambio de
        // prompt degrada las conversaciones.
        version: (Number(fila?.version) || 0) + 1,
      };
      if (fila) await AgentePrompt.update(fila.id, datos);
      else await AgentePrompt.create(datos);
      toast.success(`${agente.nombre} guardado (v${datos.version})`);
      onGuardado();
      onCerrar();
    } catch { toast.error('No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{agente.resumen}</p>
      <div>
        <div className="flex items-center justify-between">
          <Label>Prompt del agente</Label>
          <span className={`text-[11px] tabular ${excedido ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {lineas}/{MAX_LINEAS} líneas
          </span>
        </div>
        <Textarea rows={14} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  className="font-mono text-xs mt-1"
                  placeholder="Rol, límites y qué NO debe hacer. La identidad de marca se inyecta aparte." />
        {excedido && (
          <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Pasa de {MAX_LINEAS} líneas. Los prompts largos se contradicen; parte lo que sea conocimiento en chunks de RAG.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Modelo</Label>
          <Select value={modelo} onValueChange={setModelo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MODELOS.map((m) => <SelectItem key={m.id} value={m.id}>{m.etiqueta}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Máx. tokens</Label><Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-muted p-3">
        <div>
          <p className="text-sm font-medium">Agente activo</p>
          <p className="text-xs text-muted-foreground">Si se apaga, recepción no le transfiere conversaciones.</p>
        </div>
        <Switch checked={activo} onCheckedChange={setActivo} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1 presionable" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : fila ? `Guardar v${(Number(fila.version) || 0) + 1}` : 'Crear prompt'}
        </Button>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function Agentes() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);

  const { data: filas = [], isLoading } = useQuery({ queryKey: ['agente_prompts'], queryFn: () => AgentePrompt.list() });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['agente_prompts'] });

  // Si hay varias versiones de un agente, manda la de version mas alta.
  const filaDe = (clave) => filas
    .filter((f) => f.agente === clave)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;

  const configurados = AGENTES.filter((a) => filaDe(a.clave)).length;
  const activos = AGENTES.filter((a) => filaDe(a.clave)?.activo).length;

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Agentes IA"
        resumen={`${configurados} de ${AGENTES.length} con prompt · ${activos} activos`}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metrica etiqueta="Configurados" valor={`${configurados}/${AGENTES.length}`} tono={configurados === AGENTES.length ? 'exito' : 'curso'} />
        <Metrica etiqueta="Activos" valor={activos} tono="exito" />
        <Metrica etiqueta="Sin prompt" valor={AGENTES.length - configurados} tono={configurados === AGENTES.length ? 'neutro' : 'peligro'} />
      </div>

      <p className="text-xs text-muted-foreground">
        Los prompts viven en datos, no en código: editarlos aquí no requiere desplegar.
        La identidad de marca es común a todos y se inyecta aparte.
      </p>

      {isLoading ? <Cargando /> : (
        <div className="space-y-3">
          {AGENTES.map((a) => {
            const fila = filaDe(a.clave);
            return (
              <FilaCard key={a.clave} onClick={() => setEditando(a)}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${fila?.activo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm">{a.nombre}</span>
                      {fila ? (
                        <>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular">v{fila.version || 1}</span>
                          {!fila.activo && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">inactivo</span>}
                        </>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">sin prompt</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{a.resumen}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs presionable">
                    <Pencil className="w-3 h-3 mr-1" />{fila ? 'Editar' : 'Escribir'}
                  </Button>
                </div>
              </FilaCard>
            );
          })}
          {AGENTES.length === 0 && <Vacio mensaje="No hay agentes definidos" icono={Bot} />}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editando?.nombre}</DialogTitle></DialogHeader>
          {editando && (
            <Editor
              agente={editando}
              fila={filaDe(editando.clave)}
              onGuardado={refrescar}
              onCerrar={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
