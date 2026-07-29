// Sonda de despliegue: confirma que una funcion puede importar de una subcarpeta propia.
import { CORE_VERSION } from './_core/version.ts';

Deno.serve(() =>
  new Response(JSON.stringify({ ok: true, core_version: CORE_VERSION }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);
