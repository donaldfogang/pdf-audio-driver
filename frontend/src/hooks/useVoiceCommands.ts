"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseCommand, type Command } from "@/lib/voice";

type Result = { isFinal: boolean; 0: { transcript: string } };
type RecEvent = { resultIndex: number; results: ArrayLike<Result> };
interface Rec {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void; abort(): void;
}
type RecCtor = new () => Rec;

const getCtor = (): RecCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const subscribe = () => () => {};

/** Écoute continue du micro (Web Speech API) ; relance automatiquement la reconnaissance. */
export function useVoiceCommands(enabled: boolean, onCommand: (c: Command) => void) {
  const supported = useSyncExternalStore(subscribe, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onCommand);
  useEffect(() => { handler.current = onCommand; });

  useEffect(() => {
    const Ctor = getCtor();
    if (!enabled || !Ctor) return;
    let alive = true;
    let delay = 400;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      delay = 400;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) continue;
        const cmd = parseCommand(res[0].transcript);
        if (cmd) handler.current(cmd);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        alive = false; setListening(false); setError("Accès au micro refusé.");
      } else if (e.error === "network") {
        delay = 3000; setError("Reconnaissance vocale indisponible (réseau).");
      }
    };
    rec.onend = () => { if (alive) setTimeout(() => { if (alive) { try { rec.start(); } catch {} } }, delay); };
    try { rec.start(); setListening(true); setError(null); } catch { setError("Impossible de démarrer le micro."); }
    return () => {
      alive = false;
      rec.onend = null; rec.onerror = null; rec.onresult = null;
      try { rec.abort(); } catch {}
      setListening(false);
    };
  }, [enabled]);

  return { supported, listening: enabled && listening, error: enabled ? error : null };
}
