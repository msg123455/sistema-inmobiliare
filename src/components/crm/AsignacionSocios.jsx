import React, { useState } from 'react';
import { Plus, Trash2, Users, TrendingUp, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useUserRole } from '@/hooks/useUserRole';

export default function AsignacionSocios({ socios = [], inversionistas = [], value = {}, onChange }) {
  const { isAdmin } = useUserRole();
  const [addingSocio, setAddingSocio] = useState(false);
  const [addingInv, setAddingInv] = useState(false);
  const [socioId, setSocioId] = useState('');
  const [socioPct, setSocioPct] = useState('');
  const [invId, setInvId] = useState('');
  const [invPct, setInvPct] = useState('');

  const sociosAsignados = value.socios || [];
  const invAsignados = value.inversionistas || [];

  const availableSocios = socios.filter(s => !sociosAsignados.find(a => a.socio_id === s.id));
  const availableInvs = inversionistas.filter(i => !invAsignados.find(a => a.inversionista_id === i.id));

  const addSocio = () => {
    if (!socioId) return;
    const socio = socios.find(s => s.id === socioId);
    if (!socio) return;
    onChange({
      ...value,
      socios: [...sociosAsignados, { socio_id: socioId, nombre: socio.nombre, porcentaje: parseFloat(socioPct) || 50 }],
    });
    setSocioId(''); setSocioPct(''); setAddingSocio(false);
  };

  const removeSocio = (id) => onChange({ ...value, socios: sociosAsignados.filter(s => s.socio_id !== id) });

  const addInv = () => {
    if (!invId) return;
    const inv = inversionistas.find(i => i.id === invId);
    if (!inv) return;
    onChange({
      ...value,
      inversionistas: [...invAsignados, { inversionista_id: invId, nombre: inv.nombre, porcentaje: parseFloat(invPct) || 0 }],
    });
    setInvId(''); setInvPct(''); setAddingInv(false);
  };

  const removeInv = (id) => onChange({ ...value, inversionistas: invAsignados.filter(i => i.inversionista_id !== id) });

  return (
    <div className="space-y-4">
      {/* Socios */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Socios del negocio
          </p>
          {availableSocios.length > 0 && !addingSocio && (
            <button
              type="button"
              onClick={() => setAddingSocio(true)}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Agregar
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {sociosAsignados.length === 0 && !addingSocio && (
            <p className="text-xs text-muted-foreground py-2 px-3 bg-muted/30 rounded-lg">Sin socios asignados</p>
          )}
          {sociosAsignados.map(s => (
            <div key={s.socio_id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                {s.nombre?.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm text-foreground flex-1 truncate">{s.nombre}</span>
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">{s.porcentaje}%</span>
              {isAdmin && (
                <button type="button" onClick={() => removeSocio(s.socio_id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {addingSocio && (
            <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg">
              <select
                value={socioId}
                onChange={e => setSocioId(e.target.value)}
                className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              >
                <option value="">Seleccionar socio…</option>
                {availableSocios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <div className="relative w-20 flex-shrink-0">
                <Input
                  type="number" min={0} max={100}
                  value={socioPct}
                  onChange={e => setSocioPct(e.target.value)}
                  placeholder="50"
                  className="h-8 text-sm rounded-lg pr-5 text-center"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <button type="button" onClick={addSocio} disabled={!socioId} className="text-xs px-2.5 py-1.5 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => { setAddingSocio(false); setSocioId(''); setSocioPct(''); }} className="text-xs px-2.5 py-1.5 bg-muted rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Inversionistas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Inversionistas del negocio
          </p>
          {availableInvs.length > 0 && !addingInv && (
            <button
              type="button"
              onClick={() => setAddingInv(true)}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Agregar
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {invAsignados.length === 0 && !addingInv && (
            <p className="text-xs text-muted-foreground py-2 px-3 bg-muted/30 rounded-lg">
              {inversionistas.length === 0 ? 'No hay inversionistas creados en el módulo CRM' : 'Sin inversionistas asignados'}
            </p>
          )}
          {invAsignados.map(inv => (
            <div key={inv.inversionista_id} className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700 flex-shrink-0">
                {inv.nombre?.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm text-foreground flex-1 truncate">{inv.nombre}</span>
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{inv.porcentaje}%</span>
              {isAdmin && (
                <button type="button" onClick={() => removeInv(inv.inversionista_id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {addingInv && (
            <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg">
              <select
                value={invId}
                onChange={e => setInvId(e.target.value)}
                className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              >
                <option value="">Seleccionar inversionista…</option>
                {availableInvs.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
              <div className="relative w-20 flex-shrink-0">
                <Input
                  type="number" min={0} max={100}
                  value={invPct}
                  onChange={e => setInvPct(e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm rounded-lg pr-5 text-center"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <button type="button" onClick={addInv} disabled={!invId} className="text-xs px-2.5 py-1.5 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => { setAddingInv(false); setInvId(''); setInvPct(''); }} className="text-xs px-2.5 py-1.5 bg-muted rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}