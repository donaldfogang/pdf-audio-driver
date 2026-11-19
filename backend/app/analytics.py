"""Suivi d'activité.

Règle : le mode INVITÉ n'est jamais suivi (aucun événement, aucun identifiant). Seuls les utilisateurs
CONNECTÉS ont leur activité enregistrée : visites, documents chargés (nom, pages, taille, langue), pages
écoutées, fonctions utilisées. Jamais le contenu des documents, ni les recherches saisies, ni l'adresse IP.
Les événements sont écrits par lots dans Supabase (ou dans un fichier local en développement)."""
import json
import logging
import os
import queue
import re
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

import httpx

logger = logging.getLogger("uvicorn.error")

SERVER_TYPES = {"upload_ok", "upload_error", "tts", "search"}
CLIENT_TYPES = {
    "visit", "play_start", "page_done", "chapter_jump", "voice_on", "voice_cmd", "sleep_set",
    "rate_change", "theme_toggle", "view_toggle", "library_save", "library_resume",
    "signup", "login", "error_client",
}
FEATURE_TYPES = ["search", "chapter_jump", "voice_on", "voice_cmd", "sleep_set", "rate_change",
                 "view_toggle", "library_save", "library_resume", "theme_toggle"]
_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_KEY = re.compile(r"^[a-z_]{1,30}$")


# ---------------- contexte d'une requête ----------------
@dataclass(frozen=True)
class Ctx:
    user_id: str | None
    anon_id: str | None
    session_id: str | None
    country: str | None
    device: str
    browser: str


def parse_ua(ua: str) -> tuple[str, str]:
    device = "tablet" if re.search(r"iPad|Tablet", ua) else "mobile" if re.search(r"Mobi|Android|iPhone", ua) else "desktop"
    browser = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Firefox" if "Firefox/" in ua
               else "Chrome" if "Chrome/" in ua or "CriOS" in ua else "Safari" if "Safari/" in ua else "Autre")
    return device, browser


def ctx_from(headers: Mapping[str, str], user_id: str | None = None, session_id: str | None = None) -> Ctx | None:
    """None (= rien n'est enregistré) pour un invité ou si l'utilisateur a refusé le suivi."""
    h = {k.lower(): v for k, v in headers.items()}
    if not user_id or h.get("x-analytics", "").lower() == "off":
        return None
    sid = session_id or h.get("x-session-id")
    country = (h.get("cf-ipcountry") or h.get("x-vercel-ip-country") or "").upper()
    device, browser = parse_ua(h.get("user-agent", ""))
    return Ctx(
        user_id=user_id,
        anon_id=None,
        session_id=sid if sid and _ID.match(sid) else None,
        country=country if len(country) == 2 and country.isalpha() else None,
        device=device,
        browser=browser,
    )


def sanitize_props(props: Any) -> dict[str, Any]:
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in list(props.items())[:12]:
        if not isinstance(k, str) or not _KEY.match(k):
            continue
        if isinstance(v, bool):
            out[k] = v
        elif isinstance(v, (int, float)):
            out[k] = max(-1e9, min(1e9, v))
        elif isinstance(v, str):
            out[k] = v[:120]
    return out


