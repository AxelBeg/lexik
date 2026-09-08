"""Mode quotidien.

Le changement de mot est determine sur une reference UTC stable, jamais sur
l'horloge du telephone (prompt_base.txt section 9).
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from database.models import DailyWord, Game, User


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def get_daily_word(db: Session, on: date | None = None) -> DailyWord:
    on = on or today_utc()
    daily = db.query(DailyWord).filter(DailyWord.date == on).first()
    if daily is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Aucun mot du jour programme pour le {on}. "
                   f"Lancer scripts/schedule_daily.py.",
        )
    return daily


def start_or_resume(db: Session, user: User) -> Game:
    """Une seule partie par joueur et par mot du jour : on la reprend.

    Le joueur qui revient doit retrouver sa carte semantique intacte, pas une
    partie vierge.
    """
    daily = get_daily_word(db)

    game = (
        db.query(Game)
        .filter(Game.user_id == user.id, Game.daily_word_id == daily.id)
        .first()
    )
    if game is None:
        game = Game(
            user_id=user.id,
            mode="daily",
            secret_word_id=daily.secret_word_id,
            daily_word_id=daily.id,
        )
        db.add(game)
        db.commit()
        db.refresh(game)

    return game
