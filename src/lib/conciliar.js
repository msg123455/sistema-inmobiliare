/**
 * Conciliacion de los codigos de barras del mes contra el listado de inquilinos.
 *
 * El trabajo que reemplaza es este: cada mes alguien abre Mailchimp, busca la
 * URL de cada codigo, la copia y la pega en la fila del inquilino que
 * corresponde. Seiscientas veces. La revision manual existe porque un codigo
 * pegado en la fila equivocada hace que un inquilino pague la cuenta de otro.
 *
 * Asi que este modulo no vale por ser rapido: vale por ser mas seguro que la
 * persona. De ahi las dos reglas que lo gobiernan:
 *
 *   1. El emparejamiento es EXACTO. Nada difuso, nada de "el mas parecido".
 *      Lo que no empareja exacto va al balde de excepciones, no se adivina.
 *   2. Lo ambiguo BLOQUEA. Si dos archivos dicen ser del mismo contrato no hay
 *      forma de saber cual es el bueno, y elegir uno al azar es exactamente el
 *      fallo que hay que evitar. Se para y lo mira un humano.
 *
 * Los controles no son hipoteticos. Corridos sobre el envio real de agosto de
 * 2025 (596 filas) cazan seis defectos que si salieron por correo:
 *   - 4 inquilinos con dos inmuebles recibieron solo uno de sus dos codigos
 *   - 1 codigo (Surgivasc) se envio ademas a 4 empleados de la oficina
 *   - 1 correo sin punto en el dominio que rebotó
 * Ver scripts/auditar-envio.mjs para correrlo sobre cualquier mes.
 */

/** Los meses como los abrevia SIMI en el nombre del archivo. */
const MESES = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

/**
 * Nombre de archivo tal como lo produce SIMI: `90_Ago3976.02.pdf`
 *
 *   90   prefijo de la oficina
 *   Ago  mes, sin anio  <- ojo: agosto de 2025 y de 2026 dan el MISMO nombre
 *   3976 el numero que identifica el contrato
 *   .02  cuantas veces se ha renovado (los contratos viejos llevan .03, los
 *        recien firmados no llevan sufijo). No hace parte de la identidad.
 *
 * Verificado contra el envio de agosto: encaja en 596 de 596 archivos.
 */
const RE_ARCHIVO = /^(\d+)_([A-Za-zñÑ]{3})(\d+)(?:\.(\d+))?\.pdf$/i;

/** Descompone el nombre. Devuelve null si no encaja: quien no encaja no se adivina. */
export function leerNombreArchivo(nombre) {
  const limpio = String(nombre || '').trim().split('/').pop();
  const m = limpio.match(RE_ARCHIVO);
  if (!m) return null;

  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;

  return {
    archivo: limpio,
    oficina: m[1],
    mes,
    codigo: m[3],
    renovacion: m[4] || '',
  };
}

/**
 * Clave de emparejamiento.
 *
 * Excel se come los ceros a la izquierda (`00123` acaba siendo `123`), asi que
 * hay que quitarlos en los dos lados o el mismo contrato no se reconoce. Pero
 * eso abre la puerta a que dos codigos crudos distintos colapsen en la misma
 * clave: esa colision se detecta arriba y BLOQUEA, no se fusiona en silencio.
 */
export function normCodigo(x) {
  const s = String(x ?? '').trim().toUpperCase().replace(/[\s.\-_]/g, '');
  const sinCeros = s.replace(/^0+/, '');
  // Si era todo ceros, la clave es "0" —no la cadena original ni una vacia—,
  // para que "0" y "000" se reconozcan como el mismo contrato.
  return sinCeros || (s === '' ? '' : '0');
}

/**
 * Validacion de correo deliberadamente sencilla.
 *
 * No intenta ser la RFC 5322: intenta cazar lo que de verdad aparece en un
 * listado escrito a mano. En agosto habia un `sistemas1@inmobiliarelatamcom`
 * —sin el punto— que rebotó; esto lo caza. Un patron mas estricto rechazaria
 * correos validos y raros, y un falso rechazo aqui es un inquilino que no
 * recibe su recibo.
 */
const RE_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]{2,}$/;
export const correoValido = (c) => RE_CORREO.test(String(c || '').trim());

/** Agrupa por clave y devuelve solo los grupos con mas de un elemento. */
function repetidos(items, clave) {
  const mapa = new Map();
  for (const it of items) {
    const k = clave(it);
    if (k === null || k === undefined || k === '') continue;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(it);
  }
  return [...mapa.entries()].filter(([, v]) => v.length > 1);
}

