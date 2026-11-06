// Jeu du jour « Devine le circuit » : page du site en français (/jeu/) et en anglais (/en/guess-the-circuit/), écrite
// par scripts/build-studio.mjs comme les pages des fonctions (analytics/launch/guides.mjs). Les 40 tracés
// (public/data/f1-circuits.json, d'après bacinger/f1-circuits, licence MIT) et leurs indices sont dans la page ; le
// navigateur choisit celui du jour (analytics/jeu/game.js, servi en /jeu/game.js) et garde la série (app.js).
import fs from 'node:fs';
import { shapeOutline, nearestShape } from '../../shared/circuit-shapes.js';
import { CIRCUITS, flagColors } from '../../shared/circuits-info.js';

const SITE = 'https://paddocklive.app';
export const PATHS = { fr: 'jeu', en: 'en/guess-the-circuit' };

// Indices de chaque tracé : ville (et son nom anglais s'il diffère), premier Grand Prix de F1, longueur en mètres et
// nombre de virages. Ville, année et longueur d'après bacinger/f1-circuits (Monaco : 1950, premier Grand Prix du
// championnat, et non 1929 ; Madring : 5 414 m, formula1.com) ; la longueur officielle de shared/circuits-info.js
// remplace celle-ci pour les circuits du calendrier. Virages : nombre officiel du tracé dessiné. Virages inconnus
// (null) : le tracé reste dans la liste des réponses possibles mais n'est jamais le circuit du jour.
const FACTS = {
  'au-1953': ['Melbourne', null, 1996, 5278, 14], 'bh-2002': ['Sakhir', null, 2004, 5412, 15], 'cn-2004': ['Shanghai', null, 2004, 5451, 16],
  'es-1991': ['Barcelone', 'Barcelona', 1991, 4655, 14], 'mc-1929': ['Monaco', null, 1950, 3337, 19], 'ca-1978': ['Montréal', 'Montreal', 1978, 4361, 14],
  'fr-1969': ['Le Castellet', null, 1971, 5842, 15], 'at-1969': ['Spielberg', null, 1970, 4318, 10], 'gb-1948': ['Silverstone', null, 1950, 5891, 18],
  'de-1932': ['Hockenheim', null, 1970, 4574, 17], 'hu-1986': ['Budapest', null, 1986, 4381, 14], 'be-1925': ['Spa-Francorchamps', null, 1950, 7004, 19],
  'it-1922': ['Monza', null, 1950, 5793, 11], 'sg-2008': ['Singapour', 'Singapore', 2008, 4928, 19], 'ru-2014': ['Sotchi', 'Sochi', 2014, 5848, 18],
  'jp-1962': ['Suzuka', null, 1987, 5807, 18], 'us-2012': ['Austin', null, 2012, 5514, 20], 'mx-1962': ['Mexico', 'Mexico City', 1963, 4304, 17],
  'br-1940': ['São Paulo', null, 1973, 4309, 15], 'ae-2009': ['Abou Dabi', 'Abu Dhabi', 2009, 5281, 16], 'it-1953': ['Imola', null, 1980, 4909, 19],
  'de-1927': ['Nürburg', null, 1984, 5148, 15], 'pt-2008': ['Portimão', null, 2020, 4653, 15], 'it-1914': ['Scarperia', null, 2020, 5245, 15],
  'my-1999': ['Sepang', null, 1999, 5543, 15], 'tr-2005': ['Istanbul', null, 2005, 5338, 14], 'nl-1948': ['Zandvoort', null, 1952, 4259, 14],
  'fr-1960': ['Magny-Cours', null, 1991, 4412, 17], 'pt-1972': ['Estoril', null, 1984, 4349, 13], 'br-1977': ['Rio de Janeiro', null, 1978, 5031, null],
  'sa-2021': ['Djeddah', 'Jeddah', 2021, 6175, 27], 'us-2022': ['Miami', null, 2022, 5412, 19], 'qa-2004': ['Lusail', null, 2021, 5380, 16],
  'es-2026': ['Madrid', null, 2026, 5414, 22], 'az-2016': ['Bakou', 'Baku', 2016, 6003, 20], 'us-2023': ['Las Vegas', null, 2023, 6201, 17],
  'us-1909': ['Indianapolis', null, 2000, 4192, 13], 'ar-1952': ['Buenos Aires', null, 1953, 4322, null], 'za-1961': ['Johannesbourg', 'Johannesburg', 1967, 4529, 16],
  'us-1956': ['Watkins Glen', null, 1961, 5430, 11],
};

