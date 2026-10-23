# Journal des modifications

Toutes les nouveautés de Paddock Live, version par version. Chaque nouvelle version publiée doit avoir
sa section ici : elle est reprise telle quelle sur la page de la version (GitHub) et dans
l'application (Réglages → À propos → Nouveautés).

## v1.29.0 — à venir

### Alertes sur le téléphone
- Même loin de l'ordinateur : un rappel 30 minutes avant chaque séance, les résultats (vainqueur, pole) si vous
  le voulez, et les grosses news, sur votre téléphone. Page paddocklive.app/alertes, à ouvrir sur le téléphone
  (QR code dans Réglages → Alertes & favoris) ; sur iPhone, l'ajouter d'abord à l'écran d'accueil. Sans compte.

### En direct
- Une pénalité purgée n'apparaît plus une deuxième fois (résumé de la séance, moments clés, « Pendant votre
  absence »).
- « Pendant votre absence » fonctionne aussi quand on s'absente pendant un drapeau rouge.
- Onglets d'analyse (race trace, positions, rythme, temps au tour) redessinés une fois par seconde au plus
  pendant la course, au lieu de plusieurs fois : moins de calcul, surtout sur téléphone.

### Saison
- Notes des pilotes : un abandon compte comme la dernière place de la course (22 voitures en 2026), et plus
  comme une 20e place ; la répartition des arrivées montre aussi les 21e et 22e places.
- Météo du week-end : la bonne journée pour les séances du soir (Las Vegas : la course du samedi soir n'est plus
  rangée le dimanche).

### Fiabilité et sécurité
- Accès depuis le téléphone : un site ouvert sur l'ordinateur ne peut plus se faire passer pour l'ordinateur
  afin d'utiliser l'appli sans la clé du QR code.
- Le relais des radios et de F1 TV refuse aussi les adresses locales écrites autrement (forme IPv6).
- Réglages et pronostics enregistrés sans risque d'être perdus en cas de coupure pendant l'écriture ; un fichier
  de réglages abîmé est mis de côté (config.json.bad) au lieu d'être écrasé.
- Fenêtres de connexion F1 et de publication sur X, Threads et Bluesky : position, micro, caméra et
  notifications refusés d'office.
- « Installer les mises à jour à la fermeture » décoché : l'appli n'installe plus la nouvelle version au
  lancement, elle la signale seulement.
- L'appli démarre même quand ses ports habituels (3000, 3001, 3002, 3010) sont tous occupés, au lieu de se
  fermer sans message.
- Appli ouverte plusieurs jours : la liste de l'Actu et les traductions gardées en mémoire ne grossissent
  plus sans fin.

### Divers
- Statistiques d'utilisation (si vous les avez acceptées) : les versions bêta les envoient aussi ; elles
  étaient jusqu'ici écartées sans rien dire.
- Petites améliorations internes.

## v1.28.1 — 2026-10-23

### Divers
- Petites améliorations internes.

## v1.28.0 — 2026-10-22

### Nouveau design « Broadcast »
- Habillage façon retransmission TV, en sombre comme en clair : barre du haut et barre de lecture noires, tour
  en cours dans une case blanche, titres des panneaux en étiquette rouge, position du classement dans une case,
  grand écart du duel en chiffres condensés. La carte et tous ses calques restent identiques.
- Bandeau en bas de l'écran avec le dernier message de la direction de course (couleur du drapeau, tour).
- Radios : photo carrée soulignée de la couleur de l'écurie, onde sous chaque message retranscrit.
- Interface Essentiel : sa propre disposition (classement, grande carte avec le duel dessous, radios et direction
  de course à droite), indépendante de celle de l'interface Complète ; classement compact avec le code pilote,
  l'écart, les secteurs en couleur et les pneus.
- Site aux mêmes couleurs.
- Accueil et calendrier (Saison → Calendrier) au même style : prochain Grand Prix en grand avec son drapeau, compte à
  rebours et programme du week-end jour par jour ; calendrier de la saison en liste groupée par mois (manche, drapeau,
  dates, sprint, vainqueur et pole), une ligne s'ouvre sur ses séances.
- Envie de l'ancien look ? Réglages → Apparence → Design : « Classique » le remet (le bandeau du bas en moins).

### Prise en main
- Premier lancement guidé (nouvelles installations, sur ordinateur) : choix des pilotes et écuries favoris, le
  délai TV expliqué en deux lignes (« Synchro TV », puis « Je le vois ! »), connexion F1 TV Pro si vous l'avez, et
  le choix de l'interface. Chaque écran peut être passé.
- Interface « Essentiel » ou « Complète » sur ordinateur (Réglages → Apparence → Interface). Essentiel garde
  l'essentiel : classement, carte, radios, duel, arrêts, stratégie, bagarres et alertes ; l'analyse détaillée, les
  outils techniques, le streaming et les lumières reviennent en un clic avec « Complète ». Les nouvelles
  installations démarrent en Essentiel ; rien ne change pour les installations existantes.

### Télémétrie
- Énergie 2026 estimée sur les compteurs (Télémétrie, Duel, overlay de streaming) : « RECHARGE » quand le
  pilote lève le pied à haute vitesse sans freiner, « BATTERIE VIDE ? » quand il est à fond mais que la voiture
  n'accélère plus, et le temps passé dans chaque cas sur le dernier tour. La F1 ne publie pas la charge de la
  batterie : ce sont des estimations tirées de la vitesse, de l'accélérateur et du frein.

### En direct
- Pause (touche P ou bouton ⏸ à côté du délai) : vous mettez la TV en pause, l'appli aussi ; le délai grandit
  pendant la pause et l'appli reprend en même temps que votre image.
- « Pendant votre absence » : fenêtre réduite plus de 2 minutes pendant une séance, la liste des moments clés
  passés entre-temps (drapeaux, changements de leader, arrêts, abandons, pénalités) s'affiche à votre retour.
- Classement : les pénalités en temps pas encore purgées s'affichent à côté du pilote (« +5 s »).
- Nouvelles alertes (Réglages → Alertes) : pluie qui commence ou s'arrête sur le circuit, pilote favori qui passe
  en zone d'élimination en Q1 et Q2, et pronostic pas encore fait une heure avant sa fermeture.
- Mini-classement : colonnes au choix (menu ⋮ : places gagnées, intervalle, écart, pneu, arrêts) et ligne
  d'élimination en qualifications. Dans l'application de bureau, sa fenêtre prend toute seule la taille de son
  contenu (colonnes choisies, nombre de pilotes) ; − / +, Ctrl + molette ou le coin règlent sa taille, gardée
  pour la prochaine fois.
- Radios d'équipe : réglage du volume ; les commentaires F1 TV baissent pendant une radio (« Plus bas pendant
  les radios », dans le panneau des commentaires).
- Radios d'équipe : les radios affichées « (pas de parole reconnue) » après un ancien échec de transcription sont
  redemandées au serveur (une fois à chaque lancement) et retrouvent leur texte.

### Direction de course
- Messages de la direction de course en vrai français : drapeaux, incidents, enquêtes, pénalités, tours
  supprimés, voiture de sécurité… sont traduits par l'appli elle-même, sans les phrases incompréhensibles de la
  traduction automatique (« incident inclusif »…), et même sans connexion au serveur. Les alertes de vos pilotes
  favoris et la liste des événements sont aussi en français.
- Nouveau filtre « Mes favoris et le duel » : seulement les messages qui parlent de vos pilotes.

### Navigation
- Bouton « Direct » de la barre latérale pendant un replay : retour au direct (écran d'attente s'il n'y a pas
  de séance en cours), au lieu de rester sur le replay.

### Actu
- Vidéos YouTube que leur chaîne ne laisse lire que sur YouTube (chaîne officielle de la F1…) : au lieu de « Cette
  vidéo n'est pas disponible », leur image et un bouton « Regarder sur YouTube ».
- Trois sources françaises de plus : Nextgen-Auto, Le Figaro et la chaîne YouTube CANAL+ Sport (seulement ses vidéos
  F1, pas le foot ni la F1 Academy).
- Les chaînes YouTube qui parlent aussi d'autre chose (Ferrari, Alpine) ne montrent plus que leurs vidéos F1 dans l'appli.
- Moins de doublons : le même article publié en plusieurs langues (Motorsport.com en anglais, en français, en espagnol…)
  est reconnu grâce aux titres traduits et compté comme un seul sujet dans l'Actu.
- Type de news (transfert, départ, pénalité…) lu sur le titre : un mot du résumé ne suffit plus à afficher
  « TRANSFERT » sur une news qui n'en est pas une.

### Mises à jour
- Versions bêta : nouveau réglage « Recevoir les versions bêta » (Réglages → Application) pour essayer les
  nouveautés avant leur sortie pour tout le monde. Décoché, l'appli ne reçoit que les versions finales.
- Au lancement, une mise à jour en cours de téléchargement peut attendre : « Plus tard » ouvre l'appli tout de suite,
  la nouvelle version s'installe à la fermeture.

### Fiabilité et sécurité
- Le relais des radios et de F1 TV refuse les adresses de l'ordinateur et du réseau local : un appareil connecté par
  le QR code ne peut plus s'en servir pour agir comme s'il était l'ordinateur.
- Enregistrements des séances : les 15 plus récents sont gardés (environ 3 week-ends), les plus anciens s'effacent
  tout seuls ; « Mes enregistrements » montre la place prise et propose « Tout supprimer ».
