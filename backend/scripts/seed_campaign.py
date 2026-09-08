"""Cree les tables, remplit la campagne et programme les mots du jour.

    python -m scripts.seed_campaign --words data/campaign_words.json
    python -m scripts.seed_campaign --schedule-daily 60

Le fichier de mots attendu est une liste de 180 mots ordonnee par difficulte
semantique croissante : les 30 premiers vont sur Terre, les 30 suivants sur
Mars, etc. La difficulte doit venir du mot lui-meme, pas du theme
(docs/prompt-campagne.md, 17 bis) — l'ordre de ce fichier EST la courbe de
difficulte du jeu.
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import timedelta

from database.database import Base, SessionLocal, engine
from database.models import CampaignLevel, DailyWord, SecretWord
from services.daily import today_utc
from utils.const import LEVELS_PER_PLANET, PLANETS
from utils.helpers import display_word


def get_or_create_word(db, word: str) -> SecretWord:
    word = display_word(word)
    existing = db.query(SecretWord).filter(SecretWord.word == word).first()
    if existing:
        return existing
    secret = SecretWord(word=word)
    db.add(secret)
    db.flush()
    return secret


def seed_campaign(db, words: list[str]) -> None:
    expected = len(PLANETS) * LEVELS_PER_PLANET
    if len(words) < expected:
        raise SystemExit(f"{expected} mots attendus, {len(words)} fournis.")

    for planet in PLANETS:
        offset = (planet["order"] - 1) * LEVELS_PER_PLANET
        for n in range(1, LEVELS_PER_PLANET + 1):
            secret = get_or_create_word(db, words[offset + n - 1])
            level = (
                db.query(CampaignLevel)
                .filter(CampaignLevel.planet_id == planet["id"],
                        CampaignLevel.level_number == n)
                .first()
            )
            if level:
                level.secret_word_id = secret.id
            else:
                db.add(CampaignLevel(
                    planet_id=planet["id"],
                    planet_order=planet["order"],
                    level_number=n,
                    secret_word_id=secret.id,
                ))
        print(f"  {planet['name']} : {LEVELS_PER_PLANET} niveaux")
    db.commit()


def schedule_daily(db, days: int, words: list[str]) -> None:
    """Programme les prochains mots du jour a partir d'aujourd'hui (UTC).

    Les mots du quotidien sont tires hors de la campagne pour qu'un joueur ne
    retrouve pas un mot deja resolu.
    """
    campaign_ids = {row[0] for row in db.query(CampaignLevel.secret_word_id).all()}
    pool = [w for w in (display_word(x) for x in words) if w]
    rng = random.Random(20260908)
    rng.shuffle(pool)

    last = db.query(DailyWord).order_by(DailyWord.number.desc()).first()
    number = (last.number + 1) if last else 1
    date = today_utc()
    if last and last.date >= date:
        date = last.date + timedelta(days=1)

    created = 0
    for word in pool:
        if created >= days:
            break
        secret = get_or_create_word(db, word)
        if secret.id in campaign_ids:
            continue
        if db.query(DailyWord).filter(DailyWord.date == date).first():
            date += timedelta(days=1)
            continue
        db.add(DailyWord(date=date, number=number, secret_word_id=secret.id))
        date += timedelta(days=1)
        number += 1
        created += 1

    db.commit()
    print(f"  {created} mot(s) du jour programme(s), jusqu'au {date - timedelta(days=1)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--words", help="JSON : liste de 180 mots par difficulte croissante")
    parser.add_argument("--daily-words", help="JSON : reservoir pour le mot du jour")
    parser.add_argument("--schedule-daily", type=int, default=0, metavar="N",
                        help="programme N jours de mot du jour")
    args = parser.parse_args()

    print("Creation des tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if args.words:
            with open(args.words, encoding="utf-8") as f:
                print("Campagne :")
                seed_campaign(db, json.load(f))

        if args.schedule_daily:
            source = args.daily_words or args.words
            if not source:
                raise SystemExit("--schedule-daily exige --daily-words ou --words")
            with open(source, encoding="utf-8") as f:
                print("Mots du jour :")
                schedule_daily(db, args.schedule_daily, json.load(f))

        print("\nPenser a lancer : python -m scripts.precompute_hints")
    finally:
        db.close()


if __name__ == "__main__":
    main()
