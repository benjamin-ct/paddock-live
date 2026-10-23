import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRequest, translateBatch, keyOf, parseList, MODEL, FALLBACK } from '../analytics/translate.js';
import { createCloudTranslator } from '../server/cloud-translate.js';

// Base D1 simulée pour les traductions et le plafond du jour
function fakeEnv({ limit = 100, fail = false, garbled = false } = {}) {
  const tr = new Map();
  const usage = new Map();
  const calls = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async all() { return { results: args.filter((k) => tr.has(k)).map((k) => ({ k, out: tr.get(k) })) }; },
    async first() { return usage.has(args[0]) ? { n: usage.get(args[0]) } : null; },
    async run() { const v = (usage.get(args[0]) || 0) + args[1]; if (v > args[2]) return { meta: { changes: 0 } }; usage.set(args[0], v); return { meta: { changes: 1 } }; },
    exec() { tr.set(args[0], args[1]); },
  });
  return {
    tr, usage, calls,
    env: {
      AI_DAILY_LIMIT: String(limit),
      DB: { prepare: (sql) => stmt(sql), async batch(list) { for (const s of list) s.exec(); } },
      AI: {
        async run(model, input) {
          calls.push({ model, input });
          if (fail) throw new Error('ia');
          if (model === MODEL) {
            const list = JSON.parse(input.messages[1].content);
            return { response: garbled ? 'Désolé, je ne peux pas.' : `Voici : ${JSON.stringify(list.map((t) => `[fr] ${t}`))}` };
          }
          assert.equal(model, FALLBACK);
          return { translated_text: `[${input.target_lang}] ${input.text}` };
        },
      },
    },
  };
}

test('traduction partagée : requête nettoyée', () => {
  assert.deepEqual(cleanRequest({ to: 'fr', items: [{ text: ' Hello ', from: 'en' }, { text: 'Hallo', from: 'xx' }] }), { to: 'fr', items: [{ text: 'Hello', from: 'en' }, { text: 'Hallo', from: 'en' }] });
  assert.equal(cleanRequest({ to: 'klingon', items: [{ text: 'a' }] }), null);
  assert.equal(cleanRequest({ to: 'fr', items: [{ text: '' }] }), null);
  assert.equal(cleanRequest({ to: 'fr', items: [] }), null);
  assert.equal(cleanRequest({ to: 'fr', items: Array(5).fill({ text: 'x'.repeat(2000) }).concat(Array(10).fill({ text: 'y'.repeat(2000) })) }), null);   // trop long au total
});

test('traduction partagée : une seule fois pour tous, puis depuis la base', async () => {
  const f = fakeEnv();
  const r1 = await translateBatch(f.env, { to: 'fr', items: [{ text: 'Box box', from: 'en' }, { text: 'Box box', from: 'en' }, { text: 'Bonjour', from: 'fr' }] }, '2026-10-15');
  assert.deepEqual(r1.out, ['[fr] Box box', '[fr] Box box', 'Bonjour']);
  assert.equal(f.calls.length, 1);   // doublon et même langue : pas d'appel
  assert.equal(f.usage.get('2026-10-15'), 1);
  const r2 = await translateBatch(f.env, { to: 'fr', items: [{ text: 'Box box', from: 'en' }] }, '2026-10-15');
  assert.deepEqual(r2, { out: ['[fr] Box box'], cached: true });
  assert.equal(f.calls.length, 1);
  assert.ok(f.tr.has(await keyOf('en', 'fr', 'Box box')));
});

test('traduction partagée : plafond du jour et échec de l\'IA', async () => {
  const f = fakeEnv({ limit: 1 });
  const r = await translateBatch(f.env, { to: 'fr', items: [{ text: 'a', from: 'en' }, { text: 'b', from: 'en' }] }, 'd');
  assert.equal(r.limited, true);
  assert.deepEqual(r.out, [null, null]);
  assert.equal(f.calls.length, 0);
  const g = fakeEnv({ fail: true });
  const r2 = await translateBatch(g.env, { to: 'fr', items: [{ text: 'a', from: 'en' }] }, 'd');
  assert.deepEqual(r2.out, [null]);
  assert.equal(g.tr.size, 0);
});

test('appli : demandes regroupées, mémoire, pause si le serveur refuse', async () => {
  let t = 0;
  const posts = [];
  const tr = createCloudTranslator({
    url: 'https://x/t', now: () => t,
    post: async (url, body) => { posts.push(body); return body.items[0].text === 'quota' ? { status: 429, json: { out: [null] } } : { status: 200, json: { out: body.items.map((i) => `fr:${i.text}`) } }; },
  });
  const [a, b] = await Promise.all([tr.translate('Copy', 'en', 'fr'), tr.translate('Push now', 'de', 'fr')]);
  assert.deepEqual([a, b], ['fr:Copy', 'fr:Push now']);
  assert.equal(posts.length, 1);   // un seul envoi pour les deux
  assert.equal(await tr.translate('Copy', 'en', 'fr'), 'fr:Copy');
  assert.equal(posts.length, 1);   // mémoire
  assert.equal(await tr.translate('Même langue', 'fr', 'fr'), 'Même langue');
  assert.equal(await tr.translate('x', 'en', 'klingon'), null);
  assert.equal(await tr.translate('quota', 'en', 'fr'), null);
  assert.equal(tr.available(), false);   // pause de 10 minutes
  assert.equal(await tr.translate('autre', 'en', 'fr'), null);
  t += 11 * 60e3;
  assert.equal(tr.available(), true);
});

