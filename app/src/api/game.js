// Appels de jeu. Le client n'envoie que des actions : le serveur applique,
// persiste, et renvoie l'etat resultant. Il n'y a donc aucun etat a fusionner
// (docs/prompt-persistance.md, section 29).

import client from './client';

export const getMe = () => client.get('/me').then((r) => r.data);

export const startDaily = () => client.post('/daily/start').then((r) => r.data);

export const getCampaign = () => client.get('/campaign').then((r) => r.data);

export const startLevel = (planetId, levelNumber) =>
  client.post(`/campaign/${planetId}/${levelNumber}/start`).then((r) => r.data);

export const getGame = (gameId) => client.get(`/game/${gameId}`).then((r) => r.data);

export const sendGuess = (gameId, word) =>
  client.post(`/game/${gameId}/guess`, { word }).then((r) => r.data);

export const buyHint = (gameId) => client.post(`/game/${gameId}/hint`).then((r) => r.data);
