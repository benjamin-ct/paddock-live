import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonPages, slugOf } from '../analytics/season-pages.js';
import { STATS_VERSION } from '../shared/race-stats.js';

const now = Date.parse('2026-10-26T12:00:00Z');
const res = (pos, name, team, extra = {}) => ({ pos, posText: String(pos), name, last: name.split(' ').pop(), team, points: [25, 18, 15][pos - 1] || 0, grid: pos + 1, laps: 71, time: pos === 1 ? '1:40:12.345' : '+5.123', status: 'Finished', ...extra });
const SEASON = {
  races: [
    { round: 19, name: 'Mexico City Grand Prix', circuit: 'Autódromo Hermanos Rodríguez', locality: 'Mexico City', country: 'Mexico', date: '2026-10-25T20:00:00Z', sprint: false,
      sessions: [], results: [res(1, 'Lando Norris', 'McLaren'), res(2, 'Max Verstappen', 'Red Bull'), res(3, 'Oscar <Piastri>', 'McLaren', { posText: 'R', time: null, status: 'Engine' })],
      quali: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', q: [77.1, 76.5, 75.586] }], sprintResults: [] },
    { round: 20, name: 'São Paulo Grand Prix', circuit: 'Interlagos', locality: 'São Paulo', country: 'Brazil', date: '2026-11-08T17:00:00Z', sprint: true,
      sessions: [{ label: 'EL1', t: '2026-11-06T14:30:00Z' }, { label: 'Course', t: '2026-11-08T17:00:00Z' }], results: [], quali: [], sprintResults: [] },
  ],
  drivers: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', points: 357, wins: 7 }],
  constructors: [{ pos: 1, name: 'McLaren', points: 700, wins: 12 }],
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
  assert.match(season, /Lando Norris<\/b><\/td><td>McLaren<\/td><td>357/);

  const r = await get('/saison/2026/mexico/');
  assert.equal(r.headers.get('Content-Type'), 'text/html; charset=utf-8');
  const html = await r.text();
  assert.match(html, /<h1>Grand Prix de Mexico 2026 : résultats<\/h1>/);
  assert.match(html, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/season\/2026\/mexico-city\/"/);
  assert.match(html, /Oscar &lt;Piastri&gt;/);   // échappé
  assert.match(html, /<td>—<\/td><td><b>Oscar &lt;Piastri&gt;<\/b><\/td><td>McLaren<\/td><td>Abandon<\/td>/);
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

test('pages Saison : redirection vers l\'année en cours, adresses inconnues, plan du site', async () => {
  const r = await get('/saison/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://paddocklive.app/saison/2026/');
  assert.equal(await get('/saison/2026/inconnu/'), null);
  assert.equal(await get('/saison/2017/'), null);
  assert.equal(await get('/saison/2027/'), null);
  const map = await (await get('/saison/sitemap.xml')).text();
  for (const u of ['/saison/2026/', '/saison/2026/mexico/', '/en/season/2026/mexico-city/', '/en/season/2026/sao-paulo/']) assert.ok(map.includes(`<loc>https://paddocklive.app${u}</loc>`), u);
});
