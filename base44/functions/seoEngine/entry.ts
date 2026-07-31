// Motor SEO de INMOBILIARE Julio Corredor — pipeline completo en una sola función.
// POST /api/functions/seoEngine  { action, ...params }
//
// Acciones: sitemap_generate | research | generate_outline | generate_section
//           generate_finalize | aeo | export
//
// Patrón entry.ts + Deno.serve + entidades por HTTP directo (el único que
// despliega en este app; el estilo index.ts con context.entities está muerto).
// La generación del artículo va por secciones porque Base44 corta a los ~15s.

const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
const MODELO   = 'claude-haiku-4-5-20251001';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, api_key, authorization',
};

// ─── Identidad de marca (fallback y guardarraíl) ─────────────────────────────
//
// Antes vivía aquí la identidad del tenant del que se clonó esta app —con su
// fundadora, sus barrios de estrato 6 y sus pisos de precio de
// $1.000M / $5M. Todo eso describía otra empresa y otro mercado.
//
// Los campos que quedan vacíos NO se rellenan con suposiciones: `zonas` y los
// pisos de precio son decisiones comerciales de INMOBILIARE. Vacíos, las reglas
// de voz de abajo obligan a hablar en términos cualitativos en vez de inventar
// cifras. Se cargan desde ConfigSEO cuando el negocio los apruebe.
const MARCA = {
  nombre:    'INMOBILIARE Julio Corredor',
  razon:     'J.C.O Inversiones S.A.S',
  anos:      String(new Date().getFullYear() - 1960),
  ciudad:    'Bogotá',
  cobertura: 'Bogotá',
  servicios: 'venta y arriendo de inmuebles, administración de propiedades, recaudo de cánones, avalúos, reparaciones, seguro de arrendamiento y relocation corporativo',
  zonas:     [] as string[],
  min_venta:    '',
  min_arriendo: '',
};

const REGLAS_VOZ = `REGLAS DE MARCA Y VOZ (obligatorias):
- Español de Colombia, registro profesional y claro. Nada de lenguaje infantil.
- PROHIBIDO usar emojis.
- JAMÁS inventes cifras, estadísticas ni precios: usa ÚNICAMENTE los datos del contexto de marca que se te entrega. Si un dato no está, habla en términos cualitativos.
- JAMÁS menciones inmobiliarias competidoras por su nombre.
- Refuerza E-E-A-T: los ${MARCA.anos} años de trayectoria en ${MARCA.cobertura}.
- Contenido útil y específico del mercado real, no relleno genérico.`;

