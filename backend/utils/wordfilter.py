"""Mots ecartes du contenu du jeu.

Partage entre la generation du vocabulaire d'indices et celle des mots secrets
de campagne : un indice grossier est aussi genant qu'une solution grossiere.

Ne s'applique JAMAIS a ce que le joueur a le droit de taper. Cette liste dit ce
que le jeu PROPOSE, pas ce qu'il accepte : refuser un mot parce qu'il est
vulgaire enverrait « Mot inconnu » sur un mot que le joueur sait exister.
"""

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