# ---------------- stockage ----------------
class LocalStore:
    """Développement : fichier local (perdu à chaque redémarrage d'un serveur gratuit)."""
    kind = "local"

    def __init__(self, path: Path):
        self.path = path

    def add(self, rows: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).isoformat()
        with self.path.open("a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps({**r, "created_at": stamp}, ensure_ascii=False) + "\n")

    def fetch(self, since: datetime) -> list[dict]:
        if not self.path.exists():
            return []
        out = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if _dt(r["created_at"]) >= since:
                out.append(r)
        return out

    def users(self) -> dict | None:
        return None

    def fetch_user(self, user_id: str, limit: int = 300) -> list[dict]:
        rows = [r for r in self.fetch(datetime(2000, 1, 1, tzinfo=timezone.utc)) if r.get("user_id") == user_id]
        return rows[::-1][:limit]

    def library_of(self, user_id: str) -> list[dict]:
        return []

    def set_ban(self, user_id: str, banned: bool) -> None:
        raise NotImplementedError


def _is_banned(until: str | None, now: datetime) -> bool:
    try:
        return bool(until) and _dt(until) > now
    except ValueError:
        return False


class SupabaseStore:
    kind = "supabase"
    FIELDS = "created_at,type,user_id,anon_id,session_id,country,device,browser,props"

    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip("/")
        self.key = service_key

    def _headers(self) -> dict[str, str]:
        # Nouvelles clés (sb_secret_…) : en-tête « apikey » uniquement. Anciennes clés (JWT « eyJ… ») : aussi Authorization.
        h = {"apikey": self.key}
        if self.key.startswith("eyJ"):
            h["Authorization"] = f"Bearer {self.key}"
        return h

    def add(self, rows: list[dict]) -> None:
        r = httpx.post(f"{self.url}/rest/v1/events", json=rows, timeout=10,
                       headers={**self._headers(), "Content-Type": "application/json", "Prefer": "return=minimal"})
        r.raise_for_status()

    def fetch(self, since: datetime, max_rows: int = 20000) -> list[dict]:
        out: list[dict] = []
        stamp = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for offset in range(0, max_rows, 1000):
            r = httpx.get(f"{self.url}/rest/v1/events", timeout=20, headers=self._headers(), params={
                "select": self.FIELDS, "created_at": f"gte.{stamp}", "order": "created_at.desc",
                "limit": 1000, "offset": offset})
            r.raise_for_status()
            page = r.json()
            out.extend(page)
            if len(page) < 1000:
                break
        return out

    def users(self) -> dict | None:
        try:
            raw: list[dict] = []
            total = 0
            for page in range(1, 6):
                r = httpx.get(f"{self.url}/auth/v1/admin/users", params={"page": page, "per_page": 1000},
                              headers=self._headers(), timeout=15)
                r.raise_for_status()
                d = r.json()
                batch = d.get("users", [])
                raw.extend(batch)
                total = d.get("total") or total
                if len(batch) < 1000:
                    break
            now = datetime.now(timezone.utc)
            everyone = [{"id": u["id"], "email": u.get("email"), "created_at": u.get("created_at"),
                         "last_sign_in_at": u.get("last_sign_in_at"), "confirmed": bool(u.get("email_confirmed_at")),
                         "banned": _is_banned(u.get("banned_until"), now)} for u in raw]
            everyone.sort(key=lambda u: u["created_at"] or "", reverse=True)
            return {"total": total or len(everyone), "all": everyone}
        except Exception:
            logger.exception("Lecture des utilisateurs Supabase impossible")
            return None

    def fetch_user(self, user_id: str, limit: int = 300) -> list[dict]:
        r = httpx.get(f"{self.url}/rest/v1/events", timeout=20, headers=self._headers(), params={
            "select": self.FIELDS, "user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": limit})
        r.raise_for_status()
        return r.json()

    def library_of(self, user_id: str) -> list[dict]:
        try:
            r = httpx.get(f"{self.url}/rest/v1/library", timeout=15, headers=self._headers(), params={
                "select": "filename,page_count,last_page,size_bytes,updated_at,storage_path,lang",
                "user_id": f"eq.{user_id}", "order": "updated_at.desc", "limit": 100})
            r.raise_for_status()
            return r.json()
        except Exception:
            logger.exception("Lecture de la bibliothèque impossible")
            return []

    def set_ban(self, user_id: str, banned: bool) -> None:
        r = httpx.put(f"{self.url}/auth/v1/admin/users/{user_id}", timeout=15,
                      headers={**self._headers(), "Content-Type": "application/json"},
                      json={"ban_duration": "876000h" if banned else "none"})
        r.raise_for_status()


_store: LocalStore | SupabaseStore | None = None


def get_store() -> LocalStore | SupabaseStore:
    global _store
    if _store is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or "").strip()
        _store = SupabaseStore(url, key) if url and key else LocalStore(Path(os.getenv("DATA_DIR", "./data")) / "events.jsonl")
    return _store


def reset_store() -> None:
    global _store
    _store = None


# ---------------- enregistrement par lots (hors du chemin de la requête) ----------------
_q: "queue.Queue[dict]" = queue.Queue(maxsize=5000)
_thread: threading.Thread | None = None
_lock = threading.Lock()


def _write(batch: list[dict]) -> None:
    try:
        get_store().add(batch)
    except Exception:
        logger.exception("Écriture des événements impossible (%d perdus)", len(batch))


def _worker() -> None:
    while True:
        batch = [_q.get()]
        try:
            while len(batch) < 100:
                batch.append(_q.get_nowait())
        except queue.Empty:
            pass
        _write(batch)
        time.sleep(1)  # laisse les événements suivants s'accumuler


def flush() -> None:
    """Écrit immédiatement les événements en attente (tableau de bord, tests)."""
    batch = []
    try:
        while True:
            batch.append(_q.get_nowait())
    except queue.Empty:
        pass
    if batch:
        _write(batch)


