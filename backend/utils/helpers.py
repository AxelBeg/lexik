"""Normalisation des mots.

Deux formes distinctes, et c'est important :

  normalize_key("Éléphant") -> "elephant"   cle de comparaison
  display_word("Éléphant")  -> "éléphant"   forme affichee et vectorisee

LexiFight se contentait de lower() + suppression des espaces, donc « elephant »
tape sans accent ne trouvait jamais « éléphant » dans le vocabulaire. On
compare donc sur une cle depouillee, mais on garde la forme accentuee pour
l'affichage ET pour interroger fastText : le modele connait « éléphant », pas
« elephant », et lui donner la version sans accent le ferait basculer sur ses
sous-mots, avec un vecteur nettement moins bon.
"""

import re
import unicodedata

_ALLOWED_KEY = re.compile(r"[^a-z\-]")
_ALLOWED_DISPLAY = re.compile(r"[^a-zà-öø-ÿœæ\-]")


def display_word(word: str) -> str:
    """Forme canonique affichee : minuscules, accents conserves."""
    w = word.strip().lower().replace("_", "-").replace(" ", "-")
    return _ALLOWED_DISPLAY.sub("", w)


def normalize_key(word: str) -> str:
    """Cle de comparaison : minuscules, sans accents, sans espaces."""
    w = display_word(word)
    w = "".join(c for c in unicodedata.normalize("NFD", w)
                if unicodedata.category(c) != "Mn")
    return _ALLOWED_KEY.sub("", w)
