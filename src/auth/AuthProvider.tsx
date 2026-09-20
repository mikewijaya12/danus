import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PermissionKey, Module, Action } from '@/lib/permissions';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role_id: string | null;
  role_name: string | null;
  is_active: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Set<PermissionKey>;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (module: Module, action: Action) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadProfileAndPerms(userId: string) {
    // Profile + role name
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, email, role_id, is_active, roles(name)')
      .eq('id', userId)
      .maybeSingle();

    if (prof) {
      const roleName = (prof as { roles?: { name?: string } | null }).roles?.name ?? null;
      setProfile({
        id: prof.id,
        full_name: prof.full_name,
        email: prof.email,
        role_id: prof.role_id,
        role_name: roleName,
        is_active: prof.is_active,
      });
      setIsAdmin(roleName === 'admin');
    }

    // Effective permissions via RPC (admin => all)
    const { data: perms } = await supabase.rpc('my_permissions');
    const set = new Set<PermissionKey>();
    (perms ?? []).forEach((p: { module: string; action: string }) => set.add(`${p.module}.${p.action}` as PermissionKey));
    setPermissions(set);
  }

  async function bootstrap(nextSession: Session | null) {
    setSession(nextSession);
    if (nextSession?.user) {
      await loadProfileAndPerms(nextSession.user.id);
    } else {
      setProfile(null);
      setPermissions(new Set());
      setIsAdmin(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => bootstrap(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      bootstrap(s);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    permissions,
    isAdmin,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password, fullName) => {
      const { error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName } },
      });
      if (error) throw error;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refresh: async () => { if (session?.user) await loadProfileAndPerms(session.user.id); },
    can: (module, action) => isAdmin || permissions.has(`${module}.${action}` as PermissionKey),
  }), [session, profile, permissions, isAdmin, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
