import { supabase } from "./supabase";

export const LIBRARY_MAX = 20;
export type LibItem = {
  fingerprint: string; filename: string; page_count: number; last_page: number;
  storage_path: string | null; size_bytes: number; updated_at: string;
};
const COLS = "fingerprint,filename,page_count,last_page,storage_path,size_bytes,updated_at";

async function sha1(s: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listLibrary(): Promise<LibItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("library").select(COLS).order("updated_at", { ascending: false }).limit(LIBRARY_MAX);
  if (error) throw new Error(error.message);
  return (data ?? []) as LibItem[];
}

export async function getLibraryItem(fp: string): Promise<LibItem | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("library").select(COLS).eq("fingerprint", fp).maybeSingle();
  return (data as LibItem | null) ?? null;
}

export async function saveToLibrary(
  userId: string, file: File, fp: string, doc: { page_count: number; lang: string }, keepFile: boolean, lastPage: number,
): Promise<void> {
  if (!supabase) return;
  const existing = await getLibraryItem(fp);
  if (!existing) {
    const { count } = await supabase.from("library").select("fingerprint", { count: "exact", head: true });
    if ((count ?? 0) >= LIBRARY_MAX) throw new Error(`Bibliothèque pleine (${LIBRARY_MAX} documents maximum). Supprimez-en un pour continuer.`);
  }
  let storagePath = existing?.storage_path ?? null;
  if (keepFile && !storagePath) {
    const path = `${userId}/${await sha1(fp)}.pdf`;
    const { error } = await supabase.storage.from("pdfs").upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (error) throw new Error(error.message);
    storagePath = path;
  }
  const { error } = await supabase.from("library").upsert({
    user_id: userId, fingerprint: fp, filename: file.name, page_count: doc.page_count, size_bytes: file.size,
    lang: doc.lang, last_page: existing?.last_page ?? lastPage, storage_path: storagePath, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,fingerprint" });
  if (error) throw new Error(error.message);
}

export async function updateLibraryPage(fp: string, page: number): Promise<void> {
  await supabase?.from("library").update({ last_page: page, updated_at: new Date().toISOString() }).eq("fingerprint", fp);
}

export async function downloadFromLibrary(item: LibItem): Promise<File> {
  if (!supabase || !item.storage_path) throw new Error("Le fichier n’a pas été conservé.");
  const { data, error } = await supabase.storage.from("pdfs").download(item.storage_path);
  if (error || !data) throw new Error("Téléchargement impossible.");
  return new File([data], item.filename, { type: "application/pdf" });
}

export async function removeFromLibrary(item: LibItem): Promise<void> {
  if (!supabase) return;
  if (item.storage_path) await supabase.storage.from("pdfs").remove([item.storage_path]);
  await supabase.from("library").delete().eq("fingerprint", item.fingerprint);
}
