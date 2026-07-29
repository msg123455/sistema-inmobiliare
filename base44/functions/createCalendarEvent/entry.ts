import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONNECTOR_ID = '6a18839dc1f7c1f1c25e5638'; // Massis Calendar

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { titulo, fecha_limite, hora, descripcion } = await req.json();
    if (!titulo || !fecha_limite) {
      return Response.json({ error: 'titulo and fecha_limite are required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);

    // Build start/end objects
    let startObj, endObj;
    if (hora) {
      const [h, min] = hora.split(':').map(n => parseInt(n, 10));
      const totalEnd = h * 60 + (min || 0) + 30;
      const eH = String(Math.floor(totalEnd / 60) % 24).padStart(2, '0');
      const eM = String(totalEnd % 60).padStart(2, '0');
      const endDate = totalEnd >= 1440
        ? new Date(new Date(fecha_limite).getTime() + 86400000).toISOString().slice(0, 10)
        : fecha_limite;
      startObj = { dateTime: `${fecha_limite}T${hora}:00`, timeZone: 'America/Bogota' };
      endObj = { dateTime: `${endDate}T${eH}:${eM}:00`, timeZone: 'America/Bogota' };
    } else {
      startObj = { date: fecha_limite };
      endObj = { date: fecha_limite };
    }

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: titulo,
        colorId: '5',
        start: startObj,
        end: endObj,
        ...(descripcion && { description: descripcion }),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Calendar API error: ${res.status}`, details: err }, { status: res.status });
    }

    const event = await res.json();
    return Response.json({ success: true, eventId: event.id, htmlLink: event.htmlLink });
  } catch (error) {
    // If connector is not connected, return a clear message
    return Response.json({ error: error.message, connected: false }, { status: 500 });
  }
});