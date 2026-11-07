# Design system de Paddock Live

Ce document décrit le design **tel qu'il est en production** : **Télémétrie**, le seul design de l'appli et de la
version web depuis la v1.33 (Paddock 2, Broadcast et Classique retirés). Valeurs relevées dans
`public/css/design-v3.css`, `public/css/style.css`, `public/js/util.js`, `public/js/prefs.js` et `shared/colors.js`
(novembre 2026, v1.33 en préparation). Rien n'est inventé. Les **recommandations** (ce qui pourrait changer) sont
regroupées à la fin, dans une partie à part : elles ne sont pas des règles.

Les règles de conception propres à l'appli (quoi faire, quoi éviter) sont dans
[UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md). L'intention de la refonte (pourquoi ces choix) est dans
[refonte/DIRECTION.md](refonte/DIRECTION.md) ; certaines de ses valeurs ont changé à l'implémentation (noms des
jetons, filets, police étroite) : **ce document et le CSS font foi**.

> Si ce document et le CSS se contredisent, **le CSS fait foi** : corriger ce document dans la même PR.

---

## 1. Architecture des styles

L'appli est en **HTML, CSS et JavaScript sans framework** (modules ES dans `public/js/`, composants dans
`public/js/ui/*.js` qui écrivent leur HTML). Ni Tailwind, ni bibliothèque de composants : tout passe par des
**variables CSS** et des classes maison.

Deux feuilles, chargées dans cet ordre par `public/index.html` (et par la version web, `analytics/live-page`) :

| Couche | Fichier | Rôle |
|---|---|---|
| Base + thème **Pitwall** | `style.css` | mise en page, composants, états, animations de base ; contraste renforcé et mode daltonien en fin de fichier. Ses jetons de couleur (`:root[data-theme="pitwall"]`) sont tous redéfinis par Télémétrie |
| Design **Télémétrie** | `design-v3.css` | jetons (couleurs, polices, tailles, espaces, rayons, durées, ombres) et habillage de chaque composant, sous `:root[data-design="v3"]` |

`mini.html` et `overlay.html` chargent les deux mêmes feuilles et posent eux-mêmes `data-design="v3"`.

Attributs posés sur `<html>` (script en tête de chaque page, puis `public/js/prefs.js`) :

