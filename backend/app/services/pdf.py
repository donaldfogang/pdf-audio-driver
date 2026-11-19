import re
from collections import Counter
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


# ---------- Lecture intelligente : suppression des en-têtes / pieds de page ----------
_PAGENUM = re.compile(r"^\s*[-–—]?\s*(page|p\.)?\s*\d+\s*(/|sur|of)?\s*\d*\s*[-–—]?\s*$", re.I)


def _key(line: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", line.strip().lower()))


def _edges(lines: list[str]) -> list[int]:
    idx = [i for i, ln in enumerate(lines) if ln.strip()]
    return sorted(set(idx[:2] + idx[-2:]))


def strip_repeated(pages_lines: list[list[str]]) -> list[list[str]]:
    """Retire les lignes de haut/bas de page qui se répètent (titre courant, « Page 3 / 10 »…)."""
    n = len(pages_lines)
    if n < 3:
        return pages_lines
    counts: Counter[str] = Counter()
    for lines in pages_lines:
        keys = {_key(lines[i]) for i in _edges(lines)}
        counts.update(k for k in keys if len(k) >= 3)
    threshold = max(3, int(n * 0.5))
    # Prudence : une ligne contenant des chiffres (« Article 12 », « Chapitre 3 ») n'est retirée que
    # si elle mentionne « page » ; sinon on risquerait de supprimer du vrai contenu.
    repeated = {
        k for k, c in counts.items()
        if c >= threshold and ("#" not in k or re.search(r"\bpage\b|\bp\.", k))
    }
    out = []
    for lines in pages_lines:
        drop = {i for i in _edges(lines) if _PAGENUM.match(lines[i]) or _key(lines[i]) in repeated}
        out.append([ln for i, ln in enumerate(lines) if i not in drop])
    return out


# ---------- Sommaire (signets du PDF) ----------
def _outline(reader: PdfReader) -> list[dict]:
    result: list[dict] = []

    def walk(items, level: int) -> None:
        for item in items:
            if isinstance(item, list):
                walk(item, level + 1)
                continue
            try:
                page = reader.get_destination_page_number(item) + 1
                title = (item.title or "").strip()
            except Exception:
                continue
            if title and 1 <= page <= len(reader.pages):
                result.append({"title": title[:120], "page": page, "level": min(level, 3)})

    try:
        walk(reader.outline, 0)
    except Exception:
        return []
    return result[:300]


def extract_document(path: Path) -> tuple[list[str], list[dict]]:
    """Retourne (texte nettoyé de chaque page, sommaire)."""
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfError("PDF protégé par mot de passe.")
        raw = [(page.extract_text() or "").splitlines() for page in reader.pages]
        pages = [_clean("\n".join(lines)) for lines in strip_repeated(raw)]
        return pages, _outline(reader)
    except PdfError:
        raise
    except Exception as exc:
        raise PdfError("Fichier PDF illisible ou corrompu.") from exc
