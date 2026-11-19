"use client";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/track";

/** Une visite par chargement de page, uniquement pour un utilisateur connecté (les invités ne sont pas suivis). */
export default function Analytics() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || sent.current === uid) return;
    sent.current = uid;
    let ref = "";
    try { const h = new URL(document.referrer).host.replace(/^www\./, ""); ref = h && h !== location.host ? h : ""; } catch {}
    const utm = new URLSearchParams(location.search).get("utm_source") ?? "";
    track("visit", {
      path: location.pathname, ref, utm: utm.slice(0, 40), lang: navigator.language ?? "",
      pwa: matchMedia("(display-mode: standalone)").matches,
    });
  }, [uid]);
  return null;
}
