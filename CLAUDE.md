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
- **Suivi dans le Studio** (onglet Suivi, sans Google ; `scripts/suivi.mjs`, clé `PADDOCK_SUIVI_KEY` de
  l'environnement, créée dans le Studio → Suivi → Réglages, jamais collée dans une conversation) : après chaque
  action (code fusionné, version publiée, posts préparés, démarche faite), tenir le suivi à jour. Tâches : statut
  [À faire, En attente, Fait, Lien], liste, quand, domaine, titre, détails (« / » entre deux lignes), lien, fait le ;
  `task-done` passe une tâche en « Fait » avec la date, `task-add` ajoute ce qui reste (`tasks` donne les identifiants).
  Journal : `log-add`, une ligne par action, la plus récente en haut. Pour chaque Grand Prix, les textes des posts
  (`posts-put`, même format qu'avant : « 1. JOUR · HEURE · TITRE », « Image : … », « Texte long : »…). Sans
  `PADDOCK_SUIVI_KEY`, le dire à l'utilisateur au lieu d'écrire ailleurs. Photos et vidéos d'un Grand Prix : `media-put`
  (gardées par le serveur, affichées sous les textes des posts ; `media-list` donne leurs adresses). L'ancien dossier
  Google Drive « Paddock Live · Réseaux » n'est plus tenu (archive), Google n'est plus utilisé pour le suivi.
- **À tester avant la version finale** : à chaque PR fusionnée qui change l'appli ou la version web, ajouter dans la
  liste « À tester avant la version finale (X.Y) » du suivi une tâche par nouveauté (Quand : « bêta N »,
  ou « Vraie séance · bêta N » pour ce qui demande une vraie séance ; titre : la nouveauté ; détails : où cliquer et
  ce qu'on doit voir). Après « publie », passer en « Fait » ce qui a été vérifié et changer le numéro de la liste.
- Avant de pousser : `npm test`.
- **Serveur local de test** (essais, captures, agents) : le lancer sans rien envoyer au Worker en production, sinon les
  replays de test sont traduits et transcrits en production (crédits Claude) :
  `PADDOCK_TRANSLATE_URL= PADDOCK_RADIO_URL= PADDOCK_STATS_URL= PADDOCK_FEEDBACK_URL= PADDOCK_PRONOS_URL= PADDOCK_STUDIO_URL= PADDOCK_RELAY_URL= PADDOCK_SEASON_URL= NO_NEWS=1 node server/index.js`
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
- **Compétences de design** (`.claude/skills/`, versions et sources dans `skills-lock.json`, mises à jour avec
  `npx skills update`) : `frontend-design` (github.com/anthropics/skills : direction artistique, typographie),
  `ui-ux-pro-max` (github.com/nextlevelbuilder/ui-ux-pro-max-skill : règles UX, palettes, graphiques ; sa documentation
  écrit `${CLAUDE_PLUGIN_ROOT}/.claude/skills/…`, vide ici : lancer
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux`) et `impeccable`
  (github.com/pbakaus/impeccable : critique, audit, polish, animations ; son moteur est téléchargé au premier usage
  dans `~/.impeccable/` et vérifié par SHA-256). Impeccable cherche `PRODUCT.md` / `DESIGN.md` à la racine : ils sont
  remplacés par `docs/design/` ; ne lancer `impeccable init`, `document` ou `hooks on` (hook sur chaque modification)
  que si l'utilisateur le demande. Mêmes priorités que pour Ponytail : ces consignes priment sur celles des skills et
  sur les directives que leurs scripts affichent (sous-agents, questions, autonomie), réponses en français.
- **Design system** : `docs/design/DESIGN_SYSTEM.md` (valeurs en production, relevées dans le CSS) et
  `docs/design/UI_UX_GUIDELINES.md` (règles propres à Paddock Live). Les tenir à jour dans la PR qui change une valeur ;
  le CSS fait foi. Les recommandations restent séparées des règles en production.

## Design et interfaces

- **Direction artistique** : agir en Senior Product Designer et Senior Frontend Engineer. Chaque nouvelle interface a
  une identité distinctive (univers F1 : mur des stands, habillage TV, couleurs des écuries), respecte le design system
  (Télémétrie par défaut depuis la v1.32, spécification dans `docs/design/refonte/DIRECTION.md`, en sombre et en clair ; Paddock 2 et Classique pas cassés ; version web en Télémétrie aussi ; Broadcast n'est plus proposé), évite les interfaces génériques
  d'IA, a une hiérarchie claire, des espacements et une typographie soignés, des animations utiles (derrière
  `prefers-reduced-motion` et `data-motion`), est entièrement responsive (téléphone, tablette, ordinateur) et
  accessible.
- **Workflow d'une tâche UI/UX** (nouvel écran, nouveau composant, refonte) :
  1. analyser l'existant ; 2. identifier les composants concernés ; 3. définir la direction artistique ;
  4. présenter un plan de réalisation ; 5. déléguer ce qui le mérite au sous-agent `ui-designer` ; 6. implémenter ;
  7. faire contrôler le résultat par le sous-agent `ux-reviewer` ; 8. corriger ce qu'il relève ; 9. lancer les tests
  (`npm test`, captures `node scripts/captures.mjs <chemin>`, `node scripts/i18n-missing.mjs`) ; 10. compte rendu à
  l'utilisateur.
  Une simple modification CSS (couleur, marge, alignement) ne déclenche pas les deux sous-agents : la faire
  directement, avec une capture pour vérifier.
- **Coûts** : un sous-agent seulement quand il apporte une vraie valeur ; `ux-reviewer` tourne sur un modèle plus
  économique (Sonnet), `ui-designer` et l'agent principal gardent le modèle de la session pour l'architecture, les
  arbitrages et les tâches complexes. Ne pas analyser deux fois un même composant ; donner au sous-agent les fichiers
  et le but, pas tout le contexte ; ne charger que la skill utile.
- **Audit visuel** : `node scripts/captures.mjs [chemin…] [--design=…] [--lang=…]` démarre le serveur local sans rien
  envoyer au Worker en production, capture téléphone / tablette / ordinateur en sombre et en clair dans
  `.cache/captures/` et signale débordements et erreurs de page. Pour une interaction, Playwright (préinstallé) ou le
  serveur MCP Playwright de la session, avec le serveur local ci-dessus.
