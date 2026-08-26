// Resumen ejecutivo del lead para cuando entra un humano.
//
// POR QUE EXISTE: al escalar, el equipo recibia nombre, telefono y una frase
// que redacto el propio modelo. Todo lo que `guardar_dato` habia acumulado
// durante la conversacion —presupuesto, zona, operacion, timing, forma de pago—
// se quedaba en el estado y no viajaba. El asesor abria la Bandeja y tenia que
// reconstruir el contexto desde cero, o peor, volvia a preguntarle al cliente
// lo que ya habia contestado.
//
// Lo ironico es que el brief bueno ya existia: calificar_lead armaba uno
// completo. Simplemente no se usaba en el escalamiento, que es donde mas falta
// hace.
//
// Se manda un RESUMEN, no la transcripcion: el humano necesita decidir en diez
// segundos si llama ya, no leer treinta mensajes.

import type { Estado } from './protocol.ts';

const ETIQUETAS: Record<string, string> = {
  operacion: 'Operacion',
  tipo_prop: 'Tipo de inmueble',
  tipo_inmueble: 'Tipo de inmueble',
  zona: 'Zona',
  barrio: 'Zona',
  presupuesto: 'Presupuesto',
  habitaciones: 'Habitaciones',
  timing: 'Cuando se muda',
  forma_pago: 'Forma de pago',
  decide_solo: 'Decide solo',
  otra_inmobiliaria: 'Ya trabaja con otra inmobiliaria',
  direccion_inmueble: 'Direccion del inmueble',
  documento: 'Documento',
  email: 'Correo',
};

const fmt = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'si' : 'no';
  if (typeof v === 'number') {
    return v >= 1000
      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
          .format(v).replace(/\s+/g, '')
      : String(v);
  }
  return String(v ?? '').trim();
};

/**
 * Arma el brief. `extra` permite agregar lineas propias del motivo del
 * escalamiento sin que este modulo tenga que conocerlas.
 */
export function briefLead(estado: Estado, tel: string, canal: string, extra: string[] = []): string {
  const lineas: string[] = [];

  const nombre = String(estado.compartido.nombre || '').trim();
  lineas.push(nombre ? `${nombre} — wa.me/${tel}` : `Sin nombre — wa.me/${tel}`);
  lineas.push(`Canal: ${canal}`);

  // Por donde paso la conversacion. Un lead que arranco en ventas y termino en
  // PQR cuenta una historia distinta a uno que entro directo a PQR.
  const ruta = (estado.agente_historial || []).map((s) => s.agente);
  if (ruta.length > 1) lineas.push(`Paso por: ${ruta.join(' -> ')}`);

  const i = estado.identidad;
  if (i?.verificado && i.expira && new Date(i.expira) > new Date()) {
    lineas.push('Identidad verificada: SI');
  }

  // Lo que el cliente conto, venga del scratch del agente o de compartido.
  const datos: Record<string, unknown> = {
    ...(estado.compartido || {}),
    ...((estado.ctx?.[estado.agente_activo]?.datos as Record<string, unknown>) || {}),
  };

  const relevantes: string[] = [];
  for (const [clave, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = datos[clave];
    if (v === undefined || v === null || v === '') continue;
    const texto = fmt(v);
    if (texto) relevantes.push(`  ${etiqueta}: ${texto}`);
  }
  if (relevantes.length) {
    lineas.push('', 'LO QUE YA CONTO:', ...relevantes);
  }

  // Calificacion, si el agente alcanzo a hacerla.
  const ctxAg = estado.ctx?.[estado.agente_activo] || {};
  if (ctxAg.temperatura) {
    lineas.push('', `Calificacion: ${String(ctxAg.temperatura).toUpperCase()}${ctxAg.score ? ` (${ctxAg.score}/100)` : ''}`);
  }

  if (extra.length) lineas.push('', ...extra);

  // Ultimo mensaje del cliente: da el tono con el que llega.
  const ultimo = [...(estado.historial || [])].reverse().find((m) => m.role === 'user');
  if (ultimo?.content) {
    lineas.push('', `Ultimo mensaje: "${String(ultimo.content).slice(0, 200)}"`);
  }

  return lineas.join('\n');
}
