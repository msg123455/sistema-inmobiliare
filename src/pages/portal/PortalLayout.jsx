import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Building2, Receipt, FileText, Wrench, LogOut, Landmark } from 'lucide-react';
import { MARCA } from '@/lib/marca';
import { leerSesion, cerrarSesion } from '@/lib/portal';

/**
 * Shell del portal del cliente.
 *
 * Deliberadamente separado del Layout del staff: sin NAV_SECTIONS, sin
 * useUserRole, sin badges de bandeja. Un arrendatario no deberia ver ni intuir
 * la estructura interna de la inmobiliaria. Ademas asi se puede rebrandear
 * aparte cuando llegue el manual de marca.
 */

const TABS_ARRENDATARIO = [
  { to: '/portal', label: 'Inicio', icon: Building2, end: true },
  { to: '/portal/estado-cuenta', label: 'Estado de cuenta', icon: Receipt },
  { to: '/portal/pagos', label: 'Pagos', icon: Landmark },
  { to: '/portal/contrato', label: 'Contrato', icon: FileText },
  { to: '/portal/reparaciones', label: 'Reparaciones', icon: Wrench },
];

const TABS_PROPIETARIO = [
  { to: '/portal', label: 'Inicio', icon: Building2, end: true },
  { to: '/portal/liquidaciones', label: 'Liquidaciones', icon: Receipt },
];

export default function PortalLayout() {
  const navigate = useNavigate();
  const [sesion, setSesion] = useState(() => leerSesion());

  // La sesion dura 2h. Si vence con la pestana abierta, sacamos al usuario en
  // vez de dejarlo con una pantalla que falla en cada peticion.
  useEffect(() => {
    const t = setInterval(() => {
      const s = leerSesion();
      if (!s) { setSesion(null); navigate('/portal/entrar', { replace: true }); }
    }, 30_000);
    return () => clearInterval(t);
  }, [navigate]);

  useEffect(() => {
    if (!sesion) navigate('/portal/entrar', { replace: true });
  }, [sesion, navigate]);

  if (!sesion) return null;

  const tabs = sesion.sujeto_tipo === 'propietario' ? TABS_PROPIETARIO : TABS_ARRENDATARIO;

  const salir = () => { cerrarSesion(); navigate('/portal/entrar', { replace: true }); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 px-4 flex items-center gap-3 bg-card border-b border-border/60 sticky top-0 z-20">
        <div className="w-8 h-8 bg-primary rounded-[9px] flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-tight text-foreground leading-tight truncate">
            {MARCA.nombreCorto}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">Portal de clientes</p>
        </div>
        <button
          onClick={salir}
          className="ml-auto p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Navegación: pestañas arriba en escritorio, barra inferior en móvil.
          La mayoría llega desde un link de WhatsApp, o sea desde el teléfono. */}
      <nav className="hidden sm:flex gap-1 px-4 py-2 bg-card border-b border-border/40 overflow-x-auto">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-colors ${
                isActive ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4 pb-24 sm:pb-6 max-w-3xl w-full mx-auto">
        <Outlet />
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border/60 flex z-20">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                isActive ? 'text-primary font-medium' : 'text-muted-foreground'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
