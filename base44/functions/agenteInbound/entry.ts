// agenteInbound — LA funcion conversacional. Sirve WhatsApp y Telegram.
//
// Reemplaza webhookWhatsApp + webhookTelegram, que eran dos archivos de ~1500
// lineas con 947 de diferencia entre si: un fork drifted que obligaba a
// arreglarlo todo dos veces.
//
// Ruta:  normalizar -> dedup -> cargarEstado -> ROUTE -> cargarCtx
//        -> runAgent -> park (ColaSalida + estado) -> 200
//
// Los dos cambios estructurales frente al motor viejo son rutear ANTES de
// cargar, y encolar siempre en vez de entregar inline.

import { crearDb } from './_core/db.ts';
import { encolar, entregarYa, notificarEquipo } from './_core/cola.ts';
import { agentesAutomaticosActivos, armarSystem, cargarBase, cargarContexto } from './_core/contexto.ts';
import { correrAgente } from './_core/llm.ts';
import { debeAvisar, marcaAutorizacion, textoAviso } from './_core/privacidad.ts';
import { decidirAgente } from './_core/router.ts';
import { cargarEstado, ctxDe, estadoVacio, guardarEstado } from './_core/state.ts';
import { toolsDe } from './_core/tools/index.ts';
import type { Agente, CtxTool, Entrada } from './_core/protocol.ts';
import * as wa from './_core/canales/whatsapp.ts';
import * as tg from './_core/canales/telegram.ts';
import { agenteDeUrl, tokenDeAgente } from './_core/canales/bots.ts';
import { firmaMetaValida, secretoIgual } from './_core/webhook.ts';

