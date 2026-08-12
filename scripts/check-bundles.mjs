#!/usr/bin/env node
// Verifica que cada bundle.ts sea codigo VALIDO Y BIEN LIGADO.
//
// Es el chequeo que faltaba, y su ausencia costo cinco commits de trabajo que
// parecia desplegado y no lo estaba.
//
// tsconfig.functions.json revisa entry.ts y _core, que son la FUENTE. Lo que
// Base44 ejecuta es bundle.ts, que es una TRANSFORMACION de esa fuente. Cuando
// el empaquetador tenia un bug, la fuente compilaba perfecta y el bundle no:
// Base44 rechazaba el despliegue sin avisar y seguia sirviendo la ultima
// version que si compilo. El repo, el sandbox y el panel se veian al dia; el
// agente que contestaba era el de cinco commits atras.
//
// POR QUE NO ES UN TYPECHECK COMPLETO. El bundle es salida de esbuild: ya no
// tiene anotaciones de tipo. Typechequearlo entero produce falsos positivos a
// carretadas, porque al quitar los tipos se pierde informacion que no era
// decorativa:
//
//   crearDb(apiKey: string, baseUrl?: string)   ->   crearDb(apiKey, baseUrl)
//
// El `?` era parte de la anotacion, asi que en la salida `baseUrl` parece
// obligatorio y toda llamada con un argumento se reporta como error. Lo mismo
// con `= {}` y con las uniones que el codigo estrecha en runtime.
//
// Los tipos ya se revisan sobre la fuente, que es donde existen. Aqui se busca
// otra cosa: que el archivo parsee y que no haya simbolos duplicados ni
// referencias colgando. Esa es exactamente la familia de fallos que produce un
// empaquetador roto, y la unica que importa sobre un artefacto generado.
//
// Por separado y no todos en un programa: los bundles comparten ambito global,
// asi que dos funciones que nunca corren en el mismo proceso se acusarian de
// redeclarar `API` o `normalizar` y el chequeo gritaria en falso.

import { readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RAIZ = 'base44/functions';
const TSC = resolve('node_modules/typescript/bin/tsc');

const OPCIONES = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  strict: false,
  types: [],
};

/**
 * Errores que delatan un bundle roto, con el fallo real que cada uno cazo.
 *
 * TS1xxx son de sintaxis: el archivo ni siquiera parsea. El resto son de
 * ligado, que es como se manifiesta aplanar varios modulos en un ambito unico.
 */
const ESTRUCTURALES = {
  TS2300: "identificador duplicado (whatsapp.ts y telegram.ts exportan 'normalizar')",
  TS2451: "redeclaracion de variable de ambito de bloque (los dos canales declaran 'const API')",
  TS2393: 'implementacion de funcion duplicada',
  TS2304: "nombre no encontrado (namespace huerfano: se borro 'import * as tg' y quedo 'tg.enviar')",
  TS2552: 'nombre no encontrado',
  TS2440: 'un import choca con una declaracion local',
  TS2323: 'reexportacion duplicada',
  TS2395: 'declaraciones fusionadas con visibilidad incoherente',
};

const esEstructural = (linea) => {
  const m = linea.match(/error (TS\d+):/);
  if (!m) return false;
  return m[1].startsWith('TS1') || m[1] in ESTRUCTURALES;
};

const bundles = readdirSync(RAIZ, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(RAIZ, d.name, 'bundle.ts')))
  .map((d) => d.name);

if (!bundles.length) {
  console.log('  (no hay bundles que revisar)');
  process.exit(0);
}

let fallos = 0;
for (const fn of bundles) {
  const cfg = resolve(`.tsconfig.bundle.${fn}.json`);
  writeFileSync(cfg, JSON.stringify({
    compilerOptions: OPCIONES,
    files: [`${RAIZ}/deno.d.ts`, `${RAIZ}/${fn}/bundle.ts`],
  }));

  let salida = '';
  try {
    // El binario directo y no `npx`: con shell:true en Windows los argumentos
    // se concatenan sin escapar, y ademas arrancar npx por cada bundle cuesta
    // mas que el chequeo en si.
    execFileSync(process.execPath, [TSC, '-p', cfg], { stdio: 'pipe' });
  } catch (e) {
    salida = `${e.stdout || ''}${e.stderr || ''}`;
  } finally {
    unlinkSync(cfg);
  }

  const rotos = salida.split('\n').filter(esEstructural);
  if (!rotos.length) {
    console.log(`  ${fn.padEnd(20)} ok`);
    continue;
  }

  console.error(`  ${fn.padEnd(20)} ROTO`);
  for (const l of rotos.slice(0, 10)) console.error(`      ${l.trim()}`);
  if (rotos.length > 10) console.error(`      ... y ${rotos.length - 10} mas`);

  // Explicar el porque, no solo el que: quien vea esto necesita saber que el
  // sintoma en produccion es "mis cambios no aparecen", no un error visible.
  const vistos = new Set(
    rotos.map((l) => (l.match(/error (TS\d+):/) || [])[1]).filter((c) => c in ESTRUCTURALES),
  );
  for (const c of vistos) console.error(`      -> ${c}: ${ESTRUCTURALES[c]}`);
  fallos++;
}

if (fallos) {
  console.error(`\n${fallos} bundle(s) no compilan.`);
  console.error('Base44 los rechaza y sigue sirviendo la version anterior SIN AVISAR:');
  console.error('el codigo se ve desplegado y la funcion viva es la de antes.');
  process.exit(1);
}
