// Reclasifica un lead: score, temperatura y prioridad. Scoring puro (sin IA).
// POST { contacto_id }
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
  if (!contactoId) return json({ error: 'Falta contacto_id' }, 400);

  const hdrs = { 'api_key': Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  try {
    const rc = await fetch(`${BASE_URL}/api/entities/Contacto/${contactoId}`, { headers: hdrs });
    if (!rc.ok) return json({ error: 'Contacto no encontrado' }, 404);
    const c = await rc.json();

    const etapasScore = { Lead: 10, Visita_Agendada: 35, Oferta: 55, Negociacion: 70, Promesa: 85, Escritura: 95, Activo: 95, Perdido: 0 };
    let score = etapasScore[c.etapa_pipeline] ?? 10;
    if (c.presupuesto_max) score += 10;
    if (c.ciudad_interes) score += 5;
    if (c.habitaciones_min) score += 5;

    // Visitas realizadas (y su interés)
    try {
      const rv = await fetch(`${BASE_URL}/api/entities/Visita?contacto_id=${contactoId}&limit=50`, { headers: hdrs });
      if (rv.ok) {
        const visitas = await rv.json();
        const realizadas = visitas.filter((v) => v.estado === 'Realizada');
        if (realizadas.length) {
          score += 15;
          if (realizadas.some((v) => ['Muy_interesado', 'Interesado'].includes(v.calificacion_interes))) score += 10;
        }
      }
    } catch {}

    if (c.ultima_actividad) {
      const dias = Math.floor((Date.now() - new Date(c.ultima_actividad).getTime()) / 86_400_000);
      if (dias > 10) score -= 25; else if (dias > 5) score -= 15; else if (dias > 3) score -= 5;
    }
    score = Math.max(0, Math.min(100, score));

    const temperatura = score >= 80 ? 'Urgente' : score >= 55 ? 'Caliente' : score >= 30 ? 'Tibio' : 'Frio';
    const prioridad   = score >= 65 ? 'Alta'    : score >= 35 ? 'Media'    : 'Baja';

    await fetch(`${BASE_URL}/api/entities/Contacto/${contactoId}`, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify({ ...c, score_lead: score, temperatura, ia_calificado: true }),
    });
    try {
      await fetch(`${BASE_URL}/api/entities/HistorialLead`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ contacto_id: contactoId, tipo: 'Calificacion_IA', descripcion: `Recalificado: ${temperatura} (score ${score}/100) | Prioridad: ${prioridad}`, fecha: new Date().toISOString(), usuario_email: 'ia@sistema', es_automatico: true }),
      });
    } catch {}

    return json({ contacto_id: contactoId, score, temperatura, prioridad });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
