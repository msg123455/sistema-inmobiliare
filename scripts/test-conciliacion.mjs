#!/usr/bin/env node
/**
 * Pruebas del motor de conciliacion de codigos de barras.
 *
 * Es la unica pieza del sistema que DEBE tener pruebas: es donde vive la
 * garantia de que a cada inquilino le llega su codigo y no el de otro.
 *
 * Los casos no son inventados. Cada bloque marcado [AGOSTO] reproduce un
 * defecto que de verdad salio por correo en el envio de agosto de 2025. Los
 * datos son sinteticos a proposito —el listado real trae nombre, correo y
 * cedula de 596 personas y eso no entra a un repositorio— pero la forma del
 * defecto es la misma. Para correrlo sobre datos reales: scripts/auditar-envio.mjs
 */
import assert from 'node:assert/strict';
import {
  conciliar, construirDirectorio, correoValido, leerNombreArchivo, normCodigo,
} from '../src/lib/conciliar.js';

// ── Lectura del nombre de archivo ────────────────────────────────────────────
// El identificador viene en el nombre, no dentro del PDF. Verificado contra los
// 596 archivos de agosto: el patron encaja en todos.
{
  assert.deepEqual(leerNombreArchivo('90_Ago3976.02.pdf'),
    { archivo: '90_Ago3976.02.pdf', oficina: '90', mes: 8, codigo: '3976', renovacion: '02' });

  // Sin sufijo de renovacion: son los contratos recien firmados.
  assert.deepEqual(leerNombreArchivo('90_Ago3984.pdf'),
    { archivo: '90_Ago3984.pdf', oficina: '90', mes: 8, codigo: '3984', renovacion: '' });

  // Llega la URL entera de Mailchimp, no solo el nombre.
  assert.equal(leerNombreArchivo('https://mcusercontent.com/abc/files/uuid/90_Ago22.02.pdf').codigo, '22');

  assert.equal(leerNombreArchivo('90_Ene1.pdf').mes, 1);
  assert.equal(leerNombreArchivo('90_Dic1.pdf').mes, 12);

  // Lo que no encaja devuelve null. No se adivina: un nombre que no se entiende
  // es una excepcion para que alguien la mire, nunca un emparejamiento a ciegas.
  assert.equal(leerNombreArchivo('recibo (1).pdf'), null);
  assert.equal(leerNombreArchivo('90_Xyz100.pdf'), null, 'mes inexistente');
  assert.equal(leerNombreArchivo(''), null);
  assert.equal(leerNombreArchivo(null), null);
}

// ── Normalizacion de la clave ────────────────────────────────────────────────
{
  assert.equal(normCodigo(' 3976 '), '3976');
  assert.equal(normCodigo('00123'), '123', 'Excel se come los ceros a la izquierda');
  assert.equal(normCodigo('90-123_4'), '901234');
  assert.equal(normCodigo('000'), '0', 'no puede quedar cadena vacia');
  assert.equal(normCodigo(null), '');
}

// ── Validacion de correo ─────────────────────────────────────────────────────
{
  assert.ok(correoValido('juan@gmail.com'));
  assert.ok(correoValido('facturacion.electronica@labiferia.com.co'));
  // [AGOSTO] Este correo salio en el envio real y rebotó: le falta el punto.
  assert.equal(correoValido('sistemas1@inmobiliarelatamcom'), false);
  assert.equal(correoValido('sin-arroba.com'), false);
  assert.equal(correoValido(''), false);
}

// ── Camino feliz ─────────────────────────────────────────────────────────────
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago22.02.pdf', url: 'https://mc/22' },
      { nombre: '90_Ago30.03.pdf', url: 'https://mc/30' },
    ],
    directorio: [
      { codigo: '22', nombre: 'Fuller Machinery', email: 'a@ejemplo.com', documento: '900204112' },
      { codigo: '30', nombre: 'David Montano', email: 'b@ejemplo.com', documento: '14398868' },
    ],
    opciones: { mesEsperado: 8 },
  });

  assert.equal(r.bloqueos.length, 0, 'un lote limpio no bloquea');
  assert.equal(r.emparejados.length, 2);
  assert.equal(r.resumen.enviables, 2);
  assert.equal(r.emparejados[0].url, 'https://mc/22');
  assert.equal(r.emparejados[0].nombre, 'Fuller Machinery');
  assert.ok(r.emparejados.every((e) => e.enviable));
}

