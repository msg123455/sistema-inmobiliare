import { definirTool, str, strOpc, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { crearSesionPortal, verificar } from '../identidad.ts';
import { exigirVerificado } from './comunes.ts';
import { briefLead } from '../brief.ts';

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
    // 'certificados' tampoco esta aqui, aunque ya exista la ruta: ese documento
    // se entrega con enviar_certificado_propietario, que ademas comprueba que
    // el archivo exista y deja el envio registrado.
    { seccion: enumStr('A donde debe llegar', ['estado-cuenta', 'pagos', 'contrato', 'reparaciones', 'liquidaciones']) },
    { retorna: true, cierra: true },
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
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const periodo = String(input.periodo || '').match(/^\d{4}-\d{2}$/)
      ? String(input.periodo)
      : new Date().toISOString().slice(0, 7);

    // Sin contrato NO se consulta. db.qs() descarta los filtros vacios, asi que
    // uno('CodigoBarras', { contrato_id: '', periodo }) no filtra por contrato y
    // devuelve el recibo de OTRO cliente. No es hipotetico: un propietario
    // verificado no tiene contrato_id en su identidad.
    const contratoId = String(c.estado.identidad.contrato_id || '');
    if (!contratoId) {
      return {
        error: 'sin_contrato_activo',
        instruccion: 'No tiene un contrato de arriendo activo a su nombre. No inventes un recibo: preguntale de que inmueble se trata y escala si insiste.',
      };
    }

    const cb = await c.db.uno('CodigoBarras', { contrato_id: contratoId, periodo });
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

// ── Certificado de propietario ───────────────────────────────────────────────

// Frase que la operacion ya valido en el bot de botones. Va literal y sin
// parafrasear: es la unica respuesta aprobada por la casa para decir que un
// documento del propietario no aparece. Se escribe sin tildes como el resto de
// globos del sistema.
const CERTIFICADO_NO_ENCONTRADO =
  'No hemos encontrado tu archivo. Hemos enviado un correo electronico con tu caso al area encargada en la Inmobiliaria.';

/**
 * Camino de "no aparece".
 *
 * POR QUE ESCRIBE ANTES DE HABLAR: la frase de arriba AFIRMA que el caso ya
 * viajo al area encargada. Si solo mandaramos el texto, el agente estaria
 * prometiendo una gestion que nadie abrio, que es exactamente la falla que la
 * regla 1 prohibe. Por eso la Tarea y la notificacion se crean aqui, y no se
 * delega en que el modelo se acuerde de llamar a escalar_a_humano.
 *
 * POR QUE DEVUELVE ok:true Y NO `error`: para el cliente no fallo nada, su caso
 * quedo radicado. Ademas el bucle de llm.ts solo cuenta como cierre lo que no
 * trae `error` ni `ok:false`, y esto SI es un siguiente paso concreto.
 */
async function derivarAlArea(c: CtxTool, anio: number | null, causa: string) {
  const nombre = String(c.estado.compartido.nombre || '') || `+${c.entrada.tel}`;
  const detalle = anio ? `certificado del ano ${anio}` : 'certificado mas reciente';
  const brief = briefLead(c.estado, c.entrada.tel, c.entrada.canal, [
    `MOTIVO: pidio su ${detalle} y no aparece (${causa})`,
  ]);

  await c.db.crear('Tarea', {
    contacto_id: String(c.estado.compartido.contacto_id || ''),
    titulo: `Certificado de propietario no encontrado: ${nombre}`,
    descripcion: brief,
    fecha_limite: new Date(Date.now() + 864e5).toISOString().split('T')[0],
    prioridad: 'Media',
    completada: false,
    origen_agente: c.estado.agente_activo,
  });

  c.efectos.notificar.push(
    `CERTIFICADO DE PROPIETARIO NO ENCONTRADO — ${detalle}\n\n${brief}\n\n` +
    'Al cliente ya se le dijo que su caso paso al area encargada. Alguien tiene que responderle.',
  );

  c.salida.globos.push(CERTIFICADO_NO_ENCONTRADO);
  return {
    ok: true,
    encontrado: false,
    anio,
    nota: 'Ya se envio el mensaje de la casa tal cual y el caso quedo radicado. No lo repitas ni lo reformules en responder, y no prometas fechas ni horas.',
  };
}

export const enviarCertificadoPropietario: Tool = {
  ...definirTool(
    'enviar_certificado_propietario',
    'Entrega al propietario su certificado anual, por link al portal. Requiere identidad verificada. Si el cliente no dijo de que ano lo quiere, pasa null y se entrega el ultimo que tengamos. Es un documento de propietarios: no sirve para arrendatarios.',
    { anio: numOpc('Ano gravable que pidio el cliente, por ejemplo 2025. null si no dijo ninguno.') },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;

    // Un ano fuera de rango tampoco se ignora: se busca y no aparece. Caer al
    // "ultimo disponible" seria entregarle en silencio un ano distinto al que
    // pidio, y el cliente lo presenta ante la DIAN creyendo que es el suyo.
    const crudo = Number(input.anio);
    const anioPedido = Number.isFinite(crudo) && crudo > 0 ? Math.trunc(crudo) : null;

    // El sujeto sale de la identidad verificada (regla 2), y si no hay, NO se
    // consulta la tabla: db.qs() descarta los filtros vacios, asi que
    // list('CertificadoPropietario', { propietario_id: '' }) no filtra por nadie
    // y devolveria los certificados de otros propietarios.
    const propietarioId = String(c.estado.identidad.propietario_id || '');
    if (!propietarioId) {
      return derivarAlArea(c, anioPedido, 'el telefono verificado no figura como propietario');
    }

    const filas = await c.db.list('CertificadoPropietario', { propietario_id: propietarioId, limit: 12 });
    // Una fila sin url_pdf es un registro que la pantalla de Envios creo pero
    // cuyo archivo todavia no existe. Anunciarlo seria mandar al cliente a un
    // portal donde no hay nada que descargar.
    const disponibles = (filas || [])
      .filter((f: any) => Number(f.anio) > 0 && String(f.url_pdf || '').trim() !== '')
      .sort((a: any, b: any) => Number(b.anio) - Number(a.anio));

    const fila = anioPedido === null
      ? disponibles[0]
      : disponibles.find((f: any) => Number(f.anio) === anioPedido);

    if (!fila) {
      return derivarAlArea(
        c, anioPedido,
        disponibles.length ? 'ese ano no tiene archivo generado' : 'no tiene ningun certificado con archivo',
      );
    }

    const url = await crearSesionPortal(c.db, c.entrada, c.estado, 'certificados');
    // A proposito NO hay respaldo con url_pdf por chat, al reves que el codigo
    // de barras: esto es un documento tributario de un propietario, y un link
    // directo al PDF se reenvia, no vence y no esta atado a nadie.
    if (!url) {
      return {
        error: 'no_se_pudo_generar',
        instruccion: 'No prometas el certificado ni mandes ningun archivo. Escala con escalar_a_humano para que se lo hagan llegar.',
      };
    }

    c.salida.globos.push(`Aqui esta tu certificado del ano ${fila.anio}. El enlace es personal y vence en 15 minutos:`);
    c.salida.globos.push(url);
    // canal_envio NO se escribe: ese campo existe en CodigoBarras pero no en
    // CertificadoPropietario, y Base44 descarta en silencio lo que no reconoce.
    await c.db.actualizar('CertificadoPropietario', String(fila.id), {
      ...fila,
      fecha_envio: new Date().toISOString(),
      estado_envio: 'Enviado',
    });
    return {
      ok: true, anio: Number(fila.anio),
      nota: 'Ya se envio el link. No lo repitas en responder. En el portal quedan tambien los de anos anteriores.',
    };
  },
};

export const CARTERA: Record<string, Tool> = {
  verificar_identidad: verificarIdentidad,
  consultar_estado_cuenta: consultarEstadoCuenta,
  enviar_link_portal: enviarLinkPortal,
  enviar_codigo_barras: enviarCodigoBarras,
  enviar_certificado_propietario: enviarCertificadoPropietario,
};
