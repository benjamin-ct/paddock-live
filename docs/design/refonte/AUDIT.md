# Refonte Paddock Live — Étape 1 : audit global

Audit réalisé le 3 novembre 2026 sur `develop` (v1.32 en préparation) et sur les versions en ligne
(paddocklive.app, app.paddocklive.app). Mesures : Playwright (Chromium) sur le serveur local de test et sur le site
en ligne (lecture seule), à 6 formats : ordinateur 1440×900 et 1920×1080, tablette 820×1180 et 1180×820,
téléphone 390×844 et 844×390. Chaque chiffre ci-dessous a été mesuré ou lu dans le code ; ce qui ne l'a pas été est
listé à la fin.

---

## 1. Architecture et contraintes techniques

| Sujet | Constat | Conséquence pour la refonte |
|---|---|---|
| Framework | Aucun : HTML, CSS, modules ES (`public/js/`, 70 composants dans `public/js/ui/` qui écrivent leur HTML) | La refonte passe par le CSS et le HTML des composants ; pas de bibliothèque de composants à remplacer |
| Styles | 3 feuilles empilées : `style.css` (3 863 lignes, base + Pitwall), `broadcast.css` (305), `design-v2.css` (567) ; 3 designs au choix (Paddock 2 par défaut, Broadcast, Classique), sombre / clair | Beaucoup de règles en `!important` et de surcharges d'une couche à l'autre ; nouvelle couche de jetons nécessaire |
| Jetons | Couleurs en variables, mais **tailles de texte, espacements et rayons en px écrits à la main** : 22 tailles de texte différentes affichées sur un même écran, 14 rayons différents | Échelles à créer (texte, espace, rayon, durée) |
| Animations | CSS seulement (keyframes, `--ease-out`, `--v2-spring`), coupées par `prefers-reduced-motion` **et** Réglages → Affichage (`data-motion`) ; aucune bibliothèque | On garde ce modèle (CSS + Web Animations + View Transitions), aucune dépendance à ajouter |
| Graphiques | SVG dessinés à la main (`charts.js`, vues d'analyse) ; carte MapLibre (2D) et Three.js (3D) | Restylage par jetons, pas de bibliothèque de graphiques |
| Surfaces | Appli de bureau (Electron : fenêtres Circuit, Analyse, Duel, Mini), version web (`app.paddocklive.app`, construite par `scripts/build-studio.mjs`), appli installable sur téléphone, overlays OBS, extension, site (Worker `analytics/`) | Un même design system pour toutes ; **la version web a une navigation différente de l'appli de bureau** |
| Langues | Français + anglais, italien, espagnol (`i18n-*.js`) | Libellés plus longs à prévoir partout |
| Contraintes métier | Délai TV, aucun spoiler, conventions de couleur de la F1 (violet, vert, jaune, pneus, écuries) | Ces conventions limitent les couleurs d'accent possibles (§ 3) |

Ce qui ne bouge pas : serveur (`server/`), Worker, API, authentification F1 TV, intégrations (radios, traductions,
pronostics, Stream Deck, OBS).

## 2. Inventaire

**Appli** : Accueil · Direct (tableau de bord à panneaux : Classement, Circuit 2D/3D, Télémétrie, Radios, Direction
de course / Enquêtes / Limites de piste, et 19 onglets : écarts, positions, tours, rythme, secteurs, pneus,
historique des pneus, stratégie, arrêts, simulateur d'arrêt, duels, comparaison, analyses, championnat…) ·
Résultats · Résumé · Commentaires · Saison (25 sous-pages : calendrier, classements, course au titre, duels, notes,
pronostics, statistiques détaillées, documents techniques FIA…) · Actu · Replays · Réglages (36 sections) · Mini ·
écran « Pas de séance en direct » · fenêtres détachées · overlays de streaming.

**Site** : accueil FR et EN, 8 pages de fonctionnalités en français et 7 en anglais, Alertes, Extension, pages
légales, Pronostics, et 392 pages `/saison/…` produites par le serveur (calendrier, classements, résultats, pilotes,
Grand Prix) sur `app.paddocklive.app`.

**Privé** (ne doit pas être indexé, ce qui est bien le cas) : Studio, `/login`, `/stats`, groupes de pronostics
(`/p/`), API.

## 3. Audit UI

Captures de référence : tableau de bord en replay (course de Mexico, tour 28), Accueil, Saison, Actu, Direct hors
séance, site.

### Critique

1. **Le rouge a perdu son sens.** La règle d'origine (« rouge F1 réservé au direct et aux alertes ») n'est plus
   tenue : sur un seul écran du tableau de bord, le rouge sert de titre de panneau (×3, pilules lumineuses), d'onglet
   actif, de bouton Synchro TV, de barre de replay, de vitesse choisie, de marqueur de barre latérale, d'étiquettes
   de l'Accueil (×3) et de bouton principal. Un vrai drapeau rouge, une alerte ou la Ferrari ne ressortent plus.
2. **Surcharge décorative.** Chaque bloc est une carte en verre dépoli avec contour, ombre portée, reflet et lueur ;
   on compte **26 à 49 éléments floutés (`backdrop-filter`) visibles en même temps** sur ordinateur. Les chiffres, qui
   sont le produit, passent derrière le décor.
3. **Le classement est tronqué à 1440 px** : la colonne « Dernier » est coupée, les pneus et les arrêts sont
   invisibles, alors que le panneau Télémétrie voisin est vide (« clic sur un pilote… ») et que la carte occupe un
   tiers de l'écran.

### Important

4. **22 tailles de texte et 14 rayons** sur un même écran ; trois familles de titres (italique condensé, capitales
   Titillium sur étiquette rouge, gras large) : la hiérarchie se lit mal.
5. **Information en double** : la direction de course apparaît dans son panneau **et** dans un bandeau juste
   au-dessous ; le compte à rebours de l'Accueil web apparaît dans la barre du haut **et** dans la carte principale ;
   au téléphone, l'onglet « Classement » et le titre « Classement » du panneau s'empilent.
6. **Barre du haut** : cinq icônes sans libellé (outils), le délai TV, la synchro, la source et les notifications sur
   une ligne qui **déborde de 73 à 93 px à 1440 px** ; hors séance, elle affiche « Arrivée · 71/71 · 00:00:00 » à
   côté de « Pas de séance en direct ».
7. **Logos d'écuries dans des pastilles blanches** à chaque ligne, et un badge « DÉP » sur toutes les lignes : du bruit
   visuel à fort contraste, peu d'information.
8. **Thème clair incomplet** : barre du haut, barre latérale et barre de replay restent sombres et lumineuses, ce qui
   donne trois ambiances sur un écran.

### Amélioration

9. Texte en dégradé (heure, titre du site), rebonds (`--v2-spring`) : signalés par le détecteur d'Impeccable ;
   lisibles mais datés.
10. Les messages d'erreur montrent du technique (« serveur de Paddock Live injoignable : Invalid URL »).

**Ce qui marche et doit rester** : densité du classement, chiffres en chasse fixe, couleurs d'écuries et de pneus,
flèches de gain et perte de places, frise du replay avec les drapeaux, cartes de la Saison (leaders, compte à
rebours), Accueil sans spoiler, réglages très complets.

## 4. Audit UX et navigation

1. **Deux navigations pour le même produit** : barre latérale (appli de bureau) contre onglets « Accueil · Direct ·
   Saison » plus une seconde ligne d'icônes (version web). Au téléphone, c'est une barre du bas. Passer de l'une à
   l'autre demande de réapprendre.
2. **Le menu « Plus » cache des fonctions de séance** (Résultats, Résumé, Commentaires, Mini, Apparence) au même
   niveau que des réglages globaux : Résultats et Résumé sont liés à une séance, pas à l'appli.
3. **Saison : 25 entrées à plat** dans une colonne qui dépasse l'écran ; pas de recherche.
4. **Incohérence d'action principale** : hors séance, le téléphone propose « Revoir Mexico : Course » en premier,
   l'ordinateur ne le propose pas (seulement « Voir les résultats » et « Toutes les séances ») ; l'Accueil web met
   « Voir les résultats » en rouge, l'appli met « Revoir en replay ».
5. **Téléphone portrait** : en-tête (≈ 110 px) + onglets + titre du panneau + barre de replay (≈ 120 px) + barre du
   bas : il reste environ 45 % de l'écran au classement, qui défile en largeur pour les pneus.
6. **Téléphone paysage** : la barre de replay recouvre le classement ; 4 lignes visibles.
7. **Tablette** : disposition de l'ordinateur en 820 px de large, avec des cibles tactiles d'ordinateur.

## 5. Audit responsive et accessibilité (mesures automatiques)

| Mesure | Résultat |
|---|---|
| Débordement horizontal | **73 à 93 px à 1440×900** (barre du haut) ; 0 aux autres formats testés |
| Cibles tactiles < 24 px (WCAG 2.2, critère 2.5.8) | **83 éléments visibles sur ordinateur et tablette paysage**, dont 38 cases du classement (29×16), 21 étoiles des favoris (19×15), 15 boutons 25×21 ; 4 à 17 au téléphone |
| Cibles < 44 px au téléphone paysage | **toutes** (28 à 60 éléments) |
| Éléments interactifs sans nom accessible | 0 (bien) |
| Focus clavier | ordre logique ; anneau par défaut du navigateur, **invisible** sur le champ du délai TV et la liste des préréglages |
| Contrastes | textes conformes (voir DESIGN_SYSTEM.md § 12) sauf rouge en petit texte sur fond sombre (4,0:1) et survol du bouton rouge (3,6:1) |
| Mouvement réduit | respecté (`prefers-reduced-motion` + Réglages) |

## 6. Audit SEO (site et pages Saison)

Bien en place : sitemap, robots, canonical, hreflang FR/EN sur les pages de fonctionnalités, JSON-LD (WebSite,
SoftwareApplication, SportsEvent sur les pages GP, Person sur les pilotes), vraies 404, http→https et www→apex en
301, pages privées en `noindex`.

| Priorité | Constat | Correction proposée |
|---|---|---|
| Important | **Deux H1** sur les 392 pages `/saison/` (coquille de l'appli + contenu) et sur `/legal/terms` | un seul H1 par page |
| Important | Pages Saison **en français seulement** (`/en/season/2026/` → 404), sans hreflang | version anglaise des mêmes données (puis IT, ES) |
| Important | Sitemaps croisés entre `paddocklive.app` et `app.paddocklive.app` ; robots.txt identiques | un sitemap par hôte, ou les deux hôtes validés dans la Search Console |
| Amélioration | Descriptions trop longues (201–203 caractères sur l'accueil et `/live-timing-f1/`), trop courtes sur les pages légales (12) ; titres pilotes à 74 caractères | 140–155 caractères ; titres ≤ 60 |
| Amélioration | `og:image` PNG de 430 Ko ; pas d'`Organization` en JSON-LD ; calendrier sans liste de `SportsEvent` ; sitemap sans `lastmod` | image légère, schémas complétés |
| Amélioration | `/live-timing-f1` → 307 vers la version avec barre (301 attendu) ; double en-tête `Cache-Control` sur les images du site | 301, un seul en-tête |

Opportunités éditoriales : pages « prochain Grand Prix » (horaires dans le fuseau du visiteur), pages circuits
(données déjà dans `f1-circuits.json`), pages écuries, versions EN/IT/ES des pages Saison. Les données existent déjà :
pas de contenu dupliqué à écrire.

## 7. Audit des performances

| Page · format | LCP | CLS | Requêtes | Poids (décompressé) |
|---|---|---|---|---|
| app.paddocklive.app · 1440 | 0,6–0,9 s | **0,83–0,96** | 112 | 2,9 Mo (945 Ko transférés) |
| app.paddocklive.app · 390 | 0,7–3,9 s | 0,02–0,03 | 113 | 2,9 Mo |
| paddocklive.app · 1440 | 2,6–2,8 s | 0,03–0,29 | 28 | 1,1 Mo (dont 882 Ko d'images WebP) |
| paddocklive.app · 390 | 2,1–2,2 s | 0 | 27 | 1,0 Mo |

| Priorité | Constat | Correction proposée |
|---|---|---|
| **Critique** | **CLS 0,83 à 0,96 sur l'appli web en ordinateur** (seuil « bon » : 0,1) : l'Accueil, la barre du haut et l'heure se décalent quand les données de la saison arrivent (~3 s) | réserver la place (hauteurs fixes, squelettes) : réglé par construction dans le nouveau design |
| Important | 91 modules JS non regroupés (1,3 Mo), dont `i18n-en.js` (188 Ko), `season.js` (101 Ko), chargés au premier affichage ; 3 CSS = 404 Ko | charger à la demande Saison, carte, analyse et les langues non utilisées ; la refonte remplace 3 feuilles empilées par une seule |
| Important | Cache des JS, CSS et polices de l'appli web à `max-age=0` (noms sans empreinte) | noms avec empreinte + cache long |
| Important | Au premier affichage : `/news/api` 650 Ko, saison 190 Ko, `f1-circuits.json` 97 Ko, `changelog.json` 50 Ko | différer ce qui est hors écran |
| Important | 26 à 49 éléments en `backdrop-filter: blur(22px)` visibles en même temps, au-dessus d'un tableau qui change plusieurs fois par seconde | supprimer le verre dépoli (coût GPU à chaque mise à jour) |
| Amélioration | 9 fichiers de police (165 Ko) | 2 familles, 2 fichiers (≈ 120 Ko) |
| Amélioration | Site : LCP sur le titre animé ; 2 images sans `width`/`height` | titre visible tout de suite, dimensions fixées |

## 8. Priorités

1. **Hiérarchie et sens des couleurs** : un accent unique et rare, les couleurs réservées aux données (§ 3.1, 3.2).
2. **Le tableau de bord d'abord** : classement complet à 1440 px, moins de décor, pas de doublons (§ 3.3, 3.5).
3. **Une seule navigation** pour l'appli de bureau, la version web et le téléphone (§ 4.1–4.3).
4. **Stabilité et vitesse** : CLS de l'appli web, verre dépoli, chargement à la demande (§ 7).
5. **Tactile et clavier** : cibles de 24 px minimum (44 px au téléphone), focus visible partout (§ 5).
6. **SEO** : un H1, pages Saison traduites, sitemaps par hôte (§ 6).

## 9. Non vérifié

- Une vraie séance en direct (seulement un replay) ; fenêtres détachées, Mini et overlays non capturés.
- Réseau lent et processeur bridé ; une seule mesure par cas (forte variance du LCP au téléphone).
- Lecteurs d'écran (VoiceOver, NVDA) ; seuls les noms accessibles et le focus ont été contrôlés.
- Saison et Actu en local (données coupées par le serveur de test) : vues sur la version en ligne.
- Indexation réelle (Search Console).
