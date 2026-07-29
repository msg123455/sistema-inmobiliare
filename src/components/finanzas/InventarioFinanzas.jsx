import React from 'react';
import { Package, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

export default function InventarioFinanzas({ stockMap, valvulas, clientesFlujo, clientes, costoPromedioValvula, utilidadNetaMes }) {
  // Calcular demanda de válvulas de clientes en pipeline (no activos aún)
  const clientesPipeline = clientes.filter(c =>
    c.etapa_pipeline !== 'Activo' && Object.keys(c.valvulas_cantidades || {}).length > 0
  );

  // Demanda por tipo de válvula (de todos los clientes en pipeline)
  const demandaPorValvula = {};
  clientesPipeline.forEach(c => {
    Object.entries(c.valvulas_cantidades || {}).forEach(([vid, qty]) => {
      demandaPorValvula[vid] = (demandaPorValvula[vid] || 0) + qty;
    });
  });

  // Válvulas ya asignadas a clientes activos
  const asignadaPorValvula = {};
  clientes.filter(c => c.etapa_pipeline === 'Activo').forEach(c => {
    Object.entries(c.valvulas_cantidades || {}).forEach(([vid, qty]) => {
      asignadaPorValvula[vid] = (asignadaPorValvula[vid] || 0) + qty;
    });
  });

  // Resumen por válvula
  const resumenValvulas = valvulas.map(v => {
    const stock = stockMap[v.id] || 0;
    const demanda = demandaPorValvula[v.id] || 0;
    const asignadas = asignadaPorValvula[v.id] || 0;
    const disponible = stock;
    const deficit = Math.max(0, demanda - disponible);
    const costoDeficit = deficit * v.costo_compra;
    const mesesParaCubrir = utilidadNetaMes > 0 && costoDeficit > 0 ? Math.ceil(costoDeficit / utilidadNetaMes) : 0;

    return {
      valvula: v, stock, demanda, asignadas, disponible, deficit, costoDeficit, mesesParaCubrir,
    };
  }).filter(r => r.stock > 0 || r.demanda > 0 || r.asignadas > 0);

  const totalStock = resumenValvulas.reduce((s, r) => s + r.stock, 0);
  const totalDemanda = resumenValvulas.reduce((s, r) => s + r.demanda, 0);
  const totalDeficit = resumenValvulas.reduce((s, r) => s + r.deficit, 0);
  const costoTotalDeficit = resumenValvulas.reduce((s, r) => s + r.costoDeficit, 0);
  const valorInventario = resumenValvulas.reduce((s, r) => s + (r.stock * r.valvula.costo_compra), 0);
  const mesesTotales = utilidadNetaMes > 0 && costoTotalDeficit > 0 ? Math.ceil(costoTotalDeficit / utilidadNetaMes) : 0;



  return (
    <div className="space-y-5">
      {/* KPIs inventario */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={Package} label="Stock actual" value={`${totalStock} uds`} color="text-foreground" />
        <KPI icon={TrendingUp} label="Valor inventario" value={`$${valorInventario.toLocaleString()}`} color="text-primary" />
        <KPI icon={Package} label="Demanda pipeline" value={`${totalDemanda} uds`} color="text-yellow-600" />
        <KPI icon={AlertTriangle} label="Déficit" value={`${totalDeficit} uds`} color={totalDeficit > 0 ? 'text-red-600' : 'text-green-600'} />
        <KPI icon={Package} label="Costo para cubrir" value={`$${costoTotalDeficit.toLocaleString()}`} sub={mesesTotales > 0 ? `${mesesTotales} mes(es) de utilidad` : 'Cubierto'} color="text-foreground" />
      </div>

      {/* Tabla stock vs demanda */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold text-foreground">Stock vs Demanda de Clientes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Válvula</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Costo/ud</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">En Stock</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Instaladas</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Demanda Pipeline</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Déficit</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Costo Déficit</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Meses p/ cubrir</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {resumenValvulas.map((r) => (
                <tr key={r.valvula.id} className={r.deficit > 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.valvula.nombre} ({r.valvula.pulgadas}")</td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">${r.valvula.costo_compra.toLocaleString()}</td>
                  <td className="text-right px-4 py-2.5 font-medium text-foreground">{r.stock}</td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">{r.asignadas}</td>
                  <td className="text-right px-4 py-2.5 text-yellow-600 font-medium">{r.demanda}</td>
                  <td className={`text-right px-4 py-2.5 font-semibold ${r.deficit > 0 ? 'text-red-600' : 'text-green-600'}`}>{r.deficit}</td>
                  <td className="text-right px-4 py-2.5 text-foreground">{r.costoDeficit > 0 ? `$${r.costoDeficit.toLocaleString()}` : '—'}</td>
                  <td className="text-right px-4 py-2.5 text-foreground">{r.mesesParaCubrir > 0 ? r.mesesParaCubrir : '—'}</td>
                  <td className="text-center px-4 py-2.5">
                    {r.deficit > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3" /> Faltante</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>



      {/* Detalle por cliente en pipeline */}
      {clientesPipeline.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">Válvulas Necesarias por Prospecto</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Etapa</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Válvulas necesarias</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Costo total</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Cubierto con stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {clientesPipeline.map(c => {
                  const items = Object.entries(c.valvulas_cantidades || {}).map(([vid, qty]) => {
                    const v = valvulas.find(x => x.id === vid);
                    return v ? { nombre: `${qty}x ${v.nombre}`, costo: v.costo_compra * qty, qty, stock: stockMap[vid] || 0 } : null;
                  }).filter(Boolean);
                  const costoTotal = items.reduce((s, i) => s + i.costo, 0);
                  const cubierto = items.every(i => i.stock >= i.qty);
                  const etapaLabels = { Prospecto: 'Prospecto', Lead: 'Lead', Evaluacion_tecnica: 'Hacer eval. técnica', Instalacion: 'Pend. instalación' };

                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">{c.nombre_empresa}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{etapaLabels[c.etapa_pipeline] || c.etapa_pipeline}</td>
                      <td className="px-4 py-2.5 text-foreground">{items.map(i => i.nombre).join(', ')}</td>
                      <td className="text-right px-4 py-2.5 font-medium text-foreground">${costoTotal.toLocaleString()}</td>
                      <td className="text-center px-4 py-2.5">
                        {cubierto ? (
                          <span className="text-green-600 flex items-center justify-end gap-1"><CheckCircle className="w-3 h-3" /> Sí</span>
                        ) : (
                          <span className="text-red-600 flex items-center justify-end gap-1"><AlertTriangle className="w-3 h-3" /> No</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}