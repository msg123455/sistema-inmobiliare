// Sincroniza el estado de conversaciones de Valentina (Nota) → Contacto CRM
// GET  /api/functions/syncCRM?token=SYNCWASI2026
// POST /api/functions/syncCRM  { token: "SYNCWASI2026" }  (desde el frontend)
Deno.serve(async (req) => {
  const BASE_URL = 'https://ndsoftware.base44.app';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const tokenParam = url.searchParams.get('token') || body.token || '';
  if (tokenParam !== 'SYNCWASI2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (!base44Key) {
    return new Response(JSON.stringify({ error: 'BASE44_API_KEY no configurado' }), { status: 500 });
  }

  // ── SET DEMORA: fija demora_respuesta_min en ConfigAgente ──────────────────
  // { token, set_demora: 2 }
  if (body.set_demora !== undefined) {
    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=20`, { headers: hdrs });
    const cfgs = rC.ok ? await rC.json() : [];
    if (!cfgs.length) return new Response(JSON.stringify({ error: 'No hay ConfigAgente' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const nuevo = Number(body.set_demora) || 0;
    // Actualizar TODOS los registros (el webhook lee ?limit=1 y puede caer en cualquiera)
    const registros = [];
    for (const cfg of cfgs) {
      const r = await fetch(`${BASE_URL}/api/entities/ConfigAgente/${cfg.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...cfg, demora_respuesta_min: nuevo }),
      });
      registros.push({ id: cfg.id, clave: cfg.clave, ok: r.ok });
    }
    return new Response(JSON.stringify({ ok: true, demora_respuesta_min: nuevo, total_registros: cfgs.length, registros }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── SET NUMERO DE NOTIFICACIONES: numero que recibe los leads calificados ──
  // { token, set_notif: "573102397788" }  ("" para limpiar y volver al broker)
  if (body.set_notif !== undefined) {
    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=20`, { headers: hdrs });
    const cfgs = rC.ok ? await rC.json() : [];
    if (!cfgs.length) return new Response(JSON.stringify({ error: 'No hay ConfigAgente' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const num = String(body.set_notif || '').replace(/\D/g, '');
    const registros = [];
    for (const cfg of cfgs) {
      const r = await fetch(`${BASE_URL}/api/entities/ConfigAgente/${cfg.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...cfg, numero_notificaciones: num }),
      });
      registros.push({ id: cfg.id, ok: r.ok });
    }
    return new Response(JSON.stringify({ ok: true, numero_notificaciones: num, total_registros: cfgs.length, registros }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── SET TELEGRAM NOTIF CHAT: chat de Telegram que recibe los leads calificados ──
  // { token, set_notif_tg: "8292293564" }  ("" para limpiar y volver a WhatsApp)
  if (body.set_notif_tg !== undefined) {
    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=20`, { headers: hdrs });
    const cfgs = rC.ok ? await rC.json() : [];
    if (!cfgs.length) return new Response(JSON.stringify({ error: 'No hay ConfigAgente' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const chat = String(body.set_notif_tg || '').replace(/[^\d-]/g, '');
    const registros = [];
    for (const cfg of cfgs) {
      const r = await fetch(`${BASE_URL}/api/entities/ConfigAgente/${cfg.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...cfg, telegram_notif_chat: chat }),
      });
      registros.push({ id: cfg.id, ok: r.ok });
    }
    return new Response(JSON.stringify({ ok: true, telegram_notif_chat: chat, registros }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── NOTIFTEST: manda una ficha de EJEMPLO al destino de notificaciones configurado ──
  // { token, notiftest: true }
  if (body.notiftest === true) {
    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=1`, { headers: hdrs });
    const cfg = rC.ok ? (await rC.json())[0] || {} : {};
    const msg =
      `🔴 LEAD CALIFICADO — CONTACTAR HOY (mensaje de prueba)\n\n` +
      `👤 Quio\nwa.me/573166254102\n\n` +
      `📋 Compra de casa\n📍 Bogota, Santa Ana\n💰 Presupuesto: $4.000.000.000\n\n` +
      `🔎 Cosas para tener en cuenta:\n  • Va a buscar la plata si el inmueble le gusta\n  • Decide junto con la esposa\n\n` +
      `💬 Ultimas respuestas del cliente:\n  • "Hola, busco una casa en Santa Ana"\n  • "Comprar"\n  • "4.000"\n  • "Si correcto"\n\n` +
      `Valentina ya le confirmo que su broker le escribe HOY. El cliente queda esperando el mensaje.\n` +
      `👔 Broker asignado: Natalia Duque (573102397788)`;
    const tgChat = String(cfg.telegram_notif_chat || '').trim();
    if (tgChat) {
      const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(tgChat), text: msg }),
      });
      return new Response(JSON.stringify({ ok: r.ok, canal: 'telegram', chat: tgChat, status: r.status, body: (await r.text()).slice(0, 200) }, null, 2),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const num = String(cfg.numero_notificaciones || '').replace(/\D/g, '');
    if (!num) return new Response(JSON.stringify({ error: 'Sin destino: configura telegram_notif_chat o numero_notificaciones' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const to = num.startsWith('57') ? num : '57' + num;
    const r = await fetch(`https://graph.facebook.com/v19.0/${Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || ''}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('WHATSAPP_API_TOKEN') || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: msg } }),
    });
    return new Response(JSON.stringify({ ok: r.ok, canal: 'whatsapp', to, status: r.status, body: (await r.text()).slice(0, 200) }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── SHOWCONFIG: estado de la config + autoeducacion (diagnostico) ──────────
  if (url.searchParams.get('showconfig') === '1' || body.showconfig === true) {
    const rC = await fetch(`${BASE_URL}/api/entities/ConfigAgente?limit=1`, { headers: hdrs });
    const cfg = rC.ok ? (await rC.json())[0] || {} : {};
    const rA = await fetch(`${BASE_URL}/api/entities/AprendizajeValentina?limit=500`, { headers: hdrs });
    const apr = rA.ok ? await rA.json() : [];
    const rE = await fetch(`${BASE_URL}/api/entities/EvaluacionChat?limit=500`, { headers: hdrs });
    const evs = rE.ok ? await rE.json() : [];
    const porEstado: any = {};
    for (const a of apr) porEstado[a.estado || 'sin'] = (porEstado[a.estado || 'sin'] || 0) + 1;
    const avg = evs.length ? Math.round(evs.reduce((s: number, e: any) => s + (e.score_total || 0), 0) / evs.length) : 0;
    return new Response(JSON.stringify({
      demora_respuesta_min: cfg.demora_respuesta_min,
      telegram_notif_chat: cfg.telegram_notif_chat || '',
      aprendizajes_aplicados_len: (cfg.aprendizajes || '').length,
      aprendizajes_aplicados_preview: (cfg.aprendizajes || '').slice(0, 900),
      aprendizajes_por_estado: porEstado,
      total_aprendizajes: apr.length,
      evaluaciones: evs.length,
      score_promedio: avg,
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── BORRAR: elimina TODO el rastro de uno o varios teléfonos ───────────────
  // { token, borrar_tels: ["573166254102", "8292293564"] }
  // IMPORTANTE: el filtro ?cliente_id= de Base44 NO es confiable (devuelve 0 aunque
  // exista). Por eso cargamos TODAS las entidades y filtramos EN CÓDIGO por id.
  if (Array.isArray(body.borrar_tels)) {
    const tels: string[] = body.borrar_tels.map((t: any) => String(t).replace(/\D/g, ''));
    const frescoNota = JSON.stringify({
      historial: [], datos: {}, etapa: 'inicio', calificado: false, descalificado: false,
      motivo_desc: '', broker: '', broker_tel: '', propiedades_wasi: [], etapa_ventas: 'calentamiento',
      estado_emocional: 'sin_definir', tipo_comprador: 'sin_definir', motivacion_principal: 'sin_definir',
      nivel_urgencia: 'explorando', objeciones_activas: [], pausada: false,
    });
    const soloDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');
    const cargarTodo = async (entidad: string) => {
      const r = await fetch(`${BASE_URL}/api/entities/${entidad}?limit=500`, { headers: hdrs });
      return r.ok ? await r.json() : [];
    };
    const delId = async (entidad: string, id: string) => {
      const d = await fetch(`${BASE_URL}/api/entities/${entidad}/${id}`, { method: 'DELETE', headers: hdrs });
      return d.ok;
    };

    const [allNotas, allContactos, allConvs, allMsgs, allMemorias] = await Promise.all([
      cargarTodo('Nota'), cargarTodo('Contacto'), cargarTodo('Conversacion'), cargarTodo('MensajeConversacion'), cargarTodo('MemoriaChat'),
    ]);

    const resultado: Record<string, any> = {};
    for (const tel of tels) {
      const r: any = { notas: 0, memorias: 0, contactos: 0, conversaciones: 0, mensajes: 0 };

      // MemoriaChat — FUENTE PRINCIPAL de estado del webhook. Sin borrar esto, resucita.
      const misMemorias = allMemorias.filter((m: any) => soloDigitos(m.telefono) === tel);
      for (const m of misMemorias) {
        if (await delId('MemoriaChat', m.id)) r.memorias++;
      }

      // Notas — PUT vacío (objeto completo) Y DELETE, para todas las que matcheen
      const misNotas = allNotas.filter((n: any) => soloDigitos(n.cliente_id) === tel);
      for (const n of misNotas) {
        await fetch(`${BASE_URL}/api/entities/Nota/${n.id}`, {
          method: 'PUT', headers: hdrs,
          body: JSON.stringify({ ...n, texto: frescoNota, fecha_nota: new Date().toISOString() }),
        });
        await delId('Nota', n.id);
        r.notas++;
      }

      // Contactos (+ sus conversaciones y mensajes)
      const misContactos = allContactos.filter((c: any) => soloDigitos(c.telefono) === tel);
      const contactoIds = new Set(misContactos.map((c: any) => c.id));
      for (const conv of allConvs.filter((cv: any) => contactoIds.has(cv.contacto_id) || soloDigitos(cv.contacto_telefono) === tel)) {
        for (const m of allMsgs.filter((mm: any) => mm.conversacion_id === conv.id)) {
          if (await delId('MensajeConversacion', m.id)) r.mensajes++;
        }
        if (await delId('Conversacion', conv.id)) r.conversaciones++;
      }
      for (const c of misContactos) {
        if (await delId('Contacto', c.id)) r.contactos++;
      }

      resultado[tel] = r;
    }
    return new Response(JSON.stringify({ ok: true, borrado: resultado }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. Cargar todas las Notas (cada una = estado completo de un lead en Valentina)
  const rNotas = await fetch(`${BASE_URL}/api/entities/Nota?limit=500`, { headers: hdrs });
  if (!rNotas.ok) {
    return new Response(JSON.stringify({ error: `Error cargando Notas: ${rNotas.status}` }), { status: 500 });
  }
  const notas: any[] = await rNotas.json();

  // ── DUMP: volcar todas las conversaciones para diagnóstico ─────────────────
  if (url.searchParams.get('dump') === '1' || body.dump === true) {
    const chats = notas.map((nota) => {
      let e: any = {};
      try { e = JSON.parse(nota.texto || '{}'); } catch {}
      const historial = (e.historial || []).map((m: any) => `${m.role === 'user' ? 'LEAD' : 'VALE'}: ${m.content}`);
      return {
        tel: nota.cliente_id,
        actualizado: nota.updated_date || nota.created_date,
        etapa_ventas: e.etapa_ventas,
        calificado: e.calificado || false,
        descalificado: e.descalificado || false,
        motivo_desc: e.motivo_desc || '',
        broker: e.broker || '',
        datos: e.datos || {},
        estado_emocional: e.estado_emocional,
        nivel_urgencia: e.nivel_urgencia,
        objeciones: e.objeciones_activas || [],
        num_mensajes: historial.length,
        pendiente_envio: e.pendiente_envio
          ? { globos: e.pendiente_envio.globos?.length, canal: e.pendiente_envio.canal, enviar_en: e.pendiente_envio.enviar_en, vence_en_seg: Math.round((Number(e.pendiente_envio.enviar_en || 0) - Date.now()) / 1000) }
          : null,
        historial,
      };
    }).sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));

    return new Response(JSON.stringify({ total_chats: chats.length, chats }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── LEADS CAIDOS: conversaciones SIN Nota (entraron pero Valentina no respondio) ──
  // GET /api/functions/syncCRM?token=SYNCWASI2026&leads_caidos=1
  if (url.searchParams.get('leads_caidos') === '1' || body.leads_caidos === true) {
    const telsConNota = new Set(notas.map((n) => String(n.cliente_id)));
    const rConv = await fetch(`${BASE_URL}/api/entities/Conversacion?limit=300`, { headers: hdrs });
    const convs: any[] = rConv.ok ? await rConv.json() : [];
    const rMsg = await fetch(`${BASE_URL}/api/entities/MensajeConversacion?limit=800`, { headers: hdrs });
    const msgs: any[] = rMsg.ok ? await rMsg.json() : [];
    const ultimoEntrante: Record<string, any> = {};
    for (const m of msgs) {
      if (m.direccion !== 'Entrante') continue;
      const tel = String(m.contacto_telefono || '').replace(/\D/g, '');
      if (!tel) continue;
      if (!ultimoEntrante[tel] || String(m.fecha || '') > String(ultimoEntrante[tel].fecha || '')) ultimoEntrante[tel] = m;
    }
    const caidos = convs
      .map((c) => ({ c, telNorm: String(c.contacto_telefono || '').replace(/\D/g, '') }))
      .filter((x) => x.telNorm && !telsConNota.has(x.telNorm))
      .sort((a, b) => String(b.c.fecha_ultimo_mensaje || '').localeCompare(String(a.c.fecha_ultimo_mensaje || '')))
      .slice(0, 20)
      .map((x) => ({
        tel: x.telNorm,
        nombre: x.c.contacto_nombre || '',
        canal: x.c.canal || '',
        estado: x.c.estado || '',
        fecha_ultimo_mensaje: x.c.fecha_ultimo_mensaje || '',
        sin_leer: x.c.mensajes_sin_leer || 0,
        ultimo_mensaje_lead: ultimoEntrante[x.telNorm]?.contenido || '(no encontrado)',
      }));
    return new Response(JSON.stringify({ total_caidos: caidos.length, caidos }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  let actualizados = 0;
  let creados = 0;
  let errores = 0;

  for (const nota of notas) {
    const tel = nota.cliente_id;
    if (!tel) continue;

    // Parsear el estado de Valentina guardado en texto
    let e: any = {};
    try { e = JSON.parse(nota.texto || '{}'); } catch { continue; }
    const datos = e.datos || {};

    // Determinar etapa pipeline basada en el estado de la conversación
    let etapaPipeline = 'Lead';
    if (e.descalificado) etapaPipeline = 'Perdido';
    // Si calificado, se queda en Lead pero con ia_calificado=true;
    // el broker lo mueve a Visita_Agendada manualmente

    // Tipo de interés
    let tipoInteres: string | undefined;
    if (datos.operacion === 'arriendo') tipoInteres = 'Arriendo';
    else if (datos.operacion === 'compra') tipoInteres = 'Compra';

    // Resumen de lo que descubrió Valentina (para el campo notas)
    const piezas = [
      datos.tipo_prop  && `Busca: ${datos.tipo_prop}`,
      datos.barrio     && `Zona: ${datos.barrio}`,
      datos.presupuesto && `Presupuesto: $${Number(datos.presupuesto).toLocaleString('es-CO')}`,
      datos.habitaciones && `Hab: ${datos.habitaciones}`,
      e.descalificado  && e.motivo_desc && `Descalificado: ${e.motivo_desc}`,
    ].filter(Boolean);
    const notasIA = piezas.length ? `[Valentina] ${piezas.join(' | ')}` : undefined;

    // Campos a actualizar en el Contacto
    const actualizacion: any = {
      etapa_pipeline: etapaPipeline,
      en_conversacion: !e.calificado && !e.descalificado,
      ia_calificado: !!e.calificado,
    };
    if (datos.nombre && !datos.nombre.startsWith('Lead ')) actualizacion.nombre = datos.nombre;
    if (tipoInteres) actualizacion.tipo_interes = tipoInteres;
    if (datos.presupuesto) actualizacion.presupuesto_max = Number(datos.presupuesto);
    if (datos.ciudad) actualizacion.ciudad_interes = datos.ciudad;
    if (datos.habitaciones) actualizacion.habitaciones_min = Number(datos.habitaciones);
    if (e.broker) actualizacion.asignado_a = e.broker;
    if (notasIA) actualizacion.notas = notasIA;

    // Buscar el Contacto por teléfono
    const rC = await fetch(`${BASE_URL}/api/entities/Contacto?telefono=${encodeURIComponent(tel)}&limit=1`, { headers: hdrs });
    if (!rC.ok) { errores++; continue; }
    const contactos: any[] = await rC.json();
    const contacto = contactos[0];

    if (contacto) {
      // Actualizar — no pisar etapa si ya fue movido manualmente más adelante
      const etapaActual = contacto.etapa_pipeline || 'Lead';
      const etapasAvanzadas = ['Visita_Agendada', 'Oferta', 'Negociacion', 'Promesa', 'Escritura', 'Activo'];
      if (etapasAvanzadas.includes(etapaActual)) {
        // Ya está en una etapa gestionada por el broker — no retroceder a Lead
        delete actualizacion.etapa_pipeline;
      }
      const r = await fetch(`${BASE_URL}/api/entities/Contacto/${contacto.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...contacto, ...actualizacion }),
      });
      if (r.ok) actualizados++;
      else errores++;
    } else {
      // Crear el Contacto si todavía no existe (caso raro: llegó antes de que el webhook lo creara)
      const r = await fetch(`${BASE_URL}/api/entities/Contacto`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          nombre: datos.nombre || `Lead ${tel.slice(-4)}`,
          telefono: tel,
          canal_adquisicion: 'WhatsApp',
          fecha_primer_contacto: new Date().toISOString().split('T')[0],
          ...actualizacion,
        }),
      });
      if (r.ok) creados++;
      else errores++;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    notas_procesadas: notas.length,
    contactos_actualizados: actualizados,
    contactos_creados: creados,
    errores,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
