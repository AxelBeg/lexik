"""Deroulement d'une partie : proposer un mot, acheter un indice, gagner.

Toute la logique vit ici et nulle part ailleurs. Le client ne calcule aucun
score, ne decide d'aucune victoire et ne debite aucune monnaie : il affiche ce
que ces fonctions renvoient (prompt_base.txt section 20).
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from database.models import Attempt, DailyResult, Game, Hint, Neighbor, User
from services import similarity
from utils.const import (
    DAILY_REWARD, HINT_COST, MAX_HINTS, NEIGHBORS_REVEALED, STREAK_BONUS_AMOUNT,
    STREAK_BONUS_EVERY,
)
from utils.helpers import normalize_key
from utils.wordfilter import same_family


# --------------------------------------------------------------------------
# Rang parmi les voisins
# --------------------------------------------------------------------------

# Le classement des voisins d'un mot secret est fige des le precalcul : on le
# garde en memoire plutot que de relire mille lignes a chaque proposition.
#
# Consequence a connaitre : un `rebuild_campaign` exige un redemarrage du
# serveur pour que les nouveaux rangs sortent. C'est deja vrai du modele et des
# listes de vocabulaire, charges une fois au demarrage.
#
# Borne, parce que l'ensemble des mots secrets ne l'est pas : les 180 mots de
# campagne sont fixes, mais il s'ajoute un mot du jour par jour, et une partie
# ancienne reste consultable. Sans plafond, un serveur qui tourne un an finit
# par tenir en memoire un millier de voisins pour chaque mot jamais joue.
_RANKS_CACHE_MAX = 256
_ranks_cache: OrderedDict[int, dict[str, int]] = OrderedDict()


def neighbor_ranks(db: Session, secret_word_id: int) -> dict[str, int]:
    """Cle depouillee -> rang, pour les N mots les plus proches du secret.

    Indexe sur la cle et non sur la forme affichee : les voisins sortent du
    modele, les propositions de la saisie du joueur, et « ecoles » doit
    retrouver « écoles » (meme raison que dans `serialize_neighbors`).
    """
    cached = _ranks_cache.get(secret_word_id)
    if cached is not None:
        _ranks_cache.move_to_end(secret_word_id)
        return cached

    rows = (
        db.query(Neighbor.word, Neighbor.rank)
        .filter(Neighbor.secret_word_id == secret_word_id)
        .all()
    )
    ranks = {normalize_key(word): rank for word, rank in rows}
    # Une base sans `precompute_neighbors` renverrait un dictionnaire vide : ne
    # pas le mettre en cache, sinon le precalcul lance ensuite resterait
    # invisible jusqu'au redemarrage suivant.
    if ranks:
        _ranks_cache[secret_word_id] = ranks
        while len(_ranks_cache) > _RANKS_CACHE_MAX:
            _ranks_cache.popitem(last=False)
    return ranks


# --------------------------------------------------------------------------
# Lecture
# --------------------------------------------------------------------------

def serialize_attempts(game: Game, ranks: dict[str, int]) -> list[dict]:
    """La carte semantique du joueur, triee par proximite decroissante.

    Le tri par score et non par ordre chronologique est une regle de gameplay,
    pas un detail d'affichage (section 4) : c'est ce qui transforme
    l'historique en outil de reflexion.

    `rank` est nul pour un mot hors du vivier : la plupart des propositions
    d'un joueur qui cherche encore sont dans ce cas, et c'est voulu. Le rang
    n'apparait que lorsqu'on entre dans le voisinage, et cette APPARITION est
    l'information — le moment ou le joueur passe de « je tatonne » a « je suis
    dans la bonne region ».
    """
    rows = [
        {
            "word": a.word,
            "score": float(a.score),
            "isHint": a.is_hint,
            "rank": ranks.get(normalize_key(a.word)),
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in game.attempts
    ]
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


def serialize_game(db: Session, game: Game, user: User) -> dict:
    """Etat d'une partie. Le mot secret n'est inclus qu'apres victoire."""
    ranks = neighbor_ranks(db, game.secret_word_id)
    return {
        "gameId": game.id,
        "mode": game.mode,
        "completed": game.completed,
        "attemptsCount": game.attempts_count,
        "hintsUsed": game.hints_used,
        "bestScore": float(game.best_score) if game.best_score is not None else None,
        "nextHintCost": next_hint_cost(game),
        "currency": user.hint_currency,
        "attempts": serialize_attempts(game, ranks),
        # Taille reelle du vivier, pas la constante : un mot peut en avoir moins
        # si le modele lui connait peu de voisins, et « 312e sur 1000 » serait
        # alors un mensonge. Nul si le precalcul n'a pas tourne — le client
        # masque simplement le rang.
        "neighborsTotal": len(ranks) or None,
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
                "alreadyTried": False, "game": serialize_game(db, game, user)}

    # On travaille sur la forme canonique : « elephant » et « éléphant » sont
    # la meme proposition, et ne doivent compter qu'une fois.
    guess = result["word"]
    score = result["score"]
    rank = neighbor_ranks(db, game.secret_word_id).get(normalize_key(guess))

    # Deja propose : on ne recompte pas d'essai, on renvoie le score connu.
    # Sinon un joueur gonflerait ses statistiques en rejouant le meme mot.
    existing = next((a for a in game.attempts if a.word == guess), None)
    if existing is not None:
        return {
            "word": guess, "score": float(existing.score), "isHint": existing.is_hint,
            "rank": rank, "alreadyTried": True, "error": None,
            "game": serialize_game(db, game, user),
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
        "word": guess, "score": score, "isHint": False, "rank": rank,
        "alreadyTried": False, "error": None,
        "game": serialize_game(db, game, user),
    }
    if won:
        payload["victory"] = build_victory(db, game, user)
    return payload


