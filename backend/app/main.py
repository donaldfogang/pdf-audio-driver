import csv
import io
import json
import logging
import os
import random
import shutil
import time
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langdetect import detect
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import analytics, auth, ratelimit
from .services import pdf as pdf_service
from .services import tts as tts_service

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
ORIGINS = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o]
DOC_TTL_HOURS = int(os.getenv("DOC_TTL_HOURS", "24"))
# Limites par heure (invité : par adresse IP ; compte : par utilisateur)
UPLOADS_GUEST = int(os.getenv("LIMIT_GUEST_UPLOADS_PER_HOUR", "8"))
UPLOADS_USER = int(os.getenv("LIMIT_USER_UPLOADS_PER_HOUR", "40"))
AUDIO_GUEST = int(os.getenv("LIMIT_GUEST_AUDIO_PER_HOUR", "150"))
AUDIO_USER = int(os.getenv("LIMIT_USER_AUDIO_PER_HOUR", "600"))

logger = logging.getLogger("uvicorn.error")
app = FastAPI(title="pdf-audio API", version="0.3.0")
app.add_middleware(
    CORSMiddleware, allow_origins=ORIGINS, allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"], allow_headers=["*"],
)


# ---------------- utilitaires ----------------
def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "?")


def _ctx(request: Request, user: auth.User | None, session_id: str | None = None) -> analytics.Ctx | None:
    """None pour un invité : aucune donnée d'usage n'est enregistrée."""
    return analytics.ctx_from(request.headers, user.id if user else None, session_id)


def _doc_dir(doc_id: str) -> Path:
    try:
        uuid.UUID(doc_id)  # empêche tout path traversal
    except ValueError:
        raise HTTPException(404, "Document introuvable")
    d = DATA_DIR / doc_id
    if not d.exists():
        raise HTTPException(404, "Document introuvable ou expiré")
    return d


def _meta(doc_id: str) -> dict:
    return json.loads((_doc_dir(doc_id) / "meta.json").read_text())


def _pages(doc_id: str) -> list[str]:
    return json.loads((_doc_dir(doc_id) / "pages.json").read_text())


def _page_text(doc_id: str, page: int) -> str:
    meta = _meta(doc_id)
    if not 1 <= page <= meta["page_count"]:
        raise HTTPException(404, f"Page invalide (1 à {meta['page_count']})")
    return _pages(doc_id)[page - 1]


def _purge_old_documents() -> None:
    """Supprime les documents plus vieux que DOC_TTL_HOURS (le disque d'un serveur gratuit est limité)."""
    limit = time.time() - DOC_TTL_HOURS * 3600
    if not DATA_DIR.exists():
        return
    for d in DATA_DIR.iterdir():
        try:
            if d.is_dir() and d.stat().st_mtime < limit:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


# ---------------- santé / identité ----------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/me")
def me(user: auth.User | None = Depends(auth.current_user)):
    return {"auth_enabled": auth.enabled(),
            "user": {"id": user.id, "email": user.email, "is_admin": user.is_admin} if user else None}


