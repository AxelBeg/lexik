// Ecran de partie — maquette Partie.dc.html.
//
// Le meme ecran sert au quotidien et a la campagne : une fois la partie
// demarree, le contrat serveur est identique (docs/prompt-campagne.md, 17 ter).
// Rien a reapprendre en passant d'un mode a l'autre.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buyHint, sendGuess, startDaily, startLevel } from '../api/game';
import { errorMessage } from '../api/client';
import { CacheKeys, readCache, writeCache } from '../utils/cache';
import { askPermissionOnce } from '../utils/notifications';
import { Fonts } from '../../theme/fonts';
import { scoreColor } from '../../theme/colors';
import ListAttempts from '../components/ListAttempts';
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
  return { word: last.word, score: last.score, isHint: last.isHint, rank: last.rank };
}

/**
 * « 847e sur 1000 » — la place du mot parmi les plus proches du secret.
 *
 * C'est la mesure qui manquait au milieu de partie. Le score, lui, s'ecrase :
 * un joueur qui cherche encore voit defiler 11, 8, 14, 9, et ces chiffres ne
 * lui apprennent rien. Le rang, lui, bouge — 900e puis 300e, c'est une
 * direction, et donc une raison de continuer.
 *
 * Nul hors du vivier, donc absent la plupart du temps : c'est son apparition
 * qui porte l'information. Rien ne dit « tu es loin », le rang se contente de
 * ne pas etre la.
 */
function rankLabel(rank, total) {
  if (rank == null || !total) return null;
  return `${rank}${rank === 1 ? 'er' : 'e'} sur ${total}`;
}

