import { BACKEND_URL } from '@/lib/backend';

/**
 * Cliente del portal del cliente (arrendatarios y propietarios).
 *
 * REGLA: los usuarios externos NUNCA tocan base44.entities.*. El SDK del
 * navegador y el sistema de roles son del staff. El portal habla solo con
 * portalAuth y portalDatos, que resuelven el sujeto server-side desde el JWT.
 *
 * Por eso este archivo no importa base44Client mas alla de la URL base.
 */

const CLAVE_SESION = 'portal_sesion';

export function guardarSesion(sesion) {
  // sessionStorage y no localStorage: la sesion muere al cerrar la pestana.
  // El portal se abre desde un link de WhatsApp, muchas veces en un telefono
  // prestado o compartido.
  sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export function leerSesion() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
    if (!s?.jwt || !s?.expira_ms || s.expira_ms < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_SESION);
}

/** Canjea el token del magic link por una sesion. Un solo uso. */
export async function entrar(token) {
  const r = await fetch(`${BACKEND_URL}/api/functions/portalAuth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res?.jwt) throw new Error(res?.error || 'Enlace inválido o vencido');

  const sesion = {
    jwt: res.jwt,
    sujeto_tipo: res.sujeto_tipo,
    seccion: res.seccion,
    expira_ms: Date.now() + (res.expira_en || 7200) * 1000,
  };
  guardarSesion(sesion);
  return sesion;
}

/** Pide una sección. El backend resuelve de quién son los datos: aquí no va ningún id. */
export async function pedir(seccion) {
  const sesion = leerSesion();
  if (!sesion) throw new Error('sesion_vencida');

  const r = await fetch(`${BACKEND_URL}/api/functions/portalDatos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.jwt}` },
    body: JSON.stringify({ seccion }),
  });
  const res = await r.json().catch(() => ({}));
  if (r.status === 401) { cerrarSesion(); throw new Error('sesion_vencida'); }
  if (!r.ok || res?.error) throw new Error(res?.error || 'No se pudo cargar');
  return res.datos;
}

/** Formatea pesos colombianos sin decimales. */
export const pesos = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

/** "2026-07" -> "julio 2026" */
export function periodoLegible(p) {
  if (!p) return '';
  const [a, m] = String(p).split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombre = meses[Number(m) - 1];
  return nombre ? `${nombre} ${a}` : p;
}
