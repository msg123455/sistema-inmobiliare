// ─────────────────────────────────────────────────────────────────────────────
// test-simi-mapeo — comprueba que lo que manda SIMI llega bien a Propiedad
//
// Por que existe: la API devuelve numeros en TRES formatos y dos se contradicen
// dentro de la misma respuesta. "1.500.000" son un millon y medio de pesos y
// "217.57" son doscientos diecisiete metros. Un parser unico lee bien uno y
// convierte el otro en 1,5 —o en 21.757— sin lanzar ningun error.
//
// Eso no lo atrapa un typecheck ni se ve en la pantalla: queda un inmueble con
// administracion de 1,5 pesos que el agente le cotiza a un cliente.
//
// Los fixtures son respuestas REALES guardadas de la API, no inventadas. Si
// SIMI cambia el formato, este test se cae; ese es justamente su trabajo.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

// ── Cargar las funciones puras del entry ─────────────────────────────────────
//
// El entry es un script de Deno con `Deno.serve` al final. Se corta antes del
// handler y se le da un `Deno` de mentira: lo que queda son funciones puras.
//
// Los tipos los quita esbuild, el mismo que usa el empaquetador. Hacerlo con
// expresiones regulares parecia mas simple y no lo es: un `(f: any) =>` dentro
// de un `.filter()` ya no encaja en el patron y el eval revienta con un error
// de sintaxis que no dice nada sobre el codigo de verdad.

const fuente = readFileSync(join(raiz, 'base44/functions/sincronizarSimi/entry.ts'), 'utf8');
const corte = fuente.indexOf('// ── Handler ──');
if (corte < 0) throw new Error('No se encontro el corte del handler en entry.ts');

const { code: puras } = transformSync(fuente.slice(0, corte), {
  loader: 'ts',
  format: 'cjs',
  target: 'node20',
});

const Deno = { env: { get: () => '' }, serve: () => {} };
const fn = new Function('Deno', 'exports', `${puras}\nreturn { desdeLista, desdeDetalle, numLista, numMoneda, numMedida, portalesDe, clavePortal, bool };`);
const M = fn(Deno, {});

// ── Comprobaciones ───────────────────────────────────────────────────────────

let fallos = 0;
const ok = (cond, etiqueta, detalle = '') => {
  if (cond) return;
  fallos++;
  console.error(`  FALLA  ${etiqueta}${detalle ? `\n         ${detalle}` : ''}`);
};

const listado = JSON.parse(readFileSync(join(aqui, 'fixtures/simi-listado.json'), 'utf8'));
const detalles = JSON.parse(readFileSync(join(aqui, 'fixtures/simi-detalle.json'), 'utf8'));

// 1. LOS TRES FORMATOS DE NUMERO ─────────────────────────────────────────────
// Es la razon de ser de este archivo.

ok(M.numMoneda('1.500.000') === 1500000, 'moneda con PUNTO de miles', `dio ${M.numMoneda('1.500.000')}`);
ok(M.numMoneda('1,600,000,000') === 1600000000, 'moneda con COMA de miles', `dio ${M.numMoneda('1,600,000,000')}`);
ok(M.numMoneda('$ 0') === 0, 'moneda con simbolo y espacio');
ok(M.numMoneda('') === 0 && M.numMoneda(null) === 0, 'moneda vacia -> 0');

ok(M.numMedida('217.57') === 217.57, 'medida con punto DECIMAL', `dio ${M.numMedida('217.57')}`);
ok(Math.abs(M.numMedida('-74.04719000000001') + 74.04719) < 1e-6, 'coordenada negativa');

ok(M.numLista('4,324,250,000') === 4324250000, 'listado con coma de miles');
ok(M.numLista('17,297') === 17297, 'listado: area con coma de miles');

// El cruce que rompe todo: usar el parser del listado sobre dinero del detalle.
ok(M.numLista('1.500.000') !== 1500000,
  'confirmado que numLista NO sirve para el detalle',
  'si algun dia coincidieran, sobra tener dos parsers');

