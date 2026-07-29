import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import SimuladorConfig from '@/components/proyecciones/SimuladorConfig';
import EscenarioCard from '@/components/proyecciones/EscenarioCard';
import RecomendacionPanel from '@/components/proyecciones/RecomendacionPanel';
import AnalisisIA from '@/components/proyecciones/AnalisisIA';

export default function SimuladorValvula() {
  const [config, setConfig] = useState({
    valvula_id: '',
    costo_real: 0,
    costo_agua_cliente: 500,
    pct_ahorro: 15,
    pct_inversionista: 60,
    contrato_anios: 3,
    precio_min: 1500,
    precio_max: 5000,
    incremento: 500,
  });
  const [escenarios, setEscenarios] = useState([]);
  const [bestIdx, setBestIdx] = useState(-1);

  const { data: valvulas = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  const simular = () => {
    const { costo_real, costo_agua_cliente, pct_ahorro, pct_inversionista, contrato_anios, precio_min, precio_max, incremento } = config;
    if (!costo_real || !costo_agua_cliente || !incremento) return;

    const results = [];
    const ahorro_total_mes = costo_agua_cliente * (pct_ahorro / 100);
    const parte_empresa_mes = ahorro_total_mes * 0.5;
    const ganancia_inversionista_mes = parte_empresa_mes * (pct_inversionista / 100);
    const empresa_neto_mes = parte_empresa_mes - ganancia_inversionista_mes;

    for (let precio = precio_min; precio <= precio_max; precio += incremento) {
      const sobreprecio = precio - costo_real;
      const meses_roi = ganancia_inversionista_mes > 0 ? precio / ganancia_inversionista_mes : Infinity;
      const ganancia_inv_24m = ganancia_inversionista_mes * 24;
      const valvulas_extra = sobreprecio > 0 ? Math.floor(sobreprecio / costo_real) : 0;
      const ingreso_extra_mes = valvulas_extra * parte_empresa_mes;

      const meses_contrato = (contrato_anios || 3) * 12;
      const meses_pago_inv = Math.min(24, meses_contrato);
      const meses_libres = Math.max(0, meses_contrato - meses_pago_inv);
      const ingreso_empresa_durante_inv = empresa_neto_mes * meses_pago_inv;
      const ingreso_empresa_post_inv = parte_empresa_mes * meses_libres;
      const ingreso_contrato_total = ingreso_empresa_durante_inv + ingreso_empresa_post_inv;
      const utilidad_contrato = ingreso_contrato_total - costo_real;

      let score = 0;
      if (meses_roi <= 12) {
        score += 40 * (1 - meses_roi / 12);
        score += 30 * Math.min(valvulas_extra / 5, 1);
        score += 30 * Math.min(empresa_neto_mes / parte_empresa_mes, 1);
      }

      results.push({
        precio_inversionista: precio, sobreprecio, ahorro_cliente_mes: ahorro_total_mes,
        parte_empresa_mes, ganancia_inversionista_mes, empresa_neto_mes,
        meses_roi_inversionista: meses_roi, ganancia_inversionista_24m: ganancia_inv_24m,
        empresa_neto_24m: empresa_neto_mes * 24, valvulas_extra, ingreso_extra_mes, score,
        meses_contrato, meses_pago_inv, meses_libres,
        ingreso_contrato_total, utilidad_contrato, ingreso_empresa_post_inv,
      });
    }

    setEscenarios(results);
    const viables = results.filter(e => e.meses_roi_inversionista <= 12);
    if (viables.length > 0) {
      const best = viables.reduce((a, b) => a.score > b.score ? a : b);
      setBestIdx(results.indexOf(best));
    } else {
      setBestIdx(-1);
    }
  };

  const chartData = escenarios.map(e => ({
    precio: `$${e.precio_inversionista.toLocaleString()}`,
    'Empresa neto/mes': parseFloat(e.empresa_neto_mes.toFixed(2)),
    'Inversionista/mes': parseFloat(e.ganancia_inversionista_mes.toFixed(2)),
    'Ingreso extra (multiplicador)': parseFloat(e.ingreso_extra_mes.toFixed(2)),
  }));

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '13px' },
  };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-medium text-sm mb-1">¿Cómo funciona?</p>
        <p>1. La válvula genera ahorro en agua al cliente → ese ahorro se divide 50/50 (cliente / empresa)</p>
        <p>2. Del 50% de empresa, el inversionista recibe su % durante 24 meses</p>
        <p>3. El inversionista paga un precio inflado → el sobreprecio financia más válvulas (multiplicador)</p>
        <p>4. Se busca el precio que dé ROI ≤ 12 meses al inversionista y maximice las válvulas extra</p>
      </div>

      <SimuladorConfig config={config} setConfig={setConfig} valvulas={valvulas} onSimular={simular} />

      {escenarios.length > 0 && (
        <>
          <RecomendacionPanel escenarios={escenarios} config={config} />
          <AnalisisIA escenarios={escenarios} config={config} />

          <div className="bg-card rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Comparación de Escenarios</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="precio" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Empresa neto/mes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Inversionista/mes" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ingreso extra (multiplicador)" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Detalle por Escenario</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {escenarios.map((esc, i) => (
                <EscenarioCard key={i} escenario={esc} isBest={i === bestIdx} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}