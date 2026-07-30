// Migra ConfigAgente.brokers[] -> entidad Asesor. Correr una vez.
//
// 30+ asesores no caben en un blob de configuracion: no se pueden consultar,
// no tienen estado de disponibilidad y no se puede balancear carga sobre ellos.
// Despues de correr esto, asignarAsesor() lee Asesor con round-robin real.
//
//   POST /api/functions/migrarAsesores?token=<CRON_TOKEN>
//
// Idempotente: si ya existe un Asesor con el mismo telefono, no lo duplica.
// NO borra brokers[]: queda como respaldo historico. La pantalla operativa es
// Equipo > Asesores y el runtime solo consulta la entidad Asesor.

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  if (!esperado || (url.searchParams.get('token') || body?.token || body?.args?.token || '') !== esperado) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const base = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const hdrs = { api_key: Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  if (!base) return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500 });

  const rCfg = await fetch(`${base}/api/entities/ConfigAgente?limit=1`, { headers: hdrs });
  const cfg = rCfg.ok ? (await rCfg.json())[0] : null;
  const brokers: any[] = Array.isArray(cfg?.brokers) ? cfg.brokers : [];
  if (!brokers.length) {
    return new Response(JSON.stringify({ ok: true, migrados: 0, nota: 'ConfigAgente.brokers[] esta vacio' }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const rEx = await fetch(`${base}/api/entities/Asesor?limit=200`, { headers: hdrs });
  const existentes: any[] = rEx.ok ? await rEx.json() : [];
  const yaEstan = new Set(existentes.map((a) => String(a.telefono || '').replace(/\D/g, '')).filter(Boolean));

  const detalle: any[] = [];
  for (const b of brokers) {
    const tel = String(b.telefono || '').replace(/\D/g, '');
    if (tel && yaEstan.has(tel)) {
      detalle.push({ nombre: b.nombre, accion: 'ya existe' });
      continue;
    }
    // El enum viejo era vivienda/comercial/ambos (tipo de INMUEBLE). El nuevo es
    // Venta/Arriendo/Ambos (tipo de OPERACION), que es lo que usa el ruteo.
    // Sin equivalencia fiable, todos entran como Ambos y se afinan a mano.
    const r = await fetch(`${base}/api/entities/Asesor`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        nombre: String(b.nombre || '').trim(),
        telefono: tel,
        genero: b.genero || '',
        tipo: 'Ambos',
        zonas: Array.isArray(b.barrios) ? b.barrios : [],
        estado: 'Activo',
        ultima_asignacion: null,
      }),
    });
    detalle.push({ nombre: b.nombre, accion: r.ok ? 'creado' : `error ${r.status}` });
    if (tel) yaEstan.add(tel);
  }

  return new Response(JSON.stringify({
    ok: true,
    migrados: detalle.filter((d) => d.accion === 'creado').length,
    detalle,
    siguiente: 'Revisa el campo `tipo` de cada Asesor (todos entraron como Ambos) y sus `zonas`.',
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
