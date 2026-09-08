// Campagne — maquette Campagne.dc.html.
//
// Trois situations sur la grille, sans jamais afficher de texte explicatif
// (docs/prompt-campagne.md, section 17) :
//   termine            -> une coche
//   tente, non termine -> le meilleur score, colore sur la rampe semantique
//   jamais tente       -> rien sous le numero
//
// On n'affiche PAS le nombre de tentatives : sur un niveau non termine, ce
// chiffre ne dit que « tu as echoue N fois ». Le meilleur score, lui,
// encourage : « j'etais a 93, je reprends ».

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCampaign } from '../api/game';
import { CacheKeys, readCache, writeCache } from '../utils/cache';
import { Fonts } from '../../theme/fonts';
import { scoreColor, scoreTint } from '../../theme/colors';
import { BulbIcon, CheckIcon, ChevronLeft, LockIcon, PlanetIcon } from '../components/Icons';
import { LEVELS_TO_UNLOCK_NEXT } from '../utils/rules';

const COLUMNS = 4;
const GRID_GAP = 12;

function LevelCell({ level, palette, width, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        { width, borderColor: palette.borderCell, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text
        style={[
          styles.cellNumber,
          {
            color: level.completed ? palette.textCell : palette.textStrong,
            fontFamily: level.completed ? Fonts.mono : Fonts.monoSemibold,
          },
        ]}
      >
        {String(level.n).padStart(2, '0')}
      </Text>

      {level.completed ? (
        <CheckIcon color={palette.textCell} />
      ) : level.bestScore != null ? (
        <Text
          style={[
            styles.cellScore,
            {
              color: scoreColor(level.bestScore, palette),
              backgroundColor: scoreTint(level.bestScore, palette, 0.18),
            },
          ]}
        >
          {Math.round(level.bestScore)}
        </Text>
      ) : (
        <View style={{ height: 17 }} />
      )}
    </Pressable>
  );
}

function LockedPlanet({ planet, palette }) {
  const req = planet.unlockRequirement;
  return (
    <View style={[styles.planetRow, { borderTopColor: palette.borderSubtle }]}>
      <PlanetIcon colors={palette.planetLocked} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.planetName, { color: palette.textCell }]}>{planet.name}</Text>
        <Text style={[styles.planetMeta, { color: palette.textGhost }]}>
          {req ? (
            <>
              <Text style={styles.mono12}>{req.completed}</Text> /{' '}
              <Text style={styles.mono12}>{req.of}</Text> sur{' '}
              {req.planetName.charAt(0) + req.planetName.slice(1).toLowerCase()} pour debloquer
            </>
          ) : (
            'Verrouille'
          )}
        </Text>
      </View>
      <LockIcon color={palette.textGhost} />
    </View>
  );
}

