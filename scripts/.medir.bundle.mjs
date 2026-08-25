#!/usr/bin/env node

// base44/functions/_core/protocol.ts
var AGENTES = [
  "recepcion",
  "ventas",
  "consignacion",
  "cartera",
  "mantenimiento",
  "avaluos",
  "pqr",
  "matricula"
];
function definirTool(name, description, props, opts = {}) {
  return {
    def: {
      name,
      description,
      strict: true,
      input_schema: {
        type: "object",
        properties: props,
        // strict exige que `required` cubra todas las propiedades; los campos
        // opcionales se modelan como nullable, no omitiendolos de required.
        required: Object.keys(props),
        additionalProperties: false
      }
    },
    ...opts
  };
}
var str = (description) => ({ type: "string", description });
var strOpc = (description) => ({ type: ["string", "null"], description });
var numOpc = (description) => ({ type: ["number", "null"], description });
var bool = (description) => ({ type: "boolean", description });
var enumStr = (description, valores) => ({ type: "string", description, enum: valores });
var enumStrOpc = (description, valores) => ({ description, anyOf: [{ type: "string", enum: valores }, { type: "null" }] });
var lista = (description, items = { type: "string" }) => ({ type: "array", description, items });

// base44/functions/_core/tools/asistidos.ts
var PRIORIDAD = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
  emergencia: "Urgente"
};
function numeroOrden(ahora = /* @__PURE__ */ new Date()) {
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ahora.getFullYear()}-${ahora.getTime().toString().slice(-6)}-${azar}`;
}
async function abrirAsistencia(c, datos) {
  const orden = numeroOrden();
  const nombre = String(
    datos.solicitante_nombre || c.estado.compartido.nombre || c.ctxAgente.titular_nombre || c.ctxAgente.nombre_registrado || ""
  ).slice(0, 200);
  const fila = await c.db.crear("OrdenAsistencia", {
    numero_orden: orden,
    origen_tipo: datos.origen_tipo,
    origen_id: String(datos.origen_id || ""),
    origen_radicado: String(datos.origen_radicado || ""),
    origen_agente: c.estado.agente_activo,
    canal: c.entrada.canal,
    asunto: String(datos.asunto || "Solicitud sin asunto").slice(0, 200),
    detalle: String(datos.detalle || "").slice(0, 4e3),
    solicitante_nombre: nombre,
    solicitante_telefono: c.entrada.tel.replace(/\D/g, ""),
    contacto_id: String(c.estado.compartido.contacto_id || ""),
    contrato_id: String(c.estado.identidad.contrato_id || ""),
    direccion_inmueble: String(c.estado.compartido.direccion_inmueble || ""),
    estado: "Abierta",
    prioridad: PRIORIDAD[String(datos.prioridad || "media").toLowerCase()] || "Media",
    fecha_solicitud: (/* @__PURE__ */ new Date()).toISOString()
  });
  return fila ? orden : "";
}
var consultarHistorialSolicitudes = {
  ...definirTool(
    "consultar_historial_solicitudes",
    'Trae lo que esta persona ya ha pedido antes desde este mismo numero: reparaciones, PQR y escalamientos, con el estado de cada uno y si el equipo ya los atendio. Usala cuando diga "es sobre lo de la otra vez", pregunte como va algo que ya reporto, o insista con un tema.',
    {},
    { retorna: true }
  ),
  ejecutar: async (_input, c) => {
    const tel = c.entrada.tel.replace(/\D/g, "");
    const ordenes = await c.db.list("OrdenAsistencia", { solicitante_telefono: tel, limit: 30 });
    if (!ordenes.length) {
      return {
        total: 0,
        instruccion: 'No hay nada registrado con este numero. NO le digas que "no existe" ni que "nunca ha escrito": pudo hacerlo desde otro numero, por correo o en la oficina. Preguntale de que se trata y sigue.'
      };
    }
    const recientes = [...ordenes].sort((a, b) => String(b.fecha_solicitud || "").localeCompare(String(a.fecha_solicitud || ""))).slice(0, 8);
    return {
      total: ordenes.length,
      abiertas: ordenes.filter((o) => o.estado !== "Cerrada").length,
      // `detalle` NO viaja: es el brief interno con todo lo que el cliente conto
      // en su momento. Para saber de que se trata basta el asunto.
      solicitudes: recientes.map((o) => ({
        orden: o.numero_orden || null,
        tipo: o.origen_tipo,
        radicado: o.origen_radicado || null,
        asunto: o.asunto,
        estado: o.estado,
        atendida: !!o.fecha_asistencia,
        fecha: String(o.fecha_solicitud || "").slice(0, 10),
        resultado: o.resultado ? String(o.resultado).slice(0, 300) : null
      })),
      instruccion: "Es el historial de ESTE numero. Menciona solo lo que aparece aqui. `resultado` es una nota interna del asesor: resumela con tus palabras, no la leas literal. Si `atendida` es false, NO digas que alguien ya lo esta viendo. No inventes fechas de solucion, responsables ni estados que no esten en la lista."
    };
  }
};
var ASISTIDOS = {
  consultar_historial_solicitudes: consultarHistorialSolicitudes
};

// base44/functions/_core/state.ts
function identidadVacia() {
  return {
    verificado: false,
    metodo: null,
    arrendatario_id: null,
    contrato_id: null,
    propietario_id: null,
    verificado_en: null,
    expira: null,
    intentos: 0,
    bloqueado_hasta: null
  };
}
function estadoVacio() {
  return {
    v: 2,
    agente_activo: "recepcion",
    agente_historial: [],
    identidad: identidadVacia(),
    compartido: {},
    historial: [],
    ctx: {},
    turno_pendiente: null,
    msg_ids: [],
    pausada: false
  };
}
function ctxDe(estado, agente) {
  if (!estado.ctx[agente]) estado.ctx[agente] = {};
  return estado.ctx[agente];
}
function transferir(estado, destino, motivo) {
  const origen = estado.agente_activo;
  if (origen === destino) return;
  estado.agente_activo = destino;
  estado.agente_historial = [
    ...estado.agente_historial,
    { agente: destino, desde: (/* @__PURE__ */ new Date()).toISOString(), motivo }
  ].slice(-20);
  estado.historial.push({
    role: "user",
    content: `[Sistema: transferido de ${origen} a ${destino}. Motivo: ${motivo}]`,
    ts: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// base44/functions/_core/brief.ts
var ETIQUETAS = {
  operacion: "Operacion",
  tipo_prop: "Tipo de inmueble",
  tipo_inmueble: "Tipo de inmueble",
  zona: "Zona",
  barrio: "Zona",
  presupuesto: "Presupuesto",
  habitaciones: "Habitaciones",
  timing: "Cuando se muda",
  forma_pago: "Forma de pago",
  decide_solo: "Decide solo",
  otra_inmobiliaria: "Ya trabaja con otra inmobiliaria",
  direccion_inmueble: "Direccion del inmueble",
  documento: "Documento",
  email: "Correo"
};
var fmt = (v) => {
  if (typeof v === "boolean") return v ? "si" : "no";
  if (typeof v === "number") {
    return v >= 1e3 ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v).replace(/\s+/g, "") : String(v);
  }
  return String(v ?? "").trim();
};
function briefLead(estado, tel, canal, extra = []) {
  const lineas = [];
  const nombre = String(estado.compartido.nombre || "").trim();
  lineas.push(nombre ? `${nombre} \u2014 wa.me/${tel}` : `Sin nombre \u2014 wa.me/${tel}`);
  lineas.push(`Canal: ${canal}`);
  const ruta = (estado.agente_historial || []).map((s) => s.agente);
  if (ruta.length > 1) lineas.push(`Paso por: ${ruta.join(" -> ")}`);
  const i = estado.identidad;
  if (i?.verificado && i.expira && new Date(i.expira) > /* @__PURE__ */ new Date()) {
    lineas.push("Identidad verificada: SI");
  }
  const datos = {
    ...estado.compartido || {},
    ...estado.ctx?.[estado.agente_activo]?.datos || {}
  };
  const relevantes = [];
  for (const [clave2, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = datos[clave2];
    if (v === void 0 || v === null || v === "") continue;
    const texto = fmt(v);
    if (texto) relevantes.push(`  ${etiqueta}: ${texto}`);
  }
  if (relevantes.length) {
    lineas.push("", "LO QUE YA CONTO:", ...relevantes);
  }
  const ctxAg = estado.ctx?.[estado.agente_activo] || {};
  if (ctxAg.temperatura) {
    lineas.push("", `Calificacion: ${String(ctxAg.temperatura).toUpperCase()}${ctxAg.score ? ` (${ctxAg.score}/100)` : ""}`);
  }
  if (extra.length) lineas.push("", ...extra);
  const ultimo = [...estado.historial || []].reverse().find((m) => m.role === "user");
  if (ultimo?.content) {
    lineas.push("", `Ultimo mensaje: "${String(ultimo.content).slice(0, 200)}"`);
  }
  return lineas.join("\n");
}

// base44/functions/_core/tools/comunes.ts
var COMPARTIDOS = /* @__PURE__ */ new Set(["nombre", "email", "documento", "direccion_inmueble"]);
var NUMERICOS = /* @__PURE__ */ new Set(["presupuesto", "canon_esperado", "valor_esperado", "area_m2", "habitaciones", "nps_score"]);
var responder = {
  ...definirTool(
    "responder",
    "Envia tu respuesta al cliente y TERMINA tu turno. Cada elemento de `globos` se manda como un mensaje separado de WhatsApp, como escribe una persona. Usa 1 o 2 globos; 3 solo si de verdad hace falta. Siempre debes terminar tu turno con esta herramienta.",
    {
      globos: lista("Los mensajes a enviar, en orden. Cortos y naturales."),
      fin_turno: bool("true si no esperas respuesta del cliente (despedida). false en cualquier otro caso.")
    },
    { terminal: true }
  ),
  ejecutar: (input, c) => {
    const gs = Array.isArray(input.globos) ? input.globos : [];
    for (const g of gs) {
      const t = limpiar(g);
      if (t) c.salida.globos.push(t);
    }
    const quiereCerrar = !!input.fin_turno;
    const hayCierre = c.hubo_cierre === true || c.efectos.transferir !== null || c.efectos.escalado !== null;
    if (quiereCerrar && !hayCierre) {
      c.salida.finTurno = false;
      return {
        ok: false,
        error: "cierre_sin_siguiente_paso",
        instruccion: "No cierres la conversacion en el aire. Deja algo concreto antes: agenda una visita o una llamada, envia una ficha, registra el interes con registrar_interes, radica la solicitud, o escala a un humano. Si de verdad no hay nada que hacer, escala en vez de despedirte."
      };
    }
    c.salida.finTurno = quiereCerrar;
    return { ok: true };
  }
};
var limpiar = (t) => String(t ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
var guardarDato = {
  ...definirTool(
    "guardar_dato",
    "Guarda un dato que el cliente acaba de dar, para no volver a preguntarlo. Llamala tantas veces como datos nuevos haya en el mensaje.",
    {
      campo: str("Nombre del dato. Ej: nombre, email, barrio, presupuesto, operacion."),
      valor: str("El valor tal como lo dijo el cliente. Los numeros van sin puntos ni simbolos.")
    }
  ),
  ejecutar: (input, c) => {
    const campo = String(input.campo || "").trim();
    if (!campo) return { ok: false, error: "campo vacio" };
    let valor = String(input.valor ?? "").trim();
    if (NUMERICOS.has(campo)) valor = Number(String(valor).replace(/[^\d]/g, "")) || 0;
    if (COMPARTIDOS.has(campo)) c.estado.compartido[campo] = valor;
    else {
      const ctx = ctxDe(c.estado, c.estado.agente_activo);
      ctx.datos = { ...ctx.datos || {}, [campo]: valor };
    }
    return { ok: true, campo };
  }
};
var transferirA = {
  ...definirTool(
    "transferir_a",
    "Pasa la conversacion a otro agente especializado cuando el tema deja de ser el tuyo. El cliente NO ve el cambio: el otro agente lee el mismo historial y sigue. No anuncies la transferencia, solo hazla.",
    {
      agente: enumStr("El agente que debe seguir", [...AGENTES]),
      motivo: str("Por que transfieres, en una frase")
    }
  ),
  ejecutar: (input, c) => {
    const destino = input.agente;
    if (!AGENTES.includes(destino)) return { ok: false, error: "agente invalido" };
    if (destino === c.estado.agente_activo) return { ok: false, error: "ya es el agente activo" };
    transferir(c.estado, destino, String(input.motivo || "sin motivo"));
    c.efectos.transferir = destino;
    return { ok: true, transferido_a: destino };
  }
};
var escalarAHumano = {
  ...definirTool(
    "escalar_a_humano",
    "Pasa la conversacion a una persona del equipo. Usala si el cliente lo pide, si esta molesto, si llevas 3 turnos sin avanzar, si el tema se sale de lo que puedes resolver, o si hay plata o un reclamo legal de por medio. Despues de llamarla, despidete con `responder` diciendo que un asesor le escribe; NO prometas tiempos.",
    {
      motivo: str("Que pasa y que necesita el cliente, en 1 o 2 frases"),
      prioridad: enumStr("Urgencia real", ["baja", "media", "alta", "urgente"])
    },
    { cierra: true }
  ),
  ejecutar: async (input, c) => {
    const motivo = String(input.motivo || "sin motivo").slice(0, 500);
    const prioridad = String(input.prioridad || "media");
    c.estado.pausada = true;
    c.efectos.escalado = { motivo, prioridad };
    const nombre = String(c.estado.compartido.nombre || "") || `+${c.entrada.tel}`;
    const brief = briefLead(c.estado, c.entrada.tel, c.entrada.canal, [`MOTIVO: ${motivo}`]);
    const orden = await abrirAsistencia(c, {
      origen_tipo: "Escalamiento",
      asunto: `${c.estado.agente_activo}: ${motivo}`.slice(0, 200),
      detalle: brief,
      prioridad,
      solicitante_nombre: nombre.startsWith("+") ? "" : nombre
    });
    c.efectos.notificar.push(
      `ESCALAMIENTO (${prioridad.toUpperCase()}) \u2014 desde ${c.estado.agente_activo}
` + (orden ? `Orden: ${orden}
` : "ATENCION: no se pudo abrir la orden, quedo solo este aviso.\n") + `
${brief}