// Duree du remplissage de la barre. La celebration de victoire s'y accroche :
// elle ne peut pas partir avant que le chiffre ait fini de monter.
const SCORE_FILL_MS = 520;

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
  const [animationClose, setAnimationClose] = useState(false);
  // La victoire recue du serveur, gardee de cote pendant que l'ecran de jeu
  // celebre. Voir l'effet de celebration plus bas.
  const [pendingVictory, setPendingVictory] = useState(null);
  const [found, setFound] = useState(false);

  // Pulsation discrete sur les tres bons scores. Volontairement sobre :
  // l'interface ne doit pas ressembler a un mobile game agressif (section 3).
  const pulse = useRef(new Animated.Value(1)).current;
  // Debordement de la barre au moment du 100. Une seule fois par partie.
  const bloom = useRef(new Animated.Value(0)).current;

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
        setLastGuess({ word: res.word, score: res.score, rank: res.rank });
        setGame(res.game);
        writeCache(cacheKey, { game: res.game, meta });

        // Une victoire a sa propre celebration, plus ample : on ne veut pas
        // que la petite pulsation des bons scores parte en meme temps.
        if (res.victory) {
          setAnimationClose(true);
          setPendingVictory(res.victory);
        } else if (res.score >= 90) {
          pulse.stopAnimation();
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.06, duration: 130, useNativeDriver: true }),
            Animated.spring(pulse, { toValue: 1, friction: 4, useNativeDriver: true }),
          ]).start();
        }
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
      // `neighborRank` et non `rank` : le second est le palier d'indice (1..5).
      setLastGuess({
        word: res.hint.word, score: res.hint.score, isHint: true,
        rank: res.hint.neighborRank,
      });
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
      rank: rankLabel(lastGuess?.rank, game?.neighborsTotal),
    }),
    [lastGuess, game?.neighborsTotal],
  );

  // Les lignes de la carte semantique. Le serveur les envoie deja triees par
  // proximite et deja portees par leur rang : rien a calculer ici sinon la
  // mise en valeur du dernier mot joue.
  const rows = useMemo(
    () =>
      (game?.attempts ?? []).map((a) => ({
        ...a,
        highlighted: a.word === lastGuess?.word,
      })),
    [game?.attempts, lastGuess?.word],
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
      fill.stopAnimation();
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

    fill.stopAnimation();
    fill.setValue(0);
    const anim = Animated.timing(fill, {
      toValue: target,
      duration: SCORE_FILL_MS,
      easing: Easing.out(Easing.cubic),
      // width et backgroundColor ne sont pas pilotables par le driver natif
      useNativeDriver: false,
    });
    anim.start();

    return () => {
      anim.stop();
      fill.removeListener(sub);
    };
  }, [displayed.score, fill]);

  // La victoire n'ouvre pas l'ecran de fin tout de suite.
  //
  // La barre met SCORE_FILL_MS a rejoindre 100 et le chiffre monte avec elle :
  // c'est la seule fois de la partie ou ce compteur va au bout, et c'est la
  // recompense. Monter l'overlay dans le meme lot que la proposition le
  // recouvrait a l'instant meme ou il partait — le joueur voyait un « 12 » se
  // faire avaler par « NIVEAU TERMINE » et n'assistait jamais a sa propre
  // victoire.
  //
  // On garde donc le resultat de cote, on laisse le chiffre arriver, on marque
  // le coup une fois, puis on passe la main. Trois choses au meme instant et
  // une seule fois : l'intitule bascule sur TROUVE, le chiffre encaisse, la
  // barre pleine deborde et s'efface. Pas de confettis, pas de boucle.
  useEffect(() => {
    if (!pendingVictory) return undefined;

    let celebration = null;
    const timer = setTimeout(() => {
      setFound(true);
      celebration = Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.12, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true,
          }),
          Animated.spring(pulse, {
            toValue: 1, friction: 5, tension: 120, useNativeDriver: true,
          }),
        ]),
        Animated.timing(bloom, {
          toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]);
      // L'overlay prend la suite quand le debordement s'est eteint, pas apres
      // un delai fixe : si la celebration est interrompue, il ne s'ouvre pas.
      celebration.start(({ finished }) => {
        if (finished) setVictory(pendingVictory);
      });
    }, SCORE_FILL_MS);

    return () => {
      clearTimeout(timer);
      celebration?.stop();
    };
  }, [pendingVictory, pulse, bloom]);

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
  // Le debordement enfle et s'eteint dans le meme geste : il monte vite a la
  // moitie de son opacite, puis se dissipe pendant qu'il finit de s'ouvrir.
  const bloomOpacity = bloom.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0, 0.45, 0],
  });
  const bloomScale = bloom.interpolate({ inputRange: [0, 1], outputRange: [1, 5] });
  const hasScore = displayed.score != null;
  const hintsLeft = game.nextHintCost != null;

  // La seule explication de regle de tout le jeu, et elle n'a qu'une occasion
  // d'etre lue : l'ecran vide de la premiere partie. On y annonce le rang, sans
  // quoi le joueur le decouvrirait sans savoir de quoi il parle — et surtout
  // sans savoir que son absence veut dire quelque chose.
  const emptyLabel = game.neighborsTotal
    ? `Proposez un premier mot. Le score dit a quel point vous en etes proche, `
      + `et un rang apparait des que vous entrez dans les ${game.neighborsTotal} mots `
      + `les plus proches du secret.`
    : 'Proposez un premier mot. Le score dit a quel point vous en etes proche.';

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
            <Text style={[styles.overline, { color: found ? palette.rampHot : palette.textGhost }]}>
              {found ? 'TROUVÉ' : 'DERNIERE PROPOSITION'}
            </Text>
            <Text numberOfLines={1} style={[styles.lastWord, { color: palette.text }]}>
              {displayed.word}
            </Text>
            {/* Volontairement neutre, jamais sur la rampe : une seule chose a
                l'ecran a le droit de porter la couleur de proximite, et c'est
                le score. Le rang n'a pas besoin d'etre crie — il n'apparait
                deja que quand il y a quelque chose a dire. */}
            {displayed.rank && !found && (
              <Text style={[styles.rank, { color: palette.textFaint }]}>{displayed.rank}</Text>
            )}
          </View>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <Animated.Text
              style={[
                styles.bigScore,
                { color: hasScore ? animatedColor : palette.textGhost },
              ]}
            >
              {hasScore && shownScore != null ? shownScore : '--'}
            </Animated.Text>
          </Animated.View>
        </View>

        <View style={styles.trackWrap}>
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
          {/* Pose PAR-DESSUS la piste et HORS d'elle : `bigTrack` est en
              overflow hidden, une echelle verticale y serait rognee a 4 px et
              ne se verrait pas. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bloom,
              {
                backgroundColor: palette.rampHot,
                opacity: bloomOpacity,
                transform: [{ scaleY: bloomScale }],
              },
            ]}
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
          <ListAttempts rows={rows} palette={palette} emptyLabel={emptyLabel} />
        </View>
      </View>

      {victory && (
        <VictoryOverlay
          victory={victory}
          mode={mode}
          palette={palette}
          // Le fondu prend la suite de la celebration. A la reouverture d'une
          // partie deja gagnee il n'y a rien eu a celebrer : l'ecran est la
          // d'emblee, sans rejouer une victoire vieille de trois jours.
          animate={animationClose}
          onClose={() => {
            // Le seul moment ou demander les notifications. Pas au premier
            // lancement : a cet instant le joueur ne sait pas encore ce qu'est
            // Lexik, et un refus systeme ne se represente jamais. Ici il vient
            // de gagner, il a une raison de revenir demain, et c'est
            // exactement ce que la permission lui propose. Une seule fois dans
            // la vie de l'app, et jamais pendant la celebration.
            if (mode === 'daily' && animationClose) askPermissionOnce().catch(() => {});
            navigate('back', {}, animationClose ? { 'level-ended-animation': { params } } : {});
          }}
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
  rank: { fontFamily: Fonts.mono, fontSize: 12, marginTop: -2 },
  bigScore: { fontFamily: Fonts.monoMedium, fontSize: 58, lineHeight: 58 },

  trackWrap: { marginTop: 18 },
  bigTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  bloom: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, borderRadius: 2 },
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
});
