// Ecran de partie — maquette Partie.dc.html.
//
// Le meme ecran sert au quotidien et a la campagne : une fois la partie
// demarree, le contrat serveur est identique (docs/prompt-campagne.md, 17 ter).
// Rien a reapprendre en passant d'un mode a l'autre.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buyHint, sendGuess, startDaily, startLevel } from '../api/game';
import { errorMessage } from '../api/client';
import { CacheKeys, readCache, writeCache } from '../utils/cache';
import { Fonts } from '../../theme/fonts';
import { scoreColor } from '../../theme/colors';
import AttemptRow from '../components/AttemptRow';
import { ArrowUp, BulbIcon, ChevronLeft } from '../components/Icons';
import VictoryOverlay from '../components/VictoryOverlay';

/**
 * La proposition la plus RECENTE d'une partie.
 *
 * `game.attempts` arrive trie par score decroissant — c'est une regle de
 * gameplay, pas un ordre chronologique — donc `attempts[0]` est le meilleur
 * mot, pas le dernier joue. Il faut passer par `createdAt`.
 */
function latestAttempt(game) {
  const rows = game?.attempts;
  if (!rows?.length) return null;

  const last = rows.reduce((best, row) =>
    (row.createdAt ?? '') > (best.createdAt ?? '') ? row : best,
  );
  return { word: last.word, score: last.score, isHint: last.isHint };
}

// Espacement entre deux lignes de la carte semantique.
const ROW_GAP = 4;

