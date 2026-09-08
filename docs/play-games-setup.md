# Configurer Play Games Services

À faire au premier jour, pas la veille de publier : quand c'est mal configuré,
la connexion échoue **silencieusement**, sans rien qui ressemble à une erreur de
code. C'est la source de perte de temps numéro un sur cette intégration.

L'app n'utilise Play Games que pour obtenir un `playerId` stable. Aucune autre
donnée n'est demandée.

---

## 1. Récupérer les empreintes de signature

Il en faut **deux**, et oublier la seconde est l'erreur classique : tout marche
en test, plus rien ne marche une fois publié.

```bash
cd app
npx eas credentials          # Android → affiche le SHA-1 du keystore d'upload
```

La deuxième vient de Google, pas de toi : Play Console → **Test et publication →
Configuration → Intégrité de l'application → Clé de signature d'application**.
Google resigne ton APK avec sa propre clé, donc c'est ce SHA-1 là que voit
l'appareil du joueur en production.

---

## 2. Comprendre où sont les choses

C'est le point qui fait perdre le plus de temps : **la configuration se fait
dans deux consoles différentes**, et la Play Console ne crée pas les
identifiants OAuth — elle ne fait que les référencer.

```
Play Console            le côté BOUTIQUE
play.google.com/console qui publie, quelle app, quelles versions, quels testeurs

Google Cloud Console    le côté API
console.cloud.google.com qui a le droit d'appeler une API Google, au nom de qui
```

Chercher « créer un ID client » dans la Play Console ne donne rien : le bouton
qu'elle affiche est un lien qui t'envoie dans Cloud Console. Autant y aller
directement.

### Pourquoi Google Cloud, alors qu'on ne fait qu'un jeu

Parce que **Play Games Services est une API Google comme les autres**, et que
chez Google toutes les API passent par Cloud. Quand le backend appelle
`games.googleapis.com/games/v1/players/me`, c'est techniquement le même genre
d'appel qu'une requête vers l'API Maps ou Drive : il lui faut un client OAuth,
et un client OAuth est un objet Google Cloud. Il n'existe pas de système OAuth
propre à la Play Console.

Play Games Services est justement à cheval sur les deux mondes : c'est une
fonctionnalité de boutique — rattachée à la fiche du jeu, publiée avec l'app —
**et** une API que le serveur interroge. D'où les deux consoles.

La raison de fond, dans notre cas précis : on pourrait se passer entièrement de
Cloud Console si l'app disait simplement au backend « je suis le joueur X ».
C'est exactement ce qu'on refuse de faire, puisque n'importe qui pourrait alors
réclamer la progression d'un autre. Le client Web et son code secret sont la
preuve que ton serveur est bien ton serveur, ce qui permet à Google de répondre
« voici l'identité **vérifiée** de ce joueur » plutôt que « le client prétend
être X ».

> **Cette étape Cloud Console est le prix de cette garantie.** C'est la seule
> raison pour laquelle elle existe dans ce projet.

Deux choses à savoir avant de s'y rendre :

- **Le projet Cloud se crée et se lie à l'étape 3.** Quand tu arrives ici pour
  l'étape 4, il existe déjà : tu ne fais qu'y déposer trois identifiants.
- **C'est gratuit, et sans compte de facturation.** « Google Cloud » évoque une
  facture ; l'API Play Games avec la portée `games_lite` n'en demande aucune.

> Les libellés de la Play Console bougent d'une refonte à l'autre. Les URL
> directes ci-dessous sont stables ; si un intitulé ne correspond plus, c'est
> l'URL qui fait foi.

---

## 3. Lier un projet Cloud au jeu (Play Console)

C'est ici que le jeu et un projet Google Cloud sont mis en relation. Rien ne
fonctionnera tant que ce lien n'existe pas.

**Play Console → sélectionne ton app → menu de gauche, section « Accroître le
nombre d'utilisateurs » → Services de jeux Play → Configuration et gestion →
Configuration.**

« Services de jeux Play » est la traduction française de Play Games Services :
c'est la même chose, la documentation Google emploie les deux.

La section est assez bas dans le menu, entre « Surveiller et améliorer » et
« Monétiser avec Play », et **repliée par défaut** : il faut cliquer dessus.

> Google l'appelle aussi « Développer » ou « Grow » selon les comptes et les
> refontes. Le repère fiable : c'est la section qui contient « Présence sur le
> Play Store ».

### L'écran propose deux options

- **« Créer un projet lié aux services de jeux Play »** → c'est celle-ci.
- « Utiliser un projet existant » → sert à partager une configuration entre
  plusieurs variantes d'un même jeu (gratuite / payante, par pays).

