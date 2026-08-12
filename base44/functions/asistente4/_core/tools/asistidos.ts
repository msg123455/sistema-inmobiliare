// Control de asistidos: el registro de que una persona del equipo SI atendio lo
// que el cliente pidio.
//
// POR QUE EXISTE: hasta ahora escalar_a_humano creaba una fila de Tarea. Eso
// deja constancia de que algo quedo pendiente, pero no cierra el circulo: nadie
// puede marcar "yo lo atendi", nadie puede ver que quedo SIN atender, y la
// Tarea no apunta a la reparacion o a la PQR que la origino, asi que no hay
// historial por persona. La casa lo pidio con esas palabras: un boton por
// solicitud y el historial de todo lo que se ha hecho.
//
// UN SOLO ESCRITOR. Las tres puertas por las que hoy entra una solicitud
// (escalamiento, reparacion, PQR) llaman a `abrirAsistencia`. Si cada tool
// armara su propia fila, en dos meses habria tres formatos de numero de orden y
// dos campos de telefono distintos.

import { definirTool, type Tool, type CtxTool } from '../protocol.ts';

// Entidades que pueden originar una orden. Son nombres de entidad REALES para
// que la pantalla resuelva el registro vigente sin adivinar. 'Escalamiento' es
// el caso sin expediente propio: nacio del chat y no hay otra fila que mirar.
export type OrigenAsistencia =
  | 'Reparacion'
  | 'PQR'
  | 'Contacto'
  | 'Avaluo'
  | 'Consignacion'
  | 'SolicitudMatricula'
  | 'Escalamiento';

// Cada modulo nombra la urgencia a su manera: el escalamiento en minuscula,
// PQR en capitalizada, mantenimiento con 'Emergencia'. La orden guarda una sola
// escala; Emergencia entra como Urgente porque en la bandeja de asistidos lo
// unico que importa es que se atiende primero.
const PRIORIDAD: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
  emergencia: 'Urgente',
};

/**
 * Numero de orden visible.
 *
 * Mismo formato que el radicado de PQR y por la misma razon: los ultimos 6
 * digitos de Date.now() se repiten cada ~16 minutos, y un numero repetido le
 * entrega a un cliente la orden de otro.
 */
export function numeroOrden(ahora: Date = new Date()): string {
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ahora.getFullYear()}-${ahora.getTime().toString().slice(-6)}-${azar}`;
}

export interface DatosAsistencia {
  origen_tipo: OrigenAsistencia;
  origen_id?: string;
  origen_radicado?: string;
  asunto: string;
  detalle?: string;
  prioridad?: string;
  solicitante_nombre?: string;
}

/**
 * Abre la orden. Devuelve el numero de orden, o '' si la escritura fallo.
 *
 * El sujeto NUNCA viene por parametro del modelo: nombre, telefono, contrato y
 * direccion salen del estado y de la entrada, que solo escribe el servidor.
 */
export async function abrirAsistencia(c: CtxTool, datos: DatosAsistencia): Promise<string> {
  const orden = numeroOrden();
  const nombre = String(
    datos.solicitante_nombre
      || c.estado.compartido.nombre
      || c.ctxAgente.titular_nombre
      || c.ctxAgente.nombre_registrado
      || '',
  ).slice(0, 200);

  const fila = await c.db.crear('OrdenAsistencia', {
    numero_orden: orden,
    origen_tipo: datos.origen_tipo,
    origen_id: String(datos.origen_id || ''),
    origen_radicado: String(datos.origen_radicado || ''),
    origen_agente: c.estado.agente_activo,
    canal: c.entrada.canal,
    asunto: String(datos.asunto || 'Solicitud sin asunto').slice(0, 200),
    detalle: String(datos.detalle || '').slice(0, 4000),
    solicitante_nombre: nombre,
    solicitante_telefono: c.entrada.tel.replace(/\D/g, ''),
    contacto_id: String(c.estado.compartido.contacto_id || ''),
    contrato_id: String(c.estado.identidad.contrato_id || ''),
    direccion_inmueble: String(c.estado.compartido.direccion_inmueble || ''),
    estado: 'Abierta',
    prioridad: PRIORIDAD[String(datos.prioridad || 'media').toLowerCase()] || 'Media',
    fecha_solicitud: new Date().toISOString(),
  });

  // db.crear devuelve null cuando Base44 rechaza la escritura. Devolver un
  // numero de orden inventado seria peor que no devolver ninguno: el cliente se
  // quedaria con un numero que no existe en la base.
  return fila ? orden : '';
}

export const consultarHistorialSolicitudes: Tool = {
  ...definirTool(
    'consultar_historial_solicitudes',
    'Trae lo que esta persona ya ha pedido antes desde este mismo numero: reparaciones, PQR y escalamientos, con el estado de cada uno y si el equipo ya los atendio. Usala cuando diga "es sobre lo de la otra vez", pregunte como va algo que ya reporto, o insista con un tema.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, c: CtxTool) => {
    // Sin parametros a proposito. El sujeto sale del telefono de la entrada, que
    // solo escribe el servidor: asi una inyeccion de prompt no tiene de donde
    // agarrarse para pedir el historial de otra persona.
    const tel = c.entrada.tel.replace(/\D/g, '');
    const ordenes = await c.db.list('OrdenAsistencia', { solicitante_telefono: tel, limit: 30 });

    if (!ordenes.length) {
      return {
        total: 0,
        instruccion: 'No hay nada registrado con este numero. NO le digas que "no existe" ni que "nunca ha escrito": '
          + 'pudo hacerlo desde otro numero, por correo o en la oficina. Preguntale de que se trata y sigue.',
      };
    }

    const recientes = [...ordenes]
      .sort((a: any, b: any) => String(b.fecha_solicitud || '').localeCompare(String(a.fecha_solicitud || '')))
      .slice(0, 8);

    return {
      total: ordenes.length,
      abiertas: ordenes.filter((o: any) => o.estado !== 'Cerrada').length,
      // `detalle` NO viaja: es el brief interno con todo lo que el cliente conto
      // en su momento. Para saber de que se trata basta el asunto.
      solicitudes: recientes.map((o: any) => ({
        orden: o.numero_orden || null,
        tipo: o.origen_tipo,
        radicado: o.origen_radicado || null,
        asunto: o.asunto,
        estado: o.estado,
        atendida: !!o.fecha_asistencia,
        fecha: String(o.fecha_solicitud || '').slice(0, 10),
        resultado: o.resultado ? String(o.resultado).slice(0, 300) : null,
      })),
      instruccion: 'Es el historial de ESTE numero. Menciona solo lo que aparece aqui. `resultado` es una nota '
        + 'interna del asesor: resumela con tus palabras, no la leas literal. Si `atendida` es false, NO digas que '
        + 'alguien ya lo esta viendo. No inventes fechas de solucion, responsables ni estados que no esten en la lista.',
    };
  },
};

export const ASISTIDOS: Record<string, Tool> = {
  consultar_historial_solicitudes: consultarHistorialSolicitudes,
};
