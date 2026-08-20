import { appParams } from '@/lib/app-params';

/**
 * URL base del backend de Base44. Resuelve en orden:
 *   1. app_base_url  — query-string o localStorage, vía appParams
 *   2. VITE_BASE44_APP_BASE_URL — build-time (necesario en `npm run dev`)
 *   3. window.location.origin — correcto cuando la app se sirve desde su propio dominio Base44
 *
 * Nunca hardcodear la URL del tenant: acopla el frontend a un backend concreto,
 * y basta olvidar un archivo para escribir silenciosamente en el tenant equivocado.
 */
export const BACKEND_URL = (
  appParams.appBaseUrl ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/+$/, '');

/**
 * Token de servicio que exigen las funciones backend.
 *
 * OJO: esto viaja al navegador, así que no es un secreto real — cualquiera que
 * abra devtools lo ve. Se conserva porque las funciones hoy lo validan, pero la
 * autenticación correcta es la sesión del usuario, no un token compartido.
 * Cambiarlo exige tocar frontend y funciones a la vez.
 */
const FUNCTIONS_TOKEN = import.meta.env.VITE_FUNCTIONS_TOKEN || 'SYNCWASI2026';

/**
 * Nombre con el que cada función está DESPLEGADA en Base44.
 *
 * No siempre coincide con la carpeta del repo. Base44 sirve el artefacto del
 * primer despliegue de un nombre —los siguientes suben, dicen «deployed» y no
 * reemplazan nada—, así que cada cambio obliga a publicar bajo un nombre nuevo.
 * Comprobado desplegando codigosMensuales con un campo `revision` en su
 * respuesta y viendo que la función viva seguía sin traerlo.
 *
 * Vive aquí, en un solo sitio, para que subir de versión sea cambiar una línea
 * en vez de buscar el nombre por todas las pantallas. Lo publica
 * scripts/publicar-funcion.mjs, que al terminar recuerda actualizar esto.
 */
export const FUNCIONES = {
  codigos: 'codigosMensuales6',
  campana: 'campanaCodigos',
};

/**
 * Invoca una función de Base44 por HTTP directo.
 *
 * Se usa en vez del SDK cuando la llamada no debe depender de la versión de
 * funciones desplegada. Normaliza el manejo de error: las funciones devuelven
 * 200 con `{error}` en el cuerpo tan a menudo como devuelven un status != 2xx.
 */
export async function callFunction(nombre, payload = {}) {
  const r = await fetch(`${BACKEND_URL}/api/functions/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: FUNCTIONS_TOKEN, ...payload }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || res?.error) throw new Error(res?.error || `Error ${r.status}`);
  return res;
}
