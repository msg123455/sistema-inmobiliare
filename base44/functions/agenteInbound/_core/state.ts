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
  return await db.guardar('MemoriaChat', memoriaId, {
    clave: claveDe(canal, tel),
    telefono: String(tel).replace(/\D/g, ''),
    canal: canal === 'telegram' ? 'Telegram' : 'WhatsApp',
    nombre: String(estado.compartido.nombre || ''),
    contacto_id: extra.contacto_id ?? String(estado.compartido.contacto_id || ''),
    agente_activo: estado.agente_activo,
    pausada: estado.pausada,
    // Campo indexado: continuarTurno lo consulta en vez de escanear la tabla.
    tiene_turno_pendiente: !!estado.turno_pendiente,
    estado_json: JSON.stringify(estado),
    ultimo_mensaje: (extra.ultimo_mensaje || '').slice(0, 1000),
    ultima_respuesta: (extra.ultima_respuesta || '').slice(0, 1000),
    fecha_ultimo_mensaje: new Date().toISOString(),
  });
}
