#!/usr/bin/env node
/**
 * Comprueba que lo que el codigo ESCRIBE en una entidad exista en su esquema.
 *
 * POR QUE EXISTE: estos fallos son silenciosos. Base44 acepta el PUT/POST y
 * descarta lo que no reconoce, asi que un campo mal nombrado no lanza ningun
 * error: simplemente el dato nunca se guarda. Se descubre semanas despues,
 * cuando alguien nota que una columna esta vacia.
 *
 * Ya habia tres asi, todos en caminos que el cliente usa:
 *   - HistorialLead: se escribia evento/detalle y se omitia `tipo`, que es
 *     obligatorio. La calificacion del lead no quedaba en su historial.
 *   - Visita: se escribia preferencia_horario/origen/fecha_solicitud (ninguno
 *     existia) y se omitia fecha_hora, obligatoria. El cliente pedia visita, el
 *     agente confirmaba, y no quedaba nada usable.
 *   - Propietario: se escribia `origen`, que no existia.
 *
 * QUE NO HACE: no es un typechecker. Es un analisis textual de los literales de
 * objeto que se pasan a db.crear / db.actualizar. Si el objeto se arma en una
 * variable aparte o se esparce (...datos), esta llamada no se puede revisar y
 * se reporta como omitida, no como correcta. Prefiero un hueco declarado a una
 * luz verde falsa.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const DIR_ENTIDADES = join(RAIZ, 'base44/entities');
const DIR_CODIGO = join(RAIZ, 'base44/functions/_core');

// Campos que Base44 gestiona y que el codigo puede reenviar sin declararlos.
const DEL_SISTEMA = new Set(['id', 'created_date', 'updated_date', 'created_by', 'updated_by']);

/** Lee los esquemas. Los .jsonc traen comentarios, hay que quitarlos. */
function cargarEsquemas() {
  const esquemas = new Map();
  for (const archivo of readdirSync(DIR_ENTIDADES)) {
    if (!archivo.endsWith('.jsonc')) continue;
    const crudo = readFileSync(join(DIR_ENTIDADES, archivo), 'utf8');
    // Solo comentarios de linea completa o al final: no hay // dentro de
    // strings en estos archivos, y asi no se rompe una URL https://...
    const limpio = crudo.replace(/^\s*\/\/.*$/gm, '').replace(/(?<!:)\/\/[^"\n]*$/gm, '');
    try {
      const d = JSON.parse(limpio);
      esquemas.set(d.name || archivo.replace('.jsonc', ''), {
        campos: new Set(Object.keys(d.properties || {})),
        obligatorios: d.required || [],
        // Los enums, para poder revisar tambien contra que se COMPARA y no solo
        // que se escribe (ver el bloque de enum-inexistente mas abajo).
        enums: new Map(
          Object.entries(d.properties || {})
            .filter(([, p]) => Array.isArray(p?.enum))
            .map(([campo, p]) => [campo, p.enum]),
        ),
        archivo,
      });
    } catch (e) {
      console.error(`  no se pudo leer ${archivo}: ${e.message}`);
    }
  }
  return esquemas;
}

function archivosTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivosTs(p));
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Recorta el literal de objeto que empieza en `desde`, respetando anidamiento. */
function recortarObjeto(txt, desde) {
  let prof = 0;
  for (let i = desde; i < txt.length; i++) {
    const c = txt[i];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) return txt.slice(desde, i + 1); }
  }
  return null;
}

/**
 * Claves de primer nivel del literal.
 *
 * Se recorre como pares clave-valor, no buscando identificadores sueltos. Las
 * dos versiones anteriores fallaron justamente ahi: la primera leia palabras
 * dentro de COMENTARIOS ("Programada"), y la segunda leia identificadores del
 * VALOR (`false`, `null`, `tel`) como si fueran campos. Un validador con falsos
 * positivos se ignora a la semana, y entonces no sirve de nada.
 *
 * Por eso, tras leer una clave se SALTA su valor entero hasta la coma de primer
 * nivel. Reconoce `campo: valor`, la abreviada `campo,` y las claves entre
 * comillas.
 */
