// Las cuatro tools que recibe TODO agente.

import { definirTool, str, strOpc, bool, lista, enumStr, AGENTES, type Tool, type CtxTool } from '../protocol.ts';
import { ctxDe, transferir } from '../state.ts';
import { briefLead } from '../brief.ts';

// Campos que viven en `compartido`, no en el scratch del agente: los ve todo
// el mundo y sobreviven al handoff.
const COMPARTIDOS = new Set(['nombre', 'email', 'documento', 'direccion_inmueble']);
const NUMERICOS = new Set(['presupuesto', 'canon_esperado', 'valor_esperado', 'area_m2', 'habitaciones', 'nps_score']);

export const responder: Tool = {
  ...definirTool(
    'responder',
    'Envia tu respuesta al cliente y TERMINA tu turno. Cada elemento de `globos` se manda como un mensaje separado de WhatsApp, como escribe una persona. Usa 1 o 2 globos; 3 solo si de verdad hace falta. Siempre debes terminar tu turno con esta herramienta.',
    {
      globos: lista('Los mensajes a enviar, en orden. Cortos y naturales.'),
      fin_turno: bool('true si no esperas respuesta del cliente (despedida). false en cualquier otro caso.'),
    },
    { terminal: true },
  ),
  ejecutar: (input, c: CtxTool) => {
    const gs = Array.isArray(input.globos) ? input.globos : [];
    for (const g of gs) {
      const t = limpiar(g);
      if (t) c.salida.globos.push(t);
    }

    // Cierre obligatorio: no se puede dar por terminada una conversacion sin
    // dejar algo concreto. Antes un turno perfectamente valido era
    // responder(["Cualquier cosa me escribes"], fin_turno=true) — cero
    // compromiso, cero registro, y el lead se perdia en silencio.
    //
    // Vale como cierre cualquier tool marcada `cierra`: agendar una visita,
    // radicar una PQR, registrar un interes, escalar a un humano. Tambien una
    // transferencia, porque la conversacion sigue con otro rol y no muere aqui.
    const quiereCerrar = !!input.fin_turno;
    const hayCierre = c.hubo_cierre === true || c.efectos.transferir !== null || c.efectos.escalado !== null;
    if (quiereCerrar && !hayCierre) {
      c.salida.finTurno = false;
      return {
        ok: false,
        error: 'cierre_sin_siguiente_paso',
        instruccion: 'No cierres la conversacion en el aire. Deja algo concreto antes: '
          + 'agenda una visita o una llamada, envia una ficha, registra el interes con '
          + 'registrar_interes, radica la solicitud, o escala a un humano. Si de verdad no '
          + 'hay nada que hacer, escala en vez de despedirte.',
      };
    }

    c.salida.finTurno = quiereCerrar;
    return { ok: true };
  },
};

