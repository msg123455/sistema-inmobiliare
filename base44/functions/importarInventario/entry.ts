// ─────────────────────────────────────────────────────────────────────────────
// importarInventario — ingesta del inventario de inmuebles
//
// INMOBILIARE descarga hoy su inventario de SIMI a una hoja de calculo y lo
// maneja a mano. Esta funcion recibe esas filas ya parseadas y las vuelca a
// Propiedad de forma idempotente: correrla dos veces con el mismo archivo no
// duplica nada.
//
// Por que no la API de SIMI todavia: no tenemos su documentacion ni
// credenciales. El adaptador CSV usa exactamente las columnas de la hoja que
// ya existe, asi que el catalogo real entra hoy y cuando llegue la API de SIMI
// solo se agrega otro adaptador que produzca el mismo PropiedadCanonica.
//
// La funcion NO parsea archivos: recibe filas como objetos. Parsear en el
// navegador evita subir archivos y hace visible el mapeo de columnas antes de
// escribir nada.
//
// Archivo autocontenido a proposito: las 21 funciones del repo lo son, y el
// soporte de imports relativos en el deploy de Base44 todavia no esta
// confirmado. Cuando lo este, esto se parte en _core/inventario/.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = Deno.env.get('BASE44_APP_URL') || 'https://ndsoftware.base44.app';
const TOKEN = Deno.env.get('IMPORT_TOKEN') || 'INVENTARIO2026';

// Base44 corta las funciones alrededor de los 15s, asi que la importacion va
// por lotes: el cliente manda un lote, recibe un cursor y vuelve a llamar.
const LOTE_MAX = 40;

// ── Tipo canonico ────────────────────────────────────────────────────────────
// Todo adaptador produce esto. El resto de la funcion no sabe de donde vino.
//
// type PropiedadCanonica = {
//   codigo_externo, proveedor, titulo, tipo, operacion, estado,
//   precio_venta, canon_arriendo, administracion,
//   direccion, barrio, zona, ciudad, procedencia,
//   portal_metrocuadrado, portal_fincaraiz, portal_mercadolibre,
// }

// ── Normalizadores ───────────────────────────────────────────────────────────

const txt = (v: unknown) => String(v ?? '').trim();

/**
 * Convierte los numeros como vienen de una hoja colombiana.
 * "$ 1.173.000" -> 1173000   |   "3.500.000,50" -> 3500000.5
 * El punto es separador de miles y la coma decimal: al reves que en JS.
 */
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const limpio = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

const TIPOS_VALIDOS = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Lote', 'Finca', 'Otro'];

/** Mapea el tipo de inmueble de SIMI al enum de Propiedad. */
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
  const exacto = TIPOS_VALIDOS.find((t) => t.toLowerCase() === s);
  return exacto || 'Otro';
}

/** Gestion en SIMI (Venta / Arriendo / Venta-Arriendo) -> enum operacion. */
function operacion(v: unknown): string {
  const s = txt(v).toLowerCase();
  const venta = s.includes('venta');
  const arriendo = s.includes('arriend') || s.includes('renta');
  if (venta && arriendo) return 'Venta_y_Arriendo';
  if (arriendo) return 'Arriendo';
  return 'Venta';
}

/**
 * Estado en SIMI -> enum estado.
 * Ojo: en su hoja "Disponible" viene concatenado con el nombre del edificio
 * ("Disponible Chapinero Alto"), asi que se compara por prefijo, no exacto.
 */
function estado(v: unknown): string {
  const s = txt(v).toLowerCase();
  if (!s) return 'Disponible';
  if (s.startsWith('disponible')) return 'Disponible';
  if (s.includes('reservad')) return 'Reservado';
  if (s.includes('vendid')) return 'Vendido';
  if (s.includes('arrendad')) return 'Arrendado';
  return 'No_disponible';
}

/** Titulo legible: la hoja no trae uno, se arma con lo que hay. */
function titulo(tipo: string, barrio: string, ciudad: string, codigo: string): string {
  const partes = [tipo];
  if (barrio) partes.push(`en ${barrio}`);
  else if (ciudad) partes.push(`en ${ciudad}`);
  const base = partes.join(' ').trim();
  return base && base !== tipo ? base : `${tipo} ${codigo}`.trim();
}

// ── Adaptador: hoja de inventario de SIMI ────────────────────────────────────
// Columnas reales de la hoja de INMOBILIARE:
//   Cod, Direccion, Gestion, ValorVenta/ValorRenta, ValorCanon, Administracion,
//   Tipoinmueble, Estado, Barrio, Zona, Ciudad, Procedencia,
//   METROCUADRADO, FINCARAIZ, MERCADOLIBRE
//
// Se aceptan variantes de nombre porque los export de SIMI no son estables.
function campo(fila: Record<string, unknown>, ...nombres: string[]): unknown {
  for (const n of nombres) {
    // match exacto primero, luego sin distinguir mayusculas ni acentos
    if (fila[n] !== undefined) return fila[n];
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]/g, '');
    const clave = Object.keys(fila).find((k) => norm(k) === norm(n));
    if (clave) return fila[clave];
  }
  return undefined;
}

