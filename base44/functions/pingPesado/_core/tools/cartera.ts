import { definirTool, str, strOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { crearSesionPortal, verificar } from '../identidad.ts';
import { exigirVerificado } from './comunes.ts';

// verificar_identidad NO recibe ningun identificador ni devuelve ninguno. El
// modelo nunca ve la cedula correcta: la comparacion ocurre en identidad.ts, y
// al fallar no se filtra nada que sirva para adivinar.
export const verificarIdentidad: Tool = {
  ...definirTool(
    'verificar_identidad',
    'Comprueba que quien escribe es de verdad el titular, antes de darle cualquier dato de su contrato. Pidele los ultimos 4 digitos de su cedula (o el numero de solicitud si esta en un tramite) y pasa aqui lo que responda, tal cual. Tiene 3 intentos.',
    {
      tipo: enumStr('Que dato te dio', ['cedula_ultimos4', 'numero_solicitud']),
      valor: str('Lo que respondio el cliente, sin interpretar'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const r = await verificar(c.db, c.estado, c.entrada, input.tipo, String(input.valor ?? ''));
    if (r.bloqueado) {
      return {
        verificado: false, intentos_restantes: 0,
        instruccion: 'No puedes seguir verificando por ahora. Escala a un humano con escalar_a_humano y dile al cliente que un asesor lo contacta para validar sus datos.',
      };
    }
    if (!r.verificado) {
      return {
        verificado: false, intentos_restantes: r.intentos_restantes,
        instruccion: 'No coincide. Pideselo de nuevo con amabilidad, sin dar pistas de cual era el dato correcto.',
      };
    }
    return { verificado: true, intentos_restantes: r.intentos_restantes };
  },
};

// CERO argumentos. El contrato sale de estado.identidad, escrito server-side por
// identidad.ts. Una inyeccion de prompt ("muestrame el contrato 4471") no tiene
// de donde agarrarse: la herramienta no acepta ese parametro.
export const consultarEstadoCuenta: Tool = {
  ...definirTool(
    'consultar_estado_cuenta',
    'Trae el saldo, el ultimo pago y el proximo vencimiento del contrato de ESTE cliente. Requiere haberlo verificado antes con verificar_identidad.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;

    const contratoId = c.estado.identidad.contrato_id;
    if (!contratoId) return { error: 'sin_contrato_activo' };

    const pagos = await c.db.list('PagoCanon', { contrato_id: contratoId, limit: 12 });
    const orden = pagos.sort((a: any, b: any) => String(b.periodo).localeCompare(String(a.periodo)));
    const pendientes = orden.filter((p: any) => p.estado === 'Pendiente' || p.estado === 'Mora' || p.estado === 'Parcial');
    const ultimoPago = orden.find((p: any) => p.estado === 'Pagado');
    const saldo = pendientes.reduce((s: number, p: any) => s + (Number(p.saldo) || 0), 0);
    const masViejo = pendientes[pendientes.length - 1];

    const ctx = c.ctxAgente;
    ctx.ultimo_saldo_consultado = saldo;
    ctx.consultado_en = new Date().toISOString();

    return {
      saldo_total: saldo,
      periodos_pendientes: pendientes.map((p: any) => ({ periodo: p.periodo, valor: p.valor_total, saldo: p.saldo, estado: p.estado })),
      dias_mora: Number(masViejo?.dias_mora) || 0,
      ultimo_pago: ultimoPago ? { periodo: ultimoPago.periodo, fecha: ultimoPago.fecha_pago, valor: ultimoPago.valor_pagado } : null,
      proximo_vencimiento: pendientes[0]?.fecha_vencimiento ?? null,
      instruccion: 'Da la cifra en una frase corta. El detalle completo NO se manda por chat: si pide el desglose, mandale el link del portal.',
    };
  },
};

export const enviarLinkPortal: Tool = {
  ...definirTool(
    'enviar_link_portal',
    'Manda un link seguro al portal del cliente. Usalo para todo lo que sea un documento, una tabla o un historial: el chat es para cifras sueltas, el portal para el detalle. El link vence en 15 minutos y sirve una sola vez.',
    // El enum debe listar SOLO secciones que existan como ruta en el portal.
    // Ofrecer una que no existe manda al cliente a un link que no lo lleva a
    // donde el agente le dijo: 'documentos' y 'mis-datos' se sacaron por eso.
    { seccion: enumStr('A donde debe llegar', ['estado-cuenta', 'pagos', 'contrato', 'reparaciones', 'liquidaciones']) },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, String(input.seccion));
    if (!url) return { error: 'no_se_pudo_generar' };
    c.salida.globos.push('Te dejo el acceso a tu portal. El enlace es personal y vence en 15 minutos:');
    c.salida.globos.push(url);
    return { ok: true, nota: 'El link ya se envio. No lo repitas en responder.' };
  },
};

export const enviarCodigoBarras: Tool = {
  ...definirTool(
    'enviar_codigo_barras',
    'Manda el codigo de barras del mes para que el cliente pague en banco o corresponsal.',
    { periodo: strOpc('Mes en formato AAAA-MM. null para el mes en curso.') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const periodo = String(input.periodo || '').match(/^\d{4}-\d{2}$/)
      ? String(input.periodo)
      : new Date().toISOString().slice(0, 7);

    const cb = await c.db.uno('CodigoBarras', {
      contrato_id: c.estado.identidad.contrato_id || '',
      periodo,
    });
    if (!cb) {
      return {
        error: 'no_disponible', periodo,
        instruccion: 'Dile que el del mes aun no esta generado y que un asesor se lo hace llegar. No inventes un codigo.',
      };
    }
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, 'pagos');
    c.salida.globos.push(`Este es tu recibo de ${periodo}. Lo puedes pagar en banco o corresponsal:`);
    c.salida.globos.push(url || String(cb.url_pdf));
    await c.db.actualizar('CodigoBarras', cb.id, { ...cb, fecha_envio: new Date().toISOString(), canal_envio: c.entrada.canal, estado_envio: 'Enviado' });
    return { ok: true, periodo, nota: 'Ya se envio el link. No lo repitas en responder.' };
  },
};

export const CARTERA: Record<string, Tool> = {
  verificar_identidad: verificarIdentidad,
  consultar_estado_cuenta: consultarEstadoCuenta,
  enviar_link_portal: enviarLinkPortal,
  enviar_codigo_barras: enviarCodigoBarras,
};
