// ARCHIVO GENERADO por scripts/empaquetar.mjs — no editar a mano.
//
// Base44 no registra funciones cuyo grafo de imports pasa de ~9 modulos.
// La fuente editable es entry.ts + _core/; esto es su aplanado (22 modulos
// -> 1) y es lo que function.jsonc declara como entry.

// ─── _core/db.ts ─────────────────────────────────────────────────
// Unica puerta a /api/entities. Ninguna otra parte de _core hace fetch a Base44.
//
// La URL del backend sale de BASE44_APP_URL. No se hardcodea: el repo venia con
// el tenant de ND en 17 archivos y bastaba olvidar uno para escribir en la app
// equivocada.type Filtro = Record<string, string | number | boolean | undefined | null>;function crearDb(apiKey: string, baseUrl?: string) {
  const base = (baseUrl || Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  if (!base) throw new Error('BASE44_APP_URL no configurada');
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };

  const qs = (f?: Filtro) => {
    if (!f) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  async function list<T = any>(entidad: string, filtro?: Filtro): Promise<T[]> {
    const r = await fetch(`${base}/api/entities/${entidad}${qs(filtro)}`, { headers: hdrs });
    if (!r.ok) {
      console.error(`db.list ${entidad} ${r.status}`, (await r.text()).slice(0, 200));
      return [];
    }
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  }

  async function uno<T = any>(entidad: string, filtro?: Filtro): Promise<T | null> {
    const arr = await list<T>(entidad, { ...filtro, limit: 1 });
    return arr[0] ?? null;
  }

  async function crear<T = any>(entidad: string, datos: Record<string, unknown>): Promise<T | null> {
    const r = await fetch(`${base}/api/entities/${entidad}`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(datos),
    });
    if (!r.ok) {
      console.error(`db.crear ${entidad} ${r.status}`, (await r.text()).slice(0, 200));
      return null;
    }
    return await r.json();
  }

  /**
   * Actualiza una fila fusionando: primero lee lo que hay y encima aplica los
   * campos nuevos.
   *
   * POR QUE LEE ANTES DE ESCRIBIR: Base44 solo expone PUT, que REEMPLAZA la
   * fila completa. Mandar unicamente los campos que cambian borra todo lo
   * demas. Eso ya estaba pasando: calificar_lead hacia PUT sobre Contacto con
   * diez campos, lo que dejaba en blanco el email, la etapa del pipeline, el
   * presupuesto, el canal de adquisicion y las notas del lead —justo el
   * historial que el CRM habia acumulado— en la escritura mas frecuente del
   * sistema.
   *
   * Se resuelve aqui y no en cada llamada porque acordarse de esparcir la fila
   * en cada sitio es una regla que alguien va a olvidar. Los call sites que ya
   * hacen `{...existente, ...cambios}` siguen funcionando igual.
   *
   * Cuesta un GET extra por actualizacion. Estas escrituras no estan en el
   * camino caliente, asi que el intercambio vale la pena.
   */
  async function actualizar<T = any>(entidad: string, id: string, datos: Record<string, unknown>): Promise<T | null> {
    let cuerpo = datos;
    try {
      const r0 = await fetch(`${base}/api/entities/${entidad}/${id}`, { headers: hdrs });
      if (r0.ok) {
        const actual = await r0.json();
        if (actual && typeof actual === 'object' && !Array.isArray(actual)) {
          cuerpo = { ...actual, ...datos };
        }
      }
    } catch (err) {
      // Si la lectura falla se escribe lo que vino. Es peor no actualizar nada
      // que actualizar de mas, y el error queda en el log.
      console.error(`db.actualizar ${entidad}/${id} no pudo leer antes de fusionar:`, (err as Error).message);
    }

    const r = await fetch(`${base}/api/entities/${entidad}/${id}`, {
      method: 'PUT', headers: hdrs, body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      console.error(`db.actualizar ${entidad}/${id} ${r.status}`, (await r.text()).slice(0, 200));
      return null;
    }
    return await r.json();
  }

  // Crea o actualiza segun venga id. Devuelve el id resultante.
  async function guardar(entidad: string, id: string | null, datos: Record<string, unknown>): Promise<string | null> {
    const res = id ? await actualizar(entidad, id, datos) : await crear(entidad, datos);
    return (res as any)?.id ?? id ?? null;
  }

  return { base, list, uno, crear, actualizar, guardar };
}type Db = ReturnType<typeof crearDb>;

// ─── _core/protocol.ts ───────────────────────────────────────────
// Contratos compartidos: tipos de estado, forma de las tools y registro de agentes.
// Los prompts NO viven aqui — viven en filas de AgentePrompt (§A.5).
// ─── Agentes ────────────────────────────────────────────────────────────────

// 'encuestas' quedo FUERA del roster a proposito. Sus tools y su prompt existen
// y funcionan, pero al agente no le llega nunca un turno y no tendria nada que
// preguntar: no hay frase de router ni boton que lo active, nada crea la
// RespuestaEncuesta pendiente que su cargador de contexto busca, y no existe la
// funcion que despache encuestas. Dejarlo en la lista solo le daba al
// clasificador LLM una etiqueta a la que podia mandar a un cliente para que se
// quedara en el aire.
//
// Para reactivarlo hacen falta cuatro cosas: (1) una funcion que despache
// encuestas y cree RespuestaEncuesta{completada:false}, (2) definir la forma de
// Encuesta.preguntas, (3) sacar `respuestas: []` del cargador en contexto.ts,
// porque el Object.assign de agenteInbound lo reescribe en cada turno y borra
// lo que el cliente ya habia contestado, y (4) una frase o boton de router.
// El codigo de tools/encuestas.ts se conserva para ese momento.const AGENTES = [
  'recepcion', 'ventas', 'consignacion', 'cartera', 'mantenimiento',
  'avaluos', 'pqr', 'matricula',
] as const;type Agente = typeof AGENTES[number];const esAgente = (v: unknown): v is Agente =>
  typeof v === 'string' && (AGENTES as readonly string[]).includes(v);

// Etiquetas que ve el clasificador LLM del router nivel 2.const ETIQUETAS_AGENTE: Record<Agente, string> = {
  recepcion:    'saludo suelto, mensaje ambiguo, o no encaja en ninguna otra categoria',
  ventas:       'busca comprar o arrendar un inmueble, pide fotos, precios, visitas',
  consignacion: 'ES DUENO de un inmueble y quiere venderlo, arrendarlo o ponerlo en administracion',
  cartera:      'pagos, canon, saldo, estado de cuenta, mora, recibo, codigo de barras, certificado',
  mantenimiento:'algo se dano en el inmueble que habita: fugas, danos, reparaciones, emergencias',
  avaluos:      'quiere un avaluo comercial de un inmueble, o pregunta cuanto vale',
  pqr:          'peticion, queja, reclamo, sugerencia o felicitacion sobre el servicio',
  matricula:    'esta tramitando un contrato de arriendo nuevo: papeleria, estudio, codeudor, F117',
};

// ─── Estado v2 (MemoriaChat.estado_json) ────────────────────────────────────interface Identidad {
  verificado: boolean;
  metodo: string | null;
  arrendatario_id: string | null;
  contrato_id: string | null;
  propietario_id: string | null;
  verificado_en: string | null;
  expira: string | null;
  intentos: number;
  bloqueado_hasta: string | null;
}interface TurnoMsg { role: 'user' | 'assistant'; content: string; globos?: string[]; ts?: string }interface SaltoAgente { agente: Agente; desde: string; motivo: string }interface TurnoPendiente {
  mensajes: unknown[];      // historial de la conversacion con el modelo, tal cual
  continuaciones: number;
  agente: Agente;
}interface Estado {
  v: 2;
  agente_activo: Agente;
  agente_historial: SaltoAgente[];
  identidad: Identidad;
  compartido: Record<string, unknown>;
  historial: TurnoMsg[];
  ctx: Record<string, Record<string, unknown>>;
  turno_pendiente: TurnoPendiente | null;
  msg_ids: string[];
  pausada: boolean;
}

// ─── Entrada normalizada (ambos canales) ────────────────────────────────────type Canal = 'whatsapp' | 'telegram';interface Entrada {
  canal: Canal;
  tel: string;              // clave universal de la conversacion
  texto: string;
  msgId: string;
  botonId: string;          // id del boton interactivo de WhatsApp, si vino por ahi
  adReferral: { adId: string; adTitulo: string; adCuerpo: string };
  destino: string;          // a donde se responde (numero WA con indicativo, o chat id TG)
}

// ─── Tools ──────────────────────────────────────────────────────────────────interface EsquemaTool {
  name: string;
  description: string;
  strict: true;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

// `retorna: true` => el modelo necesita el resultado para hablar, cuesta una
// segunda llamada. `terminal: true` => corta el turno (solo `responder`).
// `cierra: true` => deja al cliente con un siguiente paso concreto: una cita,
// un radicado, una alerta de busqueda. Es lo que permite exigir que ninguna
// conversacion termine en callejon sin salida.interface Tool {
  def: EsquemaTool;
  ejecutar: (input: any, c: CtxTool) => Promise<unknown> | unknown;
  retorna?: boolean;
  terminal?: boolean;
  cierra?: boolean;
}interface CtxTool {
  db: Db;
  estado: Estado;
  entrada: Entrada;
  ctxAgente: Record<string, any>;   // lo que cargo contexto.ts para ESTE agente
  config: Record<string, any>;      // fila operativa de ConfigAgente
  salida: { globos: string[]; finTurno: boolean };
  // Lo marca el bucle de llm.ts cuando corre una tool con `cierra: true`.
  // `responder` lo consulta para no dejar la conversacion en el aire.
  hubo_cierre?: boolean;
  efectos: {
    transferir: Agente | null;
    escalado: { motivo: string; prioridad: string } | null;
    notificar: string[];
  };
}

// Azucar para declarar tools sin repetir strict/additionalProperties.function definirTool(
  name: string,
  description: string,
  props: Record<string, unknown>,
  opts: { retorna?: boolean; terminal?: boolean; cierra?: boolean } = {},
): Omit<Tool, 'ejecutar'> & { def: EsquemaTool } {
  return {
    def: {
      name,
      description,
      strict: true,
      input_schema: {
        type: 'object',
        properties: props,
        // strict exige que `required` cubra todas las propiedades; los campos
        // opcionales se modelan como nullable, no omitiendolos de required.
        required: Object.keys(props),
        additionalProperties: false,
      },
    },
    ...opts,
  };
}const str = (description: string) => ({ type: 'string', description });const strOpc = (description: string) => ({ type: ['string', 'null'], description });const num = (description: string) => ({ type: 'number', description });const numOpc = (description: string) => ({ type: ['number', 'null'], description });const bool = (description: string) => ({ type: 'boolean', description });const enumStr = (description: string, valores: string[]) => ({ type: 'string', description, enum: valores });const lista = (description: string, items: unknown = { type: 'string' }) => ({ type: 'array', description, items });

// ─── _core/cola.ts ───────────────────────────────────────────────
// Encolado de salida. El webhook intenta entrega inline solo cuando la demora
// es cero; si falla, el worker procesa la fila pendiente.
//
// Antes la funcion dormia hasta 5s dentro del request para simular tipeo, con
// un presupuesto total de 15s. Ahora escribe en ColaSalida y retorna; la
// simulacion la hace enviarPendientes. `demora_respuesta_min = 0` pasa a
// significar "encolar con delay 0", no "enviar inline".
/**
 * Entrega un item de la cola YA, sin esperar al cron.
 *
 * El cron corre cada minuto, asi que sin esto una respuesta podia tardar hasta
 * 60s en salir: en un chat eso se lee como que el bot no funciona. Aqui se
 * intenta la entrega inmediata y, si falla, el item queda pendiente y el cron
 * la reintenta. La simulacion de tipeo sigue viviendo en el cron, no aqui: este
 * camino corre dentro del webhook, que tiene presupuesto.
 */async function entregarYa(
  db: Db,
  item: any,
  env: { waToken?: string; waPhoneId?: string },
  canales: { wa: any; tg: any },
  tokenTelegram: (agente?: string | null) => string,
) {
  if (!item?.id) return false;
  const globos: string[] = Array.isArray(item.globos) ? item.globos : [];
  if (!globos.length) return false;

  try {
    let ok = true;
    if (item.canal === 'telegram') {
      const tgEnv = { tgToken: tokenTelegram(item.agente) };
      if (!tgEnv.tgToken) return false;
      for (const g of globos) if (!(await canales.tg.enviar(item.destino, g, tgEnv))) ok = false;
    } else if (item.canal === 'whatsapp' && env.waPhoneId && env.waToken) {
      for (const g of globos) if (!(await canales.wa.enviar(item.destino, g, env))) ok = false;
    } else {
      return false;
    }
    if (!ok) return false;
    await db.actualizar('ColaSalida', item.id, {
      ...item, estado: 'enviado', enviado_en: new Date().toISOString(), intentos: (item.intentos || 0) + 1,
    });
    return true;
  } catch (e) {
    console.error('entregarYa error:', (e as Error).message);
    return false;
  }
}async function encolar(
  db: Db,
  datos: { canal: Canal; destino: string; globos: string[]; demoraMin?: number; conversacionId?: string; agente?: string },
) {
  const globos = datos.globos.map((g) => String(g).trim()).filter(Boolean);
  if (!globos.length) return null;
  return await db.crear('ColaSalida', {
    canal: datos.canal,
    destino: datos.destino,
    agente: datos.agente || '',
    globos,
    enviar_en: new Date(Date.now() + (datos.demoraMin || 0) * 60_000).toISOString(),
    estado: 'pendiente',
    intentos: 0,
    conversacion_id: datos.conversacionId || '',
    error: '',
  });
}

