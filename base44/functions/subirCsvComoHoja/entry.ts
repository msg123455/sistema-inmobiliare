// ─────────────────────────────────────────────────────────────────────────────
// subirCsvComoHoja — deja el listado del mes en Google Drive, ya como hoja
//
// Recibe el CSV que la pantalla acaba de generar y lo sube al Drive del usuario
// convertido a hoja de calculo de Google. Un clic y se abre en Sheets: sin
// descargar, sin "Abrir con", sin copias sueltas en la carpeta de descargas de
// una maquina.
//
// CONTRATO DE RESPUESTA: 200 con { ok: false, motivo } para todo desenlace
// esperado, y 500 solo para lo genuinamente inesperado.
//
// No es una preferencia de estilo. El cliente de funciones del SDK se crea con
// interceptResponses:false, asi que cualquier status >= 400 rechaza con un
// AxiosError cuyo mensaje es "Request failed with status code 500" y el cuerpo
// util queda enterrado en e.response.data. Devolviendo 200 el motivo llega
// entero y la pantalla puede decir que pasa de verdad.
//
// Archivo autocontenido salvo el import del SDK, que deno.d.ts ya declara.
// Sin `export` en nivel superior: con uno, Base44 responde 404.
// ─────────────────────────────────────────────────────────────────────────────
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONNECTOR_ID = 'aca57577c3854ffcb9171e42abaa0e16'; // Google Drive
const CARPETA = 'Códigos de barras';
const MIME_HOJA = 'application/vnd.google-apps.spreadsheet';
const MIME_CARPETA = 'application/vnd.google-apps.folder';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Escapa un valor para meterlo entre comillas simples en un parametro `q`.
 * La contrabarra va primero o se re-escaparia la comilla ya escapada.
 *
 * Con "Códigos de barras" no hay apostrofos, pero files.list no falla ante un
 * `q` mal formado: devuelve vacio. Y vacio aqui significa "no encontre la
 * carpeta", o sea crear una segunda.
 */
const escQ = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Cuerpo multipart/related para la API de Drive.
 *
 * FormData NO sirve: produce multipart/form-data y Drive responde 400.
 * uploadType=multipart exige multipart/related, asi que se arma a mano y el
 * Content-Type con su boundary se pone explicitamente en las cabeceras.
 *
 * Los \r\n entre partes son obligatorios por MIME; con \n Drive devuelve 400.
 * El boundary sale de crypto.randomUUID() para que no pueda aparecer dentro del
 * propio CSV.
 */