// ── [AGOSTO] Un correo con dos contratos ─────────────────────────────────────
// Le paso a cuatro inquilinos: Ropa Fuerte, Green Technology, Vega Rodriguez y
// Tavera Rodriguez, cada uno con dos inmuebles. Un contacto de Mailchimp guarda
// UN valor por merge field, asi que cada uno recibio uno de sus dos codigos y
// el otro se perdio sin que saltara ningun error.
//
// No bloquea: sale de la campana masiva y va a un correo aparte con la lista
// completa. Lo que no puede pasar nunca es que entre a la campana con uno solo.
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago167.03.pdf', url: 'https://mc/167' },
      { nombre: '90_Ago194.02.pdf', url: 'https://mc/194' },
      { nombre: '90_Ago200.01.pdf', url: 'https://mc/200' },
    ],
    directorio: [
      { codigo: '167', nombre: 'Ropa Fuerte', email: 'dos@ejemplo.com', documento: '800053470' },
      { codigo: '194', nombre: 'Ropa Fuerte', email: 'dos@ejemplo.com', documento: '800053470' },
      { codigo: '200', nombre: 'Uno Solo', email: 'uno@ejemplo.com', documento: '123' },
    ],
  });

  assert.equal(r.bloqueos.length, 0, 'tener dos inmuebles no es un error');
  assert.equal(r.campana.length, 1, 'a la campana masiva solo va quien tiene un contrato');
  assert.equal(r.campana[0].email, 'uno@ejemplo.com');

  assert.equal(r.multiContrato.length, 1);
  assert.equal(r.multiContrato[0].email, 'dos@ejemplo.com');
  assert.equal(r.multiContrato[0].codigos.length, 2, 'van SUS DOS codigos, no uno');
  assert.deepEqual(r.multiContrato[0].codigos.map((c) => c.clave).sort(), ['167', '194']);

  // Ni un solo codigo se pierde entre los dos grupos: ese es el invariante.
  assert.equal(r.campana.length + r.resumen.codigosEnMultiContrato, r.resumen.enviables);
}

// ── Tres o mas contratos tampoco pierden ninguno ─────────────────────────────
// Con merge fields numerados (CODURL2, CODURL3) quien tuviera uno mas de los
// previstos volveria a perder un codigo en silencio. Agrupar no tiene tope.
{
  const r = conciliar({
    archivos: [1, 2, 3, 4].map((n) => ({ nombre: `90_Ago${n}.pdf`, url: `https://mc/${n}` })),
    directorio: [1, 2, 3, 4].map((n) => ({
      codigo: String(n), nombre: 'Con cuatro locales', email: 'cuatro@ejemplo.com', documento: '9',
    })),
  });
  assert.equal(r.multiContrato.length, 1);
  assert.equal(r.multiContrato[0].codigos.length, 4);
  assert.equal(r.campana.length, 0);
}

// ── [AGOSTO] La misma URL a varios destinatarios ─────────────────────────────
// La URL de Surgivasc SAS (90_Ago3976.pdf) se envio ademas a cuatro empleados de
// la oficina: la celda de la ultima fila arrastrada hacia abajo en Excel. Es el
// fallo que la revision manual existe para evitar, y aun asi paso.
{
  const r = conciliar({
    archivos: [{ nombre: '90_Ago3976.pdf', url: 'https://mc/3976' }],
    directorio: [
      { codigo: '3976', nombre: 'Surgivasc', email: 'cliente@ejemplo.com', documento: '900508302' },
    ],
  });
  assert.equal(r.bloqueos.length, 0, 'una URL con un solo destinatario esta bien');

  // Ahora el caso real: la misma URL pegada en filas de otras personas.
  const conFuga = conciliar({
    archivos: [
      { nombre: '90_Ago3976.pdf', url: 'https://mc/3976' },
      { nombre: '90_Ago3977.pdf', url: 'https://mc/3976' },   // <- URL repetida
    ],
    directorio: [
      { codigo: '3976', nombre: 'Surgivasc', email: 'cliente@ejemplo.com', documento: '900508302' },
      { codigo: '3977', nombre: 'Empleado Oficina', email: 'cartera@ejemplo.com', documento: '111' },
    ],
  });
  const b = conFuga.bloqueos.find((x) => x.tipo === 'url_compartida');
  assert.ok(b, 'la misma URL hacia dos personas tiene que BLOQUEAR');
  assert.match(b.detalle, /2 destinatarios/);
}

