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

console.log('agent-core: OK');