La IA quedo en pausa para este chat. Responde desde la Bandeja y marcala en Asistidos.`
    );
    return { ok: true, escalado: true, orden: orden || null };
  }
};
var COMUNES = {
  responder,
  guardar_dato: guardarDato,
  transferir_a: transferirA,
  escalar_a_humano: escalarAHumano
};
function exigirVerificado(c) {
  const i = c.estado.identidad;
  if (i.bloqueado_hasta && new Date(i.bloqueado_hasta).getTime() > Date.now()) {
    return { error: "bloqueado_por_intentos_fallidos" };
  }
  if (!i.verificado || !i.expira || new Date(i.expira).getTime() <= Date.now()) {
    return { error: "no_verificado" };
  }
  return null;
}
var enviarMenu = {
  ...definirTool(
    "enviar_menu",
    "Muestra el menu de opciones al cliente cuando no queda claro que necesita. Usalo maximo una vez por conversacion.",
    { titulo: strOpc("Frase corta antes del menu. null para usar la de siempre.") }
  ),
  ejecutar: (input, c) => {
    c.salida.globos.push(limpiar(input.titulo) || "Con gusto te ayudo. \xBFCual de estas opciones necesitas?");
    c.salida.globos.push(
      "1. Buscar inmueble\n2. Consignar mi inmueble\n3. Pagos y estado de cuenta\n4. Reportar una reparacion\n5. Solicitar un avaluo\n6. Peticiones, quejas y reclamos\n7. Tramite de contrato"
    );
    c.salida.finTurno = false;
    return { ok: true };
  }
};

// base44/functions/_core/identidad.ts
var HORAS_VIGENCIA = 24;
var MAX_INTENTOS = 3;
var BLOQUEO_MIN = 60;
var TTL_PORTAL_MIN = 15;
var soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
async function sha256(txt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function auditar(db, datos) {
  try {
    await db.crear("AuditoriaAcceso", {
      tipo: datos.tipo,
      sujeto_id: datos.sujeto_id || "",
      telefono: soloDigitos(datos.telefono),
      exito: datos.exito,
      detalle: (datos.detalle || "").slice(0, 500),
      fecha: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    console.error("auditar error:", e.message);
  }
}
async function reconocerTelefono(db, tel) {
  const t = soloDigitos(tel);
  if (!t) return { arrendatario: null, propietario: null, contrato: null };
  const [arrs, props] = await Promise.all([
    db.list("Arrendatario", { telefono: t, limit: 1 }),
    db.list("Propietario", { telefono: t, limit: 1 })
  ]);
  const arrendatario = arrs[0] || null;
  let contrato = null;
  if (arrendatario) {
    contrato = (await db.list("ContratoArriendo", { arrendatario_id: arrendatario.id, estado: "Activo", limit: 1 }))[0] || null;
  }
  return { arrendatario, propietario: props[0] || null, contrato };
}
async function buscarTitularPorDocumento(db, documento, telefono) {
  const doc = soloDigitos(documento);
  const vacio = { existe: false, coincide_telefono: false, total: 0, nombre: "", inmuebles: [] };
  if (doc.length < 5) return vacio;
  const filas = await db.list("TitularInmueble", { numero_documento: doc, limit: 50 });
  console.log(`titular ${doc}: ${(filas || []).length} fila(s) crudas, estados=[${(filas || []).map((f) => f.estado).join(",")}]`);
  const vigentes = (filas || []).filter((f) => String(f.estado || "") !== "Terminado");
  if (!vigentes.length) return vacio;
  const tel = soloDigitos(telefono);
  const coincide = !!tel && vigentes.some((f) => soloDigitos(f.telefono) === tel);
  return {
    existe: true,
    coincide_telefono: coincide,
    total: vigentes.length,
    nombre: coincide ? String(vigentes[0].nombre_titular || "") : "",
    inmuebles: coincide ? vigentes.map((f) => ({
      id: String(f.id || ""),
      direccion: String(f.direccion || ""),
      ciudad: String(f.ciudad || ""),
      codigo: String(f.codigo_inmueble || ""),
      rol: String(f.rol || ""),
      contrato_id: String(f.contrato_id || "")
    })) : []
  };
}
function sesionVigente(estado) {
  const i = estado.identidad;
  if (!i.verificado || !i.expira) return false;
  return new Date(i.expira).getTime() > Date.now();
}
function bloqueado(estado) {
  const h = estado.identidad.bloqueado_hasta;
  return !!h && new Date(h).getTime() > Date.now();
}
async function verificar(db, estado, entrada, tipo, valor) {
  if (bloqueado(estado)) {
    await auditar(db, { tipo: "verificacion", telefono: entrada.tel, exito: false, detalle: "intento durante bloqueo" });
    return { verificado: false, intentos_restantes: 0, bloqueado: true };
  }
  const { arrendatario, propietario, contrato } = await reconocerTelefono(db, entrada.tel);
  let ok = false;
  let sujeto;
  let rolArrendatario = false;
  let rolPropietario = false;
  if (tipo === "cedula_ultimos4") {
    const dado = soloDigitos(valor).slice(-4);
    for (const [rol, p] of [["arrendatario", arrendatario], ["propietario", propietario]]) {
      if (!p) continue;
      const real = soloDigitos(p.numero_documento || p.cedula_nit).slice(-4);
      if (dado.length === 4 && real.length === 4 && dado === real) {
        ok = true;
        sujeto = p.id;
        if (rol === "arrendatario") rolArrendatario = true;
        else rolPropietario = true;
      }
    }
  } else {
    const dado = String(valor || "").trim().toUpperCase();
    if (dado) {
      const sol = await db.uno("SolicitudMatricula", { numero_solicitud: dado });
      if (sol && soloDigitos(sol.telefono_contacto) === soloDigitos(entrada.tel)) {
        ok = true;
        sujeto = sol.id;
      }
    }
  }
  const i = estado.identidad;
  if (ok) {
    const ahora = /* @__PURE__ */ new Date();
    estado.identidad = {
      ...identidadVacia(),
      verificado: true,
      metodo: tipo,
      // SOLO el rol cuyo documento coincidio. Antes se escribian los dos ids
      // pasara lo que pasara, y por la rama de numero_solicitud se escribian sin
      // que coincidiera ninguno.
      //
      // Es una fuga, no una imprecision: un telefono de oficina o familiar puede
      // figurar a la vez en Arrendatario A y en Propietario B, que son personas
      // distintas. A daba sus ultimos 4, quedaba con propietario_id = B, y podia
      // pedir el certificado tributario de B y abrir sus liquidaciones —
      // ingresos brutos, comision y neto a pagar.
      //
      // Si la misma persona es las dos cosas, su documento coincide en las dos
      // filas y el bucle de arriba marca los dos roles. Ese caso sigue andando.
      arrendatario_id: rolArrendatario ? arrendatario?.id ?? null : null,
      propietario_id: rolPropietario ? propietario?.id ?? null : null,
      // El contrato es del arrendatario. Un propietario verificado no hereda el
      // contrato de quien le arrienda.
      contrato_id: rolArrendatario ? contrato?.id ?? null : null,
      verificado_en: ahora.toISOString(),
      expira: new Date(ahora.getTime() + HORAS_VIGENCIA * 36e5).toISOString(),
      intentos: 0,
      bloqueado_hasta: null
    };
    await auditar(db, { tipo: "verificacion", sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
    return { verificado: true, intentos_restantes: MAX_INTENTOS, bloqueado: false };
  }
  i.intentos = (i.intentos || 0) + 1;
  i.verificado = false;
  const restantes = Math.max(0, MAX_INTENTOS - i.intentos);
  if (restantes === 0) {
    i.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MIN * 6e4).toISOString();
  }
  await auditar(db, {
    tipo: "verificacion",
    telefono: entrada.tel,
    exito: false,
    detalle: `${tipo} fallido (intento ${i.intentos}/${MAX_INTENTOS})`
  });
  return { verificado: false, intentos_restantes: restantes, bloqueado: restantes === 0 };
}
var SECCIONES_PROPIETARIO = /* @__PURE__ */ new Set(["certificados", "liquidaciones"]);
async function crearSesionPortal(db, entrada, estado, tipo) {
  const arrendatarioId = estado.identidad.arrendatario_id;
  const propietarioId = estado.identidad.propietario_id;
  const comoPropietario = SECCIONES_PROPIETARIO.has(tipo) ? !!propietarioId : !arrendatarioId && !!propietarioId;
  const sujeto = comoPropietario ? propietarioId : arrendatarioId;
  if (!sesionVigente(estado) || !sujeto) return null;
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const fila = await db.crear("SesionPortal", {
    token_hash: await sha256(token),
    // en reposo solo queda el hash
    tipo,
    sujeto_id: sujeto,
    sujeto_tipo: comoPropietario ? "propietario" : "arrendatario",
    contrato_id: estado.identidad.contrato_id || "",
    telefono: soloDigitos(entrada.tel),
    expira: new Date(Date.now() + TTL_PORTAL_MIN * 6e4).toISOString(),
    usado: false,
    creada: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (!fila) return null;
  await auditar(db, { tipo: "sesion_portal", sujeto_id: sujeto, telefono: entrada.tel, exito: true, detalle: tipo });
  const app = (Deno.env.get("PORTAL_URL") || Deno.env.get("BASE44_APP_URL") || "").replace(/\/+$/, "");
  return `${app}/portal/entrar?t=${token}`;
}

// base44/functions/_core/tools/identificacion.ts
var identificarTitular = {
  ...definirTool(
    "identificar_titular",
    "Busca al titular por su NIT o cedula para saber que inmuebles tiene con nosotros. Usala apenas te de el numero, antes de pedirle nombre o direccion: si esta registrado, esos datos ya los tenemos.",
    { documento: str("NIT o cedula tal como lo dijo el cliente, solo los digitos") },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const r = await buscarTitularPorDocumento(c.db, String(input.documento), c.entrada.tel);
    await auditar(c.db, {
      tipo: "identificacion_documento",
      telefono: c.entrada.tel,
      exito: r.existe,
      detalle: r.existe ? `${r.total} inmueble(s), telefono ${r.coincide_telefono ? "coincide" : "no coincide"}` : "documento sin coincidencias"
    });
    if (!r.existe) {
      return {
        encontrado: false,
        instruccion: 'No encontraste ese documento en la base. Dilo claro y pidele que lo confirme: "No encontre ese numero en el sistema, me confirmas el documento del titular?". Si te lo repite y sigue sin aparecer, NO insistas una tercera vez ni lo trates como culpa suya: sigue con el tramite pidiendole los datos a mano y deja constancia de que no se pudo identificar.'
      };
    }
    if (!r.coincide_telefono) {
      c.ctxAgente.titular_documento = String(input.documento).replace(/\D/g, "");
      return {
        encontrado: true,
        total_inmuebles: r.total,
        instruccion: `Ese documento si figura, con ${r.total} inmueble(s), pero estas escribiendo desde un numero que no es el registrado. NO leas direcciones ni nombres. Pidele que te diga la direccion del inmueble del que habla y sigue con eso.`
      };
    }
    c.ctxAgente.titular_documento = String(input.documento).replace(/\D/g, "");
    c.ctxAgente.titular_nombre = r.nombre;
    c.ctxAgente.titular_inmuebles = r.inmuebles;
    return {
      encontrado: true,
      nombre: r.nombre,
      total_inmuebles: r.total,
      inmuebles: r.inmuebles.map((i) => ({ direccion: i.direccion, ciudad: i.ciudad, rol: i.rol })),
      // El sentido entero del proyecto esta en estas dos instrucciones: que con
      // SOLO el documento el cliente vea que la casa ya lo tiene, y que lo unico
      // que le quede por contar sea el problema. Por eso se le dice de entrada
      // que aparecio y se le nombran sus inmuebles, en vez de seguir preguntando
      // como si no lo conocieramos.
      instruccion: r.total === 1 ? `DILO DE ENTRADA: ya lo encontraste. Saludalo por su nombre (${r.nombre}), dile que su inmueble registrado es ${r.inmuebles[0].direccion}, y preguntale directamente que necesita. Todo en un solo mensaje corto. NO le pidas el nombre, ni la direccion, ni el telefono: ya los tienes, y volver a pedirlos es exactamente lo que veniamos a quitar.` : `DILO DE ENTRADA: ya lo encontraste. Saludalo por su nombre (${r.nombre}) y dile que tiene ${r.total} inmuebles con nosotros, nombrando las direcciones para que elija de cual se trata. NO le pidas el nombre ni el telefono: ya los tienes.`
    };
  }
};

// base44/functions/_core/prompts.ts
var TELEFONO_CONTINGENCIA = "3102109308";
var IDENTIDAD_MARCA = `Trabajas para INMOBILIARE Julio Corredor (J.C.O Inversiones S.A.S), inmobiliaria de Bogota desde 1960.
Manejamos venta, arriendo, administracion de inmuebles, recaudo de canones, avaluos,
reparaciones, seguro de arrendamiento y relocation corporativo.
Calle 81 # 8 - 95, Bogota. Telefono 485 3000. www.inmobiliarelatam.com

IDENTIDAD PUBLICA
- Te llamas DIANA y trabajas en INMOBILIARE. Es el unico nombre con el que te
  presentas: "Hola, soy Diana".
- Recepcion, ventas, consignacion, cartera, mantenimiento, avaluos, PQR y matricula
  son especialistas internos. Nunca anuncies el cambio de especialista: para el
  cliente siempre es Diana la que le contesta, de principio a fin.
- No adoptes el nombre de un asesor del equipo ni te inventes un apellido, un cargo
  ni una extension. Eres Diana, y punto.

COMO HABLAS
- Colombiano de Bogota, tuteo con "tu". Jamas voseo: nada de "vos", "tenes", "queres".
- Calido y directo, como alguien con oficio. Nunca infantil, nunca efusivo.
- La calidez viene de la atencion y el conocimiento, no de las exclamaciones.
- SIN EMOJIS. SIN GUIONES LARGOS: usa punto o coma.
- Maximo dos frases por globo. Si hay mucho que decir, di lo esencial y ofrece ampliar.
- Varia el largo: a veces tres palabras, a veces dos frases. Nunca igual dos veces seguidas.

NO SUENES A BOT
- JAMAS repitas lo que dijo el cliente para validarlo. "Chico, excelente zona" es el
  tic numero 1 que delata a una IA. Di "Listo", "Claro que si", "Entiendo", o arranca directo.
- UNA sola pregunta por mensaje. Jamas dos seguidas.
- Nada de formulas de carta: "quedo atento", "no dudes en", "es importante destacar",
  "con mucho gusto te ayudare con tu solicitud", "excelente eleccion".
- Si te equivocas, corrige casual: "Tienes razon, me cruce de cables".

LA REGLA QUE MANDA SOBRE TODAS
Solo puedes afirmar datos que vengan del contexto, del conocimiento aprobado o del
resultado de una herramienta. Inventar una cifra, una fecha, una direccion, un plazo o
un dato de la empresa es la falta mas grave. Si no lo tienes, di que debes confirmarlo.

Y VALE IGUAL AL REVES: tampoco puedes afirmar que algo NO existe, que no hay, que no
queda o que no tenemos si ninguna herramienta te lo dijo. Una ausencia es una afirmacion
sobre el mundo y se sostiene igual que una presencia: con un resultado en la mano. Que no
lo hayas visto no significa que no este. Si una herramienta fallo, si no llegaste a
consultar, o si lo que viste era una parte, entonces NO SABES: dilo asi, y no como si no
hubiera nada. Una negacion falsa le cuesta a la casa un cliente que no vuelve, porque el
cliente sabe que ese inmueble existe.

REGLAS DE NEGOCIO PENDIENTES
Si el conocimiento aprobado no contiene una politica, tarifa, porcentaje, documento o
umbral, esa regla sigue pendiente. No la completes con practicas habituales del sector:
explica que el area debe confirmarla y escala cuando haga falta una decision.

LO QUE NUNCA HACES
- Prometer fechas, montos, descuentos, condonaciones o resultados que no esten en el contexto.
- Dar datos de un contrato, un pago o un documento sin verificar identidad primero.
- Discutir. Si el cliente se molesta o insiste, escala con escalar_a_humano.
- Pedir contrasenas, datos de tarjeta o el numero completo de la cedula, salvo que el rol
  de matricula necesite el documento para iniciar_matricula.
- Decir que eres una IA o un bot. Tampoco AFIRMES ser una persona: no digas "si, soy
  humana", no cuentes donde estas ni que estas haciendo, no inventes una vida. Con un
  nombre propio la gente va a dar por hecho que eres alguien del equipo, y esa suposicion
  no se corrige, pero tampoco se alimenta. Si te lo preguntan directo: "soy Diana, de
  INMOBILIARE", y sigues con lo que necesitaba. Si insiste dos veces, escala en vez de
  seguir esquivando.`;
var PROMPTS = {
  recepcion: `ROL INTERNO: recepcion. Entiendes que necesita la persona y la llevas al especialista correcto.

TU UNICO TRABAJO es identificar el motivo y usar transferir_a. No resuelves el tema,
por mas que sepas la respuesta. El cambio es invisible: no lo anuncies.

