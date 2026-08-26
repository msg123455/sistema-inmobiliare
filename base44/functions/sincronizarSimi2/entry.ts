// ─────────────────────────────────────────────────────────────────────────────
// sincronizarSimi — trae el inventario desde la API de SIMI
//
// Es la UNICA entrada del inventario. La importacion por CSV se elimino.
//
// MODOS:
//   sonda        comprueba la credencial y devuelve el total. No escribe nada.
//   diagnostico  escribe una fila de mentira y la relee para ver que campos
//                acepta Base44 de verdad. La borra siempre.
//   completa     recorre el catalogo pagina por pagina. Para la carga inicial.
//   incremental  pide ordenado por fecha descendente y para al llegar a lo ya
//                conocido. Es el de la tarea programada: una corrida diaria
//                toca ~20 inmuebles en vez de 2720.
//   borrar       vacia Propiedad para reconstruirla. Exige la frase literal
//                'BORRAR TODO'; no se puede deshacer.
//
// ── DOS ENDPOINTS, Y HAY QUE USAR LOS DOS ────────────────────────────────────
//
// filtroInmueble (listado) devuelve 42 campos por inmueble. NO trae direccion,
// NO trae links de portales y trae UNA sola foto. Sirve para enumerar, no para
// llenar el catalogo.
//
// /v2/inmueble/codInmueble/{codigo} (detalle) devuelve 78 campos e incluye
// justo lo que falta: Direccion, el array completo de fotos (media 15, hasta
// 31), los links publicos en portales, los datos del asesor y las
// caracteristicas. Comprobado en vivo sobre 71 inmuebles repartidos por todo el
// inventario: 71/71 con direccion y con al menos un link real.
//
// Por eso cada pagina se enumera y se hidrata en la misma llamada. Sin el
// detalle el agente no puede decirle al cliente donde queda el inmueble ni
// mandarle un link, que es justo lo que el CSV si daba.
//
// ── CINCO COSAS MEDIDAS CONTRA LA API REAL, no supuestas ─────────────────────
//
//   1. `limite` es el NUMERO DE PAGINA, no la fila donde arrancar. `total` es
//      el tamano de pagina. Comprobado: limite/1/total/5 y limite/2/total/5 no
//      comparten ni un codigo, y datosGrales.fin baja de 2720 a 544 al pasar de
//      total/1 a total/5, o sea cuenta paginas.
//      Antes se le pasaba un cursor de filas (1, 14, 27…) creyendo que era un
//      desplazamiento. Con paginas de 30 eso pedia las paginas 1, 14 y 27 —las
//      filas 1-30, 391-420, 781-810— y daba el catalogo por terminado despues
//      de tocar unas siete. El resto no se saltaba con un error: no se pedia.
//
//   2. El listado es LENTO y casi todo su costo es fijo: 20 tardan 7,8s, 30
//      tardan 10,2s y 50 tardan 14,2s, con el corte de Base44 en 15. Pedir mas
//      no sale a cuenta. El detalle, en cambio, tarda 0,2s y va en paralelo sin
//      penalizacion: 20 detalles simultaneos son 0,9s en total.
//
//   3. Si al listado se le piden mas de 100, devuelve 10 SIN AVISAR. Por eso se
//      cuenta SIEMPRE lo que llega en vez de confiar en lo que se pidio.
//
//   4. LOS NUMEROS VIENEN EN TRES FORMATOS DISTINTOS, y dos de ellos se
//      contradicen dentro de la MISMA respuesta:
//        ValorVenta      "1600000000"     sin separadores
//        precio          "1,600,000,000"  coma de miles
//        Administracion  "1.500.000"      PUNTO de miles
//        AreaConstruida  "217.57"         punto DECIMAL
//      Un solo parser se equivoca si o si: el que lee bien "217.57" convierte
//      "1.500.000" en 1,5. De ahi que haya un parser por tipo de dato y no uno
//      solo. Y ninguno se comparte con el del CSV, que usaba el formato
//      colombiano contrario.
//
//   5. urlPortal llega sucio: unas veces "", otras " " (un espacio) y otras
//      null. Hay que exigir que empiece por http, no que "no este vacio", o se
//      guardan links en blanco que el agente le manda al cliente.
//
// Archivo autocontenido, y sin `export` en el nivel superior: un entry de
// Base44 es un script, no un modulo, y basta un export suelto para que la
// funcion responda 404 sin decir nada.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
const TOKEN = Deno.env.get('FUNCTIONS_TOKEN') || '';
// La tarea programada usa su propio token, igual que los demas crons del repo.
const CRON_TOKEN = Deno.env.get('CRON_TOKEN') || '';

