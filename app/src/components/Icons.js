// Icones reprises telles quelles des maquettes lexik-design (memes chemins
// SVG, meme grille 24). L'ampoule est la monnaie du jeu : elle ne doit jamais
// designer autre chose.

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

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

/** Marqueur de planete. Deux tons : la moitie eclairee, la moitie sombre. */
export const PlanetIcon = ({ size = 26, colors }) => (
  <Svg width={size} height={size} viewBox="0 0 26 26" fill="none">
    <Circle cx="13" cy="13" r="9.5" fill={colors[0]} />
    <Path d="M13 3.5a9.5 9.5 0 0 1 0 19" fill={colors[1]} />
  </Svg>
);
