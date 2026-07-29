import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { parsearCSV, filasAObjetos } from '@/lib/csv';
import { callFunction } from '@/lib/backend';

// Columnas que el importador sabe leer. Se muestran para que quien sube el
// archivo vea de una si su export trae lo necesario, en vez de descubrirlo
// cuando la importacion ya escribio a medias.
const COLUMNAS_ESPERADAS = [
  { nombre: 'Cod', requerida: true, nota: 'clave para no duplicar' },
  { nombre: 'Direccion', requerida: false },
  { nombre: 'Gestion', requerida: false, nota: 'Venta / Arriendo' },
  { nombre: 'ValorVenta', requerida: false },
  { nombre: 'ValorCanon', requerida: false },
  { nombre: 'Administracion', requerida: false },
  { nombre: 'Tipoinmueble', requerida: false },
  { nombre: 'Estado', requerida: false },
  { nombre: 'Barrio', requerida: false },
  { nombre: 'Zona', requerida: false },
  { nombre: 'Ciudad', requerida: false },
  { nombre: 'Procedencia', requerida: false },
  { nombre: 'METROCUADRADO', requerida: false },
  { nombre: 'FINCARAIZ', requerida: false },
  { nombre: 'MERCADOLIBRE', requerida: false },
];

const normalizar = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]/g, '');

export default function ImportarInventario() {
  const qc = useQueryClient();
  const inputRef = useRef(null);

  const [archivo, setArchivo] = useState(null);
  const [columnas, setColumnas] = useState([]);
  const [filas, setFilas] = useState([]);
  const [progreso, setProgreso] = useState(null); // { hechas, total }
  const [resultado, setResultado] = useState(null);
  const [corriendo, setCorriendo] = useState(false);

  const leerArchivo = async (file) => {
    if (!file) return;
    setResultado(null);
    setProgreso(null);
    try {
      const texto = await file.text();
      const matriz = parsearCSV(texto);
      const { columnas: cols, filas: fs } = filasAObjetos(matriz);
      if (!fs.length) { toast.error('El archivo no tiene filas de datos'); return; }
      setArchivo(file);
      setColumnas(cols);
      setFilas(fs);
      toast.success(`${fs.length} filas leídas`);
    } catch (err) {
      toast.error(`No se pudo leer el archivo: ${err.message}`);
    }
  };

  // Una columna esperada esta presente si alguna del archivo coincide ignorando
  // acentos, mayusculas y espacios.
  const tieneColumna = (esperada) => columnas.some((c) => normalizar(c) === normalizar(esperada));
  const faltaRequerida = COLUMNAS_ESPERADAS.filter((c) => c.requerida && !tieneColumna(c.nombre));

  const ejecutar = async (simular) => {
    if (!filas.length) return;
    setCorriendo(true);
    setResultado(null);
    const acum = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };
    let desde = 0;

    try {
      // Se manda por lotes porque las funciones de Base44 cortan a los ~15s.
      // El backend devuelve el cursor del siguiente lote.
      while (desde !== null) {
        setProgreso({ hechas: desde, total: filas.length });
        const r = await callFunction('importarInventario', {
          filas, proveedor: 'simi', desde, simular,
        });
        acum.creados += r.creados || 0;
        acum.actualizados += r.actualizados || 0;
        acum.omitidos += r.omitidos || 0;
        if (r.errores?.length) acum.errores.push(...r.errores);
        desde = r.siguiente;
      }
      setProgreso({ hechas: filas.length, total: filas.length });
      setResultado({ ...acum, simulado: simular });
      if (!simular) {
        qc.invalidateQueries({ queryKey: ['propiedades'] });
        toast.success(`Importación lista: ${acum.creados} nuevos, ${acum.actualizados} actualizados`);
      } else {
        toast.success('Simulación completa — no se escribió nada');
      }
    } catch (err) {
      toast.error(err.message || 'Falló la importación');
      setResultado({ ...acum, error: err.message });
    } finally {
      setCorriendo(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Importar inventario</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">
          Sube el export de SIMI en CSV. Se identifica cada inmueble por su código, así que puedes
          volver a importar el mismo archivo sin duplicar nada.
        </p>
      </div>

      {/* Carga */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => leerArchivo(e.target.files?.[0])}
          />
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); leerArchivo(e.dataTransfer.files?.[0]); }}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">
              {archivo ? archivo.name : 'Arrastra el CSV aquí o haz clic para elegirlo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Desde Excel o Google Sheets: Archivo → Descargar → CSV
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostico de columnas */}
      {!!columnas.length && (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Columnas detectadas</h2>
              <Badge variant="secondary" className="ml-auto">{filas.length} filas</Badge>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {COLUMNAS_ESPERADAS.map((c) => {
                const ok = tieneColumna(c.nombre);
                return (
                  <Badge
                    key={c.nombre}
                    variant={ok ? 'default' : 'outline'}
                    className={`text-[11px] ${ok ? '' : c.requerida ? 'border-destructive text-destructive' : 'text-muted-foreground'}`}
                  >
                    {c.nombre}
                    {c.nota ? ` · ${c.nota}` : ''}
                  </Badge>
                );
              })}
            </div>

            {faltaRequerida.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
                <span>
                  Falta la columna <strong>{faltaRequerida.map((c) => c.nombre).join(', ')}</strong>.
                  Sin ella no hay cómo identificar cada inmueble y la importación crearía duplicados
                  en cada corrida.
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                disabled={corriendo || !!faltaRequerida.length}
                onClick={() => ejecutar(true)}
                className="rounded-lg gap-1.5"
              >
                <Eye className="w-4 h-4" /> Simular
              </Button>
              <Button
                disabled={corriendo || !!faltaRequerida.length}
                onClick={() => ejecutar(false)}
                className="rounded-lg gap-1.5"
              >
                {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar {filas.length} inmuebles
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              «Simular» recorre todo el archivo sin escribir nada. Sirve para confirmar que las
              columnas se leen bien antes de tocar la base.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progreso */}
      {corriendo && progreso && (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-5">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Procesando…</span>
              <span>{progreso.hechas} / {progreso.total}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((progreso.hechas / Math.max(progreso.total, 1)) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {resultado && (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <h2 className="text-sm font-semibold">
                {resultado.simulado ? 'Simulación (no se escribió nada)' : 'Importación completada'}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: resultado.creados, l: resultado.simulado ? 'se crearían' : 'creados' },
                { n: resultado.actualizados, l: 'actualizados' },
                { n: resultado.omitidos, l: 'omitidos (sin código)' },
              ].map((x) => (
                <div key={x.l} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-[22px] font-bold tracking-tight text-foreground">{x.n}</p>
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
                  {resultado.errores.map((e, i) => <li key={i} className="font-mono text-[11px]">{e}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
