#!/usr/bin/env node
// Copia base44/functions/_core/ dentro de cada funcion que lo consume.
//
// POR QUE ESTO EXISTE: Base44 bundlea cada funcion por separado y RECHAZA en
// tiempo de build cualquier import relativo que salga de su propia carpeta
// ("Relative imports can't reach outside the function"). Verificado desplegando
// una sonda: `../_core/x.ts` falla el bundle, `./_core/x.ts` responde 200.
//
// Asi que `_core/` es la fuente de verdad y editable; las copias `<fn>/_core/`
// son generadas y se commitean, porque Base44 despliega desde el repo.
//
//   node scripts/sync-core.mjs           sincroniza
//   node scripts/sync-core.mjs --check   falla si algo esta desincronizado (CI)

import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const RAIZ = 'base44/functions';
const FUENTE = join(RAIZ, '_core');

// Funciones que importan _core. Agregar aqui al crear una nueva.
const CONSUMIDORAS = ['agenteInbound', 'enviarPendientes', 'continuarTurno'];

const soloCheck = process.argv.includes('--check');

function archivos(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p, base));
    else if (e.name.endsWith('.ts')) out.push(relative(base, p));
  }
  return out;
}

if (!existsSync(FUENTE)) {
  console.error(`No existe ${FUENTE}`);
  process.exit(1);
}

const fuentes = archivos(FUENTE);
let desincronizados = 0;

for (const fn of CONSUMIDORAS) {
  const dirFn = join(RAIZ, fn);
  if (!existsSync(dirFn)) {
    console.error(`Funcion no encontrada: ${dirFn}`);
    process.exit(1);
  }
  const destino = join(dirFn, '_core');

  if (!soloCheck && existsSync(destino)) rmSync(destino, { recursive: true, force: true });

  for (const rel of fuentes) {
    const src = join(FUENTE, rel);
    const dst = join(destino, rel);
    const contenido = readFileSync(src, 'utf8');

    if (soloCheck) {
      if (!existsSync(dst) || readFileSync(dst, 'utf8') !== contenido) {
        console.error(`DESINCRONIZADO: ${dst}`);
        desincronizados++;
      }
      continue;
    }
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, contenido);
  }

  if (!soloCheck) console.log(`${fn}/_core  <-  ${fuentes.length} archivos`);
}

if (soloCheck) {
  if (desincronizados) {
    console.error(`\n${desincronizados} archivo(s) desincronizados. Corre: npm run sync:core`);
    process.exit(1);
  }
  console.log('_core sincronizado en todas las funciones consumidoras.');
}
