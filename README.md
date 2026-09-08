# Lexik

Puzzle sémantique quotidien + campagne. Reprise de LexiFight débarrassée du
duel : le cadrage produit vit dans [docs/](docs/).

```
lexik/
  backend/   FastAPI + Postgres + fastText   (source de vérité)
  app/       Expo / React Native             (affichage)
  docs/      le cadrage produit
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
| Config Expo, `react-native-google-mobile-ads` | `app/package.json` |

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

Deux fichiers sont exclus du dépôt et doivent être récupérés à part.

| Fichier | Pourquoi | Où le trouver |
|---|---|---|
| `backend/models/cc.fr.300.bin` | ~7 Go | [fastText, vecteurs français](https://fasttext.cc/docs/en/crawl-vectors.html) |
| `backend/data/Lexique383.tsv` | 25 Mo, données tierces | [lexique.org](http://www.lexique.org/) |

Les **listes produites** par Lexique383 sont versionnées, elles
(`playable_words.json`, `hint_words.json`, `campaign_words.json`) : le jeu en a
besoin au démarrage, le TSV seulement pour les régénérer.

Et rien ne tourne sans le modèle — sauf en mode factice (voir plus bas), qui
n'en a pas besoin.

### Le modèle

`cc.fr.300.bin` (fastText français) est attendu dans `backend/models/`.
Il n'est pas versionné : ~7 Go.

> **À faire avant de publier.** Ce modèle est bien trop gros pour un serveur
> raisonnable. Comme les indices sont précalculés, le runtime n'a besoin que du
> vocabulaire jouable (~12 000 mots) : réduire le modèle à ce vocabulaire fait
> tomber l'empreinte de plusieurs Go à quelques dizaines de Mo, et l'hébergement
> avec. Voir `docs/prompt-persistance.md`.

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

# 4. lancer
python main.py
```

`data/campaign_words.json` est généré par `scripts/build_campaign_words.py` :
**180 mots ordonnés par difficulté sémantique croissante** (30 par planète).
C'est le seul contenu éditorial du jeu, et l'ordre de ce fichier *est* la courbe
de difficulté.

La difficulté vient de l'**abstraction** et de la **polysémie**, pas de la
rareté : un mot rare ne rend pas le puzzle plus profond, il le rend injouable.
Le réservoir est donc plafonné aux noms communs fréquents dans les deux
registres (films *et* livres) — c'est ce filtre, et non une liste d'exclusion,
qui écarte l'argot et les archaïsmes.

**À relire avant de publier.** La génération automatique amène à ~90 % ; il
reste une poignée de mots à remplacer à la main (le fichier est un simple
tableau JSON). Puis relancer `seed_campaign`.

### Routes

```
POST   /api/v1/auth/play-games          connexion silencieuse (code vérifié serveur)
POST   /api/v1/auth/device              repli si Play Games indisponible
POST   /api/v1/auth/refresh
POST   /api/v1/auth/link-play-games     promotion d'un compte de repli
DELETE /api/v1/account                  exigé par le Play Store

GET    /api/v1/me                       tout le menu principal en un appel
POST   /api/v1/daily/start
GET    /api/v1/campaign
POST   /api/v1/campaign/{planet}/{n}/start

GET    /api/v1/game/{id}
POST   /api/v1/game/{id}/guess          {"word": "montagne"}
POST   /api/v1/game/{id}/hint
```

Le mot secret n'est jamais renvoyé avant la victoire.

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

Thème clair et sombre, suivant le réglage système (`theme/colors.js`).

**Règle du système de couleur** : le dégradé sémantique (bleu → tiède → ambre →
orange → rouge) est réservé aux **scores de proximité**. La progression de
campagne est en gris neutre, la monnaie et les indices en ambre. Aucune couleur
ne veut dire deux choses.

---

## Ce qui reste à faire

1. **Relire les 180 mots** de `data/campaign_words.json`.
2. **Réduire le modèle fastText** au vocabulaire jouable.
3. **Play Games** — voir [docs/play-games-setup.md](docs/play-games-setup.md).
   À faire tôt : mal configuré, ça échoue silencieusement et ça ne ressemble pas
   à un bug de code.
4. **Publicité récompensée** — le crédit doit venir du callback serveur du
   réseau publicitaire, jamais du client qui affirme avoir vu la vidéo.
5. **Achats** — Google Play Billing côté app, validation du reçu côté serveur.
6. **Page web de suppression de compte** — accessible sans installer l'app.
7. **Migrations** — `Base.metadata.create_all` suffit au démarrage ; passer à
   Alembic avant la première mise en production.