// Credencial de SIMI. Sin valor por defecto: uno quemado en un repo publico no
// protege nada y ademas disimula que falta configurarlo.
const SIMI_TOKEN = Deno.env.get('SIMI_API_TOKEN') || '';

// HTTPS, comprobado que responde igual que HTTP. Importa porque la credencial
// va en la cabecera Basic: por HTTP viajaba legible en toda la ruta.
const SIMI_HOST = Deno.env.get('SIMI_API_HOST') || 'https://simi-api.com';
const SIMI_LISTADO = `${SIMI_HOST}/ApiSimiweb/response/v2.1.1/filtroInmueble`;
const SIMI_DETALLE = `${SIMI_HOST}/ApiSimiweb/response/v2/inmueble/codInmueble`;

// Tamano de pagina del listado.
//
// 20 tarda 7,8s de forma estable. 30 se va a 10,2s y a veces a 14, que con el
// corte en 15s deja sin margen para hidratar y escribir. Una llamada que se
// pasa no devuelve cursor, y eso cuesta mas que ir de a 20.
const POR_PAGINA = 20;

// Detalles simultaneos. El endpoint aguanta 10 a la vez sin degradarse: 20
// detalles seguidos son 4s y en paralelo 0,9s.
const CONCURRENCIA_DETALLE = 10;

// Escrituras simultaneas contra Base44. De a una son ~130ms de espera cada vez.
// Cinco es el mismo tope que usa codigosMensuales.
const CONCURRENCIA = 5;

// Frase exacta que exige el borrado del catalogo. Se pide literal para que
// ninguna llamada mal armada —un body reusado, un reintento automatico— pueda
// vaciar Propiedad por accidente.
const FRASE_BORRADO = 'BORRAR TODO';

// Cuantas filas se piden por vuelta al borrar.
const LOTE_BORRADO = 200;

// Tope duro del listado: por encima de 100 devuelve 10 en silencio.
const TOPE_API = 100;

// Se corta por reloj y no por cantidad porque la latencia no es constante.
const PRESUPUESTO_MS = 11_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ── Normalizadores ───────────────────────────────────────────────────────────

const txt = (v: unknown) => String(v ?? '').trim();

/**
 * Numeros del LISTADO: coma de miles, punto decimal.
 *   "4,324,250,000" -> 4324250000     "17,297" -> 17297
 */
function numLista(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v).replace(/[̀-ͯ]/g, '');
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Dinero del DETALLE. Aqui los miles se separan con PUNTO —"1.500.000"— que es
 * justo lo contrario del listado.
 *
 * Se quitan todos los separadores en vez de intentar adivinar cual es decimal:
 * en pesos colombianos no hay centavos, asi que no hay nada que preservar, y
 * adivinar mal convierte un millon y medio en 1,5 sin fallar.
 *   "1.500.000" -> 1500000    "1,600,000,000" -> 1600000000    "$ 0" -> 0
 */
function numMoneda(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v).replace(/[^\d-]/g, '');
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Medidas del DETALLE: area y coordenadas, donde el punto SI es decimal.
 *   "217.57" -> 217.57     "-74.04719000000001" -> -74.047190…
 */
function numMedida(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** "0"/"1", "false"/"true", 0/1 y booleanos, todos a booleano. */
function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = txt(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'si' || s === 'sí';
}

const TIPOS_VALIDOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];

/** Tipo de inmueble de SIMI -> enum de Propiedad. */
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

// ── Portales ─────────────────────────────────────────────────────────────────

/**
 * Nombre de portal tal como lo manda SIMI -> clave de Propiedad.portales.
 *
 * Se quedan solo los que de verdad publican un link. Doomos, Olx, GoPlaceIt,
 * Proppit, Idonde, Lamudi, Properati y La Haus aparecen en la respuesta pero
 * llegan siempre con la url vacia: guardarlos seria guardar el nombre de un
 * portal sin nada a donde ir.
 *
 * Ciencuadras y Zona Habitat son los de mejor cobertura medida (43/45 y 35/41),
 * por encima de Fincaraiz (21/45), que es el que el CSV traia lleno.
 */
const PORTALES: Record<string, string> = {
  ciencuadras: 'ciencuadras',
  mercadolibre: 'mercadolibre',
  metrocuadrado: 'metrocuadrado',
  zonahabitat: 'zonahabitat',
  fincaraiz: 'fincaraiz',
};

