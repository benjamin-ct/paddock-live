import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFeedback, feedbackPost, feedbackApi } from '../analytics/feedback.js';
import { sendFeedback } from '../server/stats.js';

// Base D1 réduite aux requêtes des messages (et à la liste vide des téléphones abonnés)
function fakeD1() {
  const rows = []; const sent = new Map();
  let id = 0;
  return {
    rows,
    prepare(sql) {
      const st = (a) => ({
        async first() {
          if (sql.startsWith('SELECT v FROM studio')) return null;
          if (sql.startsWith('SELECT n FROM feedback_new')) return sent.has(`${a[0]}|${a[1]}`) ? { n: sent.get(`${a[0]}|${a[1]}`) } : null;
          throw new Error(`requête inattendue : ${sql}`);
        },
        async all() {
          if (sql.startsWith('SELECT id, at, kind')) return { results: [...rows].sort((x, y) => y.at - x.at) };
          throw new Error(`requête inattendue : ${sql}`);
        },
        async run() {
          if (sql.startsWith('INSERT INTO feedback_new')) sent.set(`${a[0]}|${a[1]}`, (sent.get(`${a[0]}|${a[1]}`) || 0) + 1);
          else if (sql.startsWith('INSERT INTO feedback ')) {
            const [at, kind, text, contact, src, version, os, lang] = a;
            rows.push({ id: ++id, at, kind, text, contact, src, version, os, lang, seen: 0 });
          } else if (sql.startsWith('DELETE FROM feedback WHERE id NOT IN')) { /* moins de 500 messages */ }
          else if (sql.startsWith('UPDATE feedback SET seen')) rows.forEach((r) => { r.seen = 1; });
          else if (sql.startsWith('DELETE FROM feedback WHERE id = ?')) rows.splice(rows.findIndex((r) => r.id === a[0]), 1);
          else throw new Error(`requête inattendue : ${sql}`);
        },
      });
      return { bind: (...a) => st(a), ...st([]) };
    },
  };
}
const post = (body, ip = '1.2.3.4') => new Request('https://paddocklive.app/f', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } });

test('message : type connu et texte assez long, champs nettoyés', () => {
  assert.equal(cleanFeedback({ kind: 'autre', text: 'Bonjour à tous' }), null);
  assert.equal(cleanFeedback({ kind: 'idea', text: ' ok ' }), null);
  const m = cleanFeedback({ kind: 'bug', text: '  La carte\nne charge pas  ', contact: 'moi@exemple.fr\n', src: 'app', version: '1.27.42', os: 'win', lang: 'en' });
  assert.deepEqual(m, { kind: 'bug', text: 'La carte\nne charge pas', contact: 'moi@exemple.fr', src: 'app', version: '1.27.42', os: 'win', lang: 'en' });
  assert.equal(cleanFeedback({ kind: 'idea', text: 'x'.repeat(5000) }).text.length, 2000);
  assert.equal(cleanFeedback({ kind: 'idea', text: 'Une idée', src: 'ailleurs' }).src, 'site');
});

test('messages reçus, limités par adresse, lus puis supprimés dans le Studio', async () => {
  const env = { DB: fakeD1() };
  assert.equal((await feedbackPost(post({ kind: 'question', text: '?' }), env)).status, 400);
  const ok = await feedbackPost(post({ kind: 'question', text: 'Ça marche sur Mac ?', contact: 'Léa' }), env, { now: 1000 });
  assert.equal(ok.status, 200);
  for (let i = 1; i < 10; i++) await feedbackPost(post({ kind: 'idea', text: `Idée numéro ${i}` }), env, { now: 1000 + i });
  assert.equal((await feedbackPost(post({ kind: 'idea', text: 'Une de trop' }), env, { now: 2000 })).status, 429);
  assert.equal((await feedbackPost(post({ kind: 'idea', text: 'Autre adresse' }, '5.6.7.8'), env)).status, 200);

  const api = (path, method = 'GET', body) => feedbackApi(path, new Request(`https://paddocklive.app/studio/api/${path}`, { method, body: body && JSON.stringify(body) }), env).then((r) => r.json());
  const { items } = await api('feedback');
  assert.equal(items.length, 11);
  assert.ok(items.every((m) => m.seen === 0));
  const first = items.find((m) => m.contact === 'Léa');
  assert.equal(first.kind, 'question');
  await api('feedback/seen', 'POST');
  assert.ok((await api('feedback')).items.every((m) => m.seen === 1));
  await api('feedback/remove', 'POST', { id: first.id });
  assert.equal((await api('feedback')).items.length, 10);
  assert.equal(await feedbackApi('autre', new Request('https://x/'), env), null);
});

test('appli : message relayé avec la version et le système', async () => {
  let got;
  const r = await sendFeedback({ kind: 'idea', text: 'Un mode sombre plus foncé', contact: '', lang: 'fr', version: 'truquée' }, {
    url: 'https://exemple.test/f',
    send: async (url, opts) => { got = { url, body: JSON.parse(opts.body) }; return { status: 200, body: Buffer.from('{"ok":true}') }; },
  });
  assert.deepEqual(r, { status: 200, data: { ok: true } });
  assert.equal(got.url, 'https://exemple.test/f');
  assert.equal(got.body.src, 'app');
  assert.notEqual(got.body.version, 'truquée');
  const down = await sendFeedback({ kind: 'idea', text: 'Bonjour' }, { send: async () => ({ status: 502, body: Buffer.from('<html>') }) });
  assert.equal(down.status, 502);
});