// Notificaciones internas al equipo. NUNCA al chat del cliente: el destino sale
// de configuracion, y se compara contra el remitente antes de enviar.async function notificarEquipo(config: Record<string, any>, telCliente: string, mensajes: string[]) {
  if (!mensajes.length) return;
  const texto = mensajes.join('\n\n———\n\n');
  const chat = String(config.telegram_notif_chat || '').trim();
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

  if (chat && tgToken && chat !== String(telCliente)) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(chat), text: texto.slice(0, 4000) }),
      });
      if (r.ok) return;
      console.error('Notif Telegram error:', r.status);
    } catch (e) { console.error('Notif Telegram error:', (e as Error).message); }
  }

  const numero = String(config.numero_notificaciones || '').replace(/\D/g, '');
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const waToken = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  if (!numero || !waPhoneId || !waToken) { console.log('Sin destino de notificacion — omitida'); return; }
  if (numero === String(telCliente).replace(/\D/g, '')) { console.error('SEGURIDAD: destino de notificacion = cliente, abortando'); return; }

  try {
    await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero.startsWith('57') ? numero : '57' + numero,
        type: 'text', text: { body: texto.slice(0, 4000) },
      }),
    });
  } catch (e) { console.error('Notif WA error:', (e as Error).message); }
}

// ─── _core/prompts.ts ────────────────────────────────────────────
// Prompts por defecto, en codigo.
//
// La fuente de verdad sigue siendo la entidad AgentePrompt: lo que se edite
// desde el admin PISA lo de aqui. Pero con la tabla vacia el agente respondia
// con un generico de una linea, o sea que el sistema no funcionaba hasta correr
// un seed. Esto lo vuelve util desde el primer mensaje.
//
// Regla: aqui va lo minimo para que un agente se comporte. Todo lo que sea
// conocimiento del negocio (politicas, tarifas, zonas) va en ConocimientoRAG,
// que se edita sin desplegar.

/** Comun a los ocho agentes. Se antepone al prompt de cada agente. */const IDENTIDAD_MARCA = `Trabajas para INMOBILIARE Julio Corredor (J.C.O Inversiones S.A.S), inmobiliaria de Bogota desde 1960.
Manejamos venta, arriendo, administracion de inmuebles, recaudo de canones, avaluos,
reparaciones, seguro de arrendamiento y relocation corporativo.
Calle 81 # 8 - 95, Bogota. Telefono 485 3000. www.inmobiliarelatam.com

IDENTIDAD PUBLICA
- Para el cliente siempre eres "Asistente Inmobiliare".
- Recepcion, ventas, consignacion, cartera, mantenimiento, avaluos, PQR y matricula
  son especialistas internos. Nunca anuncies el cambio de especialista.
- Nunca te presentes con un nombre humano ni adoptes el nombre de un asesor del equipo.

COMO HABLAS
- Colombiano de Bogota, tuteo con "tu". Jamas voseo: nada de "vos", "tenes", "queres".
- Calido y directo, como alguien con oficio. Nunca infantil, nunca efusivo.
- La calidez viene de la atencion y el conocimiento, no de las exclamaciones.
- SIN EMOJIS. SIN GUIONES LARGOS: usa punto o coma.
- Maximo dos frases por globo. Si hay mucho que decir, di lo esencial y ofrece ampliar.
- Varia el largo: a veces tres palabras, a veces dos frases. Nunca igual dos veces seguidas.

NO SUENES A BOT
- JAMAS repitas lo que dijo el cliente para validarlo. "Chico, excelente zona" es el
  tic numero 1 que delata a una IA. Di "Listo", "Claro que si", "Entiendo", o arranca directo.
- UNA sola pregunta por mensaje. Jamas dos seguidas.
- Nada de formulas de carta: "quedo atento", "no dudes en", "es importante destacar",
  "con mucho gusto te ayudare con tu solicitud", "excelente eleccion".
- Si te equivocas, corrige casual: "Tienes razon, me cruce de cables".

LA REGLA QUE MANDA SOBRE TODAS
Solo puedes afirmar datos que vengan del contexto, del conocimiento aprobado o del
resultado de una herramienta. Inventar una cifra, una fecha, una direccion, un plazo o
un dato de la empresa es la falta mas grave. Si no lo tienes, di que debes confirmarlo.

REGLAS DE NEGOCIO PENDIENTES
Si el conocimiento aprobado no contiene una politica, tarifa, porcentaje, documento o
umbral, esa regla sigue pendiente. No la completes con practicas habituales del sector:
explica que el area debe confirmarla y escala cuando haga falta una decision.

LO QUE NUNCA HACES
- Prometer fechas, montos, descuentos, condonaciones o resultados que no esten en el contexto.
- Dar datos de un contrato, un pago o un documento sin verificar identidad primero.
- Discutir. Si el cliente se molesta o insiste, escala con escalar_a_humano.
- Pedir contrasenas, datos de tarjeta o el numero completo de la cedula, salvo que el rol
  de matricula necesite el documento para iniciar_matricula.
- Decir que eres una IA o un bot. Tampoco afirmes ser humano: si te lo preguntan directo,
  explica que eres Asistente Inmobiliare y vuelve a como puedes ayudar.`;

/**
 * Prompt por agente. Corto a proposito: el motor viejo tenia 350 lineas de
 * persona y se contradecia solo. Lo que cada agente necesita saber es su rol,
 * que datos tiene que conseguir y cuando termina.
 */const PROMPTS = {
  recepcion: `ROL INTERNO: recepcion. Entiendes que necesita la persona y la llevas al especialista correcto.

TU UNICO TRABAJO es identificar el motivo y usar transferir_a. No resuelves el tema,
por mas que sepas la respuesta. El cambio es invisible: no lo anuncies.

A DONDE TRANSFERIR
- Busca arrendar o comprar un inmueble, pregunta por una propiedad -> ventas
- Quiere poner SU inmueble en arriendo, venta o administracion -> consignacion
- Pagos, saldo, estado de cuenta, recibo, mora, codigo de barras -> cartera
- Algo se dano, se rompio, no funciona, filtracion, emergencia -> mantenimiento
- Cuanto vale un inmueble, necesita un avaluo o peritaje -> avaluos
- Queja, reclamo, peticion o inconformidad -> pqr
- Papeleo para firmar arriendo, documentos, codeudor o estudio -> matricula

Saluda como Asistente Inmobiliare y pregunta en que puedes ayudar. Si el primer mensaje
ya trae un motivo claro, transfiere sin preguntar. Si es ambiguo, haz UNA pregunta. Si
tras dos intentos sigue sin quedar claro, usa enviar_menu una sola vez; si aun no avanza,
escala con escalar_a_humano.

No pidas datos personales, no prometas nada y no des precios.`,

  ventas: `ROL INTERNO: ventas. Atiendes a quien busca arrendar o comprar.

QUE TIENES QUE CONSEGUIR, conversando y sin apurar:
1. nombre
2. operacion: arriendo o compra
3. zona o barrio de interes
4. presupuesto

Cada vez que el cliente diga su nombre o un criterio nuevo, llama a guardar_dato antes
de responder. En especial, el nombre debe quedar guardado para no volver a pedirlo.

Cuando tengas nombre, operacion, zona y una senal real de presupuesto, llama a
calificar_lead. Si tras dos intentos no da presupuesto, califica igual y deja en las
notas que esta pendiente. El sistema hace el handoff: no escribas ese mensaje.

PRESUPUESTO
El precio de un inmueble NO es el presupuesto del cliente. Solo guardas lo que diga que
puede o quiere gastar. En Colombia una cifra abreviada puede ser ambigua; confirma su
valor en pesos segun compra o arriendo, nunca asumas la cifra mas baja.

BUSCAR INMUEBLES
Usa buscar_inmuebles antes de mencionar cualquier propiedad. Solo usa datos exactos de
la herramienta. Si un dato viene vacio, no lo inventes. Cuando presentes una ficha, usa
enviar_ficha en el mismo turno y continua la conversacion despues del enlace.

No pidas datos accesorios antes de calificar.

Si no hay opciones, dilo sin rodeos y ofrecele registrar el interes para avisarle cuando
entre algo. Si acepta, llama a registrar_interes: prometerselo en el mensaje no guarda nada.

NUNCA cierres la conversacion en el aire. Antes de despedirte deja algo concreto: una visita
agendada, una ficha enviada, el interes registrado o el lead entregado a un asesor. Si de
verdad no puedes hacer nada, escala en vez de despedirte. Si el cliente se despide, responde
una sola vez y cierra, pero solo si ya quedo algo de eso hecho.`,

  consignacion: `ROL INTERNO: consignacion. Atiendes a propietarios que quieren poner su inmueble con nosotros.

QUE TIENES QUE CONSEGUIR
1. nombre del propietario
2. direccion y barrio del inmueble
3. tipo de inmueble
4. gestion: arriendo, venta, administracion o venta y arriendo
5. valor o canon esperado, si lo tiene

Con los datos minimos de registrar_consignacion, llama a la herramienta. Luego puedes
ofrecer agendar_avaluo_previo para definir el precio de salida.

La comision de administracion y los demas porcentajes siguen pendientes mientras no
aparezcan en el conocimiento aprobado. No los inventes ni los negocies: escala si el
propietario necesita una cifra. Tampoco fijes el precio de salida ni prometas tiempos de
venta o arriendo.`,

  cartera: `ROL INTERNO: cartera. Atiendes pagos, saldos y estados de cuenta de forma breve y factual.

ORDEN OBLIGATORIO
1. Antes de dar CUALQUIER cifra o dato contractual, pide los ultimos 4 digitos de la
   cedula y llama a verificar_identidad.
2. Solo si queda verificado, usa consultar_estado_cuenta.
3. Da las cifras y fechas completas, exactas y sin bromas.

POR CHAT Y POR PORTAL
- Saldo, proximo vencimiento y si esta al dia: por chat, despues de verificar.
- Estado detallado, historial o documento: usa enviar_link_portal.
- Recibo del mes para banco: usa enviar_codigo_barras.

La politica de mora, acuerdos y condonaciones sigue pendiente mientras no aparezca en el
conocimiento aprobado. Nunca negocies plazos, intereses, descuentos ni fechas de corte.
Escala montos disputados, solicitudes de acuerdo y verificaciones fallidas. No digas que
un pago entro si no aparece en consultar_estado_cuenta.`,

  mantenimiento: `ROL INTERNO: mantenimiento. Recibes reportes de danos en inmuebles arrendados.

VERIFICACION OBLIGATORIA
registrar_reparacion y consultar_estado_reparacion exigen identidad verificada. Pide los
ultimos 4 digitos de la cedula y llama a verificar_identidad antes de usar cualquiera de
esas herramientas. Nunca afirmes que quedo radicada si la herramienta no lo confirmo.

EMERGENCIA
Gas, fuego, inundacion activa, riesgo electrico o alguien en peligro. Primero da una
instruccion de seguridad breve y prudente. Verifica, registra con urgencia Emergencia y
escala de inmediato. Si no logra verificarse, escala sin radicar y explica que el equipo
continuara la validacion; no inventes un radicado.

Los SLA de reparaciones aun no estan aprobados. Aunque sea una emergencia, no prometas
horas ni fecha de visita: radica y escala de inmediato.

FLUJO NORMAL
1. Verifica identidad.
2. Averigua que se dano, desde cuando y en que parte del inmueble. Una pregunta por mensaje.
3. Llama a registrar_reparacion y da el radicado confirmado.
4. Si recibe una foto despues de radicar, usa adjuntar_evidencia.

La politica de quien paga y el monto desde el que se consulta al propietario siguen
pendientes mientras no aparezcan en el conocimiento aprobado. No asignes responsabilidad,
no estimes costos, no sugieras arreglar por cuenta propia y no prometas fecha de visita.`,

  avaluos: `ROL INTERNO: avaluos. Atiendes solicitudes de avaluo comercial.

QUE TIENES QUE CONSEGUIR
1. nombre del solicitante
2. direccion y tipo de inmueble
3. area aproximada en m2, si la conoce
4. proposito: venta, arriendo, credito, sucesion u otro

Con los datos requeridos, llama a registrar_solicitud_avaluo y da el radicado.

QUIEN FIRMA UN AVALUO (Ley 1673 de 2013)
Un avaluo con validez legal solo lo puede firmar un avaluador inscrito en el RAA (Registro
Abierto de Avaluadores). Ni tu ni un asesor pueden emitirlo. Si el cliente lo necesita para
un credito, una sucesion, un tramite tributario o un proceso judicial, dile eso: se le
asigna un perito inscrito.

Por eso NUNCA dices cuanto vale un inmueble, ni siquiera "un aproximado" o "un rango entre".
Una cifra tuya no es un avaluo y ademas puede leerse como uno. Si insiste, explicale la
diferencia entre una opinion comercial y un avaluo firmado, y ofrece radicar la solicitud.

TARIFA PENDIENTE
El tarifario real aun no esta confirmado. Hasta que el conocimiento aprobado indique que
la tarifa esta vigente, NO llames a cotizar_avaluo ni des una cifra del servicio: escala
para cotizacion. Nunca uses una formula o precio recordado. Bodegas, lotes, fincas y otros
inmuebles no estandar siempre requieren cotizacion humana. No prometas fecha de entrega.`,

  pqr: `ROL INTERNO: PQR. Radicas peticiones, quejas, reclamos, sugerencias y felicitaciones.

FLUJO
1. Deja que la persona cuente lo que paso sin interrumpirla con un formulario.
2. Pide solo lo minimo que falte: nombre, tipo, asunto y descripcion completa.
3. Llama a registrar_pqr. Da exactamente el radicado y la orientacion que devuelva.

Reconoce la inconformidad sin dar ni quitar la razon. No justifiques a la empresa, no te
disculpes en su nombre y no prometas una solucion ni una compensacion.

El termino legal de respuesta SI se comunica: registrar_pqr te devuelve cuantos dias
habiles son y esa cifra se le dice al cliente. Lo que no se da es la fecha exacta ni la
promesa de resolver antes: el termino es el maximo de ley, no un compromiso de entrega.

Si menciona tutela, demanda, abogado, Superintendencia, fiscalia o juzgado, radica sin
opinar y escala de inmediato con prioridad urgente. Para una consulta posterior, usa
consultar_estado_pqr y solo comunica el estado que devuelva.`,

  matricula: `ROL INTERNO: matricula. Acompanas la captura de datos para un contrato de arriendo nuevo.

FLUJO
1. Reune nombre completo, numero de documento, correo y direccion del inmueble.
2. Llama a iniciar_matricula y da el numero de solicitud.
3. Pregunta si hay codeudores o coarrendatarios. Agrega cada persona por separado con
   agregar_participante cuando tengas nombre, documento, telefono y rol.
4. Cuando confirme que no falta nadie, llama a finalizar_matricula.
5. El canal seguro para documentos aun no esta implementado. No llames a enviar_link_portal;
   escala para que el equipo indique el canal aprobado.

Los documentos exactos del F117 siguen pendientes mientras no aparezcan en el conocimiento
aprobado. No enumeres requisitos de memoria ni confirmes que una lista esta completa; el
area de estudio debe validarla. Nunca recibas fotos o archivos por chat.

No prometas aprobacion, perfil requerido, tiempo del estudio ni reserva del inmueble.`,
};

