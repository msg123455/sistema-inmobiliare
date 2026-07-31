// ARCHIVO GENERADO por scripts/empaquetar.mjs — no editar a mano.
//
// Base44 no registra funciones cuyo grafo de imports pasa de ~9 modulos.
// La fuente editable es entry.ts + _core/; esto es su aplanado (9 modulos
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
// segunda llamada. `terminal: true` => corta el turno (solo `responder`).interface Tool {
  def: EsquemaTool;
  ejecutar: (input: any, c: CtxTool) => Promise<unknown> | unknown;
  retorna?: boolean;
  terminal?: boolean;
}interface CtxTool {
  db: Db;
  estado: Estado;
  entrada: Entrada;
  ctxAgente: Record<string, any>;   // lo que cargo contexto.ts para ESTE agente
  config: Record<string, any>;      // fila operativa de ConfigAgente
  salida: { globos: string[]; finTurno: boolean };
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
  opts: { retorna?: boolean; terminal?: boolean } = {},
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

/** Comun a los ocho agentes. Se antepone al prompt de cada agente. */
const IDENTIDAD_MARCA = `Trabajas para INMOBILIARE Julio Corredor (J.C.O Inversiones S.A.S), inmobiliaria de Bogota desde 1960.
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
 */
const PROMPTS = {
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

No pidas datos accesorios antes de calificar. Si no hay opciones, dilo y ofrece registrar
el interes. Si el cliente se despide, responde una sola vez y termina el turno.`,

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
 */
function seleccionarRag(
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

/** ConfigAgente.activo funciona como kill switch global. */
function agentesAutomaticosActivos(config: Record<string, any> | null | undefined): boolean {
  return config?.activo !== false;
}
interface Base {
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

// ─── _core/canales/media.ts ──────────────────────────────────────
// Audio -> texto y imagen -> descripcion. Compartido por ambos canales.async function transcribir(buf: ArrayBuffer, mimeType: string, openaiKey: string): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mimeType }), 'audio.ogg');
  fd.append('model', 'whisper-1');
  fd.append('language', 'es');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: fd,
  });
  if (!r.ok) { console.error('Whisper error:', r.status); return null; }
  return ((await r.json()).text || '').trim() || null;
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}async function describirImagen(
  buf: ArrayBuffer, mimeType: string, openaiKey: string, caption: string,
): Promise<string | null> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Un cliente de una inmobiliaria en Bogota envio esta imagen por chat${caption ? ` con el texto: "${caption}"` : ''}. Describe en 1 o 2 frases en espanol QUE muestra, enfocandote en lo util para bienes raices: si es un inmueble (que tipo o ambiente), un dano o averia (que se ve danado), un plano, un pantallazo de un anuncio, un documento (cedula, extracto, recibo), o algo personal. Solo la descripcion, sin preambulos.` },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64(buf)}` } },
        ],
      }],
    }),
  });
  if (!r.ok) { console.error('Vision error:', r.status); return null; }
  return ((await r.json()).choices?.[0]?.message?.content || '').trim() || null;
}

// ─── _core/canales/whatsapp.ts ───────────────────────────────────
const GRAPH = 'https://graph.facebook.com/v19.0';const esWhatsApp = (body: any) => !!body?.entry?.[0]?.changes;

const conIndicativo = (t: string) => {
  const d = String(t).replace(/\D/g, '');
  return d.startsWith('57') ? d : '57' + d;
};

