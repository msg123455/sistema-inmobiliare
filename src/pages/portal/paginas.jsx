import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Wrench, AlertCircle, FileText } from 'lucide-react';
import { pedir, pesos, periodoLegible } from '@/lib/portal';
import { MARCA } from '@/lib/marca';

/**
 * Páginas del portal. Van juntas porque cada una es pequeña y comparten el
 * mismo patrón de carga; separarlas en archivos de 40 líneas sería ruido.
 */

/** Carga una sección y maneja los tres estados. La sesión vencida saca al login. */
function useSeccion(nombre) {
  const navigate = useNavigate();
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const datos = await pedir(nombre);
        if (!cancelado) setEstado({ cargando: false, datos, error: null });
      } catch (err) {
        if (cancelado) return;
        if (err.message === 'sesion_vencida') { navigate('/portal/entrar', { replace: true }); return; }
        setEstado({ cargando: false, datos: null, error: err.message });
      }
    })();
    return () => { cancelado = true; };
  }, [nombre, navigate]);

  return estado;
}

function Envoltura({ titulo, subtitulo, estado, children, vacio }) {
  if (estado.cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (estado.error) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl p-4">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{estado.error}</span>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {titulo && (
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">{titulo}</h1>
          {subtitulo && <p className="text-[14px] text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
      )}
      {vacio ? <p className="text-sm text-muted-foreground py-8 text-center">{vacio}</p> : children}
    </div>
  );
}

const COLOR_ESTADO = {
  Pagado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  Parcial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  Mora: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
};

// ── Inicio ───────────────────────────────────────────────────────────────────

