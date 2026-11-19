import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["SUPABASE_URL"] = ""          # tests : stockage local
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["ADMIN_EMAILS"] = "boss@example.com"

import pytest
from fastapi.testclient import TestClient

from app import analytics, auth, main, ratelimit

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clean_events():
    """Chaque test repart d'un fichier d'événements vide."""
    analytics.reset_store()
    analytics.flush()
    analytics.get_store().path.unlink(missing_ok=True)
    yield
NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
U1, U2 = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
ADMIN = auth.User(id="99999999-9999-9999-9999-999999999999", email="Boss@Example.com", confirmed=True)
USERS = {"total": 2, "all": [
    {"id": U1, "email": "alice@x.com", "created_at": (NOW - timedelta(days=2)).isoformat(), "last_sign_in_at": NOW.isoformat(), "confirmed": True, "banned": False},
    {"id": U2, "email": "bob@x.com", "created_at": (NOW - timedelta(days=60)).isoformat(), "last_sign_in_at": None, "confirmed": True, "banned": False}]}


def row(type_, minutes_ago=0, user=U1, **kw):
    ts = (NOW - timedelta(minutes=minutes_ago)).isoformat()
    return {"created_at": ts, "type": type_, "user_id": user, "anon_id": None, "session_id": kw.pop("session_id", "sess00001"),
            "country": kw.pop("country", "CM"), "device": kw.pop("device", "mobile"), "browser": kw.pop("browser", "Chrome"), "props": kw}


def as_user(monkeypatch, who):
    tokens = {"tok-admin": ADMIN, "tok-alice": auth.User(id=U1, email="alice@x.com", confirmed=True)}
    monkeypatch.setattr(auth, "verify_token", lambda t: tokens.get(t))
    return {"Authorization": f"Bearer {who}"}


def test_sanitize_props():
    p = analytics.sanitize_props({"ok": True, "n": 5, "s": "x" * 500, "Bad Key": 1, "obj": {"a": 1}, "lst": [1]})
    assert p == {"ok": True, "n": 5, "s": "x" * 120}


def test_guests_are_never_tracked():
    assert analytics.ctx_from({"user-agent": "Mozilla/5.0"}, None) is None                 # invité : aucun suivi
    assert analytics.ctx_from({"X-Analytics": "off"}, U1) is None                          # compte ayant refusé le suivi
    c = analytics.ctx_from({"cf-ipcountry": "cm", "user-agent": "Mozilla/5.0 (iPhone) Safari/604"}, U1)
    assert c.user_id == U1 and c.anon_id is None and c.country == "CM" and c.device == "mobile" and c.browser == "Safari"


def test_compute_stats_and_people():
    rows = [
        row("visit", 5, ref="google.com"), row("visit", 60 * 24 * 2),                       # alice revient 2 jours
        row("visit", 10, user=U2, country="FR", device="desktop", browser="Edge"),
        row("upload_ok", 4, filename="contrat.pdf", pages=10, size_kb=200, lang="fr"),
        row("upload_error", 3, user=U2, reason="not_pdf"),
        row("play_start", 3), row("page_done", 2, sec=30), row("page_done", 2, sec=30), row("page_done", 1, sec=60),
        row("search", 1), row("voice_on", 1),
        row("tts", 3, engine="edge", ok=True, ms=800), row("tts", 2, engine="failed", ok=False, detail="boom"),
        row("visit", 60 * 24 * 40),                                                         # hors période
    ]
    s = analytics.compute_stats(rows, 30, NOW, USERS)
    k = s["kpis"]
    assert (k["visitors"], k["returning"], k["uploads_ok"], k["uploads_failed"], k["plays"], k["pages_listened"]) == (2, 1, 1, 1, 1, 3)
    assert k["listening_minutes"] == 2.0 and k["signups"] == 1          # alice inscrite dans la période, bob non
    assert [f["count"] for f in s["funnel"]] == [2, 1, 1, 1]
    assert s["tts"]["failed"] == 1 and s["tts"]["engines"] == [{"name": "edge", "count": 1}]
    assert s["documents"][0]["filename"] == "contrat.pdf" and s["documents"][0]["who"] == "alice@x.com"
    alice = next(p for p in s["people"] if p["email"] == "alice@x.com")
    assert (alice["docs"], alice["uploads"], alice["plays"], alice["pages"], alice["minutes"]) == (1, 1, 1, 3, 2.0)
    assert len(s["daily"]) == 30 and sum(d["signups"] for d in s["daily"]) == 1


def test_user_detail():
    ev = [row("upload_ok", 9, filename="a.pdf", pages=5, size_kb=10, lang="fr"), row("upload_ok", 8, filename="a.pdf", pages=5, size_kb=10, lang="fr"),
          row("page_done", 7, sec=60), row("play_start", 6)]
    d = analytics.user_detail(U1, USERS["all"][0], ev, [{"filename": "a.pdf"}])
    assert d["totals"]["uploads"] == 2 and d["totals"]["docs"] == 1 and d["documents"][0]["times"] == 2 and d["totals"]["minutes"] == 1.0
    assert d["events"][0]["type"] == "play_start" and d["library"] == [{"filename": "a.pdf"}]


def test_ratelimit():
    assert [ratelimit.allow("k1", 2, 60) for _ in range(3)] == [True, True, False]