- Badge « LIVE · figé » (orange) quand le flux F1 n'envoie plus rien depuis 25 s ; une connexion bloquée au départ
  (Wi-Fi d'hôtel, sortie de veille) est relancée au bout de 15 s.
- Lancer un replay pendant une séance en direct demande confirmation ; un replay qui ne se charge pas le dit
  clairement, avec le chemin du retour au direct.
- Commentaires F1 TV et radios : après une coupure passagère, la lecture repart toute seule (3 essais).
- Une fenêtre qui plante se recharge toute seule au lieu de rester blanche.
- Notifications du système traduites en anglais avec l'interface ; l'option s'appelle « Notification du système »
  (et plus « Windows ») sur tous les systèmes.

### Divers
- Carte : le bandeau « Fin de VSC » reste lisible quand une voiture passe dessous.
- Menu « Colonnes » du classement : il n'est plus coupé à gauche quand le panneau est étroit.
- Replays : toujours lancés 1 minute avant le départ (le choix « début de l'enregistrement » disparaît).
- Un clic ou un double-clic dans le vide ne surligne plus de texte ; les textes à copier (articles, radios, direction de
  course, champs) restent sélectionnables.
- Saison : graphiques des pilotes, des duels et des évolutions techniques à la bonne taille sur les grands écrans ;
  courbe des points un peu plus haute.
- Barre latérale : « Commentaires » ne dépasse plus de son bouton.
- Documents FIA (barre du haut) : ceux du prochain Grand Prix apparaissent dès leur publication, avant les premiers
  essais, et sont affichés d'office entre deux week-ends (au lieu de ceux du Grand Prix précédent).
- Compteur de tours (design Broadcast) : « TOURS » et le numéro sont centrés dans leur case blanche, avec la barre
  d'avancement (séance en cours) comme sans elle (séance terminée).
- Petites améliorations internes.

## v1.27.54 — 2026-10-20

### Divers
- Petites améliorations internes.

## v1.27.53 — 2026-10-19

### Réglages
- Réglages redessinés, plus lisibles : chaque rubrique est rangée en cartes, chaque réglage a son nom (et une
  courte explication) à gauche et sa commande à droite.
- Panneaux visibles, colonnes du classement et alertes présentés en tuiles ; bouton « Tester » des alertes en haut
  de la carte ; favoris en pastilles plus grandes.
- Disposition : fenêtres, onglets et réinitialisation regroupés dans une carte « Fenêtres ».
- Nouveautés : toutes les versions sont repliées et seules les 6 dernières sont listées, les autres avec
  « Versions précédentes ».
- Raccourcis clavier présentés en liste.

### Météo
- Fenêtre Météo refaite, beaucoup plus visuelle : ciel du moment en grand (soleil, nuages, pluie, orage…),
  température, piste sur une échelle de couleurs, rose des vents (d'où vient le vent), humidité, pression et pluie.
- Prochaines heures (ciel, température, risque de pluie) et jours du week-end avec les séances de chaque jour.
- Radar de pluie zoomé sur le circuit, son tracé dessiné par-dessus ; vues « Alentours » et « Région » pour voir
  la pluie arriver, échelle des distances, légende, et prévision à 30 min.
- Nouvelle vue « Windy » : carte animée de la pluie, du vent et des nuages, avec ses prévisions.

### Navigation
- Touche Échap partout : elle ferme aussi le panneau Commentaires (le son continue), la page Résultats et les
  petits menus « Dispo. » et thème (Accueil, Saison, Actu et Replays se fermaient déjà).
- Plus de scintillement du tableau de bord en passant d'une page à l'autre (Accueil, Direct sans séance,
  Saison, Actu…) : la nouvelle page couvre l'écran tout de suite, seul son contenu apparaît en douceur.

### Mini-classement et carte flottante
- Mini-classement toujours entier : les 20 pilotes s'adaptent à la taille de la fenêtre (plus grande à
  l'ouverture), et grossissent quand on l'agrandit.
- Mini-classement et carte flottante reprennent leur place au premier plan quand on clique dans une vidéo en
  plein écran (navigateur, lecteur).

### F1 TV
- Extension Paddock Live Companion pour Firefox : paquet sans avertissement (Firefox 140 ou plus récent).

### Divers
- Petites améliorations internes.

## v1.27.52 — 2026-10-19

### Divers
- Petites améliorations internes.

## v1.27.51 — 2026-10-19

### Records du circuit
- Pole et meilleur tour des éditions précédentes (comparaison des temps) lus dans les résultats officiels publics : ils ne dépendent plus des archives de la F1, qu'elle refuse parfois même avec la connexion F1 TV.

### Mises à jour
- Téléchargement de l'appli et des mises à jour bien plus rapide : les fichiers viennent d'un serveur proche (Cloudflare) au lieu de GitHub aux États-Unis, en plusieurs morceaux à la fois (GitHub reste en secours). Pour les mises à jour, effet à partir de la suivante.

## v1.27.50 — 2026-10-19

### Actu
- Les livrées spéciales des écuries et les tenues spéciales des pilotes (combinaison, casque), présentées pour un Grand Prix, sont repérées dans toutes les langues, avec leurs étiquettes « Livrée » et « Tenue », et toujours gardées parmi les infos du moment.

### Interface
- Explications plus courtes partout : réglages, info-bulles, légendes, messages, Saison et Pronostics (en français et en anglais).

### Divers
- Petites améliorations internes.

## v1.27.49 — 2026-10-19

### Divers
- Petites améliorations internes.

## v1.27.48 — 2026-10-19

### Divers
- Petites améliorations internes.

## v1.27.47 — 2026-10-18

### Interface
- Les légendes sous les panneaux sont masquées par défaut : à afficher dans Réglages → Apparence.
- Version anglaise complète : les derniers textes restés en français sont traduits (réglages, connexion F1 TV,
  actualités, arrêts, pronostics…).

### F1 TV
- Si la connexion par la fenêtre « Se connecter à F1 TV » échoue, le message indique ce que formula1.com a
  enregistré : de quoi corriger vite si le site change encore.
- Extension Paddock Live Companion 1.0.4 : une ancienne connexion expirée (ancien site formula1.com) ne bloque
  plus la connexion actuelle.

## v1.27.46 — 2026-10-18

### Interface plus légère
- Beaucoup moins de texte d'explication : réglages, aides de l'espace Saison et notes des panneaux vont à
  l'essentiel.
- Les légendes sous les panneaux ne gardent que les repères de couleur et les badges (classement, carte, duel,
  comparaison de tours).

## v1.27.45 — 2026-10-18

### F1 TV
- La connexion F1 TV fonctionne de nouveau avec le site formula1.com actuel, qui range désormais la connexion
  ailleurs : l'extension Paddock Live Companion (version 1.0.3) et le bouton « Se connecter à F1 TV » de l'appli de
  bureau la retrouvent.
- L'extension est mise en avant dans Réglages → Compte F1 TV (bouton « Installer l'extension ») ; la fenêtre de
  connexion de l'appli reste disponible sans extension. Le rappel « Se reconnecter » ouvre cette page.

## v1.27.44 — 2026-10-18

### Une question, une idée ?
- Joignez jusqu'à 3 captures d'écran ou vidéos à votre message (images jusqu'à 8 Mo, vidéos jusqu'à 40 Mo),
  depuis Réglages → À propos ou depuis le formulaire du site : pratique pour montrer un bug. Ajoutez-les avec le
  bouton, en les glissant sur le formulaire ou en collant une capture (Ctrl+V).

### F1 TV
- Nouvelle extension de navigateur **Paddock Live Companion** (Chrome, Edge et Firefox, lien dans Réglages →
  Compte F1 TV) : connectez-vous sur formula1.com dans votre navigateur habituel, l'appli reçoit la connexion toute
  seule (GPS et télémétrie).
- Connexion simplifiée : il reste le bouton « Se connecter à F1 TV » de l'appli de bureau et l'extension. Le
  favori « récupérer mon jeton » et le copier-coller du cookie disparaissent.

## v1.27.43 — 2026-10-18

### Une question, une idée ?
- Sous le formulaire (Réglages → À propos, et FAQ du site), un lien permet aussi d'ouvrir un ticket sur GitHub
  pour suivre publiquement un bug ou une idée.

## v1.27.42 — 2026-10-18

### Une question, une idée ?
- Nouveau formulaire dans Réglages → À propos : envoyez une suggestion, une question ou un problème directement au
  créateur de Paddock Live. Laissez un e-mail ou un pseudo (facultatif) pour recevoir une réponse.
- Le même formulaire est aussi sur le site, en bas de la FAQ.

### Nouveautés
- Le journal des modifications (Réglages → À propos, et nouveautés d'une mise à jour) n'est plus coupé en morceaux :
  chaque point s'affiche d'un seul tenant, même quand il tient sur plusieurs lignes.

## v1.27.41 — 2026-10-18

### Pronostics entre amis
- Groupes en ligne : « Retirer de mes groupes » enlève un groupe de votre liste sur cet appareil (dans l'appli et
  sur la page web) ; il reste en ligne pour les autres joueurs.
- « Supprimer le groupe » l'efface pour tout le monde, avec les pronostics de tous les joueurs. C'est réservé à son
  créateur ; pour un groupe créé avant cette version, à son seul joueur (ou à n'importe qui s'il est vide).

### Streaming
- Les overlays Podium et Bandeaux ne sont plus décalés vers la droite ni coupés quand la source fait plus de
  900 pixels de large (c'est le cas des bandeaux à leur taille conseillée de 1600 × 160).
- Scènes OBS toutes prêtes : une collection de trois scènes (avant la course, course, podium) avec les overlays
  déjà placés en 1920 × 1080, à importer dans OBS (Collection de scènes → Importer). Fichier
  `docs/obs/paddock-live-obs.json` du dépôt, mode d'emploi dans le guide.

## v1.27.40 — 2026-10-18

### Barre du haut
- La barre du haut ne déborde plus de la fenêtre (par exemple en replay sur un écran de 1920 pixels) : la page ne
  se décale plus sur le côté et la cloche des alertes reste visible. Quand la place manque, la météo de la barre
  n'affiche que les mesures qui tiennent (tout reste dans l'onglet Météo), puis le nom de la séance se raccourcit.
- Sur ordinateur, la page ne peut plus rester décalée vers le bas ou sur le côté (barre du haut cachée, bande vide
  sous la barre du replay) : si elle se décale toute seule, elle reprend aussitôt sa place.

## v1.27.39 — 2026-10-18

### Streaming
- Les overlays ajoutés dans OBS, Streamlabs ou Meld Studio se rechargent tout seuls quand l'appli redémarre, par
  exemple après une mise à jour : ils profitent tout de suite des nouveautés, sans « Actualiser » à la main. Après
  cette mise à jour, actualisez-les une dernière fois (clic droit sur la source → Actualiser) : les overlays ouverts
  avant la v1.27.38 ne suivaient pas encore les réglages faits dans l'appli.
- Réglages → Streaming : un bouton « Par défaut » sur chaque overlay remet son fond (et les colonnes du classement ou
  les calques de la carte) comme au départ ; l'overlay suit aussitôt, les autres ne changent pas.
- Overlay du classement : les 22 pilotes tiennent toujours dans la source, dans OBS aussi (la dernière ligne pouvait
  être coupée).

## v1.27.38 — 2026-10-18

### Streaming
- Adresses des overlays fixes : le fond, les colonnes du classement et les calques de la carte se règlent dans
  Réglages → Streaming et s'appliquent tout de suite aux overlays déjà ajoutés dans OBS, Streamlabs ou Meld Studio,
  sans recopier l'adresse ni actualiser la source. Les réglages sont gardés d'un lancement à l'autre ; les anciennes
  adresses avec leurs réglages fonctionnent toujours.
- Overlays nets quelle que soit leur taille : tailles conseillées doublées (le classement en 680 × 1280…), le classement
  s'agrandit maintenant avec la source, et plus rien n'est rogné en bas des overlays. Pour les agrandir dans OBS,
  changez la taille de la source plutôt que d'étirer son cadre (c'est ce qui rendait l'image floue).
- Réglages → Streaming : les cases des colonnes du classement et des calques de la carte sont rangées en colonnes
  lisibles (elles se chevauchaient), et l'adresse de la carte ne dépasse plus du cadre.

### Replays
- Pendant un replay, « Replays » est bien allumé dans la barre latérale (et non « Direct ») : la correction de la
  v1.27.37 ne reconnaissait pas un vrai replay.
- Un replay lancé depuis un autre écran (téléphone, second écran) referme aussi l'accueil, et la page Replays
  repère de nouveau la séance en cours de lecture.

## v1.27.37 — 2026-10-18

### Météo
- Entre deux séances, l'onglet Météo montre le circuit du prochain Grand Prix, comme la barre du haut : temps qu'il
  fait sur place (air, humidité, pression, vent, pluie), prévisions des jours du week-end et radar des
  précipitations autour du circuit. Avant, il gardait la météo et le radar de la dernière séance regardée.

### Simulateur d'arrêt
- Le cercle de position bouge en continu, comme la carte : chaque voiture tourne avec sa position sur la piste
  (ligne d'arrivée en haut), et la sortie des stands du pilote choisi le suit. Avant, il n'était mis à jour qu'au
  passage des voitures aux points de chronométrage, le leader restant figé en haut, et semblait au ralenti.

### Replays
- Barre de lecture : au survol, une infobulle donne l'heure et ce que signifient les traits et les zones colorées
  (arrêt, dépassement, incident, pénalité, voiture de sécurité, VSC, drapeaux). Les moments à venir ne montrent que
  leur type, pour ne rien dévoiler.
- « Revoir en replay » sur l'accueil démarre 1 minute avant le départ, comme depuis la page Replays.
- Pendant un replay, c'est « Replays » qui reste allumé dans la barre latérale (et non « Direct »).

### Streaming
- Carte de l'overlay : choisissez les calques affichés (noms, traînées, positions, écarts, virages, secteurs,
  voie des stands, drapeaux…) dans Réglages → Streaming ; l'adresse à copier se met à jour toute seule.
- Fond de chaque overlay (sauf les bandeaux) : de 0 % (sans fond) à 100 %, réglable dans Réglages → Streaming.
- Un seul overlay de classement, plus complet : places gagnées ou perdues, intervalle, écart au leader, pneu et
  nombre de tours, arrêts. Vous cochez les colonnes à afficher (par défaut : places, intervalle et pneu). Les
  anciennes adresses du classement fonctionnent toujours.
- Les overlays restent en thème sombre, même si l'ordinateur est en thème clair.
- Bandeaux de l'overlay : tous de la même taille (VSC, voiture de sécurité, drapeaux jaune, vert, rouge, damier),
  sur une seule ligne.

### Téléphone
- Carte : le menu « Calques » s'ouvre au-dessus de la barre du bas et défile au doigt (il était coupé).
- Carte plus lisible sur téléphone : au premier affichage, seuls les noms des pilotes, les positions, les
  secteurs et la voie des stands restent affichés. Les autres calques se réactivent dans « Calques », et vos
  choix sont gardés.
- Barre de replay plus compacte : deux lignes au lieu de trois (lecture et barre de progression, puis heure,
  ±10 s, vitesses, moments et fermeture), pour laisser plus de place au panneau affiché.
- Radios plus lisibles : en version simplifiée, la barre ne garde que le filtre des pilotes et « Lecture auto »
  (transcription et traduction restent dans la version complète).

## v1.27.36 — 2026-10-18

### Démarrage
- Écran de chargement au lancement : l'appli reste floutée, avec le logo et un indicateur, jusqu'à ce que l'accueil
  soit complet (prochaine séance, favoris et actualités), au lieu de s'afficher par morceaux.

## v1.27.35 — 2026-10-18

### Mises à jour
- Le bandeau « nouvelle version prête · Redémarrer », en bas à droite, s'affiche de nouveau : il était caché
  derrière l'accueil, la saison et l'actu.

## v1.27.34 — 2026-10-18

### Streaming (OBS, Streamlabs, Meld Studio, Stream Deck)
- Nouvel onglet Réglages → Streaming : le classement et la carte du circuit à ajouter comme source
  « Navigateur » dans OBS Studio, Streamlabs ou Meld Studio, sur fond transparent. Ils suivent le délai
  TV réglé dans l'application ; le classement montre toujours tous les pilotes, réduit à la taille de la
  source.
- Commandes pour le Stream Deck (ou Bitfocus Companion) : délai TV ±1 s ou ±0,1 s, replay en lecture ou
  pause, −10 s / +10 s. Le délai change aussi dans les overlays et sur les téléphones.
- Cinq nouveaux overlays, chacun dans sa propre source :
  - bandeaux : drapeau rouge, voiture de sécurité, VSC, drapeau jaune, reprise, damier à l'arrivée ;
  - compteur de tours (partie et temps restant en qualifications) ;
  - compte à rebours de la séance en cours, ou de la prochaine séance entre deux Grands Prix ;
  - podium : les trois premiers et leurs écarts ;
  - télémétrie (vitesse, régime, rapport, accélérateur, frein) du pilote suivi dans l'application, qui change
    dès que vous en choisissez un autre.

### Pronostics entre amis
- Podium : un pilote choisi à une place ne peut plus être choisi aux deux autres.
- Les pronostics des autres joueurs s'affichent tout seuls en quelques secondes, sans recharger (dans l'application et sur
  la page web du groupe), sans effacer un pronostic en cours de saisie.
- Retrouvez vos groupes toute la saison : la liste « Mes groupes » (dans Saison → Pronostics et sur
  paddocklive.app/p) les rouvre en un clic, et l'application passe d'un groupe à l'autre. Un lien personnel
  rouvre le groupe avec votre pseudo et vos points sur un autre appareil (téléphone, autre ordinateur).
- Page web du groupe : sur ordinateur, le bouton copie directement le lien ; le partage du téléphone reste sur
  mobile.
- Changer de groupe est immédiat : le groupe choisi s'affiche dès la réponse du serveur, sans attendre la
  mise à jour automatique suivante, et la page web du groupe s'ouvre sans attendre la mise à jour du calendrier.

### Actualités
- Accueil : les dernières actualités sont traduites, y compris celles arrivées depuis l'ouverture de
  l'application.

### Téléphone et tablette
- iPhone, appli ajoutée à l'écran d'accueil : le haut de l'écran n'est plus flou. La page commence sous la
  barre d'état (l'heure, la batterie), claire ou noire selon l'apparence choisie.
- Version simplifiée sur téléphone, avec l'essentiel seulement :
  - Direct : classement, circuit, direction de course et radios ;
  - Saison : calendrier, classements, course au titre, résultats et pronostics ;
  - Actu : toute l'actu, importantes et favoris ;
  - Réglages : apparence, alertes et favoris, délai TV, à propos.
  La version complète reste disponible dans Réglages → Application.
- La barre du bas reste affichée dans la Saison et l'Actu (le bouton « Direct » remplace « Retour au direct »).
- Saison : chaque rubrique s'ouvre en haut de la page, et le calendrier directement sur le prochain Grand Prix.

## v1.27.33 — 2026-10-18

### Pronostics entre amis
- Jouez en ligne, hors du réseau local : créez un groupe dans Saison → Pronostics et envoyez le lien à
  vos amis. Ils pronostiquent la pole et le podium depuis une page web, sans installer l'application ;
  leurs pronostics et le classement s'affichent aussi dans l'application. Chaque pseudo est réservé à
  celui qui l'a choisi. Les pronostics faits sur l'ordinateur restent disponibles à part.

### Documents FIA
- Les documents s'ouvrent directement dans l'application, dans une visionneuse, au lieu d'être
  téléchargés. Un bouton les ouvre aussi dans le navigateur. Sur téléphone, ils s'ouvrent dans un onglet.
- Les documents des autres Grands Prix de la saison s'affichent tout de suite : leurs listes sont
  préparées pendant que le menu est ouvert, puis gardées sur l'ordinateur, comme les PDF déjà ouverts.

### Agenda
- « Ajouter à mon agenda » propose maintenant de s'abonner au calendrier des séances, sans fichier à
  télécharger : en un clic dans Apple Calendrier, Outlook ou Google Agenda. Le calendrier se met à jour
  tout seul si les horaires changent. Le fichier .ics reste disponible.

### Corrections
- Résumé de fin de course : le Grand Prix de Bahreïn, couru cette année en Malaisie, porte son nom
  en français.

### Divers
- Petites améliorations internes.

## v1.27.32 — 2026-10-18

### Barre du haut
- Entre deux séances, la barre du haut présente le prochain Grand Prix au lieu de la dernière séance :
  nom, ville et dates du week-end, compte à rebours de la prochaine séance, nombre de tours et longueur
  du circuit, heure locale sur le circuit, heure de départ de la course et météo prévue ce jour-là.
  Elle repasse sur la séance dès qu'elle commence, pendant un replay ou en ouvrant les résultats.

### Divers
- Petites améliorations internes.

## v1.27.31 — 2026-10-17

### À propos
- L'application est publiée sous licence MIT (le serveur sous licence AGPL v3) :
  mention « © 2026 Paddock Live · Licence MIT » dans Réglages → À propos (lien vers le texte de la
  licence), sur le site et dans les conditions d'utilisation. Le nom « Paddock Live » et le logo ne
  sont pas couverts par la licence.

## v1.27.30 — 2026-10-17

### Carte flottante
- Menu « Calques » dans la barre de la carte flottante (icône des réglages, au survol) : noms des
  pilotes, traînées, écarts, numéros de virage, secteurs… s'activent et se désactivent sans revenir
  dans la fenêtre principale.
- Plus aucun fond, même léger : le halo et la trame de points (« Fond texturé ») ne sont plus dessinés
  sur la carte flottante, il ne reste que la piste et les voitures.

### Mini-classement sans fond
- Application de bureau : le mini-classement s'ouvre comme la carte flottante, sans cadre ni fond, au-dessus
  de tout. Chaque ligne est une pastille translucide posée sur la vidéo. On le déplace en le glissant ; au
  survol, une petite barre en bas change sa taille (− / +) ou le ferme ; le coin en bas à droite et
  Ctrl + molette règlent aussi la taille.

### Résultats
- Nouvelle page **Résultats** (barre latérale, à la place d'Analyse ; menu Plus sur téléphone) : podium
  avec écarts et place au départ, belles remontées et courses difficiles, stratégie du leader et la plus
  courante en pneus, neutralisations, abandons, pénalités, meilleur tour, puis le classement complet
  (grille et places gagnées, écart ou abandon, tours, arrêts, pneus utilisés, meilleur tour ; Q1, Q2, Q3
  et écart à la pole en qualifications). Au rythme du délai TV. Sur grand écran, les cartes à gauche et le
  classement à droite : tout tient sur un écran.
- Sous les cartes, un graphique : en course, la **stratégie de chaque pilote** (relais colorés selon le
  pneu, avec le nombre de tours) ; en qualifications et en essais, l'**écart de chacun au meilleur tour**.
- Sous le classement, les **chiffres de la séance** (arrêts aux stands, pilotes classés, abandons,
  neutralisations, temps supprimés pour les limites de piste, enquêtes, pénalités, températures) ; en bas
  de page, des raccourcis vers le résumé à copier, le classement du championnat et la course au titre.
- « Voir les résultats » (accueil et écran « Pas de séance en direct ») ouvre cette page.
- Les graphiques d'analyse restent dans leurs onglets du tableau de bord (Écarts, Temps, Secteurs,
  Comparaison, Télémétrie).
- Le **Résumé** est maintenant visuel : les mêmes cartes (podium, remontées, pneus, neutralisations,
  abandons, meilleur tour) ; le texte rédigé reste copiable.

### Saison : Course au titre
- Nouvelle vue « Course au titre » : qui peut encore être champion, chez les pilotes (avec leur portrait)
  et chez les constructeurs (avec leur logo). Un pilote ou une écurie est éliminé quand ses points, plus
  le maximum encore à prendre dans les courses et sprints restants, ne rattrapent plus le leader : il
  passe alors en gris, avec la manche où il a été éliminé. Pour chacun : points, écart au leader, maximum
  atteignable, et une barre (points actuels, ce qu'il peut encore marquer, position du leader).
- En tête : courses et sprints restants, points encore à prendre ; le champion est annoncé dès que le
  titre est joué.
- Quand le titre peut se jouer : le premier Grand Prix où le leader peut être sacré au plus tôt et, dans
  un petit tableau, toutes les conditions pour l'être dès le prochain Grand Prix, rival par rival : points
  à prendre sur le week-end, et place que le rival ne doit pas dépasser si le leader gagne ou finit 2e.

### Portraits des pilotes
- Les mêmes portraits officiels de la saison partout (Duel, Radios, Course au titre), quelle que soit la
  séance chargée : plus de photos d'années différentes d'un pilote à l'autre, et un portrait aussi pour
  les pilotes que la F1 laisse sans photo (Lindblad) ou absents de la séance (Tsunoda).

### Saison : Duels
- La vue « Coéquipiers » devient « Duels » et occupe toute la largeur : le duel à gauche, l'écart en
  qualification à droite (l'un sous l'autre sur un écran étroit).
- Écurie choisie d'un clic sur son logo (toutes les écuries affichées), logos à côté des noms des pilotes.
- Nouveau : « Pilote contre pilote ». On choisit deux pilotes de n'importe quelles écuries et on compare
  duels en qualification et en course, points, victoires, podiums, poles, arrivées dans les points,
  abandons, note de la saison et écart en qualification, chacun dans la couleur de son écurie.

### Actu
- L'anti-spoiler des actualités ne s'active plus que pendant une séance en direct : pendant un replay,
  les titres restent visibles et les alertes d'actualité continuent.
- Actus déjà lues : un article ouvert passe en « Lu » et sa carte est grisée ; le bouton « Lu » (au
  survol de la carte) marque ou démarque une actu à la main, « Tout marquer comme lu » toute la liste.
  Gardé sur cet appareil.

### Mise en page
- Records du circuit (onglet Secteurs) : pole et meilleur tour en course rangés en colonnes, chaque année
  sous la même année, noms et temps alignés.
- Saison → Classements : le graphique « Évolution des points » garde une taille normale sur grand écran
  (textes et courbes ne sont plus agrandis avec la largeur).

### Corrections
- Duel : le nombre d'arrêts n'affiche plus « undefined » (en replay comme en direct).
- Carte flottante : plus de messages d'alerte (arrêts, drapeaux…) par-dessus la carte, ni de son en double
  avec la fenêtre principale.
- Carte : les bulles d'écart (moins d'une seconde) ne sont plus coupées au bord de la carte, surtout
  dans la carte flottante ; près du bord, elles passent de l'autre côté du tracé.
- Thème clair : les noms des pilotes et les temps sont de nouveau lisibles dans la bulle qui apparaît au
  survol des graphiques d'analyse (écarts, positions, temps au tour) ; textes des drapeaux de la carte
  lisibles aussi.
- Le Grand Prix de Bahreïn couru en Malaisie (manche 16 de 2026) s'affiche « Bahreïn (Malaisie) », et
  « Grand Prix de Bahreïn en Malaisie » en entier, au lieu de « Bahrain Grand Prix in Malaysia ».
- Version anglaise : le bouton « Revoir … » de l'écran « Pas de séance en direct » est traduit, ainsi que
  « en faveur de … » sous les écarts en qualification des Duels.

## v1.27.29 — 2026-10-17

### Favoris
- Pilotes et écuries favoris se choisissent maintenant depuis l'accueil : bouton « Modifier » (ou « Choisir
  mes favoris ») sur la carte des favoris, puis un clic sur les pilotes et les écuries.
