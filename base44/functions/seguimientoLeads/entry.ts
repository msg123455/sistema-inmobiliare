// Follow-up automático de leads que dejaron de responder.
// Diseñado para correr en cron cada ~30-60 min (Base44 schedule o cron externo).
// GET /api/functions/seguimientoLeads?token=SEGUIMIENTO2026   (agrega &dryrun=1 para simular)
//
// Cadencia al LEAD (medida desde su ÚLTIMO mensaje): 1er seguimiento 3h | 2do 20h.
// Ambos caen DENTRO de la ventana de 24h de Meta → texto libre sin plantilla.
// Con +24h de silencio ya no se le escribe (requeriria plantilla HSM aprobada).
// Los recordatorios a brokers van al grupo de Telegram (interno) → sin limite de 24h.
// Corre en cron (Base44 automation en function.jsonc) cada 30 min.

const TOKEN = 'SEGUIMIENTO2026';
const BASE_URL = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
// Follow-ups al LEAD por WhatsApp solo dentro de la ventana de 24h de Meta (texto
// libre sin plantilla). 3h y 20h caen dentro; +24h necesitaria plantilla.
const UMBRALES_H = [3, 20]; // horas de silencio para el seguimiento #1 y #2
const MAX_SEG = 2;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // El token puede venir por query (?token=, uso manual) o por el body (cuando lo
  // dispara la automation/cron de Base44, que hace POST con function_args).
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch {} }
  const token = url.searchParams.get('token') || body?.args?.token || body?.token || '';
  if (token !== TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const dryrun = url.searchParams.get('dryrun') === '1' || body?.args?.dryrun === true || body?.dryrun === true;

  const base44Key    = Deno.env.get('BASE44_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const waToken      = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  const waPhoneId    = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const tgToken      = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  // Horario hábil Bogotá (UTC-5): solo se ENVÍA entre 8:00 y 20:59.
  // En dryrun siempre escaneamos (para poder previsualizar a cualquier hora).
  const horaBogota = (new Date().getUTCHours() - 5 + 24) % 24;
  const fueraHorario = horaBogota < 8 || horaBogota >= 21;
  if (fueraHorario && !dryrun) {
    return new Response(JSON.stringify({ ok: true, skip: 'fuera de horario habil', hora_bogota: horaBogota }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  let registros = [];
  try {
    const r = await fetch(`${BASE_URL}/api/entities/MemoriaChat?limit=200`, { headers: hdrs });
    if (r.ok) registros = await r.json();
  } catch (err) { console.error('MemoriaChat load error:', err.message); }

  const ahora = Date.now();
  const resultados = [];
  const VENTANA_MAX_H = 23;   // fuera de esto se cierra la ventana de 24h de Meta (margen 1h)
  const MAX_ENVIOS_LEAD = 6;  // tope por corrida para no pasarse del limite de tiempo (el resto en la proxima)
  let procesadosLead = 0;

  for (const reg of registros) {
    let e;
    try { e = JSON.parse(reg.estado_json || '{}'); } catch { continue; }
    if (!e || typeof e !== 'object') continue;

    // Filtros: no calificados, no descalificados, y con el turno del lado del cliente
    if (e.calificado || e.descalificado) continue;
    const hist = e.historial || [];
    if (!hist.length) continue;
    if (hist[hist.length - 1]?.role !== 'assistant') continue; // esperamos respuesta del cliente

    const num = e.num_seguimientos || 0;
    if (num >= MAX_SEG) continue;

    const refIso = e.fecha_ultimo_cliente || reg.fecha_ultimo_mensaje;
    if (!refIso) continue;
    const silencioH = (ahora - new Date(refIso).getTime()) / 3_600_000;
    // Debe estar vencido el umbral Y todavia DENTRO de la ventana de 24h (sin plantilla).
    // Con +23h de silencio no se le escribe: Meta bloquearia el texto libre.
    if (silencioH < UMBRALES_H[num] || silencioH >= VENTANA_MAX_H) continue;

    // Tope por corrida (aplica a dryrun y real) para no colgar la funcion con Claude.
    if (procesadosLead >= MAX_ENVIOS_LEAD) break;
    procesadosLead++;

    // ── Generar el mensaje de seguimiento (Claude, con fallback) ──
    const d = e.datos || {};
    const texto = await generarSeguimiento(anthropicKey, e, num) || fallbackSeguimiento(d, num);

    resultados.push({ telefono: reg.telefono, canal: reg.canal, num_seguimiento: num + 1, silencio_h: Math.round(silencioH), texto });

    if (dryrun) continue;

    // ── Enviar según canal ──
    let enviado = false;
    if (reg.canal === 'Telegram' && tgToken) {
      enviado = await enviarTelegram(tgToken, reg.telefono, texto);
    } else if (waToken && waPhoneId) {
      enviado = await enviarWhatsApp(waPhoneId, waToken, reg.telefono, texto);
    }
    if (!enviado) { resultados[resultados.length - 1].error = 'envio fallido'; continue; }

    // ── Actualizar estado y MemoriaChat (NO tocamos fecha_ultimo_cliente) ──
    e.num_seguimientos = num + 1;
    e.historial = [...hist, { role: 'assistant', content: texto }].slice(-30);
    try {
      await fetch(`${BASE_URL}/api/entities/MemoriaChat/${reg.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({
          ...reg,
          estado_json: JSON.stringify(e),
          ultima_respuesta: texto,
          fecha_ultimo_mensaje: new Date().toISOString(),
        }),
      });
    } catch (err) { console.error('MemoriaChat update error:', err.message); }
  }

  // ── SEGUNDA PASADA: leads YA delegados al broker (post-entrega) ─────────────
  // Recuerda al broker si no avanza; escala a gerencia si el lead se enfría.
  // Cadencia por recordatorios_broker (r): r0 ≥4h · r1 ≥24h · r2 ≥48h (frío).
  const UMBRALES_BROKER_H = [4, 24, 48];
  const recordatorios = [];
  let brokersCfg = [];
  let grupoChat = '';
  try {
    const rc = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=1`, { headers: hdrs });
    if (rc.ok) { const arr = await rc.json(); brokersCfg = arr[0]?.brokers || []; grupoChat = arr[0]?.telegram_notif_chat || ''; }
  } catch {}

  const generoDe = (nombre) => {
    const b = brokersCfg.find((x) => x.nombre === nombre);
    return (b?.genero || '').toUpperCase();
  };
  const rolBroker = (nombre) => {
    const primer = (nombre || '').trim().split(/\s+/)[0] || 'tu asesor';
    if (/inmobiliaria|nd\b/i.test(nombre || '')) return 'el equipo';
    return `${generoDe(nombre) === 'M' ? 'asesor' : 'asesora'} ${primer}`;
  };

  if (grupoChat && tgToken) {
    let delegados = [];
    try {
      const rd = await fetch(`${BASE_URL}/api/entities/Contacto?ia_calificado=true&limit=200`, { headers: hdrs });
      if (rd.ok) delegados = await rd.json();
    } catch (err) { console.error('Delegados load error:', err.message); }

    const ACTIVOS = ['Asignado', 'Contactado', 'No_Contesta'];
    const MAX_RECORD = 12; // tope por corrida (Telegram es rapido, pero acotamos el tiempo total)
    for (const c of delegados) {
      if (recordatorios.length >= MAX_RECORD) break;
      if (c.descalificado) continue;
      if (!ACTIVOS.includes(c.estado_seguimiento || 'Asignado')) continue;
      const r = Number(c.recordatorios_broker) || 0;
      if (r >= 3) continue;

      const refIso = c.fecha_ultimo_avance || c.fecha_asignacion;
      if (!refIso) continue;
      const horas = (ahora - new Date(refIso).getTime()) / 3_600_000;
      if (horas < UMBRALES_BROKER_H[r]) continue;

      const primer = (c.nombre || 'el lead').trim().split(/\s+/)[0];
      const wa = `wa.me/${String(c.telefono || '').replace(/\D/g, '')}`;
      const h = Math.round(horas);
      let texto;
      if (r === 0)      texto = `🔔 Recordatorio: ${rolBroker(c.asignado_a)}, el lead ${primer} (${wa}) sigue esperando tu contacto. Lleva ${h}h asignado.`;
      else if (r === 1) texto = `⏰ Segundo aviso: ${primer} (${wa}) lleva ${h}h sin avance con ${rolBroker(c.asignado_a)}. ¿Ya lo contactaste?`;
      else              texto = `🥶 LEAD ENFRIÁNDOSE: ${primer} (${wa}) lleva ${h}h asignado a ${rolBroker(c.asignado_a)} sin avance. Requiere atención de gerencia.`;

      recordatorios.push({ contacto: c.nombre, telefono: c.telefono, broker: c.asignado_a, nivel: r + 1, horas: h, texto });
      if (dryrun) continue;

      const ok = await enviarTelegram(tgToken, grupoChat, texto);
      if (!ok) { recordatorios[recordatorios.length - 1].error = 'envio fallido'; continue; }
      try {
        await fetch(`${BASE_URL}/api/entities/Contacto/${c.id}`, {
          method: 'PUT', headers: hdrs,
          body: JSON.stringify({ ...c, recordatorios_broker: r + 1 }),
        });
      } catch (err) { console.error('Contacto recordatorio update error:', err.message); }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    dryrun,
    hora_bogota: horaBogota,
    revisados: registros.length,
    seguimientos: resultados.length,
    detalle: resultados,
    recordatorios_broker: recordatorios.length,
    detalle_recordatorios: recordatorios,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

// ─────────────────────────────────────────────────────────────────────────────

async function generarSeguimiento(anthropicKey, e, num) {
  if (!anthropicKey) return null;
  const d = e.datos || {};
  const hist = (e.historial || []).slice(-6).map(m => `${m.role === 'user' ? 'Cliente' : 'Valentina'}: ${m.content}`).join('\n');
  const faltan = [
    !d.operacion && 'si es compra o arriendo',
    !d.tipo_prop && 'tipo de inmueble',
    !d.barrio && 'zona',
    !d.presupuesto && 'presupuesto',
  ].filter(Boolean).join(', ');

  const nivel = num === 0
    ? 'PRIMER recordatorio (lleva pocas horas sin responder): calido, natural, retoma justo donde quedo la charla.'
    : num === 1
    ? 'SEGUNDO recordatorio (lleva ~1 dia): amable, aporta un motivo para retomar (una opcion nueva, una duda que resolver), sin presionar.'
    : 'TERCER y ULTIMO recordatorio (varios dias): elegante y sin insistir, dejando la puerta abierta para cuando quiera retomar.';

  const system = `Eres Valentina Ospina, asesora senior de ND Inmobiliaria. Escribe UN solo mensaje corto de seguimiento por WhatsApp para un cliente que dejo de responder.

TONO: profesional y calido, como asesora de banca privada. Tuteo con "tu". PROHIBIDO: "uy", "bacano", voseo (vos/tenes/contas), "jajaja", emojis. Maximo 2 oraciones. Natural, humano, nada de sonar a plantilla automatica.

${nivel}
${faltan ? `Aun no sabes: ${faltan}. Puedes invitar suavemente a retomar por ahi.` : 'Ya tienes sus datos clave; el objetivo es que retome la conversacion.'}

Contexto de la conversacion:
${hist}

Responde SOLO con el texto del mensaje, sin comillas ni prefijos.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system, messages: [{ role: 'user', content: 'Escribe el mensaje de seguimiento.' }] }),
    });
    if (!r.ok) { console.error('Claude seguimiento error:', r.status); return null; }
    const j = await r.json();
    const t = (j.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '');
    return t || null;
  } catch (err) { console.error('Claude seguimiento error:', err.message); return null; }
}

function fallbackSeguimiento(d, num) {
  const nombre = d.nombre ? ` ${d.nombre}` : '';
  const tipo = d.tipo_prop || 'inmueble';
  if (num === 0) return `Hola${nombre}, quedé pendiente de tu respuesta. ¿Seguimos con la búsqueda del ${tipo}? Cuando tengas un momento me cuentas.`;
  if (num === 1) return `Hola${nombre}, te escribo de nuevo por si te quedó alguna duda. Sigo con toda la disposición de ayudarte a encontrar lo que buscas.`;
  return `Hola${nombre}, no quiero robarte tiempo. Si más adelante retomas la búsqueda, aquí estoy para ayudarte. Que te vaya muy bien.`;
}

async function enviarWhatsApp(waPhoneId, waToken, telefono, texto) {
  let tel = String(telefono).replace(/\D/g, '');
  if (!tel.startsWith('57')) tel = '57' + tel;
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: texto } }),
    });
    if (!r.ok) { console.error('WA follow-up error:', r.status, (await r.text()).slice(0, 200)); return false; }
    return true;
  } catch (err) { console.error('WA follow-up error:', err.message); return false; }
}

async function enviarTelegram(tgToken, chatId, texto) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text: texto }),
    });
    return r.ok;
  } catch (err) { console.error('TG follow-up error:', err.message); return false; }
}
