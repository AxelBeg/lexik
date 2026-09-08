# Lexik — écrans exportés

Six pages HTML autonomes, une par écran et par thème. Elles s'ouvrent dans
n'importe quel navigateur, sans dépendance ni build : tout le style est en
inline ou dans le `<style>` de la page. Les PNG correspondants sont dans
`png/` en 1× (390 × 844) et 2× (780 × 1688).

```
menu-principal-sombre.html    campagne-sombre.html    partie-sombre.html
menu-principal-clair.html     campagne-clair.html     partie-clair.html
```

Le format est volontairement bête : copie-colle les blocs de markup dont tu as
besoin, les valeurs sont toutes littérales.

---

## Les trois règles du système

Elles comptent plus que les valeurs elles-mêmes. Si une seule saute, l'écran
devient illisible pour le joueur.

**1. La rampe sémantique est réservée aux scores de proximité.** Nulle part
ailleurs. Une barre de progression campagne colorée en orange serait lue comme
un score.

**2. La progression campagne est neutre** — gris, jamais de couleur.

**3. L'ambre est la couleur de la monnaie.** Ampoule, solde, prix d'un indice,
et rien d'autre.

Corollaire : le poids visuel signale **ce qui reste à faire**, jamais ce qui est
acquis. Un niveau terminé s'efface, un niveau à faire ressort.

---

## Rampe sémantique

Cinq arrêts, positions non linéaires — la couleur accélère près de la solution.

| Score | Sombre | Clair |
|---|---|---|
| 0 | `#3f5496` | `#34489a` |
| 40 | `#5f8bb0` | `#47789b` |
| 65 | `#9c9078` | `#86775c` |
| 85 | `#ee8038` | `#d1651c` |
| 100 | `#ff4530` | `#cf2d18` |

Interpoler en oklch ou Lab, pas en sRGB. Le pivot froid/chaud est à **65**.

Attention : une pastille de score posée sur un fond sombre utilise la rampe
sombre **même dans le thème clair** (cas des pastilles de la grille campagne).

---

## Palette d'interface

| Rôle | Sombre | Clair |
|---|---|---|
| Fond | `#0a0c11` | `#f7f6f4` |
| Surface | `#141821` | `#ffffff` |
| Bordure | `#242b39` | `#e4e3df` |
| Bordure forte | `#2a3140` | `#dcdbd7` |
| Texte | `#eceef4` | `#16181d` |
| Texte secondaire | `#737d92` | `#6f7078` |
| Texte tertiaire | `#4c5568` | `#a3a5ad` |
| Progression neutre | `#8b94a8` | `#8b8d96` |
| Monnaie / indices | `#d29a4a` | `#b57a1e` |

---

## Typographie

* **Space Grotesk** — interface et titres, graisses 400 / 500 / 600 / 700
* **JetBrains Mono** — tous les chiffres (scores, compteurs, numéros de niveau)

Le mono n'est pas décoratif : `font-variant-numeric: tabular-nums` garde les
scores alignés en colonne dans la liste des propositions, qui est l'outil de
réflexion principal du joueur.

Prévoir des fallbacks proches en métriques : `'Segoe UI', system-ui` et
`'SFMono-Regular', Consolas`.

---

## Constantes de mise en page

```text
Écran            390 × 844 (iPhone 14/15)
Marges latérales 24px
Haut de page     60px
Rayons           16px cartes · 12-14px boutons · 11px pastilles · 9px lignes
Cible tactile    44px minimum, jamais moins
Pastille niveau  62px, grille 5 colonnes, gap 8px
Ligne de score   38px, gap 4px
```

**Aucune barre d'état ni clavier n'est dessiné.** Le téléphone les affiche
par-dessus ; une fausse barre ferait doublon. Les 60px du haut sont la zone
sûre laissée libre.

---

## Icônes

Toutes en SVG inline, tracé de 1,5 à 1,8px sur une grille 24. Aucun emoji dans
l'interface : ils se rendent différemment selon les OS et cassent le registre
minimaliste.

---

## Logo

Dans `../logo/` : le K au dégradé sémantique et les lettres L E X I en noir,
toutes alignées sur la même ligne de base (sommet à y=17, base à y=987, marge
latérale 15px), donc composables bout à bout.

Rappel pour l'intégration : `background-clip: text` étale le dégradé sur la
boîte de ligne, pas sur le glyphe. Sans `background-size` et
`background-position` calés sur la hauteur de capitale, les extrémités de la
rampe n'atteignent jamais la lettre.
