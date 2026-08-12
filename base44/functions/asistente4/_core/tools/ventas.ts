import { definirTool, str, strOpc, numOpc, enumStr, type Tool, type CtxTool } from '../protocol.ts';
import { ctxDe } from '../state.ts';
import { TELEFONO_CONTINGENCIA } from '../prompts.ts';
import { calificar } from '../scoring.ts';
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

// El demo tiene que decir el valor real. Redondear $2.500.000 a "$3 millones"
// cambia materialmente el canon y erosiona la confianza en el inventario.
export const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Math.round(n)).replace(/\s+/g, '');

// La ficha que se le manda al cliente.
//
// `link_web` va de PRIMERO: es la pagina del inmueble en el sitio de
// INMOBILIARE. Mandar al cliente a nuestra web y no a la de un portal es la
// diferencia entre que el lead siga siendo nuestro o que quede navegando el
// inventario de la competencia, que es lo que hay al lado en Metrocuadrado.
// Los portales quedan de respaldo para los inmuebles que aun no tienen ficha
// propia publicada.
//
// (`link_wasi` salio de aqui porque INMOBILIARE no usa Wasi —era residuo de la
// app de la que se clono esto— y estaba de primero, asi que bastaba que alguien
// llenara ese campo para mandar al cliente a otra plataforma.)
// Como se le describe un inmueble al modelo. Compartida entre buscar_inmuebles
// y buscar_por_codigo: si cada una arma su propio objeto, terminan afirmando
// campos distintos del mismo inmueble segun por donde llego el cliente.
// Los null son deliberados y el prompt se apoya en ellos: null significa "este
// dato NO lo tienes", que es lo que impide que el modelo lo complete.
export function resumirProp(p: any, esArriendo: boolean) {
  return {
    id: p.id,
    codigo: p.codigo_externo || null,
    titulo: p.titulo,
    tipo: p.tipo,
    barrio: p.barrio || p.ciudad,
    area_m2: p.area_m2 ?? null,
    habitaciones: p.habitaciones ?? null,
    banos: p.banos ?? null,
    parqueaderos: p.parqueaderos ?? null,
    precio: esArriendo
      ? (p.canon_arriendo ? fmtCOP(p.canon_arriendo) + ' al mes' : null)
      : (p.precio_venta ? fmtCOP(p.precio_venta) : null),
    administracion: p.valor_administracion ?? p.administracion ?? null,
    ficha: linkFicha(p) || null,
    video: p.link_instagram || null,
  };
}

