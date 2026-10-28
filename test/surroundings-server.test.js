import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSurroundings, surroundingsWeb, surroundingsStatus, surroundingsTick, catalogue, CREDITS } from '../analytics/surroundings.js';
import { geoFrame, toEN, lonToPx } from '../shared/surroundings.js';
import { terrariumTile } from './fixtures/png.js';
import { mvt, toTile } from './fixtures/mvt.js';

// Circuit « haricot » (tracé MultiViewer en 1/10 m), posé près de (45° N, 5° E) tourné de 20° et décalé
const AT = { lat: 45, lon: 5 };
const bean = Array.from({ length: 300 }, (_, i) => {
  const a = (2 * Math.PI * i) / 300, r = 700 + 200 * Math.cos(2 * a) + 100 * Math.sin(3 * a);
  return [r * Math.cos(a), r * Math.sin(a) * 0.7];
});
const raw = { x: bean.map((p) => Math.round(p[0] * 10)), y: bean.map((p) => Math.round(p[1] * 10)), rotation: 0 };
const frame = geoFrame(AT.lat, AT.lon), TRUE = { s: 1, a: (20 * Math.PI) / 180, e: 400, n: -250 };
const geo = (x, y) => frame.toGeo(...toEN(TRUE, x, y));
const square = (x, y, w) => [geo(x, y), geo(x + w, y), geo(x + w, y + w), geo(x, y + w)];
// Tuiles OpenFreeMap simulées : la piste, un bâtiment et un bois, dans le repère de chaque tuile demandée
const FEATURES = [
  ['transportation', 2, { class: 'raceway' }, [...bean, bean[0]].map(([x, y]) => geo(x, y))],
  ['building', 3, { render_height: 11, render_min_height: 0 }, square(0, 0, 40)],
  ['landcover', 3, { class: 'wood', subclass: 'wood' }, square(1200, -400, 500)],
];
function vtile(t) {
  const layers = {};
  for (const [name, type, props, pts] of FEATURES) {
    let ring = pts.map((p) => toTile(p, t));
    // Anneau extérieur : sens des aiguilles d'une montre dans la tuile (y vers le bas)
    if (type === 3 && ring.reduce((s, p, i) => s + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) < 0) ring = ring.reverse();
    (layers[name] ||= []).push({ type, props, geom: [ring] });
  }
  return mvt(Object.entries(layers).map(([name, features]) => ({ name, features })));
}
const TILE = terrariumTile((x) => 200 + x * 0.1);

function setup({ mv = true, ofm = 200 } = {}) {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (url.includes('multiviewer')) return mv ? new Response(JSON.stringify(raw)) : new Response('', { status: 404 });
    if (url === 'https://tiles.openfreemap.org/planet') return new Response(JSON.stringify({ tiles: ['https://ofm.test/planet/v1/{z}/{x}/{y}.pbf'] }));
    const t = /ofm\.test\/planet\/v1\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (t) return ofm === 200 ? new Response(vtile({ z: +t[1], x: +t[2], y: +t[3] })) : new Response('', { status: ofm });
    if (url.includes('elevation-tiles-prod')) return new Response(TILE);
    return new Response('', { status: 404 });
  };
  const media = new Map();
  const MEDIA = {
    get: async (k) => (media.has(k) ? new Response(media.get(k)) : null),
    put: async (k, v) => { media.set(k, v); },
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  return { fetchFn, asked, media, MEDIA };
}

