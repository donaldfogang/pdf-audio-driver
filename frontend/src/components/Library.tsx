"use client";
import { useCallback, useEffect, useState } from "react";
import { listLibrary, removeFromLibrary, type LibItem } from "@/lib/library";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export default function Library({ version, busy, onOpen }: { version: number; busy: boolean; onOpen: (item: LibItem) => void }) {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listLibrary()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Bibliothèque indisponible."); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load, version]);

  if (items === null) return null;
  if (!items.length && !error) {
    return <p className="rounded-2xl bg-surface p-5 text-muted">Votre bibliothèque est vide. Les documents que vous écoutez s’y ajoutent automatiquement, avec votre progression.</p>;
  }
  return (
    <section className="space-y-4" aria-label="Ma bibliothèque">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Ma bibliothèque</h2>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const pct = Math.round((Math.max(0, it.last_page - 1) / Math.max(1, it.page_count)) * 100);
          return (
            <li key={it.fingerprint} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
              <div className="min-w-0">
                <p className="truncate font-bold">{it.filename}</p>
                <p className="text-sm text-muted">Page {it.last_page} sur {it.page_count} · {fmtDate(it.updated_at)}</p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
              <div className="flex items-center gap-2">
                {it.storage_path ? (
                  <button onClick={() => onOpen(it)} disabled={busy}
                    className="h-10 flex-1 rounded-xl bg-accent font-bold text-accent-ink transition hover:brightness-110 disabled:opacity-50">Reprendre</button>
                ) : (
                  <p className="flex-1 text-sm text-muted">Fichier non conservé : redéposez-le pour reprendre.</p>
                )}
                <button onClick={async () => { if (confirm(`Supprimer « ${it.filename} » de la bibliothèque ?`)) { await removeFromLibrary(it); load(); } }}
                  className="h-10 rounded-xl px-3 font-semibold text-muted hover:bg-raised hover:text-ink">Supprimer</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