# ---------------- documents ----------------
@app.post("/api/documents")
async def upload(request: Request, file: UploadFile = File(...), user: auth.User | None = Depends(auth.current_user)):
    ctx = _ctx(request, user)
    t0 = time.perf_counter()

    def fail(reason: str, status: int, message: str):
        analytics.record(ctx, "upload_error", {"reason": reason})
        raise HTTPException(status, message)

    who = f"u:{user.id}" if user else f"ip:{client_ip(request)}"
    if not ratelimit.allow(f"up:{who}", UPLOADS_USER if user else UPLOADS_GUEST, 3600):
        fail("rate_limit", 429, "Limite d'envois atteinte pour l'heure." if user
             else "Limite d'envois atteinte. Créez un compte gratuit ou réessayez dans une heure.")

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        fail("too_large", 413, "Fichier trop volumineux.")
    if not data.startswith(b"%PDF"):
        fail("not_pdf", 415, "Le fichier doit être un PDF.")

    if random.random() < 0.05:
        await run_in_threadpool(_purge_old_documents)

    doc_id = str(uuid.uuid4())
    d = DATA_DIR / doc_id
    d.mkdir(parents=True)
    (d / "source.pdf").write_bytes(data)
    try:
        pages, outline = await run_in_threadpool(pdf_service.extract_document, d / "source.pdf")
    except pdf_service.PdfError as exc:
        shutil.rmtree(d, ignore_errors=True)
        fail("unreadable", 422, str(exc))

    sample = " ".join(pages[:3]).strip()
    if not sample:
        shutil.rmtree(d, ignore_errors=True)
        fail("no_text", 422, "Aucun texte détecté (PDF scanné ? un OCR est nécessaire).")
    try:
        lang = detect(sample)
    except Exception:
        lang = "fr"
    lang = lang if lang in tts_service.SUPPORTED_LANGS else "fr"

    meta = {"id": doc_id, "filename": file.filename or "document.pdf", "page_count": len(pages), "lang": lang, "outline": outline}
    (d / "pages.json").write_text(json.dumps(pages, ensure_ascii=False))
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    analytics.record(ctx, "upload_ok", {"filename": (file.filename or "")[:120], "pages": len(pages), "size_kb": len(data) // 1024, "lang": lang,
                                        "chapters": len(outline), "ms": int((time.perf_counter() - t0) * 1000)})
    return meta


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    return _meta(doc_id)


def _fold(text: str) -> str:
    """Minuscules sans accents, en gardant la même longueur (pour découper des extraits)."""
    out = []
    for ch in text.lower():
        base = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
        out.append(base if len(base) == 1 else ch)
    return "".join(out)


@app.get("/api/documents/{doc_id}/search")
def search(doc_id: str, request: Request, q: str = Query(..., min_length=2, max_length=80),
           user: auth.User | None = Depends(auth.current_user)):
    _meta(doc_id)
    needle = _fold(q.strip())
    hits = []
    for number, text in enumerate(_pages(doc_id), 1):
        folded = _fold(text)
        pos = folded.find(needle)
        if pos < 0:
            continue
        start = max(0, pos - 50)
        snippet = text[start: pos + len(needle) + 70].replace("\n", " ").strip()
        hits.append({"page": number, "count": folded.count(needle), "snippet": ("…" if start > 0 else "") + snippet + "…"})
    analytics.record(_ctx(request, user), "search", {"hits": len(hits), "q_len": len(needle)})  # la requête n'est jamais enregistrée
    return {"query": q, "results": hits[:40]}


@app.get("/api/documents/{doc_id}/pages/{page}/text")
def page_text(doc_id: str, page: int):
    return {"page": page, "text": _page_text(doc_id, page)}


@app.get("/api/documents/{doc_id}/pages/{page}/audio")
def page_audio(doc_id: str, page: int, request: Request, lang: str = Query("fr", max_length=5),
               user: auth.User | None = Depends(auth.current_user)):
    if lang not in tts_service.SUPPORTED_LANGS:
        raise HTTPException(400, "Langue non supportée")
    text = _page_text(doc_id, page)
    if not text:
        raise HTTPException(404, "Page sans texte")
    base = _doc_dir(doc_id) / "audio" / f"{page}_{lang}"
    # cache : chaque page n'est synthétisée qu'une fois
    audio = next((p for p in (base.with_suffix(".mp3"), base.with_suffix(".wav")) if p.exists()), None)
    if audio is None:
        who = f"u:{user.id}" if user else f"ip:{client_ip(request)}"
        if not ratelimit.allow(f"tts:{who}", AUDIO_USER if user else AUDIO_GUEST, 3600):
            raise HTTPException(429, "Limite d'écoute atteinte pour l'heure. Créez un compte gratuit ou réessayez plus tard."
                                if not user else "Limite d'écoute atteinte pour l'heure.")
        ctx, t0 = _ctx(request, user), time.perf_counter()
        try:
            audio, engine = tts_service.synthesize(text, lang, base)
        except Exception as exc:
            logger.exception("Échec de la synthèse vocale (page %s)", page)
            analytics.record(ctx, "tts", {"engine": "failed", "ok": False, "chars": len(text),
                                          "ms": int((time.perf_counter() - t0) * 1000), "detail": str(exc)[:110]})
            raise HTTPException(502, str(exc) if isinstance(exc, tts_service.TTSError) else "Synthèse vocale indisponible.")
        analytics.record(ctx, "tts", {"engine": engine, "ok": True, "chars": len(text), "ms": int((time.perf_counter() - t0) * 1000)})
    media = "audio/wav" if audio.suffix == ".wav" else "audio/mpeg"
    return FileResponse(audio, media_type=media, headers={"Cache-Control": "private, max-age=86400"})


