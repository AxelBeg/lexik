"""Moteur de proximite semantique.

Repris de LexiFight. Trois changements :

1. La cible n'est plus un « theme » a vecteur precalcule mais un mot secret
   quelconque, donc on calcule son vecteur a la volee.

2. Le vocabulaire est indexe par cle depouillee mais interroge sous sa forme
   accentuee : le joueur tape « elephant », on lui repond sur le vecteur de
   « éléphant » (voir utils/helpers.py).

3. Le cosinus brut n'est pas affichable tel quel. Sur cc.fr.300, deux mots
   francais tires au hasard sont deja a ~0.15 de cosinus et tout ce qui est
   reellement lie vit au-dela de 0.45 : une echelle lineaire ecraserait le jeu
   dans le dernier tiers. On calibre donc sur la distribution reelle des paires
   (data/calibration.json, voir scripts/calibrate.py).

Le calcul d'une proposition = un produit scalaire. C'est la recherche de plus
proches voisins (indices) qui coute, et elle tourne hors ligne uniquement.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path

import numpy as np
from diskcache import Cache
from dotenv import load_dotenv

from utils.const import (
    CALIBRATION_PATH, FASTTEXT_MODEL_PATH, HINT_WORDS_PATH, PLAYABLE_WORDS_PATH,
    REDUCED_MODEL_PATH, SIMILARITY_CACHE_DIR,
)
from utils.helpers import display_word, normalize_key

load_dotenv()

cache = Cache(SIMILARITY_CACHE_DIR, size_limit=int(1e9))

# Moteur factice : LEXIK_FAKE_ENGINE=1 remplace fastText par un hachage
# deterministe. Le modele cc.fr.300.bin pese 7 Go, ce qui bloque tout le reste
# du developpement pour une seule dependance.
#
# Ce mode permet de faire tourner l'app de bout en bout — connexion, campagne,
# indices, victoire, percentile, deblocage des planetes — sans rien telecharger.
# Les scores n'ont AUCUN sens semantique : ils servent a tester la plomberie,
# jamais a juger l'equilibrage ou la sensation de jeu.
FAKE_ENGINE = os.getenv("LEXIK_FAKE_ENGINE") == "1"

_model = None
# ce que le joueur a le droit de taper : large, ~35 000 mots
_playable: dict[str, str] | None = None   # cle depouillee -> mot accentue
# ce dans quoi on pioche les indices : etroit et courant, ~12 000 mots
_hint_vocab: list[str] | None = None
_hint_matrix: np.ndarray | None = None    # (N, 300) normalise L2, indices seulement
_calibration: dict | None = None
_lock = threading.Lock()


class ReducedModel:
    """cc.fr.300 restreint au vocabulaire du jeu. Meme API que fasttext."""

    def __init__(self, by_word: dict[str, np.ndarray], by_key: dict[str, np.ndarray]):
        self._by_word = by_word
        self._by_key = by_key

    def __len__(self) -> int:
        return len(self._by_word)

    @classmethod
    def load(cls, path: Path) -> "ReducedModel":
        data = np.load(path)
        by_word: dict[str, np.ndarray] = {}
        by_key: dict[str, np.ndarray] = {}
        for word, vec in zip(data["words"], data["vectors"]):
            w = str(word)
            v = np.asarray(vec, dtype=np.float32)
            by_word[w] = v
            key = normalize_key(w)
            if key and key not in by_key:
                by_key[key] = v
        return cls(by_word, by_key)

    def get_word_vector(self, word: str) -> np.ndarray:
        v = self._by_word.get(word)
        if v is None:
            v = self._by_word.get(display_word(word))
        if v is None:
            v = self._by_key.get(normalize_key(word))
        if v is None:
            return np.zeros(300, dtype=np.float32)
        return v


def _load_word_map(path) -> dict[str, str]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    mapping: dict[str, str] = {}
    for word in raw:
        display = display_word(word or "")
        key = normalize_key(display)
        # premier arrive gagne : les listes sont triees alphabetiquement, donc
        # la forme accentuee l'emporte sur un doublon sans accent
        if key and key not in mapping:
            mapping[key] = display
    return mapping


# --------------------------------------------------------------------------
# Chargement
# --------------------------------------------------------------------------

def preload(with_matrix: bool = False) -> None:
    """Charge le modele et le vocabulaire une fois pour toutes.

    `with_matrix` construit en plus la matrice des vecteurs du vocabulaire, qui
    ne sert qu'au precalcul des indices. Le serveur de jeu n'en a pas besoin :
    ne pas l'activer en production, ca economise plusieurs centaines de Mo.
    """
    global _model, _playable, _hint_vocab, _hint_matrix, _calibration

    with _lock:
        if _model is None and not FAKE_ENGINE:
            if REDUCED_MODEL_PATH.exists():
                print(f"Chargement du modele reduit ({REDUCED_MODEL_PATH})...")
                _model = ReducedModel.load(REDUCED_MODEL_PATH)
                print(f"Modele charge : {len(_model)} vecteurs cc.fr.300.")
            elif FASTTEXT_MODEL_PATH.exists():
                import fasttext
                print(f"Chargement du modele fastText ({FASTTEXT_MODEL_PATH})...")
                _model = fasttext.load_model(str(FASTTEXT_MODEL_PATH))
                print("Modele charge.")
            else:
                raise RuntimeError(
                    "Aucun modele semantique. Lancer "
                    "`python -m scripts.build_reduced_model` "
                    f"ou placer {FASTTEXT_MODEL_PATH.name} dans models/."
                )
        elif FAKE_ENGINE:
            print("[!] LEXIK_FAKE_ENGINE=1 : scores factices, aucun sens semantique.")

        if _playable is None:
            _playable = _load_word_map(PLAYABLE_WORDS_PATH)
            _hint_vocab = list(_load_word_map(HINT_WORDS_PATH).values())
            print(f"Vocabulaire : {len(_playable)} mots acceptes, "
                  f"{len(_hint_vocab)} candidats indices.")

        if _calibration is None:
            _calibration = _load_calibration()

        if with_matrix and FAKE_ENGINE:
            pass  # nearest() sait travailler sans matrice en mode factice
        elif with_matrix and _hint_matrix is None:
            print("Construction de la matrice des candidats indices...")
            mat = np.stack([_model.get_word_vector(w) for w in _hint_vocab])
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            _hint_matrix = (mat / np.maximum(norms, 1e-9)).astype(np.float32)
            print(f"Matrice prete : {_hint_matrix.shape}")


def is_loaded() -> bool:
    return FAKE_ENGINE or _model is not None


def _require_model():
    if _model is None:
        raise RuntimeError("Le modele n'a pas ete precharge (appeler preload()).")
    return _model


def resolve(word: str) -> str | None:
    """Forme canonique accentuee d'un mot acceptable, None s'il est refuse."""
    if _playable is None:
        raise RuntimeError("Le vocabulaire n'a pas ete precharge.")
    return _playable.get(normalize_key(word))


def is_playable(word: str) -> bool:
    return resolve(word) is not None


def same_word(a: str, b: str) -> bool:
    """Egalite tolerante aux accents et a la casse."""
    return normalize_key(a) == normalize_key(b)


# --------------------------------------------------------------------------
# Calibration cosinus -> score de jeu 0-100
# --------------------------------------------------------------------------

# Courbe de repli si data/calibration.json est absent : suffisante pour
# developper, a remplacer par une vraie calibration avant de publier.
_FALLBACK = {
    "cosines": [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00],
    "scores":  [0,    8,    18,   30,   44,   58,   70,   80,   88,   95,   100],
}


def _load_calibration() -> dict:
    path = Path(CALIBRATION_PATH)
    if not path.exists():
        print(f"[!] {path} absent : courbe de repli utilisee. "
              f"Lancer scripts/calibrate.py avant la mise en production.")
        return _FALLBACK
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def to_game_score(cosine: float) -> float:
    """Cosinus brut -> score 0-100 affiche au joueur, par interpolation lineaire
    par morceaux sur la courbe de calibration."""
    calib = _calibration or _FALLBACK
    score = float(np.interp(cosine, calib["cosines"], calib["scores"]))
    return round(max(0.0, min(100.0, score)), 2)


# --------------------------------------------------------------------------
# Score d'une proposition
# --------------------------------------------------------------------------

def _fake_cosine(a: str, b: str) -> float:
    """Cosinus deterministe tire du couple de mots.

    Eleve a la puissance 4 pour imiter la forme d'une vraie distribution : la
    plupart des paires sont lointaines, quelques-unes proches. Symetrique et
    stable d'un appel a l'autre, sinon les scores changeraient a chaque
    rechargement du serveur.

    Plafonne a 0.97 pour que seul le mot exact atteigne 100 : sinon des dizaines
    de mots du vocabulaire y arriveraient par hasard, et le precalcul produirait
    des indices notes 100 qui ne sont pas la solution.
    """
    pair = "|".join(sorted((normalize_key(a), normalize_key(b))))
    digest = hashlib.sha1(pair.encode("utf-8")).digest()
    uniform = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    return round(0.97 * uniform ** 4, 5)


def raw_cosine(a: str, b: str) -> float:
    if FAKE_ENGINE:
        return _fake_cosine(a, b)

    model = _require_model()
    va = model.get_word_vector(a)
    vb = model.get_word_vector(b)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom < 1e-9:
        return 0.0
    return float(np.dot(va, vb) / denom)


def score_guess(secret: str, guess: str) -> dict:
    """Score de jeu entre le mot secret et la proposition.

    Renvoie {"word", "score", "error"} plutot que de lever : une proposition
    invalide est un cas de jeu normal, pas une exception. `word` est la forme
    canonique a stocker et afficher.
    """
    if not normalize_key(guess):
        return {"word": "", "score": 0.0, "error": "Mot vide"}

    canonical = resolve(guess)
    if canonical is None:
        return {"word": display_word(guess), "score": 0.0,
                "error": f"Mot inconnu : {display_word(guess)}"}

    if same_word(canonical, secret):
        return {"word": canonical, "score": 100.0, "error": None}

    # Prefixe d'engine : l'ancien cache sans prefixe contenait des scores
    # factices (homme/femme = 0.21) qui restaient servis apres le vrai modele.
    engine = "fake" if FAKE_ENGINE else "ft"
    key = f"{engine}|{normalize_key(secret)}|{normalize_key(canonical)}"
    cached = cache.get(key)
    if cached is not None:
        return {"word": canonical, "score": cached, "error": None}

    score = to_game_score(raw_cosine(secret, canonical))
    cache[key] = score
    return {"word": canonical, "score": score, "error": None}


# --------------------------------------------------------------------------
# Plus proches voisins (precalcul des indices uniquement)
# --------------------------------------------------------------------------

def nearest(secret: str, k: int = 200) -> list[tuple[str, float]]:
    """Les k candidats-indices les plus proches, score de jeu decroissant.

    Cherche dans le vocabulaire COURANT, pas dans tout ce que le joueur a le
    droit de taper : un indice fait d'un mot rare n'apprend rien.

    Necessite preload(with_matrix=True). N'est jamais appele pendant une partie.
    """
    if FAKE_ENGINE:
        if _hint_vocab is None:
            raise RuntimeError("Vocabulaire non precharge.")
        scored = [
            (w, to_game_score(_fake_cosine(secret, w)))
            for w in _hint_vocab if not same_word(w, secret)
        ]
        scored.sort(key=lambda c: -c[1])
        return scored[:k]

    if _hint_matrix is None or _hint_vocab is None:
        raise RuntimeError("nearest() exige preload(with_matrix=True).")

    model = _require_model()
    v = model.get_word_vector(secret)
    v = v / max(float(np.linalg.norm(v)), 1e-9)

    cosines = _hint_matrix @ v
    k_eff = min(k + 1, len(cosines))
    top = np.argpartition(-cosines, k_eff - 1)[:k_eff]
    top = top[np.argsort(-cosines[top])]

    out: list[tuple[str, float]] = []
    for i in top:
        word = _hint_vocab[i]
        if same_word(word, secret):
            continue
        out.append((word, to_game_score(float(cosines[i]))))
        if len(out) == k:
            break
    return out
