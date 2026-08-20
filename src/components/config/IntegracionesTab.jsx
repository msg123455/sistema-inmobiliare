import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Mail, HardDrive, Link, Unlink, CheckCircle2, Loader2 } from 'lucide-react';
import { CONECTORES } from '@/lib/conectores';

// Los ids viven en src/lib/conectores.js: estaban repetidos a mano en cada
// pantalla, y uno copiado mal no da error, da un "no conectado" que parece que
// el usuario no autorizo.
const CALENDAR_CONNECTOR_ID = CONECTORES.calendar;
const GMAIL_CONNECTOR_ID = CONECTORES.gmail;
const DRIVE_CONNECTOR_ID = CONECTORES.drive;

export default function IntegracionesTab() {
  // Los intervalos del sondeo del popup se guardan para limpiarlos al
  // desmontar: si el usuario navega con el popup abierto, quedaban corriendo.
  const temporizadores = useRef([]);
  useEffect(() => () => { temporizadores.current.forEach(clearInterval); }, []);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [calConnected, setCalConnected] = useState(false);
  const [calLoading, setCalLoading] = useState(true);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailLoading, setGmailLoading] = useState(true);

  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState('');
  const [driveLoading, setDriveLoading] = useState(true);
  const [avisoPopup, setAvisoPopup] = useState('');

  // Rule 2: reusable fetch — doubles as connection check AND data loader
  const checkCalendar = async () => {
    setCalLoading(true);
    try {
      const res = await base44.functions.invoke('checkCalendarConnection', {});
      setCalConnected(res.data?.connected || false);
    } catch {
      setCalConnected(false);
    }
    setCalLoading(false);
  };

  const checkGmail = async () => {
    setGmailLoading(true);
    try {
      const res = await base44.functions.invoke('checkGmailConnection', {});
      setGmailConnected(res.data?.connected || false);
      setGmailEmail(res.data?.email || '');
    } catch {
      setGmailConnected(false);
    }
    setGmailLoading(false);
  };

  const checkDrive = async () => {
    setDriveLoading(true);
    try {
      const res = await base44.functions.invoke('checkDriveConnection', {});
      setDriveConnected(res.data?.connected || false);
      setDriveEmail(res.data?.email || '');
    } catch {
      setDriveConnected(false);
    }
    setDriveLoading(false);
  };

  // Rule 1+2: check auth first, then fetch to detect connection status
  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        checkCalendar();
        checkGmail();
        checkDrive();
      }
      setLoading(false);
    });
  }, []);

  // Rule 3: open OAuth popup, poll for close, then re-fetch
  //
  // Se distingue el popup BLOQUEADO de el popup CERRADO. Antes los dos caian en
  // la misma rama, asi que con el bloqueador activo la pantalla decia
  // "no conectado" sin explicar por que y el usuario no tenia como saberlo.
  const handleConnect = async (connectorId, recheckFn) => {
    setAvisoPopup('');
    const url = await base44.connectors.connectAppUser(connectorId);
    const popup = window.open(url, '_blank');
    if (!popup) {
      setAvisoPopup('El navegador bloqueó la ventana emergente. Permítelas para este sitio e inténtalo otra vez.');
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        temporizadores.current = temporizadores.current.filter((t) => t !== timer);
        recheckFn();
      }
    }, 500);
    temporizadores.current.push(timer);
  };

  const handleDisconnect = async (connectorId, resetFn) => {
    await base44.connectors.disconnectAppUser(connectorId);
    resetFn();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-card rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Inicia sesión para conectar tus integraciones</p>
        <Button onClick={() => base44.auth.redirectToLogin()} size="sm" className="rounded-lg">
          Iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Google Calendar */}
      <ConnectorCard
        icon={CalendarPlus}
        iconBg="bg-green-50 dark:bg-green-950/30"
        iconColor="text-green-600"
        title="Google Calendar"
        description="Cuando conectas tu cuenta, cada tarea que crees se agrega automáticamente a tu Google Calendar como evento de 30 minutos."
        connected={calConnected}
        loading={calLoading}
        onConnect={() => handleConnect(CALENDAR_CONNECTOR_ID, checkCalendar)}
        onDisconnect={() => handleDisconnect(CALENDAR_CONNECTOR_ID, () => setCalConnected(false))}
        connectLabel="Conectar Google Calendar"
        disconnectLabel="Desconectar Calendar"
      />

      {/* Gmail */}
      <ConnectorCard
        icon={Mail}
        iconBg="bg-blue-50 dark:bg-blue-950/30"
        iconColor="text-blue-600"
        title="Gmail"
        description="Conecta tu cuenta de Gmail para enviar notificaciones y correos directamente desde la plataforma."
        connected={gmailConnected}
        loading={gmailLoading}
        statusExtra={gmailEmail ? `(${gmailEmail})` : ''}
        onConnect={() => handleConnect(GMAIL_CONNECTOR_ID, checkGmail)}
        onDisconnect={() => handleDisconnect(GMAIL_CONNECTOR_ID, () => { setGmailConnected(false); setGmailEmail(''); })}
        connectLabel="Conectar Gmail"
        disconnectLabel="Desconectar Gmail"
      />

      {/* Google Drive */}
      <ConnectorCard
        icon={HardDrive}
        iconBg="bg-amber-50 dark:bg-amber-950/30"
        iconColor="text-amber-600"
        title="Google Drive"
        description="Conecta tu cuenta para que los listados de códigos de barras se suban a tu Drive como hoja de cálculo, listos para abrir en Sheets."
        connected={driveConnected}
        loading={driveLoading}
        statusExtra={driveEmail ? `(${driveEmail})` : ''}
        onConnect={() => handleConnect(DRIVE_CONNECTOR_ID, checkDrive)}
        onDisconnect={() => handleDisconnect(DRIVE_CONNECTOR_ID, () => { setDriveConnected(false); setDriveEmail(''); })}
        connectLabel="Conectar Google Drive"
        disconnectLabel="Desconectar Drive"
      />

      {avisoPopup && (
        <p className="text-xs text-amber-700 dark:text-amber-400 px-1">{avisoPopup}</p>
      )}
    </div>
  );
}

function ConnectorCard({ icon: Icon, iconBg, iconColor, title, description, connected, loading, statusExtra, onConnect, onDisconnect, connectLabel, disconnectLabel }) {
  return (
    <div className="bg-card rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : connected ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 dark:bg-green-950/40 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Conectado {statusExtra}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>

      {!loading && (
        <div className="flex items-center gap-3 pt-1">
          {connected ? (
            <Button onClick={onDisconnect} variant="outline" size="sm" className="gap-2 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/5">
              <Unlink className="w-3.5 h-3.5" /> {disconnectLabel}
            </Button>
          ) : (
            <Button onClick={onConnect} size="sm" className="gap-2 rounded-lg">
              <Link className="w-3.5 h-3.5" /> {connectLabel}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Solo afecta tu cuenta — cada usuario conecta la suya.</p>
        </div>
      )}
    </div>
  );
}