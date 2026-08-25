// decidirAgente — tres niveles, LLM como ultimo recurso.
//
// El ruteo se paga una vez por HILO, no por mensaje: el nivel 0 (pegajosidad)
// resuelve ~95% de los mensajes a costo cero. Esa sola decision es la que hace
// viable el costo de la operacion.

import type { Db } from './db.ts';
import { llamarModelo } from './llm.ts';
import { AGENTES, ETIQUETAS_AGENTE, type Agente, type Entrada, type Estado, esAgente } from './protocol.ts';

export interface Decision { agente: Agente; nivel: 0 | 1 | 2; motivo: string }

const normalizar = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Botones interactivos de WhatsApp. El menu que sus usuarios ya saben usar se
// conserva como acelerador de entrada sobre los agentes: es ruteo gratis.
const POR_BOTON: Record<string, Agente> = {
  'flujo:consignacion': 'consignacion',
  'flujo:buscar':       'ventas',
  'flujo:pagos':        'cartera',
  'flujo:reparacion':   'mantenimiento',
  'flujo:avaluo':       'avaluos',
  'flujo:pqr':          'pqr',
  'flujo:matricula':    'matricula',
  'flujo:inquietudes':  'recepcion',
};

// Frases inequivocas. Conservador a proposito: una palabra ambigua aqui manda
// al cliente al agente equivocado sin que nadie se entere.
const FRASES: Array<[Agente, RegExp]> = [
  ['cartera',       /\b(estado de cuenta|codigo de barras|recibo de pago|pagar el arriendo|pagar mi arriendo|cuanto debo|mi saldo|en mora|paz y salvo|certificado de arrendamiento)\b/],
  ['mantenimiento', /\b(se dano|se me dano|esta danado|fuga|se inunda|no hay agua|no sirve el|arreglar|reparacion|gotera|humedad|se rompio)\b/],
  ['consignacion',  /\b(quiero arrendar mi|quiero vender mi|poner mi (apartamento|casa|local|oficina)|consignar mi|administren mi|en administracion)\b/],
  ['avaluos',       /\b(avaluo|avaluar|cuanto vale mi|peritaje)\b/],
  // Inquietud y PQR van al MISMO agente a proposito. Son cosas distintas —una
  // consulta no dispara termino legal y un reclamo si— pero decidir cual es
  // requiere leer lo que el cliente cuenta, y esa frontera se razona mejor en
  // una sola cabeza que repartida en dos agentes que se transfieren el caso.
  ['pqr',           /\b(queja|reclamo|pqr|peticion formal|inconformidad|mal servicio|denuncia|inquietud|tengo una duda|una consulta|quiero preguntar)\b/],
  // "matricula" a secas es ambiguo y en inmobiliaria pesa mas el otro
  // significado: la MATRICULA INMOBILIARIA es el folio de la ORIP, el numero del
  // certificado de tradicion y libertad. Un propietario que pregunta por su
  // folio caia en el tramite de arriendo y terminaba dictando su cedula para
  // algo que nunca pidio.
  //
  // Se exige que la palabra venga acompanada de algo del tramite. La palabra
  // sola cae al nivel 2, que pregunta en vez de adivinar, que es justo lo que
  // hay que hacer con un termino de doble sentido.
  ['matricula',     /\b(formulario 117|f117|codeudor|coarrendatario|estudio de credito|papeleria del contrato|matricula (del |de )?(contrato|arriendo|arrendamiento)|matricular (el |mi )?(contrato|arriendo))\b/],
];

function porFrase(texto: string): Agente | null {
  const t = normalizar(texto);
  if (!t) return null;
  for (const [agente, re] of FRASES) if (re.test(t)) return agente;
  return null;
}