test('serveur : alentours d\'un circuit (calage, OSM, relief), lieu gardé pour les autres saisons', async () => {
  const { fetchFn, asked, media, MEDIA } = setup();
  try {
    const res = await computeSurroundings({ MEDIA }, 999, 2026, { fetchFn, at: AT, pause: 0 });
    assert.ok(res.data, res.error);
    assert.ok(Math.abs(res.fit.deg - 20) < 0.5 && res.fit.err < 2, JSON.stringify(res.fit));
    assert.deepEqual(res.data.credits, CREDITS);
    assert.equal(res.data.track.z.length, bean.length);
    assert.ok(res.data.terrain.h.every((v) => v >= 2000 && v <= 2260), 'altitudes des tuiles (200 à 225,5 m)');
    assert.deepEqual(res.data.buildings.map((b) => b[0]), [11]);
    assert.ok(res.data.areas.wood.length >= 1 && res.data.trees.length > 0);
    assert.equal(asked.filter((u) => u.endsWith('/planet')).length, 1, 'adresse des tuiles lue une fois');
    assert.ok(asked.filter((u) => u.endsWith('.pbf')).every((u) => u.includes('/14/')), 'tuiles vectorielles au zoom 14');
    assert.equal(JSON.parse(media.get('surroundings/place-999.json')).src, 'ofm');
    const tiles = [...media.keys()].filter((k) => k.startsWith('surroundings/tiles/'));
    assert.ok(tiles.length > 0 && tiles.length <= 30);

    // Saison suivante : OSM et tuiles déjà gardés, seul le tracé est relu
    asked.length = 0;
    const again = await computeSurroundings({ MEDIA }, 999, 2025, { fetchFn, at: AT, pause: 0 });
    assert.ok(again.data);
    assert.deepEqual(asked.filter((u) => !u.includes('multiviewer')), []);

    // Pistes d'OSM sans rapport avec le tracé : calage écarté, rien d'affiché
    media.set('surroundings/place-998.json', JSON.stringify({ src: 'ofm', ...AT, race: [[45, 5, 45.001, 5, 45.001, 5.001]], streets: [] }));
    const bad = await computeSurroundings({ MEDIA }, 998, 2026, { fetchFn, at: AT, pause: 0 });
    assert.equal(bad.data, undefined);
    assert.match(bad.error, /calage raté/);

    // Ancien lieu d'après Overpass (sans src) : refait avec les tuiles
    media.set('surroundings/place-997.json', JSON.stringify({ ...AT, race: [[45, 5, 45.001, 5]], streets: [] }));
    assert.ok((await computeSurroundings({ MEDIA }, 997, 2026, { fetchFn, at: AT, pause: 0 })).data);
  } finally {
    delete globalThis.caches;
  }
});

test('serveur : OpenFreeMap occupé, deux essais puis erreur passagère qui nomme la tuile', async () => {
  const { fetchFn, asked, MEDIA } = setup({ ofm: 504 });
  try {
    await assert.rejects(computeSurroundings({ MEDIA }, 999, 2026, { fetchFn, at: AT, pause: 0 }), (err) => {
      assert.match(err.message, /^OpenFreeMap 14\/\d+\/\d+ : HTTP 504 \(2 essais\)$/);
      return err.passing === true;
    });
    assert.equal(asked.filter((u) => u.endsWith('.pbf')).length, 2);
  } finally {
    delete globalThis.caches;
  }
});

// Base simulée (table studio : k, v)
function db(rows) {
  return { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    run: async () => { rows.set(a[0], a[1]); return {}; },
    all: async () => ({ results: [...rows].filter(([k]) => k >= a[0] && k < a[1]).map(([k, v]) => ({ k, v })) }),
  }) }) };
}

