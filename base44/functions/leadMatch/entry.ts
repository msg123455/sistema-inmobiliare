// Propiedades del catálogo que mejor encajan con un lead. POST { contacto_id, limit? }
const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, api_key, authorization',
};
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!BASE_URL) {
    console.error('BASE44_APP_URL no configurada');
    return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let body = {};
  try { body = await req.json(); } catch {}
  const contactoId = body.contacto_id;
  const limit = Number(body.limit) || 5;
  if (!contactoId) return json({ error: 'Falta contacto_id' }, 400);

  const hdrs = { 'api_key': Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  try {
    const rc = await fetch(`${BASE_URL}/api/entities/Contacto/${contactoId}`, { headers: hdrs });
    if (!rc.ok) return json({ error: 'Contacto no encontrado' }, 404);
    const c = await rc.json();

    const rp = await fetch(`${BASE_URL}/api/entities/Propiedad?estado=Disponible&limit=100`, { headers: hdrs });
    const props = rp.ok ? await rp.json() : [];
    if (!props.length) return json({ contacto_id: contactoId, matches: [], total_disponibles: 0 });

    const operacionMap = {
      Compra: ['Venta', 'Venta_y_Arriendo'],
      Arriendo: ['Arriendo', 'Venta_y_Arriendo'],
      Compra_y_Arriendo: ['Venta', 'Arriendo', 'Venta_y_Arriendo'],
    };
    const opsValidas = operacionMap[c.tipo_interes] || [];

    const scored = props.map((p) => {
      let score = 0; const razones = [];
      if (c.ciudad_interes && p.ciudad && p.ciudad.toLowerCase() === c.ciudad_interes.toLowerCase()) { score += 40; razones.push('ciudad coincide'); }
      if (p.operacion && opsValidas.includes(p.operacion)) { score += 20; razones.push('operación coincide'); }
      if (c.presupuesto_max) {
        const precio = c.tipo_interes === 'Arriendo' ? p.canon_arriendo : p.precio_venta;
        if (precio && precio <= c.presupuesto_max) { score += 25; razones.push('dentro del presupuesto'); }
        else if (precio && precio <= c.presupuesto_max * 1.15) { score += 10; razones.push('cerca del presupuesto'); }
      }
      if (c.habitaciones_min && p.habitaciones && p.habitaciones >= c.habitaciones_min) { score += 15; razones.push('habitaciones suficientes'); }
      return { p, score, razones };
    });

    const top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    return json({
      contacto_id: contactoId,
      total_disponibles: props.length,
      matches: top.map((m) => ({
        id: m.p.id, tipo: m.p.tipo, operacion: m.p.operacion, ciudad: m.p.ciudad, barrio: m.p.barrio,
        habitaciones: m.p.habitaciones, banos: m.p.banos, area_m2: m.p.area_m2,
        precio_venta: m.p.precio_venta, canon_arriendo: m.p.canon_arriendo, estrato: m.p.estrato,
        score_match: m.score, razones_match: m.razones,
      })),
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
