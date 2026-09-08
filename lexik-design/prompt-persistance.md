# Lexik — Compte joueur, persistance et distribution

> Ce document complète le prompt de cadrage initial : il **remplace la section 19**
> (architecture technique), **précise la section 20** (anti-triche) et ajoute la
> distribution Play Store. Les sections 14 à 17 sont couvertes par
> `prompt-campagne.md`. Le reste du cadrage reste valable tel quel.

---

## 25. Le partage front / backend

L'application est composée de deux morceaux :

```text
APP ANDROID          publiée sur le Play Store
    ↕ HTTPS
BACKEND              moteur sémantique + base existante
```

Point structurant, à garder en tête pour tout le reste :

> **Le moteur sémantique tourne côté serveur. Chaque proposition de mot est donc
> déjà un appel réseau.**

Le jeu n'est jouable hors ligne à aucun moment, quelle que soit la stratégie de
stockage retenue. Ce n'est pas une limitation à contourner : c'est la conséquence
directe du fait que le client ne doit jamais posséder ni le mot secret, ni le
modèle permettant de calculer les scores (section 20).

Conséquence : stocker la progression sur le téléphone **n'apporte aucune capacité
de jeu hors ligne**. Ce serait payer le coût sans acheter le bénéfice.

---

## 26. Où vit la progression — la règle

**La base de données est la source de vérité. Le téléphone n'a qu'un cache.**

```text
SERVEUR     autorité         tout ce qui est marqué, compté, payé ou comparé
TÉLÉPHONE   cache + confort  affichage immédiat, préférences, reprise en cours
```

Le fichier local n'est jamais consulté pour décider si un niveau est terminé, si
une planète est débloquée ou combien il reste de monnaie. Il sert à peindre
l'écran avant que le réseau réponde, puis il est écrasé par la réponse serveur.

### Ce qui est en base, et uniquement en base

```text
niveaux terminés
meilleur score par niveau
déblocage des planètes
historique des propositions
nombre d'essais, indices utilisés
monnaie d'indice
série quotidienne
résultat et statistiques du mot du jour
```

### Ce qui est légitimement sur le téléphone, en JSON

```text
thème clair / sombre, son, vibrations
copie du dernier GET /api/campaign              (cache d'affichage)
copie de la partie en cours                     (reprise instantanée)
file d'attente des propositions non confirmées  (réseau instable)
date du dernier mot du jour vu                  (écran d'accueil)
```

Ce fichier est **jetable**. L'app doit fonctionner correctement s'il est vide ou
corrompu : elle repart d'un `GET /api/campaign`.

---

## 27. Pourquoi pas du JSON local comme source de vérité

Quatre raisons, par ordre de gravité.

**1. Le percentile devient impossible.**
Le cœur émotionnel de l'écran de victoire est « Mieux que 73 % des joueurs »
(section 10), et la médiane du mot du jour (section 11). Ces deux chiffres sont
des agrégats sur l'ensemble des joueurs. Ils exigent que les résultats remontent
en base. Sans serveur d'autorité, il ne reste qu'un compteur d'essais sans point
de comparaison — le jeu perd sa seule dimension compétitive.

**2. La monnaie est monétisée.**
La section 21 prévoit l'achat de monnaie et la publicité récompensée. Une monnaie
stockée dans un JSON local est un champ que n'importe qui édite en trois minutes
sur un appareil rooté. Par ailleurs Google Play impose la validation
serveur-à-serveur des achats : un solde qui ne vit que sur l'appareil n'a nulle
part où être crédité de façon fiable.

**3. Réinstallation et changement de téléphone.**
Une campagne de 180 niveaux représente 90 à 180 heures de jeu. Perdre cette
progression en changeant de téléphone est le scénario qui produit les avis à une
étoile. Un stockage local seul ne survit ni à une désinstallation, ni à un nouvel
appareil.

**4. Cohérence avec le cadrage.**
Les sections 9, 17 ter et 20 posent déjà « le serveur est la source de vérité »
pour les scores, les essais, les indices et le déblocage des planètes. Un
stockage local d'autorité contredirait ces sections.

Le vrai coût du serveur — l'obligation d'être en ligne — est déjà payé par le
moteur sémantique. Il n'y a donc pas d'arbitrage à faire : c'est gratuit.

---

## 28. Le compte joueur — l'identité Play Games, pas un compte à créer

Une base côté serveur suppose d'identifier le joueur. **Il n'y a rien à créer :
l'appareil Android porte déjà une identité de joueur utilisable, celle de Play
Games Services.**

> **Identité = `playerId` Play Games Services. Pas d'e-mail, pas de mot de passe,
> pas d'écran d'inscription, pas de formulaire.**

Play Games Services v2 (`play-services-games-v2`) tente une connexion
**automatique et silencieuse au démarrage** de l'app. Pour la grande majorité des
joueurs Android, elle réussit sans aucune interaction : le joueur lance Lexik et
il est déjà identifié. Le `playerId` obtenu est propre au jeu, stable dans le
temps, et **identique sur tous les appareils du même compte Google** — c'est
exactement ce qu'il faut pour que la progression survive à une réinstallation ou
à un changement de téléphone.

