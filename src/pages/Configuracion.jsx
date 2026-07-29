import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, Settings, ShieldCheck, Shield } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MyProfile from '@/components/perfiles/MyProfile';
import TeamList from '@/components/perfiles/TeamList';
import IntegracionesTab from '@/components/config/IntegracionesTab';
import { useUserRole } from '@/hooks/useUserRole';

export default function Configuracion() {
  const [showNewValvula, setShowNewValvula] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', pulgadas: '', costo_compra: '' });
  const [currentUser, setCurrentUser] = useState(null);
  const [porcentajeInput, setPorcentajeInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  
  const queryClientHook = useQueryClient();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: valvulas = [], isLoading, refetch } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: appConfigs = [], isLoading: loadingConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const configGeneral = appConfigs.find(c => c.clave === 'general');

  useEffect(() => {
    if (configGeneral) {
      setPorcentajeInput(configGeneral.porcentaje_ahorro_global ?? 15);
    }
  }, [configGeneral]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const valor = parseFloat(porcentajeInput) || 15;
    if (configGeneral) {
      await base44.entities.AppConfig.update(configGeneral.id, { porcentaje_ahorro_global: valor });
    } else {
      await base44.entities.AppConfig.create({ clave: 'general', porcentaje_ahorro_global: valor });
    }
    queryClientHook.invalidateQueries({ queryKey: ['app-config'] });
    setSavingConfig(false);
  };

  const handleSave = async () => {
    if (editingId) {
      await base44.entities.Valvula.update(editingId, { nombre: formData.nombre, pulgadas: parseFloat(formData.pulgadas), costo_compra: parseFloat(formData.costo_compra) });
    } else {
      await base44.entities.Valvula.create({ nombre: formData.nombre, pulgadas: parseFloat(formData.pulgadas), costo_compra: parseFloat(formData.costo_compra) });
    }
    setFormData({ nombre: '', pulgadas: '', costo_compra: '' });
    setShowNewValvula(false);
    setEditingId(null);
    refetch();
  };

  const handleEdit = (valvula) => {
    setFormData({ nombre: valvula.nombre, pulgadas: valvula.pulgadas, costo_compra: valvula.costo_compra });
    setEditingId(valvula.id);
    setShowNewValvula(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Valvula.delete(id);
    refetch();
  };

  if (isLoading || loadingUsers || loadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Configuración</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">Válvulas, perfil y equipo</p>
      </div>

      <Tabs defaultValue="valvulas" className="w-full">
        <TabsList className="flex gap-1 bg-muted/40 rounded-xl p-1 h-auto">
          <TabsTrigger value="valvulas" className="px-3.5 py-2 rounded-lg text-sm font-medium">Válvulas</TabsTrigger>
          <TabsTrigger value="general" className="px-3.5 py-2 rounded-lg text-sm font-medium">General</TabsTrigger>
          <TabsTrigger value="perfiles" className="px-3.5 py-2 rounded-lg text-sm font-medium">Perfiles</TabsTrigger>
          <TabsTrigger value="integraciones" className="px-3.5 py-2 rounded-lg text-sm font-medium">Integraciones</TabsTrigger>
        </TabsList>

        <TabsContent value="perfiles" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MyProfile user={currentUser} />
            <TeamList users={users} currentUserId={currentUser?.id} />
          </div>
          {isAdmin && <RolesPanel users={users} queryClient={queryClientHook} />}
        </TabsContent>

        <TabsContent value="general" className="mt-4 space-y-4">
          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Parámetros Globales</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Porcentaje de ahorro por defecto (%)</label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">Este valor se usa cuando un cliente no tiene un porcentaje personalizado.</p>
                <div className="flex gap-2 items-end">
                  <Input
                    type="number"
                    value={porcentajeInput}
                    onChange={(e) => setPorcentajeInput(e.target.value)}
                    placeholder="15"
                    className="rounded-lg w-32"
                    min="0"
                    max="100"
                  />
                  <span className="text-sm text-muted-foreground mb-2">%</span>
                  <Button onClick={handleSaveConfig} disabled={savingConfig} size="sm" className="rounded-lg">
                    {savingConfig ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="valvulas" className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowNewValvula(true)} size="sm" className="gap-1.5 rounded-lg">
          <Plus className="w-4 h-4" /> Nueva Válvula
        </Button>
      </div>

      <div className="bg-card rounded-xl overflow-hidden">
        {valvulas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No hay válvulas registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pulgadas</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[...valvulas].sort((a, b) => b.pulgadas - a.pulgadas).map((valvula) => (
                  <tr key={valvula.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{valvula.nombre}</td>
                    <td className="px-4 py-3 text-foreground">{valvula.pulgadas}"</td>
                    <td className="px-4 py-3 text-foreground">${valvula.costo_compra?.toFixed(2)}</td>
                    <td className="px-4 py-3 flex gap-1 justify-end">
                      <button onClick={() => handleEdit(valvula)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(valvula.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewValvula && (
        <div className="bg-card rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{editingId ? 'Editar Válvula' : 'Nueva Válvula'}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <Input value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} placeholder="Válvula Estándar" className="mt-1 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Pulgadas</label>
                <Input type="number" step="0.5" value={formData.pulgadas} onChange={(e) => setFormData({ ...formData, pulgadas: e.target.value })} placeholder="1.5" className="mt-1 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Costo ($)</label>
                <Input type="number" value={formData.costo_compra} onChange={(e) => setFormData({ ...formData, costo_compra: e.target.value })} placeholder="1200" className="mt-1 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} className="flex-1 rounded-lg">{editingId ? 'Actualizar' : 'Crear'}</Button>
              <Button onClick={() => { setShowNewValvula(false); setEditingId(null); setFormData({ nombre: '', pulgadas: '', costo_compra: '' }); }} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
            </div>
          </div>
        </div>
      )}
        </TabsContent>
        <TabsContent value="integraciones" className="mt-4">
          <IntegracionesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ADMIN_EMAIL = 'ms@grouptso.com';

function RolesPanel({ users, queryClient }) {
  const { data: perfiles = [], refetch } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
  });

  const [saving, setSaving] = useState(null);

  const getPerfilRol = (email) => {
    if (email === ADMIN_EMAIL) return 'Admin';
    return perfiles.find(p => p.email === email)?.rol ?? 'Comercial';
  };

  const handleChangeRol = async (user, nuevoRol) => {
    if (user.email === ADMIN_EMAIL) return;
    setSaving(user.email);
    const existing = perfiles.find(p => p.email === user.email);
    if (existing) {
      await base44.entities.PerfilUsuario.update(existing.id, { rol: nuevoRol });
    } else {
      await base44.entities.PerfilUsuario.create({ email: user.email, nombre: user.full_name, rol: nuevoRol });
    }
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['perfiles-usuario'] });
    setSaving(null);
  };

  return (
    <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Roles y accesos</h2>
        <span className="text-xs text-muted-foreground ml-1">Solo visible para Admin</span>
      </div>
      <div className="divide-y divide-border/20">
        {users.map(user => {
          const rol = getPerfilRol(user.email);
          const isOwner = user.email === ADMIN_EMAIL;
          return (
            <div key={user.id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(user.full_name || user.email || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.full_name || user.email}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              {isOwner ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full flex-shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              ) : (
                <select
                  value={rol}
                  disabled={saving === user.email}
                  onChange={e => handleChangeRol(user, e.target.value)}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-shrink-0"
                >
                  <option value="Admin">Admin</option>
                  <option value="Comercial">Comercial</option>
                </select>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">No hay usuarios registrados</p>
        )}
      </div>
    </div>
  );
}