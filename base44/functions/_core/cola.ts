// Encolado de salida. El webhook NUNCA entrega inline.
//
// Antes la funcion dormia hasta 5s dentro del request para simular tipeo, con
// un presupuesto total de 15s. Ahora escribe en ColaSalida y retorna; la
// simulacion la hace enviarPendientes. `demora_respuesta_min = 0` pasa a
// significar "encolar con delay 0", no "enviar inline".

import type { Db } from './db.ts';
import type { Canal } from './protocol.ts';

export async function encolar(
  db: Db,
  datos: { canal: Canal; destino: string; globos: string[]; demoraMin?: number; conversacionId?: string },
) {
  const globos = datos.globos.map((g) => String(g).trim()).filter(Boolean);
  if (!globos.length) return null;
  return await db.crear('ColaSalida', {
    canal: datos.canal,
    destino: datos.destino,
    globos,
    enviar_en: new Date(Date.now() + (datos.demoraMin || 0) * 60_000).toISOString(),
    estado: 'pendiente',
    intentos: 0,
    conversacion_id: datos.conversacionId || '',
    error: '',
  });
}

// Notificaciones internas al equipo. NUNCA al chat del cliente: el destino sale
// de configuracion, y se compara contra el remitente antes de enviar.
export async function notificarEquipo(config: Record<string, any>, telCliente: string, mensajes: string[]) {
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
