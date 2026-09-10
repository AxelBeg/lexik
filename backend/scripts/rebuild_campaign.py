"""Reconstruit toute la campagne a partir de data/campaign_words.json.

    python -m scripts.rebuild_campaign

C'est le script a lancer apres avoir modifie la liste des mots. Il enchaine ce
qui devait etre lance a la main, dans le bon ordre, et repart d'une base propre :

    1. verifie les mots AVANT d'ecrire quoi que ce soit
    2. cree les tables manquantes
    3. reaffecte les 180 niveaux
    4. supprime les parties devenues incoherentes, puis les mots orphelins
    5. vide le cache disque des similarites
    6. recalcule les 5 indices de chaque mot
    7. recalcule les 100 voisins de chaque mot

Le modele est charge UNE fois pour les etapes 6 et 7. Lances separement, les
deux scripts le chargent chacun et reconstruisent chacun la matrice du
vocabulaire : c'est la partie lente, et elle est faite deux fois pour rien.

Options utiles :

    --changed-only          ne recalculer que les mots sans indices ni voisins
    --keep-games            garder les parties des niveaux dont le mot a change
    --schedule-daily N      programmer en plus N jours de mot du jour
    --allow-unknown         semer malgre des mots que le modele ignore
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from database.database import Base, SessionLocal, engine
from database.models import (
    CampaignLevel, DailyWord, Game, Hint, Neighbor, SecretWord,
)
from scripts.precompute_hints import select_hints
from scripts.precompute_neighbors import select_neighbors
from scripts.seed_campaign import schedule_daily, seed_campaign
from services import similarity
from utils.const import (
    CAMPAIGN_WORDS_PATH, HINT_WORDS_PATH, LEVELS_PER_PLANET, MAX_HINTS,
    NEIGHBORS_STORED, PLANETS, SIMILARITY_CACHE_DIR,
)
from utils.helpers import display_word, normalize_key

# En dessous, le mot n'a aucun voisin vraiment proche : les cinq indices se
# tassent au loin, la progression 62 -> 97 ne veut plus rien dire et le joueur
# paie pour du bruit. Ce n'est pas un bug, c'est un mot mal choisi.
WEAK_HINT_SCORE = 85


def load_words(path: Path) -> list[str]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise SystemExit(f"{path} : un tableau JSON de mots est attendu.")
    return [display_word(w or "") for w in raw]


def check_words(words: list[str]) -> list[str]:
    """Refuse les mots injouables avant d'ecrire en base.

    Deux defauts distincts, et les deux sont silencieux au runtime :

    - hors `playable_words` : le joueur ne peut litteralement pas taper la
      solution de son propre niveau. Le mot est refuse a la saisie.
    - inconnu du modele : vecteur nul, donc cosinus 0 avec tout le vocabulaire.
      Les indices et les voisins sont alors un classement de bruit.

    Les detecter ici coute une seconde ; les detecter en jouant coute un niveau
    injouable publie.
    """
    expected = len(PLANETS) * LEVELS_PER_PLANET
    problems = []

    if len(words) < expected:
        problems.append(f"{expected} mots attendus, {len(words)} fournis")

    seen, duplicates = set(), []
    for word in words[:expected]:
        key = normalize_key(word)
        if key in seen:
            duplicates.append(word)
        seen.add(key)
    if duplicates:
        problems.append(f"{len(duplicates)} doublon(s) : {', '.join(duplicates[:8])}")

    unplayable = [w for w in words[:expected] if not similarity.is_playable(w)]
    if unplayable:
        problems.append(
            f"{len(unplayable)} mot(s) hors playable_words, injouables : "
            f"{', '.join(unplayable[:8])}"
        )

    unknown = [
        w for w in words[:expected]
        if similarity.is_playable(w) and not similarity.has_vector(w)
    ]
    if unknown:
        problems.append(
            f"{len(unknown)} mot(s) inconnus du modele reduit : "
            f"{', '.join(unknown[:8])}"
        )

    return problems


def prune_stale_games(db) -> list[str]:
    """Supprime les parties dont le niveau ne porte plus le meme mot.

    Une partie fige son `secret_word_id` au demarrage, et c'est voulu : changer
    le mot sous les pieds d'un joueur en cours de partie serait pire. Mais apres
    un changement de campagne, ces parties decrivent un niveau qui n'existe
    plus. Le joueur voit son niveau 27 marque comme termine, le rouvre, et
    retrouve la carte semantique d'un autre mot que la solution.

    Les laisser a aussi un effet invisible : `prune_orphans` refuse de supprimer
    un mot qu'une partie reference encore, donc l'ancien mot et ses 105 lignes
    d'indices et de voisins restent en base pour toujours.

    Les propositions suivent en cascade. Les parties du mot du jour ne sont
    jamais concernees : leur calendrier n'est pas touche par la campagne.
    """
    stale = (
        db.query(Game)
        .join(CampaignLevel, Game.campaign_level_id == CampaignLevel.id)
        .filter(Game.secret_word_id != CampaignLevel.secret_word_id)
        .all()
    )
    labels = [
        f"{g.campaign_level.planet_id} {g.campaign_level.level_number} "
        f"({g.secret_word.word} -> {g.campaign_level.secret_word.word})"
        for g in stale
    ]
    for game in stale:
        db.delete(game)
    db.commit()
    return labels


def prune_orphans(db) -> int:
    """Supprime les mots secrets que plus rien n'utilise.

    Changer un mot de campagne laisse l'ancien en base. Inoffensif, mais il
    garde ses indices et ses voisins, et il fausse tous les comptages. On ne
    touche evidemment pas a ceux qu'une partie ou un mot du jour reference
    encore : une partie en cours vaut mieux qu'une table bien rangee.
    """
    used = set()
    for column in (CampaignLevel.secret_word_id, DailyWord.secret_word_id,
                   Game.secret_word_id):
        used.update(row[0] for row in db.query(column).distinct().all())

    orphans = db.query(SecretWord).filter(~SecretWord.id.in_(used or {0})).all()
    for orphan in orphans:
        db.delete(orphan)   # les indices et voisins suivent en cascade
    db.commit()
    return len(orphans)


def clear_cache() -> None:
    """Vide le cache disque des similarites.

    Il indexe les scores par couple de mots, pas par campagne : un mot retire
    de la campagne y laisse ses scores, et un mot ajoute peut y trouver ceux
    d'une calibration precedente. Le recalculer coute quelques millisecondes
    par couple, le garder faux coute un equilibrage fausse.
    """
    path = Path(SIMILARITY_CACHE_DIR)
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def rebuild_word(db, secret: SecretWord, neighbors_count: int) -> tuple[list, list]:
    hints = select_hints(secret.word)
    neighbors = select_neighbors(secret.word, neighbors_count)

    db.query(Hint).filter(Hint.secret_word_id == secret.id).delete()
    for rank, (word, score) in enumerate(hints, 1):
        db.add(Hint(secret_word_id=secret.id, rank=rank, word=word, score=score))

    db.query(Neighbor).filter(Neighbor.secret_word_id == secret.id).delete()
    for rank, (word, score) in enumerate(neighbors, 1):
        db.add(Neighbor(secret_word_id=secret.id, rank=rank, word=word, score=score))

    db.commit()
    return hints, neighbors


def report(db, neighbors_count: int) -> None:
    """Le vrai resultat du script : les mots a revoir a la main.

    Lu depuis la BASE et non depuis ce qui vient d'etre recalcule. Avec
    `--changed-only`, la boucle ne touche qu'une poignee de mots : un rapport
    bati sur elle annoncerait que tout va bien apres n'avoir rien verifie.

    Les mots sont separes par ORIGINE, et ce n'est pas cosmetique : `secret_words`
    melange les 180 mots de la campagne et les mots du jour tires de
    `hint_words.json`. Les envoyer tous vers campaign_words.json, c'est envoyer
    chercher dans un fichier des mots qui n'y sont pas.
    """
    campaign = {row[0] for row in db.query(CampaignLevel.secret_word_id).distinct()}
    daily = {row[0] for row in db.query(DailyWord.secret_word_id).distinct()}

    incomplete = []
    weak = {"campagne": [], "mot du jour": [], "orphelin": []}

    for secret in db.query(SecretWord).order_by(SecretWord.word).all():
        if len(secret.hints) < MAX_HINTS or len(secret.neighbors) < neighbors_count:
            incomplete.append(secret.word)
            continue
        best = max(float(h.score) for h in secret.hints)
        if best < WEAK_HINT_SCORE:
            origin = ("campagne" if secret.id in campaign
                      else "mot du jour" if secret.id in daily else "orphelin")
            weak[origin].append((secret.word, best))

    total = sum(len(v) for v in weak.values())

    print("\n" + "=" * 68)
    if incomplete:
        print(f"[!] {len(incomplete)} mot(s) sans jeu complet d'indices ou de voisins :")
        print(f"    {', '.join(incomplete)}")
    if total:
        print(f"[!] {total} mot(s) dont le meilleur indice reste sous {WEAK_HINT_SCORE}.")
        print("    Le modele ne leur connait aucun voisin proche : les cinq indices")
        print("    se valent, la progression 62 -> 97 disparait, et le joueur paie")
        print("    pour du bruit.")

        fixes = {
            "campagne": "a remplacer dans data/campaign_words.json, puis relancer",
            "mot du jour": ("tires de hint_words.json : les remplacer demande de "
                            "reprogrammer\n         le calendrier, pas d'editer la campagne"),
            "orphelin": "plus reference par aucun niveau ni mot du jour : sans effet en jeu",
        }
        for origin, rows in weak.items():
            if not rows:
                continue
            print(f"\n    {len(rows)} en {origin} — {fixes[origin]}")
            for word, best in sorted(rows, key=lambda x: x[1]):
                print(f"      {word:24s} {best:.0f}")
    if not incomplete and not total:
        print("Tous les mots ont cinq indices etages et un voisinage dense.")
    print("=" * 68)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--words", type=Path, default=CAMPAIGN_WORDS_PATH,
                        help="JSON : 180 mots par difficulte croissante")
    parser.add_argument("--daily-words", type=Path, default=HINT_WORDS_PATH,
                        help="JSON : reservoir pour le mot du jour")
    parser.add_argument("--schedule-daily", type=int, default=0, metavar="N",
                        help="programme en plus N jours de mot du jour")
    parser.add_argument("--neighbors", type=int, default=NEIGHBORS_STORED,
                        help=f"taille du vivier classe par mot (defaut {NEIGHBORS_STORED})")
    parser.add_argument("--changed-only", action="store_true",
                        help="ne recalculer que les mots sans indices ni voisins")
    parser.add_argument("--keep-cache", action="store_true",
                        help="ne pas vider cache/similarities")
    parser.add_argument("--keep-games", action="store_true",
                        help="ne pas supprimer les parties des niveaux dont le mot "
                             "a change (elles resteront incoherentes)")
    parser.add_argument("--allow-unknown", action="store_true",
                        help="semer malgre des mots injouables ou hors modele")
    args = parser.parse_args()

    words = load_words(args.words)

    # Le modele d'abord : la verification en a besoin, et il vaut mieux echouer
    # sur un mot douteux avant d'avoir touche a la base qu'apres.
    print("Chargement du modele et des matrices de vocabulaire...")
    similarity.preload(matrices=(similarity.POOL_HINTS, similarity.POOL_PLAYABLE))

    print(f"\n1. Verification de {args.words}")
    problems = check_words(words)
    if problems:
        for p in problems:
            print(f"  [!] {p}")
        if not args.allow_unknown:
            raise SystemExit(
                "\nRien n'a ete modifie. Corriger le fichier, ou relancer avec "
                "--allow-unknown pour passer outre."
            )
        print("  --allow-unknown : on continue malgre tout.")
    else:
        print(f"  {len(words)} mots, tous jouables et connus du modele.")

    print("\n2. Creation des tables manquantes")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("\n3. Affectation des niveaux")
        seed_campaign(db, words)

        if args.schedule_daily:
            print("\n3 bis. Mots du jour")
            schedule_daily(db, args.schedule_daily, load_words(args.daily_words))

        print("\n4. Nettoyage de la base")
        if args.keep_games:
            print("  parties conservees (--keep-games) : celles des niveaux dont le")
            print("  mot a change resteront desynchronisees")
        else:
            stale = prune_stale_games(db)
            print(f"  {len(stale)} partie(s) supprimee(s), niveau devenu un autre mot")
            for label in stale:
                print(f"    {label}")
        removed = prune_orphans(db)
        print(f"  {removed} mot(s) secret(s) orphelin(s) supprime(s)")

        if args.keep_cache:
            print("\n5. Cache des similarites conserve (--keep-cache)")
        else:
            print("\n5. Vidage du cache des similarites")
            clear_cache()

        secrets = db.query(SecretWord).order_by(SecretWord.id).all()
        todo = (
            [s for s in secrets
             if len(s.hints) < MAX_HINTS or len(s.neighbors) < args.neighbors]
            if args.changed_only else secrets
        )

        print(f"\n6-7. Indices et voisins : {len(todo)} mot(s) sur {len(secrets)}")
        for i, secret in enumerate(todo, 1):
            hints, _ = rebuild_word(db, secret, args.neighbors)
            trace = " -> ".join(f"{w} {s:.0f}" for w, s in hints)
            print(f"  [{i}/{len(todo)}] {secret.word} : {trace}")

        report(db, args.neighbors)
    finally:
        db.close()


if __name__ == "__main__":
    main()
