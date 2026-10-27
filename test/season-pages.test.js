import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonSsr, seasonSitemap, legacySeasonUrl } from '../analytics/season-pages.js';
import { seasonPath, parseSeasonPath, seasonTitle, gpSlug, slug } from '../shared/season-urls.js';
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
  constructors: [{ pos: 1, name: 'McLaren', id: 'mclaren', points: 700, wins: 12 }],
};
function fakeEnv() {
  const rows = new Map([
    ['season:2026', JSON.stringify({ at: now, v: SEASON })],
    ['racestats:2026:19', JSON.stringify({ v: STATS_VERSION, drivers: [{ tla: 'NOR', name: 'Lando Norris', last: 'Norris', team: 'McLaren', stops: [{ lap: 30, stop: 2.4, lane: 22 }], stopCount: 1 }], profile: {} })],
    ['racedhl:2026:19', JSON.stringify({ rows: [{ team: 'McLaren', last: 'Norris', time: 2.17, lap: 30 }] })],
  ]);
  return { DB: { prepare: () => ({ bind: (k) => ({ first: async () => (rows.has(k) ? { v: rows.get(k) } : null) }) }) } };
}
const ssr = (path) => seasonSsr(fakeEnv(), parseSeasonPath(path), { now });

test('Saison : adresses des rubriques, dans un sens et dans l\'autre', () => {
  assert.equal(seasonPath(2026), '/saison/2026/');
  assert.equal(seasonPath(2026, 'pits'), '/saison/2026/arrets-aux-stands/');
  assert.equal(seasonPath(2026, 'drivers', 'lando-norris'), '/saison/2026/pilotes/lando-norris/');
  assert.equal(seasonPath(2026, 'gp', gpSlug('United States Grand Prix')), '/saison/2026/grand-prix/etats-unis/');
  assert.deepEqual(parseSeasonPath('/saison/2026/pilotes/lando-norris/'), { year: 2026, section: 'drivers', item: 'lando-norris' });
  assert.deepEqual(parseSeasonPath('/saison/2026/'), { year: 2026, section: 'home', item: null });
  assert.deepEqual(parseSeasonPath('/saison/'), { year: null, section: 'home', item: null });
  for (const bad of ['/saison/2026/inconnu/', '/saison/2026/classements/x/', '/saison/2026/grand-prix/', '/saison/2026', '/live/']) assert.equal(parseSeasonPath(bad), null, bad);
  assert.equal(slug('Sergio Pérez'), 'sergio-perez');
  assert.equal(seasonTitle(2026, 'gp', 'Mexico City Grand Prix', false), 'Grand Prix de Mexico 2026 : programme');
});

