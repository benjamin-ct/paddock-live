// Liens suivis des posts : réécriture des textes, redirection /go/ avec comptage, statistiques
import test from 'node:test';
import assert from 'node:assert/strict';
import { trackText, linksIn, GO } from '../shared/track-links.js';
import { trackPost, go, clickStats } from '../analytics/clicks.js';

// Base D1 réduite aux deux tables des liens
function fakeDB() {
  const links = new Map();
  const clicks = new Map();
  return {
    links, clicks,
    prepare(sql) {
      let a = [];
      const st = {
        bind(...x) { a = x; return st; },
        async first() { return links.has(a[0]) ? { url: links.get(a[0]).url } : null; },
        async run() {
          const k = a.slice(0, 5).join('|');
          clicks.set(k, (clicks.get(k) || 0) + 1);
          return {};
        },
        async all() {
          return { results: [...clicks].map(([k, n]) => { const [day, id, net, country, device] = k.split('|'); return { day, id, net, country, device, n, url: links.get(id)?.url, title: links.get(id)?.title }; }).filter((r) => r.day >= a[0]) };
        },
        sql,
        args: () => a,
      };
      return st;
    },
    async batch(list) { for (const st of list) { const [id, url, title, at] = st.args(); links.set(id, { url, title: title || links.get(id)?.title || '', at }); } },
  };
}
const req = (path, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)') => Object.assign(new Request(`https://paddocklive.app${path}`, { headers: { 'User-Agent': ua } }), { cf: { country: 'FR' } });

test('liens suivis : adresses remplacées par réseau, ponctuation finale gardée', async () => {
  const { text, links } = await trackText('🔗 Lire l\'article : https://a.test/x?y=1.\nVoir https://a.test/x?y=1/plus', 'threads');
  assert.equal(links.length, 2);
  assert.match(text, /^🔗 Lire l'article : https:\/\/paddocklive\.app\/go\/[\w-]{8}t\.\nVoir https:\/\/paddocklive\.app\/go\/[\w-]{8}t$/);
  assert.notEqual(text.split('\n')[0].slice(-10), text.split('\n')[1].slice(-9));
  assert.deepEqual(linksIn(text), [], 'liens déjà suivis : pas réécrits');
  assert.equal((await trackText('Sans lien #F1', 'x')).text, 'Sans lien #F1');
});

test('liens suivis : enregistrés à la publication, clic compté puis renvoi, robots ignorés', async () => {
  const env = { DB: fakeDB() };
  const out = await trackPost(env, 'bluesky', { text: 'Titre https://media.test/article', comment: '' }, 'Norris prolonge');
  const code = out.text.slice(out.text.indexOf(GO) + GO.length);
  assert.match(code, /^[\w-]{8}b$/);
  assert.deepEqual([...env.DB.links.values()].map((l) => [l.url, l.title]), [['https://media.test/article', 'Norris prolonge']]);
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const r = await go(req(`/go/${code}`), env, ctx, code);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://media.test/article');
  await go(req(`/go/${code}`, 'Mozilla/5.0 (Windows NT 10.0)'), env, ctx, code);
  await go(req(`/go/${code}`, 'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1)'), env, ctx, code);   // aperçu du lien
  await Promise.all(waits);
  assert.equal(waits.length, 2);
  assert.equal((await go(req('/go/inconnu00b'), env, ctx, 'inconnu00b')).status, 404);
  const s = await clickStats(env);
  assert.equal(s.links.length, 1);
  assert.deepEqual([s.links[0].title, s.links[0].total, s.links[0].nets, s.links[0].devices, s.links[0].countries], ['Norris prolonge', 2, { bluesky: 2 }, { mobile: 1, desktop: 1 }, { FR: 2 }]);
});

test('liens suivis : base indisponible, textes publiés tels quels', async () => {
  const env = { DB: { batch: async () => { throw new Error('D1'); } } };
  assert.deepEqual(await trackPost(env, 'x', { text: 'https://a.test', comment: 'c' }), { text: 'https://a.test', comment: 'c' });
});
