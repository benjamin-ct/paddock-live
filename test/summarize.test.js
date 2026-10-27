import test from 'node:test';
import assert from 'node:assert/strict';
import { studioQuota } from '../analytics/quota.js';
import { cleanSummaryRequest, copiedFrom, parsePoints, summarizeArticle, cleanPostRequest, parsePostReply, rewritePost } from '../analytics/summarize.js';
import { MODEL } from '../analytics/translate.js';
import worker from '../analytics/worker.js';

const ARTICLE = `Ferrari has confirmed that Lewis Hamilton will remain with the Scuderia until the end of the 2028 season. The seven-time world champion joined the team at the start of 2025. Team principal Fred Vasseur said the experience of the British driver was a key asset for the development of the car. ${'More details about the contract were not disclosed by the team. '.repeat(4)}`;
const POINTS = [
  'Ferrari garde Lewis Hamilton deux saisons de plus, jusqu’à la fin de l’année 2028.',
  'Le septuple champion du monde avait rejoint l’écurie italienne au début de 2025.',
  'Pour Fred Vasseur, l’expérience du Britannique pèse dans le développement de la voiture.',
];

function fakeEnv({ limit = 100, replies = [] } = {}) {
  const tr = new Map();
  const usage = new Map();
  const calls = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() {
      if (/FROM translations/.test(sql)) return tr.has(args[0]) ? { out: tr.get(args[0]) } : null;
      return usage.has(args[0]) ? { n: usage.get(args[0]) } : null;
    },
    async run() {
      if (/INTO translations/.test(sql)) tr.set(args[0], args[1]);
      else { const v = (usage.get(args[0]) || 0) + args[1]; if (v > args[2]) return { meta: { changes: 0 } }; usage.set(args[0], v); return { meta: { changes: 1 } }; }
    },
  });
  return {
    tr, usage, calls,
    env: {
      AI_DAILY_LIMIT: String(limit),
      STUDIO_AI_LIMIT: String(limit),
      DB: { prepare: (sql) => stmt(sql) },
      AI: { async run(model, input) { calls.push({ model, input }); return { response: replies.shift() ?? '' }; } },
    },
  };
}

test('résumé détaillé : requête nettoyée', () => {
  assert.deepEqual(cleanSummaryRequest({ title: '  Titre ', text: ARTICLE }), { title: 'Titre', text: ARTICLE.trim().replace(/[ \t]+/g, ' ') });
  assert.equal(cleanSummaryRequest({ title: '', text: ARTICLE }), null);
  assert.equal(cleanSummaryRequest({ title: 'T', text: 'trop court' }), null);
  assert.ok(cleanSummaryRequest({ title: 'T', text: 'x '.repeat(20000) }).text.length <= 12000);
});

test('résumé détaillé : phrases recopiées de l\'article refusées', () => {
  const fr = 'Le pilote a confirmé ce matin qu’il resterait dans l’équipe pendant encore deux saisons complètes au minimum.';
  assert.ok(copiedFrom('Il a dit : le pilote a confirmé ce matin qu’il resterait dans l’équipe pendant encore deux saisons.', fr));
  assert.ok(!copiedFrom('Le pilote reste deux saisons de plus dans son équipe actuelle, a-t-il annoncé.', fr));
  assert.deepEqual(parsePoints(`Voici :\n${JSON.stringify(['- ' + POINTS[0], POINTS[1]])}`, ARTICLE), POINTS.slice(0, 2));
  assert.equal(parsePoints('Désolé, je ne peux pas.', ARTICLE), null);
  assert.equal(parsePoints(JSON.stringify([POINTS[0], 'trop court']), ARTICLE), null);   // un seul point valable
  assert.equal(parsePoints(JSON.stringify([POINTS[0], '这是一个中文句子，不应该出现在法语摘要中。好的。']), ARTICLE), null);
});

