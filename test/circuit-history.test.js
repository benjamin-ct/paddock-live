import test from 'node:test';
import assert from 'node:assert/strict';
import { winnersOf, historySummary, raceFigures } from '../shared/circuit-history.js';
import { historyTick, circuitHistory, historyKey } from '../analytics/circuit-history.js';
import { jolpicaQuota } from '../analytics/quota.js';
import { liveApi } from '../analytics/live-relay.js';

const win = (season, round, id, grid, team = 'Red Bull') => ({ season: String(season), round: String(round), raceName: 'Mexico City Grand Prix',
  Results: [{ position: '1', grid: String(grid), Driver: { driverId: id, code: id.slice(0, 3).toUpperCase(), givenName: 'X', familyName: id }, Constructor: { name: team, constructorId: team.toLowerCase().replace(' ', '_') } }] });

test('histoire du circuit : vainqueurs, recordman, victoires depuis la pole, retour au calendrier, chiffres depuis 2018', () => {
  const races = [win(1963, 10, 'clark', 1, 'Lotus'), win(1966, 9, 'surtees', 1, 'Cooper'), win(1990, 6, 'prost', 13, 'Ferrari'),
    win(2015, 17, 'rosberg', 1, 'Mercedes'), win(2018, 18, 'verstappen', 2), win(2019, 18, 'hamilton', 3, 'Mercedes'), win(2021, 18, 'verstappen', 3), win(2022, 20, 'verstappen', 1)];
  const w = winnersOf(races);
  assert.deepEqual(w.map((x) => x.y), [1963, 1966, 1990, 2015, 2018, 2019, 2021, 2022]);
  assert.equal(w[0].grid, 1);
  const figures = new Map([['2018:18', { neutral: 0, stops: 30, gains: 40 }], ['2021:18', { neutral: 5, stops: 24, gains: 31 }]]);
  const h = historySummary(w, figures);
  assert.equal(h.races, 8);
  assert.equal(h.first, 1963);
  assert.equal(h.since, 2015);   // 1991-2014 sans course (et 1967-1989) : série actuelle depuis 2015
  assert.deepEqual(h.recordmen.map((x) => [x.id, x.wins, x.years]), [['verstappen', 3, [2018, 2021, 2022]]]);
  assert.deepEqual(h.fromPole, { n: 4, of: 8 });
  assert.equal(h.winners[0].y, 2022);   // la plus récente d'abord
  assert.equal(h.winners.length, 8);
  assert.deepEqual([h.recent.from, h.recent.analysed, h.recent.neutralised, h.recent.stops, h.recent.gains], [2018, 2, 1, 27, 35.5]);
  assert.deepEqual(h.recent.races.map((x) => [x.y, x.neutral ?? null]), [[2022, null], [2021, 5], [2019, null], [2018, 0]]);
  // Voiture partagée (années 1950) : les deux vainqueurs, une seule course
  const shared = winnersOf([{ season: '1951', round: '4', raceName: 'French Grand Prix', Results: [
    { position: '1', grid: '7', Driver: { driverId: 'fagioli', familyName: 'Fagioli' }, Constructor: { name: 'Alfa Romeo' } },
    { position: '1', grid: '7', Driver: { driverId: 'fangio', familyName: 'Fangio' }, Constructor: { name: 'Alfa Romeo' } }] }]);
  const s = historySummary(shared);
  assert.equal(s.races, 1);
  assert.equal(s.recordmen.length, 2);
  assert.equal(s.recent, null);
  assert.deepEqual(historySummary([]).races, 0);
  // Analyse d'une course : arrêts de tous les pilotes (relais réels), tours neutralisés et places gagnées
  assert.deepEqual(raceFigures({ profile: { neutralLaps: 4, gains: 12 }, drivers: [{ stopCount: 2, stops: [] }, { stopCount: 1, stops: [] }] }), { neutral: 4, stops: 3, gains: 12 });
});

// Lignes du Studio (saison, historiques, analyses) et compteurs ai_usage (plafond horaire de Jolpica)
function fakeDB() {
  const studio = new Map(), usage = new Map();
  return {
    studio, usage,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (/^SELECT v FROM studio/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null;
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio/.test(sql)) { studio.set(args[0], args[1]); return {}; }
          if (/^INSERT INTO ai_usage/.test(sql)) {
            const [k, n, limit] = args, cur = usage.get(k) || 0;
            if (cur + n > limit) return { meta: { changes: 0 } };
            usage.set(k, cur + n);
            return { meta: { changes: 1 } };
          }
          throw new Error(`SQL inattendu : ${sql}`);
        },
      };
      return st;
    },
  };
}

const season = (races) => JSON.stringify({ at: 0, v: { races } });
const wait = async () => {};

