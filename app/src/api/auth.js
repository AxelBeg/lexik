// Connexion du joueur.
//
// Strategie : repli « device » d'abord, Play Games ensuite — l'inverse de ce
// qu'on avait prevu, pour une raison concrete.
//
// Le SDK natif Play Games v2 se connecte vraiment tout seul, sans rien
// afficher. Mais du cote React Native, la voie fiable passe par Google Sign-In
// avec la portee `games_lite`, et sa connexion silencieuse ne fonctionne
// qu'APRES un premier appui : au tout premier lancement, elle ouvrirait un
// selecteur de compte. Poser ce selecteur devant un joueur qui n'a pas encore
// vu une seule ligne du jeu coute des installations pour rien.
//
// Donc : au premier lancement on tente le silencieux, et s'il echoue on part en
// repli « device » sans rien demander. Le joueur joue tout de suite. La
// proposition de rattacher son compte arrive plus tard, quand il a quelque
// chose a perdre (docs/prompt-persistance.md, section 28) — et la, l'appui est
// assume.
//
// L'app n'envoie JAMAIS le playerId : elle envoie un code d'autorisation, et
// c'est le serveur qui verifie l'identite aupres de Google. Sans ca, n'importe
// qui reclamerait la progression d'un autre.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import client, { ACCESS_TOKEN_KEY } from './client';
import { GOOGLE_WEB_CLIENT_ID } from './config';

const DEVICE_ID_KEY = 'lexik_device_id';
const PROVIDER_KEY = 'lexik_auth_provider';

async function getDeviceId() {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID().replace(/-/g, '');
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

// Portee Play Games : donne acces au playerId sans rien demander d'autre.
// Pas d'email, pas de profil, pas de contacts — la declaration Data safety du
// Play Store reste minimale.
const GAMES_SCOPE = 'https://www.googleapis.com/auth/games_lite';

/**
 * Obtient un code d'autorisation Play Games.
 *
 * `interactive: false` ne montre rien : c'est le cas de tous les lancements
 * apres le premier. Au tout premier lancement il faut un appui (selecteur de
 * compte Google), donc on ne le declenche que sur demande explicite.
 *
 * Renvoie le code, ou null si indisponible.
 */
async function tryPlayGamesAuthCode({ interactive = false } = {}) {
  if (!GOOGLE_WEB_CLIENT_ID) return null;
  try {
    // Chargement paresseux, et volontairement dans un try/catch.
    //
    // Le paquet n'est PAS installe pour l'instant : c'est un module natif,
    // inutilisable dans Expo Go, et ses versions n'etaient pas alignees sur le
    // SDK 57. Le require echoue donc, on tombe dans le catch, et l'app part en
    // mode repli — exactement le comportement voulu tant que Play Games n'est
    // pas configure.
    //
    // Pour l'activer : npx expo install @react-native-google-signin/google-signin
    // puis rajouter le plugin dans app.json et construire un build natif.
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true, // c'est ce qui fait rendre un serverAuthCode
      scopes: [GAMES_SCOPE],
    });

    const result = interactive
      ? await GoogleSignin.signIn()
      : await GoogleSignin.signInSilently();

    // la forme de la reponse a change selon les versions de la librairie
    return result?.data?.serverAuthCode ?? result?.serverAuthCode ?? null;
  } catch (e) {
    console.log('Play Games indisponible, repli appareil :', e?.message);
    return null;
  }
}

/**
 * Etablit une session. Appele une fois au demarrage.
 * @returns {{provider: 'play_games'|'device', userId: string, currency: number}}
 */
export async function signIn() {
  const code = await tryPlayGamesAuthCode();

  if (code) {
    const { data } = await client.post('/auth/play-games', { serverAuthCode: code });
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken);
    await SecureStore.setItemAsync(PROVIDER_KEY, 'play_games');
    return { ...data, provider: 'play_games' };
  }

  const { data } = await client.post('/auth/device', { deviceId: await getDeviceId() });
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken);
  await SecureStore.setItemAsync(PROVIDER_KEY, 'device');
  return { ...data, provider: 'device' };
}

/** Le joueur joue-t-il sur une identite qui ne survivra pas a ce telephone ? */
export async function isFallbackAccount() {
  return (await SecureStore.getItemAsync(PROVIDER_KEY)) === 'device';
}

/**
 * Rattache un compte de repli a Play Games, quand le joueur a quelque chose a
 * perdre. Peut renvoyer {status: 'conflict'} : dans ce cas on demande au joueur
 * quelle progression garder, on ne fusionne jamais en silence.
 */
export async function linkPlayGames() {
  // ici l'appui du joueur est assume : il vient de cliquer « Sauvegarder »
  const code = await tryPlayGamesAuthCode({ interactive: true });
  if (!code) throw new Error('Play Games indisponible sur cet appareil');

  const { data } = await client.post('/auth/link-play-games', { serverAuthCode: code });
  if (data.status === 'linked') {
    await SecureStore.setItemAsync(PROVIDER_KEY, 'play_games');
  }
  return data;
}

/** Suppression de compte, exigee par le Play Store. */
export async function deleteAccount() {
  await client.delete('/account');
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(PROVIDER_KEY);
}