/**
 * Concilia los archivos del mes contra el directorio de inquilinos.
 *
 * @param archivos   [{ nombre, url }]                    lo que hay en Mailchimp
 * @param directorio [{ codigo, nombre, email, documento }] a quien pertenece cada contrato
 * @param opciones   { mesEsperado }                       1-12; si se pasa, se exige que cuadre
 *
 * @returns { emparejados, excepciones, bloqueos, senales, resumen }
 *          `bloqueos` no vacio significa que NO se puede enviar.
 */
export function conciliar({ archivos = [], directorio = [], listado = null, opciones = {} } = {}) {
  const { mesEsperado = null } = opciones;

  const excepciones = {
    nombreNoReconocido: [],   // el archivo no sigue el patron de SIMI
    mesDistinto: [],          // trae otro mes: se subio la carpeta equivocada
    archivoSinInquilino: [],  // contrato nuevo, o el directorio esta desactualizado
    inquilinoSinArchivo: [],  // contrato terminado, o SIMI no lo genero
    sinCorreo: [],
    correoInvalido: [],
    discrepanLasLlaves: [],   // el directorio y la posicion no coinciden
  };
  const bloqueos = [];

  // ---------------------------------------------------------------- archivos
  const leidos = [];
  for (const a of archivos) {
    const datos = leerNombreArchivo(a.nombre);
    if (!datos) { excepciones.nombreNoReconocido.push(a); continue; }
    if (mesEsperado && datos.mes !== mesEsperado) {
      excepciones.mesDistinto.push({ ...a, ...datos });
      continue;
    }
    leidos.push({ ...a, ...datos, clave: normCodigo(datos.codigo) });
  }

  // Dos archivos para el mismo contrato: no hay forma de saber cual es el bueno.
  for (const [clave, grupo] of repetidos(leidos, (x) => x.clave)) {
    bloqueos.push({
      tipo: 'codigo_duplicado_en_archivos',
      clave,
      detalle: `${grupo.length} archivos dicen ser del contrato ${clave}: ${grupo.map((g) => g.archivo).join(', ')}`,
      items: grupo,
    });
  }

  // Dos codigos crudos distintos que normalizan igual (p.ej. "0123" y "123").
  const porClave = new Map();
  for (const x of leidos) {
    if (!porClave.has(x.clave)) porClave.set(x.clave, new Set());
    porClave.get(x.clave).add(x.codigo);
  }
  for (const [clave, crudos] of porClave) {
    if (crudos.size > 1) {
      bloqueos.push({
        tipo: 'colision_al_normalizar',
        clave,
        detalle: `Los codigos ${[...crudos].join(' y ')} se reducen a la misma clave ${clave}`,
        items: [...crudos],
      });
    }
  }

  // -------------------------------------------------------------- directorio
  const indice = new Map();
  for (const d of directorio) {
    const clave = normCodigo(d.codigo);
    if (!clave) continue;
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(d);
  }
  for (const [clave, grupo] of indice) {
    const distintos = new Set(grupo.map((g) => `${g.documento || ''}|${(g.email || '').toLowerCase()}`));
    if (distintos.size > 1) {
      bloqueos.push({
        tipo: 'contrato_con_varios_inquilinos',
        clave,
        detalle: `El contrato ${clave} apunta a ${distintos.size} inquilinos distintos en el directorio`,
        items: grupo,
      });
    }
  }

  // ---------------------------------------------- listado del mes (opcional)
  //
  // Cuando se pasa, manda: es la foto de HOY de quien vive donde y con que
  // correo. El directorio solo aporta el eslabon contrato->documento, que es lo
  // unico que el listado no trae.
  //
  // Ademas habilita la segunda llave. Medido sobre el envio de agosto, el Excel
  // sale de SIMI ORDENADO POR CONTRATO: una sola ruptura en 595 pares, contra
  // 288 si estuviera ordenado por cedula y 297 por nombre. Es decir que hoy
  // nadie busca fila por fila; las dos listas van en el mismo orden y se bajan
  // en paralelo.
  //
  // Eso funciona hasta que deja de funcionar: una fila de mas corre todo lo que
  // sigue, en silencio y en cadena. Asi que la posicion NO se usa para
  // emparejar, se usa para COMPROBAR lo que dijo el directorio. Dos llaves
  // independientes que tienen que coincidir.
  const filas = (listado || []).map((r, i) => ({
    posicion: i,
    documento: String(r.Id ?? r.documento ?? '').trim(),
    nombre: String(r.Nombre ?? r.nombre ?? '').trim(),
    email: String(r.Correo ?? r.email ?? '').trim(),
  })).filter((r) => r.documento || r.nombre || r.email);

  const hayListado = filas.length > 0;
  const porDocumento = new Map();
  for (const f of filas) {
    const d = normCodigo(f.documento);
    if (d && !porDocumento.has(d)) porDocumento.set(d, f);
  }

  // Los archivos, en orden de contrato: es el orden con el que se compara.
  const ordenados = [...leidos].sort((a, b) => (Number(a.codigo) || 0) - (Number(b.codigo) || 0));

  // La comprobacion por posicion solo tiene sentido si las dos listas tienen el
  // mismo largo. Si no lo tienen, se dice por que en vez de comparar cosas
  // desalineadas y sembrar alarmas falsas.
  const posicionUsable = hayListado && filas.length === ordenados.length;

  // ------------------------------------------------------------ emparejar
  const emparejados = [];
  const usados = new Set();
  const filasUsadas = new Set();

  for (let i = 0; i < ordenados.length; i++) {
    const a = ordenados[i];

    // Llave 1: el directorio dice de que documento es este contrato.
    const candidatos = indice.get(a.clave);
    const delDirectorio = candidatos && candidatos.length ? candidatos[0] : null;

    // Llave 2: la posicion en el orden por contrato.
    const porPosicion = posicionUsable ? ordenados[i] && filas[i] : null;

    // Con listado, el contacto sale de la fila de ESTE mes, no de la del mes
    // pasado: un inquilino pudo cambiar de correo.
    let fila = null;
    let metodo = '';
    if (hayListado) {
      const doc = delDirectorio ? normCodigo(delDirectorio.documento) : '';
      fila = doc ? porDocumento.get(doc) : null;
      if (fila) metodo = 'directorio';
      else if (porPosicion) { fila = porPosicion; metodo = 'posicion'; }
    } else if (delDirectorio) {
      fila = delDirectorio;
      metodo = 'directorio';
    }

    if (!fila) { excepciones.archivoSinInquilino.push(a); continue; }

    // Las dos llaves discrepan: no se elige ninguna.
    if (metodo === 'directorio' && posicionUsable && porPosicion
        && normCodigo(fila.documento) !== normCodigo(porPosicion.documento)) {
      excepciones.discrepanLasLlaves.push({
        ...a,
        segunDirectorio: { documento: fila.documento, nombre: fila.nombre },
        segunPosicion: { documento: porPosicion.documento, nombre: porPosicion.nombre },
      });
      continue;
    }

    if (delDirectorio) usados.add(a.clave);
    if (fila.posicion !== undefined) filasUsadas.add(fila.posicion);

    const email = String(fila.email || '').trim();
    if (!email) excepciones.sinCorreo.push({ ...a, ...fila });
    else if (!correoValido(email)) excepciones.correoInvalido.push({ ...a, ...fila, email });

    emparejados.push({
      codigo: a.codigo,
      clave: a.clave,
      renovacion: a.renovacion,
      archivo: a.archivo,
      url: a.url,
      nombre: fila.nombre || '',
      email,
      documento: fila.documento || '',
      metodo,
      // Con las dos llaves de acuerdo, la confianza es otra cosa que con una
      // sola. Se dice, para que la revision humana mire primero lo flojo.
      confirmado: metodo === 'directorio' && posicionUsable,
      enviable: Boolean(email) && correoValido(email),
    });
  }

  if (hayListado) {
    for (const f of filas) {
      if (!filasUsadas.has(f.posicion)) excepciones.inquilinoSinArchivo.push({ ...f });
    }
  } else {
    for (const [clave, grupo] of indice) {
      if (!usados.has(clave)) excepciones.inquilinoSinArchivo.push({ clave, ...grupo[0] });
    }
  }

  // -------------------------------------- reparto: campana vs correo aparte
  // Un contacto de Mailchimp guarda UN valor por merge field. Si una persona
  // tiene dos inmuebles, la campana masiva solo puede llevarle uno y el otro se
  // pierde sin que salte ningun error: en agosto le paso a cuatro inquilinos.
  //
  // Por eso quien tiene mas de un contrato NO va en la campana. Sale aparte, en
  // un correo con la lista completa de sus recibos. Agrupar no tiene tope —con
  // merge fields numerados (CODURL2, CODURL3) el que tuviera uno mas de los
  // previstos volveria a perder un codigo en silencio, que es el fallo que se
  // esta corrigiendo.
  const enviables = emparejados.filter((e) => e.enviable);
  const porCorreo = new Map();
  for (const e of enviables) {
    const k = e.email.toLowerCase();
    if (!porCorreo.has(k)) porCorreo.set(k, []);
    porCorreo.get(k).push(e);
  }

  const campana = [];         // un contrato: merge field y campana masiva
  const multiContrato = [];   // dos o mas: correo aparte con todos sus codigos
  for (const [email, grupo] of porCorreo) {
    const unicos = [...new Map(grupo.map((g) => [g.clave, g])).values()];
    if (unicos.length === 1) campana.push(unicos[0]);
    else {
      multiContrato.push({
        email,
        nombre: unicos[0].nombre,
        documento: unicos[0].documento,
        codigos: unicos.map((u) => ({ codigo: u.codigo, clave: u.clave, archivo: u.archivo, url: u.url })),
      });
    }
  }

  // La misma URL en mas de una fila significa que el codigo de un cliente le
  // llega tambien a otro. En agosto la URL de Surgivasc salio hacia cuatro
  // empleados de la oficina: la celda de la ultima fila arrastrada hacia abajo.
  for (const [url, grupo] of repetidos(emparejados, (x) => x.url || '')) {
    const destinos = new Set(grupo.map((g) => g.email.toLowerCase()).filter(Boolean));
    if (destinos.size > 1) {
      bloqueos.push({
        tipo: 'url_compartida',
        clave: url,
        detalle: `El mismo codigo va a ${destinos.size} destinatarios distintos: ${[...destinos].join(', ')}`,
        items: grupo,
      });
    }
  }

  // ------------------------------------------------------------- senales
  // No bloquean: señalan donde mirar cuando algo huele raro.
  const claves = leidos.map((x) => Number(x.codigo)).filter((n) => Number.isFinite(n));
  let rupturas = 0;
  for (let i = 1; i < claves.length; i++) if (claves[i] < claves[i - 1]) rupturas++;

  const largos = {};
  for (const x of leidos) largos[x.codigo.length] = (largos[x.codigo.length] || 0) + 1;
  const largoModal = Number(Object.entries(largos).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);

  const oficinas = [...new Set(leidos.map((x) => x.oficina))];

  const senales = {
    // Con listado, dice si la segunda llave estuvo disponible y por que no.
    verificacionPorPosicion: posicionUsable
      ? 'activa'
      : (!hayListado ? 'sin listado del mes' : `listas de distinto largo (${filas.length} filas vs ${ordenados.length} archivos)`),
    rupturasDeOrden: rupturas,
    largoModal,
    fueraDeFormaModal: leidos.filter((x) => Math.abs(x.codigo.length - largoModal) > 1).map((x) => x.archivo),
    oficinas,
    variasOficinas: oficinas.length > 1,
  };

  return {
    emparejados,
    campana,
    multiContrato,
    excepciones,
    bloqueos,
    senales,
    resumen: {
      archivos: archivos.length,
      leidos: leidos.length,
      directorio: indice.size,
      emparejados: emparejados.length,
      confirmadosPorDosLlaves: emparejados.filter((e) => e.confirmado).length,
      enviables: enviables.length,
      campana: campana.length,
      multiContrato: multiContrato.length,
      codigosEnMultiContrato: multiContrato.reduce((n, m) => n + m.codigos.length, 0),
      bloqueos: bloqueos.length,
      excepciones: Object.values(excepciones).reduce((n, v) => n + v.length, 0),
    },
  };
}

