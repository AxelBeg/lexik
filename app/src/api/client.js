// Client HTTP. Repris de LexiFight (components/utils/Api.js) : meme
// intercepteur de refresh, meme file d'attente des requetes pendant le
// rafraichissement. Seule la source du jeton change.

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from './config';

export const ACCESS_TOKEN_KEY = 'lexik_access_token';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

let isRefreshing = false;
let queue = [];
let onAuthLost = null;

/** Appele quand le refresh echoue : l'ecran racine relance une connexion. */
export function setAuthLostHandler(fn) {
  onAuthLost = fn;
}

const flush = (error, token = null) => {
  queue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  queue = [];
};

client.interceptors.request.use(async (config) => {
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
          `${API_BASE_URL}/auth/refresh`,
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
