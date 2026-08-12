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
import { MAX_RAG_CHARS, agentesAutomaticosActivos, armarSystem, cargarBase, cargarContexto } from './_core/contexto.ts';
import { informeChunks } from './_core/diagnostico.ts';
import { correrAgente } from './_core/llm.ts';
// El aviso de tratamiento de datos esta desactivado (ver mas abajo). El import
// se queda comentado junto al bloque para que devolverlo sea un solo cambio, y
// _core/privacidad.ts sigue intacto.
// import { debeAvisar, marcaAutorizacion, textoAviso } from './_core/privacidad.ts';
import { decidirAgente } from './_core/router.ts';
import { cargarEstado, ctxDe, estadoVacio, guardarEstado, olvidarTransitorios } from './_core/state.ts';
import { toolsDe } from './_core/tools/index.ts';
import type { Agente, CtxTool, Entrada } from './_core/protocol.ts';
import * as wa from './_core/canales/whatsapp.ts';
import * as tg from './_core/canales/telegram.ts';
import { agenteDeUrl, tokenDeAgente } from './_core/canales/bots.ts';
import { firmaMetaValida, secretoIgual } from './_core/webhook.ts';

/**
 * La presentacion, literal y en el primer mensaje de toda conversacion.
 *
 * Va aqui y no en el prompt porque es identidad de marca, no conversacion: tiene
 * que salir siempre y salir igual. Pedirsela al modelo la deja a merced de que
 * la reformule o se la salte cuando el cliente arranca directo con su problema.
 */
