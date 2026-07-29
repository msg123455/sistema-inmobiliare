import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserRole } from '@/hooks/useUserRole';

export default function EditClienteForm({ cliente, onSaved, onCancel }) {
  const { isAdmin } = useUserRole();

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: isAdmin,
  });

  const [form, setForm] = useState({
    nombre_empresa: cliente.nombre_empresa || '',
    dominio_web: cliente.dominio_web || '',
    industria: cliente.industria || '',
    ciudad_empresa: cliente.ciudad_empresa || '',
    pais_empresa: cliente.pais_empresa || '',
    contacto_nombre: cliente.contacto_nombre || '',
    cargo_contacto: cliente.cargo_contacto || '',
    contacto_email: cliente.contacto_email || '',
    contacto_telefono: cliente.contacto_telefono || '',
    linkedin_contacto: cliente.linkedin_contacto || '',
    porcentaje_ahorro: cliente.porcentaje_ahorro || '',
    contrato_anios: cliente.contrato_anios || '',
    fecha_instalacion: cliente.fecha_instalacion || '',
    canal_adquisicion: cliente.canal_adquisicion || '',
    referido_por_nombre: cliente.referido_por_nombre || '',
    comercial_asignado: cliente.comercial_asignado || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form };
    data.porcentaje_ahorro = data.porcentaje_ahorro !== '' ? parseFloat(data.porcentaje_ahorro) : null;
    data.contrato_anios = data.contrato_anios !== '' ? parseFloat(data.contrato_anios) : null;
    await base44.entities.Cliente.update(cliente.id, data);
    setSaving(false);
    onSaved({ ...cliente, ...data });
  };

  return (
    <div className="bg-card rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Editar Cliente</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Empresa</label>
          <Input value={form.nombre_empresa} onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })} className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Dominio web</label>
          <Input value={form.dominio_web} onChange={(e) => setForm({ ...form, dominio_web: e.target.value })} placeholder="ej: cocacola.com" className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Industria / Sector</label>
          <Input value={form.industria} onChange={(e) => setForm({ ...form, industria: e.target.value })} placeholder="ej: Hotelería, Industrial, Residencial" className="mt-1 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ciudad</label>
            <Input value={form.ciudad_empresa} onChange={(e) => setForm({ ...form, ciudad_empresa: e.target.value })} placeholder="Bogotá" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">País</label>
            <Input value={form.pais_empresa} onChange={(e) => setForm({ ...form, pais_empresa: e.target.value })} placeholder="Colombia" className="mt-1 rounded-lg" />
          </div>
        </div>

        <div className="border-t border-border/40 pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contacto</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nombre</label>
          <Input value={form.contacto_nombre} onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })} className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Cargo</label>
          <Input value={form.cargo_contacto} onChange={(e) => setForm({ ...form, cargo_contacto: e.target.value })} placeholder="ej: Gerente de Operaciones" className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input type="email" value={form.contacto_email} onChange={(e) => setForm({ ...form, contacto_email: e.target.value })} className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
          <Input value={form.contacto_telefono} onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })} className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">LinkedIn</label>
          <Input value={form.linkedin_contacto} onChange={(e) => setForm({ ...form, linkedin_contacto: e.target.value })} placeholder="https://linkedin.com/in/..." className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">% Ahorro personalizado</label>
          <Input type="number" value={form.porcentaje_ahorro} onChange={(e) => setForm({ ...form, porcentaje_ahorro: e.target.value })} placeholder="Vacío = usa global" className="mt-1 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Contrato (años)</label>
          <Input type="number" value={form.contrato_anios} onChange={(e) => setForm({ ...form, contrato_anios: e.target.value })} placeholder="ej: 3" className="mt-1 rounded-lg" />
        </div>

        <div className="border-t border-border/40 pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Adquisición</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Canal de adquisición</label>
          <select value={form.canal_adquisicion} onChange={e => setForm({ ...form, canal_adquisicion: e.target.value })}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">— Sin especificar —</option>
            <option value="Prospecto_propio">Prospecto propio</option>
            <option value="Referido_cliente">Referido por cliente</option>
            <option value="Referido_socio">Referido por socio</option>
            <option value="Publicidad">Publicidad</option>
            <option value="Evento">Evento</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        {(form.canal_adquisicion === 'Referido_cliente' || form.canal_adquisicion === 'Referido_socio') && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Referido por</label>
            <Input value={form.referido_por_nombre} onChange={e => setForm({ ...form, referido_por_nombre: e.target.value })} placeholder="Nombre del referidor" className="mt-1 rounded-lg" />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Fecha de instalación</label>
          <Input type="date" value={form.fecha_instalacion} onChange={e => setForm({ ...form, fecha_instalacion: e.target.value })} className="mt-1 rounded-lg" />
        </div>

        {isAdmin && (
          <div className="border-t border-border/40 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comercial responsable</p>
            <select
              value={form.comercial_asignado}
              onChange={e => setForm({ ...form, comercial_asignado: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Sin asignar —</option>
              {users.map(u => (
                <option key={u.id} value={u.email}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg">
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}