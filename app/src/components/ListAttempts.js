// La liste triee de lignes de score, partagee par la partie et la revelation
// d'apres-partie.
//
// Extrait de GameScreen : les deux ecrans affichent la meme chose — des mots
// classes par proximite — et surtout ils butent sur les memes pieges Android.
// Les avoir a deux endroits, c'est se garantir de ne corriger qu'un des deux.
//
// Le composant ne trie pas et ne decide pas ce qui est mis en valeur. Il recoit
// des lignes deja ordonnees, deja marquees, et les rend. La partie les veut par
// score decroissant, la revelation par rang du modele : c'est le meme ordre en
// pratique, mais ce n'est pas la meme regle, et ce n'est pas a la liste d'en
// choisir une.

import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '../../theme/fonts';
import AttemptRow from './AttemptRow';

// Espacement entre deux lignes.
export const ROW_GAP = 4;

/**
 * @param rows  [{ word, score, isHint, highlighted, dimmed, rank }] deja ordonnees
 * @param emptyLabel  texte affiche quand `rows` est vide
 */
export default function ListAttempts({
  rows,
  palette,
  emptyLabel,
  ListHeaderComponent,
  contentContainerStyle,
  style,
}) {
  return (
    <FlatList
      data={rows}
      style={style}
      keyExtractor={(item) => item.word}
      renderItem={({ item }) => (
        <AttemptRow
          word={item.word}
          score={item.score}
          isHint={item.isHint}
          highlighted={item.highlighted}
          dimmed={item.dimmed}
          rank={item.rank}
          palette={palette}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
      ListHeaderComponent={ListHeaderComponent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Le degrade de fondu de la maquette a ete retire : pose au-dessus de la
      // liste, il masquait purement et simplement les dernieres lignes des que
      // la zone devenait courte — donc des que le joueur ajoutait une
      // proposition. Decoratif contre du contenu perdu : le contenu gagne.
      contentContainerStyle={[{ paddingBottom: 12 }, contentContainerStyle]}
      // PAS de getItemLayout ici, et c'est delibere.
      //
      // Avec un ItemSeparatorComponent, FlatList compte le separateur DANS la
      // cellule : une cellule mesure 38 + 4 = 42 px, pas 38. Annoncer
      // `length: 38` faisait diverger ses offsets calcules des positions
      // reelles, et elle laissait des cellules vides au milieu de la liste
      // apres chaque reordonnancement — c'est-a-dire a chaque proposition,
      // puisque la liste se retrie par score.
      //
      // Laisser FlatList mesurer coute une passe de layout et supprime le
      // probleme. L'optimisation n'en valait pas le prix.

      // Vrai par defaut sur Android, et cause connue de lignes vides : les vues
      // sorties du champ sont detachees puis mal reattachees.
      removeClippedSubviews={false}
      initialNumToRender={24}
      windowSize={21}
      ListEmptyComponent={
        emptyLabel ? (
          <Text style={[styles.empty, { color: palette.textGhost }]}>{emptyLabel}</Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 40 },
});