export async function decidirAgente(
  db: Db,
  estado: Estado,
  entrada: Entrada,
  opts: { anthropicKey: string; modeloRouter: string; campanas?: any[] },
): Promise<Decision> {
  // ── Nivel 1a: boton interactivo. Manda sobre todo, incluida la pegajosidad:
  // el usuario acaba de decir explicitamente a donde quiere ir.
  const porBoton = POR_BOTON[entrada.botonId];
  if (porBoton) return { agente: porBoton, nivel: 1, motivo: `boton:${entrada.botonId}` };

  const cambio = porFrase(entrada.texto);
  const activo = estado.agente_activo;
  const fijado = esAgente(activo) && estado.agente_historial.length > 0;

  // ── Nivel 0: pegajosidad. Costo cero. ─────────────────────────────────────
  if (fijado && (!cambio || cambio === activo)) {
    return { agente: activo, nivel: 0, motivo: 'pegajosidad' };
  }
  if (cambio) return { agente: cambio, nivel: 1, motivo: `frase:${cambio}` };

  // ── Nivel 1b: ad referral de Meta → ventas. ───────────────────────────────
  if (entrada.adReferral?.adId) return { agente: 'ventas', nivel: 1, motivo: 'ad_referral' };

  // ── Nivel 1c: telefono conocido. Un cliente actual que escribe sin decir a
  // que viene casi nunca es un lead de ventas: por defecto va a cartera.
  const tel = entrada.tel.replace(/\D/g, '');
  if (tel) {
    const [arrs, props] = await Promise.all([
      db.list('Arrendatario', { telefono: tel, limit: 1 }),
      db.list('Propietario', { telefono: tel, limit: 1 }),
    ]);
    if (arrs[0] || props[0]) {
      // ── Nivel 1d: ticket abierto gana sobre el default de cartera. ────────
      const [reps, pqrs] = await Promise.all([
        db.list('Reparacion', { arrendatario_id: arrs[0]?.id, estado: 'En_proceso', limit: 1 }),
        db.list('PQR', { contacto_telefono: tel, estado: 'En_proceso', limit: 1 }),
      ]);
      if (reps[0]) return { agente: 'mantenimiento', nivel: 1, motivo: 'reparacion_abierta' };
      if (pqrs[0]) return { agente: 'pqr', nivel: 1, motivo: 'pqr_abierta' };
      return { agente: 'cartera', nivel: 1, motivo: 'telefono_conocido' };
    }
  }

  // ── Nivel 2: clasificador LLM. Solo si 0 y 1 se abstienen. ────────────────
  const clasif = await clasificar(entrada, estado, opts.anthropicKey, opts.modeloRouter);
  if (clasif && clasif.confianza >= 0.6) {
    return { agente: clasif.agente, nivel: 2, motivo: `llm:${clasif.motivo}`.slice(0, 120) };
  }
  // Nunca adivinar en silencio sobre un pago o un reclamo: recepcion pregunta.
  return { agente: 'recepcion', nivel: 2, motivo: 'baja_confianza' };
}

async function clasificar(
  entrada: Entrada,
  estado: Estado,
  apiKey: string,
  modelo: string,
): Promise<{ agente: Agente; confianza: number; motivo: string } | null> {
  if (!apiKey) return null;

  const etiquetas = AGENTES.map((a) => `- ${a}: ${ETIQUETAS_AGENTE[a]}`).join('\n');
  const ultimos = estado.historial.slice(-3)
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Asesor'}: ${String(m.content).slice(0, 300)}`)
    .join('\n');

  const res = await llamarModelo({
    apiKey,
    modelos: [modelo],
    maxTokens: 100,
    system: `Clasificas el mensaje de un cliente de una inmobiliaria de Bogota en una de estas categorias:\n${etiquetas}\n\nResponde SOLO con la herramienta clasificar_intencion. Si dudas, baja la confianza; no adivines.`,
    messages: [{
      role: 'user',
      content: `${ultimos ? `Contexto reciente:\n${ultimos}\n\n` : ''}Mensaje a clasificar:\n${entrada.texto.slice(0, 600)}`,
    }],
    tools: [{
      name: 'clasificar_intencion',
      description: 'Clasifica la intencion del mensaje del cliente.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          agente: { type: 'string', enum: [...AGENTES], description: 'Categoria elegida' },
          confianza: { type: 'number', description: 'De 0 a 1. Menos de 0.6 si el mensaje es ambiguo.' },
          motivo: { type: 'string', description: 'Justificacion en menos de 12 palabras' },
        },
        required: ['agente', 'confianza', 'motivo'],
        additionalProperties: false,
      },
    }],
    toolChoice: { type: 'tool', name: 'clasificar_intencion' },
  });

  const uso = res?.bloques.find((b: any) => b.type === 'tool_use');
  if (!uso?.input || !esAgente(uso.input.agente)) return null;
  return {
    agente: uso.input.agente,
    confianza: Number(uso.input.confianza) || 0,
    motivo: String(uso.input.motivo || ''),
  };
}
