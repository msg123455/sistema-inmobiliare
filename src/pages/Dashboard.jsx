import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Conversacion } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Home, Users, KeyRound, TrendingUp, AlertTriangle, CalendarDays,
  DollarSign, BarChart3, CheckCircle2, Clock, Globe, MessageSquare, Bot,
  ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, addMonths, isAfter, isBefore, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;
const ContratoArriendo = base44.entities.ContratoArriendo;
const ContratoVenta = base44.entities.ContratoVenta;
const Visita = base44.entities.Visita;
const Tarea = base44.entities.Tarea;

function KpiCard({ icon: Icon, label, value, sub, color = 'blue', to }) {
  const colorMap = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    red: 'text-red-500 bg-red-500/10',
    purple: 'text-violet-500 bg-violet-500/10',
  };
  const card = (
    <Card className="hover:shadow-md transition-all duration-300 cursor-pointer rounded-2xl border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground mb-1">{label}</p>
            <p className="text-[28px] font-bold text-foreground leading-tight tracking-tight">{value}</p>
            {sub && <p className="text-[12px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${colorMap[color]} flex-shrink-0`}>
            <Icon className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

function formatCOP(n) {
  if (!n) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function Dashboard() {
  const { data: propiedades = [] } = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => Propiedad.list(),
  });
  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });
  const { data: contratosArriendo = [] } = useQuery({
    queryKey: ['contratos-arriendo'],
    queryFn: () => ContratoArriendo.list(),
  });
  const { data: contratosVenta = [] } = useQuery({
    queryKey: ['contratos-venta'],
    queryFn: () => ContratoVenta.list(),
  });
  const { data: visitas = [] } = useQuery({
    queryKey: ['visitas'],
    queryFn: () => Visita.list(),
  });
  const { data: conversaciones = [] } = useQuery({
    queryKey: ['conversaciones_dash'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
    refetchInterval: 30000,
  });

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas'],
    queryFn: () => Tarea.list(),
  });

  const stats = useMemo(() => {
    const hoy = new Date();
    const en30 = addMonths(hoy, 1);
    const en60 = addMonths(hoy, 2);
    const semana = new Date(hoy); semana.setDate(semana.getDate() + 7);

    const disponibles = propiedades.filter(p => p.estado === 'Disponible').length;
    const arrendadas = propiedades.filter(p => p.estado === 'Arrendado').length;
    const vendidas = propiedades.filter(p => p.estado === 'Vendido').length;
    const total = propiedades.length;
    const tasaOcupacion = total > 0 ? Math.round((arrendadas / total) * 100) : 0;

    const arrendosActivos = contratosArriendo.filter(c => c.estado === 'Activo');
    const ingresosMensualesArriendo = arrendosActivos.reduce(
      (sum, c) => sum + (c.canon_mensual * (c.administracion_pct || 10) / 100), 0
    );

    const comisionesVenta = contratosVenta
      .filter(c => c.estado !== 'Cancelado')
      .reduce((sum, c) => sum + (c.valor_comision || 0), 0);

    const vencen30 = contratosArriendo.filter(c => {
      if (!c.fecha_fin || c.estado !== 'Activo') return false;
      const fin = new Date(c.fecha_fin);
      return isAfter(fin, hoy) && isBefore(fin, en30);
    }).length;

    const vencen60 = contratosArriendo.filter(c => {
      if (!c.fecha_fin || c.estado !== 'Activo') return false;
      const fin = new Date(c.fecha_fin);
      return isAfter(fin, en30) && isBefore(fin, en60);
    }).length;

    const visitasSemana = visitas.filter(v => {
      if (v.estado !== 'Programada') return false;
      const fv = new Date(v.fecha_hora);
      return isAfter(fv, hoy) && isBefore(fv, semana);
    }).length;

    const leadsActivos = contactos.filter(c => c.etapa_pipeline && c.etapa_pipeline !== 'Perdido').length;
    const noPublicadasWasi = propiedades.filter(p => p.estado === 'Disponible' && !p.publicado_wasi).length;

    const meses = Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(hoy, -(5 - i));
      const label = format(m, 'MMM', { locale: es });
      const ini = startOfMonth(m);
      const fin = endOfMonth(m);
      const ingresos = arrendosActivos.reduce((sum, c) => {
        const inicio = new Date(c.fecha_inicio || ini);
        return isBefore(inicio, fin) ? sum + (c.canon_mensual * (c.administracion_pct || 10) / 100) : sum;
      }, 0);
      const comisiones = contratosVenta.filter(c => {
        const fe = c.fecha_escritura ? new Date(c.fecha_escritura) : null;
        return fe && isAfter(fe, ini) && isBefore(fe, fin);
      }).reduce((sum, c) => sum + (c.valor_comision || 0), 0);
      return { mes: label, arriendos: Math.round(!ingresos), ventas: Math.round(comisiones) };
    });

    return { disponibles, arrendadas, vendidas, total, tasaOcupacion, ingresosMensualesArriendo, comisionesVenta, vencen30, vencen60, visitasSemana, leadsActivos, noPublicadasWasi, meses };
  }, [propiedades, contratosArriendo, contratosVenta, visitas, contactos]);

  const contratosProximos = useMemo(() =>
    contratosArriendo
      .filter(c => {
        if (!c.fecha_fin || c.estado !== 'Activo') return false;
        const dias = differenceInDays(new Date(c.fecha_fin), new Date());
        return dias >= 0 && dias <= 90;
      })
      .sort((a, b) => new Date(a.fecha_fin) - new Date(b.fecha_fin))
      .slice(0, 5),
    [contratosArriendo]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-[15px] mt-0.5">Resumen general de tu inmobiliaria</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Home} label="Propiedades disponibles" value={stats.disponibles} sub={`de ${stats.total} en cartera`} color="blue" to="/crm/propiedades" />
        <KpiCard icon={KeyRound} label="Arrendadas activas" value={stats.arrendadas} sub={`Ocupación: ${stats.tasaOcupacion}%`} color="green" to="/contratos/arriendos" />
        <KpiCard icon={DollarSign} label="Ingresos mensuales" value={formatCOP(stats.ingresosMensualesArriendo)} sub="Administración arriendos" color="green" to="/finanzas/comisiones" />
        <KpiCard icon={TrendingUp} label="Comisiones en proceso" value={formatCOP(stats.comisionesVenta)} sub="Ventas activas" color="purple" to="/contratos/ventas" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Leads activos" value={stats.leadsActivos} sub="En pipeline" color="blue" to="/crm/pipeline" />
        <KpiCard icon={CalendarDays} label="Visitas esta semana" value={stats.visitasSemana} sub="Programadas" color="amber" to="/crm/visitas" />
        <KpiCard icon={AlertTriangle} label="Contratos por vencer" value={stats.vencen30} sub={`+${stats.vencen60} en 60 días`} color="red" to="/contratos/arriendos" />
        <KpiCard icon={Globe} label="Sin publicar en WASI" value={stats.noPublicadasWasi} sub="Disponibles sin sync" color="amber" to="/integraciones/wasi" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px] font-semibold tracking-tight">Ingresos últimos 6 meses (COP)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.meses} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => formatCOP(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, name) => [formatCOP(v), name === 'arriendos' ? 'Arriendos' : 'Ventas']} />
                <Bar dataKey="arriendos" name="Arriendos" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="ventas" name="Ventas" fill="hsl(var(--primary) / 0.4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[17px] font-semibold tracking-tight">Contratos por vencer</CardTitle>
              <Link to="/contratos/arriendos"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Ver todos</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {contratosProximos.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-[14px] text-muted-foreground">Sin vencimientos próximos</p>
              </div>
            ) : contratosProximos.map(c => {
              const dias = differenceInDays(new Date(c.fecha_fin), new Date());
              const cls = dias <= 30
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : dias <= 60
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{c.propiedad_titulo || 'Propiedad'}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{c.arrendatario_nombre}</p>
                  </div>
                  <Badge className={`text-[11px] flex-shrink-0 font-semibold border-transparent ${cls}`}>{dias}d</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {(() => {
        const esperando = conversaciones.filter(c => c.estado === 'En_Espera_Humano');
        const iaActivas = conversaciones.filter(c => c.estado === 'IA_Activa');
        const hoyStart = new Date(); hoyStart.setHours(0,0,0,0);
        const leadsHoy = contactos.filter(c => new Date(c.created_at) >= hoyStart).length;
        const calificadosIA = contactos.filter(c => c.ia_calificado).length;

        return (
          <div className="space-y-3">
            {esperando.length > 0 && (
              <Link to="/inbox">
                <div className="flex items-center gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl hover:bg-red-500/15 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-red-700 dark:text-red-400 text-[14px]">
                      {esperando.length} {esperando.length === 1 ? 'conversación esperando' : 'conversaciones esperando'} agente humano
                    </p>
                    <p className="text-[12px] text-red-600 dark:text-red-500">La IA escaló estas conversaciones — revisa la bandeja</p>
                  </div>
                  <Badge variant="destructive" className="font-semibold">{esperando.length}</Badge>
                </div>
              </Link>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Link to="/inbox">
                <Card className="hover:shadow-md transition-all duration-300 rounded-2xl border-border/60">
                  <CardContent className="p-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-2">
                      <Bot className="w-5 h-5 text-violet-500" />
                    </div>
                    <p className="text-[22px] font-bold tracking-tight">{iaActivas.length}</p>
                    <p className="text-[12px] text-muted-foreground">IA atendiendo ahora</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/analytics/leads">
                <Card className="hover:shadow-md transition-all duration-300 rounded-2xl border-border/60">
                  <CardContent className="p-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                      <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-[22px] font-bold tracking-tight">{leadsHoy}</p>
                    <p className="text-[12px] text-muted-foreground">Leads nuevos hoy</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/analytics/leads">
                <Card className="hover:shadow-md transition-all duration-300 rounded-2xl border-border/60">
                  <CardContent className="p-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                      <TrendingUp className="w-5 h-5 text-green-500" />
                    </div>
                    <p className="text-[22px] font-bold tracking-tight">{calificadosIA}</p>
                    <p className="text-[12px] text-muted-foreground">Calificados por IA</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[17px] font-semibold tracking-tight">Tareas pendientes</CardTitle>
              <Link to="/crm/tareas"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {tareas.filter(t => !t.completada).slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] truncate">{t.titulo}</p>
                  {t.fecha_limite && (
                    <p className="text-[12px] text-muted-foreground">{format(new Date(t.fecha_limite), 'dd MMM', { locale: es })}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[11px] flex-shrink-0">{t.prioridad || 'Media'}</Badge>
              </div>
            ))}
            {tareas.filter(t => !t.completada).length === 0 && (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-[14px] text-muted-foreground">Sin tareas pendientes</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px] font-semibold tracking-tight">Estado del portafolio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {[
              { label: 'Disponibles', value: stats.disponibles, color: 'bg-blue-500' },
              { label: 'Arrendadas', value: stats.arrendadas, color: 'bg-green-500' },
              { label: 'Vendidas', value: stats.vendidas, color: 'bg-violet-500' },
              { label: 'Otras', value: stats.total - stats.disponibles - stats.arrendadas - stats.vendidas, color: 'bg-gray-400' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-[14px] mb-1.5">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${stats.total > 0 ? (item.value / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}