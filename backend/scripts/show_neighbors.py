"""Affiche le voisinage semantique d'un mot secret, pour le travail editorial.

    python -m scripts.show_neighbors trèfle          # les 100 voisins
    python -m scripts.show_neighbors trèfle -n 20    # les 20 premiers
    python -m scripts.show_neighbors --weak          # tous les mots sous le seuil

Sans `--export`, rien n'est ecrit : la sortie est faite pour etre lue dans le
terminal. `--export FICHIER` ecrit en JSON ce qui aurait ete affiche, donc il se
combine avec la selection :

    python -m scripts.show_neighbors --export tout.json           # la campagne
    python -m scripts.show_neighbors --weak --export faibles.json # les faibles
    python -m scripts.show_neighbors trèfle --export trefle.json  # un mot

Le fichier porte quatre vues des memes donnees :

    neighbors   mot -> ses 100 voisins (rank, word, score, hint)
    top1        mot -> son meilleur voisin, du plus FAIBLE au plus fort
    overlaps    les paires de mots de campagne trop proches, les pires d'abord
    groups      les familles de mots qui se citent mutuellement

Ces trois-la servent a juger la LISTE et non un mot : `top1` en tete montre les
mots que le modele connait mal, `overlaps` et `groups` montrent les mots de
campagne qui font deux fois le meme puzzle.

Lit la table `neighbors`, remplie par rebuild_campaign : aucun modele charge,
donc reponse immediate. Un mot absent de la table n'a pas encore ete calcule.

A quoi ca sert : juger un mot de campagne sans y jouer. Un bon mot a un
voisinage dense et coherent — dix mots au-dessus de 90, tous du meme champ. Un
mauvais mot se voit tout de suite : soit le classement plafonne bas (le modele
ne connait pas le mot), soit il melange deux champs sans rapport (polysemie),
et dans les deux cas les cinq indices n'apprendront rien.
"""

from __future__ import annotations

import argparse
import itertools
import json

from database.database import SessionLocal
from database.models import CampaignLevel, Hint, Neighbor, SecretWord
from utils.const import MAX_HINTS
from utils.helpers import normalize_key

WEAK_HINT_SCORE = 85


def load(db, secret: SecretWord, count: int) -> list[tuple[int, str, float, bool]]:
    """Les voisins du mot, marques de ceux qui servent d'indice."""
    hints = {
        normalize_key(h.word)
        for h in db.query(Hint).filter(Hint.secret_word_id == secret.id)
    }
    rows = (
        db.query(Neighbor)
        .filter(Neighbor.secret_word_id == secret.id)
        .order_by(Neighbor.rank)
        .limit(count)
        .all()
    )
    return [(r.rank, r.word, float(r.score), normalize_key(r.word) in hints) for r in rows]


def build_export(voisinages: dict[str, list], min_shared: int,
                 group_score: float) -> dict:
    """Le fichier d'export, en quatre vues des memes donnees.

    `neighbors` sert a examiner un mot ; les trois autres servent a examiner la
    LISTE, ce que la premiere ne permet pas — il faudrait comparer 180 blocs de
    cent lignes a l'oeil.

    `top1` trie les mots par la force de leur meilleur voisin, du plus faible au
    plus fort. En tete se trouvent les mots que le modele connait mal : leur
    voisinage plafonne bas, donc leurs cinq indices se valent.

    `overlaps` designe les paires de mots de campagne trop proches : deux mots
    dont les voisinages se recouvrent sont deux fois le meme puzzle, et le
    second n'apprend rien de plus que le premier. Deux mesures, car elles ne
    disent pas la meme chose :

      score / ranks — chacun figure dans le top 100 de l'autre. C'est le cas
        grave : le mot est litteralement une proposition gagnante du voisin.
      shared        — nombre de voisins communs sur 100. Deux mots peuvent ne
        jamais se citer et couvrir le meme champ.

    `groups` remonte les familles : si A et B se citent et B et C aussi, les
    trois forment un seul puzzle repete. C'est ce qu'une liste de paires cache.
    """
    neighbors = {
        word: [
            {"rank": r, "word": w, "score": s, "hint": h}
            for r, w, s, h in rows
        ]
        for word, rows in voisinages.items()
    }

    top1 = {}
    for word, rows in sorted(
        voisinages.items(),
        key=lambda kv: kv[1][0][2] if kv[1] else 0,
    ):
        if not rows:
            continue
        _, best_word, best_score, _ = rows[0]
        top1[word] = {"top1_word": best_word, "top1_score": best_score}

    # voisin -> (rang, score) pour chaque mot secret, pour interroger les
    # positions croisees sans reparcourir les listes
    index = {
        word: {n: (r, s) for r, n, s, _ in rows}
        for word, rows in voisinages.items()
    }

    overlaps = []
    for a, b in itertools.combinations(sorted(voisinages), 2):
        a_in_b = index[b].get(a)     # position de a dans le top 100 de b
        b_in_a = index[a].get(b)
        shared = set(index[a]) & set(index[b])

        if not a_in_b and not b_in_a and len(shared) < min_shared:
            continue

        # Le cosinus est symetrique : le score est le meme dans les deux sens,
        # seuls les rangs different. On prend celui qu'on a.
        score = (a_in_b or b_in_a or (None, None))[1]
        overlaps.append({
            "words": [a, b],
            "score": score,
            "mutual": bool(a_in_b and b_in_a),
            "ranks": {
                a: a_in_b[0] if a_in_b else None,
                b: b_in_a[0] if b_in_a else None,
            },
            "shared": len(shared)
        })

    overlaps.sort(key=lambda o: (-(o["score"] or 0), -o["shared"]))

    return {
        "neighbors": neighbors,
        "top1": top1,
        "overlaps": overlaps,
        "groups": build_groups(overlaps, group_score),
    }


