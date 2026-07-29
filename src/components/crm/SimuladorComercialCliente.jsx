import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, ReferenceLine, ReferenceArea,
} from 'recharts';
import { FileDown, Plus, Trash2, Droplets, AlertCircle, Calendar, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ESCENARIOS_BASE = [
  { key: 'e1', label: 'Conservador', pct: 10, color: '#3b82f6', bg: '#dbeafe', text: '#1e40af' },
  { key: 'e2', label: 'Moderado',    pct: 15, color: '#8b5cf6', bg: '#ede9fe', text: '#5b21b6' },
  { key: 'e3', label: 'Óptimo',      pct: 20, color: '#22c55e', bg: '#dcfce7', text: '#15803d' },
];

const DURACIONES = [12, 24, 36, 48, 60];
const MESES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getDomain(cliente) {
  if (cliente?.dominio_web) {
    const cleaned = cliente.dominio_web.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    if (cleaned?.includes('.')) return cleaned;
  }
  return null;
}

function fmt(amount, moneda = 'USD', compact = false) {
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
    return Math.round(amount).toString();
  }
  if (moneda === 'COP') return `$ ${Math.round(amount).toLocaleString('es-CO')}`;
  if (moneda === 'EUR') return `€ ${Math.round(amount).toLocaleString('de')}`;
  return `$ ${Math.round(amount).toLocaleString('en-US')}`;
}

const tooltipStyle = {
  contentStyle: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '11px' },
};

