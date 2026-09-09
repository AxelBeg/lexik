// Menu principal — maquette Main.dc.html.
//
// Deux cartes, une monnaie, une serie. Rien d'autre : le joueur doit avoir
// l'impression d'etre seul face a un probleme, pas devant un tableau de bord
// (prompt_base.txt, section 2).

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMe } from '../api/game';
import { CacheKeys, readCache, writeCache } from '../utils/cache';
import { syncDailyReminder } from '../utils/notifications';
import { Fonts } from '../../theme/fonts';
import { planetColors } from '../../theme/colors';
import { BulbIcon, ChevronRight, FlameIcon, MenuIcon, PlanetIcon } from '../components/Icons';

/** Le degrade de la marque : la rampe semantique en sept points. */
function RampDots({ palette }) {
  return (
    <View style={styles.dots}>
      {palette.ramp.map((c) => (
        <View key={c} style={[styles.dot, { backgroundColor: c }]} />
      ))}
    </View>
  );
}

function ModeCard({ label, meta, title, subtitle, progress, progressColors, onPress, palette }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardLabel, { color: palette.textFaint }]}>{label}</Text>
        {meta}
      </View>

      <View style={styles.cardBody}>
        <View style={{ flex: 1, gap: 7 }}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
          {subtitle}
        </View>
        <View style={[styles.chevron, { backgroundColor: palette.surfaceRaised }]}>
          {/* onRaised, pas text : en clair ce cercle est presque noir */}
          <ChevronRight color={palette.onRaised} />
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: palette.track }]}>
        <View
          style={{
            width: `${Math.min(Math.max(progress, 0), 100)}%`,
            height: 3,
            borderRadius: 2,
            backgroundColor: progressColors,
          }}
        />
      </View>
    </Pressable>
  );
}

export default function MainMenu({ navigate, palette }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async (isRefresh = false) => {
    // Le cache peint l'ecran tout de suite ; le serveur l'ecrase juste apres.
    if (!isRefresh) {
      const cached = await readCache(CacheKeys.me);
      if (cached) {
        setMe(cached);
        setLoading(false);
      }
    }
    try {
      const data = await getMe();
      setMe(data);
      writeCache(CacheKeys.me, data);
      // Le menu est le seul endroit traverse a chaque session, et il vient de
      // recevoir l'etat frais : c'est donc ici qu'on repose les rappels du
      // soir. En particulier, celui de ce soir disparait des que `data.daily`
      // dit que le mot est trouve.
      syncDailyReminder(data).catch(() => {});
    } catch (e) {
      console.log('Menu : chargement impossible', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !me) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.textDim} />
      </View>
    );
  }

  const daily = me?.daily ?? {};
  const campaign = me?.campaign ?? {};

  const dailyTitle = daily.completed
    ? 'Mot du jour trouve'
    : daily.started
      ? 'Reprendre la partie'
      : 'Jouer le mot du jour';

  const campaignProgress = campaign.totalLevels
    ? (campaign.completedCount / campaign.totalLevels) * 100
    : 0;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true);
          }}
          tintColor={palette.textDim}
        />
      }
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => navigate('settings')} hitSlop={12} style={styles.iconButton}>
          <MenuIcon color={palette.textGhost} bg={palette.bg} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.brand}>
        <Text style={[styles.logo, { color: palette.text }]}>LEXIK</Text>
        <RampDots palette={palette} />
      </View>

      <View style={{ flex: 1.2 }} />

      <View style={{ gap: 12 }}>
        <ModeCard
          palette={palette}
          label="QUOTIDIEN"
          meta={<Text style={[styles.mono11, { color: palette.textGhost }]}>#{daily.number}</Text>}
          title={dailyTitle}
          subtitle={
            daily.started ? (
              <Text style={[styles.cardSub, { color: palette.textFaint }]}>
                <Text style={styles.mono13}>{daily.attemptsCount}</Text> essais
                {daily.bestScore != null && (
                  <>
                    {'  ·  '}meilleur score{' '}
                    <Text style={[styles.mono13, { color: palette.ramp[5] }]}>
                      {Math.round(daily.bestScore)}
                    </Text>
                  </>
                )}
              </Text>
            ) : (
              <Text style={[styles.cardSub, { color: palette.textFaint }]}>
                Un mot, tous les joueurs
              </Text>
            )
          }
          progress={daily.completed ? 100 : (daily.bestScore ?? 0)}
          progressColors={palette.ramp[5]}
          onPress={() => navigate('game', { mode: 'daily' })}
        />

        <ModeCard
          palette={palette}
          label="CAMPAGNE"
          // L'astre en cours, dans sa livree : la carte du menu porte la
          // meme couleur que la ligne qu'on retrouvera sur l'ecran campagne.
          meta={(
            <PlanetIcon
              size={14}
              planet={campaign.planetId ?? 'terre'}
              colors={planetColors(campaign.planetId ?? 'terre', palette)}
            />
          )}
          title={`Continuer sur ${campaign.planetName ?? 'Terre'}`}
          subtitle={
            <Text style={[styles.cardSub, { color: palette.textFaint }]}>
              <Text style={styles.mono13}>{campaign.completedCount ?? 0}</Text> /{' '}
              <Text style={styles.mono13}>{campaign.totalLevels ?? 30}</Text> niveaux termines
            </Text>
          }
          progress={campaignProgress}
          progressColors={palette.progress}
          onPress={() => navigate('campaign')}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <BulbIcon size={18} color={palette.currency} />
          <Text style={[styles.currency, { color: palette.currency }]}>{me?.currency ?? 0}</Text>
        </View>
        {me?.streak > 0 && (
          <View style={styles.footerItem}>
            <FlameIcon color={palette.textFaint} />
            <Text style={[styles.streak, { color: palette.textFaint }]}>
              Serie de {me.streak} jour{me.streak > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 24 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', height: 24 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },

  brand: { alignItems: 'center', gap: 20 },
  logo: { fontFamily: Fonts.semibold, fontSize: 36, letterSpacing: 11.5, marginLeft: 11.5 },
  dots: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },

  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontFamily: Fonts.medium, fontSize: 11, letterSpacing: 2.2 },
  cardBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  cardTitle: { fontFamily: Fonts.semibold, fontSize: 21, lineHeight: 24 },
  cardSub: { fontFamily: Fonts.regular, fontSize: 13 },
  chevron: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },

  mono11: { fontFamily: Fonts.mono, fontSize: 11 },
  mono13: { fontFamily: Fonts.mono, fontSize: 13 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, marginTop: 20,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  currency: { fontFamily: Fonts.monoMedium, fontSize: 16 },
  streak: { fontFamily: Fonts.regular, fontSize: 13 },
});
