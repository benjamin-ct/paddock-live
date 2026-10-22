<img src="public/icon-512.png" alt="Paddock Live" width="84" align="right">

# 🏁 Paddock Live

Dashboard **Formule 1 en direct** pour suivre chaque Grand Prix sur votre ordinateur, **calé sur le délai de votre diffusion TV** (chaîne TV, box, appli de streaming…). Windows, macOS et Linux.

![Paddock Live pendant une séance (replay de la course du Grand Prix de Singapour 2026)](docs/screenshots/tableau-de-bord.png)

<sub>Design « Pitwall » en mode sombre. L'application suit par défaut le mode clair ou sombre de l'ordinateur ou du téléphone (voir plus bas).</sub>

## ✨ En bref

- **Classement en direct** : écarts, secteurs et mini-secteurs, pneus, arrêts, vitesse de pointe, logos officiels des écuries ; en qualif, limite d'élimination et temps à battre.
- **Carte du circuit** : toutes les voitures en mouvement (GPS ou positions estimées), drapeaux par secteur, safety car, zones de dépassement, calques au choix.
- **Synchro TV** : tout (chronos, carte, drapeaux, radios, alertes) est retardé pour coller à votre image, **sans spoiler** ; le délai peut même se régler tout seul en écoutant la TV (expérimental).
- **Accueil sans spoiler**, page **Replays** de toutes les séances archivées, page **Résultats** et **résumé** en cartes.
- **Duels, bagarres et simulateur d'arrêt** : écart en temps réel, tendance, « s'il s'arrête maintenant, il ressort P8 », cercle de position animé.
- **Radios d'équipe** retranscrites et traduites, **commentaires F1 TV Pro** ou radio de votre choix calés sur le dashboard.
- **Espace Saison** (calendrier, classements, course au titre, duels, notes des pilotes, statistiques, technique FIA) et **Espace Actu** (toute l'actualité F1 traduite).
- **Pronostics entre amis**, en réseau local ou en ligne avec un lien à partager.
- **Streaming** : overlays pour OBS, Streamlabs et Meld Studio, commandes pour le Stream Deck.
- **Mini-classement** et **carte flottante** à poser par-dessus la vidéo, **second écran**, disposition libre des panneaux.
- **Sur téléphone ou tablette** par le Wi-Fi de la maison, dans une version simplifiée.
- **En français ou en anglais**, mode **clair ou sombre**, mises à jour automatiques.

La liste complète est plus bas : **[toutes les fonctionnalités](#-toutes-les-fonctionnalités)**.

| | |
|---|---|
| ![Accueil : prochaine séance, météo du week-end, favoris et dernières actualités](docs/screenshots/accueil.png) | ![Réglages → Streaming : overlays pour OBS, Streamlabs et Meld Studio, commandes pour le Stream Deck](docs/screenshots/streaming.png) |
| ![Classement](docs/screenshots/classement.png) | ![Carte](docs/screenshots/carte.png) |
| ![Analyse : rythme](docs/screenshots/analyse-rythme.png) | ![Saison : accueil](docs/screenshots/saison-accueil.png) |
| ![Saison : fiche pilote](docs/screenshots/saison-pilote.png) | ![Saison : évolutions techniques](docs/screenshots/saison-evolutions-techniques.png) |
| ![Replay : moments clés](docs/screenshots/moments.png) | ![Résultats de la séance : podium, remontées, stratégies, classement complet](docs/screenshots/resultats.png) |
| ![Saison : course au titre, et quand le titre peut se jouer](docs/screenshots/saison-course-au-titre.png) | ![Saison : duels entre coéquipiers ou pilote contre pilote](docs/screenshots/saison-duels.png) |
| ![Météo du circuit : temps actuel, prévisions du week-end et radar de la pluie](docs/screenshots/radar.png) | ![Saison : pronostics entre amis](docs/screenshots/pronostics.png) |
| ![Radios d'équipe retranscrites et traduites](docs/screenshots/radios.png) | ![Analyse : comparaison de deux tours, secteur par secteur](docs/screenshots/analyse-comparaison.png) |
| ![Secteurs : meilleurs secteurs, tour idéal, vitesses et records du circuit](docs/screenshots/secteurs.png) | ![Saison : profil des circuits (longueur, dépassements, pneus, circuits les plus proches)](docs/screenshots/saison-circuits.png) |

<img src="docs/screenshots/mini-classement.png" alt="Mini-classement flottant, toujours au premier plan" width="380" align="right">

**Mini-classement** (bouton Mini de la barre latérale) : une petite fenêtre toujours au premier plan, à poser sur la vidéo de la course. Positions, intervalle ou écart au leader, pneus, favoris, au rythme de votre délai TV.

<br clear="right">

![Espace Actu : l'actualité de la F1 traduite en français](docs/screenshots/actu.png)

**Mode sombre ou clair** (Réglages → Affichage → Apparence) : automatique par défaut (suit le réglage de l'ordinateur ou du téléphone), ou toujours sombre, ou toujours clair.

![Le design Pitwall en mode sombre et en mode clair](docs/screenshots/apparence.png)

## 📋 Toutes les fonctionnalités

Le détail de chacune est dans le **[guide complet](docs/GUIDE.md)**.

### Accueil et navigation
- **Accueil au lancement, sans spoiler** : compte à rebours de la prochaine séance, météo prévue chaque jour du week-end, dernière séance (« Revoir en replay », qui démarre 1 minute avant le départ, et « Voir les résultats »), favoris (pilotes et écuries) avec leur place au championnat, dernières actualités traduites.
- **Écran de chargement** au lancement, le temps que l'accueil soit complet.
- **Barre latérale** : Accueil, Direct, Résultats, Saison, Actu, Replays, Commentaires, Résumé, Mini, apparence, disposition, réglages.
- **Écran « Pas de séance en direct »** hors séance, avec la prochaine séance et le dernier replay.
- **Barre du haut** : pendant une séance, drapeau, tour et progression, temps restant, heure locale du circuit, météo, état de la piste, délai TV ; entre deux séances, le **prochain Grand Prix** (compte à rebours, tours, longueur, heure du circuit, météo prévue).
- **Outils de la barre du haut** : documents FIA (visionneuse intégrée, Grand Prix au choix, résumé en français), vitesses aux intermédiaires et au speed trap, meilleurs secteurs et tour idéal, météo du circuit et radar de la pluie.

### Tableau de bord en direct
- **Classement** : position et places gagnées, écart, intervalle, dernier et meilleur tour, secteurs et mini-secteurs, pneus et âge, arrêts, speed trap, étiquettes (stand, sortie, abandon, drapeau bleu…), favoris ; colonnes à ajouter ou retirer (position de départ, tours, écart au pilote suivi, vitesses, meilleurs secteurs, écurie, nom complet) ; en qualif, ligne d'élimination, temps à battre et temps prévu du tour en cours.
- **Carte du circuit** : tracé réel, numéros de virage, voitures en pastilles avec traînée, secteurs, drapeaux jaunes par secteur, carte rouge au drapeau rouge, safety car et VSC, zones de ligne droite et points de détection (plan officiel FIA), voie des stands, écarts de moins d'une seconde, bulle de télémétrie du pilote suivi, bande « ordre sur la piste », zoom et suivi d'un pilote ; menu **Calques** pour choisir ce qui s'affiche ; voitures hors tour lancé estompées en essais et qualifs.
- **Bandeau** pleine largeur sous drapeau rouge, safety car, VSC, drapeau jaune et à la reprise.
- **Duel** : deux pilotes au choix (rempli tout seul avec votre favori), écart en temps réel, tendance et rattrapage estimé, graphique de l'écart, comparaison des tours, secteurs, pneus, rythme, compteurs de télémétrie ; duel automatique avec la voiture de devant ou de derrière.
- **Simulateur d'arrêt** : place à la sortie des stands avec le temps perdu mesuré pendant la course (ou celui du circuit), réduit sous safety car ou VSC, modifiable ; **cercle de position** animé en continu, avec la sortie des stands qui suit le pilote.
- **Bagarres** : toutes les paires à moins de 1,5 s, avec la tendance et un bouton pour ouvrir le duel.
- **Direction de course** : tous les messages de la FIA, filtres (drapeaux bleus, temps supprimés, type de message), traduction en français.
- **Enquêtes** (suivi de chaque incident jusqu'à la décision, documents FIA) et **limites de piste** (tours supprimés, drapeau noir et blanc, pénalités).
- **Analyse** (onglets Écarts, Temps, Secteurs…) : race trace, positions, temps au tour, rythme, historique des pneus, secteurs et vitesses avec les records du circuit, comparaison de deux tours mini-secteur par mini-secteur, télémétrie ; export des graphiques en image.
- **Radios d'équipe** : une carte par radio (photo, tour, durée, écoutée ou non), lecture automatique au rythme du délai, transcription et traduction (français, espagnol, allemand, italien) par le serveur Paddock Live ou sur l'ordinateur ; en expérimental, radios captées sur le son des caméras embarquées F1 TV.
- **Arrêts** : vue chronologique ou par pilote, arrêt le plus rapide, temps dans la voie des stands ; les passages sans changement de pneus sont distingués.
- **Télémétrie** : deux compteurs (vitesse, régime, rapport, accélérateur, frein) animés en continu et courbe de vitesse.
- **Pneus** : stratégie de chaque pilote, rythme et usure du relais, jeux neufs et utilisés sur tout le week-end, composés et préconisations de Pirelli.
- **Météo et championnat** : station météo du circuit, radar de la pluie, projection du championnat pendant les courses.
- **Onglets adaptés à la séance** : ceux qui ne servent pas (en qualif, en essais) sont masqués ; dispositions « Course » et « Qualif & essais » séparées.

### Synchro TV
- Délai jusqu'à 10 minutes appliqué à tout : chronos, carte, drapeaux, radios, alertes, documents.
- **Synchro automatique par le son** (expérimental) : le micro reconnaît une radio d'équipe diffusée à la TV et règle le délai.
- **Synchro à la main** (« Je le vois ! ») sur un repère sans spoiler, réglage fin au clavier, à la molette ou par le menu ±.
- **Préréglages** (« TV du salon »…) ; le téléphone reprend le délai de l'ordinateur.

### Replays et enregistrements
- **Page Replays** : toutes les séances des archives officielles F1 (essais, qualifs, sprint, course), GPS et télémétrie compris.
- **Barre de lecture** : début et fin de chaque partie, drapeaux rouges, en option jaunes, safety car et VSC ; infobulle au survol ; pause, ±10 s, vitesse 1x à 30x, retour au départ.
- **Moments clés** cliquables (départ, drapeaux, changements de leader, dépassements, arrêts, abandons, incidents, pénalités, meilleur tour, arrivée), sans spoiler par défaut.
- **Enregistrement automatique** de chaque séance suivie en direct, à rejouer sans attendre l'archive.

### Résultats, résumé et fenêtres flottantes
- **Résultats** : podium, remontées, stratégies, neutralisations, classement complet, graphique des relais, chiffres de la séance.
- **Résumé** visuel de la séance, avec un texte à copier, sans rien dévoiler d'avance.
- **Mini-classement** toujours au premier plan, sans cadre ni fond dans l'application de bureau.
- **Carte flottante** transparente, taille réglable, avec ses propres calques.

### Espace Saison
- **Accueil**, **calendrier** (prochain Grand Prix en haut), **classements** pilotes et constructeurs avec l'évolution des points.
- **Résultats et records**, **course au titre** (qui peut encore être champion, quand le titre peut se jouer).
- **Duels** entre coéquipiers ou pilote contre pilote, **notes des pilotes** (S à F).
- **Statistiques** : fiche de chaque pilote, régularité, arrêts aux stands, vitesses de pointe, profils des circuits.
- **Technique** (documents FIA) : évolutions techniques des voitures et éléments moteur avec les pénalités.

### Pronostics entre amis
- Pole et podium avant chaque Grand Prix, choix des autres cachés jusqu'à la fermeture, points et classement de la saison.
- En réseau local ou **en ligne** : groupe à créer, lien à partager (copié sur ordinateur, partage du téléphone), liste « Mes groupes » pour retrouver ses groupes toute la saison (et en retirer), suppression du groupe par son créateur, page web pour jouer sans l'application.

### Espace Actu
- Sources officielles (F1, FIA, écuries, pilotes) et une trentaine de médias en 8 langues, sources à ajouter ou couper.
- Traduction en français faite d'avance, lecture des articles et des vidéos dans l'appli, un sujet par carte, articles lus grisés.
- Filtres (important, favoris, officiel, vidéos, langue, recherche), alertes et anti-spoiler pendant une séance en direct.

### Alertes et agenda
- Son, message et notification pour les drapeaux, safety car, VSC, meilleur tour, abandons, arrivée et vos favoris, au rythme du délai TV.
- **Rappel** avant chaque séance, **abonnement au calendrier** des séances (Google Agenda, Apple Calendrier, Outlook).
- **Lumières connectées** (expérimental) : Philips Hue ou Home Assistant aux couleurs des drapeaux, avec un mode simulation.

### Commentaires et radio
- **Commentaires F1 TV Pro** (international ou F1 Live, langue au choix) calés sur le dashboard.
- **Radio ou flux audio** de votre choix, retardé du délai TV.

### Streaming
- **Overlays** à ajouter comme source navigateur dans OBS Studio, Streamlabs ou Meld Studio, au rythme du délai TV : classement (colonnes au choix), carte du circuit (calques au choix), bandeaux de drapeaux, compteur de tours, compte à rebours, podium, télémétrie du pilote suivi ; fond réglable de 0 à 100 % ; adresses fixes, réglages appliqués en direct sans recopier le lien.
- **Stream Deck** ou Bitfocus Companion : délai TV ±1 s ou ±0,1 s, lecture, pause et ±10 s en replay.

### Disposition et écrans
- Panneaux rangés en colonnes ou **disposition libre**, redimensionnables, à agrandir ou masquer ; **onglets déplaçables** d'un panneau à l'autre.
- **Second écran** : panneaux envoyés dans d'autres fenêtres, emplacement des fenêtres enregistré et rouvert au lancement.
- Pilote suivi, duel, délai et réglages synchronisés entre toutes les fenêtres.

### Téléphone et tablette
- Accès par le Wi-Fi de la maison avec un QR code, appli à ajouter à l'écran d'accueil (iPhone et Android).
- **Version simplifiée** sur téléphone : classement, carte, course et radios, barre du bas à 5 boutons, réglages allégés ; version complète en option.
- Barre de replay compacte, menu des calques adapté, carte allégée par défaut ; tablette avec la disposition de l'ordinateur.

### Apparence, langue et application
- Design « Pitwall » en **clair, sombre ou automatique**, logos et couleurs des écuries (officielles ou contrastées), légendes sous les panneaux (au choix), animations désactivables.
- Interface en **français ou en anglais**, noms des Grands Prix et des séances traduits.
- **Premier lancement guidé** (favoris, délai TV, F1 TV Pro) et interface **Essentiel** ou **Complète** sur ordinateur.
- **Réglages** avec recherche, rubriques et « À propos » (nouveautés, réseaux, informations légales).
- **Mise à jour automatique** (Windows, macOS, AppImage), **sauvegarde des réglages** dans un fichier.
- **Connexion F1 TV** (facultative) : positions GPS exactes et télémétrie, jeton renouvelé automatiquement ; sans compte, positions estimées.
- **Traductions et transcriptions** par le serveur Paddock Live (une fois pour tous), ou sur l'ordinateur.
- **Statistiques d'utilisation anonymes**, facultatives.

## 🚀 Installation

Téléchargez la dernière version sur la page **[Releases](https://github.com/benjamin-ct/paddock-live/releases/latest)** :

| Système | Fichier | Remarque |
|---|---|---|
| **Windows** | `…-x64-win.exe` (installateur) ou `…-portable.exe` | Avertissement SmartScreen : « Informations complémentaires » → « Exécuter quand même ». |
| **macOS** (Apple Silicon / Intel) | `…-mac-arm64.dmg` / `…-mac-x64.dmg` | Glissez Paddock Live dans Applications. L'appli n'est pas certifiée par Apple : au premier lancement, clic droit → « Ouvrir » (si macOS la dit endommagée : `xattr -cr "/Applications/Paddock Live.app"` dans le Terminal). |
| **Linux** (x64 / ARM) | `…-linux-x86_64.AppImage` / `…-linux-arm64.AppImage`, ou `…-linux-amd64.deb` | AppImage : `chmod +x` puis lancez-la. Paquet : `sudo apt install ./Paddock-Live-…deb`. |

L'application **se met à jour toute seule** (sauf le paquet `.deb`).

**Sans installer l'application** : avec [Node.js](https://nodejs.org) 22 ou plus, téléchargez ce dépôt puis lancez `Lancer Paddock Live.bat` (Windows) ou `./start.sh` (macOS / Linux), ou `npm install && npm start`, et ouvrez <http://localhost:3000>.

## ⏱ Se caler sur la TV

Le flux de chronométrage arrive **avant** l'image TV : le dashboard vous montre la course telle qu'elle était il y a N secondes.

1. Lancez le dashboard quelques minutes avant la session.
2. Cliquez sur **🎯 Synchro TV** (touche `S`), puis **Écouter la TV** : le micro de l'ordinateur reconnaît la prochaine radio d'équipe diffusée et règle le délai tout seul (expérimental). Ou, à la main : au moment où vous voyez un repère sur votre TV (changement de tour, drapeau…), cliquez **« Je le vois ! »**.
3. Enregistrez ce délai en préréglage (« TV du salon »…) pour la prochaine fois.

Ajustement fin : `←` `→` ±1 s, `Maj` ±5 s, `Alt` ±0,1 s.

## 📡 Avec un abonnement F1 TV (optionnel)

Tout fonctionne sans compte. Avec F1 TV, connectez-vous dans ⚙ Réglages pour avoir **les positions GPS exactes et la télémétrie** en direct (sinon les positions sont estimées). **F1 TV Pro** donne en plus les **commentaires en direct** (bouton 🎙).

## 📱 Sur téléphone ou tablette

Sur l'ordinateur : ⚙ Réglages → Application → **« Autoriser l'accès depuis le réseau local »**, puis scannez le QR code avec le téléphone (même Wi-Fi). Le téléphone reprend le délai TV de l'ordinateur et affiche un panneau à la fois, avec des onglets en bas. Pour l'avoir comme une appli : « Ajouter à l'écran d'accueil ». Détails dans le [guide](docs/GUIDE.md#-sur-téléphone-ou-tablette).

![Paddock Live sur téléphone : classement, carte et actualités](docs/screenshots/telephone.png)

## ⌨ Raccourcis

`S` synchro TV · `←` `→` délai (± `Maj` / `Alt`) · `Espace` pause en replay · `M` couper les alertes · `C` couper les commentaires · `Échap` réduire le panneau agrandi

## 📖 Pour aller plus loin

Le **[guide complet](docs/GUIDE.md)** détaille chaque panneau, l'espace Saison, les alertes, les commentaires et la radio, la disposition et le second écran, les replays et enregistrements, les options de lancement et le fonctionnement interne.

Les nouveautés de chaque version sont dans le **[journal des modifications](CHANGELOG.md)** (aussi visible dans l'application : Réglages → Application).

Tests : `npm test`.

**Statistiques anonymes (facultatives)** : au premier lancement, Paddock Live demande s'il peut envoyer des statistiques d'utilisation anonymes (fonctions utilisées, version, système). Ni compte, ni identifiant, ni contenu ; refusable et modifiable à tout moment dans Réglages → Application. Détails dans le [guide](docs/GUIDE.md#-statistiques-dutilisation-anonymes).

## Licence

© 2026 Paddock Live. L'application est sous **[licence MIT](LICENSE)** ; le serveur et le Studio (dossier `analytics/`) sont sous **[licence AGPL v3](analytics/LICENSE)**. Les bibliothèques incluses gardent leur propre licence (indiquée en tête de leurs fichiers).

Le nom « Paddock Live » et le logo ne sont pas couverts par ces licences : ils ne peuvent pas être utilisés pour une copie ou une version modifiée sans accord.

> Projet non officiel, sans lien avec la Formula 1, la FIA ni aucun diffuseur TV. Les données proviennent du flux public F1 Live Timing et sont destinées à un usage personnel.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/X6Y427QAUT)
