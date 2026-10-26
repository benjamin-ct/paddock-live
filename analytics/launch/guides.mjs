// Pages du site, une par grande fonction (/radios-f1-traduites/…) : ce que les gens cherchent sur Google
// (« radios F1 traduites », « live timing F1 sans spoiler »…), chacune avec ses captures, ses questions et
// le lien de téléchargement, en français et en anglais (/en/…). Écrites par scripts/build-studio.mjs, listées
// dans /sitemap.xml.
const SITE = 'https://paddocklive.app';

export const GUIDES = [
  {
    slug: 'radios-f1-traduites',
    lang: 'fr',
    pair: 'en/f1-team-radio-translated',
    title: 'Radios F1 traduites en français, en direct',
    description: 'Écoute les radios d\'équipe de F1 et lis chaque message retranscrit et traduit en français, au moment où il passe à la TV. Appli gratuite pour Windows, macOS et Linux.',
    eyebrow: 'Radios d\'équipe',
    h1: 'Chaque radio de F1, retranscrite et traduite en français',
    intro: 'Pendant la course, les radios entre pilotes et ingénieurs passent vite et en anglais. Paddock Live les affiche une par une, avec le texte retranscrit et sa traduction, calées sur ta diffusion TV.',
    img: ['radios.webp', 1600, 888, 'Radios d\'équipe retranscrites et traduites dans Paddock Live'],
    points: [
      'Une carte par radio : photo du pilote, tour, durée, écoutée ou non',
      'Texte retranscrit et traduit en français (aussi en espagnol, allemand et italien)',
      'Lecture automatique au rythme de ta TV, sans rien dévoiler d\'avance',
      'Les radios des séances passées aussi, dans les replays',
    ],
    faq: [
      ['Faut-il un abonnement F1 TV ?', 'Non. Les radios d\'équipe et leur traduction marchent sans compte. F1 TV Pro ajoute seulement les positions GPS exactes et les commentaires.'],
      ['La traduction est-elle faite en direct ?', 'Oui : chaque radio est retranscrite puis traduite dès qu\'elle est diffusée, une seule fois pour tous les utilisateurs, et affichée au moment où elle passe à ta TV.'],
    ],
  },
  {
    slug: 'timing-f1-sans-spoiler',
    lang: 'fr',
    pair: 'en/spoiler-free-f1-live-timing',
    title: 'Live timing F1 calé sur ta TV, sans spoiler',
    description: 'Le live timing de la F1 en retard exactement comme ta diffusion TV : chronos, carte, radios et alertes sans jamais spoiler la course. Gratuit pour Windows, macOS et Linux.',
    eyebrow: 'Synchro TV',
    h1: 'Le live timing F1, calé sur ta TV',
    intro: 'Ta TV a souvent 20 à 60 secondes de retard sur la course. Le live timing classique te montre donc les dépassements avant de les voir. Paddock Live retarde tout (chronos, carte, radios, alertes) du délai de ta diffusion.',
    img: ['classement.webp', 1600, 888, 'Classement en direct de Paddock Live, calé sur la TV'],
    points: [
      'Un clic sur « Je le vois ! » au bon moment, ou l\'appli écoute ta TV et règle le délai',
      'Délai jusqu\'à 10 minutes, réglable au dixième de seconde',
      'Des préréglages pour chacune de tes TV et plateformes',
      'Ton téléphone reprend le délai de l\'ordinateur',
    ],
    faq: [
      ['Pourquoi un délai ?', 'La diffusion TV arrive toujours après la course réelle. Sans délai, le timing annonce les dépassements, les arrêts et les drapeaux avant que tu les voies.'],
      ['Ça marche avec n\'importe quelle chaîne ?', 'Oui : le délai se règle sur ce que tu regardes, que ce soit la TV, F1 TV ou un autre streaming.'],
    ],
  },
  {
    slug: 'carte-gps-f1',
    lang: 'fr',
    pair: 'en/f1-live-track-map',
    title: 'Carte GPS F1 en direct : toutes les voitures sur le circuit',
    description: 'Suis toutes les voitures de F1 sur le tracé réel du circuit, en direct ou en replay : écarts, drapeaux par secteur, safety car, stands. Appli gratuite, sans spoiler.',
    eyebrow: 'Carte du circuit',
    h1: 'Toutes les voitures sur la carte du circuit',
    intro: 'Le tracé réel du circuit avec chaque voiture qui bouge, les virages numérotés, les drapeaux par secteur et la voie des stands. Pour comprendre la course d\'un coup d\'œil.',
    img: ['carte.webp', 1600, 888, 'Carte du circuit avec toutes les voitures dans Paddock Live'],
    points: [
      'Tracé réel, numéros de virage, zones de ligne droite et voie des stands',
      'Drapeaux jaunes par secteur, safety car, VSC et drapeau rouge sur la carte',
      'Écarts de moins d\'une seconde et suivi d\'un pilote, avec sa télémétrie',
      'Calques au choix : tu affiches seulement ce qui t\'intéresse',
    ],
    faq: [
      ['Les positions sont-elles exactes ?', 'Avec un abonnement F1 TV Pro, ce sont les positions GPS officielles. Sans compte, elles sont estimées à partir des chronos, et restent proches de la réalité.'],
      ['Puis-je mettre la carte sur un autre écran ?', 'Oui : carte flottante transparente, second écran, ou sur ton téléphone avec le QR code.'],
    ],
  },
  {
    slug: 'replays-f1',
    lang: 'fr',
    pair: 'en/f1-session-replays',
    title: 'Replays F1 : revois chaque séance avec ses chronos',
    description: 'Revois toutes les séances de F1 (essais, qualifs, sprint, course) avec les chronos, la carte, les radios et les moments clés, sans spoiler. Appli gratuite.',
    eyebrow: 'Replays',
    h1: 'Chaque séance de F1, à revoir avec ses chronos',
    intro: 'Tu as raté la course, ou tu veux revoir les qualifs ? Paddock Live rejoue toutes les séances des archives officielles, avec le classement, la carte, les radios et les moments clés, au rythme que tu veux.',
    img: ['moments.webp', 1600, 888, 'Replay d\'une séance avec ses moments clés dans Paddock Live'],
    points: [
      'Toutes les séances : essais, qualifs, sprint et course',
      'Moments clés cliquables : départ, drapeaux, leaders, dépassements, arrêts, pénalités',
      'Pause, ±10 secondes, vitesse de 1x à 30x',
      'Sans spoiler : les résultats restent cachés tant que tu ne les demandes pas',
    ],
    faq: [
      ['Faut-il enregistrer la séance ?', 'Non : les séances viennent des archives officielles de la F1. Celles que tu suis en direct sont aussi enregistrées, pour les revoir tout de suite.'],
      ['Le replay montre-t-il la vidéo ?', 'Non, Paddock Live rejoue les données (chronos, carte, radios). Il se cale sur ta vidéo, que tu regardes ailleurs.'],
    ],
  },
  {
    slug: 'overlay-f1-obs',
    lang: 'fr',
    pair: 'en/f1-obs-overlay',
    title: 'Overlay F1 pour OBS, Streamlabs et Meld',
    description: 'Ajoute le classement, la carte du circuit, les drapeaux et la télémétrie de la F1 en overlay sur ton live OBS, Streamlabs ou Meld, calés sur ton délai TV. Gratuit.',
    eyebrow: 'Pour les streamers',
    h1: 'La course de F1 en overlay sur ton live',
    intro: 'Classement, carte, drapeaux, compteur de tours et télémétrie, à ajouter comme source navigateur dans ton logiciel de stream. Tout est calé sur ton délai TV, pour que ton chat ne soit pas spoilé.',
    img: ['obs-course.webp', 1600, 900, 'Overlays Paddock Live dans OBS : classement, tours, carte, télémétrie et bandeau de drapeau'],
    points: [
      'Classement (colonnes au choix), carte du circuit, bandeaux de drapeaux',
      'Compteur de tours, compte à rebours, podium, télémétrie du pilote suivi',
      'Fond réglable, adresses fixes : les réglages s\'appliquent sans recopier le lien',
      'Boutons Stream Deck et Bitfocus Companion pour le délai et les replays',
    ],
    faq: [
      ['Avec quels logiciels ?', 'OBS Studio, Streamlabs, Meld Studio et tout logiciel qui accepte une source navigateur.'],
      ['L\'overlay a-t-il le même délai que ma TV ?', 'Oui : il suit le délai réglé dans l\'appli, comme le reste.'],
    ],
  },
  {
    slug: 'live-timing-f1',
    lang: 'fr',
    pair: 'en/f1-live-timing',
    title: 'Live timing F1 gratuit : chronos, écarts et pneus en direct',
    description: 'Le live timing de la Formule 1 sur ton ordinateur : classement, écarts, secteurs, pneus, arrêts, carte GPS et radios traduites, en direct ou en replay. Gratuit, sans compte, pour Windows, macOS et Linux.',
    eyebrow: 'Live timing',
    h1: 'Le live timing de la F1, gratuit et en français',
    intro: 'Classement, écarts, secteurs, pneus et arrêts de chaque voiture, mis à jour en direct pendant les essais, les qualifs, le sprint et la course. Paddock Live rassemble tout le live timing de la F1 dans une seule appli, avec la carte du circuit et les radios traduites.',
    img: ['tableau-de-bord.webp', 1600, 888, 'Live timing F1 dans Paddock Live : classement, carte du circuit, radios et direction de course'],
    points: [
      'Classement complet : écart, intervalle, dernier et meilleur tour, secteurs et mini-secteurs',
      'Pneus et âge des gommes, arrêts, speed trap, drapeaux bleus et abandons',
      'En qualif : ligne d\'élimination, temps à battre et tour en cours',
      'Analyse : race trace, positions, rythme, temps au tour et télémétrie',
      'Direction de course et documents de la FIA traduits en français',
    ],
    faq: [
      ['Le live timing est-il vraiment gratuit ?', 'Oui : pas d\'abonnement, pas de publicité, pas de compte. Les données viennent du chronométrage officiel de la F1, diffusé pendant chaque séance.'],
      ['Ça marche sur téléphone ?', 'Oui : l\'appli tourne sur ton ordinateur, et ton téléphone s\'y connecte par le Wi-Fi de la maison avec un QR code.'],
      ['Peut-on éviter les spoilers ?', 'Oui : tout le live timing se cale sur le retard de ta diffusion TV, pour voir chaque dépassement en même temps qu\'à l\'image.'],
    ],
  },
  {
    slug: 'alternative-multiviewer',
    lang: 'fr',
    pair: 'en/multiviewer-alternative',
    title: 'Alternative à MultiViewer pour suivre la F1',
    description: 'Tu cherches une appli comme MultiViewer pour la F1 ? Paddock Live : live timing, carte GPS, radios traduites en français et synchro TV, gratuit et sans abonnement F1 TV obligatoire.',
    eyebrow: 'Alternative à MultiViewer',
    h1: 'Une alternative à MultiViewer pour la F1',
    intro: 'MultiViewer est surtout connu pour regarder F1 TV sur plusieurs fenêtres. Paddock Live fait autre chose : il ne diffuse pas la vidéo, il l\'accompagne, avec tout le live timing de la course calé sur ta TV, en français.',
    img: ['tableau-de-bord.webp', 1600, 888, 'Paddock Live pendant une course : classement, carte du circuit, radios et direction de course'],
    points: [
      'Sans abonnement F1 TV : tu regardes la course où tu veux (TV, streaming)',
      'Live timing, carte GPS, pneus, stratégie et analyse de course',
      'Radios d\'équipe retranscrites et traduites en français',
      'Tout est retardé exactement comme ta diffusion : aucun spoiler',
      'Second écran, carte flottante, et ton téléphone par QR code',
    ],
    faq: [
      ['Paddock Live affiche-t-il la vidéo de F1 TV ?', 'Non. Paddock Live ne diffuse aucune vidéo : tu regardes la course sur ta TV ou ton service habituel, et l\'appli affiche les données à côté. Avec F1 TV Pro, elle ajoute les commentaires audio en direct.'],
      ['Peut-on utiliser les deux ?', 'Oui : les deux applis sont indépendantes et peuvent tourner sur le même ordinateur.'],
      ['Paddock Live est-il lié à MultiViewer ?', 'Non. MultiViewer appartient à ses auteurs ; Paddock Live est un projet indépendant, sans lien avec eux ni avec la Formula 1.'],
    ],
  },
  // Versions anglaises (/en/…), chacune liée à sa page française par hreflang
  {
    slug: 'en/f1-live-timing',
    lang: 'en',
    pair: 'live-timing-f1',
    title: 'Free F1 live timing app: timing, gaps and tyres live',
    description: 'Formula 1 live timing on your computer: standings, gaps, sectors, tyres, pit stops, GPS track map and team radio, live or in replay. Free, no account, for Windows, macOS and Linux.',
    eyebrow: 'Live timing',
    h1: 'F1 live timing, free on your computer',
    intro: 'Standings, gaps, sectors, tyres and pit stops for every car, updated live during practice, qualifying, the sprint and the race. Paddock Live brings all of F1 live timing into one app, with the track map and team radio.',
    img: ['tableau-de-bord.webp', 1600, 888, 'F1 live timing in Paddock Live: standings, track map, team radio and race control'],
    points: [
      'Full timing tower: gap, interval, last and best lap, sectors and mini-sectors',
      'Tyres and tyre age, pit stops, speed trap, blue flags and retirements',
      'In qualifying: elimination line, time to beat and the lap in progress',
      'Analysis: race trace, positions, pace, lap times and telemetry',
      'Race control messages and official FIA documents',
    ],
    faq: [
      ['Is the live timing really free?', 'Yes: no subscription, no ads, no account. The data comes from the official F1 timing feed, broadcast during every session.'],
      ['Does it work on a phone?', 'Yes: the app runs on your computer, and your phone connects to it over your home Wi-Fi with a QR code.'],
      ['Can I avoid spoilers?', 'Yes: all the live timing is delayed to match your TV broadcast, so you see every overtake at the same time as on screen.'],
    ],
  },
  {
    slug: 'en/multiviewer-alternative',
    lang: 'en',
    pair: 'alternative-multiviewer',
    title: 'MultiViewer alternative for following F1',
    description: 'Looking for an app like MultiViewer for F1? Paddock Live: live timing, GPS track map, transcribed team radio and TV sync, free and with no F1 TV subscription required.',
    eyebrow: 'MultiViewer alternative',
    h1: 'A MultiViewer alternative for F1',
    intro: 'MultiViewer is best known for watching F1 TV in several windows. Paddock Live does something else: it doesn\'t stream the video, it goes alongside it, with all the race\'s live timing synced to your TV.',
    img: ['tableau-de-bord.webp', 1600, 888, 'Paddock Live during a race: standings, track map, team radio and race control'],
    points: [
      'No F1 TV subscription needed: watch the race wherever you like (TV, streaming)',
      'Live timing, GPS track map, tyres, strategy and race analysis',
      'Team radio transcribed, and translated into French, Spanish, German or Italian',
      'Everything is delayed exactly like your broadcast: zero spoilers',
      'Second screen, floating map, and your phone via a QR code',
    ],
    faq: [
      ['Does Paddock Live show the F1 TV video?', 'No. Paddock Live doesn\'t stream any video: you watch the race on your usual TV or service, and the app shows the data next to it. With F1 TV Pro, it adds the live audio commentary.'],
      ['Can I use both?', 'Yes: the two apps are independent and can run on the same computer.'],
      ['Is Paddock Live related to MultiViewer?', 'No. MultiViewer belongs to its authors; Paddock Live is an independent project, not affiliated with them or with Formula 1.'],
    ],
  },
  {
    slug: 'en/f1-team-radio-translated',
    lang: 'en',
    pair: 'radios-f1-traduites',
    title: 'F1 team radio, live: every message transcribed',
    description: 'Listen to F1 team radio and read every message transcribed (and translated if you like) as it airs on TV. Free app for Windows, macOS and Linux.',
    eyebrow: 'Team radio',
    h1: 'Every F1 team radio, transcribed as it airs',
    intro: 'During the race, radio messages between drivers and engineers go by fast and are hard to hear. Paddock Live shows them one by one, with the transcribed text, synced to your TV broadcast.',
    img: ['radios.webp', 1600, 888, 'Team radio transcribed in Paddock Live'],
    points: [
      'One card per message: driver photo, lap, length, played or not',
      'Transcribed text, translated into French, Spanish, German or Italian if you like',
      'Auto-play at the pace of your TV, without revealing anything early',
      'Radio from past sessions too, in the replays',
    ],
    faq: [
      ['Do I need F1 TV?', 'No. Team radio and its transcription work without an account. F1 TV Pro only adds exact GPS positions and the commentary.'],
      ['Is the transcription done live?', 'Yes: each message is transcribed as soon as it\'s broadcast, once for all users, and shown when it airs on your TV.'],
    ],
  },
  {
    slug: 'en/spoiler-free-f1-live-timing',
    lang: 'en',
    pair: 'timing-f1-sans-spoiler',
    title: 'Spoiler-free F1 live timing, synced to your TV',
    description: 'F1 live timing delayed exactly like your TV broadcast: timing, map, team radio and alerts without ever spoiling the race. Free for Windows, macOS and Linux.',
    eyebrow: 'TV sync',
    h1: 'F1 live timing, synced to your TV',
    intro: 'Your TV is often 20 to 60 seconds behind the race. Regular live timing shows you overtakes before you see them. Paddock Live delays everything (timing, map, radio, alerts) by your broadcast\'s delay.',
    img: ['classement.webp', 1600, 888, 'Paddock Live live standings, synced to the TV'],
    points: [
      'One click on « I see it! » at the right moment, or the app listens to your TV and sets the delay',
      'Delay up to 10 minutes, adjustable to a tenth of a second',
      'Presets for each of your TVs and streaming services',
      'Your phone follows the computer\'s delay',
    ],
    faq: [
      ['Why a delay?', 'The TV broadcast always arrives after the real race. Without a delay, timing reveals overtakes, pit stops and flags before you see them.'],
      ['Does it work with any channel?', 'Yes: you set the delay for whatever you watch, whether it\'s TV, F1 TV or another streaming service.'],
    ],
  },
  {
    slug: 'en/f1-live-track-map',
    lang: 'en',
    pair: 'carte-gps-f1',
    title: 'Live F1 track map: every car on the circuit',
    description: 'Follow every F1 car on the real circuit layout, live or in replay: gaps, flags by sector, safety car, pit lane. Free app, spoiler-free.',
    eyebrow: 'Track map',
    h1: 'Every car on the track map',
    intro: 'The real circuit layout with every car moving, numbered corners, flags by sector and the pit lane. To understand the race at a glance.',
    img: ['carte.webp', 1600, 888, 'Track map with every car in Paddock Live'],
    points: [
      'Real layout, corner numbers, straight-line zones and pit lane',
      'Yellow flags by sector, safety car, VSC and red flag on the map',
      'Gaps under one second and driver tracking, with telemetry',
      'Layers of your choice: show only what you care about',
    ],
    faq: [
      ['Are the positions exact?', 'With an F1 TV Pro subscription, they are the official GPS positions. Without an account, they are estimated from the timing and stay close to reality.'],
      ['Can I put the map on another screen?', 'Yes: transparent floating map, second screen, or on your phone with the QR code.'],
    ],
  },
  {
    slug: 'en/f1-session-replays',
    lang: 'en',
    pair: 'replays-f1',
    title: 'F1 replays: rewatch every session with its timing',
    description: 'Replay every F1 session (practice, qualifying, sprint, race) with the timing, track map, team radio and key moments, spoiler-free. Free app.',
    eyebrow: 'Replays',
    h1: 'Every F1 session, to replay with its timing',
    intro: 'Missed the race, or want to rewatch qualifying? Paddock Live replays every session from the official archives, with the standings, map, team radio and key moments, at the speed you want.',
    img: ['moments.webp', 1600, 888, 'Replay of a session with its key moments in Paddock Live'],
    points: [
      'Every session: practice, qualifying, sprint and race',
      'Clickable key moments: start, flags, leaders, overtakes, pit stops, penalties',
      'Pause, ±10 seconds, speed from 1x to 30x',
      'Spoiler-free: results stay hidden until you ask for them',
    ],
    faq: [
      ['Do I need to record the session?', 'No: sessions come from the official F1 archives. The ones you follow live are recorded too, so you can rewatch them right away.'],
      ['Does the replay show the video?', 'No, Paddock Live replays the data (timing, map, radio). It syncs to your video, which you watch elsewhere.'],
    ],
  },
  {
    slug: 'en/f1-obs-overlay',
    lang: 'en',
    pair: 'overlay-f1-obs',
    title: 'F1 overlay for OBS, Streamlabs and Meld',
    description: 'Add F1 standings, the track map, flags and telemetry as overlays on your OBS, Streamlabs or Meld stream, synced to your TV delay. Free.',
    eyebrow: 'For streamers',
    h1: 'The F1 race as overlays on your stream',
    intro: 'Standings, map, flags, lap counter and telemetry, to add as a browser source in your streaming software. Everything follows your TV delay, so your chat never gets spoiled.',
    img: ['obs-course.webp', 1600, 900, 'Paddock Live overlays in OBS: standings, laps, track map, telemetry and flag banner'],
    points: [
      'Standings (columns of your choice), track map, flag banners',
      'Lap counter, countdown, podium, telemetry of the driver you follow',
      'Adjustable background, fixed URLs: settings apply without copying the link again',
      'Stream Deck and Bitfocus Companion buttons for the delay and replays',
    ],
    faq: [
      ['Which software?', 'OBS Studio, Streamlabs, Meld Studio and any software that accepts a browser source.'],
      ['Does the overlay have the same delay as my TV?', 'Yes: it follows the delay set in the app, like everything else.'],
    ],
  },
];

