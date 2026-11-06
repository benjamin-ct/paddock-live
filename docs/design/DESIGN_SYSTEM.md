# Design system de Paddock Live

Ce document décrit le design **tel qu'il est en production** (relevé dans `public/css/style.css`,
`public/css/broadcast.css`, `public/css/design-v2.css`, `public/js/util.js`, `shared/colors.js`, novembre 2026,
v1.32 en préparation). Les valeurs viennent du code, rien n'est inventé. Les **recommandations** (ce qui pourrait
changer) sont regroupées à la fin, dans une partie à part : elles ne sont pas des règles.

Les règles de conception propres à l'appli (quoi faire, quoi éviter) sont dans
[UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md).

> Si ce document et le CSS se contredisent, **le CSS fait foi** : corriger ce document dans la même PR.

> **Depuis la v1.32 : Télémétrie (`data-design="v3"`, `public/css/design-v3.css`) est le design par défaut de
> l'appli.** Ses valeurs en production (couleurs sombre et clair, Archivo et JetBrains Mono, échelles, rayons,
> composants, mouvement, navigation) sont dans [refonte/DIRECTION.md](refonte/DIRECTION.md) §2 à §9. Ce document
> décrit aussi Paddock 2 (au choix dans l'appli) et Classique. Broadcast n'est plus proposé :
> `broadcast.css` reste l'habillage de base de Paddock 2.

---

## 1. Architecture des styles

L'appli est en **HTML, CSS et JavaScript sans framework** (modules ES dans `public/js/`, composants dans
`public/js/ui/*.js` qui écrivent leur HTML). Ni Tailwind, ni bibliothèque de composants : tout passe par des
**variables CSS** et des classes maison.

Trois feuilles, chargées dans cet ordre par `public/index.html` :

