"""Precalcule les N mots les plus proches de chaque mot secret.

Sert deux choses, et la plus importante est la premiere :

1. le RANG pendant la partie. Une proposition qui tombe dans ce vivier est
   situee — « 847e sur 1000 ». C'est ce qui rend le milieu de partie lisible :
   entre 8 et 14, le score ne dit rien, alors que passer de 900e a 300e dit
   tout. Le rang n'est jamais montre pour un mot hors du vivier, et cette
   absence est elle aussi une information.

   D'ou le vivier PLAYABLE et non celui des indices : le rang doit pouvoir
   recompenser tout ce que le joueur a le droit de taper. Classer dans le
   vivier des indices — noms et adjectifs courants — privait de rang les
   6 600 verbes et 1 600 adverbes jouables, quel que soit leur score.

2. la revelation d'apres-partie. Une fois le mot trouve, le joueur voit les
   cent premiers et decouvre ce qu'il n'a pas pense a proposer.

D'ou deux tailles, `NEIGHBORS_STORED` et `NEIGHBORS_REVEALED` : ce script
remplit la premiere, l'ecran de victoire n'en lit que le debut.

    python -m scripts.precompute_neighbors            # les mots sans voisins
    python -m scripts.precompute_neighbors --force    # tout recalculer

Meme raison d'etre hors ligne que precompute_hints : le classement exige la
matrice de tout le vocabulaire jouable
(`preload(matrices=(POOL_PLAYABLE,))`), ~47 Mo de vecteurs plus le modele. Le
serveur de jeu ne fait qu'une lecture en base.

A relancer apres toute modification de la calibration : les scores stockes sont
des scores de jeu, pas des cosinus.
"""

from __future__ import annotations

import argparse

from database.database import Base, SessionLocal, engine
from database.models import Neighbor, SecretWord
from services import similarity
from utils.const import NEIGHBORS_STORED


def select_neighbors(secret: str, count: int) -> list[tuple[str, float]]:
    """Les `count` voisins les plus proches, du plus proche au plus lointain.

    Le classement brut du modele, sans aucun filtre : ni etalement, ni
    diversite, ni rejet des variantes du secret. Le seul mot absent est le
    secret lui-meme, ecarte par `nearest`.

    Les variantes — « fremir » pour « fremissant » — y ont donc leur place, et
    c'est voulu. Les ecarter donnait un signal inverse : le joueur tapait le
    mot le plus brulant de sa partie et n'obtenait aucun rang, alors que
    l'absence de rang veut dire « loin ». Le rang ne montre aucun mot, il
    situe celui que le joueur vient d'ecrire : le classer ne revele rien que
    son score n'ait deja dit.

    Consequence assumee sur la revelation d'apres-partie : elle peut s'ouvrir
    sur une variante du secret. C'est le prix d'un classement qui dit la
    verite pendant la partie, quand elle se joue.
    """
    return similarity.nearest(secret, k=count, pool=similarity.POOL_PLAYABLE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="recalcule meme les mots qui ont deja des voisins")
    parser.add_argument("--count", type=int, default=NEIGHBORS_STORED)
    args = parser.parse_args()

    # La table est recente : la creer ici evite d'imposer un seed complet aux
    # bases existantes, qui ont deja leurs mots et leurs indices.
    Base.metadata.create_all(bind=engine)

    print("Chargement du modele et de la matrice du vocabulaire jouable...")
    similarity.preload(matrices=(similarity.POOL_PLAYABLE,))

    db = SessionLocal()
    try:
        words = db.query(SecretWord).order_by(SecretWord.id).all()
        todo = words if args.force else [w for w in words if len(w.neighbors) < args.count]
        print(f"{len(todo)} mot(s) a traiter sur {len(words)}.")

        for i, secret in enumerate(todo, 1):
            rows = select_neighbors(secret.word, args.count)
            if not rows:
                print(f"  [!] {secret.word} : aucun voisin trouve, ignore")
                continue

            db.query(Neighbor).filter(Neighbor.secret_word_id == secret.id).delete()
            for rank, (word, score) in enumerate(rows, 1):
                db.add(Neighbor(secret_word_id=secret.id, rank=rank, word=word, score=score))
            db.commit()

            head = ", ".join(w for w, _ in rows[:4])
            print(f"  [{i}/{len(todo)}] {secret.word} : {len(rows)} voisins "
                  f"({rows[0][1]:.0f} -> {rows[-1][1]:.0f}) — {head}...")

        print("Termine.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