const MODELO_PRIMARIO = 'claude-sonnet-5';
const MODELO_FALLBACK = 'claude-haiku-4-5-20251001';
const MODELO_ROUTER   = 'claude-haiku-4-5-20251001';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handshake de verificacion de Meta.
  if (req.method === 'GET') {
    const token = url.searchParams.get('hub.verify_token');
    const esperado = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';
    if (url.searchParams.get('hub.mode') === 'subscribe' && esperado && token === esperado) {
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // La firma de Meta cubre los bytes exactos recibidos. Leer con req.json()
  // primero perderia ese cuerpo y obligaria a verificar una reserializacion.
  let rawBody: ArrayBuffer;
  try { rawBody = await req.arrayBuffer(); } catch { return new Response('Bad Request', { status: 400 }); }

  let body: any;
  try { body = JSON.parse(new TextDecoder().decode(rawBody)); } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const esWhatsApp = wa.esWhatsApp(body);
  const esTelegram = tg.esTelegram(body);

  // No aceptar payloads que no pertenezcan inequivocamente a uno de los dos
  // proveedores. Antes cualquier POST desconocido recibia 200.
  if (esWhatsApp === esTelegram) return new Response('Bad Request', { status: 400 });

  if (esWhatsApp) {
    const secret = Deno.env.get('META_APP_SECRET') || '';
    if (!secret) {
      console.error('META_APP_SECRET no configurado; webhook de Meta rechazado');
      return new Response('Service Unavailable', { status: 503 });
    }
    const firma = req.headers.get('x-hub-signature-256');
    if (!(await firmaMetaValida(rawBody, firma, secret))) {
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    if (!secret) {
      console.error('TELEGRAM_WEBHOOK_SECRET no configurado; webhook de Telegram rechazado');
      return new Response('Service Unavailable', { status: 503 });
    }
    // El header es la via correcta y la que Telegram usa por defecto. El
    // parametro `s` existe solo como respaldo para pasarelas que no reenvian
    // headers personalizados a la funcion.
    //
    // Es un respaldo con costo: un secreto en la URL queda guardado en
    // Telegram, en los logs de cualquier proxy y en los del propio backend, que
    // es peor que un header. Se acepta porque sin el no hay canal, pero si se
    // usa esta via el secreto hay que tratarlo como expuesto y rotarlo seguido.
    const enHeader = req.headers.get('x-telegram-bot-api-secret-token');
    const enUrl = url.searchParams.get('s');
    if (!secretoIgual(enHeader, secret) && !secretoIgual(enUrl, secret)) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // Bot dedicado: cada agente puede tener el suyo, y la URL del webhook dice
  // cual es (?agente=ventas). Si viene, esa conversacion pertenece a ese agente
  // y el router no decide.
  const agenteParam = url.searchParams.get('agente');
  const agenteBot = esTelegram ? agenteDeUrl(url) : null;
  // ?agente= solo pertenece a bots dedicados de Telegram. Rechazar valores
  // viejos (por ejemplo encuestas), typos y cualquier intento de fijar el
  // agente desde el webhook de WhatsApp.
  if (agenteParam !== null && (!esTelegram || !agenteBot)) {
    return new Response('Bad Request', { status: 400 });
  }

  const env = {
    base44Key:   Deno.env.get('BASE44_API_KEY') || '',
    anthropicKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    openaiKey:   Deno.env.get('OPENAI_API_KEY') || '',
    waToken:     Deno.env.get('WHATSAPP_API_TOKEN') || '',
    waPhoneId:   body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '',
    // El token depende del bot que recibio: se necesita ya para bajar media.
    tgToken:     tokenDeAgente(agenteBot),
    tgBotKey:    agenteBot || 'compartido',
  };

  // ── 1. Normalizar. El payload se olfatea; no hay dos webhooks. ────────────
  let entrada: Entrada | null = null;
  try {
    if (esWhatsApp) entrada = await wa.normalizar(body, env);
    else entrada = await tg.normalizar(body, env);
  } catch (e) {
    console.error('normalizar error:', (e as Error).message);
  }
  if (!entrada?.texto || !entrada.tel) return new Response('OK', { status: 200 });

  // Siempre 200: si Meta no lo recibe rapido, reintenta y duplica el turno.
  try {
    await procesar(entrada, env, agenteBot);
  } catch (e) {
    console.error('agenteInbound error:', (e as Error).message, (e as Error).stack);
  }
  return new Response('OK', { status: 200 });
});

async function procesar(entrada: Entrada, env: Record<string, string>, agenteBot: Agente | null = null) {
  const t0 = Date.now();
  const marca = (fase: string) => console.log(`[t+${Date.now() - t0}ms] ${fase}`);

  const db = crearDb(env.base44Key);

  // ── 2. Estado + dedup ────────────────────────────────────────────────────
  const cargada = await cargarEstado(db, entrada.canal, entrada.tel);
  const memoriaId = cargada.id;
  let estado = cargada.estado;
  marca('estado cargado');

  // En un bot dedicado, /start o /reiniciar abre una prueba limpia. Es
  // especialmente util en el demo: una pausa manual o un hilo de pruebas de
  // ayer no puede dejar al bot aparentemente mudo frente al cliente.
  if (entrada.canal === 'telegram' && agenteBot && /^\/(?:start|reiniciar)(?:@\w+)?(?:\s|$)/i.test(entrada.texto)) {
    estado = estadoVacio();
    entrada.texto = 'Hola';
    marca('conversacion reiniciada por comando de Telegram');
  }

  // El chat id de Telegram solo existe dentro del bot que recibio el mensaje.
  // Guardar ese origen evita contestar por un bot dedicado cuando el usuario
  // escribio al compartido (o viceversa).
  if (entrada.canal === 'telegram') {
    estado.compartido.telegram_bot_agente = agenteBot || '';
  }

  if (entrada.msgId && estado.msg_ids.includes(entrada.msgId)) {
    console.log(`dedup: ${entrada.msgId} ya procesado`);
    return;
  }
  if (entrada.msgId) estado.msg_ids.push(entrada.msgId);

  // Se captura ANTES de tocar el historial: despues del push de abajo ya nunca
  // esta vacio. Decide si toca dar el aviso de tratamiento de datos.
  const esPrimerTurno = estado.historial.length === 0;

  estado.historial.push({ role: 'user', content: entrada.texto, ts: new Date().toISOString() });

  // Si habia un turno aparcado y el cliente vuelve a escribir, el turno viejo
  // queda obsoleto: se descarta y se arranca con el historial actualizado. Sin
  // esto, continuarTurno respondia a un mensaje que el cliente ya reemplazo.
  if (estado.turno_pendiente) {
    console.log('turno pendiente descartado: llego mensaje nuevo del cliente');
    estado.turno_pendiente = null;
  }

  // Control manual desde la Bandeja: se registra el mensaje pero el bot calla.
  if (estado.pausada) {
    await guardarEstado(db, memoriaId, entrada.canal, entrada.tel, estado, { ultimo_mensaje: entrada.texto });
    console.log('IA en pausa (control manual) — no responde');
    return;
  }

  // ── 3. ROUTE antes de cargar ─────────────────────────────────────────────
  const decision = agenteBot
    ? { agente: agenteBot, nivel: 0, motivo: 'bot dedicado' }
    : await decidirAgente(db, estado, entrada, {
      anthropicKey: env.anthropicKey,
      modeloRouter: MODELO_ROUTER,
    });
  marca(`ruteo -> ${decision.agente} (nivel ${decision.nivel}: ${decision.motivo})`);

  if (decision.agente !== estado.agente_activo || !estado.agente_historial.length) {
    estado.agente_activo = decision.agente;
    estado.agente_historial.push({
      agente: decision.agente, desde: new Date().toISOString(), motivo: decision.motivo,
    });
  }

  // ── 4. Cargar SOLO lo que este agente necesita, en paralelo ──────────────
  const [base, ctxAgenteCargado, contacto] = await Promise.all([
    cargarBase(db, estado.agente_activo),
    cargarContexto(db, estado.agente_activo, estado, entrada),
    asegurarContacto(db, entrada, estado),
  ]);
  marca('contexto cargado');
  console.log(`RAG[${estado.agente_activo}] ${base.ragChars} chars: ${base.ragTitulos.join(' | ') || '(vacio)'}`);

  if (contacto) estado.compartido.contacto_id = contacto.id;
  if (!agentesAutomaticosActivos(base.config)) {
    await guardarEstado(db, memoriaId, entrada.canal, entrada.tel, estado, {
      ultimo_mensaje: entrada.texto,
      contacto_id: contacto?.id,
    });
    console.log('IA global inactiva por ConfigAgente.activo');
    return;
  }
  if (!base.prompt) console.error(`Sin fila AgentePrompt activa para "${estado.agente_activo}" — usando prompt minimo`);

  const scratch = ctxDe(estado, estado.agente_activo);
  Object.assign(scratch, ctxAgenteCargado);

  // ── 5. Correr el agente ──────────────────────────────────────────────────
  const tools = toolsDe(estado.agente_activo, base.prompt?.tools_habilitadas);
  const ctx: CtxTool = {
    db, estado, entrada,
    ctxAgente: scratch,
    config: base.config,
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };

  const mensajes = estado.turno_pendiente?.mensajes ?? historialParaModelo(estado);
  const res = await correrAgente({
    apiKey: env.anthropicKey,
    modelos: [String(base.prompt?.modelo || MODELO_PRIMARIO), MODELO_FALLBACK],
    system: armarSystem(base, estado.agente_activo, estado, scratch),
    mensajes,
    tools,
    ctx,
    maxTokens: Number(base.prompt?.max_tokens) || 3000,
    effort: base.prompt?.effort || 'low',
  });
  marca(`agente corrio (${res.llamadas} llamada${res.llamadas === 1 ? '' : 's'} al modelo)`);

  // ── 6. Turno pendiente: lo reanuda el cron continuarTurno ────────────────
  const continuaciones = estado.turno_pendiente?.continuaciones ?? 0;
  if (res.pendiente && continuaciones < 2) {
    estado.turno_pendiente = {
      mensajes: res.pendiente.mensajes,
      continuaciones: continuaciones + 1,
      agente: estado.agente_activo,
    };
  } else {
    if (res.pendiente) {
      // Se agotaron las continuaciones: escalar en vez de dejar al cliente colgado.
      console.error('Presupuesto de continuaciones agotado — escalando');
      estado.pausada = true;
      ctx.efectos.notificar.push(
        `El agente ${estado.agente_activo} no logro cerrar el turno tras 2 continuaciones.\n` +
        `Cliente: wa.me/${entrada.tel}\nRevisar desde la Bandeja.`,
      );
    }
    estado.turno_pendiente = null;
  }

  // ── 7. Park: encolar + guardar estado + retornar ─────────────────────────
  const globos = res.globos.filter(Boolean);

  // Aviso de tratamiento de datos (Ley 1581/2012). Va PRIMERO y lo antepone el
  // codigo, no el modelo: el Contacto con datos personales ya se creo arriba,
  // en asegurarContacto, antes de que el modelo dijera nada. Si dependiera de
  // que el modelo se acuerde, habria conversaciones con datos guardados sin
  // aviso y sin forma de saber cuales.
  if (globos.length && debeAvisar(esPrimerTurno, contacto)) {
    globos.unshift(textoAviso(base.config));
    if (contacto?.id) {
      // No se bloquea la respuesta por esto: si la escritura falla, el aviso ya
      // salio y el error queda en el log. Peor seria no responderle al cliente.
      db.actualizar('Contacto', contacto.id, marcaAutorizacion())
        .catch((e: Error) => console.error('No se pudo marcar la autorizacion:', e.message));
    }
  }

  if (globos.length) {
    estado.historial.push({
      role: 'assistant', content: globos.join(' '), globos, ts: new Date().toISOString(),
    });
    const demoraMin = Number(base.config.demora_respuesta_min) || 0;
    const item = await encolar(db, {
      canal: entrada.canal,
      // En Telegram identifica el bot que RECIBIO el chat, no el rol que
      // redacto. Vacio significa bot compartido.
      agente: entrada.canal === 'telegram'
        ? String(estado.compartido.telegram_bot_agente || '')
        : estado.agente_activo,
      destino: entrada.destino,
      globos,
      demoraMin,
      conversacionId: memoriaId || '',
    });
    // Sin demora configurada, entregar de una: esperar al cron son hasta 60s y
    // en un chat eso se lee como que el bot no responde. Si falla queda
    // pendiente y el cron reintenta.
    if (item && demoraMin === 0) {
      const entregado = await entregarYa(db, item, env, { wa, tg }, tokenDeAgente);
      marca(entregado ? 'entregado inline' : 'encolado (entrega inline fallo)');
    }
  }

  await Promise.all([
    guardarEstado(db, memoriaId, entrada.canal, entrada.tel, estado, {
      ultimo_mensaje: entrada.texto,
      ultima_respuesta: globos.join(' | '),
      contacto_id: contacto?.id,
    }),
    notificarEquipo(base.config, entrada.tel, ctx.efectos.notificar),
  ]);
  marca('guardado');
}

// El historial es COMPARTIDO: todo agente ve el hilo completo, incluidos los
// marcadores de transferencia. Es lo que hace que un handoff no pierda contexto.
function historialParaModelo(estado: { historial: Array<{ role: string; content: string }> }) {
  const msgs = estado.historial.slice(-16).map((m) => ({ role: m.role, content: String(m.content) }));
  // La API exige que el primer mensaje sea de usuario.
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs.length ? msgs : [{ role: 'user', content: '(el cliente inicio la conversacion)' }];
}

async function asegurarContacto(db: ReturnType<typeof crearDb>, entrada: Entrada, estado: { compartido: Record<string, unknown> }) {
  const tel = entrada.tel.replace(/\D/g, '');
  const existente = await db.uno('Contacto', { telefono: tel });
  if (existente) {
    await db.actualizar('Contacto', existente.id, {
      ...existente, ultima_actividad: new Date().toISOString(), en_conversacion: true,
    });
    return existente;
  }
  const ahora = new Date().toISOString();
  return await db.crear('Contacto', {
    nombre: String(estado.compartido.nombre || '') || `Contacto ${tel.slice(-4)}`,
    telefono: tel,
    canal_adquisicion: entrada.canal === 'telegram' ? 'Telegram' : 'WhatsApp',
    etapa_pipeline: 'Lead',
    fecha_primer_contacto: ahora.split('T')[0],
    ultima_actividad: ahora,
    en_conversacion: true,
  });
}