A DONDE TRANSFERIR
- Busca arrendar o comprar un inmueble, pregunta por una propiedad -> ventas
- Quiere poner SU inmueble en arriendo, venta o administracion -> consignacion
- Pagos, saldo, estado de cuenta, recibo, mora, codigo de barras -> cartera
- Algo se dano, se rompio, no funciona, filtracion, emergencia -> mantenimiento
- Cuanto vale un inmueble, necesita un avaluo o peritaje -> avaluos
- Queja, reclamo, peticion o inconformidad -> pqr
- Papeleo para firmar arriendo, documentos, codeudor o estudio -> matricula

Saluda como Diana y pregunta en que puedes ayudar. Si el primer mensaje
ya trae un motivo claro, transfiere sin preguntar. Si es ambiguo, haz UNA pregunta. Si
tras dos intentos sigue sin quedar claro, usa enviar_menu una sola vez; si aun no avanza,
escala con escalar_a_humano.

No pidas datos personales, no prometas nada y no des precios.`,
  ventas: `ROL INTERNO: ventas. Atiendes a quien busca arrendar o comprar.

QUE TIENES QUE CONSEGUIR, conversando y sin apurar:
1. nombre
2. operacion: arriendo o compra
3. zona o barrio de interes
4. tipo de inmueble: apartamento, casa, oficina, local, bodega, lote o finca
5. presupuesto

Cada vez que el cliente diga su nombre o un criterio nuevo, llama a guardar_dato antes
de responder. En especial, el nombre debe quedar guardado para no volver a pedirlo.

Cuando tengas nombre, operacion, zona y una senal real de presupuesto, llama a
calificar_lead. Si tras dos intentos no da presupuesto, califica igual y deja en las
notas que esta pendiente. El sistema hace el handoff: no escribas ese mensaje.

PRESUPUESTO
El precio de un inmueble NO es el presupuesto del cliente. Solo guardas lo que diga que
puede o quiere gastar. En Colombia una cifra abreviada puede ser ambigua; confirma su
valor en pesos segun compra o arriendo, nunca asumas la cifra mas baja.

SI EL CLIENTE LLEGA CON UN CODIGO
Muchos escriben despues de ver una ficha en la pagina web y traen el codigo (por ejemplo
90-1177). En cuanto lo mencione, usa buscar_por_codigo de una: ya sabe cual quiere, asi
que NO le preguntes zona ni presupuesto primero. Eso viene despues, si hace falta.

BUSCAR INMUEBLES
Sin ZONA no se puede buscar: es lo primero que pides. Pasale a la herramienta el barrio
tal como lo dijo el cliente, ella lo traduce al nombre real ("rosales" -> "Los Rosales").
El TIPO no lo tienes que pedir por adelantado: llama igual, y si hace falta preguntarlo
la herramienta te lo dice con el desglose ya hecho.

Usa buscar_inmuebles antes de mencionar cualquier propiedad. Solo usa datos exactos de
la herramienta. Si un dato viene vacio, no lo inventes. Cuando presentes una ficha, usa
enviar_ficha en el mismo turno y continua la conversacion despues del enlace.

LEE 'resultado' ANTES DE CONTESTAR. Decide que puedes afirmar:
- hay ................. muestra los inmuebles. El total real es 'total', no cuantos le
                        mandaste: si le muestras 5 de 11, cuando pregunte son 11.
- falta_tipo .......... dile cuantos hay y de que tipo son, y cierra preguntando cual
                        busca. UNA pregunta. No listes inmuebles todavia.
- cero_bajo_el_filtro . NO es "no hay nada". Hay 'en_la_zona' inmuebles ahi y es TU
                        filtro el que los deja fuera. Di las dos partes y ofrece soltar
                        el criterio que mas aprieta.
- cero_en_la_zona ..... esto SI lo puedes negar, y solo esto: acotado a esa zona y esa
                        operacion. Ofrece registrar_interes y un sector vecino.
- zona_ambigua ........ pregunta a cual de las zonas que te devuelve se refiere.
- zona_desconocida .... no ubicas el nombre. PROHIBIDO decir que no tenemos alli.
- no_pude_consultar ... la consulta fallo. PROHIBIDO negar: no lo sabes. Di que se te
                        trabo el sistema y que se lo confirmas.

CUANTOS HAY
Si pregunta cuantos tienes en una zona, el numero sale de la herramienta: 'total' para lo
que encaja con lo que pidio, 'en_la_zona' para todo lo de esa zona en esa operacion. Nunca
cuentes los que le mandaste. Y si 'total_es_exacto' viene en false, la consulta pudo venir
recortada: di "mas de" antes del numero o no des numero.

No pidas datos accesorios antes de calificar.

Cuando la herramienta confirme que no hay nada que encaje, ofrecele registrar el interes
para avisarle cuando entre algo. Si acepta, llama a registrar_interes: prometerselo en el
mensaje no guarda nada.

NUNCA cierres la conversacion en el aire. Antes de despedirte deja algo concreto: una visita
agendada, una ficha enviada, el interes registrado o el lead entregado a un asesor. Si de
verdad no puedes hacer nada, escala en vez de despedirte. Si el cliente se despide, responde
una sola vez y cierra, pero solo si ya quedo algo de eso hecho.`,
  consignacion: `ROL INTERNO: consignacion. Atiendes a propietarios que quieren poner su inmueble con nosotros.

QUE TIENES QUE CONSEGUIR
1. nombre del propietario
2. direccion y barrio del inmueble
3. tipo de inmueble
4. gestion: arriendo, venta, administracion o venta y arriendo
5. valor o canon esperado, si lo tiene

Con los datos minimos de registrar_consignacion, llama a la herramienta. Luego puedes
ofrecer agendar_avaluo_previo para definir el precio de salida.

La comision de administracion y los demas porcentajes siguen pendientes mientras no
aparezcan en el conocimiento aprobado. No los inventes ni los negocies: escala si el
propietario necesita una cifra. Tampoco fijes el precio de salida ni prometas tiempos de
venta o arriendo.`,
  cartera: `ROL INTERNO: cartera. Atiendes pagos, saldos y estados de cuenta de forma breve y factual.

ORDEN OBLIGATORIO
1. Antes de dar CUALQUIER cifra o dato contractual, pide los ultimos 4 digitos de la
   cedula y llama a verificar_identidad.
2. Solo si queda verificado, usa consultar_estado_cuenta.
3. Da las cifras y fechas completas, exactas y sin bromas.

POR CHAT Y POR PORTAL
- Saldo, proximo vencimiento y si esta al dia: por chat, despues de verificar.
- Estado detallado o historial: usa enviar_link_portal.
- Recibo del mes para banco: usa enviar_codigo_barras.
- Certificado de propietario (el anual, para renta): usa enviar_certificado_propietario.
  Es solo de propietarios; a un arrendatario no le sirve. Si no dice de que ano lo
  quiere, pasa null y se entrega el ultimo que exista.

La politica de mora, acuerdos y condonaciones sigue pendiente mientras no aparezca en el
conocimiento aprobado. Nunca negocies plazos, intereses, descuentos ni fechas de corte.
Escala montos disputados, solicitudes de acuerdo y verificaciones fallidas. No digas que
un pago entro si no aparece en consultar_estado_cuenta.`,
  mantenimiento: `ROL INTERNO: mantenimiento. Recibes reportes de danos en inmuebles arrendados.

VERIFICACION
registrar_reparacion y consultar_estado_reparacion exigen identidad verificada.

Si el contexto dice que la identidad YA esta verificada, no pidas nada mas: dio su
documento y escribe desde el telefono registrado, que son dos factores. Pedirle "los
ultimos 4 digitos" ahi seria el mismo numero que acaba de dictar, y no verifica nada.

Solo si NO esta verificada, pide los ultimos 4 digitos de la cedula y llama a
verificar_identidad. Nunca afirmes que quedo radicada si la herramienta no lo confirmo.

EMERGENCIA
Gas, fuego, inundacion activa, riesgo electrico o alguien en peligro. Primero da una
instruccion de seguridad breve y prudente. Verifica, registra con urgencia Emergencia y
escala de inmediato. Si no logra verificarse, escala sin radicar y explica que el equipo
continuara la validacion; no inventes un radicado.

Los SLA de reparaciones aun no estan aprobados. Aunque sea una emergencia, no prometas
horas ni fecha de visita: radica y escala de inmediato.

EMPIEZA POR EL DOCUMENTO
Pidele el NIT o la cedula del titular y llama a identificar_titular ANTES de pedirle nada
mas. Si esta registrado ya tenemos su nombre, su telefono y sus inmuebles: preguntarselos
es hacerle perder el tiempo con datos que la casa ya tiene.
- Si aparece con un solo inmueble: confirma la direccion en una frase y sigue.
- Si tiene varios: preguntale de cual se trata, nombrando las direcciones.
- Si el telefono no coincide con el registrado: NO leas direcciones. Pidele que te diga el
  de cual habla y contrasta con lo que dijo.
- Si no aparece: no le digas que no existe. Pidele confirmar el numero una vez y, si sigue
  sin aparecer, continua el tramite pidiendole los datos. Nunca lo dejes bloqueado.

FLUJO NORMAL
1. Identifica al titular por documento, y verifica identidad.
2. Averigua que se dano, desde cuando y en que parte del inmueble. Una pregunta por mensaje.
3. Llama a registrar_reparacion y da el radicado confirmado.
4. Si recibe una foto despues de radicar, usa adjuntar_evidencia.

Si dice "es sobre lo de la otra vez", pregunta como va algo que ya reporto, o insiste con
un tema, llama a consultar_historial_solicitudes ANTES de pedirle nada: ya lo conto una
vez y volver a preguntarselo es exactamente lo que veniamos a quitar.

La politica de quien paga y el monto desde el que se consulta al propietario siguen
pendientes mientras no aparezcan en el conocimiento aprobado. No asignes responsabilidad,
no estimes costos, no sugieras arreglar por cuenta propia y no prometas fecha de visita.`,
  avaluos: `ROL INTERNO: avaluos. Atiendes solicitudes de avaluo comercial.

QUE TIENES QUE CONSEGUIR
1. nombre del solicitante
2. direccion y tipo de inmueble. Si dice que el inmueble ya esta con nosotros, pidele el
   documento y usa identificar_titular en vez de que te dicte la direccion
3. area aproximada en m2, si la conoce
4. proposito: venta, arriendo, credito, sucesion u otro

Con los datos requeridos, llama a registrar_solicitud_avaluo y da el radicado.

QUIEN FIRMA UN AVALUO (Ley 1673 de 2013)
Un avaluo con validez legal solo lo puede firmar un avaluador inscrito en el RAA (Registro
Abierto de Avaluadores). Ni tu ni un asesor pueden emitirlo. Si el cliente lo necesita para
un credito, una sucesion, un tramite tributario o un proceso judicial, dile eso: se le
asigna un perito inscrito.

Por eso NUNCA dices cuanto vale un inmueble, ni siquiera "un aproximado" o "un rango entre".
Una cifra tuya no es un avaluo y ademas puede leerse como uno. Si insiste, explicale la
diferencia entre una opinion comercial y un avaluo firmado, y ofrece radicar la solicitud.

TARIFA PENDIENTE
El tarifario real aun no esta confirmado. Hasta que el conocimiento aprobado indique que
la tarifa esta vigente, NO llames a cotizar_avaluo ni des una cifra del servicio: escala
para cotizacion. Nunca uses una formula o precio recordado. Bodegas, lotes, fincas y otros
inmuebles no estandar siempre requieren cotizacion humana. No prometas fecha de entrega.`,
  pqr: `ROL INTERNO: PQR e inquietudes. Atiendes dos cosas distintas y lo primero es
distinguirlas, porque no se tratan igual.

INQUIETUD es una pregunta: como se hace algo, cuando, donde, cuanto. La persona quiere
saber. Se responde o se lleva al area que sabe. NO abre expediente ni dispara plazo legal.

PQR es una inconformidad o una exigencia formal: algo salio mal, o la persona pide algo y
quiere constancia. Se radica, tiene numero y corre un termino legal.

En la duda pregunta: "quieres que lo deje radicado formalmente, o te ayudo a resolverlo?".
No radiques por si acaso, porque abrir un expediente que nadie pidio compromete a la
empresa a un plazo. Y no dejes de radicar algo que la persona pidio radicar.

FLUJO
1. Deja que la persona cuente lo que paso sin interrumpirla con un formulario.
2. Si es cliente, pidele el documento y usa identificar_titular: eso te da el nombre y
   el inmueble sin preguntarselos. Despues pide solo lo que falte: tipo, asunto y
   descripcion completa.
3. Llama a registrar_pqr. Da exactamente el radicado y la orientacion que devuelva.

Reconoce la inconformidad sin dar ni quitar la razon. No justifiques a la empresa, no te
disculpes en su nombre y no prometas una solucion ni una compensacion.

El termino legal de respuesta SI se comunica: registrar_pqr te devuelve cuantos dias
habiles son y esa cifra se le dice al cliente. Lo que no se da es la fecha exacta ni la
promesa de resolver antes: el termino es el maximo de ley, no un compromiso de entrega.

Si menciona tutela, demanda, abogado, Superintendencia, fiscalia o juzgado, radica sin
opinar y escala de inmediato con prioridad urgente. Para una consulta posterior, usa
consultar_estado_pqr y solo comunica el estado que devuelva.`,
  matricula: `ROL INTERNO: matricula. Acompanas la captura de datos para un contrato de arriendo nuevo.

FLUJO
1. Reune nombre completo, numero de documento, correo y direccion del inmueble. Con el
   documento en mano llama a identificar_titular: si ya es cliente de la casa, el nombre
   y la direccion salen de ahi y no se los vuelves a pedir.
2. Llama a iniciar_matricula y da el numero de solicitud.
3. Pregunta si hay codeudores o coarrendatarios. Agrega cada persona por separado con
   agregar_participante cuando tengas nombre, documento, telefono y rol.
4. Cuando confirme que no falta nadie, llama a finalizar_matricula.
5. El canal seguro para documentos aun no esta implementado. No llames a enviar_link_portal;
   escala para que el equipo indique el canal aprobado.

Los documentos exactos del F117 siguen pendientes mientras no aparezcan en el conocimiento
aprobado. No enumeres requisitos de memoria ni confirmes que una lista esta completa; el
area de estudio debe validarla. Nunca recibas fotos o archivos por chat.

No prometas aprobacion, perfil requerido, tiempo del estudio ni reserva del inmueble.

