import { definirTool, str, strOpc, numOpc, enumStr, enumStrOpc, lista, type Tool, type CtxTool } from '../protocol.ts';
import { ctxDe } from '../state.ts';
import { TELEFONO_CONTINGENCIA } from '../prompts.ts';
import { calificar } from '../scoring.ts';
import type { Db } from '../db.ts';

/**
 * Deja un nombre de barrio como se compara: minusculas, sin tildes y sin el
 * articulo de adelante. "Los Rosales" y "rosales" acaban iguales.
 */
export const normalizarZona = (s: unknown): string => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  // Los diacriticos combinantes que deja NFD. Escapados a proposito: escritos
  // literal son caracteres invisibles en el fuente, y basta una copia con la
  // codificacion mal para que el filtro deje de quitar tildes sin que se note.
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/^(los|las|el|la)\s+/, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Reemplaza `asignarBrokerDinamico`, que leia ConfigAgente.brokers[] y "ganaba
// el primero que coincidia". Con 30+ asesores eso concentra todos los leads en
// una persona: ahora se balancea por leads abiertos.
export async function asignarAsesor(db: Db, criterios: { zona?: string; tipo?: string; operacion?: string }) {
  const activos = await db.list('Asesor', { estado: 'Activo', limit: 100 });
  if (!activos.length) return null;

  // Se compara normalizado en los DOS lados. El placeholder de la pantalla de
  // asesores es literalmente "Chicó, Rosales, Usaquén", con tildes: comparando
  // en crudo, un asesor con zona "Chicó" no cruzaba nunca con un cliente que
  // escribe "chico" y el reparto por zona se caia en silencio al balanceo.
  const zona = normalizarZona(criterios.zona);
  const quiereArriendo = String(criterios.operacion || '').startsWith('arr');
  const porTipo = activos.filter((a: any) => {
    const t = String(a.tipo || 'Ambos');
    if (t === 'Ambos') return true;
    return quiereArriendo ? t === 'Arriendo' : t === 'Venta';
  });
  let cand = porTipo.length ? porTipo : activos;

  if (zona) {
    const porZona = cand.filter((a: any) =>
      Array.isArray(a.zonas) && a.zonas.some((z: string) => {
        const suya = normalizarZona(z);
        return Boolean(suya) && (zona.includes(suya) || suya.includes(zona));
      }));
    if (porZona.length) cand = porZona;
  }

  // Balanceo: gana quien menos leads abiertos tiene. Empate -> el que lleva mas
  // tiempo sin recibir uno (round-robin real).
  const cargas = await Promise.all(cand.map(async (a: any) => ({
    asesor: a,
    abiertos: (await db.list('Contacto', { asignado_a: a.nombre, estado_seguimiento: 'Asignado', limit: 50 })).length,
    ultima: new Date(a.ultima_asignacion || 0).getTime(),
  })));
  cargas.sort((x, y) => x.abiertos - y.abiertos || x.ultima - y.ultima);
  const elegido = cargas[0].asesor;
  await db.actualizar('Asesor', elegido.id, { ...elegido, ultima_asignacion: new Date().toISOString() });
  return elegido;
}

// El demo tiene que decir el valor real. Redondear $2.500.000 a "$3 millones"
// cambia materialmente el canon y erosiona la confianza en el inventario.
export const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Math.round(n)).replace(/\s+/g, '');

// La ficha que se le manda al cliente.
//
// `link_web` va de PRIMERO: es la pagina del inmueble en el sitio de
// INMOBILIARE. Mandar al cliente a nuestra web y no a la de un portal es la
// diferencia entre que el lead siga siendo nuestro o que quede navegando el
// inventario de la competencia, que es lo que hay al lado en Metrocuadrado.
// Los portales quedan de respaldo para los inmuebles que aun no tienen ficha
// propia publicada.
//
// (`link_wasi` salio de aqui porque INMOBILIARE no usa Wasi —era residuo de la
// app de la que se clono esto— y estaba de primero, asi que bastaba que alguien
// llenara ese campo para mandar al cliente a otra plataforma.)
/**
 * La ficha del inmueble en NUESTRA web, armada a partir del codigo de SIMI.
 *
 * POR QUE HACE FALTA CONSTRUIRLA. Los 2737 inmuebles tienen codigo_externo y
 * NINGUNO tiene link_web. Sin esto, cada ficha que Diana manda lleva al cliente
 * a Metrocuadrado o a MercadoLibre, o sea a navegar el inventario de la
 * competencia que esta justo al lado del nuestro. El lead se paga y se regala.
 *
 * EL PATRON, verificado contra el sitio real:
 *   /inmueble/{tipo}-en-{operacion}-{barrio}-{ciudad}_{codigo}/
 *   .../inmueble/apartamento-en-arriendo-los-rosales-bogota_90-74529/  -> 200
 *
 * El slug NO es decorativo: con el codigo bueno y un slug inventado el sitio
 * responde 404. Hay que armarlo igual que el, o no mandarlo.
 *
 * MEDIDO sobre una muestra variada de 17 inmuebles (todos los tipos, arriendo y
 * venta, barrios de una y de varias palabras, Bogota y municipios): 15 aciertan.
 * Los dos que no son los de tipo 'Otro', que es donde el importador tira lo que
 * no reconocio y para lo que el sitio no tiene ruta. Por eso se excluyen aqui:
 * mandar un enlace muerto es peor que mandar al portal de la competencia.
 */
export function linkPropio(p: any, esArriendo: boolean): string {
  const codigo = String(p?.codigo_externo || '').trim();
  const tipo = String(p?.tipo || '').trim();
  const barrio = String(p?.barrio || '').trim();
  const ciudad = String(p?.ciudad || '').trim();
  // 'Otro' no tiene ruta en el sitio, y sin codigo, tipo o barrio no hay slug
  // que valga. Se devuelve vacio y linkFicha cae al portal.
  if (!codigo || !tipo || tipo === 'Otro' || !barrio || !ciudad) return '';

  // Venta_y_Arriendo existe en el enum: se usa la operacion que el cliente pidio,
  // que es la ficha que le sirve.
  const op = String(p?.operacion || '') === 'Venta' ? 'venta'
    : String(p?.operacion || '') === 'Arriendo' ? 'arriendo'
      : (esArriendo ? 'arriendo' : 'venta');

  const slug = normalizarZona(`${tipo} en ${op} ${barrio} ${ciudad}`)
    .replace(/\s+/g, '-');
  if (!slug) return '';
  return `https://www.inmobiliarelatam.com/inmueble/${slug}_${codigo}/`;
}

export const linkFicha = (p: any, esArriendo = false): string => String(
  // El orden importa y es este a proposito:
  //
  // 1. link_web  — la que asigno scripts/asignar-fichas.mjs, que la COMPROBO
  //    contra el sitio antes de guardarla. Es la unica que sabemos que abre.
  // 2. linkPropio — la misma URL construida al vuelo, sin comprobar. Cubre lo
  //    que entro despues del ultimo barrido.
  // 3. los portales — el respaldo para lo que no se puede construir (tipo
  //    'Otro', o falta el barrio o la ciudad).
  p?.link_web
  || linkPropio(p, esArriendo)
  || p?.portales?.metrocuadrado
  || p?.portales?.fincaraiz
  || p?.portales?.mercadolibre
  || p?.portales?.lahaus
  || p?.portales?.ciencuadras
  || p?.portales?.properati
  || '',
).trim();

