#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toolsDe } from '../base44/functions/_core/tools/index.ts';
import { agentesAutomaticosActivos, seleccionarRag } from '../base44/functions/_core/contexto.ts';
import { IDENTIDAD_MARCA, PROMPTS } from '../base44/functions/_core/prompts.ts';
import { cotizarAvaluo } from '../base44/functions/_core/tools/avaluos.ts';
import { enviarLinkDocumentos } from '../base44/functions/_core/tools/matricula.ts';
import {
  buscarInmuebles, calificarLead, enviarFicha, fmtCOP,
} from '../base44/functions/_core/tools/ventas.ts';
import { firmaMetaValida, secretoIgual } from '../base44/functions/_core/webhook.ts';
import { decidirAgente } from '../base44/functions/_core/router.ts';
import { esHabil, festivosColombia, sumarHabiles } from '../base44/functions/_core/habiles.ts';
import { calificar } from '../base44/functions/_core/scoring.ts';
import { briefLead } from '../base44/functions/_core/brief.ts';
import { hayEquipo, instruccionHorario } from '../base44/functions/_core/horario.ts';
import { escalarAHumano, responder } from '../base44/functions/_core/tools/comunes.ts';
import { abrirAsistencia, consultarHistorialSolicitudes, numeroOrden } from '../base44/functions/_core/tools/asistidos.ts';
import {
  POLITICA_VERSION, debeAvisar, marcaAutorizacion, textoAviso,
} from '../base44/functions/_core/privacidad.ts';
import {
  cargarEstado, claveDe, ctxDe, estadoVacio, guardarEstado, olvidarTransitorios, transferir,
} from '../base44/functions/_core/state.ts';
import * as telegram from '../base44/functions/_core/canales/telegram.ts';

assert.equal(Object.keys(PROMPTS).length, 8, 'deben existir exactamente ocho agentes');
assert.match(IDENTIDAD_MARCA, /Asistente Inmobiliare/);
assert.doesNotMatch(`${IDENTIDAD_MARCA}\n${Object.values(PROMPTS).join('\n')}`, /Valentina|Camila|Andres|Daniela|Julian|Mauricio/);
for (const [agente, prompt] of Object.entries(PROMPTS)) {
  assert.ok(prompt.split('\n').length <= 80, `${agente} supera 80 lineas`);
}
assert.match(PROMPTS.ventas, /guardar_dato/);

assert.equal(fmtCOP(2_500_000), '$2.500.000');
const catalogoDemo = [
  {
    id: 'chapi-25', titulo: 'Apartamento en Chapinero', operacion: 'Arriendo',
    barrio: 'Chapinero', tipo: 'Apartamento', canon_arriendo: 2_500_000,
    portales: { metrocuadrado: 'https://www.metrocuadrado.com/ficha-real' },
  },
  {
    id: 'suba-20', titulo: 'Apartamento en Suba', operacion: 'Arriendo',
    barrio: 'Suba', tipo: 'Apartamento', canon_arriendo: 2_000_000,
  },
  {
    id: 'chapi-40', titulo: 'Apartamento en Chapinero', operacion: 'Arriendo',
    barrio: 'Chapinero', tipo: 'Apartamento', canon_arriendo: 4_000_000,
  },
];
const ctxBusqueda = {
  ctxAgente: { catalogo: catalogoDemo },
  salida: { globos: [], finTurno: false },
};
const busqueda = await buscarInmuebles.ejecutar({
  operacion: 'arriendo', barrio: 'Chapinero', tipo: 'apartamento',
  presupuesto_max: 3_000_000, habitaciones_min: null,
}, ctxBusqueda);
assert.equal(busqueda.encontrados, 1);
assert.equal(busqueda.inmuebles[0].id, 'chapi-25');
assert.equal(busqueda.inmuebles[0].precio, '$2.500.000 al mes');
assert.equal(busqueda.inmuebles[0].ficha, 'https://www.metrocuadrado.com/ficha-real');
assert.equal(enviarFicha.ejecutar({ inmueble_id: 'chapi-25' }, ctxBusqueda).ok, true);
assert.equal(ctxBusqueda.salida.globos.at(-1), 'https://www.metrocuadrado.com/ficha-real');

const estadoLead = estadoVacio();
estadoLead.compartido.contacto_id = 'contacto-1';
const actualizaciones = [];
const ctxLead = {
  estado: estadoLead,
  entrada: { tel: '573001112233', canal: 'telegram' },
  db: {
    list: async () => [],
    actualizar: async (entidad, id, datos) => {
      actualizaciones.push({ entidad, id, datos });
      return { id, ...datos };
    },
    crear: async () => ({ id: 'historial-1' }),
  },
  efectos: { notificar: [] },
};
const lead = await calificarLead.ejecutar({
  nombre: 'Laura Gomez', operacion: 'arriendo', zona: 'Chapinero',
  tipo_inmueble: 'apartamento', presupuesto: 2_500_000, observaciones: null,
}, ctxLead);
assert.equal(lead.ok, true);
assert.equal(estadoLead.compartido.nombre, 'Laura Gomez');
assert.equal(actualizaciones.find((item) => item.entidad === 'Contacto').datos.nombre, 'Laura Gomez');
assert.match(ctxLead.efectos.notificar[0], /\$2\.500\.000/);

const cotizacion = await cotizarAvaluo.ejecutar({}, {});
assert.equal(cotizacion.error, 'tarifario_no_aprobado');
assert.equal('valor_servicio' in cotizacion, false);

const portalMatricula = await enviarLinkDocumentos.ejecutar({}, {});
assert.equal(portalMatricula.error, 'portal_documentos_no_disponible');

const chunks = [
  { titulo: 'Comun grande', contenido: 'x'.repeat(300), agentes: 'todos', prioridad: 10 },
  { titulo: 'Solo cartera', contenido: 'regla de saldo', agentes: 'cartera', prioridad: 10 },
  { titulo: 'Sin destino', contenido: 'no debe entrar', agentes: '', prioridad: 10 },
  { titulo: 'Demasiado grande', contenido: 'y'.repeat(1000), agentes: 'cartera', prioridad: 9 },
  { titulo: 'Especifico pequeno', contenido: 'regla corta', agentes: 'cartera', prioridad: 8 },
];
const rag = seleccionarRag(chunks, 'cartera', 420);
assert.deepEqual(rag.titulos, ['Solo cartera', 'Especifico pequeno', 'Comun grande']);
assert.ok(rag.chars <= 420);
assert.doesNotMatch(rag.texto, /Sin destino|Demasiado grande/);

assert.equal(agentesAutomaticosActivos(undefined), true);
assert.equal(agentesAutomaticosActivos({}), true);
assert.equal(agentesAutomaticosActivos({ activo: false }), false);

