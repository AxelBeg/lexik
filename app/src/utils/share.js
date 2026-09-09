// Le message de partage.
//
// Il a un seul travail : donner envie a quelqu'un d'essayer de faire mieux. Pas
// resumer la partie, pas feliciter le joueur — le narguer, et lui donner de quoi
// narguer les autres.
//
// Trois contraintes, dans cet ordre :
//
// 1. NE JAMAIS REVELER LE MOT. Ni le mot, ni une proposition, ni un indice.
// 2. Porter un defi chiffre. « 18 essais » est le nombre que le destinataire
//    voudra battre ; c'est lui qui fait ouvrir l'app.
// 3. Emmener quelque part. Un partage sans lien ne peut rien declencher.

import { SHARE_BASE_URL } from '../api/config';

/** Le lien qui ouvre exactement ce que le joueur vient de faire. */
export function shareUrl(victory, mode) {
  if (mode === 'daily') return `${SHARE_BASE_URL}/jour/${victory.dailyNumber}`;
  return `${SHARE_BASE_URL}/niveau/${victory.planetId}/${victory.levelNumber}`;
}

export function shareText(victory, mode) {
  const essais = `${victory.attempts} essai${victory.attempts > 1 ? 's' : ''}`;
  const aide = victory.hints > 0
    ? ` et ${victory.hints} indice${victory.hints > 1 ? 's' : ''}`
    : '';

  const lines = [
    mode === 'daily'
      ? `Lexik — mot du jour #${victory.dailyNumber}`
      : `Lexik — ${(victory.planetId ?? '').toUpperCase()} ${victory.levelNumber}`,
    `Trouve en ${essais}${aide}.`,
  ];

  // Le percentile n'est la que s'il flatte. Annoncer « mieux que 12 % des
  // joueurs » dans un message de defi, c'est se narguer soi-meme.
  if (victory.percentile != null && victory.percentile >= 50) {
    lines.push(`Mieux que ${victory.percentile} % des joueurs.`);
  }

  lines.push('', 'Fais mieux :', shareUrl(victory, mode));
  return lines.join('\n');
}