### Le projet Cloud n'est pas créé pour toi

Le libellé « Créer un projet » induit en erreur : ce qui est créé, c'est le
projet *services de jeux*. Le projet **Google Cloud**, lui, doit déjà exister —
l'écran te demande d'en **désigner un**.

- Si le sélecteur en liste un (un projet Firebase, par exemple) →
  sélectionne-le.
- **S'il est vide** — le cas normal pour un nouveau jeu — crée-le d'abord, puis
  reviens :

```
console.cloud.google.com
  → sélecteur de projet, en haut
    → « Nouveau projet »
         Nom du projet : Lexik
         Organisation  : laisser tel quel
    → Créer        (~15 s, aucun compte de facturation demandé)
```

Retour sur l'onglet Play Console, **recharger la page**, refaire « Créer un
projet lié aux services de jeux Play » : le projet apparaît alors dans le
sélecteur.

Sélectionne-le, renseigne le nom affiché et l'icône du jeu, puis **enregistre**.

Retiens le **nom du projet Cloud** : c'est dans celui-là, et pas un autre, que
les identifiants de l'étape 4 doivent vivre. Se tromper de projet est l'erreur
suivante la plus fréquente.

L'app n'a besoin ni d'être publiée ni d'avoir une version : les services de jeux
se configurent sur une app en brouillon.

### Si « Services de jeux Play » n'apparaît pas dans le menu

Deux causes, dans cet ordre de fréquence.

**1. L'app est déclarée comme *application*, pas comme *jeu*.** De loin la plus
courante, et rien à l'écran ne l'indique : la section est simplement absente,
sans message. Les services de jeux n'existent que pour les jeux.

```
Accroître le nombre d'utilisateurs
  → Présence sur le Play Store
    → Paramètres du Store
         « Application ou jeu » : Jeu
         « Catégorie »          : Puzzle
```

Enregistrer, puis **recharger la page**.

C'est de toute façon le bon réglage : classé en application, le jeu
n'apparaîtrait ni dans les palmarès Jeux, ni dans l'onglet Jeux du Play Store.

**2. Tu es dans le menu du compte développeur, pas dans celui de l'app.** Il
faut avoir ouvert l'application d'abord.

---

## 4. Créer les identifiants OAuth (Google Cloud Console)

> **L'étape 3 doit être faite avant celle-ci** : c'est là que le projet Cloud
> est lié au jeu. Sans ce lien, les identifiants créés ici ne seront rattachés à
> rien.

Cinq écrans, dans cet ordre. Avoir sous la main : les **deux SHA-1** (étape 1)
et le **nom du package**, `com.beginz.lexik`.

### 4.0 — Se placer dans le bon projet

<https://console.cloud.google.com>

En haut, à droite du logo « Google Cloud », un **sélecteur de projet**. Choisis
celui que tu as lié au jeu à l'étape 3.

Si tu hésites entre plusieurs : Play Console → Services de jeux Play →
Configuration affiche le nom et le numéro du projet lié. Ce sont eux qui font
foi. Tout ce qui suit doit se faire dans CE projet ; le refaire dans un autre
est silencieusement inutile.

### 4.1 — Activer l'API Play Games Services

<https://console.cloud.google.com/apis/library/games.googleapis.com>

Bouton **« Activer »**. S'il affiche déjà « Gérer », c'est fait — la Play
Console l'active parfois d'elle-même.

Sans cette activation, tout le reste se configure normalement et l'appel
`players/me` échoue à la fin, avec une erreur qui ne mentionne pas l'API
désactivée.

### 4.2 — Remplir l'écran de consentement

<https://console.cloud.google.com/auth/overview>

Tant qu'il n'est pas rempli, la création d'un ID client est refusée.

```
Nom de l'application         : Lexik
E-mail d'assistance          : le tien
Audience / Type d'utilisateur: Externe
Coordonnées du développeur   : le tien
```

Aucune portée (« scope ») à ajouter : `games_lite` est demandée par l'app au
moment de la connexion, pas déclarée ici.

L'écran reste en mode **« Test »** par défaut, ce qui limite à 100 comptes
déclarés et fait expirer les jetons au bout de 7 jours. C'est confortable pour
développer. Avant d'ouvrir le jeu au public, il faudra le **publier** — et
c'est à ce moment-là que Google t'indiquera s'il exige une vérification pour la
portée demandée. Ne pas s'en occuper maintenant.

### 4.3 — Deux clients Android

<https://console.cloud.google.com/apis/credentials>

**+ CRÉER DES IDENTIFIANTS → ID client OAuth.**

