/**
 * Utilidades de archivo para la subida de codigos de barras.
 *
 * Todo pasa en el navegador: los PDFs no salen del computador hasta que la
 * conciliacion cierra y alguien aprueba. Lo que viaja despues es cada archivo
 * junto a su huella, para poder demostrar que la URL que Mailchimp devuelve
 * sirve exactamente ese archivo.
 */

/** Huella SHA-256 en hexadecimal. Misma funcion que usa el backend al verificar. */
export async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bytes a base64.
 *
 * Se recorre por trozos porque `String.fromCharCode(...bytes)` con un array
 * grande revienta la pila: el spread mete un argumento por byte y un PDF de
 * 30 KB ya son 30.000 argumentos.
 */
export function aBase64(bytes) {
  const TROZO = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + TROZO));
  }
  return btoa(bin);
}

/** Lee un File y devuelve sus bytes, su huella y su base64 en una sola pasada. */
export async function leerArchivo(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // La huella se calcula sobre los MISMOS bytes que se codifican. Separarlo en
  // dos lecturas dejaria de probar que lo que se subio es lo que se hasheo.
  return { bytes, sha256: await sha256Hex(bytes), base64: aBase64(bytes), tamano: bytes.length };
}
