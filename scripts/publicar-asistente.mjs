#!/usr/bin/env node
/**
 * Publica la funcion conversacional bajo un nombre NUEVO y despliega.
 *
 * POR QUE EXISTE, y no deberia. Base44 sirve el artefacto del PRIMER despliegue
 * de un nombre de funcion: los siguientes suben, reportan exito y no reemplazan
 * nada. Verificado bajando el bundle desplegado con `base44 functions pull` —
 * identico byte a byte al local— mientras la funcion viva imprimia en sus logs
 * frases que no existen en ningun archivo del repo. Borrar la funcion y
 * recrearla con el mismo nombre tampoco la cambia.
 *
 * La unica salida encontrada es un nombre nuevo cada vez. Esto lo hace bien:
 *
 *   1. Clona SIEMPRE desde agenteInbound, que es el entry.ts canonico. Hacerlo a
 *      mano ya casi despliega codigo viejo una vez: se clono desde el asistente
 *      anterior, cuyo entry.ts es una copia congelada, y el bundle salio
 *      identico al que se queria reemplazar. Solo se noto por el tamano.
 *   2. Sincroniza _core, empaqueta y typecheckea el bundle antes de subir.
 *   3. Borra los asistentes anteriores del repo, para que no queden seis copias
 *      del mismo codigo pudriendose.
 *
 * Cuando Base44 arregle el despliegue por nombre, esto se borra y se vuelve a
 * `functions deploy asistente`.
 *
 *   node scripts/publicar-asistente.mjs           siguiente numero libre
 *   node scripts/publicar-asistente.mjs --dry     prepara y no despliega
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = 'base44/functions';
const CANONICA = 'agenteInbound';
const APP_ID = process.env.BASE44_APP_ID || '6a6955aeb5063b631b78f9d3';
const seco = process.argv.includes('--dry');

const corre = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });

// El siguiente numero libre, mirando lo que ya existe.
const previos = readdirSync(RAIZ)
  .filter((d) => /^asistente\d*$/.test(d))
  .sort();
const usados = previos.map((d) => Number(d.replace('asistente', '') || 1));
const n = (usados.length ? Math.max(...usados) : 0) + 1;
const nombre = `asistente${n}`;

console.log(`\n== publicando ${nombre} (clonado de ${CANONICA}) ==\n`);

// 1. sync:core ANTES de clonar. El orden importa y ya fallo una vez.
//
// sync-core copia el _core canonico dentro de cada funcion consumidora, y la
// lista de consumidoras no incluye al asistente nuevo, que todavia no existe.
// Clonando primero, el clon se llevaba el _core que agenteInbound tuviera en ese
// momento —viejo— y sync:core lo actualizaba en agenteInbound pero no en el
// clon. Resultado: se desplegaba codigo viejo con un nombre nuevo, que es
// exactamente lo que este script venia a evitar.
corre('npm', ['run', 'sync:core']);

// 2. Clonar desde la canonica, ya con su _core al dia. NUNCA desde el asistente
//    anterior: su entry.ts es una copia congelada del dia que se creo.
const destino = resolve(RAIZ, nombre);
rmSync(destino, { recursive: true, force: true });
cpSync(resolve(RAIZ, CANONICA), destino, { recursive: true });

const jsonc = resolve(destino, 'function.jsonc');
writeFileSync(jsonc, readFileSync(jsonc, 'utf8').replace(`"${CANONICA}"`, `"${nombre}"`));

// 3. Registrar en el empaquetador, empaquetar y revisar el bundle.
const emp = 'scripts/empaquetar.mjs';
const txt = readFileSync(emp, 'utf8');
if (!txt.includes(`'${nombre}'`)) {
  writeFileSync(emp, txt.replace("'enviarPendientes']", `'${nombre}', 'enviarPendientes']`));
}
corre('node', ['scripts/empaquetar.mjs']);
corre('node', ['scripts/check-bundles.mjs']);

// 3. Comprobar que el bundle NO es identico al del asistente anterior. Si lo
//    fuera, se estaria desplegando lo mismo que ya esta, y el motivo de crear un
//    nombre nuevo era justamente cambiar algo.
const anterior = previos.at(-1);
if (anterior) {
  const a = readFileSync(resolve(RAIZ, anterior, 'bundle.ts'), 'utf8');
  const b = readFileSync(resolve(destino, 'bundle.ts'), 'utf8');
  if (a === b) {
    console.error(`\n  ${nombre} es identico a ${anterior}: no hay nada nuevo que desplegar.`);
    console.error('  Si esperabas un cambio, revisa que lo hiciste en el arbol canonico:');
    console.error(`  ${RAIZ}/${CANONICA}/entry.ts  y  ${RAIZ}/_core/`);
    process.exit(1);
  }
}

if (seco) {
  console.log(`\n  ${nombre} listo, sin desplegar (--dry).\n`);
  process.exit(0);
}

corre('npx', ['--yes', 'base44@0.1.9', '--app-id', APP_ID, 'functions', 'deploy', nombre]);

// 4. Fuera los anteriores del repo. Quedan en Base44 por si hay que volver.
for (const viejo of previos) {
  rmSync(resolve(RAIZ, viejo), { recursive: true, force: true });
  const t = readFileSync(emp, 'utf8');
  writeFileSync(emp, t.replace(`'${viejo}', `, ''));
}
if (previos.length) console.log(`\n  ${previos.length} asistente(s) anterior(es) quitados del repo`);

console.log(`
  DESPLEGADO: ${nombre}

  Falta apuntar el webhook de Telegram:
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://inmobiliare.base44.app/api/functions/${nombre}&secret_token=<SECRETO>
`);
