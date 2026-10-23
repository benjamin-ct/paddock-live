# Extension Paddock Live Companion

Extension de navigateur (Chrome, Edge, Firefox) qui relie F1 TV à l'appli de bureau, comme MultiViewer
Companion : on se connecte sur formula1.com dans son navigateur habituel, et l'appli Paddock Live
ouverte sur l'ordinateur reçoit la connexion toute seule (GPS et télémétrie en direct).

## Fonctionnement

- Code dans `extension/` (Manifest V3, un seul code pour les trois navigateurs).
- L'extension lit seulement le cookie de connexion de formula1.com (`entitlement_token` sur le site actuel,
  `login-session` sur l'ancien), garde le jeton d'abonnement F1 TV qu'il contient et l'envoie à l'appli sur
  `http://127.0.0.1` (ports 3000, 3001, 3002 et 3010, ceux qu'essaie l'appli de bureau) : `POST /api/auth`.
- Envoi automatique à chaque connexion sur formula1.com, au démarrage du navigateur et toutes les
  30 minutes (si l'appli était fermée au moment de la connexion). La fenêtre de l'extension montre l'état
  et permet de renvoyer la connexion.
- Côté appli (`server/guard.js`) : une origine d'extension (`chrome-extension://`, `moz-extension://`,
  `safari-web-extension://`) n'est acceptée que pour `GET` et `POST /api/auth`, et seulement depuis cet
  ordinateur. Toutes les autres routes restent fermées aux extensions comme aux autres sites.
- Textes en français et en anglais (`extension/_locales`), choisis selon la langue du navigateur.

## Essayer sans publier

Chrome ou Edge : `chrome://extensions` → activer le **Mode développeur** → **Charger l'extension non
empaquetée** → choisir le dossier `extension/`. Firefox : `about:debugging` → **Ce Firefox** →
**Charger un module temporaire** → choisir `extension/manifest.json`.

## Fichier à envoyer aux boutiques

Depuis le dossier `extension/` :

```sh
zip -qrX ../paddock-live-companion-<version>.zip manifest.json background.js popup.html popup.js icons _locales
```

Page d'installation : `paddocklive.app/extension` (`analytics/extension/index.html`, lien de l'appli), un bouton
par boutique ; une fois l'extension acceptée sur une boutique, mettre son adresse dans `STORES`.

À chaque nouvelle version : augmenter `version` dans `extension/manifest.json`, refaire le zip et l'envoyer
comme mise à jour sur chaque boutique.

## Publier

### Chrome Web Store (5 $ une seule fois)

1. Créer le compte développeur sur https://chrome.google.com/webstore/devconsole (paiement unique de 5 $).
2. **Nouvel élément** → envoyer le zip.
3. Fiche : textes ci-dessous, catégorie **Divertissement** (ou Sport), langue par défaut anglais avec une
   fiche française, icône 128 px (déjà dans le zip), visuels de `docs/store/extension/` (voir Visuels).
4. Onglet **Confidentialité** : objectif unique et justifications ci-dessous ; données traitées :
   « Informations d'authentification » ; cocher les trois certifications (pas de vente, pas d'usage sans
   rapport avec l'objectif, pas d'évaluation de solvabilité) ; politique de confidentialité :
   `https://paddocklive.app/legal/privacy#extension`.
5. Envoyer pour examen (souvent quelques jours ; les extensions qui lisent des cookies sont relues de près).

### Microsoft Edge Add-ons (gratuit)

https://partner.microsoft.com/dashboard/microsoftedge → même zip, mêmes textes et visuels.

### Firefox Add-ons (gratuit)

https://addons.mozilla.org/developers/ → **Soumettre un nouveau module** → même zip (identifiant
`companion@paddocklive.app` déjà dans le manifeste ; le code n'est pas minifié, aucune source à fournir).
Publiée : https://addons.mozilla.org/firefox/addon/paddock-live-companion/ (bouton « Installer » de
paddocklive.app/extension).

## Textes de la fiche

**Nom** : Paddock Live Companion

