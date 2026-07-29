import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MessageSquare, ChevronDown, X } from 'lucide-react';
import CompanyLogo from './CompanyLogo';

const PAGE_SIZE = 10;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} día${days !== 1 ? 's' : ''}`;
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function AuthorAvatar({ nombre, email }) {
  const initials = (nombre || email || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  return (
    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
      <span className="text-[9px] font-bold text-primary">{initials}</span>
    </div>
  );
}

export default function NotasCRM({ filtroClienteId: filtroExterno = null, soloMias = false, userEmail = null }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filtroInterno, setFiltroInterno] = useState(null);
  const filtroClienteId = filtroExterno ?? filtroInterno;
  const setFiltroClienteId = filtroExterno !== null ? () => {} : setFiltroInterno;

  const { data: notas = [] } = useQuery({
    queryKey: ['notas-todas'],
    queryFn: () => base44.entities.Nota.list(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]));
  const userMap = Object.fromEntries(users.map(u => [u.email, u]));

  const sorted = [...notas].sort((a, b) => {
    const da = a.fecha_nota ? new Date(a.fecha_nota) : new Date(0);
    const db = b.fecha_nota ? new Date(b.fecha_nota) : new Date(0);
    return db - da;
  });

  const filtradas = (() => {
    let base = filtroClienteId ? sorted.filter(n => n.cliente_id === filtroClienteId) : sorted;
    if (soloMias && userEmail) base = base.filter(n => n.created_by === userEmail);
    return base;
  })();

  if (sorted.length === 0) return null;

  const clienteFiltro = filtroClienteId ? clienteMap[filtroClienteId] : null;

  const handleClickEmpresa = (e, clienteId) => {
    e.stopPropagation();
    setFiltroClienteId(id => id === clienteId ? null : clienteId);
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Notas recientes</h2>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {filtradas.length}{filtroClienteId ? ` de ${sorted.length}` : ''}
        </span>
        {clienteFiltro && (
          <button
            onClick={() => { setFiltroClienteId(null); setVisible(PAGE_SIZE); }}
            className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full hover:bg-primary/20 transition-colors"
          >
            {clienteFiltro.nombre_empresa}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtradas.slice(0, visible).map(nota => {
          const cliente = clienteMap[nota.cliente_id];
          const autor = userMap[nota.created_by];
          const autorNombre = autor?.full_name || nota.created_by?.split('@')[0] || 'Usuario';

          return (
            <div
              key={nota.id}
              onClick={() => cliente && navigate(`/cliente/${nota.cliente_id}?tab=notas`)}
              className="bg-muted/20 rounded-xl p-4 hover:bg-muted/40 transition-colors cursor-pointer space-y-2"
            >
              {/* Header: company logo + name + date */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={e => cliente && handleClickEmpresa(e, nota.cliente_id)}
                  className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                  title={cliente ? `Filtrar por ${cliente.nombre_empresa}` : ''}
                >
                  {cliente ? (
                    <>
                      <CompanyLogo cliente={cliente} size="sm" />
                      <span className="text-sm font-semibold text-foreground truncate">
                        {cliente.nombre_empresa}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Empresa desconocida</span>
                  )}
                </button>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {timeAgo(nota.fecha_nota)}
                </span>
              </div>

              {/* Content */}
              <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                {nota.texto}
              </p>

              {/* Author */}
              <div className="flex items-center gap-1.5">
                <AuthorAvatar nombre={autor?.full_name} email={nota.created_by} />
                <span className="text-xs text-muted-foreground">{autorNombre}</span>
              </div>
            </div>
          );
        })}
      </div>

      {visible < filtradas.length && (
        <button
          onClick={() => setVisible(v => v + PAGE_SIZE)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground bg-card rounded-xl hover:bg-muted/40 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Ver más ({filtradas.length - visible} restantes)
        </button>
      )}
    </div>
  );
}