| Couche | Fichier | Active quand | Rôle |
|---|---|---|---|
| Base + thème **Pitwall** | `style.css` | toujours (`<html data-theme="pitwall">`, forcé par `prefs.js`) | mise en page, composants, thème « Pitwall moderne » (section à partir de la ligne ~2484) |
| Habillage **Broadcast** | `broadcast.css` | design `v2` (la feuille est coupée en `classic` et en `v3` ; le design Broadcast seul n'est plus proposé depuis la v1.32) | habillage TV : barre du haut toujours sombre, étiquettes rouges, chiffres condensés |
| Design **Paddock 2** | `design-v2.css` | `<html data-design="v2">` (défaut de la v1.30 à la v1.31, et de la version web jusqu'à la v1.32) | verre dépoli, bleu nuit éclairé, titres condensés italiques, lueurs |
| Design **Télémétrie** | `design-v3.css` | `<html data-design="v3">` (**par défaut dans l'appli depuis la v1.32** ; `broadcast.css` coupé) | zones à plat, filets d'un pixel, Archivo, rouge réservé à ce qui est actif |

Attributs posés sur `<html>` (script en tête de `index.html`, puis `public/js/prefs.js`) :

| Attribut | Valeurs | Réglage |
|---|---|---|
| `data-theme` | `pitwall` (seule valeur) | — |
| `data-design` | `v3` (défaut de l'appli et de la version web), `v2`, `classic` | Réglages → Apparence → Design |
| `data-scheme` | `dark`, `light` (résolu depuis `auto` = système) | Réglages → Apparence |
| `data-motion` | `on`, `off` | Réglages → Affichage (animations) |
| classes `web`, `overlay`, `float-map` | version web, overlays de streaming (toujours sombres), carte flottante | — |

**Le design de référence pour tout nouveau travail est Télémétrie (`v3`), en sombre et en clair** (voir refonte/DIRECTION.md). Paddock 2 et Classique
doivent rester lisibles (pas cassés), sans recevoir forcément les nouveaux effets.

Autres surfaces, avec leurs propres styles : `public/mini.html` (fenêtre Mini, `body.mini-body`),
`public/overlay.html` (overlays OBS), la page web du Studio (`analytics/studio-page/style.css`, mode créateur), les
pages du site (`analytics/home`, `analytics/launch`, `analytics/live-page`…). Depuis la v1.32, le site (accueil, guides,
pages légales et de liens : surcouche `analytics/launch/design-v3.css`, `?design=v2` pour Paddock 2) et le Studio
reprennent aussi les jetons et les polices de Télémétrie.

---

## 2. Identité visuelle

Commentaire d'en-tête de `design-v2.css` : *« Même ADN (bleu nuit, rouge F1, Titillium Web et Saira Condensed), en
plus riche : fond bleu nuit éclairé de lueurs, panneaux en verre dépoli à grands coins arrondis et filet fin, titres
et chiffres condensés en italique, lueurs aux couleurs des écuries derrière les portraits et les logos, barre du bas
flottante en verre sur téléphone. »*

Les piliers, communs aux trois designs :

- **Un mur des stands** (« pitwall ») : tableau de bord dense, données en direct, chiffres alignés.
- **Rouge F1** (`#E10600`) comme seul accent fort : direct, élément choisi, action principale, alertes.
- **Habillage TV** : barre du haut sombre comme une retransmission, position du classement dans une case, chiffres
  condensés.
- **Couleurs officielles des écuries** (`--tc`) pour identifier les pilotes partout (classement, carte, graphiques).
- **Sombre d'abord** ; le clair est complet et soigné, mais les overlays de streaming restent toujours sombres.

---

## 3. Couleurs

### 3.1 Jetons de surface et de texte (valeurs effectives par design)

Les composants utilisent les **mêmes noms de variables** ; chaque design leur donne ses valeurs.

| Variable | Rôle | Paddock 2 sombre | Paddock 2 clair | Broadcast sombre | Broadcast clair | Classique sombre |
|---|---|---|---|---|---|---|
| `--bg` | fond de page | `#030814` | `#EEF2F8` | `#020817` | `#EEF0F4` | `#07080A` |
| `--panel` | panneau, carte | `#0B1427` | `#FFFFFF` | `#0B1324` | `#FFFFFF` | `#0E1116` |
| `--panel-2` | en-tête de panneau, zone secondaire | `#111D35` | `#F4F6FA` | `#111C31` | `#F4F5F8` | `#15191F` |
| `--panel-3` | bouton, onglet actif, puce | `#1A2A4A` | `#E8ECF3` | `#1A2741` | `#E9ECF1` | `#1C2028` |
| `--border` | contour de panneau | `rgba(148,163,184,.14)` | `rgba(15,23,42,.08)` | `#1E293B` | `rgba(10,12,20,.09)` | `#1C2028` |
| `--line` | séparateur de lignes | `rgba(148,163,184,.08)` | `rgba(15,23,42,.06)` | `rgba(148,163,184,.10)` | `rgba(10,12,20,.07)` | `#151920` |
| `--line-2` | séparateur marqué, contour de bouton | `rgba(148,163,184,.22)` | `rgba(15,23,42,.14)` | `#334155` | `rgba(10,12,20,.16)` | `#2E3440` |
| `--hover` | survol de ligne | `rgba(148,163,184,.07)` | `rgba(15,23,42,.04)` | `#111C31` | `#F4F5F8` | `#15191F` |
| `--focus` | ligne suivie / duel | `rgba(59,130,246,.12)` | — | — | — | `rgba(225,6,0,.10)` |
| `--text` | texte principal | `#F8FAFC` | `#0B1220` | `#F8FAFC` | `#0B0D12` | `#F1F3F6` |
| `--text-2` | texte secondaire | `#CBD5E1` | `#3D4A60` | `#CBD5E1` | `#4B5060` | `#B4BAC4` |
| `--muted` | libellé, aide, désactivé | `#94A3B8` | `#5B677C` | `#94A3B8` | `#6B7080` | `#8A919C` |

« — » : la valeur héritée de la couche du dessous s'applique.

Jetons propres à Paddock 2 (`design-v2.css`) :

| Variable | Sombre | Clair | Usage |
|---|---|---|---|
| `--v2-glass` / `--v2-glass-2` | `rgba(16,26,48,.62)` / `rgba(22,34,60,.7)` | `rgba(255,255,255,.72)` / `.86` | dégradé des panneaux en verre |
| `--v2-glass-hi` | `rgba(255,255,255,.06)` | `rgba(255,255,255,.8)` | reflet du bord haut (`inset 0 1px 0`) |
| `--v2-rim` / `--v2-rim-2` | `rgba(148,163,184,.14)` / `.24` | `rgba(15,23,42,.08)` / `.14` | filets fins |
| `--v2-blur` | `blur(22px) saturate(1.5)` | idem | `backdrop-filter` du verre |
| `--v2-red` | `linear-gradient(135deg, #ff2a1f, #c80500)` | idem | onglet actif, bouton principal, trait des titres |
| `--v2-red-glow` | `0 8px 24px -6px rgba(225,6,0,.6)` | idem | lueur sous l'élément rouge |
| `--v2-ambient` | 3 halos radiaux (bleu `rgba(37,99,235,.22)`, rouge `rgba(225,6,0,.14)`, turquoise `rgba(0,215,182,.07)`) sur dégradé `#050C1D → #030814` | 2 halos sur `#F4F7FC → #E9EEF6` | fond de page, fixé |

Fond de Paddock 2 : `--v2-ambient` + une grille de 44 px (`rgba(148,163,184,.045)`) masquée en ellipse depuis le
haut (`body::before`, opacité .5 en sombre, .8 en clair).

Barre du haut et barre du replay : **toujours sombres**, même en apparence claire (Broadcast et Paddock 2 redéfinissent
`--text`, `--panel`… localement sur `.topbar, .replaybar`).

### 3.2 Accent et couleurs de sens

| Variable | Valeur (Pitwall) | Sens |
|---|---|---|
| `--accent` | `#E10600` | rouge F1 : direct, choix actif, action principale |
| `--accent-2` | `#FF3B30` (Broadcast), `#FF2D1F` (base) | survol du rouge |
| `--purple` | `#C084FC` | **meilleur temps absolu** (convention F1) ; `#D58CFF` dans le tableau des secteurs |
| `--green` | `#34D399` | **meilleur temps personnel**, piste verte, gain de places |
| `--yellow` | `#FACC15` | drapeau jaune, secteur sans amélioration |
| `--orange` | `#FB923C` | avertissement (délai désynchronisé…) |
| `--red` | `#FF453A` | drapeau rouge, perte de places, erreur, zone d'élimination |
| `--blue` | `#60A5FA` | information, bouton bascule actif (`.btn.on`), courbes par défaut |
| `--sc` | `#FFB020` | voiture de sécurité (SC / VSC) |

État de la piste (`.track-status`) : vert = pastille verte sur fond translucide ; jaune = fond `--yellow`, texte
`#1A1500` ; SC/VSC = fond `--sc`, texte `#1D1200`, pulsation ; rouge = fond `--red`, texte blanc, pulsation ; damier =
fond `#F2F4F8`, texte `#0B0C0F` (inversé en clair).

Classement Paddock 2 : 1re place en or `#FFC93C` avec halo ; ligne suivie = dégradé rouge `rgba(225,6,0,.34) → transparent`
+ trait `inset 3px 0 0 #ff2a1f`. Gain / perte de places : fond qui s'éteint en 2,5 s (`tower-up` vert, `tower-down` rouge).

### 3.3 Couleurs des données

- **Écuries** : couleur officielle reçue de la F1 (`TeamColour`), passée en `--tc` sur l'élément. Option « couleurs
  vives » (`VIVID_TEAMS`, `public/js/util.js`). En apparence claire, `onLight()` (`shared/colors.js`) assombrit la
  couleur en gardant sa teinte jusqu'à un contraste d'au moins **3:1** sur blanc.
- **Pneus** (`COMPOUNDS`, `public/js/util.js`) :

  | Gomme | Sombre | Clair |
  |---|---|---|
  | Tendre (S) | `#FF3B3B` | `#DC2626` |
  | Medium (M) | `#FFD12E` | `#C68A00` |
  | Dur (H) | `#F2F2EE` | `#4B5563` |
  | Intermédiaire (I) | `#43B02A` | `#16A34A` |
  | Pluie (W) | `#2F8CFF` | `#2563EB` |
  | Inconnu | `#7A8396` | — |

---

## 4. Typographie

### 4.1 Familles (toutes incluses localement, `public/fonts/`, licence SIL OFL)

| Variable | Famille | Graisses fournies | Usage |
|---|---|---|---|
| `--font` | **Titillium Web** (Broadcast et Paddock 2) ; Saira (design classique) | 400, 600, 700, 900 | texte courant, libellés, en-têtes de tableau |
| `--font-cond` | **Saira Condensed** | 600, 700, 800 | titres de panneau, chiffres d'affichage (tour, heure, position), titres de l'Accueil — en **italique 800** dans Paddock 2 |
| `--font-mono` | **JetBrains Mono** | 400–700 (variable) | temps, écarts, vitesses, horloges du classement et des tableaux techniques |

Partout : `font-variant-numeric: tabular-nums` sur `body` (et forcé en `!important` sur les compteurs de Paddock 2,
dont les raccourcis `font:` remettaient des chiffres proportionnels).

Fenêtre Mini : `"Saira Condensed", "Titillium Web"`.

### 4.2 Échelle typographique observée

Pas d'échelle déclarée en variables : les tailles sont écrites en px. Taille de base : **14 px** (`body`), **13,5 px**
dans le thème Pitwall.

| Niveau | Taille / style | Exemples |
|---|---|---|
| Affichage XL | 44 px Saira Condensed 800 | compte à rebours de l'Accueil (`.hm-count`) |
| Affichage L | 30–32 px | bonjour de l'Accueil, heure de la barre du haut (Paddock 2, dégradé blanc → `#A8B8D8`) |
| Affichage M | 26–28 px italique 800 condensé | valeurs de la barre du haut (Paddock 2), titres de l'Accueil |
| Titre de séance | 20 px italique 800 condensé | `.session-name` (Paddock 2) |
| Position | 17–18 px condensé 800 | colonne Pos. du classement |
| Titre de panneau | 16 px italique 800 condensé, capitales, `letter-spacing .04em` (Paddock 2) ; 11,5 px 700 capitales sur étiquette rouge (Broadcast) ; 13 px capitales (base) | `.panel-head h2` |
| Corps | 13–14 px | texte des panneaux, boutons (13,5 px) |
| Secondaire | 12–12,5 px | `.small`, aides, onglets de base |
| Libellé | 10–11 px capitales, `letter-spacing` .1 à .14em | `.hstat-label`, en-têtes de tableau (10,5 px) |
| Minimum | 8,5–9,5 px | légendes de la barre latérale, barre du bas sur très petit téléphone |

Tailles les plus fréquentes dans les feuilles : 12 px (85), 13 px (84), 11 px (62), 12,5 px (44), 10,5 px (40).

---

## 5. Espacements

Pas d'échelle en variables. Valeurs dominantes (`gap`) : **8 px** (105), 6 px (81), 10 px (70), 4 px (59),
12 px (43), puis 2, 14, 5 px. En pratique, une grille de **2 / 4 / 6 / 8 / 10 / 12 / 14 / 18 px**.

Repères :

- En-tête de panneau : `7px 12px` (base), hauteur min. 42 px dans Paddock 2.
- Corps de modale : `12px 16px 16px`.
- Barre du haut : `8px 14px` (base), `6px 20px` et hauteur min. 64 px dans Paddock 2 (grand écran).
- Barre latérale (`--rail-w`) : **76 px** (60 px dans l'ancienne partie 1 du thème).
- Lignes du classement : hauteur `--tower-row-h` (34 px par défaut), cellules `3px 4px`.
- Note / état vide (`.note`) : `14px`, 13 px, interligne 1,5.

---

## 6. Rayons

| Élément | Paddock 2 | Broadcast | Classique |
|---|---|---|---|
| `--radius` (panneau) | **20 px** (`--v2-r`) | 6 px | 14 px |
| Petit rayon (`--v2-r-s`) | 12 px | — | — |
| Cartes de la Saison / Accueil | 20 px | 12 px | — |
| Cartes compactes (pneus, arrêts, jauges, secteurs) | 14 px | — | — |
| Boutons | **999 px** (pilule) | 4 px | 7 px |
| Onglets | 999 px (pilule) | 4 px | 6 px |
| Barre du bas (téléphone) | 28 px, boutons 22 px | — | — |
| Menus déroulants | — | 6 px | — |
| Pastilles, badges | 999 px ; petites cases 2–4 px | | |

---

## 7. Ombres et profondeur

- **Panneau en verre (Paddock 2)** : `--v2-shadow` = `0 24px 60px -24px rgba(0,0,0,.75), 0 2px 0 rgba(255,255,255,.025) inset`
  + `inset 0 1px 0 var(--v2-glass-hi)` ; en clair `0 18px 40px -22px rgba(15,23,42,.28)`.
- **Lueur rouge** : `--v2-red-glow` sous l'onglet actif, le bouton principal, la vitesse de replay choisie ; trait des
  titres `0 0 12px rgba(255,42,31,.7)`.
- **Lueur d'écurie** : `color-mix(in srgb, var(--tc) …)` derrière portraits et logos (carte pilote choisie :
  `0 0 0 2px #fff, 0 0 0 5px color-mix(--tc 60%), 0 20px 44px -14px color-mix(--tc 90%)`).
- **Menus et bulles** : `0 8px 24px rgba(0,0,0,.28)` à `0 8px 30px rgba(0,0,0,.5)` ; en clair `0 12px 32px rgba(10,12,20,.18)`.
- **Fond de modale** : `rgba(0,0,0,.55)` + `blur(2px)`.
- Broadcast et Classique : presque pas d'ombres, profondeur par les filets (`--border`, `--line-2`).

---

## 8. Composants

### 8.1 Boutons

| Classe | Base | Paddock 2 |
|---|---|---|
| `.btn` | fond `--panel-3`, contour `--border`, rayon 7 px, `5px 11px`, 600 ; survol : contour `--muted` | pilule, contour `--v2-rim-2`, fond `rgba(255,255,255,.05)` (`.7` blanc en clair), survol `.1` |
| `.btn-accent` | fond `--accent`, texte blanc ; survol `--accent-2` | fond `--v2-red` + `--v2-red-glow` ; reflet qui balaie le bouton au survol (si animations) |
| `.btn.small` | `2px 7px`, 12 px | pilule |
| `.btn.on` | bascule active : fond `--blue`, texte `#001526` | |
| `.icon-btn` | sans fond ni contour, 18 px, `--text-2` | |
| `.dbtn` | boutons du délai TV (−5 −1 −0,1 / +…) | |

Au doigt (`pointer: coarse`) : zone tactile invisible d'au moins **32 px** autour des petits boutons.

### 8.2 Cartes et panneaux

- `.panel` : fond `--panel`, contour `--border`, rayon `--radius`, flex colonne, `overflow: hidden`.
- `.panel-head` : en-tête (fond `--panel-2` ; dégradé `rgba(255,255,255,.035) → transparent` dans Paddock 2) avec
  titre `h2`, onglets et outils (`.panel-tools`).
  - **Paddock 2** : titre condensé italique précédé d'un **trait rouge incliné** (5×16 px, `skewX(-18deg)`, lueur).
  - **Broadcast** : titre en **étiquette rouge pleine** (hauteur 24 px, rayon 4 px, blanc 11,5 px capitales).
- Étiquette de carte de l'Accueil `.hm-tag` (« Prochaine séance », « Dernière séance », « Mes favoris »…) : pilule
  rouge `--v2-red` + lueur, 26 px de haut, 800 11,5 px capitales, `letter-spacing .1em` (Paddock 2) ; étiquette
  rectangulaire `--accent`, rayon 4 px, 24 px (Broadcast).
- Cartes de la Saison / Accueil : `.sz-card`, `.sz-box`, `.hm-card` ; cartes pilote / écurie `.sz-drv-card`,
  `.sz-team-card` (focus visible : contour 2 px `--accent`, décalé de 2 px).
- Tableau de bord de l'Accueil `.hm-board` : grille automatique (300 px minimum) en Classique et Paddock 2 ; en
  Télémétrie, zones nommées sur 4 colonnes à partir de 1200 px, 2 de 600 à 1199 px, 1 en dessous (ordre du code),
  gouttière 12 px. Carte qui ouvre sa rubrique de la Saison `.hm-link` : bouton `.hm-hit` sur toute la carte (anneau
  `--ring` à l'intérieur, -2 px), flèche `.hm-open` 14 px. Chiffre `.hm-big` (Archivo étroit 800, 34 px), tendance
  `.hm-trend` (Mono 12 px), manche `.hm-ctx` (Mono 11 px capitales) ; compte à rebours en cases `.hm-cd` (Archivo étroit
  800, 44–76 px, filet `--line-2` entre les cases) ; squelettes `.hm-sk` (pulsation d'opacité 1,2 s).
- Dans Paddock 2, toutes ces surfaces reçoivent le verre (dégradé `--v2-glass-2 → --v2-glass`, filet `--v2-rim`, flou).
  Un panneau qui contient un menu ouvert perd son flou (sinon les menus fixés du téléphone se calent dessus).

### 8.3 Navigation

- **Grand écran (> 900 px)** : barre latérale `.rail` fixe à gauche, `--rail-w` 76 px, boutons `.rail-btn` 46×46 px
  (icône 20 px, trait 1,7 px, légende 8,5 px capitales). Actif : trait rouge à gauche (Broadcast) ou fond dégradé
  rouge + halo et icône `#ff5a50` (Paddock 2). Accueil, Direct, Saison, Actu, Replays, Plus (Résultats, Résumé,
  Commentaires, Mini, Apparence), Fenêtres, Réglages.
- **Barre du haut** `.topbar` : séance (drapeau, nom, sous-titre), état de la piste, tour, temps restant, heure,
  météo, délai TV, synchro, source, notifications. Liseré bas en dégradé rouge → bleu → turquoise (Paddock 2).
- **Téléphone (≤ 900 px)** : barre du bas `.mob-nav` (icônes 21 px + légende) ; dans Paddock 2, flottante en verre
  (rayon 28 px, marge `env(safe-area-inset-bottom)`), bouton actif fond `rgba(225,6,0,.16)`. Un seul panneau à la
  fois (`.grid.mobile`), choisi dans une bande d'onglets (`.mob-panels`).
- **Onglets** : `.tab` dans les en-têtes (actif : `--panel-3` ; pilule rouge lumineuse dans Paddock 2 ; étiquette
  rouge dans Broadcast) ; `.tab-seg` = contrôle segmenté pour les onglets regroupés (actif : `rgba(255,255,255,.12)`,
  blanc + ombre en clair).
- Navigations latérales des espaces Saison / Actu / Replays : `#szNav`, `#nwNav`, `#rvNav` (actif : dégradé rouge
  horizontal).

### 8.4 Tableaux et graphiques

- **Classement** `.tower` : `border-collapse`, lignes de 34 px, séparateur `--line`, survol `--hover` (souris
  seulement, `@media (hover: hover)`), colonne Duel collante à droite, en-tête collant (verre flouté dans Paddock 2,
  10,5 px 700, `letter-spacing .12em`, `#8495B0`). Position en case (fond `--bc-pos-bg` blanc / texte noir en
  Broadcast sombre, inversé en clair ; italique 18 px sans case dans Paddock 2). Pilotes éliminés : opacité .45 ;
  ligne de coupure des qualifs : tiret 2 px `--red`.
- Chiffres des tableaux : `--font-mono`, `tabular-nums`, `letter-spacing -.2px`.
- **Graphiques** : SVG dessinés à la main (`public/js/ui/charts.js` et vues d'analyse), sans bibliothèque. Courbe
  simple : marges 40/10/10/20 px, 130 px de haut, grille discrète, ligne de zéro, réticule et infobulle au survol,
  couleur par défaut `#3ea6ff`, séries des pilotes en `--tc`. Graduations « propres » (pas de 1, 2, 2,5, 5, 10).
  État vide : `.note` « Pas encore de données. ».
- **Carte** : MapLibre (2D) et Three.js (3D), dans `public/vendor/` ; couleurs des pilotes en `--tc`.

### 8.5 Modales, menus, notifications

- `.modal` (`<dialog>`) : largeur `min(720px, 100vw − 32px)` (`.wide`), `min(560px, …)` (`.welcome`) ; en-tête collant
  fond `--panel-2`, titre 16 px ; entrée `modal-in` (fondu + montée 8 px + échelle .97).
- Menus : `.lpop-menu`, `.csel-pop`, `.map-layers-menu`, `.tb-pop` (sur téléphone, menus fixés au-dessus de la barre
  du bas, défilement au doigt, `max-height: 60dvh`).
- `.toast` : fixe, centré à 18 px du bas, fond `--panel-3`, rayon 9 px, ombre `0 8px 30px rgba(0,0,0,.5)`, 600,
  icône 18 px `--accent`, entrée `toast-in`.

---

## 9. États interactifs

| État | Traitement actuel |
|---|---|
| Survol | contour `--muted` (boutons de base), fond `--hover` (lignes, souris seulement), `rgba(255,255,255,.1)` (Paddock 2) |
| Actif / choisi | rouge : pilule `--v2-red` (Paddock 2), étiquette `--accent` (Broadcast), trait rouge (barre latérale) ; bascule `.btn.on` bleue |
| Focus clavier | contour 2 px `--accent` sur le champ du délai et les cartes pilote / écurie ; anneau `color-mix(--accent 55%)` sur les curseurs ; **ailleurs, focus par défaut du navigateur** (voir recommandations) |
| Désactivé | opacité .35 (barre latérale), `cursor: default` |
| Suivi / duel | ligne du classement surlignée (`--focus` ou dégradé rouge) |
| Hors course | opacité .45 |
| Chargement | squelette `.sz-skel` (`aria-busy="true"`, libellé en `.muted.small`) dans la Saison ; ailleurs texte d'attente dans `.note` ; écoute de la synchro audio : point blanc qui pulse (`as-pulse`, opacité .35, 1,4 s) |
| Vide | `.note` (gris `--muted`, 13 px, 14 px de marge) avec phrase explicite |
| Erreur | message en `.note` ou `.toast` ; rouge réservé aux vraies alertes |
| Données nouvelles | flash `flash` (jaune .18 → transparent), `tower-up` / `tower-down`, `card-arrive` (trait et fond rouges qui s'éteignent), `badge-pop` |

---

## 10. Animations

- **Interrupteur global** : `data-motion="off"` (Réglages → Affichage) met toutes les durées à 0 ; les animations
  décoratives sont aussi dans `@media (prefers-reduced-motion: no-preference)` → **les deux sont respectés**.
- **Courbes** (définies seulement quand les animations sont permises) : `--ease-out: cubic-bezier(.2, .8, .25, 1)`,
  `--ease-spring: cubic-bezier(.3, 1.35, .5, 1)` ; chiffres qui roulent `cubic-bezier(.22, 1, .36, 1)`. Paddock 2
  ajoute `--v2-smooth: cubic-bezier(.22, 1, .36, 1)` et `--v2-spring: cubic-bezier(.34, 1.56, .64, 1)` (rebond léger
  des icônes de navigation : `v2-pop` .5 s sur l'onglet choisi, transformations .3–.45 s).
- **Durées** : micro-interactions **.15 s** (la plus fréquente), .12 s (pression), .2 s ; entrées .26–.5 s ; flashs de
  données 2,5 s ; reflet du bouton principal .7 s.
- **Entrées** : `rise-in` (fondu + 10 px), `fade-in`, `view-in` (12 px depuis la droite, changement de panneau au
  téléphone), `pane-in`, `modal-in`, `toast-in`, `rail-mark`, `bar-grow`, `line-draw` (tracés SVG), `reveal-x`.
  Décalage en cascade : 50–70 ms entre panneaux au démarrage (`body.booting`) et entre cartes de l'Accueil.
- **Sens** : pulsation des drapeaux SC / VSC / rouge (`pulse`, 1–1,2 s), compte à rebours qui roule chiffre par
  chiffre.

---

## 11. Responsive

Point de rupture principal : **900 px** (`max-width: 900px` / `min-width: 901px`) = bascule téléphone ↔ ordinateur
(barre du bas, un panneau à la fois). Les tablettes ont la disposition de l'ordinateur.

| Largeur | Ce qui change |
|---|---|
| > 1600 px … 2100 px | paliers de la barre du haut (libellés masqués progressivement : 2100, 1950, 1800, 1600, 1450, 1360 px) |
| ≤ 1250 / 1100 / 1000 px | grilles des panneaux et de la Saison resserrées |
| ≤ 900 px | mise en page téléphone |
| ≤ 760 / 700 / 640 / 600 px | tableaux et cartes de la Saison sur une colonne, textes sur deux lignes |
| ≤ 480 / 420 / 400 / 380 / 340 px | colonnes du classement serrées, barre du bas resserrée (légendes 9,5 px) |
| Paysage peu haut (≤ 500 px) | en-tête sur une ligne, barre du bas en icônes seules, la page défile |

Autres : `env(safe-area-inset-*)` (encoche, barre d'accueil iPhone), `100dvh`, `viewport-fit=cover`,
`@media (hover: hover)` pour les survols, `@media (pointer: coarse)` pour les zones tactiles.

---

## 12. Accessibilité (état actuel)

- **Contrastes mesurés** (WCAG, sur les fonds pleins ; le verre de Paddock 2 est translucide, le fond réel varie) :

  | Paire | Rapport |
  |---|---|
  | `--text` / `--bg`, Paddock 2 sombre | 19,1:1 |
  | `--text-2` / `--panel`, Paddock 2 sombre | 12,4:1 |
  | `--muted` / `--bg`, Paddock 2 sombre | 7,8:1 |
  | `--muted` / `--panel-3`, Paddock 2 sombre | 5,6:1 |
  | en-têtes du classement `#8495B0` / `--panel` | 6,0:1 |
  | `--muted` / `--panel`, Paddock 2 clair | 5,7:1 |
  | `--muted` / `--panel`, Broadcast clair | 4,9:1 |
  | blanc / `#E10600` (bouton principal) | 5,0:1 |
  | blanc / `#FF3B30` (survol `--accent-2` Broadcast) | **3,6:1** |
  | `#E10600` en texte sur fond Paddock 2 sombre | **4,0:1** |

- Couleurs d'écurie et de pneus ramenées à **3:1** minimum en apparence claire (`onLight`, `COMPOUND_LIGHT`).
- `index.html` : 135 `aria-hidden` (icônes décoratives), 55 `aria-label`, 7 `aria-pressed`, 6 `aria-expanded`.
- Graphiques SVG `role="img"`.
- Animations : `prefers-reduced-motion` + interrupteur `data-motion`.
- Taille de l'interface (Réglages → Affichage → Général) : zoom de la page entière, jamais le `zoom` CSS (il agrandit
  aussi `vh` / `vw` et décale les menus placés en JS). Appli de bureau : `webContents.setZoomFactor`, 90 à 200 %
  (`desktop/main.cjs`) ; navigateur au doigt (téléphone, tablette) : balise viewport `initial-scale`, 90 à 150 %
  (`prefs.textScale`, `prefs.js`). À 150 % un téléphone de 390 px a une page de 260 px : rien ne doit déborder.
- Zones tactiles : 32 px minimum garantis au doigt pour les petits boutons ; boutons de la barre latérale 46 px.
- Textes sélectionnables seulement là où c'est utile (champs, articles, radios, messages de la direction de course).

---

## 13. Recommandations (non appliquées — à valider avant tout changement)

Ces points sont des pistes relevées pendant l'audit, **pas des règles en production**.

1. **Focus clavier visible partout** : seuls 3 sélecteurs `:focus-visible` existent. Ajouter un anneau commun
   (ex. 2 px `--accent` ou `--blue`, décalé de 2 px) aux `.btn`, `.tab`, `.rail-btn`, `.mob-nav button`, lignes du
   classement.
2. **Rouge en texte** : `#E10600` sur fond sombre (4,0:1) ne passe pas AA pour un petit texte ; le garder pour les
   fonds, traits et grands chiffres, ou éclaircir la variante texte.
3. **Survol du rouge** : blanc sur `#FF3B30` = 3,6:1 ; préférer un survol plus sombre (ou garder `#E10600` + reflet).
4. **Jetons d'échelle** : les tailles de texte, espacements et rayons sont écrits en px (plus de 20 tailles de texte).
   Des variables (`--fs-*`, `--sp-*`, `--r-*`) faciliteraient la cohérence — chantier à part, risque de régressions
   visuelles dans les trois designs.
5. **Tailles minimales** : légendes à 8,5–9,5 px (barre latérale, barre du bas étroite) ; viser 10 px minimum.
6. **Barre du haut à 1440 px** : à 1440×900 (séance terminée chargée, français ou anglais), la page déborde de
   ~90 px à droite (`#sourceBadge`, `#muteBtn`, carte radio). Vérifier les paliers de la barre du haut.
7. **Contraste sur verre** : mesurer les textes `--muted` sur les panneaux translucides au-dessus des halos les plus
   clairs (clair surtout).
