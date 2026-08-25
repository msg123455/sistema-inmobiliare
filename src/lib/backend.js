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
 * Nombre con el que cada función está desplegada en Base44.
 *
 * SIEMPRE EL NOMBRE BASE, el mismo del directorio en `base44/functions/`.
 * Nunca una versión numerada.
 *
 * Aquí hubo una creencia equivocada que costó una tarde. Se pensaba que Base44
 * servía para siempre el artefacto del primer despliegue de un nombre, así que
 * cada cambio se publicaba como `codigosMensuales2`, `3`… Eso es cierto SOLO
 * para `base44 functions deploy` desde el CLI. La sincronización desde GitHub sí
 * reemplaza el artefacto: comprobado el 25 de agosto, con `codigosMensuales`
 * sirviendo la revisión 7, la última.
 *
 * Y las versiones numeradas son ADEMÁS peligrosas: la sincronización poda las
 * funciones que no tienen directorio en el repo, y `publicar-funcion.mjs` borra
 * ese directorio al terminar. Resultado: `codigosMensuales2`, `5` y `6`
 * desaparecieron solas, la pantalla siguió llamando al `6` y salió un
 * «Error 404» que parecía un fallo de Mailchimp. Lo mismo se llevó por delante
 * a `sincronizarSimi3`.
 *
 * Regla, entonces: se cambia el código en el directorio, se empuja a GitHub, y
 * esto no se toca.
 */
export const FUNCIONES = {
  codigos: 'codigosMensuales',
  campana: 'campanaCodigos',
  simi: 'sincronizarSimi',
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
