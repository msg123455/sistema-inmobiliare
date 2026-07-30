import { definirTool, str, enumStr, type Tool, type CtxTool } from '../protocol.ts';

// Palabra legal: dispara prioridad y notificacion inmediata al equipo.
const LEGAL = /\b(tutela|demanda|demandar|abogad|superintendencia|sic\b|fiscal[ií]a|juzgado|proceso legal|accion de proteccion)\b/i;

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
    const radicado = `PQR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const pqr = await c.db.crear('PQR', {
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
    c.efectos.notificar.push(
      `${esLegal ? 'PQR CON MENCION LEGAL — REVISAR YA' : `PQR NUEVA (${tipo})`}\n` +
      `Radicado: ${radicado}\n${String(input.nombre)} — wa.me/${c.entrada.tel}\n` +
      `Asunto: ${String(input.asunto)}\n\n${String(input.descripcion).slice(0, 500)}`,
    );

    return {
      ok: true,
      radicado,
      mencion_legal: esLegal,
      instruccion: esLegal
        ? `Dale el radicado ${radicado}, dile que ya quedo en manos del equipo y llama tambien a escalar_a_humano con prioridad urgente. NO opines sobre lo legal ni asumas responsabilidad.`
        : `Dale el radicado ${radicado}. El plazo aplicable aun no esta configurado: NO prometas una fecha ni menciones un termino legal; indica que el equipo confirmara el tramite.`,
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
