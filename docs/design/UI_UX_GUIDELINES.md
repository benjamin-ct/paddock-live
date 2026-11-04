# Règles UI / UX de Paddock Live

Règles de conception propres à Paddock Live, tirées de l'appli telle qu'elle est (code, commentaires du CSS,
`CLAUDE.md`, `README.md`). Les valeurs graphiques (couleurs, polices, rayons…) sont dans
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Les pistes d'amélioration sont à la fin, à part.

---

## 1. Pour qui, pour quoi

- **Un fan de F1 qui regarde la course à la télé** (Canal+, F1 TV…) et suit les données à côté, souvent sur un
  deuxième écran, parfois sur un téléphone posé près de lui. Le regard fait des allers-retours entre la TV et
  l'appli : **l'information doit se lire en une seconde**.
- Le cœur de l'appli : **le direct** (classement, écarts, pneus, carte, radios, messages de la direction de course)
  **calé sur le délai de la TV**. Autour : Accueil, Saison, Actu, Replays, Résultats, Résumé.
- Surfaces : appli de bureau (Electron, fenêtres Circuit / Analyse / Duel / Mini), version web et appli installée sur
  téléphone, overlays de streaming (OBS…), extension. Une même interface doit tenir dans toutes.

## 2. Principes

1. **Données d'abord, décor ensuite.** Le tableau de bord est dense par nature (mode « Operate ») : la précision, la
   lisibilité et la stabilité priment sur l'effet. Télémétrie (design par défaut) est à plat pour cela ; les effets de Paddock 2 (verre, lueurs) ne doivent
   jamais gêner la lecture d'un chiffre.
2. **Aucun spoiler.** Rien ne doit révéler un résultat que l'utilisateur n'a pas encore vu : l'Accueil affiche
   « résultat masqué », le replay démarre avant le départ, les notifications et titres d'actualités respectent le
   délai TV. Tout nouvel écran qui montre un résultat se demande : « et si la personne regarde en différé ? ».
3. **Le délai TV est sacré.** Toute donnée « en direct » s'affiche au moment où la TV la montre, pas avant
   (classement, radios, messages, alertes, commentaires).
4. **Le rouge F1 est réservé** au direct, à l'élément choisi, à l'action principale et aux vraies alertes. Pas de
   rouge décoratif ni pour une simple information.
5. **Conventions de la F1 respectées** : violet = meilleur temps absolu, vert = meilleur temps personnel, jaune =
   drapeau jaune / pas d'amélioration ; couleurs officielles des écuries et des pneus ; noms à trois lettres (TLA).
6. **Rien ne bouge sous les yeux** : chiffres en chasse fixe (`tabular-nums`, `--font-mono`) pour que les colonnes
   ne dansent pas ; largeur réservée aux compteurs ; une donnée qui change se signale par un flash bref qui s'éteint,
   pas par un déplacement.

## 3. Règles de mise en page

- **Ordinateur (> 900 px)** : barre latérale à gauche, barre du haut avec l'état de la séance, grille de panneaux
  personnalisable (dispositions enregistrées, panneaux agrandis, fenêtres détachées).
- **Téléphone (≤ 900 px)** : **un panneau à la fois**, choisi dans la bande du haut ; barre du bas (Accueil, Direct,
  Saison, Actu, Plus) ; menus fixés au-dessus de la barre du bas ; respect des encoches (`env(safe-area-inset-*)`).
- **Paysage peu haut** : en-tête sur une ligne, la page défile, le classement garde la place.
- **Tablette** : disposition de l'ordinateur.
- **Aucun débordement horizontal de la page** ; un tableau large défile dans son panneau, avec la colonne utile
  collante (Duel, Grand Prix).
- Un nouveau panneau suit la structure existante : `.panel` > `.panel-head` (titre, onglets, outils) > `.panel-body`.

## 4. Règles visuelles

