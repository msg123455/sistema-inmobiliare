import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileSpreadsheet, Loader2, ShieldCheck, AlertTriangle, PlayCircle, Download, ArrowRight,
  HardDrive, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { parsearCSV, filasAObjetos } from '@/lib/csv';
import { callFunction, FUNCIONES } from '@/lib/backend';
import { aCSV, construirDirectorio, rellenarLinks } from '@/lib/conciliar';
import { EncabezadoModulo, Metrica } from '@/components/modulo';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

/**
 * Ensayo: subir el listado sin links y recuperarlo con los links puestos.
 *
 * Es la demostracion de lo que hace la automatizacion, en una sola pantalla:
 * entra el Excel del mes tal como llega —sin la columna Archivo— y sale con
 * cada inquilino junto a su codigo de barras. Las seiscientas copias manuales,
 * hechas de una vez.
 *
 * Se puede ensenar sin miedo porque NO ESCRIBE NADA: lee la carpeta del mes en
 * Mailchimp y el archivo que se suba, y devuelve un CSV. No toca audiencias, no
 * crea campanas, y en todo el sistema no existe una linea capaz de mandar un
 * correo.
 *
 * Si el archivo que se sube YA trae los links —el de un mes ya enviado— se
 * aprovecha para comprobarlo: se comparan los que propone el sistema contra los
 * que de verdad recibio cada inquilino. Sobre agosto: 592 de 592 identicos.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function EnsayoCodigos() {
  const refCsv = useRef(null);
  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState(8);
  const [entrada, setEntrada] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const [fase, setFase] = useState('');
  const [res, setRes] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const drive = useGoogleDrive();

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  const leer = async (file) => {
    if (!file) return;
    try {
      const { filas } = filasAObjetos(parsearCSV(await file.text()));
      const utiles = filas.filter((r) => r.Id || r.Nombre || r.Correo);
      if (!utiles.length) { toast.error('Ese archivo no tiene filas con datos'); return; }
      setEntrada({ nombre: file.name, filas: utiles, traeLinks: utiles.some((r) => r.Archivo) });
      setRes(null);
      toast.success(`${utiles.length} filas leídas`);
    } catch (e) { toast.error(`No se pudo leer: ${e.message}`); }
  };

  const correr = async () => {
    setCorriendo(true); setRes(null);
    try {
      setFase('Leyendo la carpeta del mes en Mailchimp');
      let desde = 0; let vueltas = 0; const archivos = []; let carpeta = null;
      while (desde !== null && vueltas < 16) {
        const r = await callFunction(FUNCIONES.codigos, { modo: 'indexarMes', periodo, desde });
        carpeta = r.carpeta;
        archivos.push(...(r.encontrados || []));
        setFase(`Leyendo Mailchimp… ${archivos.length} códigos encontrados`);
        desde = r.siguiente; vueltas++;
      }

      setFase('Emparejando');
      // Si el archivo trae links, sirven de segunda llave. Si no, se empareja
      // solo por orden, que es lo que ocurre con un mes de verdad.
      const directorio = entrada.traeLinks ? construirDirectorio(entrada.filas).entradas : [];
      const out = rellenarLinks({ filas: entrada.filas, archivos, directorio });

      // Comprobacion, solo posible con un mes ya enviado.
      let verif = null;
      if (out.ok && entrada.traeLinks) {
        let iguales = 0; const distintos = [];
        for (const f of out.filas) {
          const real = String(entrada.filas.find((r) => String(r.Id).trim() === f.documento && r.Archivo)?.Archivo || '');
          if (!real) continue;
          if (real === f.url) iguales++; else distintos.push(f);
        }
        verif = { iguales, distintos };
      }

      setRes({ carpeta, archivos: archivos.length, out, verif });
      if (!out.ok) toast.error(out.mensaje);
      else toast.success(`${out.resumen.conLink} inquilinos con su link`);
    } catch (e) {
      toast.error(e.message);
      setRes({ error: e.message });
    } finally { setCorriendo(false); setFase(''); }
  };

  const nombreArchivo = `codigos-${periodo}-con-links`;

  const descargar = () => {
    const csv = aCSV(res.out.filas);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${nombreArchivo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Descargado');
  };

  /**
   * Sube el MISMO CSV que descarga el boton de al lado. El BOM lo quita la
   * funcion backend: aqui hace falta para que Excel respete los acentos, y solo
   * estorba al convertir a Sheets.
   *
   * El enlace resultante se guarda DENTRO de `res`, no en un estado aparte: hay
   * cuatro sitios que hacen setRes(null) y olvidar uno dejaria en pantalla un
   * enlace a la hoja del mes anterior.
   */
  const subirADrive = async () => {
    setSubiendo(true);
    try {
      if (!drive.conectado) {
        const quedo = await drive.conectar();
        if (!quedo) { toast.error('No quedó conectado. Inténtalo otra vez.'); return; }
      }
      const r = await drive.subirCsvComoHoja({ csv: aCSV(res.out.filas), nombre: nombreArchivo });
      if (!r.ok) { toast.error(r.detalle ? `${r.mensaje} (${r.detalle})` : r.mensaje); return; }
      setRes((prev) => ({ ...prev, hoja: r }));
      toast.success(r.creado ? 'Hoja creada en tu Drive' : 'Hoja actualizada en tu Drive');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const r = res?.out;

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Ensayo: el listado con los links puestos"
        resumen="Sube el Excel del mes sin la columna de links y descárgalo con el código de barras de cada inquilino ya asignado."
      />

      <div className="flex items-start gap-2.5 text-sm bg-muted/50 rounded-xl p-4">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
        <div>
          <p className="font-medium">Se puede enseñar sin miedo</p>
          <p className="text-muted-foreground mt-0.5">
            Solo lee la carpeta de Mailchimp y el archivo que subas, y te devuelve un CSV. No toca
            audiencias, no crea campañas, y no le llega nada a ningún inquilino.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground">Mes:</span>
            <select value={mes} onChange={(e) => { setMes(Number(e.target.value)); setRes(null); }}
                    className="bg-muted rounded-md px-2 py-1 text-sm">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setRes(null); }}
                   className="bg-muted rounded-md px-2 py-1 w-24 text-sm" />
            <span className="text-xs text-muted-foreground">
              → carpeta «{MESES[mes - 1]} {anio}» de Mailchimp
            </span>
          </div>

          <input ref={refCsv} type="file" accept=".csv,.tsv,.txt" className="hidden"
                 onChange={(e) => leer(e.target.files?.[0])} />
          <div onClick={() => refCsv.current?.click()}
               className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <FileSpreadsheet className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {entrada ? entrada.nombre : 'Sube el listado de inquilinos (CSV)'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {entrada
                ? `${entrada.filas.length} filas${entrada.traeLinks ? ' · trae links, se usarán para comprobar el resultado' : ' · sin links'}`
                : 'Desde Excel: Archivo → Descargar → CSV'}
            </p>
          </div>

          <Button disabled={!entrada || corriendo} onClick={correr} className="rounded-lg gap-1.5">
            {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Poner los links
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

      {r && !r.ok && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/10 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No se puede emparejar</p>
            <p className="mt-1">{r.mensaje}</p>
          </div>
        </div>
      )}

      {r?.ok && (
        <>
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metrica etiqueta="códigos en la carpeta" valor={res.archivos} />
                <Metrica etiqueta="inquilinos con link" valor={r.resumen.conLink} tono="exito" />
                <Metrica etiqueta="filas sin cédula" valor={r.resumen.descartadasSinCedula} />
                <Metrica etiqueta="discrepancias" valor={r.resumen.discrepan}
                         tono={r.resumen.discrepan ? 'peligro' : 'exito'} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={descargar} variant="outline" className="rounded-lg gap-1.5">
                  <Download className="w-4 h-4" /> Descargar
                </Button>

                <Button
                  onClick={subirADrive}
                  disabled={subiendo || drive.sesion === false || drive.sesion === null}
                  className="rounded-lg gap-1.5"
                >
                  {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                  {subiendo ? 'Subiendo…'
                    : drive.conectado ? 'Subir a Google Drive'
                      : 'Conectar Drive y subir'}
                </Button>

                {drive.sesion === false && (
                  <span className="text-xs text-muted-foreground">
                    Inicia sesión para subir a tu Drive
                  </span>
                )}
              </div>

              {res.hoja && (
                <div className="flex items-start gap-2 text-sm bg-primary/10 rounded-lg p-3">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {res.hoja.creado ? 'Hoja creada' : 'Hoja actualizada'}
                      {res.hoja.carpeta ? ` en «${res.hoja.carpeta}»` : ' en la raíz de tu Drive'}
                    </p>
                    <a href={res.hoja.url} target="_blank" rel="noreferrer noopener"
                       className="text-primary hover:underline inline-flex items-center gap-1 mt-0.5 presionable">
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir en Google Sheets
                    </a>
                  </div>
                </div>
              )}

              {res.verif && (
                <div className={`flex items-start gap-2 text-sm rounded-lg p-3
                  ${res.verif.distintos.length ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700 dark:text-green-400'}`}>
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {res.verif.distintos.length === 0
                      ? `Comprobado: los ${res.verif.iguales} links que puso el sistema son exactamente
                         los mismos que se enviaron a mano ese mes. Ni una diferencia.`
                      : `${res.verif.distintos.length} links no coinciden con los que se enviaron.`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* La tabla es la demostracion: se ve el nombre, el correo y su link. */}
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">Así queda el listado</h2>
                <Badge variant="secondary" className="text-[11px]">
                  primeras 25 de {r.filas.length}
                </Badge>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs min-w-[38rem]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Cédula / NIT</th>
                      <th className="text-left px-3 py-2 font-medium">Nombre</th>
                      <th className="text-left px-3 py-2 font-medium">Correo</th>
                      <th className="text-left px-3 py-2 font-medium">Código de barras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.filas.slice(0, 25).map((f) => (
                      <tr key={`${f.documento}-${f.contrato}`} className="border-t border-border/40">
                        <td className="px-3 py-1.5 tabular">{f.documento}</td>
                        <td className="px-3 py-1.5 truncate max-w-[15rem]">{f.nombre}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[14rem]">{f.email}</td>
                        <td className="px-3 py-1.5">
                          <a href={f.url} target="_blank" rel="noreferrer noopener"
                             className="text-primary hover:underline inline-flex items-center gap-1">
                            {f.archivo} <ArrowRight className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Abre cualquiera: es el código de barras de ese inquilino, ya emparejado.
              </p>
            </CardContent>
          </Card>

          {(r.sinCedula.length > 0 || r.sinCorreo.length > 0 || r.correoInvalido.length > 0) && (
            <Card className="rounded-2xl border-border/60">
              <CardContent className="p-5 space-y-2 text-xs">
                <h2 className="text-sm font-semibold">Lo que quedó fuera</h2>
                {r.sinCedula.length > 0 && (
                  <p className="text-muted-foreground">
                    <strong>{r.sinCedula.length} filas sin cédula</strong> — se descartan porque no son
                    inquilinos. En agosto eran cuatro empleados añadidos al final del listado.
                  </p>
                )}
                {r.sinCorreo.length > 0 && (
                  <p className="text-muted-foreground">
                    <strong>{r.sinCorreo.length} sin correo</strong> — tienen su link, pero no hay a dónde mandárselo.
                  </p>
                )}
                {r.correoInvalido.length > 0 && (
                  <p className="text-muted-foreground">
                    <strong>{r.correoInvalido.length} con correo inválido</strong>:{' '}
                    {r.correoInvalido.map((x) => x.email).join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
