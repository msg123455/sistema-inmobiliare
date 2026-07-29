// Diagnóstico de credenciales — solo para admin, no dejar en producción.
// GET /api/functions/checkCredenciales?token=CHECK2026

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'CHECK2026') {
    return new Response('Unauthorized', { status: 401 });
  }

  const vars = [
    'BASE44_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'WHATSAPP_API_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'TELEGRAM_BOT_TOKEN',
    'WASI_API_KEY',
    'WASI_USER_ID',
  ];

  const resultado: Record<string, string> = {};

  for (const v of vars) {
    const val = Deno.env.get(v);
    if (!val) {
      resultado[v] = '❌ NO ENCONTRADA';
    } else {
      // Muestra solo primeros y últimos 4 caracteres por seguridad
      const masked = val.length > 8
        ? `✅ ${val.slice(0, 4)}...${val.slice(-4)} (${val.length} chars)`
        : `✅ ${'*'.repeat(val.length)} (${val.length} chars)`;
      resultado[v] = masked;
    }
  }

  // Test rápido de BASE44_API_KEY
  let base44Test = 'no probado';
  const base44Key = Deno.env.get('BASE44_API_KEY');
  if (base44Key) {
    try {
      const r = await fetch(`${Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app'}/api/entities/ConfigAgente?limit=1`, {
        headers: { 'api_key': base44Key }
      });
      base44Test = r.ok ? `✅ OK (${r.status})` : `❌ Error ${r.status}`;
    } catch (e) {
      base44Test = `❌ ${e.message}`;
    }
  }

  // Test rápido de ANTHROPIC_API_KEY
  let anthropicTest = 'no probado';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hola' }] })
      });
      anthropicTest = r.ok ? `✅ OK (${r.status})` : `❌ Error ${r.status}: ${(await r.text()).slice(0, 100)}`;
    } catch (e) {
      anthropicTest = `❌ ${e.message}`;
    }
  }

  // Test rápido de OPENAI_API_KEY (para Whisper / notas de voz)
  let openaiTest = 'no probado';
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/models?limit=1', {
        headers: { Authorization: `Bearer ${openaiKey}` }
      });
      openaiTest = r.ok ? `✅ OK (${r.status})` : `❌ Error ${r.status}: ${(await r.text()).slice(0, 100)}`;
    } catch (e) {
      openaiTest = `❌ ${e.message}`;
    }
  }

  // Test rápido de WHATSAPP token
  let waTest = 'no probado';
  const waToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (waToken && waPhoneId) {
    try {
      const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}`, {
        headers: { Authorization: `Bearer ${waToken}` }
      });
      waTest = r.ok ? `✅ OK (${r.status})` : `❌ Error ${r.status}: ${(await r.text()).slice(0, 100)}`;
    } catch (e) {
      waTest = `❌ ${e.message}`;
    }
  }

  return new Response(JSON.stringify({
    variables: resultado,
    tests: {
      base44_api: base44Test,
      anthropic:  anthropicTest,
      openai:     openaiTest,
      whatsapp:   waTest,
    }
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
