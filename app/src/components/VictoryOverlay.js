// Ecran de victoire (prompt_base.txt, section 10).
//
// Le chiffre important est le percentile : c'est le principal element
// competitif du jeu. La mediane l'accompagne, jamais la moyenne — un joueur a
// 300 essais la deformerait au point de la rendre inutile (section 11).
//
// Volontairement peu de lignes : ne pas surcharger cet ecran.

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '../../theme/fonts';

/** Partage sans reveler le mot : donner envie, jamais spoiler (section 12). */
function shareText(victory, mode) {
  const lines = [
    mode === 'daily' ? `Lexik — mot du jour #${victory.dailyNumber}` : 'Lexik',
    '',
    `${victory.attempts} essais`,
    victory.hints > 0 ? `${victory.hints} indice${victory.hints > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  if (victory.percentile != null) {
    lines.push('', `Mieux que ${victory.percentile} % des joueurs`);
  }
  return lines.join('\n');
}

export default function VictoryOverlay({ victory, mode, palette, onClose }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Courte et satisfaisante, pas spectaculaire.
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: palette.bg, opacity: fade }]}>
      <View style={styles.content}>
        <Text style={[styles.check, { color: palette.ramp[5] }]}>BIEN JOUE</Text>

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

        <View style={styles.actions}>
          <Pressable
            onPress={() => Share.share({ message: shareText(victory, mode) })}
            style={[styles.secondary, { borderColor: palette.borderStrong }]}
          >
            <Text style={[styles.secondaryText, { color: palette.textDim }]}>Partager</Text>
          </Pressable>
          <Pressable onPress={onClose} style={[styles.primary, { backgroundColor: palette.surfaceRaised }]}>
            <Text style={[styles.primaryText, { color: palette.onRaised }]}>Continuer</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 22, width: '100%' },
  secondary: { flex: 1, height: 50, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.medium, fontSize: 15 },
  primary: { flex: 1, height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.medium, fontSize: 15 },
});
