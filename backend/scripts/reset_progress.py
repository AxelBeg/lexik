"""Efface les parties (tentatives, victoires, quotidien) pour rejouer de zero.

Conserve le contenu : mots secrets, indices precalcules, campagne, calendrier.

    python -m scripts.reset_progress
"""

from diskcache import Cache

from database.database import SessionLocal
from database.models import Attempt, DailyResult, Game, User
from utils.const import SIMILARITY_CACHE_DIR, STARTING_CURRENCY


def main() -> None:
    db = SessionLocal()
    try:
        n_attempts = db.query(Attempt).delete()
        n_results = db.query(DailyResult).delete()
        n_games = db.query(Game).delete()
        users = db.query(User).all()
        for user in users:
            user.hint_currency = STARTING_CURRENCY
            user.streak_current = 0
            user.streak_best = 0
            user.last_daily_played_on = None
        db.commit()
        print(f"Supprime : {n_games} partie(s), {n_attempts} tentative(s), "
              f"{n_results} resultat(s) quotidien(s).")
        print(f"Remis a {STARTING_CURRENCY} indices pour {len(users)} joueur(s).")
    finally:
        db.close()

    with Cache(SIMILARITY_CACHE_DIR) as scores:
        n_cached = len(scores)
        scores.clear()
    print(f"Cache de scores vide ({n_cached} entree(s)).")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