```
Type d'application : Android
Nom                : Lexik Android (upload)
Nom du package     : com.beginz.lexik
Empreinte SHA-1    : celle du keystore d'upload
```

**Créer**, puis **recommence à l'identique** :

```
Nom               : Lexik Android (signature Play)
Nom du package    : com.beginz.lexik
Empreinte SHA-1   : celle de la clé de signature Google
```

Deux clients Android, un par empreinte. Oublier le second, c'est marcher en test
et plus rien en production.

Ces deux-là ne se collent nulle part dans le code : ils autorisent l'appareil,
c'est tout.

### 4.4 — Un client Web

Même page → **+ CRÉER DES IDENTIFIANTS → ID client OAuth.**

```
Type d'application            : Application Web
Nom                           : Lexik backend
Origines JavaScript autorisées: (laisser vide)
URI de redirection autorisés  : (laisser vide)
```

Les URI restent vides parce qu'on n'utilise pas le flux navigateur, mais
l'échange d'un `serverAuthCode`.

Une fenêtre affiche alors un **ID client** et un **code secret** — c'est le seul
moment où le secret est lisible en clair, copie-le tout de suite (il est aussi
téléchargeable en JSON). Ce sont eux, et pas les clients Android, qui vont dans
la configuration :

```bash
# backend/.env
GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

```js
// app/src/api/config.js
export const GOOGLE_WEB_CLIENT_ID = 'xxxxx.apps.googleusercontent.com';
```

> Le code secret ne quitte jamais le backend, et `backend/.gitignore` exclut
> déjà `.env`. Côté app, seul l'ID client est nécessaire — c'est lui qui fait
> rendre un `serverAuthCode` que le serveur échangera contre l'identité
> vérifiée.

### 4.5 — Rattacher les identifiants au jeu (retour Play Console)

Retour dans **Play Console → Play Games Services → Configuration et gestion →
Identifiants → Ajouter un identifiant**.

Là, les clients OAuth créés à l'instant apparaissent dans une liste déroulante.
Il faut déclarer :

| Type d'identifiant | Client OAuth à choisir |
|---|---|
| **Jeu Android** | le client Android (une entrée par empreinte) |
| **Serveur de jeu** | le client Web |

C'est ce rattachement qui autorise ton backend à appeler l'API Play Games. Sans
lui, l'échange du code réussit mais `players/me` répond 403.

---

## 5. Déclarer les testeurs

Play Games Services → **Testeurs**. Ajouter les comptes Google qui doivent
pouvoir se connecter.

**Tant que la configuration PGS est en brouillon, seuls ces comptes peuvent se
connecter.** Pour tous les autres, la connexion échoue sans message : l'app
part en mode repli et tu conclus à un bug de code. Ça n'en est pas un.

---

## 6. Construire un build natif

Play Games ne fonctionne pas dans Expo Go — le module natif n'y est pas.

```bash
cd app
npx expo run:android      # ou : eas build --profile development --platform android
```

L'app détecte l'absence du module et bascule sur le mode repli, ce qui suffit
pour développer tout le reste du jeu.

---

## 7. Vérifier que la chaîne complète marche

```bash
# le backend doit répondre modelLoaded: true
curl http://localhost:8000/api/v1/health
```

Puis, dans les logs de l'app au lancement, tu dois voir passer un
`POST /auth/play-games` et non un `POST /auth/device`. Si c'est `device`, c'est
qu'une des étapes ci-dessus manque — dans l'ordre de probabilité :
testeur non déclaré, SHA-1 manquant, identifiant non rattaché au jeu (4.5), build Expo Go,
mauvais projet Cloud.

---

## Ce que ça change côté joueur

| Lancement | Ce qui se passe |
|---|---|
| Le tout premier | Connexion silencieuse tentée. Elle échoue (aucun compte encore autorisé pour cette app) → **mode repli**, le joueur entre dans le jeu sans rien voir. |
| Après un rattachement | `signInSilently()` réussit → identité Play Games, toujours sans écran. |
| Rattachement | Un sélecteur de compte, déclenché par le joueur depuis les réglages ou l'invite « Sauvegarder ma progression ». |

C'est le compromis assumé : on échange le silence absolu au premier lancement
contre zéro friction avant que le joueur ait vu le jeu.

---

## Publication

La configuration Play Games doit être **publiée** en même temps que l'app, sinon
seuls les testeurs pourront se connecter en production.

Et le rappel qui va avec (voir `prompt-persistance.md`, section 30) : dès que tu
crées des comptes, le Play Store exige un chemin de suppression **depuis l'app
et depuis une URL web accessible sans l'installer**. `DELETE /api/account`
existe déjà ; la page web reste à faire.
