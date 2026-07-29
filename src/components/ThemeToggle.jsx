import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';

const OPCIONES = [
  { valor: 'light',  icono: Sun,     etiqueta: 'Claro' },
  { valor: 'system', icono: Monitor, etiqueta: 'Automático' },
  { valor: 'dark',   icono: Moon,    etiqueta: 'Oscuro' },
];

/**
 * Selector de tema con la forma del segmented control de iOS.
 *
 * El tema resuelto solo se conoce en el cliente, así que hasta que monta se
 * pinta el contenedor sin selección: renderizar una opción activa en el
 * servidor y otra en el cliente produce un salto visible.
 */
export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5 ${className}`}
      role="radiogroup"
      aria-label="Tema de la interfaz"
    >
      {OPCIONES.map(({ valor, icono: Icono, etiqueta }) => {
        const activo = montado && theme === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={etiqueta}
            title={etiqueta}
            onClick={() => setTheme(valor)}
            className={`presionable flex h-7 w-7 items-center justify-center rounded-full ${
              activo
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icono className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
