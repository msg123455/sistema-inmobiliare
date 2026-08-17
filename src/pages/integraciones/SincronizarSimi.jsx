import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, AlertTriangle, CheckCircle2, Loader2, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '@/lib/backend';

// La API tarda ~4s de arranque mas ~0,2s por inmueble, y Base44 corta a los 15.
// 30 tarda ~9,3s y deja margen para escribir lo traido; 50 son 14,6s y no cabe
// nada mas. Medido contra la API real, no supuesto.
const POR_PAGINA = 30;

export default function SincronizarSimi() {
  const qc = useQueryClient();

  const [sonda, setSonda] = useState(null);
  const [progreso, setProgreso] = useState(null); // { hechos, total, creados, actualizados }
  const [resultado, setResultado] = useState(null);
  const [corriendo, setCorriendo] = useState(false);

  const probar = async () => {
    setCorriendo(true);
    setResultado(null);
    try {
      const r = await callFunction('sincronizarSimi', { sonda: true });
      setSonda(r);
      toast.success(`SIMI responde: ${r.total_en_simi} inmuebles`);
    } catch (err) {
      setSonda({ error: err.message });
      toast.error(err.message);
    } finally {
      setCorriendo(false);
    }
  };

  const sincronizar = async () => {
    setCorriendo(true);
    setResultado(null);
    const acum = { creados: 0, actualizados: 0, omitidos: 0, errores: [], paginas: 0 };
    let desde = 1;
    let total = sonda?.total_en_simi || 0;

    try {
      // Igual que la importacion por CSV: el backend hace una pagina y devuelve
      // el cursor. Aqui ademas el cursor avanza por lo PROCESADO, asi que si el
      // presupuesto corto a mitad de pagina el resto se retoma solo.
      while (desde !== null) {
        const r = await callFunction('sincronizarSimi', { desde, por_pagina: POR_PAGINA });
        acum.creados += r.creados || 0;
        acum.actualizados += r.actualizados || 0;
        acum.omitidos += r.omitidos || 0;
        acum.paginas += 1;
        if (r.errores?.length) acum.errores.push(...r.errores);
        total = r.total_en_simi || total;
        setProgreso({
          hechos: acum.creados + acum.actualizados + acum.omitidos,
          total,
          creados: acum.creados,
          actualizados: acum.actualizados,
        });
        desde = r.siguiente;
      }
      setResultado(acum);
      qc.invalidateQueries({ queryKey: ['propiedades'] });
      toast.success(`Listo: ${acum.creados} nuevos, ${acum.actualizados} actualizados`);
    } catch (err) {
      toast.error(err.message || 'Falló la sincronización');
      setResultado({ ...acum, error: err.message });
    } finally {
      setCorriendo(false);
    }
  };

  const pct = progreso?.total ? Math.min(100, Math.round((progreso.hechos / progreso.total) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Sincronizar con SIMI</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">
          Trae el inventario directo de la API de SIMI. A diferencia del CSV, incluye alcobas,
          baños, garajes, estrato, fotos y coordenadas.
        </p>
      </div>

      {/* Probar la conexion antes de escribir nada */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Probar la conexión</p>
              <p className="text-xs text-muted-foreground">
                Pide un solo inmueble. No escribe nada.
              </p>
            </div>
            <Button variant="outline" onClick={probar} disabled={corriendo}>
              {corriendo && !progreso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Probar
            </Button>
          </div>

          {sonda?.error && (
            <div className="text-sm bg-destructive/10 rounded-xl p-4">
              <p className="font-medium text-destructive">SIMI no respondió</p>
              <p className="text-muted-foreground break-words">{sonda.error}</p>
            </div>
          )}

          {sonda?.ok && (
            <div className="text-sm bg-muted/40 rounded-xl p-4 space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                {sonda.total_en_simi?.toLocaleString('es-CO')} inmuebles en SIMI
                <span className="text-muted-foreground font-normal">· {sonda.ms} ms</span>
              </p>
              {sonda.ejemplo && (
                <p className="text-muted-foreground text-xs">
                  Ejemplo: {sonda.ejemplo.titulo} — {sonda.ejemplo.habitaciones} alcobas,{' '}
                  {sonda.ejemplo.banos} baños, estrato {sonda.ejemplo.estrato}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sincronizacion */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Traer todo el inventario</p>
              <p className="text-xs text-muted-foreground">
                En tandas de {POR_PAGINA}. Con ~2.700 inmuebles tarda unos 17 minutos.
                No cierres la pestaña. El total de propiedades casi no va a subir:
                los inmuebles ya están, lo que entra ahora son sus alcobas, baños,
                fotos y coordenadas.
              </p>
            </div>
            <Button onClick={sincronizar} disabled={corriendo}>
              {corriendo && progreso ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar
            </Button>
          </div>

          {progreso && (
            <div className="space-y-1.5">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              {/* Se desglosa mientras corre, no solo al final. Casi todo el
                  inventario ya existe, asi que lo normal es que "creados" se
                  quede en cero y solo suba "actualizados": sin este desglose
                  parece que no esta pasando nada, porque el numero de
                  propiedades de la tabla efectivamente no se mueve. */}
              <p className="text-xs text-muted-foreground">
                {progreso.hechos.toLocaleString('es-CO')} de {progreso.total.toLocaleString('es-CO')} · {pct}%
                {' · '}
                {progreso.creados.toLocaleString('es-CO')} nuevos,{' '}
                {progreso.actualizados.toLocaleString('es-CO')} enriquecidos
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              {resultado.error
                ? <AlertTriangle className="w-4 h-4 text-destructive" />
                : <CheckCircle2 className="w-4 h-4 text-green-600" />}
              <h2 className="text-sm font-semibold">
                {resultado.error ? 'La sincronización se interrumpió' : 'Sincronización completa'}
              </h2>
            </div>

            {/* Si murio a mitad, decir en que estado quedo: lo escrito se
                conserva y volver a correr retoma, no duplica. */}
            {!!resultado.error && (
              <div className="text-sm bg-destructive/10 rounded-xl p-4 space-y-1">
                <p className="text-muted-foreground break-words">{resultado.error}</p>
                <p className="text-muted-foreground">
                  Lo que alcanzó a entrar quedó guardado. Vuelve a darle a Sincronizar
                  y retoma sin duplicar.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[
                { n: resultado.creados, l: 'creados' },
                { n: resultado.actualizados, l: 'actualizados' },
                { n: resultado.omitidos, l: 'omitidos (sin código)' },
              ].map((x) => (
                <div key={x.l} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-[22px] font-bold tracking-tight text-foreground">
                    {x.n?.toLocaleString('es-CO')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{x.l}</p>
                </div>
              ))}
            </div>

            {!!resultado.errores?.length && (
              <div className="text-xs bg-destructive/10 rounded-lg p-3 space-y-1">
                <p className="font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> {resultado.errores.length} con error
                </p>
                <ul className="text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                  {resultado.errores.slice(0, 20).map((e, i) => (
                    <li key={i} className="font-mono text-[11px]">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
