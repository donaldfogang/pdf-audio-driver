"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchMe } from "./api";
import { supabase } from "./supabase";

type AuthState = { configured: boolean; ready: boolean; user: User | null; isAdmin: boolean; signOut: () => Promise<void> };
const Ctx = createContext<AuthState>({ configured: false, ready: true, user: null, isAdmin: false, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [isAdmin, setIsAdmin] = useState(false);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setUser(data.session?.user ?? null); setReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Le droit d'administration est décidé par le serveur (liste ADMIN_EMAILS), jamais par le navigateur.
  useEffect(() => {
    if (!uid) { setIsAdmin(false); return; }
    let alive = true;
    fetchMe().then((m) => { if (alive) setIsAdmin(!!m.user?.is_admin); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  const value = useMemo<AuthState>(() => ({
    configured: !!supabase, ready, user, isAdmin,
    signOut: async () => { await supabase?.auth.signOut(); },
  }), [ready, user, isAdmin]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
