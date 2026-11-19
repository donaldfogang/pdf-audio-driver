"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady(true); });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message); else router.push("/");
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Nouveau mot de passe</h1>
      {!ready ? (
        <p className="text-muted">Ouvrez le lien reçu par e-mail pour choisir un nouveau mot de passe. <Link href="/login" className="font-bold text-accent hover:underline">Retour à la connexion</Link></p>
      ) : (
        <form onSubmit={submit} className="space-y-4 rounded-[2rem] bg-surface p-6">
          <label className="block space-y-2">
            <span className="font-bold">Nouveau mot de passe</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl bg-raised px-4 outline-none focus-visible:outline-2 focus-visible:outline-accent" placeholder="8 caractères minimum" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500">{error}</p>}
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-accent font-bold text-accent-ink disabled:opacity-60">{busy ? "Patientez…" : "Enregistrer"}</button>
        </form>
      )}
    </main>
  );
}