// 2. EL LISTADO -> ESQUELETO ─────────────────────────────────────────────────

const crudos = Array.isArray(listado.Inmuebles) ? listado.Inmuebles : Object.values(listado.Inmuebles);
ok(crudos.length > 0, 'el fixture del listado trae inmuebles');

for (const inm of crudos) {
  const p = M.desdeLista(inm);
  ok(p !== null, `desdeLista devuelve algo para ${inm.Codigo_Inmueble}`);
  if (!p) continue;
  ok(p.codigo_externo === inm.Codigo_Inmueble, 'codigo_externo se conserva');
  ok(p.proveedor === 'simi', 'proveedor = simi');
  ok(typeof p.precio_venta === 'number' && Number.isFinite(p.precio_venta), 'precio_venta numerico');
  ok(p.area_m2 >= 0, 'area_m2 no negativa');
  ok(!!p.titulo, 'titulo no vacio');
}

ok(M.desdeLista({ Codigo_Inmueble: '' }) === null, 'sin codigo se descarta');

// 3. EL DETALLE -> LO QUE EL LISTADO NO TRAE ─────────────────────────────────

const d1 = detalles['90-72965'];
const x1 = M.desdeDetalle(d1);

ok(x1 !== null, 'el detalle se mapea');
ok(x1.direccion === 'CL 86 7 59 AP 104', 'direccion literal de SIMI', `dio ${JSON.stringify(x1.direccion)}`);

// El caso que motivo el test.
ok(x1.administracion === 1500000,
  'administracion "1.500.000" -> 1500000',
  `dio ${x1.administracion} — con el parser del listado habria dado 1.5`);
ok(x1.valor_administracion === x1.administracion, 'los dos campos de administracion coinciden');

ok(x1.area_m2 === 217.57, 'area con decimales', `dio ${x1.area_m2}`);

ok(Array.isArray(x1.fotos) && x1.fotos.length > 1,
  'trae la galeria completa, no una sola foto', `dio ${x1.fotos?.length}`);
ok(x1.fotos.every((f) => f.startsWith('http')), 'todas las fotos son URLs');

ok(x1.portales && Object.keys(x1.portales).length > 0, 'trae links de portales');
for (const [k, v] of Object.entries(x1.portales || {})) {
  ok(v.startsWith('http'), `el link de ${k} es una URL de verdad`, v);
}

ok(Array.isArray(x1.caracteristicas) && x1.caracteristicas.length > 0, 'trae caracteristicas');
ok(x1.caracteristicas.every((c) => c === c.trim() && c.length > 0),
  'las caracteristicas vienen sin espacios de sobra');
ok(new Set(x1.caracteristicas).size === x1.caracteristicas.length, 'caracteristicas sin repetidos');

ok(typeof x1.admon_incluida === 'boolean', 'admon_incluida es booleano');
ok(typeof x1.amoblado === 'boolean', 'amoblado es booleano');

// 4. LA URL SUCIA DE LOS PORTALES ────────────────────────────────────────────
// Llega como "", " " o null segun el portal. Las tres pasan un truthiness mal
// escrito y acaban como un link vacio enviado a un cliente.

const sucio = {
  portales: {
    data: [
      { nombrePortal: 'CienCuadras', urlPortal: 'https://www.ciencuadras.com/inmueble/1' },
      { nombrePortal: 'Fincaraiz', urlPortal: ' ' },
      { nombrePortal: 'Properati', urlPortal: '' },
      { nombrePortal: 'Lamudi', urlPortal: null },
      { nombrePortal: 'Metro Cuadrado', urlPortal: '  https://www.metrocuadrado.com/x  ' },
    ],
  },
};
const ps = M.portalesDe(sucio);
ok(ps.ciencuadras === 'https://www.ciencuadras.com/inmueble/1', 'url buena se guarda');
ok(!('fincaraiz' in ps), 'url de un solo espacio se descarta');
ok(!('properati' in ps), 'url vacia se descarta');
ok(!('lamudi' in ps), 'url null se descarta');
ok(ps.metrocuadrado === 'https://www.metrocuadrado.com/x', 'url con espacios se recorta');

