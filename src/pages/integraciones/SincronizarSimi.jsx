import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshCw, AlertTriangle, CheckCircle2, Loader2, Radio, Trash2, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '@/lib/backend';

// Tamano de pagina. El listado de SIMI tarda 7,8s con 20 y 14,2s con 50, y
// Base44 corta la funcion a los 15: con 50 no queda margen para traer el
// detalle de cada inmueble ni para escribir. Medido, no supuesto.
const POR_PAGINA = 20;

// La misma frase que exige el backend. Se escribe a mano para borrar.
const FRASE = 'BORRAR TODO';

export default function SincronizarSimi() {
  const qc = useQueryClient();

  const [sonda, setSonda] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(null);
  const [esquema, setEsquema] = useState(null);

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

  // Escribe una fila de mentira, la relee y la borra. Es la unica forma de
  // saber que campos acepta Base44: mirar una fila existente da falso negativo
  // porque las filas viejas no tienen los campos nuevos aunque el esquema si.
  const revisarEsquema = async () => {
    setCorriendo(true);
    try {
      const r = await callFunction('sincronizarSimi', { diagnostico: true });
      setEsquema(r);
      if (r.listo) toast.success('Propiedad tiene todos los campos');
      else toast.error(`Faltan ${(r.faltan?.length || 0) + (r.faltan_portales?.length || 0)} campos`);
    } catch (err) {
      setEsquema({ error: err.message });
      toast.error(err.message);
    } finally {
      setCorriendo(false);
    }
  };

  // Recorre el catalogo pagina por pagina. El backend devuelve el numero de la
  // siguiente, o null cuando llego al final.
  const sincronizar = async () => {
    setCorriendo(true);
    setResultado(null);
    const acum = { creados: 0, actualizados: 0, omitidos: 0, detalles_ok: 0, detalles_fallidos: 0, errores: [], paginas: 0 };
    let pagina = 1;
    let total = sonda?.total_en_simi || 0;

    try {
      while (pagina !== null) {
        const r = await callFunction('sincronizarSimi', { pagina, por_pagina: POR_PAGINA });
        acum.creados += r.creados || 0;
        acum.actualizados += r.actualizados || 0;
        acum.omitidos += r.omitidos || 0;
        acum.detalles_ok += r.detalles_ok || 0;
        acum.detalles_fallidos += r.detalles_fallidos || 0;
        acum.paginas += 1;
        if (r.errores?.length) acum.errores.push(...r.errores);
        total = r.total_en_simi || total;
        setProgreso({
          hechos: acum.creados + acum.actualizados + acum.omitidos,
          total,
          creados: acum.creados,
          actualizados: acum.actualizados,
          conDetalle: acum.detalles_ok,
        });
        pagina = r.siguiente;
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

  // Vacia el catalogo y lo vuelve a traer. El borrado va por tandas porque
  // 2.700 DELETE no caben en una sola llamada.
  const reconstruir = async () => {
    if (confirmacion !== FRASE) return;
    setCorriendo(true);
    setResultado(null);
    setBorrando({ borrados: 0 });

    try {
      let borrados = 0;
      for (;;) {
        const r = await callFunction('sincronizarSimi', { borrar: true, confirmar: FRASE });
        borrados += r.borrados || 0;
        setBorrando({ borrados });
        if (r.error) throw new Error(r.error);
        // `quedan` lo responde el backend preguntando de nuevo, no deduciendolo:
        // si un DELETE fallara en silencio, esto no daria por terminado el
        // borrado.
        if (r.completado || (!r.borrados && !r.quedan)) break;
        if (!r.borrados) throw new Error('El borrado dejó de avanzar. Revisa los errores.');
      }
      toast.success(`Catálogo vaciado: ${borrados} eliminados. Trayendo de SIMI…`);
      setBorrando(null);
      setConfirmacion('');
      await sincronizar();
    } catch (err) {
      toast.error(err.message || 'Falló el borrado');
      setResultado({ error: err.message, creados: 0, actualizados: 0, omitidos: 0, errores: [] });
      setBorrando(null);
      setCorriendo(false);
    }
  };

  const pct = progreso?.total ? Math.min(100, Math.round((progreso.hechos / progreso.total) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Sincronizar con SIMI</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">
          SIMI es la única fuente del inventario. Cada inmueble se trae dos veces: del
          listado salen precio, alcobas y baños; del detalle, la dirección, todas las
          fotos y los links de portales.
        </p>
      </div>

      {/* Probar la conexion antes de escribir nada */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Probar la conexión</p>
              <p className="text-xs text-muted-foreground">
                Pide un inmueble y su detalle. No escribe nada.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={revisarEsquema} disabled={corriendo}>
                <ClipboardCheck className="w-4 h-4" />
                Revisar campos
              </Button>
              <Button variant="outline" onClick={probar} disabled={corriendo}>
                {corriendo && !progreso && !borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                Probar
              </Button>
            </div>
          </div>

          {/* El resultado de la sonda de esquema. Se muestra el nombre exacto
              de cada campo que falta para poder copiarlo tal cual en Base44. */}
          {esquema && (
            <div className={`text-sm rounded-xl p-4 space-y-1 ${esquema.listo ? 'bg-muted/40' : 'bg-destructive/10'}`}>
              {esquema.error ? (
                <p className="text-muted-foreground break-words">{esquema.error}</p>
              ) : esquema.listo ? (
                <p className="font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Propiedad tiene todos los campos.
                </p>
              ) : (
                <>
                  <p className="font-medium text-destructive">
                    Base44 descartó estos campos porque no existen en Propiedad
                  </p>
                  {!!esquema.faltan?.length && (
                    <p className="text-muted-foreground">
                      Sueltos: <span className="font-mono text-xs">{esquema.faltan.join(', ')}</span>
                    </p>
                  )}
                  {!!esquema.faltan_portales?.length && (
                    <p className="text-muted-foreground">
                      Dentro de <span className="font-mono text-xs">portales</span>:{' '}
                      <span className="font-mono text-xs">{esquema.faltan_portales.join(', ')}</span>
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Créalos en Datos &gt; Propiedad y vuelve a revisar. Mientras falten, esos
                    datos se pierden al sincronizar sin que aparezca ningún error.
                  </p>
                </>
              )}
            </div>
          )}

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
              {/* Que el listado responda no basta: sin el detalle no hay
                  direccion ni links, que es lo que el agente le manda al cliente. */}
              <p className={`text-xs ${sonda.detalle_ok ? 'text-muted-foreground' : 'text-destructive font-medium'}`}>
                {sonda.detalle_ok
                  ? 'El detalle también responde: hay dirección, fotos y links.'
                  : 'El listado responde pero el DETALLE no. Sin él los inmuebles entran sin dirección y sin links.'}
              </p>
              {sonda.ejemplo && (
                <p className="text-muted-foreground text-xs">
                  Ejemplo: {sonda.ejemplo.titulo} — {sonda.ejemplo.direccion || 'sin dirección'} ·{' '}
                  {sonda.ejemplo.habitaciones} alcobas, {sonda.ejemplo.banos} baños ·{' '}
                  {sonda.ejemplo.fotos?.length || 0} fotos
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
                En páginas de {POR_PAGINA}. Con ~2.700 inmuebles tarda unos 25 minutos.
                No cierres la pestaña: lo que entra queda guardado y volver a darle retoma
                desde el principio sin duplicar.
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
              {/* Se desglosa mientras corre. Si el catalogo ya estaba cargado,
                  "creados" se queda en cero y solo sube "actualizados": sin este
                  detalle parece que no pasa nada, porque el total de propiedades
                  efectivamente no se mueve. */}
              <p className="text-xs text-muted-foreground">
                {progreso.hechos.toLocaleString('es-CO')} de {progreso.total.toLocaleString('es-CO')} · {pct}%
                {' · '}
                {progreso.creados.toLocaleString('es-CO')} nuevos,{' '}
                {progreso.actualizados.toLocaleString('es-CO')} actualizados,{' '}
                {progreso.conDetalle.toLocaleString('es-CO')} con dirección y links
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconstruir desde cero */}
      <Card className="rounded-2xl border-destructive/40">
        <CardContent className="p-5 space-y-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-destructive" />
              Reconstruir desde cero
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Borra todas las propiedades y las vuelve a traer de SIMI. Úsalo si el
              catálogo quedó inconsistente y prefieres rehacerlo antes que reconciliarlo.
            </p>
          </div>

          <div className="text-xs bg-destructive/10 rounded-xl p-4 space-y-1.5">
            <p className="font-medium text-destructive">Esto no se puede deshacer.</p>
            <ul className="text-muted-foreground space-y-1 list-disc pl-4">
              <li>
                Las propiedades se vuelven a crear con <strong>id nuevo</strong>. Las visitas,
                los contratos y las campañas que apunten a una propiedad quedan apuntando a
                un id que ya no existe.
              </li>
              <li>
                Se pierde lo que se haya escrito a mano dentro de la app y SIMI no manda:
                el <strong>link de la web propia</strong> y el <strong>link de Instagram</strong>.
                La dirección y los links de portales sí los repone SIMI.
              </li>
              <li>
                Tarda lo mismo que una sincronización completa, unos 25 minutos.
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              placeholder={`Escribe ${FRASE} para habilitar`}
              className="max-w-[260px] font-mono text-sm"
              disabled={corriendo}
            />
            <Button
              variant="destructive"
              onClick={reconstruir}
              disabled={corriendo || confirmacion !== FRASE}
            >
              {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Borrar y traer de nuevo
            </Button>
          </div>

          {borrando && (
            <p className="text-xs text-muted-foreground">
              Borrando… {borrando.borrados.toLocaleString('es-CO')} eliminados
            </p>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { n: resultado.creados, l: 'creados' },
                { n: resultado.actualizados, l: 'actualizados' },
                { n: resultado.detalles_ok, l: 'con dirección y links' },
                { n: resultado.detalles_fallidos, l: 'sin detalle' },
              ].map((x) => (
                <div key={x.l} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-[22px] font-bold tracking-tight text-foreground">
                    {(x.n || 0).toLocaleString('es-CO')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{x.l}</p>
                </div>
              ))}
            </div>

            {/* Un inmueble sin detalle existe en el catalogo pero sin direccion
                ni links, y el agente lo ofreceria igual. Conviene verlo. */}
            {!!resultado.detalles_fallidos && (
              <p className="text-xs text-muted-foreground">
                {resultado.detalles_fallidos.toLocaleString('es-CO')} inmuebles entraron sin
                dirección ni links porque SIMI no devolvió su detalle. Vuelve a sincronizar
                más tarde para completarlos.
              </p>
            )}

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