// ── Dos archivos para el mismo contrato ──────────────────────────────────────
// No hay forma de saber cual es el bueno. Elegir uno al azar es exactamente el
// fallo que hay que evitar, asi que se para.
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago500.01.pdf', url: 'https://mc/a' },
      { nombre: '90_Ago500.02.pdf', url: 'https://mc/b' },
    ],
    directorio: [{ codigo: '500', nombre: 'X', email: 'x@ejemplo.com', documento: '1' }],
  });
  const b = r.bloqueos.find((x) => x.tipo === 'codigo_duplicado_en_archivos');
  assert.ok(b, 'dos archivos del mismo contrato tienen que BLOQUEAR');
  assert.match(b.detalle, /90_Ago500\.01\.pdf/);
}

// ── Colision al normalizar ───────────────────────────────────────────────────
// Quitar los ceros a la izquierda es necesario porque Excel se los come, pero
// abre la puerta a que dos codigos distintos colapsen. Se bloquea, no se fusiona.
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago0123.pdf', url: 'https://mc/a' },
      { nombre: '90_Ago123.pdf', url: 'https://mc/b' },
    ],
    directorio: [{ codigo: '123', nombre: 'X', email: 'x@ejemplo.com', documento: '1' }],
  });
  assert.ok(r.bloqueos.some((x) => x.tipo === 'colision_al_normalizar'));
}

// ── Un contrato con dos inquilinos en el directorio ──────────────────────────
{
  const r = conciliar({
    archivos: [{ nombre: '90_Ago77.pdf', url: 'https://mc/77' }],
    directorio: [
      { codigo: '77', nombre: 'Antiguo', email: 'viejo@ejemplo.com', documento: '111' },
      { codigo: '77', nombre: 'Nuevo', email: 'nuevo@ejemplo.com', documento: '222' },
    ],
  });
  assert.ok(r.bloqueos.some((x) => x.tipo === 'contrato_con_varios_inquilinos'),
    'si el directorio esta en conflicto no se puede enviar');
}

// ── Balance de doble entrada ─────────────────────────────────────────────────
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago1.pdf', url: 'https://mc/1' },     // contrato nuevo
      { nombre: '90_Ago2.pdf', url: 'https://mc/2' },
      { nombre: 'basura.pdf', url: 'https://mc/x' },      // nombre irreconocible
      { nombre: '90_Jul9.pdf', url: 'https://mc/9' },     // mes equivocado
    ],
    directorio: [
      { codigo: '2', nombre: 'Si tiene', email: 'ok@ejemplo.com', documento: '2' },
      { codigo: '3', nombre: 'Sin archivo', email: 'z@ejemplo.com', documento: '3' },
    ],
    opciones: { mesEsperado: 8 },
  });

  assert.equal(r.excepciones.archivoSinInquilino.length, 1, 'contrato nuevo sin inquilino conocido');
  assert.equal(r.excepciones.inquilinoSinArchivo.length, 1, 'inquilino sin codigo este mes');
  assert.equal(r.excepciones.nombreNoReconocido.length, 1);
  assert.equal(r.excepciones.mesDistinto.length, 1, 'se subio la carpeta del mes pasado');
  assert.equal(r.emparejados.length, 1);
  assert.equal(r.bloqueos.length, 0, 'las excepciones avisan, no bloquean');
}