export function PortalInicio() {
  const estado = useSeccion('resumen');
  const d = estado.datos;

  return (
    <Envoltura titulo={d ? `Hola, ${d.nombre || ''}`.trim() : 'Hola'} subtitulo="Tu resumen" estado={estado}>
      {d && (
        <div className="space-y-3">
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-5">
              <p className="text-[13px] text-muted-foreground">
                {d.tipo === 'propietario' ? 'Tus inmuebles en administración' : 'Saldo pendiente'}
              </p>
              {d.tipo !== 'propietario' && (
                <>
                  <p className={`text-[30px] font-bold tracking-tight mt-1 ${d.saldo_total > 0 ? 'text-foreground' : 'text-green-600'}`}>
                    {pesos(d.saldo_total)}
                  </p>
                  {d.saldo_total === 0 && <p className="text-[13px] text-green-600">Estás al día</p>}
                  {d.proximo_vencimiento && (
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Próximo vencimiento: {d.proximo_vencimiento}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <p className="text-[13px] text-muted-foreground px-1">
            ¿Necesitas algo más? Escríbenos por WhatsApp al {MARCA.whatsapp}.
          </p>
        </div>
      )}
    </Envoltura>
  );
}

// ── Estado de cuenta ─────────────────────────────────────────────────────────

export function PortalEstadoCuenta() {
  const estado = useSeccion('estado-cuenta');
  const d = estado.datos;

  return (
    <Envoltura
      titulo="Estado de cuenta"
      estado={estado}
      vacio={d && !d.periodos?.length ? (d.mensaje || 'Todavía no hay movimientos registrados.') : null}
    >
      {d?.periodos?.length > 0 && (
        <div className="space-y-2">
          {d.saldo_total > 0 && (
            <Card className="rounded-2xl border-border/60 bg-muted/30">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="text-[13px] text-muted-foreground">Saldo total</span>
                <span className="text-[18px] font-bold tracking-tight">{pesos(d.saldo_total)}</span>
              </CardContent>
            </Card>
          )}
          {d.periodos.map((p) => (
            <Card key={p.periodo} className="rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-foreground capitalize">{periodoLegible(p.periodo)}</p>
                    <p className="text-[12px] text-muted-foreground">Vence {p.fecha_vencimiento}</p>
                    {p.dias_mora > 0 && (
                      <p className="text-[12px] text-red-600 mt-0.5">{p.dias_mora} días de mora</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[15px] font-semibold">{pesos(p.valor_total)}</p>
                    <Badge className={`text-[10px] mt-1 ${COLOR_ESTADO[p.estado] || ''}`}>{p.estado}</Badge>
                  </div>
                </div>
                {p.saldo > 0 && p.valor_pagado > 0 && (
                  <p className="text-[12px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
                    Abonado {pesos(p.valor_pagado)} · Saldo {pesos(p.saldo)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Envoltura>
  );
}

// ── Pagos / códigos de barras ────────────────────────────────────────────────

export function PortalPagos() {
  const estado = useSeccion('pagos');
  const d = estado.datos;

  return (
    <Envoltura
      titulo="Pagos"
      subtitulo="Tus recibos con código de barras"
      estado={estado}
      vacio={d && !d.codigos?.length ? 'Todavía no hay recibos disponibles.' : null}
    >
      {d?.codigos?.length > 0 && (
        <div className="space-y-2">
          {d.codigos.map((c) => (
            <Card key={c.periodo} className="rounded-2xl border-border/60">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium capitalize">{periodoLegible(c.periodo)}</p>
                  <p className="text-[13px] text-muted-foreground">{pesos(c.valor)}</p>
                </div>
                {c.url_pdf ? (
                  <a
                    href={c.url_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline flex-shrink-0"
                  >
                    <Download className="w-4 h-4" /> Descargar
                  </a>
                ) : (
                  <span className="text-[12px] text-muted-foreground flex-shrink-0">Sin recibo</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Envoltura>
  );
}

// ── Contrato ─────────────────────────────────────────────────────────────────

export function PortalContrato() {
  const estado = useSeccion('contrato');
  const d = estado.datos;

  const filas = d ? [
    ['Inmueble', d.propiedad],
    ['Arrendatario', d.arrendatario],
    ['Canon mensual', pesos(d.canon_mensual)],
    ['Día de pago', d.dia_pago ? `${d.dia_pago} de cada mes` : '—'],
    ['Inicio', d.fecha_inicio],
    ['Vencimiento', d.fecha_fin],
    ['Estado', d.estado],
  ] : [];

  return (
    <Envoltura titulo="Mi contrato" estado={estado} vacio={!d && !estado.cargando ? 'No encontramos un contrato asociado.' : null}>
      {d && (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-0 divide-y divide-border/40">
            {filas.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3">
                <span className="text-[13px] text-muted-foreground flex-shrink-0">{k}</span>
                <span className="text-[13px] font-medium text-right">{v || '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </Envoltura>
  );
}

// ── Reparaciones ─────────────────────────────────────────────────────────────

const COLOR_REPARACION = {
  Reportada: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  Asignada: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  En_Proceso: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  Resuelta: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  Rechazada: 'bg-muted text-muted-foreground',
};

export function PortalReparaciones() {
  const estado = useSeccion('reparaciones');
  const d = estado.datos;

  return (
    <Envoltura
      titulo="Reparaciones"
      estado={estado}
      vacio={d && !d.reparaciones?.length ? 'No tienes reparaciones reportadas.' : null}
    >
      {d?.reparaciones?.length > 0 && (
        <div className="space-y-2">
          {d.reparaciones.map((r) => (
            <Card key={r.id} className="rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium">{r.categoria}</p>
                      <p className="text-[13px] text-muted-foreground">{r.descripcion}</p>
                      <p className="text-[12px] text-muted-foreground mt-1">Reportada {r.fecha_reporte}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] flex-shrink-0 ${COLOR_REPARACION[r.estado] || ''}`}>
                    {String(r.estado).replace('_', ' ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[13px] text-muted-foreground px-1 pt-2">
        ¿Necesitas reportar algo nuevo? Escríbenos por WhatsApp al {MARCA.whatsapp} y adjunta una foto.
      </p>
    </Envoltura>
  );
}

// ── Certificados (propietario) ───────────────────────────────────────────────

/**
 * El certificado anual del propietario.
 *
 * Existe porque el asistente lo entrega por link, y un link tiene que llegar a
 * algo: sin esta página el agente decía "aquí está tu certificado" y el cliente
 * aterrizaba en el inicio del portal sin nada que descargar.
 *
 * Un año sin archivo se muestra igual, con la etiqueta de que no está: es el
 * mismo criterio de Pagos, y esconderlo haría que el propietario que sabe que
 * ese año existe crea que se perdió.
 */
export function PortalCertificados() {
  const estado = useSeccion('certificados');
  const d = estado.datos;

  return (
    <Envoltura
      titulo="Certificados"
      subtitulo="Tus certificados anuales"
      estado={estado}
      vacio={d && !d.certificados?.length ? 'Todavía no hay certificados disponibles.' : null}
    >
      {d?.certificados?.length > 0 && (
        <div className="space-y-2">
          {d.certificados.map((c) => (
            <Card key={c.anio} className="rounded-2xl border-border/60">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-[15px] font-medium">Año {c.anio || '—'}</p>
                </div>
                {c.url_pdf ? (
                  <a
                    href={c.url_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline flex-shrink-0"
                  >
                    <Download className="w-4 h-4" /> Descargar
                  </a>
                ) : (
                  <span className="text-[12px] text-muted-foreground flex-shrink-0">Sin archivo</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Envoltura>
  );
}

// ── Liquidaciones (propietario) ──────────────────────────────────────────────

export function PortalLiquidaciones() {
  const estado = useSeccion('liquidaciones');
  const d = estado.datos;

  return (
    <Envoltura
      titulo="Liquidaciones"
      subtitulo="Lo que te transferimos cada mes"
      estado={estado}
      vacio={d && !d.liquidaciones?.length ? 'Todavía no hay liquidaciones registradas.' : null}
    >
      {d?.liquidaciones?.length > 0 && (
        <div className="space-y-2">
          {d.liquidaciones.map((l) => (
            <Card key={l.periodo} className="rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-medium capitalize">{periodoLegible(l.periodo)}</p>
                  <p className="text-[17px] font-bold tracking-tight">{pesos(l.neto)}</p>
                </div>
                <div className="text-[12px] text-muted-foreground mt-2 pt-2 border-t border-border/40 space-y-0.5">
                  <div className="flex justify-between"><span>Ingresos</span><span>{pesos(l.ingresos_brutos)}</span></div>
                  <div className="flex justify-between"><span>Comisión</span><span>−{pesos(l.comision)}</span></div>
                  {l.descuentos > 0 && (
                    <div className="flex justify-between"><span>Reparaciones</span><span>−{pesos(l.descuentos)}</span></div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Envoltura>
  );
}
