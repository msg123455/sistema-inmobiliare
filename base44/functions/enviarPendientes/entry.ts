// Envía las respuestas de Valentina que quedaron ENCOLADAS con demora humana.
// Los webhooks guardan e.pendiente_envio = { globos, enviar_en, canal, destino }.
// Esta función corre cada minuto (cron) y manda las que ya cumplieron su hora.
// GET/POST  /api/functions/enviarPendientes?token=SYNCWASI2026
// IMPORTANTE: Base44 corta a ~15s → tope de leads por corrida y sin pausas largas.

const MAX_LEADS_POR_CORRIDA = 6;

Deno.serve(async (req) => {
  const BASE_URL  = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs      = { 'api_key': base44Key, 'Content-Type': 'application/json' };
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const waToken   = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  const tgToken   = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch {}
  if ((url.searchParams.get('token') || body.token || '') !== 'SYNCWASI2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  if (!base44Key) {
    return new Response(JSON.stringify({ error: 'BASE44_API_KEY no configurado' }), { status: 500 });
  }

  // El filtro por campo de Base44 no es confiable → cargar todo y filtrar en código
  const rN = await fetch(`${BASE_URL}/api/entities/Nota?limit=500`, { headers: hdrs });
  const notas: any[] = rN.ok ? await rN.json() : [];
  const ahora = Date.now();

  const enviarWa = async (destino: string, texto: string) => {
    const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
    });
    return r.ok;
  };
  const enviarTg = async (chatId: any, texto: string) => {
    const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text: texto }),
    });
    return r.ok;
  };

  let enviados = 0, globosEnviados = 0;
  const detalle: any[] = [];

  for (const n of notas) {
    if (enviados >= MAX_LEADS_POR_CORRIDA) break; // tope por el limite de 15s
    let e: any;
    try { e = JSON.parse(n.texto || '{}'); } catch { continue; }
    const p = e.pendiente_envio;
    if (!p || !Array.isArray(p.globos) || p.globos.length === 0) continue;
    if (Number(p.enviar_en || 0) > ahora) continue; // aun no es su hora

    let ok = false;
    if (p.canal === 'telegram' && tgToken) {
      ok = true;
      for (const g of p.globos) { if (!(await enviarTg(p.destino, g))) ok = false; globosEnviados++; }
    } else if (p.canal === 'whatsapp' && waPhoneId && waToken) {
      ok = true;
      for (const g of p.globos) { if (!(await enviarWa(p.destino, g))) ok = false; globosEnviados++; }
    }

    // Poner la HORA REAL de envío en el último mensaje de Valentina (para el panel)
    if (ok && Array.isArray(e.historial)) {
      for (let k = e.historial.length - 1; k >= 0; k--) {
        if (e.historial[k].role === 'assistant') { e.historial[k].ts = new Date().toISOString(); break; }
      }
    }
    // Limpiar el pendiente y guardar (evita reenvíos). Si falló, queda en el detalle.
    e.pendiente_envio = null;
    try {
      await fetch(`${BASE_URL}/api/entities/Nota/${n.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...n, texto: JSON.stringify(e), fecha_nota: new Date().toISOString() }),
      });
    } catch (err) { console.error('Nota clear error:', err?.message || err); }

    enviados++;
    detalle.push({ tel: n.cliente_id, canal: p.canal, globos: p.globos.length, ok });
  }

  return new Response(JSON.stringify({ ok: true, leads_enviados: enviados, globos: globosEnviados, detalle }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
});
