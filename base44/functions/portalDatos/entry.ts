// ─────────────────────────────────────────────────────────────────────────────
// portalDatos — lecturas del portal del cliente
//
// LA REGLA QUE HACE ESTO SEGURO: el cliente nunca manda un id. Manda su JWT y
// el nombre de una seccion. El sujeto (arrendatario_id / propietario_id /
// contrato_id) sale del JWT firmado, que emitio portalAuth desde una fila de
// SesionPortal. Un arrendatario no puede pedir el contrato de otro porque no
// existe ningun parametro donde ponerlo.
//
// Se devuelven PROYECCIONES, no filas crudas: el portal no necesita ver notas
// internas, ni el asesor asignado, ni margenes.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') || '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ── Verificacion del JWT ─────────────────────────────────────────────────────

const desdeB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function verificar(jwt: string): Promise<Record<string, any> | null> {
  // TODO el cuerpo va dentro del try: desdeB64url usa atob, que LANZA con
  // base64 invalido. Un token corrupto en sessionStorage, o cualquiera que
  // mande "aaa.bbb.!!!", hacia estallar esta funcion antes de devolver null.
  // Como el handler la llama fuera de su try, eso salia como 500 en vez de un
  // 401 limpio: el usuario veia un error opaco en lugar de que lo mandaran a
  // pedir otro enlace.
  try {
    const partes = jwt.split('.');
    if (partes.length !== 3) return null;
    const [header, cuerpo, firma] = partes;

    const clave = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    // crypto.subtle.verify compara en tiempo constante: no filtra por timing.
    // Se verifica SIEMPRE con HS256 sin mirar el `alg` del header: asi un token
    // con "alg":"none" no tiene por donde colarse.
    const ok = await crypto.subtle.verify(
      'HMAC', clave, desdeB64url(firma), new TextEncoder().encode(`${header}.${cuerpo}`),
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo)));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Acceso a datos ───────────────────────────────────────────────────────────

const hdrs = () => ({ api_key: Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' });

async function listar(entidad: string, filtro: string, limite = 50): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/entities/${entidad}?${filtro}&limit=${limite}`, { headers: hdrs() });
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

async function uno(entidad: string, id: string): Promise<any | null> {
  if (!id) return null;
  const r = await fetch(`${BASE_URL}/api/entities/${entidad}/${id}`, { headers: hdrs() });
  return r.ok ? await r.json() : null;
}

const dinero = (n: unknown) => Number(n) || 0;

// ── Secciones ────────────────────────────────────────────────────────────────

async function estadoCuenta(sesion: Record<string, any>) {
  const contratoId = sesion.contrato_id;
  if (!contratoId) return { periodos: [], saldo_total: 0, mensaje: 'Sin contrato asociado' };

  const pagos = await listar('PagoCanon', `contrato_id=${encodeURIComponent(contratoId)}`, 24);
  const ordenados = pagos.sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));

  return {
    periodos: ordenados.map((p) => ({
      periodo: p.periodo,
      valor_total: dinero(p.valor_total),
      valor_pagado: dinero(p.valor_pagado),
      saldo: dinero(p.saldo),
      estado: p.estado,
      fecha_vencimiento: p.fecha_vencimiento,
      fecha_pago: p.fecha_pago || null,
      dias_mora: Number(p.dias_mora) || 0,
    })),
    saldo_total: ordenados.reduce((s, p) => s + dinero(p.saldo), 0),
  };
}

async function contrato(sesion: Record<string, any>) {
  const c = await uno('ContratoArriendo', sesion.contrato_id);
  if (!c) return null;
  // Proyeccion: no salen notas internas ni el porcentaje que gana la inmobiliaria.
  return {
    propiedad: c.propiedad_titulo,
    arrendatario: c.arrendatario_nombre,
    canon_mensual: dinero(c.canon_mensual),
    dia_pago: c.dia_pago,
    fecha_inicio: c.fecha_inicio,
    fecha_fin: c.fecha_fin,
    estado: c.estado,
  };
}

async function pagos(sesion: Record<string, any>) {
  const codigos = await listar('CodigoBarras', `arrendatario_id=${encodeURIComponent(sesion.sub)}`, 12);
  return {
    codigos: codigos
      .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')))
      .map((c) => ({ periodo: c.periodo, valor: dinero(c.valor), url_pdf: c.url_pdf || null })),
  };
}

async function reparaciones(sesion: Record<string, any>) {
  const rs = await listar('Reparacion', `arrendatario_id=${encodeURIComponent(sesion.sub)}`, 30);
  return {
    reparaciones: rs.map((r) => ({
      id: r.id,
      categoria: r.categoria,
      descripcion: r.descripcion,
      urgencia: r.urgencia,
      estado: r.estado,
      fecha_reporte: r.fecha_reporte,
      fecha_resolucion: r.fecha_resolucion || null,
    })),
  };
}

async function liquidaciones(sesion: Record<string, any>) {
  if (sesion.tipo !== 'propietario') return { liquidaciones: [] };
  const ls = await listar('LiquidacionPropietario', `propietario_id=${encodeURIComponent(sesion.sub)}`, 24);
  return {
    liquidaciones: ls
      .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')))
      .map((l) => ({
        periodo: l.periodo,
        ingresos_brutos: dinero(l.ingresos_brutos),
        comision: dinero(l.comision_inmobiliaria),
        descuentos: dinero(l.descuentos_reparaciones),
        neto: dinero(l.neto_a_pagar),
        estado: l.estado,
      })),
  };
}

async function resumen(sesion: Record<string, any>) {
  const nombre = sesion.tipo === 'propietario'
    ? (await uno('Propietario', sesion.sub))?.nombre
    : (await uno('Arrendatario', sesion.sub))?.nombre;
  const ec = sesion.contrato_id ? await estadoCuenta(sesion) : { saldo_total: 0, periodos: [] };
  return {
    nombre: nombre || '',
    tipo: sesion.tipo,
    saldo_total: ec.saldo_total,
    proximo_vencimiento: ec.periodos.find((p: any) => p.estado !== 'Pagado')?.fecha_vencimiento || null,
  };
}

const SECCIONES: Record<string, (s: Record<string, any>) => Promise<unknown>> = {
  resumen, 'estado-cuenta': estadoCuenta, contrato, pagos, reparaciones, liquidaciones,
};

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  if (!JWT_SECRET || !BASE_URL) return json({ error: 'Portal no configurado' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Solicitud invalida' }, 400); }

  const jwt = String(body?.jwt || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '');
  const sesion = await verificar(jwt);
  if (!sesion) return json({ error: 'Sesion invalida o vencida' }, 401);

  const seccion = String(body?.seccion || 'resumen');
  const handler = SECCIONES[seccion];
  if (!handler) return json({ error: 'Seccion desconocida' }, 400);

  try {
    return json({ ok: true, seccion, datos: await handler(sesion) });
  } catch (err) {
    console.error(`portalDatos[${seccion}]:`, (err as Error).message);
    return json({ error: 'No se pudo cargar la informacion' }, 500);
  }
});
