import { definirTool, str, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { sumarHabiles } from '../habiles.ts';

// Palabra legal: dispara prioridad y notificacion inmediata al equipo.
const LEGAL = /\b(tutela|demanda|demandar|abogad|superintendencia|sic\b|fiscal[ií]a|juzgado|proceso legal|accion de proteccion)\b/i;

/**
 * Terminos de respuesta en DIAS HABILES (Ley 1755/2015, art. 14).
 *
 * El termino corre por ministerio de la ley desde la radicacion, exista o no un
 * campo en la base. Antes no se computaba y la tool instruia al modelo a callar
 * sobre el plazo: eso protegia de prometer mal, pero dejaba un pasivo creciendo
 * en silencio, sin nada que avisara antes del vencimiento.
 *
 * Los valores son configurables desde AppConfig{clave:'plazos_pqr'} porque la
 * calificacion juridica de cada caso —peticion de interes particular, de
 * documentos, consulta— la define el abogado de la empresa, no este codigo.
 * Estos defaults son los del articulo y se usan mientras no haya politica
 * cargada.
 */
const DIAS_DEFECTO: Record<string, number> = {
  Peticion:     15,
  Queja:        15,
  Reclamo:      15,
  Sugerencia:   15,
  Felicitacion: 15,
};

export const registrarPqr: Tool = {
  ...definirTool(
    'registrar_pqr',
    'Radica una peticion, queja, reclamo, sugerencia o felicitacion. Antes de llamarla necesitas entender bien QUE paso: no radiques con una sola frase suelta.',
    {
      tipo: enumStr('Que es', ['Peticion', 'Queja', 'Reclamo', 'Sugerencia', 'Felicitacion']),
      asunto: str('Resumen en menos de 10 palabras'),
      descripcion: str('Lo que cuenta el cliente, completo y con sus palabras'),
      nombre: str('Nombre de quien radica'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const tipo = String(input.tipo);
    const texto = `${input.asunto} ${input.descripcion}`;
    const esLegal = LEGAL.test(texto);

    // El radicado usaba los ultimos 6 digitos de Date.now(), que se repiten cada
    // ~16 minutos. Se le agregan 4 caracteres aleatorios: un radicado duplicado
    // le entrega al cliente un numero que apunta a la PQR de otro.
    const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
    const radicado = `PQR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${azar}`;

    // Plazo legal. Se calcula SIEMPRE: el termino corre aunque el campo este
    // vacio, y sin fecha no hay nada que pueda alertar antes del vencimiento.
    const cfgPlazos = (await c.db.uno('AppConfig', { clave: 'plazos_pqr' }))?.valor_json;
    let dias = DIAS_DEFECTO;
    try { if (cfgPlazos) dias = { ...DIAS_DEFECTO, ...JSON.parse(cfgPlazos) }; } catch { /* usa los del articulo */ }
    const fechaLimite = sumarHabiles(new Date(), Number(dias[tipo]) || 15);

    const pqr = await c.db.crear('PQR', {
      fecha_limite_legal: fechaLimite.toISOString(),
      tipo,
      radicado,
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      contacto_nombre: String(input.nombre || '').slice(0, 200),
      contacto_telefono: c.entrada.tel.replace(/\D/g, ''),
      canal: c.entrada.canal,
      asunto: String(input.asunto || '').slice(0, 200),
      descripcion: String(input.descripcion || '').slice(0, 4000),
      estado: 'Radicada',
      prioridad: esLegal ? 'Urgente' : tipo === 'Reclamo' ? 'Alta' : 'Media',
      fecha_radicacion: new Date().toISOString(),
    });
    if (!pqr) return { error: 'no_se_pudo_registrar' };
    c.ctxAgente.pqr_id = pqr.id;

    // El agente de PQR SIEMPRE notifica: una queja que nadie ve es una queja
    // que se convierte en algo peor.
    const venceEl = fechaLimite.toISOString().slice(0, 10);
    c.efectos.notificar.push(
      `${esLegal ? 'PQR CON MENCION LEGAL — REVISAR YA' : `PQR NUEVA (${tipo})`}\n` +
      `Radicado: ${radicado}\n${String(input.nombre)} — wa.me/${c.entrada.tel}\n` +
      `Asunto: ${String(input.asunto)}\n` +
      `Vence: ${venceEl} (${Number(dias[tipo]) || 15} dias habiles)\n\n` +
      `${String(input.descripcion).slice(0, 500)}`,
    );

    return {
      ok: true,
      radicado,
      mencion_legal: esLegal,
      instruccion: esLegal
        ? `Dale el radicado ${radicado}, dile que ya quedo en manos del equipo y llama tambien a escalar_a_humano con prioridad urgente. NO opines sobre lo legal ni asumas responsabilidad.`
        : `Dale el radicado ${radicado} y dile que el termino de respuesta es de ${Number(dias[tipo]) || 15} dias habiles. NO des la fecha exacta ni prometas que se resuelve antes: el plazo es el maximo de ley, no un compromiso de entrega.`,
    };
  },
};

export const consultarEstadoPqr: Tool = {
  ...definirTool(
    'consultar_estado_pqr',
    'Consulta como va una PQR ya radicada, por su numero de radicado.',
    { radicado: str('El numero de radicado que da el cliente') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const rad = String(input.radicado || '').trim().toUpperCase();
    const pqr = await c.db.uno('PQR', { radicado: rad });
    // El radicado solo se consulta desde el telefono que lo creo.
    if (!pqr || String(pqr.contacto_telefono || '').replace(/\D/g, '') !== c.entrada.tel.replace(/\D/g, '')) {
      return { error: 'no_encontrada', instruccion: 'Dile que no encuentras ese radicado asociado a este numero y pideselo de nuevo.' };
    }
    return {
      radicado: pqr.radicado,
      tipo: pqr.tipo,
      estado: pqr.estado,
      radicada: pqr.fecha_radicacion,
      respondida: pqr.fecha_respuesta ?? null,
      respuesta: pqr.respuesta ?? null,
    };
  },
};

export const PQR: Record<string, Tool> = {
  registrar_pqr: registrarPqr,
  consultar_estado_pqr: consultarEstadoPqr,
};
