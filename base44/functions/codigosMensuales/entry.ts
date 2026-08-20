// ─────────────────────────────────────────────────────────────────────────────
// codigosMensuales — sube los codigos de barras del mes a Mailchimp
//
// El trabajo que reemplaza: cada mes alguien sube ~600 PDFs a una carpeta de
// Mailchimp, y despues entra archivo por archivo a copiar la URL que Mailchimp
// genero y pegarla en la fila del inquilino que corresponde.
//
// Ese segundo paso desaparece por completo, y no porque el robot busque mas
// rapido: al subir por API, Mailchimp devuelve full_size_url EN LA RESPUESTA de
// la misma llamada. La URL llega atada al archivo que se acaba de mandar, asi
// que nunca hay que ir a buscarla. No hay copiar y pegar que equivocar.
//
// De ahi la regla que gobierna este archivo: la URL sale SIEMPRE del
// full_size_url de la respuesta, jamas se reconstruye a partir del nombre.
// Mailchimp sanea los nombres y les agrega un sufijo cuando colisionan, asi que
// una URL derivada del nombre apunta al archivo equivocado justo cuando mas
// importa.
//
// Y como eso hay que poder demostrarlo, no suponerlo: el navegador calcula el
// sha256 de los bytes antes de subir, y el modo `verificar` descarga la URL y
// lo recalcula. Si coinciden, queda probado que esa URL sirve exactamente ese
// archivo, byte a byte.
//
// Archivo autocontenido a proposito, como el resto de funciones del repo: un
// solo modulo en el grafo de imports, sin `export` en nivel superior (con uno
// Base44 lo trata como modulo ES y la funcion responde 404).
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
const API_KEY = Deno.env.get('BASE44_API_KEY') || '';
const TOKEN = Deno.env.get('FUNCTIONS_TOKEN') || '';

const MC_KEY = Deno.env.get('MAILCHIMP_API_KEY') || '';
const MC_PREFIJO = Deno.env.get('MAILCHIMP_SERVER_PREFIX') || '';

// Base44 corta alrededor de los 15s. Se deja margen y se corta por reloj, no
// por cantidad: aqui cada elemento hace dos llamadas de red, asi que un lote
// lento con tope fijo se saltaria archivos en silencio.
const PRESUPUESTO_MS = 11_000;
const LOTE_MAX = 40;
const CONCURRENCIA = 5;   // Mailchimp permite 10 conexiones; se deja holgura

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const hdrs = { 'Content-Type': 'application/json', api_key: API_KEY };

// ── Mailchimp ────────────────────────────────────────────────────────────────

/**
 * El datacenter va incrustado al final de la API key, despues del ultimo guion
 * (`abc...-us14` -> `us14`), y es parte del host. Si no esta, se falla diciendo
 * por que: adivinar `us1` produce un 401 que parece clave invalida y manda a
 * buscar el problema al lado equivocado.
 */
function datacenter(): string {
  if (MC_PREFIJO) return MC_PREFIJO;
  const i = MC_KEY.lastIndexOf('-');
  return i > 0 ? MC_KEY.slice(i + 1) : '';
}

