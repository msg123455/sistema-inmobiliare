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
  const tope = opts.presupuestoLlamadas ?? 2;
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

    for (const uso of usos) {
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

  // Se agoto el presupuesto sin `responder`. El turno se aparca con el historial
  // exacto que llevaba; continuarTurno lo retoma donde quedo.
  return { globos: opts.ctx.salida.globos, finTurno: false, pendiente: { mensajes }, llamadas };
}
