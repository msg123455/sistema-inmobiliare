// Carga, migracion y guardado del estado de conversacion.
// MemoriaChat es el UNICO almacen. La escritura dual a Nota queda retirada:
// eran tres escritores sobre dos copias, y `pausada` se leia de la copia
// equivocada.

import type { Db } from './db.ts';
import { type Agente, type Estado, type Identidad, esAgente } from './protocol.ts';

// Clave indexada de busqueda. Reemplaza el scan `?limit=500` que corria dos
// veces por mensaje: no se despacha un full-table scan a cada WhatsApp que entra.
export const claveDe = (canal: string, tel: string) =>
  `${canal === 'telegram' ? 'tg' : 'wa'}:${String(tel).replace(/\D/g, '')}`;

export function identidadVacia(): Identidad {
  return {
    verificado: false, metodo: null,
    arrendatario_id: null, contrato_id: null, propietario_id: null,
    verificado_en: null, expira: null, intentos: 0, bloqueado_hasta: null,
  };
}

export function estadoVacio(): Estado {
  return {
    v: 2,
    agente_activo: 'recepcion',
    agente_historial: [],
    identidad: identidadVacia(),
    compartido: {},
    historial: [],
    ctx: {},
    turno_pendiente: null,
    msg_ids: [],
    pausada: false,
  };
}

// v1 -> v2. Perezosa (al leer) e idempotente: los hilos vivos no se rompen.
// El estado v1 era plano — `datos`, `etapa_ventas`, `objeciones_activas` eran
// del agente de ventas aunque nadie lo dijera. Aqui se nombra.
export function migrar(raw: unknown): Estado {
  const v = estadoVacio();
  if (!raw || typeof raw !== 'object') return v;
  const o = raw as Record<string, any>;

  if (o.v === 2) {
    return {
      ...v, ...o,
      identidad: { ...identidadVacia(), ...(o.identidad || {}) },
      ctx: o.ctx && typeof o.ctx === 'object' ? o.ctx : {},
      agente_activo: esAgente(o.agente_activo) ? o.agente_activo : 'recepcion',
      historial: Array.isArray(o.historial) ? o.historial : [],
      msg_ids: Array.isArray(o.msg_ids) ? o.msg_ids : [],
      agente_historial: Array.isArray(o.agente_historial) ? o.agente_historial : [],
    };
  }

  const ahora = new Date().toISOString();
  return {
    ...v,
    agente_activo: 'ventas',
    agente_historial: [{ agente: 'ventas', desde: ahora, motivo: 'migracion:v1' }],
    compartido: {
      nombre: o.datos?.nombre || o.nombre || '',
      contacto_id: o.contacto_id || '',
      campana_id: o.campana_id || '',
      campana_nombre: o.campana_nombre || '',
    },
    historial: Array.isArray(o.historial) ? o.historial : [],
    msg_ids: Array.isArray(o.msg_ids) ? o.msg_ids : [],
    pausada: !!o.pausada,
    ctx: {
      ventas: {
        datos: o.datos && typeof o.datos === 'object' ? o.datos : {},
        etapa_ventas: o.etapa_ventas || 'calentamiento',
        estado_emocional: o.estado_emocional || 'sin_definir',
        tipo_comprador: o.tipo_comprador || 'sin_definir',
        motivacion_principal: o.motivacion_principal || 'sin_definir',
        nivel_urgencia: o.nivel_urgencia || 'explorando',
        objeciones_activas: Array.isArray(o.objeciones_activas) ? o.objeciones_activas : [],
        calificado: !!o.calificado,
        descalificado: !!o.descalificado,
        motivo_desc: o.motivo_desc || '',
        broker: o.broker || '',
        broker_tel: o.broker_tel || '',
        broker_genero: o.broker_genero || '',
        despidio: !!o.despidio,
      },
    },
  };
}

export interface MemoriaCargada { id: string | null; estado: Estado; fila: Record<string, any> | null }

export async function cargarEstado(db: Db, canal: string, tel: string): Promise<MemoriaCargada> {
  const clave = claveDe(canal, tel);
  // Primero por clave indexada; el fallback por telefono cubre las filas que
  // aun no tienen `clave` escrita (se rellena al guardar, una sola vez).
  let fila = await db.uno('MemoriaChat', { clave });
  if (!fila) fila = await db.uno('MemoriaChat', { telefono: String(tel).replace(/\D/g, '') });
  if (!fila) return { id: null, estado: estadoVacio(), fila: null };

  let bruto: unknown = {};
  try { bruto = JSON.parse(fila.estado_json || '{}'); } catch { /* estado corrupto: se arranca limpio */ }
  return { id: fila.id, estado: migrar(bruto), fila };
}

export function ctxDe(estado: Estado, agente: Agente): Record<string, any> {
  if (!estado.ctx[agente]) estado.ctx[agente] = {};
  return estado.ctx[agente];
}

// El handoff preserva todo: fija el agente, deja rastro en agente_historial y
// empuja un marcador al historial compartido para que el agente nuevo entienda
// por que le llego la conversacion a medias.
export function transferir(estado: Estado, destino: Agente, motivo: string) {
  const origen = estado.agente_activo;
  if (origen === destino) return;
  estado.agente_activo = destino;
  estado.agente_historial = [
    ...estado.agente_historial,
    { agente: destino, desde: new Date().toISOString(), motivo },
  ].slice(-20);
  estado.historial.push({
    role: 'user',
    content: `[Sistema: transferido de ${origen} a ${destino}. Motivo: ${motivo}]`,
    ts: new Date().toISOString(),
  });
}

