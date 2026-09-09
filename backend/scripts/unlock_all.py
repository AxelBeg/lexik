"""Ouvre toute la campagne sur un compte de developpement.

Marque N niveaux termines sur CHAQUE planete, ce qui satisfait le verrou 25/30
de proche en proche et debloque les six. Sert a regarder l'ecran de campagne
autrement qu'avec Terre ouverte et cinq cadenas dessous.

    python -m scripts.unlock_all                     # 25/30 partout, tous les comptes
    python -m scripts.unlock_all --per-planet 30     # tout termine
    python -m scripts.unlock_all --user <id>         # un seul compte

Ne cree que des parties : aucun mot secret, aucun indice, aucun calendrier n'est
touche. `scripts.reset_progress` defait exactement ce que ce script fait.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone

from database.database import SessionLocal
from database.models import CampaignLevel, Game, User
from utils.const import LEVELS_PER_PLANET, LEVELS_TO_UNLOCK_NEXT, PLANETS


def _mark(db, user_id: str, level: CampaignLevel, *, completed: bool, score: float) -> str:
    """Cree ou met a jour la partie de ce joueur sur ce niveau.

    Un joueur n'a qu'une partie par niveau (contrainte uq_game_user_level) :
    relancer le script doit donc reprendre la partie existante, pas en insérer
    une seconde qui ferait echouer tout le lot.
    """
    game = (
        db.query(Game)
        .filter(Game.user_id == user_id, Game.campaign_level_id == level.id)
        .one_or_none()
    )
    action = "maj" if game else "creee"
    if game is None:
        game = Game(
            user_id=user_id,
            mode="campaign",
            secret_word_id=level.secret_word_id,
            campaign_level_id=level.id,
        )
        db.add(game)

    game.completed = completed
    game.best_score = score
    game.attempts_count = max(game.attempts_count or 0, 12)
    game.hints_used = 0
    game.completed_at = datetime.now(timezone.utc) if completed else None
    return action


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-planet", type=int, default=LEVELS_TO_UNLOCK_NEXT,
                        help=f"niveaux termines par planete (defaut {LEVELS_TO_UNLOCK_NEXT})")
    parser.add_argument("--attempted", type=int, default=2,
                        help="niveaux tentes mais NON termines, pour que la grille "
                             "montre aussi son troisieme etat (defaut 2)")
    parser.add_argument("--user", default=None, help="id d'un compte ; par defaut tous")
    args = parser.parse_args()

    if not 0 <= args.per_planet <= LEVELS_PER_PLANET:
        raise SystemExit(f"--per-planet doit tenir entre 0 et {LEVELS_PER_PLANET}.")

    db = SessionLocal()
    try:
        users = (
            db.query(User).filter(User.id == args.user).all() if args.user
            else db.query(User).all()
        )
        if not users:
            raise SystemExit("Aucun compte trouve.")

        levels = {
            (lv.planet_id, lv.level_number): lv
            for lv in db.query(CampaignLevel).all()
        }

        for user in users:
            print(f"\nCompte {user.id}")
            for planet in PLANETS:
                done = 0
                for n in range(1, args.per_planet + 1):
                    level = levels.get((planet["id"], n))
                    if level is None:
                        continue
                    _mark(db, user.id, level, completed=True, score=100)
                    done += 1

                # Quelques niveaux laisses en cours juste apres les termines :
                # sans eux la grille n'affiche que des coches et des cases
                # vides, et le score colore — son troisieme etat — n'est jamais
                # verifie.
                partial = 0
                for i in range(args.attempted):
                    n = args.per_planet + 1 + i
                    level = levels.get((planet["id"], n))
                    if level is None:
                        continue
                    _mark(db, user.id, level, completed=False, score=55 + i * 17)
                    partial += 1

                print(f"  {planet['name']:<9} {done}/{LEVELS_PER_PLANET} termines"
                      f"{f', {partial} en cours' if partial else ''}")

        db.commit()
        print(f"\n{len(PLANETS)} planetes ouvertes pour {len(users)} compte(s).")
        print("Annuler : python -m scripts.reset_progress")
    finally:
        db.close()


if __name__ == "__main__":
    main()
