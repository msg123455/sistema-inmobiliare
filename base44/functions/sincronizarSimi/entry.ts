// ─────────────────────────────────────────────────────────────────────────────
// sincronizarSimi — trae el inventario desde la API de SIMI
//
// Reemplaza el paso manual de bajar el export a una hoja y subirla. La
// importacion por CSV se conserva como respaldo: si SIMI se cae, o hay que
// cargar algo a mano, ese camino sigue abierto.
//
// LO QUE GANA EL CATALOGO. El CSV no trae alcobas, banios, garajes, fotos,
// coordenadas, estrato ni descripcion. Sin alcobas el agente no podia responder
// "busco algo de tres habitaciones", que es de las primeras cosas que pregunta
// un cliente. La API si los trae.
//
// TRES COSAS MEDIDAS CONTRA LA API REAL, no supuestas:
//
//   1. Es LENTA. Una pagina de 50 tarda 14,6s y Base44 corta a los 15. Hay unos
//      4s de arranque fijos mas ~0,2s por inmueble. Por eso las paginas son
//      chicas y el presupuesto se mide por reloj, no por cantidad.
//
//   2. Si se piden mas de 100, devuelve 10 SIN AVISAR. Ni error ni aviso: diez.
//      Un cursor que avanzara de a 500 confiando en lo pedido se saltaria 490
//      inmuebles en silencio y el catalogo quedaria con huecos que nadie
//      atribuiria a esto. Por eso se cuenta SIEMPRE lo que llega.
//
//   3. Los numeros vienen como texto con COMA de miles ("4,324,250,000") y
//      punto decimal. El CSV usa exactamente lo contrario. Reutilizar el parser
//      del CSV guardaria ese lote como 4.324 pesos, sin fallar. De ahi que este
//      archivo tenga el suyo propio y no comparta el de importarInventario.
//
// Archivo autocontenido, y sin `export` en el nivel superior: un entry de
// Base44 es un script, no un modulo, y basta un export suelto para que la
// funcion responda 404 sin decir nada.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
const TOKEN = Deno.env.get('FUNCTIONS_TOKEN') || '';

// Credencial de SIMI. Sin valor por defecto: uno quemado en un repo publico no
// protege nada y ademas disimula que falta configurarlo.
const SIMI_TOKEN = Deno.env.get('SIMI_API_TOKEN') || '';
const SIMI_BASE = Deno.env.get('SIMI_API_URL')
  || 'http://simi-api.com/ApiSimiweb/response/v2.1.1/filtroInmueble';

// Pagina por defecto. 30 tarda ~9,3s contra los 15s de Base44, y deja margen
// para escribir lo traido. 50 ya son 14,6s y no cabe nada mas.
const POR_PAGINA = 30;

// Tope duro de la API: por encima de 100 devuelve 10 en silencio.
const TOPE_API = 100;

// Se corta por reloj y no por cantidad porque cada inmueble hace dos llamadas a
// Base44 (buscar y escribir) y su latencia no es constante.
const PRESUPUESTO_MS = 11_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ── Normalizadores ───────────────────────────────────────────────────────────

const txt = (v: unknown) => String(v ?? '').trim();

/**
 * Numeros como los manda la API de SIMI: coma de miles, punto decimal.
 *
 *   "4,324,250,000" -> 4324250000
 *   "17,297"        -> 17297
 *   "4.8716623"     -> 4.8716623   (coordenada, sin separador de miles)
 *
 * NO es el mismo que el de importarInventario. Ese lee hojas colombianas
 * —punto de miles, coma decimal— que es el formato contrario. Cruzarlos
 * convierte cuatro mil millones en cuatro mil, y no da error al hacerlo.
 */
function numSimi(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const TIPOS_VALIDOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];

/** Tipo de inmueble de SIMI -> enum de Propiedad. Misma tabla que el CSV. */
function tipoInmueble(v: unknown): string {
  const s = txt(v).toLowerCase();
  if (!s) return 'Otro';
  if (s.includes('apartaestudio') || s.includes('apto') || s.includes('apartamento')) return 'Apartamento';
  if (s.includes('casa')) return 'Casa';
  if (s.includes('local')) return 'Local';
  if (s.includes('oficina') || s.includes('consultorio')) return 'Oficina';
  if (s.includes('bodega')) return 'Bodega';
  if (s.includes('lote') || s.includes('terreno')) return 'Lote';
  if (s.includes('finca')) return 'Finca';
  return TIPOS_VALIDOS.find((t) => t.toLowerCase() === s) || 'Otro';
}

