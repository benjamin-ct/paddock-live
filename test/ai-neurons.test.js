import test from 'node:test';
import assert from 'node:assert/strict';
import { neuronsOf, runAI, aiQuota } from '../analytics/quota.js';
import { MODEL, FALLBACK } from '../analytics/translate.js';
import { ASR_MODEL, ASR_FALLBACK } from '../analytics/transcribe.js';

// Compteurs ai_usage en mémoire (même requête que la base : ajout refusé au-delà du plafond)
function fakeEnv(env = {}) {
  const usage = new Map(), calls = [];
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => (usage.has(a[0]) ? { n: usage.get(a[0]) } : null),
    run: async () => { const v = (usage.get(a[0]) || 0) + a[1]; if (v > a[2]) return { meta: { changes: 0 } }; usage.set(a[0], v); return { meta: { changes: 1 } }; },
  });
  return { usage, calls, env: { DB: { prepare: (sql) => stmt(sql) }, AI: { run: async (model, input) => { calls.push(model); return { response: '["ok"]', usage: { prompt_tokens: 10000, completion_tokens: 2000 } }; } }, ...env } };
}

test('IA : neurones comptés comme Cloudflare, pour chaque modèle utilisé', () => {
  // Mistral Small du 26 oct. 2026 d'après le tableau de bord : 223 935 jetons en entrée, 69 114 en sortie -> 10 627,6
  assert.equal(Math.round(neuronsOf(MODEL, {}, { usage: { prompt_tokens: 223935, completion_tokens: 69114 } })), 10628);
  assert.equal(neuronsOf(ASR_MODEL, {}, { transcription_info: { duration: 60 } }), 46.63);
  assert.ok(neuronsOf(ASR_FALLBACK, {}, { words: [{ end: 30 }] }) > 20);
  assert.ok(neuronsOf(FALLBACK, { text: 'Box box' }, { translated_text: 'Rentre aux stands' }) > 0, 'jetons estimés si le modèle ne les donne pas');
  assert.throws(() => neuronsOf('@cf/x/inconnu', {}, {}), /prix inconnu/);
});

test('IA : plus aucun appel passé le plafond de neurones, radios d\'équipe et Studio servis en dernier', async () => {
  const f = fakeEnv({ AI_NEURON_LIMIT: '1400' });
  const day = new Date().toISOString().slice(0, 10);
  await runAI(f.env, MODEL, { messages: [] });   // 10 000 x 31 876 + 2 000 x 50 488 -> 420 neurones
  assert.equal(f.usage.get(`neurons:${day}`), 420);
  assert.equal(await aiQuota(f.env, { key: day, day, n: 1, limit: 100 }), false, 'réserve de 1 000 neurones entamée');
  assert.equal(await aiQuota(f.env, { key: `radio:${day}`, day, n: 1, limit: 100 }), true);
  assert.equal(await aiQuota(f.env, { key: `${day}|studio`, day, n: 1, limit: 100 }), true);
  for (let i = 0; i < 3; i++) await runAI(f.env, MODEL, { messages: [] });
  await assert.rejects(runAI(f.env, MODEL, { messages: [] }), /4006/);
  assert.equal(f.calls.length, 4);
  assert.equal(await aiQuota(f.env, { key: `radio:${day}`, day, n: 1, limit: 100 }), false);
});
