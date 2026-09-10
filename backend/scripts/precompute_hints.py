"""Precalcule les 5 indices de chaque mot secret.

C'est la seule operation couteuse du moteur (produit matriciel sur tout le
vocabulaire). Elle tourne ici, hors ligne, et jamais pendant une partie : au
runtime, acheter un indice n'est qu'une lecture en base.

    python -m scripts.precompute_hints            # les mots sans indices
    python -m scripts.precompute_hints --force    # tout recalculer

Les indices sont des mots semantiquement proches, jamais des lettres
(prompt_base.txt section 6), et doivent former une progression : chacun apporte
une information nouvelle et rapproche reellement (section 7). Un choix naif
(« les 5 plus proches ») donnerait cinq synonymes quasi identiques, donc un
seul indice paye cinq fois.
"""

from __future__ import annotations

import argparse

from database.database import SessionLocal
from database.models import Hint, SecretWord
from services import similarity
from utils.const import MAX_HINTS
from utils.wordfilter import same_family

# Paliers de score vises, du plus eloigne au plus proche. On cherche le mot le
# plus proche de chaque palier plutot que le top 5 : c'est ce qui garantit une
# vraie progression 62 -> 74 -> 84 -> 92 -> 97 (section 7).
TARGET_SCORES = [62, 74, 84, 92, 97]

# Deux indices trop semblables entre eux n'apportent qu'une information : on
# rejette un candidat trop proche d'un indice deja retenu.
#
# Ce seuil ne suffit pas seul : « miraculé » et « miraculeux » ont beau etre le
# meme mot, le modele les separe assez pour passer sous 88. La parente
# orthographique est verifiee a part, par same_family.
MAX_INTER_HINT_SCORE = 88

# Profondeur du classement de voisins dans laquelle on choisit. Doit etre assez
# grande pour que le palier le plus bas (62) soit represente.
CANDIDATE_POOL = 5000


def _too_similar(candidate: str, chosen: list[str]) -> bool:
    for word in chosen:
        if same_family(candidate, word):
            return True
        if similarity.to_game_score(similarity.raw_cosine(candidate, word)) > MAX_INTER_HINT_SCORE:
            return True
    return False


def select_hints(secret: str) -> list[tuple[str, float]]:
    """Choisit 5 indices etages, du plus lointain au plus proche."""
    # Pool large et non « top 400 » : les 400 plus proches voisins d'un mot sont
    # TOUS tres proches (scores 90+), donc les paliers bas — 62, 74 — y sont
    # inatteignables et les cinq indices se tassent au meme niveau. Il faut
    # descendre bien plus bas dans le classement pour couvrir toute l'echelle.
    candidates = [
        (word, score) for word, score in similarity.nearest(secret, k=CANDIDATE_POOL, pool=similarity.POOL_HINTS)
        # Un mot presque identique au secret le donnerait : on l'ecarte. Y
        # compris quand la ressemblance n'est pas une inclusion de chaine —
        # « miraculeux » ne contient pas « miracle », mais l'annonce.
        if score < 99 and not same_family(secret, word)
    ]
    if not candidates:
        return []

    chosen: list[tuple[str, float]] = []
    used: set[str] = set()

    for target in TARGET_SCORES:
        pool = sorted(
            (c for c in candidates if c[0] not in used),
            key=lambda c: abs(c[1] - target),
        )
        for word, score in pool:
            if _too_similar(word, [w for w, _ in chosen]):
                continue
            chosen.append((word, score))
            used.add(word)
            break

    # score croissant : l'indice 1 est le plus eloigne
    chosen.sort(key=lambda c: c[1])
    return chosen[:MAX_HINTS]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="recalcule meme les mots qui ont deja des indices")
    args = parser.parse_args()

    print("Chargement du modele et de la matrice des candidats indices...")
    similarity.preload(matrices=(similarity.POOL_HINTS,))

    db = SessionLocal()
    try:
        words = db.query(SecretWord).order_by(SecretWord.id).all()
        todo = words if args.force else [w for w in words if len(w.hints) < MAX_HINTS]
        print(f"{len(todo)} mot(s) a traiter sur {len(words)}.")

        for i, secret in enumerate(todo, 1):
            hints = select_hints(secret.word)
            if len(hints) < MAX_HINTS:
                print(f"  [!] {secret.word} : seulement {len(hints)} indices trouves, ignore")
                continue

            db.query(Hint).filter(Hint.secret_word_id == secret.id).delete()
            for rank, (word, score) in enumerate(hints, 1):
                db.add(Hint(secret_word_id=secret.id, rank=rank, word=word, score=score))
            db.commit()

            trace = " -> ".join(f"{w} {s:.0f}" for w, s in hints)
            print(f"  [{i}/{len(todo)}] {secret.word} : {trace}")

        print("Termine.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
