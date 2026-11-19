import { API, authHeaders, headersNow } from "./http";
import { analyticsOn, sessionId } from "./ids";

type Props = Record<string, string | number | boolean>;
let queue: { type: string; props?: Props }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function send(events: typeof queue, sync: boolean) {
  const auth = sync ? headersNow() : await authHeaders();
  if (!auth.Authorization) return;               // invité : rien n'est jamais envoyé
  const headers = { ...auth, "Content-Type": "application/json" };
  try {
    await fetch(`${API}/api/events`, {
      method: "POST", headers, keepalive: true,
      body: JSON.stringify({ session_id: sessionId(), events }),
    });
  } catch {}
}

function flush(sync = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  while (queue.length) void send(queue.splice(0, 20), sync);
}

/** Action d'usage d'un utilisateur CONNECTÉ (jamais de contenu de document). Les invités ne sont jamais suivis. */
export function track(type: string, props?: Props) {
  if (!analyticsOn()) return;
  queue.push({ type, props });
  if (queue.length >= 10) flush();
  else if (!timer) timer = setTimeout(() => flush(), 4000);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
}
