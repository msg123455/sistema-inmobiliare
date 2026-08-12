// ARCHIVO GENERADO por scripts/empaquetar.mjs — no editar a mano.
//
// Base44 no registra funciones cuyo grafo de imports pasa de ~9 modulos.
// La fuente editable es entry.ts + _core/; esto es su aplanado, y es lo que
// function.jsonc declara como entry.
//
// Lo empaqueta esbuild, no una concatenacion: hay simbolos que se repiten
// entre modulos (`API`, `normalizar` viven en whatsapp.ts y en telegram.ts)
// y namespaces que hay que materializar (`import * as tg`). Pegar los
// archivos en un solo ambito los hacia colisionar en silencio.

// base44/functions/enviarPendientes/_core/db.ts
function crearDb(apiKey, baseUrl) {
  const base = (baseUrl || Deno.env.get("BASE44_APP_URL") || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE44_APP_URL no configurada");
  const hdrs = { api_key: apiKey, "Content-Type": "application/json" };
  const fallos = [];
  const qs = (f) => {
    if (!f) return "";
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v !== void 0 && v !== null && v !== "") p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  async function list(entidad, filtro) {
    const r = await fetch(`${base}/api/entities/${entidad}${qs(filtro)}`, { headers: hdrs });
    if (!r.ok) {
      console.error(`db.list ${entidad} ${r.status}`, (await r.text()).slice(0, 200));
      return [];
    }
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  }
  async function uno(entidad, filtro) {
    const arr = await list(entidad, { ...filtro, limit: 1 });
    return arr[0] ?? null;
  }
  async function crear(entidad, datos) {
    const r = await fetch(`${base}/api/entities/${entidad}`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(datos)
    });
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300);
      console.error(`db.crear ${entidad} ${r.status}`, detalle);
      fallos.push(`crear ${entidad} ${r.status}: ${detalle}`);
      return null;
    }
    return await r.json();
  }
  async function actualizar(entidad, id, datos) {
    let cuerpo = datos;
    try {
      const r0 = await fetch(`${base}/api/entities/${entidad}/${id}`, { headers: hdrs });
      if (r0.ok) {
        const actual = await r0.json();
        if (actual && typeof actual === "object" && !Array.isArray(actual)) {
          cuerpo = { ...actual, ...datos };
        }
      }
    } catch (err) {
      console.error(`db.actualizar ${entidad}/${id} no pudo leer antes de fusionar:`, err.message);
    }
    const r = await fetch(`${base}/api/entities/${entidad}/${id}`, {
      method: "PUT",
      headers: hdrs,
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300);
      console.error(`db.actualizar ${entidad}/${id} ${r.status}`, detalle);
      fallos.push(`actualizar ${entidad}/${id} ${r.status}: ${detalle} (cuerpo ${JSON.stringify(cuerpo).length} chars)`);
      return null;
    }
    return await r.json();
  }
  async function guardar(entidad, id, datos) {
    const res = id ? await actualizar(entidad, id, datos) : await crear(entidad, datos);
    return res?.id ?? id ?? null;
  }
  return { base, list, uno, crear, actualizar, guardar, fallos };
}

// base44/functions/enviarPendientes/_core/contexto.ts
function agentesAutomaticosActivos(config) {
  return config?.activo !== false;
}

// base44/functions/enviarPendientes/_core/canales/whatsapp.ts
var GRAPH = "https://graph.facebook.com/v19.0";
async function enviar(destino, texto, env) {
  const r = await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.waToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: destino, type: "text", text: { body: texto } })
  });
  if (!r.ok) console.error("WA send error:", r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

// base44/functions/enviarPendientes/_core/canales/telegram.ts
var API = (token) => `https://api.telegram.org/bot${token}`;
async function enviar2(destino, texto, env) {
  const r = await fetch(`${API(env.tgToken)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(destino), text: texto })
  });
  if (!r.ok) console.error("TG send error:", r.status, (await r.text()).slice(0, 200));
  return r.ok;
}
async function marcarEscribiendo(destino, env) {
  try {
    await fetch(`${API(env.tgToken)}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(destino), action: "typing" })
    });
  } catch {
  }
}

// base44/functions/enviarPendientes/_core/protocol.ts
var AGENTES = [
  "recepcion",
  "ventas",
  "consignacion",
  "cartera",
  "mantenimiento",
  "avaluos",
  "pqr",
  "matricula"
];
var esAgente = (v) => typeof v === "string" && AGENTES.includes(v);

