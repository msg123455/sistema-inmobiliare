#!/usr/bin/env node
/**
 * Regenera ZonaInmueble a partir de los barrios que hay en Propiedad.
 *
 * POR QUE HACE FALTA. El filtro de Base44 es por igualdad: si el cliente dice
 * "rosales" y la base guarda "Los Rosales", la consulta devuelve cero y el
 * agente concluye que no hay inventario. Eso le paso a un cliente real: pidio
 * arriendo en Rosales, hay 11, y se le dijo dos veces que solo habia 2.
 *
 * Esta tabla es el diccionario que traduce lo que dice el cliente al nombre
 * exacto que tiene la base, y ademas es lo que le permite al agente DESAMBIGUAR:
 * "el chico" cae en diecinueve barrios distintos, y verlos todos es la
 * diferencia entre preguntar cual y adivinar mal.
 *
 * NO GUARDA CONTEOS, a proposito. La tentacion es dejar aqui cuantos hay en cada
 * zona para responder "cuantos tienes en Rosales" sin consultar, pero un conteo
 * guardado se desactualiza en cuanto entra o sale un inmueble, y un numero viejo
 * dicho con seguridad es exactamente el fallo que esto viene a arreglar.
 *
 *   node scripts/indexar-zonas.mjs           reconstruye el indice
 *   node scripts/indexar-zonas.mjs --dry     lo calcula y lo muestra, sin escribir
 *
 * Hay que correrlo cuando cambie el inventario. Si una zona nueva todavia no
 * esta, buscarla por su nombre exacto sigue funcionando: lo unico que se pierde
 * es que el agente la sugiera.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_ID = process.env.BASE44_APP_ID || '6a6955aeb5063b631b78f9d3';
const seco = process.argv.includes('--dry');

const GUION = `
const norm = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  .replace(/^(los|las|el|la)\\s+/, '')
  .replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();

const props = [];
for (let p = 0; p < 20; p++) {
  const lote = await base44.entities.Propiedad.list('-created_date', 500, p * 500);
  if (!lote.length) break;
  props.push(...lote);
  if (lote.length < 500) break;
}

// Una fila por barrio. La ciudad se toma de la primera propiedad que lo use:
// hay barrios homonimos entre ciudades y conviene poder distinguirlos.
const porBarrio = new Map();
for (const p of props) {
  const nombre = String(p.barrio || '').trim();
  if (!nombre) continue;
  if (!porBarrio.has(nombre)) porBarrio.set(nombre, String(p.ciudad || ''));
}

const quiero = [...porBarrio.entries()]
  .map(([nombre, ciudad]) => ({ nombre, normalizado: norm(nombre), ciudad, activo: true }))
  .filter((z) => z.normalizado)
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

console.log('INMUEBLES ' + props.length + '  ->  ZONAS ' + quiero.length);
${seco ? "console.log(quiero.map((z) => '  ' + z.nombre + '  ->  ' + z.normalizado).join('\\n')); " : ''}
${seco ? '' : `
const actuales = await base44.entities.ZonaInmueble.list('-created_date', 800);
const vistas = new Set();
let creadas = 0, revividas = 0, apagadas = 0;

for (const z of quiero) {
  const ya = actuales.find((a) => String(a.nombre) === z.nombre);
  vistas.add(z.nombre);
  if (!ya) { await base44.entities.ZonaInmueble.create(z); creadas++; continue; }
  // Se revive en vez de duplicar: una zona que vuelve a tener inventario es la
  // misma zona, y duplicarla partiria el diccionario en dos entradas.
  if (ya.activo === false || ya.normalizado !== z.normalizado) {
    await base44.entities.ZonaInmueble.update(ya.id, { activo: true, normalizado: z.normalizado, ciudad: z.ciudad });
    revividas++;
  }
}

// Las que ya no tienen inventario se APAGAN, no se borran: si alguien busco ahi
// alguna vez, el nombre sigue sirviendo para reconocerlo y decirle que ahora
// mismo no hay, en vez de no entender la zona.
for (const a of actuales) {
  if (vistas.has(String(a.nombre)) || a.activo === false) continue;
  await base44.entities.ZonaInmueble.update(a.id, { activo: false });
  apagadas++;
}

console.log('creadas ' + creadas + ' | revividas ' + revividas + ' | apagadas ' + apagadas);
const fin = await base44.entities.ZonaInmueble.filter({ activo: true }, '-created_date', 800);
console.log('ZONAS ACTIVAS EN EL INDICE: ' + fin.length);
`}
`;

const tmp = resolve('.zonas-tmp.ts');
writeFileSync(tmp, GUION);
try {
  execFileSync('npx', ['--yes', 'base44@0.1.9', '--app-id', APP_ID, 'exec', '--privileged'], {
    input: GUION,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
} finally {
  try { unlinkSync(tmp); } catch { /* ya no estaba */ }
}
