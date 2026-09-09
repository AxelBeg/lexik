# Lexik

Puzzle sémantique quotidien + campagne. Reprise de LexiFight débarrassée du
duel : le cadrage produit vit dans [docs/](docs/).

```
lexik/
  backend/        FastAPI + Postgres + fastText   (source de vérité)
  app/            Expo / React Native             (affichage)
  docs/           le cadrage produit
  lexik-design/   les maquettes dont l'app est tirée
```

---

## Ce qui a été repris de LexiFight, et ce qui a été jeté

**Repris**

| | Où |
|---|---|
| Structure FastAPI + SQLAlchemy + Postgres | `backend/` |
| Moteur fastText et cache disque des paires | `backend/services/similarity.py` |
| Client axios avec refresh de jeton et file d'attente | `app/src/api/client.js` |
| Stockage sécurisé des jetons (`expo-secure-store`) | `app/src/api/auth.js` |
| Config Expo et outillage EAS | `app/package.json` |

**Jeté** — tout le duel et ses dépendances : `ws_manager`, `ws_messages`,
`queue`, `amis`, `icons`, `themes`, `backgroundTasks`, `xp`, le modèle
`Game`/`GamePlayer` multi-joueurs, les `room_code`, et côté front `Room.js`,
`Queue.js`, `Friends.js`, `Shop.js`, `Login.js`, `DeepLinkHandler.js`,
`ProfileModal.js`, `WebSocketHandler.js`.

Plus aucun WebSocket : le jeu est en tours, une requête HTTP par proposition
suffit.

---

## Backend

### Installation

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows
pip install -r requirements.txt
cp .env.example .env                                 # puis remplir
```

### Données non versionnées

Un fichier est exclu du dépôt et doit être récupéré à part si on veut
régénérer les listes de vocabulaire.

| Fichier | Pourquoi | Où le trouver |
|---|---|---|
| `backend/data/Lexique383.tsv` | 25 Mo, données tierces | [lexique.org](http://www.lexique.org/) |

Les **listes produites** par Lexique383 sont versionnées, elles
(`playable_words.json`, `hint_words.json`, `campaign_words.json`) : le jeu en a
besoin au démarrage, le TSV seulement pour les régénérer.

Le binaire officiel `cc.fr.300.bin` (~7 Go) n'est **pas** versionné. Le runtime
utilise `backend/models/lexik.fr.300.npz` (~24 Mo) : les vecteurs cc.fr.300
réduits au vocabulaire jouable. Il est dans le dépôt. Pour le reconstruire :

```bash
python -m scripts.build_reduced_model
```

### Le modèle

`lexik.fr.300.npz` suffit au jeu : on ne score que des mots de
`playable_words`, et les indices sont précalculés. Le `.bin` officiel n'est
utile que pour régénérer ce fichier.

> **Avant de publier.** Vérifier que le `.npz` couvre bien les 180 mots de
> campagne. Voir `docs/prompt-persistance.md`.

### Tester sans le modèle ni Postgres

Le modèle pèse 7 Go et Postgres demande une installation : les deux bloquent
tout le reste du développement pour des raisons qui n'ont rien à voir avec le
jeu. Deux variables les court-circuitent.

```bash
export LEXIK_FAKE_ENGINE=1                      # fastText -> hachage déterministe
export DATABASE_URL="sqlite:///./lexik_dev.db"  # Postgres -> fichier local

python -m scripts.seed_campaign --words data/campaign_words.json \
       --daily-words data/hint_words.json --schedule-daily 30
python -m scripts.precompute_hints
python -m scripts.precompute_neighbors
python main.py
```

Tout fonctionne alors de bout en bout : connexion, mot du jour, campagne,
indices et leur coût cumulatif, victoire, percentile, série, déblocage des
planètes. **Seuls les scores n'ont aucun sens sémantique** — ce mode teste la
plomberie, jamais l'équilibrage ni la sensation de jeu.

Côté app, la connexion Play Games échoue et bascule proprement en mode repli :
tous les écrans sont utilisables sans avoir configuré quoi que ce soit.

### Mise en route

```bash
# 0. générer les 180 mots de campagne (déjà fait, à relire avant de publier)
python -m scripts.build_campaign_words

# 1. tables + campagne + mots du jour
python -m scripts.seed_campaign --words data/campaign_words.json --daily-words data/hint_words.json --schedule-daily 90

# 2. calibrer le score (sinon la courbe de repli, utilisable mais approximative)
python -m scripts.calibrate --pairs 200000

# 3. précalculer les 5 indices de chaque mot — long, et hors ligne
python -m scripts.precompute_hints

# 4. précalculer les 1000 voisins de chaque mot (rang en partie + révélation)
python -m scripts.precompute_neighbors

