import re
from pathlib import Path
from pypdf import PdfReader


class PdfError(Exception):
    pass


def _clean(text: str) -> str:
    text = re.sub(r"-\n(?=\w)", "", text)          # mots coupés en fin de ligne
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)    # retours à la ligne simples -> espace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(path: Path) -> list[str]:
    """Retourne le texte nettoyé de chaque page (index 0 = page 1)."""
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfError("PDF protégé par mot de passe.")
        return [_clean(page.extract_text() or "") for page in reader.pages]
    except PdfError:
        raise
    except Exception as exc:
        raise PdfError("Fichier PDF illisible ou corrompu.") from exc
