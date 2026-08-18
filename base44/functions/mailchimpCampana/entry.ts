// ─────────────────────────────────────────────────────────────────────────────
// mailchimpCampana — audiencia y borrador de la campana mensual de codigos
//
// Segunda mitad del proceso: codigosMensuales sube los PDFs y captura las URLs;
// esta funcion las lleva a la audiencia y deja la campana lista para revisar.
//
// NO EXISTE UN MODO DE ENVIO. No hay ninguna ruta de codigo que llegue a
// POST /campaigns/{id}/actions/send. La aprobacion humana no es una casilla que
// se pueda dejar marcada por descuido: es una ausencia. El boton de enviar se
// aprieta en Mailchimp, mirando el borrador.
//
// Los tags de merge field son los que la oficina YA usa —FNAME y PDF, medidos
// contra la cuenta real, ver docs/mailchimp-codigos-barras.md—. Inventar CODURL
// habria roto la plantilla del correo que llevan meses usando.
//
// Archivo autocontenido, sin `export` en nivel superior (con uno Base44 lo
// trata como modulo ES y la funcion responde 404).
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = Deno.env.get('FUNCTIONS_TOKEN') || '';
const MC_KEY = Deno.env.get('MAILCHIMP_API_KEY') || '';
const MC_PREFIJO = Deno.env.get('MAILCHIMP_SERVER_PREFIX') || '';
const FROM_NAME = Deno.env.get('MAILCHIMP_FROM_NAME') || '';
const FROM_EMAIL = Deno.env.get('MAILCHIMP_FROM_EMAIL') || '';
const REPLY_TO = Deno.env.get('MAILCHIMP_REPLY_TO') || FROM_EMAIL;
// Unicas direcciones a las que esta funcion puede mandar un correo de prueba.
// Vacio = no manda ninguna. Ver el modo `prueba`.
const TEST_EMAILS = Deno.env.get('MAILCHIMP_TEST_EMAILS') || '';

const PRESUPUESTO_MS = 11_000;
// Tope de la API para el upsert por lotes de POST /lists/{id}.
const LOTE_MIEMBROS = 500;
// Un contacto admite 30 merge fields. Se corta antes para dejar aire.
const MAX_CAMPOS_PDF = 25;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function datacenter(): string {
  if (MC_PREFIJO) return MC_PREFIJO;
  const i = MC_KEY.lastIndexOf('-');
  return i > 0 ? MC_KEY.slice(i + 1) : '';
}

async function mc(ruta: string, init: RequestInit = {}, intento = 1): Promise<Response> {
  const r = await fetch(`https://${datacenter()}.api.mailchimp.com/3.0${ruta}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`anystring:${MC_KEY}`)}`,
      ...(init.headers || {}),
    },
  });
  if ((r.status === 429 || r.status >= 500) && intento < 3) {
    await new Promise((res) => setTimeout(res, 400 * 2 ** intento));
    return mc(ruta, init, intento + 1);
  }
  return r;
}

async function mcJson(ruta: string, init: RequestInit = {}): Promise<any> {
  const r = await mc(ruta, init);
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo?.detail || cuerpo?.title || `Mailchimp ${r.status} en ${ruta}`);
  return cuerpo;
}