Deno.serve(async (req) => {
  if (!BASE_URL) {
    console.error('BASE44_APP_URL no configurada');
    return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return json({ error: 'Usa POST con { action, ... }' }, 405);
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const action = body.action;
  if (!action) return json({ error: 'Falta action' }, 400);

  const base44Key    = Deno.env.get('BASE44_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!base44Key)    return json({ error: 'BASE44_API_KEY no configurada' }, 500);
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500);

  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  try {
    switch (action) {
      case 'sitemap_generate':  return await sitemapGenerate(body, hdrs, anthropicKey);
      case 'research':          return await research(body, hdrs, anthropicKey);
      case 'generate_outline':  return await generateOutline(body, hdrs, anthropicKey);
      case 'generate_section':  return await generateSection(body, hdrs, anthropicKey);
      case 'generate_finalize': return await generateFinalize(body, hdrs, anthropicKey);
      case 'aeo':               return await aeo(body, hdrs, anthropicKey);
      case 'export':            return await exportar(body, hdrs);
      default:                  return json({ error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (err) {
    console.error(`seoEngine[${action}] error:`, err.message);
    return json({ error: err.message }, 500);
  }
});

// ─── Contexto de marca (ConfigSEO + ConocimientoRAG) ──────────────────────────

async function contextoMarca(hdrs: any) {
  // Config de marca
  let cfg: any = {};
  try {
    const r = await fetch(`${BASE_URL}/api/entities/ConfigSEO?limit=1`, { headers: hdrs });
    if (r.ok) { const arr = await r.json(); cfg = arr[0] || {}; }
  } catch (err) { console.error('ConfigSEO load:', err.message); }

  // El mismo RAG que usan los agentes, para que la voz sea una sola.
  // Solo categorías de mercado/identidad: las de comportamiento de chat no aplican aquí.
  let chunks: any[] = [];
  try {
    const r = await fetch(`${BASE_URL}/api/entities/ConocimientoRAG?activo=true&limit=100`, { headers: hdrs });
    if (r.ok) chunks = await r.json();
  } catch (err) { console.error('RAG load:', err.message); }

  const UTILES = ['general', 'mercado'];
  const relevantes = chunks
    .filter((c: any) => UTILES.includes(c.categoria))
    .sort((a: any, b: any) => (Number(b.prioridad) || 5) - (Number(a.prioridad) || 5));

  // Tope del contexto: es el mayor costo de entrada y empuja la función hacia
  // el límite de tiempo de Base44. 3200 basta para identidad + barrios + cifras.
  const MAX = 3200;
  let conocimiento = '';
  for (const c of relevantes) {
    const bloque = `[${c.titulo}]\n${c.contenido}\n\n`;
    if (conocimiento.length + bloque.length > MAX) break;
    conocimiento += bloque;
  }

  const nombre = cfg.nombre_inmobiliaria || MARCA.nombre;
  const zonas  = (cfg.zonas?.length ? cfg.zonas : MARCA.zonas).join(', ');
  const minVenta    = cfg.rango_venta_min || MARCA.min_venta;
  const minArriendo = cfg.rango_arriendo_min || MARCA.min_arriendo;

  // Las líneas de zonas y rangos solo entran si hay dato. Antes se emitían
  // siempre y, sin valor, el modelo recibía "venta desde ; arriendo desde ;" —
  // una invitación a completar el hueco por su cuenta.
  const brand = `=== LA EMPRESA (usar como fuente de verdad) ===
${nombre} (${MARCA.razon}), ${cfg.anos_experiencia || MARCA.anos} años en el mercado inmobiliario de ${cfg.ciudad_principal || MARCA.ciudad}, desde 1960.
Cobertura: ${cfg.ciudad_principal || MARCA.cobertura}.
Servicios: ${MARCA.servicios}.
${zonas ? `Zonas que maneja: ${zonas}.` : ''}
${minVenta && minArriendo ? `Rangos: venta desde ${minVenta}; arriendo desde ${minArriendo}.` : 'Los rangos de precio no están definidos: NO menciones cifras mínimas ni máximas.'}
${cfg.website_url ? `Sitio web: ${cfg.website_url}` : ''}
${cfg.whatsapp_numero ? `WhatsApp de contacto: ${cfg.whatsapp_numero}` : ''}

${conocimiento ? `=== DATOS REALES DEL MERCADO (única fuente de cifras permitida) ===\n${conocimiento}` : ''}`;

  return { cfg, brand, nombre, zonas };
}

// ─── Acción: sitemap_generate ────────────────────────────────────────────────

async function sitemapGenerate(body: any, hdrs: any, key: string) {
  const keyword = String(body.keyword || '').trim();
  if (!keyword) return json({ error: 'Falta keyword' }, 400);

  const { brand, nombre } = await contextoMarca(hdrs);

  const system = `Eres arquitecto de información SEO senior especializado en el mercado inmobiliario de alto valor de Bogotá. Diseñas clusters de contenido para ${nombre}.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido y COMPACTO, sin markdown ni texto adicional.`;

  // Salida deliberadamente compacta (claves de 1-2 letras): el JSON largo se
  // trunca al quedarse sin tokens y además acerca la función al límite de 15s.
  const user = `${brand}

Diseña un cluster de contenido SEO para la keyword semilla: "${keyword}"

Reglas:
- Exactamente 7 páginas: 1 pillar, 3 secondary, 3 blog.
- Keywords realistas: solo barrios y rangos que la empresa SÍ atiende, según el contexto de marca.
- Nada fuera de la cobertura declarada en el contexto de marca.
- Los títulos, máximo 60 caracteres.

Devuelve SOLO este JSON, sin saltos de línea innecesarios:
{"n":[{"k":"keyword objetivo","t":"pillar","ti":"Título de la página"}]}
donde "t" es pillar, secondary o blog.`;

  const data = await claudeJSON(key, system, user, 1200);
  const nodos = data.n || data.nodos || [];
  if (!nodos.length) return json({ error: 'Claude no devolvió nodos' }, 500);

  const PRIORIDAD: any = { pillar: 10, secondary: 7, third: 5, blog: 4 };
  const INTENCION: any = { pillar: 'comercial', secondary: 'comercial', third: 'informacional', blog: 'informacional' };

  // Creación en paralelo: en serie eran ~10 fetch secuenciales.
  const resultados = await Promise.all(nodos.slice(0, 8).map(async (n: any) => {
    const kw   = n.k || n.keyword;
    if (!kw) return null;
    const tipo = ['pillar', 'secondary', 'third', 'blog'].includes(n.t || n.page_type) ? (n.t || n.page_type) : 'blog';
    const payload = {
      keyword:          kw,
      page_type:        tipo,
      url:              '/' + slugify(kw),
      title_suggestion: (n.ti || n.title_suggestion || kw).slice(0, 70),
      intencion:        INTENCION[tipo] || 'informacional',
      cluster:          keyword,
      prioridad:        PRIORIDAD[tipo] || 5,
      estado:           'draft',
    };
    const r = await fetch(`${BASE_URL}/api/entities/NodoSitemap`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(payload),
    });
    if (!r.ok) { console.error('NodoSitemap create:', r.status, (await r.text()).slice(0, 200)); return null; }
    return await r.json();
  }));

  const creados = resultados.filter(Boolean);
  return json({ ok: true, cluster: keyword, creados: creados.length, nodos: creados });
}

// ─── Acción: research ────────────────────────────────────────────────────────

async function research(body: any, hdrs: any, key: string) {
  const nodoId = body.nodo_id;
  if (!nodoId) return json({ error: 'Falta nodo_id' }, 400);

  const nodo = await getEntity(hdrs, 'NodoSitemap', nodoId);
  const { brand, nombre } = await contextoMarca(hdrs);

  const system = `Eres investigador SEO senior del mercado inmobiliario de alto valor de Bogotá, trabajando para ${nombre}.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

  const user = `${brand}

Investiga a fondo el tema: "${nodo.keyword}"

IMPORTANTE: todas las cifras que uses deben salir de los DATOS REALES DEL MERCADO de arriba. No inventes ninguna estadística. Si no tienes un dato numérico, formula el punto de forma cualitativa.

Sé BREVE y concreto: cada elemento de las listas, máximo 20 palabras. No te extiendas.

Devuelve exactamente este JSON, respetando los máximos:
{
  "angulo": "ángulo editorial más valioso (1 frase)",
  "datos_clave": ["máximo 5 datos o cifras reales"],
  "preguntas_frecuentes": ["máximo 5 preguntas reales de clientes"],
  "subtemas": ["máximo 4 subtemas a cubrir"],
  "zonas_relevantes": ["máximo 5 barrios, solo del contexto de marca"],
  "intencion_usuario": "qué busca quien escribe esta keyword (1 frase)",
  "diferenciador": "autoridad de la empresa en el tema (1 frase)"
}`;

  // 1400 tokens: con 1200 la salida se truncaba y fallaba de forma intermitente.
  const data = await claudeJSON(key, system, user, 1400);

  await putEntity(hdrs, 'NodoSitemap', nodoId, {
    ...nodo,
    research_data: JSON.stringify(data),
    estado: 'researched',
  });

  return json({ ok: true, nodo_id: nodoId, research: data });
}

// ─── Acción: generate_outline ────────────────────────────────────────────────

async function generateOutline(body: any, hdrs: any, key: string) {
  const nodoId = body.nodo_id;
  if (!nodoId) return json({ error: 'Falta nodo_id' }, 400);

  const nodo = await getEntity(hdrs, 'NodoSitemap', nodoId);
  if (!nodo.research_data) return json({ error: 'El nodo no tiene research. Ejecuta research primero.' }, 400);

  let research: any = {};
  try { research = JSON.parse(nodo.research_data); } catch {}

  const { brand, nombre } = await contextoMarca(hdrs);

  const system = `Eres redactor SEO senior de ${nombre}, especialista en contenido inmobiliario de alto valor.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

  const user = `${brand}

Keyword objetivo: "${nodo.keyword}"
Tipo de página: ${nodo.page_type}
Investigación disponible: ${JSON.stringify(research)}

Diseña la estructura del artículo (todavía NO escribas el cuerpo).

Reglas:
- title: máximo 60 caracteres, con la keyword al inicio.
- meta_description: máximo 155 caracteres, con la keyword y un beneficio claro.
- Entre 4 y 6 secciones H2, en orden lógico de lectura.
- Cada sección con una instrucción concreta de qué debe cubrir.

Devuelve exactamente este JSON:
{
  "title": "...",
  "slug": "slug-en-minusculas-con-guiones",
  "meta_description": "...",
  "intro": "párrafo de introducción de 2-3 frases, con la keyword natural en la primera frase",
  "outline": [
    { "h2": "Título de la sección", "cubrir": "qué debe explicar esta sección concretamente" }
  ]
}`;

  const plan = await claudeJSON(key, system, user, 1100);
  const outline = plan.outline || [];
  if (!outline.length) return json({ error: 'Claude no devolvió outline' }, 500);

  // Arranca el contenido con la introducción; las secciones se van agregando una a una.
  const secciones = plan.intro ? [{ type: 'paragraph', content: plan.intro }] : [];

  const payload = {
    nodo_id:          nodoId,
    keyword_principal: nodo.keyword,
    title:            (plan.title || nodo.title_suggestion || nodo.keyword).slice(0, 60),
    slug:             plan.slug || slugify(nodo.keyword),
    meta_description: (plan.meta_description || '').slice(0, 160),
    content_sections: JSON.stringify(secciones),
    estado:           'pendiente',
  };

  const r = await fetch(`${BASE_URL}/api/entities/ContenidoSEO`, {
    method: 'POST', headers: hdrs, body: JSON.stringify(payload),
  });
  if (!r.ok) return json({ error: `No se pudo crear ContenidoSEO: ${(await r.text()).slice(0, 200)}` }, 500);
  const contenido = await r.json();

  await putEntity(hdrs, 'NodoSitemap', nodoId, { ...nodo, estado: 'generating' });

  return json({
    ok: true,
    contenido_id: contenido.id,
    title: payload.title,
    meta_description: payload.meta_description,
    slug: payload.slug,
    outline,
    total_secciones: outline.length,
  });
}

// ─── Acción: generate_section (una sección por llamada) ──────────────────────

async function generateSection(body: any, hdrs: any, key: string) {
  const { contenido_id, index, outline } = body;
  if (!contenido_id) return json({ error: 'Falta contenido_id' }, 400);
  if (!Array.isArray(outline) || !outline.length) return json({ error: 'Falta outline' }, 400);

  const i = Number(index) || 0;
  const item = outline[i];
  if (!item) return json({ error: `Índice fuera de rango: ${i}` }, 400);

  const contenido = await getEntity(hdrs, 'ContenidoSEO', contenido_id);
  const { brand, nombre } = await contextoMarca(hdrs);

  const system = `Eres redactor SEO senior de ${nombre}, especialista en contenido inmobiliario de alto valor en Bogotá.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

  const user = `${brand}

Artículo: "${contenido.title}"
Keyword objetivo: "${contenido.keyword_principal}"

Escribe ÚNICAMENTE esta sección:
H2: "${item.h2}"
Debe cubrir: ${item.cubrir || 'desarrolla el tema del H2'}

Reglas:
- Entre 150 y 250 palabras en total para la sección.
- 2 o 3 párrafos. Puedes añadir una lista si aporta claridad real.
- Menciona zonas concretas solo si vienen en el contexto de marca.
- Solo cifras que aparezcan en los datos reales de arriba.

Devuelve exactamente este JSON:
{
  "bloques": [
    { "type": "heading2", "content": "${item.h2}" },
    { "type": "paragraph", "content": "..." },
    { "type": "list", "items": ["...", "..."] }
  ]
}`;

  const data = await claudeJSON(key, system, user, 1100);
  const nuevos = data.bloques || [];

  let secciones: any[] = [];
  try { secciones = JSON.parse(contenido.content_sections || '[]'); } catch {}
  secciones = [...secciones, ...nuevos];

  await putEntity(hdrs, 'ContenidoSEO', contenido_id, {
    ...contenido,
    content_sections: JSON.stringify(secciones),
  });

  return json({ ok: true, index: i, bloques: nuevos, total_bloques: secciones.length });
}

// ─── Acción: generate_finalize (FAQ + schema + CTA) ──────────────────────────

async function generateFinalize(body: any, hdrs: any, key: string) {
  const contenidoId = body.contenido_id;
  if (!contenidoId) return json({ error: 'Falta contenido_id' }, 400);

  const contenido = await getEntity(hdrs, 'ContenidoSEO', contenidoId);
  const { brand, nombre, cfg } = await contextoMarca(hdrs);

  let secciones: any[] = [];
  try { secciones = JSON.parse(contenido.content_sections || '[]'); } catch {}
  const cuerpo = secciones.map((s: any) => s.content || (s.items || []).join(' ')).join(' ');
  const palabras = cuerpo.split(/\s+/).filter(Boolean).length;

  const system = `Eres especialista SEO técnico de ${nombre}.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

  const user = `${brand}

Artículo: "${contenido.title}"
Keyword: "${contenido.keyword_principal}"
Resumen del contenido ya escrito: ${cuerpo.slice(0, 1500)}

Genera el cierre técnico del artículo.

Devuelve exactamente este JSON:
{
  "faq_items": [
    { "pregunta": "pregunta real de un cliente", "respuesta": "respuesta directa de 2-3 frases" }
  ],
  "cta_text": "llamado a la acción final de 1-2 frases, profesional, invitando a contactar a ${nombre}"
}
Genera entre 4 y 6 preguntas frecuentes.`;

  const data = await claudeJSON(key, system, user, 1300);
  const faq = data.faq_items || [];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f: any) => ({
      '@type': 'Question',
      name: f.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
    })),
    publisher: {
      '@type': 'RealEstateAgent',
      name: nombre,
      areaServed: MARCA.cobertura,
      ...(cfg.website_url ? { url: cfg.website_url } : {}),
    },
  };

  await putEntity(hdrs, 'ContenidoSEO', contenidoId, {
    ...contenido,
    faq_items:     JSON.stringify(faq),
    cta_text:      data.cta_text || '',
    schema_jsonld: JSON.stringify(schema),
    palabras,
    estado:        'pendiente',
  });

  // El nodo queda listo para revisión editorial
  if (contenido.nodo_id) {
    try {
      const nodo = await getEntity(hdrs, 'NodoSitemap', contenido.nodo_id);
      await putEntity(hdrs, 'NodoSitemap', contenido.nodo_id, { ...nodo, estado: 'pending_approval' });
    } catch {}
  }

  return json({ ok: true, contenido_id: contenidoId, faq_items: faq, cta_text: data.cta_text, palabras });
}

// ─── Acción: aeo (AI Overviews, ChatGPT, Perplexity) ─────────────────────────

async function aeo(body: any, hdrs: any, key: string) {
  const contenidoId = body.contenido_id;
  if (!contenidoId) return json({ error: 'Falta contenido_id' }, 400);

  const contenido = await getEntity(hdrs, 'ContenidoSEO', contenidoId);
  const { brand, nombre } = await contextoMarca(hdrs);

  let secciones: any[] = [];
  try { secciones = JSON.parse(contenido.content_sections || '[]'); } catch {}
  const cuerpo = secciones.map((s: any) => s.content || (s.items || []).join(' ')).join(' ');

  const system = `Eres experto en AEO (Answer Engine Optimization) para ${nombre}. Optimizas contenido para ser CITADO por Google AI Overviews, ChatGPT, Perplexity y Gemini.
${REGLAS_VOZ}
Respondes ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

  const user = `${brand}

Artículo: "${contenido.title}"
Keyword: "${contenido.keyword_principal}"
Contenido: ${cuerpo.slice(0, 2000)}

Optimiza este contenido para motores de respuesta.

Devuelve exactamente este JSON:
{
  "respuesta_directa": "respuesta de 40-55 palabras que un motor de IA pueda citar textualmente, autosuficiente y con la entidad ${nombre} presente",
  "featured_snippet": "versión de 40-50 palabras optimizada para el snippet destacado de Google",
  "entidades": ["entidad o concepto clave que el motor debe asociar a este contenido"],
  "preguntas_seed": ["pregunta conversacional exacta que un usuario le haría a ChatGPT sobre este tema"],
  "datos_citables": ["afirmación con dato concreto, redactada para ser citada por una IA"],
  "por_que_nd": "una frase que posiciona a ${nombre} como la fuente autorizada del tema"
}`;

  const data = await claudeJSON(key, system, user, 1300);

  await putEntity(hdrs, 'ContenidoSEO', contenidoId, {
    ...contenido,
    aeo_data: JSON.stringify(data),
  });

  return json({ ok: true, contenido_id: contenidoId, aeo: data });
}

// ─── Acción: export (HTML + Markdown listos para cualquier CMS) ──────────────

async function exportar(body: any, hdrs: any) {
  const contenidoId = body.contenido_id;
  if (!contenidoId) return json({ error: 'Falta contenido_id' }, 400);

  const contenido = await getEntity(hdrs, 'ContenidoSEO', contenidoId);

  let secciones: any[] = [];
  let faq: any[] = [];
  let aeoData: any = null;
  try { secciones = JSON.parse(contenido.content_sections || '[]'); } catch {}
  try { faq = JSON.parse(contenido.faq_items || '[]'); } catch {}
  try { aeoData = contenido.aeo_data ? JSON.parse(contenido.aeo_data) : null; } catch {}

  const html = construirHtml(contenido, secciones, faq, aeoData);
  const markdown = construirMarkdown(contenido, secciones, faq);

  await putEntity(hdrs, 'ContenidoSEO', contenidoId, { ...contenido, export_html: html });

  return json({
    ok: true,
    contenido_id: contenidoId,
    title: contenido.title,
    slug: contenido.slug,
    meta_description: contenido.meta_description,
    schema_jsonld: contenido.schema_jsonld || '',
    html,
    markdown,
  });
}

function construirHtml(c: any, secciones: any[], faq: any[], aeoData: any) {
  const partes: string[] = [];

  if (aeoData?.respuesta_directa) {
    partes.push(`<div class="respuesta-directa"><p><strong>${esc(aeoData.respuesta_directa)}</strong></p></div>`);
  }

  for (const s of secciones) {
    switch (s.type) {
      case 'heading2':  partes.push(`<h2>${esc(s.content)}</h2>`); break;
      case 'heading3':  partes.push(`<h3>${esc(s.content)}</h3>`); break;
      case 'paragraph': partes.push(`<p>${esc(s.content)}</p>`); break;
      case 'list':      partes.push(`<ul>${(s.items || []).map((i: string) => `<li>${esc(i)}</li>`).join('')}</ul>`); break;
      case 'callout':   partes.push(`<blockquote><p><strong>${esc(s.content)}</strong></p></blockquote>`); break;
      case 'table': {
        const th = (s.headers || []).map((h: string) => `<th>${esc(h)}</th>`).join('');
        const tr = (s.rows || []).map((row: string[]) => `<tr>${row.map((c2: string) => `<td>${esc(c2)}</td>`).join('')}</tr>`).join('');
        partes.push(`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
        break;
      }
      default: if (s.content) partes.push(`<p>${esc(s.content)}</p>`);
    }
  }

  if (faq.length) {
    partes.push('<h2>Preguntas frecuentes</h2>');
    for (const f of faq) {
      partes.push(`<h3>${esc(f.pregunta)}</h3>`);
      partes.push(`<p>${esc(f.respuesta)}</p>`);
    }
  }

  if (c.cta_text) partes.push(`<p class="cta"><strong>${esc(c.cta_text)}</strong></p>`);
  if (c.schema_jsonld) partes.push(`<script type="application/ld+json">${c.schema_jsonld}</script>`);

  return partes.join('\n');
}

