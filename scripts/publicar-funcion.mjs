#!/usr/bin/env node
/**
 * Publica una funcion bajo un nombre NUEVO y despliega.
 *
 *   node scripts/publicar-funcion.mjs codigosMensuales
 *   node scripts/publicar-funcion.mjs codigosMensuales --dry
 *
 * POR QUE EXISTE. Base44 sirve el artefacto del PRIMER despliegue de un nombre:
 * los siguientes suben, dicen "deployed" y no reemplazan nada. Ya estaba
 * documentado para la funcion conversacional en publicar-asistente.mjs; se
 * comprobo que pasa igual con las demas desplegando codigosMensuales con un
 * campo `revision: 2` en su respuesta y viendo que la funcion viva seguia sin
 * traerlo.
 *
 * Este script es la version generica: el directorio del repo es la fuente de
 * verdad y siempre se clona de ahi, nunca de la copia numerada anterior —que es
 * codigo congelado del dia que se creo, y clonar de ella ya casi despliega
 * codigo viejo una vez en publicar-asistente.mjs—.
 *
 * El nombre desplegado hay que dejarlo en src/lib/backend.js (FUNCIONES), que es
 * de donde lo lee el frontend. El script lo recuerda al terminar.
 *
 * Cuando Base44 arregle el despliegue por nombre, esto se borra.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = 'base44/functions';
const APP_ID = process.env.BASE44_APP_ID || '6a6955aeb5063b631b78f9d3';

const base = process.argv[2];
const seco = process.argv.includes('--dry');

if (!base || base.startsWith('--')) {
  console.error('Uso: node scripts/publicar-funcion.mjs <nombreFuncion> [--dry]');
  process.exit(1);
}
if (!existsSync(resolve(RAIZ, base))) {
  console.error(`No existe ${RAIZ}/${base}`);
  process.exit(1);
}
if (/\d$/.test(base)) {
  console.error(`"${base}" ya termina en numero. Pasa el nombre base, sin version.`);
  process.exit(1);
}

// Las copias numeradas que ya se desplegaron alguna vez.
const previas = readdirSync(RAIZ)
  .filter((d) => new RegExp(`^${base}\\d+$`).test(d))
  .sort((a, b) => Number(a.slice(base.length)) - Number(b.slice(base.length)));

const usados = previas.map((d) => Number(d.slice(base.length)));
// Se empieza en 2: el 1 es el nombre sin sufijo, que ya se gasto.
const n = usados.length ? Math.max(...usados) + 1 : 2;
const nombre = `${base}${n}`;

console.log(`\n== publicando ${nombre} (clonado de ${base}) ==\n`);

const destino = resolve(RAIZ, nombre);
rmSync(destino, { recursive: true, force: true });
cpSync(resolve(RAIZ, base), destino, { recursive: true });

if (seco) {
  console.log(`  ${nombre} preparado, sin desplegar (--dry).\n`);
  process.exit(0);
}

// En Windows npx es un .cmd y CreateProcess no lo lanza directo, asi que hace
// falta el shell. Se intento sin el para evitar la concatenacion sin escapar y
// falla con ENOENT. Es aceptable porque aqui no entra texto del usuario: el
// nombre se valida contra los directorios del repo y el app-id es un id fijo.
// El finally limpia tambien cuando el despliegue falla. Sin el, un intento
// fallido dejaba el directorio a medias, la siguiente corrida lo contaba como
// version ya usada y saltaba un numero: paso una vez y publico como 3 lo que
// debia ser 2.
try {
  execFileSync('npx', ['--yes', 'base44@0.1.9', '--app-id', APP_ID, 'functions', 'deploy', nombre], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} finally {
  // La copia solo servia para desplegar. Dejarla en el repo invita a editarla
  // por error, y editarla no hace nada: la fuente es el directorio base.
  rmSync(destino, { recursive: true, force: true });
}
for (const vieja of previas) rmSync(resolve(RAIZ, vieja), { recursive: true, force: true });

console.log(`
  DESPLEGADO: ${nombre}

  Falta apuntar el frontend a ese nombre:
    src/lib/backend.js  ->  FUNCIONES

  Y comprobarlo:
    curl -s -X POST https://inmobiliare.base44.app/api/functions/${nombre} \\
      -H 'Content-Type: application/json' \\
      -d '{"token":"<FUNCTIONS_TOKEN>","modo":"sonda"}'
`);
