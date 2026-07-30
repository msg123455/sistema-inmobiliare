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
  pqr:          'peticion, queja, reclamo, sugerencia o felicitacion sobre el servicio',
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
export interface Tool {
  def: EsquemaTool;
  ejecutar: (input: any, c: CtxTool) => Promise<unknown> | unknown;
  retorna?: boolean;
  terminal?: boolean;
}

export interface CtxTool {
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

// Azucar para declarar tools sin repetir strict/additionalProperties.
export function definirTool(
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
}

export const str = (description: string) => ({ type: 'string', description });
export const strOpc = (description: string) => ({ type: ['string', 'null'], description });
export const num = (description: string) => ({ type: 'number', description });
export const numOpc = (description: string) => ({ type: ['number', 'null'], description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const enumStr = (description: string, valores: string[]) => ({ type: 'string', description, enum: valores });
export const lista = (description: string, items: unknown = { type: 'string' }) => ({ type: 'array', description, items });
