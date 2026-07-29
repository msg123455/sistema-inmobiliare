import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CALENDAR_CONNECTOR_ID = '6a18839dc1f7c1f1c25e5638';

/**
 * Hook for Google Calendar integration using Base44's native app-user connector.
 * No Google Cloud Client ID or GIS script needed — users just click Connect.
 */
export function useGoogleCalendar() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('checkCalendarConnection', {});
      setIsConnected(res.data?.connected || false);
    } catch {
      setIsConnected(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then(authed => {
      if (authed) checkConnection();
      else setLoading(false);
    });
  }, [checkConnection]);

  const connect = useCallback(async () => {
    const url = await base44.connectors.connectAppUser(CALENDAR_CONNECTOR_ID);
    const popup = window.open(url, '_blank');
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        checkConnection();
      }
    }, 500);
  }, [checkConnection]);

  const disconnect = useCallback(async () => {
    await base44.connectors.disconnectAppUser(CALENDAR_CONNECTOR_ID);
    setIsConnected(false);
  }, []);

  const createEvent = useCallback(async ({ titulo, fecha_limite, hora = '', descripcion = '' }) => {
    try {
      const res = await base44.functions.invoke('createCalendarEvent', {
        titulo, fecha_limite, hora, descripcion,
      });
      return res.data?.success ? res.data : null;
    } catch {
      return null;
    }
  }, []);

  return { isConnected, loading, connect, disconnect, createEvent, checkConnection };
}