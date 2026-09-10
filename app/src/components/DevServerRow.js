// Changer l'adresse du backend depuis l'app. DEVELOPPEMENT UNIQUEMENT.
//
// Le composant entier renvoie null hors `__DEV__` : en production il n'y a
// rien a regler, l'URL est figee dans config.js et ce fichier ne doit laisser
// aucune trace visible.
//
// Il vit a part de SettingsScreen pour la meme raison : le jour ou ce confort
// de dev devient genant, il se retire en supprimant un fichier et son import,
// sans relire un ecran que le joueur, lui, utilise vraiment.

import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { DEFAULT_DEV_HOST, getDevHost, normalizeDevHost, resetDevHost, setDevHost } from '../api/config';
import { resetSession } from '../api/client';
import { Fonts } from '../../theme/fonts';

export default function DevServerRow({ palette, onChanged }) {
  // Les hooks d'abord, la sortie ensuite : appeler `return null` avant eux les
  // rendrait conditionnels. `__DEV__` est fige a la compilation, donc l'ordre
  // ne varierait jamais en pratique — mais la regle ne se discute pas au cas
  // par cas, et le linter la ferait remarquer a juste titre.
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getDevHost());
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState(getDevHost());

  const valid = normalizeDevHost(value) !== null;

  if (!__DEV__) return null;

  // Changer de serveur invalide le jeton : il a ete signe par la machine
  // precedente. On le jette et on se reconnecte, sinon la premiere requete
  // repartirait en 401 sans rafraichissement possible.
  const apply = async (next) => {
    setBusy(true);
    try {
      const saved = next === null ? await resetDevHost() : await setDevHost(next);
      setHost(saved);
      setValue(saved);
      await resetSession();
      setOpen(false);
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => { setValue(getDevHost()); setOpen(true); }}
        style={({ pressed }) => [
          styles.row,
          { borderColor: palette.borderStrong, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.rowTitle, { color: palette.text }]}>Serveur de dev</Text>
          <Text style={[styles.rowSub, { color: palette.textFaint }]}>{host}</Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => !busy && setOpen(false)}>
          {/* Pressable interne sans onPress : il avale l'appui pour que toucher
              la carte ne referme pas la modale ouverte juste derriere. */}
          <Pressable style={[styles.card, { backgroundColor: palette.bg }]}>
            <Text style={[styles.title, { color: palette.text }]}>Serveur de dev</Text>
            <Text style={[styles.help, { color: palette.textFaint }]}>
              IP de la machine sur le reseau local. Le port est 8000 s'il n'est pas precise.
            </Text>

            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={DEFAULT_DEV_HOST}
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!busy}
              onSubmitEditing={() => valid && !busy && apply(value)}
              style={[styles.input, { borderColor: palette.borderStrong, color: palette.text }]}
            />

            <View style={styles.actions}>
              <Pressable onPress={() => !busy && apply(null)} hitSlop={8}>
                <Text style={[styles.secondary, { color: palette.textFaint }]}>Par defaut</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => !busy && setOpen(false)} hitSlop={8}>
                <Text style={[styles.secondary, { color: palette.textDim }]}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={() => valid && !busy && apply(value)}
                hitSlop={8}
                style={{ marginLeft: 20, opacity: valid && !busy ? 1 : 0.4 }}
              >
                {busy
                  ? <ActivityIndicator color={palette.textDim} />
                  : <Text style={[styles.primary, { color: palette.text }]}>Connecter</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 },
  rowTitle: { fontFamily: Fonts.medium, fontSize: 15 },
  rowSub: { fontFamily: Fonts.mono, fontSize: 12 },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  card: { width: '100%', borderRadius: 16, padding: 22, gap: 12 },
  title: { fontFamily: Fonts.medium, fontSize: 16 },
  help: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 18 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.mono, fontSize: 15,
  },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  secondary: { fontFamily: Fonts.regular, fontSize: 13 },
  primary: { fontFamily: Fonts.medium, fontSize: 14 },
});
