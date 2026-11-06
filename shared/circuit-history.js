// « Dans l'histoire » (fiche d'un Grand Prix à venir) : vainqueurs des courses passées sur le circuit, d'après les
// résultats officiels publics (API Jolpica, circuits/{id}/results/1), et depuis 2018 neutralisations, arrêts et places
// gagnées en piste de chaque course, d'après l'analyse des archives de la F1 (shared/race-stats.js). Fonctions pures,
// utilisées par le serveur (analytics/circuit-history.js).
import { FIRST_YEAR } from './circuit-records.js';

// Saisons sans course sur le circuit à partir desquelles on parle d'un retour au calendrier (tracé souvent refait
// entre-temps : Mexico absent de 1993 à 2014, Zandvoort de 1986 à 2020)
const LONG_GAP = 3;

// Réponse de Jolpica -> vainqueurs, dans l'ordre des courses (deux vainqueurs pour une voiture partagée, années 1950)
export function winnersOf(races = []) {
  return races.flatMap((r) => (r.Results || []).filter((x) => x.position === '1').map((x) => ({
    y: Number(r.season), round: Number(r.round), name: r.raceName || '',
    id: x.Driver?.driverId || '', code: x.Driver?.code || '', driver: `${x.Driver?.givenName || ''} ${x.Driver?.familyName || ''}`.trim(),
    last: x.Driver?.familyName || '', team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '',
    grid: x.grid === undefined || x.grid === '' ? null : Number(x.grid),   // 0 : départ des stands
  }))).sort((a, b) => a.y - b.y || a.round - b.round);
}

// Chiffres d'une course analysée : tours du leader neutralisés (voiture de sécurité, virtuelle ou drapeau rouge), arrêts
// aux stands de tous les pilotes, places gagnées en piste (hors 1er tour, stands et neutralisations)
export function raceFigures(stats) {
  const drivers = stats?.drivers || [];
  return {
    neutral: stats?.profile?.neutralLaps ?? null,
    stops: drivers.length ? drivers.reduce((n, d) => n + (d.stopCount ?? d.stops?.length ?? 0), 0) : null,
    gains: stats?.profile?.gains ?? null,
  };
}

// winners : winnersOf ; figures : « année:manche » -> raceFigures des courses analysées depuis 2018
export function historySummary(winners = [], figures = new Map()) {
  const races = [];
  for (const w of winners) {
    const last = races.at(-1);
    if (last && last.y === w.y && last.round === w.round) last.winners.push(w);
    else races.push({ y: w.y, round: w.round, name: w.name, winners: [w] });
  }
  if (!races.length) return { races: 0, winners: [], recordmen: [], fromPole: null, recent: null };
  // Retour au calendrier après une longue absence : depuis quand la série actuelle compte
  let since = races[0].y;
  for (let i = 1; i < races.length; i++) if (races[i].y - races[i - 1].y - 1 >= LONG_GAP) since = races[i].y;
  const wins = new Map();
  for (const w of winners) {
    const k = w.id || w.driver;
    const cur = wins.get(k) || { id: w.id, code: w.code, driver: w.driver, last: w.last, team: w.team, teamId: w.teamId, wins: 0, years: [] };
    cur.wins++; cur.years.push(w.y); cur.team = w.team; cur.teamId = w.teamId;   // écurie de sa dernière victoire ici
    wins.set(k, cur);
  }
  const top = Math.max(...[...wins.values()].map((x) => x.wins));
  const known = races.filter((r) => r.winners.some((w) => w.grid !== null));
  const recent = races.filter((r) => r.y >= FIRST_YEAR).map((r) => ({ y: r.y, round: r.round, name: r.name, winner: r.winners[0], ...(figures.get(`${r.y}:${r.round}`) || {}) }));
  const done = recent.filter((r) => r.neutral !== undefined && r.neutral !== null);
  const avg = (k) => { const v = done.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  return {
    races: races.length, first: races[0].y, since,
    winners: races.slice(-10).reverse().map((r) => ({ y: r.y, round: r.round, name: r.name, winners: r.winners })),
    recordmen: [...wins.values()].filter((x) => x.wins === top).sort((a, b) => a.years[0] - b.years[0]),
    fromPole: known.length ? { n: known.filter((r) => r.winners.some((w) => w.grid === 1)).length, of: known.length } : null,
    recent: recent.length ? { from: FIRST_YEAR, races: recent.reverse(), analysed: done.length, neutralised: done.filter((r) => r.neutral > 0).length, stops: avg('stops'), gains: avg('gains') } : null,
  };
}
