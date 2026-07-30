// Worker de entrega. Cron cada minuto.
//
// Antes parseaba 500 filas de Nota por corrida para encontrar las pocas que
// tenian algo pendiente, lo que obligaba a un tope de 6 leads. Ahora consulta
// ColaSalida por estado y el tope sube a algo realista.
//
// La simulacion de tipeo vive aqui, no en el webhook: el request de entrada
// tiene 15s y no puede gastarlos durmiendo.

import { crearDb } from './_core/db.ts';
import { agentesAutomaticosActivos } from './_core/contexto.ts';
import * as wa from './_core/canales/whatsapp.ts';
import * as tg from './_core/canales/telegram.ts';
import { tokenDeAgente } from './_core/canales/bots.ts';

const MAX_POR_CORRIDA = 40;
const MAX_INTENTOS = 3;
const PRESUPUESTO_MS = 11_000;   // margen sobre el corte de ~15s de Base44

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET desde el cron */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  // Base44 entrega function_args dentro de `args` en algunas ejecuciones del
  // scheduler; mantener tambien query/body directo permite invocacion manual.
  const dado = url.searchParams.get('token') || body?.token || body?.args?.token || '';
  if (!esperado || dado !== esperado) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const env = {
    waPhoneId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '',
    waToken:   Deno.env.get('WHATSAPP_API_TOKEN') || '',
    tgToken:   Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
  };
  const db = crearDb(Deno.env.get('BASE44_API_KEY') || '');

  // El switch global tambien detiene mensajes que ya estaban en la cola. No se
  // marcan como fallidos: quedan pendientes para cuando el equipo reactive la IA.
  const config = await db.uno('ConfigAgente', { clave: 'general' });
  if (!agentesAutomaticosActivos(config)) {
    return new Response(JSON.stringify({ ok: true, skip: 'IA global inactiva' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const t0 = Date.now();
  const ahora = Date.now();
  const pendientes = (await db.list('ColaSalida', { estado: 'pendiente', limit: MAX_POR_CORRIDA }))
    .filter((c: any) => new Date(c.enviar_en || 0).getTime() <= ahora)
    .sort((a: any, b: any) => new Date(a.enviar_en).getTime() - new Date(b.enviar_en).getTime());

  let enviados = 0, globosEnviados = 0, fallidos = 0;

  for (const item of pendientes) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;   // el resto lo toma la corrida siguiente

    const globos: string[] = Array.isArray(item.globos) ? item.globos : [];
    if (!globos.length) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviado', error: 'sin globos' });
      continue;
    }

    // Marcar como en curso antes de enviar: si la funcion muere a mitad, la
    // corrida siguiente no reenvia lo que ya salio.
    await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviando', intentos: (item.intentos || 0) + 1 });

    let ok = true;
    try {
      if (item.canal === 'telegram') {
        // El bot que responde es el del agente que escribio el mensaje: si le
        // contestara el bot compartido, el cliente veria la respuesta en otro
        // chat del que escribio.
        const tgEnv = { tgToken: tokenDeAgente(item.agente) };
        if (!tgEnv.tgToken) throw new Error(`sin token de Telegram para "${item.agente || 'compartido'}"`);
        await tg.marcarEscribiendo(item.destino, tgEnv);
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!(await tg.enviar(item.destino, g, tgEnv))) ok = false;
          globosEnviados++;
        }
      } else if (item.canal === 'whatsapp' && env.waPhoneId && env.waToken) {
        for (const g of globos) {
          await sleep(pausaDe(g, t0));
          if (!(await wa.enviar(item.destino, g, env))) ok = false;
          globosEnviados++;
        }
      } else {
        ok = false;
      }
    } catch (e) {
      console.error('entrega error:', (e as Error).message);
      ok = false;
    }

    const intentos = (item.intentos || 0) + 1;
    if (ok) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'enviado', intentos, enviado_en: new Date().toISOString(), error: '' });
      enviados++;
    } else if (intentos >= MAX_INTENTOS) {
      await db.actualizar('ColaSalida', item.id, { ...item, estado: 'fallido', intentos, error: 'agotados los reintentos' });
      fallidos++;
    } else {
      // Vuelve a la cola con backoff.
      await db.actualizar('ColaSalida', item.id, {
        ...item, estado: 'pendiente', intentos,
        enviar_en: new Date(Date.now() + intentos * 60_000).toISOString(),
        error: 'reintentando',
      });
      fallidos++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, en_cola: pendientes.length, enviados, globos: globosEnviados, fallidos }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

// Pausa proporcional al largo del mensaje, con variacion. Se recorta si la
// corrida se esta quedando sin presupuesto: entregar tarde es mejor que no
// entregar.
function pausaDe(texto: string, t0: number): number {
  const gastado = Date.now() - t0;
  if (gastado > PRESUPUESTO_MS * 0.7) return 250;
  return Math.min(Math.max(texto.length * 22, 700), 2400) + rand(-200, 400);
}
