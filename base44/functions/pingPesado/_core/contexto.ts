// Cargadores de contexto por agente.
//
// El motor viejo cargaba el catalogo completo de 100 propiedades y todos los
// chunks RAG aunque el mensaje fuera "quiero pagar mi arriendo". Aqui cada
// agente pide solo lo suyo, y todo lo independiente va en paralelo.

import type { Db } from './db.ts';
import { type Agente, type Entrada, type Estado } from './protocol.ts';
import { IDENTIDAD_MARCA, PROMPTS } from './prompts.ts';

export const MAX_RAG_CHARS = 6000;

type ChunkRag = Record<string, any>;

function destinosDe(ch: ChunkRag): string[] {
  return String(ch.agentes || '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Seleccion determinista y fail-closed del conocimiento que recibe un agente.
 *
 * Los chunks especificos entran antes que los comunes. Un chunk sin `agentes`
 * no se inyecta: el tenant anterior dejo conocimiento contaminado sin ese campo
 * y tratarlo como `todos` fue precisamente lo que mezclo las dos marcas.
 */
export function seleccionarRag(
  chunks: ChunkRag[],
  agente: Agente,
  maxChars = MAX_RAG_CHARS,
): { texto: string; titulos: string[]; chars: number } {
  const relevantes = (chunks || [])
    .map((ch) => ({ ch, destinos: destinosDe(ch) }))
    .filter(({ destinos }) => destinos.includes('todos') || destinos.includes(agente))
    .sort((a, b) => {
      const especificoA = a.destinos.includes(agente) && !a.destinos.includes('todos') ? 1 : 0;
      const especificoB = b.destinos.includes(agente) && !b.destinos.includes('todos') ? 1 : 0;
      return especificoB - especificoA
        || (Number(b.ch.prioridad) || 5) - (Number(a.ch.prioridad) || 5)
        || String(a.ch.titulo || '').localeCompare(String(b.ch.titulo || ''), 'es');
    });

  let usado = 0;
  const trozos: string[] = [];
  const titulos: string[] = [];
  for (const { ch } of relevantes) {
    const titulo = String(ch.titulo || '').trim();
    const contenido = String(ch.contenido || '').trim();
    if (!titulo || !contenido) continue;
    const bloque = `[${titulo}]\n${contenido}\n\n`;
    // No cortar toda la seleccion porque un bloque no quepa: puede haber otro
    // mas pequeno y relevante despues.
    if (usado + bloque.length > maxChars) continue;
    trozos.push(bloque);
    titulos.push(titulo);
    usado += bloque.length;
  }
  return { texto: trozos.join(''), titulos, chars: usado };
}

/** ConfigAgente.activo funciona como kill switch global. */
export function agentesAutomaticosActivos(config: Record<string, any> | null | undefined): boolean {
  return config?.activo !== false;
}

export interface Base {
  config: Record<string, any>;
  prompt: Record<string, any> | null;
  identidadMarca: string;
  rag: string;
  ragTitulos: string[];
  ragChars: number;
}

function promptActivoMasReciente(filas: Record<string, any>[]): Record<string, any> | null {
  return [...(filas || [])]
    .filter((fila) => fila.activo !== false)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;
}

// Lo que necesita CUALQUIER agente: la config operativa, su fila de prompt y
// los chunks de conocimiento que le corresponden.
export async function cargarBase(db: Db, agente: Agente): Promise<Base> {
  const [config, prompts, marcas, chunks] = await Promise.all([
    db.uno('ConfigAgente', { clave: 'general' }),
    db.list('AgentePrompt', { agente, limit: 100 }),
    db.list('AgentePrompt', { agente: 'identidad_marca', limit: 100 }),
    db.list('ConocimientoRAG', { activo: true, limit: 200 }),
  ]);

  const seleccion = seleccionarRag(chunks || [], agente);
  const prompt = promptActivoMasReciente(prompts || []);
  const marca = promptActivoMasReciente(marcas || []);

  return {
    config: config || {},
    prompt,
    identidadMarca: String(marca?.prompt || ''),
    rag: seleccion.texto ? `=== CONOCIMIENTO DE LA CASA ===\n${seleccion.texto}` : '',
    ragTitulos: seleccion.titulos,
    ragChars: seleccion.chars,
  };
}

type Cargador = (db: Db, estado: Estado, entrada: Entrada) => Promise<Record<string, any>>;

const CARGADORES: Record<Agente, Cargador> = {
  recepcion: async () => ({}),

  ventas: async (db, estado) => {
    const [catalogo, campanas] = await Promise.all([
      db.list('Propiedad', { estado: 'Disponible', limit: 100 }),
      estado.compartido.campana_id
        ? db.list('CampanaAds', { id: String(estado.compartido.campana_id), limit: 1 })
        : Promise.resolve([]),
    ]);
    const arr = catalogo.filter((p: any) => String(p.operacion || '').includes('Arriendo')).length;
    const ven = catalogo.filter((p: any) => String(p.operacion || '').includes('Venta')).length;
    const barrios = [...new Set(catalogo.map((p: any) => p.barrio).filter(Boolean))].slice(0, 20);
    return {
      catalogo,
      campana: campanas[0] || null,
      resumen_portafolio: catalogo.length
        ? `Hoy hay ${catalogo.length} inmuebles activos: ${arr} en arriendo y ${ven} en venta.` +
          (barrios.length ? ` Zonas con disponibilidad: ${barrios.join(', ')}.` : '')
        : '',
    };
  },

  // Cartera carga UN contrato y UN extracto. No carga inventario.
  cartera: async (db, estado, entrada) => {
    const tel = entrada.tel.replace(/\D/g, '');
    const [arrs, props] = await Promise.all([
      db.list('Arrendatario', { telefono: tel, limit: 1 }),
      db.list('Propietario', { telefono: tel, limit: 1 }),
    ]);
    const arrendatario = arrs[0] || null;
    const contrato = arrendatario
      ? (await db.list('ContratoArriendo', { arrendatario_id: arrendatario.id, estado: 'Activo', limit: 1 }))[0] || null
      : null;
    return {
      es_cliente: !!(arrendatario || props[0]),
      tiene_contrato: !!contrato,
      es_propietario: !!props[0],
      nombre_registrado: arrendatario?.nombre || props[0]?.nombre || '',
    };
  },

  mantenimiento: async (db, estado, entrada) => {
    const tel = entrada.tel.replace(/\D/g, '');
    const arr = (await db.list('Arrendatario', { telefono: tel, limit: 1 }))[0] || null;
    const abiertas = arr
      ? (await db.list('Reparacion', { arrendatario_id: arr.id, limit: 5 }))
          .filter((r: any) => r.estado !== 'Cerrada' && r.estado !== 'Cancelada')
      : [];
    return { es_cliente: !!arr, reparaciones_abiertas: abiertas.length, nombre_registrado: arr?.nombre || '' };
  },

  consignacion: async (db, _estado, entrada) => {
    const prop = (await db.list('Propietario', { telefono: entrada.tel.replace(/\D/g, ''), limit: 1 }))[0] || null;
    return { ya_es_propietario: !!prop, nombre_registrado: prop?.nombre || '' };
  },

  avaluos: async () => ({}),
  pqr: async () => ({}),
  matricula: async () => ({}),
};

export async function cargarContexto(db: Db, agente: Agente, estado: Estado, entrada: Entrada) {
  try {
    return await CARGADORES[agente](db, estado, entrada);
  } catch (e) {
    console.error(`contexto ${agente} error:`, (e as Error).message);
    return {};
  }
}

// Ensambla el system prompt: identidad de marca (una fila, aplica a todos) +
// el prompt del agente + estado inyectado + RAG filtrado.
export function armarSystem(
  base: Base,
  agente: Agente,
  estado: Estado,
  ctxAgente: Record<string, any>,
): string {
  const partes: string[] = [];
  partes.push(base.identidadMarca || IDENTIDAD_MARCA);
  partes.push(String(base.prompt?.prompt || PROMPTS[agente] || ''));
  if (base.rag) partes.push(base.rag);

  const nombre = String(estado.compartido.nombre || '');
  const i = estado.identidad;
  const estadoTxt = [
    '=== ESTADO DE ESTA CONVERSACION ===',
    nombre ? `El cliente se llama ${nombre}. Dirigite a el por su primer nombre.` : 'Aun no sabes su nombre.',
    `Identidad verificada: ${i.verificado && i.expira && new Date(i.expira) > new Date() ? 'SI' : 'NO'}`,
    i.bloqueado_hasta && new Date(i.bloqueado_hasta) > new Date() ? 'ATENCION: bloqueado por intentos fallidos de verificacion.' : '',
    Object.keys(ctxAgente.datos || {}).length ? `Datos que ya tienes: ${JSON.stringify(ctxAgente.datos)}` : '',
    ctxAgente.resumen_portafolio ? `\n${ctxAgente.resumen_portafolio}` : '',
    ctxAgente.nombre_registrado ? `En el sistema figura como: ${ctxAgente.nombre_registrado}` : '',
  ].filter(Boolean).join('\n');
  partes.push(estadoTxt);

  partes.push(
    '=== COMO RESPONDER ===\n' +
    'Terminas SIEMPRE tu turno llamando a la herramienta `responder`. Es la unica forma de que el cliente te lea.\n' +
    'Puedes llamar varias herramientas en el mismo turno: guarda los datos que hagan falta y responde, todo junto.\n' +
    'Escribe corto: maximo dos frases por globo. Nunca uses el guion largo. Nunca uses emojis.\n' +
    'Jamas afirmes un dato que no venga del contexto o del resultado de una herramienta. Si no lo tienes, dilo.',
  );

  return partes.join('\n\n');
}
