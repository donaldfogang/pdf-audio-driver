"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { analyticsOn, setAnalytics } from "@/lib/ids";

export default function PrivacyPage() {
  const { configured, user } = useAuth();
  const [on, setOn] = useState(() => analyticsOn());
  const h2 = "font-display text-2xl font-extrabold tracking-tight";
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-5 py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Confidentialité</h1>

      <section className="space-y-2">
        <h2 className={h2}>Mode invité : aucune donnée collectée</h2>
        <p className="text-muted">Sans compte, pdf-audio ne mesure rien : aucun identifiant, aucune statistique, aucun suivi. Le texte de votre PDF est analysé par notre serveur pour produire l’audio, puis supprimé automatiquement après 24 heures. L’aperçu de la page d’origine est affiché dans votre navigateur.</p>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Avec un compte</h2>
        <p className="text-muted">Si vous créez un compte, nous conservons votre adresse e-mail et enregistrons l’activité liée à votre compte : vos visites, les documents que vous chargez (nom du fichier, nombre de pages, taille, langue), les pages écoutées et la durée d’écoute, les fonctions que vous utilisez, ainsi que votre pays approximatif, votre type d’appareil et de navigateur. Ces informations sont consultables par l’administrateur du site, pour comprendre l’usage et améliorer le service.</p>
        <p className="text-muted">Nous n’enregistrons jamais le contenu de vos documents, ni vos recherches, ni votre adresse IP. Les documents que vous choisissez d’enregistrer dans votre bibliothèque sont conservés dans un espace privé ; l’administrateur n’y accède pas depuis l’application.</p>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Aucune revente</h2>
        <p className="text-muted">Nous ne vendons aucune donnée et n’affichons aucune publicité.</p>
      </section>

      <section className="space-y-3 rounded-[2rem] bg-surface p-6">
        <h2 className={h2}>Votre choix</h2>
        {configured && user ? (
          <>
            <label className="flex cursor-pointer items-center gap-3 font-semibold">
              <input type="checkbox" checked={on} className="size-5 accent-accent"
                onChange={(e) => { setAnalytics(e.target.checked); setOn(e.target.checked); }} />
              Enregistrer l’activité de mon compte
            </label>
            <p className="text-sm text-muted">Décochez pour que plus rien ne soit enregistré depuis cet appareil. Le réglage « Ne pas me suivre » de votre navigateur est également respecté. Pour supprimer votre compte et vos données, contactez l’administrateur du site.</p>
          </>
        ) : (
          <p className="text-muted">Vous êtes en mode invité : rien n’est collecté. <Link href="/login" className="font-bold text-accent hover:underline">Créer un compte</Link></p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Hébergement</h2>
        <p className="text-muted">Le site est hébergé par Vercel, le serveur de traitement par Render, et les comptes et données par Supabase. La voix de lecture est générée par des services de synthèse vocale tiers.</p>
      </section>
    </main>
  );
}
