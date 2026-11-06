// Jeu du jour « Devine le circuit » (paddocklive.app/jeu/) : fonctions pures, lues telles quelles par la page
// (/jeu/game.js) et par les tests (test/jeu.test.js).
// Le jour est celui de Paris : le circuit change à minuit en France (le site est d'abord français), le même pour tous,
// où qu'on soit. Le navigateur calcule le jour lui-même : la page reste un fichier statique.

export const TRIES = 6;
export const FIRST_DAY = 20763;   // 6 novembre 2026, circuit n° 1

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

// Indices révélés après chaque erreur, dans l'ordre : pays, longueur, virages, premier Grand Prix de F1, ville
export function hints(c, t) {
  const km = c.km.toLocaleString(t.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return [[t.country, c.country], [t.length, `${km} km`], [t.turns, String(c.turns)], [t.first, String(c.first)], [t.city, c.city]];
}

// Essai comparé à la réponse : trouvé, même pays (identifiant « au-1953 » : code du pays, année d'ouverture) ou raté
export const mark = (guess, answer) => (guess === answer ? 'hit' : guess.split('-')[0] === answer.split('-')[0] ? 'near' : 'miss');

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
export function shareText({ num, marks, won, streak, t }) {
  return [`${t.shareTitle} · ${t.num.replace('{}', num)} · ${won ? marks.length : 'X'}/${TRIES}`, marks.map((m) => SQUARE[m]).join(''),
    ...(streak > 1 ? [t.shareStreak.replace('{}', streak)] : []), t.url].join('\n');
}
