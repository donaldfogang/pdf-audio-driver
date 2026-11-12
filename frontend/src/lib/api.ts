const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type DocInfo = { id: string; filename: string; page_count: number; lang: string };

export const LANG_NAMES: Record<string, string> = {
  fr: "Français", en: "Anglais", es: "Espagnol", de: "Allemand",
  it: "Italien", pt: "Portugais", nl: "Néerlandais", ar: "Arabe",
};

async function detail(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

export async function uploadPdf(file: File): Promise<DocInfo> {
  const body = new FormData();
  body.append("file", file);
  let res: Response;
  try { res = await fetch(`${API}/api/documents`, { method: "POST", body }); }
  catch { throw new Error("Le serveur est injoignable. Vérifiez que le backend est lancé."); }
  if (!res.ok) throw new Error(await detail(res, "Échec de l'envoi du fichier."));
  return res.json();
}

export async function getPageText(id: string, page: number): Promise<string> {
  const res = await fetch(`${API}/api/documents/${id}/pages/${page}/text`);
  if (!res.ok) throw new Error(await detail(res, "Impossible de charger le texte de la page."));
  return (await res.json()).text;
}

/** Télécharge le MP3 d'une page et retourne une URL locale (blob) prête à être lue. */
export async function fetchAudioUrl(id: string, page: number, lang: string): Promise<string> {
  const res = await fetch(`${API}/api/documents/${id}/pages/${page}/audio?lang=${lang}`);
  if (!res.ok) throw new Error(await detail(res, "Impossible de générer l'audio de cette page."));
  return URL.createObjectURL(await res.blob());
}

/** Réveille un serveur gratuit mis en veille (le premier appel peut prendre ~1 minute). */
export function wakeApi() {
  fetch(`${API}/health`).catch(() => {});
}
