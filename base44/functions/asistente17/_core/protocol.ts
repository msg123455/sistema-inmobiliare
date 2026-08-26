// Contratos compartidos: tipos de estado, forma de las tools y registro de agentes.
// Los prompts NO viven aqui — viven en filas de AgentePrompt (§A.5).

import type { Db } from './db.ts';

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
// El codigo de tools/encuestas.ts se conserva para ese momento.
export const AGENTES = [
  'recepcion', 'ventas', 'consignacion', 'cartera', 'mantenimiento',
  'avaluos', 'pqr', 'matricula',
] as const;

export type Agente = typeof AGENTES[number];

export const esAgente = (v: unknown): v is Agente =>
  typeof v === 'string' && (AGENTES as readonly string[]).includes(v);

// Etiquetas que ve el clasificador LLM del router nivel 2.
export const ETIQUETAS_AGENTE: Record<Agente, string> = {
  recepcion:    'saludo suelto, mensaje ambiguo, o no encaja en ninguna otra categoria',
  ventas:       'busca comprar o arrendar un inmueble, pide fotos, precios, visitas',
  consignacion: 'ES DUENO de un inmueble y quiere venderlo, arrendarlo o ponerlo en administracion',
  cartera:      'pagos, canon, saldo, estado de cuenta, mora, recibo, codigo de barras, certificado',
  mantenimiento:'algo se dano en el inmueble que habita: fugas, danos, reparaciones, emergencias',
  avaluos:      'quiere un avaluo comercial de un inmueble, o pregunta cuanto vale',
  pqr:          'inquietud o consulta sobre el servicio, y tambien peticion, queja, reclamo, sugerencia o felicitacion',
  matricula:    'esta tramitando un contrato de arriendo nuevo: papeleria, estudio, codeudor, F117',
};

// ─── Estado v2 (MemoriaChat.estado_json) ────────────────────────────────────

export interface Identidad {
  verificado: boolean;
  metodo: string | null;
  arrendatario_id: string | null;
  contrato_id: string | null;
  propietario_id: string | null;
  verificado_en: string | null;
  expira: string | null;
  intentos: number;
  bloqueado_hasta: string | null;
}

export interface TurnoMsg { role: 'user' | 'assistant'; content: string; globos?: string[]; ts?: string }

export interface SaltoAgente { agente: Agente; desde: string; motivo: string }

export interface TurnoPendiente {
  mensajes: unknown[];      // historial de la conversacion con el modelo, tal cual
  continuaciones: number;
  agente: Agente;
}

/**
 * Radiografia del ultimo turno, para el comando /chunks.
 *
 * Existe porque desde fuera un agente es una caja negra: contesta raro y no hay
 * forma de saber si le falto conocimiento, si el prompt que uso no era el que
 * creias, o si el ruteo lo mando a otra especialidad. Se diagnosticaba por
 * eliminacion, y eso costo dias.
 *
 * `prompt_origen` es el campo mas importante: los prompts de AgentePrompt pisan
 * a los del codigo, asi que un agente sin fila cae al del binario desplegado,
 * que puede tener meses. Verlo escrito ahorra toda esa averiguacion.
 */
export interface DiagTurno {
  ts: string;
  agente: Agente;
  ruteo: string;
  prompt_origen: string;
  prompt_version: number | null;
  marca_origen: string;
  rag_chars: number;
  rag_max: number;
  rag_activos: number;
  rag: Array<{ t: string; c: number; esp: boolean }>;
  fuera: Array<{ t: string; c: number; m: string }>;
  tools: string[];
  guardado_chars: number;
  // Lo que costo el turno. Va aqui y no solo al log porque el fallo de cacheo
  // no da error: si el prefijo se invalida, todo se cobra entero y lo unico que
  // cambia es la factura. Con esto, /chunks lo dice en el chat.
  gasto?: { entrada: number; cache_leidos: number; cache_escritos: number; salida: number; llamadas: number };
}

export interface Estado {
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
  diag?: DiagTurno | null;
}

// ─── Entrada normalizada (ambos canales) ────────────────────────────────────

export type Canal = 'whatsapp' | 'telegram';

export interface Entrada {
  canal: Canal;
  tel: string;              // clave universal de la conversacion
  texto: string;
  msgId: string;
  botonId: string;          // id del boton interactivo de WhatsApp, si vino por ahi
  adReferral: { adId: string; adTitulo: string; adCuerpo: string };
  destino: string;          // a donde se responde (numero WA con indicativo, o chat id TG)
}

// ─── Tools ──────────────────────────────────────────────────────────────────

export interface EsquemaTool {
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
// conversacion termine en callejon sin salida.
export interface Tool {
  def: EsquemaTool;
  ejecutar: (input: any, c: CtxTool) => Promise<unknown> | unknown;
  retorna?: boolean;
  terminal?: boolean;
  cierra?: boolean;
}

export interface CtxTool {
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

// Azucar para declarar tools sin repetir strict/additionalProperties.
export function definirTool(
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
}

export const str = (description: string) => ({ type: 'string', description });
export const strOpc = (description: string) => ({ type: ['string', 'null'], description });
export const num = (description: string) => ({ type: 'number', description });
export const numOpc = (description: string) => ({ type: ['number', 'null'], description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const enumStr = (description: string, valores: string[]) => ({ type: 'string', description, enum: valores });
// Enum que ademas admite null ("todavia no lo se").
//
// POR QUE NO BASTA strOpc. El tipo de inmueble se declaraba como texto libre y
// el modelo mandaba "apartamentos" en plural, o "apartaestudio". El filtro
// comparaba contra el enum cerrado de la base y descartaba el inventario
// entero, lo que el agente leia como "no hay nada" y le decia al cliente. Con
// el enum en el ESQUEMA esa clase de fallo deja de ser posible, en vez de
// depender de que el modelo escriba bien.
// COMO SE DECLARA UN ENUM QUE ADMITE NULL, Y COMO NO.
//
// La forma evidente —`{ type: ['string','null'], enum: [...valores, null] }`—
// la RECHAZA la API con strict:true:
//
//   400 tools.0.custom: Invalid schema:
//   Enum value 'Apartamento' does not match declared type '['string','null']'
//
// Y el rechazo no es del campo: es del request entero. O sea que una sola tool
// mal declarada deja MUDO al agente completo, en todas sus llamadas. Paso en
// produccion: ventas dejo de responder del todo y contestaba el globo de
// emergencia ("se me enredo el sistema"), lo que parece un fallo del modelo y
// no un esquema invalido.
//
// La forma que si acepta es anyOf: la rama del enum y la rama del null por
// separado, cada una con su tipo simple.
export const enumStrOpc = (description: string, valores: string[]) =>
  ({ description, anyOf: [{ type: 'string', enum: valores }, { type: 'null' }] });
export const lista = (description: string, items: unknown = { type: 'string' }) => ({ type: 'array', description, items });
