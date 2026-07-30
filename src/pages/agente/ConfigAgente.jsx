import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, ConfigAgente } from '@/api/base44Client';
import { BACKEND_URL } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Bot, BookOpen, CheckCircle2, Copy, Database, ExternalLink, Loader2,
  PlayCircle, RefreshCw, Save, Settings, ShieldCheck, UserRound, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const DEFAULTS = {
  activo: true,
  demora_respuesta_min: 0,
  telegram_notif_chat: '',
  numero_notificaciones: '',
};

const SECRETOS_TELEGRAM = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
];

export default function ConfigAgenteIA() {
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULTS);
  const [demo, setDemo] = useState(null);
  const [demoError, setDemoError] = useState('');
  const [cargandoDemo, setCargandoDemo] = useState(false);

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['config_agente'],
    queryFn: () => ConfigAgente.list('-created_date', 100),
  });
  const config = filas.find((fila) => fila.clave === 'general') || filas[0] || null;

  useEffect(() => {
    if (!config) return;
    setForm({
      activo: config.activo ?? true,
      demora_respuesta_min: Number(config.demora_respuesta_min) || 0,
      telegram_notif_chat: config.telegram_notif_chat || '',
      numero_notificaciones: config.numero_notificaciones || '',
    });
  }, [config]);

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        ...(config || {}),
        ...form,
        clave: 'general',
        nombre_agente: config?.nombre_agente || 'Asistente Inmobiliare',
        nombre_inmobiliaria: config?.nombre_inmobiliaria || 'INMOBILIARE Julio Corredor',
      };
      return config?.id ? ConfigAgente.update(config.id, datos) : ConfigAgente.create(datos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config_agente'] });
      toast.success('Configuración operativa guardada');
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  });

  const webhookUrl = `${BACKEND_URL}/api/functions/agenteInbound`;
  const webhookVentasUrl = `${webhookUrl}?agente=ventas`;
  const copiarWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook copiado');
  };

  const consultarDemo = useCallback(async () => {
    setCargandoDemo(true);
    setDemoError('');
    try {
      const res = await base44.functions.invoke('configurarDemoVentas', { accion: 'estado' });
      setDemo(res.data || null);
    } catch (error) {
      setDemoError(error?.response?.data?.error || error?.message || 'No se pudo consultar el demo');
    } finally {
      setCargandoDemo(false);
    }
  }, []);

  useEffect(() => { consultarDemo(); }, [consultarDemo]);

  const prepararDemo = async () => {
    setCargandoDemo(true);
    setDemoError('');
    try {
      const res = await base44.functions.invoke('configurarDemoVentas', { accion: 'preparar' });
      setDemo(res.data || null);
      if (res.data?.listo) toast.success('Demo de Ventas listo');
      else toast.warning('El bot quedo conectado, pero falta revisar un punto');
    } catch (error) {
      const mensaje = error?.response?.data?.error || error?.message || 'No se pudo preparar el demo';
      setDemoError(mensaje);
      toast.error(mensaje);
    } finally {
      setCargandoDemo(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            <h1 className="text-[28px] font-bold tracking-tight">Configuración operativa</h1>
            <Badge variant={form.activo ? 'default' : 'secondary'}>
              {form.activo ? 'IA activa' : 'IA pausada'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-[15px]">
            Controles globales que sí usa el motor de los ocho agentes.
          </p>
        </div>
        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Una identidad pública, ocho roles internos</AlertTitle>
        <AlertDescription>
          El cliente habla con “Asistente Inmobiliare”. Los nombres, reglas y límites de cada rol se editan en{' '}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/agente/agentes">
            Agentes
          </Link>
          , y las políticas aprobadas en{' '}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/agente/conocimiento">
            Conocimiento RAG
          </Link>.
        </AlertDescription>
      </Alert>

      <Card className="rounded-2xl border-primary/40 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-primary" /> Demo: Ventas por Telegram
                {demo?.listo && <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" /> Listo</Badge>}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Conecta un bot directamente con Ventas, sin depender del router ni de los otros agentes.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={consultarDemo} disabled={cargandoDemo} aria-label="Revisar estado">
                <RefreshCw className={`w-4 h-4 ${cargandoDemo ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={prepararDemo} disabled={cargandoDemo} className="gap-2">
                {cargandoDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Preparar demo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {demoError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>No se pudo completar</AlertTitle>
              <AlertDescription>{demoError}</AlertDescription>
            </Alert>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <EstadoDemo
              titulo="Webhook Ventas"
              valor={demo?.bot?.webhook_correcto ? 'Conectado' : 'Pendiente'}
              ok={demo?.bot?.webhook_correcto}
              icono={Bot}
            />
            <EstadoDemo
              titulo="Inventario"
              valor={demo?.agente?.inmuebles_disponibles == null ? 'Sin verificar' : `${demo.agente.inmuebles_disponibles} disponibles`}
              ok={Number(demo?.agente?.inmuebles_disponibles) > 0}
              icono={Database}
            />
            <EstadoDemo
              titulo="Prompt Ventas"
              valor={demo?.agente?.prompt_activo ? `Activo v${demo.agente.prompt_version || 1}` : 'Pendiente'}
              ok={demo?.agente?.prompt_activo}
              icono={ShieldCheck}
            />
            <EstadoDemo
              titulo="Asesores"
              valor={demo?.agente?.asesores_activos == null ? 'Sin verificar' : `${demo.agente.asesores_activos} activos`}
              ok={Number(demo?.agente?.asesores_activos) > 0}
              icono={UserRound}
            />
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Secrets mínimos del demo</p>
            <div className="flex flex-wrap gap-2">
              {SECRETOS_TELEGRAM.map((secret) => {
                const ok = demo?.secretos?.[secret];
                return (
                  <code key={secret} className="rounded-md bg-muted px-2 py-1 text-xs flex items-center gap-1.5">
                    {ok ? <CheckCircle2 className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-destructive" />}
                    {secret}
                  </code>
                );
              })}
            </div>
            {demo?.faltantes?.length > 0 && (
              <p className="text-xs text-destructive mt-2">
                En Base44 abre Dashboard → Secrets → Add Secret y agrega: {demo.faltantes.join(', ')}.
              </p>
            )}
          </div>

          {demo?.bot?.username && (
            <div className="rounded-xl bg-muted/60 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Bot del demo: @{demo.bot.username}</p>
                <p className="text-xs text-muted-foreground">
                  Abre el bot y envía <code>/reiniciar</code> antes de cada ensayo para empezar limpio.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={`https://t.me/${demo.bot.username}`} target="_blank" rel="noreferrer">Abrir Telegram</a>
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Este botón activa la IA, fija demora en 0, siembra solo Identidad + Ventas y registra el webhook{' '}
            <code>{webhookVentasUrl}</code>. No conecta WhatsApp.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> Respuesta automática
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-4">
            <div>
              <p className="font-medium">Motor multiagente activo</p>
              <p className="text-sm text-muted-foreground">
                Al apagarlo se guardan los mensajes entrantes, pero ningún agente responde.
              </p>
            </div>
            <Switch
              checked={form.activo}
              onCheckedChange={(activo) => setForm((actual) => ({ ...actual, activo }))}
            />
          </div>

          <div className="max-w-sm">
            <Label htmlFor="demora">Demora de respuesta (minutos)</Label>
            <Input
              id="demora"
              type="number"
              min="0"
              max="10"
              value={form.demora_respuesta_min}
              onChange={(e) => setForm((actual) => ({
                ...actual,
                demora_respuesta_min: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
              }))}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usa 0 durante las pruebas por Telegram. Un valor mayor requiere el cron enviarPendientes.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Alertas internas</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="telegram-chat">Chat ID de Telegram del equipo</Label>
            <Input
              id="telegram-chat"
              value={form.telegram_notif_chat}
              onChange={(e) => setForm((actual) => ({ ...actual, telegram_notif_chat: e.target.value.trim() }))}
              placeholder="Ej. -1001234567890"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="numero-alertas">WhatsApp de respaldo</Label>
            <Input
              id="numero-alertas"
              value={form.numero_notificaciones}
              onChange={(e) => setForm((actual) => ({
                ...actual,
                numero_notificaciones: e.target.value.replace(/\D/g, ''),
              }))}
              placeholder="573001234567"
              className="mt-1"
            />
          </div>
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Telegram tiene prioridad. Estas direcciones reciben escalaciones; nunca se reutiliza el número del cliente.
            La asignación comercial se configura en{' '}
            <Link className="font-medium text-primary hover:underline" to="/equipo/asesores">Equipo &gt; Asesores</Link>.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Webhook único
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copiarWebhook} aria-label="Copiar webhook">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Para conectar WhatsApp más adelante</p>
            <div className="flex flex-wrap gap-2">
              {['META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'].map((secret) => (
                <code key={secret} className="rounded-md bg-muted px-2 py-1 text-xs">{secret}</code>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Primero registra y prueba Telegram. La conexión de WhatsApp queda para el cutover final.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-dashed">
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Las reglas de negocio no se configuran aquí</p>
              <p className="text-sm text-muted-foreground">
                Comisión, mora, reparaciones, tarifario de avalúos y F117 deben cargarse como conocimiento trazable.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/agente/conocimiento">Abrir RAG</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EstadoDemo({ titulo, valor, ok, icono: Icon }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        {ok ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{titulo}</p>
      <p className="text-sm font-medium truncate">{valor}</p>
    </div>
  );
}
