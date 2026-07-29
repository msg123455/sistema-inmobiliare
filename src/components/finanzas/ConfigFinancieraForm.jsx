import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings } from 'lucide-react';

export default function ConfigFinancieraForm() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tasa_impuesto_renta: 0,
    tasa_iva: 19,
    reserva_legal_pct: 10,
    capital_inicial: 0,
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['config-financiera'],
    queryFn: () => base44.entities.ConfigFinanciera.list(),
  });

  useEffect(() => {
    const cfg = configs.find(c => c.clave === 'general');
    if (cfg) {
      setForm({
        tasa_impuesto_renta: cfg.tasa_impuesto_renta ?? 0,
        tasa_iva: cfg.tasa_iva ?? 19,
        reserva_legal_pct: cfg.reserva_legal_pct ?? 10,
        capital_inicial: cfg.capital_inicial ?? 0,
      });
    }
  }, [configs]);

  const handleSave = async () => {
    setSaving(true);
    const existing = configs.find(c => c.clave === 'general');
    if (existing) {
      await base44.entities.ConfigFinanciera.update(existing.id, { ...form, clave: 'general' });
    } else {
      await base44.entities.ConfigFinanciera.create({ ...form, clave: 'general' });
    }
    queryClient.invalidateQueries({ queryKey: ['config-financiera'] });
    setSaving(false);
  };

  const fields = [
    { key: 'tasa_impuesto_renta', label: 'Impuesto de Renta (%)', placeholder: '35' },
    { key: 'tasa_iva', label: 'IVA (%)', placeholder: '19' },
    { key: 'reserva_legal_pct', label: 'Reserva Legal (%)', placeholder: '10' },
    { key: 'capital_inicial', label: 'Capital Inicial Disponible (USD)', placeholder: '0' },
  ];

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Configuración Financiera</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
            <Input
              type="number"
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: parseFloat(e.target.value) || 0 })}
              placeholder={f.placeholder}
              className="mt-1 rounded-lg"
            />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full mt-4 rounded-lg">
        {saving ? 'Guardando...' : 'Guardar Configuración'}
      </Button>
    </div>
  );
}