#!/usr/bin/env node
// Empaqueta el grafo de imports de una funcion en UN solo entry.ts.
//
// POR QUE EXISTE: Base44 no registra las funciones conversacionales
// (agenteInbound 137 KB / 24 archivos, continuarTurno 108 KB / 18) mientras que
// todas las de <= 49 KB / <= 9 archivos suben sin problema. Las dos variables
// correlacionan igual, asi que este script sirve para separarlas: si una
// funcion de los mismos bytes pero en UN archivo si despliega, el limite es de
// archivos y esto es la solucion; si tampoco, el limite es de bytes y hay que
// adelgazar de verdad.
//
//   node scripts/empaquetar.mjs <funcion> [destino]
//
// Resuelve los imports relativos en orden topologico, quita los `import`/`export`
// entre modulos propios y deja intactos los de npm/deno.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const [fnNombre, destinoArg] = process.argv.slice(2);
if (!fnNombre) {
  console.error('Uso: node scripts/empaquetar.mjs <funcion> [destino]');
  process.exit(1);
}

const RAIZ = 'base44/functions';
const entry = resolve(RAIZ, fnNombre, 'entry.ts');
if (!existsSync(entry)) {
  console.error(`No existe ${entry}`);
  process.exit(1);
}

const RE_IMPORT_REL = /^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+'(\.[^']+)';?\s*$/gm;

/** Orden topologico: las dependencias van antes que quien las usa. */
const orden = [];
const estado = new Map(); // archivo -> 'visitando' | 'listo'

function visitar(archivo) {
  if (estado.get(archivo) === 'listo') return;
  if (estado.get(archivo) === 'visitando') return; // ciclo: ya quedara declarado
  estado.set(archivo, 'visitando');

  const src = readFileSync(archivo, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    const dep = resolve(dirname(archivo), m[1]);
    if (existsSync(dep)) visitar(dep);
  }
  estado.set(archivo, 'listo');
  orden.push(archivo);
}
visitar(entry);

/** Quita imports/exports entre modulos propios; conserva los externos. */
function limpiar(src, esEntry) {
  let out = src.replace(RE_IMPORT_REL, '');
  // `export const x` -> `const x`: en un solo archivo no hay nada que exportar.
  if (!esEntry) {
    out = out
      .replace(/^\s*export\s+(const|function|async function|class|interface|type|enum)\b/gm, '$1')
      .replace(/^\s*export\s+default\s+/gm, '')
      .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
  }
  return out.trim();
}

const partes = [
  `// ARCHIVO GENERADO — no editar a mano.`,
  `// Empaquetado de base44/functions/${fnNombre}/ por scripts/empaquetar.mjs`,
  `// Fuente: _core/ + entry.ts (${orden.length} modulos).`,
  '',
];

for (const archivo of orden) {
  const rel = relative(resolve(RAIZ, fnNombre), archivo).replace(/\\/g, '/');
  const limpio = limpiar(readFileSync(archivo, 'utf8'), archivo === entry);
  if (!limpio) continue;
  partes.push(`// ─── ${rel} ${'─'.repeat(Math.max(0, 60 - rel.length))}`);
  partes.push(limpio, '');
}

const salida = partes.join('\n');
const destino = destinoArg || resolve(RAIZ, fnNombre, 'entry.bundle.ts');
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, salida, 'utf8');

const kb = (n) => (n / 1024).toFixed(1);
console.log(`${fnNombre}: ${orden.length} modulos -> 1 archivo`);
console.log(`  ${kb(salida.length)} KB  ->  ${destino}`);
