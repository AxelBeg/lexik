"""Mots ecartes du contenu du jeu.

Partage entre la generation du vocabulaire d'indices et celle des mots secrets
de campagne : un indice grossier est aussi genant qu'une solution grossiere.

Ne s'applique JAMAIS a ce que le joueur a le droit de taper. Cette liste dit ce
que le jeu PROPOSE, pas ce qu'il accepte : refuser un mot parce qu'il est
vulgaire enverrait « Mot inconnu » sur un mot que le joueur sait exister.

Ce module porte aussi `same_family`, qui repond a l'autre question du contenu
genere : deux mots sont-ils le meme mot ?
"""

from utils.helpers import normalize_key

# Mots ecartes comme solution. Trois familles :
#   - fonctionnels : trop vagues pour avoir un voisinage semantique utile ;
#   - penibles : corps, violence, maladie, mort, insultes — un puzzle quotidien
#     n'est pas le lieu, et une note Play Store se perd vite la-dessus ;
#   - unites et reperes : mesures et divisions du temps, sans direction propre.
#
# CETTE LISTE N'EST PAS EXHAUSTIVE. Elle attrape les familles previsibles, pas
# tous les cas : relire les 180 mots produits avant de publier.
BLOCKLIST = {
    # fonctionnels / trop vagues
    "chose", "truc", "machin", "gens", "personne", "monde", "fois", "facon",
    "maniere", "sorte", "espece", "partie", "cote", "endroit", "moment",
    "part", "point", "cas", "fait", "rapport", "suite", "terme", "sens",
    "ensemble", "groupe", "nombre", "quantite", "chiffre", "numero", "type",
    "exemple", "raison", "sujet", "objet", "question", "reponse", "probleme",
    "resultat", "effet", "cause", "moyen", "besoin", "envie", "idee",
    # unites et reperes temporels
    "annee", "mois", "semaine", "heure", "minute", "seconde", "jour", "siecle",
    "metre", "litre", "gramme", "kilo", "franc", "euro", "degre", "pourcent",
    # corps, sexualite
    "vagin", "penis", "sein", "fesse", "anus", "sperme", "orgasme", "coit",
    "erection", "verge", "testicule", "cul", "bite", "chatte", "nichon",
    "pute", "putain", "salope", "baise", "viol", "violeur", "pedophile",
    "prostitution", "prostituee", "masturbation", "pornographie", "inceste",
    # fonctions corporelles
    "caca", "pipi", "merde", "excrement", "urine", "vomi", "vomissement",
    "diarrhee", "flatulence", "crotte", "pet", "morve", "pus",
    # violence, mort, maladie
    "meurtre", "assassinat", "strangulation", "egorgement", "torture",
    "suicide", "pendaison", "noyade", "massacre", "genocide", "attentat",
    "cadavre", "charnier", "agonie", "euthanasie", "avortement", "cesarienne",
    "cancer", "tumeur", "sida", "lepre", "peste", "gangrene", "necrose",
    "amputation", "hemorragie", "septicemie", "overdose",
    # insultes, mepris
    "debile", "cretin", "idiot", "imbecile", "abruti", "connard", "salaud",
    "ordure", "raclure", "vermine", "pourriture", "souillure", "ignominie",
    "humiliation", "persecution", "esclave", "esclavage",
    # insultes identitaires — un jeu grand public n'en veut aucune
    "pede", "tapette", "gouine", "negre", "bougnoule", "youpin", "bicot",
    "raton", "chinetoque", "mongol", "gogol", "attarde", "handicape",
    "nana", "gonzesse", "boniche", "greluche",
    # drogues
    "cocaine", "heroine", "cannabis", "shit", "came", "seringue", "junkie",
    # titres, formules d'adresse : ce sont des etiquettes, pas des concepts,
    # et leur voisinage semantique ne mene nulle part
    "monsieur", "madame", "mademoiselle", "monseigneur", "senor", "senora",
    "lord", "lady", "sir", "tsar", "khan", "madone", "sainte", "saint",
    # divers sans direction semantique exploitable
    "insu", "dodo", "foot", "meteo", "expo", "frigo", "stop", "toast",
    "negro", "zezette", "quant", "crac", "harde", "aubain",
    "charogne", "cochonnerie", "andouille",
    # abreviations et mots qui ne vivent que dans une locution figee
    "tele", "clin", "coke", "vodka", "foutaise", "voyeur", "matricule",
    # pejoratifs de registre familier : passent le filtre de frequence
    # (courants dans les deux registres) mais restent des mots de mepris
    "salopard", "racaille", "larbin", "morue", "loque", "taule", "bouc",
}


