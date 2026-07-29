import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid, Users, Settings, LogOut, Home as HomeIcon, Menu, X,
  ChevronRight, CalendarDays, ClipboardList,
  Link2, Building2, UserCheck,
  BarChart3, MessageSquare, Bot, LineChart, Megaphone, Globe, GraduationCap, SlidersHorizontal, Brain,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Conversacion } from '@/api/base44Client';
import NotificationBell from '@/components/NotificationBell';
import MobileTabBar from '@/components/MobileTabBar';
import { useUserRole } from '@/hooks/useUserRole';

const NAV_SECTIONS = [
  {
    key: 'crm',
    label: 'CRM',
    icon: Users,
    basePath: '/crm',
    items: [
      { label: 'Pipeline', path: '/crm/pipeline', icon: BarChart3 },
      { label: 'Propiedades', path: '/crm/propiedades', icon: HomeIcon },
      { label: 'Contactos', path: '/crm/contactos', icon: Users },
      { label: 'Propietarios', path: '/crm/propietarios', icon: UserCheck },
      { label: 'Visitas', path: '/crm/visitas', icon: CalendarDays },
      { label: 'Tareas', path: '/crm/tareas', icon: ClipboardList },
    ],
  },
  {
    key: 'ia_agente',
    label: 'IA Agente',
    icon: Bot,
    basePath: '/agente',
    items: [
      { label: 'Bandeja WhatsApp', path: '/inbox', icon: MessageSquare },
      { label: 'Configurar IA', path: '/agente/configuracion', icon: Bot },
      { label: 'Autoeducación', path: '/agente/autoeducacion', icon: GraduationCap },
      { label: 'Aprendizajes', path: '/agente/aprendizajes', icon: Brain },
      { label: 'Config Evaluador', path: '/agente/config-evaluador', icon: SlidersHorizontal },
      { label: 'Analítica Leads', path: '/analytics/leads', icon: LineChart },
    ],
  },
  {
    key: 'seo',
    label: 'SEO',
    icon: Globe,
    basePath: '/marketing/seo',
    items: [
      { label: 'Motor de contenido', path: '/marketing/seo', icon: Globe },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    basePath: '/marketing/campanas',
    items: [
      { label: 'Campañas', path: '/marketing/campanas', icon: Megaphone },
    ],
  },
  {
    key: 'integraciones',
    label: 'Integraciones',
    icon: Link2,
    basePath: '/integraciones',
    items: [
      { label: 'WASI', path: '/integraciones/wasi', icon: Link2 },
    ],
  },
];

const COMERCIAL_PATHS = [
  '/',
  '/crm/pipeline', '/crm/propiedades', '/crm/contactos', '/crm/visitas', '/crm/tareas',
  '/contratos/arriendos', '/contratos/ventas',
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/inbox'
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <MessageSquare className="w-[19px] h-[19px] flex-shrink-0" />
          <span className="flex-1">Bandeja</span>
          {totalBadge > 0 && (
            <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
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
                  {visibleItems.map(item => {
                    const active = isItemActive(item.path);
                    const ItemIcon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] transition-all duration-200 ${
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <ItemIcon className="w-4 h-4 flex-shrink-0" />
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/configuracion'
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <Settings className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Configuración</span>
        </Link>
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-border/60">
        {user && (
          <div className="px-2 mb-2">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-foreground truncate">{user.full_name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isAdmin ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                    {rol}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-[14px] text-red-500 hover:bg-red-500/5 rounded-[8px] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center h-12 px-4 bg-card/80 backdrop-blur-xl border-b border-border/60 shrink-0 z-20 sticky top-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-1.5 rounded-lg hover:bg-muted text-foreground mr-2"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" className="flex items-center gap-2.5 mr-4">
          <div className="w-8 h-8 bg-primary rounded-[9px] flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-foreground hidden sm:inline">InmoGest</span>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <NotificationBell />
        </div>
      </header>

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
          <div className="flex items-center justify-between px-4 h-12 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-primary rounded-[8px] flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-[15px] font-semibold text-foreground">InmoGest</span>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
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