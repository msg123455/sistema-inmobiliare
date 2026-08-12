#!/usr/bin/env node
// Empaqueta scripts/test-agent-core.mjs con esbuild y lo corre.
//
// POR QUE: el banco importa .ts de base44/functions/_core/ y Node 20 no sabe
// cargarlos (ERR_UNKNOWN_FILE_EXTENSION). --experimental-strip-types llega en
// Node 22.6 y no se puede asumir en el entorno de publicacion. esbuild ya es una
// dependencia (la usa scripts/empaquetar.mjs), asi que se aplana el grafo a JS
// estandar y se importa el resultado.
//
// El bundle se escribe AL LADO del original (en scripts/) a proposito: el banco
// usa `new URL('../base44/...', import.meta.url)` y `readFileSync` con rutas
// relativas al cwd. Si el bundle viviera en un tmpdir, import.meta.url apuntaria
// ahi y esas rutas se romperian. Como queda en scripts/, resuelven igual que
// siempre.
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entrada = fileURLToPath(new URL('./test-agent-core.mjs', import.meta.url));
const destino = fileURLToPath(new URL('./.test-agent-core.bundle.mjs', import.meta.url));

const r = buildSync({
  entryPoints: [entrada],
  bundle: true,
  format: 'esm',
  // platform: node deja `node:*` como externos automaticamente.
  platform: 'node',
  target: 'es2022',
  write: false,
  minify: false,
  logLevel: 'silent',
});

writeFileSync(destino, r.outputFiles[0].text, 'utf8');

// Se importa por URL y no por ruta del sistema: en Windows `destino` es
// "c:\...\bundle.mjs" y el loader ESM lo lee como el esquema de protocolo "c:",
// asi que revienta con ERR_UNSUPPORTED_ESM_URL_SCHEME. En Linux y macOS pasa
// desapercibido porque las rutas absolutas empiezan por "/".
await import(new URL('./.test-agent-core.bundle.mjs', import.meta.url).href);