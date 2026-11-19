"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { PlayIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";

function AccountMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const email = user?.email ?? "";
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Mon compte"
        className="grid size-11 place-items-center rounded-full bg-accent text-lg font-bold uppercase text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {email.charAt(0) || "?"}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-40 w-64 space-y-1 rounded-2xl border border-line bg-surface p-2 shadow-xl">
          <p className="truncate px-3 py-2 text-sm text-muted">{email}</p>
          {isAdmin && <Link href="/admin" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 font-semibold hover:bg-raised">Tableau de bord admin</Link>}
          <button onClick={async () => { setOpen(false); await signOut(); }} className="block w-full rounded-xl px-3 py-2 text-left font-semibold hover:bg-raised">Se déconnecter</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { configured, ready, user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <Link href="/" onClick={() => window.dispatchEvent(new Event("pdf-audio:home"))} className="flex items-center gap-3" aria-label="pdf-audio, retour à l’accueil">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-ink"><PlayIcon className="size-5" /></span>
          <span className="font-display text-xl font-extrabold tracking-tight">pdf-audio</span>
        </Link>
        <div className="flex items-center gap-2">
          {configured && ready && (user ? <AccountMenu /> : (
            <Link href="/login" className="grid h-11 place-items-center rounded-full bg-accent px-5 font-bold text-accent-ink transition hover:brightness-110">Se connecter</Link>
          ))}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
