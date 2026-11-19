// Reprise automatique : la position de lecture est gardée dans le navigateur,
// associée à l'empreinte du fichier (nom + taille), même si le serveur a oublié le document.
const k = (fp: string) => `pdf-audio:progress:${fp}`;

export function loadProgress(fp: string): number | null {
  try { const v = Number(localStorage.getItem(k(fp))); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
export function saveProgress(fp: string, page: number) {
  try { localStorage.setItem(k(fp), String(page)); } catch {}
}
