// Cache d'affichage local, en JSON.
//
// Il n'est JAMAIS consulte pour decider si un niveau est termine, si une
// planete est debloquee ou combien il reste de monnaie : ca, c'est la base qui
// le dit. Il sert uniquement a peindre l'ecran avant que le reseau reponde,
// puis il est ecrase par la reponse serveur.
//
// Il est jetable : l'app doit fonctionner correctement s'il est vide ou
// corrompu (docs/prompt-persistance.md, section 26).

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'lexik:cache:';

export async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // cache illisible = pas de cache, jamais une erreur visible
  }
}

export async function writeCache(key, value) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignorer : perdre le cache est sans consequence
  }
}

export const CacheKeys = {
  me: 'me',
  campaign: 'campaign',
  game: (id) => `game:${id}`,
};

// --- Preferences (celles-ci, en revanche, n'existent que localement) --------

const PREFS_KEY = 'lexik:prefs';

export async function readPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function writePrefs(patch) {
  const current = await readPrefs();
  const next = { ...current, ...patch };
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignorer
  }
  return next;
}
