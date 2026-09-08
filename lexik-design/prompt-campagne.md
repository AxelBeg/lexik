# Lexik — Structure de la campagne

> Ce document remplace les sections **14 à 17** du prompt de cadrage initial.
> Les sections 1 à 13 (concept, UX, feedback visuel, historique, indices, mode
> quotidien, partage, série) et 18 à 24 restent valables telles quelles.
> Les changements par rapport à la première version sont listés en annexe.

---

## 14. Mode campagne — principe

En plus du mot du jour, le jeu possède un mode campagne : une réserve de mots
que le joueur avance à son rythme, sans contrainte de calendrier.

Un **niveau = un mot secret à trouver**. La boucle de jeu est exactement celle
du quotidien : le joueur propose des mots, reçoit un score de proximité,
construit sa carte sémantique, peut acheter des indices. Rien de nouveau à
apprendre en passant d'un mode à l'autre.

La campagne ne doit **pas** utiliser de thèmes explicites comme nom de niveau.

À éviter absolument :

```text
Niveau 1 — Animaux
Niveau 2 — Nourriture
```

Cela révélerait le champ sémantique du mot et détruirait le puzzle.

Les niveaux n'ont donc **aucun nom** : uniquement un numéro.

---

## 15. Structure

```text
6 planètes × 30 niveaux = 180 niveaux = 180 mots
```

Les planètes servent uniquement de **marqueurs de progression**. Elles ne
portent aucune information sur le contenu sémantique des mots qu'elles
contiennent.

```text
🌍 TERRE      niveaux 1 à 30
🔴 MARS       niveaux 1 à 30
🟠 JUPITER    niveaux 1 à 30
🪐 SATURNE    niveaux 1 à 30
🔵 URANUS     niveaux 1 à 30
🔵 NEPTUNE    niveaux 1 à 30
```

À l'intérieur d'une planète, les niveaux sont simplement numérotés `01` à `30`.

---

## 16. Règle d'accès — le point le plus important

**Tous les niveaux d'une planète débloquée sont jouables immédiatement, dans
n'importe quel ordre.**

Il n'y a **aucun déverrouillage séquentiel à l'intérieur d'une planète**. Un
joueur bloqué sur le niveau 7 peut jouer le 18, revenir au 7 plus tard, sauter
au 25. C'est délibéré : un mot sémantiquement difficile ne doit jamais devenir
un mur qui arrête la progression.

Le seul verrouillage est **entre les planètes** :

```text
25 / 30 niveaux terminés sur une planète → planète suivante débloquée
```

Les 5 niveaux restants ne sont pas perdus : ils restent jouables indéfiniment,
et les terminer donne la planète complète.

```text
25 / 30  → planète validée, suivante débloquée
30 / 30  → planète parfaite
```

---

## 17. État d'un niveau

Un niveau a exactement **deux états** :

```text
TERMINÉ       le mot a été trouvé (score 100)
NON TERMINÉ   le mot n'a pas encore été trouvé
```

Il n'y a pas d'état « en cours » ni d'état « verrouillé » à l'intérieur d'une
planète ouverte.

Un niveau non terminé peut néanmoins avoir déjà été tenté. Dans ce cas le
serveur conserve et renvoie le **meilleur score de proximité atteint** sur ce
niveau. Cette valeur est affichée sur la grille de sélection.

Trois situations se distinguent donc à l'écran, sans jamais afficher de texte
explicatif :

| Situation | Ce que voit le joueur |
|---|---|
| Terminé | une coche |
| Tenté, non terminé | le meilleur score atteint, coloré selon la rampe sémantique |
| Jamais tenté | rien sous le numéro |

**Ne pas afficher le nombre de tentatives dans la grille.** Sur un niveau non
terminé, ce chiffre ne dit que « tu as échoué N fois » : il décourage, là où le
meilleur score encourage (« j'étais à 93, je reprends »). Le nombre d'essais a
sa place sur l'écran de victoire du niveau, où il devient une performance, et
éventuellement en agrégat sur l'en-tête de la planète.

---

## 17 bis. Difficulté

La difficulté ne vient **pas** de thèmes différents mais de la **difficulté
sémantique** du mot à trouver, et elle croît de planète en planète.

Premières planètes :

* associations directes et concrètes ;
* voisinage sémantique dense et cohérent ;
* les scores donnent rapidement une direction claire.

Planètes tardives :

* mots abstraits ;
* mots polysémiques, dont le voisinage part dans plusieurs directions ;
* voisinages sémantiques clairsemés, où les scores progressent lentement ;
* solutions difficiles à conceptualiser même en étant proche.

Le joueur doit progressivement devenir meilleur au jeu lui-même, pas
simplement avancer.

---

## 17 ter. Contrat serveur

Le serveur reste la source de vérité. Le client ne reçoit jamais le mot secret
d'un niveau avant sa résolution, ni la liste des mots d'une planète.

**Lire l'état de la campagne :**

```http
GET /api/campaign
```

```json
{
  "planets": [
    {
      "id": "terre",
      "order": 1,
      "unlocked": true,
      "completedCount": 12,
      "levels": [
        { "n": 1,  "completed": true,  "bestScore": null },
        { "n": 4,  "completed": false, "bestScore": 87 },
        { "n": 15, "completed": false, "bestScore": null }
      ]
    },
    {
      "id": "mars",
      "order": 2,
      "unlocked": false,
      "unlockRequirement": { "planet": "terre", "completed": 25, "of": 30 }
    }
  ]
}
```

`bestScore` vaut `null` si le niveau n'a jamais été tenté. Sur un niveau
terminé il n'est pas affiché (il vaudrait 100).

**Démarrer ou reprendre un niveau :**

```http
POST /api/campaign/{planetId}/{levelNumber}/start
```

Le serveur renvoie un `gameId` et rejoue l'historique des propositions déjà
faites sur ce niveau, pour que le joueur retrouve sa carte sémantique.

**Proposer un mot / demander un indice :** exactement les mêmes routes que le
quotidien (`/guess`, `/hint`), avec le `gameId` du niveau.

Le serveur valide et persiste, par niveau et par joueur :

```text
statut (terminé ou non)
meilleur score atteint
historique des propositions
nombre d'essais
indices utilisés
```

Le déblocage d'une planète est **recalculé côté serveur**, jamais déduit par le
client.

---

## Annexe — ce qui a changé

| | Version initiale | Version actuelle |
|---|---|---|
| Structure | 6 planètes × 10 niveaux × 30 mots | 6 planètes × 30 niveaux |
| Total | 1800 mots | 180 mots |
| Un niveau contient | 30 mots | 1 mot |
| Nom des niveaux | abstraits (Écho, Vertige…) | aucun, numéro seul |
| Accès aux niveaux | non précisé | tous ouverts dans une planète débloquée |
| Seuil 25/30 | mots trouvés dans un niveau | niveaux terminés dans une planète |

**Conséquence à assumer :** avec 180 mots et 30 à 60 minutes par partie, la
campagne représente environ 90 à 180 heures de jeu. C'est confortable, mais
finissable. Le mode quotidien reste donc la boucle de rétention longue ; la
campagne est le réservoir de contenu qui retient le joueur entre deux mots du
jour et pendant ses premières semaines.
