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
export function conciliar({ archivos = [], directorio = [], opciones = {} } = {}) {
  const { mesEsperado = null } = opciones;

  const excepciones = {
    nombreNoReconocido: [],   // el archivo no sigue el patron de SIMI
    mesDistinto: [],          // trae otro mes: se subio la carpeta equivocada
    archivoSinInquilino: [],  // contrato nuevo, o el directorio esta desactualizado
    inquilinoSinArchivo: [],  // contrato terminado, o SIMI no lo genero
    sinCorreo: [],
    correoInvalido: [],
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

  // ------------------------------------------------------------ emparejar
  const emparejados = [];
  const usados = new Set();

  for (const a of leidos) {
    const candidatos = indice.get(a.clave);
    if (!candidatos || !candidatos.length) {
      excepciones.archivoSinInquilino.push(a);
      continue;
    }
    const inq = candidatos[0];
    usados.add(a.clave);

    const email = String(inq.email || '').trim();
    if (!email) excepciones.sinCorreo.push({ ...a, ...inq });
    else if (!correoValido(email)) excepciones.correoInvalido.push({ ...a, ...inq, email });

    emparejados.push({
      codigo: a.codigo,
      clave: a.clave,
      renovacion: a.renovacion,
      archivo: a.archivo,
      url: a.url,
      nombre: inq.nombre || '',
      email,
      documento: inq.documento || '',
      enviable: Boolean(email) && correoValido(email),
    });
  }

  for (const [clave, grupo] of indice) {
    if (!usados.has(clave)) excepciones.inquilinoSinArchivo.push({ clave, ...grupo[0] });
  }

  // ------------------------------------------- controles sobre el resultado
  // Un contacto de Mailchimp guarda UN valor por merge field. Si una persona
  // tiene dos inmuebles, la campana solo puede llevarle uno y el otro se pierde
  // sin que salte ningun error. En agosto le paso a cuatro inquilinos.
  const enviables = emparejados.filter((e) => e.enviable);
  for (const [email, grupo] of repetidos(enviables, (x) => x.email.toLowerCase())) {
    const codigos = new Set(grupo.map((g) => g.clave));
    if (codigos.size > 1) {
      bloqueos.push({
        tipo: 'correo_con_varios_codigos',
        clave: email,
        detalle: `${email} tiene ${codigos.size} contratos (${[...codigos].join(', ')}) y la campana solo puede llevarle uno`,
        items: grupo,
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
    rupturasDeOrden: rupturas,
    largoModal,
    fueraDeFormaModal: leidos.filter((x) => Math.abs(x.codigo.length - largoModal) > 1).map((x) => x.archivo),
    oficinas,
    variasOficinas: oficinas.length > 1,
  };

  return {
    emparejados,
    excepciones,
    bloqueos,
    senales,
    resumen: {
      archivos: archivos.length,
      leidos: leidos.length,
      directorio: indice.size,
      emparejados: emparejados.length,
      enviables: enviables.length,
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
