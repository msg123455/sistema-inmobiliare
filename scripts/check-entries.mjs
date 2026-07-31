// Verifica que ningun entry.ts de Base44 tenga `export` en el nivel superior.
//
// POR QUE: un entry de Base44 es un script, no un modulo. Basta un `export`
// suelto para que Deno lo trate como modulo ES, Base44 no registre la funcion, y
// el endpoint responda 404. El fallo no dice nada util —la funcion simplemente
// no existe— y desde el codigo se ve perfectamente valida: compila, pasa el
// typecheck y se ve igual que las que si funcionan.
//
// Nos costo varias rondas de despliegue diagnosticar exactamente eso en
// importarInventario, con el agravante de que el sintoma cambiaba entre
// "No autorizado" y 404 segun que version estuviera arriba.
//
// Es la misma razon por la que empaquetar.mjs quita los `export` al aplanar
// modulos: alli esta explicado en el mismo sitio donde se hace.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'base44/functions';

// `export` a inicio de linea. Se ignora lo que este dentro de un comentario de
// bloque, que es donde suelen aparecer ejemplos.
const RE_EXPORT = /^export\s/gm;

function sinComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // bloque
    .replace(/^[^\S\r\n]*\/\/.*$/gm, ''); // linea
}

// Base44 acepta DOS formas de escribir una funcion y son excluyentes:
//
//   1. script:  Deno.serve(async (req) => { ... })       — 26 del repo
//   2. accion:  export default async function(params, ctx) — 1 del repo
//
// Lo que rompe es mezclarlas: un script con un `export` suelto deja de ser
// script. La forma 2 es legitima y no se toca.
const problemas = [];
for (const fn of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!fn.isDirectory()) continue;
  const entry = join(RAIZ, fn.name, 'entry.ts');
  if (!existsSync(entry)) continue;

  const src = sinComentarios(readFileSync(entry, 'utf8'));
  if (!src.includes('Deno.serve')) continue;   // es una accion, no un script

  src.split(/\r?\n/).forEach((l, i) => {
    if (/^export\s/.test(l)) problemas.push(`${fn.name}/entry.ts:${i + 1}  ${l.trim().slice(0, 70)}`);
  });
}

if (problemas.length) {
  console.error(`\n${problemas.length} export(s) en el nivel superior de un entry de Base44:\n`);
  for (const p of problemas) console.error(`  ${p}`);
  console.error('\nEstas funciones usan Deno.serve, o sea que son scripts. Con un export suelto');
  console.error('Deno las trata como modulo ES, Base44 no las registra y el endpoint da 404.');
  console.error('Quita el `export` — dentro del mismo archivo no hace falta.\n');
  process.exit(1);
}

console.log('Entries sin exports sueltos.');
