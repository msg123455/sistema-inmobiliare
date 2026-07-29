// ─────────────────────────────────────────────────────────────────────────────
// portalAuth — canjea el magic link del portal por una sesion
//
// El agente de cartera (y el de matricula) emiten un link de un solo uso:
//   https://<app>/portal/entrar?t=<64 hex>
// En SesionPortal solo queda el SHA-256 del token, nunca el token en claro.
// Esta funcion lo canjea por un JWT de 2h y marca la fila como usada.
//
// POR QUE NO USAR LA AUTH DE BASE44 PARA ESTO: el SDK del navegador y el
// sistema de roles son para el staff. Meter miles de arrendatarios en ese pool
// los pondria en el mismo padron de usuarios y les dejaria alcanzable
// base44.entities.*. El portal habla solo con estas funciones, que resuelven el
// sujeto server-side y devuelven proyecciones.
//
// Archivo autocontenido: Base44 rechaza imports que salgan de la carpeta de la
// funcion, y esto no necesita _core.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') || '';
const TTL_SESION_H = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // El portal se sirve del mismo origen; no se abre CORS a terceros.
      'Cache-Control': 'no-store',
    },
  });
}

// ── Utilidades cripto ────────────────────────────────────────────────────────

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64url = (data: Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function firmar(payload: Record<string, unknown>): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify(payload));
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${header}.${cuerpo}`));
  return `${header}.${cuerpo}.${b64url(new Uint8Array(firma))}`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  if (!JWT_SECRET) {
    console.error('PORTAL_JWT_SECRET no configurada');
    return json({ error: 'Portal no configurado' }, 500);
  }
  if (!BASE_URL) return json({ error: 'BASE44_APP_URL no configurada' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Solicitud invalida' }, 400); }

  const token = String(body?.token || '').trim();
  // El token son 64 hex. Validar la forma antes de tocar la base evita usarla
  // como oraculo con entradas basura.
  if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: 'Enlace invalido o vencido' }, 401);

  const hdrs = { api_key: Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };

  // RESPUESTA GENERICA EN TODOS LOS FALLOS: no se distingue "no existe" de
  // "vencido" de "ya usado". Distinguirlos convierte este endpoint en un
  // oraculo para saber que tokens existieron.
  const rechazo = () => json({ error: 'Enlace invalido o vencido' }, 401);

  try {
    const hash = await sha256(token);
    const r = await fetch(
      `${BASE_URL}/api/entities/SesionPortal?token_hash=${encodeURIComponent(hash)}&limit=1`,
      { headers: hdrs },
    );
    if (!r.ok) return rechazo();

    const filas = await r.json();
    const sesion = Array.isArray(filas) ? filas[0] : null;
    if (!sesion) return rechazo();
    if (sesion.usado) return rechazo();
    if (!sesion.expira || new Date(sesion.expira).getTime() < Date.now()) return rechazo();

    // Quemar el token ANTES de emitir la sesion. Si el marcado falla, no se
    // entrega nada: preferimos que el cliente pida otro link a que un token
    // quede reutilizable.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const marcado = await fetch(`${BASE_URL}/api/entities/SesionPortal/${sesion.id}`, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify({ ...sesion, usado: true, usado_en: new Date().toISOString(), ip }),
    });
    if (!marcado.ok) {
      console.error('No se pudo marcar la sesion como usada:', marcado.status);
      return rechazo();
    }

    const ahora = Math.floor(Date.now() / 1000);
    const jwt = await firmar({
      sub: sesion.sujeto_id,
      tipo: sesion.sujeto_tipo,            // arrendatario | propietario | solicitud_matricula
      contrato_id: sesion.contrato_id || '',
      tel: sesion.telefono,
      seccion: sesion.tipo || '',
      iat: ahora,
      exp: ahora + TTL_SESION_H * 3600,
    });

    return json({
      ok: true,
      jwt,
      expira_en: TTL_SESION_H * 3600,
      sujeto_tipo: sesion.sujeto_tipo,
      seccion: sesion.tipo || '',
    });
  } catch (err) {
    console.error('portalAuth error:', (err as Error).message);
    return rechazo();
  }
});