Ce n'est pas une donnée personnelle : ce n'est ni un e-mail ni un identifiant
Google réutilisable ailleurs. Rien d'autre n'est à demander au joueur.

### Le point à ne pas rater : vérifier l'identité côté serveur

Le client ne doit **jamais** se contenter d'envoyer son `playerId` au backend :
n'importe qui pourrait alors envoyer celui d'un autre et prendre sa progression.
Le SDK fournit exactement le mécanisme pour l'éviter.

```text
APP       requestServerSideAccess(webClientId)  →  code d'autorisation
APP       POST /api/auth/play-games { "serverAuthCode": "..." }
BACKEND   échange le code auprès de Google        →  access token
BACKEND   GET games.googleapis.com/games/v1/players/me
                                                  →  playerId VÉRIFIÉ
BACKEND   trouve ou crée l'utilisateur pour ce playerId
BACKEND   renvoie ses propres jetons de session
```

```json
{ "userId": "...", "accessToken": "...", "refreshToken": "..." }
```

Les jetons de session sont conservés dans le stockage **sécurisé** du système
(Keystore / EncryptedSharedPreferences), **jamais dans le fichier JSON de cache**.

La ligne en base est créée à la volée au premier `playerId` vu. C'est tout ce que
« compte » veut dire ici : une ligne `user` et une clé, pas un parcours
d'inscription.

### Le cas de repli

La connexion automatique échoue pour une minorité : joueur qui a refusé Play
Games, appareil sans services Google, profil restreint. Ne pas bloquer le jeu
pour autant.

```text
PGS disponible   → identité durable immédiatement, aucun écran      (majorité)
PGS indisponible → identifiant anonyme de repli, généré sur l'appareil
```

Le joueur en repli joue normalement, mais sa progression ne vit que sur cet
appareil. Lui proposer **plus tard et sans bloquer** — à la fin de la planète
TERRE, ou après une série de 7 jours, quand il a quelque chose à perdre :

```text
Ta progression est sur cet appareil uniquement.
                                    [ Plus tard ]  [ La sauvegarder ]
```

Cette action relance la connexion Play Games et rattache la ligne existante au
`playerId` vérifié. Le compte de repli n'est pas dupliqué, il est promu.

### À prévoir dès le début du développement

Play Games Services doit être configuré dans la Play Console (projet Games,
empreinte de signature, `webClientId` OAuth) et les testeurs déclarés, sinon la
connexion échoue en local sans rapport avec le code. C'est la source d'erreur
numéro un sur cette intégration : la traiter au premier jour, pas au moment de
publier.

---

## 28 bis. Modèle d'identité — un ID interne, des identités externes

Le `playerId` Play Games suffit à **reconnaître** le joueur. Il ne doit pas pour
autant servir de clé primaire dans la base.

> **Le joueur a un identifiant interne, propre à Lexik. Play Games est une
> *manière de s'y connecter*, pas son identité.**

Deux tables, pas une :

```text
users
  id            UUID interne, généré par Lexik      ← clé primaire
  created_at
  ...

auth_identities
  provider      'play_games' | 'device' | (plus tard 'apple', 'email')
  external_id   le playerId vérifié, ou l'id de repli
  user_id       → users.id
  UNIQUE (provider, external_id)
```

Toute la progression — niveaux, propositions, monnaie, série — pointe vers
`users.id`, **jamais vers le `playerId`**.

### Pourquoi ce détour, qui a l'air inutile

**1. Le repli n'a pas de `playerId`.** Un joueur sans Play Games (section 28) doit
quand même exister en base. Avec le `playerId` comme clé primaire, cette colonne
devrait être nullable — une clé primaire qui peut être vide n'en est pas une.

**2. Un joueur peut avoir plusieurs identités.** Le cas normal, pas le cas
tordu : il commence en repli (`device`), puis se rattache à Play Games. Deux
lignes dans `auth_identities`, un seul `users.id`, et **aucune donnée de jeu à
déplacer**. Avec le `playerId` en clé primaire, ce rattachement obligerait à
réécrire chaque table.

**3. Ça rend la question de l'e-mail réversible.** Ajouter un jour Apple, e-mail
ou n'importe quoi d'autre = insérer une ligne dans `auth_identities`. Aucune
migration, aucune décision à prendre maintenant.

**4. Le `playerId` est une donnée externe.** Il vient de Google, il est opaque, et
un changement de projet Play Console peut le rendre caduc. Une donnée que tu ne
contrôles pas n'a pas sa place dans les clés étrangères de huit tables.

Le coût de ce modèle est d'une jointure. Le coût de l'absence de ce modèle est
une migration de toute la base le jour où un deuxième mode de connexion arrive.

---

## 28 ter. Faut-il demander un e-mail ? Non.

Réponse courte : **non, et probablement jamais dans la version Android.**

L'e-mail ne résoudrait qu'un seul problème — survivre à la réinstallation et au
changement de téléphone. Or **le `playerId` Play Games le résout déjà**, et mieux :
sans écran, sans mot de passe, sans vérification.