- Nouveau : écuries favorites. Elles apparaissent sur l'accueil avec leur place, leurs points et leurs
  victoires au classement des constructeurs, et leurs actualités sont mises en avant (filtre « Favoris »
  et alertes d'actualités). Elles se règlent aussi dans Réglages → Alertes & favoris.

### Nouveaux Réglages
- Réglages entièrement redessinés : rubriques à gauche avec un résumé de chacune, titre de la rubrique
  en haut, réglages rangés en cartes et en listes (texte à gauche, interrupteur ou menu à droite).
- Recherche dans tous les réglages : tapez un mot (délai, langue, favoris, téléphone…) pour afficher
  les réglages correspondants, quelle que soit leur rubrique.
- Nouvelle rubrique « À propos » (nouveautés, réseaux, informations légales).
- Compte F1 TV plus simple : l'état de la connexion en tête, les méthodes manuelles (navigateur, jeton)
  repliées dans l'application de bureau.
- Sur téléphone : réglages en plein écran, rubriques en bande défilante en haut.

### Carte flottante
- Application de bureau : bouton « Flottante » dans le panneau Carte. Le circuit part dans une fenêtre
  sans cadre et sans fond, toujours au-dessus des autres (par-dessus la vidéo, même en plein écran).
  On la déplace en la glissant ; au survol, une petite barre change sa taille (− / +), recadre le
  circuit, la remet dans la fenêtre principale ou la ferme ; le coin en bas à droite et Ctrl + molette
  règlent aussi la taille. Elle se rouvre à sa place au lancement suivant.

### Moins d'onglets
- Les onglets proches sont réunis : « Écarts » (race trace et positions), « Temps » (tours et rythme) et
  « Direction de course » (messages, enquêtes et limites de piste). Un petit sélecteur en haut de chacun
  passe d'une vue à l'autre ; les pastilles des enquêtes et des limites de piste y restent visibles.
- Les onglets inutiles pour la séance chargée sont masqués tout seuls : en qualifications et en essais,
  plus d'Écarts, de Pneus tour par tour, de Stratégie, de Simulateur, de Bagarres ni de Championnat ; en
  course, plus de Comparaison des tours. Ils reviennent à la séance suivante.

### Pas de séance en direct
- Sans séance en cours, « Direct » affiche un écran d'attente au lieu du tableau de bord de la dernière
  séance : prochaine séance avec compte à rebours, et boutons pour revoir la dernière séance en replay,
  voir ses résultats ou parcourir toutes les séances. Le tableau de bord revient tout seul au début de
  la séance suivante.

### Réseaux sociaux
- Bouton « Suivre Paddock Live sur les réseaux » en bas de l'accueil, et « Tous nos réseaux » dans
  Réglages → Application : une page avec Instagram, Facebook, TikTok, YouTube, X, Threads et Bluesky.

### Corrections
- Redimensionnement des panneaux : la barre entre deux panneaux suit enfin la souris jusqu'au bout, et
  le curseur à double flèche ne reste plus bloqué après le relâchement (surtout avec une deuxième
  fenêtre ouverte, qui redessinait la disposition pendant le geste).
- Après avoir glissé un onglet, le clic suivant n'est plus ignoré.
- Déplacer un onglet d'un panneau à l'autre ne recharge plus les autres panneaux : la Direction de
  course garde sa liste et sa position de lecture.

### Mise en page
- Barre de gauche : le libellé « Commentaires » est resserré pour ne plus toucher les bords du bouton.

## v1.27.28 — 2026-10-17

### Accueil
- Votre pilote favori (ou vos favoris) avec sa place, ses points et ses victoires au championnat. Juste
  après une séance, le classement reste flouté pour ne rien gâcher : un clic sur « Afficher » le révèle.
- Météo prévue sur le circuit pour chaque jour du prochain week-end (température et risque de pluie).

### Replays
- Nouvelle page « Replays » dans la barre de gauche : toutes les séances des archives officielles F1,
  classées par Grand Prix et par année, et vos séances enregistrées sur cet ordinateur. Choix du départ
  (1 min avant le départ ou début de l'enregistrement) et bouton « Revenir au direct ». Elle remplace
  l'onglet « Source » des réglages ; la pastille LIVE / REPLAY du haut l'ouvre aussi.
- Archives indisponibles (compte F1 TV non connecté) : un message clair avec un bouton pour connecter
  le compte ou ouvrir vos enregistrements.

### Menus et barre de gauche
- Barre de gauche regroupée : les pages (Accueil, Direct, Analyse, Saison, Actu) d'un côté, les outils
  (Replays, Commentaires, Résumé, Mini…) de l'autre. Le bouton micro s'appelle maintenant « Commentaires ».
- Résumé et Mini sont grisés tant qu'aucune séance n'est chargée.
- Barre du haut : chaque outil a son nom sous l'icône (FIA, Vitesses, Secteurs, Météo) sur les grands écrans.
- Documents FIA : choix du Grand Prix dans la fenêtre, pour consulter les documents des courses précédentes.
- Météo du circuit (températures, vent, pluie, radar) : maintenant dans la barre du haut, à un clic, au lieu
  d'un onglet du panneau Stratégie.

### Réglages
- L'ancien onglet « Affichage » est séparé en deux : « Apparence » (clair / sombre, langue, logos, couleurs,
  légendes, animations) et « Disposition » (panneaux, colonnes, onglets, fenêtres).
- Lumières connectées rangées dans l'onglet « Application ».

### Statistiques anonymes
- La question sur les statistiques d'utilisation n'ouvre plus une fenêtre qui bloque l'écran au premier
  lancement : un petit bandeau dans le coin propose « Oui », « Non merci » ou « Détails », sans gêner
  l'appli. La croix le referme pour cette fois : il revient au lancement suivant tant qu'aucune réponse
  n'est donnée.

### Duel
- Le duel se remplit tout seul : votre pilote favori contre celui qui le précède (ou le suit s'il est en
  tête), sinon le leader contre le deuxième. Vous pouvez toujours choisir d'autres pilotes.

### Téléphone
- Nouvelle barre du bas à 5 boutons : Accueil, Direct, Saison, Actu et « Plus » (Replays, Commentaires,
  Résumé, Réglages). Dans le Direct, les panneaux (Classement, Carte, Course, Duel, Analyse) se choisissent
  dans une bande d'onglets en haut. La barre du haut perd une ligne.

### Mise en page
- Panneaux courts (petits écrans, nombreux panneaux) : la légende se replie en un bouton « Légende »
  qui la déroule par-dessus le panneau. Les tableaux, la carte et les graphiques gagnent toute la place :
  10 pilotes au lieu de 7 dans le classement en 900 pixels de haut, carte et radios enfin visibles.

### En français
- Noms des Grands Prix et des séances en français partout : barre du haut (« Singapour — Course »),
  Saison (calendrier, résultats, profil des circuits, statistiques), pronostics, rappels, choix de Pirelli,
  documents FIA et replays.
- Enregistrements des séances plus lisibles : « GP de Singapour · Course », avec la date.

### Corrections
- Apparence claire : la pastille « Arrivée » de la barre du haut était invisible (texte blanc sur blanc).
- Apparence sombre : le champ « Votre prénom ou pseudo » des pronostics restait blanc.
- Délai TV : le préréglage « Temps réel (0 s) » n'est plus coupé sur les écrans de 1 500 pixels ou moins.
- Commentaires en direct : noms des canaux raccourcis (« International », « F1 Live ») pour ne plus être coupés.

## v1.27.27 — 2026-10-17

### Accueil
- Nouvelle page d'accueil au lancement, sans spoiler : compte à rebours de la prochaine séance (avec ajout à
  l'agenda), dernière séance sans son résultat (« Revoir en replay » depuis le début, ou « Voir les résultats »),
  dernières actualités et raccourcis vers le Direct, la Saison, l'Actu et les Replays.
- L'appli ne s'ouvre plus directement sur le tableau de bord de la dernière séance. Pendant une séance, elle
  s'ouvre toujours sur le Direct.
- Bouton « Accueil » en haut de la barre latérale (en bas de l'écran sur téléphone) pour y revenir.
- Appli de bureau : les fenêtres du second écran ne s'ouvrent plus sur l'accueil, mais seulement en passant
  au tableau de bord (Direct, replay ou séance en cours), pour ne rien dévoiler au lancement.

### Apparence
- Nouveau bouton dans la barre latérale pour choisir l'apparence en un clic : automatique (comme le
  système), sombre ou clair.

## v1.27.26 — 2026-10-17

### Divers
- Petites améliorations internes.

## v1.27.25 — 2026-10-17

### Réglages
- Réglages → Application : la politique de confidentialité et les conditions d'utilisation s'ouvrent sur le site officiel, paddocklive.app.

## v1.27.24 — 2026-10-17

### Divers
- Petites améliorations internes.

## v1.27.23 — 2026-10-16

### Radios
- Radios inaudibles (son des caméras embarquées couvert par le moteur, radio hachée) : le charabia que la reconnaissance vocale inventait parfois (« Goldmannutformificeyan… », caractères illisibles ou d'un autre alphabet) n'est plus affiché, la radio compte comme « pas de parole reconnue ». Les transcriptions déjà enregistrées sont nettoyées aussi.
- La traduction ne « répond » plus à la place de traduire (« Je ne comprends pas cette séquence, peux-tu reformuler ? ») : ces réponses sont refusées et la traduction est refaite.

### Réglages
- Réglages → Application : liens vers la politique de confidentialité et les conditions d'utilisation.

### Divers
- Petites améliorations internes.

## v1.27.22 — 2026-10-16

### Divers
- Petites améliorations internes.

## v1.27.21 — 2026-10-16

### Synchro TV
- Préréglages du délai valables dans tous les pays : « TV : antenne, satellite, câble ou box » (≈ 10 s) et « Streaming : appli ou site web » (≈ 40 s) remplacent ceux de Canal+ et myCANAL. Ce ne sont que des points de départ : le délai se calibre toujours avec la synchro TV, et vos propres préréglages restent en place.

## v1.27.20 — 2026-10-16

### Corrections
- Classement et en-têtes des panneaux : ajustement plus fluide quand la fenêtre change de taille (plus d'avertissement « ResizeObserver » remonté comme une erreur).

## v1.27.19 — 2026-10-16

### Actu
- Nouvelles chaînes officielles : Scuderia Ferrari, Williams, Alpine et Cadillac pour les écuries ; Max Verstappen, Oscar Piastri, Esteban Ocon, Oliver Bearman, Checo Pérez, Liam Lawson et Arvid Lindblad pour les pilotes. Pour Ferrari et Alpine, seules les vidéos qui parlent de F1 sont gardées.
- Vidéos YouTube : l'appli de bureau se présente maintenant à YouTube comme Chrome, pour que les vidéos se lisent dans l'Actu au lieu d'afficher « Cette vidéo n'est pas disponible ».

### Interface
- Les champs de saisie (nom d'un préréglage de délai, adresse d'une source d'actu ou d'une radio, jetons de connexion, date…) ont maintenant la même allure que le reste de l'application, en thème sombre comme en clair.
- Petites améliorations internes.

## v1.27.18 — 2026-10-16

### Corrections
- Petites améliorations internes.

## v1.27.17 — 2026-10-16

### Corrections
- Radios retranscrites : une phrase répétée en boucle par la reconnaissance vocale (« plus facile, plus facile, plus facile… ») n'apparaît plus qu'une fois, dans le texte comme dans sa traduction, y compris pour les radios déjà retranscrites.
- Les messages de confirmation et d'erreur s'affichent désormais aussi quand une fenêtre est ouverte par-dessus l'appli : ils restaient cachés derrière.
- Petites améliorations internes.

## v1.27.16 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.15 — 2026-10-16

### Corrections
- Synchronisation avec la TV : sur téléphone, le bouton « Enregistrer le délai actuel » ne dépasse plus de la fenêtre.

## v1.27.14 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.13 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.12 — 2026-10-16

### Actu
- La source espagnole SoyMotor, qui bloque désormais la lecture de ses actus, est remplacée par Motorsport.com España.

### Améliorations
- Petites améliorations internes.

## v1.27.11 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.10 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.9 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.8 — 2026-10-16

### Améliorations
- Petites améliorations internes.
- Code de passage de « F1 Dash » à « Paddock Live » retiré : une installation restée en v1.24 ou avant ne retrouve plus ses réglages en passant directement à cette version (installer d'abord la v1.27.7 pour les garder).

## v1.27.7 — 2026-10-16

### Améliorations
- Petites améliorations internes.

## v1.27.6 — 2026-10-15

### Améliorations
- Petites améliorations internes.

## v1.27.5 — 2026-10-15

### Actu
- **Les articles s'ouvrent dans l'appli** : un clic sur un titre affiche l'article directement dans Paddock Live (titre, photo, auteur, date et texte complet, sans menus ni publicités), avec le titre et le résumé traduits en français, puis le texte de l'article en version originale. Bouton *VO* pour le titre et le résumé d'origine, *Ouvrir sur le site* si besoin. Échap ou *Retour à l'actu* pour revenir à la liste, au même endroit.
- **Les vidéos YouTube se regardent dans l'appli** (lecteur intégré) et les publications des pilotes s'affichent en entier.
- Site qui refuse la lecture, page vidéo ou article réservé aux abonnés : le résumé est affiché avec un bouton pour le lire sur le site. Ctrl + clic (Cmd sur Mac) ouvre toujours l'article dans le navigateur.

### Statistiques d'utilisation
- **Erreurs plus détaillées** (pour les corriger plus vite) : avec l'accord pour les statistiques, une erreur envoie maintenant, en plus du fichier et de la ligne, son message technique et le chemin d'appel (noms des fonctions et des fichiers de l'appli), ainsi que les erreurs du serveur de l'appli. Le message est nettoyé avant l'envoi : adresses web, noms de dossiers, e-mails et longs nombres sont retirés. Toujours rien qui permette d'identifier quelqu'un.

## v1.27.4 — 2026-10-15

### Actu
- **Les actualités sont traduites d'avance** : dès qu'un article arrive, même page fermée (et au lancement pour ceux des derniers jours), son titre et son résumé sont traduits par le serveur Paddock Live. La page Actu s'ouvre directement en français.
- **Plus de caractères étrangers dans les traductions** : le modèle de traduction glissait parfois des caractères chinois ou japonais dans le texte (« Laurent Mekies将继续… ») ou laissait un titre japonais tel quel. Ces traductions sont maintenant détectées et refaites, y compris celles déjà gardées.
- Barre de recherche aux couleurs de l'application (même style que les listes, loupe, bouton pour effacer).

### Direction de course
- **Messages traduits en français** par le serveur Paddock Live (case *Traduire* du panneau, activée par défaut) : drapeaux, pénalités, limites de piste… avec le vocabulaire de la F1 (« commissaires », « limites de piste »). Le message d'origine s'affiche au survol.

### Corrections
- Traduction en ligne : un envoi trop long (résumés d'articles) mettait la traduction en ligne en pause pendant 10 minutes. Les envois sont maintenant découpés.
- **Second écran : les panneaux ne disparaissent plus.** Une fenêtre secondaire gardait une disposition par type de séance : au changement de séance (chargement d'un replay de qualif après une course, par exemple), elle reprenait une ancienne disposition et ses panneaux revenaient dans la fenêtre principale. Elle garde maintenant les mêmes panneaux quelle que soit la séance.
- Panneau dont tous les onglets ont été déplacés : impossible de le masquer (sa barre s'aplatissait et le contenu recouvrait la croix). La barre garde sa hauteur, et un bouton « Masquer ce panneau » est proposé dans le panneau vide.

## v1.27.3 — 2026-10-15

### Radios d'équipe
- **La transcription des radios passe aussi par le serveur Paddock Live** : plus aucun modèle de reconnaissance vocale à faire tourner sur l'ordinateur, l'appli reste légère même pendant un replay riche en radios. Chaque radio n'est transcrite qu'une fois pour tous les utilisateurs (Whisper large-v3-turbo, le modèle de la haute qualité), donc souvent instantanément.
- Les radios déjà transcrites sur l'ordinateur en qualité légère sont refaites par le serveur quand elles s'affichent.
- Seul le son de la radio est envoyé (pris dans les archives F1, comme pour l'écoute) ; une radio déjà transcrite est reconnue sans renvoyer le son. Même réglage que les traductions (Réglages → Application → *Traductions*) ; si le serveur ne répond pas, la transcription se fait sur l'ordinateur comme avant.

## v1.27.2 — 2026-10-15

### Traductions en ligne
- **Les traductions passent maintenant par le serveur Paddock Live** (actualités, radios d'équipe, documents FIA) : plus aucun modèle de traduction à faire tourner sur l'ordinateur ou le téléphone, et chaque texte n'est traduit qu'une fois pour tous les utilisateurs, donc souvent instantanément.
- Traductions faites par un modèle de langage (Mistral Small 3.1) qui connaît la F1 : noms des pilotes et des écuries gardés tels quels, vocabulaire des fans (« rentre aux stands », « tendres »…).
- Seuls les textes à traduire sont envoyés (titres et résumés d'articles, texte des radios), rien d'autre. Désactivable dans Réglages → Application → *Traductions* ; si le serveur ne répond pas, la traduction se fait sur l'ordinateur comme avant.
- Sur le téléphone, les actualités sont traduites directement, sans attendre l'ordinateur.

### Radios d'équipe
- **Radios des caméras embarquées retirées pour le moment** : l'écoute et la transcription en continu étaient trop lourdes pour l'ordinateur.
- **Transcription et traduction des radios beaucoup plus légères par défaut** : elles utilisent désormais les petits modèles (environ 1 Go de mémoire, sans solliciter la carte graphique). La haute qualité, plus précise mais gourmande (10 à 15 Go pendant l'utilisation), reste disponible dans le choix « Qualité » du panneau Radios.
- Quel que soit l'ordinateur : seules les 12 radios les plus récentes sont retranscrites et traduites automatiquement (40 avant), avec une courte pause entre deux, pour que l'appli reste fluide, en particulier au lancement d'un replay.

### Actu
- **« Qui fait l'actu » : les barres ne se réaniment plus sans arrêt.** Chaque titre traduit redessinait toute la page ; seuls les morceaux qui changent sont maintenant mis à jour, et les traductions sont affichées par paquets (au plus une mise à jour toutes les 1,5 s), ce qui allège aussi la page.
- **Traduction des actualités beaucoup plus économe** : seuls les articles visibles à l'écran sont traduits (avant : les 40 premiers titres et 12 résumés d'un coup), et plus rien n'est traduit en arrière-plan page fermée, sauf les actus qui déclenchent une alerte. Les traductions déjà faites restent gardées.

### Corrections
- Bandeau en haut de l'écran et carte : « Voiture de sécurité » et « Voiture de sécurité virtuelle » en français (ils restaient en anglais).
- Fenêtres secondaires (second écran) : le titre de la fenêtre ne clignote plus entre le nom de la séance et celui des panneaux.

## v1.27.1 — 2026-10-15

### Replays
- **La F1 a fermé l'accès libre à ses archives** (replays, statistiques de la saison, records, jeux de pneus des séances précédentes) : Paddock Live utilise désormais votre **connexion F1 TV** pour y accéder, puis une copie publique des archives si besoin. Sans connexion F1 TV, un message clair l'indique au lieu de « HTTP 401 ».
- Les radios d'équipe des replays (écoute et transcription) passent par le même accès.
- Vos enregistrements des séances suivies en direct restent rejouables sans connexion.

### Mémoire et mises à jour
- **Transcription des radios : beaucoup moins de mémoire.** Les modèles (plusieurs Go en haute qualité) sont libérés quand la transcription est coupée, et après 5 minutes sans radio à traiter ; ils se rechargent tout seuls à la radio suivante.
- La mémoire occupée par la transcription en haute qualité (10 à 15 Go pendant l'utilisation sur Mac) est indiquée dans l'infobulle du choix de qualité ; la qualité légère en utilise environ 1 Go.
- **Mémoire utilisée affichée** dans Réglages → Application (application de bureau), avec le détail : serveur, fenêtres, carte graphique.
- **macOS : mises à jour automatiques réparées** quand macOS lance l'appli depuis une copie temporaire (appli non signée par Apple) : la mise à jour remplace l'appli du dossier Applications.

## v1.27.0 — 2026-10-15

### Statistiques d'utilisation anonymes
- **Au premier lancement, Paddock Live vous demande s'il peut envoyer des statistiques d'utilisation anonymes**, pour savoir quelles fonctions servent le plus ou le moins et améliorer l'appli dans le bon sens. Rien n'est envoyé sans votre accord.
- Choix modifiable à tout moment : Réglages → Application → *Statistiques d'utilisation*.
- Seulement des totaux par jour : fonctions utilisées, version, système, ordinateur ou téléphone, direct ou replay, erreurs rencontrées. Ni connexion F1 TV, ni identifiant, ni contenu ; l'adresse IP n'est pas conservée.

## v1.26.1 — 2026-10-15

### Améliorations
- Petites améliorations internes.

## v1.26.0 — 2026-10-15

### Sauvegarde des réglages
- **Enregistrer ses réglages dans un fichier et les restaurer** (Réglages → Application → *Sauvegarde des réglages*) : affichage, dispositions et fenêtres, colonnes, délais TV mémorisés, carte, analyse, sources d'actualités, lumières connectées. Pratique après une réinstallation ou sur un autre ordinateur.
- La restauration remplace les réglages actuels et recharge toutes les fenêtres ouvertes. Un fichier qui n'est pas une sauvegarde de Paddock Live est refusé avec un message clair.
- Le fichier ne contient ni la connexion F1 TV, ni la clé d'accès du téléphone, ni les clés des lumières connectées.

## v1.25.0 — 2026-10-15

### Nouveau nom : Paddock Live
- **F1 Dash s'appelle désormais Paddock Live**, avec un nouveau logo « F1 PL » (même style rouge). Le nom change partout : fenêtres, raccourcis, appli du téléphone, page GitHub (`github.com/benjamin-ct/paddock-live`), fichiers à télécharger (`Paddock-Live-…`), images exportées des graphiques (`paddock-live-…png`), documentation et captures d'écran.
- **Vos données suivent** : au premier lancement, le dossier de l'ancienne application (réglages, connexion F1 TV, enregistrements, dispositions, position des fenêtres) est repris par Paddock Live.
- **Windows (version installée)** : Paddock Live s'installe à côté de l'ancienne application. Une fois Paddock Live lancé une première fois, désinstallez « F1 Dash » (Paramètres → Applications) et supprimez son raccourci s'il reste. Version portable : supprimez l'ancien fichier `.exe`.
- **Téléphone** : rescannez le QR code (Réglages → Application → « Sur votre téléphone ou tablette »), puis supprimez l'ancienne icône de l'écran d'accueil et rajoutez la nouvelle.
- Calendrier exporté (.ics) : réimporté, il peut doubler les séances déjà ajoutées sous l'ancien nom ; supprimez les anciennes.
- Pour ceux qui lancent le serveur à la main : la variable `F1DASH_DATA_DIR` devient `PADDOCK_DATA_DIR`.

### Corrections
- Capture d'écran « Apparence » de la documentation : le côté sombre montrait le thème clair.
- Fenêtre de connexion F1 TV (appli de bureau) : elle se présente comme un Chrome ordinaire, sans le nom de l'application.

## v1.24.0 — 2026-10-15

### Radios d'équipe façon MultiViewer
- **Nouveau panneau des radios**, sur le modèle des transcriptions de MultiViewer (il remplace les onglets Transcriptions / Audio) :
  - en haut, **une carte par radio** (plus récentes à gauche) : photo du pilote, nom, **tour** et heure, durée, point bleu tant qu'elle n'a pas été écoutée. Un clic la joue : la carte se remplit en cyan de gauche à droite au fil de l'écoute, avec une barre pleine largeur en bas (clic dessus pour avancer) et le temps écoulé (« 0:03 / 0:08 ») ;
  - en dessous, le **fil des radios retranscrites** : photo, texte traduit en grand, anglais d'origine en petit, « pilote · tour · heure ». Un clic rejoue la radio.
- Vitesse de lecture réglable (1× à 2×) ; la lecture automatique des nouvelles radios est toujours là (« Lecture auto »).
- Dans un petit panneau, les réglages des radios tiennent sur une ligne : les cartes restent visibles.
- **Photos des pilotes** (radios, duel) relayées par Paddock Live et gardées en cache : elles s'affichent même quand le site de la F1 refuse les images appelées depuis l'application, sur le téléphone et hors connexion.
- **Toutes les radios, pas seulement celles publiées par la F1 (expérimental, F1 TV Pro)** : la F1 ne publie qu'une sélection des radios (une trentaine par course). Avec la case **Caméras embarquées**, Paddock Live écoute en direct le son de la caméra embarquée du pilote suivi et des pilotes du duel (ou de 3 favoris), y retrouve chaque radio, la retranscrit et la traduit sur cet ordinateur, et l'ajoute au fil (repère « caméra embarquée »), au rythme de votre délai TV : rien n'est dévoilé en avance. Séances en direct ; nécessite les caméras embarquées F1 TV (offre Pro, incluse avec certaines offres Canal+). Si le son embarqué est protégé (DRM), Paddock Live l'indique : il ne peut alors pas être retranscrit.

### Transcriptions et traductions
- **La liste ne se recharge plus sans arrêt** : une traduction terminée ou le chargement d'un modèle ne met à jour que la ligne concernée (le défilement et l'écoute ne sont plus interrompus).
- **Fini les rechargements en boucle** du modèle de traduction : le moteur planté est vraiment arrêté avant d'en relancer un, et après un échec en haute qualité, les nouveaux essais sont de plus en plus espacés.
- Un modèle déjà téléchargé affiche « Chargement du modèle… » au lieu de « Téléchargement (première fois) ».
- Une radio sans parole reconnue n'affiche plus « « - » » mais « pas de parole reconnue ».
- **Traductions plus fiables** : une réponse vide, l'anglais recopié ou une explication à la place de la traduction est détectée et refaite ; en qualité légère, le jargon F1 est corrigé (« Box, box » → « Rentre aux stands », « Copy » → « Reçu », pneus durs / tendres, « lift and coast » → « lever le pied »).

### Onglets déplaçables
- **Glissez un onglet vers un autre panneau** (Analyse, Stratégie, Course, Radios) ou à une autre place dans le sien : par exemple la Race trace à côté de la Stratégie. La disposition des onglets est gardée et suivie par toutes les fenêtres ; Réglages → Affichage → « Remettre les onglets à leur place ».

### Thème clair plus lisible
- Les couleurs d'écurie trop pâles pour le fond blanc (turquoise de Mercedes, bleu ciel, vert clair…) sont assombries automatiquement, en gardant leur teinte : graphiques, classement, actualités…
- Historique des pneus : cases plus marquées et arrêts aux stands encadrés en sombre (le cadre blanc était invisible).
- Actualités : les écuries de « Qui fait l'actu » et des étiquettes prennent leur couleur (elles étaient grises).

## v1.23.1 — 2026-10-14

### Corrections
- **Synchro TV par le son** : si le calcul de reconnaissance ne peut pas démarrer (fichier bloqué, mémoire…), l'écoute ne reste plus figée indéfiniment sur « En écoute ».
- **Pronostics** : un pseudo comme « constructor » ou « __proto__ » est refusé avec un message clair au lieu de faire échouer l'enregistrement.
- Une année invalide demandée à Paddock Live (« 99999 », « 1800 », « 2025.5 ») ouvre la saison en cours au lieu d'afficher une erreur des serveurs de résultats ou de créer une saison vide sur le disque.
- Une requête mal formée envoyée au serveur de Paddock Live est refusée proprement (erreur 400) au lieu de provoquer une erreur interne, y compris pour l'adresse d'une radio en ligne vide ou invalide.
- Sécurité : des données de course ou des traductions contenant des noms réservés du langage JavaScript ne peuvent plus modifier le fonctionnement interne de l'application.

## v1.23.0 — 2026-10-14

### Interface en anglais
- **Paddock Live existe maintenant en anglais** : Réglages → Affichage → **Langue / Language** (Français ou English). Toute l'interface suit : menus, panneaux, légendes, infobulles, graphiques, carte, Saison, Actu, réglages, messages et alertes, mini-classement, téléphone, écran de démarrage de l'application.
- En anglais, les textes rédigés par Paddock Live le sont directement en anglais : résumé de la séance, moments clés du replay, calendrier à ajouter à l'agenda. Les actualités sont traduites en anglais, les radios restent en version originale (anglais) par défaut, et les documents de la FIA et les communiqués de Pirelli s'affichent tels quels.
- Nombres et dates au format anglais (0.5 s, 14 Oct).
- Première ouverture : l'interface prend la langue de l'ordinateur ou du téléphone (français, sinon anglais). Les installations existantes restent en français.

### Arrêts aux stands au plus juste
- **Un passage par les stands n'est plus compté comme un arrêt** quand les pneus ne changent pas : passage imposé par la direction de course sous voiture de sécurité (« tout le monde par la voie des stands »), drive-through… La F1 les compte pourtant comme des arrêts. Le nombre d'arrêts est maintenant juste partout : classement (colonne Arr.), duel, stratégie (le relais n'est plus coupé en deux), résumé de la séance, moments clés du replay, statistiques de la saison (« Arrêts par pilote »). À Bakou 2026, la plupart des pilotes passaient de 2 arrêts affichés à 1, comme en réalité.
- **Simulateur d'arrêt** : le temps perdu au stand est **mesuré pendant la course** sur les vrais arrêts sous drapeau vert (tour d'entrée et tour de sortie comparés aux tours normaux du pilote, un arrêt raté ne faussant pas la mesure), dès que 3 arrêts sont disponibles ; sinon la valeur du circuit. Sous voiture de sécurité ou VSC, la perte est réduite dans la même proportion. L'origine de la valeur est indiquée (« mesuré sur 12 arrêts de la course »).
- Statistiques de la saison : les arrêts sans temps d'immobilisation publié par la F1 sont désormais comptés.

### Replay
- **Barre de lecture sur toute la largeur** : les commandes (±10 s, drapeaux, vitesses, moments clés…) passent sur la ligne du titre, la barre de la séance s'étire d'un bord à l'autre (plus de deux fois plus longue sur un écran d'ordinateur) : placement plus précis, drapeaux et moments mieux séparés.

## v1.22.0 — 2026-10-14

### Synchro TV par le son (expérimental)
- **Le délai se règle tout seul** : dans la fenêtre Synchro TV, bouton **Écouter la TV**. Le micro de l'ordinateur écoute votre TV et, dès qu'une **radio d'équipe** passe à l'antenne, Paddock Live la reconnaît (même avec les commentateurs qui parlent par-dessus) et en déduit le retard exact de votre diffusion. Plus besoin de guetter le compteur de tours pour cliquer au bon moment.
- L'écoute continue ensuite pour confirmer avec les radios suivantes (15 minutes au plus) ; un point clignotant sur le bouton Synchro TV indique qu'elle est en cours.
- **Correction** de ±0,5 s si le calage par le son est toujours un peu en avance ou en retard sur votre image.
- Le son reste sur l'ordinateur : rien n'est enregistré ni envoyé. Disponible dans l'application et le navigateur de l'ordinateur (pas sur le téléphone).

## v1.21.0 — 2026-10-14

### Pendant la course
- **Mini-classement flottant** (bouton Mini de la barre latérale) : petite fenêtre toujours au premier plan, à poser par-dessus la vidéo de la course (F1 TV, Canal+…) : drapeau, tour, classement avec intervalle ou écart au leader, pneus, pilotes suivis et favoris. Même délai TV que la fenêtre principale.
- **Résumé de la séance** (bouton Résumé de la barre latérale) : la course racontée en français — vainqueur et écart, remontées, stratégies, voitures de sécurité, abandons, pénalités, meilleur tour (pole et éliminés en qualifications) — à copier pour le partager. Rien n'est dévoilé en avance : il suit votre délai TV.
- **Radar de la pluie** (onglet Météo) : les deux dernières heures d'images radar autour du circuit, en animation, pour voir la pluie arriver.

### Replays
- **Moments clés** (bouton Moments de la barre de lecture) : départ, drapeaux, changements de leader, dépassements pour le podium, arrêts, abandons, incidents, pénalités, meilleur tour, arrivée — un clic pour y aller, repères de couleur sur la barre. Les moments pas encore vus restent masqués (anti-spoiler).

### Week-ends
- **Rappel avant chaque séance** (Réglages → Alertes) : message, son et notification, de 5 min à 1 h avant (15 min par défaut).
- **Calendrier** : toutes les séances de la saison ou d'un week-end à ajouter à votre agenda (Google, Apple, Outlook), avec une alarme 15 min avant chaque séance, même Paddock Live fermé.
- **Pronostics entre amis** (Saison → Pronostics) : pole et podium de chaque Grand Prix, sur l'ordinateur ou le téléphone, choix cachés jusqu'à la fermeture, points et classement de la saison.

### Lumières connectées (expérimental)
- Vos ampoules **Philips Hue** ou **Home Assistant** prennent la couleur des drapeaux au rythme de votre délai TV (vert, jaune, safety car, VSC, rouge, damier). Mode simulation à l'écran pour essayer sans ampoule. Réglages → Alertes.

### Fluidité
- La carte consomme moins : 30 images par seconde quand elle est petite (60 en grand), et plus aucun calcul pendant une pause du replay.
- Téléphone : tableaux de l'espace Saison plus compacts, colonne du pilote figée pendant le défilement.

## v1.20.2 — 2026-10-14

### Sécurité et fiabilité
- Le serveur ne plante plus sur une adresse mal formée (une seule requête suffisait à arrêter le dashboard).
- Un site web malveillant ouvert dans le navigateur ne peut plus utiliser le dashboard en douce : l'API refuse les requêtes venues d'autres sites et les faux noms de domaine qui pointent vers votre ordinateur (« DNS rebinding »). Cela empêchait notamment de détourner le jeton F1 TV vers un faux domaine imitant formula1.com.
- Le jeton F1 TV n'est envoyé qu'aux vrais domaines de la F1, et le relais vidéo limite les redirections.
- Actualités : les liens et images des flux sont limités aux adresses web ; un flux piégé ne peut plus glisser de lien qui exécute du code. L'application de bureau n'ouvre que des liens web dans le navigateur.
- Une erreur imprévue est consignée sans arrêter le serveur en pleine séance.
- Traductions FIA : l'enregistrement d'une langue n'est plus perdu quand une autre est ajoutée juste après.

### Interface
- Téléphone : les sept onglets de la barre du bas tiennent sur l'écran (« Stratégie » n'est plus coupé).
- Mode clair : le titre « Replay » de la barre de lecture est plus lisible.

## v1.20.1 — 2026-10-14

### Apparence
- L'apparence est désormais **automatique par défaut** : l'application passe en clair ou en sombre comme votre ordinateur ou votre téléphone, et suit ses changements en direct (mode sombre programmé le soir, par exemple). Réglages → Affichage → Apparence pour la forcer en sombre ou en clair ; un choix déjà fait dans les réglages est conservé.
- Application de bureau : la fenêtre s'ouvre directement dans la bonne couleur, sans flash noir en mode clair.

## v1.20.0 — 2026-10-14

### Apparence
- Un seul design pour toute l'application : **Pitwall**. Les anciens designs (F1 Pro, F1 sobre, Classique, Bleu nuit) sont retirés ; si vous en utilisiez un, l'application passe automatiquement sur Pitwall.
- Nouveau **mode clair** : Réglages → Affichage → **Apparence** — Sombre (par défaut), Clair (idéal en plein jour) ou Automatique (suit le réglage de l'ordinateur ou du téléphone). Le changement est immédiat, carte, graphiques et couleurs des pneus compris.

### Carte
- **Petite carte lisible** : quand la carte est petite (tableau de bord, téléphone), elle s'allège automatiquement. Sur une très petite carte, les pilotes deviennent de simples points, et seuls les pilotes suivis sont nommés. Sur une carte moyenne, les pastilles gardent le trigramme, sans numéros de virage, positions ni écarts. Tous les détails reviennent en agrandissant la carte ou en zoomant.
- Le tracé occupe davantage la place disponible sur une petite carte.
- Mode clair : contour et ombre de la piste plus légers.

### Actualités
- Les titres de la colonne de droite (À la une, dernières vidéos) sont eux aussi traduits en français.

## v1.19.0 — 2026-10-14

### Actualités
- Nouvel espace **Actu** (barre latérale, bouton Actu sur téléphone) : toute l'actualité de la F1 au même endroit — site officiel de la F1, communiqués de la FIA, chaînes officielles des écuries et des pilotes, et une trentaine de médias reconnus en 8 langues (Autosport, The Race, BBC, L'Équipe, Marca, La Gazzetta, Motorsport-Total, auto sport web…).
- Titres et résumés traduits en français sur l'ordinateur (même moteur que les radios), texte d'origine en un clic (VO).
- Les articles d'un même sujet sont regroupés (« repris par N sources », pastille quand le sujet fait l'actualité), avec les pilotes et écuries cités en étiquettes.
- Filtres : important, vos favoris, officiel, écuries, pilotes, médias, vidéos, langue, recherche. Pastille rouge du nombre de nouveautés.
- Alertes (son, message, notification) pour les actualités importantes et celles de vos favoris, réglables. Anti-spoiler : titres masqués et alertes suspendues pendant une séance ou un replay.
- Ajout de vos propres sources (site, flux RSS, chaîne YouTube, compte Bluesky) et activation source par source.
- Colonne de droite : sujets à la une (48 h), pilotes et écuries qui font l'actu (24 h, un clic pour ne voir que leurs sujets) et dernières vidéos.

### Design
- Plus aucun emoji ni symbole de police dans l'application : toutes les icônes (menus, boutons, réglages, alertes, carte, téléphone…), les flèches et les triangles des places gagnées ou perdues sont dessinés pour Paddock Live, dans le même style que la barre latérale.
- Nouvelles cases à cocher : interrupteurs aux couleurs du thème pour les options, cases et boutons radio redessinés.
- Téléphone : boutons du haut resserrés pour tenir sur une ligne.
- Animations légères pour une interface plus moderne : panneaux qui apparaissent en cascade au démarrage, fenêtres et menus qui s'ouvrent en douceur, cartes de l'Actu et de la Saison en cascade, cartes qui se soulèvent au survol, boutons qui s'enfoncent au clic, nouvelles actualités surlignées, pastille qui rebondit, onde autour du point du direct. Désactivables dans Réglages, onglet Affichage (« Animations de l'interface »), et coupées automatiquement si le système demande moins d'animations.

## v1.18.0 — 2026-10-14

### Nouveau design « Pitwall »
- Nouveau thème par défaut, repensé de zéro en gardant l'esprit mur des stands : fond plus profond, panneaux en cartes arrondies, couleurs de chronométrage plus lisibles (violet, vert, jaune), barre latérale avec libellés sous les icônes. L'ancien thème « F1 Pro » reste disponible dans Réglages → Affichage → Thème.
- Nouvelles polices intégrées à l'application (fonctionnent hors ligne) : Saira pour l'interface, Saira Condensed pour les titres et trigrammes, JetBrains Mono pour tous les chiffres (temps, écarts, compte à rebours), qui ne « dansent » plus quand ils changent.
- Classement : pilote suivi surligné en rouge, pastilles de pneus en anneau, mini-secteurs plus fins.
- Barre de replay : bouton lecture/pause plus grand.

### Carte
- Position de chaque pilote affichée sur sa pastille, anneau jaune autour du leader.
- En course, écarts de moins d'une seconde entre deux voitures affichés directement sur la piste (en vert sous 0,7 s).
- Bulle de télémétrie du pilote suivi (vitesse, rapport, régime, accélérateur, frein, écart avec la voiture de devant) à côté de sa voiture ; plus compacte sur une petite carte.
- Bandeau « ordre en piste » en bas de la carte : tout le peloton placé sur le tour, secteurs et drapeaux compris.
- Thème Pitwall : meilleur temps de chaque secteur (avec le pilote) affiché au début du secteur, zones de ligne droite nommées (« LD A1 »…).
- Chaque nouveauté se désactive dans le menu Calques (« Positions », « Écarts de moins d'une seconde », « Télémétrie du pilote suivi », « Ordre sur la piste »).

### Radios
- Transcription et traduction en haute qualité plus fiables : un échec passager (téléchargement, mémoire de la carte graphique) ne fait plus passer définitivement les deux en qualité légère. Seul le modèle concerné passe en qualité légère, et la haute qualité est retentée automatiquement.
- Les radios déjà traduites en qualité légère sont refaites en haute qualité dès qu'elle est disponible.
- La ligne d'état indique la qualité réellement utilisée pour la transcription et pour la traduction, et pourquoi elle est légère le cas échéant.
- Ordinateurs portables à deux cartes graphiques : la plus puissante est utilisée.

## v1.17.1 — 2026-10-10

### Carte
- Les pilotes hors course (abandon, voiture arrêtée en piste, éliminés en qualifications) disparaissent de la carte. Case « Pilotes hors course » du menu Calques pour les réafficher.

## v1.17.0 — 2026-10-10

### Télémétrie
- Animation ultra fluide : compteurs et courbe de vitesse mis à jour à chaque image de l'écran, avec des valeurs interpolées entre les mesures de la F1 (3 à 4 par seconde) au lieu d'avancer par à-coups.
- Les compteurs remplacent les anciennes jauges dans le panneau Duel.
- Choix des pilotes : puces ajustées au trigramme (plus de grand vide après « + Comparer… »), flèche et croix de fermeture bien alignées.

### Barre du haut
- Façon MultiViewer : drapeau du pays, nom court du Grand Prix (« Azerbaijan GP — Race »), temps restant en grand, météo détaillée (vent et direction, piste, air, humidité, pression, pluie) selon la place disponible.
- Menu des documents de la FIA : filtre, résumé en français de chaque document, ouverture du PDF, point rouge quand un nouveau document est publié (en replay, seuls les documents déjà publiés à l'instant affiché).
- Menu des vitesses (intermédiaires, ligne d'arrivée, speed trap ; meilleures ou dernier passage) et menu des meilleurs secteurs avec le tour idéal, triables par colonne.
- Case du délai TV ajustée à la valeur (moins d'espace autour des secondes).

### Classement
- Étiquettes STAND, SORTIE, TOUR… dans leur propre colonne : alignées d'une ligne à l'autre.
- Options pour masquer le nom complet du pilote et la colonne des étiquettes (bouton « Colonnes »).
- Nouvelle colonne « Meilleurs secteurs » (S1 / S2 / S3 de chaque pilote, violet = meilleur de tous).

### Fenêtres et second écran
- Enregistrer l'emplacement des fenêtres (menu « Dispo. » ou Réglages → Affichage) et y revenir en un clic ; dans l'application de bureau, choix au lancement : comme à la fermeture, emplacement enregistré ou sans les fenêtres détachées.
- Disposition libre aussi dans les fenêtres du second écran (bouton de disposition en haut) : panneaux placés n'importe où.
- Le bouton « Analyse » de la barre latérale fonctionne quand le panneau est sur le second écran : il s'y affiche en grand et sa fenêtre passe devant.
- En disposition libre, un panneau ne peut plus passer sous la barre de replay.

### Carte
- Case « Textes des drapeaux jaunes » (menu Calques) pour masquer la liste des zones sous drapeau jaune qui recouvre la carte (les fanions restent sur la piste).

### Fluidité
- Rafraîchissement de l'interface calé sur l'affichage, transitions douces (onglets, panneau agrandi, menus, couleurs du classement et de l'état de la piste).

## v1.16.0 — 2026-10-10

### Mises à jour
- Écran de démarrage « Recherche de mise à jour… » : quand une nouvelle version existe, elle est téléchargée et installée avant l'ouverture, et l'appli redémarre directement dessus. Sans connexion, l'appli s'ouvre normalement.
- Paquet Linux .deb et appli macOS lancée depuis l'image disque : la nouvelle version est signalée au démarrage, avec un bouton pour la télécharger.
- Téléchargement des mises à jour plus fiable : arrêt propre si la connexion est coupée, nettoyage des anciens téléchargements.

### Disposition
- Disposition libre : les panneaux se placent n'importe où et se redimensionnent par leur coin, avec aimantation aux bords et aux autres panneaux (menu « Dispo. » de la barre latérale).

### Classement
- Bouton « Colonnes » sur le classement pour retirer ou ajouter des colonnes : position de départ, tours effectués, écart au pilote suivi, vitesses I1 / I2 / ligne d'arrivée, écurie.
- Correction : masquer la colonne des secteurs fonctionne.

### Carte
- Nouveau dessin : piste avec trait central coloré par secteur, zones « ligne droite » en hachures vertes, numéros de virage reliés à la piste, pilotes en pastilles rondes avec leur trigramme, fond uni.
- Les étiquettes des pilotes ne sautent plus d'un côté à l'autre dans les paquets.
- Bandeau « Drapeau rouge » de la carte décalé pour ne plus être coupé par le cadre rouge.
- Voie des stands sur la carte, reconstituée à partir des passages des voitures dans les stands (calque « Voie des stands »).
- Zones « ligne droite » et points de détection / d'activation du mode dépassement à leur position officielle, lue dans le plan du circuit publié par la FIA pour chaque Grand Prix (avant : estimations).

### Panneaux
- En-têtes : les outils (« Positions estimées », « Suivre », « Calques », « Colonnes ») sont de nouveau à côté du titre, et les boutons de panneau (déplacer, agrandir, envoyer, masquer) sont centrés sur la hauteur de l'en-tête dans tous les panneaux.

### Télémétrie
- Deux compteurs côte à côte (pilote suivi et pilote au choix) : vitesse, accélérateur, frein, régime et rapport, et courbe de vitesse des deux pilotes ; textes bien séparés des cercles.

### Replays
- Nouvelle barre de lecture : séance en cours en vert, début et fin de chaque partie (Q1, Q2, Q3, départ, reprise), drapeaux jaunes / SC / VSC / rouges, partie lue en bleu, vitesses 1x à 30x, bouton pour revenir au direct.

### Barre du haut
- Moins d'espace vide : plus de trou après « SQ1 » en qualifs, case du délai TV ajustée à sa valeur.

## v1.15.0 — 2026-10-10

### Nouveau design « F1 Pro »
- Design « F1 Pro » par défaut : barre latérale, barre d'état, cartes et barre de replay en bas ; les thèmes « F1 sobre », « Noir » et « Bleu nuit » restent disponibles.
- Vrais logos des écuries, en couleur (option pour les logos blancs).
- Heure locale du circuit dans la barre du haut.
- Nouveau logo de l'application (« F1 rouge premium »).

### Pneus
- Nouvel onglet Pneus : jeux neufs et utilisés de chaque pilote sur le week-end, allocation de la FIA.
- Composés choisis par Pirelli pour chaque Grand Prix et préconisations tirées des communiqués de Pirelli.

### Course et qualifications
- Cercle de position : les pilotes placés sur un anneau selon leur écart, avec la sortie des stands estimée.
- Comparaison de n'importe quel tour de deux pilotes (et plus seulement des meilleurs tours).
- Essais et qualifs : les pilotes qui ne sont pas dans un tour lancé peuvent être atténués (classement et carte).
- Secteurs : écarts par rapport à un pilote choisi.
- Records du circuit : poles et meilleurs tours en course des éditions précédentes.
- Direction de course : filtre par type de message (safety car, limites de piste, commissaires, drapeaux…).
- Safety car, VSC et drapeau rouge marqués sur la barre de replay et sur la race trace.

### Saison
- Notes des pilotes : note de la saison et note face au coéquipier, sur 100 et de S à F, avec le détail du calcul.
- Coéquipiers : écart en qualification (médiane, moyenne, manche par manche).
- Fiche pilote : tours en tête, plus belle remontée, répartition des arrivées, points comparés à la saison précédente.
- Profil des circuits : pneus Pirelli et contrainte sur les pneus, arrêts par pilote, circuits les plus proches.

### Connexion F1 TV
- La connexion F1 TV est renouvelée automatiquement : il suffit de se reconnecter environ tous les 30 jours au lieu de 4.
- Rappel discret quand une reconnexion devient nécessaire.

### Corrections
- Barre du haut alignée sur téléphone, boutons des panneaux qui ne débordent plus, légendes moins envahissantes sur les petits écrans, fenêtre des réglages de hauteur fixe, étiquettes des graphiques qui ne se chevauchent plus.
- Ce journal des modifications, consultable dans l'application.

## v1.14.0 — 2026-10-09
- Analyse → Comparaison : meilleurs tours de deux pilotes, secteur par secteur et mini-secteur par mini-secteur.
- Saison : changement d'année fiable, requêtes espacées, saisons terminées gardées sur disque.
- Réseau : nouvel essai automatique quand un serveur refuse temporairement une demande.

## v1.13.0 — 2026-10-09
- Mode mobile pour téléphone et tablette, accès depuis le téléphone par QR code (réseau local).
- Thème « F1 sobre » par défaut, ancien design conservé (« Classique »).
- Dispositions Course et Qualif / essais choisies selon la séance.
- Replay : passer les drapeaux rouges.
- Listes déroulantes intégrées, légendes explicatives (masquables), bouton pour couper le son des alertes.
- Classement plein écran plus lisible, traduction des évolutions techniques.

## v1.12.0 — 2026-10-09
- Application de bureau pour macOS et Linux.
- README allégé, guide complet dans docs/GUIDE.md.

## v1.11.0 — 2026-10-09
- Espace Saison : calendrier, classements, résultats, coéquipiers, statistiques des pilotes, régularité, arrêts, vitesses de pointe, profil des circuits.
- Saison : évolutions techniques et éléments moteur (documents FIA).
- Carte : nouveau design (piste, voitures, traînées, menu Calques).
- Classement : logos des écuries ; onglet Rythme et export PNG.

## v1.10.0 — 2026-10-05
- Thème Noir par défaut (Bleu nuit en option).
- Panneaux réorganisés par thème, panneau Analyse, réglages en onglets.
- Transcription des radios en haute qualité sur carte graphique.

## v1.9.0 — 2026-10-04
- Radios : transcription en texte en direct et traduction.
- Haut de page : tours restants et état de la piste ; points gagnés au championnat.
- Fluidité : carte, classement et télémétrie allégés.

## v1.8.4 — 2026-10-04
- Arrêts : temps d'immobilisation en direct.
- Classement : animations fluides (dépassements qui glissent).

## v1.8.3 — 2026-10-04
- Radios : lecture automatique dans une seule fenêtre, sans doublon.

## v1.8.2 — 2026-10-04
- Carte : zones de ligne droite et ligne de détection estimées, drapeaux jaunes par secteur.
- Couleurs d'équipe contrastées (option).

## v1.8.1 — 2026-10-04
- Les fenêtres détachées sont rouvertes au lancement.

## v1.8.0 — 2026-10-04
- Commentaires F1 TV dans l'application de bureau.
- Carte : secteurs et micro-secteurs, drapeaux jaunes localisés, drapeau rouge, SC et VSC.

## v1.7.0 — 2026-09-26
- Lecteur radio et flux audio, retardés du délai TV.

## v1.6.1 — 2026-09-26
- Commentaires F1 TV : diagnostic de l'abonnement.

## v1.6.0 — 2026-09-26
- Commentaires en direct F1 TV Pro (langue, volume, calage sur le délai TV).
- Barre du haut sur une ligne, bouton de réinitialisation.

## v1.5.0 — 2026-09-26
- Disposition libre des panneaux et fenêtres secondaires multi-panneaux.

## v1.4.0 — 2026-09-26
- Drapeaux bleus masquables, onglet Arrêts refait, classement pleine hauteur, synchronisation entre fenêtres.
- Enquêtes : pilote pénalisé et liens vers les documents de la FIA.

## v1.3.0 — 2026-09-26
- Suivi des enquêtes des commissaires et des limites de piste.

## v1.2.2 — 2026-09-26
- Corrections de la mise à jour automatique.

## v1.2.1 — 2026-09-26
- Mise à jour automatique depuis les versions publiées du projet.

## v1.2.0 — 2026-09-26
- Mise à jour automatique de l'application Windows.

## v1.1.1 — 2026-09-26
- Favoris depuis le classement, connexion F1 TV intégrée, panneaux détachés.

## v1.1.0 — 2026-09-26
- Première version : tableau de bord F1 en direct avec délai réglable et synchronisation TV, application Windows.
