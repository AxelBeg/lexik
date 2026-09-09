// En dev, remplacer par l'IP de la machine sur le reseau local : un telephone
// ne resout pas localhost. En production, l'URL du serveur en HTTPS.

import { Platform } from 'react-native';

const DEV_HOST = '10.243.52.193';

export const API_BASE_URL = __DEV__
  ? `http://${Platform.OS === 'android' ? DEV_HOST : 'localhost'}:8000/api/v1`
  : 'https://api.lexik.app/api/v1';

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
