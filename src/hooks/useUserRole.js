import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Escape hatch de arranque: emails que son Admin aunque no tengan PerfilUsuario.
 * Sirve para no quedar bloqueado en una instalacion nueva, antes de que exista
 * la primera fila de PerfilUsuario. Vacio por defecto.
 *
 * Antes aqui habia un email hardcodeado del proyecto anterior (ms@grouptso.com).
 */
const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Resuelve el rol de aplicacion del usuario actual.
 *
 * Hay dos sistemas de rol conviviendo y se consultan en este orden:
 *   1. user.role de Base44 ('admin' | 'user') — rol de plataforma, respaldado
 *      por RLS en el backend. Es la fuente confiable.
 *   2. PerfilUsuario.rol ('Admin' | 'Comercial') — rol de negocio, editable
 *      desde la app.
 * Un admin de plataforma siempre es Admin aqui, aunque su PerfilUsuario diga otra cosa:
 * si puede editar usuarios via RLS, negarselo en la UI seria teatro.
 */
export function useUserRole() {
  const { user } = useAuth();
  const email = user?.email;

  const { data: perfiles = [], isLoading } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
    enabled: !!email,
    staleTime: 60_000,
  });

  const perfil = perfiles.find((p) => p.email === email);

  const esAdminPlataforma = user?.role === 'admin';
  const esAdminBootstrap = !!email && ADMIN_EMAILS.includes(email.toLowerCase());
  const rol = esAdminPlataforma || esAdminBootstrap ? 'Admin' : (perfil?.rol ?? 'Comercial');

  return {
    rol,
    email,
    isAdmin: rol === 'Admin',
    isComercial: rol === 'Comercial',
    isLoading,
    perfiles,
  };
}