- **Design de référence : Télémétrie** (`data-design="v3"`, défaut de l'appli et de la version web depuis la v1.32), **en sombre et en clair**. Paddock 2 et Classique
  doivent rester lisibles sans casser.
- Réutiliser **les variables** (`--panel`, `--text-2`, `--muted`, `--accent`, `--tc`…) et les classes existantes
  (`.btn`, `.btn-accent`, `.btn.small`, `.tab`, `.tab-seg`, `.note`, `.toast`, `.modal`) ; ne jamais écrire une
  couleur de surface ou de texte en dur dans un composant (elle casserait l'apparence claire).
- Nouveau style propre à Télémétrie : dans `design-v3.css`, préfixé `:root[data-design="v3"]` (Paddock 2 : `design-v2.css`, `:root[data-design="v2"]`).
- Barre du haut, barre du replay et overlays de streaming : **toujours sombres**.
- Couleur d'écurie : passer `--tc` sur l'élément ; en clair, passer par `onLight()` (`shared/colors.js`).
- Titres : condensés (Saira Condensed) ; texte courant en Titillium Web ; temps et écarts en JetBrains Mono.
- Icônes : SVG à trait (`stroke: currentColor`, 1,7 px, extrémités arrondies) de `public/js/icons.js`, décoratives en
  `aria-hidden`.

## 5. Interactions et états

- **Survol à la souris seulement** (`@media (hover: hover)`) : au doigt, une ligne touchée pour faire défiler ne doit
  pas rester surlignée.
- **Zones tactiles** : 32 px minimum au doigt (zone invisible `::before` déjà en place pour les petits boutons) ;
  viser 44 px pour les nouvelles commandes principales.
- Chaque composant prévoit ses états : **chargement** (squelette ou texte d'attente), **vide** (phrase explicite en
  `.note`, jamais un panneau blanc), **erreur** (message qui dit quoi faire), **hors séance** (écran « Pas de séance en
  direct » avec la prochaine séance), **séance sans cette donnée** (onglet masqué : `.tab.sess-off`).
- Texte sélectionnable seulement là où on peut vouloir le copier (champs, articles, radios, messages, adresses).
- Les choix de l'utilisateur sont retenus (`paddock.prefs`) et appliqués **avant l'affichage** (pas d'éclair de la
  mauvaise apparence).

## 6. Animations

- Toujours derrière `@media (prefers-reduced-motion: no-preference)` **et** `:root:not([data-motion="off"])`.
- Courtes et utiles : retour d'action (.12–.2 s), entrée d'un panneau ou d'une carte (≤ .5 s), signal d'une donnée
  qui change (flash qui s'éteint). Courbe `--ease-out`.
- Jamais d'animation en boucle sur une donnée, sauf les alertes de piste (SC, VSC, drapeau rouge).
- Animer `opacity` et `transform` ; éviter d'animer la mise en page pendant une séance (fluidité du classement et de
  la carte).

## 7. Textes et langues

- L'appli est en **français**, avec ses versions **anglaise, italienne et espagnole** : tout nouveau texte affiché a
  sa traduction dans `public/js/i18n-en.js`, `i18n-it.js`, `i18n-es.js` (clé = texte français, `{}` pour les valeurs,
  tutoiement en italien et en espagnol). Vérifier avec `node scripts/i18n-missing.mjs`.
- **Prévoir des textes plus longs** que le français (anglais parfois plus court, italien et espagnol souvent plus
  longs) : pas de largeur fixe sur un libellé, ellipse (`text-overflow: ellipsis`) plutôt que débordement.
- Ton direct et concret, vocabulaire de la F1 tel que les commentateurs français l'emploient.
- Le **mode créateur** (Posts, Studio, statistiques des réseaux…) n'apparaît jamais dans le journal ni sur le site.

## 8. Accessibilité (minimum attendu)

- Contraste texte **4,5:1** (3:1 pour un grand texte, un trait de graphique ou une icône), dans les deux apparences.
- La couleur n'est jamais le seul signal : une position gagnée a aussi sa flèche, un pneu a sa lettre, un drapeau son
  libellé.
- Commandes au clavier, `aria-label` sur les boutons à icône seule, `aria-pressed` / `aria-expanded` sur les
  bascules et menus, `<dialog>` pour les modales.
- Graphiques : `role="img"` et une étiquette ; infobulle aussi accessible au toucher.

## 9. Vérifier un changement d'interface

1. Lancer les captures :
   ```bash
   node scripts/captures.mjs / --design=v2 --lang=fr
   ```
   Le script démarre le serveur local **sans rien envoyer au Worker en production**, capture téléphone (390 px),
   tablette (820 px) et ordinateur (1440 px) en sombre et en clair dans `.cache/captures/`, et signale débordements
   horizontaux et erreurs de page. Options : autres chemins, `--design=broadcast|classic`, `--lang=en|it|es`,
   `--out=dossier`, `PORT=…`.
2. Regarder les images (outil Read) ; pour une interaction (menu, survol, onglet), le serveur MCP Playwright de la
   session (`browser_navigate`, `browser_click`, `browser_take_screenshot`) ou un petit script Playwright, avec le
   serveur local de `CLAUDE.md`.
3. Hors séance, l'appli montre l'Accueil et l'écran « Pas de séance en direct » ; pour un vrai tableau de bord,
   lancer un replay (page Replays) ou `node scripts/fiabilite.mjs --appli` (demande un compte F1 TV).
4. Détecteur d'Impeccable sur les fichiers modifiés (mécanique, à trier : il ne connaît pas les conventions F1) :
   ```bash
   .claude/skills/impeccable/scripts/impeccable detect --json public/css/design-v3.css
   ```
5. `npm test` avant de pousser.

---

## 10. Pistes d'amélioration (non appliquées)

- Anneau de focus clavier commun à toutes les commandes (voir DESIGN_SYSTEM.md § 13).
- Variante texte du rouge plus claire pour les petits textes sur fond sombre.
- Légendes de 8,5–9,5 px à porter à 10 px minimum.
- Barre du haut qui déborde à 1440 px (séance terminée chargée).
