import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gauge, Droplets, ArrowDown, ArrowUp, Pencil, Save, X } from 'lucide-react';

function clasificarPresion(estatica, dinamica) {
  if (!estatica && !dinamica) return null;
  if (!dinamica) return { tipo: 'Estática', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20' };
  if (!estatica) return { tipo: 'Dinámica', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20' };

  const caida = estatica - dinamica;
  const pctCaida = (caida / estatica) * 100;

  if (pctCaida <= 10) {
    return { tipo: 'Predominante Estática', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20', caida, pctCaida };
  } else if (pctCaida <= 30) {
    return { tipo: 'Mixta', color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20', caida, pctCaida };
  } else {
    return { tipo: 'Predominante Dinámica', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20', caida, pctCaida };
  }
}

function calcularImpactoFlujo(estatica, dinamica, diametro) {
  if (!estatica || !dinamica || !diametro) return null;
  
  // Velocidad estimada usando Bernoulli simplificado: v = sqrt(2 * ΔP / ρ)
  // ΔP en Pascales (1 PSI = 6894.76 Pa), ρ agua ≈ 998 kg/m³
  const deltaPressurePa = (estatica - dinamica) * 6894.76;
  if (deltaPressurePa <= 0) return null;
  
  const velocidad = Math.sqrt((2 * deltaPressurePa) / 998); // m/s
  
  // Área de la tubería: A = π * (d/2)² (convertir pulgadas a metros)
  const diametroM = diametro * 0.0254;
  const area = Math.PI * Math.pow(diametroM / 2, 2);
  
  // Caudal Q = A * v (m³/s → L/min)
  const caudalLMin = velocidad * area * 60000;
  const caudalM3H = (caudalLMin / 1000) * 60;
  
  return { velocidad, caudalLMin, caudalM3H };
}

export default function PresionCliente({ cliente, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    presion_estatica_psi: cliente.presion_estatica_psi || '',
    presion_dinamica_psi: cliente.presion_dinamica_psi || '',
    diametro_tuberia_pulgadas: cliente.diametro_tuberia_pulgadas || '',
  });

  useEffect(() => {
    setForm({
      presion_estatica_psi: cliente.presion_estatica_psi || '',
      presion_dinamica_psi: cliente.presion_dinamica_psi || '',
      diametro_tuberia_pulgadas: cliente.diametro_tuberia_pulgadas || '',
    });
    setEditing(false);
  }, [cliente.id]);
  const [saving, setSaving] = useState(false);

  const estatica = cliente.presion_estatica_psi;
  const dinamica = cliente.presion_dinamica_psi;
  const diametro = cliente.diametro_tuberia_pulgadas;
  const clasificacion = clasificarPresion(estatica, dinamica);
  const impacto = calcularImpactoFlujo(estatica, dinamica, diametro);

  const handleSave = async () => {
    setSaving(true);
    const data = {};
    data.presion_estatica_psi = form.presion_estatica_psi ? parseFloat(form.presion_estatica_psi) : null;
    data.presion_dinamica_psi = form.presion_dinamica_psi ? parseFloat(form.presion_dinamica_psi) : null;
    data.diametro_tuberia_pulgadas = form.diametro_tuberia_pulgadas ? parseFloat(form.diametro_tuberia_pulgadas) : null;
    await base44.entities.Cliente.update(cliente.id, data);
    onUpdate({ ...cliente, ...data });
    setEditing(false);
    setSaving(false);
  };

  const tieneData = estatica || dinamica;

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-primary" /> Presión y Flujo
        </h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Presión Estática (PSI) — sin flujo</label>
            <Input type="number" value={form.presion_estatica_psi} onChange={(e) => setForm({ ...form, presion_estatica_psi: e.target.value })} placeholder="Ej: 60" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Presión Dinámica (PSI) — con flujo</label>
            <Input type="number" value={form.presion_dinamica_psi} onChange={(e) => setForm({ ...form, presion_dinamica_psi: e.target.value })} placeholder="Ej: 45" className="mt-1 rounded-lg" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Diámetro tubería (pulgadas)</label>
            <Input type="number" value={form.diametro_tuberia_pulgadas} onChange={(e) => setForm({ ...form, diametro_tuberia_pulgadas: e.target.value })} placeholder="Ej: 2" className="mt-1 rounded-lg" step="0.25" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm" disabled={saving} className="gap-1.5 rounded-lg">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" variant="outline" className="gap-1.5 rounded-lg">
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          </div>
        </div>
      ) : !tieneData ? (
        <div className="text-center py-6">
          <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin datos de presión</p>
          <Button onClick={() => setEditing(true)} size="sm" variant="outline" className="mt-2 rounded-lg">
            Registrar presión
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Clasificación */}
          {clasificacion && (
            <div className={`rounded-lg px-4 py-3 ${clasificacion.bg}`}>
              <p className={`text-sm font-semibold ${clasificacion.color}`}>{clasificacion.tipo}</p>
              {clasificacion.pctCaida != null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Caída de presión: {clasificacion.caida.toFixed(1)} PSI ({clasificacion.pctCaida.toFixed(1)}%)
                </p>
              )}
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3">
            {estatica != null && (
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Estática</p>
                </div>
                <p className="text-lg font-bold text-foreground">{estatica} <span className="text-xs font-normal text-muted-foreground">PSI</span></p>
              </div>
            )}
            {dinamica != null && (
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUp className="w-3.5 h-3.5 text-orange-500" />
                  <p className="text-xs text-muted-foreground">Dinámica</p>
                </div>
                <p className="text-lg font-bold text-foreground">{dinamica} <span className="text-xs font-normal text-muted-foreground">PSI</span></p>
              </div>
            )}
          </div>

          {/* Impacto en flujo */}
          {impacto && (
            <div className="border-t border-border/40 pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" /> Impacto en Flujo
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Velocidad</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{impacto.velocidad.toFixed(2)} <span className="text-xs font-normal">m/s</span></p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Caudal</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{impacto.caudalLMin.toFixed(1)} <span className="text-xs font-normal">L/min</span></p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Volumen/h</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{impacto.caudalM3H.toFixed(2)} <span className="text-xs font-normal">m³/h</span></p>
                </div>
              </div>
              {diametro && (
                <p className="text-xs text-muted-foreground mt-2">Tubería: {diametro}" de diámetro</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}