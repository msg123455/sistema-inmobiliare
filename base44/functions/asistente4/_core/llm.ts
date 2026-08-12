// Llamada a Anthropic + loop de tool-use con presupuesto duro.
//
// Presupuesto: maximo 2 llamadas al modelo por invocacion (§A.4). El camino
// comun es UNA sola llamada: con parallel tool use el modelo emite las tools de
// efecto lateral y `responder` en el mismo turno, y `responder` es terminal.
// La segunda llamada solo ocurre con tools de recuperacion, que genuinamente
// necesitan el resultado para hablar. Si hace falta una tercera, el turno se
// aparca en estado.turno_pendiente y lo reanuda el cron continuarTurno.

import type { CtxTool, EsquemaTool, Tool } from './protocol.ts';

const API = 'https://api.anthropic.com/v1/messages';

// Capacidades por modelo. `effort` NO existe en Haiku 4.5 (devuelve error), y
// Sonnet 5 corre pensamiento adaptativo por defecto — a 15s de presupuesto eso
// se paga, asi que se fija effort bajo salvo que el agente pida otra cosa.
function paramsModelo(modelo: string, effort?: string) {
  if (/haiku/.test(modelo)) return {};
  return { output_config: { effort: effort || 'low' } };
}

export interface RespuestaModelo {
  bloques: any[];
  stop_reason: string;
  modelo: string;
}

export async function llamarModelo(opts: {
  apiKey: string;
  modelos: string[];
  system: string | any[];
  messages: any[];
  tools?: EsquemaTool[];
  toolChoice?: Record<string, unknown>;
  maxTokens?: number;
  effort?: string;
}): Promise<RespuestaModelo | null> {
  for (const modelo of opts.modelos) {
    const body: Record<string, unknown> = {
      model: modelo,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages,
      ...paramsModelo(modelo, opts.effort),
    };
    if (opts.tools?.length) body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;

    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: {
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = await r.json();
        return { bloques: j.content || [], stop_reason: j.stop_reason || '', modelo };
      }
      console.error(`Anthropic ${modelo} ${r.status}:`, (await r.text()).slice(0, 300));
    } catch (e) {
      console.error(`Anthropic ${modelo} excepcion:`, (e as Error).message);
    }
  }
  return null;
}

export interface ResultadoAgente {
  globos: string[];
  finTurno: boolean;
  pendiente: { mensajes: any[] } | null;
  llamadas: number;
}

