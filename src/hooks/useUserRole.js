import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const ADMIN_EMAIL = 'ms@grouptso.com';

export function useUserRole() {
  const { user } = useAuth();
  const email = user?.email;

  const { data: perfiles = [], isLoading } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
    enabled: !!email,
    staleTime: 60_000,
  });

  const perfil = perfiles.find(p => p.email === email);
  const rol = email === ADMIN_EMAIL ? 'Admin' : (perfil?.rol ?? 'Comercial');

  return {
    rol,
    email,
    isAdmin: rol === 'Admin',
    isComercial: rol === 'Comercial',
    isLoading,
    perfiles,
  };
}
