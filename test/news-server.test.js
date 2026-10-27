import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsTick, newsApi, editSources, newsSources } from '../analytics/news.js';

const rss = (items) => `<?xml version="1.0"?><rss><channel><language>en</language>${items.map(([title, link, date]) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><description>${title}, details.</description></item>`).join('')}</channel></rss>`;
const para = (n) => `Phrase numéro ${n} de l'article, assez longue pour être gardée comme un vrai paragraphe du texte lisible.`;

function fakeEnv() {
  const rows = new Map();
  return {
    rows,
    DB: { prepare: (sql) => ({ bind: (...a) => ({
      first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
      run: async () => { rows.set(a[0], a[1]); return {}; },
      all: async () => ({ results: [] }),   // pas de titre traduit connu
    }) }) },
  };
}

test('serveur : actualités lues source par source, regroupées par sujet, mode lecture et sources du Studio', async () => {
  const env = fakeEnv();
  const now = Date.parse('2026-10-27T12:00:00Z');
  const date = 'Tue, 27 Oct 2026 11:00:00 GMT';
  const fetchFn = async (u) => {
    if (u === 'https://www.formula1.com/en/latest/all.xml') return new Response(rss([['Norris takes pole in Mexico City Grand Prix qualifying', 'https://f1.test/pole', date]]));
    if (u === 'https://www.fia.com/rss/press-release') return new Response(rss([['F1: Norris takes Mexico City pole in qualifying', 'https://fia.test/pole', date], ['WEC news', 'https://fia.test/wec', date]]));
    if (u === 'https://f1.test/pole') return new Response(`<article>${[1, 2, 3, 4, 5, 6].map((n) => `<p>${para(n)}</p>`).join('')}</article>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (u === 'https://blog.test/rss') return new Response(rss([['Blog post', 'https://blog.test/1', date]]).replace('<channel>', '<channel><title>Blog F1</title>'));
    return new Response('', { status: 404 });
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  try {
    const r = await newsTick(env, { now, fetchFn });
    assert.equal(r.sources, 8);
    assert.equal(r.added, 2, 'article sans rapport avec la F1 écarté (source filtrée)');
    assert.equal(await newsTick(env, { now: now + 1000, fetchFn }).then((x) => x.added), 0, 'sources suivantes : rien de neuf');

    const list = await (await newsApi(new Request('https://x/news/api'), env, new URL('https://x/news/api'), { now, fetchFn })).json();
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].cluster, list.items[1].cluster, 'même sujet, deux sources');
    assert.equal(list.items[0].sources, 2);
    assert.deepEqual(list.items.find((it) => it.src === 'f1').tags.includes('NOR'), true);
    const f1 = list.sources.find((s) => s.id === 'f1');
    assert.equal(f1.ok, true);
    assert.equal(f1.count, 1);
    assert.equal(list.sources.find((s) => s.id === 'yt-UCB_qr75-ydFVKSF9Dmo6izg').ok, false, 'source en panne signalée');
    assert.equal(list.sources.at(-1).ok, null, 'pas encore lue');

    const art = (u) => newsApi(new Request(`https://x/news/api/article?u=${encodeURIComponent(u)}`), env, new URL(`https://x/news/api/article?u=${encodeURIComponent(u)}`), { now, fetchFn });
    const a = await (await art('https://f1.test/pole')).json();
    assert.equal(a.readable, true);
    assert.equal(a.blocks.length, 6);
    assert.equal((await art('http://127.0.0.1/admin')).status, 404, 'seulement les liens des actualités');

    // Studio : source en plus, lue avec les autres, puis retirée avec ses nouvelles
    const added = await editSources(env, { add: 'https://blog.test/rss', cat: 'team' }, { fetchFn });
    assert.equal(added.source.name, 'Blog F1');
    assert.equal(added.source.cat, 'team');
    await assert.rejects(editSources(env, { add: 'https://blog.test/rss' }, { fetchFn }), /déjà présente/);
    await assert.rejects(editSources(env, { add: 'https://127.0.0.1/rss' }, { fetchFn }), /invalide/);
    const rt = JSON.parse(env.rows.get('news:rt'));
    for (const src of await newsSources(env)) if (src.id !== added.source.id) rt[src.id] = { ...rt[src.id], nextAt: now + 3600e3 };
    env.rows.set('news:rt', JSON.stringify(rt));
    assert.equal((await newsTick(env, { now: now + 2000, fetchFn })).added, 1, 'seule la nouvelle source est lue');
    await editSources(env, { remove: added.source.id });
    assert.equal(JSON.parse(env.rows.get('news:items')).some((it) => it.src === added.source.id), false);
  } finally {
    delete globalThis.caches;
  }
});
