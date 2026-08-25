#!/usr/bin/env node
// Medicion de peso real del prompt por agente. Temporal.
import { toolsDe } from '../base44/functions/_core/tools/index.ts';
import { AGENTES } from '../base44/functions/_core/protocol.ts';
import { armarSystem } from '../base44/functions/_core/contexto.ts';
import { IDENTIDAD_MARCA, PROMPTS } from '../base44/functions/_core/prompts.ts';
import { estadoVacio } from '../base44/functions/_core/state.ts';

const tok = (s) => Math.round(s.length / 3.6); // ~3.6 chars/token en espanol

console.log('=== IDENTIDAD_MARCA ===');
console.log(`chars ${IDENTIDAD_MARCA.length}  ~tokens ${tok(IDENTIDAD_MARCA)}`);

console.log('\n=== PROMPTS por agente (codigo) ===');
for (const a of AGENTES) {
  console.log(`${a.padEnd(14)} chars ${String(PROMPTS[a].length).padStart(6)}  ~tokens ${tok(PROMPTS[a])}`);
}

console.log('\n=== DEFINICIONES DE TOOLS por agente (viajan en CADA llamada) ===');
for (const a of AGENTES) {
  const tools = toolsDe(a);
  const defs = Object.values(tools).map((t) => t.def);
  const json = JSON.stringify(defs);
  console.log(`${a.padEnd(14)} n=${String(defs.length).padStart(2)}  chars ${String(json.length).padStart(6)}  ~tokens ${String(tok(json)).padStart(5)}`);
}

console.log('\n=== DETALLE tools de VENTAS (la mas cara) ===');
{
  const tools = toolsDe('ventas');
  const filas = Object.entries(tools).map(([n, t]) => {
    const j = JSON.stringify(t.def);
    return { n, chars: j.length, desc: (t.def.description || '').length, esquema: j.length - (t.def.description || '').length };
  }).sort((x, y) => y.chars - x.chars);
  for (const f of filas) {
    console.log(`  ${f.n.padEnd(22)} total ${String(f.chars).padStart(5)}  desc ${String(f.desc).padStart(5)}  esquema ${String(f.esquema).padStart(5)}  ~tok ${tok(String(f.chars * 0 + f.chars))}`);
  }
  const total = filas.reduce((s, f) => s + f.chars, 0);
  console.log(`  TOTAL ventas: ${total} chars  ~${tok('x'.repeat(total))} tokens`);
}

console.log('\n=== armarSystem SIN RAG (solo identidad+prompt), por agente ===');
for (const a of AGENTES) {
  const estado = estadoVacio();
  estado.agente_activo = a;
  const base = {
    config: {}, prompt: null, identidadMarca: '', rag: '', ragTitulos: [], ragChars: 0,
    promptOrigen: 'codigo', promptVersion: null, marcaOrigen: 'codigo',
    ragDetalle: [], ragDescartados: [], ragActivos: 0,
  };
  const bloques = armarSystem(base, a, estado, {});
  const estable = bloques[0].text;
  const volatil = bloques[1].text;
  console.log(`${a.padEnd(14)} estable ${String(estable.length).padStart(6)}ch (~${tok(estable)}tok) cache=${!!bloques[0].cache_control}  volatil ${String(volatil.length).padStart(5)}ch (~${tok(volatil)}tok) cache=${!!bloques[1].cache_control}`);
}

console.log('\n=== PRUEBA: entra el mapa de zonas en el system? ===');
{
  const estado = estadoVacio();
  estado.agente_activo = 'ventas';
  const base = {
    config: {}, prompt: null, identidadMarca: '', rag: '', ragTitulos: [], ragChars: 0,
    promptOrigen: 'codigo', promptVersion: null, marcaOrigen: 'codigo',
    ragDetalle: [], ragDescartados: [], ragActivos: 0,
  };
  // Esto es EXACTAMENTE lo que devuelve el cargador de ventas en contexto.ts
  const ctxComoLoDevuelveElCargador = {
    campana: null,
    zonas: Array.from({ length: 517 }, (_, i) => ({ nombre: `Zona ${i}`, normalizado: `zona ${i}` })),
  };
  const bloques = armarSystem(base, 'ventas', estado, ctxComoLoDevuelveElCargador);
  const hay = bloques.some((b) => b.text.includes('ZONAS CON INVENTARIO'));
  console.log(`  con ctx.zonas (lo real):            bloque de zonas presente = ${hay}  estable=${bloques[0].text.length}ch`);

  const bloques2 = armarSystem(base, 'ventas', estado, { zonas_disponibles: Array.from({ length: 517 }, (_, i) => `Zona ${i}`) });
  const hay2 = bloques2.some((b) => b.text.includes('ZONAS CON INVENTARIO'));
  console.log(`  con ctx.zonas_disponibles (lo que lee): bloque presente = ${hay2}  estable=${bloques2[0].text.length}ch`);
}
