// Diagnostico seguro de configuracion. Nunca devuelve fragmentos de secretos.
// GET/POST /api/functions/checkCredenciales?token=<CRON_TOKEN>

const OBLIGATORIAS = [
  'BASE44_APP_URL',
  'BASE44_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CRON_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
];

const WHATSAPP = [
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'META_APP_SECRET',
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET o body vacio */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  const recibido = url.searchParams.get('token') || body?.token || body?.args?.token || '';
  if (!esperado || recibido !== esperado) return json({ error: 'Unauthorized' }, 401);

  const estado = (nombres: string[]) => Object.fromEntries(
    nombres.map((nombre) => [nombre, Boolean(Deno.env.get(nombre))]),
  );
  const requeridas = estado(OBLIGATORIAS);
  const whatsapp = estado(WHATSAPP);

  let base44Api = false;
  const base = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const key = Deno.env.get('BASE44_API_KEY') || '';
  if (base && key) {
    try {
      const r = await fetch(`${base}/api/entities/ConfigAgente?limit=1`, { headers: { api_key: key } });
      base44Api = r.ok;
    } catch { /* se reporta false */ }
  }

  return json({
    ok: Object.values(requeridas).every(Boolean) && base44Api,
    configuradas: requeridas,
    whatsapp_cutover: whatsapp,
    conectividad: { base44_api: base44Api },
  });
});
