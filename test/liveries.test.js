import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVERIES } from '../analytics/liveries-data.js';
import { liveriesWeb } from '../analytics/liveries.js';

// Écuries de chaque saison (identifiants Jolpica, ceux de la Saison de l'appli)
const TEAMS = {
  2018: ['ferrari', 'force_india', 'haas', 'mclaren', 'mercedes', 'red_bull', 'renault', 'sauber', 'toro_rosso', 'williams'],
  2019: ['alfa', 'ferrari', 'haas', 'mclaren', 'mercedes', 'racing_point', 'red_bull', 'renault', 'toro_rosso', 'williams'],
  2020: ['alfa', 'alphatauri', 'ferrari', 'haas', 'mclaren', 'mercedes', 'racing_point', 'red_bull', 'renault', 'williams'],
  2021: ['alfa', 'alphatauri', 'alpine', 'aston_martin', 'ferrari', 'haas', 'mclaren', 'mercedes', 'red_bull', 'williams'],
  2022: ['alfa', 'alphatauri', 'alpine', 'aston_martin', 'ferrari', 'haas', 'mclaren', 'mercedes', 'red_bull', 'williams'],
  2023: ['alfa', 'alphatauri', 'alpine', 'aston_martin', 'ferrari', 'haas', 'mclaren', 'mercedes', 'red_bull', 'williams'],
  2024: ['alpine', 'aston_martin', 'ferrari', 'haas', 'mclaren', 'mercedes', 'rb', 'red_bull', 'sauber', 'williams'],
  2025: ['alpine', 'aston_martin', 'ferrari', 'haas', 'mclaren', 'mercedes', 'rb', 'red_bull', 'sauber', 'williams'],
  2026: ['alpine', 'aston_martin', 'audi', 'cadillac', 'ferrari', 'haas', 'mclaren', 'mercedes', 'rb', 'red_bull', 'williams'],
};

test('livrées spéciales : chaque entrée complète, sourcée, écurie de la saison, sans doublon', () => {
  for (const [y, list] of Object.entries(LIVERIES)) {
    const seen = new Set();
    for (const l of list) {
      const id = `${y} R${l.round} ${l.team}`;
      assert.equal(l.year, Number(y), id);
      assert.ok(Number.isInteger(l.round) && l.round >= 1 && l.round <= 24, `${id} : manche`);
      assert.ok(TEAMS[y]?.includes(l.team), `${id} : écurie inconnue en ${y}`);
      for (const k of ['title_fr', 'title_en', 'desc_fr', 'desc_en', 'source']) assert.ok(String(l[k] || '').trim(), `${id} : ${k} vide`);
      assert.match(l.url, /^https:\/\//, `${id} : source`);
      assert.ok(!seen.has(id), `${id} : en double`);
      seen.add(id);
    }
  }
});

test('livrées spéciales : image de l\'annonce lue une fois, sans image si le site refuse', async () => {
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  const asked = [];
  const fetchFn = async (u) => {
    asked.push(u);
    return /refus/.test(u) ? new Response('', { status: 403 }) : new Response('<html><head><meta property="og:image" content="https://img.test/livree.jpg"></head></html>');
  };
  const [y] = Object.keys(LIVERIES);
  const real = LIVERIES[y];
  LIVERIES[9999] = [{ ...real[0], year: 9999, url: 'https://ecurie.test/livree' }, { ...real[0], year: 9999, round: 2, url: 'https://refus.test/livree' }];
  try {
    const a = await liveriesWeb(9999, { fetchFn });
    assert.deepEqual(a.liveries.map((l) => l.image), ['https://img.test/livree.jpg', '']);
    const b = await liveriesWeb(9999, { fetchFn });
    assert.equal(b.liveries[0].image, 'https://img.test/livree.jpg');
    assert.equal(asked.length, 2, 'image gardée : pas relue');
    assert.deepEqual((await liveriesWeb(2017, { fetchFn })).liveries, []);
  } finally { delete LIVERIES[9999]; delete globalThis.caches; }
});