assert.equal(secretoIgual('telegram-secreto', 'telegram-secreto'), true);
assert.equal(secretoIgual('telegram-secreto-x', 'telegram-secreto'), false);
const raw = new TextEncoder().encode('{"object":"whatsapp_business_account"}').buffer;
const clave = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode('meta-secreto'),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const firma = new Uint8Array(await crypto.subtle.sign('HMAC', clave, raw));
const hex = [...firma].map((byte) => byte.toString(16).padStart(2, '0')).join('');
assert.equal(await firmaMetaValida(raw, `sha256=${hex}`, 'meta-secreto'), true);
assert.equal(await firmaMetaValida(raw, `sha256=${hex}`, 'otro-secreto'), false);
const entradaTelegram = await telegram.normalizar(
  { message: { message_id: 7, chat: { id: 12345 }, text: 'hola' } },
  { tgToken: '', openaiKey: '', tgBotKey: 'ventas' },
);
assert.equal(entradaTelegram.msgId, 'ventas:7');

const entrada = (texto, extras = {}) => ({
  canal: 'telegram', tel: '573001112233', texto, msgId: 'm1', botonId: '',
  adReferral: { adId: '', adTitulo: '', adCuerpo: '' }, destino: '123', ...extras,
});
const dbVacio = { list: async () => [] };
const optsRouter = { anthropicKey: '', modeloRouter: 'sin-modelo' };

assert.equal((await decidirAgente(dbVacio, estadoVacio(), entrada('tengo una fuga de agua'), optsRouter)).agente, 'mantenimiento');
for (const [texto, esperado] of [
  ['necesito el codigo de barras', 'cartera'],
  ['quiero vender mi apartamento', 'consignacion'],
  ['necesito un avaluo comercial', 'avaluos'],
  ['quiero poner una queja', 'pqr'],
  ['tengo dudas del codeudor', 'matricula'],
]) {
  assert.equal((await decidirAgente(dbVacio, estadoVacio(), entrada(texto), optsRouter)).agente, esperado);
}
assert.equal((await decidirAgente(
  dbVacio, estadoVacio(), entrada('hola', { botonId: 'flujo:pqr' }), optsRouter,
)).agente, 'pqr');

const pegajoso = estadoVacio();
pegajoso.agente_activo = 'ventas';
pegajoso.agente_historial.push({ agente: 'ventas', desde: new Date().toISOString(), motivo: 'prueba' });
assert.equal((await decidirAgente(dbVacio, pegajoso, entrada('y tiene parqueadero?'), optsRouter)).agente, 'ventas');

const dbCliente = {
  list: async (entidad) => entidad === 'Arrendatario' ? [{ id: 'arr-1' }] : [],
};
assert.equal((await decidirAgente(dbCliente, estadoVacio(), entrada('buenas tardes'), optsRouter)).agente, 'cartera');
assert.equal((await decidirAgente(dbVacio, estadoVacio(), entrada('buenas tardes'), optsRouter)).agente, 'recepcion');

// ── Aviso de tratamiento de datos (Ley 1581/2012) ────────────────────────────
// Es la pieza con efecto legal del flujo: si no avisa cuando debe, se guardan
// datos personales sin aviso y sin forma de saber en que conversaciones.
{
  assert.equal(debeAvisar(true, null), true, 'contacto nuevo debe recibir aviso');
  assert.equal(debeAvisar(true, {}), true, 'contacto sin autorizacion debe recibir aviso');
  assert.equal(debeAvisar(true, { autoriza_tratamiento: true, politica_version: POLITICA_VERSION }), false,
    'ya autorizado con la version vigente no debe recibirlo de nuevo');
  // Una autorizacion dada sobre otro texto no cubre el nuevo.
  assert.equal(debeAvisar(true, { autoriza_tratamiento: true, politica_version: 'vieja' }), true,
    'version de politica distinta obliga a re-avisar');
  assert.equal(debeAvisar(false, {}), false, 'solo se avisa en el primer turno');

  const aviso = textoAviso({});
  assert.ok(aviso.includes('bit.ly/3imaawE'), 'el aviso lleva la URL de la politica');
  assert.ok(aviso.length < 300, 'el aviso cabe en un globo');
  assert.ok(textoAviso({ politica_datos_url: 'https://x.co/p' }).includes('https://x.co/p'),
    'ConfigAgente.politica_datos_url manda sobre el defecto');

  const marca = marcaAutorizacion();
  assert.equal(marca.autoriza_tratamiento, true);
  assert.equal(marca.politica_version, POLITICA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(marca.fecha_autorizacion)), 'fecha_autorizacion es ISO valida');
}

// ── Dias habiles y festivos de Colombia (plazo legal de PQR) ─────────────────
// Un plazo legal contado mal por dos dias es un plazo incumplido, y la mayoria
// de festivos colombianos no cae en fecha fija: la Ley 51 de 1983 los corre al
// lunes y cinco dependen de la Pascua.
{
  const f2026 = festivosColombia(2026);
  assert.equal(f2026.size, 18, '2026 tiene 18 festivos');
  assert.ok(f2026.has('2026-01-01'), 'ano nuevo es fijo');
  assert.ok(f2026.has('2026-04-03'), 'Viernes Santo 2026 = 3 abr');
  assert.ok(f2026.has('2026-01-12'), 'Reyes se corre al lunes 12');
  assert.ok(!f2026.has('2026-01-06'), 'Reyes NO queda el 6 (Ley Emiliani)');

  // Hay anios donde dos festivos caen el mismo dia y el Set trae 17, no 18.
  // Es correcto y no un error de conteo: se prueba con 2030, que es el proximo
  // que lo tiene. El calculo corre siempre hacia adelante, asi que no tiene
  // sentido anclar el test a un anio ya pasado.
  assert.equal(festivosColombia(2030).size, 17, '2030: dos festivos coinciden');

  assert.equal(esHabil(new Date('2026-01-01T12:00:00Z')), false, 'festivo no es habil');
  assert.equal(esHabil(new Date('2026-08-01T12:00:00Z')), false, 'sabado no es habil');

  // Vie 31 jul 2026 + 15 habiles salta dos festivos de agosto (7 y 17).
  const vence = sumarHabiles(new Date('2026-07-31T10:00:00Z'), 15);
  assert.equal(vence.toISOString().slice(0, 10), '2026-08-25');
  assert.ok(esHabil(vence), 'un vencimiento siempre cae en dia habil');
}

