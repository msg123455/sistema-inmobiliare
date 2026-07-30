// Unica puerta a /api/entities. Ninguna otra parte de _core hace fetch a Base44.
//
// La URL del backend sale de BASE44_APP_URL. No se hardcodea: el repo venia con
// el tenant de ND en 17 archivos y bastaba olvidar uno para escribir en la app
// equivocada.

export type Filtro = Record<string, string | number | boolean | undefined | null>;

export function crearDb(apiKey: string, baseUrl?: string) {
  const base = (baseUrl || Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  if (!base) throw new Error('BASE44_APP_URL no configurada');
  const hdrs = { api_key: apiKey, 'Content-Type': 'application/json' };

  const qs = (f?: Filtro) => {
    if (!f) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  async function list<T = any>(entidad: string, filtro?: Filtro): Promise<T[]> {
    const r = await fetch(`${base}/api/entities/${entidad}${qs(filtro)}`, { headers: hdrs });
    if (!r.ok) {
      console.error(`db.list ${entidad} ${r.status}`, (await r.text()).slice(0, 200));
      return [];
    }
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  }

  async function uno<T = any>(entidad: string, filtro?: Filtro): Promise<T | null> {
    const arr = await list<T>(entidad, { ...filtro, limit: 1 });
    return arr[0] ?? null;
  }

  async function crear<T = any>(entidad: string, datos: Record<string, unknown>): Promise<T | null> {
    const r = await fetch(`${base}/api/entities/${entidad}`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(datos),
    });
    if (!r.ok) {
      console.error(`db.crear ${entidad} ${r.status}`, (await r.text()).slice(0, 200));
      return null;
    }
    return await r.json();
  }

  /**
   * Actualiza una fila fusionando: primero lee lo que hay y encima aplica los
   * campos nuevos.
   *
   * POR QUE LEE ANTES DE ESCRIBIR: Base44 solo expone PUT, que REEMPLAZA la
   * fila completa. Mandar unicamente los campos que cambian borra todo lo
   * demas. Eso ya estaba pasando: calificar_lead hacia PUT sobre Contacto con
   * diez campos, lo que dejaba en blanco el email, la etapa del pipeline, el
   * presupuesto, el canal de adquisicion y las notas del lead —justo el
   * historial que el CRM habia acumulado— en la escritura mas frecuente del
   * sistema.
   *
   * Se resuelve aqui y no en cada llamada porque acordarse de esparcir la fila
   * en cada sitio es una regla que alguien va a olvidar. Los call sites que ya
   * hacen `{...existente, ...cambios}` siguen funcionando igual.
   *
   * Cuesta un GET extra por actualizacion. Estas escrituras no estan en el
   * camino caliente, asi que el intercambio vale la pena.
   */
  async function actualizar<T = any>(entidad: string, id: string, datos: Record<string, unknown>): Promise<T | null> {
    let cuerpo = datos;
    try {
      const r0 = await fetch(`${base}/api/entities/${entidad}/${id}`, { headers: hdrs });
      if (r0.ok) {
        const actual = await r0.json();
        if (actual && typeof actual === 'object' && !Array.isArray(actual)) {
          cuerpo = { ...actual, ...datos };
        }
      }
    } catch (err) {
      // Si la lectura falla se escribe lo que vino. Es peor no actualizar nada
      // que actualizar de mas, y el error queda en el log.
      console.error(`db.actualizar ${entidad}/${id} no pudo leer antes de fusionar:`, (err as Error).message);
    }

    const r = await fetch(`${base}/api/entities/${entidad}/${id}`, {
      method: 'PUT', headers: hdrs, body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      console.error(`db.actualizar ${entidad}/${id} ${r.status}`, (await r.text()).slice(0, 200));
      return null;
    }
    return await r.json();
  }

  // Crea o actualiza segun venga id. Devuelve el id resultante.
  async function guardar(entidad: string, id: string | null, datos: Record<string, unknown>): Promise<string | null> {
    const res = id ? await actualizar(entidad, id, datos) : await crear(entidad, datos);
    return (res as any)?.id ?? id ?? null;
  }

  return { base, list, uno, crear, actualizar, guardar };
}

export type Db = ReturnType<typeof crearDb>;
