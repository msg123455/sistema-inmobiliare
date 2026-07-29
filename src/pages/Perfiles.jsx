import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import MyProfile from '@/components/perfiles/MyProfile';
import TeamList from '@/components/perfiles/TeamList';

export default function Perfiles() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Perfiles</h1>
        <p className="text-sm text-muted-foreground mt-1">Tu perfil e integraciones del equipo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MyProfile user={currentUser} />
        <TeamList users={users} currentUserId={currentUser?.id} />
      </div>
    </div>
  );
}