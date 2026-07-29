import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SlidersHorizontal, Save, RotateCcw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_CONFIG_EVAL, mergeConfigEval } from '@/lib/evaluadorConfig';

const ConfigEvaluador = base44.entities.ConfigEvaluador;

function Campo({ label, hint, value, onChange, rows = 3 }) {
  return (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1 text-sm" />
    </div>
  );
}

export default function ConfigEvaluadorPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(mergeConfigEval({}));
  const [registro, setRegistro] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['config_evaluador'],
    queryFn: () => ConfigEvaluador.list('-created_date', 1),
  });

  useEffect(() => {
    if (configs.length > 0) {
      setRegistro(configs[0]);
      setForm(mergeConfigEval(configs[0]));
    }
  }, [configs]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    try {
      if (registro) {
        await ConfigEvaluador.update(registro.id, form);
      } else {
        const nuevo = await ConfigEvaluador.create(form);
        setRegistro(nuevo);
      }
      qc.invalidateQueries({ queryKey: ['config_evaluador'] });
      toast.success('Criterios guardados. El juez los usará en la próxima evaluación.');
    } catch {
      toast.error('No se pudo guardar. ¿La entidad ConfigEvaluador ya existe en Base44?');
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = () => {
    setForm(mergeConfigEval({}));
    toast.info('Valores por defecto cargados. Dale a Guardar para aplicarlos.');
  };

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Cargando configuración...</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="w-7 h-7" />Configuración del evaluador
          </h1>
          <p className="text-muted-foreground text-[15px]">Todo lo que el juez toma en cuenta para calificar a Valentina. Edítalo para afinar la evaluación.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={restaurar}><RotateCcw className="w-4 h-4 mr-1" />Restaurar</Button>
          <Button onClick={guardar} disabled={guardando}><Save className="w-4 h-4 mr-1" />{guardando ? 'Guardando...' : 'Guardar'}</Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>El juez usa un modelo Opus vía créditos de Base44 y compara cada conversación contra estas reglas y criterios. Los cambios aplican en la próxima corrida de "Evaluar".</span>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <Campo
            label="Cómo debe trabajar Valentina"
            hint="Las reglas de negocio contra las que el juez compara cada chat."
            value={form.contexto_valentina}
            onChange={(v) => set('contexto_valentina', v)}
            rows={8}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold">Criterios por dimensión (cada una se puntúa de 0 a 100)</p>
          <Campo label="Calificación" value={form.criterio_calificacion} onChange={(v) => set('criterio_calificacion', v)} rows={2} />
          <Campo label="Humanización" value={form.criterio_humanizacion} onChange={(v) => set('criterio_humanizacion', v)} rows={2} />
          <Campo label="Rapidez" value={form.criterio_rapidez} onChange={(v) => set('criterio_rapidez', v)} rows={2} />
          <Campo label="Cierre" value={form.criterio_cierre} onChange={(v) => set('criterio_cierre', v)} rows={2} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <Campo
            label="Instrucciones extra para el juez"
            hint="Cómo puntuar casos límite, formato de salida, tono de las lecciones."
            value={form.instrucciones}
            onChange={(v) => set('instrucciones', v)}
            rows={4}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Modelo del juez</Label>
              <p className="text-xs text-muted-foreground mb-1">Base44 sirve <code>claude_opus_4_1</code> como Opus 4.8.</p>
              <Input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium">Pausa entre chats (ms)</Label>
              <p className="text-xs text-muted-foreground mb-1">Espacia las llamadas para mantener Opus (evita el degradado a Sonnet).</p>
              <Input type="number" value={form.pausa_ms} onChange={(e) => set('pausa_ms', Number(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
