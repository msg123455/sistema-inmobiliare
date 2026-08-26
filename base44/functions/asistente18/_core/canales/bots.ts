import { esAgente, type Agente } from '../protocol.ts';

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

/** Token del bot de un agente. Cae al bot compartido si no tiene uno propio. */
export function tokenDeAgente(agente?: string | null): string {
  const compartido = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  if (!agente || !esAgente(agente)) return compartido;
  return Deno.env.get(VAR_POR_AGENTE[agente]) || compartido;
}

/**
 * Agente al que pertenece esta peticion, segun `?agente=` de la URL del webhook.
 * Devuelve null si no viene o no es valido — ahi manda el router, como siempre.
 */
export function agenteDeUrl(url: URL): Agente | null {
  const v = url.searchParams.get('agente');
  return v && esAgente(v) ? v : null;
}

/** Agentes que hoy tienen bot propio configurado. Util para diagnostico. */
export function agentesConBot(): Agente[] {
  return (Object.keys(VAR_POR_AGENTE) as Agente[])
    .filter((a) => !!Deno.env.get(VAR_POR_AGENTE[a]));
}
