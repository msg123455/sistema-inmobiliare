// Matricula de contrato — intake de datos para reemplazar el formulario F117.
// La lista documental y su canal seguro siguen pendientes de definicion.

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
    { retorna: true, cierra: true },
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
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const solId = String(c.ctxAgente.solicitud_id || '');
    if (!solId) return { ok: false, error: 'sin_solicitud' };
    const numero = String(c.ctxAgente.numero_solicitud || '');

    await c.db.actualizar('SolicitudMatricula', solId, {
      estado: 'Pendiente_documentos',
      fecha_cierre_captura: new Date().toISOString(),
    });
    c.efectos.notificar.push(
      `MATRICULA LISTA PARA ESTUDIO\nSolicitud ${numero}\n` +
      `${String(c.estado.compartido.nombre || '')} — wa.me/${c.entrada.tel}\n` +
      `Participantes: ${(c.ctxAgente.participantes as any[] || []).length}`,
    );

    return {
      ok: true,
      instruccion: 'Dile que la solicitud quedo registrada y que el equipo confirmara la lista documental y el canal seguro. No enumeres documentos ni prometas un plazo.',
    };
  },
};

// En matricula el link se emite contra el numero de solicitud, no contra una
// verificacion de contrato: el cliente todavia no es arrendatario nuestro.
export const enviarLinkDocumentos: Tool = {
  ...definirTool(
    'enviar_link_portal',
    'Comprueba si ya existe el canal seguro para documentos de matricula. Por ahora esta pendiente y debes escalar.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, _c: CtxTool) => {
    return {
      ok: false,
      error: 'portal_documentos_no_disponible',
      instruccion: 'No envies ningun enlace. Escala para que el equipo confirme la lista documental y el canal seguro.',
    };
  },
};

export const MATRICULA: Record<string, Tool> = {
  iniciar_matricula: iniciarMatricula,
  agregar_participante: agregarParticipante,
  finalizar_matricula: finalizarMatricula,
  enviar_link_portal: enviarLinkDocumentos,
};
