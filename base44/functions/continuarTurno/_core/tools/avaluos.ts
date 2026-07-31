import { definirTool, str, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';

export const registrarSolicitudAvaluo: Tool = {
  ...definirTool(
    'registrar_solicitud_avaluo',
    'Radica una solicitud de avaluo comercial. Necesitas la direccion, el tipo de inmueble y para que lo necesita.',
    {
      nombre: str('Nombre de quien solicita'),
      direccion: str('Direccion del inmueble a avaluar'),
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro']),
      area_m2: numOpc('Area en metros cuadrados. null si no la sabe.'),
      proposito: enumStr('Para que lo necesita', ['Venta', 'Arriendo', 'Credito', 'Sucesion', 'Otro']),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const av = await c.db.crear('Avaluo', {
      solicitante_nombre: String(input.nombre || '').slice(0, 200),
      solicitante_telefono: c.entrada.tel.replace(/\D/g, ''),
      solicitante_email: String(c.estado.compartido.email || ''),
      direccion: String(input.direccion || '').slice(0, 300),
      tipo_inmueble: String(input.tipo_inmueble),
      area_m2: Number(input.area_m2) || 0,
      proposito: String(input.proposito),
      estado: 'Solicitado',
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    if (!av) return { error: 'no_se_pudo_registrar' };
    c.ctxAgente.avaluo_id = av.id;

    c.efectos.notificar.push(
      `SOLICITUD DE AVALUO\n${String(input.nombre)}\nwa.me/${c.entrada.tel}\n` +
      `${String(input.tipo_inmueble)} en ${String(input.direccion)}\n` +
      `Proposito: ${String(input.proposito)}${input.area_m2 ? ` | ${input.area_m2} m2` : ''}`,
    );

    const noEstandar = ['Bodega', 'Lote', 'Finca', 'Otro'].includes(String(input.tipo_inmueble));
    // El aviso del RAA viaja en el resultado de la tool y no solo en el prompt:
    // es el momento en que el cliente pregunta por su avaluo, y es cuando tiene
    // que quedar claro que quien lo firma es un perito inscrito (Ley 1673/2013).
    const raa = 'Recuerdale que el avaluo con validez legal lo firma un avaluador inscrito en el RAA, no la inmobiliaria ni tu.';
    return {
      ok: true,
      radicado: av.id,
      tipo_no_estandar: noEstandar,
      instruccion: noEstandar
        ? `Este tipo de inmueble no tiene tarifa estandar. NO des un precio: escala con escalar_a_humano para que el perito cotice. ${raa}`
        : `Confirma que quedo radicado. El tarifario aun no esta aprobado: si pregunta el valor del servicio, escala para cotizacion. ${raa}`,
    };
  },
};

export const cotizarAvaluo: Tool = {
  ...definirTool(
    'cotizar_avaluo',
    'Comprueba si existe un tarifario aprobado. Por ahora no hay uno cargado y debes escalar para cotizacion.',
    {
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina']),
      area_m2: numOpc('Area en metros cuadrados. null si no la sabe.'),
    },
    { retorna: true },
  ),
  ejecutar: async (_input, _c: CtxTool) => {
    return {
      error: 'tarifario_no_aprobado',
      instruccion: 'No des ninguna cifra ni formula. Escala con escalar_a_humano para que el equipo de avaluos cotice.',
    };
  },
};

export const AVALUOS: Record<string, Tool> = {
  registrar_solicitud_avaluo: registrarSolicitudAvaluo,
  cotizar_avaluo: cotizarAvaluo,
};
