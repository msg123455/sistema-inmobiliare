// Sonda del conector de Google Drive.
//
// Contrato, y es el que importa: SIEMPRE responde 200 con { connected }, nunca
// lanza. La UI de Integraciones envuelve la llamada en un catch que pone
// "no conectado", asi que una excepcion aqui y una cuenta sin conectar se ven
// exactamente igual desde la pantalla. Devolver siempre 200 es lo que permite
// distinguirlas.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONNECTOR_ID = 'aca57577c3854ffcb9171e42abaa0e16'; // Google Drive

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    // auth.me() puede lanzar, no solo devolver null: el cliente del navegador se
    // crea con requiresAuth:false. Se separa del catch general para poder decir
    // "sin sesion" en vez de "sin conectar", que llevaria al usuario a un popup
    // de OAuth que tampoco puede funcionar.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ connected: false, motivo: 'sin_sesion' });

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);

    // about.get funciona con el scope drive.file y devuelve el correo, para que
    // la tarjeta pueda decir con que cuenta esta conectado.
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return Response.json({ connected: false, motivo: 'token_rechazado' });

    const about = await res.json();
    return Response.json({ connected: true, email: about?.user?.emailAddress || null });
  } catch {
    return Response.json({ connected: false, motivo: 'no_conectado' });
  }
});