/**
 * Lo que se recuerda de un inmueble que ya se le enseno al cliente.
 *
 * Vive en MemoriaChat entre turnos —el cliente pide la ficha en el mensaje
 * siguiente— asi que va lo justo para armar su tarjeta sin volver a consultar:
 * nueve campos cortos por inmueble, diez inmuebles como mucho, unos 1.200
 * chars. Lo que reventaba la escritura del estado eran CIEN FILAS COMPLETAS
 * (440 KB), no esto.
 *
 * Esta funcion existe para que haya UN solo sitio que decide esa forma.
 * Antes la construian por separado buscar_inmuebles y buscar_por_codigo, y al
 * anadir los campos de la tarjeta una de las dos se quedo atras: un inmueble
 * buscado por codigo salia con la tarjeta a medias y sin precio.
 */
function paraMostrar(p: any, esArriendo: boolean) {
  return {
    id: p.id,
    codigo: p.codigo_externo || '',
    titulo: p.titulo || '',
    ficha: linkFicha(p, esArriendo),
    tipo: p.tipo || '',
    barrio: p.barrio || p.ciudad || '',
    precio: esArriendo
      ? (p.canon_arriendo ? `${fmtCOP(p.canon_arriendo)} al mes` : '')
      : (p.precio_venta ? fmtCOP(p.precio_venta) : ''),
    area: p.area_m2 ?? null,
    hab: p.habitaciones ?? null,
  };
}

// Como se le describe un inmueble al modelo. Compartida entre buscar_inmuebles
// y buscar_por_codigo: si cada una arma su propio objeto, terminan afirmando
// campos distintos del mismo inmueble segun por donde llego el cliente.
// Los null son deliberados y el prompt se apoya en ellos: null significa "este
// dato NO lo tienes", que es lo que impide que el modelo lo complete.
export function resumirProp(p: any, esArriendo: boolean) {
  const r: Record<string, unknown> = {
    id: p.id,
    codigo: p.codigo_externo || null,
    tipo: p.tipo,
    barrio: p.barrio || p.ciudad,
    area_m2: p.area_m2 ?? null,
    habitaciones: p.habitaciones ?? null,
    banos: p.banos ?? null,
    parqueaderos: p.parqueaderos ?? null,
    precio: esArriendo
      ? (p.canon_arriendo ? fmtCOP(p.canon_arriendo) + ' al mes' : null)
      : (p.precio_venta ? fmtCOP(p.precio_venta) : null),
    administracion: p.valor_administracion ?? p.administracion ?? null,
  };

  // NI ficha NI titulo NI un video en null, y es una decision de coste medida.
  //
  // Cada inmueble que ve el modelo pesaba 148 tokens, y este resultado se
  // REENVIA entero en cada llamada siguiente del turno: con tres llamadas y
  // cinco inmuebles son 2.200 tokens pagados a precio completo, tres veces.
  //
  // - `ficha` eran 45 de esos 148, y el modelo no la necesita: enviar_fichas
  //   resuelve la URL sola a partir del id. Dandosela ademas se arriesga a que
  //   la escriba el mismo en el mensaje, saltandose el formato de la tarjeta.
  // - `titulo` es "Apartamento en Los Rosales", o sea tipo + barrio otra vez.
  // - `video` venia null en practicamente todo el inventario.
  //
  // Lo que SI se queda: administracion, banos y parqueaderos, porque son
  // exactamente lo que pregunta quien va a arrendar.
  if (p.link_instagram) r.video = p.link_instagram;
  return r;
}

// ── El tipo de inmueble ─────────────────────────────────────────────────────

// Los valores EXACTOS del enum de Propiedad.tipo. Son los unicos que existen en
// la base: el importador colapsa cualquier otra cosa a uno de estos.
export const TIPOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];

// Los que se le pueden ofrecer al cliente. 'Otro' queda FUERA a proposito:
// nadie busca "un otro". Es donde el importador tira lo que no reconocio
// (Tipoinmueble vacio, Edificio, Habitacion, Parqueadero...). Como son
// inmuebles reales, no se desaparecen: se cuentan aparte y se le dicen al
// cliente cuando el filtro de tipo los esta dejando fuera.
export const TIPOS_OFRECIBLES = TIPOS.filter((t) => t !== 'Otro');

// Los unicos tipos donde `habitaciones` significa algo. En Oficina, Local,
// Bodega o Lote un 0 no es un dato que falte: es que no aplica. Filtrarlos por
// cuartos los borraria del inventario sin motivo.
const CON_HABITACIONES = new Set(['Apartamento', 'Casa', 'Finca']);

/**
 * Lleva lo que llegue al valor exacto del enum. Devuelve '' si no lo reconoce.
 *
 * POR QUE, si el esquema de la tool ya restringe el parametro: porque esto
 * tambien compara contra el valor GUARDADO, que no controlamos.
 *
 * Y '' significa "no filtres por tipo", NUNCA "no hay ninguno". Un termino que
 * no se entiende no puede vaciar el inventario, que es justo lo que hacia el
 * `includes()` de antes: comparaba al reves (exigia que el valor guardado
 * contuviera la palabra del cliente), asi que 'apartamento'.includes(
 * 'apartamentos') daba false, un simple plural descartaba las 2737 filas y el
 * agente lo leia como "hoy no hay nada".
 */
export function normalizarTipo(v: unknown): string {
  const s = normalizarZona(v);   // mismo saneado: minusculas, sin tildes
  if (!s) return '';
  const exacto = TIPOS.find((t) => normalizarZona(t) === s);
  if (exacto) return exacto;
  // Sinonimos y plurales. Apartaestudio, penthouse y consultorio ya NO existen
  // como tipo en la base: el importador los colapsa al escribir. O sea que se
  // pueden buscar, pero el subtipo no se puede prometer (ver el conocimiento
  // de la casa, chunk "Vivienda o comercio").
  if (/apartaestudio|aparta estudio|penthouse|pent house|duplex|apartamento|apto/.test(s)) return 'Apartamento';
  if (/consultorio|oficina/.test(s)) return 'Oficina';
  if (/bodega/.test(s)) return 'Bodega';
  if (/local/.test(s)) return 'Local';
  if (/finca/.test(s)) return 'Finca';
  if (/casa/.test(s)) return 'Casa';
  if (/lote|terreno/.test(s)) return 'Lote';
  return '';
}

/**
 * Traduce lo que dijo el cliente al nombre EXACTO que tiene la base.
 *
 * Es la pieza que faltaba. El filtro de Base44 es por igualdad: pedirle
 * "rosales" cuando guarda "Los Rosales" devuelve cero, y cero se interpretaba
 * como "no hay". De ahi salio que Diana le dijera a un cliente que en Rosales
 * habia 2 inmuebles cuando hay 66.
 *
 * Tres intentos, de mas a menos exacto:
 *   1. El nombre normalizado, tal cual.
 *   2. Que el nombre de la zona empiece por lo que dijo. "chico" -> "Chico".
 *   3. Que lo contenga en alguna parte. "cabrera" -> "La Cabrera Chico Lago".
 *
 * Si hay VARIAS candidatas no elige ninguna: devuelve la lista para que el
 * agente pregunte. "El Chico" cae en diecinueve barrios distintos —Chico, Chico
 * Norte, Chico Alto, Chico Reservado...— y adivinar es equivocarse casi siempre.
 *
 * `zonasPrecargadas` viene de cargarContexto, que ya trajo el indice en
 * paralelo con el resto del turno. Si no esta —tests, o el cargador fallo— se
 * consulta aqui: una peticion mas, pero nunca se busca a ciegas.
 */