// base44/functions/enviarPendientes/_core/canales/bots.ts
var VAR_POR_AGENTE = {
  recepcion: "TELEGRAM_BOT_RECEPCION",
  ventas: "TELEGRAM_BOT_VENTAS",
  consignacion: "TELEGRAM_BOT_CONSIGNACION",
  cartera: "TELEGRAM_BOT_CARTERA",
  mantenimiento: "TELEGRAM_BOT_MANTENIMIENTO",
  avaluos: "TELEGRAM_BOT_AVALUOS",
  pqr: "TELEGRAM_BOT_PQR",
  matricula: "TELEGRAM_BOT_MATRICULA"
};
function tokenDeAgente(agente) {
  const compartido = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!agente || !esAgente(agente)) return compartido;
  return Deno.env.get(VAR_POR_AGENTE[agente]) || compartido;
}

// base44/functions/enviarPendientes/entry.ts
var MAX_POR_CORRIDA = 40;
var MAX_INTENTOS = 3;
var PRESUPUESTO_MS = 11e3;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body = {};
  try {
    body = await req.json();
  } catch {
  }
  const esperado = Deno.env.get("CRON_TOKEN") || "";
  const dado = url.searchParams.get("token") || body?.token || body?.args?.token || "";
  if (!esperado || dado !== esperado) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const env = {
    waPhoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    waToken: Deno.env.get("WHATSAPP_API_TOKEN") || "",
    tgToken: Deno.env.get("TELEGRAM_BOT_TOKEN") || ""
  };
  const db = crearDb(Deno.env.get("BASE44_API_KEY") || "");
  const config = await db.uno("ConfigAgente", { clave: "general" });
  if (!agentesAutomaticosActivos(config)) {
    return new Response(JSON.stringify({ ok: true, skip: "IA global inactiva" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const t0 = Date.now();
  const ahora = Date.now();
  const pendientes = (await db.list("ColaSalida", { estado: "pendiente", limit: MAX_POR_CORRIDA })).filter((c) => new Date(c.enviar_en || 0).getTime() <= ahora).sort((a, b) => new Date(a.enviar_en).getTime() - new Date(b.enviar_en).getTime());
  let enviados = 0, globosEnviados = 0, fallidos = 0;
  for (const item of pendientes) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;
    const globos = Array.isArray(item.globos) ? item.globos : [];
    if (!globos.length) {
      await db.actualizar("ColaSalida", item.id, { ...item, estado: "enviado", error: "sin globos" });
      continue;
    }
    await db.actualizar("ColaSalida", item.id, { ...item, estado: "enviando", intentos: (item.intentos || 0) + 1 });
    let ok = true;
    try {
      if (item.canal === "telegram") {
        const tgEnv = { tgToken: tokenDeAgente(item.agente) };
        if (!tgEnv.tgToken) throw new Error(`sin token de Telegram para "${item.agente || "compartido"}"`);
        await marcarEscribiendo(item.destino, tgEnv);
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!await enviar2(item.destino, g, tgEnv)) ok = false;
          globosEnviados++;
        }
      } else if (item.canal === "whatsapp" && env.waPhoneId && env.waToken) {
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!await enviar(item.destino, g, env)) ok = false;
          globosEnviados++;
        }
      } else {
        ok = false;
      }
    } catch (e) {
      console.error("entrega error:", e.message);
      ok = false;
    }
    const intentos = (item.intentos || 0) + 1;
    if (ok) {
      await db.actualizar("ColaSalida", item.id, { ...item, estado: "enviado", intentos, enviado_en: (/* @__PURE__ */ new Date()).toISOString(), error: "" });
      enviados++;
    } else if (intentos >= MAX_INTENTOS) {
      await db.actualizar("ColaSalida", item.id, { ...item, estado: "fallido", intentos, error: "agotados los reintentos" });
      fallidos++;
    } else {
      await db.actualizar("ColaSalida", item.id, {
        ...item,
        estado: "pendiente",
        intentos,
        enviar_en: new Date(Date.now() + intentos * 6e4).toISOString(),
        error: "reintentando"
      });
      fallidos++;
    }
  }
  return new Response(
    JSON.stringify({ ok: true, en_cola: pendientes.length, enviados, globos: globosEnviados, fallidos }, null, 2),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
function pausaDe(texto, t0) {
  const gastado = Date.now() - t0;
  if (gastado > PRESUPUESTO_MS * 0.7) return 250;
  return Math.min(Math.max(texto.length * 22, 700), 2400) + rand(-200, 400);
}
