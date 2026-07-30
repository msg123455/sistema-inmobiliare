// Siembra los prompts canonicos de los ocho agentes en AgentePrompt.
//
// La fuente de verdad es `_core/prompts.ts`, la misma que usa el runtime como
// fallback. `scripts/sync-core.mjs` copia ese modulo dentro de esta funcion para
// que Base44 pueda empaquetarla sin imports fuera de su carpeta.
//
//   POST /api/functions/seedAgentes?token=<CRON_TOKEN>
//   &sobrescribir=true actualiza las filas existentes conservando sus tools y
//   ajustes de modelo. Sin esa bandera, el seed es idempotente y no pisa nada.
//   &agente=ventas&modo_demo=true deja Ventas con el set completo de tools y
//   el modelo canonico para una prueba aislada.

import { IDENTIDAD_MARCA, PROMPTS } from './_core/prompts.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const esFlag = (v: unknown) => v === true || v === 'true' || v === '1';

Deno.serve(async (req) => {
  const reqAuth = req.clone();
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET o body vacio */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  const recibido = url.searchParams.get('token') || body?.token || body?.args?.token || '';
  let autorizado = Boolean(esperado && recibido === esperado);
  if (!autorizado) {
    try {
      const cliente = createClientFromRequest(reqAuth);
      const usuario = await cliente.auth.me();
      autorizado = usuario?.role === 'admin';
      if (!autorizado && usuario?.email) {
        const perfiles = await cliente.asServiceRole.entities.PerfilUsuario.filter({ email: usuario.email });
        autorizado = perfiles?.[0]?.rol === 'Admin';
      }
    } catch { /* sin sesion valida */ }
  }
  if (!autorizado) return json({ error: 'Unauthorized' }, 401);

  const base = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!base || !apiKey) return json({ error: 'BASE44_APP_URL o BASE44_API_KEY no configurada' }, 500);

  const sobrescribir = esFlag(url.searchParams.get('sobrescribir'))
    || esFlag(body?.sobrescribir)
    || esFlag(body?.args?.sobrescribir);
  const agenteSolicitado = String(
    url.searchParams.get('agente') || body?.agente || body?.args?.agente || '',
  ).trim().toLowerCase();
  if (agenteSolicitado && !Object.prototype.hasOwnProperty.call(PROMPTS, agenteSolicitado)) {
    return json({ error: `Agente invalido: ${agenteSolicitado}` }, 400);
  }
  const modoDemo = esFlag(url.searchParams.get('modo_demo'))
    || esFlag(body?.modo_demo)
    || esFlag(body?.args?.modo_demo);
  if (modoDemo && agenteSolicitado !== 'ventas') {
    return json({ error: 'modo_demo solo esta disponible para agente=ventas' }, 400);
  }
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };
  const filas = [
    { agente: 'identidad_marca', prompt: IDENTIDAD_MARCA },
    ...Object.entries(PROMPTS)
      .filter(([agente]) => !agenteSolicitado || agente === agenteSolicitado)
      .map(([agente, prompt]) => ({ agente, prompt })),
  ];

  const resultado: any[] = [];
  for (const fila of filas) {
    const lectura = await fetch(
      `${base}/api/entities/AgentePrompt?agente=${encodeURIComponent(fila.agente)}&limit=100`,
      { headers: hdrs },
    );
    if (!lectura.ok) {
      resultado.push({ agente: fila.agente, accion: `error lectura ${lectura.status}` });
      continue;
    }

    const existentes = ((await lectura.json()) as any[])
      .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
    const existente = existentes[0] || null;

    if (existente && !sobrescribir) {
      resultado.push({ agente: fila.agente, accion: 'ya existe, no se toco', version: existente.version || 1 });
      continue;
    }

    const esVentasDemo = modoDemo && fila.agente === 'ventas';
    const datos = {
      ...(existente || {}),
      agente: fila.agente,
      version: (Number(existente?.version) || 0) + 1,
      prompt: fila.prompt,
      tools_habilitadas: esVentasDemo ? [] : (existente?.tools_habilitadas || []),
      modelo: esVentasDemo ? 'claude-sonnet-5' : (existente?.modelo || 'claude-sonnet-5'),
      effort: esVentasDemo ? 'low' : (existente?.effort || 'low'),
      max_tokens: esVentasDemo ? 3000 : (Number(existente?.max_tokens) || 3000),
      // El apagado operativo es global (ConfigAgente.activo). Mantener una fila
      // inactiva hacía que el runtime usara silenciosamente el fallback.
      activo: true,
      notas: `Prompt canonico sembrado el ${new Date().toISOString().split('T')[0]}`,
    };
    const escritura = await fetch(
      existente
        ? `${base}/api/entities/AgentePrompt/${existente.id}`
        : `${base}/api/entities/AgentePrompt`,
      {
        method: existente ? 'PUT' : 'POST',
        headers: hdrs,
        body: JSON.stringify(datos),
      },
    );
    resultado.push({
      agente: fila.agente,
      accion: escritura.ok ? (existente ? 'actualizado' : 'creado') : `error ${escritura.status}`,
      version: datos.version,
      lineas: fila.prompt.split('\n').length,
    });
  }

  return json({ ok: resultado.every((r) => !String(r.accion).startsWith('error')), filas: resultado });
});
