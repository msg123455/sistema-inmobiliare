import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function MovimientoForm({ valvulas, clientes, onSave, onCancel }) {
  const [data, setData] = useState({ valvula_id: '', tipo: 'entrada', cantidad: '', motivo: '', cliente_id: '' });

  const handleSubmit = () => {
    if (!data.valvula_id || !data.cantidad) return;
    const payload = { ...data, cantidad: parseInt(data.cantidad) };
    if (!payload.motivo) delete payload.motivo;
    if (!payload.cliente_id || payload.tipo !== 'salida') delete payload.cliente_id;
    onSave(payload);
  };

  return (
    <div className="bg-card rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Registrar Movimiento</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Válvula</label>
          <Select value={data.valvula_id} onValueChange={(val) => setData({ ...data, valvula_id: val })}>
            <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar válvula" /></SelectTrigger>
            <SelectContent>
              {valvulas.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.nombre} ({v.pulgadas}")</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={data.tipo} onValueChange={(val) => setData({ ...data, tipo: val })}>
              <SelectTrigger className="mt-1 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="salida">Salida</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
            <Input type="number" min="1" value={data.cantidad} onChange={(e) => setData({ ...data, cantidad: e.target.value })} placeholder="0" className="mt-1 rounded-lg" />
          </div>
        </div>
        {data.tipo === 'salida' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cliente (opcional)</label>
            <Select value={data.cliente_id} onValueChange={(val) => setData({ ...data, cliente_id: val })}>
              <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Sin cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Motivo (opcional)</label>
          <Input value={data.motivo} onChange={(e) => setData({ ...data, motivo: e.target.value })} placeholder="Compra, instalación, devolución..." className="mt-1 rounded-lg" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSubmit} className="flex-1 rounded-lg">Registrar</Button>
          <Button onClick={onCancel} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}