// El normalizador de nombres: "Fincaraíz" con tilde tiene que caer en la misma
// clave que "Fincaraiz" sin ella.
ok(M.clavePortal('Fincaraíz') === 'fincaraiz', 'nombre con tilde -> clave sin tilde');
ok(M.clavePortal('Metro Cuadrado') === 'metrocuadrado', 'nombre con espacio -> clave junta');
ok(M.clavePortal('CienCuadras') === 'ciencuadras', 'mayusculas intercaladas');

// 5. EL CODIGO QUE NO EXISTE ─────────────────────────────────────────────────
// SIMI responde HTTP 200 con {status:1} y tres claves. Tomarlo por bueno
// guardaria un inmueble en blanco encima de uno correcto.

ok(M.desdeDetalle({ status: 1 }) === null, 'respuesta de codigo inexistente -> null');
ok(M.desdeDetalle(null) === null, 'null -> null');
ok(M.desdeDetalle({}) === null, 'objeto vacio -> null');

// 6. EL MERGE NO BORRA ───────────────────────────────────────────────────────
// desdeDetalle solo debe devolver campos con contenido: lo que no venga tiene
// que conservar su valor anterior al mezclarse.

const sinDireccion = { ...d1, Direccion: '   ' };
const x2 = M.desdeDetalle(sinDireccion);
ok(!('direccion' in x2), 'una direccion vacia no viaja en el objeto');
const fusion = { direccion: 'la que ya estaba', ...x2 };
ok(fusion.direccion === 'la que ya estaba', 'al mezclar se conserva la direccion previa');

// 7. TODO LO QUE SE ESCRIBE TIENE QUE EXISTIR EN EL ESQUEMA ──────────────────
//
// Base44 acepta el POST/PUT y descarta en silencio lo que no reconoce. Un campo
// que no este declarado no da error: simplemente nunca se guarda, y se descubre
// semanas despues cuando alguien nota que la columna esta vacia.
//
// check-entidades.mjs ya vigila esto, pero solo mira base44/functions/_core:
// las funciones sueltas como esta quedan fuera de su alcance. De ahi que la
// comprobacion viva aqui, junto al codigo que escribe.

const esquema = JSON.parse(
  readFileSync(join(raiz, 'base44/entities/Propiedad.jsonc'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''),
);
const declarados = new Set(Object.keys(esquema.properties || {}));
const portalesDeclarados = new Set(Object.keys(esquema.properties?.portales?.properties || {}));

const escritos = new Set([
  ...Object.keys(M.desdeLista(crudos[0]) || {}),
  ...Object.keys(x1 || {}),
  // avaluo_catastral solo sale cuando SIMI manda un valor mayor que cero, y el
  // fixture trae '$ 0'. Se anade a mano para que igual quede vigilado.
  'avaluo_catastral',
]);

for (const campo of escritos) {
  ok(declarados.has(campo),
    `Propiedad.jsonc declara "${campo}"`,
    'sin declararlo, Base44 lo descarta sin avisar');
}

// Los portales son un objeto anidado: sus claves tambien hay que declararlas.
for (const clave of Object.values(M ? { c: 'ciencuadras', m: 'mercadolibre', mc: 'metrocuadrado', z: 'zonahabitat', f: 'fincaraiz' } : {})) {
  ok(portalesDeclarados.has(clave),
    `Propiedad.portales declara "${clave}"`,
    'el link se perderia al guardar');
}

// ── Resultado ────────────────────────────────────────────────────────────────

if (fallos) {
  console.error(`\nsimi-mapeo: ${fallos} fallo(s)`);
  process.exit(1);
}
console.log('simi-mapeo: OK — tres formatos de numero, portales sucios, detalle ausente y merge no destructivo');