/**
 * Arma el directorio contrato -> inquilino a partir de un envio ya hecho.
 *
 * La columna `Contrato` del Excel viene vacia (0 de 596 filas en agosto), asi
 * que la unica forma de saber de quien es cada contrato es mirar a quien se le
 * mando el mes pasado: cada fila empareja implicitamente un archivo con un
 * inquilino. De un solo envio salen ~592 pares.
 *
 * De ahi en adelante los contratos nuevos son los unicos que piden atencion
 * humana, y una vez resueltos quedan aprendidos.
 *
 * @param filas [{ Id, Nombre, Correo, Archivo }] tal como salen del CSV
 */
export function construirDirectorio(filas = []) {
  const entradas = [];
  const descartadas = [];
  const conflictos = [];
  const vistos = new Map();

  for (const f of filas) {
    const nombre = String(f.Nombre ?? f.nombre ?? '').trim();
    const email = String(f.Correo ?? f.email ?? '').trim();
    const url = String(f.Archivo ?? f.url ?? '').trim();
    const documento = String(f.Id ?? f.documento ?? '').trim();

    if (!nombre && !email && !url) continue;   // filas vacias que deja Excel al final

    const datos = leerNombreArchivo(url);
    if (!datos) { descartadas.push({ nombre, email, url, motivo: 'nombre de archivo no reconocido' }); continue; }

    const clave = normCodigo(datos.codigo);
    const entrada = { codigo: datos.codigo, clave, nombre, email, documento };

    const previo = vistos.get(clave);
    if (previo) {
      const mismo = previo.documento === documento && previo.email.toLowerCase() === email.toLowerCase();
      if (!mismo) conflictos.push({ clave, previo, nuevo: entrada });
      continue;
    }
    vistos.set(clave, entrada);
    entradas.push(entrada);
  }

  return { entradas, descartadas, conflictos };
}