Ce que coûterait un e-mail, pour ce gain nul :

```text
un écran d'inscription           → perte de joueurs à l'installation
un mot de passe ou magic link    → un flux de réinitialisation à écrire
un service d'envoi d'e-mails     → une dépendance et un coût
une donnée personnelle stockée   → déclaration Data safety alourdie, RGPD
« j'ai perdu mon mot de passe »  → du support, pour un jeu à une personne
```

C'est un mauvais échange. L'e-mail n'est pas une identité *plus solide* que Play
Games ici : c'est la même solidité, payée beaucoup plus cher.

### Ce qui déclencherait vraiment le besoin

Un seul cas sérieux : **sortir d'Android.** Play Games est Android uniquement.
Le jour d'un portage iOS ou web, il faut une identité multiplateforme — et même
là, Sign in with Apple et Google Sign-In restent préférables à un couple
e-mail / mot de passe.

Grâce à `auth_identities` (section 28 bis), ce jour-là se règle en ajoutant un
`provider`. Ce n'est donc pas une décision à prendre maintenant.

### Le cas « je veux déplacer ma progression », sans e-mail

Reste le joueur qui change de compte Google, ou qui a perdu l'accès au sien.
Rare, mais frustrant. Il se traite sans aucune donnée personnelle, avec un
**code de transfert** :

```text
Ancien appareil   →  l'app affiche un code court, valable 15 minutes
Nouvel appareil   →  le joueur saisit le code
                     la progression est rattachée à la nouvelle identité
```

Deux routes, aucun e-mail, aucun mot de passe, aucun support. À n'écrire que si
le besoin se manifeste réellement.

---

## 29. Réconciliation et conflits

Le client n'est jamais autorisé à pousser un état de progression complet vers le
serveur. Il n'envoie que des **actions** :

```text
POST /api/game/{gameId}/guess     proposer un mot
POST /api/game/{gameId}/hint      acheter un indice
```

Le serveur applique l'action, met à jour l'état, et renvoie l'état résultant. Le
client remplace son cache par ce que le serveur a répondu.

Il n'y a donc **aucune fusion d'états à écrire**, et aucun conflit possible entre
deux appareils : deux téléphones connectés au même compte lisent la même base.
C'est le principal bénéfice pratique de ce découpage.

Cas particulier — un joueur en repli (section 28) qui se rattache à un `playerId`
Play Games portant déjà une progression : ne pas fusionner silencieusement.
Demander explicitement laquelle garder, en montrant les deux
(« cet appareil : 34 niveaux » / « ton compte Play Games : 12 niveaux »).

Perte de réseau en cours de partie : la proposition part dans la file d'attente
locale, l'interface affiche le mot en attente sans score, et rejoue l'appel au
retour du réseau. Ne jamais afficher un score calculé côté client, même
approximatif.

---

## 30. Contraintes propres au Play Store

À traiter dès le début, pas à la veille de la publication :

**Suppression de compte.** Créer un compte, même anonyme, oblige à fournir un
moyen de le supprimer — depuis l'app **et** depuis une URL web accessible sans
installer l'app. Prévoir `DELETE /api/account` et une page publique.

**Data safety.** Le formulaire du Play Console doit déclarer exactement ce qui est
collecté. Avec l'identité Play Games décrite ici, la déclaration reste minimale :
identifiant de compte, données de jeu — ni e-mail, ni nom, ni contacts. La
publicité récompensée (section 21) ajoute en revanche un identifiant publicitaire
à déclarer.

**Achats.** Google Play Billing côté app, validation du reçu côté serveur, puis
crédit de la monnaie en base. Ne jamais créditer sur la seule foi du client.

**Publicité récompensée.** Le crédit doit venir du callback serveur du réseau
publicitaire, pas du client qui affirme avoir vu la vidéo.

**Cible d'API et 64 bits** : contraintes standard du Play Store, à vérifier au
moment de la publication.

---

## 31. Résumé

| | Serveur (autorité) | Téléphone (cache) |
|---|---|---|
| Mot secret | jamais envoyé avant victoire | jamais |
| Score de proximité | calculé | — |
| Niveaux terminés | persisté | copie d'affichage |
| Monnaie d'indice | persisté | copie d'affichage |
| Percentile, médiane | agrégé | — |
| Partie en cours | persisté | copie, reprise rapide |
| Préférences UI | — | JSON local |
| Jetons d'authentification | émis | stockage sécurisé |

En une phrase :

> **La base tranche, le JSON local ne fait qu'accélérer l'affichage.**

---

## Annexe — ce qui a changé

| | Avant | Maintenant |
|---|---|---|
| Section 19 | routes `/start`, `/guess`, `/hint` | inchangées, + auth anonyme et règle de cache |
| Identité du joueur | non précisée | `playerId` Play Games vérifié côté serveur, repli anonyme |
| Modèle en base | non précisé | `users.id` interne + table `auth_identities` |
| E-mail / mot de passe | non précisé | écarté ; utile seulement si portage hors Android |
| Progression | « côté serveur » | serveur d'autorité + cache local jetable |
| Distribution | non précisée | Play Store, avec ses contraintes propres |
