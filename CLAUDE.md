# Consignes du projet Paddock Live

- Le projet, les messages de commit et la documentation sont en français.
- **Branches et versions** : le travail se fait sur `develop` (toutes les PRs ont `develop` pour base) ;
  `main` ne reçoit que les versions finales. Numéros : `X.Y.0` pour une version avec des nouveautés
  (1.28.0, 1.29.0…), `X.Y.Z` pour une version de corrections seulement (1.28.1…).
- **Mode créateur secret** : le mode créateur (Posts, Studio, publication et statistiques des réseaux, diagnostic
  des données F1, tout ce qui demande le code créateur) n'apparaît jamais dans `CHANGELOG.md` (repris sur la page
  de la version et dans l'appli) ni sur le site : un changement qui ne touche que lui s'écrit « Petites améliorations
  internes » dans `### Divers`.
- **Journal** : la version en préparation a sa section `## vX.Y.0 — à venir` en tête de `CHANGELOG.md` ;
  chaque PR y ajoute ses nouveautés au fil de l'eau (écrites pour les utilisateurs, regroupées par thème
  `### …`), plusieurs PRs s'accumulent dans la même section. Après une publication, la PR suivante ouvre
  la section de la version d'après.
- **« Merge »** (ou « merge et publie » tant qu'aucune version finale n'est demandée) = fusionner la PR dans
  `develop` : une **bêta** part toute seule si l'appli change (workflow « Application de bureau » : pré-version
  GitHub `vX.Y.0-beta.<n>`, reçue seulement par les applis inscrites aux bêtas, Réglages → Application ;
  les 3 dernières gardées). Sa page montre « Nouveau dans cette bêta » (ajouté au journal depuis la bêta
  précédente, calculé tout seul) puis tout ce qui arrive dans la version ; la page de la version finale reprend
  toute la section du journal.
- **« Publie » / « publie la version »** = version finale pour tout le monde : remplacer « à venir » par la date
  du jour sur `develop`, PR `develop` → `main` fusionnée, puis workflow « Application de bureau » lancé sur
  `main` avec la version (ex. `v1.28.0`). La page de la version reprend la section du journal
  (`scripts/release-notes.mjs`) ; le workflow échoue si elle manque.
- **Correction urgente** (bug de la version finale) : branche depuis `main`, section `## vX.Y.Z — à venir` dans
  le journal (si `develop` prépare déjà ce numéro, sa section passe au suivant), puis **bêta de test d'abord** :
  workflow « Application de bureau » lancé sur cette branche avec `vX.Y.Z-beta.<n>` (reçue seulement par les
  applis inscrites aux bêtas, dont celle de l'utilisateur ; elle n'a pas les nouveautés de `develop`, qui
  reviennent à la bêta suivante). Une autre bêta à chaque retouche. Sur « publie » : date du jour, fusion dans
  `main`, workflow lancé sur `main` avec `vX.Y.Z`, puis `main` refusionné dans `develop`.
- Ne fusionner et ne publier que lorsque l'utilisateur le demande.
- **Modifications du serveur seul, sans nouvelle version de l'appli** : quand une PR ne touche que le serveur des
  statistiques (Worker : `analytics/**`, page du Studio, `scripts/build-studio.mjs`, et les fichiers de `shared/`
  que l'appli n'importe pas, ni directement ni par un autre fichier de `shared/` — vérifier avec
  `grep -rl <fichier> public server shared`), pas d'entrée dans `CHANGELOG.md` : le workflow « Statistiques »
  déploie le Worker tout seul à chaque push, mais seulement
  depuis une branche qui contient tout `develop` (la branche de travail reste donc à jour de `develop`). Dès qu'un fichier de l'appli change (`public/`, `server/`,
  `desktop/`, fichier de `shared/` importé par l'appli), ses nouveautés vont dans la version en préparation.
- **Classe Durable Object ajoutée au Worker** (`[[migrations]]` de `analytics/wrangler.toml`) : sa PR est fusionnée
  avant les autres PR qui touchent le Worker. Une fois déployée depuis la branche de travail, `develop` sans la classe
  ne pourrait plus être déployé.
- **Worker compatible avec les anciennes applis** : il n'y a qu'un Worker, toujours à la dernière version, alors que
  les applis installées (version finale, bêtas) peuvent avoir du retard. Les adresses que l'appli appelle (`/studio/api/…`
  dans `server/studio-sync.js`, et celles de l'ancien `server/post-history.js` pour les applis jusqu'à la 1.28, `/e`, `/f`, `/t`, `/r`, `/p/api`) gardent leurs noms, leurs
  paramètres et leurs réponses : on ajoute sans retirer ni changer, et on ne supprime une ancienne forme que quand
  plus aucune version publiée ne l'utilise.