export const linkFicha = (p: any): string => String(
  p?.link_web
  || p?.portales?.metrocuadrado
  || p?.portales?.fincaraiz
  || p?.portales?.mercadolibre
  || p?.portales?.lahaus
  || p?.portales?.ciencuadras
  || p?.portales?.properati
  || '',
).trim();

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

    // Descubrimiento antes de mostrar inventario. Sin este gate, el unico
    // parametro obligatorio era `operacion`: con todo lo demas en null el filtro
    // no descartaba nada, la puntuacion daba 0 a todo y salian cinco inmuebles
    // ARBITRARIOS desde el primer mensaje. Un broker no abre con un listado, y
    // volcarlo ademas quema el inventario antes de saber que necesita el cliente.
    //
    // Va en codigo y no en el prompt porque dependia de que el modelo decidiera
    // preguntar primero, y eso no es una garantia.
    if (!barrio && !tope) {
      return {
        falta_discovery: true,
        instruccion: 'Todavia no tienes con que buscar. Antes de mostrar inmuebles necesitas '
          + 'al menos la zona o el presupuesto. Preguntale UNA de las dos, la que fluya mejor '
          + 'en la conversacion, y vuelve a llamarme cuando la tengas. No muestres inventario '
          + 'ni digas que estas buscando.',
      };
    }

    const puntuados = props
      .filter((p) => {
        const op = String(p.operacion || '');
        if (!(op === 'Venta_y_Arriendo' || (esArr ? op === 'Arriendo' : op === 'Venta'))) return false;

        const barrioPropiedad = String(p.barrio || '').toLowerCase();
        const zonaPropiedad = [p.barrio, p.zona, p.ciudad]
          .map((valor) => String(valor || '').toLowerCase())
          .join(' ');
        const coincideZona = zonaPropiedad.includes(barrio)
          || Boolean(barrioPropiedad && barrio.includes(barrioPropiedad));
        if (barrio && !coincideZona) {
          return false;
        }
        if (tipo && !String(p.tipo || '').toLowerCase().includes(tipo)) return false;

        const precio = esArr ? Number(p.canon_arriendo) || 0 : Number(p.precio_venta) || 0;
        if (tope && (!precio || precio > tope)) return false;
        if (habs && (!Number(p.habitaciones) || Number(p.habitaciones) < habs)) return false;
        return true;
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

    // Cero resultados es el caso que mas se maltrataba: devolvia una lista
    // vacia sin ninguna guia, mientras el prompt prometia "ofrece registrar el
    // interes" y esa herramienta no existia. El agente terminaba prometiendo
    // "te aviso cuando entre algo" y eso no quedaba registrado en ningun lado.
    if (!puntuados.length) {
      return {
        encontrados: 0,
        inmuebles: [],
        instruccion: 'Hoy no hay nada que encaje. Dilo sin rodeos, NO ofrezcas alternativas '
          + 'que no viste aqui, y ofrecele registrar el interes para avisarle cuando entre '
          + 'algo: para eso llama a registrar_interes. Si el cliente acepta, esa llamada es '
          + 'obligatoria, no basta con prometerselo.',
      };
    }

    return {
      encontrados: puntuados.length,
      inmuebles: puntuados.map(({ p }) => resumirProp(p, esArr)),
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
    const ficha = linkFicha(p);
    if (!ficha) return { ok: false, error: 'sin_ficha', nota: 'Dile que el asesor se la comparte. No inventes el link.' };
    c.salida.globos.push('Te dejo la ficha con las fotos y todos los detalles:');
    c.salida.globos.push(ficha);
    return { ok: true };
  },
};

export const registrarInteres: Tool = {
  ...definirTool(
    'registrar_interes',
    'Guarda lo que el cliente busca para avisarle cuando entre un inmueble que encaje. Usala cuando buscar_inmuebles no encontro nada y el cliente acepta que le avisemos. Es la unica forma de que ese "te aviso" quede registrado: prometerlo en el mensaje no guarda nada.',
    {
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      zona: strOpc('Barrio o zona. null si no la dio.'),
      tipo_inmueble: strOpc('Tipo de inmueble. null si no lo dijo.'),
      presupuesto_max: numOpc('Tope en pesos. null si no lo dio.'),
      habitaciones_min: numOpc('Minimo de habitaciones. null si no aplica.'),
      notas: strOpc('Algo mas que deba saber quien le avise. null si no hay nada.'),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ctx = ctxDe(c.estado, 'ventas');
    const nombre = String(c.estado.compartido.nombre || '').trim();

    // Vigencia por defecto: 90 dias. Pasado eso la alerta se marca vencida y no
    // se llama al cliente. Nadie quiere que lo contacten por algo que pidio hace
    // ocho meses; una alerta sin caducidad se vuelve una molestia.
    const alerta = await c.db.crear('AlertaBusqueda', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      contacto_nombre: nombre,
      contacto_telefono: c.entrada.tel.replace(/\D/g, ''),
      operacion: input.operacion === 'arriendo' ? 'Arriendo' : 'Venta',
      tipo_inmueble: input.tipo_inmueble ? String(input.tipo_inmueble) : '',
      zona: input.zona ? String(input.zona) : '',
      presupuesto_max: Number(input.presupuesto_max) || 0,
      habitaciones_min: Number(input.habitaciones_min) || 0,
      estado: 'Activa',
      canal: c.entrada.canal,
      fecha_registro: new Date().toISOString(),
      vigente_hasta: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      veces_notificado: 0,
      notas: input.notas ? String(input.notas).slice(0, 500) : '',
    });
    if (!alerta) return { ok: false, error: 'no_se_pudo_registrar' };
    ctx.alerta_id = alerta.id;

    return {
      ok: true,
      instruccion: 'Confirmale que quedo registrado y que le escribimos apenas entre algo '
        + 'que encaje. NO prometas cuando: no lo sabes.',
    };
  },
};

// El cliente que llega con un codigo (lo saco de la URL de la ficha en la web)
// ya sabe que inmueble quiere: preguntarle zona y presupuesto para "descubrir"
// lo que vino a pedir es exactamente el interrogatorio que la operacion quiere
// quitar. Por eso esta herramienta NO pasa por el gate de descubrimiento.
export const buscarPorCodigo: Tool = {
  ...definirTool(
    'buscar_por_codigo',
    'Busca UN inmueble por su codigo. Usala apenas el cliente mencione un codigo (por ejemplo 90-1177), que es el que aparece en la URL de la ficha en la pagina web. No le pidas zona ni presupuesto: ya sabe cual quiere.',
    { codigo: str('El codigo tal como lo escribio el cliente') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    // Se normaliza porque el cliente lo dicta como lo ve: "90-1177", "90 1177",
    // "cod 90-1177". Comparar el texto crudo falla en la mayoria de esos casos.
    const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const buscado = norm(input.codigo);
    if (!buscado) return { ok: false, error: 'sin_codigo' };

    const props: any[] = c.ctxAgente.catalogo || [];
    let p = props.find((x) => norm(x.codigo_externo) === buscado);

    // El catalogo en contexto son los Disponible. Si no esta ahi, puede existir
    // pero ya no estar en el mercado: hay que decirlo, no callarlo.
    if (!p) {
      const fuera = await c.db.list('Propiedad', { codigo_externo: String(input.codigo).trim(), limit: 1 });
      if (fuera?.[0]) {
        return {
          ok: false,
          error: 'no_disponible',
          instruccion: 'Ese inmueble existe pero ya no esta disponible. Dilo sin rodeos y ofrecele '
            + 'buscar algo parecido. No des sus datos ni su precio.',
        };
      }
      return {
        ok: false,
        error: 'no_encontrado',
        instruccion: 'No hay ningun inmueble con ese codigo. Pidele que lo confirme (puede estar '
          + 'incompleto) o que te cuente que busca y lo ubicas por zona. No inventes un inmueble.',
      };
    }

    return {
      ok: true,
      inmueble: resumirProp(p, !p.precio_venta && !!p.canon_arriendo),
      instruccion: 'Confirmale que si lo tienes, dile lo esencial en una frase y manda la ficha '
        + 'con enviar_ficha en este mismo turno. Despues sigue la conversacion: pregunta si quiere '
        + 'verlo o si busca algo asi.',
    };
  },
};

export const calificarLead: Tool = {
  ...definirTool(
    'calificar_lead',
    'Entrega el lead a un asesor humano. Llamala SOLO cuando tengas nombre, operacion (compra o arriendo) y una senal real del presupuesto del cliente. El precio de un inmueble NO es el presupuesto del cliente. El sistema escribe el mensaje de entrega: tu no lo redactas.',
    {
      nombre: str('Nombre que dio el cliente. No lo inventes.'),
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      zona: strOpc('Barrio o zona de interes. null si no la dio.'),
      tipo_inmueble: strOpc('Tipo de inmueble. null si no lo dijo.'),
      presupuesto: numOpc('Cifra en pesos. null si es un inversionista flexible o no quiso darla.'),
      observaciones: strOpc('Lo que el asesor deberia saber antes de llamar. null si no hay nada.'),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ctx = ctxDe(c.estado, 'ventas');
    if (ctx.calificado) return { ok: false, error: 'ya_calificado' };
    const nombre = String(input.nombre || c.estado.compartido.nombre || '').trim();
    if (!nombre) return { ok: false, error: 'falta_nombre', nota: 'Pide el nombre antes de calificar.' };
    c.estado.compartido.nombre = nombre;

    const asesor = await asignarAsesor(c.db, {
      zona: input.zona, tipo: input.tipo_inmueble, operacion: input.operacion,
    });

    ctx.calificado = true;
    ctx.asesor = asesor?.nombre || '';
    ctx.asesor_id = asesor?.id || '';
    ctx.asesor_tel = asesor?.telefono || '';

    // Temperatura y score REALES. Antes se escribia 'Caliente' literal para
    // todo lead, asi que la columna no distinguia a nadie de nadie y el equipo
    // no tenia como priorizar. Las señales de conversacion salen del ctx del
    // agente, donde guardar_dato las fue dejando.
    const cal = calificar({
      etapa_pipeline: 'Lead',
      presupuesto_max: Number(input.presupuesto) || undefined,
      ciudad_interes: 'Bogota',
      operacion: String(input.operacion),
      zona: input.zona ? String(input.zona) : undefined,
      timing: ctx.datos?.timing ? String(ctx.datos.timing) : undefined,
      forma_pago: ctx.datos?.forma_pago ? String(ctx.datos.forma_pago) : undefined,
      decide_solo: typeof ctx.datos?.decide_solo === 'boolean' ? ctx.datos.decide_solo : undefined,
      otra_inmobiliaria: ctx.datos?.otra_inmobiliaria === true,
      ultima_actividad: new Date().toISOString(),
    });
    ctx.score = cal.score;
    ctx.temperatura = cal.temperatura;

    const contactoId = String(c.estado.compartido.contacto_id || '');
    if (contactoId) {
      await c.db.actualizar('Contacto', contactoId, {
        nombre,
        telefono: c.entrada.tel,
        ia_calificado: true,
        temperatura: cal.temperatura,
        score_lead: cal.score,
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
      // `tipo` es obligatorio en el esquema y su enum ya traia el valor exacto
      // para esto. Antes se mandaba evento/detalle, campos que no existen, sin
      // `tipo`: la calificacion no quedaba en el historial del lead.
      await c.db.crear('HistorialLead', {
        contacto_id: contactoId,
        tipo: 'Calificacion_IA',
        descripcion: `Asignado a ${asesor?.nombre || 'sin asesor'} por el agente de ventas`,
        fecha: new Date().toISOString(),
        es_automatico: true,
      });
    }

    c.efectos.notificar.push(
      // La temperatura encabeza: es lo que le dice al asesor si atender ya o
      // cuando pueda. Antes todos los leads llegaban iguales.
      `LEAD ${cal.temperatura.toUpperCase()} (${cal.score}/100) — contactar\n\n${nombre}\nwa.me/${c.entrada.tel}\n` +
      `${input.operacion === 'arriendo' ? 'Arriendo' : 'Compra'} de ${input.tipo_inmueble || 'inmueble'}\n` +
      `Zona: ${input.zona || 'sin definir'}\n` +
      `Presupuesto: ${input.presupuesto ? fmtCOP(Number(input.presupuesto)) : 'flexible, confirmar en la llamada'}\n` +
      `${input.observaciones ? `\nA tener en cuenta: ${input.observaciones}\n` : ''}` +
      `\nAsesor asignado: ${asesor?.nombre || 'SIN ASIGNAR'}${asesor?.telefono ? ` (${asesor.telefono})` : ''}`,
    );

    const primer = nombre.split(/\s+/)[0];
    const rol = asesor?.nombre ? asesor.nombre.split(/\s+/)[0] : null;
    return {
      ok: true,
      asesor: asesor?.nombre || null,
      // El telefono de contingencia va AQUI y en ningun otro lado: es el unico
      // momento en que el cliente pasa a manos de una persona, asi que es el
      // unico en que tiene sentido darle por donde insistir.
      instruccion: rol
        ? `Llama a responder con: confirmacion breve a ${primer}, que lo acompana ${rol}, y que se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.`
        : `Llama a responder con: confirmacion breve a ${primer} y que un asesor se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.`,
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
    { cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    await c.db.crear('Visita', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      propiedad_id: String(input.inmueble_id || ''),
      // Solicitada, no Programada: el agente recogio una preferencia, no acordo
      // una hora. Quien confirma es el equipo.
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
  buscar_por_codigo: buscarPorCodigo,
  enviar_ficha: enviarFicha,
  registrar_interes: registrarInteres,
  calificar_lead: calificarLead,
  agendar_visita: agendarVisita,
};