/** "Metro Cuadrado" -> "metrocuadrado", "Fincaraíz" -> "fincaraiz". */
function clavePortal(nombre: unknown): string {
  return txt(nombre)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

function portalesDe(detalle: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  const data = detalle?.portales?.data;
  if (!Array.isArray(data)) return out;
  for (const p of data) {
    const clave = PORTALES[clavePortal(p?.nombrePortal)];
    if (!clave) continue;
    // Exigir http, no "no vacio": la url llega como "", " " o null segun el
    // portal, y las tres pasarian un chequeo de truthiness.
    const url = txt(p?.urlPortal);
    if (url.toLowerCase().startsWith('http')) out[clave] = url;
  }
  return out;
}

// ── Mapeo ────────────────────────────────────────────────────────────────────

/**
 * Un inmueble del LISTADO -> la forma que guarda Propiedad.
 *
 * Es el esqueleto: lo que alcanza para existir y ser buscable. La direccion,
 * las fotos y los links los pone el detalle justo despues.
 */
function desdeLista(inm: Record<string, unknown>) {
  const codigo = txt(inm.Codigo_Inmueble);
  if (!codigo) return null;

  const tipo = tipoInmueble(inm.Tipo_Inmueble);
  const barrio = txt(inm.Barrio);
  const ciudad = txt(inm.Ciudad) || 'Bogota';

  // AreaConstruida es 0 en lotes y fincas; ahi el area que importa es la del
  // lote. Tomar siempre la construida dejaria esos inmuebles sin area.
  const construida = numLista(inm.AreaConstruida);
  const lote = numLista(inm.AreaLote);

  return {
    codigo_externo: codigo,
    proveedor: 'simi',
    titulo: titulo(tipo, barrio, ciudad, codigo),
    tipo,
    operacion: operacion(inm.Gestion),
    estado: estado(inm.estadoInmueble),

    precio_venta: numLista(inm.Venta),
    canon_arriendo: numLista(inm.Canon),
    administracion: numLista(inm.Administracion),
    valor_administracion: numLista(inm.Administracion),

    habitaciones: numLista(inm.Alcobas),
    banos: numLista(inm.banios),
    parqueaderos: numLista(inm.garaje),
    estrato: numLista(inm.Estrato),
    area_m2: construida > 0 ? construida : lote,
    latitud: numLista(inm.latitud),
    longitud: numLista(inm.longitud),
    descripcion: txt(inm.descripcionlarga),

    barrio,
    ciudad,
    zona: txt(inm.Zona),
    asesor: txt(inm.NombreInmo),
    fecha_consignado: txt(inm.fingreso),
  };
}

/**
 * El DETALLE -> los campos que el listado no trae.
 *
 * Devuelve solo lo que SIMI manda de verdad. Un campo vacio no se incluye para
 * que el merge conserve lo que ya hubiera: si un dia el detalle deja de traer
 * direccion, es mejor quedarse con la vieja que borrarla.
 */
function desdeDetalle(d: Record<string, any>) {
  // Un codigo inexistente responde HTTP 200 con {status:1} y tres claves. Sin
  // idInm no hay inmueble, por mas que el HTTP diga 200.
  if (!d || !txt(d.idInm)) return null;

  const out: Record<string, unknown> = {};

  const dir = txt(d.Direccion);
  if (dir) out.direccion = dir;

  // Las fotos vienen con su orden en `posi`. Se respeta: la primera es la que
  // el agente manda como portada.
  const fotos = Array.isArray(d.fotos)
    ? d.fotos
      .filter((f: any) => txt(f?.foto).toLowerCase().startsWith('http'))
      .sort((a: any, b: any) => numMedida(a?.posi) - numMedida(b?.posi))
      .map((f: any) => txt(f.foto))
    : [];
  if (fotos.length) out.fotos = fotos;

  const portales = portalesDe(d);
  if (Object.keys(portales).length) out.portales = portales;

  // Caracteristicas: "tiene ascensor?", "tiene piscina?". Vienen en tres
  // grupos y con espacios de sobra en la descripcion.
  const caract = ['caracteristicasInternas', 'caracteristicasExternas', 'caracteristicasAlrededores']
    .flatMap((k) => (Array.isArray(d[k]) ? d[k] : []))
    .map((c: any) => txt(c?.Descripcion))
    .filter(Boolean);
  if (caract.length) out.caracteristicas = Array.from(new Set(caract));

  // El asesor del listado (NombreInmo) llega vacio; el del detalle no.
  const asesor = Array.isArray(d.asesor) ? d.asesor[0] : null;
  if (asesor) {
    const nombre = txt(asesor.ntercero);
    if (nombre) out.asesor = nombre;
    const cel = txt(asesor.celular);
    if (cel) out.asesor_celular = cel;
    const correo = txt(asesor.correo);
    if (correo) out.asesor_correo = correo;
  }

  const otros: Array<[string, string]> = [
    ['localidad', txt(d.nlocalidad)],
    ['descripcion', txt(d.descripcionlarga)],
    ['fecha_consignado', txt(d.FConsignacion)],
  ];
  for (const [k, v] of otros) if (v) out[k] = v;

  // La administracion del detalle usa punto de miles; la del listado, coma. El
  // detalle es el que manda porque es el que trae el valor completo.
  const admin = numMoneda(d.Administracion);
  if (admin > 0) {
    out.administracion = admin;
    out.valor_administracion = admin;
  }
  out.admon_incluida = bool(d.AdmonIncluida);
  out.amoblado = bool(d.amobladoInmueble);

  const avaluo = numMoneda(d?.othercaracteristicas?.AvaluoCatastral);
  if (avaluo > 0) out.avaluo_catastral = avaluo;

  const area = numMedida(d.AreaConstruida) || numMedida(d.AreaLote);
  if (area > 0) out.area_m2 = area;

  const lat = numMedida(d.latitud);
  const lon = numMedida(d.longitud);
  if (lat) out.latitud = lat;
  if (lon) out.longitud = lon;

  return out;
}

// ── API de SIMI ──────────────────────────────────────────────────────────────

/** Basic con usuario VACIO y el token como contrasena. Las otras cuatro formas devuelven 401. */
const cabeceras = () => ({
  Authorization: `Basic ${btoa(`:${SIMI_TOKEN}`)}`,
  Accept: 'application/json',
});

/**
 * `pagina` es el numero de pagina, no la fila. `tam` es el tamano de pagina.
 * Confundirlos es el error que dejaba el catalogo con huecos.
 */
function urlPagina(pagina: number, tam: number, recientes = false): string {
  const orden = recientes ? 'campo/fecha/order/desc' : 'campo/0/order/0';
  return `${SIMI_LISTADO}/limite/${pagina}/total/${tam}`
    + '/departamento/0/ciudad/0/zona/0/barrio/0/tipoInm/0/tipOper/0'
    + `/areamin/0/areamax/0/valmin/0/valmax/0/${orden}`
    + '/banios/0/alcobas/0/garajes/0/sede/0/usuario/0';
}

async function traerPagina(pagina: number, tam: number, recientes = false) {
  const r = await fetch(urlPagina(pagina, tam, recientes), { headers: cabeceras() });
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

  // Inmuebles llega unas veces como array y otras como objeto indexado por
  // string ({"0":{…},"1":{…}}). Object.values cubre los dos casos.
  const crudo = data?.Inmuebles;
  const inmuebles: Array<Record<string, unknown>> = Array.isArray(crudo)
    ? crudo
    : (crudo && typeof crudo === 'object' ? Object.values(crudo) : []);

  if (!inmuebles.length && !data?.datosGrales) {
    throw new Error(`Respuesta inesperada de SIMI: ${cuerpo.slice(0, 120)}`);
  }

  return {
    inmuebles,
    total: Number(data?.datosGrales?.totalInmuebles) || 0,
    // `fin` es el numero de paginas para el tamano pedido. Es lo que dice
    // cuando parar, y no hay que calcularlo a mano.
    paginas: Number(data?.datosGrales?.fin) || 0,
  };
}

/** Detalle de un inmueble. Devuelve null si el codigo no existe. */
async function traerDetalle(codigo: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${SIMI_DETALLE}/${encodeURIComponent(codigo)}`, { headers: cabeceras() });
  const cuerpo = await r.text();
  try {
    const d = JSON.parse(cuerpo);
    return txt(d?.idInm) ? d : null;
  } catch {
    return null;
  }
}

/** Corre las tareas de a `tope` a la vez, en orden de entrada. */
async function enTandas<T>(items: T[], tope: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += tope) {
    await Promise.all(items.slice(i, i + tope).map(fn));
  }
}

// ── Base44 ───────────────────────────────────────────────────────────────────

type Resultado = { creados: number; actualizados: number; omitidos: number; errores: string[] };

/**
 * Guarda un inmueble: busca por clave y actualiza, o crea.
 *
 * PUT reemplaza la fila entera, asi que se mezcla sobre lo existente. Sin eso
 * se borrarian link_web, link_instagram y todo lo que alguien haya editado
 * dentro de la app: el sync solo es autoridad de los campos que SIMI manda.
 *
 * link_web EN PARTICULAR lo pone scripts/asignar-fichas.mjs (npm run fichas), que
 * arma la URL de la ficha en nuestra web a partir del codigo de SIMI y la
 * COMPRUEBA antes de guardarla. Esta fusion es lo que hace que ese trabajo
 * sobreviva a los siguientes syncs, asi que no la conviertas en un PUT a secas.
 *
 * Los inmuebles que entren entre dos barridos no se quedan sin ficha: linkFicha
 * construye la misma URL al vuelo, solo que sin comprobar.
 */
async function guardar(
  p: Record<string, unknown>,
  hdrs: Record<string, string>,
  res: Resultado,
) {
  const codigo = String(p.codigo_externo);
  try {
    const q = `${BASE_URL}/api/entities/Propiedad`
      + `?codigo_externo=${encodeURIComponent(codigo)}&proveedor=simi&limit=1`;
    const rBusca = await fetch(q, { headers: hdrs });
    const existentes = rBusca.ok ? await rBusca.json() : [];
    const existente = Array.isArray(existentes) ? existentes[0] : null;

    if (existente?.id) {
      const r = await fetch(`${BASE_URL}/api/entities/Propiedad/${existente.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...existente, ...p }),
      });
      if (r.ok) res.actualizados++;
      else res.errores.push(`${codigo}: PUT ${r.status}`);
    } else {
      const r = await fetch(`${BASE_URL}/api/entities/Propiedad`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(p),
      });
      if (r.ok) res.creados++;
      else res.errores.push(`${codigo}: POST ${r.status} ${(await r.text()).slice(0, 100)}`);
    }
  } catch (err) {
    res.errores.push(`${codigo}: ${(err as Error).message}`);
  }
}

