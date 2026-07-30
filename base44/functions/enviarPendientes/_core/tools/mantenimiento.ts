import { definirTool, str, strOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { exigirVerificado } from './comunes.ts';
import { verificarIdentidad } from './cartera.ts';

export const registrarReparacion: Tool = {
  ...definirTool(
    'registrar_reparacion',
    'Radica una solicitud de reparacion. Antes de llamarla necesitas saber QUE se dano y DONDE. Si hay gas, fuego, inundacion o riesgo electrico, la urgencia es Emergencia y ademas debes llamar a escalar_a_humano.',
    {
      categoria: enumStr('Que se dano', ['Plomeria', 'Electrico', 'Gas', 'Cerrajeria', 'Electrodomestico', 'Estructural', 'Humedad', 'Otro']),
      descripcion: str('Lo que reporta el cliente, con sus palabras y el detalle que dio'),
      urgencia: enumStr('Emergencia solo si hay riesgo real para personas o el inmueble', ['Emergencia', 'Alta', 'Media', 'Baja']),
      ubicacion: strOpc('En que parte del inmueble. null si no lo dijo.'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;

    const urgencia = String(input.urgencia || 'Media');
    const rep = await c.db.crear('Reparacion', {
      contrato_id: c.estado.identidad.contrato_id || '',
      arrendatario_id: c.estado.identidad.arrendatario_id || '',
      categoria: String(input.categoria),
      descripcion: String(input.descripcion || '').slice(0, 2000),
      ubicacion: String(input.ubicacion || ''),
      urgencia,
      estado: 'Reportada',
      origen: `agente:${c.entrada.canal}`,
      fotos: [],
      fecha_reporte: new Date().toISOString(),
    });
    if (!rep) return { error: 'no_se_pudo_registrar' };

    c.ctxAgente.reparacion_id = rep.id;

    if (urgencia === 'Emergencia') {
      c.efectos.notificar.push(
        `EMERGENCIA — reparacion\n${String(input.categoria)}: ${String(input.descripcion).slice(0, 300)}\n` +
        `Telefono: ${c.entrada.tel}\nContrato: ${c.estado.identidad.contrato_id || 'sin contrato'}`,
      );
    }

    return {
      ok: true,
      radicado: rep.numero_radicado || rep.id,
      sla_horas: null,
      instruccion: urgencia === 'Emergencia'
        ? 'Confirma el radicado y dile que ya avisaste al equipo por ser una emergencia. Llama tambien a escalar_a_humano. No prometas un tiempo de respuesta.'
        : 'Confirma el radicado en una frase. Puedes pedirle una foto del dano si ayuda al tecnico. No prometas fecha ni costo.',
    };
  },
};

export const adjuntarEvidencia: Tool = {
  ...definirTool(
    'adjuntar_evidencia',
    'Guarda una foto que el cliente acaba de mandar como evidencia de la reparacion que ya radicaste.',
    { descripcion: str('Que muestra la foto, segun lo que ves en el historial') },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const repId = String(c.ctxAgente.reparacion_id || '');
    if (!repId) return { ok: false, error: 'sin_reparacion_activa' };
    await c.db.crear('Documento', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      reparacion_id: repId,
      nombre: `Evidencia reparacion ${repId}`,
      categoria: 'evidencia',
      descripcion: String(input.descripcion || '').slice(0, 500),
      contenido: String(c.ctxAgente.ultima_media_url || ''),
    });
    return { ok: true };
  },
};

export const consultarEstadoReparacion: Tool = {
  ...definirTool(
    'consultar_estado_reparacion',
    'Consulta como van las reparaciones abiertas de este cliente.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const reps = await c.db.list('Reparacion', {
      arrendatario_id: c.estado.identidad.arrendatario_id || '', limit: 10,
    });
    const abiertas = reps.filter((r: any) => r.estado !== 'Cerrada' && r.estado !== 'Cancelada');
    if (!abiertas.length) return { abiertas: 0, instruccion: 'No tiene reparaciones abiertas. Preguntale si quiere reportar una nueva.' };
    return {
      abiertas: abiertas.length,
      reparaciones: abiertas.map((r: any) => ({
        radicado: r.numero_radicado || r.id,
        categoria: r.categoria,
        estado: r.estado,
        urgencia: r.urgencia,
        reportada: r.fecha_reporte,
        proveedor_asignado: r.proveedor_id ? true : false,
      })),
      instruccion: 'Resume el estado en una frase. No prometas fechas que no aparecen aqui.',
    };
  },
};

export const MANTENIMIENTO: Record<string, Tool> = {
  verificar_identidad: verificarIdentidad,
  registrar_reparacion: registrarReparacion,
  adjuntar_evidencia: adjuntarEvidencia,
  consultar_estado_reparacion: consultarEstadoReparacion,
};
