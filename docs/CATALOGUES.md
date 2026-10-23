# Catalogues d'applications

Où proposer Paddock Live en plus de GitHub et du site, ce qui est prêt dans le dépôt et ce qui reste à faire
(un compte ou une première demande à votre nom). État des règles vérifié en octobre 2026.

| Catalogue | Système | État | À faire par vous |
|---|---|---|---|
| **winget** | Windows | prêt (`packaging/winget/`), mises à jour automatiques préparées | première demande, puis un jeton |
| **AUR** | Arch Linux | prêt (`packaging/aur/PKGBUILD`) | compte AUR et envoi |
| **AlternativeTo** | tous | fiche à créer (texte ci-dessous) | 15 minutes |
| Homebrew | macOS | **refusé** tant que l'appli n'est pas notarisée par Apple | — |
| Flathub | Linux | possible mais long (3 à 6 jours), risque avec l'Electron de castlabs | — |
| Chocolatey, Snap | Windows, Linux | possibles plus tard (environ 1 jour chacun) | — |

## winget (Windows)

Les gens installent avec `winget install PaddockLive.PaddockLive`, sans l'avertissement SmartScreen du
téléchargement. Microsoft n'exige pas de signature : l'installateur est analysé (antivirus, installation et
désinstallation silencieuses), puis relu par une personne. Compter quelques jours à deux semaines.

**Première version (une seule fois)**

1. Sur GitHub, ouvrir https://github.com/microsoft/winget-pkgs et cliquer **Fork** (copie à votre nom).
2. Dans votre copie, ajouter le dossier `manifests/p/PaddockLive/PaddockLive/1.28.1/` avec les trois fichiers de
   `packaging/winget/manifests/p/PaddockLive/PaddockLive/1.28.1/` (bouton **Add file → Upload files**).
3. Ouvrir la demande (**Contribute → Open pull request**) vers microsoft/winget-pkgs, titre
   « New package: PaddockLive.PaddockLive version 1.28.1 », puis accepter le contrat de contributeur (CLA)
   demandé par le robot de Microsoft.
4. Attendre l'étiquette « Validation-Completed » puis la fusion. En cas d'erreur, le robot l'explique dans la
   demande : me l'envoyer.

**Versions suivantes (automatiques)**

1. Créer un jeton GitHub « classic » : https://github.com/settings/tokens/new, droits `public_repo` et
   `workflow`, sans expiration ou d'un an.
2. Dans le dépôt paddock-live : **Settings → Secrets and variables → Actions → New repository secret**,
   nom `WINGET_TOKEN`, valeur : le jeton.
3. À chaque version finale, le workflow « Application de bureau » envoie la nouvelle version à winget (étape
   « Catalogue winget ») ; rien pour les bêtas.

## AUR (Arch Linux)

Les utilisateurs d'Arch installent avec `yay -S paddock-live-bin`. Pas de relecture : le paquet est en ligne dès
l'envoi.

1. Créer un compte sur https://aur.archlinux.org/register et y ajouter une clé SSH (Mon compte → Clé publique).
2. Sur un ordinateur sous Arch (ou un conteneur Arch) :
   ```
   git clone ssh://aur@aur.archlinux.org/paddock-live-bin.git
   cp packaging/aur/PKGBUILD paddock-live-bin/
   cd paddock-live-bin && makepkg --printsrcinfo > .SRCINFO && makepkg -si   # essai
   git add PKGBUILD .SRCINFO && git commit -m "paddock-live-bin 1.28.1" && git push
   ```
3. À chaque version : `pkgver` et `sha256sums` (empreinte du .deb, donnée sur la page de la version GitHub) à
   changer, `.SRCINFO` refait, puis `git push`. Je peux préparer ces lignes à chaque publication.

## AlternativeTo

https://alternativeto.net/ → **Suggest new app**. Proposer Paddock Live comme alternative à F1 TV, MultiViewer
et F1 Live Timing.

- Nom : Paddock Live
- Site : https://paddocklive.app/
- Licence : gratuite, open source (MIT)
- Systèmes : Windows, Mac, Linux
- Description : *Application gratuite pour suivre chaque Grand Prix de Formule 1 en direct : chronos, carte du
  circuit, radios d'équipe retranscrites et traduites, stratégie et replays, calés sur votre diffusion TV pour
  ne jamais être spoilé. Projet indépendant, sans lien avec la Formula 1.*

## Pourquoi pas les autres (pour l'instant)

- **Homebrew** : depuis septembre 2026, le catalogue officiel désactive les applis qui ne passent pas
  Gatekeeper (non notarisées). Il faudrait le programme développeur d'Apple (99 $ par an). Un dépôt Homebrew
  personnel reste possible, mais l'utilisateur doit quand même passer outre l'alerte de macOS : peu d'intérêt.
- **Flathub** : l'appli doit y être compilée à partir des sources, sans réseau. Le lecteur F1 TV utilise un
  Electron particulier (castlabs, Widevine) qu'on ne sait pas encore compiler ni distribuer sur Flathub.
- **Chocolatey** (Windows) et **Snap** (Linux) : possibles, environ une journée chacun ; winget suffit pour
  commencer sur Windows.