def test_auth_admin_logic(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co"); monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_k")
    auth.clear_cache()

    class R:
        status_code = 200
        def __init__(self, d): self._d = d
        def json(self): return self._d

    users = {"tok-admin": {"id": ADMIN.id, "email": "Boss@Example.com", "email_confirmed_at": "2026-01-01"},
             "tok-fake": {"id": "22222222-2222-2222-2222-222222222223", "email": "boss@example.com"},   # e-mail NON confirmé
             "tok-user": {"id": U1, "email": "a@b.c", "email_confirmed_at": "2026-01-01"}}
    monkeypatch.setattr(auth.httpx, "get", lambda url, headers, timeout: R(users[headers["Authorization"][7:]]) if headers["Authorization"][7:] in users else type("B", (), {"status_code": 401, "json": lambda s: {}})())
    assert auth.verify_token("tok-admin").is_admin
    assert not auth.verify_token("tok-fake").is_admin
    assert not auth.verify_token("tok-user").is_admin
    assert auth.verify_token("inconnu") is None


def test_guest_events_dropped_user_events_kept(monkeypatch):
    analytics.reset_store()
    body = {"session_id": "session001", "events": [{"type": "visit", "props": {"path": "/"}}, {"type": "upload_ok", "props": {"pages": 999}}]}
    assert client.post("/api/events", json=body).status_code == 204          # invité
    analytics.flush()
    assert analytics.get_store().fetch(NOW - timedelta(days=3650)) == []
    h = as_user(monkeypatch, "tok-alice")
    assert client.post("/api/events", json=body, headers=h).status_code == 204
    analytics.flush()
    rows = analytics.get_store().fetch(NOW - timedelta(days=3650))
    assert [r["type"] for r in rows] == ["visit"] and rows[0]["user_id"] == U1   # « upload_ok » falsifié rejeté
    assert client.post("/api/events", json=body, headers={**h, "X-Analytics": "off"}).status_code == 204
    analytics.flush()
    assert len(analytics.get_store().fetch(NOW - timedelta(days=3650))) == 1      # refus de suivi respecté


def test_admin_endpoints(monkeypatch):
    analytics.reset_store()
    store = analytics.get_store()
    store.add([row("upload_ok", 3, filename="=cmd|calc.pdf", pages=4, size_kb=9, lang="fr"), row("visit", 2)])
    assert client.get("/api/admin/stats").status_code == 401
    assert client.get("/api/admin/stats", headers=as_user(monkeypatch, "tok-alice")).status_code == 403
    h = as_user(monkeypatch, "tok-admin")
    monkeypatch.setattr(store, "users", lambda: USERS)
    r = client.get("/api/admin/stats?days=7", headers=h).json()
    assert r["system"]["store"] == "local" and r["documents"] and r["people"][0]["email"] == "alice@x.com"
    d = client.get(f"/api/admin/users/{U1}", headers=h).json()
    assert d["user"]["email"] == "alice@x.com" and d["totals"]["docs"] == 1
    assert client.get("/api/admin/users/pas-un-uuid", headers=h).status_code == 404
    # suspension
    assert client.post(f"/api/admin/users/{ADMIN.id}/suspend", json={"suspended": True}, headers=h).status_code == 400
    assert client.post(f"/api/admin/users/{U1}/suspend", json={"suspended": True}, headers=h).status_code == 501   # stockage local
    calls = []
    monkeypatch.setattr(store, "set_ban", lambda uid, b: calls.append((uid, b)))
    assert client.post(f"/api/admin/users/{U1}/suspend", json={"suspended": True}, headers=h).json()["ok"] and calls == [(U1, True)]
    # export CSV
    csv_ = client.get("/api/admin/export?kind=documents&days=7", headers=h)
    assert csv_.status_code == 200 and "attachment" in csv_.headers["content-disposition"]
    assert "'=cmd|calc.pdf" in csv_.text and ";" in csv_.text                 # injection de formule neutralisée
    assert client.get("/api/admin/export?kind=nimporte", headers=h).status_code == 422


def test_upload_search_and_limits(monkeypatch):
    from reportlab.pdfgen import canvas
    path = os.path.join(os.environ["DATA_DIR"], "t.pdf")
    c = canvas.Canvas(path)
    for i in range(1, 5):
        c.drawString(72, 700, f"Le contrat numero {i} prevoit des garanties."); c.showPage()
    c.save()
    pdf = open(path, "rb").read()
    analytics.reset_store(); analytics.flush()
    g = {"X-Forwarded-For": "9.9.9.9"}
    ok = client.post("/api/documents", files={"file": ("t.pdf", pdf, "application/pdf")}, headers=g)
    assert ok.status_code == 200 and ok.json()["page_count"] == 4
    assert client.get(f"/api/documents/{ok.json()['id']}/search", params={"q": "GARANTIES"}).json()["results"][0]["page"] == 1
    analytics.flush(); assert analytics.get_store().fetch(NOW - timedelta(days=3650)) == []    # invité : rien d'enregistré
    # compte connecté : le nom du document est enregistré
    h = as_user(monkeypatch, "tok-alice")
    assert client.post("/api/documents", files={"file": ("rapport.pdf", pdf, "application/pdf")}, headers=h).status_code == 200
    analytics.flush()
    rows = analytics.get_store().fetch(NOW - timedelta(days=3650))
    assert rows[0]["type"] == "upload_ok" and rows[0]["props"]["filename"] == "rapport.pdf" and rows[0]["user_id"] == U1
    assert client.post("/api/documents", files={"file": ("x.txt", b"hello", "text/plain")}, headers=g).status_code == 415
    codes = [client.post("/api/documents", files={"file": ("t.pdf", pdf, "application/pdf")}, headers=g).status_code for _ in range(8)]
    assert 429 in codes                                         # invité limité à 8 envois / heure / IP
