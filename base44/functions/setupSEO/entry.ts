// Siembra ConfigSEO con los datos reales de ND Inmobiliaria (idempotente).
// GET /api/functions/setupSEO?token=SEOND2026

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'SEOND2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const BASE_URL  = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  const config = {
    clave:               'general',
    nombre_inmobiliaria: 'ND Inmobiliaria',
    ciudad_principal:    'Bogotá',
    anos_experiencia:    '17',
    descripcion_marca:   'Firma boutique fundada por Natalia Duque, especializada en el mercado inmobiliario de alto valor de la zona norte de Bogotá. Venta, arriendo y oficinas en barrios estrato 6 entre la calle 70 y la calle 134. Trabaja con corredores externos bajo comisión compartida.',
    zonas: [
      'Los Rosales', 'La Cabrera', 'El Nogal', 'El Refugio', 'El Bagazal',
      'Chicó Norte', 'Chicó Reservado', 'Chicó Alto', 'Rincón del Chicó',
      'Santa Ana Oriental', 'Santa Bárbara', 'Usaquén', 'La Carolina', 'El Retiro',
    ],
    rango_venta_min:    1_000_000_000,
    rango_arriendo_min: 5_000_000,
    interlinks:         [],
    activo:             true,
  };

  try {
    const r = await fetch(`${BASE_URL}/api/entities/ConfigSEO?limit=5`, { headers: hdrs });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `No se pudo leer ConfigSEO (${r.status}). ¿Ya está registrada la entidad?`, detalle: (await r.text()).slice(0, 300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const arr = await r.json();
    const existente = arr.find((c: any) => c.clave === 'general') || arr[0];

    if (existente?.id) {
      const ru = await fetch(`${BASE_URL}/api/entities/ConfigSEO/${existente.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...existente, ...config }),
      });
      if (!ru.ok) {
        return new Response(JSON.stringify({ error: `PUT ${ru.status}`, detalle: (await ru.text()).slice(0, 300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, accion: 'actualizado', id: existente.id, zonas: config.zonas.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const rc = await fetch(`${BASE_URL}/api/entities/ConfigSEO`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(config),
    });
    if (!rc.ok) {
      return new Response(JSON.stringify({ error: `POST ${rc.status}`, detalle: (await rc.text()).slice(0, 300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const creado = await rc.json();
    return new Response(JSON.stringify({ ok: true, accion: 'creado', id: creado.id, zonas: config.zonas.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