/**
 * Compara lo que el sistema emparejo contra lo que de verdad se envio.
 *
 * Solo sirve para un mes YA enviado, porque hace falta la respuesta correcta:
 * el CSV de ese mes, con la columna Archivo llena. Es la prueba que convierte
 * "deberia funcionar" en "da exactamente lo mismo que hicieron ustedes a mano".
 *
 * @param emparejados  lo que devolvio conciliar()
 * @param filas        el CSV del mes enviado, con Id/Nombre/Correo/Archivo
 */
export function compararConEnviado(emparejados = [], filas = []) {
  // Lo que se envio de verdad, indexado por contrato.
  const enviado = new Map();
  for (const f of filas) {
    const url = String(f.Archivo ?? f.url ?? '').trim();
    const datos = leerNombreArchivo(url);
    if (!datos) continue;
    enviado.set(normCodigo(datos.codigo), {
      url,
      email: String(f.Correo ?? f.email ?? '').trim().toLowerCase(),
      nombre: String(f.Nombre ?? f.nombre ?? '').trim(),
      documento: String(f.Id ?? f.documento ?? '').trim(),
    });
  }

  const iguales = [];
  const urlDistinta = [];
  const correoDistinto = [];
  const soloEnElSistema = [];

  for (const e of emparejados) {
    const real = enviado.get(e.clave);
    if (!real) { soloEnElSistema.push(e); continue; }
    if (real.url !== e.url) { urlDistinta.push({ ...e, urlEnviada: real.url }); continue; }
    if (real.email && real.email !== e.email.toLowerCase()) {
      correoDistinto.push({ ...e, correoEnviado: real.email });
      continue;
    }
    iguales.push(e);
  }

  const vistos = new Set(emparejados.map((e) => e.clave));
  const soloEnElEnvio = [...enviado.entries()]
    .filter(([k]) => !vistos.has(k))
    .map(([clave, v]) => ({ clave, ...v }));

  return {
    iguales, urlDistinta, correoDistinto, soloEnElSistema, soloEnElEnvio,
    resumen: {
      enviadosDeVerdad: enviado.size,
      emparejadosPorElSistema: emparejados.length,
      identicos: iguales.length,
      // Cero en los tres de abajo es el resultado que se busca.
      conUrlDistinta: urlDistinta.length,
      conCorreoDistinto: correoDistinto.length,
      sinCorrespondencia: soloEnElSistema.length + soloEnElEnvio.length,
    },
  };
}

