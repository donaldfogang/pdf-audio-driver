import json
import logging
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langdetect import detect

from .services import pdf as pdf_service
from .services import tts as tts_service

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
ORIGINS = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o]

logger = logging.getLogger("uvicorn.error")
app = FastAPI(title="PDF Audio Driver API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=ORIGINS, allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"], allow_headers=["*"],
)


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


def _page_text(doc_id: str, page: int) -> str:
    meta = _meta(doc_id)
    if not 1 <= page <= meta["page_count"]:
        raise HTTPException(404, f"Page invalide (1 à {meta['page_count']})")
    pages = json.loads((_doc_dir(doc_id) / "pages.json").read_text())
    return pages[page - 1]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/documents")
async def upload(file: UploadFile = File(...)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Fichier trop volumineux.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "Le fichier doit être un PDF.")

    doc_id = str(uuid.uuid4())
    d = DATA_DIR / doc_id
    d.mkdir(parents=True)
    (d / "source.pdf").write_bytes(data)
    try:
        pages = pdf_service.extract_pages(d / "source.pdf")
    except pdf_service.PdfError as exc:
        raise HTTPException(422, str(exc))

    sample = " ".join(pages[:3]).strip()
    if not sample:
        raise HTTPException(422, "Aucun texte détecté (PDF scanné ? un OCR est nécessaire).")
    try:
        lang = detect(sample)
    except Exception:
        lang = "fr"
    lang = lang if lang in tts_service.SUPPORTED_LANGS else "fr"

    meta = {"id": doc_id, "filename": file.filename or "document.pdf", "page_count": len(pages), "lang": lang}
    (d / "pages.json").write_text(json.dumps(pages, ensure_ascii=False))
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    return meta


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    return _meta(doc_id)


@app.get("/api/documents/{doc_id}/pages/{page}/text")
def page_text(doc_id: str, page: int):
    return {"page": page, "text": _page_text(doc_id, page)}


@app.get("/api/documents/{doc_id}/pages/{page}/audio")
def page_audio(doc_id: str, page: int, lang: str = Query("fr", max_length=5)):
    if lang not in tts_service.SUPPORTED_LANGS:
        raise HTTPException(400, "Langue non supportée")
    text = _page_text(doc_id, page)
    if not text:
        raise HTTPException(404, "Page sans texte")
    base = _doc_dir(doc_id) / "audio" / f"{page}_{lang}"
    # cache : chaque page n'est synthétisée qu'une fois
    audio = next((p for p in (base.with_suffix(".mp3"), base.with_suffix(".wav")) if p.exists()), None)
    if audio is None:
        try:
            audio = tts_service.synthesize(text, lang, base)
        except Exception as exc:
            logger.exception("Échec de la synthèse vocale (page %s)", page)
            raise HTTPException(502, str(exc) if isinstance(exc, tts_service.TTSError) else "Synthèse vocale indisponible.")
    media = "audio/wav" if audio.suffix == ".wav" else "audio/mpeg"
    return FileResponse(audio, media_type=media, headers={"Cache-Control": "private, max-age=86400"})