function construirMarkdown(c: any, secciones: any[], faq: any[]) {
  const partes: string[] = [`# ${c.title}`, ''];
  for (const s of secciones) {
    switch (s.type) {
      case 'heading2':  partes.push(`## ${s.content}`, ''); break;
      case 'heading3':  partes.push(`### ${s.content}`, ''); break;
      case 'paragraph': partes.push(s.content, ''); break;
      case 'list':      partes.push(...(s.items || []).map((i: string) => `- ${i}`), ''); break;
      case 'callout':   partes.push(`> **${s.content}**`, ''); break;
      default: if (s.content) partes.push(s.content, '');
    }
  }
  if (faq.length) {
    partes.push('## Preguntas frecuentes', '');
    for (const f of faq) partes.push(`### ${f.pregunta}`, '', f.respuesta, '');
  }
  if (c.cta_text) partes.push(`**${c.cta_text}**`, '');
  return partes.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function esc(s: any) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(s: string) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 70);
}

async function getEntity(hdrs: any, entidad: string, id: string) {
  const r = await fetch(`${BASE_URL}/api/entities/${entidad}/${id}`, { headers: hdrs });
  if (!r.ok) throw new Error(`${entidad} ${id} no encontrado (${r.status})`);
  return await r.json();
}

async function putEntity(hdrs: any, entidad: string, id: string, data: any) {
  const r = await fetch(`${BASE_URL}/api/entities/${entidad}/${id}`, {
    method: 'PUT', headers: hdrs, body: JSON.stringify(data),
  });
  if (!r.ok) console.error(`${entidad} update ${r.status}:`, (await r.text()).slice(0, 200));
  return r.ok;
}

