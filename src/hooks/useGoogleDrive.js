import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CONECTORES } from '@/lib/conectores';

/**
 * Google Drive por el conector nativo de Base44.
 *
 * Modelado sobre useGoogleCalendar, con dos diferencias que vienen de haber
 * visto fallar el patron:
 *
 *   - Expone `sesion` (null mientras averigua, false, true) aparte de
 *     `conectado`. Sin sesion no hay de quien sacar el token de Drive, y
 *     mezclar los dos casos manda al usuario a un popup de OAuth que tampoco
 *     puede funcionar.
 *   - Distingue el bloqueador de ventanas emergentes. El patron original trata
 *     `!popup` igual que `popup.closed`, asi que cuando el navegador bloquea el
 *     popup reporta "no conectado" sin explicar por que.
 */

/** Traduce el motivo que devuelve la funcion a algo que se pueda leer. */
const MENSAJES = {
  sin_sesion: 'Inicia sesión para subir a tu Drive.',
  no_conectado: 'Tu Google Drive no está conectado.',
  falta_nombre: 'Falta el nombre del archivo.',
  csv_vacio: 'No hay nada que subir.',
  drive: 'Google Drive rechazó la subida.',
  inesperado: 'No se pudo subir.',
};

export function useGoogleDrive() {
  const [sesion, setSesion] = useState(null);
  const [conectado, setConectado] = useState(false);
  const [email, setEmail] = useState(null);
  const [cargando, setCargando] = useState(true);
  const temporizador = useRef(null);

  const revisar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await base44.functions.invoke('checkDriveConnection', {});
      const d = res?.data ?? res;
      setConectado(Boolean(d?.connected));
      setEmail(d?.email || null);
      return Boolean(d?.connected);
    } catch {
      setConectado(false);
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      setSesion(Boolean(authed));
      if (authed) await revisar();
      else setCargando(false);
    }).catch(() => { setSesion(false); setCargando(false); });
  }, [revisar]);

  // El intervalo se limpia al desmontar: si el usuario navega con el popup
  // abierto, el original se quedaba corriendo.
  useEffect(() => () => { if (temporizador.current) clearInterval(temporizador.current); }, []);

  /** Abre el OAuth y resuelve a true/false cuando el popup se cierra. */
  const conectar = useCallback(async () => {
    const url = await base44.connectors.connectAppUser(CONECTORES.drive);
    const popup = window.open(url, '_blank');
    if (!popup) throw new Error('El navegador bloqueó la ventana emergente. Permítelas para este sitio e inténtalo otra vez.');

    return new Promise((resolve) => {
      temporizador.current = setInterval(async () => {
        if (!popup.closed) return;
        clearInterval(temporizador.current);
        temporizador.current = null;
        resolve(await revisar());
      }, 500);
    });
  }, [revisar]);

  const desconectar = useCallback(async () => {
    await base44.connectors.disconnectAppUser(CONECTORES.drive);
    setConectado(false);
    setEmail(null);
  }, []);

  /**
   * Sube el CSV y devuelve { ok, url, creado } o { ok:false, mensaje }.
   *
   * Nunca lanza por un desenlace esperado: la funcion responde 200 con
   * `motivo`, y aqui se traduce. Si el token se revoco por fuera, ademas se
   * baja `conectado` para que el boton vuelva solo a "Conectar y subir".
   */
  const subirCsvComoHoja = useCallback(async ({ csv, nombre }) => {
    try {
      const res = await base44.functions.invoke('subirCsvComoHoja', { csv, nombre });
      const d = res?.data ?? res;
      if (d?.ok) return d;

      if (d?.motivo === 'no_conectado') setConectado(false);
      if (d?.motivo === 'sin_sesion') setSesion(false);
      return {
        ok: false,
        motivo: d?.motivo,
        mensaje: MENSAJES[d?.motivo] || 'No se pudo subir.',
        detalle: d?.detalle,
      };
    } catch (e) {
      // Aqui solo caen los fallos de red o un 500: el cuerpo util del SDK vive
      // en e.response.data porque el cliente de funciones no intercepta.
      const d = e?.response?.data;
      return {
        ok: false,
        motivo: d?.motivo || 'inesperado',
        mensaje: MENSAJES[d?.motivo] || 'No se pudo subir.',
        detalle: d?.detalle || e?.message,
      };
    }
  }, []);

  return { sesion, conectado, email, cargando, conectar, desconectar, subirCsvComoHoja, revisar };
}