/**
 * Quita del scratch persistido las claves que vienen de cargarContexto.
 *
 * cargarContexto trae datos FRESCOS en cada turno (el catalogo, el contrato, el
 * extracto). Mezclarlos en estado.ctx[agente] es correcto para que las tools los
 * lean, pero esas claves NO deben viajar a estado_json: se recargan solas y
 * guardarlas hincha el estado sin aportar nada.
 *
 * Esto no era visible hasta que el catalogo dejo de estar vacio. Con 2703
 * inmuebles, ventas metia 100 propiedades completas en cada guardado y la
 * escritura de MemoriaChat empezo a fallar por tamano: el agente respondia pero
 * la conversacion no quedaba registrada en ningun lado.
 */
export function olvidarTransitorios(
  estado: Estado,
  agente: Agente,
  claves: string[],
): void {
  const scratch = estado.ctx[agente];
  if (!scratch) return;
  for (const k of claves) delete scratch[k];
}

/**
 * Escalones de reduccion del estado, del mas completo al mas pobre.
 *
 * POR QUE ESCALONES Y NO UN TOPE. Antes habia un solo tope de 60.000 chars, un
 * numero inventado por nosotros: si el estado no llegaba ahi, se mandaba tal
 * cual. Pero el limite de Base44 es MAS BAJO y no esta documentado, asi que un
 * estado de 20k pasaba nuestro control y Base44 lo rechazaba igual:
 *
 *   db.crear MemoriaChat 400 Field 'estado_json' exceeds the maximum allowed size
 *
 * Y como el rechazo no rompia nada visible, el turno siguiente cargaba una
 * conversacion vacia: el agente no recordaba, se re-fijaba en su agente de
 * entrada y nada aparecia en la Bandeja. Dos sintomas, una causa.
 *
 * En vez de adivinar el limite, se intenta y se degrada. Cada escalon conserva
 * lo mas caro de perder y suelta lo mas barato de recuperar. El ultimo guarda
 * solo la identidad y los dos ultimos mensajes: feo, pero la conversacion
 * sobrevive y la Bandeja la muestra.
 */
const ESCALONES: Array<{ nombre: string; reducir: (e: Estado) => Estado }> = [
  { nombre: 'completo', reducir: (e) => e },
  // El scratch se recarga solo en el turno siguiente. Es lo primero que sobra.
  { nombre: 'sin ctx', reducir: (e) => ({ ...e, ctx: {} }) },
  { nombre: 'sin ctx, 8 mensajes', reducir: (e) => ({ ...e, ctx: {}, historial: e.historial.slice(-8) }) },
  {
    nombre: 'minimo',
    reducir: (e) => ({
      ...estadoVacio(),
      agente_activo: e.agente_activo,
      agente_historial: e.agente_historial.slice(-3),
      identidad: e.identidad,
      compartido: e.compartido,
      historial: e.historial.slice(-2),
      msg_ids: e.msg_ids.slice(-5),
      pausada: e.pausada,
    }),
  },
];

export async function guardarEstado(
  db: Db,
  memoriaId: string | null,
  canal: string,
  tel: string,
  estado: Estado,
  extra: { ultimo_mensaje?: string; ultima_respuesta?: string; contacto_id?: string } = {},
): Promise<string | null> {
  estado.historial = estado.historial.slice(-24);
  estado.msg_ids = estado.msg_ids.slice(-20);

  const fila = (json: string) => ({
    clave: claveDe(canal, tel),
    telefono: String(tel).replace(/\D/g, ''),
    canal: canal === 'telegram' ? 'Telegram' : 'WhatsApp',
    nombre: String(estado.compartido.nombre || ''),
    contacto_id: extra.contacto_id ?? String(estado.compartido.contacto_id || ''),
    agente_activo: estado.agente_activo,
    pausada: estado.pausada,
    // Campo indexado: continuarTurno lo consulta en vez de escanear la tabla.
    tiene_turno_pendiente: !!estado.turno_pendiente,
    estado_json: json,
    ultimo_mensaje: (extra.ultimo_mensaje || '').slice(0, 1000),
    ultima_respuesta: (extra.ultima_respuesta || '').slice(0, 1000),
    fecha_ultimo_mensaje: new Date().toISOString(),
  });

  for (const [i, escalon] of ESCALONES.entries()) {
    const json = JSON.stringify(escalon.reducir(estado));
    const id = await db.guardar('MemoriaChat', memoriaId, fila(json));
    if (id) {
      // Solo se avisa cuando hubo que degradar. Que el primer intento pase es lo
      // normal y no merece una linea de log por mensaje.
      if (i > 0) {
        console.error(
          `estado guardado en el escalon "${escalon.nombre}" (${json.length} chars): ` +
          `Base44 rechazo los ${i} intento(s) anteriores por tamano`,
        );
      }
      return id;
    }
    console.error(`escalon "${escalon.nombre}" rechazado (${json.length} chars)`);
  }

  // Los cuatro escalones fallaron. Ya no es tamano: es otra cosa (permisos, la
  // entidad, Base44 caido). Se grita fuerte porque a partir de aqui el agente
  // responde sin memoria y sin dejar rastro, que es el peor modo de fallo.
  console.error('NO SE PUDO GUARDAR MemoriaChat en ningun escalon — la conversacion se pierde');
  return null;
}
