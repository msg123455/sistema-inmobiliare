import { useQuery } from '@tanstack/react-query';
import { Contacto, Visita, HistorialLead, Conversacion } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList,
} from 'recharts';
import { TrendingUp, Users, Bot, Calendar, Target, Clock } from 'lucide-react';

const TEMP_COLORS_HEX = {
  Frio: '#93C5FD',
  Tibio: '#FCD34D',
  Caliente: '#FB923C',
  Urgente: '#F87171',
};

const CANAL_COLORS = {
  Prospecto_propio: '#6366F1',
  Referido: '#10B981',
  Portal_web: '#F59E0B',
  Redes_sociales: '#EC4899',
  WASI: '#8B5CF6',
  Publicidad: '#3B82F6',
  Evento: '#14B8A6',
  Otro: '#9CA3AF',
};

const ETAPAS_ORDER = [
  'Lead', 'Visita_Agendada', 'Oferta', 'Negociacion', 'Promesa', 'Escritura', 'Activo',
];

function StatCard({ icon, label, value, sub, color = 'text-blue-600' }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsLeads() {
  const { data: leads = [] } = useQuery({
    queryKey: ['leads_analytics'],
    queryFn: () => Contacto.list('-created_at'),
  });

  const { data: visitas = [] } = useQuery({
    queryKey: ['visitas_analytics'],
    queryFn: () => Visita.list('-fecha_hora'),
  });

  const { data: conversaciones = [] } = useQuery({
    queryKey: ['conversaciones_analytics'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
  });

  // ── KPIs ──
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const leadsHoy = leads.filter((l) => new Date(l.created_at) >= hoy).length;
  const leadsClasfIA = leads.filter((l) => l.ia_calificado).length;
  const visitasAutoAgendadas = visitas.filter((v) => {
    // las agendadas por IA no tienen agente_email definido o tienen 'ia@sistema'
    return v.agente_email === '' || !v.agente_email;
  }).length;
  const enConversacion = conversaciones.filter((c) => c.estado === 'IA_Activa').length;

  // Tasa de conversión global (Lead → cualquier etapa avanzada)
  const convertidos = leads.filter((l) =>
    ['Oferta', 'Negociacion', 'Promesa', 'Escritura', 'Activo', 'Contrato'].includes(l.etapa_pipeline)
  ).length;
  const tasaConversion = leads.length > 0 ? Math.round((convertidos / leads.length) * 100) : 0;

  // ── Funnel por etapa ──
  const funnelData = ETAPAS_ORDER.map((etapa, i) => {
    const count = leads.filter((l) => l.etapa_pipeline === etapa).length;
    const prev = i > 0 ? leads.filter((l) => l.etapa_pipeline === ETAPAS_ORDER[i - 1]).length : leads.length;
    const conversion = prev > 0 ? Math.round((count / prev) * 100) : 0;
    return { name: etapa.replace(/_/g, ' '), value: count, conversion };
  }).filter((d) => d.value > 0);

  // ── Por temperatura ──
  const tempData = ['Frio', 'Tibio', 'Caliente', 'Urgente'].map((t) => ({
    name: t,
    value: leads.filter((l) => l.temperatura === t).length,
    fill: TEMP_COLORS_HEX[t],
  })).filter((d) => d.value > 0);

  // ── Por canal ──
  const canalData = Object.entries(
    leads.reduce((acc, l) => {
      const c = l.canal_adquisicion || 'Otro';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value, fill: CANAL_COLORS[name] || '#9CA3AF' }));

  // ── Leads perdidos por razón ──
  const perdidos = leads.filter((l) => l.etapa_pipeline === 'Perdido');
  const motivosData = Object.entries(
    perdidos.reduce((acc, l) => {
      const m = l.motivo_perdida || 'No especificado';
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // ── Rendimiento por agente ──
  const agenteData = Object.entries(
    leads.reduce((acc, l) => {
      const a = l.asignado_a || 'Sin asignar';
      if (!acc[a]) acc[a] = { leads: 0, conversiones: 0 };
      acc[a].leads++;
      if (convertidos && ['Oferta', 'Negociacion', 'Promesa', 'Escritura', 'Activo'].includes(l.etapa_pipeline)) {
        acc[a].conversiones++;
      }
      return acc;
    }, {})
  ).map(([agente, data]) => ({
    agente: agente.split('@')[0],
    leads: data.leads,
    conversiones: data.conversiones,
    tasa: data.leads > 0 ? Math.round((data.conversiones / data.leads) * 100) : 0,
  })).sort((a, b) => b.leads - a.leads);

  const CUSTOM_TOOLTIP = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white border rounded-lg shadow-lg p-2 text-sm">
          <p className="font-medium">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Analítica de Leads</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Leads nuevos hoy"
          value={leadsHoy}
          sub={`${leads.length} total`}
          color="text-blue-600"
        />
        <StatCard
          icon={<Bot className="w-5 h-5" />}
          label="Calificados por IA"
          value={leadsClasfIA}
          sub={`${leads.length > 0 ? Math.round((leadsClasfIA / leads.length) * 100) : 0}% del total`}
          color="text-violet-600"
        />
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="Visitas auto-agendadas"
          value={visitasAutoAgendadas}
          sub="por el agente IA"
          color="text-green-600"
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Tasa de conversión"
          value={`${tasaConversion}%`}
          sub={`${convertidos} leads avanzados`}
          color="text-orange-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel de leads */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leads por etapa del pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {funnelData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 text-right">{item.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2"
                        style={{
                          width: `${funnelData[0].value > 0 ? (item.value / funnelData[0].value) * 100 : 0}%`,
                          backgroundColor: `hsl(${220 - i * 25}, 80%, ${55 + i * 5}%)`,
                          minWidth: item.value > 0 ? '2rem' : 0,
                        }}
                      >
                        <span className="text-xs text-white font-bold">{item.value}</span>
                      </div>
                    </div>
                    {i > 0 && funnelData[i - 1].value > 0 && (
                      <span className="text-xs text-gray-400 w-12">
                        {Math.round((item.value / funnelData[i - 1].value) * 100)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por temperatura */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Temperatura de leads</CardTitle>
          </CardHeader>
          <CardContent>
            {tempData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tempData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {tempData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Por canal de adquisición */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leads por canal</CardTitle>
          </CardHeader>
          <CardContent>
            {canalData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={canalData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]}>
                    {canalData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Leads perdidos por razón */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Razones de pérdida ({perdidos.length} leads)</CardTitle>
          </CardHeader>
          <CardContent>
            {motivosData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin leads perdidos</p>
            ) : (
              <div className="space-y-2">
                {motivosData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 flex-1 truncate">{item.name}</span>
                    <div className="w-32 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full flex items-center justify-end pr-1"
                        style={{ width: `${(item.value / (motivosData[0]?.value || 1)) * 100}%` }}
                      >
                        <span className="text-xs text-white font-bold">{item.value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rendimiento por agente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Rendimiento por agente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agenteData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin datos de asignación</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 text-xs text-gray-500">Agente</th>
                    <th className="text-center pb-2 text-xs text-gray-500">Leads</th>
                    <th className="text-center pb-2 text-xs text-gray-500">Avanzados</th>
                    <th className="text-center pb-2 text-xs text-gray-500">Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {agenteData.map((row) => (
                    <tr key={row.agente} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.agente}</td>
                      <td className="text-center py-2">{row.leads}</td>
                      <td className="text-center py-2 text-green-600">{row.conversiones}</td>
                      <td className="text-center py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          row.tasa >= 30 ? 'bg-green-100 text-green-700' :
                          row.tasa >= 15 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {row.tasa}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversaciones IA activas */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{enConversacion}</p>
            <p className="text-xs text-gray-500 mt-1">IA activa ahora</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">
              {conversaciones.filter((c) => c.estado === 'En_Espera_Humano').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Esperando agente humano</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {conversaciones.filter((c) => c.estado === 'Asignada').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Asignadas a agente</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}