// Tracés et indices dans la langue de la page (pays : nom donné par le navigateur de la machine qui écrit la page)
export function gameData(lang) {
  const shapes = JSON.parse(fs.readFileSync(new URL('../../public/data/f1-circuits.json', import.meta.url), 'utf8')).circuits;
  const km = {};
  for (const c of Object.values(CIRCUITS)) { const s = nearestShape(shapes, c.lat, c.lon); if (s) km[s.id] = c.km; }
  const country = new Intl.DisplayNames([lang], { type: 'region' });
  return shapes.map((s) => {
    if (!FACTS[s.id]) throw new Error(`Devine le circuit : indices manquants pour ${s.id}`);
    const [city, cityEn, first, m, turns] = FACTS[s.id], iso = s.id.split('-')[0];
    return { id: s.id, name: s.name, city: (lang === 'en' && cityEn) || city, country: country.of(iso.toUpperCase()), flag: flagColors(iso), first,
      km: km[s.id] ?? m / 1000, turns, outline: shapeOutline(s.line) };
  });
}

const T = {
  fr: {
    locale: 'fr-FR', ogLocale: 'fr_FR', home: '/', title: 'Devine le circuit : le jeu F1 du jour · Paddock Live',
    description: 'Chaque jour, un tracé de F1 en silhouette, le même pour tous. Six essais, un indice par erreur, ta série et ton résultat à partager. Gratuit.',
    eyebrow: 'Jeu du jour', num: 'n° {}', h1: 'Devine le circuit',
    lead: 'Un tracé de F1 par jour, le même pour tout le monde. Tu as six essais : chaque erreur dévoile un indice.',
    trackLabel: 'Tracé du circuit du jour, nord en haut', trackShort: 'Tracé du jour', north: 'N', next: 'Prochain circuit dans {}', fresh: 'Nouveau circuit disponible', reload: 'Recharger',
    guessLabel: 'Ton essai', placeholder: 'Nom du circuit ou ville', submit: 'Valider', tries: 'Essais', hintsTitle: 'Indices',
    hit: 'Trouvé', near: 'Même pays', miss: 'Raté', locked1: 'Après 1 erreur', locked: 'Après {} erreurs',
    country: 'Pays', length: 'Longueur', turns: 'Virages', first: 'Premier GP de F1', city: 'Ville',
    unknown: 'Circuit inconnu : choisis-le dans la liste.', many: 'Plusieurs circuits correspondent : précise ou choisis dans la liste.', again: 'Déjà essayé.',
    missed: 'Raté : {}.', newHint: 'Nouvel indice, {} : {}.', winOne: 'Trouvé du premier coup', win: 'Trouvé en {} essais', lose: 'Perdu, c\'était',
    share: 'Partager le résultat', copied: 'Résultat copié.', copyFail: 'Copie impossible : sélectionne le texte ci-dessus.',
    played: 'Joués', wonPct: 'Trouvés', streak: 'Série', best: 'Meilleure série',
    shareTitle: 'Devine le circuit', shareStreak: '🔥 Série : {} jours', url: 'paddocklive.app/jeu/',
    noscript: 'Le jeu a besoin de JavaScript pour fonctionner.',
    howTitle: 'Comment jouer',
    how: ['Un nouveau circuit chaque jour à minuit, heure de Paris, le même pour tout le monde.',
      'Six essais. Après chaque erreur, un indice : le pays, la longueur, le nombre de virages, l\'année du premier Grand Prix de F1, puis la ville.',
      'Carré jaune : bon pays, mauvais circuit. Les 40 circuits de la liste ont tous accueilli la F1, ou vont l\'accueillir.',
      'Ta série reste dans ce navigateur : rien n\'est envoyé.'],
    cta: 'Chaque Grand Prix en direct, calé sur ta TV et sans spoiler', dl: 'Télécharger', ctaBtn: 'Télécharger Paddock Live', os: 'Gratuit · Windows, macOS et Linux',
    credit: 'Tracés : <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a>, © 2019-2025 Tomislav Bacinger, licence <a href="https://github.com/bacinger/f1-circuits/blob/master/LICENSE">MIT</a>. Aucune image de la Formula 1.',
    terms: 'Conditions d\'utilisation', privacy: 'Confidentialité', mentions: 'Mentions légales', other: 'English',
    legal: 'Paddock Live est un projet indépendant, sans lien avec la Formula 1, la FIA ni les écuries. F1, FORMULA 1 et les marques associées appartiennent à Formula One Licensing B.V.',
  },
  en: {
    locale: 'en-US', ogLocale: 'en_US', home: '/en/', title: 'Guess the Circuit: the daily F1 game · Paddock Live',
    description: 'Every day, one F1 track layout in silhouette, the same for everyone. Six guesses, one clue per miss, your streak and a result to share. Free.',
    eyebrow: 'Daily game', num: '#{}', h1: 'Guess the circuit',
    lead: 'One F1 track a day, the same for everyone. You get six guesses: every miss reveals a clue.',
    trackLabel: 'Today\'s circuit layout, north up', trackShort: 'Today\'s track', north: 'N', next: 'Next circuit in {}', fresh: 'New circuit available', reload: 'Reload',
    guessLabel: 'Your guess', placeholder: 'Circuit name or city', submit: 'Guess', tries: 'Guesses', hintsTitle: 'Clues',
    hit: 'Correct', near: 'Same country', miss: 'Wrong', locked1: 'After 1 miss', locked: 'After {} misses',
    country: 'Country', length: 'Length', turns: 'Turns', first: 'First F1 GP', city: 'City',
    unknown: 'Unknown circuit: pick it from the list.', many: 'Several circuits match: be more specific or pick from the list.', again: 'Already guessed.',
    missed: 'Wrong: {}.', newHint: 'New clue, {}: {}.', winOne: 'Got it first time', win: 'Got it in {} guesses', lose: 'Out of guesses, it was',
    share: 'Share your result', copied: 'Result copied.', copyFail: 'Could not copy: select the text above.',
    played: 'Played', wonPct: 'Solved', streak: 'Streak', best: 'Best streak',
    shareTitle: 'Guess the circuit', shareStreak: '🔥 Streak: {} days', url: 'paddocklive.app/en/guess-the-circuit/',
    noscript: 'The game needs JavaScript to work.',
    howTitle: 'How to play',
    how: ['A new circuit every day at midnight, Paris time, the same for everyone.',
      'Six guesses. After each miss, a clue: the country, the length, the number of turns, the year of the first F1 Grand Prix, then the city.',
      'Yellow square: right country, wrong circuit. All 40 circuits in the list have hosted F1, or are about to.',
      'Your streak stays in this browser: nothing is sent.'],
    cta: 'Every Grand Prix live, synced to your TV and spoiler-free', dl: 'Download', ctaBtn: 'Download Paddock Live', os: 'Free · Windows, macOS and Linux',
    credit: 'Track layouts: <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a>, © 2019-2025 Tomislav Bacinger, <a href="https://github.com/bacinger/f1-circuits/blob/master/LICENSE">MIT</a> licence. No Formula 1 imagery.',
    terms: 'Terms of Service', privacy: 'Privacy', mentions: 'Legal notice', other: 'Français',
    legal: 'Paddock Live is an independent project, not affiliated with Formula 1, the FIA or the teams. F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V.',
  },
};
// Textes repris par le script de la page
const CLIENT = ['locale', 'num', 'next', 'fresh', 'reload', 'hit', 'near', 'miss', 'locked1', 'locked', 'country', 'length', 'turns', 'first', 'city', 'unknown', 'many', 'again',
  'missed', 'newHint', 'winOne', 'win', 'lose', 'copied', 'copyFail', 'played', 'wonPct', 'streak', 'best', 'shareTitle', 'shareStreak', 'url'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Design « Télémétrie » du site (analytics/launch/guides.mjs), en sombre et en clair ; couleurs de la course pour les
// essais (vert trouvé, jaune même pays, rouge raté) et violet pour le tracé trouvé (meilleur temps absolu)
const STYLE = `@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; font-display: swap; src: url('/fonts/archivo-var.woff2') format('woff2'); }
@font-face { font-family: 'Archivo Cond'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('/fonts/archivo-cond-var.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400 700; font-display: swap; src: url('/fonts/jetbrainsmono-var.woff2') format('woff2'); }
:root { color-scheme: dark; --bg: #0B0F15; --panel: #10151D; --panel-2: #161D27; --panel-3: #1B2430; --border: #222B37; --line-2: #2E3946;
  --text: #F2F4F5; --text-2: #B4BDC8; --muted: #8A95A3; --accent: #E10600; --accent-2: #C80500; --ring: #F2F4F5;
  --best: #B98CFF; --pb: #3DDC84; --yellow: #FFD43B; --red: #FF5A5F; --ease: cubic-bezier(.16, 1, .3, 1);
  --font: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif; --title: 'Archivo Cond', 'Archivo', 'Arial Narrow', sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace; }
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; --bg: #F3F5F7; --panel: #FFFFFF; --panel-2: #F7F8FA; --panel-3: #ECEFF3; --border: #E1E5EA; --line-2: #C9D0D8;
    --text: #10151D; --text-2: #3D4754; --muted: #56606D; --ring: #10151D; --best: #6D28D9; --pb: #0A7A45; --yellow: #8A5A00; --red: #C42828; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 16px/1.6 var(--font); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.wrap { max-width: 1000px; margin: 0 auto; padding: 0 max(16px, env(safe-area-inset-left)); }
.nav { position: sticky; top: 0; z-index: 20; background: var(--bg); border-bottom: 1px solid var(--border); }
.nav .wrap { display: flex; align-items: center; gap: 16px; height: 56px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font: 800 20px/1 var(--title); text-transform: uppercase; letter-spacing: .01em; }
.brand img { width: 30px; height: 30px; border-radius: 6px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border: 1px solid var(--accent); border-radius: 6px; background: var(--accent); color: #fff;
  text-decoration: none; font: 600 15px/1 var(--font); white-space: nowrap; cursor: pointer; transition: background-color .14s, border-color .14s, transform .08s; }
.btn:hover { background: var(--accent-2); border-color: var(--accent-2); }
.btn:active { transform: scale(.97); }
.btn:disabled { opacity: .45; cursor: default; transform: none; }
.btn.ghost { background: var(--panel-3); border-color: var(--line-2); color: var(--text); }
.btn.ghost:hover { background: var(--panel-2); }
.nav .btn { margin-left: auto; min-height: 36px; padding: 0 14px; font-size: 14px; }
.eyebrow, .label { color: var(--muted); font: 500 11px/1.3 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
.eyebrow { display: flex; gap: 10px; margin: 48px 0 14px; }
.eyebrow b { color: var(--text-2); font-weight: 500; }
h1, h2 { font-family: var(--title); font-weight: 800; text-transform: uppercase; letter-spacing: .005em; margin: 0; }
h1 { font-size: clamp(40px, 7vw, 72px); line-height: .92; }
h2 { font-size: clamp(26px, 3.6vw, 36px); line-height: .95; margin: 64px 0 16px; }
.lead { color: var(--text-2); font-size: 18px; line-height: 1.55; max-width: 60ch; margin: 18px 0 0; }
/* Plateau : le tracé à gauche, essais et indices à droite (l'un sous l'autre au téléphone) */
.board { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; margin: 36px 0 0; align-items: start; }
.track { margin: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); overflow: hidden; }
.bar { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--panel-2); }
.bar .label:last-child { text-align: right; }
.stage { position: relative; aspect-ratio: 1; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 12.5% 12.5%; background-position: -1px -1px; }
.stage svg { display: block; width: 100%; height: 100%; }
.stage .north { position: absolute; top: 10px; left: 12px; color: var(--muted); font: 500 11px/1 var(--mono); letter-spacing: .12em; }
.stage .north::before { content: '↑ '; }
.trk-under { fill: none; stroke: var(--bg); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round; }
.trk { fill: none; stroke: var(--text); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; transition: stroke .4s; }
.track.won .trk { stroke: var(--best); }
.draw .trk { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .9s var(--ease) .1s forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.answer { padding: 14px; border-top: 1px solid var(--border); }
.answer b { display: block; font: 800 24px/1.05 var(--title); text-transform: uppercase; }
.answer span { color: var(--text-2); font-size: 14px; }
/* Saisie */
form { margin: 0; }
.field { display: flex; gap: 8px; margin-top: 8px; }
.field input { flex: 1; min-width: 0; min-height: 48px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--panel-2); color: var(--text); font: 400 16px var(--font); }
.field input::placeholder { color: var(--muted); }
.field input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.msg { min-height: 1.6em; margin: 8px 0 0; color: var(--text-2); font-size: 14px; }
/* Essais : lignes numérotées comme une tour des temps */
ol.tries { list-style: none; margin: 18px 0 0; padding: 0; border-top: 1px solid var(--border); }
.tries li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 46px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.tries .n { color: var(--muted); font: 500 12px/1 var(--mono); }
.tries .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.tries li:not(.on) .nm { color: var(--muted); font-weight: 400; }
.tag { display: inline-flex; align-items: center; gap: 7px; color: var(--text-2); font: 500 11px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
.tag::before { content: ''; width: 10px; height: 10px; border-radius: 2px; background: currentColor; }
.tag.hit { color: var(--pb); } .tag.near { color: var(--yellow); } .tag.miss { color: var(--red); }
/* Indices */
.hints-h { margin: 28px 0 0; }
dl.hints { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 10px 0 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--border); }
.hints div { min-width: 0; padding: 12px 14px; background: var(--panel); }
.hints div:last-child { grid-column: 1 / -1; }
.hints dt { color: var(--muted); font: 500 11px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; }
.hints dd { margin: 6px 0 0; font: 800 22px/1.1 var(--title); text-transform: uppercase; overflow-wrap: anywhere; display: flex; align-items: center; gap: 8px; }
.hints div.lock dd { color: var(--muted); font: 400 14px/1.6 var(--font); text-transform: none; }
.hints div.lock { background: var(--panel-2); }
.flag { flex: none; display: inline-flex; width: 18px; height: 12px; border-radius: 2px; overflow: hidden; box-shadow: 0 0 0 1px var(--line-2); }
.flag i { flex: 1; }
.hints .new dd, .tries .new { animation: rise .22s var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
/* Résultat */
.end { margin: 28px 0 0; padding: 20px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.end h2 { margin: 0; font-size: clamp(26px, 4vw, 34px); }
.end h2:focus { outline: none; }
.end pre { margin: 16px 0 0; padding: 12px 14px; border-radius: 6px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-2); font: 400 14px/1.5 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.end .row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-top: 14px; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 0; padding: 16px 0 0; border-top: 1px solid var(--border); }
.stats b { display: block; font: 800 34px/1 var(--title); }
.stats span { display: block; margin-top: 6px; color: var(--muted); font: 500 10px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; }
ul.how { counter-reset: pt; list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); color: var(--text-2); max-width: 72ch; }
ul.how li { counter-increment: pt; position: relative; padding: 12px 0 12px 44px; border-bottom: 1px solid var(--border); }
ul.how li::before { content: counter(pt, decimal-leading-zero); position: absolute; left: 0; top: 15px; color: var(--muted); font: 500 12px/1.3 var(--mono); letter-spacing: .08em; }
.cta { margin: 48px 0 0; padding: 22px 0 0; border-top: 1px solid var(--border); display: flex; gap: 12px 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.cta p { margin: 0; font: 800 22px/1.1 var(--title); text-transform: uppercase; max-width: 30ch; }
.cta small { display: block; margin-top: 6px; color: var(--muted); font: 500 12px/1.3 var(--mono); letter-spacing: .06em; }
.noscript { padding: 14px; color: var(--text-2); }
footer { margin-top: 72px; padding: 28px 0 40px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }
footer a { color: var(--text-2); text-underline-offset: 3px; }
@media (max-width: 760px) {
  .board { grid-template-columns: minmax(0, 1fr); }
  .track { max-width: 460px; width: 100%; justify-self: center; }
}
@media (max-width: 520px) {
  .eyebrow { margin-top: 32px; }
  .bar .label:first-child { display: none; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cta .btn, .end .row .btn { width: 100%; }
}
@media (pointer: coarse) { .nav .btn { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .btn, .trk { transition: none; } .btn:active { transform: none; }
  .draw .trk { animation: none; stroke-dashoffset: 0; } .hints .new dd, .tries .new { animation: none; }
}
`;

export function gamePage(lang) {
  const t = T[lang], other = lang === 'fr' ? 'en' : 'fr';
  const url = `${SITE}/${PATHS[lang]}/`;
  const circuits = gameData(lang);
  const names = [...circuits].sort((a, b) => a.name.localeCompare(b.name, lang));
  const data = { t: Object.fromEntries(CLIENT.map((k) => [k, t[k]])), circuits };
  const ld = { '@context': 'https://schema.org', '@type': 'WebApplication', name: t.h1, url, description: t.description, applicationCategory: 'GameApplication', operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, isPartOf: { '@type': 'WebSite', name: 'Paddock Live', url: `${SITE}/` } };
  const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<meta name="theme-color" content="#0B0F15" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F3F5F7" media="(prefers-color-scheme: light)">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="fr" href="${SITE}/${PATHS.fr}/">
<link rel="alternate" hreflang="en" href="${SITE}/${PATHS.en}/">
<link rel="alternate" hreflang="x-default" href="${SITE}/${PATHS.en}/">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/site/img/apercu.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.description)}">
<link rel="icon" href="/site/img/logo.png">
<link rel="apple-touch-icon" href="/site/img/apple-touch-icon.png">
<link rel="modulepreload" href="/jeu/game.js">
<script type="application/ld+json">${json(ld)}</script>
<style>
${STYLE}</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="${t.home}"><img src="/site/img/logo.png" alt="" width="32" height="32">Paddock <b>Live</b></a>
  <a class="btn" href="${t.home}#telecharger">${t.dl}</a>
