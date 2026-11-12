"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAudioUrl, getPageText, type DocInfo } from "@/lib/api";

export type Status = "idle" | "loading" | "playing" | "paused";

export function useReader(doc: DocInfo) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);                       // invalide les chargements obsolètes
  const pageRef = useRef(1);
  const rateRef = useRef(1);
  const cache = useRef(new Map<number, Promise<string>>());

  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const getAudio = useCallback((n: number) => {
    let p = cache.current.get(n);
    if (!p) {
      p = fetchAudioUrl(doc.id, n, doc.lang);
      p.catch(() => cache.current.delete(n));
      cache.current.set(n, p);
    }
    return p;
  }, [doc]);

  const dropBefore = useCallback((n: number) => {
    cache.current.forEach((p, k) => {
      if (k < n) { p.then((u) => URL.revokeObjectURL(u)).catch(() => {}); cache.current.delete(k); }
    });
  }, []);

  const stop = useCallback(() => {
    run.current++;
    const a = audio.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setStatus("idle"); setTime(0); setDuration(0);
  }, []);

  const loadPage = useCallback(async (target: number): Promise<void> => {
    const a = audio.current;
    if (!a) return;
    const n = Math.min(Math.max(1, target), doc.page_count);
    const id = ++run.current;
    pageRef.current = n;
    setPage(n); setStatus("loading"); setError(null); setTime(0); setDuration(0);
    try {
      const t = await getPageText(doc.id, n);
      if (id !== run.current) return;
      setText(t);
      if (!t.trim()) {                          // page vide (image, page blanche) : on passe
        if (n < doc.page_count) return loadPage(n + 1);
        return stop();
      }
      const url = await getAudio(n);
      if (id !== run.current) return;
      a.src = url;
      a.defaultPlaybackRate = rateRef.current;
      a.playbackRate = rateRef.current;
      await a.play();
      if (id !== run.current) return;
      dropBefore(n);
      if (n < doc.page_count) getAudio(n + 1).catch(() => {});   // préparation de la page suivante
    } catch (e) {
      if (id !== run.current) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof DOMException && e.name === "NotAllowedError"
        ? "Le navigateur a bloqué le son : touchez Lecture."
        : e instanceof Error ? e.message : "Erreur de lecture.");
      setStatus("paused");
    }
  }, [doc, getAudio, dropBefore, stop]);

  // Un seul élément audio : la lecture continue de page en page
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audio.current = a;
    const on: Record<string, () => void> = {
      timeupdate: () => setTime(a.currentTime),
      loadedmetadata: () => setDuration(a.duration),
      playing: () => setStatus("playing"),
      pause: () => { if (a.getAttribute("src") && !a.ended) setStatus("paused"); },
      ended: () => (pageRef.current < doc.page_count ? loadPage(pageRef.current + 1) : stop()),
      error: () => { if (a.getAttribute("src")) { setError("Lecture audio impossible."); setStatus("paused"); } },
    };
    Object.entries(on).forEach(([k, f]) => a.addEventListener(k, f));
    return () => { Object.entries(on).forEach(([k, f]) => a.removeEventListener(k, f)); a.pause(); };
  }, [doc, loadPage, stop]);

  useEffect(() => () => {
    const c = cache.current;
    c.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
    c.clear();
  }, []);

  // Commandes écran verrouillé / volant / CarPlay / Android Auto
  useEffect(() => {
    if (!("mediaSession" in navigator) || status === "idle") return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: `Page ${page} / ${doc.page_count}`, artist: doc.filename });
    navigator.mediaSession.setActionHandler("play", () => audio.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
    navigator.mediaSession.setActionHandler("stop", stop);
    navigator.mediaSession.setActionHandler("nexttrack", () => loadPage(page + 1));
    navigator.mediaSession.setActionHandler("previoustrack", () => loadPage(page - 1));
  }, [doc, page, status, loadPage, stop]);

  const pause = useCallback(() => audio.current?.pause(), []);
  const resume = useCallback(() => {
    const a = audio.current;
    if (a?.getAttribute("src")) a.play().catch(() => {});
    else loadPage(pageRef.current);
  }, [loadPage]);
  const seek = useCallback((ratio: number) => {
    const a = audio.current;
    if (a && isFinite(a.duration)) a.currentTime = Math.min(Math.max(0, ratio), 1) * a.duration;
  }, []);
  const setRate = useCallback((r: number) => {
    rateRef.current = r; setRateState(r);
    if (audio.current) { audio.current.defaultPlaybackRate = r; audio.current.playbackRate = r; }
  }, []);

  return { page, text, status, time, duration, rate, error, start: loadPage, goTo: loadPage, pause, resume, stop, seek, setRate };
}