# Anglicismes et mots etrangers non assimiles : reconnaissables a l'ecrit mais
# hors de la logique semantique francaise du modele.
FOREIGN = {
    "snack", "spray", "sponsor", "trauma", "saloon", "khan", "zazou", "polka",
    "lama", "expo", "relax", "cash", "look", "show", "star", "club", "match",
    "score", "test", "stock", "budget", "leader", "manager", "business",
    "weekend", "parking", "camping", "shopping", "marketing", "casting",
}


def is_excluded(key: str) -> bool:
    """`key` doit etre une cle normalisee (utils.helpers.normalize_key)."""
    return key in BLOCKLIST or key in FOREIGN


# --- Mots de la meme famille ----------------------------------------------
#
# « miracle » avait « miraculé » et « miraculeux » pour indices : le joueur
# recevait trois fois le meme mot, et le second lui donnait pratiquement la
# solution. Le test qui devait l'empecher etait une inclusion de chaine
# (`secret in word or word in secret`), qui ne voit rien des lors que la
# derivation change une lettre au milieu — « mirac|le » contre « mirac|uleux ».
#
# On compare donc les prefixes. C'est une heuristique orthographique, pas une
# analyse morphologique : elle attrape les derivations regulieres, qui sont
# l'ecrasante majorite des cas genants (verbe -> nom d'agent, nom -> adjectif,
# masculin -> feminin), et rate les familles supletives — « boire »/« boisson »,
# « roi »/« royaume », « oeil »/« yeux » — qu'aucun prefixe ne rapproche.
#
# Les seuils sont deliberement laches, parce que les deux erreurs ne coutent
# pas la meme chose. Un faux positif fait passer un candidat au suivant, dont
# le score est a une decimale du precedent : invisible. Un faux negatif, lui,
# arrive jusqu'au joueur. On accepte donc de perdre « sourcil »/« sourire »
# pour garder « vallée »/« vallon ».
#
# Les composes a trait d'union sont le point faible connu : « nord-est » et
# « nord-ouest » partagent leur premier element et passent pour parents. Un
# seul cas sur les 22 000 paires du contenu actuel — pas de quoi une regle.
MIN_FAMILY_PREFIX = 4
# Le prefixe doit aussi couvrir la moitie du plus court des deux mots, sinon
# deux mots longs et sans rapport se rejoignent sur leurs quatre premieres
# lettres (« constellation »/« consternation »).
MIN_FAMILY_RATIO = 0.5


def _shared_prefix(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def same_family(a: str, b: str) -> bool:
    """Les deux mots sont-ils des variantes l'un de l'autre ?

    Accepte des formes affichees : la normalisation est faite ici, pour qu'un
    accent ne fasse pas passer « miraculé » pour un mot etranger a « miracle ».
    """
    a, b = normalize_key(a), normalize_key(b)
    if not a or not b:
        return False
    # Les cas que l'inclusion de chaine attrapait deja : « camera » dans
    # « cameraman ». On les garde, ils ne dependent d'aucun seuil.
    if a in b or b in a:
        return True

    shared = _shared_prefix(a, b)
    return shared >= MIN_FAMILY_PREFIX and shared >= MIN_FAMILY_RATIO * min(len(a), len(b))
