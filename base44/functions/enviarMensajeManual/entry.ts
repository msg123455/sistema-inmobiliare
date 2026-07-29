// Envia un mensaje MANUAL (escrito por una persona desde la Bandeja) al cliente
// y lo registra en MemoriaChat para que aparezca en el hilo.
//
// POST { tel, canal?, mensaje, token }
//
// En WhatsApp, Meta solo permite texto libre dentro de la ventana de 24h desde
// el ultimo mensaje del cliente; fuera de ella hace falta una plantilla aprobada.

const withTimeout = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, api_key',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const BASE_URL = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const hdrs = { api_key: Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const waToken = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

  let body: any = {};
  try { body = await req.json(); } catch { /* body vacio */ }

  const esperado = Deno.env.get('BANDEJA_TOKEN') || '';
  if (!esperado || String(body.token || '') !== esperado) return json({ error: 'Unauthorized' }, 401);
  if (!BASE_URL) return json({ error: 'BASE44_APP_URL no configurada' }, 500);

  const tel = String(body.tel || '').replace(/\D/g, '');
  const mensaje = String(body.mensaje || '').trim();
  const canal = String(body.canal || 'whatsapp').toLowerCase() === 'telegram' ? 'telegram' : 'whatsapp';
  if (!tel || !mensaje) return json({ error: 'Falta tel o mensaje' }, 400);

  // ── 1. Entregar ──────────────────────────────────────────────────────────
  const to = withTimeout(10_000);
  try {
    if (canal === 'telegram') {
      if (!tgToken) return json({ error: 'TELEGRAM_BOT_TOKEN no configurado' }, 500);
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(tel), text: mensaje }), signal: to.signal,
      });
      if (!r.ok) return json({ error: `Telegram ${r.status}: ${(await r.text()).slice(0, 300)}` }, 400);
    } else {
      if (!waPhoneId || !waToken) return json({ error: 'Credenciales de WhatsApp no configuradas' }, 500);
      const destino = tel.startsWith('57') ? tel : '57' + tel;
      const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: mensaje } }),
        signal: to.signal,
      });
      // 131047 / 470 = fuera de la ventana de 24h -> hace falta plantilla aprobada
      if (!r.ok) return json({ error: `Meta ${r.status}: ${(await r.text()).slice(0, 300)}` }, 400);
    }
  } catch (err) {
    return json({ error: `No se pudo conectar (timeout o red): ${String((err as Error)?.message || err).slice(0, 150)}` }, 502);
  } finally { to.done(); }

  // ── 2. Registrar en MemoriaChat, unico almacen de estado ─────────────────
  // humano:true hace que la Bandeja lo pinte como "Tu (manual)".
  const turno = { role: 'assistant', content: mensaje, globos: [mensaje], humano: true, ts: new Date().toISOString() };
  try {
    const clave = `${canal === 'telegram' ? 'tg' : 'wa'}:${tel}`;
    const g = withTimeout(4000);
    let arr: any[] = [];
    const rC = await fetch(`${BASE_URL}/api/entities/MemoriaChat?clave=${encodeURIComponent(clave)}&limit=1`, { headers: hdrs, signal: g.signal });
    if (rC.ok) arr = await rC.json();
    if (!arr.length) {
      const rT = await fetch(`${BASE_URL}/api/entities/MemoriaChat?telefono=${encodeURIComponent(tel)}&limit=1`, { headers: hdrs });
      if (rT.ok) arr = await rT.json();
    }
    g.done();

    if (arr[0]) {
      let e: any = {};
      try { e = JSON.parse(arr[0].estado_json || '{}'); } catch { /* estado corrupto */ }
      if (!Array.isArray(e.historial)) e.historial = [];
      e.historial.push(turno);
      e.historial = e.historial.slice(-40);
      const p = withTimeout(4000);
      await fetch(`${BASE_URL}/api/entities/MemoriaChat/${arr[0].id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({
          ...arr[0], estado_json: JSON.stringify(e),
          ultima_respuesta: mensaje, fecha_ultimo_mensaje: new Date().toISOString(),
        }),
        signal: p.signal,
      });
      p.done();
    }
  } catch (err) {
    console.error('MemoriaChat update (no critico):', (err as Error)?.message || err);
  }

  return json({ ok: true }, 200);
});
