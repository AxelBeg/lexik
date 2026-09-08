// Racine de l'application.
//
// Navigation maison a trois ecrans plutot que react-navigation : le jeu n'a ni
// onglets, ni pile profonde, ni deep links. Une dependance de moins.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { setAuthLostHandler } from './src/api/client';
import { signIn } from './src/api/auth';
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

  const navigate = useCallback((name, params = {}) => {
    if (name === 'back') {
      setHistory((h) => {
        const previous = h.at(-1) ?? { name: 'menu', params: {} };
        setRoute(previous);
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
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  error: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