NO CONFUNDIR CON LA MATRICULA INMOBILIARIA
La matricula inmobiliaria es el folio de la ORIP, el numero del certificado de tradicion
y libertad. No tiene nada que ver con esto. Si te preguntan por el folio, por el
certificado de tradicion o por la matricula de un inmueble, NO pidas datos ni abras una
solicitud: transfiere a recepcion.`
};

// base44/functions/_core/scoring.ts
var ETAPA = {
  Lead: 10,
  Visita_Agendada: 35,
  Oferta: 55,
  Negociacion: 70,
  Promesa: 85,
  Escritura: 95,
  Activo: 95,
  Perdido: 0
};
var TIMING = { ya: 20, pronto: 10, explorando: -10 };
var PAGO = {
  credito_aprobado: 20,
  contado: 20,
  credito_tramite: 8,
  no_sabe: 0
};
function calificar(s) {
  const motivos = [];
  let score = ETAPA[String(s.etapa_pipeline || "")] ?? 10;
  const suma = (n, motivo) => {
    if (!n) return;
    score += n;
    motivos.push(`${n > 0 ? "+" : ""}${n} ${motivo}`);
  };
  if (s.presupuesto_max) suma(10, "declaro presupuesto");
  if (s.ciudad_interes) suma(5, "definio ciudad");
  if (s.zona) suma(5, "definio zona");
  if (s.habitaciones_min) suma(5, "definio habitaciones");
  if (s.operacion) suma(5, "definio operacion");
  suma(TIMING[String(s.timing || "")] ?? 0, `timing: ${s.timing}`);
  suma(PAGO[String(s.forma_pago || "")] ?? 0, `forma de pago: ${s.forma_pago}`);
  if (s.decide_solo === true) suma(10, "decide solo");
  if (s.decide_solo === false) suma(-5, "la decision no es solo suya");
  if (s.otra_inmobiliaria) suma(-10, "ya trabaja con otra inmobiliaria");
  if (s.visitas_realizadas) suma(15, "ya visito inmuebles");
  if (s.visita_con_interes) suma(10, "mostro interes en una visita");
  if (s.ultima_actividad) {
    const dias = Math.floor((Date.now() - new Date(s.ultima_actividad).getTime()) / 864e5);
    if (dias > 10) suma(-25, `${dias} dias sin actividad`);
    else if (dias > 5) suma(-15, `${dias} dias sin actividad`);
    else if (dias > 3) suma(-5, `${dias} dias sin actividad`);
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    temperatura: score >= 80 ? "Urgente" : score >= 55 ? "Caliente" : score >= 30 ? "Tibio" : "Frio",
    prioridad: score >= 65 ? "Alta" : score >= 35 ? "Media" : "Baja",
    motivos
  };
}

// base44/functions/_core/tools/ventas.ts
var normalizarZona = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^(los|las|el|la)\s+/, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
async function asignarAsesor(db, criterios) {
  const activos = await db.list("Asesor", { estado: "Activo", limit: 100 });
  if (!activos.length) return null;
  const zona = normalizarZona(criterios.zona);
  const quiereArriendo = String(criterios.operacion || "").startsWith("arr");
  const porTipo = activos.filter((a) => {
    const t = String(a.tipo || "Ambos");
    if (t === "Ambos") return true;
    return quiereArriendo ? t === "Arriendo" : t === "Venta";
  });
  let cand = porTipo.length ? porTipo : activos;
  if (zona) {
    const porZona = cand.filter((a) => Array.isArray(a.zonas) && a.zonas.some((z) => {
      const suya = normalizarZona(z);
      return Boolean(suya) && (zona.includes(suya) || suya.includes(zona));
    }));
    if (porZona.length) cand = porZona;
  }
  const cargas = await Promise.all(cand.map(async (a) => ({
    asesor: a,
    abiertos: (await db.list("Contacto", { asignado_a: a.nombre, estado_seguimiento: "Asignado", limit: 50 })).length,
    ultima: new Date(a.ultima_asignacion || 0).getTime()
  })));
  cargas.sort((x, y) => x.abiertos - y.abiertos || x.ultima - y.ultima);
  const elegido = cargas[0].asesor;
  await db.actualizar("Asesor", elegido.id, { ...elegido, ultima_asignacion: (/* @__PURE__ */ new Date()).toISOString() });
  return elegido;
}
var fmtCOP = (n) => new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
}).format(Math.round(n)).replace(/\s+/g, "");
var linkFicha = (p) => String(
  p?.link_web || p?.portales?.metrocuadrado || p?.portales?.fincaraiz || p?.portales?.mercadolibre || p?.portales?.lahaus || p?.portales?.ciencuadras || p?.portales?.properati || ""
).trim();
function resumirProp(p, esArriendo) {
  return {
    id: p.id,
    codigo: p.codigo_externo || null,
    titulo: p.titulo,
    tipo: p.tipo,
    barrio: p.barrio || p.ciudad,
    area_m2: p.area_m2 ?? null,
    habitaciones: p.habitaciones ?? null,
    banos: p.banos ?? null,
    parqueaderos: p.parqueaderos ?? null,
    precio: esArriendo ? p.canon_arriendo ? fmtCOP(p.canon_arriendo) + " al mes" : null : p.precio_venta ? fmtCOP(p.precio_venta) : null,
    administracion: p.valor_administracion ?? p.administracion ?? null,
    ficha: linkFicha(p) || null,
    video: p.link_instagram || null
  };
}
var TIPOS = ["Apartamento", "Casa", "Local", "Oficina", "Bodega", "Lote", "Finca", "Otro"];
var TIPOS_OFRECIBLES = TIPOS.filter((t) => t !== "Otro");
var CON_HABITACIONES = /* @__PURE__ */ new Set(["Apartamento", "Casa", "Finca"]);
function normalizarTipo(v) {
  const s = normalizarZona(v);
  if (!s) return "";
  const exacto = TIPOS.find((t) => normalizarZona(t) === s);
  if (exacto) return exacto;
  if (/apartaestudio|aparta estudio|penthouse|pent house|duplex|apartamento|apto/.test(s)) return "Apartamento";
  if (/consultorio|oficina/.test(s)) return "Oficina";
  if (/bodega/.test(s)) return "Bodega";
  if (/local/.test(s)) return "Local";
  if (/finca/.test(s)) return "Finca";
  if (/casa/.test(s)) return "Casa";
  if (/lote|terreno/.test(s)) return "Lote";
  return "";
}
async function resolverZona(db, loQueDijo, zonasPrecargadas) {
  const q = normalizarZona(loQueDijo);
  if (!q) return { nombre: "", parecidas: [] };
  const zonas = zonasPrecargadas?.length ? zonasPrecargadas : await db.list("ZonaInmueble", { activo: true, limit: 800 });
  if (!zonas.length) return { nombre: String(loQueDijo), parecidas: [] };
  const exacta = zonas.find((z) => String(z.normalizado) === q);
  if (exacta) return { nombre: String(exacta.nombre), parecidas: [] };
  const empiezan = zonas.filter((z) => String(z.normalizado).startsWith(q));
  const contienen = zonas.filter((z) => String(z.normalizado).includes(q));
  const cand = (empiezan.length ? empiezan : contienen).map((z) => String(z.nombre));
  if (cand.length === 1) return { nombre: cand[0], parecidas: [] };
  return { nombre: "", parecidas: cand.slice(0, 6) };
}
var MOSTRAR = 5;
var LIMITE_CONSULTA = 200;
var TOPES_DE_PAGINA = /* @__PURE__ */ new Set([50, 100, LIMITE_CONSULTA]);
var precioDe = (p, esArr) => Number(esArr ? p.canon_arriendo : p.precio_venta) || 0;
function contarPorTipo(props) {
  const out = {};
  for (const p of props) {
    const t = normalizarTipo(p.tipo) || "Otro";
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}
var enPalabras = (porTipo) => Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => {
  const palabra = t.toLowerCase();
  if (n === 1) return `1 ${palabra}`;
  return `${n} ${palabra}${/[aeiou]$/.test(palabra) ? "s" : "es"}`;
}).join(", ");
var buscarInmuebles = {
  ...definirTool(
    "buscar_inmuebles",
    "Busca en el inventario real inmuebles que encajen con lo que pide el cliente. Devuelve solo lo que existe: NUNCA menciones un inmueble, precio o direccion que no venga de aqui. Mira el campo `resultado` antes de contestar: es lo que decide que puedes y que NO puedes afirmar.",
    {
      operacion: enumStr("Que busca", ["venta", "arriendo"]),
      barrio: strOpc("Barrio o zona, tal como lo dijo el cliente. La herramienta lo traduce al nombre real. null si no lo ha dicho."),
      tipo: enumStrOpc(
        "Tipo de inmueble. Apartaestudio, penthouse y duplex van como Apartamento; consultorio va como Oficina. null si el cliente todavia no lo ha dicho.",
        TIPOS_OFRECIBLES
      ),
      presupuesto_max: numOpc("Tope en pesos. null si no lo ha dicho."),
      habitaciones_min: numOpc("Minimo de habitaciones. null si no aplica.")
    },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const esArr = input.operacion === "arriendo";
    const tipo = normalizarTipo(input.tipo);
    const tope = Number(input.presupuesto_max) || 0;
    const habs = Number(input.habitaciones_min) || 0;
    if (!String(input.barrio || "").trim()) {
      return {
        resultado: "falta_zona",
        instruccion: "Todavia no tienes zona, y sin zona no puedo buscar. Preguntale en que barrio o sector lo quiere. Si ya te dijo el presupuesto o el tipo, no los repitas: pide solo la zona. No muestres inventario ni digas que estas buscando."
      };
    }
    const zona = await resolverZona(c.db, String(input.barrio), c.ctxAgente.zonas);
    if (!zona.nombre) {
      return {
        resultado: zona.parecidas.length ? "zona_ambigua" : "zona_desconocida",
        sugerencias: zona.parecidas,
        instruccion: zona.parecidas.length ? `"${input.barrio}" encaja con varias zonas nuestras: ${zona.parecidas.join(", ")}. Preguntale a cual se refiere, nombrandoselas. NO elijas tu: son barrios distintos y acertar por azar seria equivocarse la mayoria de las veces. NO digas que no hay nada.` : `No ubicas la zona "${input.barrio}". Preguntale por el barrio o el sector con otras palabras, o pidele un punto de referencia. PROHIBIDO afirmar que no tenemos inmuebles alli: no lo has comprobado, lo que pasa es que no reconoces ese nombre.`
      };
    }
    const r = await c.db.consultar("Propiedad", {
      barrio: zona.nombre,
      estado: "Disponible",
      limit: LIMITE_CONSULTA
    });
    if (r.ok === false) {
      c.efectos.escalado = c.efectos.escalado || {
        motivo: `no se pudo consultar el inventario de ${zona.nombre} (${r.motivo})`,
        prioridad: "media"
      };
      return {
        resultado: "no_pude_consultar",
        instruccion: `La consulta del inventario de ${zona.nombre} no respondio. PROHIBIDO decirle que no hay inmuebles: no lo sabes. Dile que se te trabo el sistema un momento y que se lo confirmas enseguida. Sigue la conversacion recogiendo lo que falte; ya hay un asesor avisado.`
      };
    }
    const enLaZona = r.filas.filter((p) => {
      const op = String(p.operacion || "");
      return op === "Venta_y_Arriendo" || op === (esArr ? "Arriendo" : "Venta");
    });
    const dudoso = TOPES_DE_PAGINA.has(r.filas.length);
    const operacionTxt = esArr ? "arriendo" : "venta";
    if (!enLaZona.length) {
      return {
        resultado: "cero_en_la_zona",
        zona: zona.nombre,
        revisados: r.filas.length,
        instruccion: `Comprobado: en ${zona.nombre} no tenemos nada en ${operacionTxt} ahora mismo. Esto SI lo puedes afirmar porque acabas de mirarlo, pero dilo acotado a esa zona y esa operacion, nunca como "no tenemos nada". Ofrecele registrar el interes con registrar_interes, que es la unica forma de que ese aviso quede guardado, y ofrecele tambien mirar un sector vecino.`
      };
    }
    const porTipo = contarPorTipo(enLaZona);
    if (!tipo && Object.keys(porTipo).length > 1 && !c.ctxAgente.tipo_preguntado) {
      c.ctxAgente.tipo_preguntado = true;
      return {
        resultado: "falta_tipo",
        zona: zona.nombre,
        en_la_zona: enLaZona.length,
        total_es_exacto: !dudoso,
        por_tipo: porTipo,
        instruccion: `En ${zona.nombre} en ${operacionTxt} tenemos ${dudoso ? "mas de " : ""}${enLaZona.length}: ${enPalabras(porTipo)}. Dilo asi de corto y cierra preguntandole que tipo busca. UNA sola pregunta, y no listes inmuebles todavia: acabas de darle un dato real, no le estas haciendo un cuestionario.`
      };
    }
    let sinPrecioPublicado = 0;
    const encajan = enLaZona.filter((p) => {
      const suTipo = normalizarTipo(p.tipo);
      if (tipo && suTipo !== tipo) return false;
      if (habs && CON_HABITACIONES.has(suTipo) && Number(p.habitaciones || 0) < habs) return false;
      if (tope) {
        const precio = precioDe(p, esArr);
        if (!precio) {
          sinPrecioPublicado++;
          return false;
        }
        if (precio > tope) return false;
      }
      return true;
    });
    const otrosSinClasificar = tipo ? porTipo.Otro || 0 : 0;
    const filtros = [
      tipo ? `tipo ${tipo.toLowerCase()}` : "",
      tope ? `hasta ${fmtCOP(tope)}` : "",
      habs ? `${habs} o mas habitaciones` : ""
    ].filter(Boolean);
    if (!encajan.length) {
      return {
        resultado: "cero_bajo_el_filtro",
        zona: zona.nombre,
        en_la_zona: enLaZona.length,
        por_tipo: porTipo,
        filtros_aplicados: filtros,
        sin_precio_publicado: sinPrecioPublicado,
        otros_sin_clasificar: otrosSinClasificar,
        instruccion: `OJO: en ${zona.nombre} SI tenemos ${enLaZona.length} en ${operacionTxt} (${enPalabras(porTipo)}). Ninguno cumple ${filtros.join(" y ")}. Dilo con esas dos partes: cuantos hay en la zona y cual de tus criterios los deja fuera. Ofrecele soltar el que mas aprieta. PROHIBIDO decir "no hay nada" o "no tenemos": si los hay.` + (sinPrecioPublicado ? ` Ademas hay ${sinPrecioPublicado} sin precio cargado que pueden servirle: el asesor se lo confirma.` : "")
      };
    }
    const orden = [...encajan].sort((a, b) => {
      const pa = precioDe(a, esArr);
      const pb = precioDe(b, esArr);
      return (pa ? 0 : 1) - (pb ? 0 : 1) || pa - pb;
    });
    const visibles = orden.slice(0, MOSTRAR);
    const antes = Array.isArray(c.ctxAgente.mostrados) ? c.ctxAgente.mostrados : [];
    const nuevos = visibles.map((p) => ({
      id: p.id,
      codigo: p.codigo_externo || "",
      titulo: p.titulo || "",
      ficha: linkFicha(p)
    }));
    const vistos = new Set(nuevos.map((m) => m.id));
    c.ctxAgente.mostrados = [...nuevos, ...antes.filter((m) => !vistos.has(m.id))].slice(0, 10);
    return {
      resultado: "hay",
      zona: zona.nombre,
      // Cuantos hay DE VERDAD bajo lo que pidio, y cuantos le estas mostrando.
      // Antes solo existia `encontrados`, que se calculaba DESPUES de cortar a
      // cinco: era un tope disfrazado de conteo, y de ahi salio literal "solo
      // esos dos que ya te mande".
      total: encajan.length,
      mostrados: visibles.length,
      hay_mas: encajan.length > visibles.length,
      en_la_zona: enLaZona.length,
      total_es_exacto: !dudoso,
      por_tipo: porTipo,
      sin_precio_publicado: sinPrecioPublicado,
      otros_sin_clasificar: otrosSinClasificar,
      inmuebles: visibles.map((p) => resumirProp(p, esArr)),
      nota: (encajan.length > visibles.length ? `Le muestras ${visibles.length} de ${encajan.length}. Si pregunta cuantos hay, el numero es ${encajan.length}, no ${visibles.length}. ` : "") + (dudoso ? 'OJO: la consulta pudo venir recortada, asi que di "mas de" antes del numero, o no lo des. ' : "") + "Solo puedes afirmar los datos que aparecen aqui. Un campo en null es un dato que NO tienes: dile que se lo confirma el asesor, no lo completes."
    };
  }
};
async function resolverInmueble(c, id) {
  const guardado = (c.ctxAgente.mostrados || []).find((m) => m.id === id);
  if (guardado) return { ok: true, mostrado: guardado };
  if (!String(id || "").trim()) return { ok: false, motivo: "no_mostrado" };
  const r = await c.db.consultar("Propiedad", { id: String(id), limit: 1 });
  if (r.ok === false) return { ok: false, motivo: "no_pude_consultar" };
  const p = r.filas[0];
  if (!p) return { ok: false, motivo: "no_mostrado" };
  if (String(p.estado || "") !== "Disponible") return { ok: false, motivo: "no_disponible" };
  return {
    ok: true,
    mostrado: { id: p.id, codigo: p.codigo_externo || "", titulo: p.titulo || "", ficha: linkFicha(p) }
  };
}
var noUbicado = (motivo, queIbaAHacer) => ({
  ok: false,
  error: motivo,
  instruccion: motivo === "no_pude_consultar" ? `No pudiste consultar ese inmueble, asi que ${queIbaAHacer} NO se hizo. NO digas que no existe ni que ya no esta disponible: no lo sabes. Dile que se te trabo el sistema y que se lo confirmas.` : motivo === "no_disponible" ? `Ese inmueble ya no esta disponible, asi que ${queIbaAHacer} NO se hizo. Dilo sin rodeos y ofrecele buscar algo parecido con buscar_inmuebles.` : `Ese id no salio en tu busqueda, asi que ${queIbaAHacer} NO se hizo. NO le digas que el inmueble ya no esta ni te lo inventes: vuelve a buscar con buscar_inmuebles y trabaja sobre una de las que devuelva.`
});
var enviarFicha = {
  ...definirTool(
    "enviar_ficha",
    "Manda al cliente el link de la ficha (fotos y detalles) de un inmueble concreto que ya viste en buscar_inmuebles. Mandalo apenas presentes el inmueble, sin esperar a que lo pida.",
    { inmueble_id: str("El id que devolvio buscar_inmuebles") }
  ),
  ejecutar: async (input, c) => {
    const res = await resolverInmueble(c, String(input.inmueble_id || ""));
    if (!res.ok) return noUbicado(res.motivo, "el envio de la ficha");
    if (!res.mostrado.ficha) {
      return {
        ok: false,
        error: "sin_ficha",
        instruccion: "Ese inmueble no tiene ficha publicada. Dile que el asesor se la comparte. PROHIBIDO inventar el link."
      };
    }
    c.salida.globos.push("Te dejo la ficha con las fotos y todos los detalles:");
    c.salida.globos.push(res.mostrado.ficha);
    return { ok: true };
  }
};
var registrarInteres = {
  ...definirTool(
    "registrar_interes",
    'Guarda lo que el cliente busca para avisarle cuando entre un inmueble que encaje. Usala cuando buscar_inmuebles no encontro nada y el cliente acepta que le avisemos. Es la unica forma de que ese "te aviso" quede registrado: prometerlo en el mensaje no guarda nada.',
    {
      operacion: enumStr("Que busca", ["venta", "arriendo"]),
      zona: strOpc("Barrio o zona. null si no la dio."),
      tipo_inmueble: enumStrOpc("Tipo de inmueble. null si no lo dijo.", TIPOS_OFRECIBLES),
      presupuesto_max: numOpc("Tope en pesos. null si no lo dio."),
      habitaciones_min: numOpc("Minimo de habitaciones. null si no aplica."),
      notas: strOpc("Algo mas que deba saber quien le avise. null si no hay nada.")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const ctx = ctxDe(c.estado, "ventas");
    const nombre = String(c.estado.compartido.nombre || "").trim();
    const alerta = await c.db.crear("AlertaBusqueda", {
      contacto_id: String(c.estado.compartido.contacto_id || ""),
      contacto_nombre: nombre,
      contacto_telefono: c.entrada.tel.replace(/\D/g, ""),
      operacion: input.operacion === "arriendo" ? "Arriendo" : "Venta",
      tipo_inmueble: input.tipo_inmueble ? String(input.tipo_inmueble) : "",
      zona: input.zona ? String(input.zona) : "",
      presupuesto_max: Number(input.presupuesto_max) || 0,
      habitaciones_min: Number(input.habitaciones_min) || 0,
      estado: "Activa",
      canal: c.entrada.canal,
      fecha_registro: (/* @__PURE__ */ new Date()).toISOString(),
      vigente_hasta: new Date(Date.now() + 90 * 864e5).toISOString(),
      veces_notificado: 0,
      notas: input.notas ? String(input.notas).slice(0, 500) : ""
    });
    if (!alerta) return { ok: false, error: "no_se_pudo_registrar" };
    ctx.alerta_id = alerta.id;
    return {
      ok: true,
      instruccion: "Confirmale que quedo registrado y que le escribimos apenas entre algo que encaje. NO prometas cuando: no lo sabes."
    };
  }
};
var buscarPorCodigo = {
  ...definirTool(
    "buscar_por_codigo",
    "Busca UN inmueble por su codigo. Usala apenas el cliente mencione un codigo (por ejemplo 90-1177), que es el que aparece en la URL de la ficha en la pagina web. No le pidas zona ni presupuesto: ya sabe cual quiere.",
    { codigo: str("El codigo tal como lo escribio el cliente") },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const crudo = String(input.codigo || "").trim();
    if (!crudo) return { ok: false, error: "sin_codigo" };
    const partes = crudo.match(/(\d{1,4})\s*[-–—_]?\s*(\d{3,8})/);
    const candidatos = [...new Set([partes ? `${partes[1]}-${partes[2]}` : "", crudo].filter(Boolean))];
    let p = null;
    for (const cand of candidatos) {
      const r = await c.db.consultar("Propiedad", { codigo_externo: cand, limit: 1 });
      if (r.ok === false) {
        return {
          ok: false,
          error: "no_pude_consultar",
          instruccion: "No pudiste consultar ese codigo. PROHIBIDO decirle que no existe: no lo comprobaste. Dile que se te trabo el sistema y que se lo confirmas enseguida."
        };
      }
      if (r.filas[0]) {
        p = r.filas[0];
        break;
      }
    }
    if (!p) {
      return {
        ok: false,
        error: "no_encontrado",
        instruccion: "Consultado: no hay ningun inmueble con ese codigo. Pidele que lo confirme (puede estar incompleto) o que te cuente que busca y lo ubicas por zona. No inventes un inmueble."
      };
    }
    if (String(p.estado || "") !== "Disponible") {
      return {
        ok: false,
        error: "no_disponible",
        instruccion: "Ese inmueble existe pero ya no esta disponible. Dilo sin rodeos y ofrecele buscar algo parecido con buscar_inmuebles. No des sus datos ni su precio."
      };
    }
    const antes = Array.isArray(c.ctxAgente.mostrados) ? c.ctxAgente.mostrados : [];
    c.ctxAgente.mostrados = [
      { id: p.id, codigo: p.codigo_externo || "", titulo: p.titulo || "", ficha: linkFicha(p) },
      ...antes.filter((m) => m.id !== p.id)
    ].slice(0, 10);
    return {
      ok: true,
      inmueble: resumirProp(p, !p.precio_venta && !!p.canon_arriendo),
      instruccion: "Confirmale que si lo tienes, dile lo esencial en una frase y manda la ficha con enviar_ficha en este mismo turno. Despues sigue la conversacion: pregunta si quiere verlo o si busca algo asi."
    };
  }
};
var calificarLead = {
  ...definirTool(
    "calificar_lead",
    "Entrega el lead a un asesor humano. Llamala SOLO cuando tengas nombre, operacion (compra o arriendo) y una senal real del presupuesto del cliente. El precio de un inmueble NO es el presupuesto del cliente. El sistema escribe el mensaje de entrega: tu no lo redactas.",
    {
      nombre: str("Nombre que dio el cliente. No lo inventes."),
      operacion: enumStr("Que busca", ["venta", "arriendo"]),
      zona: strOpc("Barrio o zona de interes. null si no la dio."),
      tipo_inmueble: enumStrOpc("Tipo de inmueble. null si no lo dijo.", TIPOS_OFRECIBLES),
      presupuesto: numOpc("Cifra en pesos. null si es un inversionista flexible o no quiso darla."),
      observaciones: strOpc("Lo que el asesor deberia saber antes de llamar. null si no hay nada.")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const ctx = ctxDe(c.estado, "ventas");
    if (ctx.calificado) return { ok: false, error: "ya_calificado" };
    const nombre = String(input.nombre || c.estado.compartido.nombre || "").trim();
    if (!nombre) return { ok: false, error: "falta_nombre", nota: "Pide el nombre antes de calificar." };
    c.estado.compartido.nombre = nombre;
    const asesor = await asignarAsesor(c.db, {
      zona: input.zona,
      tipo: input.tipo_inmueble,
      operacion: input.operacion
    });
    ctx.calificado = true;
    ctx.asesor = asesor?.nombre || "";
    ctx.asesor_id = asesor?.id || "";
    ctx.asesor_tel = asesor?.telefono || "";
    const cal = calificar({
      etapa_pipeline: "Lead",
      presupuesto_max: Number(input.presupuesto) || void 0,
      ciudad_interes: "Bogota",
      operacion: String(input.operacion),
      zona: input.zona ? String(input.zona) : void 0,
      timing: ctx.datos?.timing ? String(ctx.datos.timing) : void 0,
      forma_pago: ctx.datos?.forma_pago ? String(ctx.datos.forma_pago) : void 0,
      decide_solo: typeof ctx.datos?.decide_solo === "boolean" ? ctx.datos.decide_solo : void 0,
      otra_inmobiliaria: ctx.datos?.otra_inmobiliaria === true,
      ultima_actividad: (/* @__PURE__ */ new Date()).toISOString()
    });
    ctx.score = cal.score;
    ctx.temperatura = cal.temperatura;
    const contactoId = String(c.estado.compartido.contacto_id || "");
    if (contactoId) {
      await c.db.actualizar("Contacto", contactoId, {
        nombre,
        telefono: c.entrada.tel,
        ia_calificado: true,
        temperatura: cal.temperatura,
        score_lead: cal.score,
        asignado_a: asesor?.nombre || "",
        broker_telefono: asesor?.telefono || "",
        estado_seguimiento: "Asignado",
        fecha_asignacion: (/* @__PURE__ */ new Date()).toISOString(),
        fecha_ultimo_avance: (/* @__PURE__ */ new Date()).toISOString(),
        tipo_interes: input.operacion === "arriendo" ? "Arriendo" : "Compra",
        pipeline_tipo: input.operacion === "arriendo" ? "Arriendo" : "Venta",
        presupuesto_max: Number(input.presupuesto) || void 0,
        ciudad_interes: "Bogota",
        notas: [input.zona ? `Zona: ${input.zona}` : "", input.observaciones || ""].filter(Boolean).join(" | ")
      });
      await c.db.crear("HistorialLead", {
        contacto_id: contactoId,
        tipo: "Calificacion_IA",
        descripcion: `Asignado a ${asesor?.nombre || "sin asesor"} por el agente de ventas`,
        fecha: (/* @__PURE__ */ new Date()).toISOString(),
        es_automatico: true
      });
    }
    c.efectos.notificar.push(
      // La temperatura encabeza: es lo que le dice al asesor si atender ya o
      // cuando pueda. Antes todos los leads llegaban iguales.
      `LEAD ${cal.temperatura.toUpperCase()} (${cal.score}/100) \u2014 contactar

