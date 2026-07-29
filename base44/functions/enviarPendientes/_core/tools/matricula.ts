// Matricula de contrato — el reemplazo del formulario F117.
// El intake es por WhatsApp; los documentos van al portal (§D.3).

import { definirTool, str, strOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';

export const iniciarMatricula: Tool = {
  ...definirTool(
    'iniciar_matricula',
    'Abre una solicitud de matricula de contrato para el inmueble que el cliente va a tomar en arriendo. Es el primer paso: despues se agregan los participantes.',
    {
      nombre: str('Nombre completo del arrendatario principal'),
      documento: str('Numero de cedula, solo digitos'),
      email: str('Correo electronico'),
      direccion_inmueble: str('Direccion del inmueble que va a arrendar'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    if (c.ctxAgente.solicitud_id) {
      return { ok: false, error: 'ya_iniciada', numero_solicitud: c.ctxAgente.numero_solicitud };
    }
    const numero = `M${new Date().getFullYear()}${Date.now().toString().slice(-6)}`;
    const tel = c.entrada.tel.replace(/\D/g, '');

    const sol = await c.db.crear('SolicitudMatricula', {
      numero_solicitud: numero,
      nombre_solicitante: String(input.nombre || '').slice(0, 200),
      documento_solicitante: String(input.documento || '').replace(/\D/g, ''),
      email_solicitante: String(input.email || '').slice(0, 200),
      telefono_contacto: tel,
      direccion_inmueble: String(input.direccion_inmueble || '').slice(0, 300),
      participantes: [],
      estado: 'Iniciada',
      origen: `agente:${c.entrada.canal}`,
      fecha_inicio: new Date().toISOString(),
    });
    if (!sol) return { error: 'no_se_pudo_iniciar' };

    c.ctxAgente.solicitud_id = sol.id;
    c.ctxAgente.numero_solicitud = numero;
    c.ctxAgente.participantes = [];
    c.ctxAgente.paso = 1;
    c.estado.compartido.nombre = String(input.nombre || '');
    c.estado.compartido.email = String(input.email || '');

    return {
      ok: true,
      numero_solicitud: numero,
      instruccion: `Dale el numero ${numero} y dile que lo guarde. Luego preguntale si va a arrendar solo o si hay coarrendatarios o codeudores.`,
    };
  },
};

export const agregarParticipante: Tool = {
  ...definirTool(
    'agregar_participante',
    'Agrega un codeudor o coarrendatario a la solicitud. Llamala una vez por persona, cuando tengas su nombre, documento y telefono.',
    {
      nombre: str('Nombre completo'),
      documento: str('Numero de cedula, solo digitos'),
      telefono: str('Telefono de contacto'),
      rol: enumStr('Que es de la operacion', ['Codeudor', 'Coarrendatario']),
      parentesco: strOpc('Que relacion tiene con el arrendatario. null si no lo dijo.'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const solId = String(c.ctxAgente.solicitud_id || '');
    if (!solId) return { ok: false, error: 'sin_solicitud', instruccion: 'Primero llama a iniciar_matricula.' };

    const p = {
      nombre: String(input.nombre || '').slice(0, 200),
      documento: String(input.documento || '').replace(/\D/g, ''),
      telefono: String(input.telefono || '').replace(/\D/g, ''),
      rol: String(input.rol),
      parentesco: String(input.parentesco || ''),
    };
    const lista = [...(c.ctxAgente.participantes as any[] || []), p];
    c.ctxAgente.participantes = lista;

    await c.db.actualizar('SolicitudMatricula', solId, { participantes: lista, estado: 'En_captura' });
    await c.db.crear('Codeudor', {
      solicitud_id: solId,
      nombre: p.nombre,
      numero_documento: p.documento,
      telefono: p.telefono,
      parentesco: p.parentesco,
      tipo: p.rol,
      estado_estudio: 'Pendiente',
    });

    return { ok: true, total_participantes: lista.length, instruccion: 'Confirma y preguntale si falta alguien mas.' };
  },
};

export const finalizarMatricula: Tool = {
  ...definirTool(
    'finalizar_matricula',
    'Cierra la captura de datos y deja la solicitud lista para el estudio. Llamala cuando el cliente confirme que no falta nadie mas.',
    {},
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const solId = String(c.ctxAgente.solicitud_id || '');
    if (!solId) return { ok: false, error: 'sin_solicitud' };
    const numero = String(c.ctxAgente.numero_solicitud || '');

    await c.db.actualizar('SolicitudMatricula', solId, {
      estado: 'Pendiente_documentos',
      fecha_cierre_captura: new Date().toISOString(),
    });
    await c.db.crear('Tarea', {
      titulo: `Estudio de arriendo — solicitud ${numero}`,
      descripcion: `Solicitud ${numero}\nTelefono: ${c.entrada.tel}\nParticipantes: ${(c.ctxAgente.participantes as any[] || []).length}`,
      fecha_limite: new Date(Date.now() + 2 * 864e5).toISOString().split('T')[0],
      prioridad: 'Alta',
      completada: false,
      origen_agente: 'matricula',
    });

    c.efectos.notificar.push(
      `MATRICULA LISTA PARA ESTUDIO\nSolicitud ${numero}\n` +
      `${String(c.estado.compartido.nombre || '')} — wa.me/${c.entrada.tel}\n` +
      `Participantes: ${(c.ctxAgente.participantes as any[] || []).length}`,
    );

    return {
      ok: true,
      instruccion: 'Dile que ya quedo registrada y que ahora tiene que subir los documentos. Manda el link con enviar_link_portal.',
    };
  },
};

// En matricula el link se emite contra el numero de solicitud, no contra una
// verificacion de contrato: el cliente todavia no es arrendatario nuestro.
export const enviarLinkDocumentos: Tool = {
  ...definirTool(
    'enviar_link_portal',
    'Manda el link seguro donde el cliente sube los documentos del estudio (cedula, certificado laboral, extractos). Vence en 15 minutos.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, c: CtxTool) => {
    const solId = String(c.ctxAgente.solicitud_id || '');
    if (!solId) return { ok: false, error: 'sin_solicitud' };

    // Sesion acotada a esta solicitud, no al patrimonio del cliente.
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const hash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    )).map((b) => b.toString(16).padStart(2, '0')).join('');

    const ok = await c.db.crear('SesionPortal', {
      token_hash: hash,
      tipo: 'matricula-documentos',
      sujeto_id: solId,
      sujeto_tipo: 'solicitud_matricula',
      telefono: c.entrada.tel.replace(/\D/g, ''),
      expira: new Date(Date.now() + 15 * 60_000).toISOString(),
      usado: false,
      creada: new Date().toISOString(),
    });
    if (!ok) return { error: 'no_se_pudo_generar' };

    const app = (Deno.env.get('PORTAL_URL') || Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
    c.salida.globos.push('Aqui subes los documentos del estudio. El enlace es personal y vence en 15 minutos:');
    c.salida.globos.push(`${app}/portal/entrar?t=${token}`);
    return { ok: true, nota: 'El link ya se envio. No lo repitas en responder.' };
  },
};

export const MATRICULA: Record<string, Tool> = {
  iniciar_matricula: iniciarMatricula,
  agregar_participante: agregarParticipante,
  finalizar_matricula: finalizarMatricula,
  enviar_link_portal: enviarLinkDocumentos,
};
