// SONDA DESECHABLE — decide si el problema de agenteInbound es el tamano del
// bundle o el registro de la funcion.
//
// Importa el MISMO grafo pesado que agenteInbound (~137 KB) pero no hace nada.
// Si esta aparece en el panel y responde, el tamano no es el problema y hay que
// mirar por que Base44 no registra agenteInbound. Si tampoco aparece, queda
// confirmado que el limite es el peso.
//
// Borrar en cuanto responda la pregunta.
import { AGENTES } from './_core/protocol.ts';
import { toolsDe } from './_core/tools/index.ts';
import { decidirAgente } from './_core/router.ts';
import { cargarContexto } from './_core/contexto.ts';
import { correrAgente } from './_core/llm.ts';
import { cargarEstado } from './_core/state.ts';
import { encolar } from './_core/cola.ts';

Deno.serve(() => {
  // Referencias reales para que nada se elimine por tree-shaking.
  const vivos = [toolsDe, decidirAgente, cargarContexto, correrAgente, cargarEstado, encolar]
    .filter((f) => typeof f === 'function').length;
  return new Response(
    JSON.stringify({ ok: true, agentes: AGENTES.length, simbolos_vivos: vivos }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