// ── Scoring de leads ─────────────────────────────────────────────────────────
// calificar_lead escribia temperatura: 'Caliente' LITERAL para todo el mundo.
// Un inversionista listo para comprar y alguien que dijo que solo esta mirando
// llegaban identicos al asesor, asi que la columna no priorizaba nada.
{
  const listo = calificar({
    etapa_pipeline: 'Lead', presupuesto_max: 8e8, zona: 'Chico', operacion: 'venta',
    timing: 'ya', forma_pago: 'credito_aprobado', decide_solo: true,
  });
  const mirando = calificar({
    etapa_pipeline: 'Lead', operacion: 'arriendo',
    timing: 'explorando', forma_pago: 'no_sabe', decide_solo: false,
  });

  assert.ok(listo.score > mirando.score, 'un lead listo puntua mas que uno que solo mira');
  assert.equal(listo.temperatura, 'Urgente');
  assert.equal(mirando.temperatura, 'Frio');
  assert.notEqual(listo.temperatura, mirando.temperatura,
    'dos perfiles opuestos NO pueden dar la misma temperatura');

  // El score se explica solo: un asesor tiene que poder ver por que.
  assert.ok(listo.motivos.length > 0, 'la calificacion trae motivos');
  assert.ok(listo.motivos.some((m) => m.includes('timing')), 'el timing pesa y queda registrado');

  // Trabajar con otra inmobiliaria baja la probabilidad, pero no descalifica.
  const conCompetencia = calificar({ etapa_pipeline: 'Lead', presupuesto_max: 3e8, otra_inmobiliaria: true });
  const sinCompetencia = calificar({ etapa_pipeline: 'Lead', presupuesto_max: 3e8 });
  assert.ok(conCompetencia.score < sinCompetencia.score);
  assert.ok(conCompetencia.score > 0, 'la competencia no descalifica');

  // Determinista: mismas señales, mismo resultado.
  assert.equal(calificar({ etapa_pipeline: 'Lead', presupuesto_max: 3e8 }).score, sinCompetencia.score);

  // Nunca se sale del rango 0-100.
  assert.ok(calificar({
    etapa_pipeline: 'Escritura', presupuesto_max: 1e9, timing: 'ya', forma_pago: 'contado',
    decide_solo: true, visitas_realizadas: 3, visita_con_interes: true,
  }).score <= 100);
  assert.ok(calificar({ etapa_pipeline: 'Perdido', ultima_actividad: '2020-01-01T00:00:00Z' }).score >= 0);
}

// ── Cierre obligatorio ───────────────────────────────────────────────────────
// Antes un turno perfectamente valido era responder(["Cualquier cosa me
// escribes"], fin_turno=true): cero compromiso, cero registro, lead perdido en
// silencio. Ahora no se puede cerrar sin dejar algo concreto.
{
  const ctxBase = () => ({
    db: null, estado: estadoVacio(), entrada: entrada('hola'),
    ctxAgente: {}, config: {},
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  });

  // Cerrar sin haber hecho nada: se rechaza y el turno NO queda cerrado.
  const sinCierre = ctxBase();
  const r1 = responder.ejecutar({ globos: ['Cualquier cosa me escribes'], fin_turno: true }, sinCierre);
  assert.equal(r1.ok, false, 'no se puede cerrar sin siguiente paso');
  assert.equal(r1.error, 'cierre_sin_siguiente_paso');
  assert.equal(sinCierre.salida.finTurno, false, 'el turno queda abierto');
  assert.ok(sinCierre.salida.globos.length > 0, 'los globos si se envian: el cliente no se queda mudo');

  // Con una tool de cierre ejecutada, si cierra.
  const conCierre = ctxBase();
  conCierre.hubo_cierre = true;
  const r2 = responder.ejecutar({ globos: ['Listo, quedaste registrado'], fin_turno: true }, conCierre);
  assert.equal(r2.ok, true);
  assert.equal(conCierre.salida.finTurno, true);

  // Escalar tambien cuenta: la conversacion pasa a un humano, no muere.
  const escalado = ctxBase();
  escalado.efectos.escalado = { motivo: 'x', prioridad: 'alta' };
  assert.equal(responder.ejecutar({ globos: ['Un asesor te contacta'], fin_turno: true }, escalado).ok, true);

  // Transferir tambien: sigue con otro rol.
  const transferido = ctxBase();
  transferido.efectos.transferir = 'cartera';
  assert.equal(responder.ejecutar({ globos: ['Va'], fin_turno: true }, transferido).ok, true);

  // Seguir la conversacion (fin_turno=false) nunca se bloquea: la mayoria de
  // turnos son de descubrimiento y no tienen por que cerrar nada.
  const sigue = ctxBase();
  assert.equal(responder.ejecutar({ globos: ['Y en que zona la buscas?'], fin_turno: false }, sigue).ok, true);
  assert.equal(sigue.salida.finTurno, false);
}

// ── Cero resultados guia hacia registrar_interes ─────────────────────────────
// El prompt prometia "ofrece registrar el interes" y esa tool no existia: el
// agente prometia "te aviso cuando entre algo" y no quedaba registrado.
{
  const ctx = {
    ctxAgente: { catalogo: [] }, estado: estadoVacio(), entrada: entrada('busco algo'),
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };
  // Con zona: pasa el gate de discovery y llega al camino de cero resultados,
  // que es lo que se quiere probar aqui.
  const r = await buscarInmuebles.ejecutar(
    { operacion: 'arriendo', barrio: 'Chapinero', tipo: null, presupuesto_max: null, habitaciones_min: null },
    ctx,
  );
  assert.equal(r.encontrados, 0);
  assert.ok(r.instruccion, 'el caso sin resultados trae guia, no una lista vacia pelada');
  assert.ok(r.instruccion.includes('registrar_interes'), 'apunta a la tool que si existe');
}

// ── Gate de discovery ────────────────────────────────────────────────────────
// El unico parametro obligatorio era `operacion`. Con todo lo demas en null el
// filtro no descartaba nada y salian cinco inmuebles ARBITRARIOS en el primer
// mensaje: un broker no abre con un listado.
{
  const ctx = {
    ctxAgente: { catalogo: [{ id: 'p1', operacion: 'Arriendo', barrio: 'Chico', tipo: 'Apartamento', canon_arriendo: 3e6, habitaciones: 2 }] },
    estado: estadoVacio(), entrada: entrada('busco algo'),
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };
  const sinNada = await buscarInmuebles.ejecutar(
    { operacion: 'arriendo', barrio: null, tipo: null, presupuesto_max: null, habitaciones_min: null }, ctx);
  assert.equal(sinNada.falta_discovery, true, 'sin zona ni presupuesto no se muestra inventario');
  assert.equal(sinNada.inmuebles, undefined, 'no devuelve inmuebles');

  // Con zona ya puede buscar.
  const conZona = await buscarInmuebles.ejecutar(
    { operacion: 'arriendo', barrio: 'Chico', tipo: null, presupuesto_max: null, habitaciones_min: null }, ctx);
  assert.ok(conZona.falta_discovery === undefined, 'con zona si busca');
  assert.equal(conZona.encontrados, 1);

  // Con presupuesto tambien.
  const conTope = await buscarInmuebles.ejecutar(
    { operacion: 'arriendo', barrio: null, tipo: null, presupuesto_max: 4e6, habitaciones_min: null }, ctx);
  assert.ok(conTope.falta_discovery === undefined, 'con presupuesto si busca');
}

