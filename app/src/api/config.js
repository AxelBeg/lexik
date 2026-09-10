// Adresse du serveur, et le reste de ce qui se regle a la compilation.
//
// En production l'URL est figee. En DEVELOPPEMENT elle ne peut pas l'etre :
// un telephone ne resout pas `localhost`, il lui faut l'IP de la machine sur
// le reseau local — qui change de bureau en bureau, de PC en PC et a chaque
// bail DHCP. La recompiler a chaque fois coute plus cher que le probleme.
//
// L'hote de dev est donc modifiable depuis l'app (Reglages > Serveur de dev,
// visible sous `__DEV__` uniquement) et retenu dans AsyncStorage. La valeur
// ci-dessous n'est plus qu'un point de depart au premier lancement.
//
// Rien de tout ca n'existe en production : `apiBaseUrl()` y renvoie l'URL
// HTTPS sans jamais lire le stockage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PROD_BASE_URL = 'https://api.lexik.app/api/v1';

// Point de depart au premier lancement, quand rien n'est encore enregistre.
// L'emulateur iOS parle a la machine hote par `localhost` ; un appareil
// Android, jamais.
export const DEFAULT_DEV_HOST = Platform.OS === 'android' ? '10.247.250.193' : 'localhost';
const DEFAULT_DEV_PORT = 8000;

const DEV_HOST_KEY = 'lexik:dev_host';

let devHost = DEFAULT_DEV_HOST;

/** `10.0.0.5`, `10.0.0.5:8001` ou vide -> hote normalise, ou null si illisible. */
export function normalizeDevHost(input) {
  const raw = (input ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return null;
  // Un port explicite est accepte : le backend tourne parfois ailleurs que sur
  // 8000, et retaper l'IP entiere pour ca serait absurde.
  const [host, port] = raw.split(':');
  if (!host) return null;
  if (port && !/^\d+$/.test(port)) return null;
  return port ? `${host}:${port}` : host;
}

/** L'URL de base courante. A relire a chaque requete : elle peut changer. */
export function apiBaseUrl() {
  if (!__DEV__) return PROD_BASE_URL;
  const hostWithPort = devHost.includes(':') ? devHost : `${devHost}:${DEFAULT_DEV_PORT}`;
  return `http://${hostWithPort}/api/v1`;
}

/** L'hote de dev en cours, pour l'afficher. */
export function getDevHost() {
  return devHost;
}

/**
 * Relit l'hote enregistre. A appeler au demarrage AVANT la premiere requete,
 * sinon le premier appel partirait sur l'adresse par defaut.
 */
export async function loadDevHost() {
  if (!__DEV__) return;
  try {
    const saved = await AsyncStorage.getItem(DEV_HOST_KEY);
    const clean = normalizeDevHost(saved);
    if (clean) devHost = clean;
  } catch {
    // stockage illisible : on garde la valeur par defaut, jamais d'erreur
  }
}

/** Change l'hote de dev et le retient. Renvoie l'hote retenu, ou null. */
export async function setDevHost(input) {
  if (!__DEV__) return null;
  const clean = normalizeDevHost(input);
  if (!clean) return null;
  devHost = clean;
  try {
    await AsyncStorage.setItem(DEV_HOST_KEY, clean);
  } catch {
    // Non retenu au prochain lancement, mais valable pour cette session :
    // mieux vaut ca que refuser le changement.
  }
  return clean;
}

/** Oublie l'hote choisi et revient a celui compile dans l'app. */
export async function resetDevHost() {
  if (!__DEV__) return DEFAULT_DEV_HOST;
  devHost = DEFAULT_DEV_HOST;
  try {
    await AsyncStorage.removeItem(DEV_HOST_KEY);
  } catch {
    // idem
  }
  return devHost;
}

// Client OAuth « Web » du projet Google Cloud lie a la Play Console.
// Tant qu'il est vide, l'app utilise le mode repli et ne tente pas Play Games.
export const GOOGLE_WEB_CLIENT_ID = '';

// Base des liens de partage.
//
// En https et non en `lexik://` : un lien de partage est lu par quelqu'un qui,
// la plupart du temps, n'a PAS l'app. Un schema maison ne s'ouvre pas chez lui,
// n'affiche pas d'apercu, et ne dit meme pas de quoi il s'agit — autrement dit
// il annule tout l'interet du partage.
//
// Pour que ce lien ouvre l'app quand elle est installee, le domaine doit servir
// `/.well-known/assetlinks.json` (Android) et l'equivalent Apple. Tant que ce
// n'est pas fait, le lien reste valide : il tombe sur la page web, qui doit
// renvoyer vers le store. C'est la seule chose a mettre en place avant d'ouvrir
// le partage au public.
export const SHARE_BASE_URL = 'https://lexik.app';