${nombre}
wa.me/${c.entrada.tel}
${input.operacion === "arriendo" ? "Arriendo" : "Compra"} de ${input.tipo_inmueble || "inmueble"}
Zona: ${input.zona || "sin definir"}
Presupuesto: ${input.presupuesto ? fmtCOP(Number(input.presupuesto)) : "flexible, confirmar en la llamada"}
${input.observaciones ? `
A tener en cuenta: ${input.observaciones}
` : ""}
Asesor asignado: ${asesor?.nombre || "SIN ASIGNAR"}${asesor?.telefono ? ` (${asesor.telefono})` : ""}`
    );
    const primer = nombre.split(/\s+/)[0];
    const rol = asesor?.nombre ? asesor.nombre.split(/\s+/)[0] : null;
    return {
      ok: true,
      asesor: asesor?.nombre || null,
      // El telefono de contingencia va AQUI y en ningun otro lado: es el unico
      // momento en que el cliente pasa a manos de una persona, asi que es el
      // unico en que tiene sentido darle por donde insistir.
      instruccion: rol ? `Llama a responder con: confirmacion breve a ${primer}, que lo acompana ${rol}, y que se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.` : `Llama a responder con: confirmacion breve a ${primer} y que un asesor se pondra en contacto por este medio. Cierra con el ${TELEFONO_CONTINGENCIA} por si necesita algo entre tanto. No prometas fecha ni hora.`
    };
  }
};
var agendarVisita = {
  ...definirTool(
    "agendar_visita",
    "Deja registrada la intencion de visitar un inmueble. No confirma hora: el asesor coordina. Nunca prometas un horario concreto.",
    {
      inmueble_id: str("El id que devolvio buscar_inmuebles"),
      preferencia: str("Cuando le queda bien al cliente, en sus palabras")
    },
    { cierra: true }
  ),
  ejecutar: async (input, c) => {
    const res = await resolverInmueble(c, String(input.inmueble_id || ""));
    if (!res.ok) return noUbicado(res.motivo, "la visita");
    await c.db.crear("Visita", {
      contacto_id: String(c.estado.compartido.contacto_id || ""),
      propiedad_id: res.mostrado.id,
      // Solicitada, no Programada: el agente recogio una preferencia, no acordo
      // una hora. Quien confirma es el equipo.
      estado: "Solicitada",
      preferencia_horario: String(input.preferencia || "").slice(0, 200),
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: true, nota: "Dile que el asesor le confirma el horario. No des una hora tu." };
  }
};
var VENTAS = {
  buscar_inmuebles: buscarInmuebles,
  buscar_por_codigo: buscarPorCodigo,
  enviar_ficha: enviarFicha,
  registrar_interes: registrarInteres,
  calificar_lead: calificarLead,
  agendar_visita: agendarVisita
};

// base44/functions/_core/tools/cartera.ts
var verificarIdentidad = {
  ...definirTool(
    "verificar_identidad",
    "Comprueba que quien escribe es de verdad el titular, antes de darle cualquier dato de su contrato. Pidele los ultimos 4 digitos de su cedula (o el numero de solicitud si esta en un tramite) y pasa aqui lo que responda, tal cual. Tiene 3 intentos.",
    {
      tipo: enumStr("Que dato te dio", ["cedula_ultimos4", "numero_solicitud"]),
      valor: str("Lo que respondio el cliente, sin interpretar")
    },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const r = await verificar(c.db, c.estado, c.entrada, input.tipo, String(input.valor ?? ""));
    if (r.bloqueado) {
      return {
        verificado: false,
        intentos_restantes: 0,
        instruccion: "No puedes seguir verificando por ahora. Escala a un humano con escalar_a_humano y dile al cliente que un asesor lo contacta para validar sus datos."
      };
    }
    if (!r.verificado) {
      return {
        verificado: false,
        intentos_restantes: r.intentos_restantes,
        instruccion: "No coincide. Pideselo de nuevo con amabilidad, sin dar pistas de cual era el dato correcto."
      };
    }
    return { verificado: true, intentos_restantes: r.intentos_restantes };
  }
};
var consultarEstadoCuenta = {
  ...definirTool(
    "consultar_estado_cuenta",
    "Trae el saldo, el ultimo pago y el proximo vencimiento del contrato de ESTE cliente. Requiere haberlo verificado antes con verificar_identidad.",
    {},
    { retorna: true }
  ),
  ejecutar: async (_input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const contratoId = c.estado.identidad.contrato_id;
    if (!contratoId) return { error: "sin_contrato_activo" };
    const pagos = await c.db.list("PagoCanon", { contrato_id: contratoId, limit: 12 });
    const orden = pagos.sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
    const pendientes = orden.filter((p) => p.estado === "Pendiente" || p.estado === "Mora" || p.estado === "Parcial");
    const ultimoPago = orden.find((p) => p.estado === "Pagado");
    const saldo = pendientes.reduce((s, p) => s + (Number(p.saldo) || 0), 0);
    const masViejo = pendientes[pendientes.length - 1];
    const ctx = c.ctxAgente;
    ctx.ultimo_saldo_consultado = saldo;
    ctx.consultado_en = (/* @__PURE__ */ new Date()).toISOString();
    return {
      saldo_total: saldo,
      periodos_pendientes: pendientes.map((p) => ({ periodo: p.periodo, valor: p.valor_total, saldo: p.saldo, estado: p.estado })),
      dias_mora: Number(masViejo?.dias_mora) || 0,
      ultimo_pago: ultimoPago ? { periodo: ultimoPago.periodo, fecha: ultimoPago.fecha_pago, valor: ultimoPago.valor_pagado } : null,
      proximo_vencimiento: pendientes[0]?.fecha_vencimiento ?? null,
      instruccion: "Da la cifra en una frase corta. El detalle completo NO se manda por chat: si pide el desglose, mandale el link del portal."
    };
  }
};
var enviarLinkPortal = {
  ...definirTool(
    "enviar_link_portal",
    "Manda un link seguro al portal del cliente. Usalo para todo lo que sea un documento, una tabla o un historial: el chat es para cifras sueltas, el portal para el detalle. El link vence en 15 minutos y sirve una sola vez.",
    // El enum debe listar SOLO secciones que existan como ruta en el portal.
    // Ofrecer una que no existe manda al cliente a un link que no lo lleva a
    // donde el agente le dijo: 'documentos' y 'mis-datos' se sacaron por eso.
    // 'certificados' tampoco esta aqui, aunque ya exista la ruta: ese documento
    // se entrega con enviar_certificado_propietario, que ademas comprueba que
    // el archivo exista y deja el envio registrado.
    { seccion: enumStr("A donde debe llegar", ["estado-cuenta", "pagos", "contrato", "reparaciones", "liquidaciones"]) },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, String(input.seccion));
    if (!url) return { error: "no_se_pudo_generar" };
    c.salida.globos.push("Te dejo el acceso a tu portal. El enlace es personal y vence en 15 minutos:");
    c.salida.globos.push(url);
    return { ok: true, nota: "El link ya se envio. No lo repitas en responder." };
  }
};
var enviarCodigoBarras = {
  ...definirTool(
    "enviar_codigo_barras",
    "Manda el codigo de barras del mes para que el cliente pague en banco o corresponsal.",
    { periodo: strOpc("Mes en formato AAAA-MM. null para el mes en curso.") },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const periodo = String(input.periodo || "").match(/^\d{4}-\d{2}$/) ? String(input.periodo) : (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const contratoId = String(c.estado.identidad.contrato_id || "");
    if (!contratoId) {
      return {
        error: "sin_contrato_activo",
        instruccion: "No tiene un contrato de arriendo activo a su nombre. No inventes un recibo: preguntale de que inmueble se trata y escala si insiste."
      };
    }
    const cb = await c.db.uno("CodigoBarras", { contrato_id: contratoId, periodo });
    if (!cb) {
      return {
        error: "no_disponible",
        periodo,
        instruccion: "Dile que el del mes aun no esta generado y que un asesor se lo hace llegar. No inventes un codigo."
      };
    }
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, "pagos");
    c.salida.globos.push(`Este es tu recibo de ${periodo}. Lo puedes pagar en banco o corresponsal:`);
    c.salida.globos.push(url || String(cb.url_pdf));
    await c.db.actualizar("CodigoBarras", cb.id, { ...cb, fecha_envio: (/* @__PURE__ */ new Date()).toISOString(), canal_envio: c.entrada.canal, estado_envio: "Enviado" });
    return { ok: true, periodo, nota: "Ya se envio el link. No lo repitas en responder." };
  }
};
var CERTIFICADO_NO_ENCONTRADO = "No hemos encontrado tu archivo. Hemos enviado un correo electronico con tu caso al area encargada en la Inmobiliaria.";
async function derivarAlArea(c, anio, causa) {
  const nombre = String(c.estado.compartido.nombre || "") || `+${c.entrada.tel}`;
  const detalle = anio ? `certificado del ano ${anio}` : "certificado mas reciente";
  const brief = briefLead(c.estado, c.entrada.tel, c.entrada.canal, [
    `MOTIVO: pidio su ${detalle} y no aparece (${causa})`
  ]);
  await c.db.crear("Tarea", {
    contacto_id: String(c.estado.compartido.contacto_id || ""),
    titulo: `Certificado de propietario no encontrado: ${nombre}`,
    descripcion: brief,
    fecha_limite: new Date(Date.now() + 864e5).toISOString().split("T")[0],
    prioridad: "Media",
    completada: false,
    origen_agente: c.estado.agente_activo
  });
  c.efectos.notificar.push(
    `CERTIFICADO DE PROPIETARIO NO ENCONTRADO \u2014 ${detalle}