def build_groups(overlaps: list[dict], min_score: float) -> list[list[str]]:
    """Les familles de mots qui font le meme puzzle.

    Une liste de paires ne montre pas qu'un troisieme mot ferme le triangle :
    volaille/poulet, poulet/dinde et dinde/volaille sont trois lignes, mais un
    seul probleme — resoudre l'un donne la carte semantique des deux autres.

    Le seuil de score n'est pas un reglage de confort, il decide si la sortie
    veut dire quelque chose. Relier sur la seule presence mutuelle dans les top
    100 parait raisonnable et ne l'est pas : c'est si courant que la fermeture
    transitive ramene 138 mots sur 180 dans une famille unique, qui ne designe
    plus rien. A 90+, un mot est presque une proposition gagnante de l'autre, et
    les familles retombent sur ce qu'on cherchait.
    """
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for overlap in overlaps:
        if not overlap["mutual"] or (overlap["score"] or 0) < min_score:
            continue
        a, b = overlap["words"]
        parent[find(a)] = find(b)

    families: dict[str, list[str]] = {}
    for word in parent:
        families.setdefault(find(word), []).append(word)

    return sorted(
        (sorted(members) for members in families.values() if len(members) > 1),
        key=lambda members: (-len(members), members[0]),
    )


def show(db, secret: SecretWord, count: int, columns: int = 2) -> None:
    rows = load(db, secret, count)
    if not rows:
        print(f"{secret.word} : aucun voisin calcule. "
              f"Lancer python -m scripts.rebuild_campaign")
        return

    hints = (
        db.query(Hint).filter(Hint.secret_word_id == secret.id)
        .order_by(Hint.rank).all()
    )
    trace = " -> ".join(f"{h.word} {float(h.score):.0f}" for h in hints)

    print(f"\n{secret.word.upper()}  ({len(rows)} voisins, "
          f"{rows[0][2]:.0f} -> {rows[-1][2]:.0f})")
    print(f"  indices : {trace or 'aucun'}")
    if len(hints) < MAX_HINTS:
        print(f"  [!] seulement {len(hints)} indices sur {MAX_HINTS}")
    print()

    # Deux colonnes : cent lignes a la verticale ne se lisent pas d'un coup
    # d'oeil, et c'est exactement ce qu'on cherche a faire ici.
    half = (len(rows) + columns - 1) // columns
    for i in range(half):
        line = []
        for c in range(columns):
            k = i + c * half
            if k >= len(rows):
                continue
            rank, word, score, is_hint = rows[k]
            mark = "*" if is_hint else " "
            line.append(f"{rank:>4}{mark} {word:<20}{score:>6.1f}")
        print("   ".join(line))
    print("\n  * = sert d'indice")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("words", nargs="*", help="mots a inspecter")
    parser.add_argument("-n", "--count", type=int, default=100)
    parser.add_argument("--weak", action="store_true",
                        help="tous les mots de campagne sous le seuil de qualite")
    parser.add_argument("--export", metavar="FICHIER",
                        help="ecrit la selection en JSON (voir l'entete du module)")
    parser.add_argument("--min-shared", type=int, default=15, metavar="N",
                        help="section overlaps : nombre de voisins communs a partir "
                             "duquel signaler une paire (defaut 15). Les paires qui "
                             "se citent l'une l'autre sont retenues quel qu'il soit.")
    parser.add_argument("--group-score", type=float, default=90.0, metavar="S",
                        help="section groups : score mutuel a partir duquel deux mots "
                             "sont relies (defaut 90 ; plus bas, tout se relie a tout)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        campaign_ids = {
            row[0] for row in db.query(CampaignLevel.secret_word_id).distinct()
        }

        # La selection est calculee une fois, et seulement ensuite on decide
        # quoi en faire. `--export` s'applique donc a ce qui est selectionne :
        # un mot, les mots faibles, ou toute la campagne par defaut.
        if args.words:
            targets = []
            for word in args.words:
                key = normalize_key(word)
                secret = next(
                    (s for s in db.query(SecretWord).all()
                     if normalize_key(s.word) == key),
                    None,
                )
                if secret is None:
                    print(f"{word} : pas un mot secret de la base.")
                    continue
                targets.append(secret)
        elif args.weak:
            scored = []
            for secret in db.query(SecretWord).order_by(SecretWord.word):
                if secret.id not in campaign_ids or not secret.hints:
                    continue
                best = max(float(h.score) for h in secret.hints)
                if best < WEAK_HINT_SCORE:
                    scored.append((best, secret))
            targets = [s for _, s in sorted(scored, key=lambda x: x[0])]
        elif args.export:
            targets = [
                s for s in db.query(SecretWord).order_by(SecretWord.word)
                if s.id in campaign_ids
            ]
        else:
            raise SystemExit("Donner un mot, ou --weak, ou --export.")

        if args.export:
            data = build_export(
                {secret.word: load(db, secret, args.count) for secret in targets},
                args.min_shared,
                args.group_score,
            )
            with open(args.export, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"{len(data['neighbors'])} mot(s), "
                  f"{len(data['overlaps'])} paire(s) trop proches, "
                  f"{len(data['groups'])} famille(s) — ecrit dans {args.export}")
            return

        for secret in targets:
            show(db, secret, args.count)
        if args.weak:
            print(f"\n{len(targets)} mot(s) de campagne sous {WEAK_HINT_SCORE}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
