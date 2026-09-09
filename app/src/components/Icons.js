// Icones reprises telles quelles des maquettes lexik-design (memes chemins
// SVG, meme grille 24). L'ampoule est la monnaie du jeu : elle ne doit jamais
// designer autre chose.

import React from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

const stroke = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

export const BulbIcon = ({ size = 18, color = '#d29a4a', width = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={width}>
    <Path d="M9.5 18h5" {...stroke} stroke={color} strokeWidth={width} />
    <Path d="M10.5 21h3" {...stroke} stroke={color} strokeWidth={width} />
    <Path
      d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3z"
      {...stroke}
      stroke={color}
      strokeWidth={width}
    />
  </Svg>
);

export const FlameIcon = ({ size = 15, color = '#737d92' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.5}>
    <Path
      d="M12 3c.6 3-1.2 4.2-2.6 5.6C8 10 7 11.4 7 13.6A5 5 0 0 0 12 19a5 5 0 0 0 5-5.4c0-2.6-1.5-4-2.8-5.4"
      {...stroke}
      stroke={color}
      strokeWidth={1.5}
    />
  </Svg>
);

export const ChevronRight = ({ size = 18, color = '#eceef4' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.8}>
    <Path d="M9 6l6 6-6 6" {...stroke} stroke={color} strokeWidth={1.8} />
  </Svg>
);

export const ChevronLeft = ({ size = 20, color = '#8b94a8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.8}>
    <Path d="M15 6l-6 6 6 6" {...stroke} stroke={color} strokeWidth={1.8} />
  </Svg>
);

export const ArrowUp = ({ size = 18, color = '#8b94a8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.8}>
    <Path d="M12 19V5" {...stroke} stroke={color} strokeWidth={1.8} />
    <Path d="M6 11l6-6 6 6" {...stroke} stroke={color} strokeWidth={1.8} />
  </Svg>
);

export const CheckIcon = ({ size = 14, color = '#6f7789' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={2.4}>
    <Path d="M4 12.5l5 5L20 6.5" {...stroke} stroke={color} strokeWidth={2.4} />
  </Svg>
);

export const LockIcon = ({ size = 15, color = '#4c5568' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.6}>
    <Rect x="5" y="11" width="14" height="9" rx="2" {...stroke} stroke={color} strokeWidth={1.6} />
    <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...stroke} stroke={color} strokeWidth={1.6} />
  </Svg>
);

export const MenuIcon = ({ size = 18, color = '#4c5568', bg = '#0a0c11' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color} strokeWidth={1.5}>
    <Path d="M4 7h16M4 12h16M4 17h16" {...stroke} stroke={color} strokeWidth={1.5} />
    <Circle cx="9" cy="7" r="2.4" fill={bg} />
    <Circle cx="15" cy="12" r="2.4" fill={bg} />
    <Circle cx="9" cy="17" r="2.4" fill={bg} />
  </Svg>
);

/** Livree de chaque astre, sur la grille 26.
 *
 * Les six planetes partageaient le meme disque : la ligne TERRE et la ligne
 * NEPTUNE ne se distinguaient que par leur nom. Chacune a maintenant sa teinte
 * ET son relief — calotte de Mars, bandes de Jupiter, anneaux de Saturne et
 * d'Uranus — pour qu'on reconnaisse ou l'on est avant d'avoir lu.
 *
 * Une boule pleine, d'un seul tenant : pas de moitie sombre. A 26 px, le
 * terminateur coupait l'astre en deux au lieu de l'arrondir, et la moitie
 * droite du relief passait dessous. Le volume vient maintenant du relief seul.
 *
 *   r          rayon du globe : reduit sur les planetes a anneaux, qui ont
 *              besoin de la place autour d'elles.
 *   ringBack   l'anneau complet, pose AVANT le globe : sa moitie arriere
 *              passe donc derriere l'astre.
 *   surface    le relief, decoupe au disque.
 *   ringFront  le brin d'anneau qui repasse devant. Sans lui, l'anneau
 *              disparait derriere le globe et Saturne devient une bille.
 */
const ASTRES = {
  terre: {
    r: 9.5,
    surface: (c) => (
      <>
        <Path d="M4.4 11.6c1.4-1.7 3.3-2.3 5.2-1.6 1.9.7 2.1 2.5.5 3.4-1.9 1.1-4.4.6-5.7-.7z" fill={c.detail} />
        <Path d="M12.2 16.5c1.8-1.5 4-1.7 5.7-.7 1.5 1 1.1 2.9-.7 3.5-2.2.7-4.3-.5-5-1.9z" fill={c.detail} />
        <Circle cx="16.4" cy="8.1" r="2.1" fill={c.detail} />
      </>
    ),
  },
  mars: {
    r: 9.5,
    surface: (c) => (
      <>
        {/* calottes polaires : le seul detail de Mars visible a l'oeil nu */}
        <Ellipse cx="13" cy="4.4" rx="4.6" ry="1.9" fill={c.detail} />
        <Ellipse cx="12.2" cy="21.7" rx="3.4" ry="1.5" fill={c.detail} />
        <Ellipse cx="10.2" cy="13.6" rx="4.5" ry="2.7" fill={c.shade} opacity={0.8} />
        <Ellipse cx="17.6" cy="10" rx="2.2" ry="1.4" fill={c.shade} opacity={0.6} />
      </>
    ),
  },
  jupiter: {
    r: 9.5,
    surface: (c) => (
      <>
        <Rect x="2" y="6" width="22" height="1.9" fill={c.detail} />
        <Rect x="2" y="9.9" width="22" height="2.4" fill={c.detail} />
        <Rect x="2" y="15.4" width="22" height="1.8" fill={c.detail} />
        <Rect x="2" y="19.2" width="22" height="1.5" fill={c.detail} />
        {/* la Grande Tache rouge, posee apres les bandes : elle les recouvre */}
        <Ellipse cx="9.4" cy="13.9" rx="2.6" ry="1.4" fill={c.spot} />
      </>
    ),
  },
  saturne: {
    r: 7.4,
    ringBack: (c) => (
      <Ellipse
        cx="13" cy="13" rx="11.4" ry="3.8"
        stroke={c.detail} strokeWidth="1.5" fill="none"
        rotation={-18} origin="13, 13"
      />
    ),
    surface: (c) => (
      <Rect x="4" y="11.7" width="18" height="1.7" fill={c.detail} opacity={0.45} />
    ),
    ringFront: (c) => (
      <Path
        d="M2.16 16.52Q15.34 20.22 23.84 9.48"
        stroke={c.detail} strokeWidth="1.5" fill="none" strokeLinecap="round"
      />
    ),
  },
  uranus: {
    // Globe reduit et anneau largement ouvert : serre contre le disque,
    // l'anneau vertical ne formait plus qu'une pointe de part et d'autre.
    r: 7.2,
    // anneaux presque verticaux : Uranus roule sur le flanc, c'est sa signature.
    ringBack: (c) => (
      <Ellipse
        cx="13" cy="13" rx="11.4" ry="3.8"
        stroke={c.detail} strokeWidth="1.5" fill="none"
        rotation={-18} origin="13, 13"
      />
    ),
    ringFront: (c) => (
      <Path
        d="M2.16 16.52Q15.34 20.22 23.84 9.48"
        stroke={c.detail} strokeWidth="1.5" fill="none" strokeLinecap="round"
      />
    ),
  },
  neptune: {
    r: 6.8,
    surface: (c) => (
      <>
        <Rect x="2" y="8.2" width="22" height="1.6" fill={c.detail} opacity={0.7} />
        <Rect x="2" y="17.4" width="22" height="1.4" fill={c.detail} opacity={0.5} />
        <Ellipse cx="10.4" cy="13.2" rx="3.2" ry="2.1" fill={c.shade} />
      </>
    ),
  },
};

/** Marqueur de planete : un disque plein, son relief, ses anneaux. */
export const PlanetIcon = ({ size = 26, planet = 'terre', colors }) => {
  const astre = ASTRES[planet] ?? ASTRES.terre;
  const r = astre.r;
  // Un identifiant par astre, pas par instance : deux Saturne a l'ecran
  // partagent alors la meme decoupe, qui est de toute facon la meme.
  const clip = `astre-${planet}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 26 26" fill="none">
      <Defs>
        <ClipPath id={clip}>
          <Circle cx="13" cy="13" r={r} />
        </ClipPath>
      </Defs>

      {astre.ringBack?.(colors)}
      <Circle cx="13" cy="13" r={r} fill={colors.body} />
      {/* Le relief est decoupe au disque : les bandes de Jupiter sont des
          rectangles pleine largeur, c'est la decoupe qui leur donne la
          courbure du bord. */}
      <G clipPath={`url(#${clip})`}>{astre.surface?.(colors)}</G>
      {astre.ringFront?.(colors)}
    </Svg>
  );
};
