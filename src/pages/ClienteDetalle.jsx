import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, FolderOpen, MessageSquare, Clock, Gauge, Trash2, MapPin, TrendingUp, Tag, X as XIcon, Plus, FileDown, CalendarPlus, Receipt, Calculator, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';

import { useUserRole } from '@/hooks/useUserRole';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { gcalEventLink } from '@/lib/gcal';
import ClienteProfileCard from '@/components/crm/ClienteProfileCard';
import DocumentosCliente from '@/components/crm/DocumentosCliente';
import EditClienteForm from '@/components/crm/EditClienteForm';
import PresionCliente from '@/components/crm/PresionCliente';
import AsignacionSocios from '@/components/crm/AsignacionSocios';
import UbicacionValvula from '@/components/crm/UbicacionValvula';

const TABS = [
  { key: 'perfil',     label: 'Perfil',      icon: User },
  { key: 'documentos', label: 'Documentos',  icon: FolderOpen },
  { key: 'notas',      label: 'Notas',       icon: MessageSquare },
  { key: 'tareas',     label: 'Tareas',      icon: Clock },
  { key: 'tecnico',    label: 'Técnico',     icon: Gauge },
  { key: 'costeo',     label: 'Costeo',      icon: Calculator },
  { key: 'ahorros',    label: 'Ahorros',     icon: TrendingUp },
  { key: 'ubicacion',  label: 'Ubicación',   icon: MapPin },
];