/** Etiqueta del campo que lleva la URL del recibo n-esimo. El primero es PDF. */
const tagPdf = (i: number) => (i === 0 ? 'PDF' : `PDF${i + 1}`);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
  const body = await req.json().catch(() => ({}));

  if (!TOKEN) return json({ error: 'Falta FUNCTIONS_TOKEN en Base44.' }, 500);
  if (body?.token !== TOKEN) return json({ error: 'El token de la app no coincide con FUNCTIONS_TOKEN.' }, 401);
  if (!MC_KEY || !datacenter()) return json({ error: 'Falta MAILCHIMP_API_KEY o no se pudo deducir el datacenter.' }, 500);

  const modo = String(body?.modo || '');
  const listId = String(body?.list_id || '');

  try {
    // ── audiencias ──────────────────────────────────────────────────────────
    // Para que la pantalla deje elegir sobre cual trabajar en vez de que el
    // robot decida por su cuenta a quien le escribe.
    if (modo === 'audiencias') {
      const r = await mcJson('/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count');
      return json({
        audiencias: (r.lists || []).map((l: any) => ({
          id: l.id, nombre: l.name, contactos: l.stats?.member_count ?? null,
        })),
      });
    }

    if (!listId) return json({ error: 'Falta list_id.' }, 400);

    // ── preflight ───────────────────────────────────────────────────────────
    // Quien NO va a recibir el correo, sabido ANTES de enviarlo.
    //
    // Medido en la cuenta real: la audiencia de agosto tiene 6 direcciones
    // `cleaned` y la de julio 7 mas 2 desuscritas. Son rebotes duros, o sea
    // entre 6 y 9 inquilinos al mes que no reciben su codigo sin que nadie se
    // entere, porque al crear una audiencia nueva cada mes el rebote se
    // descubre despues de enviar.
    //
    // Por eso no se mira solo la audiencia del mes: se barren tambien las de
    // los meses anteriores. Asi la advertencia llega a tiempo aunque se siga
    // creando una audiencia nueva cada vez, sin obligar a cambiar el flujo.
    if (modo === 'preflight') {
      const correos: string[] = (Array.isArray(body?.correos) ? body.correos : [])
        .map((c: string) => String(c).trim().toLowerCase()).filter(Boolean);

      const otras: string[] = Array.isArray(body?.audiencias_historicas) ? body.audiencias_historicas : [];
      const listas = [...new Set([listId, ...otras])];

      const malos = new Map<string, string>();   // correo -> por que
      for (const id of listas) {
        for (const estado of ['cleaned', 'unsubscribed']) {
          try {
            const r = await mcJson(
              `/lists/${id}/members?status=${estado}&count=1000&fields=members.email_address`,
            );
            for (const m of r.members || []) {
              const e = String(m.email_address || '').toLowerCase();
              // El rebote pesa mas que la baja voluntaria: si aparece en los
              // dos, se reporta como rebotado.
              if (e && (estado === 'cleaned' || !malos.has(e))) malos.set(e, estado);
            }
          } catch { /* una audiencia borrada no debe tumbar el preflight */ }
        }
      }

      const afectados = correos.filter((c) => malos.has(c)).map((c) => ({ correo: c, motivo: malos.get(c) }));
      return json({
        revisados: correos.length,
        audiencias_consultadas: listas.length,
        no_recibiran: afectados,
        // Sin sorpresas: quien esta aqui NO va a recibir el correo por mas que
        // la campana diga que salio. Hay que buscarlo por otro canal.
        mensaje: afectados.length
          ? `${afectados.length} inquilinos no recibiran el correo: su direccion rebotó o se dio de baja.`
          : 'Ninguna direccion conocida esta rebotada ni dada de baja.',
      });
    }

    // ── mergeFields ─────────────────────────────────────────────────────────
    // Crea los que falten. FNAME y PDF ya existen en las audiencias de la
    // oficina; PDF2 en adelante solo hacen falta si alguien tiene varios
    // inmuebles, y se crean segun el maximo real de ese mes.
    if (modo === 'mergeFields') {
      const maxCodigos = Math.max(1, Number(body?.max_codigos || 1));
      if (maxCodigos > MAX_CAMPOS_PDF) {
        return json({
          error: 'demasiados_codigos',
          mensaje: `Hay un inquilino con ${maxCodigos} inmuebles y un contacto solo admite ${MAX_CAMPOS_PDF} campos. `
            + 'Hay que enviarle sus recibos aparte, a mano.',
        }, 409);
      }

      const actuales = await mcJson(`/lists/${listId}/merge-fields?count=100&fields=merge_fields.tag,merge_fields.type`);
      const tags = new Set((actuales.merge_fields || []).map((m: any) => m.tag));

      const creados: string[] = [];
      const requeridos = [{ tag: 'FNAME', name: 'Nombre' }];
      for (let i = 0; i < maxCodigos; i++) {
        requeridos.push({ tag: tagPdf(i), name: i === 0 ? 'PDF' : `PDF ${i + 1}` });
      }

      for (const campo of requeridos) {
        if (tags.has(campo.tag)) continue;
        // Tipo texto, no `url`: los campos que ya usan son texto y cambiar el
        // tipo de uno existente rompe los valores guardados.
        await mcJson(`/lists/${listId}/merge-fields`, {
          method: 'POST',
          body: JSON.stringify({ tag: campo.tag, name: campo.name, type: 'text', required: false, public: false }),
        });
        creados.push(campo.tag);
      }
      return json({ creados, existentes: [...tags] });
    }

    // ── automatizaciones ────────────────────────────────────────────────────
    // Agregar un contacto a una audiencia parece inofensivo y no lo es: si esa
    // audiencia tiene una automatizacion de bienvenida activa, Mailchimp le
    // manda un correo al inquilino en el momento de suscribirlo. Es una via de
    // envio que no pasa por ninguna campana y que nadie ve venir.
    //
    // Por eso se puede consultar aparte, y por eso `audiencia` se niega a correr
    // si encuentra alguna activa sobre esa lista.
    if (modo === 'automatizaciones' || modo === 'audiencia') {
      let activas: any[] = [];
      try {
        const r = await mcJson('/automations?count=100&fields=automations.id,automations.status,automations.settings.title,automations.recipients.list_id');
        activas = (r.automations || []).filter(
          (a: any) => a.status === 'sending' && a.recipients?.list_id === listId,
        );
      } catch {
        // Si no se puede comprobar, no se supone que no hay: se dice.
        if (modo === 'audiencia') {
          return json({
            error: 'no_se_pudo_comprobar_automatizaciones',
            mensaje: 'No se pudo consultar si la audiencia tiene automatizaciones activas. '
              + 'No se agrego ningun contacto: suscribir con una automatizacion encendida le '
              + 'manda un correo al inquilino sin que nadie lo dispare.',
          }, 502);
        }
      }

      if (activas.length) {
        return json({
          error: 'automatizacion_activa',
          automatizaciones: activas.map((a: any) => ({ id: a.id, titulo: a.settings?.title })),
          mensaje: `Esa audiencia tiene ${activas.length} automatizacion(es) enviando. Agregar `
            + 'contactos les mandaria un correo automatico. No se agrego a nadie: pausalas en '
            + 'Mailchimp o usa otra audiencia.',
        }, 409);
      }

      if (modo === 'automatizaciones') return json({ activas: [], limpio: true });
    }

    // ── audiencia ───────────────────────────────────────────────────────────
    // Upsert por lotes. miembros: [{ email, nombre, urls: [...] }]
    //
    // Esto NO manda correo por si mismo —solo escribe contactos y sus campos—,
    // pero solo se llega aqui despues de comprobar que la audiencia no tiene una
    // automatizacion encendida que si lo haria.
    if (modo === 'audiencia') {
      const miembros: any[] = Array.isArray(body?.miembros) ? body.miembros : [];
      const desde = Number(body?.desde || 0);
      const t0 = Date.now();

      const rebanada = miembros.slice(desde, desde + LOTE_MIEMBROS);
      const errores: any[] = [];
      let nuevos = 0; let actualizados = 0; let procesados = 0;

      for (let i = 0; i < rebanada.length; i += 100) {
        if (Date.now() - t0 > PRESUPUESTO_MS) break;
        const grupo = rebanada.slice(i, i + 100);

        const payload = grupo.map((m: any) => {
          const campos: Record<string, string> = { FNAME: String(m.nombre || '') };
          const urls: string[] = Array.isArray(m.urls) ? m.urls : [m.url].filter(Boolean);
          urls.forEach((u, k) => { campos[tagPdf(k)] = String(u); });
          return {
            email_address: String(m.email || '').trim(),
            // status_if_new, JAMAS status: con `status` Mailchimp reactivaria a
            // quien se dio de baja, que ademas de ser incumplimiento de la Ley
            // 1581 es motivo de suspension de la cuenta.
            status_if_new: 'subscribed',
            merge_fields: campos,
          };
        });

        const r = await mcJson(`/lists/${listId}`, {
          method: 'POST',
          body: JSON.stringify({ members: payload, update_existing: true }),
        });
        nuevos += r.new_members?.length || 0;
        actualizados += r.updated_members?.length || 0;
        // errors[] trae el detalle por contacto. Se conserva: es el informe de
        // quien quedo fuera y por que.
        for (const e of r.errors || []) {
          errores.push({ correo: e.email_address, codigo: e.error_code, detalle: e.error });
        }
        procesados += grupo.length;
      }

      const siguiente = desde + procesados;
      return json({
        nuevos, actualizados, errores, procesados,
        siguiente: siguiente < miembros.length ? siguiente : null,
      });
    }

    // ── campana ─────────────────────────────────────────────────────────────
    // Crea el BORRADOR. Nunca envia.
    if (modo === 'campana') {
      if (!FROM_NAME || !FROM_EMAIL) {
        return json({
          error: 'remitente_sin_configurar',
          mensaje: 'Faltan MAILCHIMP_FROM_NAME y MAILCHIMP_FROM_EMAIL en los Secrets de Base44.',
        }, 500);
      }
      const asunto = String(body?.asunto || '').trim();
      const titulo = String(body?.titulo || asunto).trim();
      const html = String(body?.html || '').trim();
      if (!asunto || !html) return json({ error: 'Faltan asunto o html.' }, 400);

      // Que la plantilla traiga el merge field: un correo sin *|PDF|* sale con
      // el hueco vacio y el inquilino no recibe nada aprovechable.
      if (!/\*\|PDF\|\*/.test(html)) {
        return json({
          error: 'html_sin_merge_field',
          mensaje: 'El cuerpo del correo no contiene *|PDF|*, asi que ningun inquilino veria su recibo.',
        }, 400);
      }

      const camp = await mcJson('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          type: 'regular',
          recipients: { list_id: listId },
          settings: {
            subject_line: asunto,
            title: titulo,
            from_name: FROM_NAME,
            reply_to: REPLY_TO,
            auto_footer: false,
          },
        }),
      });

      await mcJson(`/campaigns/${camp.id}/content`, { method: 'PUT', body: JSON.stringify({ html }) });

      return json({
        id: camp.id,
        web_id: camp.web_id,
        estado: camp.status,
        url: `https://${datacenter()}.admin.mailchimp.com/campaigns/edit?id=${camp.web_id}`,
        // Se dice explicito para que nadie asuma que ya salio.
        aviso: 'La campana quedo en BORRADOR. El envio se aprieta a mano en Mailchimp.',
      });
    }

    // ── prueba ──────────────────────────────────────────────────────────────
    // ES LA UNICA RUTA DE ESTE ARCHIVO QUE MANDA CORREO DE VERDAD, asi que va
    // cerrada con llave y FALLA CERRADA: sin la lista blanca no manda nada.
    //
    // La lista no se recibe por parametro sino que sale del secreto
    // MAILCHIMP_TEST_EMAILS, que solo la oficina controla. El motivo es
    // concreto: el token de estas funciones esta escrito en el repositorio, asi
    // que cualquiera que lo lea puede llamarlas. Si los destinos vinieran en el
    // cuerpo, esa persona escogeria a quien llega el correo.
    if (modo === 'prueba') {
      const permitidos = TEST_EMAILS.split(/[,;\s]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
      if (!permitidos.length) {
        return json({
          error: 'sin_lista_blanca',
          mensaje: 'No hay MAILCHIMP_TEST_EMAILS configurado, asi que no se manda ninguna prueba. '
            + 'Ponlo en los Secrets de Base44 con los correos de la oficina, separados por coma.',
        }, 409);
      }

      const id = String(body?.campana_id || '');
      if (!id) return json({ error: 'Falta campana_id.' }, 400);

      const pedidos: string[] = (Array.isArray(body?.correos) ? body.correos : [])
        .map((c: string) => String(c).trim().toLowerCase()).filter(Boolean);

      // Sin destinos pedidos se usa la lista entera. Con destinos pedidos, solo
      // los que ademas esten en la lista: lo que no esta, se rechaza y se dice.
      const destinos = pedidos.length ? pedidos.filter((c) => permitidos.includes(c)) : permitidos;
      const rechazados = pedidos.filter((c) => !permitidos.includes(c));

      if (rechazados.length) {
        return json({
          error: 'destino_no_autorizado',
          rechazados,
          mensaje: 'Esos correos no estan en MAILCHIMP_TEST_EMAILS. No se envio nada. '
            + 'Las pruebas solo salen a direcciones de la oficina, nunca a un inquilino.',
        }, 403);
      }

      await mcJson(`/campaigns/${id}/actions/test`, {
        method: 'POST',
        body: JSON.stringify({ test_emails: destinos, send_type: 'html' }),
      });
      return json({ enviada_a: destinos.length, destinos });
    }

    return json({
      error: `Modo desconocido: ${modo}. Usa audiencias, preflight, automatizaciones, mergeFields, `
        + 'audiencia, campana o prueba. No hay modo de envio a proposito: a los inquilinos no les '
        + 'llega nada desde aqui. La campana se envia a mano desde Mailchimp.',
    }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
