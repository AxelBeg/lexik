"""Deroulement d'une partie : proposer un mot, acheter un indice, gagner.

Toute la logique vit ici et nulle part ailleurs. Le client ne calcule aucun
score, ne decide d'aucune victoire et ne debite aucune monnaie : il affiche ce
que ces fonctions renvoient (prompt_base.txt section 20).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from database.models import Attempt, DailyResult, Game, Hint, User
from services import similarity
from utils.const import DAILY_REWARD, HINT_COST, MAX_HINTS, STREAK_BONUS_AMOUNT, STREAK_BONUS_EVERY
from utils.helpers import normalize_key


# --------------------------------------------------------------------------
# Lecture
# --------------------------------------------------------------------------

def serialize_attempts(game: Game) -> list[dict]:
    """La carte semantique du joueur, triee par proximite decroissante.

    Le tri par score et non par ordre chronologique est une regle de gameplay,
    pas un detail d'affichage (section 4) : c'est ce qui transforme
    l'historique en outil de reflexion.
    """
    rows = [
        {
            "word": a.word,
            "score": float(a.score),
            "isHint": a.is_hint,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in game.attempts
    ]
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


def serialize_game(game: Game, user: User) -> dict:
    """Etat d'une partie. Le mot secret n'est inclus qu'apres victoire."""
    return {
        "gameId": game.id,
        "mode": game.mode,
        "completed": game.completed,
        "attemptsCount": game.attempts_count,
        "hintsUsed": game.hints_used,
        "bestScore": float(game.best_score) if game.best_score is not None else None,
        "nextHintCost": next_hint_cost(game),
        "currency": user.hint_currency,
        "attempts": serialize_attempts(game),
        # jamais avant la resolution
        "secretWord": game.secret_word.word if game.completed else None,
    }


def next_hint_cost(game: Game) -> int | None:
    """Cout du prochain indice, None si les 5 sont epuises."""
    nxt = game.hints_used + 1
    return HINT_COST.get(nxt) if nxt <= MAX_HINTS else None


def get_owned_game(db: Session, game_id: str, user: User) -> Game:
    game = db.get(Game, game_id)
    if game is None or game.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Partie introuvable")
    return game


# --------------------------------------------------------------------------
# Proposer un mot
# --------------------------------------------------------------------------

def submit_guess(db: Session, game: Game, user: User, word: str) -> dict:
    if game.completed:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Partie deja terminee")

    if not normalize_key(word):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mot vide")

    secret = game.secret_word.word
    result = similarity.score_guess(secret, word)

    if result["error"]:
        # mot hors vocabulaire : ce n'est pas un essai, rien n'est persiste
        return {"word": result["word"], "score": None, "error": result["error"],
                "alreadyTried": False, "game": serialize_game(game, user)}

    # On travaille sur la forme canonique : « elephant » et « éléphant » sont
    # la meme proposition, et ne doivent compter qu'une fois.
    guess = result["word"]
    score = result["score"]

    # Deja propose : on ne recompte pas d'essai, on renvoie le score connu.
    # Sinon un joueur gonflerait ses statistiques en rejouant le meme mot.
    existing = next((a for a in game.attempts if a.word == guess), None)
    if existing is not None:
        return {
            "word": guess, "score": float(existing.score), "isHint": existing.is_hint,
            "alreadyTried": True, "error": None,
            "game": serialize_game(game, user),
        }

    db.add(Attempt(game_id=game.id, word=guess, score=score, is_hint=False))
    game.attempts_count += 1
    if game.best_score is None or score > float(game.best_score):
        game.best_score = score

    won = similarity.same_word(guess, secret)
    if won:
        _complete(db, game, user)

    db.commit()
    db.refresh(game)

    payload = {
        "word": guess, "score": score, "isHint": False,
        "alreadyTried": False, "error": None,
        "game": serialize_game(game, user),
    }
    if won:
        payload["victory"] = build_victory(db, game, user)
    return payload


# --------------------------------------------------------------------------
# Acheter un indice
# --------------------------------------------------------------------------

