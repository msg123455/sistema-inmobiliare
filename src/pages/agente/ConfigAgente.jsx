import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfigAgente } from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Bot, Plus, X, Save, Play, Clock, MessageCircle, Zap,
  Settings, BookOpen, Link, CheckCircle, AlertCircle, Users, Phone,
} from 'lucide-react';

const DEFAULT_INSTRUCCIONES = `Eres una asesora inmobiliaria profesional y amable. Atiendes prospectos con calidez colombiana.

FLUJO DE CALIFICACIÓN:
1. Saluda y pregunta si busca comprar o arrendar
2. Pregunta la ciudad de interés
3. Pregunta el presupuesto aproximado
4. Pregunta número de habitaciones deseadas
5. Recomienda máximo 3 propiedades del catálogo disponible
6. Propone una visita presencial o virtual con fecha y hora concretas

REGLAS:
- Habla en español colombiano, de tú a tú, con calidez y profesionalismo
- Nunca inventes propiedades ni precios que no estés en el catálogo
- Máximo 3 propiedades por mensaje para no abrumar
- Si el cliente pregunta algo que no sabes, di que lo consultas con un asesor
- Usa un tono cálido y cercano sin emojis
- Si el cliente quiere hablar con una persona, escala inmediatamente`;

const DEFAULT_CONOCIMIENTO = [
  'Atendemos en ciudades: Medellín, Bogotá, Cali, Barranquilla y principales ciudades de Colombia',
  'Horario de atención: lunes a sábado 8am - 8pm',
  'Manejamos apartamentos, casas, locales, oficinas y lotes',
  'Nuestras comisiones son del 3% en venta y el 10% del canon en arriendo',
  'Aceptamos todos los estratos',
];

