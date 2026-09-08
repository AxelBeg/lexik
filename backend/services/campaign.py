"""Mode campagne.

Regles (docs/prompt-campagne.md sections 16 et 17) :
  - tous les niveaux d'une planete debloquee sont jouables dans n'importe quel
    ordre : aucun verrou sequentiel a l'interieur d'une planete ;
  - le seul verrou est entre planetes, a 25/30 niveaux termines ;
  - un niveau a deux etats seulement, termine ou non ; un niveau tente mais non
    termine expose son meilleur score, jamais son nombre d'essais.

Le deblocage est recalcule ici a chaque lecture, jamais deduit par le client.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import CampaignLevel, Game, User
from utils.const import LEVELS_PER_PLANET, LEVELS_TO_UNLOCK_NEXT, PLANETS


def _completed_by_planet(db: Session, user_id: str) -> dict[str, int]:
    rows = (
        db.query(CampaignLevel.planet_id, func.count(Game.id))
        .join(Game, Game.campaign_level_id == CampaignLevel.id)
        .filter(Game.user_id == user_id, Game.completed.is_(True))
        .group_by(CampaignLevel.planet_id)
        .all()
    )
    return {planet_id: count for planet_id, count in rows}


def count_completed(db: Session, user_id: str) -> int:
    """Nombre total de niveaux termines, tous planetes confondues."""
    return (
        db.query(func.count(Game.id))
        .filter(Game.user_id == user_id, Game.mode == "campaign", Game.completed.is_(True))
        .scalar()
    ) or 0


def unlocked_planets(db: Session, user_id: str) -> set[str]:
    """La premiere planete est toujours ouverte ; chaque suivante exige 25/30
    sur la precedente."""
    completed = _completed_by_planet(db, user_id)
    unlocked = set()
    for planet in PLANETS:
        if planet["order"] == 1:
            unlocked.add(planet["id"])
            continue
        previous = PLANETS[planet["order"] - 2]
        if previous["id"] not in unlocked:
            break
        if completed.get(previous["id"], 0) < LEVELS_TO_UNLOCK_NEXT:
            break
        unlocked.add(planet["id"])
    return unlocked


def get_state(db: Session, user: User) -> dict:
    """Etat complet de la campagne pour la grille de selection."""
    completed_counts = _completed_by_planet(db, user.id)
    unlocked = unlocked_planets(db, user.id)

    games = (
        db.query(CampaignLevel.planet_id, CampaignLevel.level_number,
                 Game.completed, Game.best_score)
        .join(Game, Game.campaign_level_id == CampaignLevel.id)
        .filter(Game.user_id == user.id)
        .all()
    )
    by_level = {
        (planet_id, number): {"completed": completed, "bestScore": float(best) if best is not None else None}
        for planet_id, number, completed, best in games
    }

    planets = []
    for planet in PLANETS:
        is_unlocked = planet["id"] in unlocked
        entry = {
            "id": planet["id"],
            "name": planet["name"],
            "order": planet["order"],
            "unlocked": is_unlocked,
            "completedCount": completed_counts.get(planet["id"], 0),
            "totalLevels": LEVELS_PER_PLANET,
        }

        if is_unlocked:
            entry["levels"] = [
                {
                    "n": n,
                    "completed": by_level.get((planet["id"], n), {}).get("completed", False),
                    # sur un niveau termine le meilleur score vaudrait 100 : inutile a afficher
                    "bestScore": (
                        None if by_level.get((planet["id"], n), {}).get("completed")
                        else by_level.get((planet["id"], n), {}).get("bestScore")
                    ),
                }
                for n in range(1, LEVELS_PER_PLANET + 1)
            ]
        else:
            previous = PLANETS[planet["order"] - 2]
            entry["unlockRequirement"] = {
                "planet": previous["id"],
                "planetName": previous["name"],
                "completed": LEVELS_TO_UNLOCK_NEXT,
                "of": LEVELS_PER_PLANET,
                "current": completed_counts.get(previous["id"], 0),
            }

        planets.append(entry)

    return {"planets": planets, "currency": user.hint_currency}


def start_or_resume(db: Session, user: User, planet_id: str, level_number: int) -> Game:
    level = (
        db.query(CampaignLevel)
        .filter(CampaignLevel.planet_id == planet_id,
                CampaignLevel.level_number == level_number)
        .first()
    )
    if level is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Niveau introuvable")

    if planet_id not in unlocked_planets(db, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Planete verrouillee")

    game = (
        db.query(Game)
        .filter(Game.user_id == user.id, Game.campaign_level_id == level.id)
        .first()
    )
    if game is None:
        game = Game(
            user_id=user.id,
            mode="campaign",
            secret_word_id=level.secret_word_id,
            campaign_level_id=level.id,
        )
        db.add(game)
        db.commit()
        db.refresh(game)

    return game