async function descargarMedia(mediaId: string, waToken: string) {
  const rMeta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${waToken}` } });
  if (!rMeta.ok) return null;
  const meta = await rMeta.json();
  if (!meta.url) return null;
  const rBin = await fetch(meta.url, { headers: { Authorization: `Bearer ${waToken}` } });
  if (!rBin.ok) return null;
  return { buf: await rBin.arrayBuffer(), mimeType: meta.mime_type || 'application/octet-stream' };
}async function normalizar(body: any, env: { waToken: string; openaiKey: string }): Promise<Entrada | null> {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const m = value?.messages?.[0];
  if (!m?.from) return null;

  const tel = String(m.from).replace(/\D/g, '');
  const ref = m.referral || {};
  const base = {
    canal: 'whatsapp' as const,
    tel,
    msgId: m.id || '',
    botonId: '',
    adReferral: { adId: ref.source_id || '', adTitulo: ref.headline || '', adCuerpo: ref.body || '' },
    destino: conIndicativo(tel),
  };

  if (m.type === 'text') {
    return { ...base, texto: String(m.text?.body || '').trim() };
  }

  // Botones y listas del menu: ruteo gratis y familiar para sus usuarios.
  if (m.type === 'interactive') {
    const btn = m.interactive?.button_reply;
    const lst = m.interactive?.list_reply;
    const id = btn?.id || lst?.id || '';
    const titulo = btn?.title || lst?.title || '';
    return { ...base, botonId: String(id), texto: String(titulo || id) };
  }
  if (m.type === 'button') {
    return { ...base, botonId: String(m.button?.payload || ''), texto: String(m.button?.text || '') };
  }

  if (m.type === 'audio' && m.audio?.id && env.openaiKey) {
    const media = await descargarMedia(m.audio.id, env.waToken);
    const texto = media ? await transcribir(media.buf, media.mimeType, env.openaiKey) : null;
    return texto ? { ...base, texto } : null;
  }

  if (m.type === 'image' && m.image?.id) {
    const caption = String(m.image.caption || '').trim();
    let desc: string | null = null;
    if (env.openaiKey) {
      const media = await descargarMedia(m.image.id, env.waToken);
      if (media) desc = await describirImagen(media.buf, media.mimeType, env.openaiKey, caption);
    }
    const texto = desc
      ? (caption ? `${caption}\n[El cliente envio una foto: ${desc}]` : `[El cliente envio una foto: ${desc}]`)
      : (caption || '[El cliente envio una foto que no pude ver bien]');
    return { ...base, texto };
  }

  return null;
}async function enviar(destino: string, texto: string, env: { waPhoneId: string; waToken: string }) {
  const r = await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.waToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
  });
  if (!r.ok) console.error('WA send error:', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

// Indicador de "escribiendo" real de Meta. Sustituye al sleep dentro del webhook:
// la pausa la hace el worker de entrega, no el request.async function marcarEscribiendo(msgId: string, env: { waPhoneId: string; waToken: string }) {
  if (!msgId) return;
  try {
    await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: msgId, typing_indicator: { type: 'text' } }),
    });
  } catch { /* el indicador es cosmetico: nunca debe tumbar el turno */ }
}

// ─── _core/canales/telegram.ts ───────────────────────────────────
const API = (token: string) => `https://api.telegram.org/bot${token}`;const esTelegram = (body: any) => !!(body?.message?.chat || body?.edited_message?.chat);

async function descargarMedia(fileId: string, tgToken: string) {
  const rInfo = await fetch(`${API(tgToken)}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!rInfo.ok) return null;
  const path = (await rInfo.json())?.result?.file_path;
  if (!path) return null;
  const rBin = await fetch(`https://api.telegram.org/file/bot${tgToken}/${path}`);
  if (!rBin.ok) return null;
  const mimeType = /\.(jpe?g)$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : 'audio/ogg';
  return { buf: await rBin.arrayBuffer(), mimeType };
}async function normalizar(
  body: any,
  env: { tgToken: string; openaiKey: string; tgBotKey?: string },
): Promise<Entrada | null> {
  const m = body?.message || body?.edited_message;
  const chatId = m?.chat?.id;
  if (!chatId) return null;
  // Telegram no conversa dentro de grupos: los ids negativos se ignoran.
  if (Number(chatId) < 0) return null;

  const base = {
    canal: 'telegram' as const,
    tel: String(chatId),
    // message_id solo es unico dentro de cada bot/chat. El prefijo evita que
    // dos bots dedicados conserven el mismo numero y el dedup descarte uno.
    msgId: `${env.tgBotKey || 'compartido'}:${String(m.message_id || '')}`,
    botonId: '',
    adReferral: { adId: '', adTitulo: '', adCuerpo: '' },
    destino: String(chatId),
  };

  const texto = String(m.text || '').trim();
  if (texto) return { ...base, texto };

  const audioId = m.voice?.file_id || m.audio?.file_id;
  if (audioId && env.openaiKey) {
    const media = await descargarMedia(audioId, env.tgToken);
    const t = media ? await transcribir(media.buf, media.mimeType, env.openaiKey) : null;
    return t ? { ...base, texto: t } : null;
  }

  const fotoId = Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1].file_id : '';
  if (fotoId) {
    const caption = String(m.caption || '').trim();
    let desc: string | null = null;
    if (env.openaiKey) {
      const media = await descargarMedia(fotoId, env.tgToken);
      if (media) desc = await describirImagen(media.buf, media.mimeType, env.openaiKey, caption);
    }
    return {
      ...base,
      texto: desc
        ? (caption ? `${caption}\n[El cliente envio una foto: ${desc}]` : `[El cliente envio una foto: ${desc}]`)
        : (caption || '[El cliente envio una foto que no pude ver bien]'),
    };
  }

  return null;
}async function enviar(destino: string, texto: string, env: { tgToken: string }) {
  const r = await fetch(`${API(env.tgToken)}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(destino), text: texto }),
  });
  if (!r.ok) console.error('TG send error:', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}async function marcarEscribiendo(destino: string, env: { tgToken: string }) {
  try {
    await fetch(`${API(env.tgToken)}/sendChatAction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(destino), action: 'typing' }),
    });
  } catch { /* cosmetico */ }
}