// Regla dura heredada del agente original: nada de guiones largos hacia el
// cliente. Es el tic que mas delata a un bot en espanol.
export const limpiar = (t: unknown) =>
  String(t ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();

export const guardarDato: Tool = {
  ...definirTool(
    'guardar_dato',
    'Guarda un dato que el cliente acaba de dar, para no volver a preguntarlo. Llamala tantas veces como datos nuevos haya en el mensaje.',
    {
      campo: str('Nombre del dato. Ej: nombre, email, barrio, presupuesto, operacion.'),
      valor: str('El valor tal como lo dijo el cliente. Los numeros van sin puntos ni simbolos.'),
    },
  ),
  ejecutar: (input, c: CtxTool) => {
    const campo = String(input.campo || '').trim();
    if (!campo) return { ok: false, error: 'campo vacio' };
    let valor: unknown = String(input.valor ?? '').trim();
    if (NUMERICOS.has(campo)) valor = Number(String(valor).replace(/[^\d]/g, '')) || 0;
    if (COMPARTIDOS.has(campo)) c.estado.compartido[campo] = valor;
    else {
      const ctx = ctxDe(c.estado, c.estado.agente_activo);
      ctx.datos = { ...(ctx.datos as Record<string, unknown> || {}), [campo]: valor };
    }
    return { ok: true, campo };
  },
};

export const transferirA: Tool = {
  ...definirTool(
    'transferir_a',
    'Pasa la conversacion a otro agente especializado cuando el tema deja de ser el tuyo. El cliente NO ve el cambio: el otro agente lee el mismo historial y sigue. No anuncies la transferencia, solo hazla.',
    {
      agente: enumStr('El agente que debe seguir', [...AGENTES]),
      motivo: str('Por que transfieres, en una frase'),
    },
  ),
  ejecutar: (input, c: CtxTool) => {
    const destino = input.agente;
    if (!(AGENTES as readonly string[]).includes(destino)) return { ok: false, error: 'agente invalido' };
    if (destino === c.estado.agente_activo) return { ok: false, error: 'ya es el agente activo' };
    transferir(c.estado, destino, String(input.motivo || 'sin motivo'));
    c.efectos.transferir = destino;
    return { ok: true, transferido_a: destino };
  },
};

// Escalamiento. La escalera es identica en todos los agentes: frustracion,
// 3 turnos sin avance, 3 fallos de verificacion, el cliente pide humano, monto
// o disputa fuera de politica, PQR con palabra legal.
export const escalarAHumano: Tool = {
  ...definirTool(
    'escalar_a_humano',
    'Pasa la conversacion a una persona del equipo. Usala si el cliente lo pide, si esta molesto, si llevas 3 turnos sin avanzar, si el tema se sale de lo que puedes resolver, o si hay plata o un reclamo legal de por medio. Despues de llamarla, despidete con `responder` diciendo que un asesor le escribe; NO prometas tiempos.',
    {
      motivo: str('Que pasa y que necesita el cliente, en 1 o 2 frases'),
      prioridad: enumStr('Urgencia real', ['baja', 'media', 'alta', 'urgente']),
    },
    { cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const motivo = String(input.motivo || 'sin motivo').slice(0, 500);
    const prioridad = String(input.prioridad || 'media');
    // pausada = true es el mismo mecanismo que ya usa la Bandeja para tomar
    // control manual. El bot deja de responder hasta que un humano lo reactive.
    c.estado.pausada = true;
    c.efectos.escalado = { motivo, prioridad };

    const nombre = String(c.estado.compartido.nombre || '') || `+${c.entrada.tel}`;

    // Brief ejecutivo en vez de "telefono + una frase". Todo lo que guardar_dato
    // acumulo durante la conversacion viaja con el escalamiento: sin esto el
    // asesor volvia a preguntarle al cliente lo que ya habia contestado.
    const brief = briefLead(c.estado, c.entrada.tel, c.entrada.canal, [`MOTIVO: ${motivo}`]);

    await c.db.crear('Tarea', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      titulo: `Escalamiento ${c.estado.agente_activo}: ${nombre}`,
      descripcion: brief,
      fecha_limite: new Date(Date.now() + (prioridad === 'urgente' ? 0 : 864e5)).toISOString().split('T')[0],
      prioridad: prioridad === 'urgente' || prioridad === 'alta' ? 'Alta' : prioridad === 'baja' ? 'Baja' : 'Media',
      completada: false,
      origen_agente: c.estado.agente_activo,
    });

    c.efectos.notificar.push(
      `ESCALAMIENTO (${prioridad.toUpperCase()}) — desde ${c.estado.agente_activo}\n\n` +
      `${brief}\n\n` +
      `La IA quedo en pausa para este chat. Responde desde la Bandeja.`,
    );
    return { ok: true, escalado: true };
  },
};

export const COMUNES: Record<string, Tool> = {
  responder,
  guardar_dato: guardarDato,
  transferir_a: transferirA,
  escalar_a_humano: escalarAHumano,
};

// Helper compartido: exigir identidad verificada antes de tocar PII.
export function exigirVerificado(c: CtxTool): { error: string } | null {
  const i = c.estado.identidad;
  if (i.bloqueado_hasta && new Date(i.bloqueado_hasta).getTime() > Date.now()) {
    return { error: 'bloqueado_por_intentos_fallidos' };
  }
  if (!i.verificado || !i.expira || new Date(i.expira).getTime() <= Date.now()) {
    return { error: 'no_verificado' };
  }
  return null;
}

export const enviarMenu: Tool = {
  ...definirTool(
    'enviar_menu',
    'Muestra el menu de opciones al cliente cuando no queda claro que necesita. Usalo maximo una vez por conversacion.',
    { titulo: strOpc('Frase corta antes del menu. null para usar la de siempre.') },
  ),
  ejecutar: (input, c: CtxTool) => {
    c.salida.globos.push(limpiar(input.titulo) || 'Con gusto te ayudo. ¿Cual de estas opciones necesitas?');
    c.salida.globos.push(
      '1. Buscar inmueble\n2. Consignar mi inmueble\n3. Pagos y estado de cuenta\n' +
      '4. Reportar una reparacion\n5. Solicitar un avaluo\n6. Peticiones, quejas y reclamos\n7. Tramite de contrato',
    );
    c.salida.finTurno = false;
    return { ok: true };
  },
};
