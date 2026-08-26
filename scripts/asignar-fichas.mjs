#!/usr/bin/env node
/**
 * Le asigna a cada inmueble la URL de su ficha en la web de INMOBILIARE,
 * construida a partir del codigo de SIMI y COMPROBADA antes de guardarla.
 *
 * POR QUE HACE FALTA. Los 2737 inmuebles llegan de SIMI con codigo_externo y
 * ninguno con link_web. Sin esto, cada ficha que manda Diana lleva al cliente a
 * Metrocuadrado o a MercadoLibre, o sea a navegar el inventario de la
 * competencia que esta justo al lado del nuestro en esas paginas. El lead se
 * paga y se regala.
 *
 * EL PATRON, verificado contra el sitio real:
 *   /inmueble/{tipo}-en-{operacion}-{barrio}-{ciudad}_{codigo}/
 *
 * POR QUE SE COMPRUEBA Y NO SE CONFIA EN EL PATRON. Con el codigo bueno y un
 * slug inventado el sitio responde 404: el slug no es decorativo. Si alguien
 * cambia el patron de la web, o un barrio se escribe distinto alli, la URL sale
 * mal y el cliente recibe un enlace muerto. Eso es peor que mandarlo al portal
 * de la competencia, porque parece que la casa no tiene el inmueble.
 *
 * Comprobandolo aqui, ese fallo aparece en este barrido y no en un chat.
 *
 *   node scripts/asignar-fichas.mjs           comprueba y guarda
 *   node scripts/asignar-fichas.mjs --dry     comprueba y solo informa
 *   node scripts/asignar-fichas.mjs --todos   revisa tambien los que ya tienen
 *
 * Hay que correrlo despues de cada sincronizacion con SIMI. Lo que entre entre
 * dos barridos sigue funcionando: linkFicha construye la URL al vuelo, solo que
 * sin comprobar.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_ID = process.env.BASE44_APP_ID || '6a6955aeb5063b631b78f9d3';
const seco = process.argv.includes('--dry');
const todos = process.argv.includes('--todos');

// Cuantas comprobaciones a la vez. Es la web de la casa, no un tercero, pero
// tampoco hay que zurrarla: 12 en paralelo tarda unos minutos con 2600 y no
// levanta ninguna alarma.
const EN_PARALELO = 12;

// `base44 exec` necesita Deno, y el que hay es el del propio repo. Se mete en
// el PATH aqui para que el script funcione se llame como se llame, en vez de
// fallar con "Deno is required" segun quien lo ejecute.
const conDeno = {
  ...process.env,
  PATH: `${join(process.cwd(), 'node_modules', 'deno')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
};

const b44 = (guion) => execFileSync(
  'npx', ['--yes', 'base44@0.1.9', '--app-id', APP_ID, 'exec', '--privileged'],
  {
    input: guion,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
    env: conDeno,
  },
);

/** El mismo saneado que usa linkPropio en _core. Si cambia uno, cambia el otro. */
const slug = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  // Escapado a proposito: el rango de diacriticos escrito literal son
  // caracteres invisibles que cualquier copia mal codificada rompe.
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\s/g, '-');

function urlDe(p) {
  if (!p.codigo || !p.tipo || p.tipo === 'Otro' || !p.barrio || !p.ciudad) return '';
  const op = p.operacion === 'Venta' ? 'venta' : 'arriendo';
  const s = slug(`${p.tipo} en ${op} ${p.barrio} ${p.ciudad}`);
  return s ? `https://www.inmobiliarelatam.com/inmueble/${s}_${p.codigo}/` : '';
}

async function abre(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    // HEAD es suficiente para saber si la pagina existe y no descarga el HTML.
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    return r.status === 200;
  } catch {
    return false;
  }
}

// ── 1. Traer el inventario ──────────────────────────────────────────────────

