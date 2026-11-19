import time
from collections import defaultdict, deque
from threading import Lock

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def allow(key: str, limit: int, window: float) -> bool:
    """Fenêtre glissante en mémoire : retourne False si la limite est atteinte."""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        if len(_hits) > 5000:  # purge des clés inactives
            for k in [k for k, d in _hits.items() if not d or d[-1] <= now - 3600]:
                del _hits[k]
        return True
