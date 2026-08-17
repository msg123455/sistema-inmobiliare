import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
// Solo los iconos de las cabeceras de seccion y de los enlaces sueltos: los
// items de cada modulo van sin icono.
import {
  LayoutGrid, Users, Settings, LogOut, Menu, X, ChevronRight,
  Link2, MessageSquare, Bot, Megaphone, Globe,
  Wrench, Wallet, Briefcase,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Conversacion } from '@/api/base44Client';
import NotificationBell from '@/components/NotificationBell';
import MobileTabBar from '@/components/MobileTabBar';
import ThemeToggle from '@/components/ThemeToggle';
import { MARCA } from '@/lib/marca';
import { Imagotipo, Isotipo } from '@/components/Logo';
import { useUserRole } from '@/hooks/useUserRole';

const NAV_SECTIONS = [
  {
    key: 'crm',
    label: 'CRM',
    icon: Users,
    basePath: '/crm',
    items: [
      { label: 'Pipeline', path: '/crm/pipeline' },
      { label: 'Propiedades', path: '/crm/propiedades' },
      { label: 'Contactos', path: '/crm/contactos' },
      { label: 'Propietarios', path: '/crm/propietarios' },
      { label: 'Visitas', path: '/crm/visitas' },
      { label: 'Tareas', path: '/crm/tareas' },
    ],
  },
  {
    key: 'operacion',
    label: 'Operación',
    icon: Wrench,
    basePath: '/operacion',
    items: [
      { label: 'Consignaciones', path: '/operacion/consignaciones' },
      { label: 'Reparaciones', path: '/operacion/reparaciones' },
      { label: 'Avalúos', path: '/operacion/avaluos' },
      { label: 'PQR', path: '/operacion/pqr' },
      { label: 'Matrículas', path: '/operacion/matriculas' },
      { label: 'Asistidos', path: '/operacion/asistidos' },
    ],
  },
  {
    key: 'cartera',
    label: 'Cartera',
    icon: Wallet,
    basePath: '/cartera',
    items: [
      { label: 'Recaudo', path: '/cartera/recaudo' },
      { label: 'Envíos', path: '/cartera/envios' },
      { label: 'Códigos del mes', path: '/cartera/codigos' },
      { label: 'Liquidaciones', path: '/cartera/liquidaciones' },
    ],
  },
  {
    key: 'ia_agente',
    label: 'IA Agente',
    icon: Bot,
    basePath: '/agente',
    items: [
      { label: 'Bandeja', path: '/inbox' },
      { label: 'Agentes', path: '/agente/agentes' },
      { label: 'Conocimiento RAG', path: '/agente/conocimiento' },
      { label: 'Configurar IA', path: '/agente/configuracion' },
      { label: 'Analítica Leads', path: '/analytics/leads' },
    ],
  },
  {
    key: 'seo',
    label: 'SEO',
    icon: Globe,
    basePath: '/marketing/seo',
    items: [
      { label: 'Motor de contenido', path: '/marketing/seo' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    basePath: '/marketing/campanas',
    items: [
      { label: 'Campañas', path: '/marketing/campanas' },
    ],
  },
  {
    key: 'equipo',
    label: 'Equipo',
    icon: Briefcase,
    basePath: '/equipo',
    items: [
      { label: 'Asesores', path: '/equipo/asesores' },
      { label: 'Calendario', path: '/equipo/calendario' },
      { label: 'Metas', path: '/equipo/metas' },
    ],
  },
  {
    key: 'integraciones',
    label: 'Integraciones',
    icon: Link2,
    basePath: '/integraciones',
    items: [
      { label: 'Sincronizar con SIMI', path: '/integraciones/simi' },
    ],
  },
];

const COMERCIAL_PATHS = [
  '/',
  '/crm/pipeline', '/crm/propiedades', '/crm/contactos', '/crm/visitas', '/crm/tareas',
  '/contratos/arriendos', '/contratos/ventas',
  // Operacion: la ve el asesor porque es su dia a dia. Cartera no: liquidaciones
  // y recaudo son plata del negocio y van por AdminOnly.
  '/operacion/consignaciones', '/operacion/reparaciones', '/operacion/avaluos',
  '/operacion/pqr', '/operacion/matriculas',
  // El broker es justamente quien presiona el boton de 'yo lo atendi'.
  '/operacion/asistidos',
  '/configuracion',
];

export default function Layout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, isComercial, rol } = useUserRole();

  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    NAV_SECTIONS.forEach(s => {
      if (window.location.pathname.startsWith(s.basePath)) {
        initial[s.key] = true;
      }
    });
    return initial;
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    NAV_SECTIONS.forEach(s => {
      if (location.pathname.startsWith(s.basePath)) {
        setOpenSections(prev => ({ ...prev, [s.key]: true }));
      }
    });
  }, [location.pathname]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isItemActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const isSectionActive = (basePath) => location.pathname.startsWith(basePath);

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const { data: convEsperando = [] } = useQuery({
    queryKey: ['conv_esperando_nav'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje', { estado: 'En_Espera_Humano' }),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: convSinLeer = [] } = useQuery({
    queryKey: ['conv_sin_leer_nav'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
    select: (data) => data.filter((c) => c.mensajes_sin_leer > 0),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const totalBadge = convSinLeer.length + convEsperando.length;

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <Link
          to="/"
          className={`presionable flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] ${
            location.pathname === '/'
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <LayoutGrid className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Dashboard</span>
        </Link>

        <Link
          to="/inbox"
          className={`presionable flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] ${
            location.pathname === '/inbox'
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <MessageSquare className="w-[19px] h-[19px] flex-shrink-0" />
          <span className="flex-1">Bandeja</span>
          {totalBadge > 0 && (
            <span className="bg-destructive text-destructive-foreground text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center tabular">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </Link>

        <div className="pt-4 pb-1.5">
          <p className="px-3 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Módulos</p>
        </div>

        {NAV_SECTIONS.map(section => {
          const visibleItems = isComercial
            ? section.items.filter(i => COMERCIAL_PATHS.includes(i.path))
            : section.items;
          if (visibleItems.length === 0) return null;

          const SectionIcon = section.icon;
          const sectionActive = isSectionActive(section.basePath);
          const isOpen = openSections[section.key];

          return (
            <div key={section.key}>
              <button
                onClick={() => toggleSection(section.key)}
                className={`w-full presionable flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] ${
                  sectionActive
                    ? 'text-foreground font-medium bg-muted'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <SectionIcon className="w-[19px] h-[19px] flex-shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l border-border/60 pl-2">
                  {/* Los items van sin icono: dentro de una seccion ya abierta el
                      icono no distingue nada y compite con el de la cabecera. La
                      jerarquia la dan la sangria y la linea de la izquierda. */}
                  {visibleItems.map(item => {
                    const active = isItemActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`presionable flex items-center px-3 py-2 rounded-[8px] text-[14px] ${
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-4 pb-1.5">
          <p className="px-3 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Sistema</p>
        </div>

        <Link
          to="/configuracion"
          className={`presionable flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] ${
            location.pathname === '/configuracion'
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <Settings className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Configuración</span>
        </Link>
      </nav>

      <div className="pb-seguro px-3 pb-4 pt-3 border-t border-border/60">
        {user && (
          <div className="px-2 mb-2">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-foreground truncate">{user.full_name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isAdmin ? 'bg-primary/10 text-primary' : 'bg-warning/15 text-warning'}`}>
                    {rol}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        {/* El selector de tema del header se oculta en móvil, donde no hay
            espacio; aquí queda accesible en cualquier ancho. */}
        <div className="sm:hidden px-2 pb-2">
          <ThemeToggle />
        </div>

        <button
          onClick={handleLogout}
          className="presionable w-full flex items-center gap-2 px-3 py-2 text-[14px] text-destructive hover:bg-destructive/10 rounded-[8px]"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="vidrio-ios pt-seguro fixed top-0 left-0 right-0 flex items-center h-14 px-4 border-b border-border/60 z-[9999]">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="presionable md:hidden p-1.5 rounded-lg hover:bg-muted text-foreground mr-2"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" className="presionable flex items-center mr-4" aria-label="Ir al inicio">
          {/* Imagotipo completo en pantallas donde cabe por encima del tamaño
              mínimo del manual; en móvil solo el isotipo. */}
          <Imagotipo className="hidden sm:inline-flex text-[15px] text-foreground" />
          <Isotipo className="sm:hidden h-7 w-auto text-primary" title={MARCA.nombre} />
        </Link>

        <div className="flex-1 pointer-events-none" />

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <NotificationBell />
        </div>
      </header>

      <div className="h-14 shrink-0" />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex w-60 bg-card flex-col border-r border-border/60">
          {navContent}
        </div>

        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-card flex flex-col border-r border-border/60 transform transition-transform duration-300 ease-out md:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="pt-seguro flex items-center justify-between px-4 h-14 border-b border-border/60">
            <Imagotipo className="text-[14px] text-foreground" />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="presionable p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {navContent}
        </div>

        <div className="flex-1 overflow-auto pb-14 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
            <Outlet />
          </div>
        </div>
      </div>

      <MobileTabBar />
    </div>
  );
}
