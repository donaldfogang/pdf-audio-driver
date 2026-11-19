const rand = () => {
  const c = globalThis.crypto;
  const v = c?.randomUUID ? c.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return v.replace(/[^A-Za-z0-9_-]/g, "");
};

function stored(area: "localStorage" | "sessionStorage", key: string): string {
  try {
    const s = window[area];
    let v = s.getItem(key);
    if (!v) { v = rand(); s.setItem(key, v); }
    return v;
  } catch { return ""; }
}

/** Identifiant de session (par onglet), utilisé seulement pour les utilisateurs connectés. */
export const sessionId = () => (typeof window === "undefined" ? "" : stored("sessionStorage", "pdf-audio:session"));

/** Les comptes connectés peuvent refuser l'enregistrement de leur activité (page Confidentialité). */
export function analyticsOn(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem("pdf-audio:analytics") !== "off" && navigator.doNotTrack !== "1"; } catch { return true; }
}
export function setAnalytics(on: boolean) {
  try { localStorage.setItem("pdf-audio:analytics", on ? "on" : "off"); } catch {}
}