/**
 * Enumera una pagina, la hidrata con el detalle y la guarda.
 *
 * Los tres pasos van juntos a proposito. Separarlos obligaria a llevar una cola
 * de "esto ya se enumero pero falta hidratarlo", y un inmueble que se quedara a
 * medias no se veria: existiria en el catalogo, sin direccion y sin link, y el
 * agente lo ofreceria igual.
 */
async function procesarPagina(
  inmuebles: Array<Record<string, unknown>>,
  hdrs: Record<string, string>,
  res: Resultado,
  detalles: { ok: number; fallidos: number },
) {
  const base: Array<Record<string, unknown>> = [];
  for (const inm of inmuebles) {
    const p = desdeLista(inm);
    if (!p) res.omitidos++;
    else base.push(p);
  }

  await enTandas(base, CONCURRENCIA_DETALLE, async (p) => {
    try {
      const d = await traerDetalle(String(p.codigo_externo));
      const extra = d ? desdeDetalle(d) : null;
      if (extra) { Object.assign(p, extra); detalles.ok++; }
      else detalles.fallidos++;
    } catch {
      // Un detalle que falla no tumba el inmueble: se guarda el esqueleto y la
      // proxima corrida lo completa. Perder la pagina entera seria peor.
      detalles.fallidos++;
    }
  });

  await enTandas(base, CONCURRENCIA, (p) => guardar(p, hdrs, res));
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (!BASE_URL) return json({ error: 'BASE44_APP_URL no configurada' }, 500);
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

  // Dos llamadores con dos credenciales: la pantalla manda FUNCTIONS_TOKEN, y
  // el scheduler de Base44 manda CRON_TOKEN. Base44 entrega los argumentos del
  // scheduler dentro de `args` en algunas ejecuciones, asi que se mira ahi
  // tambien; es el mismo patron que usan enviarPendientes y los demas crons.
  const dado = txt(body?.token || body?.args?.token);
  const valido = (TOKEN && dado === TOKEN) || (CRON_TOKEN && dado === CRON_TOKEN);
  if (!TOKEN && !CRON_TOKEN) {
    return json({
      error: 'Falta FUNCTIONS_TOKEN o CRON_TOKEN en Base44 (Configuracion > Secretos).',
    }, 500);
  }
  if (!valido) return json({ error: 'No autorizado' }, 401);

  // El scheduler manda `incremental` dentro de args, igual que el token.
  if (body?.args?.incremental === true) body.incremental = true;

  if (!SIMI_TOKEN) {
    return json({
      error: 'Falta SIMI_API_TOKEN en Base44 (Configuracion > Secretos). '
        + 'Es la credencial que entrega SIMI para su API.',
    }, 500);
  }

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return json({ error: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };

  // ── Sonda: comprueba credencial y devuelve el total, sin escribir nada ─────
  if (body?.sonda === true) {
    const t0 = Date.now();
    try {
      const { inmuebles, total, paginas } = await traerPagina(1, 1);
      const codigo = txt(inmuebles[0]?.Codigo_Inmueble);
      const d = codigo ? await traerDetalle(codigo) : null;
      const extra = d ? desdeDetalle(d) : null;
      return json({
        ok: true,
        total_en_simi: total,
        paginas_de_1: paginas,
        // Se prueba tambien el detalle porque es el que decide si el agente
        // puede mandar direccion y link. Que el listado responda no basta.
        detalle_ok: !!extra,
        ejemplo: inmuebles[0]
          ? { ...desdeLista(inmuebles[0]), ...(extra || {}) }
          : null,
        ms: Date.now() - t0,
      });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  // ── Diagnostico del esquema ───────────────────────────────────────────────
  //
  // Base44 acepta el POST y descarta en silencio lo que no esta declarado. Un
  // campo que falte no da error: el dato simplemente no se guarda, y se nota
  // semanas despues cuando alguien ve la columna vacia.
  //
  // La comprobacion es escribir una fila de mentira, releerla y borrarla. NO
  // vale mirar una fila existente: Base44 guarda documentos, asi que una fila
  // vieja no tiene los campos nuevos aunque el esquema si los declare. Esa
  // lectura da un falso negativo y hace pedir campos que ya estaban.
  //
  // Los portales van aparte porque son un objeto anidado: el esquema puede
  // aceptar `portales` y aun asi tirar las claves que no conoce.
  if (body?.diagnostico === true) {
    const t0 = Date.now();

    // Valor de sonda por campo, con su forma de comprobar. Se usa un valor
    // distinto de vacio en cada uno para que un default del esquema no se
    // confunda con el dato que se escribio.
    const SONDA: Record<string, { valor: unknown; ok: (v: unknown) => boolean }> = {
      direccion: { valor: '__sonda__', ok: (v) => v === '__sonda__' },
      fotos: { valor: ['https://ejemplo/1.jpg'], ok: (v) => Array.isArray(v) && v.length === 1 },
      caracteristicas: { valor: ['__sonda__'], ok: (v) => Array.isArray(v) && v.length === 1 },
      asesor_celular: { valor: '3000000000', ok: (v) => v === '3000000000' },
      asesor_correo: { valor: 'sonda@ejemplo.com', ok: (v) => v === 'sonda@ejemplo.com' },
      localidad: { valor: '__sonda__', ok: (v) => v === '__sonda__' },
      admon_incluida: { valor: true, ok: (v) => v === true },
      amoblado: { valor: true, ok: (v) => v === true },
      avaluo_catastral: { valor: 123456789, ok: (v) => Number(v) === 123456789 },
    };
    const PORTALES_SONDA: Record<string, string> = {
      metrocuadrado: 'https://ejemplo/mc',
      fincaraiz: 'https://ejemplo/fr',
      mercadolibre: 'https://ejemplo/ml',
      ciencuadras: 'https://ejemplo/cc',
      zonahabitat: 'https://ejemplo/zh',
    };

    const fila: Record<string, unknown> = {
      // titulo y ciudad son obligatorios en Propiedad.
      titulo: '__SONDA__ borrar si aparece',
      ciudad: '__sonda__',
      proveedor: 'manual',
      codigo_externo: '__SONDA__',
      portales: PORTALES_SONDA,
    };
    for (const [k, v] of Object.entries(SONDA)) fila[k] = v.valor;

    let creada: any = null;
    try {
      const rPost = await fetch(`${BASE_URL}/api/entities/Propiedad`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(fila),
      });
      if (!rPost.ok) {
        return json({
          error: `No se pudo escribir la sonda: HTTP ${rPost.status} ${(await rPost.text()).slice(0, 200)}`,
        }, 502);
      }
      creada = await rPost.json();

      const faltan = Object.entries(SONDA)
        .filter(([k, v]) => !v.ok(creada?.[k]))
        .map(([k]) => k);
      const portalesGuardados = (creada?.portales || {}) as Record<string, unknown>;
      const faltanPortales = Object.keys(PORTALES_SONDA)
        .filter((k) => portalesGuardados[k] !== PORTALES_SONDA[k]);

      const listo = !faltan.length && !faltanPortales.length;
      return json({
        listo,
        faltan,
        faltan_portales: faltanPortales,
        mensaje: listo
          ? 'Propiedad tiene todos los campos. La sincronizacion los va a guardar.'
          : 'Base44 descarto estos campos porque no existen en Propiedad. '
            + 'Creelos en Datos > Propiedad; los de portales van DENTRO del objeto portales, como texto.',
        ms: Date.now() - t0,
      });
    } catch (e) {
      return json({ error: `No se pudo revisar Propiedad: ${(e as Error).message}` }, 502);
    } finally {
      // Se borra siempre, aunque la comprobacion haya fallado: dejar la sonda
      // suelta en el catalogo seria peor que no haberla escrito, porque el
      // agente puede ofrecerla.
      if (creada?.id) {
        await fetch(`${BASE_URL}/api/entities/Propiedad/${creada.id}`, { method: 'DELETE', headers: hdrs })
          .catch((e: Error) => console.error('no se pudo borrar la sonda:', e.message));
      }
    }
  }

  // ── Borrado del catalogo ──────────────────────────────────────────────────
  //
  // Vaciar Propiedad para reconstruirla desde cero.
  //
  // DOS SEGUROS, porque esto no se puede deshacer:
  //   1. Hay que mandar la frase exacta. `borrar: true` por si solo no hace nada.
  //   2. Se puede acotar por proveedor, para no arrastrar lo cargado a mano.
  //
  // No filtra por estado ni por fecha a proposito: un borrado parcial que se
  // cree total es peor que no borrar, porque deja el catalogo en un estado que
  // nadie puede describir.
  if (body?.borrar === true) {
    if (txt(body?.confirmar) !== FRASE_BORRADO) {
      return json({
        error: `Para borrar hay que mandar confirmar: "${FRASE_BORRADO}". `
          + 'Sin eso no se toca nada.',
      }, 400);
    }

    const t0 = Date.now();
    const res = { borrados: 0, errores: [] as string[] };
    const prov = txt(body?.proveedor);
    const filtro = prov ? `proveedor=${encodeURIComponent(prov)}&` : '';
    const url = `${BASE_URL}/api/entities/Propiedad?${filtro}limit=${LOTE_BORRADO}`;

    while (Date.now() - t0 < PRESUPUESTO_MS) {
      const rL = await fetch(url, { headers: hdrs });
      if (!rL.ok) { res.errores.push(`listar: HTTP ${rL.status}`); break; }
      const filas = await rL.json();
      if (!Array.isArray(filas) || !filas.length) break;

      const antes = res.errores.length;
      for (let i = 0; i < filas.length && Date.now() - t0 < PRESUPUESTO_MS; i += CONCURRENCIA) {
        await Promise.all(filas.slice(i, i + CONCURRENCIA).map(async (f: any) => {
          if (!f?.id) return;
          try {
            const d = await fetch(`${BASE_URL}/api/entities/Propiedad/${f.id}`, {
              method: 'DELETE', headers: hdrs,
            });
            if (d.ok) res.borrados++;
            else res.errores.push(`${f.id}: DELETE ${d.status}`);
          } catch (err) {
            res.errores.push(`${f.id}: ${(err as Error).message}`);
          }
        }));
      }

      // Si NINGUNA de las filas de esta vuelta se pudo borrar, la siguiente
      // pediria exactamente las mismas y giraria en falso hasta agotar el
      // presupuesto. Se corta y se devuelve el error para que se vea.
      if (res.errores.length - antes >= filas.length) break;
    }

    // Se pregunta por lo que queda en vez de deducirlo: si algun DELETE fallo
    // en silencio, dar por terminado el borrado dejaria el catalogo a medias y
    // la pantalla diria que acabo.
    let quedan: number | null = null;
    try {
      const rQ = await fetch(url, { headers: hdrs });
      const resto = rQ.ok ? await rQ.json() : [];
      quedan = Array.isArray(resto) ? resto.length : null;
    } catch { /* si no se puede contar se devuelve null y la pantalla reintenta */ }

    return json({
      ...res,
      proveedor: prov || 'todos',
      quedan,
      completado: quedan === 0,
      ms: Date.now() - t0,
      errores: res.errores.slice(0, 20),
    });
  }

  // ── Incremental: solo lo que cambio desde la ultima corrida ───────────────
  //
  // Es el modo que usa la tarea programada, y el que hace que esto sea barato.
  // La API ordena por fecha descendente, asi que los que se movieron hoy vienen
  // primero: se avanza mientras haya cambios y se para al llegar a lo ya
  // conocido. Una corrida diaria toca ~20 inmuebles en vez de 2720.
  if (body?.incremental === true) {
    const t0 = Date.now();
    const res: Resultado = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };
    const detalles = { ok: 0, fallidos: 0 };

    // Marca de agua: la fecha de modificacion mas nueva que ya se proceso.
    const rCfg = await fetch(`${BASE_URL}/api/entities/SimiConfig?clave=general&limit=1`, { headers: hdrs });
    const cfgs = rCfg.ok ? await rCfg.json() : [];
    const cfg = Array.isArray(cfgs) ? cfgs[0] : null;
    const marca = txt(cfg?.ultima_sync);

    let masNueva = marca;
    let alcanzado = false;
    let paginasVistas = 0;

    for (let pag = 1; !alcanzado && Date.now() - t0 < PRESUPUESTO_MS; pag++) {
      let pagina;
      try {
        pagina = await traerPagina(pag, POR_PAGINA, true);
      } catch (e) {
        return json({ error: (e as Error).message, ...res }, 502);
      }
      if (!pagina.inmuebles.length) break;
      paginasVistas++;

      // Se separa mirar de escribir: primero se decide que entra —parando en la
      // marca— y despues se hidrata y se guarda todo junto.
      const nuevos: Array<Record<string, unknown>> = [];
      for (const inm of pagina.inmuebles) {
        const mod = txt(inm.fecha_modificacion);
        // Al llegar a algo igual o mas viejo que la marca, lo que sigue tambien
        // lo es: viene ordenado. Se para.
        if (marca && mod && mod <= marca) { alcanzado = true; break; }
        if (mod > masNueva) masNueva = mod;
        nuevos.push(inm);
      }
      await procesarPagina(nuevos, hdrs, res, detalles);

      // Sin marca previa no hay donde parar y se recorreria el catalogo entero
      // creyendo que es un incremental. Se hace una pagina y se deja la marca
      // puesta; la carga completa es otro modo.
      if (!marca) break;
    }

    // La marca solo avanza si no hubo errores: si algo fallo, la proxima
    // corrida tiene que volver a intentarlo. Avanzarla igual dejaria ese
    // inmueble sin actualizar para siempre, y nadie lo notaria.
    const avanzar = masNueva && masNueva !== marca && !res.errores.length;
    if (avanzar) {
      if (cfg?.id) {
        await fetch(`${BASE_URL}/api/entities/SimiConfig/${cfg.id}`, {
          method: 'PUT', headers: hdrs, body: JSON.stringify({ ...cfg, ultima_sync: masNueva }),
        });
      } else {
        await fetch(`${BASE_URL}/api/entities/SimiConfig`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ clave: 'general', ultima_sync: masNueva, activo: true }),
        });
      }
    }

    return json({
      ...res,
      modo: 'incremental',
      paginas: paginasVistas,
      detalles_ok: detalles.ok,
      detalles_fallidos: detalles.fallidos,
      marca_anterior: marca || null,
      marca_nueva: avanzar ? masNueva : marca || null,
      primera_vez: !marca,
      ms: Date.now() - t0,
      errores: res.errores.slice(0, 20),
    });
  }

  // ── Sincronizacion completa, pagina por pagina ────────────────────────────
  //
  // `pagina` es el numero de pagina de SIMI. No es una fila ni un desplazamiento.
  const pagina = Math.max(1, Number(body?.pagina) || 1);
  // Se acepta ajustar el tamano, pero nunca por encima del tope real de la API:
  // pedir 500 devolveria 10 y se darian por vistos 500.
  const tam = Math.min(Math.max(1, Number(body?.por_pagina) || POR_PAGINA), TOPE_API);

  const t0 = Date.now();
  const res: Resultado = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };
  const detalles = { ok: 0, fallidos: 0 };

  let datos;
  try {
    datos = await traerPagina(pagina, tam);
  } catch (e) {
    return json({ error: (e as Error).message, pagina }, 502);
  }

  const recibidos = datos.inmuebles.length;
  await procesarPagina(datos.inmuebles, hdrs, res, detalles);

  // Se para por lo que dice la API —`fin` es el numero de paginas— y ademas por
  // pagina vacia. Calcular el tope a mano con totalInmuebles/tam se desalinea
  // en cuanto entra un inmueble nuevo a mitad de la corrida.
  const hayMas = recibidos > 0 && (datos.paginas ? pagina < datos.paginas : recibidos === tam);

  return json({
    ...res,
    pagina,
    por_pagina: tam,
    recibidos,
    detalles_ok: detalles.ok,
    detalles_fallidos: detalles.fallidos,
    total_en_simi: datos.total,
    total_paginas: datos.paginas,
    siguiente: hayMas ? pagina + 1 : null,
    completado: !hayMas,
    ms: Date.now() - t0,
    errores: res.errores.slice(0, 20),
  });
});
