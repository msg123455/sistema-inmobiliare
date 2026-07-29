/**
 * Parser CSV/TSV minimo.
 *
 * Se escribe a mano en vez de sumar una dependencia porque el caso es acotado:
 * leer un export de SIMI. Lo que si maneja, porque aparece en datos reales:
 *   - campos entre comillas con comas adentro:  "Calle 81 # 8-95, Bogota"
 *   - comillas escapadas duplicandolas:         "El ""Nogal"""
 *   - saltos de linea dentro de un campo entrecomillado
 *   - CRLF de Windows y BOM de Excel
 *
 * No maneja: separadores distintos a , ; o tab (se detectan solos).
 */

/** Detecta el separador contando ocurrencias fuera de comillas en la 1a linea. */
function detectarSeparador(texto) {
  const primeraLinea = texto.slice(0, texto.indexOf('\n') >= 0 ? texto.indexOf('\n') : texto.length);
  const candidatos = [',', ';', '\t'];
  let mejor = ',';
  let max = -1;
  for (const sep of candidatos) {
    let cuenta = 0;
    let enComillas = false;
    for (const ch of primeraLinea) {
      if (ch === '"') enComillas = !enComillas;
      else if (ch === sep && !enComillas) cuenta++;
    }
    if (cuenta > max) { max = cuenta; mejor = sep; }
  }
  return mejor;
}

/** Devuelve una matriz de celdas (array de filas). */
export function parsearCSV(texto, separador) {
  // Excel antepone un BOM que, si no se quita, se pega al nombre de la 1a columna.
  let t = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sep = separador || detectarSeparador(t);

  const filas = [];
  let fila = [];
  let celda = '';
  let enComillas = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];

    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { celda += '"'; i++; } // comilla escapada
        else enComillas = false;
      } else {
        celda += ch;
      }
      continue;
    }

    if (ch === '"') { enComillas = true; continue; }
    if (ch === sep) { fila.push(celda); celda = ''; continue; }
    if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; continue; }
    celda += ch;
  }
  // ultima celda/fila si el archivo no termina en salto
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }

  return filas.filter((f) => f.some((c) => String(c).trim() !== ''));
}

/**
 * Convierte la matriz en objetos usando la primera fila como encabezado.
 * Los encabezados vacios se descartan; los repetidos se sufijan (_2, _3...).
 */
export function filasAObjetos(matriz) {
  if (!matriz.length) return { columnas: [], filas: [] };

  const vistos = {};
  const columnas = matriz[0].map((h, i) => {
    let nombre = String(h ?? '').trim();
    if (!nombre) return null;
    if (vistos[nombre]) { vistos[nombre]++; nombre = `${nombre}_${vistos[nombre]}`; }
    else vistos[nombre] = 1;
    return { nombre, indice: i };
  }).filter(Boolean);

  const filas = matriz.slice(1).map((f) => {
    const o = {};
    for (const c of columnas) o[c.nombre] = String(f[c.indice] ?? '').trim();
    return o;
  });

  return { columnas: columnas.map((c) => c.nombre), filas };
}
