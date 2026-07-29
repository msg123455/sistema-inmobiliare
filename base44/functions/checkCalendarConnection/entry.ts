import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONNECTOR_ID = '6a18839dc1f7c1f1c25e5638'; // Massis Calendar

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);

    // Quick check: list 1 event to verify the token works
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      return Response.json({ connected: false });
    }

    return Response.json({ connected: true });
  } catch (error) {
    return Response.json({ connected: false });
  }
});