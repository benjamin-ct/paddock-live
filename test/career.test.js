import test from 'node:test';
import assert from 'node:assert/strict';
import { careerSeasons, seasonLine, careerOf } from '../shared/career.js';
import { careerTick, careerWeb, careerKey } from '../analytics/career.js';
import { liveApi } from '../analytics/live-relay.js';
import { summarize } from '../shared/season-data.js';

const res = (season, round, pos, grid, team = 'ferrari', extra = {}) => ({ season: String(season), round: String(round),
  Results: [{ position: String(pos), positionText: String(pos), grid: String(grid), status: 'Finished', Constructor: { constructorId: team, name: team[0].toUpperCase() + team.slice(1) }, ...extra }] });
const pole = (season, round) => ({ season: String(season), round: String(round), QualifyingResults: [{ position: '1' }] });

test('carrière : départs, victoires, podiums, poles (qualifications, grille avant 2003), écuries par saison', () => {
  const races = [
    res(2001, 1, 12, 19, 'minardi'), res(2001, 2, 1, 1, 'minardi'),   // 2001 : pole d'après la grille
    res(2002, 1, 20, 20, 'minardi', { positionText: 'W', status: 'Did not start' }),   // inscrit, pas parti
    res(2005, 1, 1, 3, 'renault'), res(2005, 2, 3, 1, 'renault'),   // grille 1 sans être 1er des qualifs : pas de pole
    res(2005, 3, 4, 2, 'renault', { positionText: 'R', status: 'Engine' }),
    res(2007, 1, 2, 2, 'mclaren'), res(2026, 1, 1, 1, 'aston_martin'),
  ];
  const s = careerSeasons(races, [pole(2005, 1), pole(2005, 3), pole(2026, 1)], 2025);
  assert.deepEqual(s.map((x) => [x.y, x.starts, x.wins, x.podiums, x.poles]), [[2001, 2, 1, 1, 1], [2002, 0, 0, 0, 0], [2005, 3, 1, 2, 2], [2007, 1, 0, 1, 0]]);
  assert.deepEqual(s[0].teams, [{ id: 'minardi', name: 'Minardi' }]);   // 2026 : saison en cours, pas comptée ici
  // Saison en cours (format de la saison gardée) : titre seulement quand toutes les courses sont courues
  const season = { races: [
    { results: [{ id: 'alonso', code: 'ALO', pos: 1, posText: '1', team: 'Aston Martin', teamId: 'aston_martin', status: 'Finished' }], quali: [{ id: 'alonso', pos: 1 }] },
    { results: [], quali: [] }], drivers: [{ id: 'alonso', code: 'ALO', pos: 1 }] };
  const cur = seasonLine(season, 'alonso', 'ALO', 2026);
  assert.deepEqual([cur.starts, cur.wins, cur.podiums, cur.poles, cur.title], [1, 1, 1, 1, undefined]);
  season.races[1].results = [{ id: 'alonso', pos: 2, posText: '2', team: 'Aston Martin', teamId: 'aston_martin' }];
  assert.equal(seasonLine(season, 'alonso', 'ALO', 2026).title, true);
  assert.equal(seasonLine(season, 'norris', 'NOR', 2026), null);
  const c = careerOf([...s, cur], 'alonso', { 2005: 'alonso', 2007: 'raikkonen' });
  assert.deepEqual(c.totals, { starts: 7, wins: 3, podiums: 5, poles: 4, titles: [2005] });
  assert.equal(c.first, 2001);
  // Identifiant Jolpica gardé dans la saison (la carrière le demande)
  const sum = summarize({ schedule: [], driverStandings: [{ position: '1', Driver: { driverId: 'norris', code: 'NOR', givenName: 'Lando', familyName: 'Norris' }, Constructors: [] }], constructorStandings: [], results: [], quali: [], sprint: [] });
  assert.equal(sum.drivers[0].id, 'norris');
});

function fakeDB() {
  const studio = new Map();
  return {
    studio,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (/^SELECT v FROM studio/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null;
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async all() {
          if (/^SELECT k, v FROM studio WHERE k >= \? AND k < \?/.test(sql)) return { results: [...studio].filter(([k]) => k >= args[0] && k < args[1]).map(([k, v]) => ({ k, v })) };
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio/.test(sql)) { studio.set(args[0], args[1]); return {}; }
          if (/^INSERT INTO ai_usage/.test(sql)) return { meta: { changes: 1 } };
          throw new Error(`SQL inattendu : ${sql}`);
        },
      };
      return st;
    },
  };
}
const wait = async () => {};
const page = (MRData) => ({ ok: true, json: async () => ({ MRData }) });

