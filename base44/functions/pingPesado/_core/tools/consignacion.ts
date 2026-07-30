import { definirTool, str, strOpc, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { asignarAsesor } from './ventas.ts';

export const registrarConsignacion: Tool = {
  ...definirTool(
    'registrar_consignacion',
    'Registra un inmueble que el propietario quiere poner con nosotros. Necesitas como minimo la direccion, el tipo de inmueble y que gestion quiere (venta, arriendo o administracion).',
    {
      direccion: str('Direccion del inmueble'),
      barrio: strOpc('Barrio o zona. null si no lo dijo.'),
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro']),
      gestion: enumStr('Que quiere hacer con el', ['Venta', 'Arriendo', 'Administracion', 'Venta_y_Arriendo']),
      valor_esperado: numOpc('Precio de venta que espera, en pesos. null si no lo dijo.'),
      canon_esperado: numOpc('Canon mensual que espera, en pesos. null si no lo dijo.'),
      nombre_propietario: str('Nombre de quien escribe'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const tel = c.entrada.tel.replace(/\D/g, '');
    let prop = await c.db.uno('Propietario', { telefono: tel });
    if (!prop) {
      prop = await c.db.crear('Propietario', {
        nombre: String(input.nombre_propietario || '').slice(0, 200),
        telefono: tel,
        email: String(c.estado.compartido.email || ''),
        origen: `agente:${c.entrada.canal}`,
      });
    }

    const asesor = await asignarAsesor(c.db, {
      zona: input.barrio, tipo: input.tipo_inmueble,
      operacion: String(input.gestion).toLowerCase().includes('arriendo') ? 'arriendo' : 'venta',
    });

    const cons = await c.db.crear('Consignacion', {
      propietario_id: prop?.id || '',
      direccion: String(input.direccion || '').slice(0, 300),
      barrio: String(input.barrio || ''),
      zona: String(input.barrio || ''),
      tipo_inmueble: String(input.tipo_inmueble),
      gestion: String(input.gestion),
      valor_esperado: Number(input.valor_esperado) || 0,
      canon_esperado: Number(input.canon_esperado) || 0,
      estado: 'Solicitada',
      asesor_id: asesor?.id || '',
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    if (!cons) return { error: 'no_se_pudo_registrar' };

    c.ctxAgente.consignacion_id = cons.id;
    c.efectos.notificar.push(
      `CONSIGNACION NUEVA\n${String(input.nombre_propietario)}\nwa.me/${c.entrada.tel}\n` +
      `${String(input.tipo_inmueble)} en ${String(input.direccion)}${input.barrio ? `, ${input.barrio}` : ''}\n` +
      `Gestion: ${String(input.gestion)}\n` +
      `${input.valor_esperado ? `Venta esperada: $${Number(input.valor_esperado).toLocaleString('es-CO')}\n` : ''}` +
      `${input.canon_esperado ? `Canon esperado: $${Number(input.canon_esperado).toLocaleString('es-CO')}\n` : ''}` +
      `Asesor: ${asesor?.nombre || 'SIN ASIGNAR'}`,
    );

    return {
      ok: true,
      asesor: asesor?.nombre || null,
      instruccion: 'Confirma que quedo registrado y que un asesor lo contacta para coordinar la visita y el avaluo. NO negocies comision ni des porcentajes: si pregunta por eso, escala.',
    };
  },
};

export const agendarAvaluoPrevio: Tool = {
  ...definirTool(
    'agendar_avaluo_previo',
    'Deja pedida la visita de avaluo para una consignacion que ya registraste. Sirve para saber a que precio sale el inmueble.',
    { preferencia: str('Cuando le queda bien al propietario, en sus palabras') },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const consId = String(c.ctxAgente.consignacion_id || '');
    if (!consId) return { ok: false, error: 'sin_consignacion' };
    const preferencia = String(input.preferencia || '').slice(0, 300);
    await c.db.actualizar('Consignacion', consId, { estado: 'En_Avaluo', preferencia_avaluo: preferencia });
    c.efectos.notificar.push(
      `AVALUO PREVIO SOLICITADO\nConsignacion: ${consId}\nTelefono: ${c.entrada.tel}\nPreferencia: ${preferencia}`,
    );
    return { ok: true, nota: 'Dile que el asesor le confirma el dia. No des una hora tu.' };
  },
};

export const CONSIGNACION: Record<string, Tool> = {
  registrar_consignacion: registrarConsignacion,
  agendar_avaluo_previo: agendarAvaluoPrevio,
};
