import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFeedback, feedbackPost, feedbackApi, feedbackFile } from '../analytics/feedback.js';
import { sendFeedback, sendFeedbackFile } from '../server/stats.js';

// Base D1 réduite aux requêtes des messages et des pièces jointes (et à la liste vide des téléphones abonnés)
function fakeD1() {
  const rows = []; const sent = new Map(); const ups = new Map(); const files = [];
  let id = 0;
  return {
    rows, files,
    prepare(sql) {
      const st = (a) => ({
        async first() {
          if (sql.startsWith('SELECT v FROM studio')) return null;
          if (sql.startsWith('SELECT n FROM feedback_new')) return sent.has(`${a[0]}|${a[1]}`) ? { n: sent.get(`${a[0]}|${a[1]}`) } : null;
          if (sql.startsWith('INSERT INTO feedback ')) {
            const [at, kind, text, contact, src, version, os, lang] = a;
            rows.push({ id: ++id, at, kind, text, contact, src, version, os, lang, seen: 0 });
            return { id };
          }
          if (sql.startsWith('SELECT tok, files, at FROM feedback_up')) return ups.get(a[0]) || null;
          if (sql.startsWith('SELECT 1 AS x FROM feedback_files')) return files.find((x) => x.msg === a[0] && x.n === a[1]) ? { x: 1 } : null;
          if (sql.startsWith('SELECT SUM(LENGTH(data))')) return files.length ? { t: files.reduce((t, x) => t + x.data.byteLength, 0), old: Math.min(...files.map((x) => x.msg)) } : { t: null, old: null };
          throw new Error(`requête inattendue : ${sql}`);
        },
        async all() {
          if (sql.startsWith('SELECT id, at, kind')) return { results: [...rows].sort((x, y) => y.at - x.at) };
          if (sql.startsWith('SELECT msg, n, type, size FROM feedback_files')) return { results: files.filter((x) => x.part === 0).map(({ msg, n, type, size }) => ({ msg, n, type, size })) };
          if (sql.startsWith('SELECT type, data FROM feedback_files')) return { results: files.filter((x) => x.msg === a[0] && x.n === a[1]).sort((x, y) => x.part - y.part).map(({ type, data }) => ({ type, data: [...new Uint8Array(data)] })) };
          throw new Error(`requête inattendue : ${sql}`);
        },
        async run() {
          const drop = (keep) => files.splice(0, files.length, ...files.filter(keep));
          if (sql.startsWith('INSERT INTO feedback_new')) sent.set(`${a[0]}|${a[1]}`, (sent.get(`${a[0]}|${a[1]}`) || 0) + 1);
          else if (sql.startsWith('INSERT INTO feedback_up')) ups.set(a[0], { tok: a[1], files: a[2], at: a[3] });
          else if (sql.startsWith('INSERT INTO feedback_files')) { const [msg, n, part, type, size, data] = a; files.push({ msg, n, part, type, size, data }); }
          else if (sql.startsWith('DELETE FROM feedback WHERE id NOT IN')) { /* moins de 500 messages */ }
          else if (sql.startsWith('DELETE FROM feedback_files WHERE msg NOT IN')) drop((x) => rows.some((r) => r.id === x.msg));
          else if (sql.startsWith('DELETE FROM feedback_files WHERE msg = ?')) drop((x) => x.msg !== a[0]);
          else if (sql.startsWith('DELETE FROM feedback_up')) { for (const [k, v] of ups) if (sql.includes('msg = ?') ? k === a[0] : v.at < a[0]) ups.delete(k); }
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
  assert.deepEqual(m, { kind: 'bug', text: 'La carte\nne charge pas', contact: 'moi@exemple.fr', src: 'app', version: '1.27.42', os: 'win', lang: 'en', files: 0 });
  assert.equal(cleanFeedback({ kind: 'idea', text: 'Avec captures', files: 9 }).files, 3);
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

test('pièces jointes : jeton du message, formats et tailles, morceaux recollés dans le Studio', async () => {
  const env = { DB: fakeD1() };
  const r = await (await feedbackPost(post({ kind: 'bug', text: 'La carte se fige', files: 2 }), env, { now: 5000 })).json();
  assert.ok(r.id && r.up);
  const send = (q, body, type, now = 6000) => {
    const url = new URL(`https://paddocklive.app/f/file?${new URLSearchParams(q)}`);
    return feedbackFile(new Request(url, { method: 'POST', body, headers: { 'Content-Type': type } }), env, url, { now });
  };
  const big = new Uint8Array(2.5e6).map((_, i) => i % 251);
  assert.equal((await send({ id: r.id, up: 'faux', n: 0 }, big, 'video/mp4')).status, 403);
  assert.equal((await send({ id: r.id, up: r.up, n: 0 }, big, 'image/svg+xml')).status, 415);
  assert.equal((await send({ id: r.id, up: r.up, n: 0 }, new Uint8Array(9e6), 'image/png')).status, 413);
  assert.equal((await send({ id: r.id, up: r.up, n: 2 }, big, 'video/mp4')).status, 400);
  assert.equal((await send({ id: r.id, up: r.up, n: 0 }, big, 'video/mp4', 5000 + 3601e3)).status, 403);
  assert.equal((await send({ id: r.id, up: r.up, n: 0 }, big, 'video/mp4')).status, 200);
  assert.equal(env.DB.files.length, 3);   // 2,5 Mo en morceaux de 1 Mo
  assert.equal((await send({ id: r.id, up: r.up, n: 0 }, big, 'video/mp4')).status, 409);
  assert.equal((await send({ id: r.id, up: r.up, n: 1 }, new Uint8Array([1, 2, 3]), 'image/jpeg')).status, 200);

  const studio = (path) => { const url = new URL(`https://paddocklive.app/studio/api/${path}`); return feedbackApi(path.split('?')[0], new Request(url), env, url); };
  const { items } = await (await studio('feedback')).json();
  assert.deepEqual(items[0].files, [{ n: 0, type: 'video/mp4', size: 2.5e6 }, { n: 1, type: 'image/jpeg', size: 3 }]);
  const res = await studio(`feedback/file?msg=${r.id}&n=0`);
  assert.equal(res.headers.get('Content-Type'), 'video/mp4');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), big);
  assert.equal((await studio(`feedback/file?msg=${r.id}&n=7`)).status, 404);
  await feedbackApi('feedback/remove', new Request('https://x/', { method: 'POST', body: JSON.stringify({ id: r.id }) }), env);
  assert.equal(env.DB.files.length, 0);
});

test('appli : pièce jointe relayée telle quelle avec son jeton', async () => {
  let got;
  const r = await sendFeedbackFile(new URLSearchParams({ id: '4', up: 'abc', n: '1', autre: 'x' }), 'image/png', Buffer.from([1, 2]), {
    url: 'https://exemple.test/f',
    send: async (url, opts) => { got = { url, opts }; return { status: 200, body: Buffer.from('{"ok":true}') }; },
  });
  assert.deepEqual(r, { status: 200, data: { ok: true } });
  assert.equal(got.url, 'https://exemple.test/f/file?id=4&up=abc&n=1');
  assert.equal(got.opts.headers['Content-Type'], 'image/png');
  assert.equal(got.opts.headers['Content-Length'], 2);
});
