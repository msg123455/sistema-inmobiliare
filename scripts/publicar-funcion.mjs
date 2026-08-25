#!/usr/bin/env node
/**
 * Publica una funcion bajo un nombre NUEVO y despliega.
 *
 *   node scripts/publicar-funcion.mjs codigosMensuales
 *   node scripts/publicar-funcion.mjs codigosMensuales --dry
 *
 * NO USAR SIN LEER ESTO. El motivo por el que se escribio resulto ser falso a
 * medias, y usarlo rompe cosas.
 *
 * La sincronizacion desde GitHub PODA las funciones que no tienen directorio en
 * el repo, y este script borra el directorio numerado al terminar. Asi
 * desaparecieron solas codigosMensuales2, 5 y 6 —y sincronizarSimi3—, dejando a
 * la pantalla llamando a un nombre inexistente: un "Error 404" que parecia un
 * fallo de Mailchimp.
 *
 * Ademas el problema que venia a resolver no aplica por aqui: el artefacto
 * congelado es cosa de `base44 functions deploy` desde el CLI. La sincronizacion
 * desde GitHub si reemplaza, comprobado con codigosMensuales sirviendo la
 * revision 7.
 *
 * Para desplegar un cambio: tocar el directorio base y empujar a GitHub. Esto
 * solo tiene sentido si algun dia hay que forzar un nombre nuevo a proposito, y
 * entonces hay que quitarle el borrado del directorio.
 *
 * POR QUE SE ESCRIBIO. Base44 sirve el artefacto del PRIMER despliegue de un nombre:
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
import { execFileSync, spawnSync } from 'node:child_process';
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

// Los nombres gastados se le preguntan a BASE44, no al repo.
//
// Antes se miraban los directorios locales, y este script los borra despues de
// desplegar: la corrida siguiente no encontraba ninguno, calculaba la version 2
// y publicaba sobre un nombre que ya existia. Como Base44 sirve el artefacto del
// primer despliegue, eso no cambiaba nada y aun asi imprimia "deployed". Un
// despliegue que no despliega y no lo dice es peor que uno que falla.
// Se leen los DOS flujos: el CLI imprime el listado por stderr, asi que
// quedarse solo con stdout devolvia una lista vacia y el script concluia que no
// habia ninguna version desplegada.
const res = spawnSync('npx',
  ['--yes', 'base44@0.1.9', '--app-id', APP_ID, 'functions', 'list'],
  { encoding: 'utf8', shell: process.platform === 'win32' });
const listado = `${res.stdout || ''}
${res.stderr || ''}`;
if (!listado.trim()) {
  console.error('No se pudo listar las funciones desplegadas. Se aborta para no publicar sobre un nombre usado.');
  process.exit(1);
}

const reNombre = new RegExp(`^${base}(\\d*)$`);
const usados = listado.split('\n')
  .map((l) => l.trim().match(reNombre))
  .filter(Boolean)
  // El nombre sin sufijo cuenta como la version 1.
  .map((m) => Number(m[1] || 1));

const n = usados.length ? Math.max(...usados) + 1 : 2;
const nombre = `${base}${n}`;

// Copias locales de intentos anteriores, solo para limpiarlas al final.
const previas = readdirSync(RAIZ).filter((d) => new RegExp(`^${base}\\d+$`).test(d));

console.log(`  versiones ya desplegadas: ${[...usados].sort((a, b) => a - b).join(', ') || 'ninguna'}`);

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
