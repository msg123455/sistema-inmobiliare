import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FolderOpen, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Loader2, ShieldCheck, ExternalLink, Barcode,
} from 'lucide-react';
import { toast } from 'sonner';
import { parsearCSV, filasAObjetos } from '@/lib/csv';
import { leerArchivo } from '@/lib/archivos';
import { callFunction, FUNCIONES } from '@/lib/backend';
import { conciliar, construirDirectorio, leerNombreArchivo } from '@/lib/conciliar';
import { EncabezadoModulo, Metrica } from '@/components/modulo';
import { base44 } from '@/api/base44Client';
import PasoCampana from '@/components/cartera/PasoCampana';

/**
 * Codigos de barras del mes: de la carpeta de SIMI al correo, sin copiar URLs.
 *
 * Lo que reemplaza: alguien abria Mailchimp, buscaba la URL de cada codigo, la
 * copiaba y la pegaba en la fila del inquilino. Seiscientas veces. La revision
 * manual existia porque un codigo en la fila equivocada hace que un inquilino
 * pague la cuenta de otro.
 *
 * Los pasos van en este orden y no se pueden saltar, porque todo lo reversible
 * ocurre ANTES de lo irreversible: se lee, se concilia y lo revisa una persona;
 * solo entonces se sube algo a Mailchimp. Si hay un contrato duplicado, se para
 * sin haber tocado la carpeta del mes.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const LOTE_SUBIDA = 25;   // archivos por llamada; el backend corta por reloj

function Alerta({ children, tono = 'error' }) {
  const clase = tono === 'error'
    ? 'text-destructive bg-destructive/10'
    : 'text-amber-700 dark:text-amber-400 bg-amber-500/10';
  return (
    <div className={`flex items-start gap-2.5 text-sm rounded-xl p-4 ${clase}`}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Paso({ n, titulo, hecho, children, deshabilitado }) {
  return (
    <Card className={`rounded-2xl border-border/60 ${deshabilitado ? 'opacity-50 pointer-events-none' : ''}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold
            ${hecho ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {hecho ? '✓' : n}
          </span>
          <h2 className="text-sm font-semibold">{titulo}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Cubo de excepciones con exportacion, para que nada quede solo en pantalla. */