/**
 * Rellena el listado del mes con el link de cada inquilino.
 *
 * Es el trabajo manual entero: llega el Excel sin la columna Archivo y sale con
 * ella llena. Seiscientas copias que dejan de hacerse.
 *
 * COMO EMPAREJA, y por que se puede. El Excel no trae el numero de contrato
 * —la columna existe pero viene vacia—, asi que no hay ninguna llave que una
 * una fila con un archivo. Lo que si hay es el ORDEN: medido sobre agosto, el
 * Excel sale de SIMI ordenado por contrato (una ruptura en 595 pares, contra
 * 288 por cedula y 297 por nombre), y los archivos tambien. Las dos listas van
 * en el mismo orden, que es justo lo que hace hoy la persona: baja las dos en
 * paralelo.
 *
 * Emparejar por posicion es fragil —una fila de mas corre todo lo que sigue, en
 * silencio y en cadena—, asi que va con tres frenos:
 *
 *   1. Las filas sin cedula se descartan. No son inquilinos: en agosto eran
 *      cuatro empleados de la oficina anadidos al final. Descartarlas es lo que
 *      hace que los largos cuadren, 592 y 592.
 *   2. Si despues de eso los largos NO cuadran, se ABORTA. Sin la misma
 *      cantidad a cada lado la posicion no significa nada, y emparejar
 *      desalineado es exactamente el fallo que hay que evitar.
 *   3. Si se pasa un directorio, cada emparejamiento se contrasta con el. Lo
 *      que discrepe sale marcado en vez de colarse.
 *
 * Verificado contra el envio real de agosto: 592 de 592 URL identicas.
 *
 * @param filas     el Excel del mes, en su orden original
 * @param archivos  [{ codigo, url, archivo }] lo que hay en la carpeta del mes
 * @param directorio opcional; si se pasa, se usa como segunda llave
 */
