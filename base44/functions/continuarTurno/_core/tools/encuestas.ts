import { definirTool, str, num, type Tool, type CtxTool } from '../protocol.ts';

export const registrarRespuesta: Tool = {
  ...definirTool(
    'registrar_respuesta',
    'Guarda la respuesta del cliente a una pregunta de la encuesta. Llamala una vez por pregunta respondida.',
    {
      pregunta_id: str('El id de la pregunta que le hiciste, tal como viene en el contexto'),
      respuesta: str('Lo que respondio, con sus palabras'),
      puntaje: num('De 0 a 10 si la pregunta era de puntaje. Usa -1 si la pregunta era abierta.'),
    },
  ),
  ejecutar: (input, c: CtxTool) => {
    const respuestas = (c.ctxAgente.respuestas as any[]) || [];
    respuestas.push({
      pregunta_id: String(input.pregunta_id || ''),
      respuesta: String(input.respuesta || '').slice(0, 1000),
      puntaje: Number(input.puntaje) >= 0 ? Number(input.puntaje) : null,
    });
    c.ctxAgente.respuestas = respuestas;
    return { ok: true, respondidas: respuestas.length };
  },
};

export const cerrarEncuesta: Tool = {
  ...definirTool(
    'cerrar_encuesta',
    'Cierra la encuesta cuando ya no quedan preguntas. Guarda todo y agradece.',
    { nps: num('El puntaje de recomendacion de 0 a 10. Usa -1 si no lo dio.') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const nps = Number(input.nps);
    const respuestas = (c.ctxAgente.respuestas as any[]) || [];

    await c.db.crear('RespuestaEncuesta', {
      encuesta_id: String(c.ctxAgente.encuesta_id || ''),
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      telefono: c.entrada.tel.replace(/\D/g, ''),
      canal: c.entrada.canal,
      respuestas_json: JSON.stringify(respuestas),
      nps_score: nps >= 0 ? nps : null,
      completada: true,
      fecha: new Date().toISOString(),
    });

    c.ctxAgente.cerrada = true;

    // NPS <= 6 es un detractor: escalamiento inmediato. Una mala calificacion
    // que solo queda en un reporte es una mala calificacion desperdiciada.
    if (nps >= 0 && nps <= 6) {
      c.efectos.notificar.push(
        `NPS DETRACTOR (${nps}/10) — contactar\n` +
        `${String(c.estado.compartido.nombre || '')} — wa.me/${c.entrada.tel}\n\n` +
        respuestas.map((r) => `• ${r.respuesta}`).join('\n').slice(0, 600),
      );
      return {
        ok: true, detractor: true,
        instruccion: 'Agradece, reconoce que la experiencia no fue buena sin justificar nada, y dile que alguien del equipo lo va a contactar. Llama tambien a escalar_a_humano.',
      };
    }
    return { ok: true, detractor: false, instruccion: 'Agradece en una frase corta y despidete. No pidas nada mas.' };
  },
};

export const ENCUESTAS: Record<string, Tool> = {
  registrar_respuesta: registrarRespuesta,
  cerrar_encuesta: cerrarEncuesta,
};
