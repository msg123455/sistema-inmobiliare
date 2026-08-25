// El registro por agente ES el mecanismo de enforcement.
//
// Con JSON-en-prosa, "el agente de pagos no debe calificar leads" era una
// instruccion que el modelo podia ignorar. Aqui es un esquema: el agente de
// cartera no recibe `calificar_lead`, asi que es estructuralmente incapaz de
// llamarla.

import type { Agente, Tool } from '../protocol.ts';
import { ASISTIDOS } from './asistidos.ts';
import { COMUNES, enviarMenu } from './comunes.ts';
import { identificarTitular } from './identificacion.ts';
import { VENTAS } from './ventas.ts';
import { CARTERA } from './cartera.ts';
import { MANTENIMIENTO } from './mantenimiento.ts';
import { CONSIGNACION } from './consignacion.ts';
import { AVALUOS } from './avaluos.ts';
import { PQR } from './pqr.ts';
import { MATRICULA } from './matricula.ts';

// identificar_titular la reciben los tramites que atienden a alguien que YA es
// cliente y no divulgan cifras. Cartera queda fuera a proposito: ahi el camino
// sigue siendo verificar_identidad, que exige el segundo factor antes de soltar
// un saldo. Ventas y consignacion tampoco: hablan con gente que todavia no esta
// en la base, asi que buscarla por documento no aporta y solo daria pie a
// teclear cedulas ajenas.
const IDENT = { identificar_titular: identificarTitular };

// El historial de solicitudes va con los mismos tramites que IDENT, mas
// recepcion: es la puerta donde mas llega el "es sobre lo de la otra vez", y sin
// esto tiene que volver a preguntarlo todo. Busca por el telefono de la entrada,
// que solo escribe el servidor, asi que no divulga nada de otra persona.
// Ventas y consignacion quedan fuera: hablan con gente que aun no ha pedido nada.
const HIST = ASISTIDOS;

// encuestas no se registra: esta fuera de AGENTES (ver protocol.ts).
const EXTRA: Record<Agente, Record<string, Tool>> = {
  recepcion:     { enviar_menu: enviarMenu, ...HIST },
  ventas:        VENTAS,
  consignacion:  CONSIGNACION,
  cartera:       CARTERA,
  mantenimiento: { ...MANTENIMIENTO, ...IDENT, ...HIST },
  avaluos:       { ...AVALUOS, ...IDENT, ...HIST },
  pqr:           { ...PQR, ...IDENT, ...HIST },
  matricula:     { ...MATRICULA, ...IDENT, ...HIST },
};

export function toolsDe(agente: Agente, habilitadas?: string[]): Record<string, Tool> {
  const todas = { ...COMUNES, ...(EXTRA[agente] || {}) };
  // AgentePrompt.tools_habilitadas permite recortar (nunca ampliar) el set sin
  // desplegar. `responder` no se puede quitar: sin ella el agente no habla.
  if (!habilitadas?.length) return todas;
  const permitidas = new Set([...habilitadas, 'responder']);
  return Object.fromEntries(Object.entries(todas).filter(([n]) => permitidas.has(n)));
}
