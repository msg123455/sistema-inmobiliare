import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserRole } from '@/hooks/useUserRole';
import PipelineKanban from '@/components/crm/PipelineKanban';
import AsignacionSocios from '@/components/crm/AsignacionSocios';
import TareasPendientesCRM from '@/components/crm/TareasPendientesCRM';
import NotasCRM from '@/components/crm/NotasCRM';

const EMPTY_CLIENTE = {
  nombre_empresa: '', dominio_web: '', contacto_nombre: '', contacto_email: '',
  contacto_telefono: '', consumo_promedio_mensual: '', costo_agua_mensual: '',
  valvulas_cantidades: {}, moneda: 'USD',
  socios_asignados: [], inversionistas_asignados: [],
  comercial_asignado: '',
};

export default function CRM() {
  const [showNewClienteForm, setShowNewClienteForm] = useState(false);
  const [newClienteData, setNewClienteData] = useState(EMPTY_CLIENTE);
  const queryClient = useQueryClient();
  const { isAdmin, isComercial, email: userEmail } = useUserRole();

  const [search, setSearch] = useState('');
  const [filterPais, setFilterPais] = useState('');
  const [filterCiudad, setFilterCiudad] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('');
  const [filterTag, setFilterTag] = useState('');

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: valvulas = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const { data: socios = [] } = useQuery({
    queryKey: ['socios'],
    queryFn: () => base44.entities.Socio.list(),
  });

  const { data: inversionistas = [] } = useQuery({
    queryKey: ['inversionistas'],
    queryFn: () => base44.entities.Inversionista.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const handleDeleteCliente = (clienteId) => {
    queryClient.setQueryData(['clientes'], (old) => (old || []).filter(c => c.id !== clienteId));
  };

  const handleMoveCliente = (cliente, nuevaEtapa) => {
    const updates = { etapa_pipeline: nuevaEtapa };
    if (nuevaEtapa === 'Activo' && !cliente.fecha_activacion) {
      updates.fecha_activacion = new Date().toISOString().split('T')[0];
    }
    queryClient.setQueryData(['clientes'], (old) =>
      (old || []).map(c => c.id === cliente.id ? { ...c, ...updates } : c)
    );
    base44.entities.Cliente.update(cliente.id, updates)
      .then(() => queryClient.invalidateQueries(['clientes']))
      .catch(() => queryClient.invalidateQueries(['clientes']));
  };

  const handleCrearCliente = async () => {
    const data = { ...newClienteData };
    if (data.consumo_promedio_mensual) data.consumo_promedio_mensual = parseFloat(data.consumo_promedio_mensual);
    else delete data.consumo_promedio_mensual;
    if (data.costo_agua_mensual) data.costo_agua_mensual = parseFloat(data.costo_agua_mensual);
    else delete data.costo_agua_mensual;
    if (!Object.keys(data.valvulas_cantidades || {}).length) delete data.valvulas_cantidades;
    if (!data.socios_asignados?.length) delete data.socios_asignados;
    if (!data.inversionistas_asignados?.length) delete data.inversionistas_asignados;
    if (isComercial) data.comercial_asignado = userEmail;
    if (!data.comercial_asignado) delete data.comercial_asignado;

    await base44.entities.Cliente.create(data);
    setNewClienteData(EMPTY_CLIENTE);
    setShowNewClienteForm(false);
    queryClient.invalidateQueries(['clientes']);
  };

  const paises = useMemo(() => [...new Set(clientes.map(c => c.pais_empresa).filter(Boolean))].sort(), [clientes]);
  const ciudades = useMemo(() => {
    const base = filterPais ? clientes.filter(c => c.pais_empresa === filterPais) : clientes;
    return [...new Set(base.map(c => c.ciudad_empresa).filter(Boolean))].sort();
  }, [clientes, filterPais]);

  const allTags = useMemo(() => [...new Set(clientes.flatMap(c => c.etiquetas || []))].sort(), [clientes]);

  const clientesFiltrados = useMemo(() => {
    const q = search.toLowerCase();
    return clientes.filter(c => {
      if (isComercial && c.comercial_asignado !== userEmail && c.created_by !== userEmail) return false;
      if (q && !c.nombre_empresa?.toLowerCase().includes(q) && !c.contacto_nombre?.toLowerCase().includes(q) && !c.ciudad_empresa?.toLowerCase().includes(q)) return false;
      if (filterPais && c.pais_empresa !== filterPais) return false;
      if (filterCiudad && c.ciudad_empresa !== filterCiudad) return false;
      if (filterEtapa && c.etapa_pipeline !== filterEtapa) return false;
      if (filterTag && !(c.etiquetas || []).includes(filterTag)) return false;
      return true;
    });
  }, [clientes, search, filterPais, filterCiudad, filterEtapa, filterTag, isComercial, userEmail]);

  const hasFilters = search || filterPais || filterCiudad || filterEtapa || filterTag;

  const clearFilters = () => { setSearch(''); setFilterPais(''); setFilterCiudad(''); setFilterEtapa(''); setFilterTag(''); };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Negocios</h1>
          <p className="text-sm text-muted-foreground mt-1">Hacé click en un cliente para ver su perfil completo</p>
        </div>
        <Button onClick={() => setShowNewClienteForm(true)} size="sm" className="gap-1.5 rounded-lg">
          <Plus className="w-4 h-4" /> Nuevo
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa o contacto…"
            className="pl-8 h-8 text-sm rounded-lg"
          />
        </div>

        {paises.length > 0 && (
          <Select value={filterPais || '__all__'} onValueChange={v => { setFilterPais(v === '__all__' ? '' : v); setFilterCiudad(''); }}>
            <SelectTrigger className="h-8 text-sm rounded-lg w-full sm:w-[140px]"><SelectValue placeholder="País" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los países</SelectItem>
              {paises.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {ciudades.length > 0 && (
          <Select value={filterCiudad || '__all__'} onValueChange={v => setFilterCiudad(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm rounded-lg w-full sm:w-[140px]"><SelectValue placeholder="Ciudad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las ciudades</SelectItem>
              {ciudades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={filterEtapa || '__all__'} onValueChange={v => setFilterEtapa(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm rounded-lg w-full sm:w-[160px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las etapas</SelectItem>
            <SelectItem value="Prospecto">Prospecto</SelectItem>
            <SelectItem value="Lead">Lead</SelectItem>
            <SelectItem value="Evaluacion_tecnica">Hacer Evaluación Técnica</SelectItem>
            <SelectItem value="Instalacion">Pendiente Instalación</SelectItem>
            <SelectItem value="Activo">Activo</SelectItem>
          </SelectContent>
        </Select>

        {allTags.length > 0 && (
          <Select value={filterTag || '__all__'} onValueChange={v => setFilterTag(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm rounded-lg w-full sm:w-[140px]"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las etiquetas</SelectItem>
              {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center justify-center gap-1 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors col-span-2 sm:col-span-1">
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}

        {hasFilters && (
          <span className="text-xs text-muted-foreground sm:ml-auto col-span-2 sm:col-span-1">
            {clientesFiltrados.length} de {clientes.length}
          </span>
        )}
      </div>

      <PipelineKanban
        clientes={clientesFiltrados}
        onMoveCliente={handleMoveCliente}
        onDeleteCliente={handleDeleteCliente}
      />

      <TareasPendientesCRM />
      <NotasCRM />

      {showNewClienteForm && (
        <div className="bg-card rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Nuevo Negocio</h2>
          <div className="space-y-3">

            {/* Contacto */}
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datos del negocio</h3>
            <Input
              value={newClienteData.nombre_empresa}
              onChange={(e) => setNewClienteData({ ...newClienteData, nombre_empresa: e.target.value })}
              placeholder="Empresa"
              className="rounded-lg"
            />
            <Input
              value={newClienteData.dominio_web}
              onChange={(e) => setNewClienteData({ ...newClienteData, dominio_web: e.target.value })}
              placeholder="Dominio web (ej: cocacola.com)"
              className="rounded-lg"
            />
            <Input
              value={newClienteData.contacto_nombre}
              onChange={(e) => setNewClienteData({ ...newClienteData, contacto_nombre: e.target.value })}
              placeholder="Contacto"
              className="rounded-lg"
            />
            <Input
              type="email"
              value={newClienteData.contacto_email}
              onChange={(e) => setNewClienteData({ ...newClienteData, contacto_email: e.target.value })}
              placeholder="Email"
              className="rounded-lg"
            />
            <Input
              value={newClienteData.contacto_telefono}
              onChange={(e) => setNewClienteData({ ...newClienteData, contacto_telefono: e.target.value })}
              placeholder="Teléfono (opcional)"
              className="rounded-lg"
            />

            {/* Costeo */}
            <div className="border-t border-border/40 pt-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Costeo (opcional)</h3>
              <Select value={newClienteData.moneda} onValueChange={(val) => setNewClienteData({ ...newClienteData, moneda: val })}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — Dólar</SelectItem>
                  <SelectItem value="COP">COP — Peso Colombiano</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs text-muted-foreground">Consumo/Mes (m³)</label>
                  <Input
                    type="number"
                    value={newClienteData.consumo_promedio_mensual}
                    onChange={(e) => setNewClienteData({ ...newClienteData, consumo_promedio_mensual: e.target.value })}
                    placeholder="100"
                    className="mt-1 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Costo Agua/Mes</label>
                  <Input
                    type="number"
                    value={newClienteData.costo_agua_mensual}
                    onChange={(e) => setNewClienteData({ ...newClienteData, costo_agua_mensual: e.target.value })}
                    placeholder="500"
                    className="mt-1 rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs text-muted-foreground">Válvulas</label>
                <div className="mt-1 space-y-2">
                  {[...valvulas].sort((a, b) => b.pulgadas - a.pulgadas).map((v) => {
                    const qty = (newClienteData.valvulas_cantidades || {})[v.id] || 0;
                    return (
                      <div key={v.id} className="flex items-center gap-3 px-3 py-2 bg-muted/40 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{v.nombre}</p>
                          <p className="text-xs text-muted-foreground">${v.costo_compra} USD</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => {
                            const updated = { ...(newClienteData.valvulas_cantidades || {}) };
                            const nq = Math.max(0, qty - 1);
                            if (nq === 0) delete updated[v.id]; else updated[v.id] = nq;
                            setNewClienteData({ ...newClienteData, valvulas_cantidades: updated });
                          }} className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted">−</button>
                          <span className="w-8 text-center text-sm font-medium">{qty}</span>
                          <button type="button" onClick={() => {
                            setNewClienteData({ ...newClienteData, valvulas_cantidades: { ...(newClienteData.valvulas_cantidades || {}), [v.id]: qty + 1 } });
                          }} className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Comercial asignado — solo admin */}
            {isAdmin && (
              <div className="border-t border-border/40 pt-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Comercial responsable</h3>
                <select
                  value={newClienteData.comercial_asignado}
                  onChange={e => setNewClienteData({ ...newClienteData, comercial_asignado: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— Sin asignar —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.email}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Asignaciones */}
            <div className="border-t border-border/40 pt-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Asignaciones</h3>
              <AsignacionSocios
                socios={socios}
                inversionistas={inversionistas}
                value={{
                  socios: newClienteData.socios_asignados,
                  inversionistas: newClienteData.inversionistas_asignados,
                }}
                onChange={({ socios, inversionistas }) =>
                  setNewClienteData({ ...newClienteData, socios_asignados: socios, inversionistas_asignados: inversionistas })
                }
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleCrearCliente} className="flex-1 rounded-lg" disabled={!newClienteData.nombre_empresa.trim()}>Crear</Button>
              <Button onClick={() => { setShowNewClienteForm(false); setNewClienteData(EMPTY_CLIENTE); }} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}