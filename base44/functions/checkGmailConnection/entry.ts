import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONNECTOR_ID = '6a188355eedd5e30c544330b'; // Massis Gmail

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);

    // Quick check: get user profile to verify the token works
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      return Response.json({ connected: false });
    }

    const profile = await res.json();
    return Response.json({ connected: true, email: profile.emailAddress });
  } catch (error) {
    return Response.json({ connected: false });
  }
});