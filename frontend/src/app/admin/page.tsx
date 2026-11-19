"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminExport, adminStats, adminSuspend, adminUser, ApiError,
  type AdminPerson, type AdminStats, type AdminUserDetail, type Rank,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const FEATURES: Record<string, string> = {
  search: "Recherche dans le document", chapter_jump: "Saut de chapitre", voice_on: "Mains libres activé",
  voice_cmd: "Commandes vocales", sleep_set: "Minuteur de veille", rate_change: "Changement de vitesse",
  view_toggle: "Page d’origine (mobile)", library_save: "Ajout à la bibliothèque",
  library_resume: "Reprise depuis la bibliothèque", theme_toggle: "Changement de thème",
};
const EVENTS: Record<string, string> = {
  visit: "Visite", upload_ok: "Document chargé", upload_error: "Échec de chargement", play_start: "Lecture lancée",
  page_done: "Page écoutée", search: "Recherche", signup: "Inscription", login: "Connexion", error_client: "Erreur navigateur",
  tts: "Voix", ...FEATURES,
};
const REASONS: Record<string, string> = {
  rate_limit: "Limite atteinte", too_large: "Fichier trop gros", not_pdf: "Pas un PDF", unreadable: "PDF illisible", no_text: "Aucun texte (scan)",
};
const METRICS = [["visitors", "Utilisateurs actifs"], ["uploads", "Documents"], ["plays", "Lectures"], ["pages", "Pages écoutées"], ["signups", "Inscriptions"]] as const;
const TABS = [["overview", "Vue d’ensemble"], ["users", "Utilisateurs"], ["documents", "Documents"], ["activity", "Activité"]] as const;
type Tab = (typeof TABS)[number][0];

const n = (v: number) => v.toLocaleString("fr-FR");
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

