import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Obtener el estado del webhook
    const state = body.data?._provider_meta?.['x-goog-resource-state'];
    
    // Si es un sync inicial, solo reconocer
    if (state === 'sync') {
      return Response.json({ status: 'sync_ack' });
    }

    // Obtener token de acceso a Google Calendar
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Obtener o crear SyncState
    const syncStateList = await base44.asServiceRole.entities.SyncState.list();
    const syncRecord = syncStateList.length > 0 ? syncStateList[0] : null;

    // Construir URL para obtener eventos
    let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100';
    if (syncRecord?.sync_token) {
      url += `&syncToken=${syncRecord.sync_token}`;
    } else {
      // Si no hay token, obtener eventos de los últimos 7 días
      url += '&timeMin=' + new Date(Date.now() - 7*24*60*60*1000).toISOString();
    }

    let res = await fetch(url, { headers: authHeader });
    
    // Si el token expiró, hacer una sincronización fresca
    if (res.status === 410) {
      url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100'
        + '&timeMin=' + new Date(Date.now() - 7*24*60*60*1000).toISOString();
      res = await fetch(url, { headers: authHeader });
    }

    if (!res.ok) {
      return Response.json({ status: 'api_error', error: `Calendar API error: ${res.status}` }, { status: 500 });
    }

    // Obtener todos los eventos (paginar si es necesario)
    const allItems = [];
    let pageData = await res.json();
    let newSyncToken = null;

    while (true) {
      allItems.push(...(pageData.items || []));
      if (pageData.nextSyncToken) newSyncToken = pageData.nextSyncToken;
      if (!pageData.nextPageToken) break;

      const nextRes = await fetch(
        url + `&pageToken=${pageData.nextPageToken}`,
        { headers: authHeader }
      );
      if (!nextRes.ok) break;
      pageData = await nextRes.json();
    }

    // Procesar eventos nuevos/modificados
    for (const event of allItems) {
      // Filtrar solo eventos de servicio (contienen "servicio" o "service" en el nombre)
      const eventName = event.summary || '';
      const isServiceEvent = eventName.toLowerCase().includes('servicio') || 
                             eventName.toLowerCase().includes('service') ||
                             eventName.toLowerCase().includes('instalación') ||
                             eventName.toLowerCase().includes('installation');

      if (isServiceEvent && event.status === 'confirmed') {
        // Crear una alerta/notificación en la base de datos
        const existingAlerts = await base44.asServiceRole.entities.AlertaCalendario.list();
        const alertExists = existingAlerts.some(a => a.event_id === event.id);

        if (!alertExists) {
          await base44.asServiceRole.entities.AlertaCalendario.create({
            event_id: event.id,
            titulo: eventName,
            descripcion: event.description || '',
            fecha_inicio: event.start?.dateTime || event.start?.date,
            fecha_fin: event.end?.dateTime || event.end?.date,
            ubicacion: event.location || '',
            enlace_meet: event.conferenceData?.entryPoints?.[0]?.uri || '',
            leido: false,
          });
        }
      }
    }

    // Guardar nuevo sync token
    if (newSyncToken) {
      if (syncRecord) {
        await base44.asServiceRole.entities.SyncState.update(syncRecord.id, {
          sync_token: newSyncToken,
          ultima_sincronizacion: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.SyncState.create({
          sync_token: newSyncToken,
          ultima_sincronizacion: new Date().toISOString(),
        });
      }
    }

    return Response.json({ status: 'ok', eventos_procesados: allItems.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});