// ─── _core/habiles.ts ────────────────────────────────────────────
// Dias habiles en Colombia: festivos y suma de plazos.
//
// POR QUE NO ALCANZA CON "SALTAR SABADOS Y DOMINGOS": Colombia tiene 18
// festivos al ano y la mayoria NO cae en fecha fija. La Ley 51 de 1983
// ("Ley Emiliani") corre varios al lunes siguiente, y cinco dependen de la
// Pascua, que se calcula con el algoritmo de Butcher. Un plazo legal contado
// mal por dos dias es un plazo incumplido.
//
// Se usa para el termino de respuesta de PQR (Ley 1755/2015), que corre en
// dias habiles desde la radicacion.

/** Domingo de Pascua del año dado (algoritmo de Butcher, calendario gregoriano). */
function pascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

const dia = 86_400_000;
const sumar = (f: Date, n: number) => new Date(f.getTime() + n * dia);
const clave = (f: Date) => f.toISOString().slice(0, 10);

/** Corre la fecha al lunes siguiente si no es lunes (Ley Emiliani). */
function alLunes(f: Date): Date {
  const d = f.getUTCDay(); // 0 domingo … 6 sabado
  return d === 1 ? f : sumar(f, (8 - d) % 7);
}

/** Festivos nacionales de Colombia para un año, como 'YYYY-MM-DD'. */function festivosColombia(anio: number): Set<string> {
  const p = pascua(anio);
  const fechas: Date[] = [
    // Fijos: no se mueven.
    new Date(Date.UTC(anio, 0, 1)),   // Año nuevo
    new Date(Date.UTC(anio, 4, 1)),   // Día del trabajo
    new Date(Date.UTC(anio, 6, 20)),  // Independencia
    new Date(Date.UTC(anio, 7, 7)),   // Batalla de Boyacá
    new Date(Date.UTC(anio, 11, 8)),  // Inmaculada Concepción
    new Date(Date.UTC(anio, 11, 25)), // Navidad

    // Movibles al lunes (Ley Emiliani).
    alLunes(new Date(Date.UTC(anio, 0, 6))),   // Reyes Magos
    alLunes(new Date(Date.UTC(anio, 2, 19))),  // San José
    alLunes(new Date(Date.UTC(anio, 5, 29))),  // San Pedro y San Pablo
    alLunes(new Date(Date.UTC(anio, 7, 15))),  // Asunción
    alLunes(new Date(Date.UTC(anio, 9, 12))),  // Día de la Raza
    alLunes(new Date(Date.UTC(anio, 10, 1))),  // Todos los Santos
    alLunes(new Date(Date.UTC(anio, 10, 11))), // Independencia de Cartagena

    // Ligados a la Pascua. Jueves y Viernes Santo NO se mueven; los otros sí.
    sumar(p, -3),           // Jueves Santo
    sumar(p, -2),           // Viernes Santo
    alLunes(sumar(p, 43)),  // Ascensión
    alLunes(sumar(p, 64)),  // Corpus Christi
    alLunes(sumar(p, 71)),  // Sagrado Corazón
  ];
  return new Set(fechas.map(clave));
}

// Los festivos se recalculan una vez por año y se recuerdan: sumar un plazo
// puede cruzar hasta tres años y no vale la pena repetir el cálculo.
const cache = new Map<number, Set<string>>();
function festivos(anio: number): Set<string> {
  let s = cache.get(anio);
  if (!s) { s = festivosColombia(anio); cache.set(anio, s); }
  return s;
}

/** ¿Es día hábil? Ni sábado, ni domingo, ni festivo nacional. */function esHabil(f: Date): boolean {
  const d = f.getUTCDay();
  if (d === 0 || d === 6) return false;
  return !festivos(f.getUTCFullYear()).has(clave(f));
}

/**
 * Suma días hábiles a una fecha.
 *
 * El día de radicación NO cuenta: el término empieza a correr el hábil
 * siguiente. Devuelve el final del día (23:59:59 UTC) para que un vencimiento
 * "a los 15 días" incluya ese día completo.
 */function sumarHabiles(desde: Date, dias: number): Date {
  let f = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    f = sumar(f, 1);
    if (esHabil(f)) restantes--;
  }
  return new Date(f.getTime() + dia - 1000);
}

/** Días hábiles entre dos fechas (negativo si ya venció). */function habilesHasta(desde: Date, hasta: Date): number {
  const ini = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()));
  const signo = fin >= ini ? 1 : -1;
  let [a, b] = signo > 0 ? [ini, fin] : [fin, ini];
  let n = 0;
  while (a < b) { a = sumar(a, 1); if (esHabil(a)) n++; }
  return n * signo;
}

// ─── _core/horario.ts ────────────────────────────────────────────
// Horario del equipo comercial y que hacer fuera de el.
//
// LA REGLA QUE MANDA: fuera de horario el agente NO difiere, REEMPLAZA al
// comercial. Agenda el mismo la cita y deja el lead listo. "Manana te contacta
// un asesor" es el ultimo recurso, no la salida por defecto: un lead que llega
// a las 9 de la noche y solo recibe "manana te llamamos" es un lead que para
// manana ya escribio a otra inmobiliaria.
/** Bogota es UTC-5 todo el año: Colombia no tiene horario de verano. */
const OFFSET_BOGOTA_H = -5;interface Horario {
  dias: number[];   // 1 = lunes … 7 = domingo (ISO)
  desde: number;    // hora local de inicio
  hasta: number;    // hora local de fin
}

/** Lunes a viernes, 9 a 5. Confirmado por el cliente. */const HORARIO_DEFECTO: Horario = { dias: [1, 2, 3, 4, 5], desde: 9, hasta: 17 };function horarioDe(config: Record<string, any>): Horario {
  const h = config?.horario_equipo;
  if (!h) return HORARIO_DEFECTO;
  try {
    const p = typeof h === 'string' ? JSON.parse(h) : h;
    return {
      dias: Array.isArray(p.dias) && p.dias.length ? p.dias.map(Number) : HORARIO_DEFECTO.dias,
      desde: Number.isFinite(Number(p.desde)) ? Number(p.desde) : HORARIO_DEFECTO.desde,
      hasta: Number.isFinite(Number(p.hasta)) ? Number(p.hasta) : HORARIO_DEFECTO.hasta,
    };
  } catch {
    return HORARIO_DEFECTO;
  }
}

/** Fecha/hora en Bogota, como componentes. */
function enBogota(f: Date) {
  const b = new Date(f.getTime() + OFFSET_BOGOTA_H * 3_600_000);
  const diaISO = b.getUTCDay() === 0 ? 7 : b.getUTCDay(); // 1 lun … 7 dom
  return { hora: b.getUTCHours(), diaISO, fecha: b };
}

/**
 * ¿Hay alguien del equipo disponible ahora?
 *
 * Un festivo cuenta como fuera de horario: el equipo no esta, aunque caiga
 * entre semana. Es el mismo calendario que usan los plazos de PQR.
 */function hayEquipo(ahora: Date, config: Record<string, any> = {}): boolean {
  const h = horarioDe(config);
  const { hora, diaISO, fecha } = enBogota(ahora);
  if (!h.dias.includes(diaISO)) return false;
  if (!esHabil(fecha)) return false;
  return hora >= h.desde && hora < h.hasta;
}

/**
 * Instruccion que se le inyecta al agente segun el momento.
 *
 * Fuera de horario NO cambia lo que el agente puede hacer —las herramientas son
 * las mismas— cambia a que se compromete. Dentro de horario puede decir "un
 * asesor te contacta ya"; fuera, tiene que resolver el solo hasta donde llegue.
 */function instruccionHorario(ahora: Date, config: Record<string, any> = {}): string {
  if (hayEquipo(ahora, config)) {
    return 'El equipo comercial esta disponible en este momento: si entregas el lead o '
      + 'escalas, un asesor lo toma hoy mismo.';
  }
  const h = horarioDe(config);
  return 'FUERA DE HORARIO. El equipo atiende de lunes a viernes, '
    + `de ${h.desde}:00 a ${h.hasta}:00. Eso NO significa que despaches al cliente: `
    + 'resuelve todo lo que puedas tu mismo y deja el siguiente paso agendado. '
    + 'Agenda la visita o la llamada con la herramienta que corresponda, registra lo que '
    + 'haya que registrar, y solo si de verdad no puedes avanzar dile que un asesor lo '
    + 'contacta el siguiente dia habil. Nunca uses eso como primera salida.';
}

// ─── _core/contexto.ts ───────────────────────────────────────────
// Cargadores de contexto por agente.
//
// El motor viejo cargaba el catalogo completo de 100 propiedades y todos los
// chunks RAG aunque el mensaje fuera "quiero pagar mi arriendo". Aqui cada
// agente pide solo lo suyo, y todo lo independiente va en paralelo.const MAX_RAG_CHARS = 6000;

type ChunkRag = Record<string, any>;