async function mc(ruta: string, init: RequestInit = {}, intento = 1): Promise<Response> {
  const dc = datacenter();
  const r = await fetch(`https://${dc}.api.mailchimp.com/3.0${ruta}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // El usuario da igual; la contrasena es la API key.
      Authorization: `Basic ${btoa(`anystring:${MC_KEY}`)}`,
      ...(init.headers || {}),
    },
  });

  // 429 y 5xx son transitorios: espera exponencial y hasta tres intentos. Un
  // 4xx distinto es culpa nuestra y reintentarlo solo gasta tiempo del lote.
  if ((r.status === 429 || r.status >= 500) && intento < 3) {
    await new Promise((res) => setTimeout(res, 400 * 2 ** intento));
    return mc(ruta, init, intento + 1);
  }
  return r;
}

async function mcJson(ruta: string, init: RequestInit = {}): Promise<any> {
  const r = await mc(ruta, init);
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(cuerpo?.detail || cuerpo?.title || `Mailchimp ${r.status} en ${ruta}`);
  }
  return cuerpo;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function desdeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Corre las tareas de a CONCURRENCIA, en orden de entrada. */
async function enOleadas<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCIA) {
    out.push(...await Promise.all(items.slice(i, i + CONCURRENCIA).map(fn)));
  }
  return out;
}

/**
 * Nombre de archivo tal como lo publica SIMI: 90_Ago3976.02.pdf
 *   90    oficina    Ago  mes (sin anio)    3976  contrato    .02  renovacion
 * Patron FIJO: el mes se compara aparte. Interpolarlo dentro de un template
 * literal se comia la barra de \d y el patron dejaba de encajar con nada.
 */
const RE_ARCHIVO_MES = /^(\d+)_([A-Za-z]{3})(\d+)(?:\.(\d+))?\.pdf$/i;

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Nombre de carpeta siguiendo la convencion que la oficina YA usa.
 *
 * En la cuenta hay 22 carpetas nombradas "Agosto 2026", "Julio 2026",
 * "Octubre2025" —el espacio va y viene—. Inventar aqui una clave tipo
 * "codigos-2026-08" dejaria dos carpetas del mismo mes: la que el equipo abre a
 * mano y la que llena el robot. Se respeta la de ellos, y el mes y el anio
 * juntos evitan el choque de "Agosto" contra el agosto del anio pasado.
 */
function nombreCarpeta(periodo: string): string {
  const [anio, mes] = periodo.split('-');
  return `${MESES_ES[Number(mes) - 1] || mes} ${anio}`;
}

/** Compara nombres de carpeta ignorando espacios, acentos y mayusculas. */
const normNombre = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);

  const body = await req.json().catch(() => ({}));

  if (!TOKEN) return json({ error: 'Falta la variable FUNCTIONS_TOKEN en Base44.' }, 500);
  if (body?.token !== TOKEN) return json({ error: 'El token de la app no coincide con FUNCTIONS_TOKEN.' }, 401);
  if (!BASE_URL || !API_KEY) return json({ error: 'Faltan BASE44_APP_URL o BASE44_API_KEY.' }, 500);

  const modo = String(body?.modo || 'sonda');

  try {
    // ── sonda ───────────────────────────────────────────────────────────────
    // Se corre ANTES que nada. Comprueba lo que puede tumbar el diseno entero,
    // en orden de gravedad, y devuelve booleanos: nunca fragmentos de la clave.
    if (modo === 'sonda') {
      const dc = datacenter();
      const res: Record<string, unknown> = {
        // Sirve para saber si un redespliegue llego de verdad. Base44 tiene fama
        // de servir el artefacto del primer despliegue de un nombre; con esto se
        // comprueba en vez de suponerlo.
        revision: 7,
        mailchimp_key: Boolean(MC_KEY),
        datacenter: dc || null,
        // Que secretos ve la funcion. Booleanos, nunca el valor ni un fragmento:
        // basta para localizar el que falta y no filtra nada.
        //
        // Existe porque un secreto invisible y un secreto mal escrito se ven
        // exactamente igual desde afuera, y "Falta MAILCHIMP_API_KEY" no
        // distingue entre "no lo creaste", "lo llamaste distinto" y "no llega a
        // las funciones". Aqui se ve cual de las tres es.
        secretos: {
          FUNCTIONS_TOKEN: Boolean(TOKEN),
          BASE44_APP_URL: Boolean(BASE_URL),
          BASE44_API_KEY: Boolean(API_KEY),
          MAILCHIMP_API_KEY: Boolean(MC_KEY),
          MAILCHIMP_SERVER_PREFIX: Boolean(MC_PREFIJO),
        },
      };
      if (!MC_KEY) {
        return json({
          ...res,
          error: 'Falta MAILCHIMP_API_KEY en los Secrets de Base44.',
          pista: 'Mira `secretos` arriba: si FUNCTIONS_TOKEN y BASE44_API_KEY salen true, '
            + 'los secretos SI llegan a las funciones y el problema es el nombre de este en concreto.',
        }, 500);
      }
      if (!dc) {
        return json({
          ...res,
          error: 'No se pudo deducir el datacenter: la API key no tiene guion. '
            + 'Revisa la clave o define MAILCHIMP_SERVER_PREFIX (ej: us14).',
        }, 500);
      }

      const ping = await mc('/ping');
      res.ping = ping.ok;
      if (!ping.ok) return json({ ...res, error: `Mailchimp respondio ${ping.status} al /ping.` }, 502);

      // La pregunta que puede tumbar el diseno: el File Manager esta pensado
      // para imagenes. Que acepte application/pdf hay que comprobarlo con un
      // archivo, no suponerlo.
      let carpeta: any = null;
      let archivo: any = null;
      try {
        carpeta = await mcJson('/file-manager/folders', {
          method: 'POST', body: JSON.stringify({ name: `__sonda__${Date.now()}` }),
        });
        // PDF valido minimo, de un par de cientos de bytes.
        const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
          + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
          + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\n'
          + 'trailer<</Root 1 0 R>>';
        const bytes = new TextEncoder().encode(pdf);
        const b64 = btoa(pdf);
        const local = await sha256Hex(bytes);

        archivo = await mcJson('/file-manager/files', {
          method: 'POST',
          body: JSON.stringify({ folder_id: carpeta.id, name: 'sonda.pdf', file_data: b64 }),
        });
        res.acepta_pdf = true;
        res.url_devuelta = Boolean(archivo?.full_size_url);

        // Que Mailchimp no re-codifique el archivo: si el hash cambia, la
        // verificacion de ida y vuelta no sirve y hay que decirlo ahora.
        if (archivo?.full_size_url) {
          const bajado = await fetch(archivo.full_size_url);
          const remoto = await sha256Hex(new Uint8Array(await bajado.arrayBuffer()));
          res.hash_coincide = remoto === local;
        }
      } catch (e) {
        res.acepta_pdf = false;
        res.detalle_pdf = (e as Error).message;
      } finally {
        if (archivo?.id) await mc(`/file-manager/files/${archivo.id}`, { method: 'DELETE' }).catch(() => {});
        if (carpeta?.id) await mc(`/file-manager/folders/${carpeta.id}`, { method: 'DELETE' }).catch(() => {});
      }

      // Base44 descarta en silencio los campos que no existen en el esquema, asi
      // que sin esta comprobacion los sha256 y los correos se perderian sin un
      // solo error visible. La unica prueba concluyente es escribir y releer.
      //
      // Va en su propio try: si esta parte revienta, lo averiguado sobre
      // Mailchimp —que es lo caro de conseguir— tiene que salir igual. Un
      // diagnostico que no devuelve nada cuando una de sus comprobaciones falla
      // deja de ser un diagnostico.
      const CLAVES = ['sha256', 'email_destino', 'nombre_destino', 'mailchimp_file_id'];
      try {
        let faltan: string[] = [];
        const rLista = await fetch(`${BASE_URL}/api/entities/CodigoBarras?limit=1`, { headers: hdrs });
        const lista = rLista.ok ? await rLista.json() : [];
        const muestra = Array.isArray(lista) ? lista[0] : null;

        if (muestra) {
          faltan = CLAVES.filter((c) => !(c in muestra));
        } else {
          const sonda: Record<string, string> = { periodo: '0000-00' };
          for (const c of CLAVES) sonda[c] = '__sonda__';
          const rPost = await fetch(`${BASE_URL}/api/entities/CodigoBarras`, {
            method: 'POST', headers: hdrs, body: JSON.stringify(sonda),
          });
          if (rPost.ok) {
            const creada = await rPost.json();
            faltan = CLAVES.filter((c) => !creada?.[c]);
            // Se borra siempre, aunque la comprobacion haya fallado: dejar la
            // sonda entre los recibos seria peor que no haberla escrito.
            if (creada?.id) {
              await fetch(`${BASE_URL}/api/entities/CodigoBarras/${creada.id}`, { method: 'DELETE', headers: hdrs })
                .catch((e: Error) => console.error('no se pudo borrar la sonda:', e.message));
            }
          }
        }
        res.campos_faltantes = faltan;
        if (faltan.length) {
          res.mensaje = `CodigoBarras no tiene ${faltan.join(', ')}. Sin esos campos no hay `
            + 'auditoria ni verificacion de hash. Creelos en Base44 (Datos > CodigoBarras), '
            + 'todos de tipo texto.';
        }
      } catch (e) {
        res.campos_faltantes = null;
        res.error_esquema = `No se pudo revisar CodigoBarras: ${(e as Error).message}`;
      }

      res.listo = Boolean(res.ping)
        && res.acepta_pdf === true
        && Array.isArray(res.campos_faltantes)
        && res.campos_faltantes.length === 0;
      return json(res);
    }

    if (!MC_KEY || !datacenter()) return json({ error: 'Mailchimp sin configurar. Corre el modo sonda.' }, 500);

    const periodo = String(body?.periodo || '');
    if (!/^\d{4}-\d{2}$/.test(periodo)) return json({ error: 'periodo debe ser AAAA-MM.' }, 400);

    // ── preparar ────────────────────────────────────────────────────────────
    // Busca la carpeta del mes o la crea, y devuelve lo que ya esta subido.
    // Esa lista es la idempotencia: si el proceso muere en el archivo 400, al
    // reanudar sube 200 y no vuelve a subir los 400 primeros.
    if (modo === 'preparar') {
      const nombre = String(body?.carpeta || '').trim() || nombreCarpeta(periodo);
      const { folders = [] } = await mcJson('/file-manager/folders?count=1000');

      // Se busca ignorando espacios y acentos: en la cuenta conviven
      // "Octubre2025" y "Agosto 2026", y un match exacto crearia una duplicada.
      let carpeta = folders.find((f: any) => normNombre(f.name) === normNombre(nombre));
      const creada = !carpeta;
      if (!carpeta) {
        carpeta = await mcJson('/file-manager/folders', {
          method: 'POST', body: JSON.stringify({ name: nombre }),
        });
      }

      // La idempotencia sale de CodigoBarras, no de listar la carpeta.
      //
      // Comprobado contra la cuenta real: GET /file-manager/files?folder_id=X
      // IGNORA el filtro —devuelve los 29.690 archivos de la cuenta y todos con
      // folder_id 0—, asi que no hay forma de preguntarle a Mailchimp que hay
      // dentro de una carpeta. El file_count de la carpeta si es correcto, y
      // sirve como control de totales.
      //
      // Nuestro libro mayor es CodigoBarras: si el proceso muere en el archivo
      // 400, al reanudar sube los 200 que faltan y no repite los primeros.
      const rExist = await fetch(
        `${BASE_URL}/api/entities/CodigoBarras?periodo=${encodeURIComponent(periodo)}&limit=1000`,
        { headers: hdrs },
      );
      const existentes = rExist.ok ? await rExist.json() : [];
      const yaSubidos = (Array.isArray(existentes) ? existentes : [])
        .filter((c: any) => c?.url_pdf)
        .map((c: any) => String(c.codigo || ''));

      return json({
        folder_id: carpeta.id,
        carpeta: carpeta.name,
        creada,
        ya_subidos: yaSubidos,
        // Total que Mailchimp dice tener en la carpeta. Si al final no cuadra
        // con lo subido, algo entro por fuera del robot.
        en_carpeta: carpeta.file_count ?? null,
      });
    }

    // ── explorarArchivos ────────────────────────────────────────────────────
    // Diagnostico: que nombres devuelve de verdad el File Manager.
    //
    // Existe porque indexarMes barrio los 29.690 archivos de la cuenta y no
    // encontro ninguno de los ~592 que la carpeta del mes dice tener. Antes de
    // suponer por que, hay que mirar los nombres reales.
    if (modo === 'explorarArchivos') {
      const contiene = String(body?.contiene || '').toLowerCase();
      const desde = Number(body?.desde || 0);
      const t0 = Date.now();
      let offset = desde;
      let total = 0;
      const coinciden: string[] = [];
      const muestra: string[] = [];
      let pdfs = 0;

      while (Date.now() - t0 < PRESUPUESTO_MS) {
        const r = await mcJson(
          `/file-manager/files?count=1000&offset=${offset}`
          + '&fields=files.name,files.type,files.folder_id,total_items',
        );
        total = Number(r.total_items || 0);
        const lote = r.files || [];
        for (const f of lote) {
          const n = String(f.name || '');
          if (/\.pdf$/i.test(n)) pdfs++;
          if (contiene && n.toLowerCase().includes(contiene) && coinciden.length < 40) coinciden.push(n);
          if (muestra.length < 15 && offset > 25000) muestra.push(`${n} [carpeta ${f.folder_id}]`);
        }
        offset += lote.length;
        if (!lote.length || offset >= total) break;
      }

      return json({
        coinciden, muestra_del_final: muestra, pdfs_vistos: pdfs,
        revisados: offset, total, siguiente: offset < total ? offset : null,
      });
    }

    // ── indexarMes ──────────────────────────────────────────────────────────
    // Devuelve los codigos del mes que YA estan publicados en Mailchimp, cada
    // uno con su URL. Es la entrada cuando la oficina sube los PDFs por su
    // cuenta y lo unico que falta es emparejarlos con el inquilino.
    //
    // No se filtra por carpeta a proposito: GET /file-manager/files ignora
    // folder_id —devuelve la cuenta entera y cada archivo reporta folder_id 0—.
    // El mes viaja en el NOMBRE (90_Ago3976.02.pdf), asi que se pagina el File
    // Manager y se filtra por nombre.
    //
    // Sale mejor que filtrar por carpeta, ademas: no depende de que alguien
    // haya dejado el archivo en la carpeta correcta, y un PDF traspapelado en
    // otra carpeta se encuentra igual.
    if (modo === 'indexarMes') {
      const desde = Number(body?.desde || 0);
      const mes = Number(periodo.slice(5, 7));
      const abrev = (MESES_ES[mes - 1] || '').slice(0, 3).toLowerCase();
      if (!abrev) return json({ error: 'periodo con mes invalido.' }, 400);

      // LA CARPETA ES OBLIGATORIA, y no por orden: el nombre del archivo NO
      // lleva el anio. "90_Ago947.pdf" puede ser de agosto de 2025 o de 2026, y
      // en la cuenta conviven los dos. Filtrando solo por nombre salen 2.369
      // archivos y 894 contratos distintos donde el mes real tiene 592: se
      // mezclarian tres anios y alguien recibiria el recibo del ano pasado.
      //
      // La carpeta es lo unico que desambigua. El parametro ?folder_id= de la
      // consulta se ignora, pero el folder_id que viene en cada archivo SI es
      // correcto, asi que se filtra aqui.
      const nombreDeseado = String(body?.carpeta || '').trim() || nombreCarpeta(periodo);
      const { folders = [] } = await mcJson('/file-manager/folders?count=1000');
      const carpeta = folders.find((f: any) => normNombre(f.name) === normNombre(nombreDeseado));
      if (!carpeta) {
        return json({
          error: 'carpeta_no_encontrada',
          buscada: nombreDeseado,
          disponibles: folders.map((f: any) => ({ id: f.id, nombre: f.name, archivos: f.file_count })),
          mensaje: `No hay ninguna carpeta llamada "${nombreDeseado}" en Mailchimp. `
            + 'Sin carpeta no se puede distinguir este mes del mismo mes de otro anio.',
        }, 404);
      }
      const idCarpeta = String(carpeta.id);
      const esperados = Number(carpeta.file_count || 0);

      const t0 = Date.now();
      let offset = desde;
      let total = 0;
      const encontrados: Array<Record<string, string>> = [];

      // Se pagina hasta agotar el presupuesto y se devuelve cursor: con ~30.000
      // archivos en la cuenta hacen falta varias llamadas.
      while (Date.now() - t0 < PRESUPUESTO_MS) {
        const r = await mcJson(
          `/file-manager/files?count=1000&offset=${offset}`
          + '&fields=files.id,files.name,files.full_size_url,files.folder_id,total_items',
        );
        total = Number(r.total_items || 0);
        const lote = r.files || [];
        for (const f of lote) {
          // Se usa un patron FIJO y se compara el mes aparte, en vez de
          // interpolar el mes dentro del regex. Interpolando, la plantilla de JS
          // se comia la barra de `\d` —dentro de un template literal `\d` no es
          // un escape valido y queda en `d`— y el patron terminaba buscando la
          // letra d literal. Encontraba cero archivos y parecia que Mailchimp no
          // los devolvia.
          if (String(f.folder_id ?? '') !== idCarpeta) continue;
          const m = String(f.name || '').match(RE_ARCHIVO_MES);
          if (m && m[2].toLowerCase() === abrev) {
            encontrados.push({
              codigo: m[3], archivo: String(f.name),
              url: String(f.full_size_url || ''), file_id: String(f.id ?? ''),
            });
          }
        }
        offset += lote.length;
        if (!lote.length || offset >= total) break;
      }

      return json({
        encontrados,
        carpeta: { id: idCarpeta, nombre: carpeta.name, archivos: esperados },
        revisados: offset, total,
        siguiente: offset < total ? offset : null,
      });
    }

    // ── subir ───────────────────────────────────────────────────────────────
    // items: [{ codigo, archivo, base64, sha256, email, nombre }]
    if (modo === 'subir') {
      const items: any[] = Array.isArray(body?.items) ? body.items : [];
      const folderId = body?.folder_id;
      const desde = Number(body?.desde || 0);
      if (!folderId) return json({ error: 'Falta folder_id: corre primero el modo preparar.' }, 400);

      const t0 = Date.now();
      const rebanada = items.slice(desde, desde + LOTE_MAX);
      const errores: string[] = [];
      let subidos = 0;
      let procesados = 0;

      for (let i = 0; i < rebanada.length; i += CONCURRENCIA) {
        if (Date.now() - t0 > PRESUPUESTO_MS) break;   // el resto lo toma la llamada siguiente
        const grupo = rebanada.slice(i, i + CONCURRENCIA);

        await enOleadas(grupo, async (it: any) => {
          try {
            // El hash se recalcula aqui sobre los MISMOS bytes que se suben. Si
            // el navegador dice una cosa y estos bytes son otra, se sabe antes
            // de escribir nada.
            const bytes = desdeBase64(it.base64);
            const hash = await sha256Hex(bytes);
            if (it.sha256 && it.sha256 !== hash) {
              errores.push(`${it.codigo}: el archivo cambio entre el navegador y el servidor`);
              return;
            }

            const subido = await mcJson('/file-manager/files', {
              method: 'POST',
              body: JSON.stringify({
                folder_id: folderId,
                name: `${periodo}-${it.codigo}.pdf`,
                file_data: it.base64,
              }),
            });

            // La URL sale de la RESPUESTA, mapeada al codigo que mandamos.
            // Reconstruirla desde el nombre apuntaria al archivo equivocado
            // cuando Mailchimp renombra por colision.
            const url = subido?.full_size_url;
            if (!url) { errores.push(`${it.codigo}: Mailchimp no devolvio URL`); return; }

            const fila = {
              periodo,
              codigo: String(it.codigo),
              url_pdf: url,
              sha256: hash,
              email_destino: it.email || '',
              nombre_destino: it.nombre || '',
              mailchimp_file_id: String(subido.id ?? ''),
              estado_envio: 'Pendiente',
            };
            const rw = await fetch(`${BASE_URL}/api/entities/CodigoBarras`, {
              method: 'POST', headers: hdrs, body: JSON.stringify(fila),
            });
            if (!rw.ok) { errores.push(`${it.codigo}: no se pudo registrar (${rw.status})`); return; }

            subidos++;
          } catch (e) {
            errores.push(`${it.codigo}: ${(e as Error).message}`);
          }
        });
        procesados += grupo.length;
      }

      // El cursor sale del trabajo HECHO, no de desde + LOTE_MAX: si el reloj
      // corto el lote a la mitad, apuntar al final se saltaria archivos.
      const siguiente = desde + procesados;
      return json({
        subidos,
        errores,
        procesados,
        siguiente: siguiente < items.length ? siguiente : null,
      });
    }

    // ── verificar ───────────────────────────────────────────────────────────
    // Descarga cada URL y recalcula el hash. Es lo que convierte "deberia estar
    // bien" en "esta demostrado": prueba que la URL que va en el correo de ese
    // inquilino sirve exactamente su archivo, byte a byte.
    if (modo === 'verificar') {
      const desde = Number(body?.desde || 0);
      const rExist = await fetch(
        `${BASE_URL}/api/entities/CodigoBarras?periodo=${encodeURIComponent(periodo)}&limit=1000`,
        { headers: hdrs },
      );
      const todas = rExist.ok ? await rExist.json() : [];
      const filas = (Array.isArray(todas) ? todas : []).filter((c: any) => c?.url_pdf && c?.sha256);

      const t0 = Date.now();
      const rebanada = filas.slice(desde, desde + LOTE_MAX);
      const fallidos: string[] = [];
      let ok = 0;
      let procesados = 0;

      for (let i = 0; i < rebanada.length; i += CONCURRENCIA) {
        if (Date.now() - t0 > PRESUPUESTO_MS) break;
        const grupo = rebanada.slice(i, i + CONCURRENCIA);
        await enOleadas(grupo, async (c: any) => {
          try {
            const r = await fetch(c.url_pdf);
            if (!r.ok) { fallidos.push(`${c.codigo}: la URL respondio ${r.status}`); return; }
            const hash = await sha256Hex(new Uint8Array(await r.arrayBuffer()));
            if (hash !== c.sha256) fallidos.push(`${c.codigo}: el contenido de la URL NO es el archivo subido`);
            else ok++;
          } catch (e) {
            fallidos.push(`${c.codigo}: ${(e as Error).message}`);
          }
        });
        procesados += grupo.length;
      }

      const siguiente = desde + procesados;
      return json({
        verificados: ok,
        fallidos,
        total: filas.length,
        siguiente: siguiente < filas.length ? siguiente : null,
      });
    }

    return json({ error: `Modo desconocido: ${modo}. Usa sonda, preparar, subir o verificar.` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
