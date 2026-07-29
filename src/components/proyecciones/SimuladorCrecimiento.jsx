import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Rocket, Calculator } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function SimuladorCrecimiento() {
  const [config, setConfig] = useState({
    clientes_iniciales: 5,
    ingreso_promedio_cliente_mes: 200,
    costo_promedio_valvula: 2000,
    nuevos_clientes_mes: 2,
    pct_reinversion: 50,
    meses: 60,
  });
  const [resultado, setResultado] = useState(null);

  const simular = () => {
    const { clientes_iniciales, ingreso_promedio_cliente_mes, costo_promedio_valvula, nuevos_clientes_mes, pct_reinversion, meses } = config;
    const datos = [];
    let clientesActivos = clientes_iniciales;
    let cajaAcumulada = 0;
    let ingresoTotal = 0;
    let inversionTotal = clientes_iniciales * costo_promedio_valvula;
    let clientesFinanciados = 0;

    for (let m = 1; m <= meses; m++) {
      const ingresoMes = clientesActivos * ingreso_promedio_cliente_mes;
      ingresoTotal += ingresoMes;
      const paraReinvertir = ingresoMes * (pct_reinversion / 100);
      const paraCaja = ingresoMes - paraReinvertir;
      cajaAcumulada += paraCaja;

      // Nuevos clientes por ventas normales
      clientesActivos += nuevos_clientes_mes;
      inversionTotal += nuevos_clientes_mes * costo_promedio_valvula;

      // Nuevos clientes financiados con reinversión
      const clientesConReinversion = Math.floor(paraReinvertir / costo_promedio_valvula);
      if (clientesConReinversion > 0) {
        clientesActivos += clientesConReinversion;
        clientesFinanciados += clientesConReinversion;
      }

      datos.push({
        mes: m,
        label: m % 6 === 0 ? `Mes ${m}` : '',
        clientes: clientesActivos,
        ingreso_mensual: Math.round(ingresoMes),
        caja_acumulada: Math.round(cajaAcumulada),
        ingreso_total: Math.round(ingresoTotal),
      });
    }

    setResultado({ datos, clientesFinanciados, inversionTotal, cajaAcumulada, ingresoTotal, clientesFinal: clientesActivos });
  };

  const fields = [
    { key: 'clientes_iniciales', label: 'Clientes iniciales', placeholder: '5' },
    { key: 'ingreso_promedio_cliente_mes', label: 'Ingreso promedio/cliente/mes (USD)', placeholder: '200' },
    { key: 'costo_promedio_valvula', label: 'Costo promedio válvula (USD)', placeholder: '2000' },
    { key: 'nuevos_clientes_mes', label: 'Nuevos clientes/mes (ventas)', placeholder: '2' },
    { key: 'pct_reinversion', label: '% reinversión de ganancias', placeholder: '50' },
    { key: 'meses', label: 'Proyección (meses)', placeholder: '60' },
  ];

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '12px' },
  };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-medium text-sm mb-1">Simulador de Crecimiento a Largo Plazo</p>
        <p>Proyecta cómo crece tu negocio si reinviertes parte de las ganancias en nuevas válvulas. Simula el efecto bola de nieve: más clientes → más ingresos → más válvulas.</p>
      </div>

      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Rocket className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Parámetros</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <Input type="number" value={config[f.key]} onChange={(e) => setConfig({ ...config, [f.key]: parseFloat(e.target.value) || 0 })} placeholder={f.placeholder} className="mt-1 rounded-lg" />
            </div>
          ))}
        </div>
        <Button onClick={simular} className="w-full mt-4 rounded-lg">
          <Calculator className="w-4 h-4 mr-2" /> Proyectar Crecimiento
        </Button>
      </div>

      {resultado && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Clientes al final" value={resultado.clientesFinal} />
            <KPI label="Ingreso total acumulado" value={`$${resultado.ingresoTotal.toLocaleString()}`} color="text-primary" />
            <KPI label="Caja acumulada (tuya)" value={`$${Math.round(resultado.cajaAcumulada).toLocaleString()}`} color="text-green-600" />
            <KPI label="Clientes financiados con reinversión" value={resultado.clientesFinanciados} color="text-purple-600" />
          </div>

          {/* Gráfica clientes */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Crecimiento de Clientes</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={resultado.datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="clientes" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} name="Clientes activos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfica ingresos */}
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Ingresos Acumulados</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={resultado.datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="ingreso_total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} name="Ingreso total" />
                <Area type="monotone" dataKey="caja_acumulada" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.1} name="Caja (tu parte)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, color = 'text-foreground' }) {
  return (
    <div className="bg-card rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}