export async function resolverZona(
  db: Db,
  loQueDijo: string,
  zonasPrecargadas?: any[],
): Promise<{ nombre: string; parecidas: string[] }> {
  const q = normalizarZona(loQueDijo);
  if (!q) return { nombre: '', parecidas: [] };

  const zonas = zonasPrecargadas?.length
    ? zonasPrecargadas
    : await db.list('ZonaInmueble', { activo: true, limit: 800 });

  // Sin indice cargado no se puede traducir, pero tampoco se puede afirmar que
  // la zona no existe. Se prueba con lo que dijo el cliente tal cual: si acerto
  // con el nombre exacto, la busqueda funciona igual.
  if (!zonas.length) return { nombre: String(loQueDijo), parecidas: [] };

  const exacta = zonas.find((z: any) => String(z.normalizado) === q);
  if (exacta) return { nombre: String(exacta.nombre), parecidas: [] };

  const empiezan = zonas.filter((z: any) => String(z.normalizado).startsWith(q));
  const contienen = zonas.filter((z: any) => String(z.normalizado).includes(q));
  const cand = (empiezan.length ? empiezan : contienen).map((z: any) => String(z.nombre));

  if (cand.length === 1) return { nombre: cand[0], parecidas: [] };
  // Mas de seis nombres no ayudan a elegir, abruman. Se muestran los primeros.
  return { nombre: '', parecidas: cand.slice(0, 6) };
}

// ── Cuanto se pide y cuanto se muestra ──────────────────────────────────────

// Cuantos inmuebles se le ponen delante al cliente de una vez. Mas de cinco por
// chat no se leen. El total real viaja aparte y SIEMPRE.
const MOSTRAR = 5;

const LIMITE_CONSULTA = 200;

/**
 * Tamanos de respuesta que pueden ser una pagina recortada y no el total.
 *
 * Lo UNICO comprobado de esta ruta es que devuelve 100 filas: el cargador viejo
 * pedia limit=100 y traia 100. Que acepte mas no esta medido aqui, y la
 * documentacion de Base44 dice que el limit por defecto es 50. Asi que un
 * resultado de exactamente 50, 100 o 200 filas puede ser el inventario completo
 * de la zona o puede ser un corte, y desde aqui no hay forma de distinguirlo.
 *
 * En ese caso NO se afirma un total: se dice "mas de N". Un matiz de mas es
 * barato; un total falso dicho con seguridad es exactamente el fallo que esto
 * viene a arreglar.
 *
 * Medido contra el inventario real, el barrio mas grande tiene 126 inmuebles,
 * asi que en la practica no salta casi nunca. Esta aqui para el dia en que sí.
 */
const TOPES_DE_PAGINA = new Set([50, 100, LIMITE_CONSULTA]);

const precioDe = (p: any, esArr: boolean) =>
  Number(esArr ? p.canon_arriendo : p.precio_venta) || 0;