// Un turno del agente. `mensajes` entra como el historial ya formateado para la
// API; si viene de un turno aparcado, trae los tool_result pendientes.
export async function correrAgente(opts: {
  apiKey: string;
  modelos: string[];
  system: string;
  mensajes: any[];
  tools: Record<string, Tool>;
  ctx: CtxTool;
  maxTokens?: number;
  effort?: string;
  presupuestoLlamadas?: number;
}): Promise<ResultadoAgente> {
  const defs = Object.values(opts.tools).map((t) => t.def);
  const mensajes = [...opts.mensajes];
  // Cuatro y no dos. Con dos, un tramite normal se quedaba sin cupo antes de
  // hablar: mantenimiento gastaba la primera en identificar_titular (que
  // `retorna`, o sea que exige otra vuelta) y la segunda en guardar_dato, que es
  // efecto lateral. El turno se aparcaba sin una sola frase para el cliente.
  //
  // El tope de 2 venia de un presupuesto de 15s que no es el real: los logs de
  // produccion muestran turnos de 47s y de 108s completandose sin problema.
  const tope = opts.presupuestoLlamadas ?? 4;
  let llamadas = 0;

  while (llamadas < tope) {
    const res = await llamarModelo({
      apiKey: opts.apiKey,
      modelos: opts.modelos,
      system: opts.system,
      messages: mensajes,
      tools: defs,
      maxTokens: opts.maxTokens,
      effort: opts.effort,
    });
    llamadas++;
    if (!res) break;

    const usos = res.bloques.filter((b: any) => b.type === 'tool_use');

    // Sin tool_use: el modelo hablo en texto plano. Se acepta como respuesta
    // en vez de perder el turno, pero no deberia pasar — `responder` es la via.
    if (!usos.length) {
      const texto = res.bloques.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim();
      if (texto) opts.ctx.salida.globos.push(texto);
      return { globos: opts.ctx.salida.globos, finTurno: true, pendiente: null, llamadas };
    }

    mensajes.push({ role: 'assistant', content: res.bloques });

    // Ejecutar TODAS las tools del turno. Los resultados vuelven en UN SOLO
    // mensaje de usuario: partirlos en varios le ensena al modelo a dejar de
    // emitir llamadas en paralelo, que es justo lo que hace viable el costo.
    const resultados: any[] = [];
    let terminal = false;
    let necesitaOtraVuelta = false;

    // El terminal va de ULTIMO. Con tool use paralelo el modelo emite en un solo
    // turno, por ejemplo, `registrar_interes` y `responder`, y el orden del array
    // lo decide el modelo. Si `responder` corriera primero, revisaria si hubo
    // cierre antes de que la otra tool lo marcara. Ordenarlo aqui elimina esa
    // dependencia del orden en vez de confiar en que el modelo lo acomode.
    const ordenados = [...usos].sort((a, b) => {
      const ta = opts.tools[a.name]?.terminal ? 1 : 0;
      const tb = opts.tools[b.name]?.terminal ? 1 : 0;
      return ta - tb;
    });

    for (const uso of ordenados) {
      const tool = opts.tools[uso.name];
      if (!tool) {
        resultados.push({ type: 'tool_result', tool_use_id: uso.id, is_error: true, content: `Tool desconocida: ${uso.name}` });
        necesitaOtraVuelta = true;
        continue;
      }
      let salida: unknown;
      try {
        salida = await tool.ejecutar(uso.input ?? {}, opts.ctx);
      } catch (e) {
        salida = { error: (e as Error).message };
        console.error(`tool ${uso.name} error:`, (e as Error).message);
      }

      // Solo cuenta como cierre si de verdad se ejecuto: una tool que devuelve
      // error no dejo ninguna cita ni radicado.
      const s = salida as Record<string, unknown> | null;
      const fallo = !s || s.error !== undefined || s.ok === false;
      if (tool.cierra && !fallo) opts.ctx.hubo_cierre = true;

      resultados.push({
        type: 'tool_result',
        tool_use_id: uso.id,
        content: typeof salida === 'string' ? salida : JSON.stringify(salida ?? { ok: true }),
      });
      if (tool.terminal) terminal = true;
      if (tool.retorna) necesitaOtraVuelta = true;
    }

    if (terminal) {
      return { globos: opts.ctx.salida.globos, finTurno: opts.ctx.salida.finTurno, pendiente: null, llamadas };
    }

    mensajes.push({ role: 'user', content: resultados });

    if (!necesitaOtraVuelta) {
      // Solo hubo efectos laterales y el modelo no llamo a `responder`: se le
      // da una vuelta mas para que hable, dentro del mismo presupuesto.
      continue;
    }
  }

  // Se agoto el presupuesto sin que el modelo hablara.
  //
  // Antes esto aparcaba el turno y listo, confiando en que el cron
  // continuarTurno lo retomara. Ese cron ya no existe: Base44 deshabilito las
  // automatizaciones legacy en esta app. Aparcar hoy es quedarse MUDO para
  // siempre, y eso le paso a un cliente real: dio su documento, dio su nombre, y
  // el bot no volvio a contestar nunca.
  //
  // Callarse es el peor final posible de un turno. Peor que una respuesta
  // mediocre, porque el cliente no sabe si le llego, si lo estan leyendo o si el
  // numero sirve. Asi que se gasta UNA llamada mas, con `responder` forzado: el
  // modelo ya tiene todos los resultados de las tools en `mensajes`, solo le
  // falta decirlo.
  if (!opts.ctx.salida.globos.length) {
    const cierre = await llamarModelo({
      apiKey: opts.apiKey,
      modelos: opts.modelos,
      system: opts.system,
      messages: mensajes,
      tools: defs,
      maxTokens: opts.maxTokens,
      effort: opts.effort,
      toolChoice: { type: 'tool', name: 'responder' },
    });
    llamadas++;
    for (const uso of (cierre?.bloques || []).filter((b: any) => b.type === 'tool_use')) {
      const tool = opts.tools[uso.name];
      if (tool) await tool.ejecutar(uso.input, opts.ctx);
    }
    // Si ni forzandolo hablo, algo esta muy mal: se dice lo minimo honesto en vez
    // de dejar el chat en blanco. No promete tiempos ni inventa un estado.
    if (!opts.ctx.salida.globos.length) {
      console.error('el modelo no hablo ni con responder forzado — globo de emergencia');
      opts.ctx.salida.globos.push(
        'Perdon, se me enredo el sistema con eso. Un asesor te escribe para continuar.',
      );
      opts.ctx.efectos.escalado = {
        motivo: 'El agente no logro responder: turno agotado sin respuesta.',
        prioridad: 'alta',
      };
    }
  }

  // Ya hay algo que decir, asi que NO se aparca: aparcar sin quien lo retome es
  // perder el turno.
  return { globos: opts.ctx.salida.globos, finTurno: false, pendiente: null, llamadas };
}
