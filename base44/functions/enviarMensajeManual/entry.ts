// Envía un mensaje MANUAL (escrito por un humano desde la Bandeja) al lead por
// WhatsApp (Meta Cloud API) y lo registra en la Nota para que aparezca en el chat.
// POST { token: "SYNCWASI2026", tel: "573...", mensaje: "..." }
// Meta solo permite texto libre dentro de la ventana de 24h desde el último
// mensaje del lead; fuera de esa ventana devuelve error (haría falta plantilla).
// IMPORTANTE: Base44 mata la función a ~15s → todo va con timeout y mínimo de llamadas.

const withTimeout = (ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, api_key',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  // Preflight CORS (el navegador lo manda antes del POST)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const BASE_URL  = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs      = { 'api_key': base44Key, 'Content-Type': 'application/json' };
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const waToken   = Deno.env.get('WHATSAPP_API_TOKEN') || '';

  let body: any = {};
  try { body = await req.json(); } catch {}
  if ((body.token || '') !== 'SYNCWASI2026') {
    return json({ error: 'Unauthorized' }, 401);
  }

  const tel     = String(body.tel || '').replace(/\D/g, '');
  const mensaje = String(body.mensaje || '').trim();
  if (!tel || !mensaje) {
    return json({ error: 'Falta tel o mensaje' }, 400);
  }
  if (!waPhoneId || !waToken) {
    return json({ error: 'WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_API_TOKEN no configurados en los secretos' }, 500);
  }

  // ── 1. Enviar por Meta (con timeout de 10s para no colgar la función) ──────
  const destino = tel.startsWith('57') ? tel : '57' + tel;
  const to = withTimeout(10000);
  let waStatus = 0, waBody = '';
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: mensaje } }),
      signal: to.signal,
    });
    waStatus = r.status;
    waBody = await r.text();
  } catch (err) {
    return json({ error: `No se pudo conectar con Meta (timeout/red): ${String(err?.message || err).slice(0, 150)}` }, 502);
  } finally { to.done(); }

  let metaId = '';
  try { metaId = JSON.parse(waBody)?.messages?.[0]?.id || ''; } catch {}

  if (waStatus < 200 || waStatus >= 300) {
    // 131047 / 470 = fuera de la ventana de 24h → hace falta plantilla aprobada
    return json({ error: `Meta ${waStatus}: ${waBody.slice(0, 300)}` }, 400);
  }

  const turno = { role: 'assistant', content: mensaje, humano: true, ts: new Date().toISOString() }; // humano:true → se ve como "Tú" en la UI

  // ── 2. Registrar en la Nota (Bandeja) — best-effort ────────────────────────
  try {
    const g = withTimeout(4000);
    const rN = await fetch(`${BASE_URL}/api/entities/Nota?cliente_id=${encodeURIComponent(tel)}&limit=1`, { headers: hdrs, signal: g.signal });
    g.done();
    const arr = rN.ok ? await rN.json() : [];
    if (arr[0]) {
      let e: any = {};
      try { e = JSON.parse(arr[0].texto || '{}'); } catch {}
      if (!Array.isArray(e.historial)) e.historial = [];
      e.historial.push(turno);
      e.historial = e.historial.slice(-40);
      const p = withTimeout(4000);
      await fetch(`${BASE_URL}/api/entities/Nota/${arr[0].id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...arr[0], texto: JSON.stringify(e), fecha_nota: new Date().toISOString() }),
        signal: p.signal,
      });
      p.done();
    }
  } catch (err) { console.error('Nota update (no crítico):', err?.message || err); }

  // ── 3. Registrar en MemoriaChat (la fuente que lee el webhook) — best-effort ─
  try {
    const g = withTimeout(4000);
    const rM = await fetch(`${BASE_URL}/api/entities/MemoriaChat?telefono=${encodeURIComponent(tel)}&limit=1`, { headers: hdrs, signal: g.signal });
    g.done();
    const arr = rM.ok ? await rM.json() : [];
    if (arr[0]) {
      let e: any = {};
      try { e = JSON.parse(arr[0].estado_json || '{}'); } catch {}
      if (!Array.isArray(e.historial)) e.historial = [];
      e.historial.push(turno);
      e.historial = e.historial.slice(-40);
      const p = withTimeout(4000);
      await fetch(`${BASE_URL}/api/entities/MemoriaChat/${arr[0].id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...arr[0], estado_json: JSON.stringify(e), ultima_respuesta: mensaje, fecha_ultimo_mensaje: new Date().toISOString() }),
        signal: p.signal,
      });
      p.done();
    }
  } catch (err) { console.error('MemoriaChat update (no crítico):', err?.message || err); }

  return json({ ok: true, meta_id: metaId }, 200);
});