/** Cuantos hay de cada tipo. Es la base del "de que tipo los quieres". */
function contarPorTipo(props: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of props) {
    const t = normalizarTipo(p.tipo) || 'Otro';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/**
 * "8 apartamentos, 2 oficinas, 1 casa" — para que el agente lo lea y lo diga.
 *
 * El plural se arma bien porque esta frase la oye el cliente tal cual: en
 * castellano "local" hace "locales", no "locals". Terminada en vocal suma s,
 * en consonante suma es.
 */
const enPalabras = (porTipo: Record<string, number>) => Object.entries(porTipo)
  .sort((a, b) => b[1] - a[1])
  .map(([t, n]) => {
    const palabra = t.toLowerCase();
    if (n === 1) return `1 ${palabra}`;
    return `${n} ${palabra}${/[aeiou]$/.test(palabra) ? 's' : 'es'}`;
  })
  .join(', ');

export const buscarInmuebles: Tool = {
  ...definirTool(
    'buscar_inmuebles',
    'Busca en el inventario real inmuebles que encajen con lo que pide el cliente. Devuelve solo lo que existe: NUNCA menciones un inmueble, precio o direccion que no venga de aqui. Mira el campo `resultado` antes de contestar: es lo que decide que puedes y que NO puedes afirmar.',
    {
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      barrio: strOpc('Barrio o zona, tal como lo dijo el cliente. La herramienta lo traduce al nombre real. null si no lo ha dicho.'),
      tipo: enumStrOpc(
        'Tipo de inmueble. Apartaestudio, penthouse y duplex van como Apartamento; consultorio va como Oficina. null si el cliente todavia no lo ha dicho.',
        TIPOS_OFRECIBLES,
      ),
      presupuesto_max: numOpc('Tope en pesos. null si no lo ha dicho.'),
      habitaciones_min: numOpc('Minimo de habitaciones. null si no aplica.'),
      banos_min: numOpc('Minimo de banos. null si no lo ha pedido.'),
      // Las comodidades salen del campo `caracteristicas` que manda SIMI, y las
      // trae el 96% del inventario. Se buscan por texto suelto porque vienen
      // escritas de mil formas ("Terraza", "Terraza Bbq", "Balcón").
      caracteristicas: lista(
        'Comodidades que el cliente pidio, en palabras sueltas: terraza, bbq, balcon, chimenea, '
        + 'ascensor, estudio, patio, deposito, vigilancia, gimnasio, piscina, amoblado. '
        + 'Lista vacia si no ha pedido ninguna. NO inventes: solo lo que el cliente dijo.',
      ),
    },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const esArr = input.operacion === 'arriendo';
    const tipo = normalizarTipo(input.tipo);
    const tope = Number(input.presupuesto_max) || 0;
    const habs = Number(input.habitaciones_min) || 0;
    const banos = Number(input.banos_min) || 0;
    // Se normalizan igual que los barrios: minusculas y sin tildes, porque
    // SIMI escribe "Balcón", "LavanderÍa" y "Pisos CerÁmica" con la
    // capitalizacion que le da la gana.
    const comodidades = (Array.isArray(input.caracteristicas) ? input.caracteristicas : [])
      .map((x: unknown) => normalizarZona(x))
      .filter(Boolean);

    // ── 1. Sin zona no se busca ────────────────────────────────────────────
    //
    // Va en codigo y no en el prompt porque dependia de que el modelo decidiera
    // preguntar primero, y eso no es una garantia. Antes el unico parametro
    // obligatorio era `operacion`: con todo lo demas en null no se descartaba
    // nada, todo puntuaba igual y salian cinco inmuebles ARBITRARIOS desde el
    // primer mensaje.
    //
    // Ademas es lo que mantiene la consulta acotada: sin zona habria que
    // traerse los ~900 de arriendo o los ~1800 de venta para filtrarlos en
    // memoria, que es la version grande del bug que esto viene a arreglar.
    if (!String(input.barrio || '').trim()) {
      return {
        resultado: 'falta_zona',
        instruccion: 'Todavia no tienes zona, y sin zona no puedo buscar. Preguntale en que '
          + 'barrio o sector lo quiere. Si ya te dijo el presupuesto o el tipo, no los repitas: '
          + 'pide solo la zona. No muestres inventario ni digas que estas buscando.',
      };
    }

    // ── 2. Traducir lo que dijo al nombre que tiene la base ────────────────
    const zona = await resolverZona(c.db, String(input.barrio), c.ctxAgente.zonas);
    if (!zona.nombre) {
      return {
        resultado: zona.parecidas.length ? 'zona_ambigua' : 'zona_desconocida',
        sugerencias: zona.parecidas,
        instruccion: zona.parecidas.length
          ? `"${input.barrio}" encaja con varias zonas nuestras: ${zona.parecidas.join(', ')}. `
            + 'Preguntale a cual se refiere, nombrandoselas. NO elijas tu: son barrios distintos y '
            + 'acertar por azar seria equivocarse la mayoria de las veces. NO digas que no hay nada.'
          : `No ubicas la zona "${input.barrio}". Preguntale por el barrio o el sector con otras `
            + 'palabras, o pidele un punto de referencia. PROHIBIDO afirmar que no tenemos inmuebles '
            + 'alli: no lo has comprobado, lo que pasa es que no reconoces ese nombre.',
      };
    }

    // ── 3. La consulta, filtrada en la BASE por zona ───────────────────────
    //
    // Antes cargarContexto traia 100 inmuebles cualesquiera y aqui se filtraban
    // esos 100. Con 2737 en inventario el agente era ciego al 96%: un cliente
    // pidio Rosales, habia 66, en los 100 cargados habia 3, y se le dijo que
    // solo habia 2 y que "no hay ninguno mas".
    //
    // Se filtra SOLO por zona y estado. La operacion, el tipo y el precio se
    // resuelven abajo en memoria sobre pocas filas, que es donde si se pueden
    // tratar los casos que la igualdad del backend no cubre: Venta_y_Arriendo
    // cuenta para los dos lados, y un precio en 0 es un dato que falta, no un
    // inmueble gratis.
    const r = await c.db.consultar('Propiedad', {
      barrio: zona.nombre, estado: 'Disponible', limit: LIMITE_CONSULTA,
    });
    if (r.ok === false) {
      // Un fallo de la base NO es un inventario vacio. Esta rama es la razon por
      // la que existe `consultar`: antes `list` devolvia [] ante un 500, una
      // api_key vencida o un timeout, y el agente le decia al cliente "hoy no
      // hay nada" con seguridad total y sin ningun sintoma visible.
      c.efectos.escalado = c.efectos.escalado || {
        motivo: `no se pudo consultar el inventario de ${zona.nombre} (${r.motivo})`,
        prioridad: 'media',
      };
      return {
        resultado: 'no_pude_consultar',
        instruccion: `La consulta del inventario de ${zona.nombre} no respondio. PROHIBIDO decirle `
          + 'que no hay inmuebles: no lo sabes. Dile que se te trabo el sistema un momento y que se '
          + 'lo confirmas enseguida. Sigue la conversacion recogiendo lo que falte; ya hay un asesor avisado.',
      };
    }

    const enLaZona = r.filas.filter((p: any) => {
      const op = String(p.operacion || '');
      // Venta_y_Arriendo cuenta para los dos lados. Hoy no hay ninguna fila asi,
      // pero el importador las puede generar, y perderlas en silencio seria
      // volver a la misma clase de fallo.
      return op === 'Venta_y_Arriendo' || op === (esArr ? 'Arriendo' : 'Venta');
    });
    const dudoso = TOPES_DE_PAGINA.has(r.filas.length);
    const operacionTxt = esArr ? 'arriendo' : 'venta';

    // ── 4. En la zona no hay NADA de esa operacion ─────────────────────────
    //
    // Esto SI se puede afirmar: se acaba de comprobar. Pero la afirmacion va
    // acotada a esa zona y esa operacion, nunca al inventario entero.
    if (!enLaZona.length) {
      return {
        resultado: 'cero_en_la_zona',
        zona: zona.nombre,
        revisados: r.filas.length,
        instruccion: `Comprobado: en ${zona.nombre} no tenemos nada en ${operacionTxt} ahora mismo. `
          + 'Esto SI lo puedes afirmar porque acabas de mirarlo, pero dilo acotado a esa zona y esa '
          + 'operacion, nunca como "no tenemos nada". Ofrecele registrar el interes con '
          + 'registrar_interes, que es la unica forma de que ese aviso quede guardado, y ofrecele '
          + 'tambien mirar un sector vecino.',
      };
    }

    const porTipo = contarPorTipo(enLaZona);

    // ── 5. El TIPO: se pregunta con el inventario en la boca ───────────────
    //
    // La casa pidio preguntar el tipo y usarlo como filtro. Meterlo en el gate
    // junto a la zona seria la forma mala: dos preguntas bloqueantes seguidas,
    // y el conocimiento de la casa manda UNA pregunta por mensaje.
    //
    // Asi que la pregunta no es un peaje, es la respuesta: se busca igual, se
    // saca el desglose real y se le dice cuantos hay de cada tipo ANTES de
    // preguntarle cual quiere. El cliente recibe informacion a cambio de su
    // respuesta, que es lo contrario de un interrogatorio, y de paso oye el
    // total verdadero antes de que nadie pregunte.
    //
    // Y solo se pregunta cuando la respuesta CAMBIA algo: si los once son
    // apartamentos, preguntar el tipo es teatro. Medido en los 11 de Rosales en
    // arriendo (8 apartamentos, 2 oficinas, 1 casa), preguntarlo es la
    // diferencia entre mandarle 11 y mandarle 8.
    if (!tipo && Object.keys(porTipo).length > 1 && !c.ctxAgente.tipo_preguntado) {
      // Se marca para no volver a preguntarlo nunca en esta conversacion. Si el
      // cliente no contesta el tipo y el modelo vuelve a buscar, la segunda vez
      // se le muestra lo que hay: insistir con la misma pregunta es exactamente
      // como suena un formulario.
      c.ctxAgente.tipo_preguntado = true;
      return {
        resultado: 'falta_tipo',
        zona: zona.nombre,
        en_la_zona: enLaZona.length,
        total_es_exacto: !dudoso,
        por_tipo: porTipo,
        instruccion: `En ${zona.nombre} en ${operacionTxt} tenemos ${dudoso ? 'mas de ' : ''}`
          + `${enLaZona.length}: ${enPalabras(porTipo)}. Dilo asi de corto y cierra preguntandole `
          + 'que tipo busca. UNA sola pregunta, y no listes inmuebles todavia: acabas de darle un '
          + 'dato real, no le estas haciendo un cuestionario.',
      };
    }

    // ── 5b. SIN PRESUPUESTO NO SE LISTA ────────────────────────────────────
    //
    // Es lo que separa asesorar de volcar inventario. Un cliente que solo dijo
    // "busco oficina en chapinero" no ha dado NADA con lo que priorizar, y
    // mandarle cinco cualesquiera y decirle que son "las que mas se ajustan" es
    // mentira: no hay nada a lo que ajustarse. Eso paso en produccion.
    //
    // Ademas el presupuesto es uno de los tres datos que el asesor necesita
    // recibir (nombre, zona, presupuesto), asi que preguntarlo aqui no es un
    // peaje: es el trabajo.
    //
    // Se pregunta UNA vez. Si el cliente no lo da y vuelve a insistir, se le
    // muestra lo que hay: repetir la misma pregunta es exactamente como suena un
    // formulario, y ya se aprendio esa leccion con el tipo.
    if (!tope && !c.ctxAgente.presupuesto_preguntado) {
      c.ctxAgente.presupuesto_preguntado = true;
      const precios = enLaZona.map((p: any) => precioDe(p, esArr)).filter(Boolean).sort((a, b) => a - b);
      return {
        resultado: 'falta_presupuesto',
        zona: zona.nombre,
        en_la_zona: enLaZona.length,
        desde: precios.length ? fmtCOP(precios[0]) : null,
        hasta: precios.length ? fmtCOP(precios[precios.length - 1]) : null,
        instruccion: precios.length
          ? `En ${zona.nombre} tienes ${enLaZona.length} de ese tipo, y van desde ${fmtCOP(precios[0])} `
            + `hasta ${fmtCOP(precios[precios.length - 1])}. Dile ese rango y preguntale en que cifra `
            + 'se quiere mover. Le estas dando un dato util, no haciendole un cuestionario: UNA sola '
            + 'pregunta y sin listar inmuebles todavia.'
          : 'Preguntale que presupuesto maneja antes de mostrarle nada. UNA sola pregunta.',
      };
    }

    // ── 6. El resto de filtros, contando lo que se cae y por que ───────────
    let sinPrecioPublicado = 0;
    const encajan = enLaZona.filter((p: any) => {
      const suTipo = normalizarTipo(p.tipo);
      if (tipo && suTipo !== tipo) return false;

      if (habs && CON_HABITACIONES.has(suTipo) && Number(p.habitaciones || 0) < habs) return false;
      if (banos && Number(p.banos || 0) < banos) return false;

      // Las comodidades se comparan sobre el texto de `caracteristicas`, que
      // SIMI manda como lista y escribe de mil formas: "Terraza", "Terraza Bbq",
      // "Balcón", "Parqueaderos Cubierto". Por eso se busca subcadena sobre todo
      // el bloque normalizado en vez de comparar elemento a elemento.
      if (comodidades.length) {
        const suyas = normalizarZona(
          [...(Array.isArray(p.caracteristicas) ? p.caracteristicas : []), p.descripcion || ''].join(' '),
        );
        if (!comodidades.every((q) => suyas.includes(q))) return false;
      }

      if (tope) {
        const precio = precioDe(p, esArr);
        // Un precio en 0 NO es un inmueble gratis: el importador guarda 0 cuando
        // la celda venia vacia. No se puede prometer que cabe en el presupuesto,
        // pero tampoco desaparece en silencio como antes: se cuenta y se dice
        // que existen para que el asesor los confirme.
        if (!precio) { sinPrecioPublicado++; return false; }
        if (precio > tope) return false;
      }
      return true;
    });

    // Los que el importador no supo clasificar. Solo se mencionan cuando el
    // filtro de tipo los esta dejando fuera, que es cuando desaparecerian.
    const otrosSinClasificar = tipo ? (porTipo.Otro || 0) : 0;

    const filtros = [
      tipo ? `tipo ${tipo.toLowerCase()}` : '',
      tope ? `hasta ${fmtCOP(tope)}` : '',
      habs ? `${habs} o mas habitaciones` : '',
      banos ? `${banos} o mas banos` : '',
      comodidades.length ? `con ${comodidades.join(', ')}` : '',
    ].filter(Boolean);

    // ── 7. Hay en la zona, pero ninguno cumple el filtro ───────────────────
    //
    // La rama que mas importa y la que antes no existia. Con 55 inmuebles en
    // venta en Rosales, "no hay nada" es mentira: lo que no hay es nada BAJO ESE
    // FILTRO. Se devuelven las dos mitades y se prohibe la negacion suelta.
    if (!encajan.length) {
      return {
        resultado: 'cero_bajo_el_filtro',
        zona: zona.nombre,
        en_la_zona: enLaZona.length,
        por_tipo: porTipo,
        filtros_aplicados: filtros,
        sin_precio_publicado: sinPrecioPublicado,
        otros_sin_clasificar: otrosSinClasificar,
        instruccion: `OJO: en ${zona.nombre} SI tenemos ${enLaZona.length} en ${operacionTxt} `
          + `(${enPalabras(porTipo)}). Ninguno cumple ${filtros.join(' y ')}. Dilo con esas dos `
          + 'partes: cuantos hay en la zona y cual de tus criterios los deja fuera. Ofrecele soltar '
          + 'el que mas aprieta. PROHIBIDO decir "no hay nada" o "no tenemos": si los hay.'
          + (sinPrecioPublicado
            ? ` Ademas hay ${sinPrecioPublicado} sin precio cargado que pueden servirle: el asesor `
              + 'se lo confirma.'
            : ''),
      };
    }

    // ── 8. Hay ────────────────────────────────────────────────────────────
    //
    // Orden estable y explicable: primero los que tienen precio publicado (no se
    // puede ofrecer lo que no se sabe cuanto vale) y dentro de esos, el mas
    // barato. No hay ninguna senal de calidad en la base para ordenar mejor, y
    // un orden arbitrario es lo que hacia que "revise de nuevo" pudiera devolver
    // cosas distintas sin que nada hubiera cambiado.
    const orden = [...encajan].sort((a: any, b: any) => {
      const pa = precioDe(a, esArr);
      const pb = precioDe(b, esArr);
      return (pa ? 0 : 1) - (pb ? 0 : 1) || pa - pb;
    });
    const visibles = orden.slice(0, MOSTRAR);

    // Lo que se le mostro, para que enviar_fichas y agendar_visita resuelvan el
    // id despues. Se guardan CUATRO campos, no la fila entera: esto persiste en
    // MemoriaChat entre turnos (el cliente pide la ficha en el mensaje
    // siguiente) y meter propiedades completas ahi es lo que reventaba la
    // escritura del estado por tamano.
    const antes = Array.isArray(c.ctxAgente.mostrados) ? c.ctxAgente.mostrados : [];
    const nuevos = visibles.map((p: any) => paraMostrar(p, esArr));
    const vistos = new Set(nuevos.map((m) => m.id));
    c.ctxAgente.mostrados = [...nuevos, ...antes.filter((m: any) => !vistos.has(m.id))].slice(0, 10);

    return {
      resultado: 'hay',
      zona: zona.nombre,
      // Cuantos hay DE VERDAD bajo lo que pidio, y cuantos le estas mostrando.
      // Antes solo existia `encontrados`, que se calculaba DESPUES de cortar a
      // cinco: era un tope disfrazado de conteo, y de ahi salio literal "solo
      // esos dos que ya te mande".
      total: encajan.length,
      mostrados: visibles.length,
      hay_mas: encajan.length > visibles.length,
      en_la_zona: enLaZona.length,
      total_es_exacto: !dudoso,
      por_tipo: porTipo,
      sin_precio_publicado: sinPrecioPublicado,
      otros_sin_clasificar: otrosSinClasificar,
      // QUE SE FILTRO DE VERDAD. Va aqui porque sin esto el modelo dice "te
      // mande las 5 que mas se ajustan" cuando el cliente no dio ni un criterio:
      // paso en produccion con "busco oficina en arriendo en chapinero". No hay
      // nada a lo que ajustarse, y prometerlo es la clase de frase que hace que
      // el cliente deje de creer lo demas.
      criterios_aplicados: filtros,
      inmuebles: visibles.map((p: any) => resumirProp(p, esArr)),
      nota: (encajan.length > visibles.length
        ? `Le muestras ${visibles.length} de ${encajan.length}. Si pregunta cuantos hay, el numero `
          + `es ${encajan.length}, no ${visibles.length}. `
        : '')
        + (dudoso
          ? 'OJO: la consulta pudo venir recortada, asi que di "mas de" antes del numero, o no lo des. '
          : '')
        + (filtros.length
          ? `Filtraste por ${filtros.join(' y ')}: eso SI puedes decir que lo tuviste en cuenta. `
          : 'NO filtraste por nada mas que la zona. PROHIBIDO decir "los que mas se ajustan", "los '
            + 'que mejor encajan" o cualquier cosa que sugiera que los elegiste para el: no te dio '
            + 'ningun criterio. Di que son los primeros y preguntale que necesita para afinar. ')
        + 'Solo puedes afirmar los datos que aparecen aqui. Un campo en null es un dato que NO tienes:'
        + 'dile que se lo confirma el asesor, no lo completes.',
    };
  },
};

/**
 * Ubica un inmueble que ya se le mostro al cliente.
 *
 * Primero en lo que quedo de la busqueda —que persiste entre turnos— y si no,
 * en la base por id. Nunca se responde "ese ya no lo tengo" sin haber mirado.
 */
type NoUbicado = 'no_mostrado' | 'no_pude_consultar' | 'no_disponible';

async function resolverInmueble(c: CtxTool, id: string) {
  const guardado = (c.ctxAgente.mostrados || []).find((m: any) => m.id === id);
  if (guardado) return { ok: true as const, mostrado: guardado };
  if (!String(id || '').trim()) return { ok: false as const, motivo: 'no_mostrado' as NoUbicado };

  const r = await c.db.consultar('Propiedad', { id: String(id), limit: 1 });
  if (r.ok === false) return { ok: false as const, motivo: 'no_pude_consultar' as NoUbicado };
  const p = r.filas[0];
  if (!p) return { ok: false as const, motivo: 'no_mostrado' as NoUbicado };
  // Puede venir de un turno viejo y haber salido del mercado entre medias. Se
  // comprueba aqui y no en cada tool para que no se le mande la ficha de algo
  // que ya no se puede ofrecer.
  if (String(p.estado || '') !== 'Disponible') return { ok: false as const, motivo: 'no_disponible' as NoUbicado };
  return {
    ok: true as const,
    mostrado: paraMostrar(p, !p.precio_venta && !!p.canon_arriendo),
  };
}

/**
 * Que decirle al cliente cuando no se pudo ubicar el inmueble.
 *
 * Las tres salidas llevan instruccion, y son tres distintas a proposito. Antes
 * enviar_ficha (hoy enviar_fichas) era la unica tool de ventas que devolvia un error crudo
 * —{ok:false, error:'inmueble no encontrado'}— sin ninguna guia, y el modelo
 * improvisaba "ese ya no lo tengo disponible" sobre un inmueble que sigue
 * publicado.
 */
const noUbicado = (motivo: NoUbicado, queIbaAHacer: string) => ({
  ok: false,
  error: motivo,
  instruccion: motivo === 'no_pude_consultar'
    ? `No pudiste consultar ese inmueble, asi que ${queIbaAHacer} NO se hizo. NO digas que no `
      + 'existe ni que ya no esta disponible: no lo sabes. Dile que se te trabo el sistema y que se '
      + 'lo confirmas.'
    : motivo === 'no_disponible'
      ? `Ese inmueble ya no esta disponible, asi que ${queIbaAHacer} NO se hizo. Dilo sin rodeos y `
        + 'ofrecele buscar algo parecido con buscar_inmuebles.'
      : `Ese id no salio en tu busqueda, asi que ${queIbaAHacer} NO se hizo. NO le digas que el `
        + 'inmueble ya no esta ni te lo inventes: vuelve a buscar con buscar_inmuebles y trabaja '
        + 'sobre una de las que devuelva.',
});

/**
 * La tarjeta de un inmueble, tal como la lee el cliente. UN globo por inmueble.
 *
 * La arma el codigo y no el modelo, a proposito: asi todos los inmuebles se ven
 * igual, no hay forma de que se cuele un dato inventado en el formato, y el
 * modelo no gasta tokens de salida redactando cinco fichas casi identicas.
 *
 * Los campos vacios se caen solos. Un inmueble sin area publicada sale sin area,
 * no con "area: no disponible", que es ruido para quien lo lee.
 */
function tarjeta(m: Record<string, any>): string {
  const titulo = [m.tipo, m.barrio && `en ${m.barrio}`].filter(Boolean).join(' ')
    || m.titulo || 'Inmueble';
  const detalle = [
    m.precio,
    m.area ? `${m.area} m2` : '',
    m.hab ? `${m.hab} hab` : '',
  ].filter(Boolean).join(' · ');
  return [titulo, detalle, m.ficha].filter(Boolean).join('\n');
}

export const enviarFichas: Tool = {
  ...definirTool(
    'enviar_fichas',
    'Manda las fichas de uno o varios inmuebles que ya viste en buscar_inmuebles. '
    + 'UNA SOLA llamada con todos los ids: el sistema los parte en un mensaje por inmueble, '
    + 'con su precio, su tamano y su link. NO la llames una vez por inmueble, y no escribas '
    + 'tu los datos de cada uno: de eso se encarga la herramienta. Mandalas apenas presentes '
    + 'los inmuebles, sin esperar a que el cliente las pida.',
    {
      inmueble_ids: lista(
        'Los ids que devolvio buscar_inmuebles, en el orden en que quieres que los reciba. '
        + 'Maximo 5: mas de eso el cliente no los lee.',
      ),
    },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ids = (Array.isArray(input.inmueble_ids) ? input.inmueble_ids : [])
      .map((x: unknown) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 5);

    if (!ids.length) {
      return {
        ok: false,
        error: 'sin_ids',
        instruccion: 'No me pasaste ningun id. Usa los que devolvio buscar_inmuebles.',
      };
    }

    const enviados: string[] = [];
    const fallidos: Array<{ id: string; motivo: string }> = [];

    for (const id of ids) {
      const res = await resolverInmueble(c, id);
      if (!res.ok) { fallidos.push({ id, motivo: res.motivo }); continue; }
      if (!res.mostrado.ficha) { fallidos.push({ id, motivo: 'sin_ficha' }); continue; }
      c.salida.globos.push(tarjeta(res.mostrado));
      enviados.push(id);
    }

    // Ni uno salio: es el caso de enviar_ficha de antes, con su misma guia.
    if (!enviados.length) {
      const unico = fallidos[0];
      if (unico.motivo === 'sin_ficha') {
        return {
          ok: false,
          error: 'sin_ficha',
          instruccion: 'Ninguno de esos inmuebles tiene ficha publicada. Dile que el asesor se '
            + 'la comparte. PROHIBIDO inventar el link.',
        };
      }
      return noUbicado(unico.motivo as NoUbicado, 'el envio de las fichas');
    }

    // Salieron algunos: se dice CUALES faltaron y por que, en vez de devolver un
    // ok a secas. Si no, el modelo da por enviadas las cinco y sigue hablando de
    // un inmueble cuya ficha el cliente nunca recibio.
    return {
      ok: true,
      enviadas: enviados.length,
      no_enviadas: fallidos.length || undefined,
      detalle_fallos: fallidos.length ? fallidos : undefined,
      instruccion: fallidos.length
        ? `Se mandaron ${enviados.length} fichas. ${fallidos.length} no: de esas NO afirmes que `
          + 'las mando ni des sus datos. Si el cliente pregunta, dile que esa se la pasa el asesor.'
        : `Ya salieron las ${enviados.length} fichas, cada una en su mensaje con precio, tamano y `
          + 'link. NO las repitas ni las describas otra vez: el cliente ya las tiene delante. '
          + 'Sigue la conversacion: pregunta cual le interesa o si quiere verlas.',
    };
  },
};

export const registrarInteres: Tool = {
  ...definirTool(
    'registrar_interes',
    'Guarda lo que el cliente busca para avisarle cuando entre un inmueble que encaje. Usala cuando buscar_inmuebles no encontro nada y el cliente acepta que le avisemos. Es la unica forma de que ese "te aviso" quede registrado: prometerlo en el mensaje no guarda nada.',
    {
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      zona: strOpc('Barrio o zona. null si no la dio.'),
      tipo_inmueble: enumStrOpc('Tipo de inmueble. null si no lo dijo.', TIPOS_OFRECIBLES),
      presupuesto_max: numOpc('Tope en pesos. null si no lo dio.'),
      habitaciones_min: numOpc('Minimo de habitaciones. null si no aplica.'),
      notas: strOpc('Algo mas que deba saber quien le avise. null si no hay nada.'),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ctx = ctxDe(c.estado, 'ventas');
    const nombre = String(c.estado.compartido.nombre || '').trim();

    // Vigencia por defecto: 90 dias. Pasado eso la alerta se marca vencida y no
    // se llama al cliente. Nadie quiere que lo contacten por algo que pidio hace
    // ocho meses; una alerta sin caducidad se vuelve una molestia.
    const alerta = await c.db.crear('AlertaBusqueda', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      contacto_nombre: nombre,
      contacto_telefono: c.entrada.tel.replace(/\D/g, ''),
      operacion: input.operacion === 'arriendo' ? 'Arriendo' : 'Venta',
      tipo_inmueble: input.tipo_inmueble ? String(input.tipo_inmueble) : '',
      zona: input.zona ? String(input.zona) : '',
      presupuesto_max: Number(input.presupuesto_max) || 0,
      habitaciones_min: Number(input.habitaciones_min) || 0,
      estado: 'Activa',
      canal: c.entrada.canal,
      fecha_registro: new Date().toISOString(),
      vigente_hasta: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      veces_notificado: 0,
      notas: input.notas ? String(input.notas).slice(0, 500) : '',
    });
    if (!alerta) return { ok: false, error: 'no_se_pudo_registrar' };
    ctx.alerta_id = alerta.id;

    return {
      ok: true,
      instruccion: 'Confirmale que quedo registrado y que le escribimos apenas entre algo '
        + 'que encaje. NO prometas cuando: no lo sabes.',
    };
  },
};

// El cliente que llega con un codigo (lo saco de la URL de la ficha en la web)
// ya sabe que inmueble quiere: preguntarle zona y presupuesto para "descubrir"
// lo que vino a pedir es exactamente el interrogatorio que la operacion quiere
// quitar. Por eso esta herramienta NO pasa por el gate de descubrimiento.
export const buscarPorCodigo: Tool = {
  ...definirTool(
    'buscar_por_codigo',
    'Busca UN inmueble por su codigo. Usala apenas el cliente mencione un codigo (por ejemplo 90-1177), que es el que aparece en la URL de la ficha en la pagina web. No le pidas zona ni presupuesto: ya sabe cual quiere.',
    { codigo: str('El codigo tal como lo escribio el cliente') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const crudo = String(input.codigo || '').trim();
    if (!crudo) return { ok: false, error: 'sin_codigo' };

    // El cliente lo dicta como lo ve: "90-1177", "90 1177", "cod 90-1177". El
    // filtro del backend es por igualdad, asi que se prueban las dos formas
    // razonables. Antes se mandaba el texto CRUDO tal cual —despues de haberlo
    // normalizado para buscar en memoria— asi que "cod 90-1177" no encontraba
    // nada y la tool ordenaba decir que el codigo no existe.
    const partes = crudo.match(/(\d{1,4})\s*[-–—_]?\s*(\d{3,8})/);
    const candidatos = [...new Set([partes ? `${partes[1]}-${partes[2]}` : '', crudo].filter(Boolean))];

    let p: any = null;
    for (const cand of candidatos) {
      const r = await c.db.consultar('Propiedad', { codigo_externo: cand, limit: 1 });
      if (r.ok === false) {
        return {
          ok: false,
          error: 'no_pude_consultar',
          instruccion: 'No pudiste consultar ese codigo. PROHIBIDO decirle que no existe: no lo '
            + 'comprobaste. Dile que se te trabo el sistema y que se lo confirmas enseguida.',
        };
      }
      if (r.filas[0]) { p = r.filas[0]; break; }
    }

    if (!p) {
      return {
        ok: false,
        error: 'no_encontrado',
        instruccion: 'Consultado: no hay ningun inmueble con ese codigo. Pidele que lo confirme '
          + '(puede estar incompleto) o que te cuente que busca y lo ubicas por zona. No inventes '
          + 'un inmueble.',
      };
    }

    if (String(p.estado || '') !== 'Disponible') {
      return {
        ok: false,
        error: 'no_disponible',
        instruccion: 'Ese inmueble existe pero ya no esta disponible. Dilo sin rodeos y ofrecele '
          + 'buscar algo parecido con buscar_inmuebles. No des sus datos ni su precio.',
      };
    }

    // Queda a mano para que enviar_fichas no tenga que volver a consultar.
    const antes = Array.isArray(c.ctxAgente.mostrados) ? c.ctxAgente.mostrados : [];
    c.ctxAgente.mostrados = [
      paraMostrar(p, !p.precio_venta && !!p.canon_arriendo),
      ...antes.filter((m: any) => m.id !== p.id),
    ].slice(0, 10);

    return {
      ok: true,
      inmueble: resumirProp(p, !p.precio_venta && !!p.canon_arriendo),
      instruccion: 'Confirmale que si lo tienes, dile lo esencial en una frase y manda la ficha '
        + 'con enviar_fichas en este mismo turno. Despues sigue la conversacion: pregunta si quiere '
        + 'verlo o si busca algo asi.',
    };
  },
};

export const calificarLead: Tool = {
  ...definirTool(
    'calificar_lead',
    'Entrega el lead a un asesor humano. Llamala SOLO cuando tengas nombre, operacion (compra o arriendo) y una senal real del presupuesto del cliente. El precio de un inmueble NO es el presupuesto del cliente. El sistema escribe el mensaje de entrega: tu no lo redactas.',
    {
      nombre: str('Nombre que dio el cliente. No lo inventes.'),
      operacion: enumStr('Que busca', ['venta', 'arriendo']),
      zona: strOpc('Barrio o zona de interes. null si no la dio.'),
      tipo_inmueble: enumStrOpc('Tipo de inmueble. null si no lo dijo.', TIPOS_OFRECIBLES),
      presupuesto: numOpc('Cifra en pesos. null si es un inversionista flexible o no quiso darla.'),
      observaciones: strOpc('Lo que el asesor deberia saber antes de llamar. null si no hay nada.'),
    },
    { retorna: true, cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const ctx = ctxDe(c.estado, 'ventas');
    if (ctx.calificado) return { ok: false, error: 'ya_calificado' };
    const nombre = String(input.nombre || c.estado.compartido.nombre || '').trim();
    if (!nombre) return { ok: false, error: 'falta_nombre', nota: 'Pide el nombre antes de calificar.' };
    c.estado.compartido.nombre = nombre;

    const asesor = await asignarAsesor(c.db, {
      zona: input.zona, tipo: input.tipo_inmueble, operacion: input.operacion,
    });

    ctx.calificado = true;
    ctx.asesor = asesor?.nombre || '';
    ctx.asesor_id = asesor?.id || '';
    ctx.asesor_tel = asesor?.telefono || '';

    // Temperatura y score REALES. Antes se escribia 'Caliente' literal para
    // todo lead, asi que la columna no distinguia a nadie de nadie y el equipo
    // no tenia como priorizar. Las senales de conversacion salen del ctx del
    // agente, donde guardar_dato las fue dejando.
    const cal = calificar({
      etapa_pipeline: 'Lead',
      presupuesto_max: Number(input.presupuesto) || undefined,
      ciudad_interes: 'Bogota',
      operacion: String(input.operacion),
      zona: input.zona ? String(input.zona) : undefined,
      timing: ctx.datos?.timing ? String(ctx.datos.timing) : undefined,
      forma_pago: ctx.datos?.forma_pago ? String(ctx.datos.forma_pago) : undefined,
      decide_solo: typeof ctx.datos?.decide_solo === 'boolean' ? ctx.datos.decide_solo : undefined,
      otra_inmobiliaria: ctx.datos?.otra_inmobiliaria === true,
      ultima_actividad: new Date().toISOString(),
    });
    ctx.score = cal.score;
    ctx.temperatura = cal.temperatura;

    const contactoId = String(c.estado.compartido.contacto_id || '');
    if (contactoId) {
      await c.db.actualizar('Contacto', contactoId, {
        nombre,
        telefono: c.entrada.tel,
        ia_calificado: true,
        temperatura: cal.temperatura,
        score_lead: cal.score,
        asignado_a: asesor?.nombre || '',
        broker_telefono: asesor?.telefono || '',
        estado_seguimiento: 'Asignado',
        fecha_asignacion: new Date().toISOString(),
        fecha_ultimo_avance: new Date().toISOString(),
        tipo_interes: input.operacion === 'arriendo' ? 'Arriendo' : 'Compra',
        pipeline_tipo: input.operacion === 'arriendo' ? 'Arriendo' : 'Venta',
        presupuesto_max: Number(input.presupuesto) || undefined,
        ciudad_interes: 'Bogota',
        notas: [input.zona ? `Zona: ${input.zona}` : '', input.observaciones || ''].filter(Boolean).join(' | '),
      });
      // `tipo` es obligatorio en el esquema y su enum ya traia el valor exacto
      // para esto. Antes se mandaba evento/detalle, campos que no existen, sin
      // `tipo`: la calificacion no quedaba en el historial del lead.
      await c.db.crear('HistorialLead', {
        contacto_id: contactoId,
        tipo: 'Calificacion_IA',
        descripcion: `Asignado a ${asesor?.nombre || 'sin asesor'} por el agente de ventas`,
        fecha: new Date().toISOString(),
        es_automatico: true,
      });
    }

    c.efectos.notificar.push(
      // La temperatura encabeza: es lo que le dice al asesor si atender ya o
      // cuando pueda. Antes todos los leads llegaban iguales.
      `LEAD ${cal.temperatura.toUpperCase()} (${cal.score}/100) — contactar\n\n${nombre}\nwa.me/${c.entrada.tel}\n` +
      `${input.operacion === 'arriendo' ? 'Arriendo' : 'Compra'} de ${input.tipo_inmueble || 'inmueble'}\n` +
      `Zona: ${input.zona || 'sin definir'}\n` +
      `Presupuesto: ${input.presupuesto ? fmtCOP(Number(input.presupuesto)) : 'flexible, confirmar en la llamada'}\n` +
      `${input.observaciones ? `\nA tener en cuenta: ${input.observaciones}\n` : ''}` +
      `\nAsesor asignado: ${asesor?.nombre || 'SIN ASIGNAR'}${asesor?.telefono ? ` (${asesor.telefono})` : ''}`,
    );

    const primer = nombre.split(/\s+/)[0];
    const rol = asesor?.nombre ? asesor.nombre.split(/\s+/)[0] : null;
    return {
      ok: true,
      asesor: asesor?.nombre || null,
      // El telefono de contingencia va AQUI y en ningun otro lado: es el unico
      // momento en que el cliente pasa a manos de una persona, asi que es el
      // unico en que tiene sentido darle por donde insistir.
      instruccion: rol
        ? `Llama a responder con: confirmacion breve a ${primer}, que lo acompana ${rol}, y que se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.`
        : `Llama a responder con: confirmacion breve a ${primer} y que un asesor se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.`,
    };
  },
};

export const agendarVisita: Tool = {
  ...definirTool(
    'agendar_visita',
    'Deja registrada la intencion de visitar un inmueble. No confirma hora: el asesor coordina. Nunca prometas un horario concreto.',
    {
      inmueble_id: str('El id que devolvio buscar_inmuebles'),
      preferencia: str('Cuando le queda bien al cliente, en sus palabras'),
    },
    { cierra: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    // Se comprueba que el inmueble exista antes de agendar. Sin esto se creaba
    // una Visita con el id que viniera, y el asesor se encontraba una cita para
    // un inmueble que no existe.
    const res = await resolverInmueble(c, String(input.inmueble_id || ''));
    if (!res.ok) return noUbicado(res.motivo, 'la visita');

    await c.db.crear('Visita', {
      contacto_id: String(c.estado.compartido.contacto_id || ''),
      propiedad_id: res.mostrado.id,
      // Solicitada, no Programada: el agente recogio una preferencia, no acordo
      // una hora. Quien confirma es el equipo.
      estado: 'Solicitada',
      preferencia_horario: String(input.preferencia || '').slice(0, 200),
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: new Date().toISOString(),
    });
    return { ok: true, nota: 'Dile que el asesor le confirma el horario. No des una hora tu.' };
  },
};

export const VENTAS: Record<string, Tool> = {
  buscar_inmuebles: buscarInmuebles,
  buscar_por_codigo: buscarPorCodigo,
  enviar_fichas: enviarFichas,
  registrar_interes: registrarInteres,
  calificar_lead: calificarLead,
  agendar_visita: agendarVisita,
};
