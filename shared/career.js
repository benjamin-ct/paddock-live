// Carrière d'un pilote (Saison → Pilotes) : départs, victoires, poles, podiums, titres et écuries, saison par saison.
// Saisons passées d'après les résultats officiels publics (API Jolpica : drivers/{id}/results, drivers/{id}/qualifying/1,
// champion de chaque saison), saison en cours d'après la saison gardée par le serveur (format de shared/season-data.js).
// Fonctions pures, utilisées par le serveur (analytics/career.js).

// Poles : 1er des qualifications (pas la grille, faussée par les pénalités) ; avant 2003, Jolpica n'a pas toutes les
// qualifications : 1er sur la grille
export const QUALI_FROM = 2003;
// Inscrit mais pas parti : non partant (W), non qualifié (F), ou statut qui le dit (anciennes saisons)
const NO_START = /did not (start|qualify|prequalify)|withdrew/i;
const started = (posText, status) => !['W', 'F'].includes(String(posText)) && !NO_START.test(status || '');

function bump(map, y) {
  if (!map.has(y)) map.set(y, { y, teams: [], starts: 0, wins: 0, podiums: 0, poles: 0 });
  return map.get(y);
}
const addTeam = (s, id, name) => { if (name && !s.teams.some((t) => t.id === id && t.name === name)) s.teams.push({ id: id || '', name }); };

// races : réponses de drivers/{id}/results ; poles : de drivers/{id}/qualifying/1 ; upTo : dernière saison comptée
export function careerSeasons(races = [], poles = [], upTo = Infinity) {
  const by = new Map();
  for (const r of races) {
    const y = Number(r.season), x = r.Results?.[0];
    if (!x || y > upTo) continue;
    const s = bump(by, y);
    addTeam(s, x.Constructor?.constructorId, x.Constructor?.name);
    if (!started(x.positionText, x.status)) continue;
    s.starts++;
    const pos = Number(x.position);
    if (/^\d+$/.test(x.positionText || '') && pos === 1) s.wins++;
    if (/^\d+$/.test(x.positionText || '') && pos <= 3) s.podiums++;
    if (y < QUALI_FROM && Number(x.grid) === 1) s.poles++;
  }
  for (const r of poles) {
    const y = Number(r.season);
    if (y >= QUALI_FROM && y <= upTo && r.QualifyingResults?.[0]?.position === '1') bump(by, y).poles++;
  }
  return [...by.values()].sort((a, b) => a.y - b.y);
}

// Saison en cours (summarize) pour ce pilote (id Jolpica, sinon son code) ; titre seulement une fois toutes les courses
// courues ; null s'il n'y a rien couru
export function seasonLine(season, id, code, year) {
  const me = (x) => (id && x.id ? x.id === id : x.code === code);
  const s = { y: year, teams: [], starts: 0, wins: 0, podiums: 0, poles: 0 };
  let entries = 0;
  for (const r of season?.races || []) {
    const x = (r.results || []).find(me);
    if ((r.quali || []).find(me)?.pos === 1) s.poles++;
    if (!x) continue;
    entries++;
    addTeam(s, x.teamId, x.team);
    if (!started(x.posText, x.status)) continue;
    s.starts++;
    if (/^\d+$/.test(x.posText || '') && x.pos === 1) s.wins++;
    if (/^\d+$/.test(x.posText || '') && x.pos <= 3) s.podiums++;
  }
  if (!entries && !s.poles) return null;
  const races = season.races || [];
  if (races.length && races.every((r) => r.results?.length) && season.drivers?.find(me)?.pos === 1) s.title = true;
  return s;
}

// Saisons -> carrière : totaux, titres (champions : saison -> id du champion), première saison
export function careerOf(seasons, id, champions = {}) {
  const list = seasons.map((s) => ({ ...s, title: !!(s.title || (champions[s.y] && champions[s.y] === id)) }));
  const sum = (k) => list.reduce((n, s) => n + s[k], 0);
  return {
    seasons: list, first: list[0]?.y ?? null,
    totals: { starts: sum('starts'), wins: sum('wins'), podiums: sum('podiums'), poles: sum('poles'), titles: list.filter((s) => s.title).map((s) => s.y) },
  };
}
