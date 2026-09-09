// Racine de l'application.
//
// Navigation maison a trois ecrans plutot que react-navigation : le jeu n'a ni
// onglets ni pile profonde. Les liens entrants tiennent en quinze lignes plus
// bas et en un analyseur dans utils/deeplink.js — ca ne justifie toujours pas
// la dependance.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { setAuthLostHandler } from './src/api/client';
import { signIn } from './src/api/auth';
import { routeFromUrl } from './src/utils/deeplink';
import { onReminderTapped } from './src/utils/notifications';
import { loadFonts } from './theme/fonts';
import { themes } from './theme/colors';
import CampaignScreen from './src/screens/CampaignScreen';
import GameScreen from './src/screens/GameScreen';
import MainMenu from './src/screens/MainMenu';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const [fontsLoaded] = loadFonts();

  // Theme clair impose, conformement aux maquettes retenues (MainClair,
  // CampagneClair, PartieClair). La palette sombre reste dans theme/colors.js :
  // les deux jeux de jetons portent les memes noms, donc y revenir ou suivre le
  // reglage systeme ne demandera que de changer cette ligne.
  const palette = themes.light;

  const [route, setRoute] = useState({ name: 'menu', params: {} });
  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [options, setOptions] = useState(null);

  const navigate = useCallback((name, params = {}, options = {}) => {
    // Pose AVANT le cas 'back', et non apres : c'est precisement l'ecran qui se
    // ferme qui a quelque chose a faire jouer sur celui qui reapparait. Plus
    // bas, le `return` du retour arriere sautait par-dessus et l'ecran rouvert
    // recevait encore les options de la navigation aller.
    setOptions(options);

    if (name === 'back') {
      setHistory((h) => {
        const previous = h.at(-1) ?? { name: 'menu', params: {} };
        // Un ecran qui se ferme peut rapporter quelque chose a celui qui
        // reapparait : la partie gagnee dit a la campagne quelle case vient de
        // basculer. Ce qu'il rapporte ECRASE ce qu'il avait rapporte la fois
        // d'avant — l'ecran de partie renvoie toujours la cle, a null quand il
        // n'y a rien a annoncer, sans quoi une sortie sans victoire laisserait
        // en place le drapeau de la precedente et la coche se rejouerait sur
        // une case deja cochee.
        setRoute({ ...previous, params: { ...previous.params, ...params } });
        return h.slice(0, -1);
      });
      return;
    }
    setHistory((h) => [...h, route]);
    setRoute({ name, params });
  }, [route]);

  const connect = useCallback(async () => {
    setAuthError(null);
    try {
      // Play Games d'abord, en silence. Aucun ecran de connexion :
      // la majorite des joueurs arrive directement sur le menu.
      setSession(await signIn());
    } catch (e) {
      setAuthError("Connexion au serveur impossible. Verifiez votre reseau.");
    }
  }, []);

  useEffect(() => {
    connect();
    setAuthLostHandler(connect);
  }, [connect]);

  // Liens entrants. Le defi partage doit tomber sur la partie, pas sur le menu :
  // un destinataire qu'on renvoie au menu a deja perdu la moitie de l'intention.
  //
  // L'ecran vise remplace la route courante et l'historique repart du menu :
  // arriver par un lien, c'est arriver de nulle part, et le retour doit ramener
  // a l'accueil plutot qu'a l'ecran qu'on regardait avant de quitter l'app.
  useEffect(() => {
    const open = (url) => {
      const target = routeFromUrl(url);
      if (!target) return;
      setHistory([{ name: 'menu', params: {} }]);
      setOptions({});
      setRoute(target);
    };

    // Une seule fois : l'app lancee PAR le lien. Le meme lien reste ensuite
    // renvoye par getInitialURL, donc le rejouer rouvrirait la partie a chaque
    // remontage de cet effet.
    Linking.getInitialURL().then(open).catch(() => {});
    // Et pour les liens recus alors que l'app tourne deja.
    const sub = Linking.addEventListener('url', ({ url }) => open(url));

    // Le rappel du soir mene au meme endroit : annoncer « il te reste 4 h »
    // puis deposer le joueur sur le menu lui demanderait un tap de plus.
    const stopListening = onReminderTapped(() => open('lexik://jour'));

    return () => {
      sub.remove();
      stopListening();
    };
  }, []);

  if (!fontsLoaded || (!session && !authError)) {
    return (
      <View style={[styles.boot, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.textDim} />
      </View>
    );
  }

  if (authError) {
    return (
      <View style={[styles.boot, { backgroundColor: palette.bg }]}>
        <Text style={[styles.error, { color: palette.textFaint }]}>{authError}</Text>
      </View>
    );
  }

  const screens = {
    menu: MainMenu,
    campaign: CampaignScreen,
    game: GameScreen,
    settings: SettingsScreen,
  };
  const Screen = screens[route.name] ?? MainMenu;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <Screen
          key={`${route.name}:${JSON.stringify(route.params)}`}
          params={route.params}
          navigate={navigate}
          palette={palette}
          session={session}
          options={options}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  error: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
