// Retirado: el motor multiagente escribe Contacto e HistorialLead directamente.
// La version anterior reimportaba estados del bot monolitico desde Nota y podia
// sobrescribir el CRM con datos obsoletos.

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

  return json({
    ok: false,
    retirado: true,
    motivo: 'Contacto ya es actualizado en tiempo real por agenteInbound; syncCRM no debe ejecutarse.',
  }, 410);
});
