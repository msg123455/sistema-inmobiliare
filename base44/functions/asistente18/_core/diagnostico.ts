// El informe de /chunks: que uso el agente para contestar el ultimo turno.
//
// POR QUE EXISTE. Desde fuera un agente es una caja negra. Contesta raro y no
// hay forma de saber si le falto conocimiento, si el prompt que uso no era el
// que creias, o si el ruteo lo mando a otra especialidad. Se diagnostica por
// eliminacion, probando de a una cosa, y eso cuesta dias.
//
// Las dos lineas que mas rapido cierran el diagnostico:
//
//   PROMPT  codigo (NO hay fila en AgentePrompt)
//   SABER   0 chunks · 0 de 18.000 chars
//
// La primera dice que el agente esta usando el prompt del binario desplegado y
// no el que tu editaste en la base. La segunda, que no tiene conocimiento
// ninguno. Las dos pasaron en este proyecto y ninguna era visible.

import type { DiagTurno } from './protocol.ts';

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function informeChunks(d: DiagTurno | null | undefined): string {
  if (!d) {
    return 'Todavia no hay ningun turno registrado en esta conversacion.\n\n'
      + 'Escribe algo primero y despues /chunks: el informe es del ULTIMO turno, '
      + 'no del comando.';
  }

  const l: string[] = [];
  l.push('/chunks — ultimo turno');
  l.push('');
  l.push(`AGENTE  ${d.agente}`);
  l.push(`RUTEO   ${d.ruteo}`);

  // Sin fila en AgentePrompt el agente usa el prompt del binario desplegado, que
  // puede tener meses. Es la confusion mas cara del proyecto, asi que se marca.
  const marcaPrompt = d.prompt_origen === 'codigo' ? '  <-- NO hay fila en AgentePrompt' : '';
  const ver = d.prompt_version ? ` v${d.prompt_version}` : '';
  l.push(`PROMPT  ${d.prompt_origen}${ver}${marcaPrompt}`);
  l.push(`MARCA   ${d.marca_origen}`);
  l.push('');

  if (!d.rag.length) {
    l.push(`SABER   NADA. 0 de ${miles(d.rag_activos)} chunks activos le tocaron a ${d.agente}.`);
    l.push('        Esta contestando solo con el prompt.');
  } else {
    l.push(`SABER   ${d.rag.length} chunks · ${miles(d.rag_chars)} de ${miles(d.rag_max)} chars`);
    l.push(`        (${miles(d.rag_activos)} activos en total)`);
    for (const c of d.rag) {
      // El asterisco marca lo que es de ESTE agente, frente a lo que reciben todos.
      l.push(`  ${c.esp ? '*' : ' '} ${c.t} (${miles(c.c)})`);
    }
  }

  if (d.fuera.length) {
    l.push('');
    l.push(`FUERA   ${d.fuera.length} chunk(s) que no entraron:`);
    for (const c of d.fuera) l.push(`    ${c.t} (${miles(c.c)}) ${c.m}`);
  }

  l.push('');
  l.push(`TOOLS   ${d.tools.length}: ${d.tools.join(', ')}`);
  // Es el tamano de lo que se iba a guardar, medido ANTES de escribir: el
  // informe se arma antes que la escritura y no puede saber como salio. Si esa
  // escritura hubiera fallado, este informe tampoco existiria y /chunks estaria
  // mostrando el turno anterior — y esa discrepancia ES la senal.
  l.push(`ESTADO  ${miles(d.guardado_chars)} chars`);

  // EL GASTO DEL TURNO. Va en el informe y no solo en el log porque el fallo de
  // cacheo no da error: si el prefijo se invalida, todo se cobra entero y lo
  // unico que cambia es la factura a fin de mes.
  //
  // Que mirar: `leidos` en cero durante varios turnos seguidos, con `escritos`
  // alto, significa que el cache se escribe y nunca se aprovecha. Casi siempre
  // es que alguien metio un dato variable por encima de la marca en armarSystem.
  if (d.gasto) {
    const g = d.gasto;
    const cobrado = g.entrada + g.cache_escritos;
    l.push('');
    l.push(`GASTO   ${g.llamadas} llamada(s) al modelo`);
    l.push(`        entrada ${miles(g.entrada)} · cache leidos ${miles(g.cache_leidos)} `
      + `· escritos ${miles(g.cache_escritos)} · salida ${miles(g.salida)}`);
    l.push(g.cache_leidos
      ? `        el cache ahorro ${miles(g.cache_leidos)} tokens a precio completo`
      : '        SIN LECTURA DE CACHE: se esta pagando todo entero');
    l.push(`        entrada a precio completo: ${miles(cobrado)}`);
  }

  return l.join('\n');
}