# --------------------------------------------------------------------------
# Acheter un indice
# --------------------------------------------------------------------------

# Un indice de remplacement ne doit pas etre un synonyme d'un indice deja
# revele, meme regle qu'au precalcul (scripts/precompute_hints.py).
MAX_INTER_HINT_SCORE = 88


def _substitute_hint(db: Session, game: Game, target: float) -> tuple[str, float] | None:
    """Un indice de secours quand le mot precalcule est deja sur la carte.

    Le joueur paie : il doit apprendre quelque chose. Rendre un mot qu'il a
    trouve seul, c'est encaisser sans rien donner — et ca frappe d'autant plus
    fort qu'on joue bien, puisque plus on approche, plus on risque d'avoir deja
    propose l'indice.

    On repioche donc dans les voisins precalcules, en leur imposant le filtre
    des indices :

    - `is_hint_word` : nom ou adjectif courant. Depuis que le classement des
      voisins couvre tout le vocabulaire jouable, un voisin quelconque peut
      etre un verbe ou un mot rare, qui ferait un mauvais indice ;
    - hors famille du secret, sous 99 : ne pas donner le mot ;
    - assez loin des indices deja reveles : deux synonymes payes deux fois ne
      font qu'une information.

    A score egal on prefere le voisin JUSTE AU-DESSUS de la cible : le joueur a
    paye, il doit avancer, pas reculer. En dessous seulement s'il n'y a rien
    au-dessus.
    """
    tried = {normalize_key(a.word) for a in game.attempts}
    revealed = [a.word for a in game.attempts if a.is_hint]
    secret = game.secret_word.word

    rows = (
        db.query(Neighbor.word, Neighbor.score)
        .filter(Neighbor.secret_word_id == game.secret_word_id)
        .all()
    )

    candidates = [
        (word, float(score)) for word, score in rows
        if normalize_key(word) not in tried
        and float(score) < 99
        and similarity.is_hint_word(word)
        and not same_family(secret, word)
    ]
    if not candidates:
        return None

    # Au-dessus d'abord, du plus proche de la cible au plus lointain ; puis en
    # dessous, meme ordre. Le premier qui n'est pas un doublon d'un indice deja
    # donne l'emporte.
    above = sorted((c for c in candidates if c[1] >= target), key=lambda c: c[1] - target)
    below = sorted((c for c in candidates if c[1] < target), key=lambda c: target - c[1])

    for word, score in above + below:
        if any(same_family(word, r) for r in revealed):
            continue
        if any(similarity.to_game_score(similarity.raw_cosine(word, r)) > MAX_INTER_HINT_SCORE
               for r in revealed):
            continue
        return word, score
    return None


