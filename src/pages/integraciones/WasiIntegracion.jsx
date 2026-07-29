import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, RefreshCw, Link2, Upload, Download, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const WasiConfig = base44.entities.WasiConfig;
const Propiedad = base44.entities.Propiedad;
const Contacto = base44.entities.Contacto;

function StatusIndicator({ estado }) {
  const map = {
    Conectado: { icon: CheckCircle2, color: 'text-green-500', label: 'Conectado' },
    Desconectado: { icon: XCircle, color: 'text-red-500', label: 'Desconectado' },
    Error: { icon: AlertCircle, color: 'text-red-500', label: 'Error' },
    No_configurado: { icon: AlertCircle, color: 'text-amber-500', label: 'No configurado' },
  };
  const { icon: Icon, color, label } = map[estado] || map.No_configurado;
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default function WasiIntegracion() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configForm, setConfigForm] = useState({ api_key: '', user_id: '' });
  const [savingConfig, setSavingConfig] = useState(false);

  const { data: configs = [] } = useQuery({ queryKey: ['wasi-config'], queryFn: () => WasiConfig.list() });
  const { data: propiedades = [] } = useQuery({ queryKey: ['propiedades'], queryFn: () => Propiedad.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });

  const config = configs[0];

  useEffect(() => {
    if (config) setConfigForm({ api_key: config.api_key || '', user_id: config.user_id || '' });
  }, [config]);

  const propPublicadas = propiedades.filter(p => p.publicado_wasi);
  const propSinPublicar = propiedades.filter(p => !p.publicado_wasi && p.estado === 'Disponible');
  const leadsWasi = contactos.filter(c => c.fuente_wasi);

  const handleGuardarConfig = async () => {
    if (!configForm.api_key || !configForm.user_id) { toast.error('API Key y User ID son obligatorios'); return; }
    setSavingConfig(true);
    try {
      const data = { ...configForm, clave: 'general', activo: true, estado_conexion: 'Desconectado' };
      if (config?.id) await WasiConfig.update(config.id, data);
      else await WasiConfig.create(data);
      qc.invalidateQueries({ queryKey: ['wasi-config'] });
      toast.success('Configuración guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingConfig(false); }
  };

  const handleTestConexion = async () => {
    setTesting(true);
    try {
      await base44.functions.syncWasi({ direction: 'test' });
      if (config?.id) {
        await WasiConfig.update(config.id, { estado_conexion: 'Conectado' });
        qc.invalidateQueries({ queryKey: ['wasi-config'] });
      }
      toast.success('Conexión exitosa con WASI.co');
    } catch (err) {
      if (config?.id) {
        await WasiConfig.update(config.id, { estado_conexion: 'Error' });
        qc.invalidateQueries({ queryKey: ['wasi-config'] });
      }
      toast.error(err?.message || 'Error de conexión. Verifica tu API Key y User ID en Base44 Secrets.');
    } finally { setTesting(false); }
  };

  const handleSync = async (direction) => {
    setSyncing(true);
    try {
      const res = await base44.functions.syncWasi({ direction });
      const props = res?.propiedades || 0;
      const leads = res?.leads || 0;
      const imported = res?.propiedades_importadas || 0;
      if (config?.id) {
        await WasiConfig.update(config.id, {
          ultimo_sync: new Date().toISOString(),
          propiedades_sincronizadas: (config.propiedades_sincronizadas || 0) + props,
          leads_importados: (config.leads_importados || 0) + leads,
          estado_conexion: 'Conectado',
        });
      }
      qc.invalidateQueries({ queryKey: ['wasi-config', 'propiedades', 'contactos'] });
      if (direction === 'import_properties') {
        const errores = res?.errores || 0;
        toast.success(`Importación completada: ${props} propiedades sincronizadas (${imported} nuevas${errores ? `, ${errores} errores` : ''})`);
      } else {
        toast.success(`Sync completado: ${props} propiedades, ${leads} leads`);
      }
    } catch (err) {
      toast.error(err?.message || 'Error durante la sincronización. Verifica la configuración en Base44 Secrets.');
    } finally { setSyncing(false); }
  };

  const handlePublicarPropiedad = async (propiedad) => {
    try {
      await base44.functions.syncWasi({ direction: 'push', propiedad_id: propiedad.id });
      await Propiedad.update(propiedad.id, { publicado_wasi: true });
      qc.invalidateQueries({ queryKey: ['propiedades'] });
      toast.success(`${propiedad.titulo} publicada en WASI`);
    } catch {
      toast.error('Error al publicar en WASI. Verifica la configuración.');
    }
  };

  const logSync = config?.log_sync || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Integración WASI</h1>
        <p className="text-muted-foreground text-[15px] mt-0.5">Sincroniza tus propiedades y leads con WASI.co</p>
      </div>

      {/* Status y config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Estado de conexión</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatusIndicator estado={config?.estado_conexion || 'No_configurado'} />
            {config?.ultimo_sync && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Último sync: {format(new Date(config.ultimo_sync), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{config?.propiedades_sincronizadas || 0}</p>
                <p className="text-xs text-muted-foreground">Propiedades sync</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{config?.leads_importados || 0}</p>
                <p className="text-xs text-muted-foreground">Leads importados</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleTestConexion} disabled={testing}>
                <Link2 className="w-4 h-4 mr-1" />{testing ? 'Verificando...' : 'Probar conexión'}
              </Button>
              <Button className="flex-1" onClick={() => handleSync('both')} disabled={syncing}>
                <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleSync('push')} disabled={syncing}>
                <Upload className="w-3 h-3 mr-1" />Subir a WASI
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleSync('pull')} disabled={syncing}>
                <Download className="w-3 h-3 mr-1" />Importar leads
              </Button>
            </div>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleSync('import_properties')}
              disabled={syncing}
            >
              <Download className="w-4 h-4 mr-2" />
              {syncing ? 'Importando...' : 'Importar propiedades desde WASI (con fotos)'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Configuración API</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>API Key de WASI.co</Label>
              <Input
                type="password"
                placeholder="Ingresa tu API Key"
                value={configForm.api_key}
                onChange={e => setConfigForm(p => ({ ...p, api_key: e.target.value }))}
              />
            </div>
            <div>
              <Label>User ID de WASI.co</Label>
              <Input
                placeholder={config?.user_id || 'Ingresa tu User ID'}
                value={configForm.user_id}
                onChange={e => setConfigForm(p => ({ ...p, user_id: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Encuentra tu API Key en: WASI.co → Configuración → Integraciones → API
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={config?.auto_sync_activo || false}
                onCheckedChange={async v => {
                  if (config?.id) await WasiConfig.update(config.id, { auto_sync_activo: v });
                  qc.invalidateQueries({ queryKey: ['wasi-config'] });
                }}
              />
              <Label className="text-sm">Sync automático cada {config?.auto_sync_horas || 6} horas</Label>
            </div>
            <Button className="w-full" onClick={handleGuardarConfig} disabled={savingConfig}>
              {savingConfig ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="propiedades">
        <TabsList>
          <TabsTrigger value="propiedades">Propiedades ({propiedades.length})</TabsTrigger>
          <TabsTrigger value="leads">Leads de WASI ({leadsWasi.length})</TabsTrigger>
          <TabsTrigger value="log">Log de sync ({logSync.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="propiedades" className="mt-4 space-y-2">
          <div className="flex gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500" />{propPublicadas.length} publicadas en WASI</span>
            <span className="flex items-center gap-1"><XCircle className="w-4 h-4 text-red-400" />{propSinPublicar.length} disponibles sin publicar</span>
          </div>
          {propiedades.map(p => (
            <Card key={p.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.titulo}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{p.tipo}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.estado}</Badge>
                    {p.ciudad && <span className="text-xs text-muted-foreground">{p.ciudad}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {p.publicado_wasi ? (
                    <Badge className="text-xs bg-green-100 text-green-700">
                      <CheckCircle2 className="w-3 h-3 mr-1" />En WASI
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handlePublicarPropiedad(p)}>
                      <Upload className="w-3 h-3 mr-1" />Publicar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="leads" className="mt-4 space-y-2">
          {leadsWasi.length === 0 ? (
            <div className="text-center py-10">
              <Download className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Sin leads importados de WASI aún.</p>
              <p className="text-sm text-muted-foreground mt-1">Haz click en "Pull leads" para importar.</p>
            </div>
          ) : leadsWasi.map(c => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">{c.telefono} · {c.email}</p>
                  <p className="text-xs text-muted-foreground">Interés: {c.tipo_interes} · Etapa: {c.etapa_pipeline}</p>
                </div>
                <Badge className="text-[10px] bg-blue-100 text-blue-700">WASI</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="log" className="mt-4 space-y-2">
          {logSync.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Sin historial de sincronizaciones</div>
          ) : [...logSync].reverse().map((entry, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-1.5 rounded-full flex-shrink-0 ${entry.error ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  {entry.error ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.tipo?.replace('_', ' ')} — {entry.resultado}</p>
                  {entry.error && <p className="text-xs text-red-500">{entry.error}</p>}
                  <p className="text-xs text-muted-foreground">
                    {entry.propiedades} props · {entry.leads} leads
                  </p>
                </div>
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  {entry.fecha ? format(new Date(entry.fecha), 'dd MMM HH:mm', { locale: es }) : ''}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}