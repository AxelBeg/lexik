// Systeme de couleur, extrait des maquettes lexik-design.
//
// Regle du systeme (annotation du canvas) : le degrade semantique
// bleu -> neutre tiede -> ambre -> orange -> rouge est reserve AUX SCORES DE
// PROXIMITE, nulle part ailleurs. La progression de campagne est en gris
// neutre, la monnaie et les indices en ambre. Aucune couleur ne veut dire deux
// choses.
//
// Les livrees de planetes (table `planets`) sont la seule famille de teintes
// qui sort de ce cadre, et elles n'y contreviennent pas : elles ne veulent rien
// dire du tout. Elles nomment un lieu — Mars, Jupiter — comme le ferait une
// etiquette. C'est aussi pour ca qu'elles ne teintent jamais une barre de
// progression ni un score : la ou une couleur SIGNIFIE quelque chose, les
// regles ci-dessus continuent de s'appliquer seules.

const dark = {
  bg: '#0a0c11',
  surface: '#141821',
  surfaceRaised: '#1e2531',
  // contenu pose SUR surfaceRaised. En clair, ce fond s'inverse et devient
  // sombre (le cercle du chevron, maquette MainClair) : sans ce jeton, l'icone
  // disparaitrait dedans.
  onRaised: '#eceef4',
  surfaceInput: '#232b3a',
  border: '#242b39',
  borderStrong: '#2a3140',
  borderCell: '#2b3444',
  borderSubtle: '#1a202b',
  track: '#1c2330',
  trackDeep: '#151a24',
  text: '#eceef4',
  textStrong: '#ffffff',
  textMuted: '#c3c9d6',
  textDim: '#8b94a8',
  textFaint: '#737d92',
  textGhost: '#4c5568',
  textCell: '#6f7789',
  focusRing: '#3c4761',

  // rampe semantique, du plus loin au plus proche
  ramp: ['#3f5496', '#4a6fbf', '#5f8bb0', '#9c9078', '#d29a4a', '#ee8038', '#ff4530'],
  rampHot: '#fb6134',

  currency: '#d29a4a',   // ambre : monnaie et indices, jamais un score
  progress: '#8b94a8',   // gris neutre : progression de campagne
  planetLocked: ['#2a2f3a', '#3a4150'],

  // Livree de chaque astre. Ce n'est pas un jeton semantique de plus : ces
  // teintes ne disent rien du score ni de la progression, elles IDENTIFIENT la
  // planete — Mars est rouille, Jupiter ocre, Neptune bleu profond. C'est pour
  // cela qu'elles vivent dans leur propre table et n'empruntent jamais a la
  // rampe : une cellule ocre reste une cellule de Jupiter, jamais un score.
  //   body   le disque, d'un seul tenant
  //   shade  les taches sombres de la surface
  //   detail le relief clair : calotte, bandes, anneaux
  planets: {
    terre:   { body: '#2f6f9e', shade: '#173f5f', detail: '#4e9a70' },
    mars:    { body: '#b1512c', shade: '#6f2d15', detail: '#e8d9c9' },
    jupiter: { body: '#c1935f', shade: '#7d5931', detail: '#eacfa8', spot: '#b0503a' },
    saturne: { body: '#cfae6c', shade: '#8a7040', detail: '#ecdcb2' },
    uranus:  { body: '#6bbec6', shade: '#357f88', detail: '#c6eaec' },
    neptune: { body: '#3a5cc0', shade: '#1f3378', detail: '#8ba4e8' },
  },
};

// Version claire : memes structures, memes regles. La rampe est retendue
// (plus sombre, plus saturee) car les couleurs calibrees pour le fond noir
// perdent tout contraste sur blanc.
const light = {
  bg: '#f7f6f4',
  surface: '#ffffff',
  // Le seul jeton qui ne suit PAS la logique « clair = plus pale » : dans la
  // maquette MainClair, le cercle du chevron est presque noir. C'est voulu, et
  // c'est ce qui donne son point d'appui a la carte sur fond blanc.
  surfaceRaised: '#16181d',
  onRaised: '#ffffff',
  surfaceInput: '#eceae6',
  border: '#e4e3df',
  borderStrong: '#d8d7d3',
  borderCell: '#e6e5e2',
  borderSubtle: '#e9e8e4',
  track: '#eceae6',
  trackDeep: '#eceae6',
  text: '#16181d',
  textStrong: '#000000',
  textMuted: '#4a4c54',
  textDim: '#6f7078',
  textFaint: '#6f7078',
  textGhost: '#a3a5ad',
  textCell: '#a3a5ad',
  focusRing: '#a3a5ad',

  ramp: ['#34489a', '#3560ad', '#47789b', '#86775c', '#b57a1e', '#d1651c', '#cf2d18'],
  rampHot: '#dc4a1c',

  currency: '#b57a1e',
  progress: '#8b8d96',
  planetLocked: ['#d8d7d3', '#b9b8b3'],

  // Memes astres, retendus comme la rampe : sur fond clair, les teintes
  // calibrees pour le noir se delavent.
  planets: {
    terre:   { body: '#2b6690', shade: '#123653', detail: '#3f8760' },
    mars:    { body: '#a4471f', shade: '#68260f', detail: '#d9c4ab' },
    jupiter: { body: '#b0824c', shade: '#6f4d28', detail: '#dfbd8e', spot: '#9f4127' },
    saturne: { body: '#bf9a4f', shade: '#7b6234', detail: '#dfc98d' },
    uranus:  { body: '#4da8b1', shade: '#2a6d76', detail: '#a6dade' },
    neptune: { body: '#314fa8', shade: '#1a2b66', detail: '#7189d4' },
  },
};

export const themes = { dark, light };

/** Couleur d'un score de proximite, sur la rampe semantique. */
export function scoreColor(score, palette) {
  const ramp = palette.ramp;
  if (score == null) return palette.textGhost;
  if (score >= 95) return palette.rampHot;
  if (score >= 85) return ramp[5];
  if (score >= 70) return ramp[4];
  if (score >= 55) return ramp[3];
  if (score >= 35) return ramp[2];
  if (score >= 20) return ramp[1];
  return ramp[0];
}

/** Un hexadecimal du systeme, rendu translucide. */
export function withAlpha(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Fond translucide d'une ligne de proposition : la barre de proximite. */
export function scoreTint(score, palette, opacity = 0.12) {
  return withAlpha(scoreColor(score, palette), opacity);
}

/** Livree de l'astre, ou son etat verrouille.
 *
 * Une planete verrouillee reste grise : la couleur est une recompense, on la
 * decouvre en arrivant sur l'astre. Le relief, lui, est conserve — les anneaux
 * de Saturne se reconnaissent avant meme qu'elle soit ouverte.
 */
export function planetColors(id, palette, locked = false) {
  if (locked) {
    const [body, shade] = palette.planetLocked;
    return { body, shade, detail: shade, spot: shade };
  }
  const astre = palette.planets[id] ?? palette.planets.terre;
  return { spot: astre.shade, ...astre };
}
