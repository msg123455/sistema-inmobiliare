// Dias habiles en Colombia: festivos y suma de plazos.
//
// POR QUE NO ALCANZA CON "SALTAR SABADOS Y DOMINGOS": Colombia tiene 18
// festivos al ano y la mayoria NO cae en fecha fija. La Ley 51 de 1983
// ("Ley Emiliani") corre varios al lunes siguiente, y cinco dependen de la
// Pascua, que se calcula con el algoritmo de Butcher. Un plazo legal contado
// mal por dos dias es un plazo incumplido.
//
// Se usa para el termino de respuesta de PQR (Ley 1755/2015), que corre en
// dias habiles desde la radicacion.

/** Domingo de Pascua del año dado (algoritmo de Butcher, calendario gregoriano). */
function pascua(anio: number): Date {
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
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

const dia = 86_400_000;
const sumar = (f: Date, n: number) => new Date(f.getTime() + n * dia);
const clave = (f: Date) => f.toISOString().slice(0, 10);

/** Corre la fecha al lunes siguiente si no es lunes (Ley Emiliani). */
function alLunes(f: Date): Date {
  const d = f.getUTCDay(); // 0 domingo … 6 sabado
  return d === 1 ? f : sumar(f, (8 - d) % 7);
}

/** Festivos nacionales de Colombia para un año, como 'YYYY-MM-DD'. */
export function festivosColombia(anio: number): Set<string> {
  const p = pascua(anio);
  const fechas: Date[] = [
    // Fijos: no se mueven.
    new Date(Date.UTC(anio, 0, 1)),   // Año nuevo
    new Date(Date.UTC(anio, 4, 1)),   // Día del trabajo
    new Date(Date.UTC(anio, 6, 20)),  // Independencia
    new Date(Date.UTC(anio, 7, 7)),   // Batalla de Boyacá
    new Date(Date.UTC(anio, 11, 8)),  // Inmaculada Concepción
    new Date(Date.UTC(anio, 11, 25)), // Navidad

    // Movibles al lunes (Ley Emiliani).
    alLunes(new Date(Date.UTC(anio, 0, 6))),   // Reyes Magos
    alLunes(new Date(Date.UTC(anio, 2, 19))),  // San José
    alLunes(new Date(Date.UTC(anio, 5, 29))),  // San Pedro y San Pablo
    alLunes(new Date(Date.UTC(anio, 7, 15))),  // Asunción
    alLunes(new Date(Date.UTC(anio, 9, 12))),  // Día de la Raza
    alLunes(new Date(Date.UTC(anio, 10, 1))),  // Todos los Santos
    alLunes(new Date(Date.UTC(anio, 10, 11))), // Independencia de Cartagena

    // Ligados a la Pascua. Jueves y Viernes Santo NO se mueven; los otros sí.
    sumar(p, -3),           // Jueves Santo
    sumar(p, -2),           // Viernes Santo
    alLunes(sumar(p, 43)),  // Ascensión
    alLunes(sumar(p, 64)),  // Corpus Christi
    alLunes(sumar(p, 71)),  // Sagrado Corazón
  ];
  return new Set(fechas.map(clave));
}

// Los festivos se recalculan una vez por año y se recuerdan: sumar un plazo
// puede cruzar hasta tres años y no vale la pena repetir el cálculo.
const cache = new Map<number, Set<string>>();
function festivos(anio: number): Set<string> {
  let s = cache.get(anio);
  if (!s) { s = festivosColombia(anio); cache.set(anio, s); }
  return s;
}

/** ¿Es día hábil? Ni sábado, ni domingo, ni festivo nacional. */
export function esHabil(f: Date): boolean {
  const d = f.getUTCDay();
  if (d === 0 || d === 6) return false;
  return !festivos(f.getUTCFullYear()).has(clave(f));
}

/**
 * Suma días hábiles a una fecha.
 *
 * El día de radicación NO cuenta: el término empieza a correr el hábil
 * siguiente. Devuelve el final del día (23:59:59 UTC) para que un vencimiento
 * "a los 15 días" incluya ese día completo.
 */
export function sumarHabiles(desde: Date, dias: number): Date {
  let f = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    f = sumar(f, 1);
    if (esHabil(f)) restantes--;
  }
  return new Date(f.getTime() + dia - 1000);
}

/** Días hábiles entre dos fechas (negativo si ya venció). */
export function habilesHasta(desde: Date, hasta: Date): number {
  const ini = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()));
  const signo = fin >= ini ? 1 : -1;
  let [a, b] = signo > 0 ? [ini, fin] : [fin, ini];
  let n = 0;
  while (a < b) { a = sumar(a, 1); if (esHabil(a)) n++; }
  return n * signo;
}