function Cubo({ titulo, items, describe, tono = 'aviso' }) {
  if (!items?.length) return null;
  const exportar = () => {
    const csv = ['detalle', ...items.map((x) => `"${String(describe(x)).replace(/"/g, '""')}"`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${titulo.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className={`rounded-lg p-3 text-xs ${tono === 'error' ? 'bg-destructive/10' : 'bg-muted/50'}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`font-medium ${tono === 'error' ? 'text-destructive' : ''}`}>
          {titulo}: {items.length}
        </span>
        <button onClick={exportar} className="text-primary hover:underline presionable">exportar</button>
      </div>
      <ul className="space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">
        {items.slice(0, 40).map((x, i) => <li key={i} className="truncate">{describe(x)}</li>)}
        {items.length > 40 && <li className="italic">…y {items.length - 40} mas (usa exportar)</li>}
      </ul>
    </div>
  );
}

export default function CodigosMensuales() {
  const refCarpeta = useRef(null);
  const refCsv = useRef(null);

  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const [estado, setEstado] = useState(null);       // resultado de la sonda
  const [archivos, setArchivos] = useState([]);     // { nombre, file }
  const [directorio, setDirectorio] = useState(null);
  const [revisado, setRevisado] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [paraCampana, setParaCampana] = useState(null);

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  // La sonda va primero y bloquea el resto. Base44 descarta en silencio los
  // campos que no existen: sin esta comprobacion la subida "funcionaria" y los
  // sha256 se perderian en las 600 filas sin un solo error visible.
  useEffect(() => {
    callFunction(FUNCIONES.codigos, { modo: 'sonda' })
      .then(setEstado)
      .catch((e) => setEstado({ error: e.message }));
  }, []);

  const listo = estado?.listo === true;

  const elegirCarpeta = (lista) => {
    const pdfs = [...(lista || [])].filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) { toast.error('Esa carpeta no tiene PDFs'); return; }
    setArchivos(pdfs.map((f) => ({ nombre: f.name, file: f })));
    setResultado(null);
    setRevisado(false);
    // El mes sale de los propios archivos: es mas fiable que la fecha de hoy,
    // que el 1 de septiembre apuntaria al mes equivocado.
    const detectado = pdfs.map((f) => leerNombreArchivo(f.name)).find(Boolean);
    if (detectado) setMes(detectado.mes);
    toast.success(`${pdfs.length} PDFs leidos`);
  };

  const leerListado = async (file) => {
    if (!file) return;
    try {
      const { filas } = filasAObjetos(parsearCSV(await file.text()));
      const dir = construirDirectorio(filas);
      if (!dir.entradas.length) { toast.error('No se reconocio ningun contrato en ese archivo'); return; }
      setDirectorio(dir);
      setResultado(null);
      setRevisado(false);
      toast.success(`${dir.entradas.length} contratos aprendidos`);
    } catch (e) {
      toast.error(`No se pudo leer: ${e.message}`);
    }
  };

  // Conciliacion en vivo: es una funcion pura, no toca red, asi que recalcular
  // en cada cambio no cuesta nada y el informe siempre refleja lo que hay.
  const conciliacion = useMemo(() => {
    if (!archivos.length || !directorio) return null;
    return conciliar({
      archivos: archivos.map((a) => ({ nombre: a.nombre, url: '' })),
      directorio: directorio.entradas,
      opciones: { mesEsperado: mes },
    });
  }, [archivos, directorio, mes]);

  const bloqueado = (conciliacion?.bloqueos?.length || 0) > 0;
  const puedeCorrer = listo && conciliacion && !bloqueado && revisado && !corriendo;

  const ejecutar = async () => {
    setCorriendo(true);
    setResultado(null);
    const acum = { subidos: 0, verificados: 0, errores: [], fallidos: [] };

    try {
      const prep = await callFunction(FUNCIONES.codigos, { modo: 'preparar', periodo });
      const yaSubidos = new Set(prep.ya_subidos || []);

      // Solo lo que falta: si una corrida anterior murio en el archivo 400, esta
      // sube los 200 que quedaron y no repite los primeros.
      const pendientes = conciliacion.emparejados.filter((e) => !yaSubidos.has(e.codigo));
      if (yaSubidos.size) toast.info(`${yaSubidos.size} ya estaban subidos, se omiten`);

      const porNombre = new Map(archivos.map((a) => [a.nombre, a.file]));
      let hechos = 0;

      for (let i = 0; i < pendientes.length; i += LOTE_SUBIDA) {
        const grupo = pendientes.slice(i, i + LOTE_SUBIDA);
        setProgreso({ fase: 'Subiendo', hechas: hechos, total: pendientes.length });

        // Los bytes se leen aqui, justo antes de mandarlos, para no tener 600
        // PDFs en memoria a la vez.
        const items = [];
        for (const e of grupo) {
          const file = porNombre.get(e.archivo);
          if (!file) { acum.errores.push(`${e.codigo}: no se encontro el archivo`); continue; }
          const { sha256, base64 } = await leerArchivo(file);
          items.push({ codigo: e.codigo, archivo: e.archivo, base64, sha256, email: e.email, nombre: e.nombre });
        }

        let desde = 0;
        while (desde !== null) {
          const r = await callFunction(FUNCIONES.codigos, {
            modo: 'subir', periodo, folder_id: prep.folder_id, items, desde,
          });
          acum.subidos += r.subidos || 0;
          if (r.errores?.length) acum.errores.push(...r.errores);
          desde = r.siguiente;
        }
        hechos += grupo.length;
      }

      // Verificacion de ida y vuelta: descarga cada URL y recalcula la huella.
      // Es lo que prueba que la URL del correo de un inquilino sirve exactamente
      // su recibo, byte a byte.
      let desde = 0;
      while (desde !== null) {
        setProgreso({ fase: 'Verificando', hechas: acum.verificados, total: pendientes.length });
        const r = await callFunction(FUNCIONES.codigos, { modo: 'verificar', periodo, desde });
        acum.verificados += r.verificados || 0;
        if (r.fallidos?.length) acum.fallidos.push(...r.fallidos);
        desde = r.siguiente;
      }

      // Las URL para la campana se leen de CodigoBarras, no de lo que devolvio
      // la subida: si una corrida anterior ya habia subido parte del mes, esas
      // URL solo viven en la tabla. El libro mayor es la fuente, no la sesion.
      setProgreso({ fase: 'Leyendo las URL guardadas', hechas: 0, total: 1 });
      const filas = (await base44.entities.CodigoBarras.list())
        .filter((f) => f.periodo === periodo && f.url_pdf);
      const urlPorCodigo = new Map(filas.map((f) => [String(f.codigo), f.url_pdf]));

      // Se reagrupa por correo con las URL puestas: quien tiene un inmueble va a
      // la campana masiva y quien tiene varios a un correo con todos, que es lo
      // que evita que se le pierda uno en silencio.
      const porCorreo = new Map();
      for (const e of conciliacion.emparejados) {
        const url = urlPorCodigo.get(e.codigo);
        if (!url || !e.enviable) continue;
        const k = e.email.toLowerCase();
        if (!porCorreo.has(k)) porCorreo.set(k, []);
        porCorreo.get(k).push({ ...e, url });
      }
      const uno = []; const varios = [];
      for (const [email, grupo] of porCorreo) {
        if (grupo.length === 1) uno.push(grupo[0]);
        else varios.push({ email, nombre: grupo[0].nombre, codigos: grupo });
      }
      setParaCampana({ campana: uno, multiContrato: varios });

      setResultado(acum);
      setProgreso(null);
      if (acum.fallidos.length) toast.error(`${acum.fallidos.length} no verificaron`);
      else toast.success(`${acum.subidos} codigos subidos y verificados`);
    } catch (e) {
      setResultado({ ...acum, error: e.message });
      toast.error(e.message);
    } finally {
      setCorriendo(false);
    }
  };

  // Muestra de auditoria: 10 filas para revisar a ojo antes de dejar correr nada.
  const muestra = useMemo(() => {
    if (!conciliacion?.emparejados?.length) return [];
    const t = conciliacion.emparejados;
    const paso = Math.max(1, Math.floor(t.length / 10));
    return t.filter((_, i) => i % paso === 0).slice(0, 10);
  }, [conciliacion]);

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Códigos de barras del mes"
        resumen="Sube la carpeta de SIMI y el sistema empareja cada código con su inquilino. Las URL se capturan al subirlas a Mailchimp: no hay que copiar ninguna."
      />

      {/* 1. Estado */}
      <Paso n={1} titulo="Estado del sistema" hecho={listo}>
        {!estado ? (
          <p className="text-xs text-muted-foreground">Comprobando…</p>
        ) : estado.error && !estado.ping ? (
          <Alerta>
            <p className="font-medium">No se puede conectar con Mailchimp</p>
            <p className="mt-1 text-muted-foreground break-words">{estado.error}</p>
          </Alerta>
        ) : estado.campos_faltantes?.length ? (
          <Alerta>
            <p className="font-medium">Faltan {estado.campos_faltantes.length} campos en CodigoBarras</p>
            <p className="mt-1">
              Sin <strong>{estado.campos_faltantes.join(', ')}</strong> no hay verificación ni auditoría.
              Base44 los descarta en silencio, así que la subida parecería funcionar sin guardar nada.
            </p>
            <p className="mt-1 text-muted-foreground">Créalos en Base44 → Datos → CodigoBarras, todos de tipo texto.</p>
          </Alerta>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default" className="text-[11px]">Mailchimp conectado</Badge>
            <Badge variant="default" className="text-[11px]">Acepta PDF</Badge>
            {estado.hash_coincide && <Badge variant="default" className="text-[11px]">Verificación por huella</Badge>}
            <Badge variant="default" className="text-[11px]">Esquema completo</Badge>
          </div>
        )}
      </Paso>

      {/* 2. Carpeta */}
      <Paso n={2} titulo="Carpeta de códigos descargada de SIMI" hecho={archivos.length > 0} deshabilitado={!listo}>
        <input
          ref={refCarpeta} type="file" webkitdirectory="" multiple
          accept="application/pdf" className="hidden"
          onChange={(e) => elegirCarpeta(e.target.files)}
        />
        <div
          onClick={() => refCarpeta.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <FolderOpen className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            {archivos.length ? `${archivos.length} PDFs seleccionados` : 'Elige la carpeta con los códigos'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Los archivos no salen de tu computador hasta que apruebes el informe
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Periodo:</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
                  className="bg-muted rounded-md px-2 py-1 text-xs">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))}
                 className="bg-muted rounded-md px-2 py-1 w-20 text-xs" />
          <span className="text-muted-foreground">→ carpeta «{MESES[mes - 1]} {anio}» en Mailchimp</span>
        </div>
      </Paso>

      {/* 3. Directorio */}
      <Paso n={3} titulo="Listado de inquilinos" hecho={!!directorio} deshabilitado={!archivos.length}>
        <input ref={refCsv} type="file" accept=".csv,.tsv,.txt" className="hidden"
               onChange={(e) => leerListado(e.target.files?.[0])} />
        <div
          onClick={() => refCsv.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <FileSpreadsheet className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            {directorio ? `${directorio.entradas.length} contratos aprendidos` : 'Sube el listado de un mes anterior (CSV)'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            El que ya tiene las URL. De ahí se aprende qué contrato es de quién.
          </p>
        </div>
        {directorio?.conflictos?.length > 0 && (
          <Alerta tono="aviso">
            {directorio.conflictos.length} contratos aparecen con dos inquilinos distintos. Se usó el primero.
          </Alerta>
        )}
      </Paso>

      {/* 4. Conciliacion */}
      {conciliacion && (
        <Paso n={4} titulo="Conciliación" hecho={!bloqueado}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metrica etiqueta="Emparejados" valor={conciliacion.resumen.emparejados} tono="exito" />
            <Metrica etiqueta="A campaña" valor={conciliacion.resumen.campana} />
            <Metrica etiqueta="Correo aparte" valor={conciliacion.resumen.multiContrato}
                     tono={conciliacion.resumen.multiContrato ? 'curso' : 'neutro'} />
            <Metrica etiqueta="Bloqueos" valor={conciliacion.bloqueos.length}
                     tono={bloqueado ? 'peligro' : 'exito'} />
          </div>

          {bloqueado && (
            <Alerta>
              <p className="font-medium">No se puede continuar: {conciliacion.bloqueos.length} problemas sin resolver</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {conciliacion.bloqueos.slice(0, 8).map((b, i) => <li key={i}>· {b.detalle}</li>)}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Son casos donde no hay forma de saber qué código le toca a quién. Adivinar es
                exactamente el error que este proceso existe para evitar.
              </p>
            </Alerta>
          )}

          {conciliacion.resumen.multiContrato > 0 && (
            <Alerta tono="aviso">
              <p className="font-medium">
                {conciliacion.resumen.multiContrato} inquilinos tienen más de un inmueble
                ({conciliacion.resumen.codigosEnMultiContrato} códigos)
              </p>
              <p className="mt-1 text-xs">
                Salen de la campaña masiva: un contacto de Mailchimp guarda un solo valor por
                campo, así que recibirían uno de sus códigos y el otro se perdería sin aviso.
                Van en un correo aparte con todos.
              </p>
            </Alerta>
          )}

          <div className="grid md:grid-cols-2 gap-2">
            <Cubo titulo="Códigos sin inquilino conocido" items={conciliacion.excepciones.archivoSinInquilino}
                  describe={(x) => `${x.archivo} (contrato ${x.codigo})`} />
            <Cubo titulo="Inquilinos sin código este mes" items={conciliacion.excepciones.inquilinoSinArchivo}
                  describe={(x) => `${x.nombre || x.email} (contrato ${x.clave})`} />
            <Cubo titulo="Nombre de archivo no reconocido" items={conciliacion.excepciones.nombreNoReconocido}
                  describe={(x) => x.nombre} />
            <Cubo titulo="De otro mes" items={conciliacion.excepciones.mesDistinto}
                  describe={(x) => `${x.archivo} (mes ${x.mes})`} tono="error" />
            <Cubo titulo="Correo inválido" items={conciliacion.excepciones.correoInvalido}
                  describe={(x) => `${x.email} — ${x.nombre}`} tono="error" />
            <Cubo titulo="Sin correo" items={conciliacion.excepciones.sinCorreo}
                  describe={(x) => `${x.nombre} (contrato ${x.clave})`} tono="error" />
          </div>

          {conciliacion.senales.rupturasDeOrden > 2 && (
            <p className="text-xs text-muted-foreground">
              Aviso: {conciliacion.senales.rupturasDeOrden} archivos rompen el orden creciente de
              contrato. Suele indicar que la carpeta mezcla meses.
            </p>
          )}
        </Paso>
      )}

      {/* 5. Muestra de auditoria */}
      {conciliacion && !bloqueado && (
        <Paso n={5} titulo="Revisión antes de enviar" hecho={revisado}>
          <p className="text-xs text-muted-foreground">
            Diez emparejamientos al azar. Confirma que el contrato corresponde al inquilino.
          </p>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Contrato</th>
                  <th className="text-left px-3 py-1.5 font-medium">Inquilino</th>
                  <th className="text-left px-3 py-1.5 font-medium">Correo</th>
                </tr>
              </thead>
              <tbody>
                {muestra.map((m) => (
                  <tr key={m.clave} className="border-t border-border/40">
                    <td className="px-3 py-1.5 tabular font-medium">{m.codigo}</td>
                    <td className="px-3 py-1.5 truncate max-w-[220px]">{m.nombre}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[220px]">{m.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)}
                   className="w-4 h-4 rounded" />
            Revisé la muestra y los emparejamientos son correctos
          </label>
        </Paso>
      )}

      {/* 6. Ejecutar */}
      {conciliacion && !bloqueado && (
        <Paso n={6} titulo="Subir a Mailchimp" hecho={!!resultado && !resultado.error}>
          <Button disabled={!puedeCorrer} onClick={ejecutar} className="rounded-lg gap-1.5">
            {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir {conciliacion.resumen.emparejados} códigos
          </Button>
          {!revisado && !corriendo && (
            <p className="text-xs text-muted-foreground">Marca la revisión del paso 5 para continuar.</p>
          )}

          {progreso && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{progreso.fase}…</span>
                <span>{progreso.hechas} / {progreso.total}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300"
                     style={{ width: `${Math.round((progreso.hechas / Math.max(progreso.total, 1)) * 100)}%` }} />
              </div>
            </div>
          )}

          {resultado && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {resultado.error || resultado.fallidos.length
                  ? <AlertTriangle className="w-4 h-4 text-destructive" />
                  : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                <span className="text-sm font-semibold">
                  {resultado.error ? 'No se pudo completar' : 'Subida terminada'}
                </span>
              </div>
              {resultado.error && (
                <div className="text-sm bg-destructive/10 rounded-xl p-4 text-muted-foreground break-words">
                  {resultado.error}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Metrica etiqueta="subidos" valor={resultado.subidos} tono="exito" />
                <Metrica etiqueta="verificados" valor={resultado.verificados}
                         tono={resultado.verificados === resultado.subidos ? 'exito' : 'curso'} />
                <Metrica etiqueta="con problema" valor={resultado.errores.length + resultado.fallidos.length}
                         tono={resultado.errores.length + resultado.fallidos.length ? 'peligro' : 'neutro'} />
              </div>
              {resultado.verificados === resultado.subidos && resultado.subidos > 0 && (
                <div className="flex items-start gap-2 text-xs bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg p-3">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-px" />
                  <span>
                    Las {resultado.verificados} URL se descargaron y su huella coincide con el archivo
                    subido. Queda probado que cada inquilino recibirá exactamente su recibo.
                  </span>
                </div>
              )}
              <Cubo titulo="Errores al subir" items={resultado.errores} describe={(x) => x} tono="error" />
              <Cubo titulo="No verificaron" items={resultado.fallidos} describe={(x) => x} tono="error" />
              <a href="/cartera/envios" className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Ver los códigos en Envíos
              </a>
            </div>
          )}
        </Paso>
      )}

      {/* 7. Campana. Aparece cuando ya hay URL: antes no hay nada que enviar. */}
      {paraCampana && (
        <Paso n={7} titulo="Armar la campaña" hecho={false}>
          <p className="text-xs text-muted-foreground">
            {paraCampana.campana.length} inquilinos en la campaña masiva
            {paraCampana.multiContrato.length > 0
              && ` · ${paraCampana.multiContrato.length} con varios inmuebles reciben todos sus códigos`}
          </p>
          <PasoCampana
            periodo={periodo}
            campana={paraCampana.campana}
            multiContrato={paraCampana.multiContrato}
          />
        </Paso>
      )}

      {!archivos.length && listo && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Barcode className="w-3.5 h-3.5" />
          Nada se sube a Mailchimp hasta que la conciliación cierre y marques la revisión.
        </p>
      )}
    </div>
  );
}