</div></header>
<main class="wrap">
  <p class="eyebrow">${esc(t.eyebrow)} <b id="num"></b></p>
  <h1>${esc(t.h1)}</h1>
  <p class="lead">${esc(t.lead)}</p>
  <div class="board">
    <figure class="track" id="track">
      <div class="bar"><span class="label">${esc(t.trackShort)}</span><span class="label" id="clock" aria-live="off"></span></div>
      <div class="stage"><span class="north" aria-hidden="true">${t.north}</span>
        <svg viewBox="-4 -4 108 108" role="img" aria-label="${esc(t.trackLabel)}"><polygon class="trk-under" id="trkU" points=""/><polygon class="trk" id="trk" points="" pathLength="1"/></svg>
      </div>
      <figcaption class="answer" id="answer" hidden></figcaption>
      <noscript><p class="noscript">${esc(t.noscript)}</p></noscript>
    </figure>
    <div>
      <form id="form" autocomplete="off">
        <label class="label" for="guess">${esc(t.guessLabel)}</label>
        <div class="field"><input id="guess" name="guess" list="names" placeholder="${esc(t.placeholder)}" autocapitalize="words" spellcheck="false" enterkeyhint="go" required><button class="btn" type="submit">${esc(t.submit)}</button></div>
        <p class="msg" id="msg" role="status"></p>
      </form>
      <datalist id="names">${names.map((c) => `<option value="${esc(c.name)}">${esc(c.city)}</option>`).join('')}</datalist>
      <ol class="tries" id="tries" aria-label="${esc(t.tries)}"></ol>
      <p class="label hints-h" id="hintsH">${esc(t.hintsTitle)}</p>
      <dl class="hints" id="hints" aria-labelledby="hintsH"></dl>
    </div>
  </div>
  <section class="end" id="end" hidden aria-labelledby="endH">
    <h2 id="endH" tabindex="-1"></h2>
    <pre id="shareText"></pre>
    <div class="row"><button class="btn" type="button" id="share">${esc(t.share)}</button><span class="msg" id="shareMsg" role="status"></span></div>
    <div class="stats" id="stats"></div>
  </section>
  <h2>${esc(t.howTitle)}</h2>
  <ul class="how">${t.how.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  <div class="cta"><p>${esc(t.cta)}<small>${esc(t.os)}</small></p><a class="btn" href="${t.home}#telecharger">${esc(t.ctaBtn)}</a></div>
</main>
<footer><div class="wrap">
  <p>${t.credit}</p>
  <p><a href="${t.home}">Paddock Live</a> · <a href="/legal/terms">${esc(t.terms)}</a> · <a href="/legal/privacy">${esc(t.privacy)}</a> · <a href="/legal/mentions">${esc(t.mentions)}</a> · <a href="/${PATHS[other]}/" hreflang="${other}">${t.other}</a></p>
  <p>${esc(t.legal)}</p>
</div></footer>
<script type="application/json" id="data">${json(data)}</script>
<script type="module" src="/jeu/app.js"></script>
</body>
</html>
`;
}