**Résumé (FR)** (132 caractères au plus, coupé au-delà par le Chrome Web Store) : Connectez-vous sur
formula1.com dans votre navigateur : l'appli Paddock Live reçoit votre connexion F1 TV toute seule.

**Summary (EN)** : Connects Paddock Live to F1 TV: sign in on formula1.com in your browser and the desktop
app receives the connection automatically.

**Description (FR)** :

> Paddock Live Companion relie votre compte F1 TV à Paddock Live, l'appli gratuite pour suivre chaque Grand
> Prix en direct (classement, carte GPS, radios traduites, stratégie), calée sur votre diffusion TV.
>
> Connectez-vous simplement sur formula1.com ou f1tv.formula1.com dans votre navigateur : l'extension
> transmet la connexion à l'appli Paddock Live ouverte sur votre ordinateur, qui active aussitôt les
> positions GPS et la télémétrie en direct. Plus besoin de copier un jeton.
>
> - Automatique : à chaque connexion sur formula1.com, Paddock Live est prévenu tout seul.
> - Privé : votre connexion ne quitte jamais votre ordinateur. Elle n'est envoyée qu'à l'appli Paddock Live
>   (adresse locale 127.0.0.1), jamais à un serveur.
> - Léger : l'extension ne lit qu'un seul cookie de formula1.com, rien d'autre.
>
> Nécessite l'appli Paddock Live (Windows, macOS, Linux) : https://paddocklive.app et un abonnement F1 TV.
> Projet indépendant, non affilié à la Formula 1.

**Description (EN)** :

> Paddock Live Companion links your F1 TV account to Paddock Live, the free app to follow every Grand Prix
> live (timing, GPS track map, translated team radios, strategy), synced to your TV broadcast.
>
> Just sign in on formula1.com or f1tv.formula1.com in your browser: the extension hands the connection to
> the Paddock Live app running on your computer, which instantly enables live GPS positions and telemetry.
> No more copying tokens.
>
> - Automatic: every time you sign in on formula1.com, Paddock Live is notified.
> - Private: your sign-in never leaves your computer. It is only sent to the Paddock Live app (local address
>   127.0.0.1), never to a server.
> - Lightweight: the extension only reads one formula1.com cookie, nothing else.
>
> Requires the Paddock Live app (Windows, macOS, Linux): https://paddocklive.app and an F1 TV subscription.
> Independent project, not affiliated with Formula 1.

**Objectif unique (single purpose)** : Transmettre la connexion F1 TV du navigateur à l'appli de bureau
Paddock Live installée sur l'ordinateur de l'utilisateur.

**Justification des permissions** :

- `cookies` : lire le cookie de connexion de formula1.com (`entitlement_token`, ou `login-session` sur l'ancien site), qui contient la connexion F1 TV de
  l'utilisateur, pour la transmettre à l'appli Paddock Live.
- `storage` : retenir la dernière connexion transmise pour ne pas la renvoyer inutilement.
- `alarms` : vérifier toutes les 30 minutes si l'appli Paddock Live a été ouverte après la connexion, pour
  lui transmettre alors.
- Accès à `https://*.formula1.com/*` : nécessaire pour lire le cookie de connexion de ce site (aucune
  page n'est lue ni modifiée).
- Accès à `http://127.0.0.1/*` : envoyer la connexion à l'appli Paddock Live qui tourne sur l'ordinateur.
- Code distant : aucun.

## Visuels

Dans `docs/store/extension/`, en français (`fr-…`, fiche localisée) et en anglais (`en-…`, fiche
internationale), PNG 24 bits sans transparence, à partir de la fenêtre réelle de l'extension (à refaire si
elle change) et des captures de l'appli :

- 4 captures 1280×800, dans l'ordre : `capture-1-hero` (présentation), `capture-2-steps` (les trois
  étapes), `capture-3-privacy` (la connexion reste sur l'ordinateur), `capture-4-app` (l'appli en course) ;
- petite vignette promotionnelle 440×280 : `vignette-440x280` ;
- vignette promotionnelle en haut de page 1400×560 : `banniere-1400x560`.