export default function ConfigAgenteIA() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    nombre_agente: 'Valentina',
    instrucciones_sistema: DEFAULT_INSTRUCCIONES,
    conocimiento_base: DEFAULT_CONOCIMIENTO,
    saludo_inicial: '¡Hola {{nombre}}! Soy {{agente}}, asesora de {{inmobiliaria}}. ¿En qué te puedo ayudar hoy?',
    horario_inicio: '08:00',
    horario_fin: '20:00',
    fuera_de_horario_mensaje: '¡Hola! En este momento estamos fuera de horario (8am - 8pm). Te respondemos pronto.',
    escalar_triggers: ['hablar con agente', 'hablar con asesor', 'hablar con persona', 'urgente', 'queja', 'reclamo'],
    activo: true,
    nombre_inmobiliaria: '',
    brokers: [],
    demora_respuesta_min: 0,
  });

  const [nuevoKnowledge, setNuevoKnowledge] = useState('');
  const [nuevoTrigger, setNuevoTrigger] = useState('');
  const [nuevoBroker, setNuevoBroker] = useState({ nombre: '', telefono: '', genero: 'F', tipo_inmueble: 'ambos', barrios: '' });
  const [testMensaje, setTestMensaje] = useState('Hola, quiero arrendar un apartamento');
  const [testRespuesta, setTestRespuesta] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  // ── Cargar config existente ──
  const { data: configExistente } = useQuery({
    queryKey: ['config_agente'],
    queryFn: () => ConfigAgente.list(),
    select: (data) => data[0],
  });

  useEffect(() => {
    if (configExistente) {
      setForm({
        nombre_agente: configExistente.nombre_agente || 'Valentina',
        instrucciones_sistema: configExistente.instrucciones_sistema || DEFAULT_INSTRUCCIONES,
        conocimiento_base: configExistente.conocimiento_base || DEFAULT_CONOCIMIENTO,
        saludo_inicial: configExistente.saludo_inicial || form.saludo_inicial,
        horario_inicio: configExistente.horario_inicio || '08:00',
        horario_fin: configExistente.horario_fin || '20:00',
        fuera_de_horario_mensaje: configExistente.fuera_de_horario_mensaje || form.fuera_de_horario_mensaje,
        escalar_triggers: configExistente.escalar_triggers || form.escalar_triggers,
        activo: configExistente.activo ?? true,
        nombre_inmobiliaria: configExistente.nombre_inmobiliaria || '',
        brokers: configExistente.brokers || [],
        demora_respuesta_min: configExistente.demora_respuesta_min ?? 0,
      });
    }
  }, [configExistente]);

  // ── Guardar ──
  const guardar = useMutation({
    mutationFn: async () => {
      if (configExistente?.id) {
        return ConfigAgente.update(configExistente.id, { ...form, clave: 'general' });
      } else {
        return ConfigAgente.create({ ...form, clave: 'general' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['config_agente']);
      toast({ title: 'Configuración guardada' });
    },
    onError: () => toast({ title: 'Error al guardar', variant: 'destructive' }),
  });

  // ── Probar agente ──
  const probarAgente = async () => {
    setTestLoading(true);
    setTestRespuesta('');
    try {
      const res = await base44.functions.invoke('generateSEOContent', {
        action: 'test_agent',
        mensaje: testMensaje,
      });
      setTestRespuesta(res.data?.respuesta || 'Sin respuesta');
    } catch (err) {
      setTestRespuesta('Error: ' + (err?.message || 'desconocido'));
    } finally {
      setTestLoading(false);
    }
  };

  const agregarKnowledge = () => {
    if (!nuevoKnowledge.trim()) return;
    setForm((f) => ({ ...f, conocimiento_base: [...f.conocimiento_base, nuevoKnowledge.trim()] }));
    setNuevoKnowledge('');
  };

  const eliminarKnowledge = (i) => {
    setForm((f) => ({ ...f, conocimiento_base: f.conocimiento_base.filter((_, idx) => idx !== i) }));
  };

  const agregarTrigger = () => {
    if (!nuevoTrigger.trim()) return;
    setForm((f) => ({ ...f, escalar_triggers: [...f.escalar_triggers, nuevoTrigger.trim().toLowerCase()] }));
    setNuevoTrigger('');
  };

  const eliminarTrigger = (i) => {
    setForm((f) => ({ ...f, escalar_triggers: f.escalar_triggers.filter((_, idx) => idx !== i) }));
  };

  const agregarBroker = () => {
    if (!nuevoBroker.nombre.trim() || !nuevoBroker.telefono.trim()) return;
    const broker = {
      nombre: nuevoBroker.nombre.trim(),
      telefono: nuevoBroker.telefono.replace(/\D/g, ''),
      genero: nuevoBroker.genero,
      tipo_inmueble: nuevoBroker.tipo_inmueble,
      barrios: nuevoBroker.barrios
        .split(',')
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean),
    };
    setForm((f) => ({ ...f, brokers: [...(f.brokers || []), broker] }));
    setNuevoBroker({ nombre: '', telefono: '', genero: 'F', tipo_inmueble: 'ambos', barrios: '' });
  };

  const eliminarBroker = (i) => {
    setForm((f) => ({ ...f, brokers: f.brokers.filter((_, idx) => idx !== i) }));
  };

  // Permite fijar el género en asesores YA guardados sin tener que recrearlos.
  const setBrokerGenero = (i, genero) => {
    setForm((f) => ({ ...f, brokers: (f.brokers || []).map((b, idx) => (idx === i ? { ...b, genero } : b)) }));
  };

  const TIPO_LABEL = { vivienda: 'Vivienda', comercial: 'Comercial', ambos: 'Ambos' };
  const TIPO_COLOR = {
    vivienda: 'bg-blue-50 text-blue-700 border-blue-200',
    comercial: 'bg-orange-50 text-orange-700 border-orange-200',
    ambos:     'bg-violet-50 text-violet-700 border-violet-200',
  };

  // URL del webhook — endpoint de Base44 (distinto al frontend)
  const appHost = window.location.hostname; // ej: ndsoftware.base44.app
  const webhookUrl = `https://${appHost}/api/functions/webhookWhatsApp`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-violet-600" />
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Configurar Agente IA</h1>
          {configExistente && (
            <Badge variant={form.activo ? 'default' : 'secondary'} className="ml-2 flex items-center gap-1">
              {form.activo ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Activo</> : <><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Inactivo</>}
            </Badge>
          )}
        </div>
        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Estado activo */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Agente IA activo</p>
            <p className="text-sm text-gray-500">Cuando está activo, responde automáticamente a todos los leads por WhatsApp</p>
          </div>
          <Switch
            checked={form.activo}
            onCheckedChange={(v) => setForm((f) => ({ ...f, activo: v }))}
          />
        </CardContent>
      </Card>

      {/* Identidad */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> Identidad del agente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Nombre del agente</Label>
              <Input
                value={form.nombre_agente}
                onChange={(e) => setForm((f) => ({ ...f, nombre_agente: e.target.value }))}
                placeholder="ej: Valentina"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Nombre de la inmobiliaria</Label>
              <Input
                value={form.nombre_inmobiliaria}
                onChange={(e) => setForm((f) => ({ ...f, nombre_inmobiliaria: e.target.value }))}
                placeholder="ej: Inmobiliaria García"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm">Saludo inicial <span className="text-gray-400">(usa {"{{nombre}}"}, {"{{agente}}"}, {"{{inmobiliaria}}"}) </span></Label>
            <Textarea
              value={form.saludo_inicial}
              onChange={(e) => setForm((f) => ({ ...f, saludo_inicial: e.target.value }))}
              rows={2}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Demora humana */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> Demora de respuesta (para no parecer bot)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Input
              type="number" min="0" max="10"
              value={form.demora_respuesta_min}
              onChange={(e) => setForm((f) => ({ ...f, demora_respuesta_min: Number(e.target.value) || 0 }))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">minutos antes de responder cada mensaje</span>
          </div>
          <p className="text-xs text-amber-600">
            0 = responde al instante. Con más de 0, Valentina espera ese tiempo antes de contestar (más humano). REQUIERE el cron "enviarPendientes" corriendo cada minuto. Sin el cron, no responderá.
          </p>
        </CardContent>
      </Card>

      {/* Instrucciones */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Instrucciones del sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-2">
            Aquí defines la personalidad, el flujo de calificación y las reglas que sigue el agente.
          </p>
          <Textarea
            value={form.instrucciones_sistema}
            onChange={(e) => setForm((f) => ({ ...f, instrucciones_sistema: e.target.value }))}
            rows={12}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Knowledge base */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Base de conocimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Agrega FAQs, políticas, información de la inmobiliaria y cualquier dato que el agente deba conocer.
          </p>
          <div className="space-y-2">
            {form.conocimiento_base.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-700 flex-1">{item}</span>
                <button onClick={() => eliminarKnowledge(i)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Agregar nuevo conocimiento..."
              value={nuevoKnowledge}
              onChange={(e) => setNuevoKnowledge(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarKnowledge()}
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={agregarKnowledge}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Horario */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Horario de atención
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Hora inicio</Label>
              <Input
                type="time"
                value={form.horario_inicio}
                onChange={(e) => setForm((f) => ({ ...f, horario_inicio: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Hora fin</Label>
              <Input
                type="time"
                value={form.horario_fin}
                onChange={(e) => setForm((f) => ({ ...f, horario_fin: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm">Mensaje fuera de horario</Label>
            <Textarea
              value={form.fuera_de_horario_mensaje}
              onChange={(e) => setForm((f) => ({ ...f, fuera_de_horario_mensaje: e.target.value }))}
              rows={2}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Triggers de escalación */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" /> Palabras que escalan a humano
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Si el lead menciona alguna de estas palabras, la conversación se escala automáticamente a un agente humano.
          </p>
          <div className="flex flex-wrap gap-2">
            {form.escalar_triggers.map((trigger, i) => (
              <span key={i} className="flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2 py-1 rounded-full border border-orange-200">
                {trigger}
                <button onClick={() => eliminarTrigger(i)}>
                  <X className="w-3 h-3 hover:text-red-500" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Agregar palabra de escalación..."
              value={nuevoTrigger}
              onChange={(e) => setNuevoTrigger(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarTrigger()}
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={agregarTrigger}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Asesores / Brokers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Asesores / Brokers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Cuando un lead quede calificado, Valentina le envía un WhatsApp al asesor asignado según el tipo de inmueble y el barrio.
          </p>

          {/* Lista de brokers */}
          {(form.brokers || []).length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
              No hay asesores configurados — todos los leads calificados irán al número de fallback.
            </p>
          )}
          <div className="space-y-2">
            {(form.brokers || []).map((broker, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{broker.nombre}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TIPO_COLOR[broker.tipo_inmueble] || TIPO_COLOR.ambos}`}>
                      {TIPO_LABEL[broker.tipo_inmueble] || broker.tipo_inmueble}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    <span>{broker.telefono}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs text-gray-500">Trato:</span>
                    <select
                      value={broker.genero || ''}
                      onChange={(e) => setBrokerGenero(i, e.target.value)}
                      className="h-6 text-xs border rounded px-1.5 bg-white text-gray-700"
                    >
                      <option value="">Sin definir (neutro)</option>
                      <option value="F">Femenino (nuestra asesora)</option>
                      <option value="M">Masculino (nuestro asesor)</option>
                    </select>
                    {!broker.genero && (
                      <span className="text-[11px] text-amber-600">se dirá "especialista" hasta definirlo</span>
                    )}
                  </div>
                  {broker.barrios?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {broker.barrios.map((b, j) => (
                        <span key={j} className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => eliminarBroker(i)} className="text-gray-400 hover:text-red-500 mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Formulario de nuevo broker */}
          <div className="border rounded-lg p-3 space-y-2 bg-white">
            <p className="text-xs font-medium text-gray-700">Agregar asesor</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={nuevoBroker.nombre}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, nombre: e.target.value }))}
                  placeholder="ej: Alejandro"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Teléfono (con código país)</Label>
                <Input
                  value={nuevoBroker.telefono}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, telefono: e.target.value }))}
                  placeholder="ej: 573105771576"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Género <span className="text-gray-400">(para el trato correcto)</span></Label>
                <select
                  value={nuevoBroker.genero}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, genero: e.target.value }))}
                  className="mt-0.5 w-full h-8 text-sm border rounded-md px-2 bg-white"
                >
                  <option value="F">Femenino (nuestra asesora)</option>
                  <option value="M">Masculino (nuestro asesor)</option>
                  <option value="">Sin definir (neutro)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Tipo de inmueble</Label>
                <select
                  value={nuevoBroker.tipo_inmueble}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, tipo_inmueble: e.target.value }))}
                  className="mt-0.5 w-full h-8 text-sm border rounded-md px-2 bg-white"
                >
                  <option value="ambos">Ambos (vivienda y comercial)</option>
                  <option value="vivienda">Solo vivienda (apt, casa...)</option>
                  <option value="comercial">Solo comercial (oficina, local...)</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Barrios asignados <span className="text-gray-400">(separados por coma, opcional)</span></Label>
              <Input
                value={nuevoBroker.barrios}
                onChange={(e) => setNuevoBroker((b) => ({ ...b, barrios: e.target.value }))}
                placeholder="ej: chico, cabrera, rosales"
                className="mt-0.5 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={agregarBroker} className="gap-1">
              <Plus className="w-3 h-3" /> Agregar asesor
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Secretos necesarios en Base44 */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-4 h-4" /> Paso 1 — Agregar secretos en Base44
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-amber-700">Ve a <strong>Base44 → tu app → Settings → Secrets</strong> y agrega:</p>
          {[
            { key: 'ANTHROPIC_API_KEY', desc: 'Tu API key de Anthropic (console.anthropic.com → API Keys)', ok: true },
            { key: 'WHATSAPP_API_TOKEN', desc: 'Token permanente de Meta (Meta Business Suite → Usuarios del sistema → token con permisos whatsapp_business_messaging)', ok: false },
            { key: 'WHATSAPP_PHONE_NUMBER_ID', desc: 'ID del número en Meta Developer Console → WhatsApp → Configuración de API', ok: false },
            { key: 'WHATSAPP_VERIFY_TOKEN', desc: 'Cualquier string secreto que defines tú (ej: inmogest_2026)', ok: false },
          ].map(s => (
            <div key={s.key} className="flex items-start gap-2 text-xs">
              {s.ok
                ? <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                : <span className="w-3.5 h-3.5 rounded-full border border-amber-500 mt-0.5 flex-shrink-0" />
              }
              <div>
                <code className="font-bold">{s.key}</code>
                <span className="text-amber-700 ml-1">— {s.desc}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="w-4 h-4" /> Paso 2 — Configurar Webhook en Meta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            En <strong>Meta Developer Console → tu App → WhatsApp → Configuración → Webhooks</strong>, agrega:
          </p>
          <div>
            <p className="text-xs text-muted-foreground mb-1">URL del Webhook</p>
            <div className="flex items-center gap-2 p-3 bg-gray-900 rounded-lg">
              <code className="text-green-400 text-sm flex-1 break-all">{webhookUrl}</code>
              <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'URL copiada' }); }}>
                Copiar
              </Button>
            </div>
          </div>
          <div className="text-xs space-y-1 bg-gray-50 p-3 rounded-lg">
            <p><strong>Verify token:</strong> el mismo valor que pusiste en <code>WHATSAPP_VERIFY_TOKEN</code></p>
            <p><strong>Campos a suscribir:</strong> messages</p>
            <p><strong>Suscripción de la app:</strong> WhatsApp Business Account</p>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <strong>Tip:</strong> Para probar sin número real, Meta ofrece un número de prueba gratuito en el mismo panel de WhatsApp. Ideal para verificar que el agente funciona antes de conectar el número de producción.
          </div>
        </CardContent>
      </Card>

      {/* Probar agente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4" /> Probar el agente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Simula cómo respondería el agente a un mensaje de prueba. Recuerda guardar los cambios primero.
          </p>
          <div className="flex gap-2">
            <Input
              value={testMensaje}
              onChange={(e) => setTestMensaje(e.target.value)}
              placeholder="Escribe un mensaje de prueba..."
              className="flex-1"
            />
            <Button onClick={probarAgente} disabled={testLoading} className="gap-2">
              <Play className="w-4 h-4" />
              {testLoading ? 'Procesando...' : 'Probar'}
            </Button>
          </div>
          {testRespuesta && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-medium text-violet-700">Respuesta del agente {form.nombre_agente}:</span>
              </div>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{testRespuesta}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}