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

// Funciones que importan _core. Las conversacionales necesitan el arbol entero;
// el seed solo importa prompts.ts.
// `asistente` es la que atiende de verdad; agenteInbound queda porque Base44 le
// dejo pegado un artefacto viejo que ejecuta codigo que no esta en el repo.
// continuarTurno se elimino: retomaba turnos aparcados y ya no se aparca ninguno.
const CONSUMIDORAS = [
  { nombre: 'agenteInbound' },
  { nombre: 'enviarPendientes' },
  { nombre: 'seedAgentes', archivos: ['prompts.ts'] },
  { nombre: 'configurarDemoVentas', archivos: ['prompts.ts'] },
  // Los asistenteN se descubren solos, mas abajo.
];

// El asistente desplegado NO estaba en la lista, y esa omision es capaz de
// tragarse un arreglo entero.
//
// publicar-asistente.mjs crea asistenteN clonando agenteInbound con su _core al
// dia, asi que el que se despliega sale bien. Pero mientras ese asistenteN sigue
// en el repo, su _core se queda congelado: se puede arreglar _core, correr
// sync:core y empaquetar, y ver `check-bundles ok` con la funcion que atiende de
// verdad apuntando a codigo viejo. El bundle se regenera desde la copia rancia,
// asi que es coherente consigo mismo y CI pasa en verde.
//
// Se descubren por nombre para que no haya que acordarse de anadirlos.
for (const dir of readdirSync(RAIZ, { withFileTypes: true })) {
  if (dir.isDirectory() && /^asistente\d*$/.test(dir.name)) CONSUMIDORAS.push({ nombre: dir.name });
}

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

for (const consumidor of CONSUMIDORAS) {
  const fn = consumidor.nombre;
  const dirFn = join(RAIZ, fn);
  if (!existsSync(dirFn)) {
    console.error(`Funcion no encontrada: ${dirFn}`);
    process.exit(1);
  }
  const destino = join(dirFn, '_core');

  if (!soloCheck && existsSync(destino)) rmSync(destino, { recursive: true, force: true });

  const requeridos = consumidor.archivos || fuentes;
  for (const rel of requeridos) {
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

  if (!soloCheck) console.log(`${fn}/_core  <-  ${requeridos.length} archivos`);
}

if (soloCheck) {
  if (desincronizados) {
    console.error(`\n${desincronizados} archivo(s) desincronizados. Corre: npm run sync:core`);
    process.exit(1);
  }
  console.log('_core sincronizado en todas las funciones consumidoras.');
}
