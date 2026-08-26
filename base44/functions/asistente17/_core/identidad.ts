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

/**
 * Busca al titular por su NIT o cedula en TitularInmueble.
 *
 * POR QUE HACE FALTA: hasta ahora la unica llave de entrada era el telefono, asi
 * que un titular que escribiera desde otro numero (el del trabajo, el de la
 * esposa, uno nuevo) simplemente no existia para el sistema, y el asistente
 * terminaba pidiendole nombre y direccion como el bot viejo. El documento es lo
 * que la operacion usa de verdad para identificar a alguien.
 *
 * POR QUE NO DEVUELVE LAS DIRECCIONES SIN MAS: una cedula en Colombia no es un
 * secreto. Si bastara con teclearla para que el asistente lea en voz alta donde
 * vive esa persona y cuantos inmuebles tiene, esto seria un buscador de
 * patrimonio ajeno.
 *
 * Por eso el detalle solo sale cuando el telefono desde el que escriben TAMBIEN
 * coincide con el registrado: ahi hay dos factores. Si no coincide, se devuelve
 * unicamente cuantos inmuebles hay, y le toca al cliente decir la direccion para
 * que el asistente la contraste. Confirmar un dato que el otro ya dijo no filtra
 * nada; leerselo si.
 */
export async function buscarTitularPorDocumento(
  db: Db,
  documento: string,
  telefono: string,
): Promise<{
  existe: boolean;
  coincide_telefono: boolean;
  total: number;
  nombre: string;
  inmuebles: Array<{ id: string; direccion: string; ciudad: string; codigo: string; rol: string; contrato_id: string }>;
}> {
  const doc = soloDigitos(documento);
  const vacio = { existe: false, coincide_telefono: false, total: 0, nombre: '', inmuebles: [] };
  // Menos de 5 digitos no es un documento: es un dedazo, y no vale la pena
  // convertir esta funcion en un oraculo para tantear numeros cortos.
  if (doc.length < 5) return vacio;

  const filas = await db.list('TitularInmueble', { numero_documento: doc, limit: 50 });
  // Se registra que devolvio la consulta, no solo el veredicto. Sin esto, "no
  // aparece" tapa por igual tres causas distintas —la persona no esta, el filtro
  // del backend no aplica, o el campo se llama de otra forma— y desde el chat se
  // ven identicas.
  console.log(`titular ${doc}: ${(filas || []).length} fila(s) crudas, estados=[${(filas || []).map((f: any) => f.estado).join(',')}]`);
  // Se descarta lo TERMINADO, en vez de exigir un valor concreto de "vigente".
  //
  // Antes decia `=== 'Vigente'`, y ese valor NO EXISTE en la entidad: el enum de
  // TitularInmueble.estado es Activo | Terminado. O sea que el filtro descartaba
  // todas las filas siempre, hubiera datos o no, y la busqueda por documento era
  // estructuralmente incapaz de encontrar a nadie. El sintoma en el chat era el
  // peor posible: el cliente dictaba su cedula correcta y el agente le pedia que
  // la confirmara, como si se hubiera equivocado.
  //
  // Preguntar por lo que descalifica y no por lo que califica: si manana el enum
  // gana un estado nuevo (Suspendido, En_mora), la fila sigue apareciendo, que
  // es lo que se quiere. Al reves, desapareceria en silencio.
  const vigentes = (filas || []).filter((f: any) => String(f.estado || '') !== 'Terminado');
  if (!vigentes.length) return vacio;

  const tel = soloDigitos(telefono);
  const coincide = !!tel && vigentes.some((f: any) => soloDigitos(f.telefono) === tel);

  return {
    existe: true,
    coincide_telefono: coincide,
    total: vigentes.length,
    nombre: coincide ? String(vigentes[0].nombre_titular || '') : '',
    inmuebles: coincide
      ? vigentes.map((f: any) => ({
        id: String(f.id || ''),
        direccion: String(f.direccion || ''),
        ciudad: String(f.ciudad || ''),
        codigo: String(f.codigo_inmueble || ''),
        rol: String(f.rol || ''),
        contrato_id: String(f.contrato_id || ''),
      }))
      : [],
  };
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
  // QUE rol quedo verificado, no solo que hubo coincidencia. Sin esto la
  // identidad se poblaba con los dos ids a la vez (ver mas abajo).
  let rolArrendatario = false;
  let rolPropietario = false;

  if (tipo === 'cedula_ultimos4') {
    const dado = soloDigitos(valor).slice(-4);
    for (const [rol, p] of [['arrendatario', arrendatario], ['propietario', propietario]] as const) {
      if (!p) continue;
      // Las dos entidades nombran el documento distinto: Arrendatario lo guarda
      // en numero_documento y Propietario en cedula_nit. Leer solo el primero
      // dejaba a TODO propietario sin poder verificarse: daba bien sus ultimos 4
      // tres veces y quedaba bloqueado una hora, porque el lado real era ''.
      const real = soloDigitos(p.numero_documento || p.cedula_nit).slice(-4);
      if (dado.length === 4 && real.length === 4 && dado === real) {
        ok = true;
        sujeto = p.id;
        if (rol === 'arrendatario') rolArrendatario = true; else rolPropietario = true;
      }
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
      // SOLO el rol cuyo documento coincidio. Antes se escribian los dos ids
      // pasara lo que pasara, y por la rama de numero_solicitud se escribian sin
      // que coincidiera ninguno.
      //
      // Es una fuga, no una imprecision: un telefono de oficina o familiar puede
      // figurar a la vez en Arrendatario A y en Propietario B, que son personas
      // distintas. A daba sus ultimos 4, quedaba con propietario_id = B, y podia
      // pedir el certificado tributario de B y abrir sus liquidaciones —
      // ingresos brutos, comision y neto a pagar.
      //
      // Si la misma persona es las dos cosas, su documento coincide en las dos
      // filas y el bucle de arriba marca los dos roles. Ese caso sigue andando.
      arrendatario_id: rolArrendatario ? (arrendatario?.id ?? null) : null,
      propietario_id: rolPropietario ? (propietario?.id ?? null) : null,
      // El contrato es del arrendatario. Un propietario verificado no hereda el
      // contrato de quien le arrienda.
      contrato_id: rolArrendatario ? (contrato?.id ?? null) : null,
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

// Secciones que solo existen del lado del propietario. Sin esto, alguien que
// ademas arrienda con la casa (es dueno de un inmueble Y vive en otro nuestro)
// recibia SIEMPRE una sesion de arrendatario, porque el sujeto salia de
// `arrendatario_id || propietario_id`. El portal entonces le mostraba una
// pagina vacia: sus liquidaciones y sus certificados cuelgan de propietario_id.
const SECCIONES_PROPIETARIO = new Set(['certificados', 'liquidaciones']);

// ── Nivel C: magic link al portal. ──────────────────────────────────────────
// Nunca sale un PDF ni un extracto completo por WhatsApp. Sale un link de un
// solo uso, atado a este telefono, que vence en 15 minutos.
export async function crearSesionPortal(
  db: Db,
  entrada: Entrada,
  estado: Estado,
  tipo: string,
): Promise<string | null> {
  const arrendatarioId = estado.identidad.arrendatario_id;
  const propietarioId = estado.identidad.propietario_id;
  const comoPropietario = SECCIONES_PROPIETARIO.has(tipo)
    ? !!propietarioId
    : !arrendatarioId && !!propietarioId;
  const sujeto = comoPropietario ? propietarioId : arrendatarioId;
  if (!sesionVigente(estado) || !sujeto) return null;

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const fila = await db.crear('SesionPortal', {
    token_hash: await sha256(token),      // en reposo solo queda el hash
    tipo,
    sujeto_id: sujeto,
    sujeto_tipo: comoPropietario ? 'propietario' : 'arrendatario',
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
