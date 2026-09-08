"""Identite du joueur.

Reprend le principe JWT + refresh de LexiFight, mais l'identite ne vient plus
d'un pseudo saisi : elle vient de Play Games Services, verifiee cote serveur.

Le point critique (docs/prompt-persistance.md section 28) : ne JAMAIS faire
confiance au playerId envoye par le client. L'app envoie un code
d'autorisation obtenu via requestServerSideAccess(), le backend l'echange
aupres de Google, puis lit le playerId depuis l'API Play Games. C'est la seule
facon d'empecher un joueur de reclamer la progression d'un autre.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database.database import get_db
from database.models import AuthIdentity, User
from utils.const import (
    ACCESS_TOKEN_TTL_MINUTES, GOOGLE_CLIENT_SECRET, GOOGLE_WEB_CLIENT_ID,
    JWT_ALGORITHM, JWT_SECRET, STARTING_CURRENCY,
)

bearer = HTTPBearer(auto_error=True)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
PLAY_GAMES_PLAYER_URL = "https://games.googleapis.com/games/v1/players/me"


# --------------------------------------------------------------------------
# Jetons
# --------------------------------------------------------------------------

def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        # detail lu par l'intercepteur axios du client pour declencher un refresh
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="TOKEN_EXPIRED")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID")

    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="USER_NOT_FOUND")

    user.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return user


# --------------------------------------------------------------------------
# Identites
# --------------------------------------------------------------------------

def _find_or_create(db: Session, provider: str, external_id: str) -> tuple[User, bool]:
    identity = (
        db.query(AuthIdentity)
        .filter(AuthIdentity.provider == provider, AuthIdentity.external_id == external_id)
        .first()
    )
    if identity is not None:
        return identity.user, False

    user = User(hint_currency=STARTING_CURRENCY)
    db.add(user)
    db.flush()
    db.add(AuthIdentity(provider=provider, external_id=external_id, user_id=user.id))
    db.commit()
    db.refresh(user)
    return user, True


def verify_play_games_code(server_auth_code: str) -> str:
    """Echange le code d'autorisation contre un playerId VERIFIE.

    Sans cette etape, l'identite Play Games ne vaut rien : le client pourrait
    annoncer le playerId de n'importe qui.
    """
    if not GOOGLE_WEB_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Play Games non configure (GOOGLE_WEB_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
        )

    token_res = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": server_auth_code,
            "client_id": GOOGLE_WEB_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if not token_res.ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Code Play Games invalide")

    access_token = token_res.json().get("access_token")
    if not access_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Reponse Google sans access_token")

    player_res = requests.get(
        PLAY_GAMES_PLAYER_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if not player_res.ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Profil Play Games illisible")

    player_id = player_res.json().get("playerId")
    if not player_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="playerId absent")
    return player_id


def login_play_games(db: Session, server_auth_code: str) -> tuple[User, bool]:
    return _find_or_create(db, "play_games", verify_play_games_code(server_auth_code))


def login_device(db: Session, device_id: str) -> tuple[User, bool]:
    """Repli quand Play Games est indisponible.

    La progression ne vit alors que sur cet appareil : c'est le seul cas ou le
    client propose plus tard de « sauvegarder » (section 28).
    """
    device_id = (device_id or "").strip()
    if len(device_id) < 16:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="device_id invalide")
    return _find_or_create(db, "device", device_id)


def link_play_games(db: Session, user: User, server_auth_code: str) -> dict:
    """Promeut un compte de repli en compte Play Games.

    Si le playerId porte deja une progression, on ne fusionne PAS en silence :
    on renvoie les deux etats et le client demande au joueur lequel garder
    (section 29).
    """
    player_id = verify_play_games_code(server_auth_code)

    existing = (
        db.query(AuthIdentity)
        .filter(AuthIdentity.provider == "play_games", AuthIdentity.external_id == player_id)
        .first()
    )

    if existing is not None and existing.user_id != user.id:
        from services import campaign as campaign_service
        return {
            "status": "conflict",
            "this_device": {
                "user_id": user.id,
                "levels_completed": campaign_service.count_completed(db, user.id),
            },
            "play_games": {
                "user_id": existing.user_id,
                "levels_completed": campaign_service.count_completed(db, existing.user_id),
            },
        }

    if existing is None:
        db.add(AuthIdentity(provider="play_games", external_id=player_id, user_id=user.id))
        db.commit()

    return {"status": "linked", "user_id": user.id}