test('traduction partagée : consignes F1 envoyées, réponse mal formée -> traduction simple', async () => {
  const f = fakeEnv();
  await translateBatch(f.env, { to: 'fr', items: [{ text: 'Câmara joins Haas', from: 'en' }] }, 'd');
  const sys = f.calls[0].input.messages[0].content;
  assert.match(sys, /Keep names of drivers/);
  assert.match(sys, /rentre aux stands/);
  assert.match(sys, /not word for word/);
  assert.match(sys, /LES CHIFFRES/);
  const g = fakeEnv({ garbled: true });
  const r = await translateBatch(g.env, { to: 'fr', items: [{ text: 'a', from: 'en' }, { text: 'b', from: 'de' }] }, 'd');
  assert.deepEqual(r.out, ['[fr] a', '[fr] b']);
  assert.deepEqual(g.calls.map((c) => c.model), [MODEL, FALLBACK, FALLBACK]);
  assert.equal(parseList('["x"]', 2), null);
  assert.deepEqual(parseList('ok ["x", " y "]', 2), ['x', 'y']);
});

test('appli : textes longs répartis en plusieurs envois, envoi refusé sans pause', async () => {
  const posts = [];
  const tr = createCloudTranslator({
    url: 'https://x/t',
    post: async (url, body) => {
      posts.push(body.items.map((i) => i.text.length));
      if (body.items.some((i) => i.text.startsWith('refusé'))) return { status: 400, json: { error: 'Requête invalide' } };
      return { status: 200, json: { out: body.items.map((i) => `fr:${i.text.slice(0, 3)}`) } };
    },
  });
  const long = Array.from({ length: 30 }, (_, i) => `${i}`.padEnd(1900, 'x'));
  const out = await Promise.all(long.map((t) => tr.translate(t, 'en', 'fr')));
  assert.ok(out.every(Boolean));
  assert.ok(posts.length >= 3);
  assert.ok(posts.every((p) => p.reduce((a, n) => a + n, 0) <= 20000));
  assert.equal(await tr.translate('refusé', 'en', 'fr'), null);
  assert.equal(tr.available(), true);
});

test('traduction partagée : caractères d\'une autre écriture refusés, refaits par le modèle simple', async () => {
  const { badScript } = await import('../shared/translation-check.js');
  assert.equal(badScript('Laurent Mekies将继续 dans son rôle', 'fr'), true);
  assert.equal(badScript('”阿吽の呼吸”で無線トラブル', 'fr'), true);
  assert.equal(badScript('Câmara, Hülkenberg, Pérez : ça roule', 'fr'), false);
  assert.equal(badScript('フェルスタッペン', 'ja'), false);
  const f = fakeEnv();
  const run = f.env.AI.run;
  f.env.AI.run = async (model, input) => (model === MODEL
    ? { response: JSON.stringify(['Mekies将继续 chez Red Bull', 'Bonne traduction']) }
    : run(model, input));
  const r = await translateBatch(f.env, { to: 'fr', items: [{ text: 'Mekies stays at Red Bull', from: 'en' }, { text: 'Good one', from: 'en' }] }, 'd');
  assert.deepEqual(r.out, ['[fr] Mekies stays at Red Bull', 'Bonne traduction']);
  // Ancienne traduction suspecte dans le cache : ignorée et refaite
  const k = await keyOf('en', 'fr', 'Cached');
  f.tr.set(k, 'Mise en cache将');
  const again = await translateBatch(f.env, { to: 'fr', items: [{ text: 'Cached', from: 'en' }] }, 'd');
  assert.deepEqual(again.out, ['[fr] Cached']);
});

test('traduction : réponse du modèle au lieu d\'une traduction refusée', async () => {
  const { chatty, badTranslation } = await import('../shared/translation-check.js');
  assert.equal(chatty('Je ne comprends pas cette séquence de mots. Il semble y avoir une erreur. Pourrais-je t\'assister ?', 'Moderate gift Goldmann'), true);
  assert.equal(chatty('Could you please clarify what you mean?', 'Abc def'), true);
  assert.equal(chatty('Verstappen remporte le Grand Prix', 'Verstappen wins the Grand Prix'), false);
  assert.equal(chatty("Je ne comprends pas, répète", "I don't understand, say again"), false);
  assert.equal(badTranslation('Laurent Mekies将继续', 'fr', 'x'), true);
});
