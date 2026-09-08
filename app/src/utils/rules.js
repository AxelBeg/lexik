// Regles miroir du backend, pour l affichage uniquement.
//
// Le serveur reste la seule autorite : ces constantes servent a dessiner un
// repere sur une barre de progression, jamais a decider si une planete est
// debloquee (docs/prompt-persistance.md, section 26).

export const LEVELS_PER_PLANET = 30;
export const LEVELS_TO_UNLOCK_NEXT = 25;
export const MAX_HINTS = 5;
