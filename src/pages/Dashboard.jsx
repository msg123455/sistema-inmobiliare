import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44, Conversacion } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, Bot, MessageSquare,
  Wallet, Wrench, MessageSquareWarning, Building2, Ruler, ClipboardCheck,
  Receipt, ChevronRight, CheckCircle2, Barcode,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { moneda, periodo, diasHasta } from '@/components/modulo';

const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;
const ContratoArriendo = base44.entities.ContratoArriendo;
const Visita = base44.entities.Visita;
const PagoCanon = base44.entities.PagoCanon;
const Reparacion = base44.entities.Reparacion;
const PQR = base44.entities.PQR;
const Consignacion = base44.entities.Consignacion;
const Avaluo = base44.entities.Avaluo;
const SolicitudMatricula = base44.entities.SolicitudMatricula;
const LiquidacionPropietario = base44.entities.LiquidacionPropietario;
const CodigoBarras = base44.entities.CodigoBarras;

/* ── Reglas de negocio compartidas con los modulos ─────────────────────────
   El estado de un pago se calcula, no se lee del enum guardado: ese campo
   envejece y deja filas en "Pendiente" cuando en realidad ya estan en mora. */
function estaEnMora(p) {
  const total = Number(p.valor_total) || 0;
  const pagado = Number(p.valor_pagado) || 0;
  if (pagado >= total && total > 0) return false;
  const d = diasHasta(p.fecha_vencimiento);
  return d !== null && d < 0;
}

function fueraDeSla(r) {
  if (['Resuelta', 'Cerrada', 'Cancelada'].includes(r.estado)) return false;
  const d = diasHasta(r.fecha_limite);
  return d !== null && d < 0;
}