test('serveur : file des alentours (demandé, prochain Grand Prix, catalogue des replays), faits sautés, échecs revus 6 h après', async () => {
  const { fetchFn, MEDIA, media } = setup({ mv: false });   // tracé introuvable : chaque calcul échoue tout de suite
  const now = Date.parse('2026-10-27T12:00:00Z');
  const rows = new Map([
    ['season:2026', JSON.stringify({ at: now, v: { races: [{ circuitId: 'spa', date: '2026-10-30' }] } })],
    ['surrcat', JSON.stringify({ at: now, list: [[22, 2026, 43.73, 7.42], [9, 2025, 30.13, -97.64], [9, 2024, 30.13, -97.64]] })],
    ['surr:9:2025', JSON.stringify({ at: now - 86400e3, ok: true })],
  ]);
  const env = { DB: db(rows), MEDIA };
  try {
    // Demandé par la vue 3D : noté pour la tâche planifiée ; rien à servir encore
    assert.equal(await surroundingsWeb(env, 999, 2026, now), null);
    assert.equal(rows.get('surrwant:999:2026'), String(now));
    const order = [];
    for (let i = 1; i <= 5; i++) {
      const r = await surroundingsTick(env, { now: now + i * 60e3, fetchFn, pause: 0 });
      order.push(r && `${r.key}:${r.year}`);
      if (r) assert.equal(r.ok, false);
    }
    assert.deepEqual(order, ['999:2026', '7:2026', '22:2026', '9:2024', null], 'demandé > prochain GP > catalogue, 9:2025 déjà fait');
    assert.equal(rows.get('surrwant:999:2026'), '0');
    assert.equal(JSON.parse(rows.get('surr:22:2026')).error, 'tracé introuvable');
    // Réponse « pas encore calculé » : dernier essai, sa raison et le prochain essai
    assert.deepEqual(await surroundingsStatus(env, 22, 2026), { tried: new Date(now + 3 * 60e3).toISOString(), error: 'tracé introuvable',
      next: new Date(now + 3 * 60e3 + 6 * 3600e3).toISOString() });
    assert.equal(await surroundingsStatus(env, 9, 2025), null, 'calculé : rien à dire');
    assert.equal(await surroundingsStatus(env, 123, 2026), null, 'jamais essayé');
    assert.equal(rows.get('surrlock'), '0');
    // 7 heures plus tard : les échecs sont revus, le prochain Grand Prix d'abord
    assert.equal((await surroundingsTick(env, { now: now + 7 * 3600e3, fetchFn, pause: 0 }))?.key, 7);
    // Résultat gardé : servi depuis R2
    media.set('surroundings/9-2025.json', '{"terrain":{}}');
    assert.equal(await (await surroundingsWeb(env, 9, 2025, now)).text(), '{"terrain":{}}');
  } finally {
    delete globalThis.caches;
  }
});

test('serveur : source occupée revue 20 min plus tard, puis 40 min ; position d\'après les circuits du calendrier (Djeddah)', async () => {
  const { fetchFn, MEDIA, asked } = setup({ ofm: 503 });
  const now = Date.parse('2026-10-28T19:30:00Z');
  // Catalogue vide : Djeddah (149) n'y est pas ; calendrier sans Grand Prix à venir
  const rows = new Map([['surrcat', JSON.stringify({ at: now, list: [] })], ['season:2026', JSON.stringify({ at: now, v: { races: [] } })]]);
  const env = { DB: db(rows), MEDIA };
  try {
    let t = now;
    for (const [tries, wait] of [[1, 20], [2, 40], [3, 80]]) {
      await surroundingsWeb(env, 149, 2026, t);
      assert.equal((await surroundingsTick(env, { now: t, fetchFn, pause: 0 }))?.key, 149);
      const row = JSON.parse(rows.get('surr:149:2026'));
      assert.match(row.error, /^OpenFreeMap 14\/\d+\/\d+ : HTTP 503 \(2 essais\)$/);
      assert.deepEqual([row.tries, row.next], [tries, t + wait * 60e3]);
      t = row.next + 60e3;
    }
    // Tuiles lues autour de Djeddah (39,10° E)
    const x = Math.floor(lonToPx(39.1044, 14) / 256);
    assert.ok(asked.filter((u) => u.endsWith('.pbf')).every((u) => Math.abs(Number(u.split('/').at(-2)) - x) <= 3));
  } finally {
    delete globalThis.caches;
  }
});