test('Saison : premier contenu de chaque rubrique écrit par le serveur (moteurs de recherche)', async () => {
  const home = await ssr('/saison/2026/');
  assert.equal(home.url, 'https://app.paddocklive.app/saison/2026/');
  assert.equal(home.title, 'Saison 2026 de F1 : classements, calendrier et résultats');
  assert.match(home.html, /<a href="\/saison\/2026\/pilotes\/lando-norris\/"><b>Lando Norris<\/b><\/a>/);
  assert.match(home.html, /<a href="\/saison\/2026\/grand-prix\/mexico\/">Mexico<\/a>/);
  assert.match(home.html, /<a href="\/saison\/2026\/arrets-aux-stands\/">Arrêts aux stands F1 2026/);   // toutes les rubriques en liens

  const gp = await ssr('/saison/2026/grand-prix/mexico/');
  assert.equal(gp.title, 'Grand Prix de Mexico 2026 : résultats');
  assert.match(gp.desc, /vainqueur Lando Norris, pole Lando Norris/);
  assert.match(gp.html, /<td>—<\/td><td><a href="\/saison\/2026\/pilotes\/oscar-piastri\/"><b>Oscar &lt;Piastri&gt;<\/b><\/a><\/td><td>McLaren<\/td><td>Abandon<\/td>/);
  assert.match(gp.html, /1:15\.586/);
  assert.match(gp.html, /<td>2,17 s<\/td>/);   // arrêt DHL au centième
  assert.match(gp.html, /Copyright © DHL International GmbH/);
  const ev = gp.ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual([ev.startDate, ev.location.name, ev.url], ['2026-10-25T20:00:00Z', 'Autódromo Hermanos Rodríguez', 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/']);
  // Champs conseillés par Google (Search Console : « Améliorer l'apparence des éléments »)
  assert.equal(ev.endDate, '2026-10-25T22:00:00.000Z');
  assert.equal(ev.description, gp.desc);
  assert.match(ev.image, /^https:\/\/paddocklive\.app\/.+\.png$/);
  assert.equal(ev.organizer.name, 'Formula 1');
  assert.deepEqual(ev.performer.map((x) => x.name), ['Lando Norris', 'Max Verstappen', 'Oscar <Piastri>']);
  const next = (await ssr('/saison/2026/grand-prix/sao-paulo/')).ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual([next.startDate, next.performer.length], ['2026-11-06T14:30:00Z', 2]);   // 1re séance ; pilotes de la saison avant la course
  assert.match((await ssr('/saison/2026/grand-prix/sao-paulo/')).html, /Programme du week-end/);

  const d = await ssr('/saison/2026/pilotes/lando-norris/');
  assert.equal(d.title, 'Lando Norris : saison 2026 de F1, résultats et classement');
  assert.match(d.html, /1er du championnat avec 357 points, 7 victoires · McLaren/);
  assert.match(d.html, /<td>19<\/td><td><a href="\/saison\/2026\/grand-prix\/mexico\/">Mexico<\/a><\/td><td>P1<\/td><td>P2<\/td><td>P1<\/td><td>25<\/td>/);
  assert.equal(d.ld.find((x) => x['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, 'https://app.paddocklive.app/saison/2026/pilotes/lando-norris/');

  assert.equal((await ssr('/saison/2026/classements/')).title, 'Classements F1 2026 : pilotes et constructeurs');
  assert.match((await ssr('/saison/2026/arrets-aux-stands/')).desc, /immobilisations les plus rapides/);
  // Inconnu : 404 (pilote, Grand Prix, année hors des 8 saisons de l'appli)
  assert.equal(await ssr('/saison/2026/pilotes/inconnu/'), null);
  assert.equal(await ssr('/saison/2026/grand-prix/inconnu/'), null);
  assert.equal(await ssr('/saison/2018/'), null);
});

test('Saison : plan du site et anciennes pages publiques redirigées vers la version web', async () => {
  const map = await seasonSitemap(fakeEnv(), now);
  for (const u of ['/saison/2026/', '/saison/2026/classements/', '/saison/2026/pilotes/lando-norris/', '/saison/2026/grand-prix/sao-paulo/', '/saison/2019/bilan/']) assert.ok(map.includes(`<loc>https://app.paddocklive.app${u}</loc>`), u);
  assert.ok(!map.includes('/saison/2018/') && !map.includes('/pronostics/'));
  const old = (p) => legacySeasonUrl(fakeEnv(), new URL(`https://paddocklive.app${p}`));
  assert.equal(await old('/saison/'), 'https://app.paddocklive.app/saison/');
  assert.equal(await old('/saison/2026/mexico/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/en/season/2026/mexico-city/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/en/season/2026/drivers/lando-norris/'), 'https://app.paddocklive.app/saison/2026/pilotes/lando-norris/');
  assert.equal(await old('/saison/2026/ecuries/mclaren/'), 'https://app.paddocklive.app/saison/2026/classements/');
  assert.equal(await old('/en/season/2026/inconnu/'), 'https://app.paddocklive.app/saison/2026/resultats/');
  assert.equal(await old('/saison/2026/grand-prix/mexico/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/autre/'), null);
});