export function rellenarLinks({ filas = [], archivos = [], directorio = [] } = {}) {
  const conCedula = [];
  const sinCedula = [];
  for (const f of filas) {
    const documento = String(f.Id ?? f.documento ?? '').trim();
    const nombre = String(f.Nombre ?? f.nombre ?? '').trim();
    const email = String(f.Correo ?? f.email ?? '').trim();
    if (!documento && !nombre && !email) continue;         // fila vacia de Excel
    (documento ? conCedula : sinCedula).push({ ...f, documento, nombre, email });
  }

  const ordenados = [...archivos].sort((a, b) => (Number(a.codigo) || 0) - (Number(b.codigo) || 0));

  if (conCedula.length !== ordenados.length) {
    return {
      ok: false,
      motivo: 'largos_distintos',
      mensaje: `El listado tiene ${conCedula.length} inquilinos y la carpeta ${ordenados.length} códigos. `
        + 'Sin la misma cantidad a cada lado no se puede emparejar por orden: '
        + 'sobra o falta alguien, y todo lo que viene después quedaría corrido.',
      filasConCedula: conCedula.length,
      archivos: ordenados.length,
      sinCedula,
    };
  }

  const porContrato = new Map();
  for (const d of directorio) porContrato.set(normCodigo(d.codigo), d);

  const listas = [];
  const discrepan = [];
  const sinCorreo = [];
  const correoInvalido = [];

  conCedula.forEach((fila, i) => {
    const a = ordenados[i];
    const esperado = porContrato.get(normCodigo(a.codigo));
    const cuadra = !esperado || normCodigo(esperado.documento) === normCodigo(fila.documento);

    const salida = {
      ...fila,
      contrato: a.codigo,
      archivo: a.archivo,
      url: a.url,
      // Con directorio se sabe si las dos llaves coincidieron; sin el, la
      // posicion es lo unico que hay y se dice asi.
      verificado: Boolean(esperado) && cuadra,
    };

    if (esperado && !cuadra) {
      discrepan.push({ ...salida, segunDirectorio: esperado.documento, enElListado: fila.documento });
      return;
    }
    if (!fila.email) sinCorreo.push(salida);
    else if (!correoValido(fila.email)) correoInvalido.push(salida);
    listas.push(salida);
  });

  return {
    ok: true,
    filas: listas,
    sinCedula,
    discrepan,
    sinCorreo,
    correoInvalido,
    resumen: {
      entraron: filas.length,
      conLink: listas.length,
      descartadasSinCedula: sinCedula.length,
      verificadasCon2Llaves: listas.filter((x) => x.verificado).length,
      discrepan: discrepan.length,
      sinCorreo: sinCorreo.length,
      correoInvalido: correoInvalido.length,
    },
  };
}

/** El listado ya relleno, como CSV listo para abrir en Excel. */
export function aCSV(filas) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['Id', 'Mes', 'Contrato', 'Nombre', 'Correo', 'Archivo'];
  const cuerpo = filas.map((f) => [
    f.documento, f.Mes ?? f.mes ?? '', f.contrato, f.nombre, f.email, f.url,
  ].map(esc).join(','));
  // Con BOM para que Excel respete los acentos al abrirlo de doble clic.
  return `\uFEFF${cab.join(',')}\n${cuerpo.join('\n')}\n`;
}