test('carrière : la tâche planifiée lit un pilote par passage puis les champions, une erreur est réessayée une heure plus tard', async () => {
  const env = { DB: fakeDB() };
  const now = Date.parse('2026-11-06T12:00:00Z');
  env.DB.studio.set('season:2026', JSON.stringify({ at: now, v: { races: [{ results: [{ id: 'alonso', code: 'ALO', pos: 5, posText: '5', team: 'Aston Martin', teamId: 'aston_martin' }], quali: [] }],
    drivers: [{ id: 'alonso', code: 'ALO', name: 'Fernando Alonso', pos: 9 }, { id: 'lindblad', code: 'LIN', name: 'Arvid Lindblad', pos: 20 }, { id: '', code: 'XXX' }] } }));
  const asked = [];
  let down = false;
  const fetchFn = async (url) => {
    asked.push(url);
    if (down) return { ok: false, status: 503 };
    if (url.includes('/drivers/alonso/results')) return page({ total: '3', RaceTable: { Races: [res(2005, 1, 1, 3, 'renault'), res(2006, 1, 1, 1, 'renault'), res(2026, 1, 5, 7, 'aston_martin')] } });
    if (url.includes('/drivers/alonso/qualifying/1')) return page({ total: '1', RaceTable: { Races: [pole(2006, 1)] } });
    if (url.includes('/drivers/')) return page({ total: '0', RaceTable: { Races: [] } });
    const y = url.match(/f1\/(\d{4})\/driverstandings\/1/)[1];
    return page({ total: '1', StandingsTable: { StandingsLists: [{ DriverStandings: [{ Driver: { driverId: 'alonso' } }] }] }, y });
  };
  assert.deepEqual(await careerTick(env, { now, fetchFn, wait }), { driver: 'alonso' });
  assert.equal(asked.length, 2);   // résultats et poles
  assert.deepEqual(await careerTick(env, { now, fetchFn, wait }), { driver: 'lindblad' });
  assert.deepEqual(await careerTick(env, { now, fetchFn, wait }), { champion: 2006 });
  assert.deepEqual(await careerTick(env, { now, fetchFn, wait }), { champion: 2005 });
  const n = asked.length;
  assert.equal(await careerTick(env, { now, fetchFn, wait }), null);
  assert.equal(asked.length, n, 'tout est gardé : plus aucune demande');
  // Réponse : saisons passées gardées + saison en cours d'après la saison gardée
  const c = await careerWeb(env, 'alonso', { now });
  assert.deepEqual(c.seasons.map((s) => [s.y, s.starts, s.wins, s.poles, s.title]), [[2005, 1, 1, 0, true], [2006, 1, 1, 1, true], [2026, 1, 0, 0, false]]);
  assert.deepEqual(c.totals.titles, [2005, 2006]);
  assert.equal(c.pendingTitles, false);
  assert.deepEqual(await careerWeb(env, 'norris', { now }), { driver: 'norris', pending: true });
  // Nouvelle année : saisons passées relues ; Jolpica en panne : erreur notée, ancienne carrière gardée, essai 1 h plus tard
  down = true;
  const jan = Date.parse('2027-01-02T00:00:00Z');
  env.DB.studio.set('season:2027', env.DB.studio.get('season:2026'));
  assert.match((await careerTick(env, { now: jan, fetchFn, wait })).error, /Jolpica|503/);
  assert.equal(JSON.parse(env.DB.studio.get(careerKey('alonso'))).v.upTo, 2025);
  assert.equal((await careerWeb(env, 'alonso', { now: jan })).pending, true);
  const m = asked.length;
  assert.equal((await careerTick(env, { now: jan + 10 * 60e3, fetchFn, wait })).error !== undefined, true);   // Lindblad, pas Alonso
  assert.equal(asked.filter((u, i) => i >= m && u.includes('alonso')).length, 0);
  down = false;
  assert.deepEqual(await careerTick(env, { now: jan + 61 * 60e3, fetchFn, wait }), { driver: 'alonso' });
  // Adresse : identifiant vérifié
  const bad = new URL('https://x/live/api/career?driver=../x');
  assert.equal((await liveApi(new Request(bad), bad, env)).status, 400);
  const u = new URL('https://x/live/api/career?driver=alonso');
  assert.equal((await (await liveApi(new Request(u), u, env)).json()).driver, 'alonso');
});
