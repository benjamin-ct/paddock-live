import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonPages, slugOf } from '../analytics/season-pages.js';
import { STATS_VERSION } from '../shared/race-stats.js';

const now = Date.parse('2026-10-26T12:00:00Z');
const res = (pos, name, team, extra = {}) => ({ pos, posText: String(pos), name, last: name.split(' ').pop(), team, teamId: team.toLowerCase().replace(/ /g, '_'), points: [25, 18, 15][pos - 1] || 0, grid: pos + 1, laps: 71, time: pos === 1 ? '1:40:12.345' : '+5.123', status: 'Finished', ...extra });
const SEASON = {
  races: [
    { round: 19, name: 'Mexico City Grand Prix', circuit: 'Autódromo Hermanos Rodríguez', locality: 'Mexico City', country: 'Mexico', date: '2026-10-25T20:00:00Z', sprint: false,
      sessions: [], results: [res(1, 'Lando Norris', 'McLaren'), res(2, 'Max Verstappen', 'Red Bull'), res(3, 'Oscar <Piastri>', 'McLaren', { posText: 'R', time: null, status: 'Engine', points: 0 })],
      quali: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', teamId: 'mclaren', q: [77.1, 76.5, 75.586] }], sprintResults: [] },
    { round: 20, name: 'São Paulo Grand Prix', circuit: 'Interlagos', locality: 'São Paulo', country: 'Brazil', date: '2026-11-08T17:00:00Z', sprint: true,
      sessions: [{ label: 'EL1', t: '2026-11-06T14:30:00Z' }, { label: 'Course', t: '2026-11-08T17:00:00Z' }], results: [], quali: [], sprintResults: [] },
  ],
  drivers: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', teamId: 'mclaren', points: 357, wins: 7 }, { pos: 2, name: 'Max Verstappen', team: 'Red Bull', teamId: 'red_bull', points: 300, wins: 5 }],
  constructors: [{ pos: 1, name: 'McLaren', id: 'mclaren', points: 700, wins: 12 }, { pos: 2, name: 'Red Bull', id: 'red_bull', points: 400, wins: 5 }],
};

function fakeEnv() {
  const rows = new Map([
    ['season:2026', JSON.stringify({ at: now, v: SEASON })],
    ['racestats:2026:19', JSON.stringify({ v: STATS_VERSION, drivers: [{ tla: 'NOR', name: 'Lando Norris', last: 'Norris', team: 'McLaren', stops: [{ lap: 30, stop: 2.4, lane: 22 }], stopCount: 1 }], profile: {} })],
    ['racedhl:2026:19', JSON.stringify({ rows: [{ team: 'McLaren', last: 'Norris', time: 2.17, lap: 30 }] })],
  ]);
  return { DB: { prepare: () => ({ bind: (k) => ({ first: async () => (rows.has(k) ? { v: rows.get(k) } : null) }) }) } };
}
const get = async (path) => seasonPages(fakeEnv(), new URL(`https://paddocklive.app${path}`), { now });

test('pages Saison : adresses des Grands Prix lisibles dans chaque langue', () => {
  assert.equal(slugOf('Mexico City Grand Prix', false), 'mexico');
  assert.equal(slugOf('Mexico City Grand Prix', true), 'mexico-city');
  assert.equal(slugOf('São Paulo Grand Prix', false), 'sao-paulo');
  assert.equal(slugOf('United States Grand Prix', false), 'etats-unis');
});

test('pages Saison : saison et Grand Prix écrits par le serveur, avec leurs adresses et données structurées', async () => {
  const season = await (await get('/saison/2026/')).text();
  assert.match(season, /<title>Saison 2026 de F1 : classements, calendrier et résultats · Paddock Live<\/title>/);
  assert.match(season, /<link rel="canonical" href="https:\/\/paddocklive\.app\/saison\/2026\/">/);
  assert.match(season, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/season\/2026\/"/);
  assert.match(season, /<a href="\/saison\/2026\/mexico\/">Mexico<\/a>/);
  assert.match(season, /<a href="\/saison\/2026\/pilotes\/lando-norris\/"><b>Lando Norris<\/b><\/a><\/td><td><a href="\/saison\/2026\/ecuries\/mclaren\/">McLaren<\/a><\/td><td>357/);

  const r = await get('/saison/2026/mexico/');
  assert.equal(r.headers.get('Content-Type'), 'text/html; charset=utf-8');
  const html = await r.text();
  assert.match(html, /<h1>Grand Prix de Mexico 2026 : résultats<\/h1>/);
  assert.match(html, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/season\/2026\/mexico-city\/"/);
  assert.match(html, /Oscar &lt;Piastri&gt;/);   // échappé
  assert.match(html, /<td>—<\/td><td><a href="\/saison\/2026\/pilotes\/oscar-piastri\/"><b>Oscar &lt;Piastri&gt;<\/b><\/a><\/td><td><a href="\/saison\/2026\/ecuries\/mclaren\/">McLaren<\/a><\/td><td>Abandon<\/td>/);
  assert.match(html, /1:15\.586/);
  assert.match(html, /<td>2,17 s<\/td>/);   // arrêt DHL au centième
  assert.match(html, /Copyright © DHL International GmbH/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1]);
  const ev = ld['@graph'].find((x) => x['@type'] === 'SportsEvent');
  assert.equal(ev.startDate, '2026-10-25T20:00:00Z');
  assert.equal(ev.location.name, 'Autódromo Hermanos Rodríguez');

  const en = await (await get('/en/season/2026/sao-paulo/')).text();
  assert.match(en, /<html lang="en">/);
  assert.match(en, /São Paulo Grand Prix 2026: schedule/);
  assert.match(en, /<td>FP1<\/td>/);
});

test('pages Saison : une page par pilote et par écurie, en lien avec les Grands Prix', async () => {
  const d = await (await get('/saison/2026/pilotes/lando-norris/')).text();
  assert.match(d, /<h1>Lando Norris : saison 2026 de F1, résultats et classement<\/h1>/);
  assert.match(d, /1er du championnat avec 357 points, 7 victoires/);
  assert.match(d, /<tr><th>Poles<\/th><td>1<\/td><\/tr>/);
  assert.match(d, /<td>19<\/td><td><a href="\/saison\/2026\/mexico\/">Mexico<\/a><\/td><td>P1<\/td><td>P2<\/td><td>P1<\/td><td>25<\/td>/);
  assert.match(d, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/season\/2026\/drivers\/lando-norris\/"/);
  assert.match(d, /"@type":"Person","name":"Lando Norris"/);
  // Pilote absent du classement (abandon, aucun point) : page quand même
  assert.match(await (await get('/saison/2026/pilotes/oscar-piastri/')).text(), /<tr><th>Abandons<\/th><td>1<\/td><\/tr>/);
  const en = await (await get('/en/season/2026/drivers/max-verstappen/')).text();
  assert.match(en, /2nd in the championship with 300 points, 5 wins/);

  const t = await (await get('/saison/2026/ecuries/mclaren/')).text();
  assert.match(t, /<h1>McLaren : saison 2026 de F1, résultats et classement<\/h1>/);
  assert.match(t, /<th>Lando Norris<\/th><th>Oscar &lt;Piastri&gt;<\/th>/);
  assert.match(t, /<td>P1<\/td><td>Abandon<\/td><td>25<\/td>/);
  assert.match(await (await get('/en/season/2026/teams/red-bull/')).text(), /"@type":"SportsTeam","name":"Red Bull"/);
  // Mauvaise langue ou inconnu : 404
  assert.equal(await get('/saison/2026/drivers/lando-norris/'), null);
  assert.equal(await get('/saison/2026/pilotes/inconnu/'), null);
  assert.equal(await get('/saison/2026/pilotes/'), null);
});

test('pages Saison : redirection vers l\'année en cours, adresses inconnues, plan du site', async () => {
  const r = await get('/saison/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://paddocklive.app/saison/2026/');
  assert.equal(await get('/saison/2026/inconnu/'), null);
  assert.equal(await get('/saison/2017/'), null);
  assert.equal(await get('/saison/2027/'), null);
  const map = await (await get('/saison/sitemap.xml')).text();
  for (const u of ['/saison/2026/', '/saison/2026/mexico/', '/en/season/2026/mexico-city/', '/en/season/2026/sao-paulo/', '/saison/2026/pilotes/oscar-piastri/',
    '/en/season/2026/teams/red-bull/', '/saison/2018/', '/en/season/2025/']) assert.ok(map.includes(`<loc>https://paddocklive.app${u}</loc>`), u);
});
