// Declaracion minima de los globals de Deno.
//
// Las funciones corren en Deno (Base44), no en Node, asi que `tsc` no conoce
// `Deno.env` ni `Deno.serve`. Sin esto el chequeo de tipos escupe 50 errores
// falsos y se vuelve inutil, que es como el backend acabo sin verificacion
// alguna: `npm run build` solo compilaba el frontend.
//
// No pretende ser completa: solo lo que estas funciones usan.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
  };

  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  function serve(
    options: { port?: number; hostname?: string },
    handler: (req: Request) => Response | Promise<Response>,
  ): unknown;
}
