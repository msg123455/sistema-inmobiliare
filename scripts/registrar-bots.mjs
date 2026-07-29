#!/usr/bin/env node
/**
 * Registra el webhook de cada bot de Telegram apuntando a agenteInbound.
 *
 * Telegram no dice en el payload cual de tus bots recibio el mensaje, asi que
 * cada bot se registra con `?agente=<clave>` en la URL. De ahi sale a que
 * agente pertenece la conversacion.
 *
 * Los tokens se leen del entorno; NUNCA se escriben aqui ni en el repo. Uso:
 *
 *   BASE44_APP_URL=https://tu-app.base44.app \
 *   TELEGRAM_BOT_RECEPCION=... TELEGRAM_BOT_VENTAS=... \
 *   node scripts/registrar-bots.mjs
 *
 *   node scripts/registrar-bots.mjs --estado    (solo consulta, no cambia nada)
 *   node scripts/registrar-bots.mjs --borrar    (quita los webhooks)
 */

const AGENTES = [
  'recepcion', 'ventas', 'consignacion', 'cartera', 'mantenimiento',
  'avaluos', 'pqr', 'matricula', 'encuestas',
];

const variableDe = (a) => `TELEGRAM_BOT_${a.toUpperCase()}`;

const APP = String(process.env.BASE44_APP_URL || '').replace(/\/+$/, '');
const modo = process.argv.includes('--estado') ? 'estado'
  : process.argv.includes('--borrar') ? 'borrar'
  : 'registrar';

if (modo !== 'estado' && !APP) {
  console.error('Falta BASE44_APP_URL (ej: https://tu-app.base44.app)');
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

const configurados = AGENTES.filter((a) => process.env[variableDe(a)]);

if (!configurados.length) {
  console.error('Ningun TELEGRAM_BOT_<AGENTE> definido en el entorno.');
  console.error(`Esperaba alguno de: ${AGENTES.map(variableDe).join(', ')}`);
  process.exit(1);
}

let fallos = 0;

for (const agente of configurados) {
  const token = process.env[variableDe(agente)];
  const etiqueta = agente.padEnd(14);
  try {
    // Confirma que el token es valido y de que bot es, antes de tocar nada.
    const yo = await api(token, 'getMe');

    if (modo === 'estado') {
      const w = await api(token, 'getWebhookInfo');
      const destino = w.url || '(sin webhook)';
      const pend = w.pending_update_count ? ` · ${w.pending_update_count} pendientes` : '';
      const err = w.last_error_message ? ` · ULTIMO ERROR: ${w.last_error_message}` : '';
      console.log(`${etiqueta} @${yo.username}\n${' '.repeat(16)}${destino}${pend}${err}`);
      continue;
    }

    if (modo === 'borrar') {
      await api(token, 'deleteWebhook', { drop_pending_updates: false });
      console.log(`${etiqueta} @${yo.username} — webhook borrado`);
      continue;
    }

    const url = `${APP}/api/functions/agenteInbound?agente=${agente}`;
    await api(token, 'setWebhook', {
      url,
      // Solo mensajes: sin esto llegan ediciones y callbacks que hoy no se usan.
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    console.log(`${etiqueta} @${yo.username} -> ${url}`);
  } catch (e) {
    fallos++;
    console.error(`${etiqueta} ERROR: ${e.message}`);
  }
}

const sinBot = AGENTES.filter((a) => !process.env[variableDe(a)]);
if (sinBot.length) {
  console.log(`\nSin bot propio (responden por TELEGRAM_BOT_TOKEN): ${sinBot.join(', ')}`);
}
process.exit(fallos ? 1 : 0);