test('serveur : catalogue des replays (Jolpica × archives de la F1), un couple par circuit et par saison, une année illisible n\'empêche rien', async () => {
  const now = Date.parse('2019-06-01T12:00:00Z');
  const rows = new Map();
  // Circuit Paul Ricard (clé 98 pour le test) : absent des circuits du calendrier, clé d'après l'index seulement
  const index = (y) => ({ Meetings: [
    { Key: 1, Name: 'Pre-Season Testing', Circuit: { Key: 63 }, Sessions: [{ Key: 1, Name: 'Day 1', Type: 'Practice', StartDate: `${y}-02-20T10:00:00`, Path: 'a/' }] },
    { Key: 2, Name: 'Bahrain Grand Prix', Circuit: { Key: 63 }, Sessions: [{ Key: 2, Name: 'Race', Type: 'Race', StartDate: `${y}-03-31T18:10:00`, Path: 'b/' }] },
    { Key: 3, Name: 'French Grand Prix', Circuit: { Key: 98 }, Sessions: [{ Key: 4, Name: 'Race', Type: 'Race', StartDate: `${y}-06-23T15:10:00`, Path: 'd/' }] },
    { Key: 4, Name: 'Belgian Grand Prix', Circuit: { Key: 7 }, Sessions: [{ Key: 3, Name: 'Race', Type: 'Race', StartDate: `${y}-08-31T15:10:00`, Path: 'c/' }] },
  ] });
  const races = (y) => ({ MRData: { RaceTable: { Races: [
    { date: `${y}-03-31`, Circuit: { circuitId: 'bahrain', Location: { lat: '26.0325', long: '50.5106' } } },
    { date: `${y}-06-23`, Circuit: { circuitId: 'ricard', Location: { lat: '43.2506', long: '5.79167' } } },
    { date: `${y}-09-01`, Circuit: { circuitId: 'spa', Location: { lat: '50.4372', long: '5.97139' } } },
  ] } } });
  let denied = '', jolpica = 200;
  const fetchFn = async (url) => {
    const y = /\/(\d{4})\//.exec(url)?.[1];
    if (url.endsWith('Index.json')) return y === denied ? new Response('', { status: 403 }) : new Response(`\ufeff${JSON.stringify(index(y))}`);
    if (url.includes('jolpi')) return jolpica === 200 ? new Response(JSON.stringify(races(y))) : new Response('', { status: jolpica });
    return new Response('', { status: 404 });
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  const env = { DB: db(rows) }, saved = () => JSON.parse(rows.get('surrcat'));
  const full = [[63, 2019, 26.0325, 50.5106], [98, 2019, 43.2506, 5.79167], [7, 2019, 50.4372, 5.97139], [63, 2018, 26.0325, 50.5106], [98, 2018, 43.2506, 5.79167], [7, 2018, 50.4372, 5.97139]];
  try {
    assert.deepEqual(await catalogue(env, { now, fetchFn, pause: 0, token: 'jeton' }), full);
    assert.deepEqual(saved(), { at: now, list: full });
    // Gardé une semaine
    assert.deepEqual(await catalogue(env, { now: now + 86400e3, fetchFn: () => { throw new Error('pas relu'); }, pause: 0 }), full);
    // Index de 2018 refusé (comme 2022 en vrai) : clés d'après 2019, tout le catalogue quand même ; raison gardée, revu 6 h plus tard
    cache.clear();
    denied = '2018';
    let at = now + 8 * 86400e3;
    assert.deepEqual(await catalogue(env, { now: at, fetchFn, pause: 0, token: 'jeton' }), full);
    assert.deepEqual(saved().errors, ['archives 2018 : 2018/Index.json : HTTP 403']);
    assert.equal(saved().at, at - 7 * 86400e3 + 6 * 3600e3);
    // Sans connexion F1 TV : circuits du calendrier d'après Jolpica ; le Paul Ricard de l'ancien catalogue reste
    rows.set('surrcat', JSON.stringify({ at: 0, list: full.filter(([k]) => k === 98) }));
    at += 7 * 3600e3;
    const mixed = [full[0], full[2], full[1], full[3], full[5], full[4]];   // les plus récents d'abord
    assert.deepEqual(await catalogue(env, { now: at, fetchFn, pause: 0 }), mixed);
    assert.deepEqual(saved().errors, ['connexion F1 TV absente']);
    // Jolpica en panne : l'ancien catalogue reste, chaque échec noté
    jolpica = 503;
    at += 7 * 3600e3;
    assert.deepEqual(await catalogue(env, { now: at, fetchFn, pause: 0, token: 'jeton' }), mixed);
    assert.deepEqual(saved().errors, ['Jolpica 2019 : HTTP 503 (2 essais)', 'archives 2018 : 2018/Index.json : HTTP 403', 'Jolpica 2018 : HTTP 503 (2 essais)']);
    assert.equal(saved().at, at - 7 * 86400e3 + 6 * 3600e3);
  } finally {
    delete globalThis.caches;
  }
});
