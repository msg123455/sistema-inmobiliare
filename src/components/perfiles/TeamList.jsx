import React from 'react';
import { User } from 'lucide-react';

export default function TeamList({ users, currentUserId }) {
  return (
    <div className="bg-card rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Equipo ({users.length})</h2>
      <div className="divide-y divide-border/40">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {u.full_name || 'Sin nombre'}
                {u.id === currentUserId && <span className="text-xs text-muted-foreground ml-1">(tú)</span>}
              </p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {u.role || 'user'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}