// Textes de la page dans chaque langue (les pages anglaises renvoient vers l'accueil anglais, /en/)
const UI = {
  fr: { home: '/', season: 'https://app.paddocklive.app/saison/', seasonName: 'Saison de F1', dl: 'Télécharger', cta: 'Télécharger Paddock Live gratuitement', os: 'Windows, macOS et Linux', faq: 'Questions fréquentes', more: 'Aussi dans Paddock Live', all: 'Toutes les fonctions', terms: 'Conditions d\'utilisation', privacy: 'Confidentialité', locale: 'fr_FR',
    legal: 'Paddock Live est un projet indépendant, sans lien avec la Formula 1, la FIA ni les écuries. F1, FORMULA 1 et les marques associées appartiennent à Formula One Licensing B.V.' },
  en: { home: '/en/', season: 'https://app.paddocklive.app/saison/', seasonName: 'F1 season', dl: 'Download', cta: 'Download Paddock Live for free', os: 'Windows, macOS and Linux', faq: 'Frequently asked questions', more: 'Also in Paddock Live', all: 'All features', terms: 'Terms of Service', privacy: 'Privacy', locale: 'en_US',
    legal: 'Paddock Live is an independent project, not affiliated with Formula 1, the FIA or the teams. F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V.' },
};

// Style des pages du site écrites ici
const PAGE_STYLE = `@font-face { font-family: 'Titillium Web'; font-weight: 400; font-display: swap; src: url('/fonts/titillium-400.woff2') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 700; font-display: swap; src: url('/fonts/titillium-700.woff2') format('woff2'); }
@font-face { font-family: 'Saira Condensed'; font-weight: 800; font-display: swap; src: url('/fonts/sairacondensed-800.woff2') format('woff2'); }
:root { color-scheme: dark; --bg: #0b0c0f; --card: #15171c; --line: rgba(255, 255, 255, .08); --line-2: rgba(255, 255, 255, .15); --text: #f2f1ee; --text-2: #c8c7c1; --muted: #8f8d87; --red: #e10600; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 'Titillium Web', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { display: block; max-width: 100%; height: auto; }
.wrap { max-width: 1000px; margin: 0 auto; padding: 0 max(16px, env(safe-area-inset-left)); }
.nav { border-bottom: 1px solid var(--line); }
.nav .wrap { display: flex; align-items: center; gap: 16px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font: 800 24px/1 'Saira Condensed', sans-serif; }
.brand img { width: 32px; height: 32px; border-radius: 8px; }
.brand b { color: var(--red); }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 13px 24px; border-radius: 999px; background: var(--red); color: #fff; text-decoration: none; font-weight: 700; white-space: nowrap; }
.nav .btn { margin-left: auto; padding: 9px 16px; font-size: 14px; }
.eyebrow { display: inline-block; font-weight: 700; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--red); margin: 48px 0 12px; }
h1, h2 { font-family: 'Saira Condensed', 'Arial Narrow', sans-serif; font-weight: 800; line-height: 1.04; margin: 0; }
h1 { font-size: clamp(36px, 6vw, 58px); }
h2 { font-size: clamp(26px, 4vw, 36px); margin: 56px 0 16px; }
.lead { color: var(--text-2); font-size: 19px; max-width: 62ch; }
.frame { margin: 32px 0; border-radius: 14px; overflow: hidden; border: 1px solid var(--line-2); }
ul.points { padding-left: 1.2em; color: var(--text-2); }
ul.points li { margin: 8px 0; }
details { border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; margin: 10px 0; background: var(--card); }
summary { font-weight: 700; cursor: pointer; }
details p { color: var(--text-2); margin: 10px 0 0; }
.cta { margin: 40px 0; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.cta small { color: var(--muted); }
.more { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.more a { display: block; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); text-decoration: none; font-weight: 700; }
.more a:hover { border-color: var(--line-2); }
footer { margin-top: 72px; padding: 28px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
footer a { color: var(--text-2); }
`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function guidePage(slug) {
  const g = GUIDES.find((x) => x.slug === slug);
  const url = `${SITE}/${g.slug}/`;
  const others = GUIDES.filter((x) => x !== g && x.lang === g.lang);
  const ui = UI[g.lang];
  const href = (x) => `${SITE}/${x}/`;
  const fr = g.lang === 'fr' ? g.slug : g.pair, en = g.lang === 'en' ? g.slug : g.pair;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', name: 'Paddock Live', operatingSystem: 'Windows, macOS, Linux', applicationCategory: 'SportsApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: SITE },
      { '@type': 'FAQPage', mainEntity: g.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };
  const [img, w, h, alt] = g.img;
  return `<!doctype html>
<html lang="${g.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(g.title)} · Paddock Live</title>
<meta name="description" content="${esc(g.description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="fr" href="${href(fr)}">
<link rel="alternate" hreflang="en" href="${href(en)}">
<link rel="alternate" hreflang="x-default" href="${href(en)}">
<meta property="og:locale" content="${ui.locale}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(g.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/site/img/apercu.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/site/img/logo.png">
<link rel="apple-touch-icon" href="/site/img/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>
${PAGE_STYLE}</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="${ui.home}"><img src="/site/img/logo.png" alt="" width="32" height="32">Paddock <b>Live</b></a>
  <a class="btn" href="${ui.home}#telecharger">${ui.dl}</a>
</div></header>
<main class="wrap">
  <span class="eyebrow">${esc(g.eyebrow)}</span>
  <h1>${esc(g.h1)}</h1>
  <p class="lead">${esc(g.intro)}</p>
  <div class="frame"><img src="/site/img/${img}" width="${w}" height="${h}" alt="${esc(alt)}"></div>
  <ul class="points">${g.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  <div class="cta"><a class="btn" href="${ui.home}#telecharger">${ui.cta}</a><small>${ui.os}</small></div>
  <h2>${ui.faq}</h2>
  ${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
  <h2>${ui.more}</h2>
  <div class="more">${others.map((x) => `<a href="/${x.slug}/">${esc(x.eyebrow)}</a>`).join('')}<a href="${ui.home}">${ui.all}</a></div>
</main>
<footer><div class="wrap">
  <p><a href="${ui.home}">Paddock Live</a> · <a href="${ui.season}">${ui.seasonName}</a> · <a href="/legal/terms">${ui.terms}</a> · <a href="/legal/privacy">${ui.privacy}</a> · <a href="/${g.pair}/">${g.lang === 'fr' ? 'English' : 'Français'}</a></p>
  <p>${ui.legal}</p>
</div></footer>
</body>
</html>
`;
}