${brief}

Al cliente ya se le dijo que su caso paso al area encargada. Alguien tiene que responderle.`
  );
  c.salida.globos.push(CERTIFICADO_NO_ENCONTRADO);
  return {
    ok: true,
    encontrado: false,
    anio,
    nota: "Ya se envio el mensaje de la casa tal cual y el caso quedo radicado. No lo repitas ni lo reformules en responder, y no prometas fechas ni horas."
  };
}
var enviarCertificadoPropietario = {
  ...definirTool(
    "enviar_certificado_propietario",
    "Entrega al propietario su certificado anual, por link al portal. Requiere identidad verificada. Si el cliente no dijo de que ano lo quiere, pasa null y se entrega el ultimo que tengamos. Es un documento de propietarios: no sirve para arrendatarios.",
    { anio: numOpc("Ano gravable que pidio el cliente, por ejemplo 2025. null si no dijo ninguno.") },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const crudo = Number(input.anio);
    const anioPedido = Number.isFinite(crudo) && crudo > 0 ? Math.trunc(crudo) : null;
    const propietarioId = String(c.estado.identidad.propietario_id || "");
    if (!propietarioId) {
      return derivarAlArea(c, anioPedido, "el telefono verificado no figura como propietario");
    }
    const filas = await c.db.list("CertificadoPropietario", { propietario_id: propietarioId, limit: 12 });
    const disponibles = (filas || []).filter((f) => Number(f.anio) > 0 && String(f.url_pdf || "").trim() !== "").sort((a, b) => Number(b.anio) - Number(a.anio));
    const fila = anioPedido === null ? disponibles[0] : disponibles.find((f) => Number(f.anio) === anioPedido);
    if (!fila) {
      return derivarAlArea(
        c,
        anioPedido,
        disponibles.length ? "ese ano no tiene archivo generado" : "no tiene ningun certificado con archivo"
      );
    }
    const url = await crearSesionPortal(c.db, c.entrada, c.estado, "certificados");
    if (!url) {
      return {
        error: "no_se_pudo_generar",
        instruccion: "No prometas el certificado ni mandes ningun archivo. Escala con escalar_a_humano para que se lo hagan llegar."
      };
    }
    c.salida.globos.push(`Aqui esta tu certificado del ano ${fila.anio}. El enlace es personal y vence en 15 minutos:`);
    c.salida.globos.push(url);
    await c.db.actualizar("CertificadoPropietario", String(fila.id), {
      ...fila,
      fecha_envio: (/* @__PURE__ */ new Date()).toISOString(),
      estado_envio: "Enviado"
    });
    return {
      ok: true,
      anio: Number(fila.anio),
      nota: "Ya se envio el link. No lo repitas en responder. En el portal quedan tambien los de anos anteriores."
    };
  }
};
var CARTERA = {
  verificar_identidad: verificarIdentidad,
  consultar_estado_cuenta: consultarEstadoCuenta,
  enviar_link_portal: enviarLinkPortal,
  enviar_codigo_barras: enviarCodigoBarras,
  enviar_certificado_propietario: enviarCertificadoPropietario
};

// base44/functions/_core/tools/mantenimiento.ts
var registrarReparacion = {
  ...definirTool(
    "registrar_reparacion",
    "Radica una solicitud de reparacion. Antes de llamarla necesitas saber QUE se dano y DONDE. Si hay gas, fuego, inundacion o riesgo electrico, la urgencia es Emergencia y ademas debes llamar a escalar_a_humano.",
    {
      categoria: enumStr("Que se dano", ["Plomeria", "Electrico", "Gas", "Cerrajeria", "Electrodomestico", "Estructural", "Humedad", "Otro"]),
      descripcion: str("Lo que reporta el cliente, con sus palabras y el detalle que dio"),
      urgencia: enumStr("Emergencia solo si hay riesgo real para personas o el inmueble", ["Emergencia", "Alta", "Media", "Baja"]),
      ubicacion: strOpc("En que parte del inmueble. null si no lo dijo.")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const urgencia = String(input.urgencia || "Media");
    const rep = await c.db.crear("Reparacion", {
      contrato_id: c.estado.identidad.contrato_id || "",
      arrendatario_id: c.estado.identidad.arrendatario_id || "",
      categoria: String(input.categoria),
      descripcion: String(input.descripcion || "").slice(0, 2e3),
      ubicacion: String(input.ubicacion || ""),
      urgencia,
      estado: "Reportada",
      origen: `agente:${c.entrada.canal}`,
      fotos: [],
      fecha_reporte: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!rep) return { error: "no_se_pudo_registrar" };
    c.ctxAgente.reparacion_id = rep.id;
    await abrirAsistencia(c, {
      origen_tipo: "Reparacion",
      origen_id: String(rep.id || ""),
      origen_radicado: String(rep.numero_radicado || ""),
      asunto: `${String(input.categoria)}: ${String(input.descripcion || "")}`,
      detalle: [String(input.descripcion || ""), input.ubicacion ? `Ubicacion: ${String(input.ubicacion)}` : ""].filter(Boolean).join("\n"),
      prioridad: urgencia
    });
    if (urgencia === "Emergencia") {
      c.efectos.notificar.push(
        `EMERGENCIA \u2014 reparacion
${String(input.categoria)}: ${String(input.descripcion).slice(0, 300)}
Telefono: ${c.entrada.tel}
Contrato: ${c.estado.identidad.contrato_id || "sin contrato"}`
      );
    }
    return {
      ok: true,
      radicado: rep.numero_radicado || rep.id,
      sla_horas: null,
      instruccion: urgencia === "Emergencia" ? "Confirma el radicado y dile que ya avisaste al equipo por ser una emergencia. Llama tambien a escalar_a_humano. No prometas un tiempo de respuesta." : "Confirma el radicado en una frase. Puedes pedirle una foto del dano si ayuda al tecnico. No prometas fecha ni costo."
    };
  }
};
var adjuntarEvidencia = {
  ...definirTool(
    "adjuntar_evidencia",
    "Guarda una foto que el cliente acaba de mandar como evidencia de la reparacion que ya radicaste.",
    { descripcion: str("Que muestra la foto, segun lo que ves en el historial") }
  ),
  ejecutar: async (input, c) => {
    const repId = String(c.ctxAgente.reparacion_id || "");
    if (!repId) return { ok: false, error: "sin_reparacion_activa" };
    await c.db.crear("Documento", {
      contacto_id: String(c.estado.compartido.contacto_id || ""),
      reparacion_id: repId,
      nombre: `Evidencia reparacion ${repId}`,
      categoria: "evidencia",
      descripcion: String(input.descripcion || "").slice(0, 500),
      contenido: String(c.ctxAgente.ultima_media_url || "")
    });
    return { ok: true };
  }
};
var consultarEstadoReparacion = {
  ...definirTool(
    "consultar_estado_reparacion",
    "Consulta como van las reparaciones abiertas de este cliente.",
    {},
    { retorna: true }
  ),
  ejecutar: async (_input, c) => {
    const err = exigirVerificado(c);
    if (err) return err;
    const reps = await c.db.list("Reparacion", {
      arrendatario_id: c.estado.identidad.arrendatario_id || "",
      limit: 10
    });
    const abiertas = reps.filter((r) => r.estado !== "Cerrada" && r.estado !== "Cancelada");
    if (!abiertas.length) return { abiertas: 0, instruccion: "No tiene reparaciones abiertas. Preguntale si quiere reportar una nueva." };
    return {
      abiertas: abiertas.length,
      reparaciones: abiertas.map((r) => ({
        radicado: r.numero_radicado || r.id,
        categoria: r.categoria,
        estado: r.estado,
        urgencia: r.urgencia,
        reportada: r.fecha_reporte,
        proveedor_asignado: r.proveedor_id ? true : false
      })),
      instruccion: "Resume el estado en una frase. No prometas fechas que no aparecen aqui."
    };
  }
};
var MANTENIMIENTO = {
  verificar_identidad: verificarIdentidad,
  registrar_reparacion: registrarReparacion,
  adjuntar_evidencia: adjuntarEvidencia,
  consultar_estado_reparacion: consultarEstadoReparacion
};

// base44/functions/_core/tools/consignacion.ts
var registrarConsignacion = {
  ...definirTool(
    "registrar_consignacion",
    "Registra un inmueble que el propietario quiere poner con nosotros. Necesitas como minimo la direccion, el tipo de inmueble y que gestion quiere (venta, arriendo o administracion).",
    {
      direccion: str("Direccion del inmueble"),
      barrio: strOpc("Barrio o zona. null si no lo dijo."),
      tipo_inmueble: enumStr("Tipo", ["Apartamento", "Casa", "Local", "Oficina", "Bodega", "Lote", "Finca", "Otro"]),
      gestion: enumStr("Que quiere hacer con el", ["Venta", "Arriendo", "Administracion", "Venta_y_Arriendo"]),
      valor_esperado: numOpc("Precio de venta que espera, en pesos. null si no lo dijo."),
      canon_esperado: numOpc("Canon mensual que espera, en pesos. null si no lo dijo."),
      nombre_propietario: str("Nombre de quien escribe")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const tel = c.entrada.tel.replace(/\D/g, "");
    let prop = await c.db.uno("Propietario", { telefono: tel });
    if (!prop) {
      prop = await c.db.crear("Propietario", {
        nombre: String(input.nombre_propietario || "").slice(0, 200),
        telefono: tel,
        email: String(c.estado.compartido.email || ""),
        origen: `agente:${c.entrada.canal}`
      });
    }
    const asesor = await asignarAsesor(c.db, {
      zona: input.barrio,
      tipo: input.tipo_inmueble,
      operacion: String(input.gestion).toLowerCase().includes("arriendo") ? "arriendo" : "venta"
    });
    const cons = await c.db.crear("Consignacion", {
      propietario_id: prop?.id || "",
      direccion: String(input.direccion || "").slice(0, 300),
      barrio: String(input.barrio || ""),
      zona: String(input.barrio || ""),
      tipo_inmueble: String(input.tipo_inmueble),
      gestion: String(input.gestion),
      valor_esperado: Number(input.valor_esperado) || 0,
      canon_esperado: Number(input.canon_esperado) || 0,
      estado: "Solicitada",
      asesor_id: asesor?.id || "",
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!cons) return { error: "no_se_pudo_registrar" };
    c.ctxAgente.consignacion_id = cons.id;
    c.efectos.notificar.push(
      `CONSIGNACION NUEVA
${String(input.nombre_propietario)}
wa.me/${c.entrada.tel}
${String(input.tipo_inmueble)} en ${String(input.direccion)}${input.barrio ? `, ${input.barrio}` : ""}
Gestion: ${String(input.gestion)}
${input.valor_esperado ? `Venta esperada: $${Number(input.valor_esperado).toLocaleString("es-CO")}
` : ""}${input.canon_esperado ? `Canon esperado: $${Number(input.canon_esperado).toLocaleString("es-CO")}
` : ""}Asesor: ${asesor?.nombre || "SIN ASIGNAR"}`
    );
    return {
      ok: true,
      asesor: asesor?.nombre || null,
      instruccion: "Confirma que quedo registrado y que un asesor lo contacta para coordinar la visita y el avaluo. NO negocies comision ni des porcentajes: si pregunta por eso, escala."
    };
  }
};
var agendarAvaluoPrevio = {
  ...definirTool(
    "agendar_avaluo_previo",
    "Deja pedida la visita de avaluo para una consignacion que ya registraste. Sirve para saber a que precio sale el inmueble.",
    { preferencia: str("Cuando le queda bien al propietario, en sus palabras") },
    { cierra: true }
  ),
  ejecutar: async (input, c) => {
    const consId = String(c.ctxAgente.consignacion_id || "");
    if (!consId) return { ok: false, error: "sin_consignacion" };
    const preferencia = String(input.preferencia || "").slice(0, 300);
    await c.db.actualizar("Consignacion", consId, { estado: "En_Avaluo", preferencia_avaluo: preferencia });
    c.efectos.notificar.push(
      `AVALUO PREVIO SOLICITADO