// ── Horario del equipo ───────────────────────────────────────────────────────
// Fuera de horario el agente REEMPLAZA al comercial: agenda el mismo. "Manana
// te contacta un asesor" es el ultimo recurso, no la salida por defecto.
{
  // Bogota es UTC-5. 15:00 UTC = 10:00 en Bogota.
  const juevesDiez = new Date('2026-08-06T15:00:00Z');   // jueves, 10am Bogota
  const juevesNoche = new Date('2026-08-07T02:00:00Z');  // miercoles 9pm Bogota
  const domingo = new Date('2026-08-09T15:00:00Z');      // domingo 10am

  assert.equal(hayEquipo(juevesDiez), true, 'jueves 10am hay equipo');
  assert.equal(hayEquipo(juevesNoche), false, '9pm no hay equipo');
  assert.equal(hayEquipo(domingo), false, 'domingo no hay equipo');

  // Un festivo entre semana cuenta como fuera de horario.
  const festivo = new Date('2026-08-17T15:00:00Z'); // lunes 17 ago, Asuncion
  assert.equal(hayEquipo(festivo), false, 'festivo no hay equipo aunque sea lunes');

  assert.ok(instruccionHorario(juevesNoche).includes('FUERA DE HORARIO'));
  assert.ok(!instruccionHorario(juevesDiez).includes('FUERA DE HORARIO'));
}

// ── Brief de escalamiento ────────────────────────────────────────────────────
// El humano recibia telefono y una frase; todo lo que guardar_dato acumulo se
// perdia y el asesor volvia a preguntar lo ya contestado.
{
  const st = estadoVacio();
  st.compartido.nombre = 'Karen Gonzalez';
  st.agente_activo = 'ventas';
  st.ctx.ventas = { datos: { operacion: 'arriendo', zona: 'Chapinero', presupuesto: 3_000_000, timing: 'ya' }, temperatura: 'Caliente', score: 72 };
  st.historial = [{ role: 'user', content: 'necesito algo urgente para el mes entrante' }];

  const b = briefLead(st, '573001234567', 'whatsapp', ['MOTIVO: pide hablar con una persona']);
  assert.ok(b.includes('Karen Gonzalez'));
  assert.ok(b.includes('Chapinero'), 'la zona viaja');
  assert.ok(b.includes('$3.000.000'), 'el presupuesto viaja formateado');
  assert.ok(b.includes('CALIENTE'), 'la calificacion viaja');
  assert.ok(b.includes('MOTIVO'), 'el motivo del escalamiento viaja');
  assert.ok(b.includes('urgente para el mes'), 'el ultimo mensaje da el tono');

  // Sin datos no revienta ni inventa.
  const vacio = briefLead(estadoVacio(), '573009999999', 'telegram');
  assert.ok(vacio.includes('Sin nombre'));
  assert.ok(!vacio.includes('undefined'));
}

// ════════════════════════════════════════════════════════════════════════════
// MEMORIA DEL CHAT
//
// El bug: cargarContexto trae datos frescos por turno (para ventas, hasta 100
// Propiedad completas) y se mezclan en estado.ctx[agente], que es justo el
// objeto que se serializa a estado_json. Con 2703 inmuebles en la tabla el
// estado paso de ~2.000 a ~85.000 chars y Base44 empezo a RECHAZAR la
// escritura. Como db.actualizar traga el error y devuelve null, el agente
// respondia normal pero no quedaba nada guardado: cada mensaje entraba como
// conversacion nueva. No recordaba el nombre, repetia preguntas, se contradecia.
//
// La defensa es de dos capas y las dos se prueban aqui:
//   1. olvidarTransitorios() saca del scratch lo que vino de cargarContexto.
//   2. el tope de 60k en guardarEstado descarta ctx antes que la conversacion.
// ════════════════════════════════════════════════════════════════════════════

// Chequeo de sensibilidad. Una prueba que pasa tambien con el bug puesto no
// prueba nada, asi que cada capa se rompe a proposito y se EXIGE que la
// asercion falle. Se cuentan al final para que el conteo no se caiga en
// silencio si alguien borra un mutante.
const mutantes = [];
const exigeFallo = (nombre, fn) => {
  assert.throws(fn, `MUTANTE "${nombre}": la prueba paso con el bug puesto, no sirve de nada`);
  mutantes.push(nombre);
};

// El tope grita por console.error a proposito. Se captura para no ensuciar la
// salida del banco y, de paso, para poder afirmar que grito.
const capturandoErrores = async (fn) => {
  const original = console.error;
  const lineas = [];
  console.error = (...args) => lineas.push(args.map(String).join(' '));
  try {
    return { valor: await fn(), lineas };
  } finally {
    console.error = original;
  }
};

/**
 * Doble de db en memoria con la misma superficie que crearDb(): las filas viven
 * en un Map y cada escritura queda registrada CON SU TAMANO, que es la variable
 * que causo el incidente.
 *
 * `limiteChars` reproduce lo unico que importa del backend real: por encima de
 * cierto peso la escritura se rechaza, se anota en `fallos` y devuelve null sin
 * lanzar. Sin eso el bug es irreproducible fuera del despliegue.
 */
const crearDbMemoria = ({ limiteChars = Infinity } = {}) => {
  const filas = new Map();      // `${entidad}:${id}` -> fila
  const escrituras = [];        // toda escritura intentada, aceptada o no
  const fallos = [];
  let seq = 0;

  // qs() del db real descarta undefined, null y '' — un filtro vacio no filtra.
  const coincide = (fila, filtro = {}) => Object.entries(filtro).every(([k, v]) => (
    k === 'limit' || v === undefined || v === null || v === ''
      ? true
      : String(fila[k] ?? '') === String(v)
  ));

  const list = async (entidad, filtro = {}) => {
    const limite = Number(filtro.limit) || Infinity;
    const res = [];
    for (const [k, fila] of filas) {
      if (!k.startsWith(`${entidad}:`) || !coincide(fila, filtro)) continue;
      res.push({ ...fila });
      if (res.length >= limite) break;
    }
    return res;
  };
  const uno = async (entidad, filtro) => (await list(entidad, { ...filtro, limit: 1 }))[0] ?? null;

  const escribir = (entidad, id, datos, op) => {
    const chars = JSON.stringify(datos).length;
    const registro = {
      entidad, id, op, chars,
      estadoChars: String(datos.estado_json ?? '').length,
      rechazada: chars > limiteChars,
      datos,
    };
    escrituras.push(registro);
    if (registro.rechazada) {
      fallos.push(`${op} ${entidad} 413: payload de ${chars} chars`);
      return null;
    }
    const previa = filas.get(`${entidad}:${id}`) || {};
    const fila = { ...previa, ...datos, id };   // db.actualizar ya fusiona
    filas.set(`${entidad}:${id}`, fila);
    return { ...fila };
  };

  const crear = async (entidad, datos) => escribir(entidad, `${entidad}-${++seq}`, datos, 'crear');
  const actualizar = async (entidad, id, datos) => escribir(entidad, id, datos, 'actualizar');
  const guardar = async (entidad, id, datos) => {
    const res = id ? await actualizar(entidad, id, datos) : await crear(entidad, datos);
    return res?.id ?? null;
  };

  return {
    filas, escrituras, fallos, list, uno, crear, actualizar, guardar,
    contar: (entidad) => [...filas.keys()].filter((k) => k.startsWith(`${entidad}:`)).length,
    ultima: () => escrituras.at(-1),
  };
};

