import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, AlertTriangle, MailWarning, Users } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction, FUNCIONES } from '@/lib/backend';
import { plantillaCorreo } from '@/lib/plantilla-correo';
import { Metrica } from '@/components/modulo';

/**
 * La otra mitad del trabajo manual: armar la audiencia y dejar lista la campana.
 *
 * Corre en este orden a proposito:
 *
 *   preflight  quien NO va a recibir, sabido ANTES de escribir nada. Barre los
 *              rebotados y dados de baja de los meses anteriores tambien, porque
 *              al crear una audiencia nueva cada mes esa historia se pierde y el
 *              rebote solo se descubre despues de enviar. En agosto eran ocho.
 *   campos     crea FNAME y PDF si faltan; PDF2, PDF3... solo segun el maximo
 *              real del mes.
 *   audiencia  upsert de los contactos con su URL.
 *   borrador   crea la campana y le pone el contenido.
 *
 * Termina en BORRADOR. En todo el sistema no existe una sola linea capaz de
 * mandar un correo: se quito incluso el envio de prueba. Seiscientos correos con
 * plata de por medio no se disparan desde una pantalla que alguien puede tocar
 * sin querer, y "no existe" es una garantia mas fuerte que "esta bien cerrado".
 */
export default function PasoCampana({ periodo, campana, multiContrato }) {
  const [audiencias, setAudiencias] = useState(null);
  const [listId, setListId] = useState('');
  const [asunto, setAsunto] = useState(`Tu código de pago de ${periodo}`);
  const [corriendo, setCorriendo] = useState(false);
  const [fase, setFase] = useState('');
  const [preflight, setPreflight] = useState(null);
  const [borrador, setBorrador] = useState(null);


  useEffect(() => {
    callFunction(FUNCIONES.campana, { modo: 'audiencias' })
      .then((r) => {
        setAudiencias(r.audiencias || []);
        // Se preselecciona la de codigos mas reciente, que es la que casi
        // siempre toca. Elegir a mano a quien se le escribe sigue siendo posible.
        const cod = (r.audiencias || []).filter((a) => /codigo/i.test(a.nombre));
        if (cod.length) setListId(cod[0].id);
      })
      .catch((e) => toast.error(`No se pudieron leer las audiencias: ${e.message}`));
  }, []);

  const maxCodigos = Math.max(1, ...multiContrato.map((m) => m.codigos.length));

  const ejecutar = async () => {
    if (!listId) { toast.error('Elige la audiencia'); return; }
    setCorriendo(true);
    setBorrador(null);
    try {
      // 1. Quien no va a recibir. Va primero para que la respuesta este a la
      // vista antes de tocar la audiencia.
      setFase('Revisando rebotados y bajas');
      const historicas = (audiencias || [])
        .filter((a) => /codigo/i.test(a.nombre) && a.id !== listId)
        .map((a) => a.id)
        .slice(0, 6);
      const pf = await callFunction(FUNCIONES.campana, {
        modo: 'preflight',
        list_id: listId,
        audiencias_historicas: historicas,
        correos: [...campana.map((c) => c.email), ...multiContrato.map((m) => m.email)],
      });
      setPreflight(pf);

      // 2. Campos. PDF2 en adelante solo si de verdad hacen falta este mes.
      setFase('Preparando los campos');
      await callFunction(FUNCIONES.campana, { modo: 'mergeFields', list_id: listId, max_codigos: maxCodigos });

      // 3. Audiencia. Quien tiene un inmueble lleva su URL en PDF; quien tiene
      // varios las lleva en PDF, PDF2... y ninguno se pierde.
      const miembros = [
        ...campana.map((c) => ({ email: c.email, nombre: c.nombre, urls: [c.url] })),
        ...multiContrato.map((m) => ({ email: m.email, nombre: m.nombre, urls: m.codigos.map((k) => k.url) })),
      ];
      let desde = 0;
      let nuevos = 0; let actualizados = 0; const errores = [];
      while (desde !== null) {
        setFase(`Subiendo contactos (${desde}/${miembros.length})`);
        const r = await callFunction(FUNCIONES.campana, { modo: 'audiencia', list_id: listId, miembros, desde });
        nuevos += r.nuevos || 0; actualizados += r.actualizados || 0;
        if (r.errores?.length) errores.push(...r.errores);
        desde = r.siguiente;
      }

      // 4. Borrador. La plantilla lleva tantos bloques como codigos haya, para
      // que quien tiene dos inmuebles vea los dos.
      setFase('Creando el borrador');
      const tags = Array.from({ length: maxCodigos }, (_, i) => (i === 0 ? 'PDF' : `PDF${i + 1}`));
      const r = await callFunction(FUNCIONES.campana, {
        modo: 'campana',
        list_id: listId,
        asunto,
        titulo: `Códigos de barras ${periodo}`,
        html: plantillaCorreo({ periodo, tags }),
      });
      setBorrador({ ...r, nuevos, actualizados, errores });
      toast.success('Borrador creado en Mailchimp');
    } catch (e) {
      toast.error(e.message);
      setBorrador({ error: e.message });
    } finally {
      setCorriendo(false);
      setFase('');
    }
  };

  const total = campana.length + multiContrato.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Audiencia:</span>
        {audiencias === null ? (
          <span className="text-muted-foreground">cargando…</span>
        ) : (
          <select value={listId} onChange={(e) => setListId(e.target.value)}
                  className="bg-muted rounded-md px-2 py-1 text-xs max-w-[19rem]">
            <option value="">— elige —</option>
            {audiencias.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre} ({a.contactos})</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Asunto:</span>
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)}
               className="bg-muted rounded-md px-2 py-1 text-xs flex-1 min-w-[16rem]" />
      </div>

      <Button disabled={!listId || corriendo} onClick={ejecutar} className="rounded-lg gap-1.5">
        {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
        Preparar campaña para {total} inquilinos
      </Button>
      {corriendo && <p className="text-xs text-muted-foreground">{fase}…</p>}

      {/* Quien no recibe. Se muestra aunque el borrador falle: es informacion que
          hay que atender igual, por otro canal. */}
      {preflight && (
        <div className={`rounded-lg p-3 text-xs ${preflight.no_recibiran.length ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
          <p className="font-medium flex items-center gap-1.5 mb-1">
            <MailWarning className="w-3.5 h-3.5" />
            {preflight.no_recibiran.length
              ? `${preflight.no_recibiran.length} inquilinos NO van a recibir el correo`
              : 'Todas las direcciones pueden recibir'}
          </p>
          {preflight.no_recibiran.length > 0 && (
            <>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">
                {preflight.no_recibiran.map((x) => (
                  <li key={x.correo}>
                    <span className="inline-block w-24">{x.motivo === 'cleaned' ? 'rebotado' : 'dado de baja'}</span>
                    {x.correo}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                La campaña los salta aunque diga que salió. Hay que buscarlos por otro medio.
              </p>
            </>
          )}
        </div>
      )}

      {borrador?.error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="break-words">{borrador.error}</span>
        </div>
      )}

      {borrador && !borrador.error && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metrica etiqueta="nuevos" valor={borrador.nuevos} />
            <Metrica etiqueta="actualizados" valor={borrador.actualizados} tono="exito" />
            <Metrica etiqueta="con error" valor={borrador.errores.length}
                     tono={borrador.errores.length ? 'peligro' : 'neutro'} />
          </div>

          {borrador.errores.length > 0 && (
            <ul className="text-xs bg-destructive/10 rounded-lg p-3 space-y-0.5 max-h-32 overflow-y-auto">
              {borrador.errores.map((e, i) => (
                <li key={i} className="text-muted-foreground">{e.correo}: {e.detalle || e.codigo}</li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[11px]">Borrador</Badge>
              <span className="text-sm font-medium">La campaña está lista, sin enviar</span>
            </div>
            <p className="text-xs text-muted-foreground">
              A ningún inquilino le llega nada desde aquí: la app no tiene forma de enviar correo.
              Para revisar cómo queda, usa «Vista previa» en Mailchimp. El envío se aprieta allí,
              viendo lo que va a salir.
            </p>

            <a href={borrador.url} target="_blank" rel="noreferrer noopener"
               className="text-sm text-primary hover:underline flex items-center gap-1.5 presionable">
              <ExternalLink className="w-4 h-4" /> Abrir el borrador en Mailchimp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