console.log('leyendo el inventario...');
const salida = b44(`
const out = [];
for (let pg = 0; pg < 12; pg++) {
  const lote = await base44.entities.Propiedad.list('-created_date', 500, pg * 500);
  if (!lote.length) break;
  for (const p of lote) {
    out.push({
      id: p.id, codigo: p.codigo_externo || '', tipo: p.tipo || '',
      operacion: p.operacion || '', barrio: p.barrio || '', ciudad: p.ciudad || '',
      yaTiene: Boolean(p.link_web),
    });
  }
  if (lote.length < 500) break;
}
console.log(JSON.stringify(out));
`);

const props = JSON.parse(salida.split('\n').find((l) => l.trim().startsWith('[')));
console.log(`  ${props.length} inmuebles`);

const candidatos = props
  .filter((p) => todos || !p.yaTiene)
  .map((p) => ({ ...p, url: urlDe(p) }))
  .filter((p) => p.url);

const sinUrl = props.filter((p) => !urlDe(p)).length;
console.log(`  ${candidatos.length} por comprobar · ${sinUrl} sin URL posible (tipo 'Otro' o faltan datos)\n`);

if (!candidatos.length) {
  console.log('nada que hacer.');
  process.exit(0);
}

// ── 2. Comprobar cada una ───────────────────────────────────────────────────

const buenas = [];
const malas = [];
let hechas = 0;

async function trabajador(cola) {
  for (;;) {
    const p = cola.pop();
    if (!p) return;
    (await abre(p.url) ? buenas : malas).push(p);
    hechas++;
    if (hechas % 100 === 0) process.stdout.write(`  comprobadas ${hechas}/${candidatos.length}\r`);
  }
}

const cola = [...candidatos];
await Promise.all(Array.from({ length: EN_PARALELO }, () => trabajador(cola)));

console.log(`  comprobadas ${hechas}/${candidatos.length}    `);
console.log(`\n  ABREN: ${buenas.length}`);
console.log(`  NO ABREN: ${malas.length}`);

if (malas.length) {
  // Las que no abren se dicen, no se esconden: si son muchas es que el patron
  // de la web cambio, y eso hay que verlo aqui y no en un chat con un cliente.
  console.log('\n  las que no abren (primeras 15):');
  for (const p of malas.slice(0, 15)) {
    console.log(`    ${p.codigo.padEnd(11)} ${p.tipo.padEnd(12)} ${p.barrio}`);
  }
  const porc = Math.round((100 * malas.length) / candidatos.length);
  if (porc > 10) {
    console.log(`\n  OJO: falla el ${porc}%. Eso no son casos sueltos: mira si la web`);
    console.log('  cambio el formato de sus URLs antes de guardar nada.');
  }
}

if (seco) {
  console.log('\n(--dry: no se guardo nada)');
  process.exit(0);
}

// ── 3. Guardar solo las comprobadas ─────────────────────────────────────────

console.log('\nguardando...');
const LOTE = 400;
let guardadas = 0;

for (let i = 0; i < buenas.length; i += LOTE) {
  const trozo = buenas.slice(i, i + LOTE).map((p) => ({ id: p.id, url: p.url }));
  const tmp = join(tmpdir(), `fichas-${i}.json`);
  writeFileSync(tmp, JSON.stringify(trozo));
  const r = b44(`
const filas = ${JSON.stringify(trozo)};
let n = 0;
for (const f of filas) {
  await base44.entities.Propiedad.update(f.id, { link_web: f.url });
  n++;
}
console.log('LOTE ' + n);
  `);
  try { unlinkSync(tmp); } catch { /* da igual */ }
  guardadas += Number((r.match(/LOTE (\d+)/) || [])[1] || 0);
  process.stdout.write(`  guardadas ${guardadas}/${buenas.length}\r`);
}

console.log(`  guardadas ${guardadas}/${buenas.length}    `);
console.log('\nlisto. Las que no abren se quedan sin link_web y caen al portal, como antes.');