function clavesDe(obj) {
  const claves = [];
  let i = 1; // dentro del `{` de apertura

  /** Avanza sobre espacios y comentarios. */
  const saltarRelleno = () => {
    for (;;) {
      while (i < obj.length && /\s/.test(obj[i])) i++;
      if (obj[i] === '/' && obj[i + 1] === '/') { while (i < obj.length && obj[i] !== '\n') i++; continue; }
      if (obj[i] === '/' && obj[i + 1] === '*') { const f = obj.indexOf('*/', i); i = f === -1 ? obj.length : f + 2; continue; }
      return;
    }
  };

  /** Salta un valor completo: se detiene en la coma de primer nivel o en el cierre. */
  const saltarValor = () => {
    let prof = 0;
    while (i < obj.length) {
      const c = obj[i];
      if (c === '/' && obj[i + 1] === '/') { while (i < obj.length && obj[i] !== '\n') i++; continue; }
      if (c === '/' && obj[i + 1] === '*') { const f = obj.indexOf('*/', i); i = f === -1 ? obj.length : f + 2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        const cierre = c;
        i++;
        while (i < obj.length && obj[i] !== cierre) { if (obj[i] === '\\') i += 2; else i++; }
        i++;
        continue;
      }
      if (c === '{' || c === '[' || c === '(') { prof++; i++; continue; }
      if (c === '}' || c === ']' || c === ')') { if (prof === 0) return; prof--; i++; continue; }
      if (c === ',' && prof === 0) return;
      i++;
    }
  };

  while (i < obj.length) {
    saltarRelleno();
    if (i >= obj.length || obj[i] === '}') break;
    if (obj[i] === ',') { i++; continue; }

    let clave = null;
    if (obj[i] === '"' || obj[i] === "'") {
      const cierre = obj[i];
      const fin = obj.indexOf(cierre, i + 1);
      if (fin === -1) break;
      clave = obj.slice(i + 1, fin);
      i = fin + 1;
    } else {
      const m = /^([a-zA-Z_$][\w$]*)/.exec(obj.slice(i));
      if (!m) { saltarValor(); continue; }
      clave = m[1];
      i += clave.length;
    }

    saltarRelleno();
    if (obj[i] === ':') { i++; saltarValor(); }
    // Sin `:` es la forma abreviada `{ tipo, radicado }`: la clave ya quedo.
    claves.push(clave);
  }
  return claves;
}

const esquemas = cargarEsquemas();
const hallazgos = [];
const omitidas = [];
let revisadas = 0;

