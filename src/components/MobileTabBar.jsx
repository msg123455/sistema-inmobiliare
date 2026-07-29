import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, MessageSquare, Users, DollarSign, Settings } from 'lucide-react';

const TABS = [
  { label: 'Inicio', path: '/', icon: LayoutGrid },
  { label: 'Bandeja', path: '/inbox', icon: MessageSquare },
  { label: 'CRM', path: '/crm/pipeline', icon: Users },
  { label: 'Finanzas', path: '/finanzas/gastos', icon: DollarSign },
  { label: 'Ajustes', path: '/configuracion', icon: Settings },
];

export default function MobileTabBar() {
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="vidrio-ios pb-seguro md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/60">
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const active = isActive(tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={active ? 'page' : undefined}
              className={`presionable flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}