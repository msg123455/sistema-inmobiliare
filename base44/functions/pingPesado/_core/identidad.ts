// Verificacion de identidad y sesiones de portal.
//
// Regla que sostiene todo lo demas: el modelo NUNCA ve el dato correcto ni
// puede pasar un id arbitrario. La comparacion ocurre aqui, server-side, y las
// tools que leen PII no tienen parametros identificadores (ver tools/cartera.ts).
// Solo este modulo escribe estado.identidad.

import type { Db } from './db.ts';
import { type Entrada, type Estado } from './protocol.ts';
import { identidadVacia } from './state.ts';

const HORAS_VIGENCIA = 24;
const MAX_INTENTOS = 3;
const BLOQUEO_MIN = 60;
const TTL_PORTAL_MIN = 15;

const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function auditar(
  db: Db,
  datos: { tipo: string; sujeto_id?: string; telefono: string; exito: boolean; detalle?: string },
) {
  try {
    await db.crear('AuditoriaAcceso', {
      tipo: datos.tipo,
      sujeto_id: datos.sujeto_id || '',
      telefono: soloDigitos(datos.telefono),
      exito: datos.exito,
      detalle: (datos.detalle || '').slice(0, 500),
      fecha: new Date().toISOString(),
    });
  } catch (e) {
    console.error('auditar error:', (e as Error).message);
  }
}

// ── Nivel A: implicito. El `from` del canal contra Arrendatario/Propietario. ──
// Suficiente para RUTEAR a cartera. Nunca suficiente para divulgar: SIM swap,
// telefonos familiares compartidos, numeros reasignados por el operador.
export async function reconocerTelefono(db: Db, tel: string) {
  const t = soloDigitos(tel);
  if (!t) return { arrendatario: null, propietario: null, contrato: null };
  const [arrs, props] = await Promise.all([
    db.list('Arrendatario', { telefono: t, limit: 1 }),
    db.list('Propietario', { telefono: t, limit: 1 }),
  ]);
  const arrendatario = arrs[0] || null;
  let contrato = null;
  if (arrendatario) {
    contrato = (await db.list('ContratoArriendo', { arrendatario_id: arrendatario.id, estado: 'Activo', limit: 1 }))[0] || null;
  }
  return { arrendatario, propietario: props[0] || null, contrato };
}

export function sesionVigente(estado: Estado): boolean {
  const i = estado.identidad;
  if (!i.verificado || !i.expira) return false;
  return new Date(i.expira).getTime() > Date.now();
}

export function bloqueado(estado: Estado): boolean {
  const h = estado.identidad.bloqueado_hasta;
  return !!h && new Date(h).getTime() > Date.now();
}

// ── Nivel B: reto. Segundo factor que el registro ya tiene. ──────────────────
// `valor` es lo que dijo el cliente; el dato correcto no sale de esta funcion.
export async function verificar(
  db: Db,
  estado: Estado,
  entrada: Entrada,
  tipo: 'cedula_ultimos4' | 'numero_solicitud',
  valor: string,
): Promise<{ verificado: boolean; intentos_restantes: number; bloqueado: boolean }> {
  if (bloqueado(estado)) {
    await auditar(db, { tipo: 'verificacion', telefono: entrada.tel, exito: false, detalle: 'intento durante bloqueo' });
    return { verificado: false, intentos_restantes: 0, bloqueado: true };
  }

  const { arrendatario, propietario, contrato } = await reconocerTelefono(db, entrada.tel);
  let ok = false;
  let sujeto: string | undefined;

  if (tipo === 'cedula_ultimos4') {
    const dado = soloDigitos(valor).slice(-4);
    for (const p of [arrendatario, propietario]) {
      if (!p) continue;
      const real = soloDigitos(p.numero_documento).slice(-4);
      if (dado.length === 4 && real.length === 4 && dado === real) { ok = true; sujeto = p.id; break; }
    }
  } else {
    const dado = String(valor || '').trim().toUpperCase();
    if (dado) {
      const sol = await db.uno('SolicitudMatricula', { numero_solicitud: dado });
      // El numero de solicitud solo vale si pertenece a este telefono.
      if (sol && soloDigitos(sol.telefono_contacto) === soloDigitos(entrada.tel)) { ok = true; sujeto = sol.id; }
    }
  }

  const i = estado.identidad;
  if (ok) {
    const ahora = new Date();
    estado.identidad = {
      ...identidadVacia(),
      verificado: true,
      metodo: tipo,
      arrendatario_id: arrendatario?.id ?? null,
      propietario_id: propietario?.id ?? null,
      contrato_id: contrato?.id ?? null,
      verificado_en: ahora.toISOString(),
      expira: new Date(ahora.getTime() + HORAS_VIGENCIA * 3600_000).toISOString(),
      intentos: 0,
      bloqueado_hasta: null,
    };
    await auditar(db, { tipo: 'verificacion', sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
    return { verificado: true, intentos_restantes: MAX_INTENTOS, bloqueado: false };
  }

  i.intentos = (i.intentos || 0) + 1;
  i.verificado = false;
  const restantes = Math.max(0, MAX_INTENTOS - i.intentos);
  if (restantes === 0) {
    i.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MIN * 60_000).toISOString();
  }
  await auditar(db, {
    tipo: 'verificacion', telefono: entrada.tel, exito: false,
    detalle: `${tipo} fallido (intento ${i.intentos}/${MAX_INTENTOS})`,
  });
  return { verificado: false, intentos_restantes: restantes, bloqueado: restantes === 0 };
}

// ── Nivel C: magic link al portal. ──────────────────────────────────────────
// Nunca sale un PDF ni un extracto completo por WhatsApp. Sale un link de un
// solo uso, atado a este telefono, que vence en 15 minutos.
export async function crearSesionPortal(
  db: Db,
  entrada: Entrada,
  estado: Estado,
  tipo: string,
): Promise<string | null> {
  const sujeto = estado.identidad.arrendatario_id || estado.identidad.propietario_id;
  if (!sesionVigente(estado) || !sujeto) return null;

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const fila = await db.crear('SesionPortal', {
    token_hash: await sha256(token),      // en reposo solo queda el hash
    tipo,
    sujeto_id: sujeto,
    sujeto_tipo: estado.identidad.arrendatario_id ? 'arrendatario' : 'propietario',
    contrato_id: estado.identidad.contrato_id || '',
    telefono: soloDigitos(entrada.tel),
    expira: new Date(Date.now() + TTL_PORTAL_MIN * 60_000).toISOString(),
    usado: false,
    creada: new Date().toISOString(),
  });
  if (!fila) return null;

  await auditar(db, { tipo: 'sesion_portal', sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
  const app = (Deno.env.get('PORTAL_URL') || Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  return `${app}/portal/entrar?t=${token}`;
}
