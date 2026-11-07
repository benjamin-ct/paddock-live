// Jeu du jour « Devine le circuit » (paddocklive.app/jeu/) : fonctions pures, lues telles quelles par la page
// (/jeu/game.js), par le classement du serveur (analytics/jeu-board.js) et par les tests (test/jeu.test.js).
// Le jour est celui de Paris : le circuit change à minuit en France (le site est d'abord français), le même pour tous,
// où qu'on soit. Le navigateur calcule le jour lui-même : la page reste un fichier statique.

export const TRIES = 6;
export const FIRST_DAY = 20763;   // 6 novembre 2026, circuit n° 1
export const MIX_DAY = 20765;     // 8 novembre 2026 : premiers jours « pilote » et premières difficultés
export const LEVELS = ['easy', 'medium', 'hard'];

// Jour de Paris d'une date : nombre de jours depuis le 1er janvier 1970 (calendrier de Paris, pas l'heure UTC)
const PARIS = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' });
export function parisDay(date = new Date()) {
  const p = Object.fromEntries(PARIS.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day) / 864e5;
}

// Ordre des circuits d'un cycle de n jours (mélange tiré d'une graine fixe, mulberry32) : chaque circuit une fois par cycle
function order(cycle, n) {
  let s = (cycle * 2654435761 + 0x9e3779b9) >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
// Circuit du jour (indice dans la liste de n circuits) : même jour = même circuit, jamais deux jours de suite le même
// (le premier d'un cycle échange sa place avec le deuxième s'il est le dernier du cycle d'avant)
export function dailyIndex(day, n) {
  const cycle = Math.floor(day / n), p = order(cycle, n);
  if (n > 2 && p[0] === order(cycle - 1, n)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  return p[day - cycle * n];
}

// Programme du jour, le même pour tous : circuit ou pilote à deviner, et difficulté (facile, moyen, difficile), tirés
// du jour (jamais trois jours de suite le même type). Avant MIX_DAY : circuit, moyen (parties déjà jouées)
const mix = (d) => { let x = Math.imul(d ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const rawMode = (d) => (mix(d) % 2 ? 'driver' : 'circuit');
export function plan(day) {
  if (day < MIX_DAY) return { mode: 'circuit', level: 'medium' };
  // Types des jours depuis MIX_DAY, dans l'ordre : un troisième jour de suite du même type passe à l'autre
  let a = null, b = null;
  for (let d = MIX_DAY; d <= day; d++) {
    let m = rawMode(d);
    if (m === a && m === b) m = m === 'driver' ? 'circuit' : 'driver';
    [b, a] = [a, m];
  }
  return { mode: a, level: LEVELS[Math.floor(mix(day) / 2) % 3] };
}

// Points : 10 au départ, moins 1 par erreur (elle donne un indice) et 2 par joker (indice suivant sans perdre d'essai),
// au moins 1 si trouvé, 0 si perdu ; fois 1, 2 ou 3 selon la difficulté. Bonus de série (serveur) : +1 par jour trouvé
// d'affilée avant celui-ci, jusqu'à +5
export const MAX_JOKERS = 5;
export const points = (level, misses, jokers, won) => (won ? Math.max(1, 10 - misses - 2 * jokers) * (LEVELS.indexOf(level) + 1) : 0);
export const streakBonus = (before) => Math.min(5, Math.max(0, before));

// Part du tracé visible au départ, puis après chaque erreur, selon la difficulté ; tout en fin de partie
export const REVEAL = { easy: [0.4, 0.55, 0.7, 0.85, 0.95], medium: [0.25, 0.4, 0.55, 0.7, 0.85], hard: [0.12, 0.25, 0.4, 0.55, 0.7] };
export const revealed = (misses, done, level = 'medium') => (done ? 1 : REVEAL[level][Math.min(misses, REVEAL[level].length - 1)]);
// Pilote : indices visibles au départ (3, 2 ou 1 selon la difficulté), un de plus à chaque erreur
export const CLUES = { easy: 3, medium: 2, hard: 1 };
export const cluesShown = (misses, done, level = 'medium') => (done ? 6 : Math.min(6, CLUES[level] + misses));
// Début de la partie visible (fraction du tour), tiré du jour : le même pour tous, pas toujours la ligne de départ
export const revealStart = (day) => (day * 0.6180339887) % 1;

// Indices révélés après chaque erreur, dans l'ordre : pays, longueur, virages, premier Grand Prix de F1, ville
export function hints(c, t) {
  const km = c.km.toLocaleString(t.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return [[t.country, c.country], [t.length, `${km} km`], [t.turns, String(c.turns)], [t.first, String(c.first)], [t.city, c.city]];
}

// Indices d'un pilote, du plus difficile au plus facile : débuts en F1, titres, victoires, pays, dernière écurie, initiales
export function driverHints(d, t) {
  const initials = d.name.split(/[\s-]+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
  return [[t.debut, String(d.first)], [t.titles, String(d.titles)], [t.wins, String(d.wins)], [t.nat, d.country], [t.team, d.team], [t.initials, initials]];
}

// Essai comparé à la réponse : trouvé, presque (circuit : même pays, identifiant « au-1953 » = code du pays et année
// d'ouverture ; pilote : même nationalité, comparée par la fonction same) ou raté
export const mark = (guess, answer, same = (a, b) => a.split('-')[0] === b.split('-')[0]) => (guess === answer ? 'hit' : same(guess, answer) ? 'near' : 'miss');

// games : { [jour]: { g: [identifiants essayés], r: 'w' (trouvé) | 'l' (perdu) | absent (en cours) } }
// Série : jours trouvés d'affilée jusqu'à aujourd'hui (ou hier si celui du jour n'est pas encore joué)
export function stats(games, today) {
  const done = Object.keys(games || {}).map(Number).filter((d) => games[d]?.r).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of done) {
    run = games[d].r === 'w' ? (prev === d - 1 && run ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = d;
  }
  let streak = 0;
  for (let d = games?.[today]?.r ? today : today - 1; games?.[d]?.r === 'w'; d--) streak++;
  return { played: done.length, won: done.filter((d) => games[d].r === 'w').length, streak, best };
}

// Texte à partager, façon Wordle : un carré par essai (vert trouvé, jaune même pays, rouge raté)
const SQUARE = { hit: '🟩', near: '🟨', miss: '🟥' };
export function shareText({ num, marks, won, streak, t, title = t.shareTitle, level = '' }) {
  return [`${title} · ${t.num.replace('{}', num)}${level ? ` · ${level}` : ''} · ${won ? marks.length : 'X'}/${TRIES}`, marks.map((m) => SQUARE[m]).join(''),
    ...(streak > 1 ? [t.shareStreak.replace('{}', streak)] : []), t.url].join('\n');
}
