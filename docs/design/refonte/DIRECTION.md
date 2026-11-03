# Refonte Paddock Live — Étape 2 : direction artistique « Télémétrie »

**Statut : accent validé le 3 novembre 2026 (B, rouge Paddock) ; le reste est à valider sur le prototype (étape 3).** Rien de ce document n'est en production. Les règles actuelles restent celles de
[DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) tant que la refonte n'est pas validée puis livrée. Constats et mesures :
[AUDIT.md](AUDIT.md).

---

## 1. L'idée

> **Un écran de chronométrage, mis en page comme un magazine.**

Paddock Live est d'abord un instrument : on le regarde une seconde entre deux images de la course. La direction
« Télémétrie » assume ça : une interface **sobre, plate et précise**, où les seules couleurs vives sont **celles de
la course** (drapeaux, temps, pneus, écuries) et une **seule couleur de marque**, rare, qui marque ce qui est actif.
Autour du direct, les espaces Saison, Actu et Résultats prennent un ton **éditorial** : grands titres, filets fins,
chiffres d'affichage, de la place.

Quatre principes :

1. **La couleur, c'est la donnée.** L'interface est en graphite et ivoire. Violet, vert, jaune, rouge, les couleurs
   des pneus et des écuries gardent leur sens F1 et **n'ont pas d'autre usage**.
2. **Un seul accent, et rare.** Le vert citron signale *ce qui est actif* : l'action principale, l'onglet ou la ligne
   choisis, le focus clavier, le « direct ». Jamais pour décorer, et **jamais dans un tableau de temps**.
3. **Des zones, pas des cartes.** Fini les boîtes en verre avec contour, ombre et lueur : les panneaux sont des zones
   sur une même surface, séparées par l'espace et des filets d'un pixel. Les ombres ne servent qu'aux calques
   flottants (menus, modales).
