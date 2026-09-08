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