test('histoire du circuit : la tâche planifiée lit un circuit par passage, relit après la course, réessaie une heure plus tard', async () => {
  const env = { DB: fakeDB() };
  const now = Date.parse('2026-10-20T12:00:00Z');
  env.DB.studio.set('season:2026', season([{ round: 19, circuitId: 'rodriguez', results: [] }, { round: 20, circuitId: 'interlagos', results: [] }, { round: 21, circuitId: 'bad id!', results: [] }]));
  const asked = [];
  let down = false;
  const fetchFn = async (url) => {
    asked.push(url);
    if (down) return { ok: false, status: 500 };
    const id = url.match(/circuits\/(\w+)\//)[1];
    const races = [win(2025, id === 'rodriguez' ? 20 : 21, 'norris', 1, 'McLaren')];
    return { ok: true, json: async () => ({ MRData: { total: String(races.length), RaceTable: { Races: races } } }) };
  };
  assert.deepEqual(await historyTick(env, { now, fetchFn, wait }), { circuit: 'rodriguez' });
  assert.deepEqual(await historyTick(env, { now, fetchFn, wait }), { circuit: 'interlagos' });
  assert.equal(await historyTick(env, { now, fetchFn, wait }), null);
  assert.equal(asked.length, 2);
  assert.match(asked[0], /\/circuits\/rodriguez\/results\/1\.json\?limit=100&offset=0$/);
  assert.equal([...env.DB.usage.values()].reduce((a, b) => a + b, 0), 2);   // comptées dans le plafond horaire
  // Course de Mexico terminée : historique relu (une demande) ; Jolpica en panne : erreur notée, essai une heure plus tard
  env.DB.studio.set('season:2026', season([{ round: 19, circuitId: 'rodriguez', results: [{ code: 'VER' }] }, { round: 20, circuitId: 'interlagos', results: [] }]));
  down = true;
  const later = now + 2 * 86400e3;
  assert.equal((await historyTick(env, { now: later, fetchFn, wait })).circuit, 'rodriguez');
  const failed = JSON.parse(env.DB.studio.get(historyKey('rodriguez')));
  assert.equal(failed.v.length, 1);   // l'ancien historique reste
  assert.match(failed.error, /Jolpica|500/);
  const n = asked.length;
  assert.equal(await historyTick(env, { now: later + 30 * 60e3, fetchFn, wait }), null);
  assert.equal(asked.length, n);
  down = false;
  assert.equal((await historyTick(env, { now: later + 61 * 60e3, fetchFn, wait })).circuit, 'rodriguez');
});

test('Jolpica : plafond de 500 demandes par heure pour tout le Worker', async () => {
  const env = { DB: fakeDB() };
  const now = Date.parse('2026-10-20T12:59:00Z');
  for (let i = 0; i < 500; i++) assert.equal(await jolpicaQuota(env, now), true);
  assert.equal(await jolpicaQuota(env, now), false);
  assert.equal(await jolpicaQuota(env, now + 60e3), true);   // heure suivante
  // Plafond atteint : rien n'est demandé, l'erreur est notée et la lecture réessayée plus tard
  env.DB.studio.set('season:2026', season([{ round: 19, circuitId: 'rodriguez', results: [] }]));
  env.DB.usage.set(`jolpica:${new Date().toISOString().slice(0, 13)}`, 500);
  let asked = 0;
  const r = await historyTick(env, { now, fetchFn: async () => { asked++; return { ok: true, json: async () => ({}) }; }, wait });
  assert.match(r.error, /Plafond horaire/);
  assert.equal(asked, 0);
});

test('histoire du circuit : réponse gardée, chiffres des courses analysées, saison passée demandée à l\'analyse', async () => {
  const env = { DB: fakeDB() };
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.deepEqual(await circuitHistory(env, 'rodriguez', { now }), { circuitId: 'rodriguez', pending: true });
  env.DB.studio.set(historyKey('rodriguez'), JSON.stringify({ at: now, v: winnersOf([win(2023, 20, 'verstappen', 3), win(2024, 20, 'sainz', 1, 'Ferrari'), win(2025, 20, 'norris', 1, 'McLaren')]) }));
  env.DB.studio.set('racestats:2025:20', JSON.stringify({ v: 3, profile: { neutralLaps: 3, gains: 20 }, drivers: [{ stopCount: 1 }, { stopCount: 2 }] }));
  env.DB.studio.set('racestats:2023:20', JSON.stringify({ failed: now, error: 'archive absente' }));
  const h = await circuitHistory(env, 'rodriguez', { now });
  assert.equal(h.races, 3);
  assert.deepEqual([h.recent.analysed, h.recent.neutralised, h.recent.stops], [1, 1, 3]);
  assert.equal(h.pendingStats, true);
  assert.equal(env.DB.studio.get('racewant:2024'), String(now));   // 2023 a échoué : pas redemandée
  assert.equal(env.DB.studio.has('racewant:2023'), false);
  // Adresse : paramètres vérifiés, réponse gardée par le serveur une fois prête
  const kept = new Map();
  globalThis.caches = { default: { match: async (r) => kept.get(r.url)?.clone() || null, put: async (r, res) => { kept.set(r.url, res); } } };
  try {
    assert.equal((await liveApi(new Request('https://x/live/api/circuit-history?circuit=../x'), new URL('https://x/live/api/circuit-history?circuit=../x'), env)).status, 400);
    const u = new URL('https://x/live/api/circuit-history?circuit=rodriguez');
    const res = await liveApi(new Request(u), u, env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).recordmen.length, 3);
    assert.equal(kept.size, 1);
    const u2 = new URL('https://x/live/api/circuit-history?circuit=madring');
    assert.equal((await (await liveApi(new Request(u2), u2, env)).json()).pending, true);
    assert.equal(kept.size, 1);   // pas encore lu : pas gardé
  } finally { delete globalThis.caches; }
});