function destinosDe(ch: ChunkRag): string[] {
  return String(ch.agentes || '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Seleccion determinista y fail-closed del conocimiento que recibe un agente.
 *
 * Los chunks especificos entran antes que los comunes. Un chunk sin `agentes`
 * no se inyecta: el tenant anterior dejo conocimiento contaminado sin ese campo
 * y tratarlo como `todos` fue precisamente lo que mezclo las dos marcas.
 */function seleccionarRag(
  chunks: ChunkRag[],
  agente: Agente,
  maxChars = MAX_RAG_CHARS,
): { texto: string; titulos: string[]; chars: number } {
  const relevantes = (chunks || [])
    .map((ch) => ({ ch, destinos: destinosDe(ch) }))
    .filter(({ destinos }) => destinos.includes('todos') || destinos.includes(agente))
    .sort((a, b) => {
      const especificoA = a.destinos.includes(agente) && !a.destinos.includes('todos') ? 1 : 0;
      const especificoB = b.destinos.includes(agente) && !b.destinos.includes('todos') ? 1 : 0;
      return especificoB - especificoA
        || (Number(b.ch.prioridad) || 5) - (Number(a.ch.prioridad) || 5)
        || String(a.ch.titulo || '').localeCompare(String(b.ch.titulo || ''), 'es');
    });

  let usado = 0;
  const trozos: string[] = [];
  const titulos: string[] = [];
  for (const { ch } of relevantes) {
    const titulo = String(ch.titulo || '').trim();
    const contenido = String(ch.contenido || '').trim();
    if (!titulo || !contenido) continue;
    const bloque = `[${titulo}]\n${contenido}\n\n`;
    // No cortar toda la seleccion porque un bloque no quepa: puede haber otro
    // mas pequeno y relevante despues.
    if (usado + bloque.length > maxChars) continue;
    trozos.push(bloque);
    titulos.push(titulo);
    usado += bloque.length;
  }
  return { texto: trozos.join(''), titulos, chars: usado };
}

/** ConfigAgente.activo funciona como kill switch global. */function agentesAutomaticosActivos(config: Record<string, any> | null | undefined): boolean {
  return config?.activo !== false;
}interface Base {
  config: Record<string, any>;
  prompt: Record<string, any> | null;
  identidadMarca: string;
  rag: string;
  ragTitulos: string[];
  ragChars: number;
}

function promptActivoMasReciente(filas: Record<string, any>[]): Record<string, any> | null {
  return [...(filas || [])]
    .filter((fila) => fila.activo !== false)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;
}

// Lo que necesita CUALQUIER agente: la config operativa, su fila de prompt y
// los chunks de conocimiento que le corresponden.async function cargarBase(db: Db, agente: Agente): Promise<Base> {
  const [config, prompts, marcas, chunks] = await Promise.all([
    db.uno('ConfigAgente', { clave: 'general' }),
    db.list('AgentePrompt', { agente, limit: 100 }),
    db.list('AgentePrompt', { agente: 'identidad_marca', limit: 100 }),
    db.list('ConocimientoRAG', { activo: true, limit: 200 }),
  ]);

  const seleccion = seleccionarRag(chunks || [], agente);
  const prompt = promptActivoMasReciente(prompts || []);
  const marca = promptActivoMasReciente(marcas || []);

  return {
    config: config || {},
    prompt,
    identidadMarca: String(marca?.prompt || ''),
    rag: seleccion.texto ? `=== CONOCIMIENTO DE LA CASA ===\n${seleccion.texto}` : '',
    ragTitulos: seleccion.titulos,
    ragChars: seleccion.chars,
  };
}

type Cargador = (db: Db, estado: Estado, entrada: Entrada) => Promise<Record<string, any>>;

const CARGADORES: Record<Agente, Cargador> = {
  recepcion: async () => ({}),

  ventas: async (db, estado) => {
    const [catalogo, campanas] = await Promise.all([
      db.list('Propiedad', { estado: 'Disponible', limit: 100 }),
      estado.compartido.campana_id
        ? db.list('CampanaAds', { id: String(estado.compartido.campana_id), limit: 1 })
        : Promise.resolve([]),
    ]);
    const arr = catalogo.filter((p: any) => String(p.operacion || '').includes('Arriendo')).length;
    const ven = catalogo.filter((p: any) => String(p.operacion || '').includes('Venta')).length;
    const barrios = [...new Set(catalogo.map((p: any) => p.barrio).filter(Boolean))].slice(0, 20);
    return {
      catalogo,
      campana: campanas[0] || null,
      resumen_portafolio: catalogo.length
        ? `Hoy hay ${catalogo.length} inmuebles activos: ${arr} en arriendo y ${ven} en venta.` +
          (barrios.length ? ` Zonas con disponibilidad: ${barrios.join(', ')}.` : '')
        : '',
    };
  },

  // Cartera carga UN contrato y UN extracto. No carga inventario.
  cartera: async (db, estado, entrada) => {
    const tel = entrada.tel.replace(/\D/g, '');
    const [arrs, props] = await Promise.all([
      db.list('Arrendatario', { telefono: tel, limit: 1 }),
      db.list('Propietario', { telefono: tel, limit: 1 }),
    ]);
    const arrendatario = arrs[0] || null;
    const contrato = arrendatario
      ? (await db.list('ContratoArriendo', { arrendatario_id: arrendatario.id, estado: 'Activo', limit: 1 }))[0] || null
      : null;
    return {
      es_cliente: !!(arrendatario || props[0]),
      tiene_contrato: !!contrato,
      es_propietario: !!props[0],
      nombre_registrado: arrendatario?.nombre || props[0]?.nombre || '',
    };
  },

  mantenimiento: async (db, estado, entrada) => {
    const tel = entrada.tel.replace(/\D/g, '');
    const arr = (await db.list('Arrendatario', { telefono: tel, limit: 1 }))[0] || null;
    const abiertas = arr
      ? (await db.list('Reparacion', { arrendatario_id: arr.id, limit: 5 }))
          .filter((r: any) => r.estado !== 'Cerrada' && r.estado !== 'Cancelada')
      : [];
    return { es_cliente: !!arr, reparaciones_abiertas: abiertas.length, nombre_registrado: arr?.nombre || '' };
  },

  consignacion: async (db, _estado, entrada) => {
    const prop = (await db.list('Propietario', { telefono: entrada.tel.replace(/\D/g, ''), limit: 1 }))[0] || null;
    return { ya_es_propietario: !!prop, nombre_registrado: prop?.nombre || '' };
  },

  avaluos: async () => ({}),
  pqr: async () => ({}),
  matricula: async () => ({}),
};async function cargarContexto(db: Db, agente: Agente, estado: Estado, entrada: Entrada) {
  try {
    return await CARGADORES[agente](db, estado, entrada);
  } catch (e) {
    console.error(`contexto ${agente} error:`, (e as Error).message);
    return {};
  }
}

// Ensambla el system prompt: identidad de marca (una fila, aplica a todos) +
// el prompt del agente + estado inyectado + RAG filtrado.function armarSystem(
  base: Base,
  agente: Agente,
  estado: Estado,
  ctxAgente: Record<string, any>,
): string {
  const partes: string[] = [];
  partes.push(base.identidadMarca || IDENTIDAD_MARCA);
  partes.push(String(base.prompt?.prompt || PROMPTS[agente] || ''));
  if (base.rag) partes.push(base.rag);

  // El horario cambia a que se compromete el agente, no lo que puede hacer.
  // Fuera de horario tiene que resolver el solo: "manana te contacta un asesor"
  // es el ultimo recurso, no la salida por defecto.
  partes.push(`=== MOMENTO ===\n${instruccionHorario(new Date(), base.config || {})}`);

  const nombre = String(estado.compartido.nombre || '');
  const i = estado.identidad;
  const estadoTxt = [
    '=== ESTADO DE ESTA CONVERSACION ===',
    nombre ? `El cliente se llama ${nombre}. Dirigite a el por su primer nombre.` : 'Aun no sabes su nombre.',
    `Identidad verificada: ${i.verificado && i.expira && new Date(i.expira) > new Date() ? 'SI' : 'NO'}`,
    i.bloqueado_hasta && new Date(i.bloqueado_hasta) > new Date() ? 'ATENCION: bloqueado por intentos fallidos de verificacion.' : '',
    Object.keys(ctxAgente.datos || {}).length ? `Datos que ya tienes: ${JSON.stringify(ctxAgente.datos)}` : '',
    ctxAgente.resumen_portafolio ? `\n${ctxAgente.resumen_portafolio}` : '',
    ctxAgente.nombre_registrado ? `En el sistema figura como: ${ctxAgente.nombre_registrado}` : '',
  ].filter(Boolean).join('\n');
  partes.push(estadoTxt);

  partes.push(
    '=== COMO RESPONDER ===\n' +
    'Terminas SIEMPRE tu turno llamando a la herramienta `responder`. Es la unica forma de que el cliente te lea.\n' +
    'Puedes llamar varias herramientas en el mismo turno: guarda los datos que hagan falta y responde, todo junto.\n' +
    'Escribe corto: maximo dos frases por globo. Nunca uses el guion largo. Nunca uses emojis.\n' +
    'Jamas afirmes un dato que no venga del contexto o del resultado de una herramienta. Si no lo tienes, dilo.',
  );

  return partes.join('\n\n');
}

// ─── _core/llm.ts ────────────────────────────────────────────────
// Llamada a Anthropic + loop de tool-use con presupuesto duro.
//
// Presupuesto: maximo 2 llamadas al modelo por invocacion (§A.4). El camino
// comun es UNA sola llamada: con parallel tool use el modelo emite las tools de
// efecto lateral y `responder` en el mismo turno, y `responder` es terminal.
// La segunda llamada solo ocurre con tools de recuperacion, que genuinamente
// necesitan el resultado para hablar. Si hace falta una tercera, el turno se
// aparca en estado.turno_pendiente y lo reanuda el cron continuarTurno.
const API = 'https://api.anthropic.com/v1/messages';

// Capacidades por modelo. `effort` NO existe en Haiku 4.5 (devuelve error), y
// Sonnet 5 corre pensamiento adaptativo por defecto — a 15s de presupuesto eso
// se paga, asi que se fija effort bajo salvo que el agente pida otra cosa.
function paramsModelo(modelo: string, effort?: string) {
  if (/haiku/.test(modelo)) return {};
  return { output_config: { effort: effort || 'low' } };
}interface RespuestaModelo {
  bloques: any[];
  stop_reason: string;
  modelo: string;
}async function llamarModelo(opts: {
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
}interface ResultadoAgente {
  globos: string[];
  finTurno: boolean;
  pendiente: { mensajes: any[] } | null;
  llamadas: number;
}

// Un turno del agente. `mensajes` entra como el historial ya formateado para la
// API; si viene de un turno aparcado, trae los tool_result pendientes.async function correrAgente(opts: {
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

  // Se agoto el presupuesto sin `responder`. El turno se aparca con el historial
  // exacto que llevaba; continuarTurno lo retoma donde quedo.
  return { globos: opts.ctx.salida.globos, finTurno: false, pendiente: { mensajes }, llamadas };
}

// ─── _core/state.ts ──────────────────────────────────────────────
// Carga, migracion y guardado del estado de conversacion.
// MemoriaChat es el UNICO almacen. La escritura dual a Nota queda retirada:
// eran tres escritores sobre dos copias, y `pausada` se leia de la copia
// equivocada.
// Clave indexada de busqueda. Reemplaza el scan `?limit=500` que corria dos
// veces por mensaje: no se despacha un full-table scan a cada WhatsApp que entra.const claveDe = (canal: string, tel: string) =>
  `${canal === 'telegram' ? 'tg' : 'wa'}:${String(tel).replace(/\D/g, '')}`;function identidadVacia(): Identidad {
  return {
    verificado: false, metodo: null,
    arrendatario_id: null, contrato_id: null, propietario_id: null,
    verificado_en: null, expira: null, intentos: 0, bloqueado_hasta: null,
  };
}function estadoVacio(): Estado {
  return {
    v: 2,
    agente_activo: 'recepcion',
    agente_historial: [],
    identidad: identidadVacia(),
    compartido: {},
    historial: [],
    ctx: {},
    turno_pendiente: null,
    msg_ids: [],
    pausada: false,
  };
}

// v1 -> v2. Perezosa (al leer) e idempotente: los hilos vivos no se rompen.
// El estado v1 era plano — `datos`, `etapa_ventas`, `objeciones_activas` eran
// del agente de ventas aunque nadie lo dijera. Aqui se nombra.function migrar(raw: unknown): Estado {
  const v = estadoVacio();
  if (!raw || typeof raw !== 'object') return v;
  const o = raw as Record<string, any>;

  if (o.v === 2) {
    return {
      ...v, ...o,
      identidad: { ...identidadVacia(), ...(o.identidad || {}) },
      ctx: o.ctx && typeof o.ctx === 'object' ? o.ctx : {},
      agente_activo: esAgente(o.agente_activo) ? o.agente_activo : 'recepcion',
      historial: Array.isArray(o.historial) ? o.historial : [],
      msg_ids: Array.isArray(o.msg_ids) ? o.msg_ids : [],
      agente_historial: Array.isArray(o.agente_historial) ? o.agente_historial : [],
    };
  }

  const ahora = new Date().toISOString();
  return {
    ...v,
    agente_activo: 'ventas',
    agente_historial: [{ agente: 'ventas', desde: ahora, motivo: 'migracion:v1' }],
    compartido: {
      nombre: o.datos?.nombre || o.nombre || '',
      contacto_id: o.contacto_id || '',
      campana_id: o.campana_id || '',
      campana_nombre: o.campana_nombre || '',
    },
    historial: Array.isArray(o.historial) ? o.historial : [],
    msg_ids: Array.isArray(o.msg_ids) ? o.msg_ids : [],
    pausada: !!o.pausada,
    ctx: {
      ventas: {
        datos: o.datos && typeof o.datos === 'object' ? o.datos : {},
        etapa_ventas: o.etapa_ventas || 'calentamiento',
        estado_emocional: o.estado_emocional || 'sin_definir',
        tipo_comprador: o.tipo_comprador || 'sin_definir',
        motivacion_principal: o.motivacion_principal || 'sin_definir',
        nivel_urgencia: o.nivel_urgencia || 'explorando',
        objeciones_activas: Array.isArray(o.objeciones_activas) ? o.objeciones_activas : [],
        calificado: !!o.calificado,
        descalificado: !!o.descalificado,
        motivo_desc: o.motivo_desc || '',
        broker: o.broker || '',
        broker_tel: o.broker_tel || '',
        broker_genero: o.broker_genero || '',
        despidio: !!o.despidio,
      },
    },
  };
}interface MemoriaCargada { id: string | null; estado: Estado; fila: Record<string, any> | null }async function cargarEstado(db: Db, canal: string, tel: string): Promise<MemoriaCargada> {
  const clave = claveDe(canal, tel);
  // Primero por clave indexada; el fallback por telefono cubre las filas que
  // aun no tienen `clave` escrita (se rellena al guardar, una sola vez).
  let fila = await db.uno('MemoriaChat', { clave });
  if (!fila) fila = await db.uno('MemoriaChat', { telefono: String(tel).replace(/\D/g, '') });
  if (!fila) return { id: null, estado: estadoVacio(), fila: null };

  let bruto: unknown = {};
  try { bruto = JSON.parse(fila.estado_json || '{}'); } catch { /* estado corrupto: se arranca limpio */ }
  return { id: fila.id, estado: migrar(bruto), fila };
}function ctxDe(estado: Estado, agente: Agente): Record<string, any> {
  if (!estado.ctx[agente]) estado.ctx[agente] = {};
  return estado.ctx[agente];
}

