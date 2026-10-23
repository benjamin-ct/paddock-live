// Pages du site, une par grande fonction (/radios-f1-traduites/…) : ce que les gens cherchent sur Google
// (« radios F1 traduites », « live timing F1 sans spoiler »…), chacune avec ses captures, ses questions et
// le lien de téléchargement. Écrites par scripts/build-studio.mjs, listées dans /sitemap.xml.
const SITE = 'https://paddocklive.app';

export const GUIDES = [
  {
    slug: 'radios-f1-traduites',
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
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function guidePage(slug) {
  const g = GUIDES.find((x) => x.slug === slug);
  const url = `${SITE}/${g.slug}/`;
  const others = GUIDES.filter((x) => x !== g);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', name: 'Paddock Live', operatingSystem: 'Windows, macOS, Linux', applicationCategory: 'SportsApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: SITE },
      { '@type': 'FAQPage', mainEntity: g.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };
  const [img, w, h, alt] = g.img;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(g.title)} · Paddock Live</title>
<meta name="description" content="${esc(g.description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${url}">
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
@font-face { font-family: 'Titillium Web'; font-weight: 400; font-display: swap; src: url('/fonts/titillium-400.woff2') format('woff2'); }
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
</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="/"><img src="/site/img/logo.png" alt="" width="32" height="32">Paddock <b>Live</b></a>
  <a class="btn" href="/#telecharger">Télécharger</a>
</div></header>
<main class="wrap">
  <span class="eyebrow">${esc(g.eyebrow)}</span>
  <h1>${esc(g.h1)}</h1>
  <p class="lead">${esc(g.intro)}</p>
  <div class="frame"><img src="/site/img/${img}" width="${w}" height="${h}" alt="${esc(alt)}"></div>
  <ul class="points">${g.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  <div class="cta"><a class="btn" href="/#telecharger">Télécharger Paddock Live gratuitement</a><small>Windows, macOS et Linux</small></div>
  <h2>Questions fréquentes</h2>
  ${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
  <h2>Aussi dans Paddock Live</h2>
  <div class="more">${others.map((x) => `<a href="/${x.slug}/">${esc(x.eyebrow)}</a>`).join('')}<a href="/">Toutes les fonctions</a></div>
</main>
<footer><div class="wrap">
  <p><a href="/">Paddock Live</a> · <a href="/legal/terms">Conditions d'utilisation</a> · <a href="/legal/privacy">Confidentialité</a></p>
  <p>Paddock Live est un projet indépendant, sans lien avec la Formula 1, la FIA ni les écuries. F1, FORMULA 1 et les marques associées appartiennent à Formula One Licensing B.V.</p>
</div></footer>
</body>
</html>
`;
}

// Plan du site pour les moteurs de recherche, et règles d'exploration (Studio, outils et pages privées exclus)
export const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', '?lang=en', ...GUIDES.map((g) => `${g.slug}/`), 'alertes/', 'extension/', 'p/', 'legal/terms', 'legal/privacy'].map((p) => `  <url><loc>${SITE}/${p}</loc></url>`).join('\n')}
</urlset>
`;
export const robots = () => `User-agent: *
Disallow: /studio/
Disallow: /m/
Disallow: /kit/
Disallow: /stats
Disallow: /login
Sitemap: ${SITE}/sitemap.xml
`;
