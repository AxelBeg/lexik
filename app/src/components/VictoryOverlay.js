// Ecran de victoire (prompt_base.txt, section 10).
//
// Le chiffre important est le percentile : c'est le principal element
// competitif du jeu. La mediane l'accompagne, jamais la moyenne — un joueur a
// 300 essais la deformerait au point de la rendre inutile (section 11).
//
// Vient ensuite la revelation : le classement des mots les plus proches du
// secret, avec ce que le joueur avait trouve. C'est la recompense d'apres
// partie — « fromage etait a trois places de ma meilleure proposition » — et
// c'est ce qui apprend le champ semantique pour la partie suivante. Ce
// classement n'apparait qu'ici, jamais pendant la partie : il EST la solution.
//
// Le bloc de victoire est l'en-tete de la liste et non un bandeau fixe. Sinon
// le classement se retrouve coince dans une bande de quelques lignes sur un
// petit ecran, alors qu'il est fait pour etre parcouru.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '../../theme/fonts';
import { shareText } from '../utils/share';
import ListAttempts from './ListAttempts';

export default function VictoryOverlay({
  victory, mode, palette, animate = true, onClose,
}) {
  // Deja opaque quand `animate` est faux : le fondu celebre le moment ou le mot
  // vient d'etre trouve. Rejouer ce fondu a chaque reouverture d'une partie
  // gagnee ferait clignoter l'ecran de jeu derriere, et donnerait a croire que
  // la victoire vient d'arriver.
  const fade = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!animate) return;
    // Un fondu, pas une arrivee. La celebration a deja eu lieu sur l'ecran de
    // jeu — le chiffre y est monte jusqu'a 100 et la barre y a deborde, une
    // bonne seconde en tout ; cet ecran-ci n'a plus a annoncer la victoire,
    // seulement a prendre la suite.
    Animated.timing(fade, {
      toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [fade, animate]);

  // Le fond, lui, ne bouge pas : le glisser laisserait voir l'ecran de jeu
  // depasser en bas. Seul le contenu se pose.
  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  // Trois etats par ligne, et ils ne disent pas la meme chose :
  //   trouve  — le joueur l'a propose, c'est son merite : plein contraste
  //   indice  — on le lui a donne : la meme ampoule que pendant la partie
  //   ni l'un ni l'autre — ce qu'il a manque : attenue, present sans peser
  // Sans cette distinction, l'ecran felicite le joueur pour des mots qu'il n'a
  // jamais trouves.
  const rows = useMemo(
    () =>
      (victory.neighbors ?? []).map((n) => ({
        word: n.word,
        score: n.score,
        rank: n.rank,
        isHint: n.hint,
        highlighted: n.found,
        dimmed: !n.found && !n.hint,
      })),
    [victory.neighbors],
  );

  const foundCount = rows.filter((r) => r.highlighted).length;

  const header = (
    <Animated.View style={[styles.content, { transform: [{ translateY: rise }] }]}>
      <Text style={[styles.check, { color: palette.ramp[5] }]}>NIVEAU TERMINÉ</Text>

      <Text style={[styles.word, { color: palette.text }]}>
        {(victory.secretWord ?? '').toUpperCase()}
      </Text>

      <View style={styles.counts}>
        <Text style={[styles.count, { color: palette.textFaint }]}>
          <Text style={[styles.mono, { color: palette.text }]}>{victory.attempts}</Text> essais
        </Text>
        <Text style={[styles.count, { color: palette.textFaint }]}>
          <Text style={[styles.mono, { color: palette.text }]}>{victory.hints}</Text>{' '}
          indice{victory.hints > 1 ? 's' : ''}
        </Text>
      </View>

      {victory.percentile != null && (
        <View style={styles.percentileBlock}>
          <Text style={[styles.percentile, { color: palette.rampHot }]}>
            Mieux que {victory.percentile} % des joueurs
          </Text>
          {victory.median != null && (
            <Text style={[styles.median, { color: palette.textGhost }]}>
              Mediane : <Text style={styles.monoSmall}>{victory.median}</Text> essais
            </Text>
          )}
        </View>
      )}

      {victory.streak > 0 && mode === 'daily' && (
        <Text style={[styles.streak, { color: palette.textFaint }]}>
          Serie de {victory.streak} jour{victory.streak > 1 ? 's' : ''}
        </Text>
      )}

      {rows.length > 0 && (
        <View style={styles.revealTitle}>
          <Text style={[styles.revealLabel, { color: palette.textFaint }]}>
            LES {rows.length} MOTS LES PLUS PROCHES
          </Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.backdrop,
        { backgroundColor: palette.bg, opacity: fade, paddingTop: insets.top + 24 },
      ]}
    >
      {/* Aucune liste si le serveur n'a pas envoye de voisins : une base sans
          `precompute_neighbors` ne doit pas casser la victoire, juste ne rien
          reveler. On retombe alors exactement sur l'ecran d'origine. */}
      {rows.length > 0 ? (
        <ListAttempts
          rows={rows}
          palette={palette}
          style={styles.list}
          ListHeaderComponent={header}
        />
      ) : (
        <View style={styles.centered}>{header}</View>
      )}

      <Animated.View
        style={[
          styles.actions,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: rise }] },
        ]}
      >
        <Pressable
          onPress={() => Share.share({ message: shareText(victory, mode) })}
          style={[styles.secondary, { borderColor: palette.borderStrong }]}
        >
          <Text style={[styles.secondaryText, { color: palette.textDim }]}>Defier</Text>
        </Pressable>
        <Pressable onPress={onClose} style={[styles.primary, { backgroundColor: palette.surfaceRaised }]}>
          <Text style={[styles.primaryText, { color: palette.onRaised }]}>Continuer</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { paddingHorizontal: 24 },
  list: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: 18, width: '100%' },
  check: { fontFamily: Fonts.medium, fontSize: 12, letterSpacing: 3 },
  word: { fontFamily: Fonts.bold, fontSize: 40, letterSpacing: 2, textAlign: 'center' },
  counts: { flexDirection: 'row', gap: 20 },
  count: { fontFamily: Fonts.regular, fontSize: 14 },
  mono: { fontFamily: Fonts.monoMedium, fontSize: 15 },
  monoSmall: { fontFamily: Fonts.mono, fontSize: 13 },
  percentileBlock: { alignItems: 'center', gap: 6, marginTop: 8 },
  percentile: { fontFamily: Fonts.semibold, fontSize: 18, textAlign: 'center' },
  median: { fontFamily: Fonts.regular, fontSize: 13 },
  streak: { fontFamily: Fonts.regular, fontSize: 13 },
  revealTitle: { alignItems: 'center', gap: 4, marginTop: 14, marginBottom: 6 },
  revealLabel: { fontFamily: Fonts.medium, fontSize: 11, letterSpacing: 2, marginBottom: 10},
  actions: { flexDirection: 'row', gap: 12, paddingTop: 14, width: '100%' },
  secondary: { flex: 1, height: 50, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.medium, fontSize: 15 },
  primary: { flex: 1, height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.medium, fontSize: 15 },
});