// El handoff preserva todo: fija el agente, deja rastro en agente_historial y
// empuja un marcador al historial compartido para que el agente nuevo entienda
// por que le llego la conversacion a medias.function transferir(estado: Estado, destino: Agente, motivo: string) {
  const origen = estado.agente_activo;
  if (origen === destino) return;
  estado.agente_activo = destino;
  estado.agente_historial = [
    ...estado.agente_historial,
    { agente: destino, desde: new Date().toISOString(), motivo },
  ].slice(-20);
  estado.historial.push({
    role: 'user',
    content: `[Sistema: transferido de ${origen} a ${destino}. Motivo: ${motivo}]`,
    ts: new Date().toISOString(),
  });
}async function guardarEstado(
  db: Db,
  memoriaId: string | null,
  canal: string,
  tel: string,
  estado: Estado,
  extra: { ultimo_mensaje?: string; ultima_respuesta?: string; contacto_id?: string } = {},
): Promise<string | null> {
  estado.historial = estado.historial.slice(-24);
  estado.msg_ids = estado.msg_ids.slice(-20);
  return await db.guardar('MemoriaChat', memoriaId, {
    clave: claveDe(canal, tel),
    telefono: String(tel).replace(/\D/g, ''),
    canal: canal === 'telegram' ? 'Telegram' : 'WhatsApp',
    nombre: String(estado.compartido.nombre || ''),
    contacto_id: extra.contacto_id ?? String(estado.compartido.contacto_id || ''),
    agente_activo: estado.agente_activo,
    pausada: estado.pausada,
    // Campo indexado: continuarTurno lo consulta en vez de escanear la tabla.
    tiene_turno_pendiente: !!estado.turno_pendiente,
    estado_json: JSON.stringify(estado),
    ultimo_mensaje: (extra.ultimo_mensaje || '').slice(0, 1000),
    ultima_respuesta: (extra.ultima_respuesta || '').slice(0, 1000),
    fecha_ultimo_mensaje: new Date().toISOString(),
  });
}

// ─── _core/brief.ts ──────────────────────────────────────────────
// Resumen ejecutivo del lead para cuando entra un humano.
//
// POR QUE EXISTE: al escalar, el equipo recibia nombre, telefono y una frase
// que redacto el propio modelo. Todo lo que `guardar_dato` habia acumulado
// durante la conversacion —presupuesto, zona, operacion, timing, forma de pago—
// se quedaba en el estado y no viajaba. El asesor abria la Bandeja y tenia que
// reconstruir el contexto desde cero, o peor, volvia a preguntarle al cliente
// lo que ya habia contestado.
//
// Lo ironico es que el brief bueno ya existia: calificar_lead armaba uno
// completo. Simplemente no se usaba en el escalamiento, que es donde mas falta
// hace.
//
// Se manda un RESUMEN, no la transcripcion: el humano necesita decidir en diez
// segundos si llama ya, no leer treinta mensajes.
const ETIQUETAS: Record<string, string> = {
  operacion: 'Operacion',
  tipo_prop: 'Tipo de inmueble',
  tipo_inmueble: 'Tipo de inmueble',
  zona: 'Zona',
  barrio: 'Zona',
  presupuesto: 'Presupuesto',
  habitaciones: 'Habitaciones',
  timing: 'Cuando se muda',
  forma_pago: 'Forma de pago',
  decide_solo: 'Decide solo',
  otra_inmobiliaria: 'Ya trabaja con otra inmobiliaria',
  direccion_inmueble: 'Direccion del inmueble',
  documento: 'Documento',
  email: 'Correo',
};

const fmt = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'si' : 'no';
  if (typeof v === 'number') {
    return v >= 1000
      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
          .format(v).replace(/\s+/g, '')
      : String(v);
  }
  return String(v ?? '').trim();
};

/**
 * Arma el brief. `extra` permite agregar lineas propias del motivo del
 * escalamiento sin que este modulo tenga que conocerlas.
 */function briefLead(estado: Estado, tel: string, canal: string, extra: string[] = []): string {
  const lineas: string[] = [];

  const nombre = String(estado.compartido.nombre || '').trim();
  lineas.push(nombre ? `${nombre} — wa.me/${tel}` : `Sin nombre — wa.me/${tel}`);
  lineas.push(`Canal: ${canal}`);

  // Por donde paso la conversacion. Un lead que arranco en ventas y termino en
  // PQR cuenta una historia distinta a uno que entro directo a PQR.
  const ruta = (estado.agente_historial || []).map((s) => s.agente);
  if (ruta.length > 1) lineas.push(`Paso por: ${ruta.join(' -> ')}`);

  const i = estado.identidad;
  if (i?.verificado && i.expira && new Date(i.expira) > new Date()) {
    lineas.push('Identidad verificada: SI');
  }

  // Lo que el cliente conto, venga del scratch del agente o de compartido.
  const datos: Record<string, unknown> = {
    ...(estado.compartido || {}),
    ...((estado.ctx?.[estado.agente_activo]?.datos as Record<string, unknown>) || {}),
  };

  const relevantes: string[] = [];
  for (const [clave, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = datos[clave];
    if (v === undefined || v === null || v === '') continue;
    const texto = fmt(v);
    if (texto) relevantes.push(`  ${etiqueta}: ${texto}`);
  }
  if (relevantes.length) {
    lineas.push('', 'LO QUE YA CONTO:', ...relevantes);
  }

  // Calificacion, si el agente alcanzo a hacerla.
  const ctxAg = estado.ctx?.[estado.agente_activo] || {};
  if (ctxAg.temperatura) {
    lineas.push('', `Calificacion: ${String(ctxAg.temperatura).toUpperCase()}${ctxAg.score ? ` (${ctxAg.score}/100)` : ''}`);
  }

  if (extra.length) lineas.push('', ...extra);

  // Ultimo mensaje del cliente: da el tono con el que llega.
  const ultimo = [...(estado.historial || [])].reverse().find((m) => m.role === 'user');
  if (ultimo?.content) {
    lineas.push('', `Ultimo mensaje: "${String(ultimo.content).slice(0, 200)}"`);
  }

  return lineas.join('\n');
}

// ─── _core/tools/comunes.ts ──────────────────────────────────────
// Las cuatro tools que recibe TODO agente.
// Campos que viven en `compartido`, no en el scratch del agente: los ve todo
// el mundo y sobreviven al handoff.
const COMPARTIDOS = new Set(['nombre', 'email', 'documento', 'direccion_inmueble']);
const NUMERICOS = new Set(['presupuesto', 'canon_esperado', 'valor_esperado', 'area_m2', 'habitaciones', 'nps_score']);const responder: Tool = {
  ...definirTool(
    'responder',
    'Envia tu respuesta al cliente y TERMINA tu turno. Cada elemento de `globos` se manda como un mensaje separado de WhatsApp, como escribe una persona. Usa 1 o 2 globos; 3 solo si de verdad hace falta. Siempre debes terminar tu turno con esta herramienta.',
    {
      globos: lista('Los mensajes a enviar, en orden. Cortos y naturales.'),
      fin_turno: bool('true si no esperas respuesta del cliente (despedida). false en cualquier otro caso.'),
    },
    { terminal: true },
  ),
  ejecutar: (input, c: CtxTool) => {
    const gs = Array.isArray(input.globos) ? input.globos : [];
    for (const g of gs) {
      const t = limpiar(g);
      if (t) c.salida.globos.push(t);
    }

    // Cierre obligatorio: no se puede dar por terminada una conversacion sin
    // dejar algo concreto. Antes un turno perfectamente valido era
    // responder(["Cualquier cosa me escribes"], fin_turno=true) — cero
    // compromiso, cero registro, y el lead se perdia en silencio.
    //
    // Vale como cierre cualquier tool marcada `cierra`: agendar una visita,
    // radicar una PQR, registrar un interes, escalar a un humano. Tambien una
    // transferencia, porque la conversacion sigue con otro rol y no muere aqui.
    const quiereCerrar = !!input.fin_turno;
    const hayCierre = c.hubo_cierre === true || c.efectos.transferir !== null || c.efectos.escalado !== null;
    if (quiereCerrar && !hayCierre) {
      c.salida.finTurno = false;
      return {
        ok: false,
        error: 'cierre_sin_siguiente_paso',
        instruccion: 'No cierres la conversacion en el aire. Deja algo concreto antes: '
          + 'agenda una visita o una llamada, envia una ficha, registra el interes con '
          + 'registrar_interes, radica la solicitud, o escala a un humano. Si de verdad no '
          + 'hay nada que hacer, escala en vez de despedirte.',
      };
    }

    c.salida.finTurno = quiereCerrar;
    return { ok: true };
  },
};

// Regla dura heredada del agente original: nada de guiones largos hacia el
// cliente. Es el tic que mas delata a un bot en espanol.const limpiar = (t: unknown) =>
  String(t ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();const guardarDato: Tool = {
  ...definirTool(
    'guardar_dato',
    'Guarda un dato que el cliente acaba de dar, para no volver a preguntarlo. Llamala tantas veces como datos nuevos haya en el mensaje.',
    {
      campo: str('Nombre del dato. Ej: nombre, email, barrio, presupuesto, operacion.'),
      valor: str('El valor tal como lo dijo el cliente. Los numeros van sin puntos ni simbolos.'),
    },
  ),
  ejecutar: (input, c: CtxTool) => {
    const campo = String(input.campo || '').trim();
    if (!campo) return { ok: false, error: 'campo vacio' };
    let valor: unknown = String(input.valor ?? '').trim();
    if (NUMERICOS.has(campo)) valor = Number(String(valor).replace(/[^\d]/g, '')) || 0;
    if (COMPARTIDOS.has(campo)) c.estado.compartido[campo] = valor;
    else {
      const ctx = ctxDe(c.estado, c.estado.agente_activo);
      ctx.datos = { ...(ctx.datos as Record<string, unknown> || {}), [campo]: valor };
    }
    return { ok: true, campo };
  },
};const transferirA: Tool = {
  ...definirTool(
    'transferir_a',
    'Pasa la conversacion a otro agente especializado cuando el tema deja de ser el tuyo. El cliente NO ve el cambio: el otro agente lee el mismo historial y sigue. No anuncies la transferencia, solo hazla.',
    {
      agente: enumStr('El agente que debe seguir', [...AGENTES]),
      motivo: str('Por que transfieres, en una frase'),
    },
  ),
  ejecutar: (input, c: CtxTool) => {
    const destino = input.agente;
    if (!(AGENTES as readonly string[]).includes(destino)) return { ok: false, error: 'agente invalido' };
    if (destino === c.estado.agente_activo) return { ok: false, error: 'ya es el agente activo' };
    transferir(c.estado, destino, String(input.motivo || 'sin motivo'));
    c.efectos.transferir = destino;
    return { ok: true, transferido_a: destino };
  },
};

// Escalamiento. La escalera es identica en todos los agentes: frustracion,
// 3 turnos sin avance, 3 fallos de verificacion, el cliente pide humano, monto
// o disputa fuera de politica, PQR con palabra legal.const escalarAHumano: Tool = {
  ...definirTool(
    'escalar_a_humano',
    'Pasa la conversacion a una persona del equipo. Usala si el cliente lo pide, si esta molesto, si llevas 3 turnos sin avanzar, si el tema se sale de lo que puedes resolver, o si hay plata o un reclamo legal de por medio. Despues de llamarla, despidete con `responder` diciendo que un asesor le escribe; NO prometas tiempos.',
    {
      motivo: str('Que pasa y que necesita el cliente, en 1 o 2 frases'),
      prioridad: enumStr('Urgencia real', ['baja', 'media', 'alta', 'urgente']),
    },
    { cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const motivo = String(input.motivo || 'sin motivo').slice(0, 500);
    const prioridad = String(input.prioridad || 'media');
    // pausada = true es el mismo mecanismo que ya usa la Bandeja para tomar
    // control manual. El bot deja de responder hasta que un humano lo reactive.
    c.estado.pausada = true;
    c.efectos.escalado = { motivo, prioridad };

    const nombre = String(c.estado.compartido.nombre || '') || `+${c.entrada.tel}`;

    // Brief ejecutivo en vez de "telefono + una frase". Todo lo que guardar_dato
    // acumulo durante la conversacion viaja con el escalamiento: sin esto el
    // asesor volvia a preguntarle al cliente lo que ya habia contestado.
    const brief = briefLead(c.estado, c.entrada.tel, c.entrada.canal, [`MOTIVO: ${motivo}`]);

    await c.db.crear('Tarea', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      titulo: `Escalamiento ${c.estado.agente_activo}: ${nombre}`,
      descripcion: brief,
      fecha_limite: new Date(Date.now() + (prioridad === 'urgente' ? 0 : 864e5)).toISOString().split('T')[0],
      prioridad: prioridad === 'urgente' || prioridad === 'alta' ? 'Alta' : prioridad === 'baja' ? 'Baja' : 'Media',
      completada: false,
      origen_agente: c.estado.agente_activo,
    });

    c.efectos.notificar.push(
      `ESCALAMIENTO (${prioridad.toUpperCase()}) — desde ${c.estado.agente_activo}\n\n` +
      `${brief}\n\n` +
      `La IA quedo en pausa para este chat. Responde desde la Bandeja.`,
    );
    return { ok: true, escalado: true };
  },
};const COMUNES: Record<string, Tool> = {
  responder,
  guardar_dato: guardarDato,
  transferir_a: transferirA,
  escalar_a_humano: escalarAHumano,
};

// Helper compartido: exigir identidad verificada antes de tocar PII.function exigirVerificado(c: CtxTool): { error: string } | null {
  const i = c.estado.identidad;
  if (i.bloqueado_hasta && new Date(i.bloqueado_hasta).getTime() > Date.now()) {
    return { error: 'bloqueado_por_intentos_fallidos' };
  }
  if (!i.verificado || !i.expira || new Date(i.expira).getTime() <= Date.now()) {
    return { error: 'no_verificado' };
  }
  return null;
}const enviarMenu: Tool = {
  ...definirTool(
    'enviar_menu',
    'Muestra el menu de opciones al cliente cuando no queda claro que necesita. Usalo maximo una vez por conversacion.',
    { titulo: strOpc('Frase corta antes del menu. null para usar la de siempre.') },
  ),
  ejecutar: (input, c: CtxTool) => {
    c.salida.globos.push(limpiar(input.titulo) || 'Con gusto te ayudo. ¿Cual de estas opciones necesitas?');
    c.salida.globos.push(
      '1. Buscar inmueble\n2. Consignar mi inmueble\n3. Pagos y estado de cuenta\n' +
      '4. Reportar una reparacion\n5. Solicitar un avaluo\n6. Peticiones, quejas y reclamos\n7. Tramite de contrato',
    );
    c.salida.finTurno = false;
    return { ok: true };
  },
};

