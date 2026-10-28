import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSurroundings, surroundingsWeb, surroundingsTick, catalogue, CREDITS } from '../analytics/surroundings.js';
import { geoFrame, toEN } from '../shared/surroundings.js';
import { terrariumTile } from './fixtures/png.js';

// Circuit « haricot » (tracé MultiViewer en 1/10 m), posé près de (45° N, 5° E) tourné de 20° et décalé
const AT = { lat: 45, lon: 5 };
const bean = Array.from({ length: 300 }, (_, i) => {
  const a = (2 * Math.PI * i) / 300, r = 700 + 200 * Math.cos(2 * a) + 100 * Math.sin(3 * a);
  return [r * Math.cos(a), r * Math.sin(a) * 0.7];
});
const raw = { x: bean.map((p) => Math.round(p[0] * 10)), y: bean.map((p) => Math.round(p[1] * 10)), rotation: 0 };
const frame = geoFrame(AT.lat, AT.lon), TRUE = { s: 1, a: (20 * Math.PI) / 180, e: 400, n: -250 };
const geo = (x, y) => { const [lat, lon] = frame.toGeo(...toEN(TRUE, x, y)); return { lat, lon }; };
const square = (x, y, w) => [geo(x, y), geo(x + w, y), geo(x + w, y + w), geo(x, y + w), geo(x, y)];
const RACE = [{ type: 'way', tags: { highway: 'raceway' }, geometry: [...bean, bean[0]].map(([x, y]) => geo(x, y)) }];
const OSM = [{ type: 'way', tags: { building: 'yes', 'building:levels': '3' }, geometry: square(0, 0, 40) },
  { type: 'way', tags: { natural: 'wood' }, geometry: square(1200, -400, 500) }];
const TILE = terrariumTile((x) => 200 + x * 0.1);

function setup({ mv = true } = {}) {
  const asked = [];
  const fetchFn = async (url, opts = {}) => {
    asked.push(url);
    if (url.includes('multiviewer')) return mv ? new Response(JSON.stringify(raw)) : new Response('', { status: 404 });
    if (url.includes('overpass-api.de')) throw new Error('connexion coupée');   // serveur principal injoignable : le miroir répond
    if (url.includes('overpass')) {
      const q = opts.body.get('data');
      return new Response(JSON.stringify({ elements: q.includes('around:5000') ? RACE : q.includes('around:') ? [] : OSM }));
    }
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
    assert.ok(res.data.areas.wood.length === 1 && res.data.trees.length > 0);
    assert.ok(asked.some((u) => u.includes('overpass-api.de')) && asked.some((u) => u.includes('maps.mail.ru')), 'principal puis miroir');
    assert.ok(media.has('surroundings/place-999.json'));
    const tiles = [...media.keys()].filter((k) => k.startsWith('surroundings/tiles/'));
    assert.ok(tiles.length > 0 && tiles.length <= 30);

    // Saison suivante : OSM et tuiles déjà gardés, seul le tracé est relu
    asked.length = 0;
    const again = await computeSurroundings({ MEDIA }, 999, 2025, { fetchFn, at: AT, pause: 0 });
    assert.ok(again.data);
    assert.deepEqual(asked.filter((u) => !u.includes('multiviewer')), []);

    // Pistes d'OSM sans rapport avec le tracé : calage écarté, rien d'affiché
    media.set('surroundings/place-998.json', JSON.stringify({ ...AT, race: [[45, 5, 45.001, 5, 45.001, 5.001]], streets: [] }));
    const bad = await computeSurroundings({ MEDIA }, 998, 2026, { fetchFn, at: AT, pause: 0 });
    assert.equal(bad.data, undefined);
    assert.match(bad.error, /calage raté/);
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

test('serveur : catalogue des replays (archives de la F1 × Jolpica), un couple par circuit et par saison', async () => {
  const now = Date.parse('2019-06-01T12:00:00Z');
  const rows = new Map();
  const index = (y) => ({ Meetings: [
    { Key: 1, Name: 'Pre-Season Testing', Circuit: { Key: 63 }, Sessions: [{ Key: 1, Name: 'Day 1', Type: 'Practice', StartDate: `${y}-02-20T10:00:00`, Path: 'a/' }] },
    { Key: 2, Name: 'Bahrain Grand Prix', Circuit: { Key: 63 }, Sessions: [{ Key: 2, Name: 'Race', Type: 'Race', StartDate: `${y}-03-31T18:10:00`, Path: 'b/' }] },
    { Key: 3, Name: 'Belgian Grand Prix', Circuit: { Key: 7 }, Sessions: [{ Key: 3, Name: 'Race', Type: 'Race', StartDate: `${y}-08-31T15:10:00`, Path: 'c/' }] },
  ] });
  const races = (y) => ({ MRData: { RaceTable: { Races: [
    { date: `${y}-03-31`, Circuit: { circuitId: 'bahrain', Location: { lat: '26.0325', long: '50.5106' } } },
    { date: `${y}-09-01`, Circuit: { circuitId: 'spa', Location: { lat: '50.4372', long: '5.97139' } } },
  ] } } });
  const fetchFn = async (url) => {
    const y = /\/(\d{4})\//.exec(url)?.[1];
    if (url.endsWith('Index.json')) return new Response(`﻿${JSON.stringify(index(y))}`);
    if (url.includes('jolpi')) return new Response(JSON.stringify(races(y)));
    return new Response('', { status: 404 });
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  try {
    const list = await catalogue({ DB: db(rows) }, { now, fetchFn, pause: 0, token: 'jeton' });
    assert.deepEqual(list, [[63, 2019, 26.0325, 50.5106], [7, 2019, 50.4372, 5.97139], [63, 2018, 26.0325, 50.5106], [7, 2018, 50.4372, 5.97139]]);
    assert.equal(JSON.parse(rows.get('surrcat')).at, now);
    // Gardé une semaine
    assert.deepEqual(await catalogue({ DB: db(rows) }, { now: now + 86400e3, fetchFn: () => { throw new Error('pas relu'); }, pause: 0 }), list);
    // Sans connexion F1 TV : l'ancien catalogue reste, revu 6 h plus tard
    const later = now + 8 * 86400e3;
    assert.deepEqual(await catalogue({ DB: db(rows) }, { now: later, fetchFn, pause: 0 }), list);
    assert.equal(JSON.parse(rows.get('surrcat')).at, later - 7 * 86400e3 + 6 * 3600e3);
  } finally {
    delete globalThis.caches;
  }
});
