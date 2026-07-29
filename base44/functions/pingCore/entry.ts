// Sonda de despliegue: confirma que una funcion puede importar de subcarpetas propias anidadas.
import { CORE_VERSION } from './_core/version.ts';
import { marca } from './_core/tools/comunes.ts';

Deno.serve(() =>
  new Response(JSON.stringify({ ok: true, core_version: CORE_VERSION, anidado: marca() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);
