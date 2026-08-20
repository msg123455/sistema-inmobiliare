// ─────────────────────────────────────────────────────────────────────────────
// sincronizarSimi — trae el inventario desde la API de SIMI
//
// Es la UNICA entrada del inventario. La importacion por CSV se elimino: podia
// contradecir a la API, porque su barrido daba de baja todo lo que no viniera
// en el archivo, y un export viejo o cortado dejaba fuera inmuebles vigentes.
// Un respaldo capaz de corromper el catalogo es peor que no tener respaldo.
//
// MODOS:
//   sonda        comprueba la credencial y devuelve el total. No escribe nada.
//   completa     recorre el catalogo entero por paginas. Para la carga inicial.
//   incremental  pide ordenado por fecha descendente y para al llegar a lo ya
//                conocido. Es el de la tarea programada: una corrida diaria
//                toca ~30 inmuebles en vez de 2720.
//   borrar       vacia Propiedad para reconstruirla. Exige la frase literal
//                'BORRAR TODO'; no se puede deshacer.
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
// La tarea programada usa su propio token, igual que los demas crons del repo.
const CRON_TOKEN = Deno.env.get('CRON_TOKEN') || '';

// Credencial de SIMI. Sin valor por defecto: uno quemado en un repo publico no
// protege nada y ademas disimula que falta configurarlo.
const SIMI_TOKEN = Deno.env.get('SIMI_API_TOKEN') || '';
const SIMI_BASE = Deno.env.get('SIMI_API_URL')
  || 'http://simi-api.com/ApiSimiweb/response/v2.1.1/filtroInmueble';

// Pagina por defecto.
//
// Se queda en 30, y no se sube, porque el cuello de botella es SIMI y no
// nosotros: traer 30 tarda 9,3s medidos, de los 15 que da Base44. Con 40 serian
// ~11,1s y quedaria menos de 2s de margen; si se pasa, la llamada muere sin
// devolver nada y el cursor no avanza, que es peor que ir mas lento.
//
// La ganancia real no estaba en pedir mas sino en escribir mejor: antes de
// esas 30 solo se guardaban 13 y las otras 17 se tiraban. Ver CONCURRENCIA.
const POR_PAGINA = 30;

// Escrituras simultaneas contra Base44.
//
// Este es el arreglo que importa. Las escrituras iban de a una, esperando cada
// respuesta: dos llamadas por inmueble a ~130ms son 0,26s, que con 30 inmuebles
// son casi 8 segundos. Como traerlos ya se habia comido 9,3s de un presupuesto
// de 11, solo alcanzaban a guardarse 13 y las 17 restantes se descartaban para
// volver a pedirlas en la siguiente llamada: el 57% del trabajo se repetia.
//
// En tandas de cinco esas mismas 30 se guardan en ~1,6s y la pagina entera cabe.
// Cinco es el mismo tope que usa codigosMensuales; subirlo no acelera —el freno
// pasa a ser SIMI— y empieza a arriesgar limites del otro lado.
const CONCURRENCIA = 5;

// Frase exacta que exige el borrado del catalogo. Se pide literal para que
// ninguna llamada mal armada —un body reusado, un reintento automatico— pueda
// vaciar Propiedad por accidente.
const FRASE_BORRADO = 'BORRAR TODO';

// Cuantas filas se piden por vuelta al borrar. Con CONCURRENCIA=5 y ~130ms por
// DELETE, en el presupuesto caben unas 400: pedir de a 200 evita traer una
// lista enorme que no se va a alcanzar a usar.
const LOTE_BORRADO = 200;

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

/**
 * Los filtros van en la ruta, no en query string. 0 significa "sin filtro".
 *
 * `recientes` ordena por fecha descendente, que es lo que hace viable el modo
 * incremental: los que se movieron hoy vienen primero, asi que se puede parar
 * apenas se llega a lo ya conocido en vez de recorrer los 2712.
 */
function urlPagina(desde: number, cuantos: number, recientes = false): string {
  const orden = recientes ? 'campo/fecha/order/desc' : 'campo/0/order/0';
  return `${SIMI_BASE}/limite/${desde}/total/${cuantos}`
    + '/departamento/0/ciudad/0/zona/0/barrio/0/tipoInm/0/tipOper/0'
    + `/areamin/0/areamax/0/valmin/0/valmax/0/${orden}`
    + '/banios/0/alcobas/0/garajes/0/sede/0/usuario/0';
}

