// Prepara y diagnostica el unico recorrido necesario para el demo:
// Telegram -> agente de ventas, sin pasar por el router.
//
// Se invoca desde la pagina admin Configurar IA. Nunca devuelve tokens ni
// fragmentos de secretos.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { IDENTIDAD_MARCA, PROMPTS } from './_core/prompts.ts';

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function exigirAdmin(req: Request) {
  const cliente = createClientFromRequest(req);
  const usuario = await cliente.auth.me();
  if (!usuario) return null;
  if (usuario.role === 'admin') return cliente;

  try {
    const perfiles = await cliente.asServiceRole.entities.PerfilUsuario.filter({ email: usuario.email });
    if (perfiles?.[0]?.rol === 'Admin') return cliente;
  } catch { /* sin perfil admin */ }
  return null;
}

async function telegram(token: string, metodo: string, payload: Record<string, unknown> = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    throw new Error(String(data?.description || `Telegram HTTP ${r.status}`).slice(0, 240));
  }
  return data.result;
}

async function listar(
  base: string,
  apiKey: string,
  entidad: string,
  filtros: Record<string, string | number | boolean>,
): Promise<any[] | null> {
  if (!base || !apiKey) return null;
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) qs.set(clave, String(valor));
  try {
    const r = await fetch(`${base}/api/entities/${entidad}?${qs}`, { headers: { api_key: apiKey } });
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

async function activarRespuestaInmediata(base: string, apiKey: string) {
  const existentes = await listar(base, apiKey, 'ConfigAgente', { clave: 'general', limit: 10 });
  if (existentes === null) throw new Error('No se pudo leer ConfigAgente');
  const actual = existentes[0] || null;
  const datos = {
    ...(actual || {}),
    clave: 'general',
    nombre_agente: actual?.nombre_agente || 'Asistente Inmobiliare',
    nombre_inmobiliaria: actual?.nombre_inmobiliaria || 'INMOBILIARE Julio Corredor',
    activo: true,
    demora_respuesta_min: 0,
  };
  const r = await fetch(
    actual?.id
      ? `${base}/api/entities/ConfigAgente/${actual.id}`
      : `${base}/api/entities/ConfigAgente`,
    {
      method: actual?.id ? 'PUT' : 'POST',
      headers: { api_key: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    },
  );
  if (!r.ok) throw new Error(`No se pudo activar ConfigAgente (HTTP ${r.status})`);
}

async function sembrarVentas(base: string, apiKey: string) {
  const filas = [
    { agente: 'identidad_marca', prompt: IDENTIDAD_MARCA },
    { agente: 'ventas', prompt: PROMPTS.ventas },
  ];
  const versiones: Record<string, number> = {};

  for (const fila of filas) {
    const existentes = await listar(base, apiKey, 'AgentePrompt', {
      agente: fila.agente, limit: 100,
    });
    if (existentes === null) throw new Error(`No se pudo leer el prompt ${fila.agente}`);
    const actual = [...existentes]
      .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;
    const esVentas = fila.agente === 'ventas';
    const datos = {
      ...(actual || {}),
      agente: fila.agente,
      version: (Number(actual?.version) || 0) + 1,
      prompt: fila.prompt,
      tools_habilitadas: esVentas ? [] : (actual?.tools_habilitadas || []),
      modelo: esVentas ? 'claude-sonnet-5' : (actual?.modelo || 'claude-sonnet-5'),
      effort: esVentas ? 'low' : (actual?.effort || 'low'),
      max_tokens: esVentas ? 3000 : (Number(actual?.max_tokens) || 3000),
      activo: true,
      notas: `Prompt canonico para demo sembrado el ${new Date().toISOString().split('T')[0]}`,
    };
    const r = await fetch(
      actual?.id
        ? `${base}/api/entities/AgentePrompt/${actual.id}`
        : `${base}/api/entities/AgentePrompt`,
      {
        method: actual?.id ? 'PUT' : 'POST',
        headers: { api_key: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      },
    );
    if (!r.ok) throw new Error(`No se pudo sembrar ${fila.agente} (HTTP ${r.status})`);
    versiones[fila.agente] = datos.version;
  }
  return versiones;
}

async function probarAnthropic(apiKey: string) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models/claude-sonnet-5', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function diagnosticar() {
  const base = String(Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const dedicado = Deno.env.get('TELEGRAM_BOT_VENTAS') || '';
  const compartido = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const botToken = dedicado || compartido;
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const webhookEsperado = base ? `${base}/api/functions/agenteInbound?agente=ventas` : '';

  const secretos = {
    BASE44_APP_URL: Boolean(base),
    BASE44_API_KEY: Boolean(apiKey),
    ANTHROPIC_API_KEY: Boolean(anthropicKey),
    TELEGRAM_BOT_TOKEN: Boolean(botToken),
    TELEGRAM_WEBHOOK_SECRET: Boolean(webhookSecret),
  };

  let bot: Record<string, unknown> = {
    conectado: false,
    username: '',
    webhook_correcto: false,
    webhook_url: '',
    pendientes: 0,
    ultimo_error: '',
    origen_token: dedicado ? 'TELEGRAM_BOT_VENTAS' : (compartido ? 'TELEGRAM_BOT_TOKEN' : ''),
  };
  if (botToken) {
    try {
      const [yo, info] = await Promise.all([
        telegram(botToken, 'getMe'),
        telegram(botToken, 'getWebhookInfo'),
      ]);
      bot = {
        ...bot,
        conectado: true,
        username: String(yo?.username || ''),
        webhook_correcto: Boolean(webhookEsperado && info?.url === webhookEsperado),
        webhook_url: String(info?.url || ''),
        pendientes: Number(info?.pending_update_count) || 0,
        ultimo_error: String(info?.last_error_message || '').slice(0, 240),
      };
    } catch (error) {
      bot = { ...bot, ultimo_error: String((error as Error).message || error).slice(0, 240) };
    }
  }

  const [propiedades, asesores, prompts, configs, chunks] = await Promise.all([
    listar(base, apiKey, 'Propiedad', { estado: 'Disponible', limit: 100 }),
    listar(base, apiKey, 'Asesor', { estado: 'Activo', limit: 100 }),
    listar(base, apiKey, 'AgentePrompt', { agente: 'ventas', limit: 100 }),
    listar(base, apiKey, 'ConfigAgente', { clave: 'general', limit: 10 }),
    listar(base, apiKey, 'ConocimientoRAG', { activo: true, limit: 200 }),
  ]);

  const promptActivo = [...(prompts || [])]
    .filter((fila) => fila.activo !== false)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;
  const config = configs?.[0] || null;
  const ragVentas = (chunks || []).filter((chunk) => String(chunk.agentes || '')
    .split(',')
    .map((valor) => valor.trim().toLowerCase())
    .some((valor) => valor === 'ventas' || valor === 'todos')).length;

  const faltantes = Object.entries(secretos).filter(([, valor]) => !valor).map(([nombre]) => nombre);
  const listo = faltantes.length === 0
    && bot.conectado === true
    && bot.webhook_correcto === true
    && Boolean(promptActivo)
    && config?.activo !== false
    && Number(propiedades?.length || 0) > 0;

  return {
    listo,
    secretos,
    faltantes,
    bot,
    agente: {
      prompt_activo: Boolean(promptActivo),
      prompt_version: Number(promptActivo?.version) || null,
      ia_activa: config?.activo !== false,
      demora_min: Number(config?.demora_respuesta_min) || 0,
      inmuebles_disponibles: propiedades?.length ?? null,
      asesores_activos: asesores?.length ?? null,
      chunks_rag: chunks === null ? null : ragVentas,
    },
    webhook_esperado: webhookEsperado,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let cliente;
  try { cliente = await exigirAdmin(req.clone()); } catch { cliente = null; }
  if (!cliente) return json({ error: 'Solo un administrador puede preparar el demo' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* body vacio = estado */ }
  const accion = String(body?.accion || 'estado').toLowerCase();
  if (accion === 'estado') return json(await diagnosticar());
  if (accion !== 'preparar') return json({ error: 'Accion invalida' }, 400);

  const base = String(Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const botToken = Deno.env.get('TELEGRAM_BOT_VENTAS') || Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const faltantes = [
    !base && 'BASE44_APP_URL',
    !apiKey && 'BASE44_API_KEY',
    !anthropicKey && 'ANTHROPIC_API_KEY',
    !botToken && 'TELEGRAM_BOT_TOKEN',
    !webhookSecret && 'TELEGRAM_WEBHOOK_SECRET',
  ].filter(Boolean);
  if (faltantes.length) return json({ error: 'Faltan secrets en Base44', faltantes }, 400);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    return json({
      error: 'TELEGRAM_WEBHOOK_SECRET solo puede contener letras, numeros, guion y guion bajo',
    }, 400);
  }

  const modelo = await probarAnthropic(anthropicKey);
  if (!modelo.ok) {
    return json({ error: `Anthropic no acepto la credencial o el modelo (HTTP ${modelo.status || 'sin conexion'})` }, 502);
  }

  try {
    const prompts = await sembrarVentas(base, apiKey);
    await activarRespuestaInmediata(base, apiKey);
    const webhookUrl = `${base}/api/functions/agenteInbound?agente=ventas`;
    await telegram(botToken, 'setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
    return json({ ...(await diagnosticar()), modelo, prompts, preparado: true });
  } catch (error) {
    return json({ error: String((error as Error).message || error).slice(0, 300) }, 502);
  }
});