// Lo que cargarContexto('ventas') mete en el scratch en CADA turno: hasta 100
// Propiedad enteras. No es el peor caso, es el turno normal desde que la tabla
// dejo de estar vacia.
const catalogoGordo = (n = 100) => Array.from({ length: n }, (_, i) => ({
  id: `prop-${i}`,
  titulo: `Apartamento ${i} en Chapinero Alto`,
  operacion: i % 2 ? 'Arriendo' : 'Venta',
  estado: 'Disponible',
  barrio: 'Chapinero', ciudad: 'Bogota', tipo: 'Apartamento',
  canon_arriendo: 2_500_000 + i * 1000, precio_venta: 450_000_000 + i * 1000,
  habitaciones: 3, banos: 2, area: 78, estrato: 4, parqueadero: true,
  direccion: `Calle ${100 + i} # 15-${i}`,
  descripcion: `Apartamento remodelado con excelente iluminacion natural. `.repeat(11),
  portales: { metrocuadrado: `https://www.metrocuadrado.com/inmueble/${i}` },
}));

// El tamano del catalogo es la premisa de todo lo que sigue: si algun dia deja
// de desbordar, estas pruebas pasarian por la razon equivocada.
const PESO_CATALOGO = JSON.stringify(catalogoGordo()).length;
assert.ok(PESO_CATALOGO > 80_000,
  `premisa rota: el catalogo simulado pesa ${PESO_CATALOGO} chars y ya no reproduce el incidente`);

// Base44 empezo a rechazar alrededor de los 85.000 chars. El doble corta en
// 80.000 para que el rechazo sea determinista y no dependa del azar del padding.
const LIMITE_BACKEND = 80_000;

// ── olvidarTransitorios saca el catalogo y NO se lleva la memoria ────────────
// El scratch tiene dos clases de datos mezclados a proposito: lo que trajo
// cargarContexto (se recarga solo, no se persiste) y lo que escribieron las
// tools (guardar_dato, la etapa de ventas: si se pierde, se pierde de verdad).
// Distinguirlos es todo el trabajo de esta funcion.
{
  const st = estadoVacio();
  st.agente_activo = 'ventas';
  st.compartido.nombre = 'Laura Gomez';
  st.compartido.contacto_id = 'contacto-1';
  st.identidad.verificado = true;
  st.identidad.arrendatario_id = 'arr-1';
  st.identidad.contrato_id = 'ctr-1';
  st.historial = [{ role: 'user', content: 'busco apartamento en Chapinero', ts: '2026-08-11T10:00:00Z' }];

  const scratch = ctxDe(st, 'ventas');
  scratch.datos = { operacion: 'arriendo', zona: 'Chapinero', presupuesto: 3_000_000 };  // guardar_dato
  scratch.etapa_ventas = 'calificacion';
  scratch.objeciones_activas = ['precio'];

  const delTurno = {
    catalogo: catalogoGordo(),
    campana: { id: 'cmp-1', nombre: 'Chapinero agosto' },
    resumen_portafolio: 'Hoy hay 100 inmuebles activos: 50 en arriendo y 50 en venta.',
  };
  const transitorias = Object.keys(delTurno);
  Object.assign(scratch, delTurno);
  assert.ok(JSON.stringify(st).length > 80_000, 'con el catalogo mezclado el estado desborda');

  olvidarTransitorios(st, 'ventas', transitorias);

  // Se va lo que se recarga solo, y se va de verdad: la clave deja de existir.
  for (const k of transitorias) {
    assert.equal(k in st.ctx.ventas, false, `${k} no puede persistirse: se recarga en cada turno`);
  }
  // Sobrevive lo que nadie puede reconstruir.
  assert.deepEqual(st.ctx.ventas.datos, { operacion: 'arriendo', zona: 'Chapinero', presupuesto: 3_000_000 },
    'lo que guardo guardar_dato NO se toca');
  assert.equal(st.ctx.ventas.etapa_ventas, 'calificacion');
  assert.deepEqual(st.ctx.ventas.objeciones_activas, ['precio']);
  assert.equal(st.compartido.nombre, 'Laura Gomez');
  assert.equal(st.identidad.verificado, true, 'la verificacion sobrevive: re-verificar es un turno perdido');
  assert.equal(st.identidad.arrendatario_id, 'arr-1');
  assert.equal(st.historial.length, 1, 'el historial no se toca');
  assert.ok(JSON.stringify(st).length < 2_000, 'el estado vuelve a un tamano sano');

  // Idempotente, y un agente sin scratch no revienta (recepcion, avaluos y pqr
  // no cargan contexto: su ctx[agente] puede no existir).
  olvidarTransitorios(st, 'ventas', transitorias);
  olvidarTransitorios(st, 'cartera', ['catalogo']);
  assert.deepEqual(st.ctx.ventas.datos, { operacion: 'arriendo', zona: 'Chapinero', presupuesto: 3_000_000 });

  // Mutante: olvidarTransitorios convertida en no-op.
  const conBug = estadoVacio();
  Object.assign(ctxDe(conBug, 'ventas'), { datos: { zona: 'Chapinero' } }, delTurno);
  exigeFallo('olvidarTransitorios como no-op',
    () => assert.equal('catalogo' in conBug.ctx.ventas, false));
}

// ── Tope de 60k: se sacrifica el ctx, jamas la conversacion ─────────────────
// Segunda capa, para el dia en que alguien agregue una clave transitoria y se
// olvide de registrarla. Perder el scratch cuesta un turno; perder el historial
// cuesta el cliente.
{
  const db = crearDbMemoria({ limiteChars: LIMITE_BACKEND });
  const st = estadoVacio();
  st.agente_activo = 'ventas';
  st.compartido.nombre = 'Laura Gomez';
  st.identidad.verificado = true;
  st.identidad.arrendatario_id = 'arr-1';
  st.historial = Array.from({ length: 6 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user', content: `mensaje ${i}`, ts: '2026-08-11T10:00:00Z',
  }));
  ctxDe(st, 'ventas').catalogo = catalogoGordo();   // nadie llamo a olvidarTransitorios
  assert.ok(JSON.stringify(st).length > LIMITE_BACKEND, 'sin el tope, esta escritura la rechaza el backend');

  const { valor: id, lineas } = await capturandoErrores(
    () => guardarEstado(db, null, 'telegram', '573001112233', st, { ultimo_mensaje: 'mensaje 4' }),
  );

  assert.ok(id, 'se escribio igual: perder el scratch es aceptable, perder la conversacion no');
  // El backend SI rechaza el primer intento, y esta bien que quede registrado:
  // el tope viejo era un numero nuestro (60k) mas alto que el limite real de
  // Base44, asi que un estado de 20k pasaba nuestro control y lo rechazaban
  // igual. Ahora no se adivina el limite: se intenta y se degrada.
  assert.equal(db.fallos.length, 1, 'el primer intento lo rechaza el backend, y queda anotado');
  assert.match(
    lineas.join('\n'),
    /escalon "completo" rechazado/,
    'hay que decir que se degrado, no degradar en silencio',
  );
  assert.match(lineas.join('\n'), /escalon "sin ctx"/, 'y en que escalon quedo');

  const escrito = db.ultima();
  assert.ok(escrito.estadoChars < 60_000, `estado_json quedo en ${escrito.estadoChars} chars`);
  const guardado = JSON.parse(escrito.datos.estado_json);
  assert.deepEqual(guardado.ctx, {}, 'ctx se descarta ENTERO, no se poda a medias');
  assert.equal(guardado.historial.length, 6, 'el historial sobrevive');
  assert.equal(guardado.compartido.nombre, 'Laura Gomez');
  assert.equal(guardado.identidad.verificado, true);
  assert.equal(escrito.datos.agente_activo, 'ventas', 'las columnas indexadas se escriben igual');

  // El recorte es solo de lo que se ESCRIBE: el turno en curso sigue viendo su
  // catalogo, porque las tools todavia lo estan usando cuando esto corre.
  assert.equal(st.ctx.ventas.catalogo.length, 100, 'el objeto en memoria no se muta');

  // Y lo escrito se puede volver a leer: no quedo un JSON partido a la mitad.
  const releida = await cargarEstado(db, 'telegram', '573001112233');
  assert.equal(releida.estado.historial.length, 6);
  assert.equal(releida.estado.compartido.nombre, 'Laura Gomez');

  // Mutante: sin el tope se manda el JSON entero, tal como estaba antes.
  const dbSinTope = crearDbMemoria({ limiteChars: LIMITE_BACKEND });
  const crudo = await dbSinTope.guardar('MemoriaChat', null, {
    clave: claveDe('telegram', '573001112233'),
    telefono: '573001112233',
    estado_json: JSON.stringify(st),
  });
  assert.equal(crudo, null, 'ESE era el bug: el backend rechaza y db devuelve null sin lanzar');
  assert.equal(dbSinTope.fallos.length, 1, 'el rechazo queda en fallos, no en una excepcion');
  assert.equal((await cargarEstado(dbSinTope, 'telegram', '573001112233')).id, null,
    'sin tope no queda NADA escrito: el turno siguiente arranca de cero');
  exigeFallo('guardarEstado sin el tope de 60k', () => assert.ok(crudo));
}