// ── PDF report ────────────────────────────────────────────────────────────────
function ReportePDF({ cliente, facturas, escenarios, moneda, dominio, stats, duracionMeses, proyeccion }) {
  const hoy = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
  const modEsc = escenarios.find(e => e.key === 'e2') || escenarios[1];

  return (
    <div style={{ width: '794px', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#111827' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '36px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Análisis de Ahorro Hídrico</div>
          <div style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700 }}>{cliente.nombre_empresa}</div>
          {cliente.industria && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{cliente.industria}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          {dominio && (
            <img src={`https://www.google.com/s2/favicons?domain=${dominio}&sz=128`} alt=""
              style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#fff', objectFit: 'contain', padding: '4px' }} />
          )}
          <div style={{ color: '#475569', fontSize: '11px' }}>{hoy}</div>
        </div>
      </div>

      <div style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
          {[
            { label: 'Facturas analizadas', value: facturas.length },
            { label: 'Promedio mensual', value: fmt(stats.promedio, moneda) },
            { label: 'Factura máxima', value: fmt(stats.max, moneda) },
            { label: 'Duración del contrato', value: `${duracionMeses} meses` },
          ].map(s => (
            <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Scenario cards — client savings only */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>Tu ahorro proyectado por escenario</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            {escenarios.map(e => {
              const ahorroMes = stats.promedio * (e.pct / 100) * 0.5;
              const totalContrato = proyeccion.reduce((s, m) => s + m.monto * (e.pct / 100) * 0.5, 0);
              return (
                <div key={e.key} style={{ borderRadius: '12px', border: `2px solid ${e.color}`, padding: '18px', backgroundColor: e.bg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: e.text }}>{e.label}</div>
                    <div style={{ background: e.color, color: '#fff', borderRadius: '20px', padding: '2px 10px', fontSize: '13px', fontWeight: 700 }}>{e.pct}%</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu ahorro neto promedio / mes</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: e.text }}>{fmt(ahorroMes, moneda)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: '8px', padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>Ahorro anual</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: e.text }}>{fmt(ahorroMes * 12, moneda)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>Total {duracionMeses}m</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: e.text }}>{fmt(totalContrato, moneda)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invoice table — client savings only */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>Tu ahorro por factura</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: '400px' }}>
            <thead>
              <tr style={{ background: '#0f172a' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Período</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Factura</th>
                {escenarios.map(e => (
                  <th key={e.key} style={{ padding: '8px 10px', textAlign: 'right', color: e.bg, fontWeight: 600, borderLeft: '1px solid #1e293b' }}>
                    {e.label} {e.pct}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturas.map((f, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 500, color: '#374151' }}>{f.label}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>{fmt(f.monto, moneda)}</td>
                  {escenarios.map(e => (
                    <td key={e.key} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#15803d', borderLeft: '1px solid #e2e8f0' }}>
                      {fmt(f.monto * (e.pct / 100) * 0.5, moneda)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ background: '#0f172a' }}>
                <td style={{ padding: '9px 10px', color: '#fff', fontWeight: 700 }}>TOTAL</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#cbd5e1', fontWeight: 700 }}>{fmt(stats.total, moneda)}</td>
                {escenarios.map(e => (
                  <td key={e.key} style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#86efac', borderLeft: '1px solid #1e293b' }}>
                    {fmt(stats.total * (e.pct / 100) * 0.5, moneda)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Visual comparison bars */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>Comparativa visual por factura</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {facturas.map((f, i) => {
              const maxMonto = Math.max(...facturas.map(x => x.monto));
              return (
                <div key={i}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>{f.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {[
                      { label: 'Actual', valor: f.monto, color: '#ef4444' },
                      ...escenarios.map(e => ({ label: `${e.label} (${e.pct}%) · ahorras ${fmt(f.monto * (e.pct / 100) * 0.5, moneda)}`, valor: f.monto * (1 - e.pct / 100), color: e.color })),
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '140px', fontSize: '9px', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>{item.label}</div>
                        <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '4px', height: '18px', overflow: 'hidden' }}>
                          <div style={{ width: `${(item.valor / maxMonto) * 100}%`, height: '100%', background: item.color, borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                            <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700 }}>{fmt(item.valor, moneda)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contract projection section */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
            Proyección del contrato completo · {duracionMeses} meses
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '16px' }}>
            {facturas.length} mes{facturas.length !== 1 ? 'es' : ''} con datos reales · {Math.max(0, duracionMeses - facturas.length)} mes{duracionMeses - facturas.length !== 1 ? 'es' : ''} proyectados con promedio
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            {escenarios.map(e => {
              const totalContrato = proyeccion.reduce((s, m) => s + m.monto * (e.pct / 100) * 0.5, 0);
              return (
                <div key={e.key} style={{ background: e.bg, borderRadius: '10px', padding: '14px', border: `2px solid ${e.color}` }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: e.text, marginBottom: '6px' }}>{e.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: e.text }}>{fmt(totalContrato, moneda)}</div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>tu ahorro total en {duracionMeses} meses</div>
                  <div style={{ fontSize: '9px', color: e.text, marginTop: '2px' }}>{fmt(totalContrato / duracionMeses, moneda)}/mes promedio</div>
                </div>
              );
            })}
          </div>

          {/* CSS bar chart — moderate scenario */}
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px' }}>
            Ahorro neto mensual — Escenario {modEsc?.label} ({modEsc?.pct}%) · gris = meses proyectados con promedio
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: '80px', background: '#f8fafc', padding: '4px 4px 0', borderRadius: '6px' }}>
            {proyeccion.map((m, i) => {
              const savings = modEsc ? m.monto * (modEsc.pct / 100) * 0.5 : 0;
              const maxSavings = Math.max(...proyeccion.map(x => modEsc ? x.monto * (modEsc.pct / 100) * 0.5 : 1));
              const heightPct = maxSavings > 0 ? savings / maxSavings : 0;
              return (
                <div key={i} style={{
                  flex: 1,
                  height: `${Math.max(3, heightPct * 68)}px`,
                  backgroundColor: m.esReal ? (modEsc?.color || '#8b5cf6') : '#cbd5e1',
                  borderRadius: '1px 1px 0 0',
                }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginTop: '4px' }}>
            <span>Mes 1</span>
            <span>Mes {Math.round(duracionMeses / 2)}</span>
            <span>Mes {duracionMeses}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>Generado por HydroMetric · {hoy}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>Los valores son proyecciones estimadas. Los resultados reales pueden variar.</div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SimuladorComercialCliente({ cliente, onUpdate }) {
  const moneda = cliente.moneda || 'USD';
  const dominio = getDomain(cliente);

  const initFacturas = () => {
    const hist = cliente.facturas_historicas;
    if (hist?.length) return hist.map((m, i) => ({ label: MESES_LABELS[i] ?? `Mes ${i + 1}`, monto: m }));
    if (cliente.costo_agua_mensual) return [{ label: 'Mes 1', monto: cliente.costo_agua_mensual }];
    return [{ label: 'Mes 1', monto: '' }];
  };

  const [facturas, setFacturas] = useState(initFacturas);
  const [saving, setSaving] = useState(false);
  const [escenarios, setEscenarios] = useState(ESCENARIOS_BASE.map(e => ({ ...e })));
  const [duracionMeses, setDuracionMeses] = useState(cliente.contrato_anios ? cliente.contrato_anios * 12 : 24);
  const [generando, setGenerando] = useState(false);
  const reportRef = useRef(null);

  const addFactura = () => {
    const n = facturas.length + 1;
    const label = MESES_LABELS[n - 1] ?? `Mes ${n}`;
    setFacturas([...facturas, { label, monto: '' }]);
  };

  const removeFactura = (i) => setFacturas(facturas.filter((_, idx) => idx !== i));

  const updateFactura = (i, field, value) => {
    const updated = [...facturas];
    updated[i] = { ...updated[i], [field]: field === 'monto' ? (parseFloat(value) || '') : value };
    setFacturas(updated);
  };

  const validFacturas = facturas.filter(f => f.monto > 0);
  const montos = validFacturas.map(f => f.monto);
  const stats = montos.length ? {
    total: montos.reduce((a, b) => a + b, 0),
    promedio: montos.reduce((a, b) => a + b, 0) / montos.length,
    max: Math.max(...montos),
    min: Math.min(...montos),
  } : null;

  // Full contract projection: real invoices + average fill for remaining months
  const proyeccionCompleta = stats
    ? Array.from({ length: duracionMeses }, (_, i) => {
        const factura = validFacturas[i];
        const monto = factura ? factura.monto : stats.promedio;
        const mesLabel = factura ? factura.label : `M${i + 1}`;
        const esReal = i < validFacturas.length;
        const entry = { mes: mesLabel, monto, esReal };
        escenarios.forEach(e => {
          entry[e.label] = Math.round(monto * (e.pct / 100) * 0.5);
        });
        return entry;
      })
    : [];

  // Per-invoice charts
  const chartData = validFacturas.map(f => {
    const entry = { mes: f.label, Actual: Math.round(f.monto) };
    escenarios.forEach(e => { entry[e.label] = Math.round(f.monto * (1 - e.pct / 100)); });
    return entry;
  });

  const savingsData = validFacturas.map(f => {
    const entry = { mes: f.label };
    escenarios.forEach(e => { entry[e.label] = Math.round(f.monto * (e.pct / 100) * 0.5); });
    return entry;
  });

  const updateEscenario = (i, pct) => {
    const updated = [...escenarios];
    updated[i] = { ...updated[i], pct: Math.max(1, Math.min(50, parseFloat(pct) || 0)) };
    setEscenarios(updated);
  };

  const generatePDF = async () => {
    if (!validFacturas.length) return;
    setGenerando(true);
    try {
      await new Promise(r => setTimeout(r, 150));
      const el = reportRef.current;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pdfW) / canvas.width;
      let y = 0;
      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -y, pdfW, imgH);
        y += pdfH;
      }
      pdf.save(`Analisis_${(cliente.nombre_empresa || 'cliente').replace(/\s+/g, '_')}.pdf`);
    } finally {
      setGenerando(false);
    }
  };

  const xAxisInterval = duracionMeses <= 12 ? 0 : duracionMeses <= 24 ? 1 : duracionMeses <= 36 ? 2 : 5;

  return (
    <div className="space-y-5">
      {/* Facturas + params */}
      <div className="bg-card rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Droplets className="w-4 h-4 text-primary" /> Facturas de agua
          </h3>
          <Button onClick={addFactura} size="sm" variant="outline" className="gap-1.5 rounded-lg h-8">
            <Plus className="w-3.5 h-3.5" /> Agregar factura
          </Button>
        </div>

        <div className="space-y-2">
          {facturas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={f.label}
                onChange={e => updateFactura(i, 'label', e.target.value)}
                className="w-28 rounded-lg h-9 text-sm"
                placeholder="Período"
              />
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{moneda}</span>
                <Input
                  type="number"
                  value={f.monto}
                  onChange={e => updateFactura(i, 'monto', e.target.value)}
                  className="rounded-lg h-9 text-sm pl-12"
                  placeholder="Monto de la factura"
                />
              </div>
              {f.monto > 0 && (
                <div className="flex gap-1.5">
                  {escenarios.map(e => {
                    const ahorro = f.monto * (e.pct / 100) * 0.5;
                    return (
                      <div key={e.key} className="text-xs font-semibold px-2 py-1 rounded-lg flex flex-col items-center" style={{ backgroundColor: e.bg, color: e.text }}>
                        <span className="text-xs opacity-70">{e.pct}%</span>
                        <span className="text-green-700 font-black">−{fmt(ahorro, moneda, true)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => removeFactura(i)} className="p-1.5 hover:bg-destructive/10 hover:text-destructive text-muted-foreground/50 rounded-lg transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {facturas.length < 2 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Agregá al menos 2-3 facturas para ver la fluctuación real del consumo
          </div>
        )}

        {/* Guardar facturas en el cliente */}
        {validFacturas.length > 0 && (
          <div className="flex items-center gap-3 pt-1 border-t border-border/30">
            {stats && (
              <p className="text-xs text-muted-foreground flex-1">
                Promedio: <span className="font-semibold text-foreground">{fmt(stats.promedio, moneda)}</span>
                {' — '}Flat fee estimado: <span className="font-semibold text-primary">{fmt(stats.promedio * ((cliente.porcentaje_ahorro || 15) / 200), moneda)}/mes</span>
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              className="gap-1.5 rounded-lg h-8"
              onClick={async () => {
                setSaving(true);
                const montos = validFacturas.map(f => f.monto);
                const promedio = montos.reduce((a, b) => a + b, 0) / montos.length;
                await base44.entities.Cliente.update(cliente.id, {
                  facturas_historicas: montos,
                  costo_agua_mensual: promedio,
                });
                if (onUpdate) onUpdate({ ...cliente, facturas_historicas: montos, costo_agua_mensual: promedio });
                setSaving(false);
              }}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Guardando…' : 'Guardar facturas'}
            </Button>
          </div>
        )}

        {/* Scenario % editors */}
        <div className="border-t border-border/40 pt-4">
          <label className="text-xs text-muted-foreground mb-2 block">Escenarios de ahorro</label>
          <div className="grid grid-cols-3 gap-3">
            {escenarios.map((e, i) => (
              <div key={e.key} className="flex items-center gap-2 p-3 rounded-xl border-2" style={{ borderColor: e.color, backgroundColor: e.bg }}>
                <span className="text-xs font-semibold flex-1" style={{ color: e.text }}>{e.label}</span>
                <Input
                  type="number" min={1} max={50}
                  value={e.pct}
                  onChange={ev => updateEscenario(i, ev.target.value)}
                  className="w-16 h-7 text-sm rounded-lg px-2 text-center"
                />
                <span className="text-sm font-medium" style={{ color: e.text }}>%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Duration selector */}
        <div className="border-t border-border/40 pt-4">
          <label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Duración del contrato
          </label>
          <div className="flex gap-2 flex-wrap">
            {DURACIONES.map(d => (
              <button
                key={d}
                onClick={() => setDuracionMeses(d)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  duracionMeses === d
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {d} meses
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats summary */}
      {stats && validFacturas.length >= 2 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Promedio/mes', value: fmt(stats.promedio, moneda), sub: `${validFacturas.length} facturas` },
            { label: 'Factura más alta', value: fmt(stats.max, moneda), sub: 'máximo registrado' },
            { label: 'Factura más baja', value: fmt(stats.min, moneda), sub: 'mínimo registrado' },
            { label: 'Total analizado', value: fmt(stats.total, moneda), sub: 'suma de facturas' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold text-foreground mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scenario cards — client savings only */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {escenarios.map(e => {
            const ahorroMes = stats.promedio * (e.pct / 100) * 0.5;
            const totalContrato = proyeccionCompleta.reduce((s, m) => s + m.monto * (e.pct / 100) * 0.5, 0);
            return (
              <div key={e.key} className="rounded-xl p-4 space-y-3" style={{ backgroundColor: e.bg, border: `2px solid ${e.color}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: e.text }}>{e.label}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: e.color }}>{e.pct}%</span>
                </div>
                <div>
                  <p className="text-xs" style={{ color: e.text, opacity: 0.7 }}>Tu ahorro neto promedio / mes</p>
                  <p className="text-2xl font-black" style={{ color: e.text }}>{fmt(ahorroMes, moneda)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/80 rounded-lg p-2.5">
                    <p className="text-xs text-slate-500">Ahorro anual</p>
                    <p className="text-sm font-black text-green-700">{fmt(ahorroMes * 12, moneda)}</p>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2.5">
                    <p className="text-xs text-slate-500">Total {duracionMeses}m</p>
                    <p className="text-sm font-black" style={{ color: e.text }}>{fmt(totalContrato, moneda)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-invoice charts */}
      {validFacturas.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl p-5">
            <h4 className="text-sm font-semibold text-foreground mb-1">Factura real vs costo con válvula</h4>
            <p className="text-xs text-muted-foreground mb-4">Cada factura en los 3 escenarios</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barCategoryGap="20%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => fmt(v, moneda, true)} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => [fmt(v, moneda), name]} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Actual" fill="#ef4444" radius={[4, 4, 0, 0]} />
                {escenarios.map(e => (
                  <Bar key={e.key} dataKey={e.label} fill={e.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl p-5">
            <h4 className="text-sm font-semibold text-foreground mb-1">Tu ahorro neto por factura</h4>
            <p className="text-xs text-muted-foreground mb-4">Lo que vos te ahorras en cada factura</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={savingsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => fmt(v, moneda, true)} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => [fmt(v, moneda), name]} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {escenarios.map(e => (
                  <Line key={e.key} type="monotone" dataKey={e.label}
                    stroke={e.color} strokeWidth={2.5} dot={{ r: 4, fill: e.color }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Full contract projection chart */}
      {stats && proyeccionCompleta.length > 0 && (
        <div className="bg-card rounded-xl p-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Proyección del contrato completo · {duracionMeses} meses
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {validFacturas.length} mes{validFacturas.length !== 1 ? 'es' : ''} con datos reales ·
              zona sombreada = meses proyectados con promedio
            </p>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={proyeccionCompleta} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {validFacturas.length < duracionMeses && (
                <ReferenceArea
                  x1={proyeccionCompleta[validFacturas.length]?.mes}
                  x2={proyeccionCompleta[duracionMeses - 1]?.mes}
                  fill="hsl(var(--muted))"
                  fillOpacity={0.5}
                />
              )}
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={xAxisInterval} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => fmt(v, moneda, true)} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [fmt(v, moneda), name]} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {escenarios.map(e => (
                <Line
                  key={e.key}
                  type="monotone"
                  dataKey={e.label}
                  stroke={e.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
              {validFacturas.length > 0 && validFacturas.length < duracionMeses && (
                <ReferenceLine
                  x={proyeccionCompleta[validFacturas.length - 1]?.mes}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Contract totals */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/40">
            {escenarios.map(e => {
              const totalContrato = proyeccionCompleta.reduce((s, m) => s + m.monto * (e.pct / 100) * 0.5, 0);
              return (
                <div key={e.key} className="text-center p-3 rounded-xl" style={{ backgroundColor: e.bg }}>
                  <p className="text-xs font-semibold" style={{ color: e.text }}>{e.label}</p>
                  <p className="text-lg font-black mt-1" style={{ color: e.text }}>{fmt(totalContrato, moneda)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">tu ahorro total en {duracionMeses} meses</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate PDF */}
      {validFacturas.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={generatePDF} disabled={generando} className="gap-2 rounded-xl px-5">
            <FileDown className="w-4 h-4" />
            {generando ? 'Generando PDF...' : 'Generar Reporte PDF'}
          </Button>
        </div>
      )}

      {/* Hidden PDF report */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: -1 }}>
        <div ref={reportRef}>
          {stats && (
            <ReportePDF
              cliente={cliente}
              facturas={validFacturas}
              escenarios={escenarios}
              moneda={moneda}
              dominio={dominio}
              stats={stats}
              duracionMeses={duracionMeses}
              proyeccion={proyeccionCompleta.map(m => ({ mes: m.mes, monto: m.monto, esReal: m.esReal }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}