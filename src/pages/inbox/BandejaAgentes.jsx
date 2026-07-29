import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MemoriaChat } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Hand, MessageCircle, ChevronRight } from 'lucide-react';
import { AGENTES } from '@/lib/agentes';

function haceCuanto(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  if (m < 1440) return `hace ${Math.floor(m / 60)}h`;
  return `hace ${Math.floor(m / 1440)}d`;
}

/**
 * Vista de bandejas por agente.
 *
 * Con nueve agentes una sola lista mezclada obliga a leer el badge de cada
 * conversación para saber de quién es. Repartirlas por agente convierte eso en
 * una decisión de un vistazo: quién tiene cola y quién está esperando a una
 * persona.
 */
export default function BandejaAgentes() {
  const { data: memorias = [], isLoading } = useQuery({
    queryKey: ['memoria_inbox'],
    queryFn: () => MemoriaChat.list('-fecha_ultimo_mensaje'),
    refetchInterval: 15000,
  });

  const porAgente = useMemo(() => {
    const mapa = new Map(AGENTES.map((a) => [a.clave, { total: 0, pausadas: 0, ultima: null }]));
    memorias.forEach((m) => {
      if (!m.telefono) return;
      // Los hilos anteriores al ruteo multi-agente no tienen agente_activo; son
      // de ventas, que era el unico agente que existia.
      const clave = m.agente_activo || 'ventas';
      const acc = mapa.get(clave);
      if (!acc) return;
      acc.total += 1;
      if (m.pausada) acc.pausadas += 1;
      if (!acc.ultima || new Date(m.fecha_ultimo_mensaje || 0) > new Date(acc.ultima)) {
        acc.ultima = m.fecha_ultimo_mensaje;
      }
    });
    return mapa;
  }, [memorias]);

  const totalConv = memorias.filter((m) => m.telefono).length;
  const totalPausadas = memorias.filter((m) => m.pausada).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Agentes</h1>
          <p className="text-muted-foreground text-[15px]">
            {isLoading ? 'Cargando conversaciones...' : `${totalConv} conversaciones · ${totalPausadas} en control manual`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {AGENTES.map((a) => {
          const d = porAgente.get(a.clave) || { total: 0, pausadas: 0, ultima: null };
          const Icono = a.icono;
          const activo = d.total > 0;
          return (
            <Link key={a.clave} to={`/inbox/${a.clave}`}>
              <Card className={`presionable h-full rounded-2xl transition-shadow hover:shadow-md ${
                d.pausadas > 0 ? 'border-warning/40' : 'border-border/60'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      activo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icono className="w-5 h-5" strokeWidth={2.2} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold leading-tight truncate">{a.nombre}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{a.resumen}</p>

                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <span className="text-[22px] font-bold tabular leading-none">{d.total}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {d.total === 1 ? 'conversación' : 'conversaciones'}
                        </span>
                        {d.pausadas > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning flex items-center gap-1">
                            <Hand className="w-3 h-3" />{d.pausadas} manual
                          </span>
                        )}
                      </div>

                      {d.ultima && (
                        <p className="text-[11px] text-muted-foreground mt-1.5">Último mensaje {haceCuanto(d.ultima)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {!isLoading && totalConv === 0 && (
        <div className="text-center py-10">
          <MessageCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Sin conversaciones todavía.</p>
          <p className="text-xs text-muted-foreground mt-1">Entra a cualquier agente para ver su bandeja vacía.</p>
        </div>
      )}
    </div>
  );
}