export default function GameScreen({ params, navigate, palette }) {
  const { mode, planetId, levelNumber } = params;
  const insets = useSafeAreaInsets();

  const [game, setGame] = useState(null);
  const [meta, setMeta] = useState({});
  const [word, setWord] = useState('');
  const [lastGuess, setLastGuess] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [victory, setVictory] = useState(null);

  // Pulsation discrete sur les tres bons scores. Volontairement sobre :
  // l'interface ne doit pas ressembler a un mobile game agressif (section 3).
  const pulse = useRef(new Animated.Value(1)).current;

  const cacheKey = mode === 'daily' ? 'game:daily' : `game:${planetId}:${levelNumber}`;

  const load = useCallback(async () => {
    const cached = await readCache(cacheKey);
    if (cached) {
      setGame(cached.game);
      setMeta(cached.meta);
      setLastGuess(latestAttempt(cached.game));
    }
    try {
      const data =
        mode === 'daily' ? await startDaily() : await startLevel(planetId, levelNumber);
      const nextMeta =
        mode === 'daily'
          ? { title: 'MOT DU JOUR', number: data.dailyNumber }
          : { title: (planetId ?? '').toUpperCase(), number: levelNumber };
      setGame(data);
      setMeta(nextMeta);
      // A la reprise d'une partie, reafficher la derniere proposition faite.
      // Sans ca, l'encart « DERNIERE PROPOSITION » restait vide alors que
      // l'historique juste en dessous etait plein : le joueur revenait sur un
      // ecran qui avait l'air casse.
      setLastGuess(latestAttempt(data));
      writeCache(cacheKey, { game: data, meta: nextMeta });
      if (data.completed && data.victory) setVictory(data.victory);
    } catch (e) {
      setError(errorMessage(e, 'Partie indisponible'));
    }
  }, [mode, planetId, levelNumber, cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if(game?.attempts){
        console.log(game.attempts);
        console.log(game.attempts.length);
    }
  }, [game]);

  const submit = async () => {
    const w = word.trim();
    if (!w || busy || game?.completed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await sendGuess(game.gameId, w);
      if (res.error) {
        setError(res.error);
      } else {
        setWord('');
        setLastGuess({ word: res.word, score: res.score });
        console.log("___game",res.game);
        setGame(res.game);
        writeCache(cacheKey, { game: res.game, meta });

        if (res.score >= 90) {
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.06, duration: 130, useNativeDriver: true }),
            Animated.spring(pulse, { toValue: 1, friction: 4, useNativeDriver: true }),
          ]).start();
        }
        if (res.victory) setVictory(res.victory);
      }
    } catch (e) {
      setError(errorMessage(e, 'Proposition impossible'));
    } finally {
      setBusy(false);
    }
  };

  const askHint = async () => {
    if (busy || game?.completed || game?.nextHintCost == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await buyHint(game.gameId);
      setGame(res.game);
      setLastGuess({ word: res.hint.word, score: res.hint.score, isHint: true });
      writeCache(cacheKey, { game: res.game, meta });
    } catch (e) {
      setError(errorMessage(e, 'Indice indisponible'));
    } finally {
      setBusy(false);
    }
  };

  const displayed = useMemo(
    () => ({
      word: lastGuess?.word ?? '—',
      score: lastGuess?.score ?? null,
    }),
    [lastGuess],
  );

  // Remplissage progressif de la barre, et chiffre qui monte avec elle.
  //
  // Reparti de zero a chaque proposition plutot que glissant depuis le score
  // precedent : chaque mot est une mesure independante, et la montee raconte
  // « voila a quel point CE mot est proche », pas une comparaison avec le
  // precedent.
  const fill = useRef(new Animated.Value(0)).current;
  const [shownScore, setShownScore] = useState(null);
  const lastShown = useRef(null);

  useEffect(() => {
    const target = displayed.score;
    if (target == null) {
      fill.setValue(0);
      setShownScore(null);
      return undefined;
    }

    // Le chiffre suit la meme valeur animee que la barre : les deux ne peuvent
    // pas se desynchroniser.
    const sub = fill.addListener(({ value }) => {
      const rounded = Math.round(value);
      if (rounded !== lastShown.current) {
        lastShown.current = rounded;
        setShownScore(rounded);
      }
    });

    fill.setValue(0);
    Animated.timing(fill, {
      toValue: target,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      // width et backgroundColor ne sont pas pilotables par le driver natif
      useNativeDriver: false,
    }).start();

    return () => fill.removeListener(sub);
  }, [displayed.score, fill]);

  if (!game) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: palette.bg }]}>
        {error ? (
          <Text style={[styles.error, { color: palette.textFaint }]}>{error}</Text>
        ) : (
          <ActivityIndicator color={palette.textDim} />
        )}
      </View>
    );
  }

  // La couleur suit la progression au lieu de sauter d'un coup : elle traverse
  // la rampe semantique pendant que la barre se remplit. Les seuils sont ceux
  // de scoreColor, pour que l'arrivee corresponde exactement a la couleur des
  // lignes de la liste.
  const animatedColor = fill.interpolate({
    inputRange: [0, 20, 35, 55, 70, 85, 95, 100],
    outputRange: [
      palette.ramp[0], palette.ramp[1], palette.ramp[2], palette.ramp[3],
      palette.ramp[4], palette.ramp[5], palette.rampHot, palette.rampHot,
    ],
  });
  const barWidth = fill.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const hasScore = displayed.score != null;
  const hintsLeft = game.nextHintCost != null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: palette.bg }}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 12 }]}>

        <View style={styles.topBar}>
          <Pressable onPress={() => navigate('back')} hitSlop={12} style={styles.backButton}>
            <ChevronLeft color={palette.textDim} />
          </Pressable>
          <View style={styles.topTitleWrap} pointerEvents="none">
            <Text style={[styles.topTitle, { color: palette.textFaint }]}>
              {meta.title} <Text style={styles.mono11}>#{meta.number}</Text>
            </Text>
          </View>
          <View style={styles.currency}>
            <BulbIcon size={16} color={palette.currency} />
            <Text style={[styles.currencyText, { color: palette.currency }]}>{game.currency}</Text>
          </View>
        </View>

        {/* Derniere proposition : le feedback principal, immediatement lisible */}
        <View style={styles.lastRow}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={[styles.overline, { color: palette.textGhost }]}>DERNIERE PROPOSITION</Text>
            <Text numberOfLines={1} style={[styles.lastWord, { color: palette.text }]}>
              {displayed.word}
            </Text>
          </View>
          <Animated.Text
            style={[
              styles.bigScore,
              {
                color: hasScore ? animatedColor : palette.textGhost,
                transform: [{ scale: pulse }],
              },
            ]}
          >
            {hasScore && shownScore != null ? shownScore : '--'}
          </Animated.Text>
        </View>

        <View style={[styles.bigTrack, { backgroundColor: palette.trackDeep }]}>
          <Animated.View
            style={{
              width: barWidth,
              height: 4,
              borderRadius: 2,
              backgroundColor: animatedColor,
            }}
          />
        </View>

        <View style={styles.statsRow}>
          <Text style={[styles.stats, { color: palette.textGhost }]}>
            <Text style={[styles.mono12, { color: palette.textFaint }]}>{game.attemptsCount}</Text>
            {' essais  ·  '}
            <Text style={[styles.mono12, { color: palette.textFaint }]}>{game.hintsUsed}</Text>
            {' indices'}
          </Text>
          {game.bestScore != null && (
            <Text style={[styles.stats, { color: palette.textGhost }]}>
              meilleur{' '}
              <Text style={[styles.mono12, { color: scoreColor(game.bestScore, palette) }]}>
                {Math.round(game.bestScore)}
              </Text>
            </Text>
          )}
        </View>

        {/* Saisie */}
        <View style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}>
          <TextInput
            value={word}
            onChangeText={(t) => {
              setWord(t);
              if (error) setError(null);
            }}
            onSubmitEditing={submit}
            placeholder="Proposez un mot"
            placeholderTextColor={palette.textGhost}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            editable={!game.completed}
            style={[styles.inputText, { color: palette.text }]}
          />
          <Pressable
            onPress={submit}
            disabled={busy || !word.trim()}
            style={[styles.inputButton, { backgroundColor: palette.surfaceInput, opacity: word.trim() ? 1 : 0.5 }]}
          >
            {busy ? <ActivityIndicator size="small" color={palette.textDim} /> : <ArrowUp color={palette.textDim} />}
          </Pressable>
        </View>

        {error && <Text style={[styles.error, { color: palette.ramp[1] }]}>{error}</Text>}

        {/* Indice : un seul bouton, jamais une deuxieme grosse zone (section 7) */}
        {!game.completed && (
          <Pressable
            onPress={askHint}
            disabled={!hintsLeft || busy}
            style={[styles.hintRow, { borderColor: palette.borderStrong, opacity: hintsLeft ? 1 : 0.45 }]}
          >
            <View style={{ gap: 3 }}>
              <Text style={[styles.hintTitle, { color: palette.text }]}>
                {hintsLeft ? 'Obtenir un indice' : 'Les 5 indices sont utilises'}
              </Text>
              {hintsLeft && (
                <Text style={[styles.hintSub, { color: palette.textFaint }]}>
                  Indice <Text style={styles.mono11}>{game.hintsUsed + 1}</Text> sur{' '}
                  <Text style={styles.mono11}>5</Text>
                </Text>
              )}
            </View>
            {hintsLeft && (
              <View style={[styles.hintCost, { backgroundColor: `${palette.currency}24` }]}>
                <BulbIcon size={15} color={palette.currency} />
                <Text style={[styles.hintCostText, { color: palette.currency }]}>
                  {game.nextHintCost}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {/* La carte semantique.
            Triee par proximite, jamais par chronologie, et surtout COMPLETE :
            toutes les propositions de la partie restent listees, y compris
            celles des sessions precedentes — le serveur les rejoue au
            demarrage. C'est l'outil de reflexion du joueur, pas un journal
            technique qu'on pourrait tronquer (prompt_base.txt, section 4). */}
        <View style={{ flex: 1, marginTop: 20 }}>
          <FlatList
            data={game.attempts}
            keyExtractor={(item) => item.word}
            renderItem={({ item }) => (
              <AttemptRow
                word={item.word}
                score={item.score}
                isHint={item.isHint}
                highlighted={item.word === lastGuess?.word}
                palette={palette}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // Le degrade de fondu de la maquette a ete retire : pose au-dessus
            // de la liste, il masquait purement et simplement les dernieres
            // lignes des que la zone devenait courte — donc des que le joueur
            // ajoutait une proposition. Decoratif contre du contenu perdu :
            // le contenu gagne.
            contentContainerStyle={{ paddingBottom: 12 }}
            // PAS de getItemLayout ici, et c'est delibere.
            //
            // Avec un ItemSeparatorComponent, FlatList compte le separateur
            // DANS la cellule : une cellule mesure 38 + 4 = 42 px, pas 38.
            // Annoncer `length: 38` faisait diverger ses offsets calcules des
            // positions reelles, et elle laissait des cellules vides au milieu
            // de la liste apres chaque reordonnancement — c'est-a-dire a chaque
            // proposition, puisque la liste se retrie par score.
            //
            // Laisser FlatList mesurer coute une passe de layout et supprime le
            // probleme. L'optimisation n'en valait pas le prix.

            // Vrai par defaut sur Android, et cause connue de lignes vides :
            // les vues sorties du champ sont detachees puis mal reattachees.
            removeClippedSubviews={false}
            initialNumToRender={24}
            windowSize={21}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: palette.textGhost }]}>
                Proposez un premier mot. Le score dit a quel point vous en etes proche.
              </Text>
            }
          />
        </View>
      </View>

      {victory && (
        <VictoryOverlay
          victory={victory}
          mode={mode}
          palette={palette}
          onClose={() => navigate('back')}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
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

  lastRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 26 },
  overline: { fontFamily: Fonts.medium, fontSize: 10, letterSpacing: 2 },
  lastWord: { fontFamily: Fonts.semibold, fontSize: 30 },
  bigScore: { fontFamily: Fonts.monoMedium, fontSize: 58, lineHeight: 58 },

  bigTrack: { height: 4, borderRadius: 2, marginTop: 18, overflow: 'hidden' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  stats: { fontFamily: Fonts.regular, fontSize: 12 },

  input: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 14,
    borderWidth: 1, paddingLeft: 18, paddingRight: 8, marginTop: 22,
  },
  inputText: { flex: 1, fontFamily: Fonts.regular, fontSize: 16, padding: 0 },
  inputButton: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  hintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, borderRadius: 12, borderWidth: 1, paddingLeft: 16, paddingRight: 10, marginTop: 10,
  },
  hintTitle: { fontFamily: Fonts.medium, fontSize: 15 },
  hintSub: { fontFamily: Fonts.regular, fontSize: 11 },
  hintCost: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  hintCostText: { fontFamily: Fonts.monoSemibold, fontSize: 15 },

  mono11: { fontFamily: Fonts.mono, fontSize: 11 },
  mono12: { fontFamily: Fonts.mono, fontSize: 12 },
  error: { fontFamily: Fonts.regular, fontSize: 13, marginTop: 10 },
  empty: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 40 },
});