function operacion(v: unknown): string {
  const s = txt(v).toLowerCase();
  const venta = s.includes('venta');
  const arriendo = s.includes('arriend') || s.includes('renta');
  if (venta && arriendo) return 'Venta_y_Arriendo';
  if (arriendo) return 'Arriendo';
  return 'Venta';
}

function estado(v: unknown): string {
  const s = txt(v).toLowerCase();
  if (!s) return 'Disponible';
  if (s.startsWith('disponible')) return 'Disponible';
  if (s.includes('reservad')) return 'Reservado';
  if (s.includes('vendid')) return 'Vendido';
  if (s.includes('arrendad')) return 'Arrendado';
  return 'No_disponible';
}

function titulo(tipo: string, barrio: string, ciudad: string, codigo: string): string {
  const partes = [tipo];
  if (barrio) partes.push(`en ${barrio}`);
  else if (ciudad) partes.push(`en ${ciudad}`);
  const base = partes.join(' ').trim();
  return base && base !== tipo ? base : `${tipo} ${codigo}`.trim();
}

/**
 * Un inmueble de la API -> la forma que guarda Propiedad.
 *
 * Solo se devuelven los campos de los que SIMI es autoridad. Lo que se edita
 * dentro de la app —los links de portales que trae el CSV, las fotos que
 * alguien subio a mano— NO va aqui: al escribir se mezcla sobre lo existente,
 * asi que lo que no aparezca en este objeto se conserva.
 */
function desdeApi(inm: Record<string, unknown>) {
  const codigo = txt(inm.Codigo_Inmueble);
  if (!codigo) return null;

  const tipo = tipoInmueble(inm.Tipo_Inmueble);
  const barrio = txt(inm.Barrio);
  const ciudad = txt(inm.Ciudad) || 'Bogota';

  // AreaConstruida es 0 en lotes y fincas; ahi el area que importa es la del
  // lote. Tomar siempre la construida dejaria esos inmuebles sin area.
  const construida = numSimi(inm.AreaConstruida);
  const lote = numSimi(inm.AreaLote);

  const foto = txt(inm.foto1);

  return {
    codigo_externo: codigo,
    proveedor: 'simi',
    titulo: titulo(tipo, barrio, ciudad, codigo),
    tipo,
    operacion: operacion(inm.Gestion),
    estado: estado(inm.estadoInmueble),

    precio_venta: numSimi(inm.Venta),
    canon_arriendo: numSimi(inm.Canon),
    // Hay dos campos de administracion en el esquema y el agente lee
    // valor_administracion primero. Se llenan los dos hasta que se unifiquen,
    // o el agente leeria vacio lo que si tenemos.
    administracion: numSimi(inm.Administracion),
    valor_administracion: numSimi(inm.Administracion),

    // Lo que el CSV nunca trajo. Es la razon de usar la API.
    habitaciones: numSimi(inm.Alcobas),
    banos: numSimi(inm.banios),
    parqueaderos: numSimi(inm.garaje),
    estrato: numSimi(inm.Estrato),
    area_m2: construida > 0 ? construida : lote,
    latitud: numSimi(inm.latitud),
    longitud: numSimi(inm.longitud),
    descripcion: txt(inm.descripcionlarga),
    fotos: foto ? [foto] : [],

    barrio,
    ciudad,
    zona: txt(inm.Zona),
    asesor: txt(inm.NombreInmo),
    fecha_consignado: txt(inm.fingreso),
  };
}

// ── Llamada a SIMI ───────────────────────────────────────────────────────────

/** Los filtros van en la ruta, no en query string. 0 significa "sin filtro". */
function urlPagina(desde: number, cuantos: number): string {
  return `${SIMI_BASE}/limite/${desde}/total/${cuantos}`
    + '/departamento/0/ciudad/0/zona/0/barrio/0/tipoInm/0/tipOper/0'
    + '/areamin/0/areamax/0/valmin/0/valmax/0/campo/0/order/0'
    + '/banios/0/alcobas/0/garajes/0/sede/0/usuario/0';
}

