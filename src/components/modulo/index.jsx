/**
 * Piezas compartidas de los modulos de operacion y cartera.
 *
 * Las pantallas viejas pintan los estados con clases crudas
 * (`bg-blue-100 text-blue-700`), que en tema oscuro quedan como texto azul
 * sobre fondo casi negro. Aqui los estados van por tokens semanticos, asi que
 * responden al tema y al re-skin de marca sin tocar cada pagina.
 */
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Inbox } from 'lucide-react';

/* ── Tonos ────────────────────────────────────────────────────────────────── */

const TONOS = {
  neutro:  'bg-muted text-muted-foreground',
  info:    'bg-primary/10 text-primary',
  curso:   'bg-warning/15 text-warning',
  exito:   'bg-success/15 text-success',
  peligro: 'bg-destructive/15 text-destructive',
};

/**
 * Estado -> tono. Un solo mapa para todas las entidades: los verbos se repiten
 * (Cancelada existe en Reparacion, Avaluo y Consignacion) y tenerlo centralizado
 * evita que el mismo estado se pinte distinto en cada pantalla.
 */
const ESTADO_TONO = {
  // Arranque
  Solicitada: 'info', Solicitado: 'info', Reportada: 'info', Radicada: 'info',
  Pendiente: 'info', Iniciada: 'info', Borrador: 'info',
  // En curso
  En_proceso: 'curso', En_Avaluo: 'curso', En_captura: 'curso', En_estudio: 'curso',
  Cotizado: 'curso', Aceptado: 'curso', Agendado: 'curso', Programada: 'curso',
  Parcial: 'curso', Pendiente_documentos: 'curso', No_Disponible: 'curso',
  Vacaciones: 'curso',
  // Cerrado bien
  Aprobada: 'exito', Publicada: 'exito', Resuelta: 'exito', Cerrada: 'exito',
  Pagado: 'exito', Pagada: 'exito', Enviado: 'exito', Entregado: 'exito',
  Activo: 'exito', Respondida: 'exito',
  // Cerrado mal
  Rechazada: 'peligro', Cancelada: 'peligro', Cancelado: 'peligro',
  Mora: 'peligro', Fallido: 'peligro',
};

const PRIORIDAD_TONO = {
  Emergencia: 'peligro', Urgente: 'peligro', Alta: 'peligro',
  Media: 'curso', Baja: 'neutro',
};

export function EstadoBadge({ valor, tipo = 'estado', className = '' }) {
  if (!valor) return null;
  const mapa = tipo === 'prioridad' ? PRIORIDAD_TONO : ESTADO_TONO;
  const tono = TONOS[mapa[valor]] || TONOS.neutro;
  return (
    <Badge className={`text-[10px] font-medium border-0 ${tono} ${className}`}>
      {String(valor).replace(/_/g, ' ')}
    </Badge>
  );
}

/* ── Formato ──────────────────────────────────────────────────────────────── */

/** Pesos colombianos sin decimales. Devuelve guion si no hay valor. */
export function moneda(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

/** Fecha corta. Acepta ISO o YYYY-MM-DD; no revienta con basura. */
export function fecha(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Periodo YYYY-MM -> "may 2026". */
export function periodo(v) {
  if (!v) return '—';
  const [a, m] = String(v).split('-');
  const d = new Date(Number(a), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
}

/** Dias entre hoy y una fecha. Negativo = ya vencio. */
export function diasHasta(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

/* ── Estructura de pagina ─────────────────────────────────────────────────── */

export function EncabezadoModulo({ titulo, resumen, children }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{titulo}</h1>
        {resumen && <p className="text-muted-foreground text-[15px]">{resumen}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** Filtro por estado. `opciones` son los valores crudos; 'todos' se antepone. */
export function FiltrosEstado({ valor, onChange, opciones }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {['todos', ...opciones].map((o) => (
        <Button
          key={o}
          size="sm"
          variant={valor === o ? 'default' : 'outline'}
          className="presionable"
          onClick={() => onChange(o)}
        >
          {o === 'todos' ? 'Todos' : String(o).replace(/_/g, ' ')}
        </Button>
      ))}
    </div>
  );
}

export function Vacio({ mensaje, icono: Icono = Inbox }) {
  return (
    <div className="text-center py-12">
      <Icono className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground">{mensaje}</p>
    </div>
  );
}

export function Cargando() {
  return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
}

/** Tarjeta de fila. `onClick` la vuelve interactiva (cursor + realce). */
export function FilaCard({ children, onClick }) {
  return (
    <Card
      onClick={onClick}
      className={`rounded-2xl border-border/60 transition-shadow ${onClick ? 'cursor-pointer hover:shadow-sm' : ''}`}
    >
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

/** Cifra destacada para las tiras de totales. */
export function Metrica({ etiqueta, valor, tono = 'neutro' }) {
  const color = {
    neutro: 'text-foreground',
    info: 'text-primary',
    exito: 'text-success',
    curso: 'text-warning',
    peligro: 'text-destructive',
  }[tono] || 'text-foreground';
  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{etiqueta}</p>
        <p className={`text-2xl font-bold tabular mt-1 ${color}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