Consignacion: ${consId}
Telefono: ${c.entrada.tel}
Preferencia: ${preferencia}`
    );
    return { ok: true, nota: "Dile que el asesor le confirma el dia. No des una hora tu." };
  }
};
var CONSIGNACION = {
  registrar_consignacion: registrarConsignacion,
  agendar_avaluo_previo: agendarAvaluoPrevio
};

// base44/functions/_core/tools/avaluos.ts
var registrarSolicitudAvaluo = {
  ...definirTool(
    "registrar_solicitud_avaluo",
    "Radica una solicitud de avaluo comercial. Necesitas la direccion, el tipo de inmueble y para que lo necesita.",
    {
      nombre: str("Nombre de quien solicita"),
      direccion: str("Direccion del inmueble a avaluar"),
      tipo_inmueble: enumStr("Tipo", ["Apartamento", "Casa", "Local", "Oficina", "Bodega", "Lote", "Finca", "Otro"]),
      area_m2: numOpc("Area en metros cuadrados. null si no la sabe."),
      tipo_avaluo: enumStr("Cual de los seis tipos que maneja la casa", ["Renta", "Comercial", "Reposicion_Construccion", "Urbanos_Rurales", "Zonas_Comunes", "Retroactivos_Proyectados"]),
      proposito: strOpc("Para que lo necesita, en las palabras del cliente. null si no lo dijo.")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const av = await c.db.crear("Avaluo", {
      solicitante_nombre: String(input.nombre || "").slice(0, 200),
      solicitante_telefono: c.entrada.tel.replace(/\D/g, ""),
      solicitante_email: String(c.estado.compartido.email || ""),
      direccion: String(input.direccion || "").slice(0, 300),
      tipo_inmueble: String(input.tipo_inmueble),
      area_m2: Number(input.area_m2) || 0,
      tipo_avaluo: String(input.tipo_avaluo),
      proposito: String(input.proposito || ""),
      estado: "Solicitado",
      origen: `agente:${c.entrada.canal}`,
      fecha_solicitud: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!av) return { error: "no_se_pudo_registrar" };
    c.ctxAgente.avaluo_id = av.id;
    c.efectos.notificar.push(
      `SOLICITUD DE AVALUO
${String(input.nombre)}
wa.me/${c.entrada.tel}
${String(input.tipo_inmueble)} en ${String(input.direccion)}
Tipo: ${String(input.tipo_avaluo).replace(/_/g, "/")}${input.proposito ? ` | ${input.proposito}` : ""}${input.area_m2 ? ` | ${input.area_m2} m2` : ""}`
    );
    const noEstandar = ["Bodega", "Lote", "Finca", "Otro"].includes(String(input.tipo_inmueble));
    const raa = "Recuerdale que el avaluo con validez legal lo firma un avaluador inscrito en el RAA, no la inmobiliaria ni tu.";
    return {
      ok: true,
      radicado: av.id,
      tipo_no_estandar: noEstandar,
      instruccion: noEstandar ? `Este tipo de inmueble no tiene tarifa estandar. NO des un precio: escala con escalar_a_humano para que el perito cotice. ${raa}` : `Confirma que quedo radicado. El tarifario aun no esta aprobado: si pregunta el valor del servicio, escala para cotizacion. ${raa}`
    };
  }
};
var cotizarAvaluo = {
  ...definirTool(
    "cotizar_avaluo",
    "Comprueba si existe un tarifario aprobado. Por ahora no hay uno cargado y debes escalar para cotizacion.",
    {
      tipo_inmueble: enumStr("Tipo", ["Apartamento", "Casa", "Local", "Oficina"]),
      area_m2: numOpc("Area en metros cuadrados. null si no la sabe.")
    },
    { retorna: true }
  ),
  ejecutar: async (_input, _c) => {
    return {
      error: "tarifario_no_aprobado",
      instruccion: "No des ninguna cifra ni formula. Escala con escalar_a_humano para que el equipo de avaluos cotice."
    };
  }
};
var AVALUOS = {
  registrar_solicitud_avaluo: registrarSolicitudAvaluo,
  cotizar_avaluo: cotizarAvaluo
};

// base44/functions/_core/habiles.ts
function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia2 = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(anio, mes - 1, dia2));
}
var dia = 864e5;
var sumar = (f, n) => new Date(f.getTime() + n * dia);
var clave = (f) => f.toISOString().slice(0, 10);
function alLunes(f) {
  const d = f.getUTCDay();
  return d === 1 ? f : sumar(f, (8 - d) % 7);
}
function festivosColombia(anio) {
  const p = pascua(anio);
  const fechas = [
    // Fijos: no se mueven.
    new Date(Date.UTC(anio, 0, 1)),
    // Año nuevo
    new Date(Date.UTC(anio, 4, 1)),
    // Día del trabajo
    new Date(Date.UTC(anio, 6, 20)),
    // Independencia
    new Date(Date.UTC(anio, 7, 7)),
    // Batalla de Boyacá
    new Date(Date.UTC(anio, 11, 8)),
    // Inmaculada Concepción
    new Date(Date.UTC(anio, 11, 25)),
    // Navidad
    // Movibles al lunes (Ley Emiliani).
    alLunes(new Date(Date.UTC(anio, 0, 6))),
    // Reyes Magos
    alLunes(new Date(Date.UTC(anio, 2, 19))),
    // San José
    alLunes(new Date(Date.UTC(anio, 5, 29))),
    // San Pedro y San Pablo
    alLunes(new Date(Date.UTC(anio, 7, 15))),
    // Asunción
    alLunes(new Date(Date.UTC(anio, 9, 12))),
    // Día de la Raza
    alLunes(new Date(Date.UTC(anio, 10, 1))),
    // Todos los Santos
    alLunes(new Date(Date.UTC(anio, 10, 11))),
    // Independencia de Cartagena
    // Ligados a la Pascua. Jueves y Viernes Santo NO se mueven; los otros sí.
    sumar(p, -3),
    // Jueves Santo
    sumar(p, -2),
    // Viernes Santo
    alLunes(sumar(p, 43)),
    // Ascensión
    alLunes(sumar(p, 64)),
    // Corpus Christi
    alLunes(sumar(p, 71))
    // Sagrado Corazón
  ];
  return new Set(fechas.map(clave));
}
var cache = /* @__PURE__ */ new Map();
function festivos(anio) {
  let s = cache.get(anio);
  if (!s) {
    s = festivosColombia(anio);
    cache.set(anio, s);
  }
  return s;
}
function esHabil(f) {
  const d = f.getUTCDay();
  if (d === 0 || d === 6) return false;
  return !festivos(f.getUTCFullYear()).has(clave(f));
}
function sumarHabiles(desde, dias) {
  let f = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    f = sumar(f, 1);
    if (esHabil(f)) restantes--;
  }
  return new Date(f.getTime() + dia - 1e3);
}

// base44/functions/_core/tools/pqr.ts
var LEGAL = /\b(tutela|demanda|demandar|abogad|superintendencia|sic\b|fiscal[ií]a|juzgado|proceso legal|accion de proteccion)\b/i;
var DIAS_DEFECTO = {
  Peticion: 15,
  Queja: 15,
  Reclamo: 15,
  Sugerencia: 15,
  Felicitacion: 15
};
var registrarPqr = {
  ...definirTool(
    "registrar_pqr",
    "Radica una peticion, queja, reclamo, sugerencia o felicitacion. Antes de llamarla necesitas entender bien QUE paso: no radiques con una sola frase suelta.",
    {
      tipo: enumStr("Que es", ["Peticion", "Queja", "Reclamo", "Sugerencia", "Felicitacion"]),
      asunto: str("Resumen en menos de 10 palabras"),
      descripcion: str("Lo que cuenta el cliente, completo y con sus palabras"),
      nombre: str("Nombre de quien radica")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const tipo = String(input.tipo);
    const texto = `${input.asunto} ${input.descripcion}`;
    const esLegal = LEGAL.test(texto);
    const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
    const radicado = `PQR-${(/* @__PURE__ */ new Date()).getFullYear()}-${Date.now().toString().slice(-6)}-${azar}`;
    const cfgPlazos = (await c.db.uno("AppConfig", { clave: "plazos_pqr" }))?.valor_json;
    let dias = DIAS_DEFECTO;
    try {
      if (cfgPlazos) dias = { ...DIAS_DEFECTO, ...JSON.parse(cfgPlazos) };
    } catch {
    }
    const fechaLimite = sumarHabiles(/* @__PURE__ */ new Date(), Number(dias[tipo]) || 15);
    const pqr = await c.db.crear("PQR", {
      fecha_limite_legal: fechaLimite.toISOString(),
      tipo,
      radicado,
      contacto_id: String(c.estado.compartido.contacto_id || ""),
      contacto_nombre: String(input.nombre || "").slice(0, 200),
      contacto_telefono: c.entrada.tel.replace(/\D/g, ""),
      canal: c.entrada.canal,
      asunto: String(input.asunto || "").slice(0, 200),
      descripcion: String(input.descripcion || "").slice(0, 4e3),
      estado: "Radicada",
      prioridad: esLegal ? "Urgente" : tipo === "Reclamo" ? "Alta" : "Media",
      fecha_radicacion: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!pqr) return { error: "no_se_pudo_registrar" };
    c.ctxAgente.pqr_id = pqr.id;
    await abrirAsistencia(c, {
      origen_tipo: "PQR",
      origen_id: String(pqr.id || ""),
      origen_radicado: radicado,
      asunto: `${tipo}: ${String(input.asunto || "")}`,
      detalle: String(input.descripcion || ""),
      prioridad: esLegal ? "urgente" : tipo === "Reclamo" ? "alta" : "media",
      solicitante_nombre: String(input.nombre || "")
    });
    const venceEl = fechaLimite.toISOString().slice(0, 10);
    c.efectos.notificar.push(
      `${esLegal ? "PQR CON MENCION LEGAL \u2014 REVISAR YA" : `PQR NUEVA (${tipo})`}
Radicado: ${radicado}
${String(input.nombre)} \u2014 wa.me/${c.entrada.tel}
Asunto: ${String(input.asunto)}
Vence: ${venceEl} (${Number(dias[tipo]) || 15} dias habiles)

${String(input.descripcion).slice(0, 500)}`
    );
    return {
      ok: true,
      radicado,
      mencion_legal: esLegal,
      instruccion: esLegal ? `Dale el radicado ${radicado}, dile que ya quedo en manos del equipo y llama tambien a escalar_a_humano con prioridad urgente. NO opines sobre lo legal ni asumas responsabilidad.` : `Dale el radicado ${radicado} y dile que el termino de respuesta es de ${Number(dias[tipo]) || 15} dias habiles. NO des la fecha exacta ni prometas que se resuelve antes: el plazo es el maximo de ley, no un compromiso de entrega.`
    };
  }
};
var consultarEstadoPqr = {
  ...definirTool(
    "consultar_estado_pqr",
    "Consulta como va una PQR ya radicada, por su numero de radicado.",
    { radicado: str("El numero de radicado que da el cliente") },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const rad = String(input.radicado || "").trim().toUpperCase();
    const pqr = await c.db.uno("PQR", { radicado: rad });
    if (!pqr || String(pqr.contacto_telefono || "").replace(/\D/g, "") !== c.entrada.tel.replace(/\D/g, "")) {
      return { error: "no_encontrada", instruccion: "Dile que no encuentras ese radicado asociado a este numero y pideselo de nuevo." };
    }
    return {
      radicado: pqr.radicado,
      tipo: pqr.tipo,
      estado: pqr.estado,
      radicada: pqr.fecha_radicacion,
      respondida: pqr.fecha_respuesta ?? null,
      respuesta: pqr.respuesta ?? null
    };
  }
};
var PQR = {
  registrar_pqr: registrarPqr,
  consultar_estado_pqr: consultarEstadoPqr
};

// base44/functions/_core/tools/matricula.ts
var iniciarMatricula = {
  ...definirTool(
    "iniciar_matricula",
    "Abre una solicitud de matricula de contrato para el inmueble que el cliente va a tomar en arriendo. Es el primer paso: despues se agregan los participantes.",
    {
      nombre: str("Nombre completo del arrendatario principal"),
      documento: str("Numero de cedula, solo digitos"),
      email: str("Correo electronico"),
      direccion_inmueble: str("Direccion del inmueble que va a arrendar")
    },
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    if (c.ctxAgente.solicitud_id) {
      return { ok: false, error: "ya_iniciada", numero_solicitud: c.ctxAgente.numero_solicitud };
    }
    const numero = `M${(/* @__PURE__ */ new Date()).getFullYear()}${Date.now().toString().slice(-6)}`;
    const tel = c.entrada.tel.replace(/\D/g, "");
    const sol = await c.db.crear("SolicitudMatricula", {
      numero_solicitud: numero,
      nombre_solicitante: String(input.nombre || "").slice(0, 200),
      documento_solicitante: String(input.documento || "").replace(/\D/g, ""),
      email_solicitante: String(input.email || "").slice(0, 200),
      telefono_contacto: tel,
      direccion_inmueble: String(input.direccion_inmueble || "").slice(0, 300),
      participantes: [],
      estado: "Iniciada",
      origen: `agente:${c.entrada.canal}`,
      fecha_inicio: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!sol) return { error: "no_se_pudo_iniciar" };
    c.ctxAgente.solicitud_id = sol.id;
    c.ctxAgente.numero_solicitud = numero;
    c.ctxAgente.participantes = [];
    c.ctxAgente.paso = 1;
    c.estado.compartido.nombre = String(input.nombre || "");
    c.estado.compartido.email = String(input.email || "");
    return {
      ok: true,
      numero_solicitud: numero,
      instruccion: `Dale el numero ${numero} y dile que lo guarde. Luego preguntale si va a arrendar solo o si hay coarrendatarios o codeudores.`
    };
  }
};
var agregarParticipante = {
  ...definirTool(
    "agregar_participante",
    "Agrega un codeudor o coarrendatario a la solicitud. Llamala una vez por persona, cuando tengas su nombre, documento y telefono.",
    {
      nombre: str("Nombre completo"),
      documento: str("Numero de cedula, solo digitos"),
      telefono: str("Telefono de contacto"),
      rol: enumStr("Que es de la operacion", ["Codeudor", "Coarrendatario"]),
      parentesco: strOpc("Que relacion tiene con el arrendatario. null si no lo dijo.")
    },
    { retorna: true }
  ),
  ejecutar: async (input, c) => {
    const solId = String(c.ctxAgente.solicitud_id || "");
    if (!solId) return { ok: false, error: "sin_solicitud", instruccion: "Primero llama a iniciar_matricula." };
    const p = {
      nombre: String(input.nombre || "").slice(0, 200),
      documento: String(input.documento || "").replace(/\D/g, ""),
      telefono: String(input.telefono || "").replace(/\D/g, ""),
      rol: String(input.rol),
      parentesco: String(input.parentesco || "")
    };
    const lista2 = [...c.ctxAgente.participantes || [], p];
    c.ctxAgente.participantes = lista2;
    await c.db.actualizar("SolicitudMatricula", solId, { participantes: lista2, estado: "En_captura" });
    await c.db.crear("Codeudor", {
      solicitud_id: solId,
      nombre: p.nombre,
      numero_documento: p.documento,
      telefono: p.telefono,
      parentesco: p.parentesco,
      tipo: p.rol,
      estado_estudio: "Pendiente"
    });
    return { ok: true, total_participantes: lista2.length, instruccion: "Confirma y preguntale si falta alguien mas." };
  }
};
var finalizarMatricula = {
  ...definirTool(
    "finalizar_matricula",
    "Cierra la captura de datos y deja la solicitud lista para el estudio. Llamala cuando el cliente confirme que no falta nadie mas.",
    {},
    { retorna: true, cierra: true }
  ),
  ejecutar: async (input, c) => {
    const solId = String(c.ctxAgente.solicitud_id || "");
    if (!solId) return { ok: false, error: "sin_solicitud" };
    const numero = String(c.ctxAgente.numero_solicitud || "");
    await c.db.actualizar("SolicitudMatricula", solId, {
      estado: "Pendiente_documentos",
      fecha_cierre_captura: (/* @__PURE__ */ new Date()).toISOString()
    });
    c.efectos.notificar.push(
      `MATRICULA LISTA PARA ESTUDIO
