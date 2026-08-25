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
// Asi que `entry.ts` sigue siendo la fuente editable —importa _core con
// normalidad— y este script genera el `bundle.ts` de un solo modulo que es lo
// que function.jsonc declara como entry. Editar el bundle a mano no tiene
// sentido: se regenera en cada build.
//
// POR QUE ESBUILD Y NO CONCATENAR. La version anterior borraba los imports con
// expresiones regulares y pegaba los archivos en orden topologico. Aplanar asi
// mete todos los modulos en un mismo ambito, y eso rompe de dos formas que el
// despliegue no reportaba:
//
//   1. Colisiones. whatsapp.ts y telegram.ts declaran cada uno su `const API` y
//      su `function normalizar`. Al aplanarlos, uno pisaba al otro: el webhook
//      de Telegram terminaba normalizando con el codigo de WhatsApp.
//   2. Namespaces huerfanos. `import * as tg from './canales/telegram.ts'` se
//      borraba, pero las llamadas `tg.enviar(...)` quedaban apuntando a un `tg`
//      que ya no existia. enviarPendientes quedo con tres referencias muertas.
//
// El bundle resultante no compilaba, Base44 rechazaba el despliegue y seguia
// sirviendo la ultima version buena: el codigo se veia actualizado en el repo y
// en el sandbox, pero el agente que contestaba era el de cinco commits atras.
// Nada lo delataba porque `npm run build` typecheckeaba entry.ts y _core, que
// son correctos — nunca el bundle, que es el archivo que de verdad se ejecuta.
//
// esbuild resuelve el grafo entendiendo ambitos: renombra lo que colisiona y
// convierte los namespaces en objetos reales. Y el build ahora typecheckea el
// bundle (ver tsconfig.bundles.json), que es lo que habria cazado esto el
// primer dia.
//
//   node scripts/empaquetar.mjs            empaqueta todas las consumidoras
//   node scripts/empaquetar.mjs <funcion>  empaqueta una
//   node scripts/empaquetar.mjs --check    falla si algun bundle esta desactualizado

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildSync } from 'esbuild';

const RAIZ = 'base44/functions';

// Funciones cuyo grafo pasa del limite y hay que entregar empaquetadas.
// Las livianas no lo necesitan: un bundle innecesario solo estorba al depurar.
// continuarTurno se elimino: retomaba turnos aparcados y ya no se aparca ninguno.
const EMPAQUETAR = ['agenteInbound', 'asistente14', 'enviarPendientes'];

const args = process.argv.slice(2);
const soloCheck = args.includes('--check');
const objetivos = args.filter((a) => !a.startsWith('--'));
const funciones = objetivos.length ? objetivos : EMPAQUETAR;

const CABECERA = [
  '// ARCHIVO GENERADO por scripts/empaquetar.mjs — no editar a mano.',
  '//',
  '// Base44 no registra funciones cuyo grafo de imports pasa de ~9 modulos.',
  '// La fuente editable es entry.ts + _core/; esto es su aplanado, y es lo que',
  '// function.jsonc declara como entry.',
  '//',
  '// Lo empaqueta esbuild, no una concatenacion: hay simbolos que se repiten',
  '// entre modulos (`API`, `normalizar` viven en whatsapp.ts y en telegram.ts)',
  '// y namespaces que hay que materializar (`import * as tg`). Pegar los',
  '// archivos en un solo ambito los hacia colisionar en silencio.',
  '',
].join('\n');

/** Cuenta los modulos del grafo, que es lo que Base44 limita. */
function contarModulos(entry) {
  const vistos = new Set();
  (function visitar(archivo) {
    if (vistos.has(archivo)) return;
    vistos.add(archivo);
    for (const m of readFileSync(archivo, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const dep = resolve(dirname(archivo), m[1]);
      if (existsSync(dep)) visitar(dep);
    }
  })(entry);
  return vistos.size;
}

/** Devuelve el contenido del bundle de una funcion, o null si no existe. */
function generar(fnNombre) {
  const dirFn = resolve(RAIZ, fnNombre);
  const entry = resolve(dirFn, 'entry.ts');
  if (!existsSync(entry)) return null;

  const r = buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    // Deno corre ES moderno; bajar mas solo mete helpers que nadie necesita.
    target: 'es2022',
    platform: 'neutral',
    // El grafo es 100% relativo. Si algun dia entra un `npm:`/`https:`, que
    // falle aqui y no en el despliegue, que es donde no se ve.
    external: [],
    // Legible a proposito: este archivo se lee cuando algo falla en produccion,
    // y un bundle minificado ahi no sirve de nada.
    minify: false,
    charset: 'utf8',
    logLevel: 'silent',
  });

  const texto = `${CABECERA}\n${r.outputFiles[0].text}`;
  return {
    texto: texto.replace(/\r\n/g, '\n'),
    modulos: contarModulos(entry),
    destino: resolve(dirFn, 'bundle.ts'),
  };
}

const kb = (n) => (n / 1024).toFixed(1);
let desactualizados = 0;

for (const fn of funciones) {
  let r;
  try {
    r = generar(fn);
  } catch (e) {
    console.error(`  ${fn}: esbuild fallo — ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
    continue;
  }
  if (!r) { console.error(`  ${fn}: no existe entry.ts`); process.exitCode = 1; continue; }

  if (soloCheck) {
    const actual = existsSync(r.destino)
      ? readFileSync(r.destino, 'utf8').replace(/\r\n/g, '\n')
      : '';
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