function multipart(meta: unknown, csv: string) {
  const limite = `inmobiliare-${crypto.randomUUID()}`;
  const cuerpo = `--${limite}\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${JSON.stringify(meta)}\r\n`
    + `--${limite}\r\n`
    + 'Content-Type: text/csv; charset=UTF-8\r\n\r\n'
    + `${csv}\r\n`
    + `--${limite}--\r\n`;
  return { cuerpo, tipo: `multipart/related; boundary=${limite}` };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, motivo: 'solo_post' }, 405);

  try {
    const base44 = createClientFromRequest(req);

    // Va en su propio try: sin sesion no hay de quien sacar el token de Drive, y
    // confundirlo con "no conectado" manda al usuario a un popup de OAuth que
    // tampoco puede funcionar.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return json({ ok: false, motivo: 'sin_sesion' });

    const body = await req.json().catch(() => ({}));
    const nombre = String(body?.nombre || '').trim();
    // El BOM se quita AQUI y no en aCSV(): alli es correcto —Excel lo necesita
    // para los acentos al abrir el CSV de doble clic— y solo estorba en la
    // conversion a Sheets, donde acabaria como basura invisible en la celda A1.
    const csv = String(body?.csv || '').replace(/^﻿/, '');
    const modo = String(body?.modo || 'actualizar');

    if (!nombre) return json({ ok: false, motivo: 'falta_nombre' });
    if (!csv.trim()) return json({ ok: false, motivo: 'csv_vacio' });

    let accessToken = '';
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID));
    } catch {
      return json({ ok: false, motivo: 'no_conectado' });
    }
    if (!accessToken) return json({ ok: false, motivo: 'no_conectado' });

    const auth = { Authorization: `Bearer ${accessToken}` };
    const drive = (ruta: string, init: RequestInit = {}) =>
      fetch(`https://www.googleapis.com/drive/v3${ruta}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });

    // ── carpeta ─────────────────────────────────────────────────────────────
    // Si algo falla aqui NO se aborta: se sube a la raiz y se dice. El objetivo
    // es que la hoja llegue; la carpeta es comodidad.
    //
    // No se filtra por padre a proposito: si el usuario mueve la carpeta, un
    // filtro 'root' in parents no la encontraria y se crearia una segunda.
    // orderBy=createdTime + el primero hace que, si llegaran a existir dos,
    // todas las corridas converjan a la misma.
    let carpetaId: string | null = null;
    try {
      const q = `mimeType='${MIME_CARPETA}' and name='${escQ(CARPETA)}' and trashed=false`;
      const rBusca = await drive(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=createdTime&pageSize=10`);
      const encontradas = rBusca.ok ? (await rBusca.json())?.files || [] : [];
      carpetaId = encontradas[0]?.id || null;

      if (!carpetaId) {
        const rCrea = await drive('/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: CARPETA, mimeType: MIME_CARPETA }),
        });
        if (rCrea.ok) carpetaId = (await rCrea.json())?.id || null;
      }
    } catch { carpetaId = null; }

    // ── hoja existente ──────────────────────────────────────────────────────
    // Actualizar en sitio y no crear una cada vez: Drive admite nombres
    // duplicados, asi que "crear siempre" no produce (1), (2) sino N archivos
    // con el nombre identico, y nadie sabe cual es el vigente sin abrirlos. Para
    // un listado de recaudo ese es el peor final. Ademas el enlace se mantiene
    // estable, y si alguien habia anotado a mano, el historial de versiones de
    // Sheets lo recupera.
    let existente: string | null = null;
    if (modo !== 'nuevo') {
      try {
        const partes = [`name='${escQ(nombre)}'`, `mimeType='${MIME_HOJA}'`, 'trashed=false'];
        if (carpetaId) partes.push(`'${escQ(carpetaId)}' in parents`);
        const rHoja = await drive(`/files?q=${encodeURIComponent(partes.join(' and '))}&fields=files(id)&orderBy=createdTime&pageSize=5`);
        if (rHoja.ok) existente = ((await rHoja.json())?.files || [])[0]?.id || null;
      } catch { existente = null; }
    }

    // ── subir ───────────────────────────────────────────────────────────────
    // La conversion a hoja la dispara la asimetria: la metadata dice
    // spreadsheet y el media dice text/csv, asi que Drive importa y convierte.
    //
    // En el PATCH la metadata va SIN `parents`: files.update los rechaza en el
    // cuerpo (van por addParents/removeParents en la query). Es el error clasico
    // de copiar la metadata del create.
    const meta: Record<string, unknown> = { name: nombre, mimeType: MIME_HOJA };
    if (!existente && carpetaId) meta.parents = [carpetaId];

    const { cuerpo, tipo } = multipart(meta, csv);
    const campos = 'fields=id,name,webViewLink,modifiedTime';   // sin esto Drive v3 solo devuelve id
    const url = existente
      ? `https://www.googleapis.com/upload/drive/v3/files/${existente}?uploadType=multipart&${campos}`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${campos}`;

    const rSube = await fetch(url, {
      method: existente ? 'PATCH' : 'POST',
      headers: { ...auth, 'Content-Type': tipo },
      body: cuerpo,
    });

    if (!rSube.ok) {
      // El detalle es imprescindible: sin el, un 400 por un \r\n mal puesto o un
      // parents en el PATCH es indepurable desde la pantalla.
      return json({
        ok: false,
        motivo: 'drive',
        status: rSube.status,
        detalle: (await rSube.text()).slice(0, 600),
      });
    }

    const hoja = await rSube.json();
    return json({
      ok: true,
      creado: !existente,
      id: hoja.id,
      nombre: hoja.name,
      url: hoja.webViewLink,
      modificado: hoja.modifiedTime,
      carpeta: carpetaId ? CARPETA : null,
    });
  } catch (e) {
    return json({ ok: false, motivo: 'inesperado', detalle: (e as Error).message }, 500);
  }
});