// ── Correo faltante o invalido no es enviable ────────────────────────────────
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago10.pdf', url: 'https://mc/10' },
      { nombre: '90_Ago11.pdf', url: 'https://mc/11' },
    ],
    directorio: [
      { codigo: '10', nombre: 'Sin correo', email: '', documento: '1' },
      { codigo: '11', nombre: 'Correo roto', email: 'sistemas1@inmobiliarelatamcom', documento: '2' },
    ],
  });
  assert.equal(r.excepciones.sinCorreo.length, 1);
  assert.equal(r.excepciones.correoInvalido.length, 1);
  assert.equal(r.resumen.enviables, 0, 'ninguno de los dos puede recibir el correo');
  assert.equal(r.emparejados.length, 2, 'pero si quedan emparejados, para poder reportarlos');
}

// ── Construccion del directorio desde un envio pasado ────────────────────────
// La columna Contrato del Excel viene vacia (0 de 596 filas en agosto), asi que
// el unico sitio donde vive contrato->inquilino es a quien se le mando el mes
// pasado. De ahi sale el directorio de arranque.
{
  const { entradas, descartadas, conflictos } = construirDirectorio([
    { Id: '900204112', Nombre: 'Fuller Machinery', Correo: 'a@ejemplo.com', Archivo: 'https://mc/x/90_Ago22.02.pdf' },
    { Id: '14398868', Nombre: 'David Montano', Correo: 'b@ejemplo.com', Archivo: 'https://mc/x/90_Ago30.03.pdf' },
    { Id: '', Nombre: '', Correo: '', Archivo: '' },                                    // fila vacia de Excel
    { Id: '999', Nombre: 'Raro', Correo: 'c@ejemplo.com', Archivo: 'https://mc/x/x.pdf' }, // no reconocido
  ]);

  assert.equal(entradas.length, 2);
  assert.equal(descartadas.length, 1);
  assert.equal(conflictos.length, 0);
  assert.equal(entradas[0].clave, '22');
  assert.equal(entradas[0].documento, '900204112');

  // La misma persona repetida en el mismo contrato no es conflicto.
  const r2 = construirDirectorio([
    { Id: '1', Nombre: 'A', Correo: 'a@ejemplo.com', Archivo: '90_Ago5.pdf' },
    { Id: '1', Nombre: 'A', Correo: 'a@ejemplo.com', Archivo: '90_Ago5.pdf' },
  ]);
  assert.equal(r2.conflictos.length, 0);
  assert.equal(r2.entradas.length, 1);

  // Dos personas distintas en el mismo contrato si lo es.
  const r3 = construirDirectorio([
    { Id: '1', Nombre: 'A', Correo: 'a@ejemplo.com', Archivo: '90_Ago5.pdf' },
    { Id: '2', Nombre: 'B', Correo: 'b@ejemplo.com', Archivo: '90_Ago5.pdf' },
  ]);
  assert.equal(r3.conflictos.length, 1);
}

// ── Senales de diagnostico ───────────────────────────────────────────────────
// No bloquean: dicen donde mirar. Si SIMI cambia el formato el mes que viene,
// esto lo convierte en un aviso con nombre en vez de en 600 correos malos.
{
  const r = conciliar({
    archivos: [
      { nombre: '90_Ago10.pdf', url: 'u1' },
      { nombre: '90_Ago20.pdf', url: 'u2' },
      { nombre: '90_Ago15.pdf', url: 'u3' },    // rompe el orden ascendente
      { nombre: '91_Ago30.pdf', url: 'u4' },    // otra oficina
    ],
    directorio: [],
  });
  assert.equal(r.senales.rupturasDeOrden, 1);
  assert.ok(r.senales.variasOficinas, 'mezclar oficinas en un lote es sospechoso');
  assert.deepEqual(r.senales.oficinas.sort(), ['90', '91']);
}

// ── Entradas vacias no revientan ─────────────────────────────────────────────
{
  const r = conciliar({});
  assert.equal(r.emparejados.length, 0);
  assert.equal(r.bloqueos.length, 0);
  assert.equal(r.resumen.archivos, 0);
}

console.log('conciliacion: OK');