async function claudeJSON(key: string, system: string, user: string, maxTokens = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const j = await r.json();
  const raw = j.content?.[0]?.text || '';
  const truncado = j.stop_reason === 'max_tokens';

  // Con salida truncada no hay cierre de llaves: se busca desde la primera
  // llave hasta el final y se repara, en vez de exigir un match balanceado.
  const inicio = raw.search(/[{[]/);
  if (inicio === -1) throw new Error('Claude no devolvió JSON');
  const txt = raw.slice(inicio);

  const parsed = parsearOReparar(txt);
  if (parsed === null) {
    throw new Error(truncado
      ? 'Respuesta de Claude truncada por límite de tokens y no se pudo reparar'
      : 'Claude devolvió JSON inválido');
  }
  return parsed;
}

// Intenta parsear; si viene truncado, corta hasta el último elemento completo
// y cierra los corchetes/llaves que quedaron abiertos.
function parsearOReparar(txt: string): any {
  const intentos = [txt, txt.replace(/,\s*([}\]])/g, '$1')];
  for (const t of intentos) {
    try { return JSON.parse(t); } catch {}
  }

  // Salida truncada: se recorta hacia atrás buscando un punto de corte que deje
  // una estructura cerrable (fin de objeto, de array, de string o coma).
  const candidatos: number[] = [];
  for (let i = txt.length - 1; i >= 0 && candidatos.length < 60; i--) {
    const ch = txt[i];
    if (ch === '}' || ch === ']' || ch === ',' || ch === '"') candidatos.push(i);
  }

  for (const idx of candidatos) {
    // En una coma se corta antes; en un cierre se incluye el carácter.
    const cand = txt.slice(0, txt[idx] === ',' ? idx : idx + 1).replace(/,\s*$/, '');
    const abiertos  = (cand.match(/\{/g) || []).length - (cand.match(/\}/g) || []).length;
    const corchetes = (cand.match(/\[/g) || []).length - (cand.match(/\]/g) || []).length;
    if (abiertos < 0 || corchetes < 0) continue;
    // Cerrar de adentro hacia afuera: primero arrays, luego objetos
    try { return JSON.parse(cand + ']'.repeat(corchetes) + '}'.repeat(abiertos)); } catch {}
  }
  return null;
}