function Card({ title, children, action, className = "" }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-4 rounded-3xl bg-surface p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Ranks({ items, label = (s: string) => s, empty = "Aucune donnée" }: { items: Rank[]; label?: (s: string) => string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name} className="space-y-1">
          <div className="flex justify-between gap-3 text-sm"><span className="truncate font-semibold">{label(i.name)}</span><span className="tabular-nums text-muted">{n(i.count)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${(i.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows, onRow }: { head: string[]; rows: (string | number)[][]; onRow?: (i: number) => void }) {
  if (!rows.length) return <p className="text-sm text-muted">Aucune donnée pour le moment.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead><tr className="text-muted">{head.map((h) => <th key={h} className="pb-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={onRow ? () => onRow(i) : undefined} className={`border-t border-line ${onRow ? "cursor-pointer hover:bg-raised" : ""}`}>
              {r.map((c, j) => <td key={j} className="max-w-[18rem] truncate py-2.5 pr-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const btn = "h-10 rounded-full px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-accent";

function ExportButtons({ days, kinds }: { days: number; kinds: ("users" | "documents" | "events")[] }) {
  const [busy, setBusy] = useState(false);
  const labels = { users: "Exporter (CSV)", documents: "Exporter (CSV)", events: "Exporter l’activité (CSV)" };
  return (
    <div className="flex gap-2">
      {kinds.map((k) => (
        <button key={k} disabled={busy} className={`${btn} bg-raised hover:bg-line disabled:opacity-50`}
          onClick={async () => { setBusy(true); try { await adminExport(k, days); } catch (e) { alert(e instanceof Error ? e.message : "Export impossible"); } finally { setBusy(false); } }}>
          {labels[k]}
        </button>
      ))}
    </div>
  );
}

// ---------------- fiche d'un utilisateur ----------------
function UserModal({ person, onClose, onChanged }: { person: AdminPerson; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banned, setBanned] = useState(person.banned);

  useEffect(() => {
    let alive = true;
    adminUser(person.id).then((r) => { if (alive) setD(r); }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Erreur"); });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { alive = false; window.removeEventListener("keydown", esc); };
  }, [person.id, onClose]);

  async function toggleBan() {
    const next = !banned;
    if (!confirm(next ? `Suspendre le compte ${person.email} ? Il ne pourra plus se connecter.` : `Réactiver le compte ${person.email} ?`)) return;
    setBusy(true); setErr(null);
    try { await adminSuspend(person.id, next); setBanned(next); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Action impossible"); }
    finally { setBusy(false); }
  }

  const t = d?.totals;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Fiche utilisateur" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-t-[2rem] bg-bg p-6 sm:rounded-[2rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-extrabold">{person.email ?? `Compte ${person.id.slice(0, 6)}`}</h2>
            <p className="text-sm text-muted">Inscrit le {day(person.created_at)} · dernière connexion {when(person.last_sign_in_at)} · {person.confirmed ? "e-mail confirmé" : "e-mail non confirmé"}</p>
            {banned && <p className="mt-1 inline-block rounded-full bg-red-500/15 px-3 py-1 text-sm font-bold text-red-500">Compte suspendu</p>}
          </div>
          <button onClick={onClose} className={`${btn} shrink-0 bg-surface hover:bg-raised`}>Fermer</button>
        </div>

        {err && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500">{err}</p>}
        {!d && !err && <p className="text-muted">Chargement…</p>}

        {d && t && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Documents" value={n(t.docs)} hint={`${n(t.uploads)} envoi(s)`} />
              <Kpi label="Lectures" value={n(t.plays)} />
              <Kpi label="Pages écoutées" value={n(t.pages)} />
              <Kpi label="Écoute" value={`${n(Math.round(t.minutes))} min`} />
            </div>
            <Card title="Documents chargés">
              <Table head={["Fichier", "Pages", "Taille", "Langue", "Fois", "Dernier envoi"]}
                rows={d.documents.map((x) => [x.filename, x.pages, `${n(x.size_kb)} Ko`, x.lang, x.times, when(x.last)])} />
            </Card>
            <Card title="Bibliothèque (fichiers conservés)">
              <Table head={["Fichier", "Progression", "Taille", "Mis à jour", "Conservé"]}
                rows={d.library.map((x) => [x.filename, `p. ${x.last_page} / ${x.page_count}`, `${n(Math.round(x.size_bytes / 1024))} Ko`, when(x.updated_at), x.storage_path ? "oui" : "non"])} />
              <p className="text-xs text-muted">Seuls les noms et la progression sont visibles ici : le contenu des fichiers reste privé.</p>
            </Card>
            <Card title="Chronologie">
              <Table head={["Quand", "Action", "Détail"]} rows={d.events.slice(0, 50).map((e) => [when(e.time), EVENTS[e.type] ?? e.type, e.info])} />
            </Card>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button onClick={toggleBan} disabled={busy}
                className={`${btn} ${banned ? "bg-accent text-accent-ink" : "bg-red-500/15 text-red-500 hover:bg-red-500/25"} disabled:opacity-50`}>
                {busy ? "…" : banned ? "Réactiver le compte" : "Suspendre le compte"}
              </button>
              <p className="text-xs text-muted">Un compte suspendu ne peut plus se connecter ni utiliser le service avec son compte.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- page ----------------
export default function AdminPage() {
  const { configured, ready, user } = useAuth();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<(typeof METRICS)[number][0]>("visitors");
  const [data, setData] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<AdminPerson | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminStats(days)); setErr(null); }
    catch (e) { setErr({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : "Erreur" }); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user, load]);

  const people = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => !q || (p.email ?? "").toLowerCase().includes(q));
  }, [data, filter]);
  const closeModal = useCallback(() => setSelected(null), []);

  const shell = (children: React.ReactNode) => <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-10">{children}</main>;

  if (!configured) return shell(<><h1 className="font-display text-3xl font-extrabold">Administration</h1><p className="text-muted">Les comptes ne sont pas encore configurés (Supabase). Suivez le guide <b>docs/SETUP.md</b> : le tableau de bord s’activera ensuite.</p></>);
  if (!ready) return shell(<p className="text-muted">Chargement…</p>);
  if (!user) return shell(<><h1 className="font-display text-3xl font-extrabold">Administration</h1><p className="text-muted">Connectez-vous avec le compte administrateur.</p><Link href="/login" className="inline-block rounded-full bg-accent px-6 py-3 font-bold text-accent-ink">Se connecter</Link></>);
  if (err?.status === 403) return shell(<><h1 className="font-display text-3xl font-extrabold">Accès refusé</h1><p className="text-muted">Cette page est réservée à l’administrateur du site.</p><Link href="/" className="font-bold text-accent hover:underline">Retour à l’accueil</Link></>);
  if (!data) return shell(err ? <><p role="alert" className="text-red-500">{err.message}</p><button onClick={load} className="rounded-full bg-accent px-6 py-3 font-bold text-accent-ink">Réessayer</button></> : <p className="text-muted">Chargement des statistiques…</p>);

  const k = data.kpis;
  const maxDay = Math.max(1, ...data.daily.map((d) => d[metric]));
  const maxHour = Math.max(1, ...data.hours);
  const ttsFail = data.tts.total ? Math.round((100 * data.tts.failed) / data.tts.total) : 0;
  const returnPct = k.visitors ? Math.round((100 * k.returning) / k.visitors) : 0;

  return shell(
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted">Mis à jour à {new Date(data.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · actualisation automatique chaque minute</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`${btn} ${days === d ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-ink"}`}>{d} j</button>)}
          <button onClick={load} disabled={loading} className={`${btn} bg-surface hover:bg-raised disabled:opacity-50`}>{loading ? "…" : "Actualiser"}</button>
        </div>
      </div>

      <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">Les <b className="text-ink">invités ne sont pas suivis</b> : ce tableau ne montre que l’activité des comptes connectés.</p>
      {err && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 font-semibold text-red-500">{err.message}</p>}
      {data.system.store === "local" && (
        <p role="status" className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-600 dark:text-amber-400">
          Stockage local temporaire : les statistiques seront perdues au prochain redémarrage du serveur. Configurez Supabase (clé secrète) pour les conserver.
        </p>
      )}

      <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`${btn} ${tab === key ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Utilisateurs actifs" value={n(k.visitors)} hint={`${n(k.sessions)} sessions · ${returnPct} % reviennent`} />
            <Kpi label="Comptes inscrits" value={data.users ? n(data.users.total) : "—"} hint={`${n(k.signups)} nouveau(x) sur la période`} />
            <Kpi label="Documents chargés" value={n(k.uploads_ok)} hint={`${n(k.uploads_failed)} échec(s) · moy. ${data.docs.avg_pages} pages`} />
            <Kpi label="Lectures lancées" value={n(k.plays)} hint={`${n(k.listeners)} auditeurs`} />
            <Kpi label="Pages écoutées" value={n(k.pages_listened)} hint={`${n(Math.round(k.listening_minutes))} min d’écoute`} />
            <Kpi label="Connexions" value={n(k.logins)} hint={`${n(k.active_users)} compte(s) actif(s)`} />
            <Kpi label="Échecs de la voix" value={`${ttsFail} %`} hint={`${n(data.tts.total)} générations · ${n(data.tts.avg_ms)} ms`} />
            <Kpi label="Taille moyenne d’un PDF" value={`${n(data.docs.avg_size_kb)} Ko`} hint={`${n(data.system.documents_on_disk)} document(s) sur le serveur`} />
          </div>

          <Card title="Activité par jour">
            <div className="flex flex-wrap gap-2">
              {METRICS.map(([key, label]) => <button key={key} onClick={() => setMetric(key)} className={`h-9 rounded-full px-4 text-sm font-bold ${metric === key ? "bg-accent text-accent-ink" : "bg-raised text-muted hover:text-ink"}`}>{label}</button>)}
            </div>
            <div className="flex h-40 items-end gap-px" role="img" aria-label="Graphique de l’activité par jour">
              {data.daily.map((d) => <div key={d.date} title={`${d.date} : ${n(d[metric])}`} className="flex-1 rounded-t bg-accent/80 hover:bg-accent" style={{ height: `${Math.max(2, (d[metric] / maxDay) * 100)}%` }} />)}
            </div>
            <div className="flex justify-between text-xs text-muted"><span>{data.daily[0]?.date}</span><span>Max : {n(maxDay)}</span><span>{data.daily[data.daily.length - 1]?.date}</span></div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Parcours des utilisateurs">
              <ul className="space-y-3">
                {data.funnel.map((f) => (
                  <li key={f.step} className="space-y-1">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{f.step}</span><span className="tabular-nums text-muted">{n(f.count)} · {f.pct} %</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${f.pct}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Fonctionnalités utilisées"><Ranks items={data.features} label={(s) => FEATURES[s] ?? s} /></Card>
            <Card title="Pays"><Ranks items={data.countries} empty="Pays non disponible" /></Card>
            <Card title="Sources de trafic"><Ranks items={data.sources} label={(s) => (s === "direct" ? "Accès direct" : s)} /></Card>
            <Card title="Appareils"><Ranks items={data.devices} label={(s) => ({ mobile: "Téléphone", desktop: "Ordinateur", tablet: "Tablette" } as Record<string, string>)[s] ?? s} /></Card>
            <Card title="Navigateurs"><Ranks items={data.browsers} /></Card>
            <Card title="Langues des documents"><Ranks items={data.languages} /></Card>
            <Card title="Échecs de chargement"><Ranks items={data.upload_failures} label={(s) => REASONS[s] ?? s} empty="Aucun échec 🎉" /></Card>
          </div>

          <Card title="Voix de synthèse">
            <div className="grid gap-6 sm:grid-cols-2">
              <Ranks items={data.tts.engines} empty="Aucune génération sur la période" />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted">Temps moyen</dt><dd className="font-display text-2xl font-bold tabular-nums">{n(data.tts.avg_ms)} ms</dd></div>
                <div><dt className="text-muted">95e centile</dt><dd className="font-display text-2xl font-bold tabular-nums">{n(data.tts.p95_ms)} ms</dd></div>
                <div><dt className="text-muted">Générations</dt><dd className="font-display text-2xl font-bold tabular-nums">{n(data.tts.total)}</dd></div>
                <div><dt className="text-muted">Échecs</dt><dd className="font-display text-2xl font-bold tabular-nums">{n(data.tts.failed)}</dd></div>
              </dl>
            </div>
          </Card>

          <Card title="Heures d’écoute (UTC)">
            <div className="flex h-28 items-end gap-1" role="img" aria-label="Lectures lancées par heure">
              {data.hours.map((c, h) => <div key={h} title={`${h} h : ${c}`} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(3, (c / maxHour) * 100)}%` }} />)}
            </div>
            <div className="flex justify-between text-xs text-muted"><span>0 h</span><span>12 h</span><span>23 h</span></div>
          </Card>

          <Card title="Erreurs récentes">
            <Table head={["Quand", "Type", "Détail", "Pays"]} rows={data.errors.map((e) => [when(e.time), EVENTS[e.type] ?? e.type, REASONS[e.detail] ?? e.detail, e.country])} />
          </Card>
        </>
      )}

      {tab === "users" && (
        <Card title={`Utilisateurs${data.users ? ` (${n(data.users.total)})` : ""}`} action={<ExportButtons days={days} kinds={["users"]} />}>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer par adresse e-mail"
            className="h-11 w-full rounded-xl bg-raised px-4 outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
          <p className="text-xs text-muted">Cliquez sur une ligne pour voir la fiche : documents chargés, bibliothèque, chronologie, suspension.</p>
          <Table head={["E-mail", "Inscrit le", "Dernière activité", "Docs", "Pages", "Minutes", "État"]}
            rows={people.map((p) => [p.email ?? `compte ${p.id.slice(0, 6)}`, day(p.created_at), when(p.last_seen ?? p.last_sign_in_at), p.docs, p.pages, p.minutes, p.banned ? "suspendu" : p.confirmed ? "actif" : "non confirmé"])}
            onRow={(i) => setSelected(people[i])} />
        </Card>
      )}

      {tab === "documents" && (
        <Card title="Documents chargés par les comptes" action={<ExportButtons days={days} kinds={["documents"]} />}>
          <Table head={["Quand", "Utilisateur", "Fichier", "Pages", "Taille", "Langue"]}
            rows={data.documents.map((d) => [when(d.time), d.who, d.filename, d.pages, `${n(d.size_kb)} Ko`, d.lang])} />
          <p className="text-xs text-muted">Les 40 derniers envois. L’export CSV contient tous les envois de la période.</p>
        </Card>
      )}

      {tab === "activity" && (
        <Card title="Activité en direct" action={<ExportButtons days={days} kinds={["events"]} />}>
          <Table head={["Quand", "Action", "Utilisateur", "Pays", "Appareil", "Détail"]}
            rows={data.recent.map((r) => [when(r.time), EVENTS[r.type] ?? r.type, r.who, r.country, r.device, r.info])} />
        </Card>
      )}

      {selected && <UserModal person={selected} onClose={closeModal} onChanged={load} />}
    </>,
  );
}
