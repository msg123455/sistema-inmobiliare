// Siembra ConfigSEO con la identidad de INMOBILIARE Julio Corredor (idempotente).
// GET /api/functions/setupSEO?token=SEOND2026

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'SEOND2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const BASE_URL  = Deno.env.get('BASE44_APP_URL') || '';
  // Sin la variable, esta funcion escribiria contra el tenant del que se clono
  // la app. Antes ese era el valor por defecto; ahora falla ruidoso.
  if (!BASE_URL) {
    console.error('BASE44_APP_URL no configurada');
    return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  // Siembra la identidad de INMOBILIARE. Antes sembraba la de ND Inmobiliaria
  // —el tenant del que se clonó esta app— con sus barrios de estrato 6 y sus
  // pisos de $1.000M / $5M, que describen otra empresa y otro mercado.
  //
  // `zonas` y los rangos van VACÍOS a propósito: son decisiones comerciales que
  // nadie ha aprobado, y seoEngine ya está preparado para hablar en términos
  // cualitativos cuando faltan en vez de inventar cifras. Se cargan desde la
  // pantalla de SEO cuando el negocio los defina.
  const config = {
    clave:               'general',
    nombre_inmobiliaria: 'INMOBILIARE Julio Corredor',
    ciudad_principal:    'Bogotá',
    anos_experiencia:    String(new Date().getFullYear() - 1960),
    descripcion_marca:   'Inmobiliaria bogotana fundada en 1960 (J.C.O Inversiones S.A.S). Venta y arriendo de inmuebles, administración de propiedades, recaudo de cánones, avalúos, reparaciones, seguro de arrendamiento y relocation corporativo.',
    zonas:               [] as string[],
    rango_venta_min:     0,
    rango_arriendo_min:  0,
    interlinks:          [],
    activo:              true,
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
