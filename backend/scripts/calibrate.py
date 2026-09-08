"""Calibre la conversion cosinus -> score de jeu 0-100.

Sans cette etape, le score affiche est inutilisable : sur cc.fr.300 deux mots
francais au hasard sont deja a ~0.15 de cosinus, et tout ce qui est reellement
lie se tasse entre 0.45 et 0.85. Un joueur verrait « 45 » pour deux mots sans
aucun rapport.

On echantillonne donc des paires au hasard, on en tire des quantiles, et on
etale la queue haute par morceaux pour que la difference entre « proche » et
« tres proche » reste lisible.

    python -m scripts.calibrate --pairs 200000
"""

from __future__ import annotations

import argparse
import json
import random

import numpy as np

from services import similarity
from utils.const import CALIBRATION_PATH

# percentile de la distribution des paires aleatoires -> score montre au joueur.
# Volontairement non lineaire : 90 % des paires aleatoires n'ont aucun rapport
# et doivent toutes tomber sous 20.
PCT_TO_SCORE = [
    (0.0, 0), (50.0, 8), (80.0, 16), (90.0, 24), (96.0, 36),
    (99.0, 52), (99.7, 68), (99.9, 80), (99.97, 90), (99.995, 96), (100.0, 100),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", type=int, default=200_000)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    similarity.preload()
    vocab = similarity._hint_vocab
    if not vocab:
        raise SystemExit("Vocabulaire vide : verifier data/hint_words.json")

    rng = random.Random(args.seed)
    print(f"Echantillonnage de {args.pairs} paires sur {len(vocab)} mots...")

    cosines = np.empty(args.pairs, dtype=np.float32)
    for i in range(args.pairs):
        a, b = rng.choice(vocab), rng.choice(vocab)
        while b == a:
            b = rng.choice(vocab)
        cosines[i] = similarity.raw_cosine(a, b)
        if (i + 1) % 20_000 == 0:
            print(f"  {i + 1}/{args.pairs}")

    pcts = [p for p, _ in PCT_TO_SCORE]
    scores = [s for _, s in PCT_TO_SCORE]
    cuts = np.percentile(cosines, pcts).tolist()

    # la courbe doit rester strictement croissante pour np.interp
    for i in range(1, len(cuts)):
        cuts[i] = max(cuts[i], cuts[i - 1] + 1e-4)
    cuts[-1] = 1.0

    payload = {
        "pairs": args.pairs,
        "vocabSize": len(vocab),
        "cosines": [round(c, 5) for c in cuts],
        "scores": scores,
    }
    CALIBRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CALIBRATION_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nEcrit dans {CALIBRATION_PATH}")
    for cut, score in zip(payload["cosines"], scores):
        print(f"  cosinus {cut:>7.4f} -> score {score:>3}")


if __name__ == "__main__":
    main()