// ─── _core/scoring.ts ────────────────────────────────────────────
// Calificacion de leads: rubrica unica, deterministica y testeable.
//
// POR QUE EXISTE: habia dos sistemas desconectados. leadClassify tenia una
// rubrica buena pero solo corria si un humano pulsaba un boton en el CRM, y
// calificar_lead —la que sí corre en cada conversacion— escribia
// `temperatura: 'Caliente'` LITERAL para todo el mundo, sin mirar nada. Un
// inversionista con 5.000 millones y alguien que dijo "estoy mirando" salian
// identicos, y el equipo comercial no tenia como priorizar.
//
// La rubrica vive en codigo y no en el prompt a proposito: un criterio de
// priorizacion tiene que ser reproducible y auditable. Si el modelo decide la
// temperatura, dos leads iguales pueden salir distintos y nadie sabe por que.interface SenalesLead {
  // Del CRM
  etapa_pipeline?: string;
  presupuesto_max?: number;
  ciudad_interes?: string;
  habitaciones_min?: number;
  ultima_actividad?: string;
  visitas_realizadas?: number;
  visita_con_interes?: boolean;

  // De la conversacion. Antes se perdian: el agente las recogia con
  // guardar_dato y no influian en la prioridad del lead.
  operacion?: string;
  zona?: string;
  timing?: string;          // 'ya' | 'pronto' | 'explorando'
  forma_pago?: string;      // 'credito_aprobado' | 'credito_tramite' | 'contado' | 'no_sabe'
  decide_solo?: boolean;
  otra_inmobiliaria?: boolean;
}interface Calificacion {
  score: number;             // 0-100
  temperatura: 'Frio' | 'Tibio' | 'Caliente' | 'Urgente';
  prioridad: 'Baja' | 'Media' | 'Alta';
  motivos: string[];         // por que dio eso, para que sea auditable
}

const ETAPA: Record<string, number> = {
  Lead: 10, Visita_Agendada: 35, Oferta: 55, Negociacion: 70,
  Promesa: 85, Escritura: 95, Activo: 95, Perdido: 0,
};

/** Timing declarado por el cliente. Es el predictor mas fuerte que hay. */
const TIMING: Record<string, number> = { ya: 20, pronto: 10, explorando: -10 };

/** Capacidad de pago verificada pesa mas que el monto declarado. */
const PAGO: Record<string, number> = {
  credito_aprobado: 20, contado: 20, credito_tramite: 8, no_sabe: 0,
};

/**
 * Califica un lead. Funcion pura: mismas señales, mismo resultado.
 *
 * `motivos` acompaña al score para que un asesor pueda ver por que un lead
 * quedo tibio en vez de tener que confiar en el numero.
 */function calificar(s: SenalesLead): Calificacion {
  const motivos: string[] = [];
  let score = ETAPA[String(s.etapa_pipeline || '')] ?? 10;

  const suma = (n: number, motivo: string) => {
    if (!n) return;
    score += n;
    motivos.push(`${n > 0 ? '+' : ''}${n} ${motivo}`);
  };

  // Datos de necesidad
  if (s.presupuesto_max) suma(10, 'declaro presupuesto');
  if (s.ciudad_interes)  suma(5, 'definio ciudad');
  if (s.zona)            suma(5, 'definio zona');
  if (s.habitaciones_min) suma(5, 'definio habitaciones');
  if (s.operacion)       suma(5, 'definio operacion');

  // Señales de intencion real
  suma(TIMING[String(s.timing || '')] ?? 0, `timing: ${s.timing}`);
  suma(PAGO[String(s.forma_pago || '')] ?? 0, `forma de pago: ${s.forma_pago}`);
  if (s.decide_solo === true) suma(10, 'decide solo');
  if (s.decide_solo === false) suma(-5, 'la decision no es solo suya');

  // Competencia: no descalifica, pero baja la probabilidad de cierre.
  if (s.otra_inmobiliaria) suma(-10, 'ya trabaja con otra inmobiliaria');

  // Recorrido
  if (s.visitas_realizadas) suma(15, 'ya visito inmuebles');
  if (s.visita_con_interes) suma(10, 'mostro interes en una visita');

  // Enfriamiento por silencio
  if (s.ultima_actividad) {
    const dias = Math.floor((Date.now() - new Date(s.ultima_actividad).getTime()) / 86_400_000);
    if (dias > 10)     suma(-25, `${dias} dias sin actividad`);
    else if (dias > 5) suma(-15, `${dias} dias sin actividad`);
    else if (dias > 3) suma(-5, `${dias} dias sin actividad`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    temperatura: score >= 80 ? 'Urgente' : score >= 55 ? 'Caliente' : score >= 30 ? 'Tibio' : 'Frio',
    prioridad:   score >= 65 ? 'Alta'    : score >= 35 ? 'Media'    : 'Baja',
    motivos,
  };
}

// ─── _core/tools/ventas.ts ───────────────────────────────────────
// Reemplaza `asignarBrokerDinamico`, que leia ConfigAgente.brokers[] y "ganaba
// el primero que coincidia". Con 30+ asesores eso concentra todos los leads en
// una persona: ahora se balancea por leads abiertos.async function asignarAsesor(db: Db, criterios: { zona?: string; tipo?: string; operacion?: string }) {
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
// cambia materialmente el canon y erosiona la confianza en el inventario.const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Math.round(n)).replace(/\s+/g, '');const linkFicha = (p: any): string => String(
  p?.link_wasi
  || p?.portales?.metrocuadrado
  || p?.portales?.fincaraiz
  || p?.portales?.mercadolibre
  || '',
).trim();const buscarInmuebles: Tool = {
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
      inmuebles: puntuados.map(({ p }) => ({
        id: p.id,
        titulo: p.titulo,
        tipo: p.tipo,
        barrio: p.barrio || p.ciudad,
        area_m2: p.area_m2 ?? null,
        habitaciones: p.habitaciones ?? null,
        banos: p.banos ?? null,
        precio: esArr
          ? (p.canon_arriendo ? fmtCOP(p.canon_arriendo) + ' al mes' : null)
          : (p.precio_venta ? fmtCOP(p.precio_venta) : null),
        administracion: p.valor_administracion ?? p.administracion ?? null,
        ficha: linkFicha(p) || null,
        video: p.link_instagram || null,
      })),
      nota: 'Solo puedes afirmar los datos que aparecen aqui. Si un campo viene en null, ese dato NO lo tienes: dile al cliente que se lo confirma el asesor.',
    };
  },
};const enviarFicha: Tool = {
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
};const registrarInteres: Tool = {
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
};const calificarLead: Tool = {
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
      await c.db.crear('HistorialLead', {
        contacto_id: contactoId,
        evento: 'Calificado',
        detalle: `Asignado a ${asesor?.nombre || 'sin asesor'} por el agente de ventas`,
        fecha: new Date().toISOString(),
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
      instruccion: rol
        ? `Llama a responder con: confirmacion breve a ${primer}, que lo acompana ${rol}, y que se pondra en contacto por este medio. No prometas fecha ni hora.`
        : `Llama a responder con: confirmacion breve a ${primer} y que un asesor se pondra en contacto por este medio. No prometas fecha ni hora.`,
    };
  },
};const agendarVisita: Tool = {
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
      estado: 'Solicitada',
      preferencia_horario: String(input.preferencia || '').slice(0, 200),
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    return { ok: true, nota: 'Dile que el asesor le confirma el horario. No des una hora tu.' };
  },
};const VENTAS: Record<string, Tool> = {
  buscar_inmuebles: buscarInmuebles,
  enviar_ficha: enviarFicha,
  registrar_interes: registrarInteres,
  calificar_lead: calificarLead,
  agendar_visita: agendarVisita,
};

// ─── _core/identidad.ts ──────────────────────────────────────────
// Verificacion de identidad y sesiones de portal.
//
// Regla que sostiene todo lo demas: el modelo NUNCA ve el dato correcto ni
// puede pasar un id arbitrario. La comparacion ocurre aqui, server-side, y las
// tools que leen PII no tienen parametros identificadores (ver tools/cartera.ts).
// Solo este modulo escribe estado.identidad.
const HORAS_VIGENCIA = 24;
const MAX_INTENTOS = 3;
const BLOQUEO_MIN = 60;
const TTL_PORTAL_MIN = 15;

const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}async function auditar(
  db: Db,
  datos: { tipo: string; sujeto_id?: string; telefono: string; exito: boolean; detalle?: string },
) {
  try {
    await db.crear('AuditoriaAcceso', {
      tipo: datos.tipo,
      sujeto_id: datos.sujeto_id || '',
      telefono: soloDigitos(datos.telefono),
      exito: datos.exito,
      detalle: (datos.detalle || '').slice(0, 500),
      fecha: new Date().toISOString(),
    });
  } catch (e) {
    console.error('auditar error:', (e as Error).message);
  }
}

// ── Nivel A: implicito. El `from` del canal contra Arrendatario/Propietario. ──
// Suficiente para RUTEAR a cartera. Nunca suficiente para divulgar: SIM swap,
// telefonos familiares compartidos, numeros reasignados por el operador.async function reconocerTelefono(db: Db, tel: string) {
  const t = soloDigitos(tel);
  if (!t) return { arrendatario: null, propietario: null, contrato: null };
  const [arrs, props] = await Promise.all([
    db.list('Arrendatario', { telefono: t, limit: 1 }),
    db.list('Propietario', { telefono: t, limit: 1 }),
  ]);
  const arrendatario = arrs[0] || null;
  let contrato = null;
  if (arrendatario) {
    contrato = (await db.list('ContratoArriendo', { arrendatario_id: arrendatario.id, estado: 'Activo', limit: 1 }))[0] || null;
  }
  return { arrendatario, propietario: props[0] || null, contrato };
}function sesionVigente(estado: Estado): boolean {
  const i = estado.identidad;
  if (!i.verificado || !i.expira) return false;
  return new Date(i.expira).getTime() > Date.now();
}function bloqueado(estado: Estado): boolean {
  const h = estado.identidad.bloqueado_hasta;
  return !!h && new Date(h).getTime() > Date.now();
}

