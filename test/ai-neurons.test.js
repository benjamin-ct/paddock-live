import test from 'node:test';
import assert from 'node:assert/strict';
import { neuronsOf, neuronBudget, runAI, aiQuota } from '../analytics/quota.js';
import { MODEL, FALLBACK } from '../analytics/translate.js';
import { ASR_MODEL, ASR_FALLBACK } from '../analytics/transcribe.js';

// Compteurs ai_usage en mémoire (mêmes requêtes que la base : ajout refusé au-delà du plafond, lecture par plage)
// et saison gardée (Grand Prix du 1er novembre 2026)
function fakeEnv(env = {}, usage = new Map()) {
  const calls = [];
  const season = JSON.stringify({ at: 0, v: { races: [{ round: 20, date: '2026-11-01T20:00:00Z' }] } });
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => (sql.includes('FROM studio') ? (a[0] === 'season:2026' ? { v: season } : null) : usage.has(a[0]) ? { n: usage.get(a[0]) } : null),
    all: async () => ({ results: [...usage].filter(([k]) => k >= a[0] && k <= a[1]).map(([day, n]) => ({ day, n })) }),
    run: async () => { const v = (usage.get(a[0]) || 0) + a[1]; if (v > a[2]) return { meta: { changes: 0 } }; usage.set(a[0], v); return { meta: { changes: 1 } }; },
  });
  return { usage, calls, env: { DB: { prepare: (sql) => stmt(sql) }, AI: { run: async (model) => { calls.push(model); return { response: '["ok"]', usage: { prompt_tokens: 10000, completion_tokens: 2000 } }; } }, ...env } };
}

test('IA : neurones comptés comme Cloudflare, pour chaque modèle utilisé', () => {
  // Mistral Small du 26 oct. 2026 d'après le tableau de bord : 223 935 jetons en entrée, 69 114 en sortie -> 10 627,6
  assert.equal(Math.round(neuronsOf(MODEL, {}, { usage: { prompt_tokens: 223935, completion_tokens: 69114 } })), 10628);
  assert.equal(neuronsOf(ASR_MODEL, {}, { transcription_info: { duration: 60 } }), 46.63);
  assert.ok(neuronsOf(ASR_FALLBACK, {}, { words: [{ end: 30 }] }) > 20);
  assert.ok(neuronsOf(FALLBACK, { text: 'Box box' }, { translated_text: 'Rentre aux stands' }) > 0, 'jetons estimés si le modèle ne les donne pas');
  assert.throws(() => neuronsOf('@cf/x/inconnu', {}, {}), /prix inconnu/);
});

test('IA : plafond du jour plus haut les week-ends de Grand Prix, budget payé des 30 derniers jours', async () => {
  const f = fakeEnv();
  assert.deepEqual(await neuronBudget(f.env, '2026-10-21'), { used: 0, top: 14000, gp: false, spent: 0, budget: 850000 }, 'jour ordinaire');
  assert.deepEqual(await neuronBudget(f.env, '2026-10-30'), { used: 0, top: 69000, gp: true, spent: 0, budget: 850000 }, 'vendredi du Grand Prix');
  assert.equal((await neuronBudget(f.env, '2026-11-02')).top, 69000, 'lundi (course du dimanche soir en Amérique)');
  assert.equal((await neuronBudget(f.env, '2026-11-03')).top, 14000);
  // Plafonds de chaque usage agrandis le week-end : 100 un jour ordinaire -> 493, le quart (124) pour un même appelant
  for (let i = 0; i < 124; i++) assert.equal(await aiQuota(f.env, { key: '2026-10-31', day: '2026-10-31', n: 1, limit: 100, ip: '1.2.3.4' }), true);
  assert.equal(await aiQuota(f.env, { key: '2026-10-31', day: '2026-10-31', n: 1, limit: 100, ip: '1.2.3.4' }), false);

  // Budget payé : 17 000 neurones au-delà des gratuits sur les 30 derniers jours (le 20 septembre n'en fait plus partie)
  const g = fakeEnv({ AI_NEURON_MONTH: '20000' }, new Map([['neurons:2026-09-20', 900000], ['neurons:2026-10-20', 25000], ['neurons:2026-10-22', 12000], ['neurons:2026-10-23', 11000]]));
  assert.deepEqual(await neuronBudget(g.env, '2026-10-23'), { used: 11000, top: 12000, gp: false, spent: 18000, budget: 20000 }, 'payés : 15 000 + 2 000 + 1 000 aujourd\'hui');
  assert.equal(await aiQuota(g.env, { key: '2026-10-23', day: '2026-10-23', n: 1, limit: 100 }), false, 'dernier dixième gardé');
  assert.equal(await aiQuota(g.env, { key: 'radio:2026-10-23', day: '2026-10-23', n: 1, limit: 100 }), true);
  assert.equal(await aiQuota(g.env, { key: '2026-10-23|studio', day: '2026-10-23', n: 1, limit: 100 }), true);
  g.usage.set('neurons:2026-10-23', 12000);
  assert.equal(await aiQuota(g.env, { key: 'radio:2026-10-23', day: '2026-10-23', n: 1, limit: 100 }), false);
  // Budget dépensé : retour aux neurones gratuits
  g.usage.set('neurons:2026-10-21', 20000);
  assert.equal((await neuronBudget(g.env, '2026-10-24')).top, 9000);
});

test('IA : chaque appel compté, plus aucun appel passé le plafond', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const f = fakeEnv();
  await runAI(f.env, MODEL, { messages: [] });   // 10 000 x 31 876 + 2 000 x 50 488 -> 420 neurones
  assert.equal(f.usage.get(`neurons:${day}`), 420);
  f.usage.set(`neurons:${day}`, 69000);
  await assert.rejects(runAI(f.env, MODEL, { messages: [] }), /4006/);
  assert.equal(f.calls.length, 1);
});
