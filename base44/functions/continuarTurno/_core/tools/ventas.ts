import { definirTool, str, strOpc, num, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { ctxDe } from '../state.ts';
import { limpiar } from './comunes.ts';
import type { Db } from '../db.ts';

// Reemplaza `asignarBrokerDinamico`, que leia ConfigAgente.brokers[] y "ganaba
// el primero que coincidia". Con 30+ asesores eso concentra todos los leads en
// una persona: ahora se balancea por leads abiertos.
export async function asignarAsesor(db: Db, criterios: { zona?: string; tipo?: string; operacion?: string }) {
  const activos = await db.list('Asesor', { estado: 'Activo', limit: 100 });
  if (!activos.length) return null;

  const zona = String(criterios.zona || '').toLowerCase();
  const quiereArriendo = String(criterios.operacion || '').startsWith('arr');
  const porTipo = activos.filter((a: any) => {
    const t = String(a.tipo || 'Ambos');
    if (t === 'Ambos') return true;
    return quiereArriendo ? t === 'Arriendo' : t === 'Venta';
  });
  let cand = porTipo.length ? porTipo : activos;

  if (zona) {
    const porZona = cand.filter((a: any) =>
      Array.isArray(a.zonas) && a.zonas.some((z: string) => zona.includes(String(z).toLowerCase())));
    if (porZona.length) cand = porZona;
  }

  // Balanceo: gana quien menos leads abiertos tiene. Empate -> el que lleva mas
  // tiempo sin recibir uno (round-robin real).
  const cargas = await Promise.all(cand.map(async (a: any) => ({
    asesor: a,
    abiertos: (await db.list('Contacto', { asignado_a: a.nombre, estado_seguimiento: 'Asignado', limit: 50 })).length,
    ultima: new Date(a.ultima_asignacion || 0).getTime(),
  })));
  cargas.sort((x, y) => x.abiertos - y.abiertos || x.ultima - y.ultima);
  const elegido = cargas[0].asesor;
  await db.actualizar('Asesor', elegido.id, { ...elegido, ultima_asignacion: new Date().toISOString() });
  return elegido;
}

const fmtM = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1).replace('.0', '')} mil millones` : `$${Math.round(n / 1e6)} millones`;

export const buscarInmuebles: Tool = {
  ...definirTool(
    'buscar_inmuebles',
    'Busca en el inventario real inmuebles que encajen con lo que pide el cliente. Devuelve solo lo que existe: NUNCA menciones un inmueble, precio o direccion que no venga de aqui.',
    {
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      barrio: strOpc('Barrio o zona. null si no lo ha dicho.'),
      tipo: strOpc('apartamento, casa, oficina, local, bodega, lote. null si no lo ha dicho.'),
      presupuesto_max: numOpc('Tope en pesos. null si no lo ha dicho.'),
      habitaciones_min: numOpc('Minimo de habitaciones. null si no aplica.'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const props: any[] = c.ctxAgente.catalogo || [];
    const esArr = input.operacion === 'arriendo';
    const barrio = String(input.barrio || '').toLowerCase();
    const tipo = String(input.tipo || '').toLowerCase();
    const tope = Number(input.presupuesto_max) || 0;
    const habs = Number(input.habitaciones_min) || 0;

    const puntuados = props
      .filter((p) => {
        const op = String(p.operacion || '');
        return op === 'Venta_y_Arriendo' || (esArr ? op === 'Arriendo' : op === 'Venta');
      })
      .map((p) => {
        let s = 0;
        const pb = String(p.barrio || '').toLowerCase();
        if (barrio && pb && (pb.includes(barrio) || barrio.includes(pb))) s += 3;
        if (tipo && String(p.tipo || '').toLowerCase().includes(tipo)) s += 2;
        if (habs && Number(p.habitaciones) >= habs) s += 2;
        const precio = esArr ? Number(p.canon_arriendo) || 0 : Number(p.precio_venta) || 0;
        if (tope && precio && precio <= tope * 1.15) s += 2;
        return { p, s };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    if (!puntuados.length) return { encontrados: 0, inmuebles: [] };

    return {
      encontrados: puntuados.length,
      inmuebles: puntuados.map(({ p }) => ({
        id: p.id,
        titulo: p.titulo,
        tipo: p.tipo,
        barrio: p.barrio || p.ciudad,
        area_m2: p.area_m2 ?? null,
        habitaciones: p.habitaciones ?? null,
        banos: p.banos ?? null,
        precio: esArr
          ? (p.canon_arriendo ? fmtM(p.canon_arriendo) + ' al mes' : null)
          : (p.precio_venta ? fmtM(p.precio_venta) : null),
        administracion: p.valor_administracion ?? p.administracion ?? null,
        ficha: p.link_wasi || null,
        video: p.link_instagram || null,
      })),
      nota: 'Solo puedes afirmar los datos que aparecen aqui. Si un campo viene en null, ese dato NO lo tienes: dile al cliente que se lo confirma el asesor.',
    };
  },
};

export const enviarFicha: Tool = {
  ...definirTool(
    'enviar_ficha',
    'Manda al cliente el link de la ficha (fotos y detalles) de un inmueble concreto que ya viste en buscar_inmuebles. Mandalo apenas presentes el inmueble, sin esperar a que lo pida.',
    { inmueble_id: str('El id que devolvio buscar_inmuebles') },
  ),
  ejecutar: (input, c: CtxTool) => {
    const p = (c.ctxAgente.catalogo || []).find((x: any) => x.id === input.inmueble_id);
    if (!p) return { ok: false, error: 'inmueble no encontrado' };
    if (!p.link_wasi) return { ok: false, error: 'sin_ficha', nota: 'Dile que el asesor se la comparte. No inventes el link.' };
    c.salida.globos.push('Te dejo la ficha con las fotos y todos los detalles:');
    c.salida.globos.push(String(p.link_wasi));
    return { ok: true };
  },
};

export const calificarLead: Tool = {
  ...definirTool(
    'calificar_lead',
    'Entrega el lead a un asesor humano. Llamala SOLO cuando tengas nombre, operacion (compra o arriendo) y una senal real del presupuesto del cliente. El precio de un inmueble NO es el presupuesto del cliente. El sistema escribe el mensaje de entrega: tu no lo redactas.',
    {
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      zona: strOpc('Barrio o zona de interes. null si no la dio.'),
      tipo_inmueble: strOpc('Tipo de inmueble. null si no lo dijo.'),
      presupuesto: numOpc('Cifra en pesos. null si es un inversionista flexible o no quiso darla.'),
      observaciones: strOpc('Lo que el asesor deberia saber antes de llamar. null si no hay nada.'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ctx = ctxDe(c.estado, 'ventas');
    if (ctx.calificado) return { ok: false, error: 'ya_calificado' };
    const nombre = String(c.estado.compartido.nombre || '').trim();
    if (!nombre) return { ok: false, error: 'falta_nombre', nota: 'Pide el nombre antes de calificar.' };

    const asesor = await asignarAsesor(c.db, {
      zona: input.zona, tipo: input.tipo_inmueble, operacion: input.operacion,
    });

    ctx.calificado = true;
    ctx.asesor = asesor?.nombre || '';
    ctx.asesor_id = asesor?.id || '';
    ctx.asesor_tel = asesor?.telefono || '';

    const contactoId = String(c.estado.compartido.contacto_id || '');
    if (contactoId) {
      await c.db.actualizar('Contacto', contactoId, {
        nombre,
        telefono: c.entrada.tel,
        ia_calificado: true,
        temperatura: 'Caliente',
        asignado_a: asesor?.nombre || '',
        broker_telefono: asesor?.telefono || '',
        estado_seguimiento: 'Asignado',
        fecha_asignacion: new Date().toISOString(),
        fecha_ultimo_avance: new Date().toISOString(),
        tipo_interes: input.operacion === 'arriendo' ? 'Arriendo' : 'Compra',
        pipeline_tipo: input.operacion === 'arriendo' ? 'Arriendo' : 'Venta',
        presupuesto_max: Number(input.presupuesto) || undefined,
        ciudad_interes: 'Bogota',
        notas: [input.zona ? `Zona: ${input.zona}` : '', input.observaciones || ''].filter(Boolean).join(' | '),
      });
      await c.db.crear('HistorialLead', {
        contacto_id: contactoId,
        evento: 'Calificado',
        detalle: `Asignado a ${asesor?.nombre || 'sin asesor'} por el agente de ventas`,
        fecha: new Date().toISOString(),
      });
    }

    c.efectos.notificar.push(
      `LEAD CALIFICADO — contactar hoy\n\n${nombre}\nwa.me/${c.entrada.tel}\n` +
      `${input.operacion === 'arriendo' ? 'Arriendo' : 'Compra'} de ${input.tipo_inmueble || 'inmueble'}\n` +
      `Zona: ${input.zona || 'sin definir'}\n` +
      `Presupuesto: ${input.presupuesto ? fmtM(Number(input.presupuesto)) : 'flexible, confirmar en la llamada'}\n` +
      `${input.observaciones ? `\nA tener en cuenta: ${input.observaciones}\n` : ''}` +
      `\nAsesor asignado: ${asesor?.nombre || 'SIN ASIGNAR'}${asesor?.telefono ? ` (${asesor.telefono})` : ''}`,
    );

    const primer = nombre.split(/\s+/)[0];
    const rol = asesor?.nombre ? asesor.nombre.split(/\s+/)[0] : null;
    return {
      ok: true,
      asesor: asesor?.nombre || null,
      instruccion: rol
        ? `Llama a responder con: confirmacion breve a ${primer}, que lo acompana ${rol}, y que le escribe hoy por aqui. No prometas horas exactas.`
        : `Llama a responder con: confirmacion breve a ${primer} y que un asesor le escribe hoy por aqui.`,
    };
  },
};

export const agendarVisita: Tool = {
  ...definirTool(
    'agendar_visita',
    'Deja registrada la intencion de visitar un inmueble. No confirma hora: el asesor coordina. Nunca prometas un horario concreto.',
    {
      inmueble_id: str('El id que devolvio buscar_inmuebles'),
      preferencia: str('Cuando le queda bien al cliente, en sus palabras'),
    },
  ),
  ejecutar: async (input, c: CtxTool) => {
    await c.db.crear('Visita', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      propiedad_id: String(input.inmueble_id || ''),
      estado: 'Solicitada',
      preferencia_horario: String(input.preferencia || '').slice(0, 200),
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    return { ok: true, nota: 'Dile que el asesor le confirma el horario. No des una hora tu.' };
  },
};

export const VENTAS: Record<string, Tool> = {
  buscar_inmuebles: buscarInmuebles,
  enviar_ficha: enviarFicha,
  calificar_lead: calificarLead,
  agendar_visita: agendarVisita,
};
