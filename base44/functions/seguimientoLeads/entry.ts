// Seguimiento automatico de leads: pausado hasta migrarlo al Estado v2.
//
// La implementacion anterior leia `estado.datos`, `estado.calificado` y otros
// campos del bot monolitico. El motor multiagente guarda esos datos dentro del
// scratchpad de cada agente. Ejecutar la rutina vieja podia contactar al lead
// con contexto incorrecto, por eso este endpoint falla de forma explicita aun
// si alguien lo invoca manualmente.

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
    deshabilitado: true,
    motivo: 'Pendiente migrar seguimientoLeads al Estado v2 multiagente y aprobar su politica de contacto.',
  }, 503);
});
