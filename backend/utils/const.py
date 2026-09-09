"""Constantes du jeu et chemins de donnees."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = Path(os.getenv("LEXIK_MODELS_DIR", BASE_DIR / "models"))

FASTTEXT_MODEL_PATH = MODELS_DIR / os.getenv("LEXIK_MODEL_FILE", "cc.fr.300.bin")
# Vecteurs cc.fr.300 reduits au vocabulaire jouable (~50 Mo). Suffisant au
# runtime : on ne score que des mots de playable_words, et les indices sont
# precalcules. Voir scripts/build_reduced_model.py.
REDUCED_MODEL_PATH = MODELS_DIR / os.getenv("LEXIK_REDUCED_MODEL_FILE", "lexik.fr.300.npz")
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
# Les 180 mots de la campagne, ordonnes par difficulte croissante. Seul
# contenu editorial du jeu : l'ordre de ce fichier EST la courbe de difficulte.
CAMPAIGN_WORDS_PATH = DATA_DIR / "campaign_words.json"
CALIBRATION_PATH = DATA_DIR / "calibration.json"
SIMILARITY_CACHE_DIR = str(BASE_DIR / "cache" / "similarities")

# --- Indices (prompt_base.txt sections 5 et 6) ----------------------------
MAX_HINTS = 5
# cout cumulatif : 1er indice 1, 2e +2, 3e +3... soit 1, 3, 6, 10, 15 au total
HINT_COST = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

# --- Voisins du mot secret -------------------------------------------------
# La meme table sert deux choses qui n'ont ni la meme taille ni le meme moment.
#
# STORED : le vivier classe, precalcule et garde en base. Il donne son RANG a
#   chaque proposition pendant la partie — « 847e sur 1000 ». C'est la reponse
#   au probleme central du milieu de partie : entre 8 et 14, le score ne dit
#   rien au joueur, alors que passer de 900e a 300e dit tout. Mille est le
#   seuil ou le vivier cesse d'etre du bruit : au-dela, l'ecart entre deux
#   rangs voisins n'est plus perceptible et le rang cesse d'informer.
#
# REVEALED : ce que l'ecran de victoire montre. Beaucoup plus court, parce
#   qu'il se lit d'un coup de pouce. Envoyer les mille serait illisible et
#   pesant a transporter.
NEIGHBORS_STORED = 1000
NEIGHBORS_REVEALED = 100

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

# --- Journee de jeu --------------------------------------------------------
# Le fuseau sur lequel le mot du jour bascule. Une seule reference pour tous les
# joueurs, cote serveur : ce n'est jamais l'horloge de l'appareil qui decide.
# Voir l'en-tete de services/daily.py pour le choix d'un fuseau plutot qu'UTC.
DAILY_TIMEZONE = os.getenv("LEXIK_DAILY_TIMEZONE", "Europe/Paris")

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