test('résumé détaillé : une fois par article, plafond du jour, nouvel essai si réponse mal formée', async () => {
  const f = fakeEnv({ replies: ['pas de liste', JSON.stringify(POINTS)] });
  const req = cleanSummaryRequest({ title: 'Hamilton extends Ferrari deal', text: ARTICLE });
  assert.deepEqual(await summarizeArticle(f.env, req, '2026-10-16'), { points: POINTS });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].model, MODEL);
  assert.match(f.calls[0].input.messages[0].content, /never copy a sentence/);
  assert.equal(f.usage.get('2026-10-16'), 5);
  assert.deepEqual(await summarizeArticle(f.env, req, '2026-10-16'), { points: POINTS, cached: true });
  assert.equal(f.calls.length, 2);
  const g = fakeEnv({ limit: 3 });
  assert.deepEqual(await summarizeArticle(g.env, req, '2026-10-16'), { limited: true });
  assert.equal(g.calls.length, 0);
  // Studio : son propre plafond, même quand celui des applis est épuisé
  const st = fakeEnv({ limit: 3, replies: [JSON.stringify(POINTS)] });
  st.env.STUDIO_AI_LIMIT = '50';
  assert.deepEqual(await summarizeArticle(st.env, req, '2026-10-16', null, studioQuota(st.env, '2026-10-16')), { points: POINTS });
  assert.equal(st.usage.get('2026-10-16|studio'), 5);
  const h = fakeEnv({ replies: ['x', 'y'] });
  assert.deepEqual(await summarizeArticle(h.env, req, '2026-10-16'), { points: null, error: "Réponse de l'IA inutilisable pour cet article, réessayez" });
});

test('résumé détaillé : réponse JSON déjà décodée par Workers AI (tableau ou objet), raison des échecs', async () => {
  const req = cleanSummaryRequest({ title: 'Hamilton extends Ferrari deal', text: ARTICLE });
  // Workers AI renvoie un tableau (et non du texte) quand la réponse du modèle est du JSON valide
  const f = fakeEnv({ replies: [POINTS] });
  assert.deepEqual(await summarizeArticle(f.env, req, '2026-10-16'), { points: POINTS });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(parsePoints({ points: POINTS }, ARTICLE), POINTS);
  // Points recopiés de l'article : raison donnée
  const why = {};
  const copied = ARTICLE.split(/(?<=\.)\s+/).filter((x) => x.split(' ').length > 12).slice(0, 3);
  if (copied.length >= 2) {
    assert.equal(parsePoints(copied, ARTICLE, why), null);
    assert.equal(why.reason, 'copy');
  }
  // Service d'IA en panne
  const g = fakeEnv({});
  g.env.AI.run = async () => { throw new Error('down'); };
  assert.match((await summarizeArticle(g.env, req, '2026-10-16')).error, /n'a pas répondu/);
});

test('résumé détaillé : adresse /s du serveur', async () => {
  const post = (env, body) => worker.fetch(new Request('https://s.test/s', { method: 'POST', body }), env);
  assert.equal((await post({}, '{}')).status, 503);   // sans Workers AI
  const f = fakeEnv({ replies: [JSON.stringify(POINTS)] });
  assert.equal((await post(f.env, '{')).status, 400);
  assert.equal((await post(f.env, JSON.stringify({ title: 'T', text: 'court' }))).status, 400);
  const r = await post(f.env, JSON.stringify({ title: 'Hamilton extends Ferrari deal', text: ARTICLE }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).points, POINTS);
});

test('post écrit à la main : texte mis en forme par l\'IA (titre, résumé, points), plafond du jour', async () => {
  assert.equal(cleanPostRequest({ text: 'court' }), null);
  assert.equal(cleanPostRequest({ text: '  Norris   prolonge chez McLaren jusqu\'en 2030  ' }), 'Norris prolonge chez McLaren jusqu\'en 2030');
  const post = { title: 'Norris prolonge jusqu\'en 2030', summary: 'McLaren a confirmé la prolongation de Lando Norris.', points: ['- Le contrat court désormais jusqu\'à la fin de la saison 2030.', 'court'] };
  assert.deepEqual(parsePostReply(`Voici : ${JSON.stringify(post)}`), { ...post, points: ['Le contrat court désormais jusqu\'à la fin de la saison 2030.'] });
  assert.deepEqual(parsePostReply(post).title, post.title);   // réponse déjà décodée
  assert.equal(parsePostReply('Désolé'), null);
  assert.equal(parsePostReply({ title: 'T', summary: '' }), null);
  const f = fakeEnv({ limit: 5, replies: ['rien', JSON.stringify(post)] });
  assert.equal((await rewritePost(f.env, 'Norris prolonge chez McLaren', '2026-10-17')).title, post.title);
  assert.equal(f.calls.length, 2);   // réponse mal formée : nouvel essai
  assert.deepEqual(await rewritePost(f.env, 'Norris prolonge chez McLaren', '2026-10-17'), { limited: true });
});