const SALUDO = 'Hola, soy Diana de INMOBILIARE Julio Corredor.';

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
    const diag = await procesar(entrada, env, agenteBot);
    // ?diag=1 devuelve que paso en el turno. Va detras del mismo secreto que el
    // resto del webhook, asi que no lo puede pedir cualquiera. Telegram nunca lo
    // manda, asi que el trafico real no cambia.
    if (url.searchParams.get('diag') === '1') {
      return new Response(JSON.stringify(diag, null, 2), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
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

  // /start o /reiniciar abre una prueba limpia. Es especialmente util en el
  // demo: una pausa manual o un hilo de pruebas de ayer no puede dejar al bot
  // aparentemente mudo frente al cliente.
  //
  // Antes exigia bot dedicado (`agenteBot &&`), asi que con un solo bot
  // compartido —que es como se opera— el comando no hacia nada.
  if (entrada.canal === 'telegram' && /^\/(?:start|reiniciar)(?:@\w+)?(?:\s|$)/i.test(entrada.texto)) {
    estado = estadoVacio();
    entrada.texto = 'Hola';
    marca('conversacion reiniciada por comando de Telegram');
  }

  // /chunks devuelve la radiografia del turno ANTERIOR y no consume turno: no
  // toca el historial, no llama al modelo y no reescribe el estado. Asi se puede
  // preguntar "por que contestaste eso" sin alterar la conversacion que se esta
  // diagnosticando.
  //
  // Es de Telegram y no de WhatsApp a proposito: Telegram es el banco de pruebas
  // y un cliente real no deberia toparse con un comando de diagnostico.
  if (entrada.canal === 'telegram' && /^\/chunks(?:@\w+)?(?:\s|$)/i.test(entrada.texto)) {
    const item = await encolar(db, {
      canal: entrada.canal,
      destino: entrada.destino,
      globos: [informeChunks(estado.diag)],
      agente: estado.agente_activo,
    });
    if (item) await entregarYa(db, item, env, { wa, tg }, tokenDeAgente);
    marca('/chunks respondido');
    return { comando: '/chunks' };
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

  // Los turnos ya no se aparcan (ver llm.ts): el agente siempre termina
  // hablando. Esto limpia lo que quedo aparcado antes de ese cambio, para que
  // una conversacion vieja no arrastre un turno a medias que nadie va a retomar.
  if (estado.turno_pendiente) {
    console.log('turno aparcado de la version anterior: se descarta');
    estado.turno_pendiente = null;
  }

  // Control manual desde la Bandeja: se registra el mensaje pero el bot calla.
  if (estado.pausada) {
    await guardarEstado(db, memoriaId, entrada.canal, entrada.tel, estado, { ultimo_mensaje: entrada.texto });
    console.log('IA en pausa (control manual) — no responde');
    return;
  }

  // ── 3. ROUTE antes de cargar ─────────────────────────────────────────────
  //
  // EL ROUTER DECIDE SIEMPRE. `?agente=` en la URL del webhook ya no elige quien
  // atiende: solo dice con que bot se responde (ver tokenDeAgente).
  //
  // Antes fijaba el agente, y eso resultaba imposible de operar. Con
  // ?agente=ventas, alguien que escribia "necesito una reparacion" se quedaba en
  // ventas: contestaba improvisando y al turno siguiente volvia a preguntar si
  // buscaba arrendar o comprar. Peor, ventas carga el catalogo de 100 inmuebles
  // en el contexto, el estado se pasaba del tamano que acepta Base44, la
  // escritura se rechazaba y el turno siguiente arrancaba en blanco: sin
  // memoria y sin aparecer en la Bandeja. Los tres sintomas salian de ese
  // parametro.
  //
  // Se intento acotar a "solo el primer mensaje del hilo", pero eso depende de
  // que el estado se haya guardado, que es justo lo que fallaba. Un mecanismo
  // que se cae solo cuando algo mas falla no es un mecanismo.
  //
  // Con un solo bot atendiendo todo, fijar el agente desde la URL no aporta
  // nada y cuesta esto. El ruteo por contenido ya existe y funciona.
  const decision = await decidirAgente(db, estado, entrada, {
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
  // Las claves que trae cargarContexto son FRESCAS de este turno; se mezclan
  // para que las tools las lean, pero no pueden persistirse (ver
  // olvidarTransitorios en state.ts).
  const transitorias = Object.keys(ctxAgenteCargado);
  Object.assign(scratch, ctxAgenteCargado);

  // Documento correcto + telefono registrado YA SON DOS FACTORES.
  //
  // Antes, despues de que el cliente dictara su cedula y el sistema lo
  // encontrara, el agente le pedia "los ultimos 4 digitos de tu cedula para
  // verificar tu identidad". Los ultimos 4 de la misma cedula que acababa de
  // dictar: el mismo factor preguntado dos veces, que no verifica nada y encima
  // fallaba, porque verificar_identidad busca en Arrendatario y Propietario y
  // esas tablas estan vacias.
  //
  // Una cedula en Colombia no es un secreto, por eso sola no basta. Pero el
  // telefono si es algo que la persona POSEE, y llegar por el numero registrado
  // es la segunda prueba. Pedir mas despues de eso es teatro que solo desgasta.
  //
  // Vale para mantenimiento, avaluos, pqr y matricula, que son los unicos que
  // reciben identificar_titular. Cartera queda fuera a proposito: ahi se
  // divulgan cifras, y ese camino sigue exigiendo verificar_identidad.
  if (ctxAgenteCargado.titular_nombre && !estado.identidad.verificado) {
    const ahora = new Date();
    const inm = (ctxAgenteCargado.titular_inmuebles || [])[0] || {};
    estado.identidad = {
      ...estado.identidad,
      verificado: true,
      metodo: 'documento_y_telefono',
      contrato_id: String(inm.contrato_id || '') || null,
      verificado_en: ahora.toISOString(),
      expira: new Date(ahora.getTime() + 24 * 3600_000).toISOString(),
      intentos: 0,
      bloqueado_hasta: null,
    };
    estado.compartido.nombre = String(ctxAgenteCargado.titular_nombre);
    marca('identidad verificada por documento + telefono registrado');
  }

  // ── 5. Correr el agente ──────────────────────────────────────────────────
  const tools = toolsDe(estado.agente_activo, base.prompt?.tools_habilitadas);
  const ctx: CtxTool = {
    db, estado, entrada,
    ctxAgente: scratch,
    config: base.config,
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };

  const mensajes = historialParaModelo(estado);
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

  // Ya no hay paso de "aparcar el turno".
  //
  // El turno se guardaba en estado.turno_pendiente y lo retomaba el cron
  // continuarTurno. Ese cron no existe: Base44 deshabilito las automatizaciones
  // legacy en esta app, y eran justamente las que hacian fallar TODOS los
  // despliegues, incluido el de esta funcion.
  //
  // Sin cron, aparcar era quedarse mudo para siempre. Le paso a un cliente real:
  // dio su documento, dio su nombre, y no volvio a recibir nada. Ahora correrAgente
  // garantiza que el turno siempre termina con algo que decir (ver llm.ts), asi
  // que no hay nada que aparcar.
  estado.turno_pendiente = null;

  // ── 7. Park: encolar + guardar estado + retornar ─────────────────────────
  const globos = res.globos.filter(Boolean);

  // AVISO DE TRATAMIENTO DE DATOS: DESACTIVADO por decision de la casa.
  //
  // Se anteponia al primer mensaje: "Antes de seguir: en INMOBILIARE Julio
  // Corredor tratamos tus datos conforme a nuestra politica...". La operacion
  // pidio quitarlo porque interrumpe la entrada de la conversacion.
  //
  // QUE SE PIERDE, para que quede escrito: la Ley 1581 de 2012 pide informar el
  // tratamiento y obtener autorizacion, y ese mensaje era la constancia de que
  // se informo. El Contacto con datos personales se sigue creando en
  // asegurarContacto, antes de que el modelo diga nada, asi que ahora se guardan
  // datos sin haber avisado. Tambien deja de escribirse marcaAutorizacion(), a
  // proposito: registrar una autorizacion que nunca se dio seria peor que no
  // registrar ninguna.
  //
  // COMO SE DEVUELVE: descomentar este bloque. La maquinaria sigue entera en
  // _core/privacidad.ts —debeAvisar, textoAviso, marcaAutorizacion y la version
  // de politica— y no se toco nada mas.
  //
  // if (globos.length && debeAvisar(esPrimerTurno, contacto)) {
  //   globos.unshift(textoAviso(base.config));
  //   if (contacto?.id) {
  //     db.actualizar('Contacto', contacto.id, marcaAutorizacion())
  //       .catch((e: Error) => console.error('No se pudo marcar la autorizacion:', e.message));
  //   }
  // }

  // La presentacion va SIEMPRE en el primer mensaje, y la pone el servidor.
  //
  // Podria pedirsele al prompt, pero entonces sale casi siempre y no siempre: el
  // modelo la varia, la acorta, o si el cliente arranca con "se me daño la ducha"
  // se salta el saludo y entra directo al tramite. Es lo primero que ve un
  // cliente de la marca, asi que no puede depender de que el modelo se acuerde.
  //
  // Cuando el aviso de datos estaba activo, iba justo despues de esta linea:
  // primero quien te habla, despues la letra pequena.
  if (globos.length && esPrimerTurno) {
    globos.unshift(SALUDO);
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

  olvidarTransitorios(estado, estado.agente_activo, transitorias);

  // La radiografia del turno, para /chunks. Se arma DESPUES de olvidar los
  // transitorios para que lo que se mide sea lo que de verdad se guarda.
  estado.diag = {
    ts: new Date().toISOString(),
    agente: estado.agente_activo,
    ruteo: `nivel ${decision.nivel} · ${decision.motivo}`,
    prompt_origen: base.promptOrigen,
    prompt_version: base.promptVersion,
    marca_origen: base.marcaOrigen,
    rag_chars: base.ragChars,
    rag_max: MAX_RAG_CHARS,
    rag_activos: base.ragActivos,
    // Solo titulo y tamano: el contenido ya viaja en el prompt y meterlo aqui
    // duplicaria el estado, que es justo lo que revienta la escritura.
    rag: base.ragDetalle.map((c) => ({ t: c.titulo, c: c.chars, esp: c.especifico })),
    fuera: base.ragDescartados.map((c) => ({ t: c.titulo, c: c.chars, m: c.motivo })),
    tools: Object.keys(tools),
    guardado_chars: 0,
  };
  // Se mide el estado ya con su propio diag dentro, que es lo que de verdad va a
  // pesar la escritura. El campo arranca en 0 solo para poder serializarlo.
  estado.diag.guardado_chars = JSON.stringify(estado).length;

  const [guardadoId] = await Promise.all([
    guardarEstado(db, memoriaId, entrada.canal, entrada.tel, estado, {
      ultimo_mensaje: entrada.texto,
      ultima_respuesta: globos.join(' | '),
      contacto_id: contacto?.id,
    }),
    notificarEquipo(base.config, entrada.tel, ctx.efectos.notificar),
  ]);
  marca(guardadoId ? 'guardado' : 'GUARDADO FALLIDO');

  return {
    agente: estado.agente_activo,
    memoria_id: guardadoId,
    guardado: !!guardadoId,
    estado_chars: JSON.stringify(estado).length,
    globos: globos.length,
    ctx_claves: Object.keys(estado.ctx[estado.agente_activo] || {}),
    fallos_db: db.fallos,
  };
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