def buy_hint(db: Session, game: Game, user: User) -> dict:
    """Debite la monnaie et revele l'indice suivant.

    Les indices sont precalcules (scripts/precompute_hints.py) : aucun calcul
    semantique ici. Ils rejoignent la meme liste que les propositions mais ne
    comptent pas comme des essais (section 8).
    """
    if game.completed:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Partie deja terminee")

    rank = game.hints_used + 1
    if rank > MAX_HINTS:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Les 5 indices sont epuises")

    cost = HINT_COST[rank]
    if user.hint_currency < cost:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                            detail=f"Il faut {cost} indices, tu en as {user.hint_currency}")

    hint = (
        db.query(Hint)
        .filter(Hint.secret_word_id == game.secret_word_id, Hint.rank == rank)
        .first()
    )
    if hint is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Indices non calcules pour ce mot")

    user.hint_currency -= cost
    game.hints_used = rank

    # Si le joueur avait deja trouve ce mot tout seul, on le marque comme
    # indice sans le dupliquer : la contrainte d'unicite l'interdirait.
    existing = next((a for a in game.attempts if a.word == hint.word), None)
    if existing is not None:
        existing.is_hint = True
    else:
        db.add(Attempt(game_id=game.id, word=hint.word, score=hint.score, is_hint=True))
        if game.best_score is None or float(hint.score) > float(game.best_score):
            game.best_score = hint.score

    db.commit()
    db.refresh(game)

    return {
        "hint": {"word": hint.word, "score": float(hint.score), "rank": rank},
        "cost": cost,
        "game": serialize_game(game, user),
    }


# --------------------------------------------------------------------------
# Victoire
# --------------------------------------------------------------------------

def _complete(db: Session, game: Game, user: User) -> None:
    game.completed = True
    game.completed_at = datetime.now(timezone.utc)
    game.best_score = 100

    if game.mode == "daily":
        _record_daily_result(db, game, user)


def _record_daily_result(db: Session, game: Game, user: User) -> None:
    """Fige le resultat pour le percentile, met a jour la serie et la monnaie."""
    already = (
        db.query(DailyResult)
        .filter(DailyResult.daily_word_id == game.daily_word_id,
                DailyResult.user_id == user.id)
        .first()
    )
    if already is not None:
        return

    db.add(DailyResult(
        daily_word_id=game.daily_word_id,
        user_id=user.id,
        attempts_count=game.attempts_count,
        hints_used=game.hints_used,
    ))

    played_on = game.daily_word.date
    previous = user.last_daily_played_on

    if previous is None:
        user.streak_current = 1
    elif (played_on - previous).days == 1:
        user.streak_current += 1
    elif (played_on - previous).days > 1:
        user.streak_current = 1
    # meme jour : la serie ne bouge pas

    user.last_daily_played_on = played_on
    user.streak_best = max(user.streak_best, user.streak_current)

    user.hint_currency += DAILY_REWARD
    if user.streak_current % STREAK_BONUS_EVERY == 0:
        user.hint_currency += STREAK_BONUS_AMOUNT


def build_victory(db: Session, game: Game, user: User) -> dict:
    """Ecran de victoire (section 10). Le percentile est la metrique principale."""
    payload = {
        "secretWord": game.secret_word.word,
        "attempts": game.attempts_count,
        "hints": game.hints_used,
        "streak": user.streak_current,
        "currency": user.hint_currency,
    }

    if game.mode == "daily":
        payload.update(daily_stats(db, game.daily_word_id, game.attempts_count))
        payload["dailyNumber"] = game.daily_word.number
    else:
        payload["planetId"] = game.campaign_level.planet_id
        payload["levelNumber"] = game.campaign_level.level_number

    return payload


def daily_stats(db: Session, daily_word_id: int, my_attempts: int) -> dict:
    """Percentile et mediane du jour.

    On prend la mediane et non la moyenne (section 11) : un joueur a 300 essais
    deformerait la moyenne au point de la rendre inutile.
    """
    rows = [
        r[0] for r in db.query(DailyResult.attempts_count)
        .filter(DailyResult.daily_word_id == daily_word_id)
        .all()
    ]
    total = len(rows)
    if total == 0:
        return {"percentile": None, "median": None, "playersCount": 0}

    # « mieux que X % » = part des joueurs ayant eu besoin de plus d'essais
    better_than = sum(1 for a in rows if a > my_attempts)
    percentile = round(better_than / total * 100)

    rows.sort()
    mid = total // 2
    median = rows[mid] if total % 2 else (rows[mid - 1] + rows[mid]) / 2

    return {"percentile": percentile, "median": round(median, 1), "playersCount": total}