| Attribut | Valeurs | Réglage |
|---|---|---|
| `data-theme` | `pitwall` (seule valeur) | — |
| `data-design` | `v3` (seule valeur ; une ancienne préférence `v2`, `classic` ou `broadcast` passe sur `v3`) | — |
| `data-scheme` | `dark`, `light` (résolu depuis `auto` = système) | Réglages → Affichage → Apparence |
| `data-contrast` | `more` (sinon absent) | Réglages → Affichage, ou `prefers-contrast: more` du système |
| `data-cvd` | `on`, `off` (mode daltonien) | Réglages → Affichage |
| `data-motion` | `on`, `off` | Réglages → Affichage (animations de l'interface) |
| `data-notes` | `on`, `off` (explications du programme du week-end) | Réglages → Affichage, lien sous le programme |
| classes `web`, `phone`, `simple`, `overlay`, `float-map`, `float-mini` | version web, téléphone, version simplifiée du téléphone, overlays de streaming (toujours sombres), carte et Mini flottantes | — |

Autres surfaces, avec leurs propres styles : la page web du Studio (`analytics/studio-page/style.css`, mode
créateur), les pages du site (`analytics/home`, `analytics/launch`…). Le site (accueil, guides, pages légales et de
liens : surcouche `analytics/launch/design-v3.css`, `?design=v2` pour sa variante Paddock 2) et le Studio reprennent
les jetons et les polices de Télémétrie.

---

## 2. Identité visuelle

En-tête de `design-v3.css` : *« Un écran de chronométrage mis en page comme un magazine : zones à plat, filets d'un
pixel, couleurs réservées à la course, un seul accent (rouge Paddock) pour ce qui est actif. »*

- **La couleur, c'est la donnée.** L'interface est en graphite (sombre) et blanc cassé (clair). Violet, vert, jaune,
  rouge, les couleurs des pneus et des écuries gardent leur sens F1 et n'ont pas d'autre usage.
- **Un seul accent, rare** : le rouge Paddock `#E10600` marque l'action principale (la Synchro TV, seul bouton rouge
  de l'écran), l'élément actif (onglet, espace, rubrique) et ce qui est en direct. Le focus clavier et les bascules
  allumées sont en ivoire (graphite en clair), pas en rouge.
- **Des zones, pas des cartes** : panneaux à plat sur le fond, filet d'un pixel, aucune ombre ni lueur ni verre ;
  les ombres ne servent qu'aux calques flottants (menus, modales, notifications).
- **Éditorial autour du direct** : titres en Archivo étroit 800 capitales, kickers en JetBrains Mono capitales,
  chiffres d'affichage étroits, beaucoup d'air.
- **Écuries en traits** : la couleur officielle (`--tc`) en trait vertical de 3 px (classement, tableaux) ou en filet
  haut de 3 px (cartes), plus de pastilles blanches.
- **Sombre par défaut**, clair complet : la barre de séance, la barre latérale et la barre du replay suivent
  l'apparence (fond `--bg`). Seuls les overlays de streaming restent toujours sombres.

---

## 3. Couleurs

### 3.1 Surfaces, textes, accent

| Variable | Rôle | Sombre | Clair |
|---|---|---|---|
| `--bg` | fond de page, barres (séance, latérale, replay, bas du téléphone) | `#0B0F15` | `#F3F5F7` |
| `--panel` | zones, cartes, modales | `#10151D` | `#FFFFFF` |
| `--panel-2` | survol, ligne suivie, champs, contrôle segmenté | `#161D27` | `#F7F8FA` |
| `--panel-3` | boutons, menus, notifications, segment choisi | `#1B2430` | `#ECEFF3` |
| `--border` | contour des zones, filet sous les en-têtes | `#222B37` | `#E1E5EA` |
| `--line` | séparateur de lignes de tableau | `#1C242F` | `#E8EBEF` |
| `--line-2` | contour de champ et de contrôle, séparateur marqué | `#2E3946` | `#C9D0D8` |
| `--hover` | survol de ligne | `#161D27` | `#F7F8FA` |
| `--deep` / `--top-1` / `--top-2` | fonds hérités de la base (champs, barre du haut) | `#0B0F15` | `#FFFFFF` |
| `--focus` | ligne suivie (base) | `#161D27` | `#F1F3F6` |
| `--text` | texte principal ; fond des bascules allumées | `#F2F4F5` | `#10151D` |
| `--text-2` | texte secondaire | `#B4BDC8` | `#3D4754` |
| `--muted` | libellés, kickers, aides | `#8A95A3` | `#56606D` |
| `--accent` | rouge Paddock : action principale, actif | `#E10600` | `#E10600` |
| `--accent-2` | survol du rouge | `#C80500` | `#C80500` |
| `--accent-fg` | rouge en texte (étiquette « en direct », « Prochain ») | `#FF6B61` | `#C40500` |
| `--on-accent` | texte sur le rouge | `#FFFFFF` | `#FFFFFF` |
| `--data` | information, série unique | `#53B9D9` | `#136F8F` |
| `--ring` | anneau de focus | `#F2F4F5` | `#10151D` |

### 3.2 Couleurs de la course

Mêmes noms que dans la base, valeurs propres à chaque apparence (en clair, des couleurs de texte lisibles sur blanc).
DIRECTION.md les appelle `--f1-*` ; le CSS garde les noms historiques.

| Variable | Sombre | Clair | Sens |
|---|---|---|---|
| `--purple` | `#B98CFF` | `#6D28D9` | meilleur temps absolu |
| `--green` | `#3DDC84` | `#0A7A45` | meilleur temps personnel, piste verte, place gagnée, mode dépassement |
| `--yellow` | `#FFD43B` | `#8A5A00` | drapeau jaune, secteur sans amélioration |
| `--orange` | `#FFA62B` | `#AD4B00` | avertissement |
| `--sc` | `#FFA62B` | `#AD4B00` | voiture de sécurité |
| `--red` | `#FF5A5F` | `#C42828` | drapeau rouge, place perdue, élimination, erreur |
| `--blue` | `#5AA9FF` | `#1A5CC4` | drapeau bleu, information |

**État de la piste** (`.track-status`, pilule) : normal = fond transparent, contour `--line-2`, point de couleur ;
fonds pleins à valeurs fixes (pareils en clair) : jaune `#FFD43B` / texte `#1A1500`, SC et VSC `#FFA62B` / `#1D1200`,
rouge `#C42828` / blanc ; damier comme la base. Piste sèche : sans couleur (le jaune est réservé au drapeau). Mini :
drapeaux jaune et SC aux mêmes valeurs fixes (en clair, `--yellow` et `--sc` sont des couleurs de texte).

### 3.3 Couleurs des données

- **Écuries** : couleur officielle reçue de la F1 (`TeamColour`), passée en `--tc` sur l'élément. Option « couleurs
  vives » (`VIVID_TEAMS`, `public/js/util.js`). En apparence claire, `onLight()` (`shared/colors.js`) assombrit la
  couleur en gardant sa teinte jusqu'à un contraste d'au moins **3:1** sur blanc.
- **Pneus** (`COMPOUNDS` et `COMPOUND_LIGHT`, `public/js/util.js`) :

  | Gomme | Sombre | Clair |
  |---|---|---|
  | Tendre (S) | `#FF3B3B` | `#DC2626` |
  | Medium (M) | `#FFD12E` | `#C68A00` |
  | Dur (H) | `#F2F2EE` | `#4B5563` |
  | Intermédiaire (I) | `#43B02A` | `#16A34A` |
  | Pluie (W) | `#2F8CFF` | `#2563EB` |
  | Inconnu | `#7A8396` | — |

- **Graphiques** : séries des pilotes en `--tc` ; courbe simple par défaut `#3ea6ff` (en dur dans `charts.js`, voir
  recommandations).

---

## 4. Typographie

### 4.1 Familles (incluses localement, `public/fonts/`, licence SIL OFL)

| Variable | Famille | Fichier | Usage |
|---|---|---|---|
| `--font` | **Archivo** variable (graisse 100–900, largeur 62–125 %) | `archivo-var.woff2` | texte de l'interface, boutons, onglets, titres de lecture |
| `--font-cond` | **Archivo Cond** (Archivo étroit, variable 100–900) | `archivo-cond-var.woff2` | titres (800, capitales), chiffres d'affichage, positions, noms de pilotes |
| `--font-mono` | **JetBrains Mono** variable (400–700) | `jetbrainsmono-var.woff2` | temps, écarts, heures, kickers et en-têtes de colonnes, badges |

Partout : `font-variant-numeric: tabular-nums` (sur `body` et sur `.hstat-value`), `-webkit-font-smoothing:
antialiased`. Corps : `400 14px/1.4 Archivo` (`--fs-md`).

Titillium Web et Saira restent déclarées dans `style.css` (anciens designs) ; Saira Condensed sert encore aux
vignettes de la Course au titre (Saison, `.tr-pic`). Une police déclarée n'est téléchargée que si elle est utilisée.

### 4.2 Échelle

| Jeton | Taille | Usages principaux |
|---|---|---|
| `--fs-2xs` | 11 px | kickers et étiquettes Mono (capitales, `letter-spacing` .08 à .14em), source, méta des actus |
| `--fs-xs` | 12 px | légendes, puces, petits boutons |
| `--fs-sm` | 13 px | texte dense, onglets, titres de panneau, boutons |
| `--fs-md` | 14 px | texte de l'interface, codes pilote du classement |
| `--fs-lg` | 16 px | nom de séance, titres de zone, lecture des articles (interligne 1,6, `max-width: 68ch`) |
| `--fs-xl` | 20 px | titres de modale, de cartes de l'Accueil, sous-titres d'article |
| `--fs-2xl` | 26 px | titre de la prochaine séance, chiffres secondaires, noms d'écurie |
| `--fs-3xl` | 34 px | titres de page (Actu, Replays, Réglages), chiffres des cartes, nom du prochain Grand Prix |
| `--fs-4xl` | 48 px | compte à rebours de la Saison et de « Pas de séance en direct », nom du pilote choisi |

Hors échelle, en production : compte à rebours de l'Accueil en cases `clamp(44px, 5vw, 76px)` (40 px sous 420 px) ;
valeurs de la barre de séance 22 px Archivo Cond 800 (20 px sous 1500 px, 18 px au téléphone) et horloge 18 px Mono 600
(16 px sous 1500 px) ; position du classement 16 px Cond 800 ; écarts 12,5 px et secteurs 11,5 px ; en-têtes de
tableau 10,5 px Mono ; libellés de la barre de séance 10 px Mono (9,5 px au téléphone) ; légendes de la barre latérale
10,5 px ; overlays de streaming 58 px (chiffre), 20 px (nom), 11–17 px.

Rôles :

| Rôle | Style |
|---|---|
| Titre de page | Archivo Cond 800, `--fs-3xl`, capitales, interligne 1 |
| Titre de panneau (`.panel-head h2`) | Archivo Cond 800, `--fs-sm`, capitales, `letter-spacing .08em` |
| Titre de carte, de rubrique | Archivo Cond 800, `--fs-lg` à `--fs-xl`, capitales |
| Kicker, en-tête de colonne, étiquette | JetBrains Mono 500, `--fs-2xs` (10–10,5 px dans les tableaux et la barre de séance), capitales, `.1–.14em`, `--muted` |
| Chiffre d'affichage | Archivo Cond 800, interligne .84 à 1 |
| Temps, écarts, délai | JetBrains Mono 500–600 |

---

## 5. Espacements

Échelle (base 4) : `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 px ;
48 px écrit en clair pour le bas des pages.

Repères :

- Tableau de bord : `.grid` écart 6 px, marge 6 px ; au téléphone, sans marge ni coins.
- En-tête de panneau : hauteur min. 40 px (36 au téléphone, 30 en paysage), `4px 12px 4px 16px`, filet `--border`.
- Barre de séance : hauteur min. 56 px, `4px 16px 4px 20px` (`6px` d'écart et `12px` de côté sous 1280 px) ;
  au téléphone `max(4px, safe-area) 8px 4px`.
- Barre latérale : `--rail-w` **72 px**, boutons 56 × 52 px, écart 2 px.
- Classement : lignes `--tower-row-h` 32 px (28 px en paysage), cellules `2px` sur les côtés.
- Accueil : contenu `max-width: 1320px`, marges `32px 24px 48px` (`20px 16px 40px` au téléphone), cartes `20px`,
  prochaine séance `24px`, écart entre cartes 12 px.
- Saison, Actu, Replays : page `24px 24px 48px`, zones `16px 20px`, cartes d'actu `12px 16px`.

---

## 6. Rayons

| Jeton | Valeur | Pour |
|---|---|---|
| `--r-xs` | 4 px | badges, étiquettes, cases (position des favoris, mode dépassement) |
| `--r-sm` | 6 px | boutons, champs, rubriques de navigation, jours du programme |
| `--r-md` / `--radius` | 10 px | panneaux, cartes (Accueil, Saison, Actu, podiums), menus, notifications |
| `--r-lg` | 16 px | modales, Réglages, palette de commandes |
| `--r-pill` | 999 px | puces, contrôles segmentés, état de la piste, badge de source |

Traits d'écurie et barres fines : 1 à 2 px. Drapeaux : 2 px.

---

## 7. Ombres et profondeur

- **Aucune ombre sur les zones** (`box-shadow: none` sur panneaux et cartes), **aucun `backdrop-filter`**, aucune lueur.
  La profondeur vient des surfaces (`--bg` → `--panel` → `--panel-2` → `--panel-3`) et des filets.
- `--shadow-pop` (menus, listes, bulles, notifications, menu « Outils », menu « Séance ») :
  `0 0 0 1px var(--line-2), 0 12px 32px -12px rgb(0 0 0 / .6)` ; en clair `rgb(16 21 29 / .2)`.
- `--shadow-modal` (modales, Réglages, palette) : `0 0 0 1px var(--line-2), 0 32px 80px -24px rgb(0 0 0 / .75)` ;
  en clair `rgb(16 21 29 / .25)`.
- Fond de modale : `rgb(0 0 0 / .5)`, sans flou.
- Fondus de bord seulement pour les éléments collés qui recouvrent un défilement (outils des en-têtes à onglets,
  vues de la séance au bout de la bande du téléphone).

---

## 8. Composants

### 8.1 Boutons et contrôles

| Classe | Style |
|---|---|
| `.btn` | hauteur min. 32 px, `0 12px`, rayon 6, fond `--panel-3`, filet `--border`, 600 13 px ; survol : filet `--line-2` ; pression `scale(.97)` |
| `.btn.small` | 28 px, `0 10px`, 12 px |
| `.btn-accent` | fond `--accent`, texte `--on-accent`, survol `--accent-2`. **Un seul à l'écran** : la Synchro TV ; ceux de l'Accueil et de « Pas de séance en direct » sont affichés en secondaire |
| Bascule allumée (`.btn.on`, `.rp-speed.on`, pause du délai, filtre du fil choisi) | **inversée** : fond `--text`, texte `--bg` (pas de couleur) |
| `.icon-btn` | rayon 6, `--text-2` ; survol fond `--panel-2` |
| Délai TV `.delay` | un seul contrôle à filet `--line-2`, rayon 6 : valeur (Mono 600 14 px), ±, pause, préréglage (réduit à sa flèche sous 1440 px), Synchro TV rouge collée à droite |
| Interrupteurs `.toggle` | `accent-color: --text` |

Boutons des en-têtes de panneau : 24 px minimum. Au doigt (`pointer: coarse`) : zone tactile d'au moins 32 px autour
des petits éléments restants (`.tag.battle`, `.sz-png`, `button.linkish`).

### 8.2 Zones, onglets, cartes

- `.panel` : fond `--panel`, filet `--border`, rayon 10 px, sans ombre. `.panel-head` : transparent, filet bas
  `--border` ; titre `h2` Archivo Cond 800 13 px capitales. L'aide du classement est masquée (déjà dans Télémétrie).
- **Onglets** (`.tab`, onglets des en-têtes) : 32 px, texte `--muted` 600 13 px, survol `--text-2` ; actif `--text`
  souligné d'un **trait `--accent` de 2 px** (à 2 px du bas). En-têtes à onglets sur une ligne qui défilent (molette,
  glisser, clavier), outils du panneau collés à droite derrière un fondu.
- **Contrôles segmentés** (`.tab-seg`, `.sv-seg`) : pilule `--panel-2` à filet `--border`, segment choisi `--panel-3`
  + texte `--text` (+ filet `--line-2` pour les vues de la séance).
- **Vues de la séance** (`.sess-views`, en tête du Direct : Tableau de bord · Résultats · Résumé · Commentaires) :
  segments de 30 px ; au téléphone, au bout de la bande d'onglets, réduites à un bouton « Séance » qui ouvre un menu
  (choix marqué d'un trait `--accent` à gauche).
- **Cartes** (Accueil `.hm-card`, Saison `.sz-box`, actus `.nw-card`, podium `.rp-pod`, livrées `.sz-liv`) : fond
  `--panel`, filet `--border`, rayon 10. Carte de statistique `.sz-card` : **sans filet**, kicker Mono, chiffre
  `.sz-big` Cond 800 34 px (26 px dans `.sz-kpi` et au téléphone).
- **Cartes d'écurie et de pilote** : filet haut de 3 px `--tc` (écurie, bilan, podium) ou trait gauche
  `inset 3px 0 0 --tc` (pilote) ; numéro à la couleur de l'écurie ; carte choisie : fond `--panel-2` + filet `--text`.
- **Fil de course** (`.rf-*`) : puces de 26 px (`--panel-2`, filet `--border`, 600 12 px), choisie inversée ;
  étiquettes Mono 11 px rayon 4 ; radio en cours de lecture : fond `--panel-2` + trait `--text` à gauche.
- **Permis à points** (Saison → Sanctions, `style.css`) `.sz-lic` : 12 cases de 11 × 16 px (8 × 14 px sous 520 px),
  écart 2 px et 3 px toutes les 4 cases, rayon 2 px ; case vide `--panel-3`, case de point `--tc` ; 8 points et plus :
  cases vides cerclées de `--orange` ; 12 : cases pleines `--red`.

### 8.3 Accueil

- Tableau `.hm-board` : zones nommées sur **4 colonnes** à partir de 1200 px (compte à rebours sur deux rangées à côté
  du calendrier, de la dernière séance et de deux chiffres ; classements à gauche ; actus en bandeau de 4 titres),
  **2 colonnes** de 600 à 1199 px, 1 en dessous (ordre du code) ; écart 12 px.
- Prochaine séance : fond `--panel` (pas de rouge), titre Cond 800 26 px, **compte à rebours en cases** `.hm-cd`
  (jours, heures, minutes, secondes ; filet `--line-2` entre les cases, légendes Mono 11 px), chiffres qui roulent.
  Séance en cours : filet `color-mix(--accent 55 %)`, étiquette en `--accent-fg`.
- Étiquettes de carte `.hm-tag` et manches `.hm-ctx` : Mono 11 px capitales `--muted` (pas de pastille). Chiffre
  `.hm-big` Cond 800 34 px, tendance `.hm-trend` Mono 12 px.
- Carte qui ouvre sa rubrique de la Saison `.hm-link` : bouton `.hm-hit` sur toute la carte, flèche `.hm-open` 14 px.
- Favoris : lignes de 44 px à filet `--line`, position en case 34 × 24 inversée, portrait rond de 30 px.
- Classements : lignes de 32 px (36 au doigt), position Cond 800 16 px, écurie en trait de 3 × 16 px.
- Squelettes `.hm-sk` : fond `--panel-2`, rayon 4, pulsation d'opacité 1,2 s (si animations).

### 8.4 Navigation

- **Ordinateur (> 900 px)** : barre latérale `.rail` fixe, `--rail-w` 72 px, fond `--bg`, filet droit `--border`.
  Logo 34 px. Boutons `.rail-btn` 56 × 52 px, icône à trait 1,6, légende Archivo 600 10,5 px ; survol et actif : fond
  `--panel-2` ; actif : **trait `--accent` de 2 px** à gauche. Les cinq espaces (Accueil, Direct, Saison, Actu, Replays),
  puis en bas Recherche (palette de commandes), Fenêtres, Apparence, Réglages ; pas de menu « Plus ».
- **Barre de séance** `.topbar` : fond `--bg`, filet bas `--border`, hauteur min. 56 px. Séance (drapeau à rayon 2,
  nom Cond 800 16 px capitales, sous-titre Mono 11 px), état de la piste, tour (barre d'avancement de 2 px `--text`),
  temps restant (Mono), heure du circuit, revêtement (sec : sans couleur ; humide, mouillé), outils, délai TV, source (pilule Mono 11 px, point sans
  pulsation), notifications. Paliers : sous **1600 px** les outils passent dans un menu « Outils » (point rouge s'il y a
  de nouveaux documents FIA) ; sous **1440 px** le préréglage du délai se réduit à sa flèche ; sous **1280 px** écarts
  resserrés, « Outils » en icône, nom de séance 96–150 px. À partir de 1180 px, une ligne tant qu'elle tient, sinon deux
  (jamais de débordement), le nom de la séance se tronquant d'abord. Hors séance : pas de « Tours ».
- **Téléphone et tablette (≤ 900 px)** : barre du bas `.mob-nav` (Accueil, Direct, Saison, Actu, Replays), fond `--bg`,
  filet haut ; actif : texte `--text` + trait `--accent` de 2 px en haut. Réglages dans la barre de séance. Bande
  d'onglets des panneaux `.mob-panels` (actif souligné `--accent`). Un panneau à la fois ; **deux zones** en tablette
  portrait (classement 60 % en haut) et en téléphone paysage (côte à côte, rail de 56 px à gauche à la place de la
  barre du bas).
- Navigations des espaces (`#szNav`, `#nwNav`, `#rvNav`) : rubriques 13 px `--text-2`, rayon 6 ; actif : fond
  `--panel-2`, texte `--text` 600, trait `--accent` de 2 px à gauche. Saison : 5 groupes repliables (Mono 11 px
  capitales, chevron qui tourne).
- **Palette de commandes** `.cmdk` (Ctrl + K) : modale `--panel`, rayon 16, `--shadow-modal`, champ 16 px, groupes et
  raccourcis en Mono 11 px, choix `--panel-2`.

### 8.5 Tableaux et graphiques

- **Classement** `.tower` : en-tête collant `--panel`, Mono 500 10,5 px capitales `.1em` `--muted`, filet `--border` ;
  lignes `--tower-row-h` 32 px, filet `--line`, survol `--hover` (souris seulement) ; position Cond 800 16 px sans case ;
  code pilote Archivo 700 14 px ; écurie : **trait de 3 × 18 px** `--tc` ; mode dépassement affiché seulement allumé
  (fond `--green` 16 %) ; **ligne suivie et duel** : fond `--panel-2` + filet `--text` de 2 px à gauche (sans accent).
  Au téléphone : bouton Colonnes en icône dans le coin de l'en-tête.
- Tableaux de la Saison `.sz-table` : en-têtes Mono 10,5 px capitales, filets `--line`, liens soulignés au survol,
  écuries en traits de 3 × 16 px.
- **Graphiques** : SVG dessinés à la main (`public/js/ui/charts.js` et vues d'analyse), sans bibliothèque. Courbe
  simple : marges 40/10/10/20 px, 130 px de haut, grille discrète, ligne de zéro, réticule et infobulle au survol,
  graduations « propres » (pas de 1, 2, 2,5, 5, 10) ; `role="img"` sur les SVG. État vide : `.note`.
- **Carte** : MapLibre (2D) et Three.js (3D), dans `public/vendor/` ; pilotes en `--tc`.

### 8.6 Modales, menus, notifications

- `.modal` (`<dialog>`) : fond `--panel`, rayon 16, sans filet, `--shadow-modal` ; largeur `min(560px, 100vw − 32px)`,
  `.wide` `min(720px, …)` ; en-tête `--panel`, titre Cond 800 20 px capitales.
- Réglages : rubriques à gauche sur `--bg` (active : fond `--panel-2`, trait `--accent`), recherche `--panel-2`,
  blocs `--panel` rayon 10, titres de bloc Archivo 700 14 px.
- Menus (`.lpop-menu`, `.csel-pop`, `.map-layers-menu`, `.tb-pop`) : `--panel-3`, rayon 10, `--shadow-pop` ; au
  téléphone, fixés au-dessus de la barre du bas, `max-height: 60dvh`.
- `.toast` : fixe, centré à 18 px du bas, `--panel-3`, rayon 10, `--shadow-pop`, Archivo 500.

### 8.7 Overlays de streaming et fenêtre Mini

- `overlay.html` (`?w=banner|laps|countdown|podium|telemetry|rcm|gap|weather|fastest`) et `mini.html` sont en
  Télémétrie ; overlays toujours en sombre (aussi `mini.html?overlay=1`).
- `.ov-card` : fond `--panel` à `--ov-bg` (85 % par défaut, réglable), filet 1 px `--line-2`, rayon 10, filet d'accent
  de 3 px à gauche (`--accent`) ; `.ov-label` Mono 12 px `.14em` `--muted` ; `.ov-big` Cond 800 58 px ; place `.ov-pos`
  en case `--text` sur `--bg`, Cond 800 17 px ; nom de famille Cond 800 20 px ; écurie Mono 11 px capitales ; valeurs
  Mono 16 px `--text-2` ; meilleur tour `--purple`. Direction de course : étiquettes `.ov-tag` Mono 11 px de 88 px au
  moins, couleur du sens du message.
- Mini : chiffres en Mono, pilotes en Archivo Cond 700 15 px.

---

## 9. États interactifs

| État | Traitement |
|---|---|
| Survol | fond `--panel-2` (boutons d'icône, barre latérale, rubriques) ou `--hover` (lignes, souris seulement, `@media (hover: hover)`) ; filet `--line-2` (boutons, cartes) ; texte `--muted` → `--text` |
| Pression | `transform: scale(.97)` en 80 ms (boutons, segments) |
| Actif / choisi | trait `--accent` de 2 px (onglet, barre latérale, barre du bas, rubrique, jour en cours) ; segment `--panel-3` ; bascule inversée (`--text` sur `--bg`) |
| Focus clavier | **anneau 2 px `--ring` décalé de 2 px sur tout `:focus-visible`** (1 px pour les champs et les listes) ; recherche des Réglages : `box-shadow 0 0 0 2px --ring` |
| Désactivé | opacité .35, `cursor: default` (barre latérale : Résumé, Mini et Résultats grisés sans séance) |
| Suivi / duel | ligne `--panel-2` + filet `--text` à gauche |
| Hors course | opacité .45 |
| Chargement | squelettes `.hm-sk` (pulsation d'opacité 1,2 s) ; ailleurs texte d'attente dans `.note` ; écoute de la synchro audio : point qui pulse (`as-pulse`) |
| Vide | `.note` (`--muted`) avec une phrase qui dit pourquoi et quoi faire |
| Erreur | message en `.note` ou `.toast` ; `--red` réservé aux vraies alertes |
| Données nouvelles | `flash`, `tower-up` / `tower-down` (fond qui s'éteint), `card-arrive`, `badge-pop`, chiffres qui roulent (`digit-in` / `digit-out`) |

---

## 10. Animations

- **Durées** : `--dur-1` 80 ms (pression) · `--dur-2` 140 ms (survol, bascules) · `--dur-3` 220 ms (menus, onglets,
  changement d'espace) · `--dur-4` 320 ms (modales, cartes de l'Accueil).
- **Courbes** : `--ease-out` `cubic-bezier(.16, 1, .3, 1)` ; `--ease-inout` `cubic-bezier(.65, 0, .35, 1)` ;
  `--ease-spring` = `--ease-out` (**pas de rebond** en Télémétrie).
- **Entrées** : `v3-pop` (fondu + 4 px + échelle .98) pour les menus, le menu « Outils », le menu « Séance », les
  modales et la palette ; `v3-view` (fondu + 6 px) pour les espaces plein écran ; cartes de l'Accueil en cascade
  (`rise-in`, 30 ms d'écart, 150 ms au plus). La base garde ses entrées (`pane-in`, `modal-in`, `toast-in`, `view-in`,
  `line-draw`, `bar-grow`…) et l'arrivée en cascade des panneaux au démarrage (`body.booting`).
- **Sens** : pulsation des drapeaux (`pulse`), chiffres qui roulent, gains et pertes de places ; plus de pulsation
  ni de lueur sur le point de source.
- **Interrupteurs** : toutes les animations de Télémétrie sont dans `@media (prefers-reduced-motion: no-preference)`
  et `:not([data-motion="off"])` ; `data-motion="off"` met aussi toutes les durées à 0 (`style.css`).

---

## 11. Responsive

Point de rupture principal : **900 px** (`max-width: 900px` / `min-width: 901px`) = bascule téléphone et tablette ↔
ordinateur (barre du bas, un panneau à la fois).

| Largeur | Ce qui change |
|---|---|
| ≥ 1600 px | barre de séance complète (outils avec leur nom) |
| 1500 px | chiffres de la barre de séance plus petits (20 px, horloge 16 px) |
| < 1600 px | outils dans le menu « Outils » |
| < 1440 px | préréglage du délai réduit à sa flèche |
| < 1280 px | barre de séance resserrée, « Outils » en icône |
| ≥ 1200 px | Accueil sur 4 colonnes |
| ≥ 1180 px | barre de séance : une ligne tant qu'elle tient, sinon deux |
| ≤ 900 px | mise en page téléphone et tablette : barre du bas, bande d'onglets, barre de séance sur deux lignes au téléphone |
| 600–900 px | tablette : barre de séance et barre du replay sur une ligne ; en portrait, deux zones (classement 60 %) ; Accueil sur 2 colonnes |
| < 600 px | téléphone : vues de la séance dans un menu « Séance », replay en mini-lecteur de 56 px avec tiroir |
| ≤ 420 px | compte à rebours de l'Accueil resserré (40 px) |
| Paysage peu haut (≤ 500 px) | rail de 56 px à gauche, deux zones côte à côte, lignes du classement de 28 px, barres resserrées |

Autres : `env(safe-area-inset-*)` (encoche, barre d'accueil), `100dvh`, `viewport-fit=cover`,
`@media (hover: hover)` pour les survols, `@media (pointer: coarse)` pour les cibles tactiles. Les règles de base de
`style.css` (grilles de la Saison sous 1250 / 1100 / 1000 / 760 / 640 px, classement sous 480 / 420 / 400 / 380 /
340 px) s'appliquent aussi.

---

## 12. Accessibilité

- **Contrastes** (WCAG, calculés sur les jetons) :

  | Texte | sur `--bg` · `--panel` · `--panel-3`, sombre | clair |
  |---|---|---|
  | `--text` | 17,4 · 16,6 · 14,2 | 16,8 · 18,3 · 15,9 |
  | `--text-2` | 10,1 · 9,6 · 8,2 | 8,6 · 9,4 · 8,2 |
  | `--muted` | 6,3 · 6,0 · 5,1 | 5,8 · 6,4 · 5,5 |
  | `--accent-fg` | 6,9 · 6,6 · 5,6 | 5,7 · 6,2 · 5,4 |
  | `--data` | 8,5 · 8,1 · 6,9 | 5,2 · 5,7 · 4,9 |
  | `--purple` | 7,6 · 7,2 · 6,2 | 6,5 · 7,1 · 6,2 |
  | `--green` | 10,8 · 10,3 · 8,8 | 4,9 · 5,4 · 4,7 |
  | `--yellow` | 13,5 · 12,8 · 11,0 | 5,4 · 5,9 · 5,1 |
  | `--orange` / `--sc` | 9,8 · 9,4 · 8,0 | 5,1 · 5,6 · 4,8 |
  | `--red` | 6,3 · 6,0 · 5,1 | 5,2 · 5,7 · 4,9 |
  | `--blue` | 7,8 · 7,5 · 6,4 | 5,7 · 6,2 · 5,4 |

  Blanc sur `--accent` : 5,0:1 (survol `--accent-2` : 6,0:1). État de la piste : jaune 12,8:1, SC 9,4:1, rouge 5,7:1.
  Tous les textes passent **4,5:1** sur toutes les surfaces de leur apparence. Filets : `--line-2` 1,3 à 1,6:1,
  `--border` 1,1 à 1,3:1 (voir recommandations).
- **Focus** visible partout (`:focus-visible`, anneau `--ring`), aussi sur les listes et les cartes de pilote et
  d'écurie.
- **Contraste renforcé** (`<html data-contrast="more">`, fin de `style.css`, `:root:root`, devant les jetons de
  Télémétrie) :

  | Variable | Sombre | Clair |
  |---|---|---|
  | `--text` | `#FFFFFF` | `#000000` |
  | `--text-2` | `#E3E8EE` | `#1C232D` |
  | `--muted` | `#C3CBD5` | `#36404C` |
  | `--line-2` | `#7D8896` | `#5A6470` |
  | `--border` | `#5C6878` | `#808A96` |
  | `--line` | `#414B58` | `#B5BDC7` |

- **Mode daltonien** (`<html data-cvd="on">`, fin de `style.css`) : violet (meilleur absolu) souligné d'un trait plein
  de 2 px, vert (record personnel) en pointillés ; mini-secteurs de hauteur 100 % (violet), 67 % (vert), 33 % (jaune),
  stand en tirets ; sur la carte, mini-secteurs du pilote suivi en tirets et en points ; drapeaux `.rcm-flag` à motifs
  (vert rayé, rouge barré, bleu à diagonale, safety car à pois) ; lettre du pneu dans les relais et l'historique.
- **Taille de l'interface** (Réglages → Affichage → Général) : zoom de la page entière, jamais le `zoom` CSS. Appli de
  bureau : `webContents.setZoomFactor`, 90 à 200 % (`desktop/main.cjs`) ; navigateur au doigt : balise viewport
  `initial-scale`, 90 à 150 % (`prefs.textScale`). À 150 %, un téléphone de 390 px a une page de 260 px : rien ne doit
  déborder.
- **Cibles tactiles** : barre du bas 48 px (40 en paysage), favoris 32 px, boutons d'en-tête 24 px minimum, zone de
  32 px autour des petits éléments, barre latérale 56 × 52 px.
- Animations : `prefers-reduced-motion` et `data-motion`.
- `index.html` : 128 `aria-hidden` (icônes décoratives), 37 `aria-label`, 5 `aria-expanded`, 1 `aria-pressed` ;
  graphiques SVG en `role="img"` (`charts.js`, Saison, Accueil).

---

## 13. Recommandations (non appliquées — à valider avant tout changement)

Ces points sont des pistes, **pas des règles en production**.

1. **Couleur des courbes** : `charts.js` dessine la courbe simple en `#3ea6ff` écrit en dur ; DIRECTION.md prévoit
   `--data` (`#53B9D9` sombre, `#136F8F` clair), qui suivrait l'apparence claire.
2. **Tailles sous 11 px** : libellés de la barre de séance (10 px, 9,5 px au téléphone), étiquettes du classement et
   des actus (10 px), en-têtes de tableau et légendes de la barre latérale (10,5 px), étiquettes de la Mini (9,5 px).
   DIRECTION.md visait 11 px minimum.
3. **Filets des contrôles** : `--line-2` (contour du délai TV, des champs, des puces) fait 1,3 à 1,6:1 contre son fond.
   WCAG 1.4.11 demande 3:1 pour la limite d'un contrôle qu'on ne reconnaît pas autrement ; le contraste renforcé y
   répond (5,1 à 5,7:1), pas l'affichage par défaut.
4. **Polices des anciens designs** : Titillium Web (4 fichiers) et Saira (variable) restent déclarées dans `style.css`,
   et Saira Condensed sert encore à `.tr-pic` (Course au titre, Saison). Passer `.tr-pic` en `--font-cond` permettrait de
   retirer ces déclarations et leurs fichiers.
5. **Jetons hérités** : `--deep`, `--top-1`, `--top-2` et `--focus` ne servent plus qu'à la base ; les noms de
   DIRECTION.md (`--surface`, `--line-strong`, `--f1-*`) n'ont pas été repris. Aligner l'un sur l'autre éviterait de
   chercher deux noms pour la même couleur.
6. **Barre de séance en espagnol et en italien pendant une séance** : relevé dans #454 (replay chargé) : de 1600 à
   1800 px, elle passe sur deux lignes et le nom de la séance est très réduit. Hors séance, elle tient sur une ligne
   de 1280 à 1920 px dans les quatre langues (mesuré en v1.33) ; à vérifier en séance.