# ---------------- suivi d'activité (côté navigateur) ----------------
class EventIn(BaseModel):
    type: str = Field(max_length=40)
    props: dict[str, Any] = {}


class EventsIn(BaseModel):
    anon_id: str | None = Field(None, max_length=64)
    session_id: str | None = Field(None, max_length=64)
    events: list[EventIn] = Field(max_length=20)


@app.post("/api/events", status_code=204)
def events(body: EventsIn, request: Request, user: auth.User | None = Depends(auth.current_user)):
    if ratelimit.allow(f"ev:{client_ip(request)}", 240, 60):
        ctx = _ctx(request, user, session_id=body.session_id)
        for e in body.events:
            if e.type in analytics.CLIENT_TYPES:  # un navigateur ne peut pas fabriquer d'événements « serveur »
                analytics.record(ctx, e.type, e.props)
    return Response(status_code=204)


# ---------------- administration (réservée à l'administrateur) ----------------
def _valid_uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "Utilisateur introuvable")


def _csv_safe(cell: Any) -> Any:
    """Évite l'injection de formules quand le fichier est ouvert dans Excel."""
    return "'" + cell if isinstance(cell, str) and cell[:1] in ("=", "+", "-", "@", "\t", "\r") else cell


@app.get("/api/admin/stats")
def admin_stats(days: int = Query(30, ge=1, le=90), admin: auth.User = Depends(auth.require_admin)):
    analytics.flush()
    store = analytics.get_store()
    rows = store.fetch(datetime.now(timezone.utc) - timedelta(days=days))
    users = store.users()
    stats = analytics.compute_stats(rows, days, users=users)
    stats["users"] = None if users is None else {"total": users["total"]}
    stats["system"] = {
        "store": store.kind, "auth_enabled": auth.enabled(), "events_loaded": len(rows),
        "documents_on_disk": sum(1 for p in DATA_DIR.iterdir() if p.is_dir()) if DATA_DIR.exists() else 0,
    }
    return stats


@app.get("/api/admin/users/{user_id}")
def admin_user(user_id: str, admin: auth.User = Depends(auth.require_admin)):
    user_id = _valid_uuid(user_id)
    analytics.flush()
    store = analytics.get_store()
    users = store.users()
    profile = next((u for u in (users or {}).get("all", []) if u["id"] == user_id), None)
    return analytics.user_detail(user_id, profile, store.fetch_user(user_id, 300), store.library_of(user_id))


class SuspendIn(BaseModel):
    suspended: bool


@app.post("/api/admin/users/{user_id}/suspend")
def admin_suspend(user_id: str, body: SuspendIn, admin: auth.User = Depends(auth.require_admin)):
    user_id = _valid_uuid(user_id)
    if user_id == admin.id:
        raise HTTPException(400, "Vous ne pouvez pas suspendre votre propre compte.")
    try:
        analytics.get_store().set_ban(user_id, body.suspended)
    except NotImplementedError:
        raise HTTPException(501, "Disponible uniquement avec Supabase.")
    except httpx.HTTPError:
        raise HTTPException(502, "Supabase a refusé l'opération.")
    auth.clear_cache()  # la suspension s'applique immédiatement
    return {"ok": True, "suspended": body.suspended}


@app.get("/api/admin/export")
def admin_export(kind: Literal["users", "documents", "events"] = Query(...), days: int = Query(30, ge=1, le=90),
                 admin: auth.User = Depends(auth.require_admin)):
    analytics.flush()
    store = analytics.get_store()
    rows = store.fetch(datetime.now(timezone.utc) - timedelta(days=days))
    head, data = analytics.export_rows(kind, rows, store.users())
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")  # séparateur « ; » : s'ouvre directement dans Excel en français
    writer.writerow(head)
    for line in data:
        writer.writerow([_csv_safe(c) for c in line])
    name = f"pdf-audio-{kind}-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
