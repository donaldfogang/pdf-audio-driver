import { API, apiFetch } from "./http";

export type OutlineItem = { title: string; page: number; level: number };
export type DocInfo = { id: string; filename: string; page_count: number; lang: string; outline?: OutlineItem[] };
export type SearchHit = { page: number; snippet: string; count: number };

export const LANG_NAMES: Record<string, string> = {
  fr: "Français", en: "Anglais", es: "Espagnol", de: "Allemand",
  it: "Italien", pt: "Portugais", nl: "Néerlandais", ar: "Arabe",
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function detail(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

export async function uploadPdf(file: File): Promise<DocInfo> {
  const body = new FormData();
  body.append("file", file);
  let res: Response;
  try { res = await apiFetch("/api/documents", { method: "POST", body }); }
  catch { throw new Error("Le serveur est injoignable. Il se réveille peut-être : réessayez dans une minute."); }
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Échec de l'envoi du fichier."));
  return res.json();
}

export async function getPageText(id: string, page: number): Promise<string> {
  const res = await apiFetch(`/api/documents/${id}/pages/${page}/text`);
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Impossible de charger le texte de la page."));
  return (await res.json()).text;
}

/** Télécharge le MP3 d'une page et retourne une URL locale (blob) prête à être lue. */
export async function fetchAudioUrl(id: string, page: number, lang: string): Promise<string> {
  const res = await apiFetch(`/api/documents/${id}/pages/${page}/audio?lang=${lang}`);
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Impossible de générer l'audio de cette page."));
  return URL.createObjectURL(await res.blob());
}

export async function searchDoc(id: string, q: string): Promise<SearchHit[]> {
  const res = await apiFetch(`/api/documents/${id}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Recherche impossible."));
  return (await res.json()).results;
}

/** Réveille un serveur gratuit mis en veille (le premier appel peut prendre ~1 minute). */
export function wakeApi() {
  fetch(`${API}/health`).catch(() => {});
}

export type Me = { auth_enabled: boolean; user: { id: string; email: string; is_admin: boolean } | null };
export async function fetchMe(): Promise<Me> {
  const res = await apiFetch("/api/me");
  if (!res.ok) throw new ApiError(res.status, "Profil indisponible.");
  return res.json();
}

// ---------- administration ----------
export type Rank = { name: string; count: number };
export type AdminPerson = {
  id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; confirmed: boolean; banned: boolean;
  uploads: number; docs: number; plays: number; pages: number; minutes: number; last_seen: string | null;
};
export type AdminDoc = { time: string; user_id: string; who: string; filename: string; pages: number; size_kb: number; lang: string };
export type AdminUserDetail = {
  user: { id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; confirmed: boolean; banned: boolean } | null;
  totals: { uploads: number; docs: number; plays: number; pages: number; minutes: number; first_seen: string | null; last_seen: string | null };
  documents: { filename: string; pages: number; size_kb: number; lang: string; times: number; last: string }[];
  library: { filename: string; page_count: number; last_page: number; size_bytes: number; updated_at: string; storage_path: string | null; lang: string | null }[];
  events: { time: string; type: string; info: string }[];
};

export type AdminStats = {
  period_days: number; generated_at: string;
  kpis: { visitors: number; returning: number; sessions: number; uploads_ok: number; uploads_failed: number; plays: number; listeners: number; pages_listened: number; listening_minutes: number; signups: number; logins: number; active_users: number };
  daily: { date: string; visitors: number; uploads: number; plays: number; pages: number; signups: number }[];
  funnel: { step: string; count: number; pct: number }[];
  countries: Rank[]; devices: Rank[]; browsers: Rank[]; sources: Rank[]; languages: Rank[]; features: Rank[];
  hours: number[];
  docs: { total: number; avg_pages: number; avg_size_kb: number };
  tts: { total: number; failed: number; avg_ms: number; p95_ms: number; engines: Rank[] };
  upload_failures: Rank[];
  errors: { time: string; type: string; detail: string; country: string }[];
  recent: { time: string; type: string; who: string; country: string; device: string; info: string }[];
  users: { total: number } | null;
  people: AdminPerson[];
  documents: AdminDoc[];
  system: { store: string; auth_enabled: boolean; events_loaded: number; documents_on_disk: number };
};

export async function adminStats(days: number): Promise<AdminStats> {
  let res: Response;
  try { res = await apiFetch(`/api/admin/stats?days=${days}`); }
  catch { throw new ApiError(0, "Serveur injoignable (il se réveille peut-être)."); }
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Erreur serveur."));
  return res.json();
}

export async function adminUser(id: string): Promise<AdminUserDetail> {
  const res = await apiFetch(`/api/admin/users/${id}`);
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Utilisateur introuvable."));
  return res.json();
}

export async function adminSuspend(id: string, suspended: boolean): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/suspend`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suspended }),
  });
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Action impossible."));
}

/** Télécharge un export CSV (l'en-tête d'authentification impose de passer par fetch). */
export async function adminExport(kind: "users" | "documents" | "events", days: number): Promise<void> {
  const res = await apiFetch(`/api/admin/export?kind=${kind}&days=${days}`);
  if (!res.ok) throw new ApiError(res.status, await detail(res, "Export impossible."));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `pdf-audio-${kind}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
