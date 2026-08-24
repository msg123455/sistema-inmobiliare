#!/usr/bin/env node
/**
 * Comprueba que las copias numeradas de una funcion sean identicas a su base.
 *
 * POR QUE EXISTE. Base44 sirve el artefacto del PRIMER despliegue de un nombre,
 * asi que cada cambio obliga a publicar bajo un nombre nuevo: sincronizarSimi ->
 * sincronizarSimi2 -> sincronizarSimi3. publicar-funcion.mjs clona el directorio
 * base, despliega y borra la copia.
 *
 * Aqui la copia se conserva a proposito, porque quien publica lo hace desde la
 * interfaz de Base44 y no por CLI: si el directorio no esta, la publicacion
 * puede dejar sin desplegar la funcion a la que apunta el frontend.
 *
 * El precio de conservarla es que puede quedar desincronizada. Y desincronizada
 * es peor que ausente: el repo muestra el codigo nuevo, la pantalla llama a la
 * copia vieja, y las dos cosas parecen correctas por separado. Ya paso con
 * asistente8, que se quedo cinco commits atras sin que nada lo dijera.
 *
 * La regla es simple: si existe sincronizarSimiN, su entry.ts tiene que ser
 * byte a byte el de sincronizarSimi.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'base44/functions';
const dirs = readdirSync(RAIZ, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Toda copia numerada cuyo nombre base tambien exista como directorio.
const clones = dirs
  .map((n) => ({ clon: n, base: n.replace(/\d+$/, '') }))
  .filter(({ clon, base }) => clon !== base && dirs.includes(base));

let fallos = 0;
for (const { clon, base } of clones) {
  const a = join(RAIZ, base, 'entry.ts');
  const b = join(RAIZ, clon, 'entry.ts');
  if (!existsSync(a) || !existsSync(b)) continue;
  if (readFileSync(a, 'utf8') !== readFileSync(b, 'utf8')) {
    fallos++;
    console.error(`  ${clon}/entry.ts difiere de ${base}/entry.ts`);
    console.error('    La pantalla llama al clon, asi que corre codigo viejo.');
    console.error(`    Arreglo: copiar ${base}/entry.ts sobre ${clon}/entry.ts,`);
    console.error('    o publicar una version nueva con publicar-funcion.mjs.');
  }
}

if (fallos) {
  console.error(`\nclones: ${fallos} desincronizado(s)`);
  process.exit(1);
}
console.log(`clones: OK — ${clones.length} copia(s) numerada(s) al dia`);