function desdeFilaSimi(fila: Record<string, unknown>, proveedor: string) {
  const codigo = txt(campo(fila, 'Cod', 'Codigo', 'Código', 'ID'));
  if (!codigo) return null; // sin codigo no hay clave de deduplicacion

  const tipo = tipoInmueble(campo(fila, 'Tipoinmueble', 'Tipo inmueble', 'Tipo'));
  const barrio = txt(campo(fila, 'Barrio'));
  const ciudad = txt(campo(fila, 'Ciudad')) || 'Bogota';

  return {
    codigo_externo: codigo,
    proveedor,
    titulo: titulo(tipo, barrio, ciudad, codigo),
    tipo,
    operacion: operacion(campo(fila, 'Gestion', 'Gestión')),
    estado: estado(campo(fila, 'Estado')),
    precio_venta: num(campo(fila, 'ValorVenta', 'Valor Venta', 'ValorRenta', 'Valor')),
    canon_arriendo: num(campo(fila, 'ValorCanon', 'Valor Canon', 'Canon')),
    administracion: num(campo(fila, 'Administracion', 'Administración')),
    direccion: txt(campo(fila, 'Direccion', 'Dirección')),
    barrio,
    zona: txt(campo(fila, 'Zona')),
    ciudad,
    procedencia: txt(campo(fila, 'Procedencia')),
    // Propiedad.portales es un objeto anidado, no tres campos planos.
    portales: {
      metrocuadrado: txt(campo(fila, 'METROCUADRADO', 'Metrocuadrado')),
      fincaraiz: txt(campo(fila, 'FINCARAIZ', 'Fincaraiz', 'Fincaraíz')),
      mercadolibre: txt(campo(fila, 'MERCADOLIBRE', 'Mercadolibre', 'MercadoLibre')),
    },
  };
}

// ── Escritura ────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

  if (body?.token !== TOKEN) return json({ error: 'No autorizado' }, 401);

  const filas: Record<string, unknown>[] = Array.isArray(body?.filas) ? body.filas : [];
  const proveedor: string = txt(body?.proveedor) || 'simi';
  const desde = Number(body?.desde) || 0;
  const simular = body?.simular === true;

  if (!filas.length) return json({ error: 'No llegaron filas' }, 400);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return json({ error: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };

  const lote = filas.slice(desde, desde + LOTE_MAX);
  const res = { creados: 0, actualizados: 0, omitidos: 0, errores: [] as string[] };

  for (const fila of lote) {
    const p = desdeFilaSimi(fila, proveedor);
    if (!p) { res.omitidos++; continue; }

    if (simular) { res.creados++; continue; }

    try {
      // Clave de deduplicacion: proveedor + codigo_externo. Un inmueble nunca
      // se fusiona entre proveedores distintos.
      const q = `${BASE_URL}/api/entities/Propiedad?codigo_externo=${encodeURIComponent(p.codigo_externo)}&proveedor=${encodeURIComponent(proveedor)}&limit=1`;
      const rBusca = await fetch(q, { headers: hdrs });
      const existentes = rBusca.ok ? await rBusca.json() : [];
      const existente = Array.isArray(existentes) ? existentes[0] : null;

      if (existente?.id) {
        // No se pisa la ficha completa: fotos, descripcion y links se editan
        // dentro de la app y la hoja no los trae. Solo se refrescan los campos
        // que SIMI si es autoridad.
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad/${existente.id}`, {
          method: 'PUT', headers: hdrs, body: JSON.stringify({ ...existente, ...p }),
        });
        if (r.ok) res.actualizados++;
        else res.errores.push(`${p.codigo_externo}: PUT ${r.status}`);
      } else {
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(p),
        });
        if (r.ok) res.creados++;
        else res.errores.push(`${p.codigo_externo}: POST ${r.status} ${(await r.text()).slice(0, 120)}`);
      }
    } catch (err) {
      res.errores.push(`${p.codigo_externo}: ${(err as Error).message}`);
    }
  }

  const siguiente = desde + LOTE_MAX;
  const completado = siguiente >= filas.length;

  return json({
    ...res,
    procesadas: lote.length,
    total: filas.length,
    desde,
    siguiente: completado ? null : siguiente,
    completado,
    // Solo los primeros errores: la respuesta no deberia crecer sin limite.
    errores: res.errores.slice(0, 20),
  });
});
