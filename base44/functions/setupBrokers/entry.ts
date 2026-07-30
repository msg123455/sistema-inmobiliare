// Retirado: sembraba asesores del tenant anterior dentro de ConfigAgente.
// Los asesores de INMOBILIARE se administran en la entidad Asesor.

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
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
  return json({ ok: false, retirado: true, motivo: 'Usa Equipo > Asesores.' }, 410);
});
