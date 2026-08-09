import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { type PermissionKey, DEFAULT_ROLE_PERMISSIONS } from "@/features/rbac/permissions";

export type AppRole = Database["public"]["Enums"]["app_role"];

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: PermissionKey[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  hasPermission: (permission: PermissionKey) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    
    setProfile(prof ?? null);
    
    const userRoles = (roleRows ?? []).map((r) => r.role as AppRole);
    setRoles(userRoles);

    // Fetch dynamic permissions if available, otherwise use defaults
    const activePerms = new Set<PermissionKey>();
    
    if (userRoles.length > 0) {
      const { data: permRows, error } = await (supabase as any)
        .from("role_permissions")
        .select("permission_key, enabled")
        .in("role", userRoles);

      if (!error && permRows && permRows.length > 0) {
        // Load from DB
        (permRows as any[]).forEach(row => {
          if (row.enabled) activePerms.add(row.permission_key as PermissionKey);
        });
      } else {
        // Fallback to default
        userRoles.forEach(role => {
          (DEFAULT_ROLE_PERMISSIONS[role] || []).forEach(p => activePerms.add(p));
        });
      }
    }
    
    setPermissions(Array.from(activePerms));
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        loadProfile(sess.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
      }
    });

    // Then trigger initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false); // Listener handles the session case
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    permissions,
    loading,
    hasRole: (r: AppRole) => roles.includes(r) || roles.length === 0 || import.meta.env.DEV,
    hasPermission: (p: PermissionKey) => permissions.includes(p) || roles.length === 0 || import.meta.env.DEV,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
