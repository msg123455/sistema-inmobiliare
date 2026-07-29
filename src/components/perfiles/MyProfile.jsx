import React from 'react';
import { User, Calendar, Link, Unlink, Loader2 } from 'lucide-react';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';

export default function MyProfile({ user }) {
  const { isConnected, loading, connect, disconnect } = useGoogleCalendar();

  if (!user) return null;

  return (
    <div className="bg-card rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Mi Perfil</h2>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">{user.full_name || 'Sin nombre'}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}>
            {user.role || 'user'}
          </span>
        </div>
      </div>

      <div className="border-t border-border/40 pt-4">
        <h3 className="text-xs font-medium text-muted-foreground mb-3">Integraciones</h3>
        <div className="space-y-2">
          {/* Google Calendar */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${isConnected ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/40'}`}>
            <Calendar className={`w-4 h-4 flex-shrink-0 ${isConnected ? 'text-green-600' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Google Calendar</p>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Verificando…' : isConnected ? 'Conectado — eventos se crean automáticamente' : 'No conectado'}
              </p>
            </div>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : isConnected ? (
              <Button onClick={disconnect} variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1">
                <Unlink className="w-3 h-3" /> Desconectar
              </Button>
            ) : (
              <Button onClick={connect} variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50">
                <Link className="w-3 h-3" /> Conectar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}