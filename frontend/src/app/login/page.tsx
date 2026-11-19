"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { googleEnabled, supabase } from "@/lib/supabase";
import { track } from "@/lib/track";

type Mode = "in" | "up" | "forgot";

function friendly(msg: string) {
  if (/invalid login/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/not confirmed/i.test(msg)) return "Adresse non confirmée : ouvrez l’e-mail de confirmation que nous vous avons envoyé.";
  if (/already registered|already been registered/i.test(msg)) return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  if (/password/i.test(msg) && /(least|short|weak)/i.test(msg)) return "Mot de passe trop court ou trop simple (8 caractères minimum).";
  if (/rate limit|too many/i.test(msg)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  return msg || "Une erreur est survenue. Réessayez.";
}

const input = "h-12 w-full rounded-xl bg-raised px-4 outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-md space-y-4 px-5 py-16">
        <h1 className="font-display text-3xl font-extrabold">Connexion</h1>
        <p className="text-muted">La connexion n’est pas encore activée sur ce site. Vous pouvez utiliser pdf-audio en invité.</p>
        <Link href="/" className="inline-block font-bold text-accent hover:underline">Continuer en invité</Link>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        track("login", { method: "password" });
        router.push("/");
      } else if (mode === "up") {
        if (!consent) throw new Error("Veuillez accepter l’enregistrement de l’activité de votre compte.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/`, data: { consent_at: new Date().toISOString(), consent_version: "2026-11" } },
        });
        if (error) throw error;
        track("signup", { method: "password" });
        if (data.session) router.push("/");
        else setInfo("Compte créé ! Ouvrez l’e-mail de confirmation que nous venons de vous envoyer, puis revenez vous connecter.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset` });
        if (error) throw error;
        setInfo("Si cette adresse existe, un e-mail de réinitialisation vient d’être envoyé.");
      }
    } catch (err) { setError(friendly(err instanceof Error ? err.message : "")); }
    finally { setBusy(false); }
  }

  async function google() {
    if (!supabase) return;
    track("login", { method: "google" });
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/` } });
    if (error) setError(friendly(error.message));
  }

  const title = mode === "in" ? "Bon retour" : mode === "up" ? "Créer un compte" : "Mot de passe oublié";
  const tab = (m: Mode) => `h-10 flex-1 rounded-full text-sm font-bold ${mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`;

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 py-12">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-muted">Gardez vos documents et votre progression sur tous vos appareils. En mode invité, aucune donnée n’est collectée.</p>
      </div>

      {mode !== "forgot" && (
        <div className="flex rounded-full bg-surface p-1" role="tablist">
          <button role="tab" aria-selected={mode === "in"} className={tab("in")} onClick={() => { setMode("in"); setError(null); setInfo(null); }}>Se connecter</button>
          <button role="tab" aria-selected={mode === "up"} className={tab("up")} onClick={() => { setMode("up"); setError(null); setInfo(null); }}>Créer un compte</button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-[2rem] bg-surface p-6">
        <label className="block space-y-2">
          <span className="font-bold">Adresse e-mail</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="vous@exemple.com" />
        </label>
        {mode !== "forgot" && (
          <label className="block space-y-2">
            <span className="font-bold">Mot de passe</span>
            <input type="password" required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="8 caractères minimum" />
          </label>
        )}
        {mode === "up" && (
          <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
            <span>J’accepte que pdf-audio enregistre l’activité liée à mon compte (documents chargés, pages écoutées). <Link href="/privacy" className="font-bold text-accent hover:underline">Détails</Link></span>
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500">{error}</p>}
        {info && <p role="status" className="rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent">{info}</p>}
        <button type="submit" disabled={busy}
          className="h-12 w-full rounded-xl bg-accent font-bold text-accent-ink transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Patientez…" : mode === "in" ? "Se connecter" : mode === "up" ? "Créer mon compte" : "Envoyer le lien"}
        </button>
        {mode === "in" && <button type="button" onClick={() => { setMode("forgot"); setError(null); setInfo(null); }} className="w-full text-sm font-semibold text-muted hover:text-ink">Mot de passe oublié ?</button>}
        {mode === "forgot" && <button type="button" onClick={() => setMode("in")} className="w-full text-sm font-semibold text-muted hover:text-ink">Retour à la connexion</button>}
      </form>

      {googleEnabled && mode !== "forgot" && (
        <button onClick={google} className="h-12 w-full rounded-xl border border-line bg-surface font-bold hover:bg-raised">Continuer avec Google</button>
      )}

      <Link href="/" className="block text-center font-bold text-accent hover:underline">Continuer en invité</Link>
    </main>
  );
}
