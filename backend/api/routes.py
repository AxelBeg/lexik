"""Routes HTTP.

Contrat identique pour les deux modes : une fois la partie demarree, /guess et
/hint sont les memes (docs/prompt-campagne.md, section 17 ter). Le client
n'envoie que des actions, jamais un etat de progression complet.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.database import get_db
from database.models import User
from services import auth as auth_service
from services import campaign as campaign_service
from services import daily as daily_service
from services import games as games_service

router = APIRouter()


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class PlayGamesPayload(BaseModel):
    serverAuthCode: str


class DevicePayload(BaseModel):
    deviceId: str = Field(min_length=16, max_length=128)


class GuessPayload(BaseModel):
    word: str = Field(min_length=1, max_length=64)


def _session(user: User) -> dict:
    return {
        "accessToken": auth_service.create_access_token(user.id),
        "userId": user.id,
        "currency": user.hint_currency,
        "streak": user.streak_current,
    }


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------

@router.post("/auth/play-games", tags=["auth"])
def auth_play_games(payload: PlayGamesPayload, db: Session = Depends(get_db)):
    """Connexion silencieuse au demarrage. Aucun ecran cote client."""
    user, created = auth_service.login_play_games(db, payload.serverAuthCode)
    return {**_session(user), "created": created}


@router.post("/auth/device", tags=["auth"])
def auth_device(payload: DevicePayload, db: Session = Depends(get_db)):
    """Repli quand Play Games est indisponible."""
    user, created = auth_service.login_device(db, payload.deviceId)
    return {**_session(user), "created": created}


@router.post("/auth/refresh", tags=["auth"])
def refresh(user: User = Depends(auth_service.current_user)):
    return _session(user)


@router.post("/auth/link-play-games", tags=["auth"])
def link_play_games(
    payload: PlayGamesPayload,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    """Promeut un compte de repli. Renvoie un conflit a arbitrer si le compte
    Play Games porte deja une progression."""
    return auth_service.link_play_games(db, user, payload.serverAuthCode)


@router.delete("/account", tags=["auth"])
def delete_account(
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    """Suppression du compte. Exigee par le Play Store des lors qu'on stocke
    des donnees rattachees a une identite (docs/prompt-persistance.md, 30)."""
    db.delete(user)
    db.commit()
    return {"deleted": True}


# --------------------------------------------------------------------------
# Joueur
# --------------------------------------------------------------------------

@router.get("/me", tags=["joueur"])
def me(user: User = Depends(auth_service.current_user), db: Session = Depends(get_db)):
    """Tout ce qu'il faut pour peindre le menu principal en un appel."""
    from database.models import Game

    daily = daily_service.get_daily_word(db)
    daily_game = (
        db.query(Game)
        .filter(Game.user_id == user.id, Game.daily_word_id == daily.id)
        .first()
    )

    state = campaign_service.get_state(db, user)
    current_planet = next(
        (p for p in state["planets"]
         if p["unlocked"] and p["completedCount"] < p["totalLevels"]),
        state["planets"][0],
    )

    return {
        "userId": user.id,
        "currency": user.hint_currency,
        "streak": user.streak_current,
        "streakBest": user.streak_best,
        "daily": {
            "number": daily.number,
            "date": daily.date.isoformat(),
            "started": daily_game is not None,
            "completed": bool(daily_game and daily_game.completed),
            "attemptsCount": daily_game.attempts_count if daily_game else 0,
            "bestScore": (
                float(daily_game.best_score)
                if daily_game and daily_game.best_score is not None else None
            ),
        },
        "campaign": {
            "planetId": current_planet["id"],
            "planetName": current_planet["name"],
            "completedCount": current_planet["completedCount"],
            "totalLevels": current_planet["totalLevels"],
        },
    }


# --------------------------------------------------------------------------
# Quotidien
# --------------------------------------------------------------------------

@router.post("/daily/start", tags=["quotidien"])
def daily_start(user: User = Depends(auth_service.current_user), db: Session = Depends(get_db)):
    game = daily_service.start_or_resume(db, user)
    payload = games_service.serialize_game(game, user)
    payload["dailyNumber"] = game.daily_word.number
    payload["date"] = game.daily_word.date.isoformat()
    if game.completed:
        payload["victory"] = games_service.build_victory(db, game, user)
    return payload


# --------------------------------------------------------------------------
# Campagne
# --------------------------------------------------------------------------

@router.get("/campaign", tags=["campagne"])
def campaign_state(
    user: User = Depends(auth_service.current_user), db: Session = Depends(get_db)
):
    return campaign_service.get_state(db, user)


@router.post("/campaign/{planet_id}/{level_number}/start", tags=["campagne"])
def campaign_start(
    planet_id: str,
    level_number: int,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    game = campaign_service.start_or_resume(db, user, planet_id, level_number)
    payload = games_service.serialize_game(game, user)
    payload["planetId"] = planet_id
    payload["levelNumber"] = level_number
    if game.completed:
        payload["victory"] = games_service.build_victory(db, game, user)
    return payload


# --------------------------------------------------------------------------
# Partie (commun aux deux modes)
# --------------------------------------------------------------------------

@router.get("/game/{game_id}", tags=["partie"])
def get_game(
    game_id: str,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    game = games_service.get_owned_game(db, game_id, user)
    return games_service.serialize_game(game, user)


@router.post("/game/{game_id}/guess", tags=["partie"])
def guess(
    game_id: str,
    payload: GuessPayload,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    game = games_service.get_owned_game(db, game_id, user)
    return games_service.submit_guess(db, game, user, payload.word)


@router.post("/game/{game_id}/hint", tags=["partie"])
def hint(
    game_id: str,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db),
):
    game = games_service.get_owned_game(db, game_id, user)
    return games_service.buy_hint(db, game, user)


@router.get("/health", tags=["infra"])
def health(db: Session = Depends(get_db)):
    from database.models import DailyWord
    from services import similarity

    return {
        "ok": True,
        "modelLoaded": similarity.is_loaded(),
        "dailyScheduled": db.query(DailyWord).count(),
    }
