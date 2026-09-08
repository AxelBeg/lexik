"""Regenere les deux listes de vocabulaire depuis Lexique383.

    python -m scripts.build_word_lists

## Pourquoi ce script existe

Les listes heritees de LexiFight avaient subi une depluralisation naive : un
`s` final systematiquement retire. Consequence, tous les noms invariables en
-s / -x / -z etaient soit mutiles, soit absents :

    ours   -> « our »     (mot inexistant, et jouable)
    souris -> « souri »   (idem)
    pays, corps, tapis, fois, prix, bois, poids, choix, voix, nez, riz, gaz
           -> purement absents

Sur 35 657 mots, 6 seulement se terminaient par un `s`. Un joueur qui tapait
« ours » recevait « Mot inconnu » — la pire friction possible : il croit avoir
mal ecrit, ou que le jeu est casse.

## Ce que le script produit

playable_words.json   ce que le joueur a le DROIT de taper. Large.
hint_words.json       ou l'on PIOCHE indices et mots secrets. Etroit et courant.

La source est Lexique383, qui porte le lemme, la categorie grammaticale et le
nombre : plus besoin de deviner le singulier en coupant des lettres.

## Limite assumee

Seules les formes de base sont acceptees (singulier, infinitif, masculin).
« chiens » sera refuse alors que « chien » passe. Accepter les formes flechies
en les ramenant a leur lemme serait un vrai gain de confort, mais demande une
table de correspondance nettement plus grosse — a traiter separement.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from utils.const import DATA_DIR
from utils.helpers import display_word, normalize_key
from utils.wordfilter import is_excluded

# Categories acceptees comme proposition. On garde les mots pleins : noms,
# adjectifs, verbes, adverbes. Les mots grammaticaux (articles, prepositions,
# pronoms) n'ont pas de voisinage semantique exploitable et pollueraient la
# carte du joueur.
PLAYABLE_POS = {"NOM", "ADJ", "VER", "ADV"}

# Les indices et les mots secrets viennent d'un sous-ensemble plus etroit :
# noms et adjectifs uniquement, et seulement s'ils sont courants.
HINT_POS = {"NOM", "ADJ"}

# Frequence minimale pour entrer dans le reservoir d'indices, exigee dans les
# DEUX registres (films et livres) : c'est ce qui ecarte l'argot de sous-titres
# et les archaismes livresques.
HINT_MIN_FREQ = 0.5

WORD_RE = re.compile(r"^[a-zà-öø-ÿœæ][a-zà-öø-ÿœæ\-]{1,19}$")


def load_lexique(path: Path) -> tuple[set[str], set[str]]:
    """Renvoie (formes jouables, candidats indices), en formes canoniques."""
    playable: dict[str, str] = {}
    hints: dict[str, str] = {}

    with open(path, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}

        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < len(header):
                continue

            pos = parts[col["cgram"]]
            if pos not in PLAYABLE_POS:
                continue

            # islem = la graphie EST la forme de base du lemme. C'est ce qui
            # donne « ours » et « souris » tels quels, sans decouper de `s`.
            if parts[col["islem"]] != "1":
                continue

            ortho = parts[col["ortho"]].lower().strip()
            if not WORD_RE.match(ortho):
                continue

            def num(name: str) -> float:
                try:
                    return float(parts[col[name]])
                except (ValueError, IndexError):
                    return 0.0

            films, livres = num("freqlemfilms2"), num("freqlemlivres")
            if films + livres <= 0:
                continue

            word = display_word(ortho)
            key = normalize_key(word)
            if not key:
                continue

            playable.setdefault(key, word)

            # Le filtre ne s'applique qu'aux indices : le joueur garde le
            # droit de taper ce qu'il veut, on choisit seulement ce que le jeu
            # lui PROPOSE.
            if (pos in HINT_POS
                    and min(films, livres) >= HINT_MIN_FREQ
                    and not is_excluded(key)):
                hints.setdefault(key, word)

    return set(playable.values()), set(hints.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lexique", default=str(DATA_DIR / "Lexique383.tsv"))
    args = parser.parse_args()

    print(f"Lecture de {args.lexique}...")
    playable, hints = load_lexique(Path(args.lexique))

    for name, words in (("playable_words.json", playable), ("hint_words.json", hints)):
        out = DATA_DIR / name
        ordered = sorted(words)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(ordered, f, ensure_ascii=False, indent=0)
        ends_s = sum(1 for w in ordered if w.endswith(("s", "x", "z")))
        print(f"  {name:22} {len(ordered):6} mots   ({ends_s} invariables en -s/-x/-z)")

    print("\nControle sur les mots qui etaient casses :")
    for w in ["ours", "souris", "pays", "corps", "tapis", "fois", "prix",
              "bois", "poids", "choix", "voix", "nez", "riz", "gaz",
              "our", "souri"]:
        mark = "OK    " if w in playable else "ABSENT"
        note = "  <- doit rester absent" if w in ("our", "souri") else ""
        print(f"  {mark} {w}{note}")

    print("\nRelancer ensuite :")
    print("  python -m scripts.build_campaign_words")
    print("  python -m scripts.seed_campaign ...")
    print("  python -m scripts.precompute_hints --force")


if __name__ == "__main__":
    main()
