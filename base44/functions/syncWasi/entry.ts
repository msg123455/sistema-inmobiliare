// Sincronización con WASI.co
// WASI API: POST con wasi_token + id_company en el body para cada request
// direction: "test" | "import_properties" | "pull" | "both"
// Token público para llamadas server-to-server: ?token=SYNCWASI2026
Deno.serve(async (req) => {
  const BASE_URL = Deno.env.get('BASE44_APP_URL') || '';
  // Sin la variable, esta funcion escribiria contra el tenant del que se clono
  // la app. Antes ese era el valor por defecto; ahora falla ruidoso.
  if (!BASE_URL) {
    console.error('BASE44_APP_URL no configurada');
    return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  const url = new URL(req.url);
  const tokenOk = url.searchParams.get('token') === 'SYNCWASI2026';

  let body: any = {};
  try { body = await req.json(); } catch {}
  const direction = body.direction || url.searchParams.get('direction') || 'import_properties';

  // Credenciales WASI desde secrets
  let wasiToken = Deno.env.get('WASI_API_KEY') || '';
  let idCompany = Deno.env.get('WASI_USER_ID') || '';

  if (!wasiToken || !idCompany) {
    if (base44Key) {
      const configRes = await fetch(`${BASE_URL}/api/entities/WasiConfig?limit=5`, { headers: hdrs });
      if (configRes.ok) {
        const configs = await configRes.json();
        const config = configs.find((c: any) => c.clave === 'general') || configs[0];
        wasiToken = config?.api_key || '';
        idCompany = config?.user_id || '';
      }
    }
  }

  if (!wasiToken || !idCompany) {
    return new Response(
      JSON.stringify({ error: 'WASI no configurado. Agrega WASI_API_KEY y WASI_USER_ID en Base44 Secrets.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!base44Key && (direction === 'import_properties' || direction === 'pull' || direction === 'both')) {
    return new Response(
      JSON.stringify({ error: 'BASE44_API_KEY no configurado. Agrega el secreto en Base44 para poder guardar datos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const wasiBase = 'https://api.wasi.co';
  // Credenciales van en el body de cada POST a WASI
  const wasiCreds = { wasi_token: wasiToken, id_company: idCompany };
  const wasiHdrs = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

  // ── DEBUG: probar distintos filtros contra WASI para hallar el total real ───
  if (direction === 'debug') {
    // Prueba varias combinaciones de parámetros y reporta el total de cada una
    const pruebas: Record<string, any> = {
      base:                 {},
      con_status_todos:     { id_status: '', match_all_status: 'true' },
      no_disponibilidad:    { id_availability: '' },
      todas_operaciones:    { for_sale: 'true', for_rent: 'true' },
      take_alto:            { take: 100 },
    };
    // Permite forzar params manuales: {"direction":"debug","wasi_params":{...}}
    if (body && typeof body.wasi_params === 'object' && body.wasi_params) {
      pruebas.manual = body.wasi_params;
    }

    const resultados: Record<string, any> = {};
    for (const [nombre, extra] of Object.entries(pruebas)) {
      try {
        const r = await fetch(`${wasiBase}/v1/property/search`, {
          method: 'POST', headers: wasiHdrs,
          body: JSON.stringify({ ...wasiCreds, take: 100, ...extra }),
        });
        const raw = r.ok ? await r.json() : await r.text();
        if (raw && typeof raw === 'object') {
          const props = Object.values(raw).filter((p: any) => p && p.id_property);
          resultados[nombre] = { total: raw.total, status: raw.status, props_en_respuesta: props.length };
        } else {
          resultados[nombre] = { error: String(raw).slice(0, 150) };
        }
      } catch (e: any) { resultados[nombre] = { error: e.message }; }
    }

    // También probar el endpoint get-all (otro estilo de WASI)
    let getAll: any = null;
    try {
      const params = new URLSearchParams({ id_user: idCompany, wasi_key: wasiToken, take: '100' });
      const r = await fetch(`${wasiBase}/v1/property/get-all?${params}`, { headers: { Accept: 'application/json' } });
      const raw = r.ok ? await r.json() : await r.text();
      if (raw && typeof raw === 'object') {
        const props = Object.values(raw).filter((p: any) => p && p.id_property);
        getAll = { total: raw.total, status: raw.status, props_en_respuesta: props.length };
      } else getAll = { error: String(raw).slice(0, 150) };
    } catch (e: any) { getAll = { error: e.message }; }

    return new Response(JSON.stringify({ search_por_filtro: resultados, get_all: getAll }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── TEST ────────────────────────────────────────────────────────────────────
  if (direction === 'test') {
    const res = await fetch(`${wasiBase}/v1/property/search`, {
      method: 'POST',
      headers: wasiHdrs,
      body: JSON.stringify(wasiCreds),
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: `WASI error ${res.status}: ${errText.slice(0, 200)}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const raw = await res.json();
    const count = Array.isArray(raw) ? raw.length : Object.keys(raw).length;
    return new Response(
      JSON.stringify({ ok: true, message: `Conexión exitosa — ${count} propiedad(es) encontradas` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let propiedadesSincronizadas = 0;
  let propiedadesImportadas = 0;
  let leadsImportados = 0;
  let errores = 0;
  let primerError: any = null;
  let wasiTotal = 0;

  // ── IMPORT PROPERTIES ───────────────────────────────────────────────────────
  if (direction === 'import_properties' || direction === 'both') {
    // WASI pagina de a 10 — recorrer con skip hasta traer TODAS las propiedades
    const recolectadas: any[] = [];
    let skip = 0;
    let paginas = 0;
    while (paginas < 40) {
      const res = await fetch(`${wasiBase}/v1/property/search`, {
        method: 'POST',
        headers: wasiHdrs,
        body: JSON.stringify({ ...wasiCreds, skip, take: 25 }),
      });
      if (!res.ok) {
        if (paginas === 0) {
          const errText = await res.text();
          return new Response(
            JSON.stringify({ error: `WASI error al importar (${res.status}): ${errText.slice(0, 300)}` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        break;
      }
      const raw = await res.json();
      wasiTotal = Number(raw?.total) || wasiTotal;
      const pagina = (Array.isArray(raw) ? raw : Object.values(raw))
        .filter((p: any) => p && p.id_property);
      if (pagina.length === 0) break;
      recolectadas.push(...pagina);
      skip += pagina.length;
      paginas++;
      if (wasiTotal && recolectadas.length >= wasiTotal) break;
    }

    // Dedup por id_property (robusto aunque WASI ignore el skip)
    const vistos = new Set<string>();
    const listaProps: any[] = recolectadas.filter((p) => {
      const id = String(p.id_property);
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });

    if (listaProps.length === 0) {
      return new Response(
        JSON.stringify({ error: 'WASI no retornó propiedades. Verifica que tengas inmuebles publicados en tu cuenta WASI.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const TIPO_MAP: Record<number, string> = {
      1: 'Casa', 2: 'Apartamento', 3: 'Local', 4: 'Oficina',
      5: 'Bodega', 6: 'Lote', 7: 'Finca',
    };

    for (const wp of listaProps) {
      const wasiId = String(wp.id_property || '');
      if (!wasiId) continue;

      // Fotos desde galleries[0] (objeto con claves "0","1","2"... y "id")
      const fotos: string[] = [];
      const galeria = wp.galleries?.[0] || {};
      for (const [key, ph] of Object.entries(galeria) as [string, any][]) {
        if (key === 'id') continue;
        const url = ph?.url_original || ph?.url_big || ph?.url;
        if (url) fotos.push(url);
      }

      const tipo = TIPO_MAP[Number(wp.id_property_type)] || 'Otro';

      const esVenta = wp.for_sale === 'true' || wp.for_sale === true;
      const esArriendo = wp.for_rent === 'true' || wp.for_rent === true;
      const operacion = esVenta && esArriendo ? 'Venta_y_Arriendo' : esArriendo ? 'Arriendo' : 'Venta';

      // Strip HTML de la descripción
      const descripcion = (wp.observations || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

      const propData = {
        titulo: wp.title || `${tipo} en ${wp.zone_label || wp.city_label || 'Bogotá'}`,
        descripcion,
        tipo,
        operacion,
        estado: 'Disponible',
        precio_venta: esVenta ? (Number(wp.sale_price) || undefined) : undefined,
        canon_arriendo: esArriendo ? (Number(wp.rent_price) || undefined) : undefined,
        administracion: Number(wp.maintenance_fee) || undefined,
        area_m2: Number(wp.area) || undefined,
        habitaciones: Number(wp.bedrooms) || undefined,
        banos: Number(wp.bathrooms) || undefined,
        parqueaderos: Number(wp.garages) || undefined,
        estrato: Number(wp.stratum) || undefined,
        piso: Number(wp.floor) || undefined,
        direccion: wp.address || '',
        ciudad: wp.city_label || 'Bogotá',
        barrio: wp.zone_label || wp.location_label || '',
        latitud: Number(wp.latitude) || undefined,
        longitud: Number(wp.longitude) || undefined,
        link_wasi: wp.link || '',
        wasi_id: wasiId,
        publicado_wasi: true,
        fuente_wasi: true,
        fotos,
      };

      const existeRes = await fetch(`${BASE_URL}/api/entities/Propiedad?wasi_id=${wasiId}&limit=1`, { headers: hdrs });
      const existentes = existeRes.ok ? await existeRes.json() : [];
      const existente = existentes[0];

      if (existente?.id) {
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad/${existente.id}`, {
          method: 'PUT', headers: hdrs, body: JSON.stringify(propData)
        });
        if (!r.ok) {
          if (!primerError) primerError = { status: r.status, body: await r.text().catch(() => ''), lookup_ok: existeRes.ok, lookup_status: existeRes.status };
          errores++; continue;
        }
      } else {
        const r = await fetch(`${BASE_URL}/api/entities/Propiedad`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(propData)
        });
        if (!r.ok) {
          if (!primerError) primerError = { status: r.status, body: await r.text().catch(() => ''), lookup_ok: existeRes.ok, lookup_status: existeRes.status };
          errores++; continue;
        }
        propiedadesImportadas++;
      }
      propiedadesSincronizadas++;
    }
  }

  // ── PULL LEADS ──────────────────────────────────────────────────────────────
  if (direction === 'pull' || direction === 'both') {
    const leadsRes = await fetch(`${wasiBase}/v1/lead/list`, {
      method: 'POST',
      headers: wasiHdrs,
      body: JSON.stringify(wasiCreds),
    });
    if (leadsRes.ok) {
      const raw = await leadsRes.json();
      const leads: any[] = Array.isArray(raw) ? raw : (raw.leads || []);
      for (const lead of leads) {
        const leadId = String(lead.id_lead);
        const existeRes = await fetch(`${BASE_URL}/api/entities/Contacto?wasi_lead_id=${leadId}&limit=1`, { headers: hdrs });
        const existentes = existeRes.ok ? await existeRes.json() : [];
        if (!existentes[0]) {
          await fetch(`${BASE_URL}/api/entities/Contacto`, {
            method: 'POST', headers: hdrs, body: JSON.stringify({
              nombre: `${lead.name || ''} ${lead.last_name || ''}`.trim() || 'Lead WASI',
              email: lead.email || '',
              telefono: lead.mobile || lead.phone || '',
              tipo_interes: 'Compra',
              pipeline_tipo: 'Venta',
              etapa_pipeline: 'Lead',
              canal_adquisicion: 'WASI',
              fuente_wasi: true,
              wasi_lead_id: leadId,
              fecha_primer_contacto: new Date().toISOString().split('T')[0],
            })
          });
          leadsImportados++;
        }
      }
    }
  }

  return new Response(JSON.stringify({
    wasi_total: wasiTotal,
    propiedades: propiedadesSincronizadas,
    propiedades_importadas: propiedadesImportadas,
    leads: leadsImportados,
    errores,
    primer_error: primerError,
    direction,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