export default function CampaignScreen({ navigate, palette }) {
  const [state, setState] = useState(null);
  const [openPlanet, setOpenPlanet] = useState(null);
  const insets = useSafeAreaInsets();

  // Largeur de cellule calculee sur la largeur REELLE de la grille, pas en
  // pourcentage : les ecarts sont en pixels fixes, donc un pourcentage se
  // decale d'un ecran a l'autre et il suffit d'un demi-pixel de trop pour que
  // la quatrieme cellule bascule a la ligne.
  const [gridWidth, setGridWidth] = useState(0);
  const cellWidth =
    gridWidth > 0 ? (gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS : 0;

  const load = useCallback(async () => {
    const cached = await readCache(CacheKeys.campaign);
    if (cached) setState(cached);
    try {
      const data = await getCampaign();
      setState(data);
      writeCache(CacheKeys.campaign, data);
    } catch (e) {
      console.log('Campagne : chargement impossible', e?.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!state || openPlanet) return;
    // Ouvre la planete en cours : la derniere debloquee non terminee.
    const unlocked = state.planets.filter((p) => p.unlocked);
    const current = unlocked.find((p) => p.completedCount < p.totalLevels) ?? unlocked.at(-1);
    setOpenPlanet(current?.id ?? null);
  }, [state, openPlanet]);

  if (!state) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.textDim} />
      </View>
    );
  }

  const active = state.planets.find((p) => p.id === openPlanet);
  const others = state.planets.filter((p) => p.id !== openPlanet);

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
          <Text style={[styles.topTitle, { color: palette.textFaint }]}>CAMPAGNE</Text>
        </View>
        <View style={styles.currency}>
          <BulbIcon size={16} color={palette.currency} />
          <Text style={[styles.currencyText, { color: palette.currency }]}>{state.currency}</Text>
        </View>
      </View>

      {active && (
        <>
          <View style={styles.planetHeader}>
            <PlanetIcon colors={palette.planetActive} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.planetName, { color: palette.text }]}>{active.name}</Text>
              <Text style={[styles.planetMeta, { color: palette.textFaint }]}>
                <Text style={styles.mono12}>{active.completedCount}</Text> /{' '}
                <Text style={styles.mono12}>{active.totalLevels}</Text> niveaux termines
              </Text>
            </View>
            <View style={[styles.headerTrack, { backgroundColor: palette.track }]}>
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  width: `${(active.completedCount / active.totalLevels) * 100}%`,
                  backgroundColor: palette.progress,
                }}
              />
              {/* repere du seuil de deblocage : 25/30 */}
              <View
                style={[
                  styles.threshold,
                  {
                    left: `${(LEVELS_TO_UNLOCK_NEXT / active.totalLevels) * 100}%`,
                    backgroundColor: palette.textDim,
                  },
                ]}
              />
            </View>
          </View>

          <View
            style={styles.grid}
            onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          >
            {/* Rien tant que la grille n'est pas mesuree : une cellule de
                largeur 0 provoquerait un premier rendu ecrase, visible. */}
            {cellWidth > 0 && (active.levels ?? []).map((level) => (
              <LevelCell
                key={level.n}
                level={level}
                palette={palette}
                width={cellWidth}
                onPress={() =>
                  navigate('game', {
                    mode: 'campaign',
                    planetId: active.id,
                    levelNumber: level.n,
                  })
                }
              />
            ))}
          </View>
        </>
      )}

      <View style={{ marginTop: 24 }}>
        {others.map((planet) =>
          planet.unlocked ? (
            <Pressable
              key={planet.id}
              onPress={() => setOpenPlanet(planet.id)}
              style={[styles.planetRow, { borderTopColor: palette.borderSubtle }]}
            >
              <PlanetIcon colors={palette.planetActive} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.planetName, { color: palette.text }]}>{planet.name}</Text>
                <Text style={[styles.planetMeta, { color: palette.textFaint }]}>
                  <Text style={styles.mono12}>{planet.completedCount}</Text> /{' '}
                  <Text style={styles.mono12}>{planet.totalLevels}</Text> niveaux termines
                </Text>
              </View>
            </Pressable>
          ) : (
            <LockedPlanet key={planet.id} planet={planet} palette={palette} />
          ),
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 24 },
  centered: { alignItems: 'center', justifyContent: 'center' },

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
  currency: { flexDirection: 'row', alignItems: 'center', gap: 7, width: 52, justifyContent: 'flex-end' },
  currencyText: { fontFamily: Fonts.monoMedium, fontSize: 14 },

  planetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, marginTop: 28 },
  planetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, borderTopWidth: 1 },
  planetName: { fontFamily: Fonts.medium, fontSize: 15, letterSpacing: 1.8 },
  planetMeta: { fontFamily: Fonts.regular, fontSize: 12 },
  headerTrack: { width: 96, height: 3, borderRadius: 2, position: 'relative' },
  threshold: { position: 'absolute', top: -3, width: 1, height: 9 },

  // flex-start, surtout pas space-between : avec 30 niveaux sur 4 colonnes la
  // derniere rangee n'en contient que 2, et space-between les projetterait aux
  // deux extremites. Les ecarts sont portes par gap, identiques partout.
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 10,
    justifyContent: 'flex-start', gap: GRID_GAP,
  },
  cell: {
    height: 62, borderRadius: 11, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cellNumber: { fontSize: 17 },
  cellScore: {
    fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 11,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, overflow: 'hidden',
  },

  mono12: { fontFamily: Fonts.mono, fontSize: 12 },
});
