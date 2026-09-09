// Lecture d'un lien entrant.
//
// Deux formes, la meme grammaire :
//
//     lexik://jour/428              https://lexik.app/jour/428
//     lexik://niveau/terre/7        https://lexik.app/niveau/terre/7
//
// La forme https est celle qu'on partage — elle veut dire quelque chose pour
// quelqu'un qui n'a pas l'app. Le schema maison reste accepte parce qu'il ne
// coute rien et qu'il sert aux tests.
//
// ## Le numero du jour est ignore, et c'est normal
//
// `/jour/428` ouvre LE mot du jour, celui d'aujourd'hui — pas le 428e. Il n'y a
// pas d'archive : un lien recu le lendemain amene donc sur le mot du jour
// suivant, ce qui est le bon comportement par defaut (le destinataire a quelque
// chose a jouer) mais ne permet pas de relever le defi sur le meme mot passe la
// minuit. Le numero est conserve dans l'URL pour le jour ou une archive
// existera : les liens deja partages fonctionneront alors sans rien changer.

/** Decoupe le chemin, quelle que soit la forme du lien. */
function segments(url) {
  if (!url) return [];
  // On coupe apres le schema, puis apres l'hote s'il y en a un. `lexik://jour/1`
  // et `https://lexik.app/jour/1` doivent donner le meme chemin, or le premier
  // n'a pas d'hote : c'est « jour » qui occupe cette place.
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const path = withoutScheme.split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);

  // Un hote se reconnait a son point ; un premier segment de chemin n'en a pas.
  if (parts.length && parts[0].includes('.')) parts.shift();
  return parts.map((p) => decodeURIComponent(p).toLowerCase());
}

/**
 * La route a ouvrir, ou `null` si le lien ne dit rien qu'on sache jouer.
 *
 * Rendre `null` plutot que de retomber sur le menu est deliberé : l'appelant
 * doit pouvoir distinguer « ce lien demande le menu » de « ce lien ne me
 * concerne pas », et ne surtout pas casser la navigation en cours pour un lien
 * qu'il n'a pas compris.
 */
export function routeFromUrl(url) {
  const parts = segments(url);
  if (parts.length === 0) return null;

  if (parts[0] === 'jour') {
    return { name: 'game', params: { mode: 'daily' } };
  }

  if (parts[0] === 'niveau' && parts.length >= 3) {
    const levelNumber = Number(parts[2]);
    if (!Number.isInteger(levelNumber) || levelNumber < 1) return null;
    return {
      name: 'game',
      params: { mode: 'campaign', planetId: parts[1], levelNumber },
    };
  }

  return null;
}
