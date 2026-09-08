// Une ligne de la carte semantique.
//
// La barre de fond est proportionnelle au score : c'est ce qui fait « ressentir »
// la proximite sans lire le chiffre (prompt_base.txt, section 3). Les indices
// portent une petite ampoule et vivent dans la meme liste que les propositions,
// sans zone separee (section 7).
//
// ## Deux pieges Android evites ici, apres les avoir rencontres
//
// 1. `overflow: 'hidden'` combine a `borderRadius` force la vue dans une
//    couche de clipping. Sous Fabric, les enfants d'une telle vue qui contient
//    aussi un enfant en `position: absolute` peuvent ne pas etre peints du
//    tout : la ligne s'affiche vide alors que le composant a bien rendu son
//    texte. On ne clippe donc plus : la barre porte elle-meme son arrondi.
//
// 2. Un enfant en `position: absolute` peut passer PAR-DESSUS ses freres
//    declares apres lui sur Android, contrairement a l'ordre du DOM. Le texte
//    est donc explicitement remonte avec zIndex, comme la maquette le faisait
//    avec `position: relative` sur son contenu.

import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '../../theme/fonts';
import { scoreColor, scoreTint } from '../../theme/colors';
import { BulbIcon } from './Icons';

const RADIUS = 9;

// Pas de React.memo, volontairement. La liste se retrie a chaque proposition,
// donc les lignes changent de place : memoiser fait deplacer des vues natives
// deja montees au lieu de les reconstruire, et c'est precisement le chemin ou
// des lignes reapparaissent vides. Le cout d'un rendu complet est negligeable
// devant quelques centaines de lignes de texte.
export default function AttemptRow({ word, score, isHint, highlighted, palette }) {
  const color = scoreColor(score, palette);

  // Valeurs de repli visibles plutot qu'une ligne vide : si une proposition
  // arrive sans mot ou sans score, il faut le VOIR. Une ligne blanche laisse
  // croire a un bug d'affichage alors que le probleme serait dans les donnees.
  const label = word || '?';
  const value = Number.isFinite(score) ? Math.round(score) : '?';

  return (
    <View
      style={[
        styles.row,
        highlighted && { borderWidth: 1, borderColor: palette.focusRing, borderRadius: RADIUS },
      ]}
    >
      {/* Barre de proximite. Pas StyleSheet.absoluteFill : il pose left ET
          right, et Yoga ignore alors width — la barre faisait 100 % sur toutes
          les lignes. On cale a gauche seulement. */}
      <View
        style={[
          styles.bar,
          {
            width: `${Math.max(score || 0, 2)}%`,
            backgroundColor: scoreTint(score, palette, 0.13),
          },
        ]}
      />

      <View style={styles.left}>
        <View style={styles.marker}>
          {isHint ? <BulbIcon size={13} color={palette.currency} width={1.6} /> : null}
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.word,
            {
              color: isHint ? palette.textMuted : palette.text,
              fontFamily: highlighted ? Fonts.semibold : Fonts.regular,
            },
          ]}
        >
          {label}
        </Text>
      </View>

      <Text style={[styles.score, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 38,
    borderRadius: RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: RADIUS,
    zIndex: 0,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, zIndex: 1 },
  marker: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: 16, flexShrink: 1 },
  score: { fontFamily: Fonts.monoMedium, fontSize: 16, flexShrink: 0, zIndex: 1 },
});
