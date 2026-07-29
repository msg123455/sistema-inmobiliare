// Configura los brokers reales de ND en ConfigAgente (idempotente — se puede re-correr).
// GET /api/functions/setupBrokers?token=BROKERSND2026

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'BROKERSND2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const BASE_URL = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  // Natalia: lo más high ticket + zonas premium. Juan Alberto: el resto del rango ND.
  // El matching de asignarBrokerDinamico usa includes() sobre el barrio del lead;
  // Natalia va primera en el array = fallback por defecto cuando no hay match de zona.
  const brokers = [
    {
      nombre: 'Natalia Duque',
      telefono: '573102397788',
      genero: 'F',
      tipo_inmueble: 'ambos',
      barrios: [
        'rosales', 'cabrera', 'chico museo', 'chico alto', 'chico reservado',
        'chico norte', 'chico', 'refugio', 'bagazal', 'nogal', 'retiro',
        '93', 'virrey', 'zona t', 'zona g',
      ],
    },
    {
      nombre: 'Juan Alberto Duque',
      telefono: '573212532444',
      genero: 'M',
      tipo_inmueble: 'ambos',
      barrios: [
        'santa ana', 'santa barbara', 'carolina', 'usaquen', 'cedritos',
        'multicentro', 'bavaria', 'colina',
      ],
    },
  ];

  try {
    const r = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=5`, { headers: hdrs });
    const cfgs = r.ok ? await r.json() : [];
    const cfg = cfgs.find((c) => c.clave === 'general') || cfgs[0];

    if (cfg?.id) {
      const rU = await fetch(`${BASE_URL}/api/entities/ConfigAgente/${cfg.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...cfg, brokers }),
      });
      if (!rU.ok) {
        return new Response(JSON.stringify({ error: `PUT ${rU.status}`, detail: (await rU.text()).slice(0, 300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, accion: 'actualizado', config_id: cfg.id, brokers: brokers.map(b => b.nombre) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ clave: 'general', nombre_agente: 'Valentina', nombre_inmobiliaria: 'ND Inmobiliaria', activo: true, brokers }),
    });
    if (!rC.ok) {
      return new Response(JSON.stringify({ error: `POST ${rC.status}`, detail: (await rC.text()).slice(0, 300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const creado = await rC.json();
    return new Response(JSON.stringify({ ok: true, accion: 'creado', config_id: creado.id, brokers: brokers.map(b => b.nombre) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