async function traerPagina(desde: number, cuantos: number) {
  // Basic con usuario VACIO y el token como contrasena. Comprobado contra la
  // API: las otras cuatro formas devuelven 401 en el cuerpo con HTTP 200.
  const auth = btoa(`:${SIMI_TOKEN}`);
  const r = await fetch(urlPagina(desde, cuantos), {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  const cuerpo = await r.text();
  let data: any;
  try {
    data = JSON.parse(cuerpo);
  } catch {
    // La API contesta HTML cuando algo va mal en su lado. Guardar eso como si
    // fueran inmuebles seria peor que fallar.
    throw new Error(`SIMI no devolvio JSON (HTTP ${r.status}): ${cuerpo.slice(0, 120)}`);
  }

  // El 401 viene DENTRO del cuerpo con HTTP 200, asi que mirar r.ok no basta.
  if (data?.status === 401 || /autenticaci/i.test(txt(data?.description))) {
    throw new Error('SIMI rechazo la credencial. Revisa SIMI_API_TOKEN.');
  }
  if (!Array.isArray(data?.Inmuebles)) {
    throw new Error(`Respuesta inesperada de SIMI: ${cuerpo.slice(0, 120)}`);
  }

  return {
    inmuebles: data.Inmuebles as Array<Record<string, unknown>>,
    total: Number(data?.datosGrales?.totalInmuebles) || 0,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (!BASE_URL) return json({ error: 'BASE44_APP_URL no configurada' }, 500);
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

  if (!TOKEN) {
    return json({
      error: 'Falta FUNCTIONS_TOKEN en Base44 (Configuracion > Secretos).',
    }, 500);
  }
  if (body?.token !== TOKEN) return json({ error: 'No autorizado' }, 401);

  if (!SIMI_TOKEN) {
    return json({
      error: 'Falta SIMI_API_TOKEN en Base44 (Configuracion > Secretos). '
        + 'Es la credencial que entrega SIMI para su API.',
    }, 500);
  }

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return json({ error: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };

  // ── Sonda: comprueba credencial y devuelve el total, sin escribir nada ──────
  if (body?.sonda === true) {
    const t0 = Date.now();
    try {
      const { inmuebles, total } = await traerPagina(1, 1);
      return json({
        ok: true,
        total_en_simi: total,
        ejemplo: inmuebles[0] ? desdeApi(inmuebles[0]) : null,
        ms: Date.now() - t0,
      });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  // ── Sincronizacion por paginas ──────────────────────────────────────────────
  const desde = Math.max(1, Number(body?.desde) || 1);
  // Se acepta ajustar el tamano, pero nunca por encima del tope real de la API:
  // pedir 500 devolveria 10 y el cursor avanzaria 500, saltandose 490.
  const cuantos = Math.min(Math.max(1, Number(body?.por_pagina) || POR_PAGINA), TOPE_API);

  const t0 = Date.now();
  const res = {
    creados: 0,
    actualizados: 0,
    omitidos: 0,
    errores: [] as string[],
  };

  let pagina;
  try {
    pagina = await traerPagina(desde, cuantos);
  } catch (e) {
    return json({ error: (e as Error).message, desde }, 502);
  }

  const { inmuebles, total } = pagina;

  // Cuantos llegaron DE VERDAD. Si se pidieron 30 y vinieron 10, el cursor tiene
  // que avanzar 10: avanzar 30 se saltaria veinte inmuebles sin que nada falle.
  const recibidos = inmuebles.length;

  for (const inm of inmuebles) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;

    const p = desdeApi(inm);
    if (!p) { res.omitidos++; continue; }

    try {
      const q = `${BASE_URL}/api/entities/Propiedad`
        + `?codigo_externo=${encodeURIComponent(p.codigo_externo)}`
        + '&proveedor=simi&limit=1';
      const rBusca = await fetch(q, { headers: hdrs });
      const existentes = rBusca.ok ? await rBusca.json() : [];
      const existente = Array.isArray(existentes) ? existentes[0] : null;

      if (existente?.id) {
        // PUT reemplaza la fila entera, asi que se mezcla sobre lo que ya hay.
        // Sin esto se borrarian los links de portales, que solo trae el CSV, y
        // todo lo que alguien haya editado dentro de la app.
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad/${existente.id}`, {
          method: 'PUT', headers: hdrs, body: JSON.stringify({ ...existente, ...p }),
        });
        if (r.ok) res.actualizados++;
        else res.errores.push(`${p.codigo_externo}: PUT ${r.status}`);
      } else {
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(p),
        });
        if (r.ok) res.creados++;
        else res.errores.push(`${p.codigo_externo}: POST ${r.status} ${(await r.text()).slice(0, 100)}`);
      }
    } catch (err) {
      res.errores.push(`${p.codigo_externo}: ${(err as Error).message}`);
    }
  }

  const procesados = res.creados + res.actualizados + res.omitidos;
  // Se avanza por lo PROCESADO, no por lo pedido ni por lo recibido: si el
  // presupuesto corto a mitad de pagina, el resto se retoma en la siguiente
  // llamada en vez de perderse.
  const siguiente = procesados > 0 && desde + procesados <= total ? desde + procesados : null;

  return json({
    ...res,
    desde,
    pedidos: cuantos,
    recibidos,
    procesados,
    total_en_simi: total,
    siguiente,
    completado: siguiente === null,
    ms: Date.now() - t0,
    errores: res.errores.slice(0, 20),
  });
});