# 5. lancer
python main.py
```

Les étapes 3 et 4 stockent des **scores de jeu**, pas des cosinus : recalibrer
(étape 2) les rend faux et impose de relancer les deux avec `--force`. Le cache
disque `cache/similarities/` est dans le même cas, et se vide en supprimant le
dossier.

`data/campaign_words.json` est généré par `scripts/build_campaign_words.py` :
**180 mots ordonnés par difficulté sémantique croissante** (30 par planète).
C'est le seul contenu éditorial du jeu, et l'ordre de ce fichier *est* la courbe
de difficulté.

La difficulté vient de l'**abstraction** et de la **polysémie**, pas de la
rareté : un mot rare ne rend pas le puzzle plus profond, il le rend injouable.
Le réservoir est donc plafonné aux noms communs fréquents dans les deux
registres (films *et* livres) — c'est ce filtre, et non une liste d'exclusion,
qui écarte l'argot et les archaïsmes.

### Changer les mots de la campagne

Éditer `data/campaign_words.json`, puis une seule commande :

```bash
python -m scripts.rebuild_campaign
```

Elle vérifie le fichier, réaffecte les 180 niveaux, supprime les mots secrets
devenus orphelins, vide le cache des similarités, puis recalcule **les 5 indices
et les 1000 voisins de chaque mot** en écrasant les anciens. Le modèle n'est
chargé qu'une fois pour les deux — lancés séparément, `precompute_hints` et
`precompute_neighbors` reconstruisent chacun la matrice du vocabulaire.

La vérification tourne **avant** la moindre écriture, et refuse de semer sur :

| Défaut | Conséquence si on passe outre |
|---|---|
| doublon | deux niveaux ont la même solution |
| mot hors `playable_words` | le joueur ne peut pas taper la solution de son niveau |
| mot inconnu du modèle réduit | vecteur nul : indices et voisins sont du bruit |

`--allow-unknown` passe outre, `--changed-only` ne recalcule que les mots qui
n'ont pas encore leurs indices, `--schedule-daily N` programme en plus N mots du
jour.

**À relire avant de publier.** La génération automatique amène à ~90 %. Le
rapport final de `rebuild_campaign` liste les mots dont le meilleur indice reste
sous 85 : le modèle ne leur connaît aucun voisin proche, donc les cinq indices se
valent et le joueur paie pour du bruit. Ce sont ceux-là qu'il faut remplacer à la
main dans le tableau JSON, avant de relancer la commande.

### Routes

```
POST   /api/v1/auth/play-games          connexion silencieuse (code vérifié serveur)
POST   /api/v1/auth/device              repli si Play Games indisponible
POST   /api/v1/auth/refresh
POST   /api/v1/auth/link-play-games     promotion d'un compte de repli
DELETE /api/v1/account                  exigé par le Play Store

