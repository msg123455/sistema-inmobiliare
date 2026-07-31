// Envío rápido de WhatsApp a un contacto desde el CRM.
// POST { contacto_id, variables: { mensaje } }  (o template_id + variables)
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
  const { contacto_id, template_id, variables = {} } = body;
  if (!contacto_id) return json({ error: 'Falta contacto_id' }, 400);

  const waToken   = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  if (!waToken || !waPhoneId) return json({ error: 'WhatsApp no configurado' }, 500);

  const hdrs = { 'api_key': Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  try {
    const rc = await fetch(`${BASE_URL}/api/entities/Contacto/${contacto_id}`, { headers: hdrs });
    if (!rc.ok) return json({ error: 'Contacto no encontrado' }, 404);
    const c = await rc.json();

    const tel = String(c.telefono || '').replace(/\D/g, '');
    if (!tel) return json({ error: 'El contacto no tiene teléfono' }, 400);

    let contenido = '';
    let templateNombre = '';
    if (template_id) {
      const rt = await fetch(`${BASE_URL}/api/entities/MensajeTemplate/${template_id}`, { headers: hdrs });
      if (rt.ok) {
        const t = await rt.json();
        templateNombre = t.nombre || '';
        contenido = t.contenido || '';
        const vars = { nombre: c.nombre, ciudad: c.ciudad_interes, ...variables };
        for (const [k, v] of Object.entries(vars)) contenido = contenido.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v || ''));
      }
    } else {
      // Sin plantilla y sin mensaje no hay nada que decir. Aqui habia un texto por
      // defecto que saludaba en nombre de "ND Inmobiliaria" —el tenant del que se
      // clono esta app— y salia hacia el CLIENTE FINAL. Un mensaje que nombra a
      // otra empresa es peor que no mandar ninguno.
      contenido = String(variables.mensaje || '').trim();
      if (!contenido) {
        return json({ error: 'Sin contenido: manda variables.mensaje o un template_id.' }, 400);
      }
    }

    const to = tel.startsWith('57') ? tel : `57${tel}`;
    const rw = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: contenido } }),
    });
    const data = await rw.json();
    if (!rw.ok) return json({ error: data.error?.message || 'Error al enviar WhatsApp' }, 502);

    try {
      await fetch(`${BASE_URL}/api/entities/MensajeEnviado`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ contacto_id, contacto_nombre: c.nombre, contacto_telefono: c.telefono, canal: 'WhatsApp', template_id: template_id || null, template_nombre: templateNombre, contenido_final: contenido, fecha_envio: new Date().toISOString(), estado: 'Enviado', mensaje_id_externo: data.messages?.[0]?.id || '', es_automatico: false }),
      });
    } catch {}

    return json({ message_id: data.messages?.[0]?.id, status: 'sent' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
