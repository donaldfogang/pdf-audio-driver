"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocInfo } from "@/lib/api";
import { useMedia } from "@/hooks/useMedia";
import { useReader } from "@/hooks/useReader";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import { track } from "@/lib/track";
import { COMMAND_LABELS, type Command } from "@/lib/voice";
import { CloseIcon, MicIcon, MoonIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, SpinnerIcon, StopIcon } from "./icons";
import PdfPage from "./PdfPage";

const fmt = (s: number) => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const RATES = [1, 1.25, 1.5, 2];
const SLEEP = [0, 15, 30, 60];
const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

type Props = { doc: DocInfo; file: File; startPage: number; onClose: () => void; onPage?: (n: number) => void };

export default function DriverPanel({ doc, file, startPage, onClose, onPage }: Props) {
  const r = useReader(doc, (page, sec) => track("page_done", { page, sec: Math.round(sec) }));
  const { start, stop, pause } = r;
  const first = useRef(startPage);
  const started = useRef(false);
  const textBox = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const isLg = useMedia("(min-width: 1024px)");
  const [view, setView] = useState<"text" | "page">("text");

  useEffect(() => { start(first.current); return stop; }, [start, stop]);
  useEffect(() => { textBox.current?.scrollTo({ top: 0 }); }, [r.page]);
  useEffect(() => { if (r.status === "playing") onPage?.(r.page); }, [r.page, r.status, onPage]);
  useEffect(() => {
    if (r.status === "playing" && !started.current) {
      started.current = true;
      track("play_start", { page: r.page, pages: doc.page_count, wide: isLg });
    }
  }, [r.status, r.page, doc.page_count, isLg]);

  const playing = r.status === "playing";
  const loading = r.status === "loading";
  const pagePct = r.duration ? Math.min(r.time / r.duration, 1) : 0;
  const docPct = ((r.page - 1 + pagePct) / doc.page_count) * 100;

  // --- Lecture suivie : la phrase en cours est surlignée (estimation selon l'avancement de l'audio) ---
  const chunks = useMemo(() => r.text.match(/[^.!?…]+[.!?…]*\s*|\s+/g) ?? (r.text ? [r.text] : []), [r.text]);
  const ends = useMemo(() => { let n = 0; return chunks.map((c) => (n += c.length)); }, [chunks]);
  const total = ends.length ? ends[ends.length - 1] : 0;
  let active = -1;
  if (r.duration > 0 && total > 0) {
    const i = ends.findIndex((e) => e >= pagePct * total);
    active = i === -1 ? ends.length - 1 : i;
  }
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [active]);

  // --- Chapitre en cours (signets du PDF) ---
  const chapter = useMemo(
    () => (doc.outline ?? []).reduce<string | null>((cur, o) => (o.page <= r.page ? o.title : cur), null),
    [doc.outline, r.page],
  );

  // --- Vitesse ---
  const changeRate = (rate: number) => { if (rate !== r.rate) { r.setRate(rate); track("rate_change", { rate }); } };
  const stepRate = (d: 1 | -1) => RATES[Math.min(RATES.length - 1, Math.max(0, RATES.indexOf(r.rate) + d))];

  // --- Minuteur de sommeil ---
  const [sleepIdx, setSleepIdx] = useState(0);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (sleepAt === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= sleepAt) { pause(); setSleepAt(null); setSleepIdx(0); }
    }, 1000);
    return () => clearInterval(t);
  }, [sleepAt, pause]);
  const cycleSleep = () => {
    const i = (sleepIdx + 1) % SLEEP.length;
    setSleepIdx(i);
    if (i === 0) setSleepAt(null);
    else { const n = Date.now(); setNow(n); setSleepAt(n + SLEEP[i] * 60000); track("sleep_set", { min: SLEEP[i] }); }
  };
  const sleepLabel = sleepAt === null ? "Veille" : `Veille · ${Math.max(1, Math.ceil((sleepAt - now) / 60000))} min`;

  // --- Mains libres : « Lecteur, pause », « Lecteur, page 5 »… ---
  const [hands, setHands] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { try { if (localStorage.getItem("handsfree") === "1") setHands(true); } catch {} }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const toggleHands = () => {
    const v = !hands;
    setHands(v);
    if (v) track("voice_on");
    try { localStorage.setItem("handsfree", v ? "1" : "0"); } catch {}
  };

  const onCommand = (c: Command) => {
    switch (c.type) {
      case "pause": r.pause(); break;
      case "play": r.resume(); break;
      case "next": if (r.page < doc.page_count) r.goTo(r.page + 1); break;
      case "prev": if (r.page > 1) r.goTo(r.page - 1); break;
      case "repeat": r.goTo(r.page); break;
      case "stop": r.stop(); break;
      case "faster": changeRate(stepRate(1)); break;
      case "slower": changeRate(stepRate(-1)); break;
      case "goto": r.goTo(Math.min(doc.page_count, Math.max(1, c.page))); break;
    }
    track("voice_cmd", { cmd: c.type });
    setFlash(c.type === "goto" ? `Page ${c.page}` : COMMAND_LABELS[c.type]);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  };
  const voice = useVoiceCommands(hands, onCommand);

  const side = "grid size-16 place-items-center rounded-full bg-surface text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
  const tab = (active: boolean) => `h-10 flex-1 rounded-full text-sm font-bold ${active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`;

  const textCard = (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem] bg-surface">
      <div ref={textBox} className="h-full overflow-y-auto p-6 pb-16 sm:p-8">
        {loading && !r.text ? (
          <div className="space-y-3" aria-label="Préparation de l’audio">
            {[92, 100, 85, 96, 60].map((w, i) => <div key={i} className="h-5 animate-pulse rounded-full bg-raised" style={{ width: `${w}%` }} />)}
          </div>
        ) : (
          <p className="whitespace-pre-line text-xl leading-relaxed sm:text-2xl sm:leading-relaxed">
            {chunks.map((c, i) => (
              <span key={i} ref={i === active ? activeRef : undefined}
                className={i === active ? "box-decoration-clone rounded-md bg-accent/20" : undefined}>{c}</span>
            ))}
          </p>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-label="Lecteur">
      <div className="h-1 bg-line" role="progressbar" aria-label="Progression du document" aria-valuenow={Math.round(docPct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${docPct}%` }} />
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <header className="flex items-center gap-3">
            <button onClick={() => { stop(); onClose(); }} aria-label="Fermer le lecteur"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
              <CloseIcon className="size-5" />
            </button>
            <p className="min-w-0 flex-1 truncate font-semibold text-muted">{doc.filename}</p>
            {voice.supported && (
              <button onClick={toggleHands} aria-pressed={hands} aria-label="Mains libres (commandes vocales)"
                className={`grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent ${hands ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-ink"}`}>
                <MicIcon className="size-5" />
              </button>
            )}
            <button onClick={() => changeRate(RATES[(RATES.indexOf(r.rate) + 1) % RATES.length])} aria-label={`Vitesse de lecture ${r.rate} fois`}
              className="h-11 min-w-16 rounded-full bg-surface px-4 font-bold tabular-nums hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent">
              {r.rate}×
            </button>
          </header>

          {hands && (
            <p className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm font-semibold" role="status">
              <span className={`size-2.5 shrink-0 rounded-full ${voice.listening ? "animate-pulse bg-accent" : "bg-muted"}`} />
              <span className="min-w-0 flex-1 truncate">
                {flash ? `Commande : ${flash}` : voice.error ?? "Mains libres actif · dites « Lecteur, pause » ou « Lecteur, suivant »"}
              </span>
            </p>
          )}

          <div className="flex items-end gap-3 px-1">
            <span className="font-display text-8xl font-extrabold leading-[0.85] tabular-nums sm:text-9xl">{r.page}</span>
            <span className="pb-1 text-2xl font-semibold text-muted">sur {doc.page_count}</span>
            <span className={`eq mb-2 ml-auto ${playing ? "" : "is-paused"}`} aria-hidden><span /><span /><span /><span /></span>
          </div>

          <div className="flex items-center gap-3 px-1">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{chapter ?? ""}</p>
            <button onClick={cycleSleep} aria-label="Minuteur de veille"
              className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-accent ${sleepAt !== null ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-ink"}`}>
              <MoonIcon className="size-4" />{sleepLabel}
            </button>
          </div>

          {!isLg && (
            <div className="flex rounded-full bg-surface p-1" role="tablist" aria-label="Affichage">
              <button role="tab" aria-selected={view === "text"} className={tab(view === "text")} onClick={() => setView("text")}>Texte</button>
              <button role="tab" aria-selected={view === "page"} className={tab(view === "page")}
                onClick={() => { setView("page"); track("view_toggle", { view: "page" }); }}>Page d’origine</button>
            </div>
          )}

          {isLg || view === "text" ? textCard : <div className="min-h-0 flex-1"><PdfPage file={file} page={r.page} /></div>}

          {r.error && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 font-semibold text-red-500">{r.error}</p>}

          <div>
            <div role="progressbar" aria-label="Progression de la page" aria-valuenow={Math.round(pagePct * 100)} aria-valuemin={0} aria-valuemax={100}
              onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); r.seek((e.clientX - b.left) / b.width); }}
              className="flex h-6 cursor-pointer items-center">
              <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${pagePct * 100}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-sm font-semibold tabular-nums text-muted">
              <span>{fmt(r.time)}</span>
              <span>{fmt(r.duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pb-2 sm:justify-center sm:gap-8">
            <button onClick={r.stop} className={side} aria-label="Arrêt"><StopIcon className="size-6" /></button>
            <button onClick={() => r.goTo(r.page - 1)} disabled={r.page <= 1} className={side} aria-label="Page précédente"><PrevIcon className="size-6" /></button>

            <button onClick={playing ? r.pause : r.resume} disabled={loading}
              aria-label={playing ? "Pause" : "Lecture"}
              className="relative grid size-28 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="6" className="stroke-line" />
                <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-accent transition-[stroke-dashoffset] duration-300 ease-linear"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pagePct)} />
              </svg>
              <span className="grid size-20 place-items-center rounded-full bg-accent text-accent-ink">
                {loading ? <SpinnerIcon className="size-8" /> : playing ? <PauseIcon className="size-9" /> : <PlayIcon className="size-9" />}
              </span>
            </button>

            <button onClick={() => r.goTo(r.page + 1)} disabled={r.page >= doc.page_count} className={side} aria-label="Page suivante"><NextIcon className="size-6" /></button>
            <span className="size-16 sm:hidden" aria-hidden />
          </div>
        </div>

        {isLg && <aside className="min-h-0 min-w-0 flex-1" aria-label="Page d’origine"><PdfPage file={file} page={r.page} /></aside>}
      </div>
    </div>
  );
}
