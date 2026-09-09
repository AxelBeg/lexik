"""Mode quotidien.

Le changement de mot est determine par le SERVEUR, jamais par l'horloge du
telephone (prompt_base.txt section 9). Reste a choisir sur quel fuseau.

Ce n'est pas UTC, et c'est delibere. Le cadrage disait « idealement UTC » pour
dire « pas l'appareil » ; ce qu'il demande vraiment, c'est une reference stable
et unique. `DAILY_TIMEZONE` en est une, avec un avantage qu'UTC n'a pas : la
journee de jeu coincide avec la journee du joueur. Le jeu est francais, joue par
des francophones ; en UTC, le mot bascule a 1 h ou 2 h du matin selon la saison,
c'est-a-dire au milieu de la soiree de quelqu'un.

Ca compte des qu'on annonce un delai. « Il te reste 4 h » envoye a 20 h n'est
vrai que si la journee s'arrete a minuit chez le joueur. En UTC, le meme message
serait faux, et faux d'une quantite qui change deux fois par an.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from database.models import DailyWord, Game, User
from utils.const import DAILY_TIMEZONE


def today_local() -> date:
    """La date de la journee de jeu en cours."""
    return datetime.now(ZoneInfo(DAILY_TIMEZONE)).date()


def next_reset() -> datetime:
    """L'instant ou le mot du jour change, en absolu.

    Envoye au client pour qu'il puisse programmer son rappel du soir sur la
    fin de la journee de JEU et non sur celle de l'appareil. Un joueur en
    voyage garde ainsi la meme echeance que les autres, et le delai annonce
    dans la notification reste exact.
    """
    tz = ZoneInfo(DAILY_TIMEZONE)
    now = datetime.now(tz)
    return datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=tz)


def get_daily_word(db: Session, on: date | None = None) -> DailyWord:
    on = on or today_local()
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
