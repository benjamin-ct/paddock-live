import test from 'node:test';
import assert from 'node:assert/strict';
import { recordsTick } from '../analytics/records.js';
import { CIRCUITS } from '../shared/circuits-info.js';

// Lignes du Studio seulement (records:<circuit>:<année>, recordsdone:<saison>)
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
        async run() {
          if (/^INSERT INTO studio/.test(sql)) { studio.set(args[0], args[1]); return {}; }
          throw new Error(`SQL inattendu : ${sql}`);
        },
      };
      return st;
    },
  };
}

// Jolpica simulé : Mexico seulement, course et qualifications ; les autres circuits n'ont pas eu de Grand Prix
const asked = [];
const fetchFn = async (url) => {
  asked.push(url);
  const m = url.match(/\/(\d{4})\/circuits\/(\w+)\/(results|qualifying)/);
  const races = m?.[2] === 'rodriguez' ? [m[3] === 'results'
    ? { raceName: 'Mexico City Grand Prix', Results: [{ Driver: { code: 'LEC' }, Constructor: { name: 'Ferrari' }, FastestLap: { lap: '60', Time: { time: '1:18.336' } } }] }
    : { raceName: 'Mexico City Grand Prix', QualifyingResults: [{ position: '1', Driver: { code: 'NOR' }, Constructor: { name: 'McLaren' }, Q3: '1:15.586' }] }] : [];
  return { ok: true, json: async () => ({ MRData: { total: String(races.length), RaceTable: { Races: races } } }) };
};

test('records : la tâche planifiée lit une édition par appel, puis ne lit plus rien jusqu\'à la saison suivante', async () => {
  const env = { DB: fakeDB() };
  const now = Date.parse('2026-10-30T20:00:00Z'), wait = async () => {};
  const first = await recordsTick(env, { now, fetchFn, wait });
  assert.deepEqual(first, { key: Object.values(CIRCUITS)[0].key, year: 2025 });
  let calls = 1;
  while (await recordsTick(env, { now, fetchFn, wait })) calls++;
  assert.equal(calls, Object.keys(CIRCUITS).length * 4);   // 2022 à 2025 pour chaque circuit
  const mexico = JSON.parse(env.DB.studio.get(`records:${CIRCUITS.rodriguez.key}:2025`));
  assert.equal(mexico.pole.tla, 'NOR');
  assert.equal(mexico.fastest.time, 78.336);
  assert.equal(env.DB.studio.get('recordsdone:2026'), '1');
  const before = asked.length;
  assert.equal(await recordsTick(env, { now, fetchFn, wait }), null);
  assert.equal(asked.length, before);
  // Nouvelle saison : l'édition qui s'ajoute est lue
  assert.deepEqual(await recordsTick(env, { now: Date.parse('2027-01-02T00:00:00Z'), fetchFn, wait }), { key: Object.values(CIRCUITS)[0].key, year: 2026 });
});
