// Reglages.
//
// Deux choses obligatoires y vivent (docs/prompt-persistance.md, section 30) :
//   - la suppression de compte, exigee par le Play Store des lors qu'on stocke
//     des donnees rattachees a une identite ;
//   - la sauvegarde de progression, proposee aux joueurs en repli dont la
//     progression ne vit que sur cet appareil.

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteAccount, isFallbackAccount, linkPlayGames } from '../api/auth';
import { Fonts } from '../../theme/fonts';
import { ChevronLeft } from '../components/Icons';

function Row({ title, subtitle, onPress, palette, danger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: palette.borderStrong, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.rowTitle, { color: danger ? palette.ramp[6] : palette.text }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.rowSub, { color: palette.textFaint }]}>{subtitle}</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen({ navigate, palette }) {
  const [fallback, setFallback] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    isFallbackAccount().then(setFallback);
  }, []);

  const onLink = async () => {
    try {
      const res = await linkPlayGames();
      if (res.status === 'conflict') {
        // On ne fusionne jamais en silence : le joueur choisit (section 29).
        Alert.alert(
          'Deux progressions',
          `Cet appareil : ${res.this_device.levels_completed} niveaux\n` +
            `Ton compte Play Games : ${res.play_games.levels_completed} niveaux\n\n` +
            'Laquelle garder ?',
          [{ text: 'Plus tard', style: 'cancel' }],
        );
      } else {
        setFallback(false);
        Alert.alert('Progression sauvegardee', 'Elle te suivra sur tes autres appareils.');
      }
    } catch (e) {
      Alert.alert('Impossible', e.message);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Supprimer le compte',
      'Toute ta progression sera definitivement perdue. Cette action est irreversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount();
            navigate('menu');
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => navigate('back')} hitSlop={12} style={styles.backButton}>
          <ChevronLeft color={palette.textDim} />
        </Pressable>
        <View style={styles.topTitleWrap} pointerEvents="none">
          <Text style={[styles.topTitle, { color: palette.textFaint }]}>REGLAGES</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ gap: 10, marginTop: 28 }}>
        {fallback && (
          <Row
            palette={palette}
            title="Sauvegarder ma progression"
            subtitle="Elle est actuellement sur cet appareil uniquement."
            onPress={onLink}
          />
        )}
        <Row
          palette={palette}
          title="Supprimer mon compte"
          subtitle="Definitif, sans recuperation possible."
          onPress={onDelete}
          danger
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 28 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  // Centre sur la PAGE, pas dans l'espace laisse entre les deux cotes : la
  // fleche (44 moins 12 de marge) et le solde (52) n'ont pas la meme largeur,
  // donc un simple space-between decalait le titre vers la gauche.
  //
  // Le conteneur est absolu et en pointerEvents 'none' : sans ca, il couvrirait
  // toute la barre et avalerait l'appui sur la fleche de retour.
  topTitleWrap: {
    position: 'absolute', left: 0, right: 0, alignItems: 'center',
  },
  // marginLeft compense l'espacement ajoute APRES la derniere lettre par
  // letterSpacing, qui decalerait sinon le texte d'un demi-cran vers la gauche.
  topTitle: {
    fontFamily: Fonts.medium, fontSize: 11, letterSpacing: 2.4, marginLeft: 2.4,
  },
  row: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 },
  rowTitle: { fontFamily: Fonts.medium, fontSize: 15 },
  rowSub: { fontFamily: Fonts.regular, fontSize: 12 },
});