const CANAL_LABELS = {
  Prospecto_propio: 'Prospecto propio', Referido_cliente: 'Referido por cliente',
  Referido_socio: 'Referido por socio', Publicidad: 'Publicidad',
  Evento: 'Evento', Otro: 'Otro',
};

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isConnected: calConnected, createEvent: createCalEvent } = useGoogleCalendar();
  const { isAdmin, email: userEmail } = useUserRole();
  const { convert, formatCurrency } = useCurrencyRates();
  const [tab, setTab] = useState('perfil');
  const [editingCliente, setEditingCliente] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newNota, setNewNota] = useState('');
  const [newTarea, setNewTarea] = useState({ titulo: '', fecha_limite: '', hora: '', asignado_a: '' });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => {
      const list = await base44.entities.Cliente.list();
      return list.find(c => c.id === id) || null;
    },
  });

  const { data: notas = [], refetch: refetchNotas } = useQuery({
    queryKey: ['notas', id],
    queryFn: () => base44.entities.Nota.list(),
    enabled: !!id,
  });

  const { data: tareas = [], refetch: refetchTareas } = useQuery({
    queryKey: ['tareas', id],
    queryFn: () => base44.entities.Tarea.list(),
    enabled: !!id,
  });

  const { data: usersRaw = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 0,
  });
  const users = usersRaw.length > 0 ? usersRaw
    : currentUser ? [{ id: currentUser.id, email: currentUser.email, full_name: currentUser.full_name }]
    : [];

  const { data: socios = [] } = useQuery({
    queryKey: ['socios'],
    queryFn: () => base44.entities.Socio.list(),
  });

  const { data: inversionistas = [] } = useQuery({
    queryKey: ['inversionistas'],
    queryFn: () => base44.entities.Inversionista.list(),
  });

  const { data: valvulas = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const [asignaciones, setAsignaciones] = useState(null);
  const [savingAsig, setSavingAsig] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newAhorro, setNewAhorro] = useState({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, ahorro_m3: '', ahorro_usd: '', consumo_real_m3: '' });
  const [savingAhorro, setSavingAhorro] = useState(false);
  const [facturaInput, setFacturaInput] = useState('');
  const [savingFacturas, setSavingFacturas] = useState(false);
  const [costeoForm, setCosteoForm] = useState(null);
  const [savingCosteo, setSavingCosteo] = useState(false);

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
    staleTime: 60_000,
  });

  const { data: ahorros = [], refetch: refetchAhorros } = useQuery({
    queryKey: ['ahorros', id],
    queryFn: () => base44.entities.AhorroMensual.list(),
    enabled: !!id,
  });

  useEffect(() => {
    if (cliente && asignaciones === null) {
      setAsignaciones({
        socios: cliente.socios_asignados || [],
        inversionistas: cliente.inversionistas_asignados || [],
      });
    }
  }, [cliente]);

  useEffect(() => {
    if (cliente && costeoForm === null) {
      setCosteoForm({
        moneda: cliente.moneda || 'USD',
        porcentaje_ahorro: cliente.porcentaje_ahorro || '',
        contrato_anios: cliente.contrato_anios || '',
        consumo_promedio_mensual: cliente.consumo_promedio_mensual || '',
        valvulas_cantidades: { ...(cliente.valvulas_cantidades || {}) },
      });
    }
  }, [cliente]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Cliente no encontrado</p>
        <Button onClick={() => navigate('/crm')} variant="outline" className="mt-4 rounded-lg">Volver al CRM</Button>
      </div>
    );
  }

  const notasDelCliente = notas.filter(n => n.cliente_id === id);
  const tareasDelCliente = tareas.filter(t => t.cliente_id === id);

  const handleUpdate = (updated) => {
    queryClient.setQueryData(['cliente', id], updated);
    queryClient.invalidateQueries(['clientes']);
  };

  const handleDelete = async () => {
    await base44.entities.Cliente.delete(id);
    queryClient.invalidateQueries(['clientes']);
    navigate('/crm');
  };

  const handleSaveAsignaciones = async () => {
    if (!asignaciones) return;
    setSavingAsig(true);
    const updated = {
      ...cliente,
      socios_asignados: asignaciones.socios,
      inversionistas_asignados: asignaciones.inversionistas,
    };
    await base44.entities.Cliente.update(id, {
      socios_asignados: asignaciones.socios,
      inversionistas_asignados: asignaciones.inversionistas,
    });
    handleUpdate(updated);
    setSavingAsig(false);
  };

  const handleAgregarNota = async () => {
    if (!newNota.trim()) return;
    await base44.entities.Nota.create({ cliente_id: id, texto: newNota, fecha_nota: new Date().toISOString() });
    setNewNota('');
    refetchNotas();
  };

  const handleAgregarTarea = async () => {
    if (!newTarea.titulo || !newTarea.fecha_limite) return;
    const assignee = newTarea.asignado_a || currentUser?.email || '';
    await base44.entities.Tarea.create({
      cliente_id: id,
      titulo: newTarea.titulo,
      fecha_limite: newTarea.fecha_limite,
      hora: newTarea.hora || undefined,
      asignado_a: assignee,
    });

    // Send email with Google Calendar link to assignee
    if (assignee) {
      const fechaStr = new Date(newTarea.fecha_limite).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      const horaStr = newTarea.hora ? ` a las ${newTarea.hora}` : '';
      const calLink = gcalEventLink({
        titulo: `${newTarea.titulo} — ${cliente?.nombre_empresa || ''}`,
        fecha_limite: newTarea.fecha_limite,
        hora: newTarea.hora || '',
        descripcion: `Cliente: ${cliente?.nombre_empresa || ''}`,
      });
      const calSection = calLink ? `\n\nAñadir al Google Calendar:\n${calLink}` : '';
      base44.integrations.Core.SendEmail({
        to: assignee,
        subject: `Tarea asignada: ${newTarea.titulo}`,
        body: `Hola,\n\nSe te asignó una tarea en AquaROI.\n\nCliente: ${cliente?.nombre_empresa || ''}\nTarea: ${newTarea.titulo}\nFecha: ${fechaStr}${horaStr}${calSection}\n\nAquaROI`,
        from_name: 'AquaROI',
      }).catch(() => {});
    }

    // Auto-create event in current user's Google Calendar if connected
    if (calConnected) {
      createCalEvent({
        titulo: `${newTarea.titulo} — ${cliente?.nombre_empresa || ''}`,
        fecha_limite: newTarea.fecha_limite,
        hora: newTarea.hora || '',
        descripcion: `Cliente: ${cliente?.nombre_empresa || ''}`,
      }).catch(() => {});
    }

    setNewTarea({ titulo: '', fecha_limite: '', hora: '', asignado_a: '' });
    refetchTareas();
  };

  const handleCompletarTarea = async (tarea) => {
    await base44.entities.Tarea.update(tarea.id, { completada: !tarea.completada });
    refetchTareas();
  };

  const handleEliminarTarea = async (tareaId) => {
    await base44.entities.Tarea.delete(tareaId);
    refetchTareas();
  };

  const handleAddTag = async (tag) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const existing = cliente.etiquetas || [];
    if (existing.includes(t)) return;
    const updated = [...existing, t];
    await base44.entities.Cliente.update(id, { etiquetas: updated });
    handleUpdate({ ...cliente, etiquetas: updated });
    setNewTag('');
  };

  const handleRemoveTag = async (tag) => {
    const updated = (cliente.etiquetas || []).filter(t => t !== tag);
    await base44.entities.Cliente.update(id, { etiquetas: updated });
    handleUpdate({ ...cliente, etiquetas: updated });
  };

  const handleGuardarAhorro = async () => {
    if (!newAhorro.ahorro_usd) return;
    setSavingAhorro(true);
    await base44.entities.AhorroMensual.create({
      cliente_id: id,
      anio: parseInt(newAhorro.anio),
      mes: parseInt(newAhorro.mes),
      ahorro_m3: parseFloat(newAhorro.ahorro_m3) || null,
      ahorro_usd: parseFloat(newAhorro.ahorro_usd),
      consumo_real_m3: parseFloat(newAhorro.consumo_real_m3) || null,
    });
    setNewAhorro({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, ahorro_m3: '', ahorro_usd: '', consumo_real_m3: '' });
    setSavingAhorro(false);
    refetchAhorros();
  };

  const handleAgregarFactura = async () => {
    const val = parseFloat(facturaInput);
    if (!val || val <= 0) return;
    setSavingFacturas(true);
    const existing = cliente.facturas_historicas || [];
    const newList = [...existing, val];
    const promedio = newList.reduce((s, f) => s + f, 0) / newList.length;
    const updated = { ...cliente, facturas_historicas: newList, costo_agua_mensual: promedio };
    await base44.entities.Cliente.update(id, { facturas_historicas: newList, costo_agua_mensual: promedio });
    handleUpdate(updated);
    setFacturaInput('');
    setSavingFacturas(false);
  };

  const handleEliminarFactura = async (idx) => {
    setSavingFacturas(true);
    const existing = cliente.facturas_historicas || [];
    const newList = existing.filter((_, i) => i !== idx);
    const promedio = newList.length > 0 ? newList.reduce((s, f) => s + f, 0) / newList.length : null;
    const updated = { ...cliente, facturas_historicas: newList, costo_agua_mensual: promedio };
    await base44.entities.Cliente.update(id, { facturas_historicas: newList, costo_agua_mensual: promedio });
    handleUpdate(updated);
    setSavingFacturas(false);
  };

  const handleSaveCosteo = async () => {
    if (!costeoForm) return;
    setSavingCosteo(true);
    const data = {
      moneda: costeoForm.moneda,
      valvulas_cantidades: costeoForm.valvulas_cantidades,
      porcentaje_ahorro: costeoForm.porcentaje_ahorro !== '' ? parseFloat(costeoForm.porcentaje_ahorro) : null,
      contrato_anios: costeoForm.contrato_anios !== '' ? parseFloat(costeoForm.contrato_anios) : null,
      consumo_promedio_mensual: costeoForm.consumo_promedio_mensual !== '' ? parseFloat(costeoForm.consumo_promedio_mensual) : null,
    };
    await base44.entities.Cliente.update(id, data);
    handleUpdate({ ...cliente, ...data });
    setSavingCosteo(false);
  };

  const handleExportReporte = () => {
    const etapa = cliente.etapa_pipeline?.replace('_', ' ') || '';
    const ahorrosDelCliente = ahorros.filter(a => a.cliente_id === id).sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
    const totalAhorroUSD = ahorrosDelCliente.reduce((s, a) => s + (a.ahorro_usd || 0), 0);
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Reporte ${cliente.nombre_empresa}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:40px;color:#111;max-width:680px}
      h1{font-size:22px;font-weight:700;margin-bottom:4px} h2{font-size:13px;color:#666;margin:0 0 24px}
      .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}
      .kpi{background:#f8f9fa;border-radius:10px;padding:16px} .kpi p{margin:0;font-size:11px;color:#888}
      .kpi h3{margin:4px 0 0;font-size:22px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
      th{text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;color:#666;font-weight:600;font-size:11px;text-transform:uppercase}
      td{padding:8px;border-bottom:1px solid #f3f4f6} .footer{margin-top:40px;font-size:10px;color:#aaa}
      @media print{body{margin:20px}}
    </style></head><body>
    <h1>${cliente.nombre_empresa}</h1>
    <h2>${cliente.ciudad_empresa ? cliente.ciudad_empresa + ' · ' : ''}${etapa}</h2>
    ${cliente.contacto_nombre ? `<p style="font-size:13px;color:#444">${cliente.contacto_nombre}${cliente.cargo_contacto ? ', ' + cliente.cargo_contacto : ''}${cliente.contacto_email ? ' · ' + cliente.contacto_email : ''}</p>` : ''}
    <div class="grid">
      <div class="kpi"><p>Costo agua/mes</p><h3>${cliente.costo_agua_mensual ? '$' + cliente.costo_agua_mensual.toLocaleString() + ' ' + (cliente.moneda || 'USD') : '—'}</h3></div>
      <div class="kpi"><p>% Ahorro estimado</p><h3>${cliente.porcentaje_ahorro || 15}%</h3></div>
      <div class="kpi"><p>Contrato</p><h3>${cliente.contrato_anios ? cliente.contrato_anios + ' años' : '—'}</h3></div>
      <div class="kpi"><p>Ahorro acumulado USD</p><h3>$${totalAhorroUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3></div>
    </div>
    ${ahorrosDelCliente.length > 0 ? `<h3 style="font-size:13px;font-weight:600;margin-top:32px">Historial de ahorros</h3>
    <table><thead><tr><th>Mes</th><th>m³ ahorrados</th><th>Ahorro USD</th><th>Consumo real (m³)</th></tr></thead><tbody>
    ${ahorrosDelCliente.map(a => `<tr><td>${MESES[a.mes - 1]} ${a.anio}</td><td>${a.ahorro_m3 || '—'}</td><td>$${(a.ahorro_usd || 0).toFixed(2)}</td><td>${a.consumo_real_m3 || '—'}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="footer">Generado el ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })} · AquaROI</div>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/crm')}
          className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">{cliente.nombre_empresa}</h1>
          <p className="text-sm text-muted-foreground">{{ Prospecto: 'Prospecto', Lead: 'Lead', Evaluacion_tecnica: 'Hacer Evaluación Técnica', Instalacion: 'Pendiente Instalación', Activo: 'Activo' }[cliente.etapa_pipeline] || cliente.etapa_pipeline?.replace(/_/g, ' ')}</p>
        </div>
        <button onClick={handleExportReporte} className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground" title="Exportar reporte">
          <FileDown className="w-4 h-4" />
        </button>
        {isAdmin && (confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">¿Eliminar?</span>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="rounded-lg h-8 px-3">Sí, eliminar</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="rounded-lg h-8 px-3">Cancelar</Button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="p-2 hover:bg-destructive/10 rounded-xl transition-colors text-muted-foreground hover:text-destructive" title="Eliminar cliente">
            <Trash2 className="w-4 h-4" />
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'perfil' && (
        <div className="space-y-4">
          <ClienteProfileCard cliente={cliente} onUpdate={handleUpdate} />
          {editingCliente ? (
            <EditClienteForm
              cliente={cliente}
              onSaved={(updated) => { handleUpdate(updated); setEditingCliente(false); }}
              onCancel={() => setEditingCliente(false)}
            />
          ) : (
            <div className="flex justify-end">
              <button
                onClick={() => setEditingCliente(true)}
                className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                Editar datos del negocio
              </button>
            </div>
          )}

          {/* Canal de adquisición */}
          {(cliente.canal_adquisicion || cliente.referido_por_nombre) && (
            <div className="bg-card rounded-xl p-4 flex items-center gap-3">
              <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Canal de adquisición</p>
                <p className="text-sm text-foreground font-medium">
                  {CANAL_LABELS[cliente.canal_adquisicion] || cliente.canal_adquisicion}
                  {cliente.referido_por_nombre && <span className="text-muted-foreground font-normal"> · {cliente.referido_por_nombre}</span>}
                </p>
              </div>
            </div>
          )}

          {/* Etiquetas */}
          <div className="bg-card rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Etiquetas</h3>
            <div className="flex flex-wrap gap-2">
              {(cliente.etiquetas || []).map(tag => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-primary/60 ml-0.5">
                    <XIcon className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {(cliente.etiquetas || []).length === 0 && (
                <span className="text-xs text-muted-foreground">Sin etiquetas</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(newTag); } }}
                placeholder="Nueva etiqueta… (Enter para agregar)"
                className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={() => handleAddTag(newTag)} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Asignaciones */}
          {asignaciones !== null && (
            <div className="bg-card rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Asignaciones del negocio</h3>
              <AsignacionSocios
                socios={socios}
                inversionistas={inversionistas}
                value={asignaciones}
                onChange={setAsignaciones}
              />
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSaveAsignaciones}
                  disabled={savingAsig}
                  size="sm"
                  className="rounded-lg"
                >
                  {savingAsig ? 'Guardando…' : 'Guardar asignaciones'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'documentos' && (
        <div className="bg-card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Archivos del cliente</h2>
          <DocumentosCliente clienteId={id} cliente={cliente} valvulas={valvulas} />
        </div>
      )}

      {tab === 'notas' && (
        <div className="bg-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Notas</h3>
          <div>
            <textarea
              value={newNota}
              onChange={(e) => setNewNota(e.target.value)}
              placeholder="Agregar una nota..."
              className="w-full p-3 border border-border rounded-lg text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows="3"
            />
            <Button onClick={handleAgregarNota} size="sm" className="mt-2 rounded-lg">Agregar nota</Button>
          </div>
          <div className="space-y-2">
            {notasDelCliente.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin notas todavía</p>
            )}
            {notasDelCliente.map((nota) => (
              <div key={nota.id} className="p-3 bg-muted/40 rounded-lg text-sm">
                <p className="text-foreground whitespace-pre-wrap">{nota.texto}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(nota.fecha_nota).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tareas' && (
        <div className="bg-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Tareas</h3>
          <div className="space-y-2">
            <Input value={newTarea.titulo} onChange={(e) => setNewTarea({ ...newTarea, titulo: e.target.value })} placeholder="Título de la tarea" className="rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={newTarea.fecha_limite} onChange={(e) => setNewTarea({ ...newTarea, fecha_limite: e.target.value })} className="rounded-lg" />
              <Input type="time" value={newTarea.hora} onChange={(e) => setNewTarea({ ...newTarea, hora: e.target.value })} className="rounded-lg" placeholder="Hora (opcional)" />
            </div>
            <select
              value={newTarea.asignado_a}
              onChange={(e) => setNewTarea({ ...newTarea, asignado_a: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">Asignar a...</option>
              {users.map((u) => (
                <option key={u.id} value={u.email}>{u.full_name || u.email}</option>
              ))}
            </select>
            <Button onClick={handleAgregarTarea} size="sm" className="w-full rounded-lg">Agregar tarea</Button>
          </div>
          <div className="space-y-2">
            {tareasDelCliente.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin tareas todavía</p>
            )}
            {tareasDelCliente.map((tarea) => {
              const calLink = gcalEventLink({ titulo: `${tarea.titulo} — ${cliente?.nombre_empresa || ''}`, fecha_limite: tarea.fecha_limite, hora: tarea.hora || '', descripcion: `Cliente: ${cliente?.nombre_empresa || ''}` });
              return (
                <div key={tarea.id} className="p-3 bg-muted/40 rounded-lg flex items-start gap-2">
                  <button className="mt-0.5 flex-shrink-0" onClick={() => handleCompletarTarea(tarea)}>
                    <CheckCircle2 className={`w-4 h-4 ${tarea.completada ? 'text-green-500' : 'text-muted-foreground/40'}`} />
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleCompletarTarea(tarea)}>
                    <p className={`text-sm ${tarea.completada ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{tarea.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tarea.fecha_limite).toLocaleDateString()}
                      {tarea.hora && ` · ${tarea.hora}`}
                      {tarea.asignado_a && ` · ${users.find(u => u.email === tarea.asignado_a)?.full_name || tarea.asignado_a}`}
                    </p>
                  </div>
                  {calLink && (
                    <a href={calLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary" title="Añadir a Google Calendar">
                      <CalendarPlus className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {(isAdmin || tarea.created_by === userEmail) && (
                    <button onClick={e => { e.stopPropagation(); handleEliminarTarea(tarea.id); }}
                      className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground/40 hover:text-destructive" title="Eliminar tarea">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'tecnico' && (
        <PresionCliente cliente={cliente} onUpdate={handleUpdate} />
      )}

      {tab === 'costeo' && costeoForm && (() => {
        const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global ?? 15;
        const moneda = costeoForm.moneda;
        const facturas = cliente.facturas_historicas || [];
        const pct = parseFloat(costeoForm.porcentaje_ahorro) || porcentajeGlobal;
        const promedio = facturas.length > 0 ? facturas.reduce((s, f) => s + f, 0) / facturas.length : null;
        const flatFeeLocal = promedio ? promedio * (pct / 200) : null;
        const flatFeeUSD = flatFeeLocal ? convert(flatFeeLocal, moneda, 'USD') : null;
        const sociosPct = (cliente.socios_asignados || []).reduce((s, soc) => s + (soc.porcentaje || 0), 0) / 100;
        const invPct = (cliente.inversionistas_asignados || []).reduce((s, inv) => s + (inv.porcentaje || 0), 0) / 100;
        const ingresoNeto = flatFeeLocal ? flatFeeLocal * (1 - sociosPct - invPct) : null;

        const totalValvulas = Object.values(costeoForm.valvulas_cantidades).reduce((s, q) => s + q, 0);
        const inversionUSD = Object.entries(costeoForm.valvulas_cantidades).reduce((s, [vid, qty]) => {
          const v = valvulas.find(x => x.id === vid);
          return s + (v?.costo_compra || 0) * qty;
        }, 0);
        const mesesROI = flatFeeUSD && flatFeeUSD > 0 ? inversionUSD / (flatFeeUSD * (1 - sociosPct - invPct)) : null;

        return (
          <div className="space-y-4">
            {/* Moneda + parámetros */}
            <div className="bg-card rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Parámetros de costeo</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Moneda</label>
                  <select value={costeoForm.moneda} onChange={e => setCosteoForm({ ...costeoForm, moneda: e.target.value })}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="USD">USD — Dólar</option>
                    <option value="COP">COP — Peso Colombiano</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">% Ahorro personalizado</label>
                  <Input type="number" value={costeoForm.porcentaje_ahorro}
                    onChange={e => setCosteoForm({ ...costeoForm, porcentaje_ahorro: e.target.value })}
                    placeholder={`${porcentajeGlobal} (global)`} className="mt-1 rounded-lg" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Vacío = global ({porcentajeGlobal}%)</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contrato (años)</label>
                  <Input type="number" value={costeoForm.contrato_anios}
                    onChange={e => setCosteoForm({ ...costeoForm, contrato_anios: e.target.value })}
                    placeholder="ej: 3" className="mt-1 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Consumo prom. mensual (m³)</label>
                  <Input type="number" value={costeoForm.consumo_promedio_mensual}
                    onChange={e => setCosteoForm({ ...costeoForm, consumo_promedio_mensual: e.target.value })}
                    placeholder="100" className="mt-1 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Facturas históricas */}
            <div className="bg-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Facturas de agua ({moneda})</h3>
              </div>
              {facturas.length > 0 ? (
                <div className="space-y-1.5">
                  {facturas.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                      <span className="text-xs text-muted-foreground w-12 flex-shrink-0">Mes {i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-foreground tabular-nums">
                        {f.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {moneda}
                      </span>
                      <button onClick={() => handleEliminarFactura(i)} disabled={savingFacturas}
                        className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-3">Sin facturas registradas.</p>
              )}
              <div className="flex gap-2">
                <input type="number" value={facturaInput} onChange={e => setFacturaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAgregarFactura()}
                  placeholder={`Monto en ${moneda}`}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                <Button onClick={handleAgregarFactura} disabled={savingFacturas || !facturaInput} size="sm" variant="outline" className="rounded-lg gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </Button>
              </div>
              {promedio && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Promedio ({facturas.length} fact.)</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      {promedio.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-muted-foreground">{moneda}</span>
                    </p>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Flat fee / mes ({pct}% ÷ 2)</p>
                    <p className="text-lg font-bold text-primary tabular-nums">
                      {flatFeeLocal.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-primary/70">{moneda}</span>
                    </p>
                  </div>
                  {ingresoNeto !== null && (sociosPct + invPct) > 0 && (
                    <div className="col-span-2 bg-green-50 dark:bg-green-950/20 border border-green-200/60 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Ingreso neto / mes (−{Math.round((sociosPct + invPct) * 100)}% socios/inv)</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400 tabular-nums">
                        {ingresoNeto.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal">{moneda}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Válvulas */}
            <div className="bg-card rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Válvulas asignadas</h3>
              <div className="space-y-2">
                {[...valvulas].sort((a, b) => b.pulgadas - a.pulgadas).map(v => {
                  const qty = costeoForm.valvulas_cantidades[v.id] || 0;
                  return (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{v.nombre} ({v.pulgadas}")</p>
                        <p className="text-xs text-muted-foreground">${v.costo_compra} USD</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => {
                          const newQty = Math.max(0, qty - 1);
                          const updated = { ...costeoForm.valvulas_cantidades };
                          if (newQty === 0) delete updated[v.id]; else updated[v.id] = newQty;
                          setCosteoForm({ ...costeoForm, valvulas_cantidades: updated });
                        }} className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors">−</button>
                        <span className="w-8 text-center text-sm font-medium text-foreground">{qty}</span>
                        <button type="button" onClick={() => setCosteoForm({ ...costeoForm, valvulas_cantidades: { ...costeoForm.valvulas_cantidades, [v.id]: qty + 1 } })}
                          className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalValvulas > 0 && (
                <div className="p-3 bg-primary/5 rounded-lg text-xs text-muted-foreground flex items-center justify-between">
                  <span>{totalValvulas} válvula{totalValvulas !== 1 ? 's' : ''} — Inversión total: <span className="font-semibold text-foreground">${inversionUSD.toLocaleString()} USD</span></span>
                  {mesesROI && <span className="font-medium text-foreground">ROI: {mesesROI.toFixed(1)} meses</span>}
                </div>
              )}
            </div>

            <Button onClick={handleSaveCosteo} disabled={savingCosteo} className="w-full rounded-xl gap-2">
              <Save className="w-4 h-4" />
              {savingCosteo ? 'Guardando…' : 'Guardar costeo'}
            </Button>
          </div>
        );
      })()}

      {tab === 'ahorros' && (() => {
        const ahorrosDelCliente = ahorros.filter(a => a.cliente_id === id)
          .sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
        const totalUSD = ahorrosDelCliente.reduce((s, a) => s + (a.ahorro_usd || 0), 0);
        const totalM3  = ahorrosDelCliente.reduce((s, a) => s + (a.ahorro_m3  || 0), 0);
        const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

        // Demo period: 90 días desde fecha_activacion
        const DEMO_DIAS = 90;
        const fechaActivacion = cliente.fecha_activacion ? new Date(cliente.fecha_activacion + 'T12:00:00') : null;
        const hoy = new Date();
        const diasElapsed = fechaActivacion ? Math.floor((hoy - fechaActivacion) / 86400000) : null;
        const enDemo = cliente.etapa_pipeline === 'Activo' && fechaActivacion && diasElapsed < DEMO_DIAS;
        const postDemo = cliente.etapa_pipeline === 'Activo' && fechaActivacion && diasElapsed >= DEMO_DIAS;
        const fechaFinDemo = fechaActivacion ? new Date(fechaActivacion.getTime() + DEMO_DIAS * 86400000) : null;
        const pctDemo = diasElapsed !== null ? Math.min(100, Math.round((diasElapsed / DEMO_DIAS) * 100)) : 0;

        const porcentajeGlobal = appConfigs.find(c => c.clave === 'general')?.porcentaje_ahorro_global ?? 15;
        const facturas = cliente.facturas_historicas || [];
        const pct = cliente.porcentaje_ahorro || porcentajeGlobal;
        const promedio = facturas.length > 0 ? facturas.reduce((s, f) => s + f, 0) / facturas.length : null;
        const flatFee = promedio ? promedio * (pct / 200) : null;
        const moneda = cliente.moneda || 'USD';
        const sociosPct = (cliente.socios_asignados || []).reduce((s, soc) => s + (soc.porcentaje || 0), 0);
        const invPct = (cliente.inversionistas_asignados || []).reduce((s, inv) => s + (inv.porcentaje || 0), 0);
        const deduccionPct = (sociosPct + invPct) / 100;
        const ingresoNeto = flatFee ? flatFee * (1 - deduccionPct) : null;

        return (
          <div className="space-y-4">

            {/* ── Banner de período demo ── */}
            {cliente.etapa_pipeline === 'Activo' && fechaActivacion && (
              <div className={`rounded-xl p-4 space-y-3 ${enDemo ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40' : 'bg-green-50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-semibold ${enDemo ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                      {enDemo ? `Demo activo — Día ${diasElapsed} de ${DEMO_DIAS}` : 'Período demo completado — Facturación activa'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {enDemo
                        ? `Inicio: ${fechaActivacion.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} · Facturación inicia: ${fechaFinDemo.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : `Activado: ${fechaActivacion.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} · Facturando desde: ${fechaFinDemo.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      }
                    </p>
                  </div>
                  {enDemo && (
                    <span className={`text-lg font-bold ${pctDemo > 66 ? 'text-green-600' : pctDemo > 33 ? 'text-amber-600' : 'text-red-500'}`}>
                      {pctDemo}%
                    </span>
                  )}
                </div>
                {enDemo && (
                  <div>
                    <div className="w-full bg-amber-200/40 dark:bg-amber-900/30 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${pctDemo}%`,
                          background: pctDemo > 66 ? '#22c55e' : pctDemo > 33 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 text-right">
                      {DEMO_DIAS - diasElapsed} día{DEMO_DIAS - diasElapsed !== 1 ? 's' : ''} restantes para inicio de facturación
                    </p>
                  </div>
                )}
              </div>
            )}

            {cliente.etapa_pipeline === 'Activo' && !fechaActivacion && (
              <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground border border-border/40">
                Sin fecha de activación registrada. Mueve el cliente a Activo desde el Kanban para iniciar el contador de demo automáticamente.
              </div>
            )}

            {/* ── Facturas históricas ── */}
            <div className="bg-card rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Facturas históricas</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{moneda}</span>
              </div>

              {/* Lista de facturas */}
              {facturas.length > 0 ? (
                <div className="space-y-1.5">
                  {facturas.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                      <span className="text-xs text-muted-foreground w-12 flex-shrink-0">Mes {i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-foreground tabular-nums">
                        {f.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {moneda}
                      </span>
                      <button onClick={() => handleEliminarFactura(i)} disabled={savingFacturas} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-3">
                  Sin facturas registradas. Agrega facturas para calcular el flat fee.
                </p>
              )}

              {/* Agregar factura */}
              <div className="flex gap-2">
                <input
                  type="number"
                  value={facturaInput}
                  onChange={e => setFacturaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAgregarFactura()}
                  placeholder={`Monto en ${moneda}`}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button onClick={handleAgregarFactura} disabled={savingFacturas || !facturaInput} size="sm" className="rounded-lg gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </Button>
              </div>

              {/* Resultado: promedio y flat fee */}
              {promedio && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                      Promedio ({facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'})
                    </p>
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      {promedio.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-muted-foreground">{moneda}</span>
                    </p>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                      Flat fee / mes ({pct}% ÷ 2)
                    </p>
                    <p className="text-lg font-bold text-primary tabular-nums">
                      {flatFee.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-primary/70">{moneda}</span>
                    </p>
                  </div>
                  {ingresoNeto !== null && deduccionPct > 0 && (
                    <>
                      <div className="bg-muted/30 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Socios/Inv. ({Math.round(deduccionPct * 100)}%)
                        </p>
                        <p className="text-base font-semibold text-amber-600 tabular-nums">
                          −{(flatFee - ingresoNeto).toLocaleString('en-US', { maximumFractionDigits: 0 })} {moneda}
                        </p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Ingreso neto / mes
                        </p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400 tabular-nums">
                          {ingresoNeto.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm font-normal">{moneda}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {ahorrosDelCliente.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Ahorro acumulado</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(convert(totalUSD, 'USD', moneda), moneda)}</p>
                </div>
                <div className="bg-card rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">m³ ahorrados total</p>
                  <p className="text-2xl font-bold text-foreground">{totalM3.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Registrar mes</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Año</label>
                  <input type="number" value={newAhorro.anio} onChange={e => setNewAhorro({ ...newAhorro, anio: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mes</label>
                  <select value={newAhorro.mes} onChange={e => setNewAhorro({ ...newAhorro, mes: e.target.value })}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ahorro USD *</label>
                  <input type="number" step="0.01" value={newAhorro.ahorro_usd} onChange={e => setNewAhorro({ ...newAhorro, ahorro_usd: e.target.value })} placeholder="0.00"
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">m³ ahorrados</label>
                  <input type="number" step="0.01" value={newAhorro.ahorro_m3} onChange={e => setNewAhorro({ ...newAhorro, ahorro_m3: e.target.value })} placeholder="0"
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Consumo real m³</label>
                  <input type="number" step="0.01" value={newAhorro.consumo_real_m3} onChange={e => setNewAhorro({ ...newAhorro, consumo_real_m3: e.target.value })} placeholder="0"
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <Button onClick={handleGuardarAhorro} disabled={savingAhorro || !newAhorro.ahorro_usd} size="sm" className="rounded-lg">
                {savingAhorro ? 'Guardando…' : 'Registrar mes'}
              </Button>
            </div>

            {ahorrosDelCliente.length > 0 ? (
              <div className="bg-card rounded-xl overflow-hidden border border-border/40">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/40">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mes</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">m³ ahorrados</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ahorro</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Consumo real</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/30">
                    {ahorrosDelCliente.map(a => (
                      <tr key={a.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{MESES[a.mes - 1]} {a.anio}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.ahorro_m3 ? a.ahorro_m3.toFixed(1) : '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(convert(a.ahorro_usd || 0, 'USD', moneda), moneda)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.consumo_real_m3 ? a.consumo_real_m3.toFixed(1) + ' m³' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm bg-card rounded-xl">
                Sin registros de ahorro todavía. Registra el primer mes arriba.
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'ubicacion' && (
        <div className="bg-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Ubicación de la válvula</h3>
          </div>
          <UbicacionValvula
            cliente={cliente}
            onSaved={(payload) => handleUpdate({ ...cliente, ...payload })}
          />
        </div>
      )}
    </div>
  );
}