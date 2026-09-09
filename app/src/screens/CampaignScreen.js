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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCampaign } from '../api/game';
import { CacheKeys, readCache, writeCache } from '../utils/cache';
import { Fonts } from '../../theme/fonts';
import { planetColors, scoreColor, scoreTint, withAlpha } from '../../theme/colors';
import { BulbIcon, CheckIcon, ChevronLeft, LockIcon, PlanetIcon } from '../components/Icons';
import { LEVELS_TO_UNLOCK_NEXT } from '../utils/rules';

const COLUMNS = 4;
const GRID_GAP = 12;
// Hauteur d'une cellule. Partagee entre le style et le calcul de la hauteur du
// panneau : l'accordeon a besoin de connaitre sa taille d'arrivee AVANT de
// l'avoir affichee, donc les deux ne peuvent pas diverger.
const CELL_HEIGHT = 62;
const PANEL_PAD_TOP = 10;
const PANEL_PAD_BOTTOM = 20;
const EXPAND_MS = 300;
// Hauteur d'une ligne de planete. Comme CELL_HEIGHT : lue par le style ET par
// le calcul de defilement, donc une seule definition.
const ROW_HEIGHT = 56;

/** Hauteur exacte du panneau d'une planete, sans avoir a la mesurer.
 *
 * Une grille de n niveaux sur COLUMNS colonnes a une hauteur entierement
 * determinee par ses constantes de style — inutile de la rendre hors ecran
 * pour la mesurer, ce qui obligerait a monter les 180 cellules des six
 * planetes pour n'en afficher que trente.
 */
function panelHeight(levelCount) {
  const rows = Math.ceil(levelCount / COLUMNS);
  if (rows <= 0) return 0;
  return PANEL_PAD_TOP + rows * CELL_HEIGHT + (rows - 1) * GRID_GAP + PANEL_PAD_BOTTOM;
}

/** Une cellule de niveau, teintee par l'astre auquel elle appartient.
 *
 * La teinte reste tres basse (8 %) : elle doit signer la planete, pas
 * concurrencer le score, qui est la seule couleur forte de la grille. */
