import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function AnalisisIA({ escenarios, config }) {
  const [analisis, setAnalisis] = useState('');
  const [loading, setLoading] = useState(false);

  const analizar = async () => {
    setLoading(true);
    setAnalisis('');

    const resumen = escenarios.map(e => ({
      precio_inversionista: e.precio_inversionista,
      sobreprecio: e.sobreprecio,
      ahorro_cliente_mes: e.ahorro_cliente_mes,
      ganancia_inversionista_mes: e.ganancia_inversionista_mes,
      empresa_neto_mes: e.empresa_neto_mes,
      meses_roi: e.meses_roi_inversionista,
      ganancia_inv_24m: e.ganancia_inversionista_24m,
      empresa_neto_24m: e.empresa_neto_24m,
      valvulas_extra: e.valvulas_extra,
      ingreso_extra_mes: e.ingreso_extra_mes,
      score: e.score,
    }));

    const prompt = `Eres un analista financiero experto en modelos de inversión y ahorro de agua con válvulas inteligentes. 

CONTEXTO DEL NEGOCIO:
- Vendemos válvulas de ahorro de agua. Costo real de la válvula: $${config.costo_real} USD.
- La válvula ahorra un ${config.pct_ahorro}% del consumo de agua del cliente.
- El cliente paga $${config.costo_agua_cliente}/mes de agua.
- El ahorro generado se divide 50/50 entre el cliente y nuestra empresa.
- Un inversionista compra la válvula a un precio inflado y recibe el ${config.pct_inversionista}% del 50% de empresa durante 24 meses.
- Con el sobreprecio, compramos más válvulas (efecto multiplicador).
- Queremos que el inversionista recupere su inversión en ≤12 meses.

ESCENARIOS SIMULADOS:
${JSON.stringify(resumen, null, 2)}

ANALIZA en español:
1. **Resumen ejecutivo**: ¿Cuál es el mejor escenario y por qué?
2. **Análisis para el inversionista**: ¿Qué tan atractiva es la inversión? ¿Cómo se compara con otras inversiones típicas (bonos, S&P500, bienes raíces)?
3. **Análisis para la empresa**: ¿Cuál precio maximiza el crecimiento a largo plazo considerando el efecto multiplicador?
4. **Riesgos**: ¿Qué podría salir mal? ¿Qué variables son las más sensibles?
5. **Recomendación final**: Un precio específico con justificación y cómo presentar la oferta al inversionista.

Sé concreto con números. Usa formato markdown con headers y bullet points.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
    });

    setAnalisis(response);
    setLoading(false);
  };

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-foreground">Análisis con IA</h2>
        </div>
        <Button onClick={analizar} disabled={loading || !escenarios.length} size="sm" className="gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Analizando...' : 'Analizar con IA'}
        </Button>
      </div>

      {!analisis && !loading && (
        <p className="text-xs text-muted-foreground">Simula escenarios arriba y haz clic en "Analizar con IA" para obtener recomendaciones detalladas. Usa un modelo avanzado (consume más créditos).</p>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
          <p className="text-sm text-muted-foreground">Analizando escenarios con modelo avanzado...</p>
        </div>
      )}

      {analisis && (
        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-4 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h3>,
              p: ({ children }) => <p className="text-sm text-foreground/80 my-1.5 leading-relaxed">{children}</p>,
              li: ({ children }) => <li className="text-sm text-foreground/80 my-0.5">{children}</li>,
              strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside my-1.5 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside my-1.5 space-y-0.5">{children}</ol>,
            }}
          >
            {analisis}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}