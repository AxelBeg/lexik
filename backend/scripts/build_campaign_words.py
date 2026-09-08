"""Genere les 180 mots de la campagne, ordonnes par difficulte croissante.

    python -m scripts.build_campaign_words

L'ordre du fichier produit EST la courbe de difficulte du jeu : les 30 premiers
mots vont sur Terre, les 30 suivants sur Mars, etc.

## Le point important : rare n'est pas difficile

La tentation est de faire monter la difficulte en prenant des mots de plus en
plus rares. C'est une erreur, et le cadrage le dit deja autrement
(docs/prompt-campagne.md, 17 bis) : la difficulte doit venir de la difficulte
SEMANTIQUE, pas de l'obscurite du vocabulaire.

Un mot rare ne rend pas le puzzle plus profond, il le rend injouable : le
joueur ne peut pas formuler ce qu'il ne connait pas, ses scores stagnent sans
qu'il comprenne pourquoi, et le modele lui-meme a mal appris le voisinage d'un
mot peu present dans son corpus. Le joueur n'a pas l'impression de reflechir,
il a l'impression que le jeu triche.

Le reservoir est donc plafonne aux noms communs les plus frequents : tout mot
propose reste reconnaissable. La difficulte vient d'ailleurs :

  abstraction   « liberte » est bien plus dur que « chien » a frequence egale :
                un concept abstrait a un voisinage diffus, qui part dans
                plusieurs directions a la fois ;
  polysemie     un mot a plusieurs sens brouille la direction, puisque son
                vecteur est la moyenne de ses usages ;
  frequence     signal secondaire seulement, pour departager.

Le reglage final ne peut pas venir d'ici : il viendra des statistiques de jeu.
Quand des joueurs auront tourne dessus, le nombre d'essais median par niveau
dira quels mots sont mal places, et il suffira de reordonner le fichier.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from utils.const import DATA_DIR, LEVELS_PER_PLANET, PLANETS
from utils.helpers import display_word, normalize_key
from utils.wordfilter import BLOCKLIST, is_excluded

# Taille du reservoir : les N noms communs les plus frequents. Au-dela, on
# entre dans un vocabulaire que le joueur moyen ne formulera jamais.
POOL_SIZE = 2600

# Frequence minimale, exigee dans les deux registres (films ET livres), en
# occurrences par million. Le seuil est le vrai garde-fou contre l'argot et les
# archaismes : bien plus efficace qu'allonger la liste d'exclusion a la main.
MIN_FREQ_BOTH_REGISTERS = 1.0

# Suffixes de nominalisation : ils marquent presque toujours un concept
# abstrait (« resistance », « purete », « socialisme »), donc un voisinage
# semantique plus diffus qu'un objet du monde.
#
# « -eur », « -oir » et « -erie » ont ete retires apres coup : ils designent
# aussi bien des personnes (docteur, procureur), des lieux (dortoir, manoir,
# boulangerie) que des concepts, et poussaient des mots parfaitement concrets
# en fin de campagne.
ABSTRACT_SUFFIXES = (
    "tion", "sion", "ite", "isme", "ance", "ence", "itude", "esse", "ude",
    "ment",
)

# « -ment » est le suffixe abstrait le plus productif (consentement,
# amusement), mais il coiffe aussi des objets tres concrets qui n'ont rien a
# faire dans les dernieres planetes.
CONCRETE_MENT = {
    "piment", "aliment", "ciment", "moment", "monument", "document",
    "vetement", "medicament", "instrument", "ornement", "sediment",
    "firmament", "fragment", "segment", "pigment", "regiment", "element",
    "appartement", "departement", "batiment", "logement", "compartiment",
    "armement", "equipement", "campement", "revetement", "chargement",
}


def is_abstract(word: str) -> bool:
    key = normalize_key(word)
    if key in CONCRETE_MENT:
        return False
    return any(key.endswith(s) for s in ABSTRACT_SUFFIXES)


def load_nouns(path: Path) -> dict[str, dict]:
    """Noms communs de Lexique383 dont l'orthographe est SANS AMBIGUITE un nom.

    Le filtre sur `cgramortho` est ce qui ecarte « revoir », « relax »,
    « annexe » ou « protege » : des mots dont la graphie est aussi un verbe ou
    un adjectif, et sur lesquels le joueur partirait dans la mauvaise direction
    sans jamais savoir qu'il cherche un nom.
    """
    entries: dict[str, dict] = {}
    homographs: dict[str, int] = defaultdict(int)

    with open(path, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}

        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < len(header):
                continue

            ortho = parts[col["ortho"]].lower()
            homographs[normalize_key(ortho)] += 1

            if parts[col["cgram"]] != "NOM":
                continue
            if parts[col["cgramortho"]] != "NOM":     # graphie non ambigue
                continue
            if parts[col["islem"]] != "1":
                continue
            if parts[col["nombre"]] == "p":
                continue
            if not re.fullmatch(r"[a-zà-öø-ÿœæ]{4,13}", ortho):
                continue

            def num(name: str) -> float:
                try:
                    return float(parts[col[name]])
                except (ValueError, IndexError):
                    return 0.0

            # On exige le mot frequent dans les DEUX registres, et on retient le
            # plus faible des deux. Additionner les frequences laissait passer
            # tout l'argot de sous-titres (« zezette », « negro », « crac ») :
            # tres present a l'oral filme, absent des livres. Prendre le
            # minimum demande au mot d'appartenir au francais commun, ce
            # qu'aucune liste d'exclusion ne saura garantir a la main.
            freq_films = num("freqlemfilms2")
            freq_livres = num("freqlemlivres")
            freq = min(freq_films, freq_livres)
            if freq < MIN_FREQ_BOTH_REGISTERS:
                continue

            key = normalize_key(ortho)
            if is_excluded(key):
                continue

            if key not in entries or freq > entries[key]["freq"]:
                entries[key] = {
                    "word": display_word(ortho),
                    "freq": freq,
                    "syllables": int(num("nbsyll")) or 1,
                }

    for key, entry in entries.items():
        entry["homographs"] = homographs.get(key, 1)

    return entries


def difficulty(entry: dict) -> float:
    """Plus le score est haut, plus le mot est difficile a cerner.

    L'abstraction pese lourd, la frequence peu : a l'interieur d'un reservoir
    deja plafonne, ce qui separe « chien » de « liberte » n'est pas la rarete.
    """
    score = 0.0

    if is_abstract(entry["word"]):
        score += 3.0

    # polysemie : chaque graphie partagee brouille un peu plus la direction
    score += 0.7 * min(entry["homographs"] - 1, 4)

    # frequence, en appoint seulement (echelle log, poids faible)
    score += 0.45 * -math.log(entry["freq"] + 0.5)

    score += 0.1 * max(entry["syllables"] - 2, 0)

    return score


def pick(entries: dict[str, dict], playable: set[str], total: int) -> list[str]:
    """Selectionne `total` mots repartis sur toute l'echelle de difficulte."""
    usable = [
        e for key, e in entries.items()
        if key in playable and key not in BLOCKLIST
    ]
    # plafond de rarete AVANT tout tri sur la difficulte : le reservoir doit
    # rester entierement reconnaissable
    usable.sort(key=lambda e: -e["freq"])
    pool = usable[:POOL_SIZE]

    if len(pool) < total * 4:
        raise SystemExit(f"Reservoir trop maigre : {len(pool)} mots pour {total} niveaux.")

    pool.sort(key=difficulty)

    step = len(pool) / total
    chosen: list[str] = []
    seen_stems: set[str] = set()

    for i in range(total):
        # avance jusqu'a un mot dont la racine n'est pas deja prise, pour eviter
        # « chien » puis « chienne » a deux niveaux d'ecart
        start = int(i * step)
        for offset in range(max(int(step), 1)):
            candidate = pool[min(start + offset, len(pool) - 1)]
            stem = normalize_key(candidate["word"])[:5]
            if stem not in seen_stems:
                seen_stems.add(stem)
                chosen.append(candidate["word"])
                break
        else:
            chosen.append(pool[start]["word"])

    return chosen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lexique", default=str(DATA_DIR / "Lexique383.tsv"))
    parser.add_argument("--playable", default=str(DATA_DIR / "hint_words.json"),
                        help="reservoir de mots acceptables comme solution")
    parser.add_argument("--out", default=str(DATA_DIR / "campaign_words.json"))
    args = parser.parse_args()

    total = len(PLANETS) * LEVELS_PER_PLANET

    print(f"Lecture de {args.lexique}...")
    entries = load_nouns(Path(args.lexique))
    print(f"  {len(entries)} noms communs a graphie non ambigue")

    with open(args.playable, encoding="utf-8") as f:
        playable = {normalize_key(w) for w in json.load(f)}
    print(f"  {len(playable)} mots dans le reservoir jouable")

    words = pick(entries, playable, total)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    print(f"\n{len(words)} mots ecrits dans {args.out}\n")
    for planet in PLANETS:
        offset = (planet["order"] - 1) * LEVELS_PER_PLANET
        chunk = words[offset:offset + LEVELS_PER_PLANET]
        print(f"  {planet['name']:9} {', '.join(chunk[:9])}...")

    print("\nRelire les 180 mots avant de publier : la liste d'exclusion attrape "
          "les familles previsibles, pas tous les cas.")


if __name__ == "__main__":
    main()
