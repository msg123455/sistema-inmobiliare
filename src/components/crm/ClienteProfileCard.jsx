import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, Phone, Globe, MapPin, Linkedin, Pencil, Check, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CompanyLogo from './CompanyLogo';
import ContactAvatar from './ContactAvatar';

const ETAPA_COLORS = {
  Prospecto:          'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300',
  Lead:               'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Evaluacion_tecnica: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Instalacion:        'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  Activo:             'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
};

const ETAPA_LABELS = {
  Prospecto:          'Prospecto',
  Lead:               'Lead',
  Evaluacion_tecnica: 'Hacer Evaluación Técnica',
  Instalacion:        'Pendiente Instalación',
  Activo:             'Activo',
};

export default function ClienteProfileCard({ cliente, onUpdate }) {
  const [editing, setEditing] = useState(false);
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
    foto_contacto_url: cliente.foto_contacto_url || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Cliente.update(cliente.id, form);
    onUpdate({ ...cliente, ...form });
    setEditing(false);
    setSaving(false);
  };

  const handleCancel = () => {
    setForm({
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
      foto_contacto_url: cliente.foto_contacto_url || '',
    });
    setEditing(false);
  };

  const handlePhotoUpload = async (dataUrl) => {
    const updated = { ...form, foto_contacto_url: dataUrl };
    setForm(updated);
    await base44.entities.Cliente.update(cliente.id, { foto_contacto_url: dataUrl });
    onUpdate({ ...cliente, foto_contacto_url: dataUrl });
  };

  const location = [cliente.ciudad_empresa, cliente.pais_empresa].filter(Boolean).join(', ');

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      {/* Banner */}
      <div className="h-16 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />

      {/* Content */}
      <div className="px-5 pb-5">
        {/* Logos row — overlapping the banner */}
        <div className="flex items-end justify-between -mt-8 mb-4">
          <div className="flex items-end gap-3">
            {/* Company logo */}
            <div className="w-14 h-14 rounded-xl bg-white dark:bg-card border-2 border-background shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0">
              <CompanyLogo cliente={cliente} size="lg" />
            </div>
            {/* Contact avatar */}
            <ContactAvatar
              url={editing ? form.foto_contacto_url : cliente.foto_contacto_url}
              nombre={cliente.contacto_nombre}
              onUpload={handlePhotoUpload}
              size="lg"
              editable
            />
          </div>
          <div className="flex gap-1.5 mt-8">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 rounded-lg h-8 px-3">
                  <Check className="w-3.5 h-3.5" /> {saving ? '...' : 'Guardar'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 rounded-lg h-8 px-3">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company profile */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Empresa
            </p>
            {editing ? (
              <Input
                value={form.nombre_empresa}
                onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })}
                placeholder="Nombre de la empresa"
                className="rounded-lg h-9 text-lg font-bold mt-1"
              />
            ) : (
              <h2 className="text-xl font-bold text-foreground leading-tight">{cliente.nombre_empresa}</h2>
            )}

            {editing ? (
              <div className="mt-2 space-y-2">
                <Input
                  value={form.dominio_web}
                  onChange={(e) => setForm({ ...form, dominio_web: e.target.value })}
                  placeholder="Dominio web (ej: empresa.com)"
                  className="rounded-lg h-8 text-sm"
                />
                <Input
                  value={form.industria}
                  onChange={(e) => setForm({ ...form, industria: e.target.value })}
                  placeholder="Industria (ej: Hotelería, Industrial)"
                  className="rounded-lg h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={form.ciudad_empresa}
                    onChange={(e) => setForm({ ...form, ciudad_empresa: e.target.value })}
                    placeholder="Ciudad"
                    className="rounded-lg h-8 text-sm"
                  />
                  <Input
                    value={form.pais_empresa}
                    onChange={(e) => setForm({ ...form, pais_empresa: e.target.value })}
                    placeholder="País"
                    className="rounded-lg h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {cliente.industria && (
                  <p className="text-sm text-muted-foreground">{cliente.industria}</p>
                )}
                {location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{location}</span>
                  </div>
                )}
                {cliente.dominio_web && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={cliente.dominio_web} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors truncate">
                      {cliente.dominio_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ETAPA_COLORS[cliente.etapa_pipeline] || 'bg-muted text-muted-foreground'}`}>
                {ETAPA_LABELS[cliente.etapa_pipeline] || cliente.etapa_pipeline?.replace(/_/g, ' ')}
              </span>
              {(cliente.socios_asignados || []).map(s => (
                <span key={s.socio_id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                  {s.nombre} · {s.porcentaje}%
                </span>
              ))}
              {(cliente.inversionistas_asignados || []).map(inv => (
                <span key={inv.inversionista_id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  {inv.nombre} · {inv.porcentaje}%
                </span>
              ))}
            </div>
          </div>

          {/* Contact profile */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Contacto
            </p>
            {editing ? (
              <Input
                value={form.contacto_nombre}
                onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })}
                placeholder="Nombre del contacto"
                className="rounded-lg h-9 text-base font-semibold mt-1"
              />
            ) : (
              <h3 className="text-lg font-semibold text-foreground">{cliente.contacto_nombre || '—'}</h3>
            )}

            {editing ? (
              <div className="mt-2 space-y-2">
                <Input
                  value={form.cargo_contacto}
                  onChange={(e) => setForm({ ...form, cargo_contacto: e.target.value })}
                  placeholder="Cargo (ej: Gerente de Operaciones)"
                  className="rounded-lg h-8 text-sm"
                />
                <Input
                  type="email"
                  value={form.contacto_email}
                  onChange={(e) => setForm({ ...form, contacto_email: e.target.value })}
                  placeholder="Email de contacto"
                  className="rounded-lg h-8 text-sm"
                />
                <Input
                  value={form.contacto_telefono}
                  onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })}
                  placeholder="Teléfono"
                  className="rounded-lg h-8 text-sm"
                />
                <Input
                  value={form.linkedin_contacto}
                  onChange={(e) => setForm({ ...form, linkedin_contacto: e.target.value })}
                  placeholder="LinkedIn URL"
                  className="rounded-lg h-8 text-sm"
                />
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {cliente.cargo_contacto && (
                  <p className="text-sm text-muted-foreground">{cliente.cargo_contacto}</p>
                )}
                {cliente.contacto_email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={`mailto:${cliente.contacto_email}`} className="hover:text-primary transition-colors truncate">
                      {cliente.contacto_email}
                    </a>
                  </div>
                )}
                {cliente.contacto_telefono && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={`tel:${cliente.contacto_telefono}`} className="hover:text-primary transition-colors">
                      {cliente.contacto_telefono}
                    </a>
                  </div>
                )}
                {cliente.linkedin_contacto && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Linkedin className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={cliente.linkedin_contacto} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors truncate">
                      LinkedIn
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