// ─── _core/canales/bots.ts ───────────────────────────────────────
/**
 * Un bot de Telegram por agente.
 *
 * Telegram no dice en el payload cual de tus bots recibio el mensaje, asi que
 * la pista va en la URL del webhook: cada bot se registra apuntando a
 *   .../agenteInbound?agente=<clave>
 * y de ahi sale a que agente pertenece la conversacion.
 *
 * Tener un bot dedicado por agente permite probar cada uno AISLADO: si el
 * mensaje entra por el bot de ventas, se fija agente_activo=ventas y el router
 * ni corre. Eso separa "el agente responde bien" de "el router acierta", que
 * son dos cosas que conviene depurar por separado.
 *
 * Los tokens NUNCA van en el codigo: son credenciales que dan control total
 * del bot. Van en variables de entorno, una por agente:
 *
 *   TELEGRAM_BOT_RECEPCION, TELEGRAM_BOT_VENTAS, TELEGRAM_BOT_CONSIGNACION,
 *   TELEGRAM_BOT_CARTERA, TELEGRAM_BOT_MANTENIMIENTO, TELEGRAM_BOT_AVALUOS,
 *   TELEGRAM_BOT_PQR, TELEGRAM_BOT_MATRICULA
 *
 * TELEGRAM_BOT_TOKEN sigue sirviendo como bot unico/compartido: si un agente no
 * tiene bot propio, se responde por ese. Asi se puede ir agente por agente sin
 * tener que crear los nueve bots de una.
 */

const VAR_POR_AGENTE: Record<Agente, string> = {
  recepcion:     'TELEGRAM_BOT_RECEPCION',
  ventas:        'TELEGRAM_BOT_VENTAS',
  consignacion:  'TELEGRAM_BOT_CONSIGNACION',
  cartera:       'TELEGRAM_BOT_CARTERA',
  mantenimiento: 'TELEGRAM_BOT_MANTENIMIENTO',
  avaluos:       'TELEGRAM_BOT_AVALUOS',
  pqr:           'TELEGRAM_BOT_PQR',
  matricula:     'TELEGRAM_BOT_MATRICULA',
};

/** Token del bot de un agente. Cae al bot compartido si no tiene uno propio. */function tokenDeAgente(agente?: string | null): string {
  const compartido = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  if (!agente || !esAgente(agente)) return compartido;
  return Deno.env.get(VAR_POR_AGENTE[agente]) || compartido;
}

/**
 * Agente al que pertenece esta peticion, segun `?agente=` de la URL del webhook.
 * Devuelve null si no viene o no es valido — ahi manda el router, como siempre.
 */function agenteDeUrl(url: URL): Agente | null {
  const v = url.searchParams.get('agente');
  return v && esAgente(v) ? v : null;
}

/** Agentes que hoy tienen bot propio configurado. Util para diagnostico. */function agentesConBot(): Agente[] {
  return (Object.keys(VAR_POR_AGENTE) as Agente[])
    .filter((a) => !!Deno.env.get(VAR_POR_AGENTE[a]));
}

