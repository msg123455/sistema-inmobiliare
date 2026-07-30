#!/usr/bin/env node
// Empaqueta el grafo de imports de una funcion en UN solo bundle.ts.
//
// POR QUE EXISTE: Base44 limita la cantidad de MODULOS del grafo de imports de
// una funcion, no su tamano. Verificado con dos sondas de los mismos bytes:
//
//   pingUnico    1 modulo   108 KB   ->  despliega
//   pingPesado  19 modulos  110 KB   ->  no la registra siquiera
//
// Por eso agenteInbound (24 modulos) y continuarTurno (18) nunca aparecieron en
// el panel, mientras enviarPendientes (9) si. El limite esta entre 9 y 18.
//
// El grafo cuenta, no los archivos de la carpeta: enviarPendientes tiene 26
// archivos en su carpeta y solo 9 en su grafo, y despliega bien.
//
// Asi que `entry.ts` sigue siendo la fuente editable —importa _core con normalidad—
// y este script genera el `bundle.ts` de un solo modulo que es lo que
// function.jsonc declara como entry. Editar el bundle a mano no tiene sentido:
// se regenera en cada build.
//
//   node scripts/empaquetar.mjs            empaqueta todas las consumidoras
//   node scripts/empaquetar.mjs <funcion>  empaqueta una
//   node scripts/empaquetar.mjs --check    falla si algun bundle esta desactualizado

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const RAIZ = 'base44/functions';

// Funciones cuyo grafo pasa del limite y hay que entregar empaquetadas.
// Las livianas no lo necesitan: un bundle innecesario solo estorba al depurar.
const EMPAQUETAR = ['agenteInbound', 'continuarTurno', 'enviarPendientes'];

const args = process.argv.slice(2);
const soloCheck = args.includes('--check');
const objetivos = args.filter((a) => !a.startsWith('--'));
const funciones = objetivos.length ? objetivos : EMPAQUETAR;

const RE_IMPORT_REL = /^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+'(\.[^']+)';?\s*$/gm;

/** Quita imports/exports entre modulos propios; conserva los de npm/deno. */
function limpiar(src, esEntry) {
  let out = src.replace(RE_IMPORT_REL, '');
  // `export const x` -> `const x`: en un solo archivo no hay nada que exportar,
  // y dejar los `export` haria que Deno lo trate como modulo con exports sueltos.
  if (!esEntry) {
    out = out
      .replace(/^\s*export\s+(const|function|async function|class|interface|type|enum)\b/gm, '$1')
      .replace(/^\s*export\s+default\s+/gm, '')
      .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
  }
  return out.trim();
}

/** Devuelve el contenido del bundle de una funcion, o null si no existe. */
function generar(fnNombre) {
  const dirFn = resolve(RAIZ, fnNombre);
  const entry = resolve(dirFn, 'entry.ts');
  if (!existsSync(entry)) return null;

  // Orden topologico: las dependencias van antes que quien las usa.
  const orden = [];
  const estado = new Map();
  (function visitar(archivo) {
    if (estado.get(archivo)) return; // 'visitando' (ciclo) o 'listo'
    estado.set(archivo, 'visitando');
    for (const m of readFileSync(archivo, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const dep = resolve(dirname(archivo), m[1]);
      if (existsSync(dep)) visitar(dep);
    }
    estado.set(archivo, 'listo');
    orden.push(archivo);
  })(entry);

  const partes = [
    '// ARCHIVO GENERADO por scripts/empaquetar.mjs — no editar a mano.',
    '//',
    `// Base44 no registra funciones cuyo grafo de imports pasa de ~9 modulos.`,
    `// La fuente editable es entry.ts + _core/; esto es su aplanado (${orden.length} modulos`,
    '// -> 1) y es lo que function.jsonc declara como entry.',
    '',
  ];

  for (const archivo of orden) {
    const rel = relative(dirFn, archivo).replace(/\\/g, '/');
    const limpio = limpiar(readFileSync(archivo, 'utf8'), archivo === entry);
    if (!limpio) continue;
    partes.push(`// ─── ${rel} ${'─'.repeat(Math.max(3, 60 - rel.length))}`);
    partes.push(limpio, '');
  }

  return { texto: partes.join('\n'), modulos: orden.length, destino: resolve(dirFn, 'bundle.ts') };
}

const kb = (n) => (n / 1024).toFixed(1);
let desactualizados = 0;

for (const fn of funciones) {
  const r = generar(fn);
  if (!r) { console.error(`  ${fn}: no existe entry.ts`); process.exitCode = 1; continue; }

  if (soloCheck) {
    const actual = existsSync(r.destino) ? readFileSync(r.destino, 'utf8') : '';
    if (actual !== r.texto) {
      console.error(`  ${fn}: bundle.ts desactualizado — corre "npm run empaquetar"`);
      desactualizados++;
    }
    continue;
  }

  mkdirSync(dirname(r.destino), { recursive: true });
  writeFileSync(r.destino, r.texto, 'utf8');
  console.log(`  ${fn.padEnd(20)} ${String(r.modulos).padStart(2)} modulos -> 1  (${kb(r.texto.length)} KB)`);
}

if (soloCheck) {
  if (desactualizados) process.exit(1);
  console.log('Bundles al dia.');
}
