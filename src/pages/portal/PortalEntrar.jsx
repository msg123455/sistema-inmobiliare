import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Loader2, AlertCircle } from 'lucide-react';
import { MARCA } from '@/lib/marca';
import { entrar, leerSesion } from '@/lib/portal';

/**
 * Canje del magic link: /portal/entrar?t=<token>
 *
 * El token es de un solo uso y vive 15 minutos. Si el canje falla no se dice
 * por que (vencido, ya usado, inexistente): el backend responde igual en los
 * tres casos para no volverse un oraculo de tokens.
 */
export default function PortalEntrar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = params.get('t');

    // Sin token pero con sesion viva: llego aqui por el guard del layout.
    if (!token) {
      if (leerSesion()) navigate('/portal', { replace: true });
      else setError('Este enlace no es válido. Pídelo de nuevo por WhatsApp.');
      return;
    }

    let cancelado = false;
    (async () => {
      try {
        await entrar(token);
        if (cancelado) return;
        // Se saca el token de la URL: queda en el historial del navegador y en
        // cualquier captura de pantalla que el cliente comparta.
        navigate('/portal', { replace: true });
      } catch (err) {
        if (!cancelado) setError(err.message || 'No se pudo abrir el enlace');
      }
    })();
    return () => { cancelado = true; };
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-12 h-12 bg-primary rounded-[13px] flex items-center justify-center mx-auto">
          <Building2 className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{MARCA.nombre}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Portal de clientes</p>
        </div>

        {!error ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm pt-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Abriendo tu sesión…
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-2 text-left text-sm text-destructive bg-destructive/10 rounded-xl p-3.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Los enlaces vencen a los 15 minutos y sirven una sola vez, por seguridad.
              Escríbenos al WhatsApp {MARCA.whatsapp} y te enviamos uno nuevo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