function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Etiqueta corta de dinero para los ejes de la grafica. */
function cop(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

/** Acceso directo grande. Es lo que se toca todos los dias. */
function Acceso({ to, icon: Icono, titulo, detalle, destacado = false, alerta = 0 }) {
  return (
    <Link to={to}>
      <Card className={`presionable h-full rounded-2xl transition-shadow hover:shadow-md ${
        destacado ? 'border-primary/40 bg-primary/5' : 'border-border/60'
      }`}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            destacado ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
          }`}>
            <Icono className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight truncate">{titulo}</p>
            {detalle && <p className="text-[12px] text-muted-foreground truncate">{detalle}</p>}
          </div>
          {alerta > 0 && (
            <span className="shrink-0 bg-destructive text-destructive-foreground text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center tabular">
              {alerta > 99 ? '99+' : alerta}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function Kpi({ etiqueta, valor, detalle, tono = 'neutro', to }) {
  const color = {
    neutro: 'text-foreground', info: 'text-primary', exito: 'text-success',
    curso: 'text-warning', peligro: 'text-destructive',
  }[tono] || 'text-foreground';
  const cuerpo = (
    <Card className={`h-full rounded-2xl border-border/60 ${to ? 'presionable hover:shadow-md transition-shadow' : ''}`}>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{etiqueta}</p>
        <p className={`text-[26px] font-bold tabular leading-tight mt-1 ${color}`}>{valor}</p>
        {detalle && <p className="text-[12px] text-muted-foreground mt-0.5">{detalle}</p>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{cuerpo}</Link> : cuerpo;
}

/** Banda de alerta. Solo aparece si hay algo que atender. */
function Alerta({ to, icon: Icono, texto, detalle, cantidad, tono = 'peligro' }) {
  const c = tono === 'peligro'
    ? 'bg-destructive/10 border-destructive/25 hover:bg-destructive/15'
    : 'bg-warning/10 border-warning/25 hover:bg-warning/15';
  const t = tono === 'peligro' ? 'text-destructive' : 'text-warning';
  return (
    <Link to={to}>
      <div className={`presionable flex items-center gap-3 p-3.5 border rounded-2xl transition-colors ${c}`}>
        <div className={`w-9 h-9 rounded-full bg-background/60 flex items-center justify-center shrink-0 ${t}`}>
          <Icono className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-[14px] ${t}`}>{texto}</p>
          {detalle && <p className="text-[12px] text-muted-foreground">{detalle}</p>}
        </div>
        <span className={`text-[15px] font-bold tabular shrink-0 ${t}`}>{cantidad}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

function Seccion({ titulo, verTodo, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{titulo}</h2>
        {verTodo && (
          <Link to={verTodo}>
            <Button variant="ghost" size="sm" className="h-7 text-[13px] text-primary presionable">Ver todo</Button>
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Pagina ───────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { data: pagos = [] } = useQuery({ queryKey: ['pagos_canon'], queryFn: () => PagoCanon.list() });
  const { data: reparaciones = [] } = useQuery({ queryKey: ['reparaciones'], queryFn: () => Reparacion.list() });
  const { data: pqrs = [] } = useQuery({ queryKey: ['pqr'], queryFn: () => PQR.list() });
  const { data: consignaciones = [] } = useQuery({ queryKey: ['consignaciones'], queryFn: () => Consignacion.list() });
  const { data: avaluos = [] } = useQuery({ queryKey: ['avaluos'], queryFn: () => Avaluo.list() });
  const { data: matriculas = [] } = useQuery({ queryKey: ['matriculas'], queryFn: () => SolicitudMatricula.list() });
  const { data: liquidaciones = [] } = useQuery({ queryKey: ['liquidaciones'], queryFn: () => LiquidacionPropietario.list() });
  const { data: codigos = [] } = useQuery({ queryKey: ['codigos_barras'], queryFn: () => CodigoBarras.list() });
  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: contratos = [] } = useQuery({ queryKey: ['contratos-arriendo'], queryFn: () => ContratoArriendo.list() });
  const { data: visitas = [] } = useQuery({ queryKey: ['visitas'], queryFn: () => Visita.list() });
  const { data: conversaciones = [] } = useQuery({
    queryKey: ['conversaciones_dash'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
    refetchInterval: 30000,
  });

  const mes = periodoActual();

  /* ── Cartera: es la plata, va primero ── */
  const cartera = useMemo(() => {
    const delMes = pagos.filter((p) => p.periodo === mes);
    const facturado = delMes.reduce((s, p) => s + (Number(p.valor_total) || 0), 0);
    const recaudado = delMes.reduce((s, p) => s + (Number(p.valor_pagado) || 0), 0);
    // La mora se mira sobre TODOS los periodos, no solo el actual: una deuda de
    // hace tres meses sigue siendo mora aunque el mes corriente vaya bien.
    const enMora = pagos.filter(estaEnMora);
    const valorMora = enMora.reduce((s, p) => s + ((Number(p.valor_total) || 0) - (Number(p.valor_pagado) || 0)), 0);
    const pct = facturado > 0 ? Math.round((recaudado / facturado) * 100) : 0;
    return { facturado, recaudado, enMora, valorMora, pct, cuentas: delMes.length };
  }, [pagos, mes]);

  /* ── Recaudo de los ultimos 6 meses, de PagoCanon real ── */
  const serieRecaudo = useMemo(() => {
    const meses = [];
    const hoy = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const delMes = pagos.filter((p) => p.periodo === clave);
      meses.push({
        mes: d.toLocaleDateString('es-CO', { month: 'short' }),
        facturado: delMes.reduce((s, p) => s + (Number(p.valor_total) || 0), 0),
        recaudado: delMes.reduce((s, p) => s + (Number(p.valor_pagado) || 0), 0),
      });
    }
    return meses;
  }, [pagos]);

  /* ── Operacion ── */
  const op = useMemo(() => {
    const repAbiertas = reparaciones.filter((r) => !['Resuelta', 'Cerrada', 'Cancelada'].includes(r.estado));
    const pqrAbiertas = pqrs.filter((p) => !['Respondida', 'Cerrada'].includes(p.estado));
    return {
      repAbiertas,
      repVencidas: reparaciones.filter(fueraDeSla),
      emergencias: repAbiertas.filter((r) => r.urgencia === 'Emergencia'),
      pqrAbiertas,
      pqrVencidas: pqrAbiertas.filter((p) => { const d = diasHasta(p.fecha_limite_legal); return d !== null && d < 0; }),
      pqrPorVencer: pqrAbiertas.filter((p) => { const d = diasHasta(p.fecha_limite_legal); return d !== null && d >= 0 && d <= 3; }),
      consigEnCurso: consignaciones.filter((c) => ['Solicitada', 'En_Avaluo'].includes(c.estado)),
      avaluosEnCurso: avaluos.filter((a) => !['Entregado', 'Cancelado'].includes(a.estado)),
      matEnCurso: matriculas.filter((m) => !['Aprobada', 'Rechazada'].includes(m.estado)),
      liqPorGirar: liquidaciones.filter((l) => l.estado !== 'Pagada'),
      enviosPendientes: codigos.filter((c) => (c.estado_envio || 'Pendiente') === 'Pendiente'),
    };
  }, [reparaciones, pqrs, consignaciones, avaluos, matriculas, liquidaciones, codigos]);

  /* ── Comercial ── */
  const com = useMemo(() => {
    const hoy = new Date();
    const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
    const en60 = new Date(hoy); en60.setDate(en60.getDate() + 60);
    return {
      disponibles: propiedades.filter((p) => p.estado === 'Disponible').length,
      total: propiedades.length,
      leads: contactos.filter((c) => c.etapa_pipeline && c.etapa_pipeline !== 'Perdido').length,
      visitasSemana: visitas.filter((v) => {
        if (v.estado !== 'Programada' || !v.fecha_hora) return false;
        const f = new Date(v.fecha_hora);
        return f >= hoy && f <= en7;
      }).length,
      vencen60: contratos.filter((c) => {
        if (c.estado !== 'Activo' || !c.fecha_fin) return false;
        const f = new Date(c.fecha_fin);
        return f >= hoy && f <= en60;
      }).length,
    };
  }, [propiedades, contactos, visitas, contratos]);

  const esperando = conversaciones.filter((c) => c.estado === 'En_Espera_Humano');
  const iaActivas = conversaciones.filter((c) => c.estado === 'IA_Activa');
  const hayAlertas = esperando.length || op.emergencias.length || op.repVencidas.length
    || op.pqrVencidas.length || op.pqrPorVencer.length || cartera.enMora.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Panel</h1>
        <p className="text-muted-foreground text-[15px]">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {periodo(mes)}
        </p>
      </div>

      {/* Lo que hay que atender hoy. Si no hay nada, no ocupa espacio. */}
      {hayAlertas ? (
        <div className="space-y-2">
          {esperando.length > 0 && (
            <Alerta to="/inbox" icon={MessageSquare} cantidad={esperando.length}
                    texto={`${esperando.length} ${esperando.length === 1 ? 'conversación espera' : 'conversaciones esperan'} a una persona`}
                    detalle="El agente escaló y nadie ha respondido" />
          )}
          {op.emergencias.length > 0 && (
            <Alerta to="/operacion/reparaciones" icon={AlertTriangle} cantidad={op.emergencias.length}
                    texto={`${op.emergencias.length} ${op.emergencias.length === 1 ? 'emergencia abierta' : 'emergencias abiertas'}`}
                    detalle="Gas, incendio o inundación: SLA de 4 horas" />
          )}
          {op.pqrVencidas.length > 0 && (
            <Alerta to="/operacion/pqr" icon={MessageSquareWarning} cantidad={op.pqrVencidas.length}
                    texto={`${op.pqrVencidas.length} PQR fuera del plazo legal`}
                    detalle="Incumplimiento, no retraso: responder ya" />
          )}
          {op.repVencidas.length > 0 && (
            <Alerta to="/operacion/reparaciones" icon={Wrench} cantidad={op.repVencidas.length} tono="curso"
                    texto={`${op.repVencidas.length} ${op.repVencidas.length === 1 ? 'reparación' : 'reparaciones'} fuera de SLA`} />
          )}
          {op.pqrPorVencer.length > 0 && (
            <Alerta to="/operacion/pqr" icon={MessageSquareWarning} cantidad={op.pqrPorVencer.length} tono="curso"
                    texto={`${op.pqrPorVencer.length} PQR vencen en 3 días o menos`} />
          )}
          {cartera.enMora.length > 0 && (
            <Alerta to="/cartera/recaudo" icon={Wallet} cantidad={cartera.enMora.length} tono="curso"
                    texto={`${cartera.enMora.length} ${cartera.enMora.length === 1 ? 'canon' : 'cánones'} en mora`}
                    detalle={`${moneda(cartera.valorMora)} sin recaudar`} />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-success/10 border border-success/25">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <p className="text-[14px] font-medium text-success">Nada urgente: sin mora, sin vencidos y sin conversaciones esperando.</p>
        </div>
      )}

      <Seccion titulo="Accesos rápidos">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Acceso to="/agente/agentes" icon={Bot} destacado
                  titulo="Agentes IA" detalle="Prompts y estado de los 9 agentes" />
          <Acceso to="/inbox" icon={MessageSquare} titulo="Bandeja"
                  detalle={`${iaActivas.length} atendidas por IA ahora`} alerta={esperando.length} />
          <Acceso to="/cartera/recaudo" icon={Wallet} titulo="Recaudo"
                  detalle={`${cartera.pct}% del mes`} alerta={cartera.enMora.length} />
          <Acceso to="/operacion/reparaciones" icon={Wrench} titulo="Reparaciones"
                  detalle={`${op.repAbiertas.length} abiertas`} alerta={op.repVencidas.length} />
          <Acceso to="/operacion/pqr" icon={MessageSquareWarning} titulo="PQR"
                  detalle={`${op.pqrAbiertas.length} abiertas`} alerta={op.pqrVencidas.length} />
          <Acceso to="/operacion/consignaciones" icon={Building2} titulo="Consignaciones"
                  detalle={`${op.consigEnCurso.length} en curso`} />
        </div>
      </Seccion>

      <Seccion titulo={`Cartera · ${periodo(mes)}`} verTodo="/cartera/recaudo">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi etiqueta="Facturado" valor={moneda(cartera.facturado)} detalle={`${cartera.cuentas} cánones`} to="/cartera/recaudo" />
          <Kpi etiqueta="Recaudado" valor={moneda(cartera.recaudado)} detalle={`${cartera.pct}% del mes`} tono="exito" to="/cartera/recaudo" />
          <Kpi etiqueta="En mora" valor={moneda(cartera.valorMora)} detalle={`${cartera.enMora.length} cánones, todos los periodos`}
               tono={cartera.valorMora > 0 ? 'peligro' : 'exito'} to="/cartera/recaudo" />
          <Kpi etiqueta="Por girar" valor={moneda(op.liqPorGirar.reduce((s, l) => s + (Number(l.neto_a_pagar) || 0), 0))}
               detalle={`${op.liqPorGirar.length} liquidaciones`} tono={op.liqPorGirar.length ? 'curso' : 'neutro'} to="/cartera/liquidaciones" />
        </div>

        {/* Barra de avance del recaudo del mes: una linea dice mas que el numero solo. */}
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">Avance del recaudo</span>
              <span className="font-semibold tabular">{moneda(cartera.recaudado)} de {moneda(cartera.facturado)}</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${cartera.pct >= 90 ? 'bg-success' : cartera.pct >= 60 ? 'bg-warning' : 'bg-destructive'}`}
                   style={{ width: `${Math.min(cartera.pct, 100)}%` }} />
            </div>
          </CardContent>
        </Card>
      </Seccion>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px] font-semibold tracking-tight">Facturado vs. recaudado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieRecaudo} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={cop} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={56} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, n) => [moneda(v), n === 'facturado' ? 'Facturado' : 'Recaudado']}
                  contentStyle={{
                    background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))',
                    borderRadius: 12, color: 'hsl(var(--popover-foreground))', fontSize: 13,
                  }}
                />
                <Legend formatter={(v) => v === 'facturado' ? 'Facturado' : 'Recaudado'} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="facturado" fill="hsl(var(--chart-1) / 0.35)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="recaudado" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px] font-semibold tracking-tight">Operación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { etiqueta: 'Reparaciones abiertas', valor: op.repAbiertas.length, to: '/operacion/reparaciones', icono: Wrench },
              { etiqueta: 'PQR abiertas', valor: op.pqrAbiertas.length, to: '/operacion/pqr', icono: MessageSquareWarning },
              { etiqueta: 'Consignaciones en curso', valor: op.consigEnCurso.length, to: '/operacion/consignaciones', icono: Building2 },
              { etiqueta: 'Avalúos en curso', valor: op.avaluosEnCurso.length, to: '/operacion/avaluos', icono: Ruler },
              { etiqueta: 'Matrículas en curso', valor: op.matEnCurso.length, to: '/operacion/matriculas', icono: ClipboardCheck },
              { etiqueta: 'Envíos pendientes', valor: op.enviosPendientes.length, to: '/cartera/envios', icono: Barcode },
              { etiqueta: 'Liquidaciones por girar', valor: op.liqPorGirar.length, to: '/cartera/liquidaciones', icono: Receipt },
            ].map((f) => (
              <Link key={f.to + f.etiqueta} to={f.to}
                    className="presionable flex items-center gap-3 py-2 border-b border-border/40 last:border-0 hover:bg-muted/50 rounded-lg px-1 -mx-1">
                <f.icono className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-[14px] flex-1 min-w-0 truncate">{f.etiqueta}</span>
                <span className="text-[15px] font-semibold tabular shrink-0">{f.valor}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Seccion titulo="Comercial" verTodo="/crm/pipeline">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi etiqueta="Disponibles" valor={com.disponibles} detalle={`de ${com.total} inmuebles`} tono="info" to="/crm/propiedades" />
          <Kpi etiqueta="Leads activos" valor={com.leads} detalle="en pipeline" to="/crm/pipeline" />
          <Kpi etiqueta="Visitas 7 días" valor={com.visitasSemana} detalle="programadas" to="/crm/visitas" />
          <Kpi etiqueta="Contratos por vencer" valor={com.vencen60} detalle="en 60 días"
               tono={com.vencen60 ? 'curso' : 'neutro'} to="/contratos/arriendos" />
        </div>
      </Seccion>
    </div>
  );
}
