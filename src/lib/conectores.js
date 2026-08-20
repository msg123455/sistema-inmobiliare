/**
 * IDs de los conectores OAuth de Base44.
 *
 * Viven aquí porque estaban repetidos a mano en cada pantalla y en cada
 * función, y un id copiado mal no da un error: da un «no conectado» que parece
 * que el usuario no autorizó.
 *
 * OJO: las funciones backend NO pueden importar de aquí —son archivos Deno
 * autocontenidos, sin acceso a `src/`—, así que allí el id sigue escrito a
 * mano. Al cambiar uno hay que tocar los dos lados:
 *
 *   drive     src/lib/conectores.js  +  base44/functions/checkDriveConnection/entry.ts
 *                                    +  base44/functions/subirCsvComoHoja/entry.ts
 *   calendar  src/lib/conectores.js  +  base44/functions/checkCalendarConnection/entry.ts
 *                                    +  base44/functions/createCalendarEvent/entry.ts
 *   gmail     src/lib/conectores.js  +  base44/functions/checkGmailConnection/entry.ts
 */
export const CONECTORES = {
  calendar: '6a18839dc1f7c1f1c25e5638',
  gmail: '6a188355eedd5e30c544330b',
  drive: 'aca57577c3854ffcb9171e42abaa0e16',
};
