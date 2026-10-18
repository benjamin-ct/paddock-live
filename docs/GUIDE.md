# 📖 Paddock Live : guide complet

Le [README](../README.md) résume l'essentiel. Vous trouverez ici le détail de chaque fonction.

- [Ce que vous avez à l'écran](#-ce-que-vous-avez-à-lécran) · [Espace Saison](#-espace-saison)
- [Alertes](#-alertes) · [Commentaires en direct](#-commentaires-en-direct-f1-tv-pro) · [Radio](#-radio--flux-audio)
- [Streaming](#-streaming-obs-streamlabs-meld-studio-stream-deck) · [Disposition et deux écrans](#-disposition-et-deux-écrans) · [Téléphone ou tablette](#-sur-téléphone-ou-tablette) · [Délai TV](#-se-caler-sur-le-délai-de-canal)
- [Mise à jour automatique](#-mise-à-jour-automatique-de-lapplication) · [GPS et F1 TV](#-positions-gps-en-live--jeton-f1-tv-optionnel)
- [Enregistrements et replay](#-enregistrements-et--replay) · [Options](#-options) · [Fonctionnement](#-fonctionnement)

## 🖥 Ce que vous avez à l'écran

| Zone | Contenu |
|---|---|
| **Bandeau** | Bandeau pleine largeur, visible de loin, sous **drapeau rouge, SC, VSC**, drapeau jaune, et à la reprise. |
| **En-tête** | Drapeau du pays, Grand Prix et session, **drapeau / état de la piste** (vert, jaune, SC, VSC, rouge, damier), tour en cours ou partie de qualif (Q1/Q2/Q3), **temps restant en grand**, heure du circuit, météo (vent et sa direction, piste, air, humidité, pression, pluie : moins d'éléments sur les écrans étroits), état de la piste, **délai**. Trois menus, comme dans MultiViewer : **📄 documents de la FIA** du Grand Prix (filtre, résumé en français de chaque document, ouverture / téléchargement du PDF ; point rouge quand un nouveau document est publié ; en replay ou avec le délai TV, seuls les documents déjà publiés à l'instant affiché apparaissent), **vitesses** de chaque pilote aux intermédiaires 1 et 2, sur la ligne et au speed trap (meilleures de la séance ou dernier passage) et **meilleurs secteurs** avec le tour idéal ; tri par clic sur une colonne. |
| **Classement** | Position (+ places gagnées depuis la grille), écart au leader, intervalle (en vert si le pilote revient), dernier et meilleur tour, secteurs et **mini-secteurs** (violet / vert / jaune), pneus + âge, nombre d'arrêts, speed trap. Étiquettes STAND, SORTIE, ARRÊT, ABD, TOUR, drapeau bleu, DRS dans une colonne à part (alignées d'une ligne à l'autre). En qualif, la ligne rouge pointillée marque la limite d'élimination, avec le **temps à battre** et les pilotes en danger, et la colonne **Tour en cours** donne le temps prévu d'un tour lancé et la position visée. Changements de place surlignés en vert ou rouge, **favoris** : cliquez sur l’étoile ☆ à côté du nom (visible au survol de la ligne). Bouton **Colonnes ▾** : retirer des colonnes (dont le **nom complet du pilote** et la colonne des étiquettes), ou en **ajouter** (position de départ, tours effectués, écart au pilote suivi, vitesses aux intermédiaires I1 / I2 et sur la ligne, **meilleurs secteurs** S1 / S2 / S3 du pilote, écurie). |
| **Circuit** | Tracé réel du circuit dessiné comme une piste (asphalte, bordures, ombre, largeur adaptée à la taille de la carte et au zoom), **numéros de virage**, ligne de départ en damier et flèche du sens de course, voitures en **pastilles rondes avec le trigramme** dans la couleur de l'écurie (sans les noms : petits points, avec étiquette pour les pilotes suivis) et **traînée** montrant direction et vitesse, **secteurs S1/S2/S3** (trait central rouge, bleu, orange) et micro-secteurs du chronométrage. Le menu **Calques** regroupe les éléments affichables (noms, traînées, virages, secteurs, numéros des micro-secteurs en zoom, zones, fond texturé — mémorisés d'une session à l'autre) ; boutons + / − / vue d'ensemble en bas à droite. On y voit aussi : **secteurs de commissaires sous drapeau jaune ou double jaune** (fanion sur la carte + liste en haut à gauche : virages, secteur et micro-secteurs concernés ; la liste se masque avec la case « Textes des drapeaux jaunes » du menu Calques), **carte entièrement rouge sous drapeau rouge**, **safety car** (piste orange, voiture de sécurité placée devant le leader — position estimée, « rentre à la fin du tour ») et **VSC** (piste en pointillés défilants), **zones « ligne droite »** (straight mode, hachures vertes le long de la piste), **points de détection** (rose) **et d'activation** (vert) **du mode dépassement** — positions officielles lues dans le plan du circuit publié par la FIA pour chaque Grand Prix (« 90m after T16 »…), la fin des zones étant trouvée par la télémétrie ; sans ce document (saisons précédentes), elles sont estimées à partir de la télémétrie d'une séance du circuit (case « Zones LD / détection »), **voie des stands** (route grise en pointillés, case « Voie des stands » : la F1 ne fournissant pas son tracé, elle est reconstituée à partir des passages des voitures dans les stands lors d'une séance du circuit, et dessinée juste à côté de la piste quand elle la longe), **secteurs de commissaires estimés** sur les tracés reconstruits par GPS, **toutes les voitures en mouvement** (GPS) ; les pilotes hors course (abandon, voiture arrêtée en piste, éliminés en qualifs) sont retirés de la carte (case « Pilotes hors course » du menu Calques pour les réafficher). Avec les cases du menu **Calques** : **position** sur chaque pastille (anneau jaune autour du leader), **écarts de moins d'une seconde** affichés entre les voitures en course, **bulle de télémétrie du pilote suivi** (vitesse, rapport, régime, accélérateur, frein, écart avec la voiture de devant), **bande « ordre sur la piste »** sous la carte (chaque voiture placée le long du tour, avec les secteurs et les drapeaux), et **meilleur temps de chaque secteur** avec son pilote et noms des zones de ligne droite (« LD A1 »…). **Zoom** à la molette, déplacement à la souris, **Suivre** pour centrer la carte sur le pilote sélectionné. |
| **Duel** | Choisissez 2 pilotes (boutons **A** / **B** du classement) : **écart en temps réel** (GPS, mis à jour en continu) et écart officiel, **tendance** (« X revient à −0,32 s/tour, rattrapage estimé dans ~6 tours »), graphique de l'écart en direct et à chaque tour (arrêts aux stands marqués), comparaison tour / secteurs / pneus / speed trap, derniers tours côte à côte, **courbe de rythme** des deux pilotes, **compteurs de télémétrie** des deux pilotes (les mêmes que l'onglet Télémétrie), photos. Boutons ⬆ / ⬇ : **duel automatique** contre la voiture de devant ou de derrière, qui suit les dépassements. |
| **Stands (simulateur)** | « Si X s'arrête maintenant, il ressort **P8, 1,2 s derrière Y** ». Utilise le temps perdu au stand **mesuré pendant la course** (secteur d'entrée et secteur de sortie des vrais arrêts sous drapeau vert, comparés aux tours normaux du pilote) dès que 3 arrêts sont disponibles, sinon la valeur du circuit ; réduit dans la même proportion sous SC ou VSC ; modifiable. **Cercle de position** (comme le « Circle of Doom » de MultiViewer) : un tour = un tour de cercle, ligne d'arrivée en haut ; les voitures tournent en continu avec leur position sur la piste (GPS ou estimée, comme la carte), et l'arc du temps perdu au stand mène à l'endroit où le pilote ressortirait, qui le suit. Sans tracé du circuit, les voitures sont placées selon leur écart au leader (en haut). |
| **Bagarres** | Toutes les paires à moins de 1,5 s, triées par écart, avec la tendance (« se rapproche de −0,2 s/tour ») et un bouton pour ouvrir le duel. |
| **Direction de course** | Tous les messages de la FIA avec drapeaux, pénalités, enquêtes, limites de piste… Les drapeaux bleus et les temps supprimés peuvent être masqués, et un filtre n'affiche qu'un type de messages (drapeaux, safety car / VSC, enquêtes et pénalités, limites de piste, autres). Case **Traduire** : messages traduits en français par le serveur Paddock Live (texte d'origine au survol). |
| **Enquêtes** | Suivi de chaque incident signalé par les commissaires : noté → sous enquête → après la course → décision (pénalité, avertissement, pas d'action), avec les pilotes, le virage, le motif traduit et l'historique. Chaque sanction indique le pilote pénalisé, et un lien ouvre le document officiel de la FIA (convocation, décision) dès qu'il est publié sur fia.com. Pastille orange = enquêtes en cours. |
| **Limites de piste** | Tours / temps supprimés par pilote (virages concernés, dernier tour), drapeau noir et blanc et pénalités ; infractions matérialisées par des pastilles. |
| **Analyse** (inspiré de MultiViewer) | **Race trace** (écart de chaque pilote tour par tour : au leader, au rythme moyen ou à un pilote choisi ; arrêts marqués d'un point ; périodes de safety car, VSC et drapeau rouge grisées), **positions** tour par tour, **temps au tour** (seuil des tours lents réglable, 101 à 115 % du meilleur tour), **rythme** (boîte à moustaches des tours propres de chaque pilote, triée par médiane, et top 20 des tours les plus rapides), **historique des pneus** (tous les tours de chaque pilote colorés selon le pneu), **secteurs et vitesses** (meilleurs secteurs, tour idéal, vitesses aux intermédiaires et au speed trap, tri par colonne, affichage en écart à un pilote choisi ; en haut, **références du circuit** : pole et meilleur tour en course des éditions précédentes, tirés des archives F1, comparés au meilleur temps de la séance), **comparaison** de deux tours (meilleurs tours de P1 et P2 par défaut, ou n'importe quel tour de n'importe quel pilote : choix dans la liste, ou clic sur un temps dans *Temps* ou *Pneus*) : secteurs officiels, qui est le plus rapide dans chaque mini-secteur sur une carte colorée, écart cumulé le long du tour, vitesses ; mini-secteurs mesurés au GPS, en replay ou en direct avec un compte F1 TV) et **télémétrie** du pilote suivi. Survol : valeurs de tous les pilotes pour le tour pointé. Bouton **⤓ PNG** pour enregistrer un graphique en image. |
| **Radios** (façon MultiViewer) | En haut, **une carte par radio d'équipe** officielle (plus récentes à gauche) : photo du pilote, nom, **tour**, heure, durée, point bleu tant qu'elle n'a pas été écoutée ; un clic la joue (barre de progression dans la carte). En dessous, le **fil des radios retranscrites** et traduites (français, espagnol, allemand, italien ou anglais d'origine), texte original en petit ; un clic rejoue la radio. Vitesse de lecture 1× à 2×, filtre (tous, favoris, pilotes du duel) et **lecture automatique** des nouvelles radios au rythme de votre délai (une seule fenêtre joue le son). **Transcription et traduction par le serveur Paddock Live** (par défaut, voir *Traductions* plus bas) : chaque radio n'est transcrite qu'une fois pour tous (Whisper large-v3-turbo), rien à calculer sur l'ordinateur. Serveur désactivé ou injoignable : tout se fait sur votre ordinateur. **Qualité haute** (automatique avec une carte graphique) : Whisper large-v3-turbo pour la transcription et un modèle de langage (Qwen3-4B-Instruct) pour la traduction, qui connaît le contexte F1 (« box » → « rentre aux stands », « copy » → « reçu », erreurs d'écoute corrigées) ; ~4,5 Go téléchargés une seule fois. **Qualité légère** (processeur) : Whisper base.en + OPUS-MT, ~130 Mo, plus approximative. Choix dans « Qualité » (Auto / Haute / Légère). La ligne d'état indique le niveau réellement utilisé pour la transcription et pour la traduction, et la raison s'il est léger (pas de carte graphique compatible, échec du téléchargement ou de la mémoire de la carte graphique…). Après un échec, seul le modèle concerné passe en qualité légère et la haute qualité est retentée automatiquement (2 min en « Haute », 10 min en « Auto ») ; les radios traduites en qualité légère sont ensuite refaites en haute qualité. |
| **Radios des caméras embarquées** (expérimental) | La F1 ne publie qu'une sélection des radios d'équipe (une trentaine par course). Case **Caméras embarquées** du panneau Radios : Paddock Live écoute en direct, sans le jouer, le son de la caméra embarquée F1 TV du **pilote suivi et des pilotes du duel** (ou de vos 3 premiers favoris), y repère chaque radio, la retranscrit et la traduit sur votre ordinateur, puis l'ajoute au fil avec le repère « caméra embarquée » quand votre délai TV l'atteint (aucun spoiler). Séances en direct uniquement ; il faut les caméras embarquées F1 TV (offre Pro, incluse avec certaines offres Canal+) et un flux non protégé : si le son est protégé (DRM), l'état l'indique. Les radios déjà publiées par la F1 ne sont pas affichées deux fois. |
| **Arrêts** | Résumé (arrêt le plus rapide, médiane), vue chronologique (pneus retirés → montés, voie des stands et immobilisation avec barres de comparaison) ou par pilote (relais et arrêts). Les passages sans changement de pneus (passage imposé sous voiture de sécurité ou drapeau rouge, drive-through) sont distingués et ne comptent pas comme des arrêts, ici comme dans le classement, le duel, la stratégie, le résumé et les statistiques. |
| **Télémétrie** | Deux **compteurs** côte à côte (pilote suivi et un second pilote au choix, par défaut le pilote B du duel) : vitesse sur l'anneau, accélérateur et frein sur les arcs intérieurs, régime et rapport au centre ; courbe de vitesse des deux pilotes sur les 30 dernières secondes. **Animation fluide** à chaque image de l'écran : la F1 n'envoie que 3 à 4 mesures par seconde, les valeurs sont interpolées entre deux mesures (sans délai TV, l'affichage prend automatiquement quelques dixièmes de seconde de retard pour toujours avoir la mesure suivante). |
| **Pneus** | Stratégie complète de chaque pilote (relais, gommes, nombre de tours), **rythme** du relais en cours et **usure** (évolution du temps au tour, en s/tour). |
| **Jeux de pneus** | Onglet *Pneus* : pour chaque pilote et chaque composé, **jeux neufs encore jamais montés** et **jeux déjà utilisés** (avec leur nombre de tours), sur tout le week-end (essais, qualifs, sprint, course) ; jeu monté en ce moment encadré, jeu de tendres en plus pour les pilotes en Q3. Au-dessus : **les composés choisis par Pirelli** (C1 à C5 en dur / medium / tendre, allocation 13 jeux, 12 en week-end sprint) et **ce que préconise Pirelli** (stratégie attendue, extraits de ses communiqués du week-end, traduisibles en français). Rien n'est affiché avant l'instant que vous regardez (délai TV, replays). |
| **Météo / Championnat** | Station météo du circuit (outil Météo de la barre du haut) ; entre deux séances, temps actuel et prévisions du week-end sur le circuit du prochain Grand Prix. Projection du championnat en direct pendant les courses. |

## 🏆 Espace Saison

Le bouton **Saison** de la barre de gauche (🏆 en haut dans les autres designs et sur téléphone) ouvre une vue de toute la saison (inspirée de formula1dashboard.com, données Jolpica/Ergast, consultables hors ligne une fois chargées), avec un sélecteur d'année :

- **Accueil** : compte à rebours jusqu'à la prochaine séance, avancement de la saison, leaders des championnats, dernier vainqueur et top 10.
- **Calendrier** : toutes les manches (sprint, terminé / prochain / à venir), vainqueur et poleman, horaires de chaque séance à l'heure de votre ordinateur.
- **Classements** : courbe des points cumulés du top 10 et classements pilotes / constructeurs complets avec écart au leader.
- **Résultats & records** : plus de victoires, podiums, poles, meilleure moyenne, plus belle remontée, victoires les plus larges et les plus serrées, et le podium de chaque Grand Prix.
- **Course au titre** : pilotes (portraits) et écuries (logos) encore capables d'être champions ; les autres sont grisés, avec la manche où ils ont été éliminés (points + maximum encore à prendre < points du leader). Pour chacun : points, écart au leader, maximum atteignable et une barre (points, potentiel restant, leader). Un encadré indique le premier Grand Prix où le leader peut être sacré au plus tôt et, quand c'est possible, toutes les conditions pour l'être dès le prochain Grand Prix, dans un tableau : points à prendre sur chaque rival sur le week-end, et place que le rival ne doit pas dépasser si le leader gagne ou finit 2e (à égalité de points, le plus de victoires l'emporte).
- **Duels** : deux coéquipiers (écurie choisie par son logo) ou deux pilotes quelconques (« Pilote contre pilote ») : duel en qualifications et en course, points, victoires, podiums, poles, arrivées dans les points et abandons, note face au coéquipier (note de la saison entre pilotes d'écuries différentes), et **écart en qualification** (médiane et moyenne, manche par manche, dans la dernière partie disputée par les deux : Q3, sinon Q2, sinon Q1).
- **Notes des pilotes** : une note sur 100 et une lettre (S, A, B, C, D, F) pour chaque pilote. La note de la saison le classe parmi tous les pilotes (points par course, rythme de course, places moyennes à l'arrivée et en qualification, places gagnées, courses terminées). La note face au coéquipier compare les duels, la part des points de l'écurie et l'écart en qualification. Le détail du calcul est affiché sous le tableau.

**Statistiques détaillées** (analyse des archives officielles F1 Live Timing de chaque Grand Prix : la première fois environ 2 s par course, puis conservées sur le PC) :

- **Pilotes** : fiche complète par pilote (victoires, podiums, poles, meilleurs tours, points par course, moyennes au départ et à l'arrivée, places gagnées, duel qualif face au coéquipier, vitesse de pointe, temps d'arrêt moyen, régularité, tours en tête, plus belle remontée, notes), graphique départ / arrivée course par course, répartition des arrivées (P1 à P20 et abandons), points cumulés comparés à la saison précédente et tableau de toutes ses courses (avec les tours en tête).
- **Régularité** : écart-type des tours « propres » (hors 1er tour, arrêts, safety car / VSC et tours anormalement lents), classement des plus réguliers, rythme de course (écart au plus rapide), carte thermique par Grand Prix et régularité des résultats.
- **Arrêts aux stands** : temps d'immobilisation officiels, médiane par écurie, 15 arrêts les plus rapides, arrêts sous 2,5 s, temps dans la voie des stands par Grand Prix.
- **Vitesses de pointe** : speed trap, ligne d'arrivée ou intermédiaires ; classement des écuries et des pilotes, carte thermique écurie × Grand Prix.
- **Profil des circuits** : tracé, longueur, virages, tours et distance, meilleur tour et vitesse moyenne, vitesse de pointe, arrêts, voie des stands, dépassements en piste estimés et part des tours neutralisés, pneus choisis par Pirelli et contrainte sur les pneus (d'après le composé le plus dur), arrêts par pilote, et les trois circuits les plus proches de la saison ; jauges comparant les circuits (tri au choix).

**Technique** (lu dans les documents officiels de la FIA publiés à chaque Grand Prix, conservés sur le PC après la première lecture) :

- **Évolutions techniques** : toutes les pièces nouvelles déclarées par les écuries (« Car Presentation Submissions ») — total et classement par écurie, zones de la voiture, type (performance, spécifique au circuit, fiabilité) et raison (appui local, flux, refroidissement, traînée…), composants les plus modifiés, courbe cumulée, tableau écurie × Grand Prix et détail de chaque évolution (modification et description d'origine, lien vers le PDF FIA).
- **Éléments moteur** : éléments du groupe propulseur utilisés par chaque pilote (ICE, turbo, échappement, MGU-K, batterie, électronique, auxiliaires ; MGU-H avant 2026) face aux limites de la saison, limites atteintes ou dépassées, totaux par pilote et par écurie, pénalités sur la grille (éléments, sanction, document FIA) et éléments neufs montés à chaque Grand Prix.


**Pronostics entre amis** (Saison → Pronostics) : avant chaque Grand Prix, chacun choisit la pole et le podium, sur l'ordinateur ou sur son téléphone (accès réseau local). Les choix des autres restent cachés jusqu'à la fermeture (début des qualifications pour la pole, départ pour le podium). Points : pole exacte 3, pilote à la bonne place du podium 3, sur le podium mais à une autre place 1, podium exact dans l'ordre +2 ; classement de la saison et détail de chaque Grand Prix.

## 📰 Espace Actu

Toute l'actualité de la F1 au même endroit, sans aller la chercher partout (bouton **Actu** de la barre latérale ou du haut de l'écran sur téléphone ; pastille rouge = nombre de nouveautés) :

- **Sources** : officielles (site de la F1, communiqués et actualités F1 de la FIA, chaîne YouTube de la F1), chaînes YouTube officielles des écuries et des pilotes, et médias reconnus en 8 langues (anglais, français, espagnol, italien, allemand, néerlandais, portugais, japonais). Le PC relit chaque source toutes les 3 à 10 minutes. L'onglet **⚙ Sources** montre l'état de chacune, permet d'en couper et d'en **ajouter** (site ou flux RSS, chaîne YouTube, compte Bluesky). X, Instagram et TikTok ne sont pas proposés : ces réseaux n'offrent pas d'accès gratuit à leurs publications.
- **Traduction en français, faite d'avance** : dès qu'un article arrive (et au lancement pour ceux des derniers jours), son titre et son résumé sont traduits par le serveur Paddock Live, même page fermée ; la page s'ouvre donc déjà traduite. Traductions gardées par le PC et servies aussi au téléphone. Traduction en ligne désactivée : faite sur l'ordinateur, pour les articles affichés. Bouton **VO** pour voir le texte d'origine.
- **Lecture dans l'appli** : un clic sur un titre (ou sur « À la une », une vidéo, un article « repris par ») ouvre l'article dans Paddock Live : titre, photo, auteur, date et texte complet sans menus ni publicités ; le titre et le résumé sont traduits en français (bouton **VO** pour l'original), le texte de l'article reste en version originale (pas de traduction en plus) ; bouton **Ouvrir sur le site**. Les vidéos YouTube se lisent dans l'appli. Si le site refuse la lecture, si la page est une vidéo ou si l'article est réservé aux abonnés, le résumé s'affiche avec un lien vers le site. Échap revient à la liste ; Ctrl + clic (Cmd sur Mac) ouvre dans le navigateur.
- **Déjà lu** : un article ouvert passe en « Lu » et sa carte est grisée ; le bouton « Lu » (au survol de la carte) marque ou démarque une actu à la main, « Tout marquer comme lu » toute la liste.
- **Un sujet = une carte** : les articles qui parlent de la même chose sont regroupés (« repris par N sources », pastille flamme quand au moins 3 sources en parlent). Pilotes et écuries cités sont repérés (étiquettes de couleur).
- **Colonne de droite** : sujets à la une (48 h), pilotes et écuries qui font l'actu (24 h ; un clic pour ne garder que leurs sujets), dernières vidéos.
- **Filtres** : important, mes favoris (pilotes marqués ★ et leurs écuries), officiel, écuries, pilotes, médias, vidéos, langue d'origine, recherche.
- **Alertes** (son, message, notification du système) : actualités importantes (annonces officielles, contrats, pénalités, accidents… ou sujet repris par au moins 4 sources) et celles de vos favoris, ou toutes, ou aucune. Une seule alerte par sujet.
- **Anti-spoiler** : pendant une séance en direct, les titres sont floutés et les alertes d'actualité suspendues (bouton « Afficher quand même », case à décocher pour le désactiver).

## 🔔 Alertes

Son, message et notification du système en option pour : SC, VSC, drapeau rouge, reprise, meilleur tour, arrêt ou message de la direction de course concernant **vos pilotes favoris**, abandons, arrivée. Elles sont déclenchées **au rythme de votre délai**, donc au moment où l'image passe à la TV et jamais avant. Réglages dans ⚙ ; touche `M` pour couper le son.

- **Rappel avant chaque séance** (⚙ → Alertes) : message, son et notification 5 min à 1 h avant les essais, qualifications, sprint et course, quand Paddock Live est ouvert.
- **Calendrier** : bouton « Ajouter la saison à mon agenda » (⚙ → Alertes, ou Saison → Calendrier, aussi par week-end) : un fichier `.ics` à ouvrir avec Google Agenda, Apple Calendrier ou Outlook, avec une alarme 15 min avant chaque séance, même Paddock Live fermé.
- **Lumières connectées** (expérimental, ⚙ → Alertes) : vos ampoules **Philips Hue** (pont trouvé automatiquement, association par le bouton du pont) ou **Home Assistant** (adresse et jeton d'accès longue durée) prennent la couleur des drapeaux au rythme de votre délai TV : vert quelques secondes au départ, jaune, orange clignotant sous safety car, orange en VSC, rouge clignotant au drapeau rouge, blanc clignotant au damier, puis lumière normale. Mode **simulation à l'écran** pour essayer sans ampoule (lueur colorée sur les bords de la fenêtre), boutons de test pour chaque couleur.

## 🪟 Mini-classement, résumé et radar

- **Mini-classement** (bouton Mini de la barre latérale) : petite fenêtre toujours au premier plan avec le drapeau, le tour et le classement (intervalle ou écart au leader, pneus), à poser par-dessus F1 TV, Canal+ ou une autre vidéo sur le même écran. Image dans l'image dans Chrome et Edge, fenêtre au premier plan dans l'application de bureau ; même délai TV que la fenêtre principale.
- **Résumé** (bouton Résumé de la barre latérale, sur ordinateur) : la séance en cartes (podium avec écarts et place au départ, belles remontées et courses difficiles, stratégie du leader et la plus courante en pneus, neutralisations, abandons, pénalités, meilleur tour ; pole, Q2-Q3 et éliminés par partie en qualifs). Le texte rédigé reste copiable pour le partager. Fait avec ce qui a déjà été affiché : il ne dévoile rien en avance.
- **Résultats** (bouton Résultats de la barre latérale, « Voir les résultats » de l'accueil, menu Plus sur téléphone) : la même séance en cartes et le **classement complet** (grille et places gagnées, écart ou abandon, tours, arrêts, pneus utilisés, meilleur tour ; Q1, Q2, Q3 et écart à la pole en qualifs), au rythme du délai TV.
- **Radar de la pluie** (outil Météo) : les images radar des deux dernières heures autour du circuit (celui du prochain Grand Prix entre deux séances), en animation, pour voir la pluie arriver (RainViewer, fond OpenStreetMap).

## 🎙 Commentaires en direct (F1 TV Pro)

Le bouton **Radios** de la barre de gauche (🎙 en haut à droite dans les autres designs et sur téléphone) lit le son de la vidéo F1 TV de la séance affichée — en direct ou en rediffusion — avec votre abonnement **F1 TV Pro** (connexion dans ⚙ Réglages, la même que pour le GPS) :

- **Canal** : « International » (commentaires TV, plusieurs langues) ou « F1 Live » (émission F1 TV) ; **langue** au choix parmi celles du flux (français, anglais, allemand, espagnol, néerlandais, portugais…).
- **Volume**, **🔇 couper le son** (ou touche **C**), **▶ / ⏹**.
- **Caler sur le dashboard** : le son est automatiquement positionné sur l'instant affiché par le dashboard (donc sur votre délai TV), grâce à l'horodatage du flux ; **« Décalage du son »** pour affiner à l'oreille.
- Seul le son est téléchargé (pas la vidéo).
- **Abonnement requis : F1 TV Pro.** Avec F1 TV Access (seule offre proposée dans certains pays, dont la France), F1 TV refuse la vidéo (« technical package not available ») : l'offre détectée est affichée dans ⚙ Réglages.
- **Flux protégés (DRM Widevine)** : l'application de bureau utilise Electron castlabs, qui contient le module Widevine (téléchargé au premier lancement). Si F1 TV refuse la licence, c'est qu'il exige une application **certifiée VMP** : voir « Signature VMP » ci-dessous ; en attendant, le lien « Ouvrir le dashboard dans le navigateur » du panneau 🎙 ouvre le dashboard dans Chrome/Edge (certifiés), l'application restant ouverte.
- La ligne d'état indique précisément ce qui se passe (format du flux, protection DRM, erreur F1 TV…). Sous Linux, Widevine ne propose pas la certification VMP : si F1 TV refuse la licence, ouvrez le dashboard dans Chrome (lien du panneau 🎙).

### 📻 Radio / flux audio

Dans le panneau 🎙, choisissez **« Radio / flux audio »** pour écouter la station de votre choix (par exemple une radio qui commente la course dans votre langue) :

- **＋ Ajouter** : nom, langue et adresse du flux (MP3/AAC, HLS `.m3u8`, listes `.pls` / `.m3u`) — les stations sont mémorisées ; 🗑 pour en supprimer une.
- **Retarder du délai du dashboard** : la radio étant en avance sur la TV, le son est automatiquement retardé du délai TV réglé dans le dashboard (jusqu'à 170 s) ; **« Décalage du son »** pour affiner à l'oreille (la radio a elle-même quelques secondes de retard).
- Même volume, **🔇 / touche C** et **▶ / ⏹** que pour F1 TV.

#### Signature VMP (pour les flux DRM de F1 TV)

Les serveurs de licence Widevine exigent souvent une application signée « VMP » (Windows et macOS). La signature est faite automatiquement à la compilation (GitHub Actions) avec le service gratuit **castlabs EVS**, une fois ces deux étapes faites (une seule fois) :

1. Créer un compte EVS (Python requis) : `python -m pip install --upgrade castlabs-evs` puis `python -m castlabs_evs.account signup` (nom de compte, e-mail, mot de passe, puis code reçu par e-mail).
2. Dans GitHub : dépôt → **Settings → Secrets and variables → Actions → New repository secret**, ajouter `EVS_ACCOUNT_NAME` (nom du compte) et `EVS_PASSWD` (mot de passe).

Les versions publiées ensuite seront signées (le journal de compilation affiche « [vmp] signature de … »).

## 🎥 Streaming (OBS, Streamlabs, Meld Studio, Stream Deck)

⚙ Réglages → **Streaming** donne les adresses à copier ; Paddock Live doit rester ouvert sur l'ordinateur.

- **Overlays** : dans OBS Studio, Streamlabs ou Meld Studio, ajoutez une source « Navigateur » avec l'adresse et la taille indiquées. Fond transparent, au rythme du délai TV, toujours en thème sombre. Overlays : **classement** (colonnes au choix : places gagnées, intervalle, écart au leader, pneu, arrêts), **carte du circuit** (calques au choix), **bandeaux** (drapeau rouge, voiture de sécurité, VSC, drapeaux, damier : affichés seulement quand il le faut), **compteur de tours**, **compte à rebours** (séance en cours ou prochaine séance), **podium**, **télémétrie du pilote suivi** (celui choisi dans l'appli, sinon le leader). Le fond de chaque overlay (sauf les bandeaux) se règle de 0 à 100 %. Les adresses ne changent jamais : fond, colonnes et calques s'appliquent tout de suite aux overlays déjà ajoutés, sans actualiser la source, et restent gardés d'un lancement à l'autre.
- **Stream Deck et télécommandes** : adresses à appeler (action « Site web » en arrière-plan, ou requête HTTP GET avec Bitfocus Companion) pour le délai TV ±1 s ou ±0,1 s, et en replay lecture / pause et ±10 s. Le délai change dans l'appli, les overlays et les téléphones.

## 🧩 Disposition et deux écrans

La disposition est entièrement libre et conservée d'une session à l'autre :

- **Deux modes**, au choix dans le menu **Dispo.** de la barre latérale (ou ⚙ → Affichage → *Placement des panneaux*) :
  - **Rangés en colonnes** : attrapez la poignée **⠿** d'un panneau (en haut à droite) et déposez-le sur un autre panneau — à gauche ou à droite (nouvelle colonne), au-dessus ou en dessous (même colonne), ou au centre pour **échanger** les deux.
  - **Disposition libre** : chaque panneau se place **n'importe où** (poignée **⠿**) et se redimensionne par son **coin en bas à droite** ; il s'aimante aux bords et aux autres panneaux, les panneaux peuvent se chevaucher (un clic sur un panneau le passe devant). En passant en mode libre, les panneaux gardent d'abord leur place actuelle.
- **Enregistrer l'emplacement des fenêtres** (menu **Dispo.** ou ⚙ → Affichage) : garde la disposition de chaque fenêtre (panneaux, tailles, mode libre) et la place des fenêtres sur les écrans ; **↩ Revenir à l'emplacement enregistré** remet tout en place (fenêtres secondaires rouvertes à leur place). Dans l'application de bureau, ⚙ → Affichage → *Au lancement de l'application* : rouvrir les fenêtres comme à la fermeture, reprendre l'emplacement enregistré, ou ne pas rouvrir les fenêtres détachées.
- **Redimensionner** : glissez les espaces entre les colonnes ou entre les panneaux (double-clic : partage égal).
- **⤢ agrandir** un panneau (Échap pour revenir), **✕ masquer** (réaffichable dans ⚙ → Affichage, avec les colonnes du classement).
- **Onglets déplaçables** : glissez un onglet (Analyse, Stratégie, Course, Radios) vers **un autre panneau** à onglets, ou à une autre place dans le sien — par exemple la Race trace à côté de la Stratégie. La disposition des onglets est gardée (toutes fenêtres) ; ⚙ → Affichage → *Remettre les onglets à leur place*.
- **⟲ Réinitialiser l'interface** (bouton en haut à droite) : disposition des panneaux et des onglets, panneaux masqués, colonnes et fenêtres secondaires reviennent à l'état par défaut.
- **↗ envoyer vers une autre fenêtre** (second écran) : si une fenêtre secondaire est déjà ouverte, un menu propose d'**ajouter le panneau à cette fenêtre** (plusieurs panneaux réunis dans une seule fenêtre) ou d'en ouvrir une nouvelle. Dans la fenêtre secondaire, les panneaux se disposent et se redimensionnent de la même façon, et le bouton **✥** en haut passe en **disposition libre** (panneaux n'importe où, comme dans la fenêtre principale) ; **↙** remet un panneau dans la fenêtre principale. Les panneaux détachés disparaissent de la fenêtre principale et y reviennent quand on ferme leur fenêtre. Dans l'application de bureau, la fenêtre s'ouvre directement en plein écran sur le second écran.
- Le délai, le pilote suivi (clic dans le classement → télémétrie, carte…), le duel et les réglages restent synchronisés entre toutes les fenêtres.
- Le classement s'agrandit pour occuper toute la hauteur disponible (désactivable dans ⚙ → Affichage).
- **Langue / Language** (⚙ → Affichage) : interface en **français** ou en **anglais**. Tout suit, y compris le résumé de la séance, les moments clés, le calendrier exporté et l'écran de démarrage de l'application ; en anglais, les actualités sont traduites en anglais et les documents FIA et communiqués Pirelli restent en version originale. À la première ouverture, la langue de l'ordinateur est utilisée (français, sinon anglais).
- **Apparence** : un seul design, « Pitwall » (polices Saira et JetBrains Mono intégrées, chiffres en chasse fixe), en **automatique** (par défaut : suit le réglage clair / sombre de l'ordinateur ou du téléphone, y compris quand il change pendant l'utilisation), toujours **sombre** (idéal le soir et en direct) ou toujours **clair** (en plein jour), dans ⚙ → Affichage → Apparence. Le changement est immédiat, carte et graphiques compris.
- **Interface** : barre de navigation à gauche (Direct, Résultats, Saison, Replays, Radios, disposition par défaut, Réglages), barre d'état de la séance en haut (drapeau, tour avec barre de progression, temps restant, **heure locale du circuit**, météo, état de la piste, délai TV), cartes arrondies avec onglets segmentés, nom du pilote dans le classement, barre de replay en bas comme un lecteur vidéo. Les boutons −5 / −1 / −0,1 / +0,1 / +1 / +5 du délai sont dans le petit menu **±** à côté de la valeur. Sur téléphone, barre du bas avec icônes.
- **Heure circuit** : l'heure locale sur le circuit au moment affiché (délai TV et replays compris), d'après le fuseau horaire fourni par la F1.
- **Disposition selon la séance** : deux dispositions indépendantes, « Course » (courses et sprints) et « Qualif & essais », choisies automatiquement (ou imposées) dans ⚙ → Affichage ; chacune garde ses panneaux, tailles, colonnes du classement et onglets ouverts.
- **Essais et qualifs : estomper hors tour lancé** (menu *Calques* de la carte) : les voitures qui ne sont pas dans un tour rapide sont estompées sur la carte et dans le classement, pour suivre d'un coup d'œil ceux qui attaquent.
- **Légendes** sous chaque panneau (couleurs, colonnes, graphiques), affichées par défaut : « ✕ Masquer » sur la légende, ou option dans ⚙ → Affichage.
- **Logos des écuries** : dans le classement et le championnat, chaque pilote a le logo officiel de son écurie **dans ses vraies couleurs**, sur une pastille claire bordée de la couleur de l'équipe (logos chargés depuis formula1.com ; sans connexion, la pastille reste visible). Options dans ⚙ → Affichage : logo blanc sur la couleur de l'écurie, ou simples barres de couleur.
- **Couleurs des écuries** : couleurs officielles par défaut. Option « couleurs contrastées » dans ⚙ → Affichage : une teinte bien distincte par équipe (bleu roi Red Bull, lavande Racing Bulls, bleu ciel Williams, rose Alpine, blanc Haas, gris Audi, or Cadillac…), pratique quand deux couleurs officielles se ressemblent.
- **Application de bureau** : à la fermeture, les fenêtres détachées (panneaux, position, taille, plein écran) sont mémorisées et rouvertes à leur place au prochain lancement (ou à l'emplacement enregistré, au choix dans ⚙ → Affichage). Une fenêtre placée sur un écran qui n'est plus branché rouvre sur l'écran principal.

## 📱 Sur téléphone ou tablette

Le dashboard s'affiche aussi sur un téléphone ou une tablette, par exemple posé à côté de la TV pendant que l'ordinateur reste dans une autre pièce. **L'ordinateur fait tourner Paddock Live ; le téléphone l'affiche par le Wi-Fi de la maison.**

1. Sur l'ordinateur (application de bureau ou version Node.js) : ⚙ Réglages → Application → **« Autoriser l'accès depuis le réseau local »**.
2. Un **QR code** apparaît : scannez-le avec l'appareil photo du téléphone (connecté au même Wi-Fi).
3. C'est tout : le téléphone reste autorisé (cookie valable un an). Pour l'avoir comme une appli, utilisez « Ajouter à l'écran d'accueil » (Safari : bouton Partager ; Chrome : menu ⋮).

**Sur iPhone** : ouvrez le QR code dans Safari, puis bouton Partager → « Sur l'écran d'accueil ». L'appli ainsi ajoutée s'ouvre déjà autorisée. Si vous changez la clé sur l'ordinateur, supprimez l'appli de l'écran d'accueil, rescannez le QR code et ajoutez-la de nouveau. Safari ne permet pas la vibration ; le son des alertes fonctionne après un premier appui sur l'écran.

Sur un petit écran, **un seul panneau à la fois**, avec des onglets en haut du panneau et une barre de 5 boutons en bas (Accueil, Direct, Saison, Actu, Plus). Par défaut, le téléphone affiche une **version simplifiée** : classement, carte, course et radios, barre du haut et réglages allégés, carte avec les seuls calques lisibles sur un petit écran, barre de replay sur deux lignes. ⚙ → Application → *Version simplifiée* : la case **« Version complète sur ce téléphone »** redonne tous les onglets et réglages de l'ordinateur. Sur une tablette (plus de 900 px de large), la disposition est la même que sur ordinateur.

- **Délai TV** : le téléphone **reprend automatiquement le délai réglé sur l'ordinateur**, et le suit quand vous le modifiez. Si le téléphone regarde une autre diffusion, décochez l'option dans ⚙ → Application du téléphone et réglez son délai avec 🎯.
- **Écran toujours allumé** pendant une séance (option dans ⚙ → Affichage) : sur téléphone, touchez l'écran une fois après l'ouverture pour l'activer.
- **Alertes** : le son fonctionne après un premier appui sur l'écran ; sur Android, le téléphone **vibre** aussi (option « Vibration », non disponible sur iPhone).
- **Sécurité** : l'adresse contient une clé secrète ; sans elle, l'accès est refusé. « Changer la clé » déconnecte tous les appareils déjà autorisés (ils devront rescanner le QR code). Les réglages de cet accès ne sont modifiables que depuis l'ordinateur. Windows peut demander d'autoriser Paddock Live dans le pare-feu : acceptez pour les **réseaux privés**.
- L'accès utilise le **port 3030** (`lanPort` dans `config.json` pour le changer). L'ordinateur doit rester allumé avec Paddock Live ouvert.
- Autre possibilité avec la version Node.js : `HOST=0.0.0.0` ouvre l'interface principale à tout le réseau local, **sans clé** (voir [Options](#-options)) ; à réserver à un réseau de confiance.

## ⏱ Se caler sur le délai de votre diffusion

Le flux de chronométrage F1 arrive **avant** l'image TV. Le dashboard garde tout l'historique en mémoire et vous montre la course **telle qu'elle était il y a N secondes** : chronos, carte, drapeaux, duels, radios, tout est décalé ensemble.

- **Synchro automatique par le son (expérimental)** : dans la fenêtre **🎯 Synchro TV**, cliquez **Écouter la TV** (le système demande l'accès au micro la première fois). Le micro de l'ordinateur écoute votre TV ; dès qu'une **radio d'équipe** passe à l'antenne, Paddock Live la reconnaît et règle le délai tout seul.
  - Comment ça marche : chaque radio diffusée est publiée dans le flux F1 au moment de son passage à l'antenne. Paddock Live télécharge ces radios et les cherche dans le son du micro ; l'instant où il entend la radio donne le retard de votre diffusion, au dixième de seconde près.
  - Il faut que la séance ait déjà au moins 6 radios publiées (quelques minutes de course) ; ensuite, il peut se passer quelques minutes entre deux radios. L'écoute continue pour confirmer avec les suivantes et s'arrête d'elle-même au bout de 15 minutes (point clignotant sur le bouton Synchro TV pendant l'écoute).
  - Les commentateurs qui parlent par-dessus ne gênent pas, mais le son de la TV doit être audible depuis l'ordinateur (la jauge verte montre ce que le micro entend). Une radio qui n'est pas reconnue est simplement ignorée : aucune radio absente n'a été prise pour une autre lors des essais.
  - **Correction ±0,5 s** : si, une fois calé, le dashboard est toujours un peu en avance ou en retard sur votre image, réglez-la une fois pour toutes.
  - Le son reste sur l'ordinateur : rien n'est enregistré ni envoyé. Uniquement sur l'ordinateur (le téléphone n'a pas accès au micro à travers le réseau local). Sous Windows, vérifiez que l'accès au micro est autorisé pour les applications de bureau (Paramètres → Confidentialité → Microphone).
- **Synchro TV à la main** : cliquez sur **🎯 Synchro TV** (ou touche `S`). La fenêtre liste en temps réel les repères qui viennent de se produire : changement de tour du leader, drapeaux, SC, entrées aux stands, messages de la direction de course. Au moment **exact** où vous voyez l'un d'eux sur votre TV, cliquez **« Je le vois ! »** : le délai est calculé automatiquement.
  - Le plus précis : le **compteur de tours** qui change à l'écran (le leader franchit la ligne), ou l'extinction des feux.
  - **Anti-spoiler** : les événements pas encore visibles à la TV (pénalités, abandons, entrées aux stands…) sont masqués dans cette liste. Seuls les changements de tour restent affichés. Une case permet d'afficher le détail.
- **Réglage manuel** : boutons −5 / −1 / −0,1 / +0,1 / +1 / +5 (menu **±** à côté de la valeur), saisie directe (ex. `42,5`), molette de la souris sur la valeur, ou clavier : `←` `→` ±1 s, `Maj` ±5 s, `Alt` ±0,1 s.
- **Préréglages** : enregistrez votre délai calibré (« TV du salon », « Streaming PC »…) pour le retrouver en un clic la prochaine fois. Les deux préréglages fournis (TV, streaming) ne sont que des **points de départ indicatifs** : le retard réel dépend de votre équipement (box, satellite, TNT, appli, navigateur) ; calibrez-le une fois avec la synchro TV.

Le délai peut aller jusqu'à 10 minutes (modifiable avec `MAX_DELAY_SECONDS`). Si vous augmentez le délai juste après avoir lancé le dashboard, un ⚠ vous signale qu'il n'y a pas encore assez d'historique : l'affichage devient exact dès que ce délai est écoulé. **Astuce : lancez le dashboard quelques minutes avant la session.**

## 🔄 Mise à jour automatique de l'application

**Au lancement**, un écran « Recherche de mise à jour… » s'affiche. S'il existe une nouvelle version, elle est téléchargée (barre de progression), son empreinte SHA-256 est vérifiée, puis elle est installée et l'appli redémarre directement sur la nouvelle version : on ne rouvre jamais une ancienne version. Sans connexion internet, si GitHub ne répond pas (10 s) ou si le téléchargement reste bloqué 30 s, l'appli s'ouvre normalement. Si une installation n'a pas abouti, l'appli s'ouvre au lancement suivant au lieu de réessayer en boucle (bouton « Redémarrer et mettre à jour » dans les réglages).

**Pendant l'utilisation**, l'appli vérifie aussi toutes les 6 h : la nouvelle version est téléchargée en arrière-plan et installée **à la fermeture de l'appli**, ou tout de suite avec le bouton « Redémarrer ». Réglages : ⚙ → *Mises à jour de l'application*.

- **Windows** : la version installée relance l'installateur en mode silencieux ; la version portable remplace son propre `.exe`.
- **macOS** : la nouvelle version (archive `.zip`) remplace « Paddock Live.app » une fois l'appli fermée. Pas de mise à jour automatique si l'appli est lancée directement depuis l'image disque (`.dmg`) : glissez-la d'abord dans Applications.
- **Linux** : l'AppImage se remplace elle-même. Le paquet `.deb` ne se met pas à jour tout seul : au lancement, l'écran de démarrage signale la nouvelle version et propose de la télécharger (ou de continuer avec la version actuelle). Idem pour une appli macOS lancée depuis l'image disque.

Les versions sont lues sur les *Releases* de ce dépôt (public) : rien à configurer. Chaque version publiée (Actions → *Application de bureau* → *Run workflow* avec « Version à publier », ou tag `v*`) est proposée automatiquement à toutes les applis installées (Windows à partir de la v1.2.1, macOS et AppImage à partir de la v1.12.0).


## 💾 Sauvegarde des réglages

⚙ Réglages → Application → *Sauvegarde des réglages* :

- **Enregistrer mes réglages** crée un fichier `paddock-live-reglages-AAAA-MM-JJ.json` avec l'affichage, les dispositions (course / qualif, fenêtres secondaires), les colonnes, les délais TV mémorisés, la carte, l'analyse, les sources d'actualités et les lumières connectées.
- **Restaurer une sauvegarde** remplace les réglages actuels par ceux du fichier, puis recharge l'application (toutes les fenêtres ouvertes).
- Le fichier ne contient **ni la connexion F1 TV, ni la clé d'accès du téléphone, ni les clés des lumières** (pont Hue, Home Assistant) : à refaire sur un autre ordinateur. Ni les caches (radios écoutées, transcriptions, actus lues).
- Sur un téléphone, seuls les réglages d'affichage du téléphone sont enregistrés et restaurés.


## 📊 Statistiques d'utilisation anonymes

Au premier lancement, Paddock Live demande s'il peut envoyer des **statistiques d'utilisation anonymes**, pour savoir quelles fonctions servent le plus ou le moins. Rien n'est envoyé sans votre accord, et le choix se change à tout moment dans ⚙ Réglages → Application → *Statistiques d'utilisation*.

- **Ce qui est compté** : les panneaux, onglets et fonctions utilisés (Saison, Actu, replays, mini-classement, radios, transcription, synchro TV, pronostics…), la version de l'appli, le système (Windows, macOS, Linux), ordinateur, téléphone ou navigateur, la langue, les séances suivies en direct ou en replay, et les erreurs rencontrées (interface ou serveur de l'appli) : fichier et ligne, message technique de l'erreur et chemin d'appel (noms des fonctions et des fichiers de l'appli). Le message est nettoyé avant l'envoi : adresses web, noms de dossiers, e-mails et longs nombres sont retirés.
- **Ce qui n'est jamais envoyé** : la connexion F1 TV, un identifiant de l'appareil ou de la personne, le contenu (messages, radios, réglages, noms), et l'adresse IP n'est pas conservée.
- **Comment** : l'appli additionne les compteurs sur l'ordinateur et envoie seulement des totaux, environ toutes les 15 minutes (gardés sur le disque d'ici là si internet manque). Les fenêtres du téléphone passent par l'ordinateur ; le choix se fait sur l'ordinateur.
- Le petit serveur qui reçoit ces totaux est dans le dossier `analytics/` du projet. La variable `PADDOCK_STATS_URL` vide désactive complètement la fonction (aucune question posée).

## 🌍 Traductions et transcription des radios

Les actualités (d'avance, dès leur arrivée), les messages de la direction de course, le texte des radios d'équipe et les documents FIA sont traduits par le **serveur Paddock Live** (Cloudflare Workers AI, modèle de langage Mistral Small 3.1 avec des consignes F1 : noms des pilotes et des écuries gardés, vocabulaire des fans) : chaque texte n'y est traduit qu'une fois, puis gardé pour tous les utilisateurs. Les **radios d'équipe** y sont aussi **transcrites** (Whisper large-v3-turbo), une seule fois pour tous. Rien n'est calculé sur l'ordinateur.

- Seuls les textes à traduire sont envoyés : titres et résumés d'articles, texte des radios, extraits des documents FIA. Pour la transcription, le son de la radio (pris dans les archives F1, comme pour l'écoute) ; une radio déjà transcrite est reconnue à son empreinte, sans renvoyer le son. Aucun identifiant, aucun réglage.
- ⚙ Réglages → Application → *Traductions* : décocher pour tout traduire et transcrire sur l'ordinateur (modèles téléchargés une fois, plus lourd).
- Serveur injoignable ou trop sollicité : l'appli traduit ou transcrit sur l'ordinateur pendant 10 minutes, puis réessaie.
- Les variables `PADDOCK_TRANSLATE_URL` et `PADDOCK_RADIO_URL` vides désactivent complètement la traduction et la transcription en ligne.

## 📡 Positions GPS en live : jeton F1 TV (optionnel)

Depuis 2025, la F1 réserve **les positions GPS et la télémétrie du flux live aux abonnés F1 TV**. Tout le reste (chronos, secteurs, écarts, drapeaux, direction de course, météo, radios, pneus…) est accessible sans compte.

- **Sans jeton** : la carte affiche des **positions estimées** à partir des passages aux mini-secteurs du chronométrage (indiqué « Positions estimées » en orange). Pour chaque circuit, le dashboard **calibre automatiquement** l'emplacement réel des boucles de chronométrage à partir de la dernière session archivée sur ce circuit (qui contient le GPS). Précision mesurée à Monza : ~1 % du tour en médiane (~55 m). Pour le duel, l'écart affiché est alors l'écart officiel.
- **Avec un abonnement F1 TV, dans l'application de bureau** : ⚙ Réglages → **🔐 Se connecter à F1 TV**. Une fenêtre formula1.com s'ouvre ; une fois connecté, le jeton est récupéré automatiquement (et la session est mémorisée pour les fois suivantes).
- **Avec un abonnement F1 TV, dans le navigateur** : ⚙ Réglages → glissez le bouton **« 📡 Paddock Live : récupérer mon jeton »** dans votre barre de favoris, puis cliquez dessus quand vous êtes connecté sur formula1.com. Si le site empêche la lecture du cookie, collez manuellement la valeur du cookie `login-session` (instructions détaillées dans la fenêtre). La carte passe en **GPS** (vert), l'écart du duel devient continu et la télémétrie s'affiche. Le jeton reste sur votre PC (`config.json`). Il ne vaut qu'environ 4 jours, mais **l'application le renouvelle automatiquement** (dans ses dernières 24 h) tant que votre session formula1.com est valide, soit environ **30 jours après la connexion** : ⚙ Réglages → Compte F1 TV affiche les deux échéances, avec un bouton « Renouveler maintenant ». Trois jours avant la fin de la session, un rappel « Se reconnecter » apparaît en bas de l'écran (dans l'application de bureau, un clic suffit si formula1.com vous reconnaît encore).

Vous pouvez aussi le fournir au démarrage : `F1TV_TOKEN=... npm start`.

## 💾 Enregistrements et ⏪ replay

Chaque session suivie en live est **enregistrée automatiquement** sur votre PC (`recordings/`). Si le dashboard redémarre en pleine course, l'historique est rechargé et le délai reste exact. Les enregistrements se rejouent depuis ⚙ → *Mes enregistrements*, sans attendre l'archive officielle.

⚙ Réglages → *Replay* : choisissez une saison, un Grand Prix et une session (essais, qualifs, sprint, course). Les archives officielles contiennent **toujours le GPS et la télémétrie**. La **barre de lecture** (en bas) montre toute la séance : en vert quand la séance est en cours, en sombre quand elle est arrêtée, avec des **points blancs au début et à la fin de chaque partie** (Q1, Q2, Q3 en qualifs ; départ et reprise en course — cliquer sur un point pour y aller), la partie déjà lue en bleu, et les drapeaux rouges. Case **Drapeaux** : drapeaux jaunes, safety car et VSC sur la barre (ils révèlent les neutralisations à venir). Pause (`Espace`), ±10 s, **vitesse 1x à 30x**, retour au départ et **✕** pour revenir au direct. Le délai et la synchro TV fonctionnent aussi en replay, ce qui est pratique pour suivre une rediffusion.

Bouton **Moments** de la barre de lecture : la liste des moments clés de la séance (départ, voitures de sécurité et drapeaux, changements de leader, dépassements pour le podium, arrêts des premiers, abandons, incidents, pénalités, meilleur tour, arrivée ; pole en Q3), filtrable, avec des repères de couleur sur la barre. Un clic y va (quelques secondes avant). Anti-spoiler : les moments pas encore vus n'affichent que leur type et leur tour (case pour tout afficher).

## ⚙ Options

- **Animations de l'interface** (⚙ → Affichage) : apparitions en douceur des panneaux, fenêtres, menus et listes ; à décocher pour une interface sans animation (elles sont aussi coupées si le système demande moins d'animations).

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port de l'interface |
| `HOST` | `127.0.0.1` | Mettez `0.0.0.0` pour ouvrir le dashboard depuis une tablette ou un autre PC du réseau local (`http://IP-du-PC:3000`) |
| `MAX_DELAY_SECONDS` | `600` | Délai maximum réglable |
| `F1TV_TOKEN` | — | Jeton F1 TV (sinon via l'interface) |
| `PADDOCK_DATA_DIR` | dossier du projet | Où ranger `config.json`, `.cache/` et `recordings/` |
| `NO_RECORDING` | — | Mettez `1` pour ne pas enregistrer les sessions live |
| `PADDOCK_TRANSLATE_URL` | serveur du projet | Adresse de la traduction en ligne ; vide = traduction sur l'ordinateur seulement |
| `PADDOCK_RADIO_URL` | serveur du projet | Adresse de la transcription des radios en ligne ; vide = transcription sur l'ordinateur seulement |
| `PADDOCK_STATS_URL` | serveur du projet | Adresse d'envoi des statistiques anonymes ; vide = fonction désactivée |

## 🔧 Fonctionnement

```
livetiming.formula1.com ──SignalR──▶ serveur Node local ──WebSocket──▶ navigateur
 (flux officiel F1)                  (historique horodaté,            (état reconstruit à
                                      délai propre à chaque onglet)    « maintenant − délai »)
```

- `server/live.js` : client du flux officiel F1 Live Timing (SignalR Core).
- `server/hub.js` : conserve tous les messages horodatés et envoie à chaque navigateur l'état à *maintenant − délai*. Augmenter le délai reconstruit l'état passé ; le réduire fait avancer le flux.
- `server/replay.js` : rejoue les archives officielles ou vos enregistrements comme un live (vitesse variable).
- `server/recorder.js` : enregistrement du flux live sur disque et relecture.
- `server/circuits.js` + `shared/calibrate.js` : tracés et calibration automatique des boucles de chronométrage.
- `desktop/` : application de bureau Electron (serveur intégré).
- `shared/` : fusion des mises à jour du flux et données dérivées (historique par tour, arrêts, repères de synchro), communs au serveur et au navigateur.
- `public/` : l'interface (JavaScript sans étape de build). Le GPS est recalé sur l'horloge officielle du flux, car il arrive environ 2 s après les chronos. Ainsi carte, chronos et TV restent alignés.
- Tracés des circuits : API publique MultiViewer (mise en cache dans `.cache/`). Pour un circuit absent de cette base (nouveau tracé), le tracé est reconstruit automatiquement à partir du GPS du meilleur tour d'une session archivée.

Tests : `npm test` (lancés aussi automatiquement sur GitHub à chaque modification).
