"use client";
import { useEffect, useState } from "react";
import Dropzone from "@/components/Dropzone";
import DriverPanel from "@/components/DriverPanel";
import ThemeToggle from "@/components/ThemeToggle";
import { FileIcon, MinusIcon, PlayIcon, PlusIcon } from "@/components/icons";
import { LANG_NAMES, uploadPdf, wakeApi, type DocInfo } from "@/lib/api";

export default function Home() {
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [startPage, setStartPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { wakeApi(); }, []); // réveille le serveur gratuit pendant que l'utilisateur choisit son fichier

  async function handleFile(file: File) {
    setBusy(true); setError(null);
    try { setDoc(await uploadPdf(file)); setStartPage(1); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur inconnue."); }
    finally { setBusy(false); }
  }

  const clamp = (n: number) => Math.min(doc?.page_count ?? 1, Math.max(1, Math.round(n) || 1));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-10 px-5 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent text-accent-ink"><PlayIcon className="size-5" /></span>
          <span className="text-xl font-extrabold">PDF Audio Driver</span>
        </div>
        <ThemeToggle />
      </header>

      {!doc ? (
        <>
          <section className="space-y-3">
            <h1 className="text-5xl font-extrabold leading-[1.05] sm:text-6xl">Vos PDF, à voix haute.</h1>
            <p className="max-w-md text-lg text-muted">Déposez un document, choisissez la page de départ et écoutez-le pendant que vous conduisez.</p>
          </section>
          <Dropzone onFile={handleFile} onReject={() => setError("Le fichier doit être un PDF.")} busy={busy} />
          {error && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 font-semibold text-red-500">{error}</p>}
        </>
      ) : (
        <section className="space-y-7 rounded-[2rem] bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><FileIcon className="size-7" /></span>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{doc.filename}</p>
              <p className="text-muted">{doc.page_count} pages · {LANG_NAMES[doc.lang] ?? doc.lang}</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="font-bold">Commencer à la page</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setStartPage(clamp(startPage - 1))} aria-label="Page précédente"
                className="grid size-12 place-items-center rounded-full bg-raised hover:bg-line focus-visible:outline-2 focus-visible:outline-accent"><MinusIcon className="size-5" /></button>
              <input type="number" inputMode="numeric" min={1} max={doc.page_count} value={startPage} aria-label="Page de départ"
                onChange={(e) => setStartPage(clamp(Number(e.target.value)))}
                className="h-12 w-24 rounded-xl bg-raised text-center text-2xl font-bold tabular-nums outline-none [appearance:textfield] focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-inner-spin-button]:appearance-none" />
              <button onClick={() => setStartPage(clamp(startPage + 1))} aria-label="Page suivante"
                className="grid size-12 place-items-center rounded-full bg-raised hover:bg-line focus-visible:outline-2 focus-visible:outline-accent"><PlusIcon className="size-5" /></button>
              <span className="text-lg text-muted">sur {doc.page_count}</span>
            </div>
            <input type="range" min={1} max={doc.page_count} value={startPage} aria-label="Choisir la page de départ"
              onChange={(e) => setStartPage(Number(e.target.value))} className="w-full accent-accent" />
          </div>

          <div className="space-y-3">
            <button onClick={() => setPlaying(true)}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-accent text-xl font-bold text-accent-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <PlayIcon className="size-6" /> Commencer la lecture
            </button>
            <button onClick={() => setDoc(null)} className="h-11 w-full font-semibold text-muted hover:text-ink">Choisir un autre PDF</button>
          </div>

          <details className="rounded-2xl bg-raised px-4 py-3">
            <summary className="cursor-pointer font-bold">Mains libres : commandes vocales</summary>
            <div className="mt-3 space-y-2 text-muted">
              <p>Dans le lecteur, touchez l’icône micro, puis dites <b className="text-ink">« Lecteur »</b> suivi d’une commande :</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                <li>« pause »</li><li>« reprends »</li>
                <li>« suivant »</li><li>« précédent »</li>
                <li>« répète »</li><li>« page 12 »</li>
                <li>« plus vite »</li><li>« moins vite »</li>
              </ul>
              <p className="text-sm">Fonctionne avec Chrome (Android et ordinateur).</p>
            </div>
          </details>
        </section>
      )}

      {doc && playing && <DriverPanel doc={doc} startPage={startPage} onClose={() => setPlaying(false)} />}
    </main>
  );
}