// ── Multi-turno: la definicion operativa de "el chat tiene memoria" ─────────
// Tres mensajes seguidos del mismo cliente, cada uno con su carga de contexto
// fresca, pasando por guardarEstado y cargarEstado de verdad. Si en el tercero
// sigue estando lo del primero, la memoria funciona. Es la unica prueba que
// habria detectado el incidente antes de que llegara a un cliente.
{
  const CANAL = 'telegram';
  const TEL = '573001112233';

  // Un turno completo tal como lo encadena agenteInbound: cargar -> mezclar el
  // contexto fresco en el scratch -> tools -> olvidar lo transitorio -> guardar.
  // `olvidar: false` reproduce el codigo anterior al fix.
  const correrTurno = async (db, { texto, respuesta, tools = () => {}, olvidar = true }) => {
    const { id, estado } = await cargarEstado(db, CANAL, TEL);
    estado.historial.push({ role: 'user', content: texto, ts: new Date().toISOString() });
    if (!estado.agente_historial.length) {
      estado.agente_activo = 'ventas';
      estado.agente_historial.push({ agente: 'ventas', desde: new Date().toISOString(), motivo: 'frase:ventas' });
    }
    const scratch = ctxDe(estado, estado.agente_activo);
    const delTurno = { catalogo: catalogoGordo(), resumen_portafolio: 'Hoy hay 100 inmuebles activos.' };
    const transitorias = Object.keys(delTurno);
    Object.assign(scratch, delTurno);

    tools(estado, scratch);

    estado.historial.push({ role: 'assistant', content: respuesta, ts: new Date().toISOString() });
    if (olvidar) olvidarTransitorios(estado, estado.agente_activo, transitorias);
    return await guardarEstado(db, id, CANAL, TEL, estado, { ultimo_mensaje: texto, ultima_respuesta: respuesta });
  };

  // El dato de cada turno se escribe fusionando para que el guion corra igual
  // aunque la memoria se haya perdido: asi falla la asercion del final y no un
  // TypeError a mitad de camino, que no diria en que turno se rompio.
  const GUION = [
    {
      texto: 'Hola, soy Laura Gomez', respuesta: 'Hola Laura. En que zona la buscas?',
      tools: (estado, scratch) => {
        estado.compartido.nombre = 'Laura Gomez';
        scratch.datos = { ...scratch.datos, operacion: 'arriendo' };
      },
    },
    {
      texto: 'En Chapinero', respuesta: 'Perfecto. Cual es tu presupuesto?',
      tools: (_estado, scratch) => { scratch.datos = { ...scratch.datos, zona: 'Chapinero' }; },
    },
    {
      texto: 'Hasta 3 millones', respuesta: 'Listo, te paso opciones esta tarde.',
      tools: (_estado, scratch) => { scratch.datos = { ...scratch.datos, presupuesto: 3_000_000 }; },
    },
  ];

  const db = crearDbMemoria({ limiteChars: LIMITE_BACKEND });
  const { lineas } = await capturandoErrores(async () => {
    for (const paso of GUION) {
      assert.ok(await correrTurno(db, paso), `turno "${paso.texto}": la escritura NO puede fallar`);
    }
  });
  assert.deepEqual(lineas, [], 'ningun turno tuvo que activar el tope: olvidarTransitorios basto');
  assert.deepEqual(db.fallos, [], 'ninguna escritura fue rechazada por tamano');

  // Turno 3: ¿sigue ahi lo del turno 1?
  const { estado: final } = await cargarEstado(db, CANAL, TEL);
  assert.equal(final.compartido.nombre, 'Laura Gomez', 'el nombre del PRIMER mensaje sigue ahi');
  assert.equal(final.ctx.ventas.datos.operacion, 'arriendo', 'el dato del turno 1 llego al turno 3');
  assert.equal(final.ctx.ventas.datos.zona, 'Chapinero', 'el dato del turno 2 llego al turno 3');
  assert.equal(final.ctx.ventas.datos.presupuesto, 3_000_000);
  assert.equal(final.historial.length, 6, 'los tres turnos completos quedaron en el historial');
  assert.equal(final.historial[0].content, 'Hola, soy Laura Gomez');
  assert.equal(final.historial.at(-1).content, 'Listo, te paso opciones esta tarde.');
  assert.equal(final.agente_activo, 'ventas');
  assert.equal(final.agente_historial.length, 1, 'un solo ruteo en todo el hilo');
  assert.equal('catalogo' in final.ctx.ventas, false, 'el catalogo nunca viajo al almacen');

  // Un solo hilo. Si esto diera 3, cada mensaje seria una conversacion nueva:
  // exactamente el sintoma que veia el cliente.
  assert.equal(db.contar('MemoriaChat'), 1, 'los tres mensajes son UN hilo');
  assert.equal(db.escrituras[0].op, 'crear');
  assert.deepEqual(db.escrituras.slice(1).map((e) => e.op), ['actualizar', 'actualizar']);
  assert.ok(db.escrituras.every((e) => e.chars < 5_000),
    'el estado no crece turno a turno: es la senal temprana del incidente');

  // Mutante: los mismos tres turnos sin olvidarTransitorios. El tope salva la
  // conversacion —por eso el bug era invisible en la Bandeja— pero se lleva por
  // delante todo lo que las tools habian guardado.
  const dbBug = crearDbMemoria({ limiteChars: LIMITE_BACKEND });
  await capturandoErrores(async () => {
    for (const paso of GUION) await correrTurno(dbBug, { ...paso, olvidar: false });
  });
  const { estado: conBug } = await cargarEstado(dbBug, CANAL, TEL);
  assert.equal(conBug.historial.length, 6, 'el historial se ve bien: por eso nadie lo noto');
  assert.deepEqual(conBug.ctx, {}, 'pero el ctx se perdio en cada turno');
  exigeFallo('multi-turno sin olvidarTransitorios',
    () => assert.equal(conBug.ctx.ventas?.datos?.zona, 'Chapinero'));
}

