// Client HTTP. Repris de LexiFight (components/utils/Api.js) : meme
// intercepteur de refresh, meme file d'attente des requetes pendant le
// rafraichissement. Seule la source du jeton change.

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { apiBaseUrl } from './config';

export const ACCESS_TOKEN_KEY = 'lexik_access_token';

// Pas de `baseURL` fige a la creation : en dev, l'adresse du serveur se change
// depuis les reglages, et une instance creee au premier import continuerait de
// parler a l'ancienne machine jusqu'au prochain redemarrage. Elle est donc
// relue a chaque requete, plus bas.
const client = axios.create({ timeout: 15000 });

let isRefreshing = false;
let queue = [];
let onAuthLost = null;

/** Appele quand le refresh echoue : l'ecran racine relance une connexion. */
export function setAuthLostHandler(fn) {
  onAuthLost = fn;
}

/**
 * Jette le jeton et relance une connexion.
 *
 * Sert au changement de serveur de dev : le jeton a ete signe par la machine
 * precedente, la nouvelle le refusera avec un 401 qui n'est pas TOKEN_EXPIRED
 * — donc sans rafraichissement possible. Repartir d'une connexion propre est
 * la seule issue, et c'est immediat en mode repli.
 */
export async function resetSession() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  if (onAuthLost) onAuthLost();
}

const flush = (error, token = null) => {
  queue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  queue = [];
};

client.interceptors.request.use(async (config) => {
  config.baseURL = apiBaseUrl();
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const detail = error.response?.data?.detail;

    if (error.response?.status === 401 && detail === 'TOKEN_EXPIRED' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject })).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const old = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        const res = await axios.post(
          `${apiBaseUrl()}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${old}` } },
        );
        const token = res.data.accessToken;
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
        flush(null, token);
        original.headers.Authorization = `Bearer ${token}`;
        return client(original);
      } catch (err) {
        flush(err, null);
        // le jeton est mort : on repart d'une connexion propre
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        if (onAuthLost) onAuthLost();
        throw err;
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/** Message lisible pour l'utilisateur, sans jamais exposer la stack serveur. */
export function errorMessage(error, fallback = 'Connexion impossible') {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return fallback;
}

export default client;
