import { CHUNKS as MOD } from './.modulos.ts';
import { CHUNKS as COM } from './.comun.ts';
import { seleccionarRag, MAX_RAG_CHARS } from '../base44/functions/_core/contexto.ts';
import { toolsDe } from '../base44/functions/_core/tools/index.ts';
import { AGENTES } from '../base44/functions/_core/protocol.ts';
import { armarSystem } from '../base44/functions/_core/contexto.ts';
import { IDENTIDAD_MARCA, PROMPTS } from '../base44/functions/_core/prompts.ts';
import { estadoVacio } from '../base44/functions/_core/state.ts';

const todos = [...COM, ...MOD];
const tok = (s) => Math.round(s.length / 3.6);

console.log(`chunks sembrados: comun ${COM.length} + modulos ${MOD.length} = ${todos.length}`);
console.log(`MAX_RAG_CHARS = ${MAX_RAG_CHARS}\n`);

console.log('agente         | ragChars | ~ragTok | descartados | toolsTok | estableTok | volatilTok | TOTAL~tok');
console.log('-'.repeat(105));
const filas = [];
for (const a of AGENTES) {
  const sel = seleccionarRag(todos, a);
  const base = {
    config: {}, prompt: null, identidadMarca: '', rag: sel.texto ? `=== CONOCIMIENTO DE LA CASA ===\n${sel.texto}` : '',
    ragTitulos: sel.titulos, ragChars: sel.chars, promptOrigen: 'codigo', promptVersion: null,
    marcaOrigen: 'codigo', ragDetalle: sel.detalle, ragDescartados: sel.descartados, ragActivos: todos.length,
  };
  const estado = estadoVacio(); estado.agente_activo = a;
  const bloques = armarSystem(base, a, estado, {});
  const toolsJson = JSON.stringify(Object.values(toolsDe(a)).map((t) => t.def));
  const tEstable = tok(bloques[0].text);
  const tVol = tok(bloques[1].text);
  const tTools = tok(toolsJson);
  const total = tEstable + tVol + tTools;
  filas.push({ a, total, rag: sel.chars, desc: sel.descartados.length, tTools, tEstable, tVol });
  console.log(
    `${a.padEnd(14)} | ${String(sel.chars).padStart(8)} | ${String(tok(sel.texto)).padStart(7)} | ${String(sel.descartados.length).padStart(11)} | ${String(tTools).padStart(8)} | ${String(tEstable).padStart(10)} | ${String(tVol).padStart(10)} | ${String(total).padStart(9)}`,
  );
}

console.log('\n=== descartados por no caber ===');
for (const a of AGENTES) {
  const sel = seleccionarRag(todos, a);
  const fuera = sel.descartados.filter((d) => d.motivo !== 'vacio');
  if (fuera.length) console.log(`${a}: ${fuera.map((f) => `${f.titulo} (${f.chars}ch)`).join(', ')}`);
}

console.log('\n=== simulacion: costo del TURNO segun n de llamadas (agente ventas) ===');
const v = filas.find((f) => f.a === 'ventas');
const hist = 400; // historial tipico
const porLlamada = v.total + hist;
for (const n of [1, 2, 3, 4]) {
  const sinCache = porLlamada * n;
  // con cache: el prefijo estable+tools se cobra 1x completo (escritura) y luego 0.1x
  const prefijo = v.tEstable + v.tTools;
  const resto = v.tVol + hist;
  const conCache = prefijo + resto + (n - 1) * (prefijo * 0.1 + resto);
  console.log(`  ${n} llamada(s): sin cache ${sinCache} tok | con cache efectiva ~${Math.round(conCache)} tok-equivalentes (prefijo ${prefijo})`);
}

console.log('\n=== router haiku: peso del clasificador ===');
const etiquetas = AGENTES.map((x) => x).join('');
console.log(`  system del router: catalogo de ${AGENTES.length} etiquetas + instruccion`);