// Accueil en anglais (/en/) : la page d'accueil française (analytics/launch/index.html) avec ses textes data-en, ses liens
// data-href-en et ses champs data-ph-en déjà en place, son titre, sa description et ses adresses en anglais. Une vraie
// page pour les moteurs de recherche, qui n'exécutent pas toujours le script de la page.
export function englishHome(html) {
  const root = /<html lang="fr" data-title-en="([^"]*)" data-desc-en="([^"]*)">/.exec(html);
  if (!root) throw new Error('accueil : <html data-title-en data-desc-en> introuvable');
  const [, title, desc] = root;
  // Contenu de chaque élément data-en remplacé (jusqu'à sa balise fermante, éléments du même nom imbriqués compris)
  let out = '', i = 0;
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sdata-en="([^"]*)"[^>]*>/gi)) {
    if (m.index < i) continue;
    const tag = m[1].toLowerCase(), start = m.index + m[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = start;
    let depth = 1, close;
    while (depth && (close = re.exec(html))) depth += close[1] ? -1 : 1;
    if (depth) throw new Error(`accueil : </${tag}> introuvable`);
    out += html.slice(i, start) + m[2];
    i = close.index;
  }
  out += html.slice(i);
  const fixed = (s, re, to) => { if (!re.test(s)) throw new Error(`accueil : ${re} introuvable`); return s.replace(re, to); };
  out = out.replace(/(<[^>]*?)\shref="[^"]*"([^>]*?)\sdata-href-en="([^"]*)"/g, '$1 href="$3"$2 data-href-en="$3"')
    .replace(/(<[^>]*?)\splaceholder="[^"]*"([^>]*?)\sdata-ph-en="([^"]*)"/g, '$1 placeholder="$3"$2 data-ph-en="$3"');
  out = fixed(out, /<html lang="fr"/, '<html lang="en"');
  out = fixed(out, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = fixed(out, /(<meta name="description" content=")[^"]*"/, `$1${desc}"`);
  out = fixed(out, /(<meta property="og:description" content=")[^"]*"/, `$1${desc}"`);
  out = fixed(out, /(<meta property="og:(?:title|image:alt)" content=")[^"]*"/g, `$1${title}"`);
  out = fixed(out, /(<link rel="canonical" href=")[^"]*"/, `$1${SITE}/en/"`);
  out = fixed(out, /(<meta property="og:url" content=")[^"]*"/, `$1${SITE}/en/"`);
  out = fixed(out, /("@type":"SoftwareApplication","name":"Paddock Live","description":")[^"]*"/, `$1${desc}"`);
  return out;
}

// Plan du site pour les moteurs de recherche, et règles d'exploration (Studio, outils et pages privées exclus)
export const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'en/', ...GUIDES.map((g) => `${g.slug}/`), 'alertes/', 'extension/', 'legal/terms', 'legal/privacy'].map((p) => `  <url><loc>${SITE}/${p}</loc></url>`).join('\n')}
  <url><loc>https://app.paddocklive.app/</loc></url>
</urlset>
`;
export const robots = () => `User-agent: *
Disallow: /studio/
Disallow: /m/
Disallow: /kit/
Disallow: /stats
Disallow: /login
Sitemap: ${SITE}/sitemap.xml
Sitemap: ${SITE}/saison/sitemap.xml
`;
