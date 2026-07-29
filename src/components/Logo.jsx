/**
 * Logo INMOBILIARE Julio Corredor.
 *
 * El isotipo se reconstruye con geometría, no con una imagen: el manual
 * especifica "todas las proporciones son líneas rectas, creando la proporción
 * de un cuadrado visto en 3D". Es un cubo isométrico de arista 100 con cuatro
 * franjas por cara, a ras de ambos bordes (franja y espacio del mismo ancho).
 *
 * Al ser vectorial y heredar `currentColor`, cumple sin esfuerzo tres reglas
 * del manual: tamaño mínimo del isotipo 30px, versión en blanco sobre fondos
 * de marca, y versión en gris #757575.
 *
 * Usos incorrectos que la API impide por construcción: no hay props de rotación,
 * sesgado, degradado, sombra ni contorno sin relleno (manual, pág. 13 y 17).
 */

// Cubo isométrico: arista 100 → semiancho 86.60, desplazamiento vertical 50.
// Cada cara es un paralelogramo A + a·u + b·v; las franjas recorren cuatro
// tramos [0,1/7], [2/7,3/7], [4/7,5/7], [6/7,1] y abarcan la otra dirección.
//
// La cara superior corre en sentido contrario a las otras dos. Ese quiebre es
// lo que produce el galón contra la cara izquierda y hace que las franjas
// verticales de la derecha se lean como una "M". Si las tres caras corren en
// la misma dirección el cubo se convierte en una rampa continua y el logo
// deja de ser el del manual.
const CARA_SUPERIOR = [
  '-86.60,-50.00 -74.23,-42.86 12.37,-92.86 0.00,-100.00',
  '-61.86,-35.71 -49.49,-28.57 37.12,-78.57 24.74,-85.71',
  '-37.12,-21.43 -24.74,-14.29 61.86,-64.29 49.49,-71.43',
  '-12.37,-7.14 0.00,0.00 86.60,-50.00 74.23,-57.14',
];

const CARA_IZQUIERDA = [
  '-86.60,-50 -86.60,-35.71 0,14.29 0,0',
  '-86.60,-21.43 -86.60,-7.14 0,42.86 0,28.57',
  '-86.60,7.14 -86.60,21.43 0,71.43 0,57.14',
  '-86.60,35.71 -86.60,50 0,100 0,85.71',
];

const CARA_DERECHA = [
  '0,0 12.37,-7.14 12.37,92.86 0,100',
  '24.74,-14.29 37.12,-21.43 37.12,78.57 24.74,85.71',
  '49.49,-28.57 61.86,-35.71 61.86,64.29 49.49,71.43',
  '74.23,-42.86 86.60,-50 86.60,50 74.23,57.14',
];

const FRANJAS = [...CARA_SUPERIOR, ...CARA_IZQUIERDA, ...CARA_DERECHA];

/** Isotipo suelto. Tamaño mínimo 30px según el manual. */
export function Isotipo({ className = '', title }) {
  return (
    <svg
      viewBox="-90 -104 180 208"
      className={className}
      fill="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {FRANJAS.map((puntos, i) => <polygon key={i} points={puntos} />)}
    </svg>
  );
}

/**
 * Imagotipo: isotipo + logotipo. Tamaño mínimo 225px de ancho.
 * `variante`:
 *   'marca'  — isotipo morado, texto en color de texto (uso principal)
 *   'mono'   — todo en currentColor (para fondos de marca o impresión a una tinta)
 */
export function Imagotipo({ className = '', variante = 'marca', compacto = false }) {
  const colorIso = variante === 'mono' ? 'text-current' : 'text-primary';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Isotipo className={`h-[1.55em] w-auto shrink-0 ${colorIso}`} />
      <span className="flex flex-col leading-none">
        <span
          className="font-display font-bold tracking-[0.01em] leading-none"
          style={{ fontSize: '1em' }}
        >
          INMOBILIARE
        </span>
        {!compacto && (
          // La bajada va sobre una regla morada, como en el manual.
          <span className="mt-[0.22em] flex items-center gap-1.5">
            <span
              className={`h-[0.11em] w-[1.6em] rounded-full ${variante === 'mono' ? 'bg-current' : 'bg-primary'}`}
              aria-hidden="true"
            />
            <span className="text-[0.42em] font-medium tracking-[0.005em] whitespace-nowrap">
              Julio Corredor desde 1960
            </span>
          </span>
        )}
      </span>
    </span>
  );
}

export default Imagotipo;
