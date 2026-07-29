// Reanuda los turnos que excedieron el presupuesto de 2 llamadas al modelo.
// Cron cada minuto.
//
// El presupuesto duro existe porque el request de entrada tiene 15s. Cuando un
// agente necesita una tercera llamada (encadenar dos recuperaciones, por
// ejemplo), el turno se aparca en estado.turno_pendiente y este cron lo cierra.
// Tope de 2 continuaciones; despues escala a un humano.

import { crearDb } from './_core/db.ts';
import { encolar, notificarEquipo } from './_core/cola.ts';
import { armarSystem, cargarBase, cargarContexto } from './_core/contexto.ts';
import { correrAgente } from './_core/llm.ts';
import { cargarEstado, ctxDe, guardarEstado } from './_core/state.ts';
import { toolsDe } from './_core/tools/index.ts';
import type { CtxTool, Entrada } from './_core/protocol.ts';

const MODELO_FALLBACK = 'claude-haiku-4-5-20251001';
const MAX_POR_CORRIDA = 5;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET desde el cron */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  if (!esperado || (url.searchParams.get('token') || body.token || '') !== esperado) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = crearDb(Deno.env.get('BASE44_API_KEY') || '');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';

  // El campo indexado evita el scan: solo las conversaciones realmente aparcadas.
  const filas = (await db.list('MemoriaChat', { tiene_turno_pendiente: true, limit: MAX_POR_CORRIDA }));
  const resueltos: any[] = [];

  for (const fila of filas) {
    try {
      const r = await reanudar(db, anthropicKey, fila);
      resueltos.push({ clave: fila.clave, ...r });
    } catch (e) {
      console.error(`continuarTurno ${fila.clave}:`, (e as Error).message);
      resueltos.push({ clave: fila.clave, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, procesados: resueltos.length, detalle: resueltos }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
});

async function reanudar(db: ReturnType<typeof crearDb>, anthropicKey: string, fila: any) {
  const canal = String(fila.canal || '').toLowerCase().includes('telegram') ? 'telegram' : 'whatsapp';
  const { id: memoriaId, estado } = await cargarEstado(db, canal, fila.telefono);

  const pendiente = estado.turno_pendiente;
  if (!pendiente) {
    await db.actualizar('MemoriaChat', fila.id, { ...fila, tiene_turno_pendiente: false });
    return { saltado: 'sin turno pendiente' };
  }

  const tel = String(fila.telefono || '');
  const entrada: Entrada = {
    canal: canal as 'whatsapp' | 'telegram',
    tel,
    texto: '',
    msgId: '',
    botonId: '',
    adReferral: { adId: '', adTitulo: '', adCuerpo: '' },
    destino: canal === 'telegram' ? tel : (tel.startsWith('57') ? tel : '57' + tel),
  };

  const agente = pendiente.agente || estado.agente_activo;
  const [base, ctxCargado] = await Promise.all([
    cargarBase(db, agente),
    cargarContexto(db, agente, estado, entrada),
  ]);

  const scratch = ctxDe(estado, agente);
  Object.assign(scratch, ctxCargado);

  const ctx: CtxTool = {
    db, estado, entrada,
    ctxAgente: scratch,
    config: base.config,
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };

  const res = await correrAgente({
    apiKey: anthropicKey,
    modelos: [String(base.prompt?.modelo || 'claude-sonnet-5'), MODELO_FALLBACK],
    system: armarSystem(base, agente, estado, scratch),
    mensajes: pendiente.mensajes,
    tools: toolsDe(agente, base.prompt?.tools_habilitadas),
    ctx,
    maxTokens: Number(base.prompt?.max_tokens) || 3000,
    effort: base.prompt?.effort || 'low',
  });

  const globos = res.globos.filter(Boolean);
  if (globos.length) {
    estado.historial.push({ role: 'assistant', content: globos.join(' '), globos, ts: new Date().toISOString() });
    await encolar(db, {
      canal: entrada.canal, destino: entrada.destino, globos,
      demoraMin: 0, conversacionId: memoriaId || '',
    });
  }

  if (res.pendiente && pendiente.continuaciones < 2) {
    estado.turno_pendiente = { mensajes: res.pendiente.mensajes, continuaciones: pendiente.continuaciones + 1, agente };
  } else {
    if (res.pendiente) {
      estado.pausada = true;
      ctx.efectos.notificar.push(
        `El agente ${agente} no cerro el turno tras 2 continuaciones.\nCliente: wa.me/${tel}\nRevisar desde la Bandeja.`,
      );
    }
    estado.turno_pendiente = null;
  }

  await Promise.all([
    guardarEstado(db, memoriaId, canal, tel, estado, { ultima_respuesta: globos.join(' | ') }),
    notificarEquipo(base.config, tel, ctx.efectos.notificar),
  ]);

  return { globos: globos.length, sigue_pendiente: !!estado.turno_pendiente };
}