// ── Nivel B: reto. Segundo factor que el registro ya tiene. ──────────────────
// `valor` es lo que dijo el cliente; el dato correcto no sale de esta funcion.async function verificar(
  db: Db,
  estado: Estado,
  entrada: Entrada,
  tipo: 'cedula_ultimos4' | 'numero_solicitud',
  valor: string,
): Promise<{ verificado: boolean; intentos_restantes: number; bloqueado: boolean }> {
  if (bloqueado(estado)) {
    await auditar(db, { tipo: 'verificacion', telefono: entrada.tel, exito: false, detalle: 'intento durante bloqueo' });
    return { verificado: false, intentos_restantes: 0, bloqueado: true };
  }

  const { arrendatario, propietario, contrato } = await reconocerTelefono(db, entrada.tel);
  let ok = false;
  let sujeto: string | undefined;

  if (tipo === 'cedula_ultimos4') {
    const dado = soloDigitos(valor).slice(-4);
    for (const p of [arrendatario, propietario]) {
      if (!p) continue;
      const real = soloDigitos(p.numero_documento).slice(-4);
      if (dado.length === 4 && real.length === 4 && dado === real) { ok = true; sujeto = p.id; break; }
    }
  } else {
    const dado = String(valor || '').trim().toUpperCase();
    if (dado) {
      const sol = await db.uno('SolicitudMatricula', { numero_solicitud: dado });
      // El numero de solicitud solo vale si pertenece a este telefono.
      if (sol && soloDigitos(sol.telefono_contacto) === soloDigitos(entrada.tel)) { ok = true; sujeto = sol.id; }
    }
  }

  const i = estado.identidad;
  if (ok) {
    const ahora = new Date();
    estado.identidad = {
      ...identidadVacia(),
      verificado: true,
      metodo: tipo,
      arrendatario_id: arrendatario?.id ?? null,
      propietario_id: propietario?.id ?? null,
      contrato_id: contrato?.id ?? null,
      verificado_en: ahora.toISOString(),
      expira: new Date(ahora.getTime() + HORAS_VIGENCIA * 3600_000).toISOString(),
      intentos: 0,
      bloqueado_hasta: null,
    };
    await auditar(db, { tipo: 'verificacion', sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
    return { verificado: true, intentos_restantes: MAX_INTENTOS, bloqueado: false };
  }

  i.intentos = (i.intentos || 0) + 1;
  i.verificado = false;
  const restantes = Math.max(0, MAX_INTENTOS - i.intentos);
  if (restantes === 0) {
    i.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MIN * 60_000).toISOString();
  }
  await auditar(db, {
    tipo: 'verificacion', telefono: entrada.tel, exito: false,
    detalle: `${tipo} fallido (intento ${i.intentos}/${MAX_INTENTOS})`,
  });
  return { verificado: false, intentos_restantes: restantes, bloqueado: restantes === 0 };
}

// ── Nivel C: magic link al portal. ──────────────────────────────────────────
// Nunca sale un PDF ni un extracto completo por WhatsApp. Sale un link de un
// solo uso, atado a este telefono, que vence en 15 minutos.async function crearSesionPortal(
  db: Db,
  entrada: Entrada,
  estado: Estado,
  tipo: string,
): Promise<string | null> {
  const sujeto = estado.identidad.arrendatario_id || estado.identidad.propietario_id;
  if (!sesionVigente(estado) || !sujeto) return null;

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const fila = await db.crear('SesionPortal', {
    token_hash: await sha256(token),      // en reposo solo queda el hash
    tipo,
    sujeto_id: sujeto,
    sujeto_tipo: estado.identidad.arrendatario_id ? 'arrendatario' : 'propietario',
    contrato_id: estado.identidad.contrato_id || '',
    telefono: soloDigitos(entrada.tel),
    expira: new Date(Date.now() + TTL_PORTAL_MIN * 60_000).toISOString(),
    usado: false,
    creada: new Date().toISOString(),
  });
  if (!fila) return null;

  await auditar(db, { tipo: 'sesion_portal', sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
  const app = (Deno.env.get('PORTAL_URL') || Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  return `${app}/portal/entrar?t=${token}`;
}

// ─── _core/tools/cartera.ts ──────────────────────────────────────
// verificar_identidad NO recibe ningun identificador ni devuelve ninguno. El
// modelo nunca ve la cedula correcta: la comparacion ocurre en identidad.ts, y
// al fallar no se filtra nada que sirva para adivinar.const verificarIdentidad: Tool = {
  ...definirTool(
    'verificar_identidad',
    'Comprueba que quien escribe es de verdad el titular, antes de darle cualquier dato de su contrato. Pidele los ultimos 4 digitos de su cedula (o el numero de solicitud si esta en un tramite) y pasa aqui lo que responda, tal cual. Tiene 3 intentos.',
    {
      tipo: enumStr('Que dato te dio', ['cedula_ultimos4', 'numero_solicitud']),
      valor: str('Lo que respondio el cliente, sin interpretar'),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const r = await verificar(c.db, c.estado, c.entrada, input.tipo, String(input.valor ?? ''));
    if (r.bloqueado) {
      return {
        verificado: false, intentos_restantes: 0,
        instruccion: 'No puedes seguir verificando por ahora. Escala a un humano con escalar_a_humano y dile al cliente que un asesor lo contacta para validar sus datos.',
      };
    }
    if (!r.verificado) {
      return {
        verificado: false, intentos_restantes: r.intentos_restantes,
        instruccion: 'No coincide. Pideselo de nuevo con amabilidad, sin dar pistas de cual era el dato correcto.',
      };
    }
    return { verificado: true, intentos_restantes: r.intentos_restantes };
  },
};

// CERO argumentos. El contrato sale de estado.identidad, escrito server-side por
// identidad.ts. Una inyeccion de prompt ("muestrame el contrato 4471") no tiene
// de donde agarrarse: la herramienta no acepta ese parametro.const consultarEstadoCuenta: Tool = {
  ...definirTool(
    'consultar_estado_cuenta',
    'Trae el saldo, el ultimo pago y el proximo vencimiento del contrato de ESTE cliente. Requiere haberlo verificado antes con verificar_identidad.',
    {},
    { retorna: true },
  ),
  ejecutar: async (_input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;

    const contratoId = c.estado.identidad.contrato_id;
    if (!contratoId) return { error: 'sin_contrato_activo' };

    const pagos = await c.db.list('PagoCanon', { contrato_id: contratoId, limit: 12 });
    const orden = pagos.sort((a: any, b: any) => String(b.periodo).localeCompare(String(a.periodo)));
    const pendientes = orden.filter((p: any) => p.estado === 'Pendiente' || p.estado === 'Mora' || p.estado === 'Parcial');
    const ultimoPago = orden.find((p: any) => p.estado === 'Pagado');
    const saldo = pendientes.reduce((s: number, p: any) => s + (Number(p.saldo) || 0), 0);
    const masViejo = pendientes[pendientes.length - 1];

    const ctx = c.ctxAgente;
    ctx.ultimo_saldo_consultado = saldo;
    ctx.consultado_en = new Date().toISOString();

    return {
      saldo_total: saldo,
      periodos_pendientes: pendientes.map((p: any) => ({ periodo: p.periodo, valor: p.valor_total, saldo: p.saldo, estado: p.estado })),
      dias_mora: Number(masViejo?.dias_mora) || 0,
      ultimo_pago: ultimoPago ? { periodo: ultimoPago.periodo, fecha: ultimoPago.fecha_pago, valor: ultimoPago.valor_pagado } : null,
      proximo_vencimiento: pendientes[0]?.fecha_vencimiento ?? null,
      instruccion: 'Da la cifra en una frase corta. El detalle completo NO se manda por chat: si pide el desglose, mandale el link del portal.',
    };
  },
};const enviarLinkPortal: Tool = {
  ...definirTool(
    'enviar_link_portal',
    'Manda un link seguro al portal del cliente. Usalo para todo lo que sea un documento, una tabla o un historial: el chat es para cifras sueltas, el portal para el detalle. El link vence en 15 minutos y sirve una sola vez.',
    // El enum debe listar SOLO secciones que existan como ruta en el portal.
    // Ofrecer una que no existe manda al cliente a un link que no lo lleva a
    // donde el agente le dijo: 'documentos' y 'mis-datos' se sacaron por eso.
    { seccion: enumStr('A donde debe llegar', ['estado-cuenta', 'pagos', 'contrato', 'reparaciones', 'liquidaciones']) },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, String(input.seccion));
    if (!url) return { error: 'no_se_pudo_generar' };
    c.salida.globos.push('Te dejo el acceso a tu portal. El enlace es personal y vence en 15 minutos:');
    c.salida.globos.push(url);
    return { ok: true, nota: 'El link ya se envio. No lo repitas en responder.' };
  },
};const enviarCodigoBarras: Tool = {
  ...definirTool(
    'enviar_codigo_barras',
    'Manda el codigo de barras del mes para que el cliente pague en banco o corresponsal.',
    { periodo: strOpc('Mes en formato AAAA-MM. null para el mes en curso.') },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const periodo = String(input.periodo || '').match(/^\d{4}-\d{2}$/)
      ? String(input.periodo)
      : new Date().toISOString().slice(0, 7);

    const cb = await c.db.uno('CodigoBarras', {
      contrato_id: c.estado.identidad.contrato_id || '',
      periodo,
    });
    if (!cb) {
      return {
        error: 'no_disponible', periodo,
        instruccion: 'Dile que el del mes aun no esta generado y que un asesor se lo hace llegar. No inventes un codigo.',
      };
    }
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, 'pagos');
    c.salida.globos.push(`Este es tu recibo de ${periodo}. Lo puedes pagar en banco o corresponsal:`);
    c.salida.globos.push(url || String(cb.url_pdf));
    await c.db.actualizar('CodigoBarras', cb.id, { ...cb, fecha_envio: new Date().toISOString(), canal_envio: c.entrada.canal, estado_envio: 'Enviado' });
    return { ok: true, periodo, nota: 'Ya se envio el link. No lo repitas en responder.' };
  },
};const CARTERA: Record<string, Tool> = {
  verificar_identidad: verificarIdentidad,
  consultar_estado_cuenta: consultarEstadoCuenta,
  enviar_link_portal: enviarLinkPortal,
  enviar_codigo_barras: enviarCodigoBarras,
};