GET    /api/v1/me                       tout le menu principal en un appel
                                        (dont `daily.resetsAt`, l'échéance du jour)
POST   /api/v1/daily/start
GET    /api/v1/campaign
POST   /api/v1/campaign/{planet}/{n}/start

GET    /api/v1/game/{id}
POST   /api/v1/game/{id}/guess          {"word": "montagne"}
POST   /api/v1/game/{id}/hint
```

Le mot secret n'est jamais renvoyé avant la victoire.

### Le rang

`/guess` renvoie, en plus du score, le **rang** du mot parmi les 1000 plus
proches du secret — `null` s'il n'y est pas. C'est la mesure qui rend le milieu
de partie lisible : entre 8 et 14, le score ne dit rien au joueur, alors que
passer de 900e à 300e dit tout.

Deux règles tiennent la mécanique :

- **le rang ne révèle jamais un mot.** `neighbor_ranks` ne sort que des
  nombres ; seul `serialize_neighbors`, appelé par `build_victory`, sort des
  mots — et il n'est atteignable qu'une fois la partie gagnée ;
- **l'absence de rang est l'information.** Rien n'annonce « tu es loin » : le
  rang se contente de ne pas être là, et son apparition marque le moment où le
  joueur entre dans la bonne région.

Le vivier est pioché dans `hint_words.json` (~12 000 mots courants), pas dans
`playable_words.json` : une proposition rare mais juste n'aura donc pas de rang,
seulement un score élevé.

> **Base existante.** Les voisins étaient stockés par 100. Relancer
> `python -m scripts.precompute_neighbors` — sans `--force`, il reprend tout mot
> qui en a moins de 1000 — puis **redémarrer le serveur** : les rangs sont mis
> en cache au premier accès.

---

## App

```bash
cd app
npm install
npx expo start
```

Renseigner l'IP de la machine dans `src/api/config.js` : un téléphone ne résout
pas `localhost`.

Play Games exige un build natif (`npx expo run:android`) — dans Expo Go, l'app
bascule automatiquement sur le mode repli, ce qui suffit pour développer.

### Écrans

| Écran | Maquette |
|---|---|
| `MainMenu.js` | `Main.dc.html` |
| `CampaignScreen.js` | `Campagne.dc.html` |
| `GameScreen.js` | `Partie.dc.html` |
| `VictoryOverlay.js` | section 10 du cadrage |
| `SettingsScreen.js` | suppression de compte + sauvegarde |

### Le rappel du soir

Une notification par jour, **locale** — pas de FCM, pas de jeton, pas
d'ordonnanceur serveur. `src/utils/notifications.js` en programme sept d'avance
à chaque ouverture de l'app, et les repose entièrement à chaque passage par le
menu.

Trois règles tiennent la mécanique :

- **jamais pour quelqu'un qui a déjà trouvé le mot du jour.** C'est la contrainte
  principale, avant le texte : un rappel qui part alors que le joueur a joué est
  la façon la plus sûre de se faire désinstaller par les joueurs assidus ;
- **l'échéance vient du serveur.** `/me` renvoie `daily.resetsAt`, et le rappel
  est posé 4 h avant cet instant — pas à « 20 h sur le téléphone ». C'est ce qui
  rend « il te reste 4 h » exact même pour un joueur qui a changé de fuseau ;
- **le message ne ment pas le lendemain.** Ce soir, on sait que la série est en
  jeu et on le dit. Les soirs suivants, la série est déjà rompue si le joueur ne
  joue pas ce soir : le rappel redevient une simple invitation.

La permission est demandée **après la première victoire quotidienne**, jamais au
premier lancement : un refus système ne se represente jamais, et au premier
lancement le joueur n'a encore aucune raison de dire oui.

Un joueur qui ne rouvre plus l'app voit les rappels s'épuiser au bout d'une
semaine — c'est le bon comportement. Une relance de reconquête à J+30 demanderait
un vrai push serveur : elle ne peut pas être programmée par une app qu'on
n'ouvre plus.

### Le partage

Le message de victoire est un **défi**, pas un résumé (`src/utils/share.js`) :

```text
Lexik — mot du jour #428
Trouvé en 18 essais et 1 indice.
Mieux que 73 % des joueurs.

Fais mieux :
https://lexik.app/jour/428
```

Le nombre d'essais est ce que le destinataire voudra battre, et le lien lui
donne où aller — un partage sans lien ne peut rien déclencher. Le percentile
n'apparaît qu'au-dessus de 50 % : annoncer « mieux que 12 % » dans un message de
défi, c'est se narguer soi-même.

Aucun mot n'y figure jamais — ni la solution, ni une proposition, ni un indice.

### Les liens entrants

```text
lexik://jour/428          https://lexik.app/jour/428
lexik://niveau/terre/7    https://lexik.app/niveau/terre/7
```

`src/utils/deeplink.js` les analyse, `App.js` les ouvre — sur la partie, pas sur
le menu. Le rappel du soir mène au même endroit.

Le partage utilise la forme **https** : un lien est lu par quelqu'un qui, la
plupart du temps, n'a pas l'app, et un schéma maison ne s'ouvre pas chez lui.
Pour qu'il ouvre l'app quand elle est installée, le domaine doit servir
`/.well-known/assetlinks.json`. Tant que ce n'est pas fait, le lien reste valide
et tombe sur la page web — qui doit renvoyer vers le store.

`/jour/428` ouvre **le** mot du jour, pas le 428ᵉ : il n'y a pas d'archive. Le
numéro est conservé dans l'URL pour le jour où il y en aura une, afin que les
liens déjà partagés continuent de fonctionner.

**Thème clair imposé**, d'après les maquettes `*Clair.dc.html`. La palette
sombre reste dans `theme/colors.js` avec exactement les mêmes noms de jetons :
y revenir, ou suivre le réglage système, ne demande que de changer la ligne
`const palette = themes.light` dans `App.js`.

**Règle du système de couleur** : le dégradé sémantique (bleu → tiède → ambre →
orange → rouge) est réservé aux **scores de proximité**. La progression de
campagne est en gris neutre, la monnaie et les indices en ambre. Aucune couleur
ne veut dire deux choses.

---

## Ce qui reste à faire

1. **Relire les 180 mots** de `data/campaign_words.json`.
2. **Play Games** — voir [docs/play-games-setup.md](docs/play-games-setup.md).
   À faire tôt : mal configuré, ça échoue silencieusement et ça ne ressemble pas
   à un bug de code.
3. **Publicité récompensée** — `react-native-google-mobile-ads` a été retiré des
   dépendances : module natif inutilisable dans Expo Go, et pas encore branché.
   Le crédit devra venir du callback serveur du réseau publicitaire, jamais du
   client qui affirme avoir vu la vidéo.
4. **Achats** — Google Play Billing côté app, validation du reçu côté serveur.
5. **Page web de suppression de compte** — accessible sans installer l'app.
6. **Migrations** — `Base.metadata.create_all` suffit au démarrage ; passer à
   Alembic avant la première mise en production.
