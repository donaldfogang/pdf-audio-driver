"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Dropzone from "@/components/Dropzone";
import DriverPanel from "@/components/DriverPanel";
import HeroArt from "@/components/HeroArt";
import Library from "@/components/Library";
import { FileIcon, MinusIcon, PlayIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { LANG_NAMES, searchDoc, uploadPdf, wakeApi, type DocInfo, type SearchHit } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadFromLibrary, getLibraryItem, saveToLibrary, updateLibraryPage, type LibItem } from "@/lib/library";
import { loadProgress, saveProgress } from "@/lib/progress";
import { track } from "@/lib/track";

const FEATURES = [
  ["Lecture suivie", "La phrase lue est surlignée et le texte défile tout seul."],
  ["Page d’origine à côté", "Gardez un œil sur le PDF : graphiques, tableaux et mises en page restent visibles."],
  ["Lecture intelligente", "En-têtes, pieds de page et numéros de page sont ignorés."],
  ["Chapitres et recherche", "Démarrez exactement où vous voulez, par chapitre ou par mot-clé."],
  ["Mains libres", "Pilotez la lecture à la voix : pause, suivant, page 12…"],
  ["Reprise automatique", "Retrouvez votre position, sur tous vos appareils avec un compte."],
];
const STEPS = [
  ["01", "Déposez un PDF", "Cours, rapport, contrat, livre : jusqu’à 25 Mo."],
  ["02", "Choisissez où commencer", "Par page, chapitre ou recherche."],
  ["03", "Écoutez", "Au calme, en marchant ou au volant."],
];