def buy_hint(db: Session, game: Game, user: User) -> dict:
    """Debite la monnaie et revele l'indice suivant.

    Les indices sont precalcules (scripts/precompute_hints.py) : aucun calcul
    semantique ici, sauf quand le mot prevu est deja sur la carte du joueur et
    qu'il faut lui en substituer un autre (`_substitute_hint`). Ils rejoignent
    la meme liste que les propositions mais ne comptent pas comme des essais
    (section 8).
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

    # Comparaison sur la cle depouillee et non sur la chaine : l'indice vient
    # de hint_words.json, la proposition de playable_words.json, et les deux
    # fichiers n'ont pas toujours la meme graphie du meme mot (« maïs » /
    # « mais »). Une egalite stricte y verrait deux mots et poserait deux
    # lignes pour un seul.
    tried = {normalize_key(a.word) for a in game.attempts}

    word, score, substituted = hint.word, float(hint.score), False
    if normalize_key(hint.word) in tried:
        # Le mot prevu est deja sur la carte : on en cherche un autre plutot
        # que d'encaisser sans rien apprendre au joueur.
        other = _substitute_hint(db, game, float(hint.score))
        if other is None:
            # Aucun candidat : ne rien debiter. Un indice paye qui n'apprend
            # rien est pire qu'un indice indisponible.
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Aucun indice a donner : tu as deja trouve tout ce qui pouvait aider",
            )
        word, score, substituted = other[0], other[1], True

    user.hint_currency -= cost
    game.hints_used = rank

    db.add(Attempt(game_id=game.id, word=word, score=score, is_hint=True))
    if game.best_score is None or score > float(game.best_score):
        game.best_score = score

    # La proposition que le joueur avait trouvee seul n'est PAS retouchee. La
    # voir se changer en ampoule apres coup lui retirerait le merite de
    # l'avoir trouvee, et lui donnerait l'impression d'avoir paye pour un mot
    # qu'il avait deja. Un achat ajoute une ligne, et ne modifie rien de ce
    # qui est deja sur la carte.

    db.commit()
    db.refresh(game)

    return {
        # `rank` est le palier d'indice (1..5), `neighborRank` la place du mot
        # dans le vivier du secret. Deux echelles sans rapport : le troisieme
        # indice peut tres bien etre le 40e voisin.
        "hint": {
            "word": word,
            "score": score,
            "rank": rank,
            # `substituted` dit a l'app que l'indice prevu etait deja trouve et
            # qu'on en a donne un autre. Sans ca, un joueur qui a deja la
            # moitie de la carte ne comprend pas pourquoi ses indices ne
            # suivent pas les paliers annonces.
            "substituted": substituted,
            "neighborRank": neighbor_ranks(db, game.secret_word_id).get(
                normalize_key(word)
            ),
        },
        "cost": cost,
        "game": serialize_game(db, game, user),
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


def serialize_neighbors(db: Session, game: Game) -> list[dict]:
    """Le classement des mots les plus proches du secret, du plus proche au plus
    lointain, marque de ce que le joueur avait trouve.

    N'est appele que par `build_victory`, donc jamais avant que la partie soit
    gagnee : envoye plus tot, ce tableau EST la solution.

    `found` distingue les mots proposes des mots simplement montres, et `hint`
    ceux qui ont ete achetes. Sans cette distinction, le joueur ne verrait pas
    la difference entre ce qu'il a trouve et ce qu'on lui a donne.
    """
    # Les premiers seulement : le vivier stocke va jusqu'a mille pour pouvoir
    # situer une proposition pendant la partie, mais un ecran de victoire de
    # mille lignes ne se lit pas, et se transporte mal.
    rows = (
        db.query(Neighbor)
        .filter(Neighbor.secret_word_id == game.secret_word_id)
        .order_by(Neighbor.rank)
        .limit(NEIGHBORS_REVEALED)
        .all()
    )
    # Comparaison sur la cle depouillee : les voisins sortent du modele, les
    # propositions de la saisie du joueur, et « ecoles » ne doit pas rater
    # « ecoles ». Les indices achetes sont des propositions comme les autres
    # dans `attempts`, avec is_hint a vrai.
    played = {normalize_key(a.word): a for a in game.attempts}

    out = []
    for row in rows:
        attempt = played.get(normalize_key(row.word))
        out.append({
            "rank": row.rank,
            "word": row.word,
            "score": float(row.score),
            "found": attempt is not None and not attempt.is_hint,
            "hint": attempt is not None and attempt.is_hint,
        })
    return out


def build_victory(db: Session, game: Game, user: User) -> dict:
    """Ecran de victoire (section 10). Le percentile est la metrique principale."""
    payload = {
        "secretWord": game.secret_word.word,
        "attempts": game.attempts_count,
        "hints": game.hints_used,
        "streak": user.streak_current,
        "currency": user.hint_currency,
        "neighbors": serialize_neighbors(db, game),
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
