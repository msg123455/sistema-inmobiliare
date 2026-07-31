#!/usr/bin/env node
import assert from 'node:assert/strict';
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
import { responder } from '../base44/functions/_core/tools/comunes.ts';
import {
  POLITICA_VERSION, debeAvisar, marcaAutorizacion, textoAviso,
} from '../base44/functions/_core/privacidad.ts';
import { estadoVacio } from '../base44/functions/_core/state.ts';
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

console.log('agent-core: OK');