def record(ctx: Ctx | None, type_: str, props: Any = None) -> None:
    if ctx is None or (type_ not in CLIENT_TYPES and type_ not in SERVER_TYPES):
        return
    global _thread
    row = {"type": type_, "user_id": ctx.user_id, "anon_id": ctx.anon_id, "session_id": ctx.session_id,
           "country": ctx.country, "device": ctx.device, "browser": ctx.browser, "props": sanitize_props(props)}
    try:
        _q.put_nowait(row)
    except queue.Full:
        return
    with _lock:
        if _thread is None or not _thread.is_alive():
            _thread = threading.Thread(target=_worker, daemon=True, name="events-writer")
            _thread.start()


# ---------------- statistiques pour le tableau de bord ----------------
def _dt(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _num(v: Any) -> float:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0


def _top(c: Counter, n: int = 10) -> list[dict]:
    return [{"name": k, "count": v} for k, v in c.most_common(n)]


def _label(by_id: dict[str, dict], uid: str) -> str:
    return (by_id.get(uid) or {}).get("email") or f"compte {uid[:6]}"


def _info(props: dict) -> str:
    return ", ".join(f"{a}={b}" for a, b in list(props.items())[:4])


def people_list(rows: list[dict], users: dict | None) -> list[dict]:
    """Un enregistrement par compte : profil + activité sur la période."""
    agg: dict[str, dict] = defaultdict(lambda: {"uploads": 0, "docs": set(), "plays": 0, "pages": 0, "sec": 0.0, "last": None})
    for r in rows:
        uid = r.get("user_id")
        if not uid:
            continue
        a, t, props, ts = agg[uid], r["type"], r.get("props") or {}, _dt(r["created_at"])
        if t == "upload_ok":
            a["uploads"] += 1
            if props.get("filename"):
                a["docs"].add(props["filename"])
        elif t == "play_start":
            a["plays"] += 1
        elif t == "page_done":
            a["pages"] += 1; a["sec"] += _num(props.get("sec"))
        a["last"] = ts if a["last"] is None or ts > a["last"] else a["last"]

    def build(u: dict) -> dict:
        a = agg.get(u["id"])
        return {**u, "uploads": a["uploads"] if a else 0, "docs": len(a["docs"]) if a else 0, "plays": a["plays"] if a else 0,
                "pages": a["pages"] if a else 0, "minutes": round(a["sec"] / 60, 1) if a else 0,
                "last_seen": a["last"].isoformat() if a and a["last"] else None}

    known = (users or {}).get("all", [])
    out = [build(u) for u in known]
    ids = {u["id"] for u in known}
    out += [build({"id": uid, "email": None, "created_at": None, "last_sign_in_at": None, "confirmed": True, "banned": False})
            for uid in agg if uid not in ids]
    out.sort(key=lambda p: (p["last_seen"] or p["last_sign_in_at"] or p["created_at"] or ""), reverse=True)
    return out[:300]


def documents_list(rows: list[dict], users: dict | None, limit: int | None = 40) -> list[dict]:
    by_id = {u["id"]: u for u in (users or {}).get("all", [])}
    docs = []
    for r in sorted(rows, key=lambda r: _dt(r["created_at"]), reverse=True):
        if r["type"] != "upload_ok" or not r.get("user_id"):
            continue
        p = r.get("props") or {}
        docs.append({"time": _dt(r["created_at"]).isoformat(), "user_id": r["user_id"], "who": _label(by_id, r["user_id"]),
                     "filename": str(p.get("filename") or "(nom non enregistré)"), "pages": int(_num(p.get("pages"))),
                     "size_kb": int(_num(p.get("size_kb"))), "lang": str(p.get("lang") or "")})
    return docs[:limit] if limit else docs


def user_detail(user_id: str, profile: dict | None, events: list[dict], library: list[dict]) -> dict:
    """Fiche d'un compte : documents chargés, bibliothèque, chronologie."""
    docs: dict[str, dict] = {}
    totals = {"uploads": 0, "plays": 0, "pages": 0, "sec": 0.0}
    first = last = None
    timeline = []
    for r in sorted(events, key=lambda r: _dt(r["created_at"]), reverse=True):
        ts, t, props = _dt(r["created_at"]), r["type"], r.get("props") or {}
        first = ts if first is None or ts < first else first
        last = ts if last is None or ts > last else last
        if t == "upload_ok":
            totals["uploads"] += 1
            d = docs.setdefault(str(props.get("filename") or "(nom non enregistré)"),
                                {"pages": int(_num(props.get("pages"))), "size_kb": int(_num(props.get("size_kb"))),
                                 "lang": str(props.get("lang") or ""), "times": 0, "last": ts.isoformat()})
            d["times"] += 1
        elif t == "play_start":
            totals["plays"] += 1
        elif t == "page_done":
            totals["pages"] += 1; totals["sec"] += _num(props.get("sec"))
        if t != "tts" and len(timeline) < 100:
            timeline.append({"time": ts.isoformat(), "type": t, "info": _info(props)})
    return {
        "user": profile,
        "totals": {"uploads": totals["uploads"], "docs": len(docs), "plays": totals["plays"], "pages": totals["pages"],
                   "minutes": round(totals["sec"] / 60, 1),
                   "first_seen": first.isoformat() if first else None, "last_seen": last.isoformat() if last else None},
        "documents": [{"filename": k, **v} for k, v in docs.items()],
        "library": library,
        "events": timeline,
    }


def export_rows(kind: str, rows: list[dict], users: dict | None) -> tuple[list[str], list[list]]:
    by_id = {u["id"]: u for u in (users or {}).get("all", [])}
    if kind == "users":
        head = ["E-mail", "Inscrit le", "Dernière connexion", "Dernière activité", "Documents", "Envois", "Lectures", "Pages écoutées", "Minutes d'écoute", "Suspendu"]
        return head, [[p["email"] or "", p["created_at"] or "", p["last_sign_in_at"] or "", p["last_seen"] or "", p["docs"], p["uploads"],
                       p["plays"], p["pages"], p["minutes"], "oui" if p["banned"] else "non"] for p in people_list(rows, users)]
    if kind == "documents":
        head = ["Date", "Utilisateur", "Fichier", "Pages", "Taille (Ko)", "Langue"]
        return head, [[d["time"], d["who"], d["filename"], d["pages"], d["size_kb"], d["lang"]] for d in documents_list(rows, users, None)]
    head = ["Date", "Type", "Utilisateur", "Pays", "Appareil", "Détail"]
    return head, [[_dt(r["created_at"]).isoformat(), r["type"], _label(by_id, r["user_id"]) if r.get("user_id") else "",
                   r.get("country") or "", r.get("device") or "", _info(r.get("props") or {})]
                  for r in sorted(rows, key=lambda r: _dt(r["created_at"]), reverse=True)]


def compute_stats(rows: list[dict], days: int, now: datetime | None = None, users: dict | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    first = (now - timedelta(days=days - 1)).date()
    keys = [(first + timedelta(days=i)).isoformat() for i in range(days)]
    daily = {k: {"visitors": set(), "uploads": 0, "plays": 0, "pages": 0, "signups": 0} for k in keys}
    users_all = (users or {}).get("all", [])
    created = 0
    for u in users_all:
        if u.get("created_at"):
            d = _dt(u["created_at"]).date().isoformat()
            if d in daily:
                daily[d]["signups"] += 1; created += 1

    visitors: set[str] = set(); sessions: set[str] = set(); visit_days: dict[str, set[str]] = defaultdict(set)
    step_upload: set[str] = set(); step_play: set[str] = set(); pages_by: Counter = Counter()
    users_active: set[str] = set()
    k: Counter = Counter()
    geo: dict[str, set[str]] = defaultdict(set); dev: dict[str, set[str]] = defaultdict(set)
    brw: dict[str, set[str]] = defaultdict(set); src: dict[str, set[str]] = defaultdict(set)
    langs: Counter = Counter(); feats: Counter = Counter(); upload_fail: Counter = Counter()
    hours = [0] * 24
    pages_sum = size_sum = ndocs = 0.0
    listening_sec = 0.0
    tts_ms: list[float] = []; engines: Counter = Counter(); tts_total = tts_failed = 0
    errors: list[dict] = []; recent: list[dict] = []
    in_period: list[dict] = []
    by_id = {u["id"]: u for u in users_all}

    parsed = sorted(((_dt(r["created_at"]), r) for r in rows), key=lambda x: x[0])
    for ts, r in parsed:
        day = ts.date().isoformat()
        if day not in daily:
            continue
        in_period.append(r)
        t = r["type"]; props = r.get("props") or {}
        aid = r.get("user_id") or r.get("anon_id") or ""
        country = r.get("country") or "Inconnu"
        if r.get("user_id"):
            users_active.add(r["user_id"])

        if t == "visit" and aid:
            visitors.add(aid); visit_days[aid].add(day); daily[day]["visitors"].add(aid)
            sessions.add(r.get("session_id") or f"{aid}:{day}")
            geo[country].add(aid); dev[r.get("device") or "?"].add(aid); brw[r.get("browser") or "?"].add(aid)
            src[str(props.get("utm") or props.get("ref") or "direct")].add(aid)
        elif t == "upload_ok":
            k["uploads_ok"] += 1; daily[day]["uploads"] += 1
            if aid: step_upload.add(aid)
            langs[str(props.get("lang") or "?")] += 1
            pages_sum += _num(props.get("pages")); size_sum += _num(props.get("size_kb")); ndocs += 1
        elif t == "upload_error":
            k["uploads_failed"] += 1; upload_fail[str(props.get("reason") or "inconnu")] += 1
            errors.append({"time": ts.isoformat(), "type": t, "detail": str(props.get("reason") or ""), "country": country})
        elif t == "play_start":
            k["plays"] += 1; daily[day]["plays"] += 1; hours[ts.hour] += 1
            if aid: step_play.add(aid)
        elif t == "page_done":
            k["pages"] += 1; daily[day]["pages"] += 1; listening_sec += _num(props.get("sec"))
            if aid: pages_by[aid] += 1
        elif t == "signup":
            k["signups"] += 1
        elif t == "login":
            k["logins"] += 1
        elif t == "tts":
            tts_total += 1
            engine = str(props.get("engine") or "?")
            if props.get("ok") is False or engine == "failed":
                tts_failed += 1
                errors.append({"time": ts.isoformat(), "type": "tts", "detail": str(props.get("detail") or "échec de la voix"), "country": country})
            else:
                engines[engine] += 1; tts_ms.append(_num(props.get("ms")))
        elif t == "error_client":
            errors.append({"time": ts.isoformat(), "type": t, "detail": str(props.get("message") or ""), "country": country})

        if t in FEATURE_TYPES:
            feats[t] += 1
        if t != "tts":
            who = _label(by_id, r["user_id"]) if r.get("user_id") else "—"
            recent.append({"time": ts.isoformat(), "type": t, "who": who, "country": country,
                           "device": r.get("device") or "", "info": _info(props)})

    tts_ms.sort()
    engaged = {a for a, c in pages_by.items() if c >= 3}
    returning = sum(1 for d in visit_days.values() if len(d) >= 2)
    first_step = len(visitors) or 1
    funnel = [
        {"step": "Connectés actifs", "count": len(visitors)},
        {"step": "Document chargé", "count": len(step_upload)},
        {"step": "Lecture lancée", "count": len(step_play)},
        {"step": "3 pages écoutées ou plus", "count": len(engaged)},
    ]
    for f in funnel:
        f["pct"] = round(100 * f["count"] / first_step)

    def uniq(m: dict[str, set[str]]) -> list[dict]:
        return _top(Counter({a: len(b) for a, b in m.items()}))

    return {
        "period_days": days,
        "generated_at": now.isoformat(),
        "kpis": {
            "visitors": len(visitors), "returning": returning, "sessions": len(sessions),
            "uploads_ok": k["uploads_ok"], "uploads_failed": k["uploads_failed"],
            "plays": k["plays"], "listeners": len(step_play), "pages_listened": k["pages"],
            "listening_minutes": round(listening_sec / 60, 1),
            "signups": created if users_all else k["signups"], "logins": k["logins"], "active_users": len(users_active),
        },
        "daily": [{"date": d, "visitors": len(v["visitors"]), "uploads": v["uploads"], "plays": v["plays"],
                   "pages": v["pages"], "signups": v["signups"]} for d, v in daily.items()],
        "funnel": funnel,
        "countries": uniq(geo), "devices": uniq(dev), "browsers": uniq(brw), "sources": uniq(src),
        "languages": _top(langs), "features": _top(feats, 12), "hours": hours,
        "docs": {"total": int(ndocs), "avg_pages": round(pages_sum / ndocs, 1) if ndocs else 0,
                 "avg_size_kb": round(size_sum / ndocs) if ndocs else 0},
        "tts": {"total": tts_total, "failed": tts_failed,
                "avg_ms": round(sum(tts_ms) / len(tts_ms)) if tts_ms else 0,
                "p95_ms": round(tts_ms[int(0.95 * (len(tts_ms) - 1))]) if tts_ms else 0,
                "engines": _top(engines)},
        "upload_failures": _top(upload_fail, 6),
        "errors": errors[-15:][::-1],
        "recent": recent[-40:][::-1],
        "people": people_list(in_period, users),
        "documents": documents_list(in_period, users, 40),
    }
