// Liens suivis des posts : réécriture des textes, redirection /go/ avec comptage, statistiques
import test from 'node:test';
import assert from 'node:assert/strict';
import { trackText, linksIn, GO, SITE, linkId } from '../shared/track-links.js';
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
  // Lien court : https://paddocklive.app/ + 6 lettres ou chiffres (dont une majuscule ou un chiffre) + réseau
  assert.match(text, /^🔗 Lire l'article : https:\/\/paddocklive\.app\/[A-Za-z0-9]{6}t\.\nVoir https:\/\/paddocklive\.app\/[A-Za-z0-9]{6}t$/);
  assert.notEqual(text.split('\n')[0].slice(-8), text.split('\n')[1].slice(-7));
  assert.deepEqual(linksIn(text), [], 'liens déjà suivis : pas réécrits');
  assert.deepEqual(linksIn(`${GO}abcdefgh_t et https://paddocklive.app/download`), ['https://paddocklive.app/download'], 'anciens liens suivis ignorés, pages du site suivies');
  for (const u of ['https://a.test/1', 'https://a.test/2', 'https://a.test/3']) assert.match(await linkId(u), /^(?=.*[A-Z0-9])[A-Za-z0-9]{6}$/);
  assert.equal((await trackText('Sans lien #F1', 'x')).text, 'Sans lien #F1');
});

test('liens suivis : enregistrés à la publication, clic compté puis renvoi, robots ignorés', async () => {
  const env = { DB: fakeDB() };
  const out = await trackPost(env, 'bluesky', { text: 'Titre https://media.test/article', comment: '' }, 'Norris prolonge');
  const code = out.text.slice(out.text.indexOf(SITE) + SITE.length);
  assert.match(code, /^[A-Za-z0-9]{6}b$/);
  assert.deepEqual([...env.DB.links.values()].map((l) => [l.url, l.title]), [['https://media.test/article', 'Norris prolonge']]);
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const r = await go(req(`/${code}`), env, ctx, code);
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
  // Ancien lien (/go/<8 caractères><réseau>) toujours valable
  env.DB.links.set('Ab-cd_12', { url: 'https://media.test/ancien', title: '' });
  assert.equal((await go(req('/go/Ab-cd_12x'), env, ctx, 'Ab-cd_12x')).headers.get('Location'), 'https://media.test/ancien');
});

test('pages de liens en bio : clic compté puis renvoi vers le réseau, lien interne ou inconnu refusé', async () => {
  const env = { DB: fakeDB() };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const r = await go(req('/go/benjy/instagram'), env, ctx, 'benjy/instagram');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://www.instagram.com/benjypaddock/');
  assert.equal((await go(req('/go/liens/other'), env, ctx, 'liens/other')).status, 404);
  assert.equal((await go(req('/go/inconnue/x'), env, ctx, 'inconnue/x')).status, 404);
  await Promise.all(waits);
  const s = await clickStats(env);
  assert.deepEqual([s.links[0].title, s.links[0].url, s.links[0].total], ['Benjy Paddock (page de liens) · Instagram', 'https://www.instagram.com/benjypaddock/', 1]);
});

test('liens suivis : base indisponible, textes publiés tels quels', async () => {
  const env = { DB: { batch: async () => { throw new Error('D1'); } } };
  assert.deepEqual(await trackPost(env, 'x', { text: 'https://a.test', comment: 'c' }), { text: 'https://a.test', comment: 'c' });
});
