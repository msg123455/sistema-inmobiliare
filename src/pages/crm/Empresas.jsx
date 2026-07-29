import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';

const ETAPA_STYLE = {
  prospecto: 'bg-slate-100 text-slate-600',
  primer_contacto: 'bg-blue-100 text-blue-700',
  propuesta_enviada: 'bg-amber-100 text-amber-700',
  negociacion: 'bg-orange-100 text-orange-700',
  cerrado_ganado: 'bg-green-100 text-green-700',
  cerrado_perdido: 'bg-red-100 text-red-600',
};

function fmt(amount, moneda = 'USD') {
  if (!amount) return null;
  if (moneda === 'COP') return `COP ${Math.round(amount).toLocaleString('es-CO')}`;
  if (moneda === 'EUR') return `€ ${Math.round(amount).toLocaleString('de')}`;
  return `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

export default function Empresas() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const filtered = clientes.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.nombre_empresa, c.industria, c.ciudad_empresa, c.pais_empresa, c.email_contacto, c.nombre_contacto]
      .some(f => f?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">{clientes.length} empresa{clientes.length !== 1 ? 's' : ''} en la base de datos</p>
        </div>
        <div className="relative w-64 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="pl-9 rounded-lg h-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card rounded-xl overflow-hidden border border-border/40">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empresa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Industria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ubicación</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapa</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agua / mes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-sm text-muted-foreground">
                      {search ? 'Sin resultados para esa búsqueda' : 'No hay empresas registradas. Crealas desde Negocios.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}
                      onClick={() => navigate(`/crm/cliente/${c.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.dominio_web ? (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${c.dominio_web}&sz=64`}
                              alt=""
                              className="w-7 h-7 rounded-lg object-contain bg-muted/50 p-0.5 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-primary" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.nombre_empresa}</p>
                            {c.dominio_web && <p className="text-xs text-muted-foreground">{c.dominio_web}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.industria || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {[c.ciudad_empresa, c.pais_empresa].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">{c.nombre_contacto || '—'}</p>
                        <p className="text-xs text-muted-foreground">{c.email_contacto || c.telefono_contacto || ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${ETAPA_STYLE[c.etapa_pipeline] || 'bg-muted text-muted-foreground'}`}>
                          {c.etapa_pipeline?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                        {fmt(c.costo_agua_mensual, c.moneda) || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t border-border/20">
              <p className="text-xs text-muted-foreground">
                {filtered.length !== clientes.length ? `${filtered.length} de ${clientes.length}` : filtered.length} empresa{filtered.length !== 1 ? 's' : ''}
                {clientes.filter(c => c.etapa_pipeline === 'cerrado_ganado').length > 0 && (
                  <> · <span className="text-green-600 font-medium">{clientes.filter(c => c.etapa_pipeline === 'cerrado_ganado').length} cerrada{clientes.filter(c => c.etapa_pipeline === 'cerrado_ganado').length !== 1 ? 's' : ''}</span></>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