async function traerPagina(desde: number, cuantos: number, recientes = false) {
  // Basic con usuario VACIO y el token como contrasena. Comprobado contra la
  // API: las otras cuatro formas devuelven 401 en el cuerpo con HTTP 200.
  const auth = btoa(`:${SIMI_TOKEN}`);
  const r = await fetch(urlPagina(desde, cuantos, recientes), {
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

// ── Escritura ────────────────────────────────────────────────────────────────

type Resultado = { creados: number; actualizados: number; omitidos: number; errores: string[] };

/**
 * Guarda un inmueble: busca por clave y actualiza, o crea.
 *
 * PUT reemplaza la fila entera, asi que se mezcla sobre lo existente. Sin eso se
 * borrarian los links de portales y todo lo que alguien haya editado dentro de
 * la app: el sync solo es autoridad de los campos que SIMI manda.
 */
async function guardar(
  p: Record<string, unknown>,
  baseUrl: string,
  hdrs: Record<string, string>,
  res: Resultado,
) {
  const codigo = String(p.codigo_externo);
  try {
    const q = `${baseUrl}/api/entities/Propiedad`
      + `?codigo_externo=${encodeURIComponent(codigo)}&proveedor=simi&limit=1`;
    const rBusca = await fetch(q, { headers: hdrs });
    const existentes = rBusca.ok ? await rBusca.json() : [];
    const existente = Array.isArray(existentes) ? existentes[0] : null;

    if (existente?.id) {
      const r = await fetch(`${baseUrl}/api/entities/Propiedad/${existente.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ ...existente, ...p }),
      });
      if (r.ok) res.actualizados++;
      else res.errores.push(`${codigo}: PUT ${r.status}`);
    } else {
      const r = await fetch(`${baseUrl}/api/entities/Propiedad`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(p),
      });
      if (r.ok) res.creados++;
      else res.errores.push(`${codigo}: POST ${r.status} ${(await r.text()).slice(0, 100)}`);
    }
  } catch (err) {
    res.errores.push(`${codigo}: ${(err as Error).message}`);
  }
}

/** Guarda en tandas simultaneas. Una por una son 130ms de espera cada vez. */
async function guardarTodos(
  items: Array<Record<string, unknown>>,
  baseUrl: string,
  hdrs: Record<string, string>,
  res: Resultado,
) {
  for (let i = 0; i < items.length; i += CONCURRENCIA) {
    await Promise.all(
      items.slice(i, i + CONCURRENCIA).map((p) => guardar(p, baseUrl, hdrs, res)),
    );
  }
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

  // ── Borrado del catalogo ───────────────────────────────────────────────────
  //
  // Vaciar Propiedad para reconstruirla desde cero. Existe porque SIMI es la
  // unica fuente: si el catalogo queda inconsistente, rehacerlo puede salir mas
  // barato que reconciliarlo.
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
    // Acota el borrado a un proveedor si se pide. Sin esto se lleva por delante
    // lo que alguien haya cargado a mano desde la pantalla de Propiedades.
    const prov = txt(body?.proveedor);
    const filtro = prov ? `proveedor=${encodeURIComponent(prov)}&` : '';

    while (Date.now() - t0 < PRESUPUESTO_MS) {
      const rL = await fetch(
        `${BASE_URL}/api/entities/Propiedad?${filtro}limit=${LOTE_BORRADO}`,
        { headers: hdrs },
      );
      if (!rL.ok) {
        res.errores.push(`listar: HTTP ${rL.status}`);
        break;
      }
      const filas = await rL.json();
      if (!Array.isArray(filas) || !filas.length) break;

      const antes = res.errores.length;

      // En tandas, igual que las escrituras: de a una son 130ms de espera cada
      // vez y no alcanzarian ni 90 filas por llamada.
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

    // Se pregunta por lo que queda en vez de deducirlo: si algun DELETE fallo en
    // silencio, deducir "ya no queda nada" dejaria el catalogo a medio borrar y
    // la pantalla diria que termino.
    let quedan: number | null = null;
    try {
      const rQ = await fetch(
        `${BASE_URL}/api/entities/Propiedad?${filtro}limit=${LOTE_BORRADO}`,
        { headers: hdrs },
      );
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

  // ── Incremental: solo lo que cambio desde la ultima corrida ────────────────
  //
  // Es el modo que usa la tarea programada, y el que hace que esto sea barato.
  // La API ordena por fecha descendente, asi que los que se movieron hoy vienen
  // primero: se avanza mientras haya cambios y se para al llegar a lo ya
  // conocido. Una corrida diaria toca ~30 inmuebles en vez de 2712.
  //
  // Requiere `campo/fecha/order/desc`, que es lo unico que hace posible parar
  // temprano: sin orden habria que mirarlos todos para saber cuales cambiaron.
  if (body?.incremental === true) {
    const t0 = Date.now();
    const res = { creados: 0, actualizados: 0, omitidos: 0, errores: [] as string[] };

    // Marca de agua: la fecha de modificacion mas nueva que ya se proceso.
    const rCfg = await fetch(`${BASE_URL}/api/entities/SimiConfig?clave=general&limit=1`, { headers: hdrs });
    const cfgs = rCfg.ok ? await rCfg.json() : [];
    const cfg = Array.isArray(cfgs) ? cfgs[0] : null;
    const marca = txt(cfg?.ultima_sync);

    let pag = 1;
    let masNueva = marca;
    let alcanzado = false;
    // Tope de paginas por corrida: si nadie sincroniza en semanas no se puede
    // recuperar todo en una sola llamada de 15s. Lo que falte entra en la
    // siguiente, porque la marca solo avanza al terminar.
    const MAX_PAGINAS = 4;

    for (let i = 0; i < MAX_PAGINAS && !alcanzado; i++) {
      if (Date.now() - t0 > PRESUPUESTO_MS) break;

      let pagina;
      try {
        pagina = await traerPagina(pag, POR_PAGINA, true);
      } catch (e) {
        return json({ error: (e as Error).message, ...res }, 502);
      }
      if (!pagina.inmuebles.length) break;

      // Se separa mirar de escribir, igual que en la completa: primero se decide
      // que entra —parando en la marca— y luego se escribe todo junto.
      const listos: Array<Record<string, unknown>> = [];
      for (const inm of pagina.inmuebles) {
        const mod = txt(inm.fecha_modificacion);
        // Al llegar a algo igual o mas viejo que la marca, lo que sigue tambien
        // lo es: viene ordenado. Se para.
        if (marca && mod && mod <= marca) { alcanzado = true; break; }
        if (mod > masNueva) masNueva = mod;

        const p = desdeApi(inm);
        if (!p) res.omitidos++;
        else listos.push(p);
      }
      await guardarTodos(listos, BASE_URL, hdrs, res);
      pag += pagina.inmuebles.length;
    }

    // La marca solo avanza si no hubo errores: si algo fallo, la proxima corrida
    // tiene que volver a intentarlo. Avanzarla igual dejaria ese inmueble sin
    // actualizar para siempre, y nadie lo notaria.
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
      marca_anterior: marca || null,
      marca_nueva: avanzar ? masNueva : marca || null,
      // Primera corrida: sin marca no hay donde parar, asi que solo se traen las
      // paginas del tope. Conviene una sincronizacion completa antes.
      primera_vez: !marca,
      ms: Date.now() - t0,
      errores: res.errores.slice(0, 20),
    });
  }

  // ── Sincronizacion completa, por paginas ───────────────────────────────────
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

  // Se mapea toda la pagina primero y se escribe en tandas simultaneas, en vez
  // de ir inmueble por inmueble esperando cada respuesta. Ya no hay corte por
  // reloj aqui: la pagina esta dimensionada para caber entera, y cortarla a la
  // mitad era justamente lo que hacia que se repitiera el trabajo.
  const listos: Array<Record<string, unknown>> = [];
  for (const inm of inmuebles) {
    const p = desdeApi(inm);
    if (!p) res.omitidos++;
    else listos.push(p);
  }
  await guardarTodos(listos, BASE_URL, hdrs, res);

  const procesados = res.creados + res.actualizados + res.omitidos;
  // Se avanza por lo PROCESADO y no por lo pedido: si se pidieron 30 y la API
  // mando 10, avanzar 30 se saltaria veinte inmuebles sin que nada falle.
  //
  // Los que dieron error no cuentan como procesados, asi que el cursor se queda
  // corto y la siguiente pagina se solapa con el final de esta. Es a proposito:
  // reescribir un inmueble que ya estaba no hace danio —se busca y se mezcla—
  // mientras que darlo por bueno lo dejaria fuera del catalogo para siempre.
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
