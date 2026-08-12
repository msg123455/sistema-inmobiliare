// Horario del equipo comercial y que hacer fuera de el.
//
// LA REGLA QUE MANDA: fuera de horario el agente NO difiere, REEMPLAZA al
// comercial. Agenda el mismo la cita y deja el lead listo. "Manana te contacta
// un asesor" es el ultimo recurso, no la salida por defecto: un lead que llega
// a las 9 de la noche y solo recibe "manana te llamamos" es un lead que para
// manana ya escribio a otra inmobiliaria.

import { esHabil } from './habiles.ts';

/** Bogota es UTC-5 todo el año: Colombia no tiene horario de verano. */
const OFFSET_BOGOTA_H = -5;

export interface Horario {
  dias: number[];   // 1 = lunes … 7 = domingo (ISO)
  desde: number;    // hora local de inicio
  hasta: number;    // hora local de fin
}

/** Lunes a viernes, 9 a 5. Confirmado por el cliente. */
export const HORARIO_DEFECTO: Horario = { dias: [1, 2, 3, 4, 5], desde: 9, hasta: 17 };

export function horarioDe(config: Record<string, any>): Horario {
  const h = config?.horario_equipo;
  if (!h) return HORARIO_DEFECTO;
  try {
    const p = typeof h === 'string' ? JSON.parse(h) : h;
    return {
      dias: Array.isArray(p.dias) && p.dias.length ? p.dias.map(Number) : HORARIO_DEFECTO.dias,
      desde: Number.isFinite(Number(p.desde)) ? Number(p.desde) : HORARIO_DEFECTO.desde,
      hasta: Number.isFinite(Number(p.hasta)) ? Number(p.hasta) : HORARIO_DEFECTO.hasta,
    };
  } catch {
    return HORARIO_DEFECTO;
  }
}

/** Fecha/hora en Bogota, como componentes. */
function enBogota(f: Date) {
  const b = new Date(f.getTime() + OFFSET_BOGOTA_H * 3_600_000);
  const diaISO = b.getUTCDay() === 0 ? 7 : b.getUTCDay(); // 1 lun … 7 dom
  return { hora: b.getUTCHours(), diaISO, fecha: b };
}

/**
 * ¿Hay alguien del equipo disponible ahora?
 *
 * Un festivo cuenta como fuera de horario: el equipo no esta, aunque caiga
 * entre semana. Es el mismo calendario que usan los plazos de PQR.
 */
export function hayEquipo(ahora: Date, config: Record<string, any> = {}): boolean {
  const h = horarioDe(config);
  const { hora, diaISO, fecha } = enBogota(ahora);
  if (!h.dias.includes(diaISO)) return false;
  if (!esHabil(fecha)) return false;
  return hora >= h.desde && hora < h.hasta;
}

/**
 * Instruccion que se le inyecta al agente segun el momento.
 *
 * Fuera de horario NO cambia lo que el agente puede hacer —las herramientas son
 * las mismas— cambia a que se compromete. Dentro de horario puede decir "un
 * asesor te contacta ya"; fuera, tiene que resolver el solo hasta donde llegue.
 */
export function instruccionHorario(ahora: Date, config: Record<string, any> = {}): string {
  if (hayEquipo(ahora, config)) {
    return 'El equipo comercial esta disponible en este momento: si entregas el lead o '
      + 'escalas, un asesor lo toma hoy mismo.';
  }
  const h = horarioDe(config);
  return 'FUERA DE HORARIO. El equipo atiende de lunes a viernes, '
    + `de ${h.desde}:00 a ${h.hasta}:00. Eso NO significa que despaches al cliente: `
    + 'resuelve todo lo que puedas tu mismo y deja el siguiente paso agendado. '
    + 'Agenda la visita o la llamada con la herramienta que corresponda, registra lo que '
    + 'haya que registrar, y solo si de verdad no puedes avanzar dile que un asesor lo '
    + 'contacta el siguiente dia habil. Nunca uses eso como primera salida.';
}
