import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';
import { RefreshCw, ChevronDown, X, Edit2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TRMSelector() {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cop, setCop] = useState('');
  const [eur, setEur] = useState('');
  const ref = useRef(null);
  const queryClient = useQueryClient();

  const { rates, source, isLoading } = useCurrencyRates();

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
  });
  const config = appConfigs.find(c => c.clave === 'general');
  const isManual = !!(config?.tasa_cop || config?.tasa_eur);

  useEffect(() => {
    if (editMode) {
      setCop(config?.tasa_cop ? String(config.tasa_cop) : '');
      setEur(config?.tasa_eur ? String(config.tasa_eur) : '');
    }
  }, [editMode]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setEditMode(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['currency-rates'] });
  };

  const handleSaveOverride = async () => {
    if (!cop && !eur) return;
    setSaving(true);
    const payload = {
      clave: 'general',
      tasa_cop: parseFloat(cop) || null,
      tasa_eur: parseFloat(eur) || null,
    };
    if (config) {
      await base44.entities.AppConfig.update(config.id, payload);
    } else {
      await base44.entities.AppConfig.create(payload);
    }
    queryClient.invalidateQueries({ queryKey: ['app-config'] });
    setSaving(false);
    setEditMode(false);
  };

  const handleClearOverride = async () => {
    setSaving(true);
    if (config) {
      await base44.entities.AppConfig.update(config.id, { tasa_cop: null, tasa_eur: null });
    }
    queryClient.invalidateQueries({ queryKey: ['app-config'] });
    setSaving(false);
    setEditMode(false);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Compact pill button showing current COP rate */}
      <button
        onClick={() => { setOpen(v => !v); setEditMode(false); }}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
          isManual
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {isLoading ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : (
          <span className="font-mono tabular-nums">
            {Math.round(rates.COP).toLocaleString()} COP
          </span>
        )}
        {isManual && <span className="text-[9px] opacity-60 font-normal">override</span>}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border/60 rounded-xl shadow-lg z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <p className="text-sm font-semibold text-foreground">Tasa de cambio</p>
            <div className="flex items-center gap-1.5">
              {!isManual && (
                <button
                  onClick={handleRefresh}
                  className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  title="Actualizar desde Google Finance"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => { setOpen(false); setEditMode(false); }} className="p-1 rounded hover:bg-muted/60">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Rates display */}
          <div className="px-4 py-3 space-y-2.5">
            <RateRow label="USD → COP" value={Math.round(rates.COP).toLocaleString()} isManual={isManual} />
            <RateRow label="USD → EUR" value={rates.EUR.toFixed(4)} isManual={isManual} />
            <p className="text-[10px] text-muted-foreground">
              {isManual
                ? 'Usando tasas manuales (override activo)'
                : `Fuente: ${source || 'Google Finance'} · Actualiza cada 15 min`}
            </p>
          </div>

          {/* Override section */}
          <div className="border-t border-border/40">
            {!editMode ? (
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {isManual ? 'Override manual activo' : 'Override manual'}
                </span>
                <div className="flex items-center gap-2">
                  {isManual && (
                    <button
                      onClick={handleClearOverride}
                      disabled={saving}
                      className="text-[11px] text-destructive hover:underline"
                    >
                      Quitar override
                    </button>
                  )}
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Edit2 className="w-3 h-3" />
                    {isManual ? 'Editar' : 'Establecer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground">Ingresa valores manuales</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">COP por 1 USD</label>
                    <Input
                      type="number"
                      value={cop}
                      onChange={e => setCop(e.target.value)}
                      placeholder={String(Math.round(rates.COP))}
                      className="mt-1 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">EUR por 1 USD</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={eur}
                      onChange={e => setEur(e.target.value)}
                      placeholder={String(rates.EUR)}
                      className="mt-1 h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveOverride} disabled={saving || (!cop && !eur)} size="sm" className="flex-1 h-7 text-xs rounded-lg gap-1">
                    <Check className="w-3 h-3" />
                    {saving ? 'Guardando…' : 'Guardar'}
                  </Button>
                  <Button onClick={() => setEditMode(false)} variant="outline" size="sm" className="h-7 text-xs rounded-lg">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RateRow({ label, value, isManual }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums font-mono ${isManual ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