// ─── entry.ts ────────────────────────────────────────────────────
// Worker de entrega. Cron cada minuto.
//
// Antes parseaba 500 filas de Nota por corrida para encontrar las pocas que
// tenian algo pendiente, lo que obligaba a un tope de 6 leads. Ahora consulta
// ColaSalida por estado y el tope sube a algo realista.
//
// La simulacion de tipeo vive aqui, no en el webhook: el request de entrada
// tiene 15s y no puede gastarlos durmiendo.


const MAX_POR_CORRIDA = 40;
const MAX_INTENTOS = 3;
const PRESUPUESTO_MS = 11_000;   // margen sobre el corte de ~15s de Base44

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET desde el cron */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  // Base44 entrega function_args dentro de `args` en algunas ejecuciones del
  // scheduler; mantener tambien query/body directo permite invocacion manual.
  const dado = url.searchParams.get('token') || body?.token || body?.args?.token || '';
  if (!esperado || dado !== esperado) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const env = {
    waPhoneId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '',
    waToken:   Deno.env.get('WHATSAPP_API_TOKEN') || '',
    tgToken:   Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
  };
  const db = crearDb(Deno.env.get('BASE44_API_KEY') || '');

  // El switch global tambien detiene mensajes que ya estaban en la cola. No se
  // marcan como fallidos: quedan pendientes para cuando el equipo reactive la IA.
  const config = await db.uno('ConfigAgente', { clave: 'general' });
  if (!agentesAutomaticosActivos(config)) {
    return new Response(JSON.stringify({ ok: true, skip: 'IA global inactiva' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const t0 = Date.now();
  const ahora = Date.now();
  const pendientes = (await db.list('ColaSalida', { estado: 'pendiente', limit: MAX_POR_CORRIDA }))
    .filter((c: any) => new Date(c.enviar_en || 0).getTime() <= ahora)
    .sort((a: any, b: any) => new Date(a.enviar_en).getTime() - new Date(b.enviar_en).getTime());

  let enviados = 0, globosEnviados = 0, fallidos = 0;

  for (const item of pendientes) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;   // el resto lo toma la corrida siguiente

    const globos: string[] = Array.isArray(item.globos) ? item.globos : [];
    if (!globos.length) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviado', error: 'sin globos' });
      continue;
    }

    // Marcar como en curso antes de enviar: si la funcion muere a mitad, la
    // corrida siguiente no reenvia lo que ya salio.
    await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviando', intentos: (item.intentos || 0) + 1 });

    let ok = true;
    try {
      if (item.canal === 'telegram') {
        // El bot que responde es el del agente que escribio el mensaje: si le
        // contestara el bot compartido, el cliente veria la respuesta en otro
        // chat del que escribio.
        const tgEnv = { tgToken: tokenDeAgente(item.agente) };
        if (!tgEnv.tgToken) throw new Error(`sin token de Telegram para "${item.agente || 'compartido'}"`);
        await tg.marcarEscribiendo(item.destino, tgEnv);
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!(await tg.enviar(item.destino, g, tgEnv))) ok = false;
          globosEnviados++;
        }
      } else if (item.canal === 'whatsapp' && env.waPhoneId && env.waToken) {
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!(await wa.enviar(item.destino, g, env))) ok = false;
          globosEnviados++;
        }
      } else {
        ok = false;
      }
    } catch (e) {
      console.error('entrega error:', (e as Error).message);
      ok = false;
    }

    const intentos = (item.intentos || 0) + 1;
    if (ok) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviado', intentos, enviado_en: new Date().toISOString(), error: '' });
      enviados++;
    } else if (intentos >= MAX_INTENTOS) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'fallido', intentos, error: 'agotados los reintentos' });
      fallidos++;
    } else {
      // Vuelve a la cola con backoff.
      await db.actualizar('ColaSalida', item.id, {
        ...item, estado: 'pendiente', intentos,
        enviar_en: new Date(Date.now() + intentos * 60_000).toISOString(),
        error: 'reintentando',
      });
      fallidos++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, en_cola: pendientes.length, enviados, globos: globosEnviados, fallidos }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

// Pausa proporcional al largo del mensaje, con variacion. Se recorta si la
// corrida se esta quedando sin presupuesto: entregar tarde es mejor que no
// entregar.
function pausaDe(texto: string, t0: number): number {
  const gastado = Date.now() - t0;
  if (gastado > PRESUPUESTO_MS * 0.7) return 250;
  return Math.min(Math.max(texto.length * 22, 700), 2400) + rand(-200, 400);
}