- **Suivi dans Google Drive** (connecteurs Google Drive, Docs et Sheets) : après chaque action (code fusionné,
  version publiée, posts préparés, démarche faite), tenir à jour le dossier « Paddock Live · Réseaux » :
  la feuille « Suivi réseaux · Paddock Live » (onglet Tâches : une ligne par tâche, colonnes Statut [À faire, En
  attente, Fait, Lien], Liste, Quand, Domaine, Tâche, Détails, Lien, Fait le ; passer le Statut à « Fait » avec la
  date, ajouter ce qui reste ; affiché et cochable dans le Studio → Suivi. Onglet Journal : une ligne par action, la
  plus récente en haut ; onglet Posts : les posts préparés). L'ancien Doc « À faire · Paddock Live » n'est plus tenu
  (archive). Pour chaque Grand Prix, un Google Doc des textes et un dossier
  « Paddock Live · Médias · <Grand Prix> » (fichiers envoyés avec les secrets `GDRIVE_*` de l'environnement).
- **À tester avant la version finale** : à chaque PR fusionnée qui change l'appli ou la version web, ajouter dans la
  liste « À tester avant la version finale (X.Y) » de l'onglet Tâches une ligne par nouveauté (Quand : « bêta N »,
  ou « Vraie séance · bêta N » pour ce qui demande une vraie séance ; Tâche : la nouveauté ; Détails : où cliquer et
  ce qu'on doit voir). Après « publie », passer en « Fait » ce qui a été vérifié et changer le numéro de la liste.
- Avant de pousser : `npm test`.
- **Serveur local de test** (essais, captures, agents) : le lancer sans rien envoyer au Worker en production, sinon les
  replays de test sont traduits et transcrits en production (crédits Claude) :
  `PADDOCK_TRANSLATE_URL= PADDOCK_RADIO_URL= PADDOCK_STATS_URL= PADDOCK_FEEDBACK_URL= PADDOCK_PRONOS_URL= PADDOCK_STUDIO_URL= PADDOCK_RELAY_URL= node server/index.js`
  (adresse vide = fonction coupée).
- **Versions anglaise, italienne et espagnole** : tout nouveau texte affiché a sa traduction dans `public/js/i18n-en.js`,
  `public/js/i18n-it.js` et `public/js/i18n-es.js` (clé = texte français, `{}` pour les valeurs ; tutoiement en italien
  et en espagnol) ; `node scripts/i18n-missing.mjs` liste ceux qui manquent.
- **Ponytail** (`.claude/skills/ponytail*`, licence MIT, github.com/DietrichGebert/ponytail) : la plus petite
  modification qui règle tout le problème, réutiliser l'existant, rien « pour plus tard ». `/ponytail-review`
  (une modification), `/ponytail-audit` (tout le dépôt), `/ponytail-debt` (raccourcis `shortcut:` en attente).
  Ces consignes priment sur ses règles : réponses, rapports et commentaires en français, journal et
  traductions (anglais, italien, espagnol) toujours tenus.
- **Compétences 3D et Electron** (`.claude/skills/`, licence MIT) : `threejs-animation`, `shader-glsl`,
  `particle-system` (github.com/iart-ai/webgl-animation-skills) pour la carte 3D, et `electron-best-practices`
  (github.com/jwynia/agent-skills, parties sécurité et empaquetage) pour `desktop/`. Mêmes priorités que pour Ponytail :
  ces consignes priment, réponses en français.