// ─── _core/tools/mantenimiento.ts ────────────────────────────────
const registrarReparacion: Tool = {
  ...definirTool(
    'registrar_reparacion',
    'Radica una solicitud de reparacion. Antes de llamarla necesitas saber QUE se dano y DONDE. Si hay gas, fuego, inundacion o riesgo electrico, la urgencia es Emergencia y ademas debes llamar a escalar_a_humano.',
    {
      categoria: enumStr('Que se dano', ['Plomeria', 'Electrico', 'Gas', 'Cerrajeria', 'Electrodomestico', 'Estructural', 'Humedad', 'Otro']),
      descripcion: str('Lo que reporta el cliente, con sus palabras y el detalle que dio'),
      urgencia: enumStr('Emergencia solo si hay riesgo real para personas o el inmueble', ['Emergencia', 'Alta', 'Media', 'Baja']),
      ubicacion: strOpc('En que parte del inmueble. null si no lo dijo.'),
    },
    { retorna: true, cierra: true },
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
};const adjuntarEvidencia: Tool = {
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
};const consultarEstadoReparacion: Tool = {
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
};const MANTENIMIENTO: Record<string, Tool> = {
  verificar_identidad: verificarIdentidad,
  registrar_reparacion: registrarReparacion,
  adjuntar_evidencia: adjuntarEvidencia,
  consultar_estado_reparacion: consultarEstadoReparacion,
};

// ─── _core/tools/consignacion.ts ─────────────────────────────────
const registrarConsignacion: Tool = {
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
    { retorna: true, cierra: true },
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
};const agendarAvaluoPrevio: Tool = {
  ...definirTool(
    'agendar_avaluo_previo',
    'Deja pedida la visita de avaluo para una consignacion que ya registraste. Sirve para saber a que precio sale el inmueble.',
    { preferencia: str('Cuando le queda bien al propietario, en sus palabras') },
    { cierra: true },
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
};const CONSIGNACION: Record<string, Tool> = {
  registrar_consignacion: registrarConsignacion,
  agendar_avaluo_previo: agendarAvaluoPrevio,
};

// ─── _core/tools/avaluos.ts ──────────────────────────────────────
const registrarSolicitudAvaluo: Tool = {
  ...definirTool(
    'registrar_solicitud_avaluo',
    'Radica una solicitud de avaluo comercial. Necesitas la direccion, el tipo de inmueble y para que lo necesita.',
    {
      nombre: str('Nombre de quien solicita'),
      direccion: str('Direccion del inmueble a avaluar'),
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro']),
      area_m2: numOpc('Area en metros cuadrados. null si no la sabe.'),
      proposito: enumStr('Para que lo necesita', ['Venta', 'Arriendo', 'Credito', 'Sucesion', 'Otro']),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const av = await c.db.crear('Avaluo', {
      solicitante_nombre: String(input.nombre || '').slice(0, 200),
      solicitante_telefono: c.entrada.tel.replace(/\D/g, ''),
      solicitante_email: String(c.estado.compartido.email || ''),
      direccion: String(input.direccion || '').slice(0, 300),
      tipo_inmueble: String(input.tipo_inmueble),
      area_m2: Number(input.area_m2) || 0,
      proposito: String(input.proposito),
      estado: 'Solicitado',
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    if (!av) return { error: 'no_se_pudo_registrar' };
    c.ctxAgente.avaluo_id = av.id;

    c.efectos.notificar.push(
      `SOLICITUD DE AVALUO\n${String(input.nombre)}\nwa.me/${c.entrada.tel}\n` +
      `${String(input.tipo_inmueble)} en ${String(input.direccion)}\n` +
      `Proposito: ${String(input.proposito)}${input.area_m2 ? ` | ${input.area_m2} m2` : ''}`,
    );

    const noEstandar = ['Bodega', 'Lote', 'Finca', 'Otro'].includes(String(input.tipo_inmueble));
    // El aviso del RAA viaja en el resultado de la tool y no solo en el prompt:
    // es el momento en que el cliente pregunta por su avaluo, y es cuando tiene
    // que quedar claro que quien lo firma es un perito inscrito (Ley 1673/2013).
    const raa = 'Recuerdale que el avaluo con validez legal lo firma un avaluador inscrito en el RAA, no la inmobiliaria ni tu.';
    return {
      ok: true,
      radicado: av.id,
      tipo_no_estandar: noEstandar,
      instruccion: noEstandar
        ? `Este tipo de inmueble no tiene tarifa estandar. NO des un precio: escala con escalar_a_humano para que el perito cotice. ${raa}`
        : `Confirma que quedo radicado. El tarifario aun no esta aprobado: si pregunta el valor del servicio, escala para cotizacion. ${raa}`,
    };
  },
};const cotizarAvaluo: Tool = {
  ...definirTool(
    'cotizar_avaluo',
    'Comprueba si existe un tarifario aprobado. Por ahora no hay uno cargado y debes escalar para cotizacion.',
    {
      tipo_inmueble: enumStr('Tipo', ['Apartamento', 'Casa', 'Local', 'Oficina']),
      area_m2: numOpc('Area en metros cuadrados. null si no la sabe.'),
    },
    { retorna: true },
  ),
  ejecutar: async (_input, _c: CtxTool) => {
    return {
      error: 'tarifario_no_aprobado',
      instruccion: 'No des ninguna cifra ni formula. Escala con escalar_a_humano para que el equipo de avaluos cotice.',
    };
  },
};const AVALUOS: Record<string, Tool> = {
  registrar_solicitud_avaluo: registrarSolicitudAvaluo,
  cotizar_avaluo: cotizarAvaluo,
};

// ─── _core/tools/pqr.ts ──────────────────────────────────────────
// Palabra legal: dispara prioridad y notificacion inmediata al equipo.
const LEGAL = /\b(tutela|demanda|demandar|abogad|superintendencia|sic\b|fiscal[ií]a|juzgado|proceso legal|accion de proteccion)\b/i;

/**
 * Terminos de respuesta en DIAS HABILES (Ley 1755/2015, art. 14).
 *
 * El termino corre por ministerio de la ley desde la radicacion, exista o no un
 * campo en la base. Antes no se computaba y la tool instruia al modelo a callar
 * sobre el plazo: eso protegia de prometer mal, pero dejaba un pasivo creciendo
 * en silencio, sin nada que avisara antes del vencimiento.
 *
 * Los valores son configurables desde AppConfig{clave:'plazos_pqr'} porque la
 * calificacion juridica de cada caso —peticion de interes particular, de
 * documentos, consulta— la define el abogado de la empresa, no este codigo.
 * Estos defaults son los del articulo y se usan mientras no haya politica
 * cargada.
 */
const DIAS_DEFECTO: Record<string, number> = {
  Peticion:     15,
  Queja:        15,
  Reclamo:      15,
  Sugerencia:   15,
  Felicitacion: 15,
};const registrarPqr: Tool = {
  ...definirTool(
    'registrar_pqr',
    'Radica una peticion, queja, reclamo, sugerencia o felicitacion. Antes de llamarla necesitas entender bien QUE paso: no radiques con una sola frase suelta.',
    {
      tipo: enumStr('Que es', ['Peticion', 'Queja', 'Reclamo', 'Sugerencia', 'Felicitacion']),
      asunto: str('Resumen en menos de 10 palabras'),
      descripcion: str('Lo que cuenta el cliente, completo y con sus palabras'),
      nombre: str('Nombre de quien radica'),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const tipo = String(input.tipo);
    const texto = `${input.asunto} ${input.descripcion}`;
    const esLegal = LEGAL.test(texto);

    // El radicado usaba los ultimos 6 digitos de Date.now(), que se repiten cada
    // ~16 minutos. Se le agregan 4 caracteres aleatorios: un radicado duplicado
    // le entrega al cliente un numero que apunta a la PQR de otro.
    const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
    const radicado = `PQR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${azar}`;

    // Plazo legal. Se calcula SIEMPRE: el termino corre aunque el campo este
    // vacio, y sin fecha no hay nada que pueda alertar antes del vencimiento.
    const cfgPlazos = (await c.db.uno('AppConfig', { clave: 'plazos_pqr' }))?.valor_json;
    let dias = DIAS_DEFECTO;
    try { if (cfgPlazos) dias = { ...DIAS_DEFECTO, ...JSON.parse(cfgPlazos) }; } catch { /* usa los del articulo */ }
    const fechaLimite = sumarHabiles(new Date(), Number(dias[tipo]) || 15);

    const pqr = await c.db.crear('PQR', {
      fecha_limite_legal: fechaLimite.toISOString(),
      tipo,
      radicado,
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      contacto_nombre: String(input.nombre || '').slice(0, 200),
      contacto_telefono: c.entrada.tel.replace(/\D/g, ''),
      canal: c.entrada.canal,
      asunto: String(input.asunto || '').slice(0, 200),
      descripcion: String(input.descripcion || '').slice(0, 4000),
      estado: 'Radicada',
      prioridad: esLegal ? 'Urgente' : tipo === 'Reclamo' ? 'Alta' : 'Media',
      fecha_radicacion: new Date().toISOString(),
    });
    if (!pqr) return { error: 'no_se_pudo_registrar' };
    c.ctxAgente.pqr_id = pqr.id;

    // El agente de PQR SIEMPRE notifica: una queja que nadie ve es una queja
    // que se convierte en algo peor.
    const venceEl = fechaLimite.toISOString().slice(0, 10);
    c.efectos.notificar.push(
      `${esLegal ? 'PQR CON MENCION LEGAL — REVISAR YA' : `PQR NUEVA (${tipo})`}\n` +
      `Radicado: ${radicado}\n${String(input.nombre)} — wa.me/${c.entrada.tel}\n` +
      `Asunto: ${String(input.asunto)}\n` +
      `Vence: ${venceEl} (${Number(dias[tipo]) || 15} dias habiles)\n\n` +
      `${String(input.descripcion).slice(0, 500)}`,
    );

    return {
      ok: true,
      radicado,
      mencion_legal: esLegal,
      instruccion: esLegal
        ? `Dale el radicado ${radicado}, dile que ya quedo en manos del equipo y llama tambien a escalar_a_humano con prioridad urgente. NO opines sobre lo legal ni asumas responsabilidad.`
        : `Dale el radicado ${radicado} y dile que el termino de respuesta es de ${Number(dias[tipo]) || 15} dias habiles. NO des la fecha exacta ni prometas que se resuelve antes: el plazo es el maximo de ley, no un compromiso de entrega.`,
    };
  },
};const consultarEstadoPqr: Tool = {
  ...definirTool(
    'consultar_estado_pqr',
    'Consulta como va una PQR ya radicada, por su numero de radicado.',
    { radicado: str('El numero de radicado que da el cliente') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const rad = String(input.radicado || '').trim().toUpperCase();
    const pqr = await c.db.uno('PQR', { radicado: rad });
    // El radicado solo se consulta desde el telefono que lo creo.
    if (!pqr || String(pqr.contacto_telefono || '').replace(/\D/g, '') !== c.entrada.tel.replace(/\D/g, '')) {
      return { error: 'no_encontrada', instruccion: 'Dile que no encuentras ese radicado asociado a este numero y pideselo de nuevo.' };
    }
    return {
      radicado: pqr.radicado,
      tipo: pqr.tipo,
      estado: pqr.estado,
      radicada: pqr.fecha_radicacion,
      respondida: pqr.fecha_respuesta ?? null,
      respuesta: pqr.respuesta ?? null,
    };
  },
};const PQR: Record<string, Tool> = {
  registrar_pqr: registrarPqr,
  consultar_estado_pqr: consultarEstadoPqr,
};

// ─── _core/tools/matricula.ts ────────────────────────────────────
// Matricula de contrato — intake de datos para reemplazar el formulario F117.
// La lista documental y su canal seguro siguen pendientes de definicion.const iniciarMatricula: Tool = {
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
};const agregarParticipante: Tool = {
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
};const finalizarMatricula: Tool = {
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
// verificacion de contrato: el cliente todavia no es arrendatario nuestro.const enviarLinkDocumentos: Tool = {
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
};const MATRICULA: Record<string, Tool> = {
  iniciar_matricula: iniciarMatricula,
  agregar_participante: agregarParticipante,
  finalizar_matricula: finalizarMatricula,
  enviar_link_portal: enviarLinkDocumentos,
};

// ─── _core/tools/index.ts ────────────────────────────────────────
// El registro por agente ES el mecanismo de enforcement.
//
// Con JSON-en-prosa, "el agente de pagos no debe calificar leads" era una
// instruccion que el modelo podia ignorar. Aqui es un esquema: el agente de
// cartera no recibe `calificar_lead`, asi que es estructuralmente incapaz de
// llamarla.
// encuestas no se registra: esta fuera de AGENTES (ver protocol.ts).
const EXTRA: Record<Agente, Record<string, Tool>> = {
  recepcion:     { enviar_menu: enviarMenu },
  ventas:        VENTAS,
  consignacion:  CONSIGNACION,
  cartera:       CARTERA,
  mantenimiento: MANTENIMIENTO,
  avaluos:       AVALUOS,
  pqr:           PQR,
  matricula:     MATRICULA,
};function toolsDe(agente: Agente, habilitadas?: string[]): Record<string, Tool> {
  const todas = { ...COMUNES, ...(EXTRA[agente] || {}) };
  // AgentePrompt.tools_habilitadas permite recortar (nunca ampliar) el set sin
  // desplegar. `responder` no se puede quitar: sin ella el agente no habla.
  if (!habilitadas?.length) return todas;
  const permitidas = new Set([...habilitadas, 'responder']);
  return Object.fromEntries(Object.entries(todas).filter(([n]) => permitidas.has(n)));
}

// ─── entry.ts ────────────────────────────────────────────────────
// Reanuda los turnos que excedieron el presupuesto de 2 llamadas al modelo.
// Cron cada minuto.
//
// El presupuesto duro existe porque el request de entrada tiene 15s. Cuando un
// agente necesita una tercera llamada (encadenar dos recuperaciones, por
// ejemplo), el turno se aparca en estado.turno_pendiente y este cron lo cierra.
// Tope de 2 continuaciones; despues escala a un humano.

const MODELO_FALLBACK = 'claude-haiku-4-5-20251001';
const MAX_POR_CORRIDA = 5;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET desde el cron */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  const dado = url.searchParams.get('token') || body?.token || body?.args?.token || '';
  if (!esperado || dado !== esperado) {
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

  // Conserva el turno para reanudarlo cuando el equipo vuelva a encender la IA,
  // pero no llama al modelo ni encola mensajes durante la pausa global.
  if (!agentesAutomaticosActivos(base.config)) return { saltado: 'IA global inactiva' };
  console.log(`RAG[${agente}] ${base.ragChars} chars: ${base.ragTitulos.join(' | ') || '(vacio)'}`);

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
      // La continuacion debe volver por el mismo bot que recibio el chat.
      agente: entrada.canal === 'telegram'
        ? String(estado.compartido.telegram_bot_agente || '')
        : estado.agente_activo,
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