4. **Le mouvement informe.** Une animation dit ce qui change (un écart qui se réduit, une place gagnée, un panneau qui
   s'ouvre). Rapide, sans rebond, toujours coupée quand l'utilisateur réduit les animations.

## 2. Couleurs

### 2.1 L'accent (décision : B, rouge Paddock)

| | **A. Vert citron `#C6F36B`** (votre piste, recommandée) | **B. Rouge Paddock** (héritage) |
|---|---|---|
| Identité | Rompt avec le rouge de la F1 officielle et de la plupart des sites de fans : Paddock Live devient reconnaissable | Continuité pour les utilisateurs actuels |
| Collisions | Aucune écurie 2026 dans cette teinte. **Mais** sa luminance est proche du jaune drapeau (rapport 1,12) et du vert « meilleur tour perso » (1,40) : pour un daltonien, citron et jaune se confondent | Rouge = drapeau rouge, pneu tendre, Ferrari, erreurs : **c'est le problème constaté aujourd'hui** (audit § 3.1) |
| Condition | Interdit dans les tableaux de temps et les graphiques ; la ligne choisie du classement est marquée par un filet ivoire et un fond surélevé, pas par le citron | Le réserver strictement au direct et aux alertes |
| Thème clair | Remplissage citron + texte graphite (14,3:1) ; en texte et icônes, olive `#476F08` (5,9:1) | Fonctionne tel quel |

**Choix retenu : B.** Accent `#E10600` (survol `#C80500`, texte sur l'accent blanc 5,0:1 ; en texte seul `#FF6B61` en
sombre, `#C40500` en clair). Pour qu'il garde son sens, il marque seulement l'action principale, l'élément actif
(onglet, espace) et la synchro TV ; **l'anneau de focus est ivoire** (`--ring`, graphite en clair) pour ne pas se
confondre avec une erreur ; les bascules allumées (vitesse du replay, pause) sont en ivoire inversé. Le logo « PL »
reste rouge.

Le **bleu data `#53B9D9`** de votre piste devient l'**encre des graphiques à une seule série** (évolution d'un temps,
d'un écart) et la couleur d'**information** ; il n'est pas une seconde couleur d'accent.

### 2.2 Palette (contrastes mesurés, WCAG)

**Sombre** (défaut)

| Jeton | Valeur | Usage | Contraste texte |
|---|---|---|---|
| `--bg` | `#0B0F15` | fond de page | — |
| `--surface` | `#10151D` | zones, panneaux | — |
| `--surface-2` | `#161D27` | en-têtes de zone, champs, lignes survolées | — |
| `--surface-3` | `#1B2430` | boutons secondaires, puces, calques | — |
| `--line` | `#222B37` | filets | — |
| `--line-strong` | `#2E3946` | contours de champ, séparateurs marqués | 1,56:1 (décor) |
| `--text` | `#F2F4F5` | texte principal | 14,2 à 17,4:1 |
| `--text-2` | `#B4BDC8` | texte secondaire | 8,2 à 10,1:1 |
| `--muted` | `#8A95A3` | libellés, aides | 5,2 à 6,3:1 |
| `--accent` | `#C6F36B` | marque, action, actif, focus | 12,3 à 15,0:1 |
| `--on-accent` | `#0B0F15` | texte sur citron | 15,0:1 |
| `--data` | `#53B9D9` | série unique, information | 6,9 à 8,5:1 |

**Clair**

| Jeton | Valeur | Contraste texte (blanc · surface-3) |
|---|---|---|
| `--bg` / `--surface` / `--surface-2` / `--surface-3` | `#F3F5F7` / `#FFFFFF` / `#F7F8FA` / `#ECEFF3` | — |
| `--line` / `--line-strong` | `#E1E5EA` / `#C9D0D8` | — |
| `--text` | `#10151D` | 18,3 · 15,9 |
| `--text-2` | `#3D4754` | 9,4 · 8,2 |
| `--muted` | `#56606D` | 6,4 · 5,5 |
| `--accent` (remplissage) / `--accent-fg` (texte, icône, focus) | `#C6F36B` / `#476F08` | — / 5,9 · 5,1 |
| `--data` | `#136F8F` | 5,7 · 4,9 |

**Couleurs de la course** (même sens partout, deux valeurs par thème)

| Jeton | Sombre | Clair | Sens |
|---|---|---|---|
| `--f1-best` | `#B98CFF` | `#6D28D9` | meilleur temps absolu |
| `--f1-pb` | `#3DDC84` | `#0A7A45` | meilleur temps personnel, piste verte, place gagnée |
| `--f1-yellow` | `#FFD43B` | `#8A5A00` (texte) | drapeau jaune, secteur sans amélioration |
| `--f1-red` | `#FF5A5F` | `#C42828` | drapeau rouge, place perdue, élimination |
| `--f1-sc` | `#FFA62B` | `#AD4B00` | voiture de sécurité |
| `--f1-blue` | `#5AA9FF` | `#1A5CC4` | drapeau bleu |
| pneus | inchangés (`COMPOUNDS`, `COMPOUND_LIGHT`) | | |
| écuries | `--tc`, avec `onLight()` en clair | | |

**Couleurs d'état de l'interface** : succès = `--f1-pb`, avertissement = `--f1-sc`, erreur = `--f1-red`,
information = `--data`. Tous les textes ci-dessus passent **4,5:1** sur toutes les surfaces de leur thème.

## 3. Typographie

| Rôle | Famille | Réglages | Pourquoi |
|---|---|---|---|
| Interface et titres | **Archivo** (Omnibus-Type, SIL OFL), variable : graisse 100–900, **largeur 62–125 %** | UI : largeur 100 %, 400–600 ; titres : largeur 75 %, 700–800 ; chiffres d'affichage : largeur 70 %, 800 | Une seule famille pour tout : étroite pour les titres et les compteurs (l'allure « course »), normale pour lire. Grotesque éditoriale, qui sort de Titillium Web, la police de très nombreux sites de fans de F1 |
| Temps, écarts, codes | **JetBrains Mono** (déjà dans l'appli) | 13–14 px, `tabular-nums`, `letter-spacing -.01em` | Colonnes qui ne bougent pas |
| Kickers techniques | JetBrains Mono | 11 px, capitales, `letter-spacing .12em` | Le ton « télémétrie » : `R20 · SÃO PAULO · EL1` |

Poids mesuré : Archivo variable latin (français, italien, espagnol) = **88 Ko**, un fichier ; plus JetBrains Mono
(31 Ko). Total ≈ 119 Ko en **2 fichiers** contre 165 Ko en 9 aujourd'hui. Les deux préchargés, `font-display: swap`,
métriques de repli réglées (`size-adjust`) pour éviter le décalage au chargement.

**Échelle** (10 tailles au lieu de 22 ; minimum 11 px au lieu de 8,5 px)

| Jeton | Taille / interligne | Usage |
|---|---|---|
| `--fs-2xs` | 11 / 14 | kickers, en-têtes de colonnes |
| `--fs-xs` | 12 / 16 | légendes, badges |
| `--fs-sm` | 13 / 18 | texte dense, tableaux |
| `--fs-md` | 14 / 20 | texte de l'interface |
| `--fs-lg` | 16 / 24 | lecture (Actu, pages du site) |
| `--fs-xl` | 20 / 26 | titres de zone éditoriale |
| `--fs-2xl` | 26 / 30 | titres de page |
| `--fs-3xl` | 34 / 36 | chiffres de la barre de séance |
| `--fs-4xl` | 48 / 48 | compteurs, titres d'Accueil |
| `--fs-display` | `clamp(56px, 7vw, 104px)` / .92 | une par écran au maximum (site, compte à rebours) |

## 4. Espaces, grilles, rayons, ombres

- **Espaces** (base 4) : `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 ·
  `--sp-10` 40 · `--sp-12` 48 · `--sp-16` 64.
- **Grilles** : tableau de bord en pleine largeur, zones redimensionnables, gouttière 1 px de filet (pas d'espace
  entre zones) ; pages éditoriales sur 12 colonnes, gouttière 24 px, contenu `max-width: 1240px`, texte long
  `max-width: 68ch`.
- **Points de rupture** (pensés pour les usages, pas pour des appareils) : `600` · `900` (bascule téléphone, comme
  aujourd'hui) · `1200` · `1600` ; plus `(max-height: 500px) and (orientation: landscape)` pour le téléphone en paysage
  et `(pointer: coarse)` pour les cibles tactiles.
- **Rayons** (5 au lieu de 14) : `--r-xs` 4 (badges, cases) · `--r-sm` 6 (boutons, champs) · `--r-md` 10 (menus,
  bulles, cartes de l'éditorial) · `--r-lg` 16 (modales, feuilles du téléphone) · `--r-pill` 999 (puces, contrôles
  segmentés). Moins arrondi que Paddock 2 (20 px) : plus technique.
- **Ombres** (calques flottants seulement) : `--shadow-pop` = `0 0 0 1px var(--line-strong), 0 12px 32px -12px
  rgb(0 0 0 / .6)` ; `--shadow-modal` = `0 0 0 1px var(--line-strong), 0 32px 80px -24px rgb(0 0 0 / .75)` (en clair,
  opacités divisées par 3). **Aucun `backdrop-filter`**, aucune lueur.

## 5. Composants

| Composant | Règle |
|---|---|
| **Bouton** | Hauteurs 32 / 40 / 48 px (44 minimum au doigt), rayon 6, Archivo 600. *Principal* : fond citron, texte graphite, un seul par zone. *Secondaire* : `--surface-3`. *Fantôme* : transparent, texte `--text-2`. *Danger* : texte et filet `--f1-red`. Pression : `scale(.97)` 80 ms |
| **Champ** | 40 px, fond `--surface-2`, filet `--line-strong`, libellé au-dessus (12 px), aide et erreur en dessous (icône + texte, pas la couleur seule) |
| **Focus** | Anneau 2 px `--ring` (ivoire en sombre, graphite en clair) décalé de 2 px, sur **tous** les éléments interactifs (`:focus-visible`) |
| **Onglets** | Texte `--muted`, actif en `--text` souligné d'un trait citron de 2 px qui glisse d'un onglet à l'autre (220 ms) |
| **Contrôle segmenté** | Pilule `--surface-2`, segment choisi `--surface-3` + texte `--text` |
| **Menu, liste déroulante** | `--surface-3`, rayon 10, `--shadow-pop` ; ouverture : fondu + 4 px + échelle .98 (180 ms), fermeture 120 ms |
| **Modale** | Rayon 16, `--shadow-modal`, fond d'écran `rgb(0 0 0 / .5)` ; au téléphone, **feuille** qui monte du bas, glissable |
| **Bulle d'aide** | 12 px, `--surface-3`, délai 400 ms à la souris, au toucher par appui long ; jamais la seule source d'une information |
| **Badge** | 20 px, rayon 4, Mono 11 px capitales. *Direct* : point citron qui pulse **uniquement pendant une vraie séance** |
| **Carte de statistique** | Pas de contour : kicker Mono, chiffre Archivo étroit 800, delta coloré par sens (pb / red) avec flèche, mini-graphique optionnel |
| **Tableau (classement)** | Lignes 32 px (36 au doigt), filets `--line`, en-tête collant Mono 11 px ; position en Archivo étroit 800 ; ligne suivie : filet ivoire à gauche + `--surface-2` ; écurie : trait vertical `--tc` de 3 px (fini les pastilles blanches) ; colonnes par groupes (Écarts · Tours · Pneus · Arrêts) qu'on fait défiler par groupe au téléphone |
| **Graphique** | Grille `--line`, axes Mono 11 px, série unique en `--data`, pilotes en `--tc`, tracé qui se dessine en 600 ms à l'ouverture seulement, réticule et valeur au survol et au toucher |
| **Chargement** | Squelettes aux **dimensions exactes** du contenu (le CLS de 0,9 disparaît), pulsation d'opacité 1,2 s arrêtée dès l'arrivée des données |
| **Vide** | Une phrase qui dit pourquoi et quoi faire, une action ; pas d'illustration |
| **Erreur** | Ce qui ne marche pas, en mots simples, et un bouton Réessayer ; le détail technique dans « Détails » |
| **Notification** | En bas à droite (ordinateur), en haut (téléphone) ; arrivée 220 ms, 5 s, empilées par 3 ; les alertes de course (drapeau rouge, SC) en bandeau pleine largeur, couleur du drapeau |

## 6. Mouvement

| Jeton | Valeur | Pour |
|---|---|---|
| `--dur-1` | 80 ms | pression |
| `--dur-2` | 140 ms | survol, bascules |
| `--dur-3` | 220 ms | onglets, menus, bulles, notifications |
| `--dur-4` | 320 ms | modales, feuilles, changement d'espace |
| `--dur-data` | 600 ms | tracé d'un graphique, compteur |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | entrées |
| `--ease-in` | `cubic-bezier(.7, 0, .84, 0)` | sorties (plus courtes) |
| `--ease-inout` | `cubic-bezier(.65, 0, .35, 1)` | déplacements |

- **Changer d'espace** (Accueil → Direct → Saison…) : View Transitions API (Chromium, donc l'appli Electron, et
  Safari 18) : fondu croisé de 220 ms et glissement de 8 px ; la barre de séance reste en place. Sans prise en charge :
  changement direct.
- **Données** : chiffre qui change = l'ancien sort vers le haut, le nouveau entre (180 ms) ; place gagnée ou perdue =
  la ligne glisse à sa nouvelle place (FLIP, `transform`, 300 ms) avec un fond `--f1-pb` / `--f1-red` qui s'éteint ;
  secteur violet = court flash.
- **Interdits** : rebond, boucle permanente (sauf point « direct » et alertes de piste), animation de `width`,
  `height`, `top`, `left` ou de flou ; plus de 400 ms pour une interaction.
- Seules `transform` et `opacity` sont animées ; tout est coupé par `prefers-reduced-motion` **et** par Réglages →
  Affichage. Aucune bibliothèque à ajouter (CSS, Web Animations API, View Transitions).

## 7. Navigation

**Une seule architecture** pour l'appli de bureau, la version web et le téléphone.

- **Cinq espaces** : Accueil · Direct · Saison · Actu · Replays. **Résultats, Résumé et Commentaires** deviennent des
  vues **de la séance** (onglets du Direct et d'un replay), plus des entrées globales. Réglages, Apparence, Fenêtres,
  Mini : menu de l'appli (icône réglages, et ⌘K / Ctrl+K pour une **palette de commandes** qui trouve n'importe quel
  écran, pilote ou réglage).
- **Barre de séance** (remplace la barre du haut) : une ligne de 56 px (48 au téléphone) avec drapeau et séance ·
  état de la piste · tour · temps restant · heure · **délai TV** (valeur ± et synchro dans un même contrôle). Les cinq
  icônes d'outils sans libellé deviennent des onglets du Direct. Hors séance, la barre affiche la **prochaine séance**
  (compte à rebours), plus les restes de la dernière.
- **Saison** : les 25 entrées en 5 groupes repliables (Vue d'ensemble · Résultats · Pilotes et écuries · Technique ·
  Jeux) et la recherche.

| Format | Navigation |
|---|---|
| Ordinateur (> 1200 px) | Barre latérale de 64 px (icônes et libellés), barre de séance en haut |
| Tablette paysage (900–1200 px) | Barre latérale repliée en icônes, zones sur 2 colonnes |
| Tablette portrait (600–900 px) | Barre du bas (5 espaces), zones empilées, cibles de 44 px |
| Téléphone portrait | Barre du bas, barre de séance de 48 px, une zone à la fois choisie par un contrôle segmenté ; **le replay se réduit en mini-lecteur** de 56 px au-dessus de la barre du bas |
| Téléphone paysage (hauteur ≤ 500 px) | **Rail à gauche** de 56 px à la place de la barre du bas, barre de séance de 40 px, deux zones côte à côte (classement + carte ou fil) |

## 8. Tableau de bord (Direct)

- **Ordinateur** : le classement est la colonne vertébrale (gauche, pleine hauteur, **toutes les colonnes visibles à
  1440 px**), la carte et la télémétrie au centre, à droite un **fil de course** unique (radios, direction de
  course, enquêtes, limites de piste, filtrables), qui remplace deux panneaux et le bandeau en double. Barre de replay
  sur une ligne de 48 px. Dispositions, panneaux détachés et réglages conservés.
- **Tablette paysage** : classement + une zone au choix ; **portrait** : classement en haut, zone au choix en dessous.
- **Téléphone** : classement par défaut, colonnes par groupes, carte et fil à un geste.

## 9. Espaces éditoriaux (Accueil, Saison, Actu, Résultats)

Titre de page en Archivo étroit 800, kicker Mono, contenu sur la grille de 12 colonnes, cartes de statistiques sans
contour, classements avec barres fines aux couleurs des écuries, articles en 16 px sur 68 caractères. Le compte à
rebours de la prochaine séance est **le** chiffre d'affichage de l'Accueil (une seule fois à l'écran).

## 10. Ce qui est conservé, ce qui demande votre accord

**Conservé** : toutes les fonctions, réglages, raccourcis, dispositions, fenêtres détachées, Mini, overlays,
extension, langues, Accueil sans spoiler, délai TV, conventions de couleur de la F1.

**À valider** (changements structurants) :

1. ~~L'accent~~ : **B, rouge Paddock** (validé).
2. ~~Le logo~~ : inchangé (rouge), conséquence du choix B.
3. Les **designs actuels** (Paddock 2, Broadcast, Classique) : les garder au choix dans Réglages → Apparence pendant
   une ou deux versions, puis décider ; ou ne garder que le nouveau.
4. La **navigation** : Résultats, Résumé et Commentaires passent dans la séance ; « Plus » disparaît au profit du menu
   et de la palette de commandes.
5. Le **fil de course** qui fusionne Radios et Direction de course (les deux restent disponibles comme panneaux
   séparés si on préfère).

## 11. Suite (après validation)

Étape 3 : prototype du **tableau de bord (Direct)** et de l'**Accueil**, en sombre et en clair, sur ordinateur,
tablette et téléphone (portrait et paysage), présenté par captures, dans une nouvelle couche `data-design="v3"` qui
ne touche pas aux designs actuels. Étape 4 : votre validation avant toute refonte globale.
