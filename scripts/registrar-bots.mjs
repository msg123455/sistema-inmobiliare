#!/usr/bin/env node
/**
 * Consulta, registra o borra los webhooks de Telegram de los ocho agentes.
 *
 * El bot compartido apunta a agenteInbound sin query-string para probar el
 * router. Cada bot dedicado apunta a `?agente=<clave>` para aislar ese agente.
 * Todos envian TELEGRAM_WEBHOOK_SECRET en el header oficial de Telegram.
 *
 * Uso:
 *   node scripts/registrar-bots.mjs --estado
 *   node scripts/registrar-bots.mjs
 *   node scripts/registrar-bots.mjs --borrar
 */

const AGENTES = [
  'recepcion', 'ventas', 'consignacion', 'cartera', 'mantenimiento',
  'avaluos', 'pqr', 'matricula',
];

const variableDe = (agente) => `TELEGRAM_BOT_${agente.toUpperCase()}`;
const APP = String(process.env.BASE44_APP_URL || '').replace(/\/+$/, '');
const SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || '');
const modo = process.argv.includes('--estado') ? 'estado'
  : process.argv.includes('--borrar') ? 'borrar'
    : 'registrar';

if (modo === 'registrar' && !APP) {
  console.error('Falta BASE44_APP_URL (ej: https://tu-app.base44.app)');
  process.exit(1);
}
if (modo === 'registrar' && !/^[A-Za-z0-9_-]{1,256}$/.test(SECRET)) {
  console.error('Falta TELEGRAM_WEBHOOK_SECRET o contiene caracteres no permitidos. Usa solo A-Z, a-z, 0-9, _ y -.');
  process.exit(1);
}

async function api(token, metodo, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `HTTP ${r.status}`);
  return j.result;
}

const candidatos = [];
if (process.env.TELEGRAM_BOT_TOKEN) {
  candidatos.push({ clave: 'compartido', agente: null, token: process.env.TELEGRAM_BOT_TOKEN });
}
for (const agente of AGENTES) {
  const token = process.env[variableDe(agente)];
  if (token) candidatos.push({ clave: agente, agente, token });
}

// Un mismo token no puede representar dos webhooks. Conserva el primero y
// muestra el error de configuracion en vez de pisarlo silenciosamente.
const vistos = new Map();
const bots = [];
for (const bot of candidatos) {
  if (vistos.has(bot.token)) {
    console.error(`${bot.clave}: usa el mismo token que ${vistos.get(bot.token)}; se omite`);
    continue;
  }
  vistos.set(bot.token, bot.clave);
  bots.push(bot);
}

if (!bots.length) {
  console.error('No hay TELEGRAM_BOT_TOKEN ni TELEGRAM_BOT_<AGENTE> definidos en el entorno.');
  process.exit(1);
}

let fallos = 0;
for (const bot of bots) {
  const etiqueta = bot.clave.padEnd(14);
  try {
    const yo = await api(bot.token, 'getMe');
    if (modo === 'estado') {
      const w = await api(bot.token, 'getWebhookInfo');
      const destino = w.url || '(sin webhook)';
      const pend = w.pending_update_count ? ` · ${w.pending_update_count} pendientes` : '';
      const err = w.last_error_message ? ` · ULTIMO ERROR: ${w.last_error_message}` : '';
      console.log(`${etiqueta} @${yo.username}\n${' '.repeat(16)}${destino}${pend}${err}`);
      continue;
    }

    if (modo === 'borrar') {
      await api(bot.token, 'deleteWebhook', { drop_pending_updates: false });
      console.log(`${etiqueta} @${yo.username} - webhook borrado`);
      continue;
    }

    const url = `${APP}/api/functions/agenteInbound${bot.agente ? `?agente=${bot.agente}` : ''}`;
    await api(bot.token, 'setWebhook', {
      url,
      secret_token: SECRET,
      allowed_updates: ['message'],
      // Registrar no debe destruir mensajes que ya estaban esperando.
      drop_pending_updates: false,
    });
    console.log(`${etiqueta} @${yo.username} -> ${url}`);
  } catch (e) {
    fallos++;
    console.error(`${etiqueta} ERROR: ${e.message}`);
  }
}

const sinBot = AGENTES.filter((a) => !process.env[variableDe(a)]);
if (sinBot.length && process.env.TELEGRAM_BOT_TOKEN) {
  console.log(`\nSin bot propio (pasan por el bot compartido y el router): ${sinBot.join(', ')}`);
}
process.exit(fallos ? 1 : 0);