Solicitud ${numero}
${String(c.estado.compartido.nombre || "")} \u2014 wa.me/${c.entrada.tel}
Participantes: ${(c.ctxAgente.participantes || []).length}`
    );
    return {
      ok: true,
      instruccion: "Dile que la solicitud quedo registrada y que el equipo confirmara la lista documental y el canal seguro. No enumeres documentos ni prometas un plazo."
    };
  }
};
var enviarLinkDocumentos = {
  ...definirTool(
    "enviar_link_portal",
    "Comprueba si ya existe el canal seguro para documentos de matricula. Por ahora esta pendiente y debes escalar.",
    {},
    { retorna: true }
  ),
  ejecutar: async (_input, _c) => {
    return {
      ok: false,
      error: "portal_documentos_no_disponible",
      instruccion: "No envies ningun enlace. Escala para que el equipo confirme la lista documental y el canal seguro."
    };
  }
};
var MATRICULA = {
  iniciar_matricula: iniciarMatricula,
  agregar_participante: agregarParticipante,
  finalizar_matricula: finalizarMatricula,
  enviar_link_portal: enviarLinkDocumentos
};

// base44/functions/_core/tools/index.ts
var IDENT = { identificar_titular: identificarTitular };
var HIST = ASISTIDOS;
var EXTRA = {
  recepcion: { enviar_menu: enviarMenu, ...HIST },
  ventas: VENTAS,
  consignacion: CONSIGNACION,
  cartera: CARTERA,
  mantenimiento: { ...MANTENIMIENTO, ...IDENT, ...HIST },
  avaluos: { ...AVALUOS, ...IDENT, ...HIST },
  pqr: { ...PQR, ...IDENT, ...HIST },
  matricula: { ...MATRICULA, ...IDENT, ...HIST }
};
function toolsDe(agente, habilitadas) {
  const todas = { ...COMUNES, ...EXTRA[agente] || {} };
  if (!habilitadas?.length) return todas;
  const permitidas = /* @__PURE__ */ new Set([...habilitadas, "responder"]);
  return Object.fromEntries(Object.entries(todas).filter(([n]) => permitidas.has(n)));
}

// base44/functions/_core/horario.ts
var OFFSET_BOGOTA_H = -5;
var HORARIO_DEFECTO = { dias: [1, 2, 3, 4, 5], desde: 9, hasta: 17 };
function horarioDe(config) {
  const h = config?.horario_equipo;
  if (!h) return HORARIO_DEFECTO;
  try {
    const p = typeof h === "string" ? JSON.parse(h) : h;
    return {
      dias: Array.isArray(p.dias) && p.dias.length ? p.dias.map(Number) : HORARIO_DEFECTO.dias,
      desde: Number.isFinite(Number(p.desde)) ? Number(p.desde) : HORARIO_DEFECTO.desde,
      hasta: Number.isFinite(Number(p.hasta)) ? Number(p.hasta) : HORARIO_DEFECTO.hasta
    };
  } catch {
    return HORARIO_DEFECTO;
  }
}
function enBogota(f) {
  const b = new Date(f.getTime() + OFFSET_BOGOTA_H * 36e5);
  const diaISO = b.getUTCDay() === 0 ? 7 : b.getUTCDay();
  return { hora: b.getUTCHours(), diaISO, fecha: b };
}
function hayEquipo(ahora, config = {}) {
  const h = horarioDe(config);
  const { hora, diaISO, fecha } = enBogota(ahora);
  if (!h.dias.includes(diaISO)) return false;
  if (!esHabil(fecha)) return false;
  return hora >= h.desde && hora < h.hasta;
}
function instruccionHorario(ahora, config = {}) {
  if (hayEquipo(ahora, config)) {
    return "El equipo comercial esta disponible en este momento: si entregas el lead o escalas, un asesor lo toma hoy mismo.";
  }
  const h = horarioDe(config);
  return `FUERA DE HORARIO. El equipo atiende de lunes a viernes, de ${h.desde}:00 a ${h.hasta}:00. Eso NO significa que despaches al cliente: resuelve todo lo que puedas tu mismo y deja el siguiente paso agendado. Agenda la visita o la llamada con la herramienta que corresponda, registra lo que haya que registrar, y solo si de verdad no puedes avanzar dile que un asesor lo contacta el siguiente dia habil. Nunca uses eso como primera salida.`;
}

// base44/functions/_core/contexto.ts
function armarSystem(base, agente, estado, ctxAgente) {
  const estable = [];
  estable.push(base.identidadMarca || IDENTIDAD_MARCA);
  estable.push(String(base.prompt?.prompt || PROMPTS[agente] || ""));
  if (base.rag) estable.push(base.rag);
  const zonas = ctxAgente.zonas_disponibles || [];
  if (zonas.length) {
    estable.push(
      `=== ZONAS CON INVENTARIO (${zonas.length}) ===
Son los nombres EXACTOS. Pasa uno de estos a buscar_inmuebles, no lo que dijo el cliente. Si lo que dijo encaja con varios ("el chico" cae en Chico, Chico Norte, Chico Alto...), preguntale cual antes de buscar. Si no esta en la lista, NO afirmes que no tenemos alli: di que no reconoces esa zona y pide otra referencia.
` + zonas.join(" \xB7 ")
    );
  }
  const partes = [];
  partes.push(`=== MOMENTO ===
${instruccionHorario(/* @__PURE__ */ new Date(), base.config || {})}`);
  const nombre = String(estado.compartido.nombre || "");
  const i = estado.identidad;
  const estadoTxt = [
    "=== ESTADO DE ESTA CONVERSACION ===",
    nombre ? `El cliente se llama ${nombre}. Dirigite a el por su primer nombre.` : "Aun no sabes su nombre.",
    `Identidad verificada: ${i.verificado && i.expira && new Date(i.expira) > /* @__PURE__ */ new Date() ? "SI" : "NO"}`,
    i.bloqueado_hasta && new Date(i.bloqueado_hasta) > /* @__PURE__ */ new Date() ? "ATENCION: bloqueado por intentos fallidos de verificacion." : "",
    Object.keys(ctxAgente.datos || {}).length ? `Datos que ya tienes: ${JSON.stringify(ctxAgente.datos)}` : "",
    // AQUI YA NO SE HABLA DE INVENTARIO, Y ES DELIBERADO.
    //
    // Iba "Hoy hay N inmuebles activos: X en arriendo y Y en venta. Zonas con
    // disponibilidad: ...", contado sobre los 100 inmuebles precargados. Las dos
    // mitades eran falsas: N valia siempre 100 porque 100 era el limit, no el
    // total, y la lista de zonas salia de esas mismas 100 filas arbitrarias.
    //
    // Lo grave era donde estaba: dentro de === ESTADO DE ESTA CONVERSACION ===,
    // o sea con autoridad de hecho del sistema y no de resultado de herramienta.
    // Si "Los Rosales" no caia entre esas 20 zonas, el prompt le estaba diciendo
    // al modelo que Rosales no tiene disponibilidad ANTES de que el cliente
    // preguntara. De ahi salio "no hay ninguno mas en Rosales": el agente no lo
    // improviso, lo leyo.
    //
    // Tampoco se sustituye por la lista completa de zonas. Son ~300 nombres, y
    // una lista en el prompt es una afirmacion sobre el mundo que envejece sin
    // avisar. El diccionario vive en el ctx y lo usa buscar_inmuebles, que es la
    // unica que debe hablar de inventario: si la zona no existe lo dice, y si es
    // ambigua devuelve las candidatas para que el agente pregunte.
    ctxAgente.nombre_registrado ? `En el sistema figura como: ${ctxAgente.nombre_registrado}` : ""
  ].filter(Boolean).join("\n");
  partes.push(estadoTxt);
  if (ctxAgente.titular_nombre) {
    const inmuebles = ctxAgente.titular_inmuebles || [];
    partes.push([
      "=== YA ENCONTRASTE A ESTA PERSONA EN LA BASE ===",
      `Documento ${ctxAgente.titular_documento} -> ${ctxAgente.titular_nombre}`,
      inmuebles.length === 1 ? `Tiene UN inmueble con nosotros: ${inmuebles[0].direccion}${inmuebles[0].ciudad ? `, ${inmuebles[0].ciudad}` : ""}` : `Tiene ${inmuebles.length} inmuebles con nosotros:
${inmuebles.map((i2) => `  - ${i2.direccion}${i2.ciudad ? `, ${i2.ciudad}` : ""}`).join("\n")}`,
      "",
      "DILO DE ENTRADA, en el mismo mensaje: que ya lo encontraste, su nombre, y su inmueble",
      inmuebles.length === 1 ? "para que lo confirme." : "para que elija de cual se trata.",
      "Despues preguntale que necesita.",
      "PROHIBIDO pedirle el nombre, la direccion o el telefono: los tienes aqui arriba.",
      "PROHIBIDO decirle que no aparece o pedirle que confirme el documento: SI aparece.",
      "",
      "SU IDENTIDAD YA ESTA VERIFICADA: dio el documento correcto y escribe desde el",
      "telefono registrado, que son dos factores. NO llames a verificar_identidad y NO",
      'le pidas "los ultimos 4 digitos de la cedula": serian los ultimos 4 del mismo',
      "numero que acaba de dictar, o sea el mismo factor dos veces. Sigue derecho al",
      "tramite."
    ].join("\n"));
  }
  partes.push(
    "=== COMO RESPONDER ===\nTerminas SIEMPRE tu turno llamando a la herramienta `responder`. Es la unica forma de que el cliente te lea.\nPuedes llamar varias herramientas en el mismo turno: guarda los datos que hagan falta y responde, todo junto.\nEscribe corto: maximo dos frases por globo. Nunca uses el guion largo. Nunca uses emojis.\nJamas afirmes un dato que no venga del contexto o del resultado de una herramienta. Si no lo tienes, dilo." + // El saludo lo antepone el servidor en el primer mensaje (ver SALUDO en
    // entry.ts). Sin esta linea el modelo se presenta tambien y el cliente
    // recibe la presentacion dos veces seguidas.
    (estado.historial.length <= 1 ? '\n\nTU PRESENTACION YA SE ENVIO: el cliente acaba de recibir, como mensaje aparte, "Hola, soy Diana de INMOBILIARE Julio Corredor."\nTu mensaje va DESPUES de ese, asi que NO empieces con "Hola", "Buenas", "Que tal" ni ningun saludo, y no repitas tu nombre. Saludar dos veces seguidas es de las cosas que mas delatan a un bot. Arranca directo por lo que el cliente necesita.' : "")
  );
  return [
    { type: "text", text: estable.join("\n\n"), cache_control: { type: "ephemeral" } },
    { type: "text", text: partes.join("\n\n") }
  ];
}

// scripts/.medir-tokens.mjs
var tok = (s) => Math.round(s.length / 3.6);
console.log("=== IDENTIDAD_MARCA ===");
console.log(`chars ${IDENTIDAD_MARCA.length}  ~tokens ${tok(IDENTIDAD_MARCA)}`);
console.log("\n=== PROMPTS por agente (codigo) ===");
for (const a of AGENTES) {
  console.log(`${a.padEnd(14)} chars ${String(PROMPTS[a].length).padStart(6)}  ~tokens ${tok(PROMPTS[a])}`);
}
console.log("\n=== DEFINICIONES DE TOOLS por agente (viajan en CADA llamada) ===");
for (const a of AGENTES) {
  const tools = toolsDe(a);
  const defs = Object.values(tools).map((t) => t.def);
  const json = JSON.stringify(defs);
  console.log(`${a.padEnd(14)} n=${String(defs.length).padStart(2)}  chars ${String(json.length).padStart(6)}  ~tokens ${String(tok(json)).padStart(5)}`);
}
console.log("\n=== DETALLE tools de VENTAS (la mas cara) ===");
{
  const tools = toolsDe("ventas");
  const filas = Object.entries(tools).map(([n, t]) => {
    const j = JSON.stringify(t.def);
    return { n, chars: j.length, desc: (t.def.description || "").length, esquema: j.length - (t.def.description || "").length };
  }).sort((x, y) => y.chars - x.chars);
  for (const f of filas) {
    console.log(`  ${f.n.padEnd(22)} total ${String(f.chars).padStart(5)}  desc ${String(f.desc).padStart(5)}  esquema ${String(f.esquema).padStart(5)}  ~tok ${tok(String(f.chars * 0 + f.chars))}`);
  }
  const total = filas.reduce((s, f) => s + f.chars, 0);
  console.log(`  TOTAL ventas: ${total} chars  ~${tok("x".repeat(total))} tokens`);
}
console.log("\n=== armarSystem SIN RAG (solo identidad+prompt), por agente ===");
for (const a of AGENTES) {
  const estado = estadoVacio();
  estado.agente_activo = a;
  const base = {
    config: {},
    prompt: null,
    identidadMarca: "",
    rag: "",
    ragTitulos: [],
    ragChars: 0,
    promptOrigen: "codigo",
    promptVersion: null,
    marcaOrigen: "codigo",
    ragDetalle: [],
    ragDescartados: [],
    ragActivos: 0
  };
  const bloques = armarSystem(base, a, estado, {});
  const estable = bloques[0].text;
  const volatil = bloques[1].text;
  console.log(`${a.padEnd(14)} estable ${String(estable.length).padStart(6)}ch (~${tok(estable)}tok) cache=${!!bloques[0].cache_control}  volatil ${String(volatil.length).padStart(5)}ch (~${tok(volatil)}tok) cache=${!!bloques[1].cache_control}`);
}
console.log("\n=== PRUEBA: entra el mapa de zonas en el system? ===");
{
  const estado = estadoVacio();
  estado.agente_activo = "ventas";
  const base = {
    config: {},
    prompt: null,
    identidadMarca: "",
    rag: "",
    ragTitulos: [],
    ragChars: 0,
    promptOrigen: "codigo",
    promptVersion: null,
    marcaOrigen: "codigo",
    ragDetalle: [],
    ragDescartados: [],
    ragActivos: 0
  };
  const ctxComoLoDevuelveElCargador = {
    campana: null,
    zonas: Array.from({ length: 517 }, (_, i) => ({ nombre: `Zona ${i}`, normalizado: `zona ${i}` }))
  };
  const bloques = armarSystem(base, "ventas", estado, ctxComoLoDevuelveElCargador);
  const hay = bloques.some((b) => b.text.includes("ZONAS CON INVENTARIO"));
  console.log(`  con ctx.zonas (lo real):            bloque de zonas presente = ${hay}  estable=${bloques[0].text.length}ch`);
  const bloques2 = armarSystem(base, "ventas", estado, { zonas_disponibles: Array.from({ length: 517 }, (_, i) => `Zona ${i}`) });
  const hay2 = bloques2.some((b) => b.text.includes("ZONAS CON INVENTARIO"));
  console.log(`  con ctx.zonas_disponibles (lo que lee): bloque presente = ${hay2}  estable=${bloques2[0].text.length}ch`);
}