for (const ruta of archivosTs(DIR_CODIGO)) {
  const txt = readFileSync(ruta, 'utf8');
  const rel = relative(RAIZ, ruta).replace(/\\/g, '/');

  const re = /\.(crear|actualizar)\s*\(\s*'([A-Za-z]+)'/g;
  let m;
  while ((m = re.exec(txt))) {
    const [, op, entidad] = m;
    const esquema = esquemas.get(entidad);
    const linea = txt.slice(0, m.index).split('\n').length;

    if (!esquema) {
      hallazgos.push({ rel, linea, entidad, tipo: 'entidad-desconocida', detalle: 'no existe un .jsonc para esta entidad' });
      continue;
    }

    const llave = txt.indexOf('{', m.index + m[0].length);
    // En actualizar(entidad, id, {...}) hay que saltar el id primero.
    const coma = txt.indexOf(',', m.index + m[0].length);
    if (llave === -1 || (coma !== -1 && coma > llave && op === 'actualizar')) { omitidas.push(`${rel}:${linea} ${entidad}`); continue; }

    const obj = recortarObjeto(txt, llave);
    if (!obj) { omitidas.push(`${rel}:${linea} ${entidad}`); continue; }

    // Un spread hace imposible saber que campos van: no se puede afirmar nada.
    if (obj.includes('...')) { omitidas.push(`${rel}:${linea} ${entidad} (usa spread)`); continue; }

    revisadas++;
    const claves = clavesDe(obj);

    for (const k of claves) {
      if (!esquema.campos.has(k) && !DEL_SISTEMA.has(k)) {
        hallazgos.push({ rel, linea, entidad, tipo: 'campo-inexistente', detalle: `"${k}" no esta en ${esquema.archivo}` });
      }
    }
    // Solo al crear: al actualizar es normal mandar unos pocos campos.
    if (op === 'crear') {
      for (const req of esquema.obligatorios) {
        if (!claves.includes(req)) {
          hallazgos.push({ rel, linea, entidad, tipo: 'falta-obligatorio', detalle: `"${req}" es obligatorio y no se envia` });
        }
      }
    }
  }
}

// ── Comparaciones contra valores que no existen en el enum ──────────────────
//
// El bloque de arriba revisa lo que se ESCRIBE. Este revisa lo que se COMPARA,
// que falla igual de callado y es peor:
//
//   TitularInmueble.estado tiene enum [Activo, Terminado]
//   identidad.ts filtraba con  String(f.estado || 'Vigente') === 'Vigente'
//
// 'Vigente' no existe en la entidad, asi que el filtro descartaba TODAS las
// filas, siempre. La busqueda de un cliente por su documento era incapaz de
// encontrar a nadie, hubiera datos o no, y en el chat se veia como que el
// cliente habia escrito mal su propia cedula.
//
// Se unen los enums de todas las entidades que tengan un campo con ese nombre:
// baja la sensibilidad, pero evita acusar en falso a un `estado` de otra tabla.
{
  const enumsPorCampo = new Map();
  for (const esq of esquemas.values()) {
    for (const [campo, valores] of esq.enums || []) {
      if (!enumsPorCampo.has(campo)) enumsPorCampo.set(campo, new Set());
      for (const v of valores) enumsPorCampo.get(campo).add(v);
    }
  }

  // Lo que NO es una fila de la base. `input` es el parametro de una tool, cuyo
  // enum es aparte y a proposito distinto: la tool recibe 'arriendo' en
  // minuscula y lo traduce a 'Arriendo' al escribir. Compararlo con el enum de
  // la entidad acusaria en falso justo a las lineas que hacen la traduccion
  // bien.
  const NO_ES_FILA = new Set(['input', 'args', 'body', 'params', 'opts', 'entrada', 'extra', 'datos']);

  const RE_CMP = /(\w+)\.(\w+)\s*(?:\|\|\s*'[^']*')?\s*\)?\s*(===|!==)\s*'([^']+)'/g;
  for (const archivo of archivosTs(DIR_CODIGO)) {
    const txt = readFileSync(archivo, 'utf8');
    const rel = relative(RAIZ, archivo).replace(/\\/g, '/');
    for (const m of txt.matchAll(RE_CMP)) {
      const [, receptor, campo, , literal] = m;
      if (NO_ES_FILA.has(receptor)) continue;
      const permitidos = enumsPorCampo.get(campo);
      if (!permitidos || permitidos.has(literal)) continue;
      const linea = txt.slice(0, m.index).split('\n').length;
      hallazgos.push({
        rel, linea, entidad: `campo ${campo}`, tipo: 'enum-inexistente',
        detalle: `se compara contra "${literal}", que no esta en el enum (${[...permitidos].join(', ')})`,
      });
    }
  }
}

console.log(`Entidades: ${esquemas.size} · escrituras revisadas: ${revisadas} · omitidas: ${omitidas.length}`);
if (omitidas.length && process.argv.includes('--verbose')) {
  console.log('\nOmitidas (objeto no analizable estaticamente):');
  omitidas.forEach((o) => console.log(`  ${o}`));
}

if (!hallazgos.length) {
  console.log('Sin desajustes entre el codigo y los esquemas.');
  process.exit(0);
}

console.log(`\n${hallazgos.length} desajuste(s):\n`);
for (const h of hallazgos) {
  console.log(`  ${h.rel}:${h.linea}  [${h.entidad}] ${h.detalle}`);
}
console.log('\nUn campo que no esta en el esquema NO se guarda, y Base44 no avisa.');
process.exit(1);
