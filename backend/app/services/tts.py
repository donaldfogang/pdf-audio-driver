"""Synthèse vocale multi-moteurs avec repli automatique.

Ordre par défaut (TTS_PROVIDER=auto) : edge -> gtts -> local.
En production, remplacer par un service officiel (Azure Speech, Google Cloud TTS,
Amazon Polly, ElevenLabs) en ajoutant un fournisseur dans PROVIDERS.
"""
import asyncio
import io
import logging
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

logger = logging.getLogger("uvicorn.error")

SUPPORTED_LANGS = {"fr", "en", "es", "de", "it", "pt", "nl", "ar"}

EDGE_VOICES = {
    "fr": "fr-FR-DeniseNeural", "en": "en-US-AriaNeural", "es": "es-ES-ElviraNeural",
    "de": "de-DE-KatjaNeural", "it": "it-IT-ElsaNeural", "pt": "pt-BR-FranciscaNeural",
    "nl": "nl-NL-ColetteNeural", "ar": "ar-SA-ZariyahNeural",
}


class TTSError(Exception):
    pass


# ---------- moteur 1 : Microsoft Edge (voix neuronales) ----------
def _edge(text: str, lang: str, out: Path) -> None:
    import edge_tts

    async def go() -> None:
        await asyncio.wait_for(edge_tts.Communicate(text, EDGE_VOICES[lang]).save(str(out)), timeout=90)

    asyncio.run(go())


# ---------- moteur 2 : gTTS (Google, non officiel) ----------
def _chunks(text: str, size: int = 450) -> list[str]:
    out: list[str] = []
    cur = ""
    for sentence in re.split(r"(?<=[.!?;:])\s+", text):
        while len(sentence) > size:
            cut = sentence.rfind(" ", 0, size)
            cut = cut if cut > 0 else size
            if cur:
                out.append(cur)
                cur = ""
            out.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if cur and len(cur) + len(sentence) + 1 > size:
            out.append(cur)
            cur = sentence
        else:
            cur = f"{cur} {sentence}".strip()
    if cur:
        out.append(cur)
    return out


def _gtts_one(text: str, lang: str) -> bytes:
    from gtts import gTTS
    buf = io.BytesIO()
    gTTS(text=text, lang=lang).write_to_fp(buf)
    return buf.getvalue()


def _gtts(text: str, lang: str, out: Path) -> None:
    with ThreadPoolExecutor(max_workers=int(os.getenv("TTS_WORKERS", "2"))) as pool:
        out.write_bytes(b"".join(pool.map(lambda p: _gtts_one(p, lang), _chunks(text))))


# ---------- moteur 3 : voix locale du système (hors-ligne) ----------
_LOCAL_SCRIPT = r'''
import sys, pyttsx3
sys.stdin.reconfigure(encoding="utf-8")
text, lang, out = sys.stdin.read(), sys.argv[1], sys.argv[2]
e = pyttsx3.init()
for v in e.getProperty("voices"):
    vid = v.id.lower()
    if f"_{lang}-" in vid or f"_{lang}_" in vid:
        e.setProperty("voice", v.id)
        break
e.save_to_file(text, out)
e.runAndWait()
'''


def _local(text: str, lang: str, out: Path) -> None:
    subprocess.run([sys.executable, "-c", _LOCAL_SCRIPT, lang, str(out)],
                   input=text, text=True, encoding="utf-8", check=True, timeout=300, capture_output=True)


PROVIDERS = {"edge": (_edge, ".mp3"), "gtts": (_gtts, ".mp3"), "local": (_local, ".wav")}


def synthesize(text: str, lang: str, out_base: Path) -> Path:
    """Génère l'audio et retourne le fichier créé (.mp3 ou .wav)."""
    if lang not in SUPPORTED_LANGS:
        raise ValueError("Langue non supportée")
    out_base.parent.mkdir(parents=True, exist_ok=True)
    choice = os.getenv("TTS_PROVIDER", "auto")
    order = list(PROVIDERS) if choice == "auto" else [choice]
    errors: list[str] = []
    for name in order:
        fn, ext = PROVIDERS[name]
        part = out_base.parent / f"{out_base.name}.part{ext}"
        try:
            fn(text, lang, part)
            if not part.exists() or part.stat().st_size == 0:
                raise TTSError("fichier audio vide")
            final = out_base.with_suffix(ext)
            os.replace(part, final)  # écriture atomique
            return final
        except Exception as exc:
            logger.warning("Moteur vocal '%s' en échec : %s: %s", name, type(exc).__name__, str(exc)[:200])
            errors.append(f"{name} ({type(exc).__name__})")
            part.unlink(missing_ok=True)
    raise TTSError("Aucun moteur vocal disponible : " + ", ".join(errors))