function LevelCell({ level, palette, astre, width, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        {
          width,
          borderColor: palette.borderCell,
          backgroundColor: withAlpha(astre.body, 0.08),
          opacity: pressed ? 0.6 : 1,
        },
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

/** Une planete : sa ligne, et sous elle sa grille quand elle est ouverte.
 *
 * Les six blocs restent TOUJOURS dans l'ordre Terre -> Neptune. Ouvrir Mars
 * depuis Terre ne remonte pas Mars : sa grille se deplie a sa place, sous son
 * propre nom. L'ecran gardait avant la planete active en tete de page et
 * reléguait les autres dessous, si bien qu'un simple appui reordonnait le
 * systeme solaire — on ne savait plus ou on etait.
 */
function PlanetBlock({
  planet, first, open, palette, cellWidth, onOpen, onOffset, onExpanded, onPlay,
}) {
  const locked = !planet.unlocked;
  const astre = planetColors(planet.id, palette, locked);
  const levels = planet.levels ?? [];
  const target = panelHeight(levels.length);

  const height = useRef(new Animated.Value(open ? target : 0)).current;
  // La planete en cours est ouverte des le premier rendu. Sans ce garde-fou
  // elle se deplierait a l'arrivee sur l'ecran, comme si on venait de la
  // choisir : l'accordeon doit animer les changements, pas l'etat initial.
  const settled = useRef(open);

  useEffect(() => {
    if (settled.current === open) return undefined;
    settled.current = open;

    const anim = Animated.timing(height, {
      toValue: open ? target : 0,
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
      // une hauteur n'est pas pilotable par le driver natif
      useNativeDriver: false,
    });
    // Le defilement attend la fin du depliage : tant qu'il dure, la position
    // de cette ligne bouge encore — la planete precedente est en train de se
    // replier au-dessus d'elle.
    anim.start(({ finished }) => {
      if (finished && open) onExpanded(planet.id);
    });
    return () => anim.stop();
  }, [open, target, height, onExpanded, planet.id]);

  const req = planet.unlockRequirement;

  const row = (
    <View style={styles.rowInner}>
      <PlanetIcon planet={planet.id} colors={astre} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.planetName, { color: locked ? palette.textCell : palette.text }]}>
          {planet.name}
        </Text>
        <Text style={[styles.planetMeta, { color: locked ? palette.textGhost : palette.textFaint }]}>
          {locked ? (
            req ? (
              <>
                <Text style={styles.mono12}>{req.completed}</Text> /{' '}
                <Text style={styles.mono12}>{req.of}</Text> sur{' '}
                {req.planetName.charAt(0) + req.planetName.slice(1).toLowerCase()} pour debloquer
              </>
            ) : (
              'Verrouille'
            )
          ) : (
            <>
              <Text style={styles.mono12}>{planet.completedCount}</Text> /{' '}
              <Text style={styles.mono12}>{planet.totalLevels}</Text> niveaux termines
            </>
          )}
        </Text>
      </View>

      {locked && <LockIcon color={palette.textGhost} />}

      {/* La barre de progression ne s'affiche que sur la planete ouverte : sur
          six lignes a la fois elle deviendrait un tableau de bord, alors
          qu'elle sert a situer LA planete qu'on est en train de jouer. */}
      {open && !locked && (
        <View style={[styles.headerTrack, { backgroundColor: palette.track }]}>
          <View
            style={{
              height: 3,
              borderRadius: 2,
              width: `${(planet.completedCount / planet.totalLevels) * 100}%`,
              backgroundColor: palette.progress,
            }}
          />
          {/* repere du seuil de deblocage : 25/30 */}
          <View
            style={[
              styles.threshold,
              {
                left: `${(LEVELS_TO_UNLOCK_NEXT / planet.totalLevels) * 100}%`,
                backgroundColor: palette.textDim,
              },
            ]}
          />
        </View>
      )}
    </View>
  );

  return (
    <View
      style={first && styles.firstPlanet}
      onLayout={(e) => onOffset(planet.id, e.nativeEvent.layout.y)}
    >
      {locked ? (
        <View style={[styles.planetRow, !first && { borderTopWidth: 1, borderTopColor: palette.borderSubtle }]}>
          {row}
        </View>
      ) : (
        <Pressable
          // Un onglet deja ouvert ne se referme pas : il resterait une planete
          // selectionnee mais invisible, et l'appui suivant sur la meme ligne
          // n'aurait aucun effet visible ailleurs sur l'ecran.
          onPress={open ? undefined : () => onOpen(planet.id)}
          style={({ pressed }) => [
            styles.planetRow,
            !first && { borderTopWidth: 1, borderTopColor: palette.borderSubtle },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          {row}
        </Pressable>
      )}

      <Animated.View style={{ height, overflow: 'hidden' }}>
        <View style={styles.panel}>
          <View style={styles.grid}>
            {/* Rien tant que la grille n'est pas mesuree : une cellule de
                largeur 0 provoquerait un premier rendu ecrase, visible. */}
            {cellWidth > 0 && levels.map((level) => (
              <LevelCell
                key={level.n}
                level={level}
                palette={palette}
                astre={astre}
                width={cellWidth}
                onPress={() => onPlay(planet.id, level.n)}
              />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function CampaignScreen({ navigate, palette }) {
  const [state, setState] = useState(null);
  // Ce que le joueur a choisi, et rien d'autre. La planete ouverte par defaut
  // est DERIVEE de l'etat (voir openPlanet plus bas) au lieu d'etre posee par
  // un effet : posee apres coup, elle arrivait un rendu trop tard et son
  // panneau se depliait sous les yeux du joueur a chaque arrivee sur l'ecran.
  const [picked, setPicked] = useState(null);
  const insets = useSafeAreaInsets();

  const scrollRef = useRef(null);
  // Position de chaque bloc dans le contenu defilant, tenue a jour par les
  // onLayout : c'est ce qui permet de situer la planete ouverte sans
  // recalculer la hauteur de tout ce qui la precede.
  const offsets = useRef({});

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

  // La planete en cours : la derniere debloquee non terminee.
  const currentPlanet = useMemo(() => {
    const unlocked = state?.planets.filter((p) => p.unlocked) ?? [];
    const current = unlocked.find((p) => p.completedCount < p.totalLevels) ?? unlocked.at(-1);
    return current?.id ?? null;
  }, [state]);

  const openPlanet = picked ?? currentPlanet;

  const rememberOffset = useCallback((id, y) => {
    offsets.current[id] = y;
  }, []);

  // Cale la planete ouverte dans son voisinage : la ligne qui la PRECEDE vient
  // se poser en haut de l'ecran.
  //
  // Cette seule regle produit tout le cadrage demande. Depuis Terre, ouvrir
  // Saturne amene Jupiter en haut, puis la ligne SATURNE, puis ses trente
  // niveaux, puis Uranus — on voit d'ou l'on vient et ou l'on va, au lieu
  // d'une grille qui flotte sans reperes.
  //
  // Ancrer la ligne PRECEDENTE et non la ligne ouverte, c'est ce qui fait la
  // difference : le voisin du haut n'est pas un bonus qu'on garde s'il reste
  // de la place, c'est lui qui definit la position.
  //
  // Le defilement est inconditionnel. Une version precedente ne bougeait que
  // si le panneau depassait du champ : le cadrage dependait alors de l'endroit
  // d'ou l'on venait, donc ouvrir Saturne ne donnait pas deux fois la meme
  // vue. Ici, ouvrir une planete donne toujours exactement le meme resultat.
  const revealPlanet = useCallback((id) => {
    const list = state?.planets ?? [];
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;

    // La premiere planete n'a pas de voisin au-dessus : on remonte en tete de
    // page, ce qui remet la barre du haut et Terre dans leur position d'ouverture.
    const anchor = i > 0 ? offsets.current[list[i - 1].id] : 0;
    if (anchor == null) return;

    scrollRef.current?.scrollTo({ y: Math.max(0, anchor), animated: true });
  }, [state]);

  const play = useCallback(
    (planetId, levelNumber) =>
      navigate('game', { mode: 'campaign', planetId, levelNumber }),
    [navigate],
  );

  if (!state) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.textDim} />
      </View>
    );
  }

  return (
    // La barre du haut est SORTIE du defilement : elle reste visible quand on
    // parcourt les six planetes. C'est le conteneur qui porte desormais le
    // retrait de l'encoche et le fond — la ScrollView ne couvre plus toute la
    // page, donc ce qui vit au-dessus d'elle n'est plus peint par elle.
    <View
      style={[styles.container, { paddingTop: insets.top + 20, backgroundColor: palette.bg }]}
    >
      {/* La largeur de la grille est prise sur la barre du haut, pas sur la
          grille elle-meme : une grille repliee ne se mesure pas, alors que
          cette barre est toujours montee. Les deux vivent maintenant dans des
          parents differents mais s'etendent sur la meme largeur, celle du
          conteneur — c'est ce qui rend la mesure encore valable. */}
      <View style={styles.topBar} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
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
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Ordre canonique, toujours. C'est la carte du systeme solaire : elle ne
            se reordonne pas parce qu'on regarde ailleurs.

            Les blocs sont des enfants DIRECTS du contenu defilant, sans conteneur
            intermediaire : leur `layout.y` est alors deja la position a laquelle
            il faut defiler, sans avoir a y ajouter l'origine d'un parent. */}
        {state.planets.map((planet, i) => (
          <PlanetBlock
            key={planet.id}
            planet={planet}
            first={i === 0}
            open={planet.id === openPlanet}
            palette={palette}
            cellWidth={cellWidth}
            onOpen={setPicked}
            onOffset={rememberOffset}
            onExpanded={revealPlanet}
            onPlay={play}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // flex et non flexGrow : ce conteneur n'est plus dans un defilement, il EST
  // la page. flexGrow ne lui donne une hauteur que s'il reste de la place a
  // distribuer ; sans flex, la ScrollView a l'interieur n'a aucune hauteur a
  // remplir et l'ecran se replie sur la seule barre du haut.
  //
  // Le retrait horizontal est ici, sur le parent commun : c'est ce qui aligne
  // la grille sous la barre du haut alors qu'elles ne sont plus dans la meme
  // vue. Corollaire : la ScrollView est en retrait elle aussi, donc sa barre de
  // defilement tombe a 32 px du bord au lieu de raser l'ecran.
  container: { flex: 1, paddingHorizontal: 32 },
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

  firstPlanet: { marginTop: 28 },
  // La ligne ne porte plus que sa hauteur et son filet : la mise en colonne est
  // dans rowInner, pour que Pressable et View verrouillee aient exactement la
  // meme geometrie et que les six lignes restent alignees.
  planetRow: { height: ROW_HEIGHT, justifyContent: 'center' },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  planetName: { fontFamily: Fonts.medium, fontSize: 15, letterSpacing: 1.8 },
  planetMeta: { fontFamily: Fonts.regular, fontSize: 12 },
  headerTrack: { width: 96, height: 3, borderRadius: 2, position: 'relative' },
  threshold: { position: 'absolute', top: -3, width: 1, height: 9 },

  // flex-start, surtout pas space-between : avec 30 niveaux sur 4 colonnes la
  // derniere rangee n'en contient que 2, et space-between les projetterait aux
  // deux extremites. Les ecarts sont portes par gap, identiques partout.
  // Les marges verticales sont sur le panneau, pas sur la grille : c'est le
  // panneau dont panelHeight() calcule la hauteur, et il doit pouvoir le faire
  // en ne lisant que PANEL_PAD_TOP / PANEL_PAD_BOTTOM.
  panel: { paddingTop: PANEL_PAD_TOP, paddingBottom: PANEL_PAD_BOTTOM },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'flex-start', gap: GRID_GAP,
  },
  cell: {
    height: CELL_HEIGHT, borderRadius: 11, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cellNumber: { fontSize: 17 },
  cellScore: {
    fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 11,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, overflow: 'hidden',
  },

  mono12: { fontFamily: Fonts.mono, fontSize: 12 },
});
