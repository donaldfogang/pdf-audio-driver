import { analyticsOn, sessionId } from "./ids";
import { supabase } from "./supabase";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

let token: string | null = null;
if (supabase && typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => { token = session?.access_token ?? null; });
}

/** En-têtes sans attente (utilisé quand la page se ferme). */
export function headersNow(): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  // Invité (pas de jeton) ou suivi refusé : le serveur n'enregistre rien.
  if (token && analyticsOn()) h["X-Session-Id"] = sessionId();
  else h["X-Analytics"] = "off";
  return h;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!token && supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }
  return headersNow();
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(await authHeaders()), ...(init.headers as Record<string, string> | undefined) };
  return fetch(`${API}${path}`, { ...init, headers });
}
