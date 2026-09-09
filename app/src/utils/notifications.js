// Le rappel du soir.
//
// UNE notification par jour, et seulement pour qui n'a pas encore trouve le mot
// du jour. C'est la contrainte principale, et elle est plus importante que le
// texte : un rappel qui part alors que le joueur a deja joue est la facon la
// plus sure de se faire desinstaller par les joueurs les plus assidus — ceux
// qu'on veut garder.
//
// ## Local, pas de push
//
// Tout est programme sur l'appareil. Pas de FCM, pas de jeton a stocker, pas
// d'ordonnanceur cote serveur. Le prix a payer : l'app doit avoir ete ouverte
// pour (re)poser ses rappels, donc on en programme HORIZON_DAYS d'avance a
// chaque ouverture. Un joueur qui ne revient plus voit les rappels s'epuiser au
// bout d'une semaine, ce qui est le bon comportement — on ne harcele pas
// quelqu'un qui est parti.
//
// Le jour ou une relance de reconquete a J+30 devient souhaitable, elle demande
// un vrai push serveur : elle ne peut pas etre programmee par une app qu'on
// n'ouvre plus.
//
// ## L'echeance vient du serveur
//
// `resetsAt` est l'instant ou le mot du jour bascule, envoye par `/me` sur le
// fuseau de la JOURNEE DE JEU. Le rappel est pose HOURS_BEFORE avant cet
// instant, jamais a « 20 h sur le telephone » : c'est ce qui rend « il te reste
// 4 h » exact meme pour un joueur qui a change de fuseau, et ce qui evite que le
// message mente deux fois par an au changement d'heure.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { readPrefs, writePrefs } from './cache';

// Combien d'heures avant la bascule le rappel part. 4 h avant minuit = 20 h.
// Le texte du rappel est ecrit a partir de cette constante : la changer ne peut
// pas rendre le message faux.
const HOURS_BEFORE = 4;

// Nombre de soirs programmes d'avance. Au-dela, l'app doit avoir ete rouverte.
const HORIZON_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Toutes les notifications de Lexik portent cette marque. */
const CHANNEL_ID = 'rappel-quotidien';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Le texte du soir.
 *
 * Deux versions, et la difference n'est pas cosmetique. Ce soir, on sait ce que
 * le joueur risque : sa serie. Les soirs suivants, on ne sait plus rien — s'il
 * ne joue pas ce soir, la serie est deja rompue demain matin, et lui annoncer
 * qu'elle est « en danger » serait un mensonge. Le rappel se tait donc a partir
 * de J+1 et redevient une simple invitation.
 */
function reminderBody({ tonight, streak, dailyNumber }) {
  if (!tonight) {
    return { title: 'Le mot du jour t’attend', body: 'Un mot, tous les joueurs.' };
  }
  if (streak > 0) {
    return {
      title: `Il te reste ${HOURS_BEFORE} h`,
      body: `Ta serie de ${streak} jour${streak > 1 ? 's' : ''} est en danger.`,
    };
  }
  return {
    title: `Il te reste ${HOURS_BEFORE} h`,
    body: `Le mot du jour${dailyNumber ? ` #${dailyNumber}` : ''} n’est pas encore trouve.`,
  };
}

/**
 * Ouvre le mot du jour quand le joueur touche le rappel.
 *
 * Sans ca, le rappel depose sur le menu : on annonce « il te reste 4 h » et on
 * demande un tap de plus pour commencer. Couvre aussi le demarrage a froid,
 * quand c'est la notification qui a lance l'app.
 */
export function onReminderTapped(handler) {
  const opened = (response) => {
    if (response?.notification?.request?.content?.data?.screen === 'daily') handler();
  };

  Notifications.getLastNotificationResponseAsync().then(opened).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(opened);
  return () => sub.remove();
}

/** L'autorisation, sans jamais la demander : sert a decider, pas a obtenir. */
async function hasPermission() {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/**
 * Demande l'autorisation — une seule fois, et au bon moment.
 *
 * Le bon moment n'est pas le premier lancement : a cet instant le joueur ne
 * sait pas encore ce qu'est Lexik, et un refus est definitif (le systeme ne
 * repose plus la question). On appelle donc ceci apres une premiere victoire,
 * quand le joueur vient d'avoir une raison de revenir demain.
 */
export async function askPermissionOnce() {
  const prefs = await readPrefs();
  if (prefs.notificationsAsked) return false;

  await writePrefs({ notificationsAsked: true });
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/**
 * Repose la serie complete de rappels a partir de l'etat renvoye par `/me`.
 *
 * Appelee a chaque ouverture, et de nouveau apres une victoire quotidienne.
 * Elle annule tout avant de reprogrammer : c'est ce qui garantit qu'il ne reste
 * jamais deux rappels pour le meme soir, et que celui de ce soir disparait des
 * que le mot est trouve.
 */
export async function syncDailyReminder(me) {
  if (!(await hasPermission())) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rappel du mot du jour',
      importance: Notifications.AndroidImportance.DEFAULT,
      // Pas de vibration : c'est une invitation, pas une alerte.
      enableVibrate: false,
    });
  }

  const resetsAt = me?.daily?.resetsAt ? new Date(me.daily.resetsAt) : null;
  if (!resetsAt || Number.isNaN(resetsAt.getTime())) return;

  const firstReminder = resetsAt.getTime() - HOURS_BEFORE * 60 * 60 * 1000;

  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    const at = firstReminder + day * MS_PER_DAY;

    // Ce soir ne se programme que s'il reste quelque chose a jouer et que
    // l'heure n'est pas passee : un rappel dans le passe part immediatement.
    const tonight = day === 0;
    if (tonight && (me.daily.completed || at <= Date.now())) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        ...reminderBody({
          tonight,
          streak: me.streak ?? 0,
          dailyNumber: me.daily?.number,
        }),
        data: { screen: 'daily' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at,
                 channelId: CHANNEL_ID },
    });
  }
}
