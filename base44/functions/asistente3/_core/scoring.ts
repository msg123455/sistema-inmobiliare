// Calificacion de leads: rubrica unica, deterministica y testeable.
//
// POR QUE EXISTE: habia dos sistemas desconectados. leadClassify tenia una
// rubrica buena pero solo corria si un humano pulsaba un boton en el CRM, y
// calificar_lead —la que sí corre en cada conversacion— escribia
// `temperatura: 'Caliente'` LITERAL para todo el mundo, sin mirar nada. Un
// inversionista con 5.000 millones y alguien que dijo "estoy mirando" salian
// identicos, y el equipo comercial no tenia como priorizar.
//
// La rubrica vive en codigo y no en el prompt a proposito: un criterio de
// priorizacion tiene que ser reproducible y auditable. Si el modelo decide la
// temperatura, dos leads iguales pueden salir distintos y nadie sabe por que.

export interface SenalesLead {
  // Del CRM
  etapa_pipeline?: string;
  presupuesto_max?: number;
  ciudad_interes?: string;
  habitaciones_min?: number;
  ultima_actividad?: string;
  visitas_realizadas?: number;
  visita_con_interes?: boolean;

  // De la conversacion. Antes se perdian: el agente las recogia con
  // guardar_dato y no influian en la prioridad del lead.
  operacion?: string;
  zona?: string;
  timing?: string;          // 'ya' | 'pronto' | 'explorando'
  forma_pago?: string;      // 'credito_aprobado' | 'credito_tramite' | 'contado' | 'no_sabe'
  decide_solo?: boolean;
  otra_inmobiliaria?: boolean;
}

export interface Calificacion {
  score: number;             // 0-100
  temperatura: 'Frio' | 'Tibio' | 'Caliente' | 'Urgente';
  prioridad: 'Baja' | 'Media' | 'Alta';
  motivos: string[];         // por que dio eso, para que sea auditable
}

const ETAPA: Record<string, number> = {
  Lead: 10, Visita_Agendada: 35, Oferta: 55, Negociacion: 70,
  Promesa: 85, Escritura: 95, Activo: 95, Perdido: 0,
};

/** Timing declarado por el cliente. Es el predictor mas fuerte que hay. */
const TIMING: Record<string, number> = { ya: 20, pronto: 10, explorando: -10 };

/** Capacidad de pago verificada pesa mas que el monto declarado. */
const PAGO: Record<string, number> = {
  credito_aprobado: 20, contado: 20, credito_tramite: 8, no_sabe: 0,
};

/**
 * Califica un lead. Funcion pura: mismas señales, mismo resultado.
 *
 * `motivos` acompaña al score para que un asesor pueda ver por que un lead
 * quedo tibio en vez de tener que confiar en el numero.
 */
export function calificar(s: SenalesLead): Calificacion {
  const motivos: string[] = [];
  let score = ETAPA[String(s.etapa_pipeline || '')] ?? 10;

  const suma = (n: number, motivo: string) => {
    if (!n) return;
    score += n;
    motivos.push(`${n > 0 ? '+' : ''}${n} ${motivo}`);
  };

  // Datos de necesidad
  if (s.presupuesto_max) suma(10, 'declaro presupuesto');
  if (s.ciudad_interes)  suma(5, 'definio ciudad');
  if (s.zona)            suma(5, 'definio zona');
  if (s.habitaciones_min) suma(5, 'definio habitaciones');
  if (s.operacion)       suma(5, 'definio operacion');

  // Señales de intencion real
  suma(TIMING[String(s.timing || '')] ?? 0, `timing: ${s.timing}`);
  suma(PAGO[String(s.forma_pago || '')] ?? 0, `forma de pago: ${s.forma_pago}`);
  if (s.decide_solo === true) suma(10, 'decide solo');
  if (s.decide_solo === false) suma(-5, 'la decision no es solo suya');

  // Competencia: no descalifica, pero baja la probabilidad de cierre.
  if (s.otra_inmobiliaria) suma(-10, 'ya trabaja con otra inmobiliaria');

  // Recorrido
  if (s.visitas_realizadas) suma(15, 'ya visito inmuebles');
  if (s.visita_con_interes) suma(10, 'mostro interes en una visita');

  // Enfriamiento por silencio
  if (s.ultima_actividad) {
    const dias = Math.floor((Date.now() - new Date(s.ultima_actividad).getTime()) / 86_400_000);
    if (dias > 10)     suma(-25, `${dias} dias sin actividad`);
    else if (dias > 5) suma(-15, `${dias} dias sin actividad`);
    else if (dias > 3) suma(-5, `${dias} dias sin actividad`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    temperatura: score >= 80 ? 'Urgente' : score >= 55 ? 'Caliente' : score >= 30 ? 'Tibio' : 'Frio',
    prioridad:   score >= 65 ? 'Alta'    : score >= 35 ? 'Media'    : 'Baja',
    motivos,
  };
}
