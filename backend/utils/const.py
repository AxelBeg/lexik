"""Constantes du jeu et chemins de donnees."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = Path(os.getenv("LEXIK_MODELS_DIR", BASE_DIR / "models"))

FASTTEXT_MODEL_PATH = MODELS_DIR / os.getenv("LEXIK_MODEL_FILE", "cc.fr.300.bin")
# Deux listes, deux roles opposes — ne pas les confondre.
#
# PLAYABLE : ce que le joueur a le DROIT de taper. Doit etre large. Refuser un
#   vrai mot francais parce qu'il manque a la liste est la pire friction du jeu :
#   le joueur croit avoir mal ecrit, ou que le jeu est casse.
#
# HINT : ce dans quoi on PIOCHE les indices et les mots secrets. Doit etre
#   etroit et courant. Un indice compose d'un mot que le joueur ne connait pas
#   n'apprend rien, et une solution introuvable n'est pas un puzzle.
PLAYABLE_WORDS_PATH = DATA_DIR / "playable_words.json"   # ~35 000 mots
HINT_WORDS_PATH = DATA_DIR / "hint_words.json"           # ~12 000 mots courants
CALIBRATION_PATH = DATA_DIR / "calibration.json"
SIMILARITY_CACHE_DIR = str(BASE_DIR / "cache" / "similarities")

# --- Indices (prompt_base.txt sections 5 et 6) ----------------------------
MAX_HINTS = 5
# cout cumulatif : 1er indice 1, 2e +2, 3e +3... soit 1, 3, 6, 10, 15 au total
HINT_COST = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

# --- Campagne (prompt-campagne.md sections 15 et 16) ----------------------
PLANETS = [
    {"id": "terre",    "order": 1, "name": "TERRE"},
    {"id": "mars",     "order": 2, "name": "MARS"},
    {"id": "jupiter",  "order": 3, "name": "JUPITER"},
    {"id": "saturne",  "order": 4, "name": "SATURNE"},
    {"id": "uranus",   "order": 5, "name": "URANUS"},
    {"id": "neptune",  "order": 6, "name": "NEPTUNE"},
]
LEVELS_PER_PLANET = 30
LEVELS_TO_UNLOCK_NEXT = 25   # 25/30 debloque la planete suivante

# --- Serie quotidienne et monnaie -----------------------------------------
DAILY_REWARD = 2             # monnaie gagnee en terminant le mot du jour
STREAK_BONUS_EVERY = 7       # bonus tous les 7 jours de serie
STREAK_BONUS_AMOUNT = 5
STARTING_CURRENCY = 5        # solde de depart d'un nouveau joueur

# --- Auth ------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-a-changer-en-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = 60 * 24 * 7
GOOGLE_WEB_CLIENT_ID = os.getenv("GOOGLE_WEB_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