export default function Home() {
  const { user, configured } = useAuth();
  const userId = user?.id ?? null;
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fp, setFp] = useState("");
  const [startPage, setStartPage] = useState(1);
  const [resumed, setResumed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [keep, setKeep] = useState(true);
  const [libVersion, setLibVersion] = useState(0);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Le logo du site ramène à la page de chargement
  useEffect(() => {
    const reset = () => { setPlaying(false); setDoc(null); setFile(null); setError(null); };
    window.addEventListener("pdf-audio:home", reset);
    return () => window.removeEventListener("pdf-audio:home", reset);
  }, []);

  useEffect(() => { wakeApi(); }, []); // réveille le serveur gratuit pendant que l'utilisateur choisit son fichier

  async function handleFile(f: File) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const d = await uploadPdf(f);
      const key = `${f.name}:${f.size}`;
      let saved = loadProgress(key);
      if (userId) { try { const it = await getLibraryItem(key); if (it?.last_page) saved = it.last_page; } catch {} }
      setDoc(d); setFile(f); setFp(key); setQuery(""); setHits([]);
      if (saved && saved > 1 && saved <= d.page_count) { setStartPage(saved); setResumed(saved); }
      else { setStartPage(1); setResumed(null); }
      if (userId && keep) {
        saveToLibrary(userId, f, key, d, true, saved ?? 1)
          .then(() => { track("library_save"); setLibVersion((v) => v + 1); })
          .catch((e) => setNotice(e instanceof Error ? e.message : "Enregistrement dans la bibliothèque impossible."));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inconnue."); }
    finally { setBusy(false); }
  }

  async function openFromLibrary(item: LibItem) {
    setBusy(true); setError(null);
    try { const f = await downloadFromLibrary(item); track("library_resume"); await handleFile(f); }
    catch (e) { setError(e instanceof Error ? e.message : "Ouverture impossible."); setBusy(false); }
  }

  const onPage = useCallback((n: number) => {
    if (!fp) return;
    saveProgress(fp, n);
    if (userId) {
      clearTimeout(pageTimer.current);
      pageTimer.current = setTimeout(() => { updateLibraryPage(fp, n).catch(() => {}); }, 3000);
    }
  }, [fp, userId]);

  const clamp = (n: number) => Math.min(doc?.page_count ?? 1, Math.max(1, Math.round(n) || 1));

  useEffect(() => {
    if (!doc || query.trim().length < 2) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try { const res = await searchDoc(doc.id, query.trim()); if (alive) setHits(res); }
      catch { if (alive) setHits([]); }
      finally { if (alive) setSearching(false); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [doc, query]);

  const outline = doc?.outline ?? [];
  const q = query.trim();

  if (doc && file) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-4 px-5 py-8">
        <button onClick={() => { setDoc(null); setFile(null); }}
          className="flex h-11 items-center gap-2 rounded-full bg-surface px-5 font-bold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent">
          <span aria-hidden>←</span> Charger un autre document
        </button>
        <section className="space-y-7 rounded-[2rem] bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><FileIcon className="size-7" /></span>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{doc.filename}</p>
              <p className="text-muted">{doc.page_count} pages · {LANG_NAMES[doc.lang] ?? doc.lang}</p>
            </div>
          </div>

          {notice && <p role="status" className="rounded-xl bg-raised px-4 py-2.5 text-sm font-semibold">{notice}</p>}
          {resumed !== null && startPage === resumed && (
            <p className="rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent">
              Reprise automatique à la page {resumed}.{" "}
              <button onClick={() => setStartPage(1)} className="underline">Recommencer au début</button>
            </p>
          )}

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

          {outline.length > 0 && (
            <label className="block space-y-2">
              <span className="font-bold">Chapitres</span>
              <select value="" onChange={(e) => { if (e.target.value) { setStartPage(clamp(Number(e.target.value))); setResumed(null); track("chapter_jump"); } }}
                className="h-12 w-full rounded-xl bg-raised px-3 outline-none focus-visible:outline-2 focus-visible:outline-accent">
                <option value="">Aller à un chapitre…</option>
                {outline.map((o, i) => <option key={i} value={o.page}>{"\u00A0\u00A0".repeat(o.level)}{o.title} — p. {o.page}</option>)}
              </select>
            </label>
          )}

          <div className="space-y-2">
            <label className="block font-bold" htmlFor="search">Chercher dans le document</label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input id="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Un mot ou une expression"
                className="h-12 w-full rounded-xl bg-raised pl-12 pr-4 outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
            </div>
            {searching && <p className="text-sm text-muted">Recherche…</p>}
            {q.length >= 2 && !searching && hits.length === 0 && <p className="text-sm text-muted">Aucun résultat.</p>}
            {hits.length > 0 && (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.page}>
                    <button onClick={() => { setStartPage(h.page); setResumed(null); }}
                      className={`w-full rounded-xl px-3 py-2 text-left hover:bg-line ${startPage === h.page ? "bg-accent/15" : "bg-raised"}`}>
                      <span className="font-bold tabular-nums">p. {h.page}</span>
                      <span className="ml-2 text-sm text-muted">{h.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <button onClick={() => setPlaying(true)}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-accent text-xl font-bold text-accent-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <PlayIcon className="size-6" /> Commencer la lecture
            </button>
            <button onClick={() => { setDoc(null); setFile(null); }} className="h-11 w-full font-semibold text-muted hover:text-ink">← Charger un autre document</button>
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
              <p className="text-sm">Pratique en voiture, en cuisine ou en bricolant. Fonctionne avec Chrome (Android et ordinateur).</p>
            </div>
          </details>
        </section>
        {playing && <DriverPanel doc={doc} file={file} startPage={startPage} onClose={() => setPlaying(false)} onPage={onPage} />}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-20 px-5 pb-20">
      <section className="grid items-center gap-12 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
        <div className="space-y-6">
          <p className="inline-block rounded-full bg-accent/10 px-4 py-1.5 text-sm font-bold text-accent">Gratuit · sans inscription</p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            Vos PDF,<br /><span className="text-accent">à voix haute.</span>
          </h1>
          <p className="max-w-lg text-lg text-muted">
            Cours, rapports, contrats, livres : déposez un document et écoutez-le où vous voulez, chez vous, en marchant ou au volant.
          </p>
        </div>
        <HeroArt />
      </section>

      <section className="mx-auto w-full max-w-3xl space-y-4">
        <Dropzone onFile={handleFile} onReject={() => setError("Le fichier doit être un PDF.")} busy={busy} />
        {error && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 font-semibold text-red-500">{error}</p>}
        {configured && user && (
          <p className="px-1 text-sm text-muted">Votre activité (documents chargés, pages écoutées) est enregistrée sur votre compte. <Link href="/privacy" className="font-bold text-accent hover:underline">En savoir plus</Link></p>
        )}
        {configured && user && (
          <label className="flex cursor-pointer items-center gap-3 px-1 text-sm font-semibold text-muted">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-4 accent-accent" />
            Enregistrer dans ma bibliothèque (reprise sur tous mes appareils)
          </label>
        )}
        {configured && !user && (
          <p className="px-1 text-sm text-muted">
            Mode invité : <b className="text-ink">aucune donnée n’est collectée</b>. <Link href="/login" className="font-bold text-accent hover:underline">Créez un compte gratuit</Link> pour garder vos documents et votre progression sur tous vos appareils.
          </p>
        )}
      </section>

      {configured && user && <Library version={libVersion} busy={busy} onOpen={openFromLibrary} />}

      <section className="space-y-8">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Pensé pour écouter vraiment</h2>
        <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <li key={title} className="border-t border-line pt-4">
              <p className="font-display text-lg font-bold">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-8">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Trois gestes</h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="rounded-3xl bg-surface p-6">
              <p className="font-display text-5xl font-extrabold text-accent">{n}</p>
              <p className="mt-3 font-display text-xl font-bold">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
