import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileSpreadsheet, Loader2, ShieldCheck, AlertTriangle, PlayCircle, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { parsearCSV, filasAObjetos } from '@/lib/csv';
import { callFunction, FUNCIONES } from '@/lib/backend';
import { compararConEnviado, conciliar, construirDirectorio } from '@/lib/conciliar';
import { EncabezadoModulo, Metrica } from '@/components/modulo';

/**
 * Ensayo: correr la automatizacion sobre un mes YA enviado y comparar.
 *
 * Sirve para dos cosas, y la segunda importa mas que la primera:
 *
 *   1. Ensenarle a alguien como funciona sin arriesgar nada.
 *   2. Comprobarlo de verdad. Un mes ya enviado tiene RESPUESTA CORRECTA —el
 *      CSV con la columna Archivo llena—, asi que no hay que creerle al sistema:
 *      se compara contra lo que de verdad recibio cada inquilino.
 *
 * NO ESCRIBE NADA. Solo lee la carpeta de Mailchimp y el CSV que se suba. No
 * toca audiencias, no crea campanas y no manda correo.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function Fila({ etiqueta, valor, bien, mal }) {
  const tono = mal ? 'text-destructive' : bien ? 'text-green-600 dark:text-green-400' : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{etiqueta}</span>
      <span className={`text-sm font-semibold tabular ${tono}`}>{valor}</span>
    </div>
  );
}

export default function EnsayoCodigos() {
  const refCsv = useRef(null);
  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState(8);
  const [filas, setFilas] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const [fase, setFase] = useState('');
  const [res, setRes] = useState(null);

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  const leer = async (file) => {
    if (!file) return;
    try {
      const { filas: fs } = filasAObjetos(parsearCSV(await file.text()));
      const utiles = fs.filter((r) => r.Nombre || r.Correo || r.Archivo);
      if (!utiles.length) { toast.error('Ese archivo no tiene filas con datos'); return; }
      if (!utiles.some((r) => r.Archivo)) {
        toast.error('Ese CSV no trae la columna Archivo. Para el ensayo hace falta un mes YA enviado.');
        return;
      }
      setFilas(utiles); setRes(null);
      toast.success(`${utiles.length} filas leídas`);
    } catch (e) { toast.error(`No se pudo leer: ${e.message}`); }
  };

  const correr = async () => {
    setCorriendo(true); setRes(null);
    try {
      // 1. Lo que hay en Mailchimp, tal como lo veria el proceso real.
      setFase('Leyendo la carpeta de Mailchimp');
      let desde = 0; let vueltas = 0; const archivos = []; let carpeta = null;
      while (desde !== null && vueltas < 16) {
        const r = await callFunction(FUNCIONES.codigos, { modo: 'indexarMes', periodo, desde });
        carpeta = r.carpeta;
        archivos.push(...(r.encontrados || []).map((x) => ({ nombre: x.archivo, url: x.url })));
        setFase(`Leyendo Mailchimp… ${archivos.length} códigos`);
        desde = r.siguiente; vueltas++;
      }

      // 2. El listado del mes SIN las URLs: asi es como llega de verdad.
      setFase('Conciliando');
      const listado = filas.map(({ Id, Nombre, Correo }) => ({ Id, Nombre, Correo }));
      const { entradas: directorio } = construirDirectorio(filas);
      const conc = conciliar({ archivos, directorio, listado, opciones: { mesEsperado: mes } });

      // 3. La parte que no se puede hacer con un mes nuevo: comparar contra la
      //    respuesta correcta.
      const comp = compararConEnviado(conc.emparejados, filas);
      setRes({ carpeta, archivos: archivos.length, conc, comp });

      if (comp.resumen.conUrlDistinta === 0) toast.success('Ensayo limpio: ninguna URL difiere');
      else toast.error(`${comp.resumen.conUrlDistinta} URL no coinciden`);
    } catch (e) {
      toast.error(e.message);
      setRes({ error: e.message });
    } finally { setCorriendo(false); setFase(''); }
  };

  const c = res?.comp?.resumen;
  const perfecto = c && c.conUrlDistinta === 0 && c.sinCorrespondencia === 0;

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Ensayo con un mes ya enviado"
        resumen="Corre la automatización sobre un mes que ya salió y compara contra lo que de verdad recibió cada inquilino."
      />

      <div className="flex items-start gap-2.5 text-sm bg-muted/50 rounded-xl p-4">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
        <div>
          <p className="font-medium">No escribe nada</p>
          <p className="text-muted-foreground mt-0.5">
            Solo lee la carpeta de Mailchimp y el archivo que subas. No toca audiencias, no crea
            campañas y no envía correo a nadie.
          </p>
        </div>
      </div>

      {/* Mes y archivo */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground">Mes ya enviado:</span>
            <select value={mes} onChange={(e) => { setMes(Number(e.target.value)); setRes(null); }}
                    className="bg-muted rounded-md px-2 py-1 text-sm">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setRes(null); }}
                   className="bg-muted rounded-md px-2 py-1 w-24 text-sm" />
            <span className="text-xs text-muted-foreground">
              → carpeta «{MESES[mes - 1]} {anio}» en Mailchimp
            </span>
          </div>

          <input ref={refCsv} type="file" accept=".csv,.tsv,.txt" className="hidden"
                 onChange={(e) => leer(e.target.files?.[0])} />
          <div onClick={() => refCsv.current?.click()}
               className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <FileSpreadsheet className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {filas ? `${filas.length} filas cargadas` : 'Sube el CSV de ese mes, con la columna Archivo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Es el que ya tiene las URL. De ahí sale la respuesta correcta con la que comparar.
            </p>
          </div>

          <Button disabled={!filas || corriendo} onClick={correr} className="rounded-lg gap-1.5">
            {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Correr el ensayo
          </Button>
          {corriendo && <p className="text-xs text-muted-foreground">{fase}…</p>}
        </CardContent>
      </Card>

      {res?.error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="break-words">{res.error}</span>
        </div>
      )}

      {res && !res.error && (
        <>
          {/* Lo que hizo */}
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-5 space-y-3">
              <h2 className="text-sm font-semibold">Lo que hizo el sistema, solo</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metrica etiqueta="códigos en Mailchimp" valor={res.archivos} />
                <Metrica etiqueta="filas del listado" valor={filas.length} />
                <Metrica etiqueta="emparejados" valor={res.conc.resumen.emparejados} tono="exito" />
                <Metrica etiqueta="bloqueos" valor={res.conc.bloqueos.length}
                         tono={res.conc.bloqueos.length ? 'peligro' : 'exito'} />
              </div>
              <p className="text-xs text-muted-foreground">
                Carpeta «{res.carpeta?.nombre}» · verificación por posición: {res.conc.senales.verificacionPorPosicion}
              </p>
              {Object.entries(res.conc.excepciones).filter(([, v]) => v.length).map(([k, v]) => (
                <p key={k} className="text-xs text-muted-foreground">· {k}: {v.length}</p>
              ))}
            </CardContent>
          </Card>

          {/* El veredicto */}
          <Card className={`rounded-2xl ${perfecto ? 'border-green-600/50' : 'border-amber-500/50'}`}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">Comparado con lo que de verdad se envió</h2>
                <Badge variant={perfecto ? 'default' : 'secondary'} className="text-[11px]">
                  {perfecto ? 'sin diferencias' : 'revisar'}
                </Badge>
              </div>

              <div className="rounded-xl bg-muted/40 px-4 py-2">
                <Fila etiqueta="Códigos que se enviaron en ese mes" valor={c.enviadosDeVerdad} />
                <Fila etiqueta="Emparejados por el sistema" valor={c.emparejadosPorElSistema} />
                <Fila etiqueta="Idénticos al envío real" valor={c.identicos} bien />
                <Fila etiqueta="Con URL distinta" valor={c.conUrlDistinta} bien={!c.conUrlDistinta} mal={!!c.conUrlDistinta} />
                <Fila etiqueta="Con correo distinto" valor={c.conCorreoDistinto} />
                <Fila etiqueta="Sin correspondencia" valor={c.sinCorrespondencia} bien={!c.sinCorrespondencia} mal={!!c.sinCorrespondencia} />
              </div>

              {c.conUrlDistinta === 0 && (
                <div className="flex items-start gap-2 text-sm bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg p-3">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Ninguna URL difiere. El sistema le asignó a cada inquilino exactamente el mismo
                    código de barras que se le mandó a mano, uno por uno.
                  </span>
                </div>
              )}

              {/* Las diferencias de correo suelen ser el sistema acertando donde
                  el envio manual fallo, asi que se muestran enteras. */}
              {res.comp.correoDistinto.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Diferencias de destinatario</p>
                  <p className="text-xs text-muted-foreground">
                    El sistema propone un correo distinto al que se usó. Vale la pena mirarlas: en
                    agosto, la diferencia era que el envío manual le mandó el recibo de un cliente a
                    un empleado.
                  </p>
                  <div className="space-y-2">
                    {res.comp.correoDistinto.map((x) => (
                      <div key={x.clave} className="text-xs rounded-lg bg-muted/50 p-3">
                        <p className="font-medium mb-1">Contrato {x.codigo} · {x.nombre}</p>
                        <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                          <span className="line-through">{x.correoEnviado}</span>
                          <ArrowRight className="w-3 h-3" />
                          <span className="text-foreground font-medium">{x.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {res.comp.urlDistinta.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">URL que no coinciden</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                    {res.comp.urlDistinta.map((x) => (
                      <li key={x.clave}>contrato {x.codigo} · {x.nombre}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
