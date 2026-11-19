"""Authentification : le navigateur se connecte via Supabase Auth, puis envoie son jeton
(`Authorization: Bearer ...`). Le backend le fait vérifier par Supabase (valable quel que soit
l'algorithme de signature) et met le résultat en cache quelques minutes."""
import hashlib
import os
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def public_key() -> str:
    """Clé publique : « publishable » (sb_publishable_…) ou ancienne clé « anon »."""
    return _env("SUPABASE_PUBLISHABLE_KEY") or _env("SUPABASE_ANON_KEY")


def enabled() -> bool:
    return bool(_env("SUPABASE_URL") and public_key())


@dataclass(frozen=True)
class User:
    id: str
    email: str
    confirmed: bool

    @property
    def is_admin(self) -> bool:
        """Administrateur = e-mail confirmé présent dans ADMIN_EMAILS (ou identifiant dans ADMIN_USER_IDS)."""
        emails = {e.strip().lower() for e in _env("ADMIN_EMAILS").split(",") if e.strip()}
        ids = {i.strip() for i in _env("ADMIN_USER_IDS").split(",") if i.strip()}
        return self.id in ids or (self.confirmed and self.email.lower() in emails)


_cache: dict[str, tuple[float, User | None]] = {}


def verify_token(token: str) -> User | None:
    if not enabled() or not token:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        r = httpx.get(
            f"{_env('SUPABASE_URL').rstrip('/')}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": public_key()},
            timeout=8,
        )
    except httpx.HTTPError:
        return None  # erreur réseau : on ne met rien en cache
    user = None
    if r.status_code == 200:
        d = r.json()
        user = User(id=d["id"], email=d.get("email") or "", confirmed=bool(d.get("email_confirmed_at") or d.get("confirmed_at")))
    _cache[key] = (now + (300 if user else 30), user)
    if len(_cache) > 2000:
        for k in [k for k, (exp, _) in _cache.items() if exp <= now]:
            del _cache[k]
    return user


def clear_cache() -> None:
    _cache.clear()


def current_user(authorization: str | None = Header(None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return verify_token(authorization[7:].strip())


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(401, "Connexion requise.")
    return user


def require_admin(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(401, "Connexion requise.")
    if not user.is_admin:
        raise HTTPException(403, "Accès réservé à l'administrateur.")
    return user
