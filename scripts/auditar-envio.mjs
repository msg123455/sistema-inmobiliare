#!/usr/bin/env node
/**
 * Audita un envio de codigos de barras y construye el directorio del mes siguiente.
 *
 *   node scripts/auditar-envio.mjs <archivo.csv> [--directorio salida.json]
 *
 * El CSV es el mismo que se sube a Mailchimp como audiencia, con las columnas
 * Id, Mes, Contrato, Nombre, Correo, Archivo.
 *
 * Hace dos cosas:
 *
 *   1. AUDITA. Aplica al listado los mismos controles que el motor de
 *      conciliacion aplicaria antes de enviar. Corrido sobre agosto de 2025
 *      encuentra seis defectos que si salieron por correo.
 *
 *   2. CONSTRUYE EL DIRECTORIO. La columna Contrato viene vacia, asi que el
 *      unico sitio donde vive la relacion contrato -> inquilino es a quien se le
 *      mando el mes pasado. De un envio salen ~592 pares, y con eso el mes
 *      siguiente empareja solo.
 *
 * OJO CON LOS DATOS: tanto el CSV de entrada como el directorio de salida traen
 * nombre, correo y documento de personas reales. No van al repositorio —
 * .gitignore ya cubre *.csv y directorio-*.json. Guardalos fuera o en la carpeta
 * privada de la oficina.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parsearCSV, filasAObjetos } from '../src/lib/csv.js';
import {
  conciliar, construirDirectorio, correoValido, leerNombreArchivo, normCodigo,
} from '../src/lib/conciliar.js';

const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith('--'));
const iDir = args.indexOf('--directorio');
const salidaDirectorio = iDir >= 0 ? args[iDir + 1] : null;

if (!ruta) {
  console.error('Uso: node scripts/auditar-envio.mjs <archivo.csv> [--directorio salida.json]');
  process.exit(1);
}

const texto = readFileSync(ruta, 'utf8');
const { filas } = filasAObjetos(parsearCSV(texto));
const conDatos = filas.filter((f) => f.Nombre || f.Correo || f.Archivo);

const t = (s) => console.log(s);
const regla = (c = '=') => t(c.repeat(76));

regla();
t(`AUDITORIA DE ENVIO  ·  ${ruta.split(/[\\/]/).pop()}`);
regla();
t(`Filas en el archivo : ${filas.length}`);
t(`Filas con datos     : ${conDatos.length}   (${filas.length - conDatos.length} vacias que deja Excel)`);

// ── 1. El directorio que se puede aprender de este envio ─────────────────────
const { entradas, descartadas, conflictos } = construirDirectorio(conDatos);
regla('-');
t('DIRECTORIO APRENDIDO');
t(`  Contratos identificados : ${entradas.length}`);
t(`  Filas descartadas       : ${descartadas.length}   (nombre de archivo no reconocido)`);
t(`  Conflictos              : ${conflictos.length}   (un contrato con dos inquilinos distintos)`);
for (const c of conflictos.slice(0, 10)) {
  t(`      contrato ${c.clave}: "${c.previo.nombre}" vs "${c.nuevo.nombre}"`);
}
for (const d of descartadas.slice(0, 10)) {
  t(`      descartada: ${d.nombre || '(sin nombre)'} -> ${d.url || '(sin archivo)'}`);
}

// ── 2. Los controles del motor sobre lo que se envio ─────────────────────────
// Se reconstruye la entrada del motor: los archivos que existian en Mailchimp
// (URLs distintas) contra el directorio aprendido.
const porUrl = new Map();
for (const f of conDatos) {
  const url = String(f.Archivo || '').trim();
  if (!url) continue;
  if (!porUrl.has(url)) porUrl.set(url, { nombre: url.split('/').pop(), url });
}
const archivos = [...porUrl.values()];

const primerMes = conDatos.map((f) => leerNombreArchivo(f.Archivo)).find(Boolean)?.mes ?? null;
const r = conciliar({ archivos, directorio: entradas, opciones: { mesEsperado: primerMes } });

regla('-');
t('CONTROLES DEL MOTOR');
t(`  Archivos distintos  : ${r.resumen.leidos}`);
t(`  Emparejados         : ${r.resumen.emparejados}`);
t(`  Enviables           : ${r.resumen.enviables}`);
t(`  Bloqueos            : ${r.bloqueos.length}`);
for (const [k, v] of Object.entries(r.excepciones)) if (v.length) t(`  · ${k}: ${v.length}`);

// ── 3. Defectos del envio tal como salio ─────────────────────────────────────
// Estos son propiedades de la LISTA enviada, no del emparejamiento, asi que se
// miden directamente sobre las filas.
regla('-');
t('DEFECTOS DEL ENVIO REAL');

const agrupar = (items, clave) => {
  const m = new Map();
  for (const it of items) {
    const k = clave(it);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
};

// 3a. Un correo que recibio mas de un codigo distinto: la campana solo lleva uno.
const porCorreo = agrupar(conDatos, (f) => String(f.Correo || '').trim().toLowerCase());
const correoMulti = [...porCorreo.entries()]
  .filter(([, v]) => new Set(v.map((x) => x.Archivo)).size > 1);
t(`\n  [A] Inquilinos con mas de un contrato: ${correoMulti.length}`);
t('      Un contacto de Mailchimp guarda UN valor por merge field: recibieron uno');
t('      de sus codigos y el otro se perdio sin ningun error visible.');
for (const [correo, v] of correoMulti) {
  t(`      · ${correo}`);
  for (const x of v) t(`          ${String(x.Archivo).split('/').pop()}  ${x.Nombre}`);
}

// 3b. Una URL enviada a varias personas: el codigo de un cliente le llego a otro.
const urlMulti = [...agrupar(conDatos, (f) => String(f.Archivo || '').trim()).entries()]
  .filter(([, v]) => new Set(v.map((x) => String(x.Correo).toLowerCase())).size > 1);
t(`\n  [B] Codigos que llegaron a mas de un destinatario: ${urlMulti.length}`);
t('      Es el fallo que la revision manual existe para evitar.');
for (const [url, v] of urlMulti) {
  t(`      · ${url.split('/').pop()} -> ${v.length} destinatarios:`);
  for (const x of v) t(`          ${String(x.Correo || '(sin correo)').padEnd(42)} ${x.Nombre}`);
}

// 3c. Correos que no pueden entregar.
const malos = conDatos.filter((f) => f.Correo && !correoValido(f.Correo));
const sinCorreo = conDatos.filter((f) => !String(f.Correo || '').trim());
t(`\n  [C] Correos invalidos: ${malos.length}    sin correo: ${sinCorreo.length}`);
for (const m of malos) t(`      · "${m.Correo}"   ${m.Nombre}`);

// 3d. Codigos repetidos.
const codigos = conDatos.map((f) => leerNombreArchivo(f.Archivo)).filter(Boolean).map((d) => normCodigo(d.codigo));
const codigoMulti = [...agrupar(codigos.map((c) => ({ c })), (x) => x.c).entries()].filter(([, v]) => v.length > 1);
t(`\n  [D] Contratos que aparecen mas de una vez: ${codigoMulti.length}`);
for (const [c, v] of codigoMulti) t(`      · contrato ${c} en ${v.length} filas`);

// ── 4. Senales ───────────────────────────────────────────────────────────────
regla('-');
t('SENALES');
t(`  Rupturas del orden ascendente : ${r.senales.rupturasDeOrden}`);
t(`  Largo modal del contrato      : ${r.senales.largoModal} digitos`);
t(`  Fuera de forma                : ${r.senales.fueraDeFormaModal.length}`);
t(`  Oficinas en el lote           : ${r.senales.oficinas.join(', ') || '(ninguna)'}`);

// ── 5. Veredicto ─────────────────────────────────────────────────────────────
const total = correoMulti.length + urlMulti.length + malos.length + sinCorreo.length;
regla();
if (total === 0) {
  t('VEREDICTO: sin defectos detectables en este envio.');
} else {
  t(`VEREDICTO: ${total} defectos que el motor habria detenido ANTES de enviar.`);
  t(`  ${correoMulti.length} inquilinos habrian recibido un codigo de menos`);
  t(`  ${urlMulti.length} codigos se compartieron con quien no era`);
  t(`  ${malos.length + sinCorreo.length} correos no podian entregar`);
}
regla();

if (salidaDirectorio) {
  writeFileSync(salidaDirectorio, JSON.stringify(entradas, null, 2), 'utf8');
  t(`\nDirectorio escrito en ${salidaDirectorio} (${entradas.length} contratos).`);
  t('Contiene datos personales: no lo subas al repositorio.');
}
