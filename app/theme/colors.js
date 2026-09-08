// Systeme de couleur, extrait des maquettes lexik-design.
//
// Regle du systeme (annotation du canvas) : le degrade semantique
// bleu -> neutre tiede -> ambre -> orange -> rouge est reserve AUX SCORES DE
// PROXIMITE, nulle part ailleurs. La progression de campagne est en gris
// neutre, la monnaie et les indices en ambre. Aucune couleur ne veut dire deux
// choses.

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
  planetActive: ['#245a66', '#3f8a99'],
  planetLocked: ['#2a2f3a', '#3a4150'],
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
  planetActive: ['#245a66', '#3f8a99'],
  planetLocked: ['#d8d7d3', '#b9b8b3'],
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

/** Fond translucide d'une ligne de proposition : la barre de proximite. */
export function scoreTint(score, palette, opacity = 0.12) {
  const hex = scoreColor(score, palette);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
