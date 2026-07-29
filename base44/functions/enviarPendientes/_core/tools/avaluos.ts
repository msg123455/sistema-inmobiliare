import { definirTool, str, strOpc, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';

// Tarifas base. Viven en AppConfig para que no haya que desplegar para cambiar
// un precio; estos son el respaldo si la fila no existe.
const TARIFA_FALLBACK = { base: 450_000, por_m2: 900, tope: 2_500_000 };

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
    return {
      ok: true,
      radicado: av.id,
      tipo_no_estandar: noEstandar,
      instruccion: noEstandar
        ? 'Este tipo de inmueble no tiene tarifa estandar. NO des un precio: escala con escalar_a_humano para que el perito cotice.'
        : 'Confirma que quedo radicado. Si pregunta el valor, usa cotizar_avaluo.',
    };
  },
};

export const cotizarAvaluo: Tool = {
  ...definirTool(
    'cotizar_avaluo',
    'Calcula cuanto cuesta el avaluo. Solo aplica a apartamento, casa, local y oficina. Para cualquier otro tipo NO cotices: escala.',
    {
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina']),
      area_m2: numOpc('Area en metros cuadrados. null si no la sabe.'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const cfg = (await c.db.uno('AppConfig', { clave: 'tarifas_avaluo' }))?.valor_json;
    let t = TARIFA_FALLBACK;
    try { if (cfg) t = { ...TARIFA_FALLBACK, ...JSON.parse(cfg) }; } catch { /* usa el fallback */ }

    const area = Number(input.area_m2) || 0;
    if (!area) {
      return {
        requiere_area: true,
        instruccion: 'Sin el area no hay cifra. Preguntale cuantos metros cuadrados tiene, sin dar todavia ningun valor.',
      };
    }
    const valor = Math.min(t.tope, t.base + area * t.por_m2);
    return {
      valor_servicio: valor,
      instruccion: `Di la cifra redondeada ($${valor.toLocaleString('es-CO')}) en una frase, aclarando que es el valor del servicio de avaluo y que incluye la visita y el informe. Es un estimado sujeto a confirmacion.`,
    };
  },
};

export const AVALUOS: Record<string, Tool> = {
  registrar_solicitud_avaluo: registrarSolicitudAvaluo,
  cotizar_avaluo: cotizarAvaluo,
};
