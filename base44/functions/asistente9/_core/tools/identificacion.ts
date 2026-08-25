import { definirTool, str, type Tool, type CtxTool } from '../protocol.ts';
import { auditar, buscarTitularPorDocumento } from '../identidad.ts';

/**
 * Identifica al titular por su NIT o cedula.
 *
 * Es la herramienta que le faltaba al sistema. Hasta ahora la unica llave era el
 * telefono, asi que un titular escribiendo desde otro numero no existia y el
 * asistente terminaba pidiendole nombre y direccion, que es exactamente la queja
 * que la operacion tenia del bot anterior.
 *
 * No la reciben todos los agentes. Cartera queda fuera a proposito: ahi se
 * divulgan cifras, y para eso el camino sigue siendo verificar_identidad, que
 * exige el segundo factor. Esta sirve para ENCONTRAR a alguien y confirmar de
 * que inmueble habla, no para abrirle la cuenta.
 */
export const identificarTitular: Tool = {
  ...definirTool(
    'identificar_titular',
    'Busca al titular por su NIT o cedula para saber que inmuebles tiene con nosotros. Usala apenas te de el numero, antes de pedirle nombre o direccion: si esta registrado, esos datos ya los tenemos.',
    { documento: str('NIT o cedula tal como lo dijo el cliente, solo los digitos') },
    { retorna: true },
  ),
  ejecutar: async (input, c: CtxTool) => {
    const r = await buscarTitularPorDocumento(c.db, String(input.documento), c.entrada.tel);

    await auditar(c.db, {
      tipo: 'identificacion_documento',
      telefono: c.entrada.tel,
      exito: r.existe,
      detalle: r.existe
        ? `${r.total} inmueble(s), telefono ${r.coincide_telefono ? 'coincide' : 'no coincide'}`
        : 'documento sin coincidencias',
    });

    if (!r.existe) {
      // Se le dice claro que no aparecio, por decision de la operacion. Antes se
      // daba un rodeo ("puede que este a nombre de otra persona") para no
      // confirmar quien esta o no en la base; el rodeo dejaba al cliente sin
      // entender que tenia que hacer.
      //
      // El intercambio es aceptable porque solo revela lo NEGATIVO: que un
      // documento no es cliente. Nunca al reves, y de ahi no sale ningun dato
      // de nadie.
      //
      // Lo que no cambia: no se le bloquea. Un dato que no cuadra en el sistema
      // no puede dejar a alguien sin poder reportar que se le inundo la cocina.
      return {
        encontrado: false,
        instruccion: 'No encontraste ese documento en la base. Dilo claro y pidele que lo confirme: '
          + '"No encontre ese numero en el sistema, me confirmas el documento del titular?". '
          + 'Si te lo repite y sigue sin aparecer, NO insistas una tercera vez ni lo trates como culpa suya: '
          + 'sigue con el tramite pidiendole los datos a mano y deja constancia de que no se pudo identificar.',
      };
    }

    // El detalle solo sale con dos factores. Sin eso, el cliente dice la
    // direccion y el asistente contrasta: confirmar no filtra, leer si.
    if (!r.coincide_telefono) {
      c.ctxAgente.titular_documento = String(input.documento).replace(/\D/g, '');
      return {
        encontrado: true,
        total_inmuebles: r.total,
        instruccion: `Ese documento si figura, con ${r.total} inmueble(s), pero estas escribiendo desde un `
          + 'numero que no es el registrado. NO leas direcciones ni nombres. Pidele que te diga la direccion '
          + 'del inmueble del que habla y sigue con eso.',
      };
    }

    c.ctxAgente.titular_documento = String(input.documento).replace(/\D/g, '');
    c.ctxAgente.titular_nombre = r.nombre;
    c.ctxAgente.titular_inmuebles = r.inmuebles;

    return {
      encontrado: true,
      nombre: r.nombre,
      total_inmuebles: r.total,
      inmuebles: r.inmuebles.map((i) => ({ direccion: i.direccion, ciudad: i.ciudad, rol: i.rol })),
      // El sentido entero del proyecto esta en estas dos instrucciones: que con
      // SOLO el documento el cliente vea que la casa ya lo tiene, y que lo unico
      // que le quede por contar sea el problema. Por eso se le dice de entrada
      // que aparecio y se le nombran sus inmuebles, en vez de seguir preguntando
      // como si no lo conocieramos.
      instruccion: r.total === 1
        ? `DILO DE ENTRADA: ya lo encontraste. Saludalo por su nombre (${r.nombre}), dile que su `
          + `inmueble registrado es ${r.inmuebles[0].direccion}, y preguntale directamente que necesita. `
          + 'Todo en un solo mensaje corto. NO le pidas el nombre, ni la direccion, ni el telefono: '
          + 'ya los tienes, y volver a pedirlos es exactamente lo que veniamos a quitar.'
        : `DILO DE ENTRADA: ya lo encontraste. Saludalo por su nombre (${r.nombre}) y dile que tiene `
          + `${r.total} inmuebles con nosotros, nombrando las direcciones para que elija de cual se `
          + 'trata. NO le pidas el nombre ni el telefono: ya los tienes.',
    };
  },
};
