import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

/**
 * Alterna claro/oscuro.
 *
 * next-themes solo conoce el tema real despues de hidratar, asi que en el primer
 * render servidor y cliente difieren. Renderizamos un hueco del mismo tamano
 * hasta montar: evita el parpadeo y que React se queje por mismatch.
 */
export default function ThemeToggle() {
  const [montado, setMontado] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMontado(true), []);

  if (!montado) return <div className="w-8 h-8" aria-hidden />;

  const esOscuro = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(esOscuro ? 'light' : 'dark')}
      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {esOscuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