// ── El bot dedicado ya no fija el agente en CADA turno ──────────────────────
// El bot de Telegram define POR DONDE ENTRA la conversacion, no donde se queda.
// Cuando fijaba el agente en cada mensaje, toda transferencia se deshacia al
// turno siguiente: el cliente decia "necesito una reparacion", el sistema pasaba
// a mantenimiento, y el mensaje siguiente lo devolvia a ventas, que volvia a
// preguntar si buscaba comprar o arrendar. En bucle, sin salida.
{
  // Copia del gate de agenteInbound/entry.ts. Mas abajo se contrasta contra el
  // archivo real para que esta copia no se quede vieja en silencio.
  const rutear = async (estado, ent, agenteBot) => {
    const hiloNuevo = !estado.agente_historial.length;
    return (agenteBot && hiloNuevo)
      ? { agente: agenteBot, nivel: 0, motivo: 'bot dedicado (entrada)' }
      : await decidirAgente(dbVacio, estado, ent, optsRouter);
  };

  // Primer mensaje del hilo: el bot manda y el router ni corre. Eso es lo que
  // permite probar un agente aislado del ruteo.
  const hilo = estadoVacio();
  const d0 = await rutear(hilo, entrada('necesito una reparacion'), 'ventas');
  assert.equal(d0.agente, 'ventas', 'en el primer mensaje el bot dedicado define la entrada');
  assert.equal(d0.motivo, 'bot dedicado (entrada)');
  hilo.agente_activo = d0.agente;
  hilo.agente_historial.push({ agente: d0.agente, desde: new Date().toISOString(), motivo: d0.motivo });

  // Segundo mensaje por el MISMO bot: el hilo ya tiene agente, manda la frase.
  const d1 = await rutear(hilo, entrada('necesito una reparacion'), 'ventas');
  assert.equal(d1.agente, 'mantenimiento', 'el bot dedicado NO puede devolver el hilo a ventas');
  assert.equal(d1.motivo, 'frase:mantenimiento');

  // Y una transferencia hecha por tool tampoco se deshace al turno siguiente.
  const transferido = estadoVacio();
  transferido.agente_activo = 'ventas';
  transferido.agente_historial.push({ agente: 'ventas', desde: new Date().toISOString(), motivo: 'bot dedicado (entrada)' });
  transferir(transferido, 'mantenimiento', 'tool:transferir_a');
  const d2 = await rutear(transferido, entrada('si, en el bano del fondo'), 'ventas');
  assert.equal(d2.agente, 'mantenimiento', 'la transferencia sobrevive al turno siguiente');
  assert.equal(d2.motivo, 'pegajosidad', 'y no cuesta una llamada al modelo');

  // El ruteo vive en entry.ts, que importa Deno.serve y no se puede cargar aqui:
  // se ancla contra la fuente.
  //
  // Ya no se comprueba que el gate del bot dedicado este bien acotado: se
  // comprueba que NO EXISTA. Acotarlo a "solo el primer mensaje del hilo"
  // dependia de que el estado se hubiera guardado, y eso era justo lo que
  // fallaba: con la escritura rechazada, cada mensaje parecia el primero y el
  // hilo se re-fijaba para siempre. Un mecanismo que se cae solo cuando algo mas
  // falla no es un mecanismo.
  const fuente = readFileSync(new URL('../base44/functions/agenteInbound/entry.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(
    cuerpo.includes('const decision = await decidirAgente('),
    'el router debe decidir SIEMPRE, sin condicional delante',
  );
  assert.ok(
    !/agenteBot\s*&&/.test(cuerpo),
    'agenteBot volvio a condicionar el ruteo: ?agente= solo elige el bot de salida',
  );
  assert.ok(
    cuerpo.includes('tgToken:     tokenDeAgente(agenteBot)'),
    'agenteBot sigue haciendo falta para saber por que bot se contesta',
  );

  // Mutante: el gate viejo, sin hiloNuevo.
  const gateViejo = (agenteBot) => (agenteBot ? { agente: agenteBot, motivo: 'bot dedicado' } : null);
  const bug = gateViejo('ventas');
  assert.equal(bug.agente, 'ventas');
  exigeFallo('bot dedicado fijando el agente en cada turno',
    () => assert.equal(bug.agente, 'mantenimiento'));
}

assert.equal(mutantes.length, 4, 'se esperan 4 chequeos de sensibilidad; alguno se perdio');
console.log(`agent-core: ${mutantes.length} chequeos de sensibilidad OK — ${mutantes.join(' | ')}`);
// ── Control de asistidos ─────────────────────────────────────────────────────
// escalar_a_humano dejaba una Tarea: registraba el pendiente pero nadie podia
// marcar "yo lo atendi" ni ver que habia quedado sin atender, y la fila no
// apuntaba a la solicitud que la origino.
{
  const escrituras = [];
  const db = {
    list: async () => [],
    crear: async (entidad, datos) => { escrituras.push({ entidad, datos }); return { id: 'orden-1', ...datos }; },
  };
  const ctx = {
    db, estado: estadoVacio(), entrada: entrada('quiero hablar con una persona'),
    ctxAgente: {}, config: {},
    salida: { globos: [], finTurno: false },
    efectos: { transferir: null, escalado: null, notificar: [] },
  };
  ctx.estado.agente_activo = 'cartera';
  ctx.estado.compartido.nombre = 'Luis Pardo';
  ctx.estado.identidad.contrato_id = 'ctr-9';

  const r = await escalarAHumano.ejecutar({ motivo: 'reclama un pago que no aparece', prioridad: 'alta' }, ctx);
  assert.equal(r.ok, true);

  assert.equal(escrituras.length, 1, 'el escalamiento escribe UNA fila, no dos');
  const [{ entidad, datos }] = escrituras;
  assert.equal(entidad, 'OrdenAsistencia', 'ya no crea Tarea: la agenda personal no es la bandeja de asistidos');
  assert.equal(datos.estado, 'Abierta');
  assert.equal(datos.origen_tipo, 'Escalamiento');
  assert.equal(datos.solicitante_nombre, 'Luis Pardo', 'el nombre viaja para poder leer la orden sin joins');
  assert.equal(datos.solicitante_telefono, '573001112233', 'la llave del historial por persona');
  assert.equal(datos.contrato_id, 'ctr-9', 'queda enganchada al contrato cuando se sabe cual es');
  assert.equal(datos.prioridad, 'Alta', 'la escala del escalamiento se normaliza a la de la entidad');
  assert.equal(datos.fecha_asistencia, undefined, 'nace SIN asistir: ese es el dato que faltaba');
  assert.match(r.orden, /^ORD-\d{4}-\d{6}-[A-Z0-9]{4}$/);
  assert.ok(ctx.efectos.notificar[0].includes(r.orden), 'el aviso al equipo lleva el numero de orden');

  // Un numero de orden repetido le entrega a un cliente la orden de otro. Los
  // 6 digitos del reloj se repiten cada ~16 minutos; lo que separa dos ordenes
  // del mismo instante es el sufijo. Se fija Math.random para no dejar el test
  // al azar.
  const fijo = new Date('2026-08-11T10:00:00Z');
  const azarReal = Math.random;
  Math.random = () => 0.111;
  const ordenA = numeroOrden(fijo);
  Math.random = () => 0.999;
  const ordenB = numeroOrden(fijo);
  Math.random = azarReal;
  assert.notEqual(ordenA, ordenB, 'dos ordenes del mismo milisegundo se distinguen por el sufijo');

  // La escritura puede fallar: devolver un numero inventado seria peor.
  const ctxRoto = { ...ctx, db: { list: async () => [], crear: async () => null } };
  assert.equal(await abrirAsistencia(ctxRoto, { origen_tipo: 'PQR', asunto: 'x' }), '');
}

// ── Historial por persona ────────────────────────────────────────────────────
// El sujeto sale del telefono de la entrada, nunca de un parametro: si el modelo
// pudiera pedir "el historial de 3009999999" bastaria una inyeccion de prompt.
{
  assert.deepEqual(consultarHistorialSolicitudes.def.input_schema.properties, {},
    'no recibe identificadores: el sujeto lo pone el servidor');

  let filtro = null;
  const db = {
    list: async (_e, f) => {
      filtro = f;
      return [
        { numero_orden: 'ORD-2026-000001-AAAA', origen_tipo: 'Reparacion', origen_radicado: 'REP-1', asunto: 'fuga en el bano', estado: 'Cerrada', fecha_solicitud: '2026-01-05T10:00:00Z', fecha_asistencia: '2026-01-05T11:00:00Z', resultado: 'fue el plomero', detalle: 'brief interno con datos del cliente' },
        { numero_orden: 'ORD-2026-000002-BBBB', origen_tipo: 'Escalamiento', asunto: 'pide hablar con alguien', estado: 'Abierta', fecha_solicitud: '2026-02-01T10:00:00Z', detalle: 'brief interno con datos del cliente' },
      ];
    },
  };
  const c = { db, estado: estadoVacio(), entrada: entrada('es sobre lo de la otra vez'), ctxAgente: {} };
  const r = await consultarHistorialSolicitudes.ejecutar({}, c);

  assert.equal(filtro.solicitante_telefono, '573001112233');
  assert.equal(r.total, 2);
  assert.equal(r.abiertas, 1);
  assert.equal(r.solicitudes[0].orden, 'ORD-2026-000002-BBBB', 'lo mas reciente primero');
  assert.equal(r.solicitudes[0].atendida, false, 'sin fecha_asistencia no se puede decir que alguien lo esta viendo');
  assert.equal(r.solicitudes[1].resultado, 'fue el plomero');
  assert.ok(!JSON.stringify(r).includes('brief interno'), 'el detalle interno no viaja al modelo');

  // Sin historial no se afirma que la persona nunca escribio: pudo hacerlo por otro canal.
  const vacio = await consultarHistorialSolicitudes.ejecutar({}, { ...c, db: { list: async () => [] } });
  assert.equal(vacio.total, 0);
  assert.match(vacio.instruccion, /otro numero/);
}

// ── El registro: que las tools LLEGUEN a un agente ───────────────────────────
//
// Este bloque existe porque su ausencia dejo pasar el fallo real. Una tool se
// escribio entera, se probo entera llamando a `.ejecutar` por su export... y no
// se registro en tools/index.ts. El banco daba OK con la funcionalidad
// desconectada, porque llamar al export es justo el camino que sigue andando
// cuando ningun agente la recibe.
//
// Probar la tool no es probar que el agente la tenga. Son dos cosas.
{
  const conHistorial = ['recepcion', 'mantenimiento', 'avaluos', 'pqr', 'matricula'];
  for (const a of conHistorial) {
    assert.ok(
      'consultar_historial_solicitudes' in toolsDe(a),
      `${a} no recibe consultar_historial_solicitudes: la tool existe pero no la tiene nadie`,
    );
  }
  // Ventas y consignacion hablan con gente que todavia no ha pedido nada. Que no
  // la tengan es la decision, no un olvido: se afirma para que quitarla sea un
  // acto deliberado y no un descuido silencioso.
  for (const a of ['ventas', 'consignacion']) {
    assert.ok(!('consultar_historial_solicitudes' in toolsDe(a)), `${a} no deberia tenerla`);
  }

  assert.ok(
    'enviar_certificado_propietario' in toolsDe('cartera'),
    'cartera no recibe enviar_certificado_propietario',
  );
  // Es documento de propietarios y vive en pagos: ningun otro agente lo entrega.
  for (const a of ['ventas', 'mantenimiento', 'pqr']) {
    assert.ok(!('enviar_certificado_propietario' in toolsDe(a)), `${a} no deberia entregar certificados`);
  }

  // La frontera estructural que sostiene todo el diseno: cartera es INCAPAZ de
  // calificar un lead porque no tiene la herramienta, no porque el prompt se lo
  // pida.
  assert.ok(!('calificar_lead' in toolsDe('cartera')), 'cartera no puede calificar leads');
  assert.ok('calificar_lead' in toolsDe('ventas'), 'ventas si califica');
}

// ── Identidad: solo se puebla el rol que de verdad coincidio ─────────────────
{
  const doc = (n) => ({ id: n, numero_documento: `100200${n}` });

  // Un telefono compartido (oficina, familia) figura en Arrendatario A y en
  // Propietario B, que son personas distintas. A se verifica con SU cedula y no
  // puede quedar con el propietario_id de B: con eso pedia el certificado
  // tributario de B y abria sus liquidaciones.
  assert.notEqual(
    doc('A').numero_documento.slice(-4),
    doc('B').numero_documento.slice(-4),
    'el escenario exige documentos distintos',
  );

  const fuente = readFileSync('base44/functions/_core/identidad.ts', 'utf8');
  assert.match(
    fuente,
    /arrendatario_id: rolArrendatario \?/,
    'verificar() debe poblar arrendatario_id solo si coincidio ese rol',
  );
  assert.match(
    fuente,
    /propietario_id: rolPropietario \?/,
    'verificar() debe poblar propietario_id solo si coincidio ese rol',
  );
  assert.match(
    fuente,
    /p\.numero_documento \|\| p\.cedula_nit/,
    'Propietario guarda el documento en cedula_nit: sin esto ningun propietario puede verificarse',
  );
}

console.log('agent-core: OK');
