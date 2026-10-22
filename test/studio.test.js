import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-studio-'));
// Code d'essai (le vrai code n'est jamais dans le dépôt) : son empreinte remplace celle du créateur
const CODE = 'ESSAI-42';
const HASH = (await import('node:crypto')).createHash('sha256').update(`paddock-live:${CODE}`).digest('hex');
process.env.PADDOCK_CREATOR_HASH = HASH;
const { studioApi, freshF1tv, runSchedule, schedInternal, seasonRow } = await import('../analytics/studio.js');
const { studioKey, enableStudio, syncStudio, disableStudio, studioInfo, studioRewrite } = await import('../server/studio-sync.js');
const { saveConfig, getConfig } = await import('../server/config.js');
const { timing } = await import('../shared/meta-publish.js');

// Base D1 réduite aux requêtes de la page du créateur
function fakeDB() {
  const studio = new Map();
  const fails = new Map();
  const db = {
    studio, fails,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (/FROM studio WHERE k/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null;
          if (/FROM studio_fail/.test(sql)) return fails.has(`${args[0]}|${args[1]}`) ? { n: fails.get(`${args[0]}|${args[1]}`) } : null;
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async all() {
          if (/^SELECT k, v FROM studio WHERE k LIKE \?$/.test(sql)) return { results: [...studio].filter(([k]) => k.startsWith(args[0].replace(/%$/, ''))).map(([k, v]) => ({ k, v })) };
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio \(.*DO NOTHING$/.test(sql)) { if (studio.has(args[0])) return { meta: { changes: 0 } }; studio.set(args[0], args[1]); return { meta: { changes: 1 } }; }
          if (/^UPDATE studio SET v = \?, at = \? WHERE k = \? AND v = \?$/.test(sql)) { if (studio.get(args[2]) !== args[3]) return { meta: { changes: 0 } }; studio.set(args[2], args[0]); return { meta: { changes: 1 } }; }
          if (/^INSERT INTO studio \(/.test(sql)) studio.set(args[0], args[1]);
          else if (/^INSERT INTO studio_fail/.test(sql)) fails.set(`${args[0]}|${args[1]}`, (fails.get(`${args[0]}|${args[1]}`) || 0) + 1);
          else if (/^DELETE FROM studio$/.test(sql)) studio.clear();
          else if (/^DELETE FROM studio WHERE k LIKE \?$/.test(sql)) { for (const k of [...studio.keys()]) if (k.startsWith(args[0].replace(/%$/, ''))) studio.delete(k); }
          else throw new Error(`SQL inattendu : ${sql}`);
          return {};
        },
      };
      return st;
    },
  };
  return db;
}
globalThis.caches = { default: { match: async () => null, put: async () => {} } };

// Stockage R2 (visuels et vidéos des publications programmées)
function fakeR2() {
  const objs = new Map();
  return {
    objs,
    put: async (k, v, o) => { objs.set(k, { bytes: new Uint8Array(await new Response(v).arrayBuffer()), type: o?.httpMetadata?.contentType }); },
    get: async (k) => (objs.has(k) ? { arrayBuffer: async () => objs.get(k).bytes.slice().buffer, httpMetadata: { contentType: objs.get(k).type } } : null),
    delete: async (k) => { [k].flat().forEach((x) => objs.delete(x)); },
  };
}
const env = { DB: fakeDB(), MEDIA: fakeR2(), STUDIO_CODE_HASH: HASH, STATS_KEY: 'secret-du-serveur' };
const worker = (url, init) => studioApi(new Request(url, init), env, new URL(url));

test('page du créateur : clé dérivée identique dans l\'appli et dans le navigateur (PBKDF2)', async () => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('ABC123'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('paddock-live-studio'), iterations: 200000, hash: 'SHA-256' }, base, 256);
  assert.equal(Buffer.from(bits).toString('base64url'), studioKey(' abc123 '));
});

test('page du créateur : code faux refusé, clé inconnue refusée, page non activée', async () => {
  let r = await worker('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ code: 'MAUVAIS', key: studioKey('MAUVAIS') }) });
  assert.equal(r.status, 401);
  r = await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey('X') } });
  assert.equal(r.status, 409);   // rien d'activé
  r = await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': 'court' } });
  assert.equal(r.status, 401);
  assert.equal([...env.DB.fails.values()][0], 2);
});

test('page du créateur : coffre chiffré, sans le code rien n\'est lisible', async () => {
  saveConfig({ creator: true, social: { meta: { appSecret: 'secret-app', pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, threads: { token: 'jeton-th', userId: 't1', username: 'moi', appSecret: 'secret-th' } } });
  const fetchFn = (url, init) => worker(url, init);
  const info = await enableStudio(CODE, { fetchFn });
  assert.equal(info.enabled, true);
  const sealed = env.DB.studio.get('vault');
  for (const s of ['jeton-page', 'jeton-th', 'secret-app', 'secret-th']) assert.ok(!sealed.includes(s));
  const me = await (await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey(CODE) } })).json();
  assert.equal(me.facebook, 'Ma page');
  assert.equal(me.instagram, '@moi');
  assert.ok(me.sources.length > 10);
  assert.equal(JSON.stringify(me).includes('jeton'), false);
  // Jeton changé dans l'appli : nouvel envoi
  saveConfig({ social: { ...getConfig().social, threads: { token: 'jeton-th-2', userId: 't1', username: 'moi2' } } });
  assert.equal(await syncStudio({ fetchFn }), true);
  assert.equal(await syncStudio({ fetchFn }), false);   // rien de nouveau
  const me2 = await (await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey(CODE) } })).json();
  assert.equal(me2.threads, '@moi2');

  // Publication sur Facebook : progression puis lien
  const realFetch = globalThis.fetch;
  let refuse = false;
  Object.assign(timing, { poll: 1, maxPoll: 1, visible: [] });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname.endsWith('/photos')) return ok({ id: 'ph1' });
    if (u.searchParams.get('fields') === 'images') return ok({ images: [{ width: 1080, source: 'https://cdn.test/a.jpg' }] });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'p1_42' });
    if (u.pathname.endsWith('/comments')) return refuse ? new Response(JSON.stringify({ error: { message: '(#200) Permissions error' } }), { status: 403 }) : ok({ id: 'c1' });
    return realFetch(url, opts);
  };
  try {
    const form = new FormData();
    form.append('network', 'facebook');
    form.append('text', 'Bonjour');
    form.append('images', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], { type: 'image/jpeg' }), 'a.jpg');
    form.append('comment', "Lire l'article : https://a.test/x");
    const send = async () => {
      const r = await worker('https://s.test/studio/api/publish', { method: 'POST', body: form, headers: { 'X-Studio-Key': studioKey(CODE) } });
      return (await r.text()).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
    };
    assert.deepEqual(await send(), { done: true, url: 'https://www.facebook.com/p1_42', id: 'p1_42', comment: true, commentError: null });
    // Commentaire refusé (permission manquante) : le post est publié quand même, avec la raison
    refuse = true;
    const r2 = await send();
    assert.equal(r2.done, true);
    assert.equal(r2.comment, false);
    assert.match(r2.commentError, /Permissions error.*permission manquante/);
  } finally { globalThis.fetch = realFetch; }

  await disableStudio({ fetchFn });
  assert.equal(studioInfo().enabled, false);
  assert.equal(env.DB.studio.size, 0);
});

test('page du créateur : relais limités (sources connues, archives F1, images F1 et drapeaux)', async () => {
  // Activation directe (sans code réel) pour essayer les relais : vérificateur d'une clé de test
  const key = studioKey('TEST');
  const raw = Buffer.from(key, 'base64url');
  env.DB.studio.set('verifier', Buffer.from(await crypto.subtle.digest('SHA-256', raw)).toString('hex'));
  const h = { headers: { 'X-Studio-Key': key } };
  assert.equal((await worker('https://s.test/studio/api/feed?id=inconnu', h)).status, 404);
  assert.equal((await worker('https://s.test/studio/api/archive?p=../../etc/passwd', h)).status, 400);
  assert.equal((await worker('https://s.test/studio/api/archive?p=2026/x/../y/Index.json', h)).status, 400);
  // Archives refusées sans connexion F1 TV (401 depuis octobre 2026) ou pas encore publiées : raison précise
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response('', { status: String(url).includes('/2026/') ? 404 : 401 });
  try {
    let r = await worker('https://s.test/studio/api/archive?p=2025/Index.json', h);
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /réservées aux abonnés F1 TV/);
    r = await worker('https://s.test/studio/api/archive?p=2026/Index.json', h);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'Archive pas encore publiée');
  } finally { globalThis.fetch = realFetch; }
  assert.equal((await worker(`https://s.test/studio/api/img?u=${encodeURIComponent('https://evil.test/a.png')}`, h)).status, 400);
  assert.equal((await worker('https://s.test/studio/api/publish', { method: 'POST', body: new FormData(), ...h })).status, 409);   // pas de comptes
});

const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

test('page du créateur : connexion F1 TV renouvelée par le serveur (appli fermée)', async () => {
  const now = Date.UTC(2026, 9, 16);
  const session = jwt({ exp: now / 1000 + 20 * 86400 });
  const old = jwt({ exp: now / 1000 + 3600, SessionId: session });
  const next = jwt({ exp: now / 1000 + 4 * 86400, SessionId: session });
  let asked = null;
  const fetchFn = async (url, init) => { asked = init.headers['cd-sessionid']; return new Response(JSON.stringify({ data: { subscriptionToken: next } }), { status: 200 }); };
  assert.equal(await freshF1tv(old, { now, fetchFn }), next);
  assert.equal(asked, session);
  // Encore valable plus de 24 h : rien demandé ; refus de la F1 : ancien jeton gardé
  asked = null;
  assert.equal(await freshF1tv(next, { now, fetchFn }), next);
  assert.equal(asked, null);
  assert.equal(await freshF1tv(old, { now, fetchFn: async () => new Response('{}', { status: 401 }) }), old);
});

test('page du créateur : journal des publications partagé et news déjà publiées reconnues', async () => {
  const { addEntry, postedEntry, mergeHistory } = await import('../shared/post-history.js');
  const key = studioKey('TEST');
  const h = { 'X-Studio-Key': key };
  const now = Date.now();
  const entry = { key: 'news:1', at: now, kind: 'news', title: 'Haas engage Câmara', srcTitle: 'Haas sign Ferrari junior Rafael Camara for 2027', link: 'https://f1.test/a', nets: { instagram: { id: '17', url: 'https://www.instagram.com/p/x' } } };
  await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry }) });
  // Même publication complétée par un autre réseau : une seule entrée
  const r = await (await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry: { ...entry, nets: { bluesky: { id: { uri: 'at://x', cid: 'c' }, url: 'https://bsky.app/profile/a/post/b' } } } }) })).json();
  assert.equal(r.items.length, 1);
  assert.deepEqual(Object.keys(r.items[0].nets).sort(), ['bluesky', 'instagram']);
  const list = r.items;
  // Même sujet, autre média et autre langue ; autre sujet ; trop ancien
  assert.ok(postedEntry({ title: "Rafael Câmara s'engage avec Haas pour 2027", t: now, link: 'https://l.test/b' }, list));
  assert.equal(postedEntry({ title: 'Mekies extends Red Bull contract', t: now }, list), null);
  assert.equal(postedEntry({ title: 'Câmara joins Haas', t: now + 5 * 86400e3 }, list), null);
  assert.ok(postedEntry({ title: 'Autre titre', t: now, link: 'https://f1.test/a' }, list));
  // Entrée invalide ignorée ; fusion appli + page web sans doublon
  assert.equal(addEntry(list, { key: 'x', nets: {} }).length, 1);
  assert.equal(mergeHistory(list, list, [{ ...entry, key: 'news:2' }]).length, 2);
  // Même news republiée sur Instagram (autre post) : entrée à part, le premier post et ses chiffres gardés ;
  // les autres réseaux de ce nouvel envoi la complètent, et la fusion appli + page web ne la double pas
  let repub = addEntry(list, { ...entry, at: now + 1000, nets: { instagram: { id: '99', url: 'https://www.instagram.com/p/y' } } });
  repub = addEntry(repub, { ...entry, at: now + 2000, nets: { facebook: { id: 'p_1', url: 'https://www.facebook.com/p_1' } } });
  assert.equal(repub.length, 2);
  assert.equal(repub.find((e) => e.key === 'news:1').nets.instagram.id, '17');
  assert.deepEqual(Object.keys(repub[0].nets).sort(), ['facebook', 'instagram']);
  assert.match(repub[0].key, /^news:1~/);
  assert.equal(mergeHistory(repub, repub).length, 2);
  // Post supprimé sur les réseaux : retiré du journal, sa clé gardée pour que l'appli ne le renvoie pas
  const rm = await (await worker('https://s.test/studio/api/history/remove', { method: 'POST', headers: h, body: JSON.stringify({ key: 'news:1' }) })).json();
  assert.deepEqual(rm.items, []);
  assert.deepEqual(rm.removed, ['news:1']);
  assert.equal((await worker('https://s.test/studio/api/history/remove', { method: 'POST', headers: h, body: JSON.stringify({ key: '' }) })).status, 400);
  const got = await (await worker('https://s.test/studio/api/history', { headers: h })).json();
  assert.deepEqual(got.removed, ['news:1']);
  const { withoutRemoved, removeEntry } = await import('../shared/post-history.js');
  assert.deepEqual(withoutRemoved(mergeHistory(list, [{ ...entry, key: 'news:2' }]), got.removed).map((e) => e.key), ['news:2']);
  assert.deepEqual(removeEntry(list, ['a'], 'news:1').removed, ['news:1', 'a']);
  // Même post republié : il compte de nouveau
  await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry }) });
  const again = await (await worker('https://s.test/studio/api/history', { headers: h })).json();
  assert.deepEqual([again.items.length, again.removed], [1, []]);
});

test('page du créateur : relais des documents de la FIA limité aux pages F1 et aux PDF des commissaires', async () => {
  const fia = (p) => worker(`https://s.test/studio/api/fia?p=${encodeURIComponent(p)}`, { headers: { 'X-Studio-Key': studioKey('TEST') } });
  for (const bad of ['/user/login', '/documents/championships/fia-formula-e-world-championship-1', '/system/files/decision-document/../x.pdf', 'https://evil.example/x.pdf']) {
    assert.equal((await fia(bad)).status, 400, bad);
  }
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }); };
  try {
    const r = await fia('/system/files/decision-document/2026_azerbaijan_grand_prix_-_final_starting_grid.pdf');
    assert.equal(r.status, 200);
    assert.equal((await fia('/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072/event/Azerbaijan%20Grand%20Prix')).status, 200);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(asked, ['https://www.fia.com/system/files/decision-document/2026_azerbaijan_grand_prix_-_final_starting_grid.pdf', 'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072/event/Azerbaijan%20Grand%20Prix']);
});

test("page du créateur : relais des pages d'articles (résumé détaillé) en texte brut, adresses sûres seulement", async () => {
  const page = (u) => worker(`https://s.test/studio/api/page?u=${encodeURIComponent(u)}`, { headers: { 'X-Studio-Key': studioKey('TEST') } });
  for (const bad of ['http://www.formula1.com/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://user:pw@www.formula1.com/a', 'https://www.formula1.com:8443/a', 'file:///etc/passwd', 'pas une adresse']) {
    assert.equal((await page(bad)).status, 400, bad);
  }
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('<html><p>Été</p></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); };
  try {
    const r = await page('https://www.formula1.com/en/latest/article/hamilton.1234');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'text/plain; charset=utf-8');   // jamais servie comme une page du serveur
    assert.equal(await r.text(), '<html><p>Été</p></html>');
  } finally { globalThis.fetch = real; }
  assert.deepEqual(asked, ['https://www.formula1.com/en/latest/article/hamilton.1234']);
  assert.equal((await worker('https://s.test/studio/api/page?u=https%3A%2F%2Fwww.formula1.com%2Fa')).status, 401);
});

test('page du créateur : publication programmée, publiée par le serveur à l\'heure (un réseau par passage, stories par lots)', async () => {
  saveConfig({ creator: true, social: { meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' } } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const at = Date.now() + 3600e3;
  const jpeg = (n) => new Blob([new Uint8Array(n).fill(7).map((x, i) => (i < 3 ? [0xff, 0xd8, 0xff][i] : x))], { type: 'image/jpeg' });
  const form = (o = {}) => {
    const f = new FormData();
    f.append('at', String(o.at ?? at));
    f.append('title', 'Résultats');
    f.append('record', JSON.stringify({ key: 'race-2026-18', kind: 'race', title: 'Résultats' }));
    f.append('posts', JSON.stringify(o.posts ?? [{ network: 'facebook', text: 'Bonjour', comment: 'Lien' }, { network: 'bluesky', text: 'Salut' }]));
    f.append('ig', jpeg(1.2e6), 'a.jpg');
    f.append('ig', jpeg(10), 'b.jpg');
    f.append('x', jpeg(10), 'c.jpg');
    for (let i = 0; i < (o.more || 0); i++) f.append('ig', jpeg(10), `d${i}.jpg`);
    return f;
  };
  const add = async (o) => worker('https://s.test/studio/api/schedule', { method: 'POST', body: form(o), headers: key });
  // Refus : date passée, réseau non connecté, sans la clé
  assert.equal((await add({ at: Date.now() - 3600e3 })).status, 400);
  assert.equal((await add({ posts: [{ network: 'threads', text: 'x' }] })).status, 409);
  assert.equal((await worker('https://s.test/studio/api/schedule', { method: 'POST', body: form() })).status, 401);
  const r = await add();
  assert.equal(r.status, 200);
  const { item } = await r.json();
  assert.deepEqual(item.nets, { facebook: { status: 'pending' }, bluesky: { status: 'pending' } });
  // Jetons chiffrés avec le secret du serveur : absents de la base en clair
  const rows = [...env.DB.studio].filter(([k]) => k.startsWith('sched'));
  assert.ok(rows.length >= 1);
  // Visuels dans le stockage R2, pas dans la base
  assert.deepEqual([...env.MEDIA.objs.keys()].filter((k) => k.startsWith(`sched/${item.id}/`)).sort(), [`sched/${item.id}/ig/0`, `sched/${item.id}/ig/1`, `sched/${item.id}/x/0`]);
  assert.equal(env.MEDIA.objs.get(`sched/${item.id}/ig/0`).bytes.length, 1.2e6);
  for (const [, v] of rows) for (const sec of ['jeton-page', 'mdp-app']) assert.ok(!v.includes(sec));

  const realFetch = globalThis.fetch;
  const calls = [];
  // Téléphone abonné aux notifications du Studio
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const b64u = (b) => Buffer.from(b).toString('base64url');
  env.DB.studio.set('push', JSON.stringify([{ endpoint: 'https://push.test/abc', keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } }]));
  let pushes = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    if (u.hostname === 'push.test') { pushes++; return new Response('', { status: 201 }); }
    calls.push(u.pathname);
    const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname.endsWith('/photos')) return ok({ id: 'ph1' });
    if (u.searchParams.get('fields') === 'images') return ok({ images: [{ width: 1080, source: 'https://cdn.test/a.jpg' }] });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'p1_43' });
    if (u.pathname.endsWith('/comments')) return ok({ id: 'c1' });
    if (u.pathname.endsWith('/photo_stories')) return ok({ success: true });
    if (u.pathname.endsWith('createSession')) return ok({ accessJwt: 'jwt', did: 'did:plc:moi' });
    if (u.pathname.endsWith('uploadBlob')) return ok({ blob: { ref: 'b' } });
    if (u.pathname.endsWith('createRecord')) return ok({ uri: 'at://did:plc:moi/app.bsky.feed.post/3k', cid: 'c' });
    return new Response('{}', { status: 404 });
  };
  try {
    // Pas encore l'heure : rien ne part
    assert.equal(await runSchedule(env, { now: at - 60e3 }), null);
    assert.equal(calls.length, 0);
    // À l'heure : un réseau par passage (limite de sous-requêtes du Worker), jamais renvoyé au suivant
    assert.deepEqual(await runSchedule(env, { now: at + 1 }), { published: 'facebook', id: item.id });
    const photos = calls.filter((c) => c.endsWith('/photos')).length;
    assert.ok(photos && !calls.some((c) => c.endsWith('createRecord')));
    assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items[0].nets.bluesky.status, 'pending');
    assert.deepEqual(await runSchedule(env, { now: at + 60e3 }), { published: 'bluesky', id: item.id });
    assert.equal(calls.filter((c) => c.endsWith('/photos')).length, photos, 'Facebook pas renvoyé');
    // Fin : notification sur le téléphone au passage suivant (une seule fois), liste nettoyée
    assert.equal(pushes, 0);
    assert.equal(await runSchedule(env, { now: at + 120e3 }), null);
    assert.equal(pushes, 1);
    // Tout publié : retirée aussitôt de la liste (visuels, jetons et trace effacés), journal complété
    const list = await (await worker('https://s.test/studio/api/schedule', { headers: key })).json();
    assert.equal(list.items.length, 0);
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')).length, 0);
    assert.equal([...env.MEDIA.objs.keys()].filter((k) => k.startsWith(`sched/${item.id}`)).length, 0);
    const hist = await (await worker('https://s.test/studio/api/history', { headers: key })).json();
    assert.equal(hist.items[0].key, 'race-2026-18');
    assert.deepEqual(Object.keys(hist.items[0].nets).sort(), ['bluesky', 'facebook']);
    assert.equal(hist.items[0].nets.facebook.url, 'https://www.facebook.com/p1_43');
    // Worker lié à lui-même : chaque réseau envoyé par un appel à part (clé du serveur exigée), tous au même
    // passage ; un réseau déjà pris n'est jamais renvoyé, même demandé à nouveau
    const par = (await (await add()).json()).item;
    const asked = [];
    env.SELF = { fetch: async (u, init) => { asked.push(JSON.parse(init.body).net); return schedInternal(new Request(u, init), env); } };
    try {
      assert.deepEqual(await runSchedule(env, { now: at + 1 }), { published: ['facebook', 'bluesky'], parallel: true });
      assert.deepEqual(asked.sort(), ['bluesky', 'facebook']);
      const nets = (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === par.id).nets;
      assert.deepEqual([nets.facebook.status, nets.bluesky.status], ['done', 'done']);
      const n = calls.length;
      assert.equal(await runSchedule(env, { now: at + 2, only: { id: par.id, net: 'facebook' } }), null);
      assert.equal(calls.length, n);
      assert.equal((await schedInternal(new Request('https://self/internal/sched', { method: 'POST', body: '{}' }), env)).status, 403);
    } finally { delete env.SELF; }
    await runSchedule(env, { now: at + 60e3 });   // passage suivant : notification et nettoyage
    assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.length, 0);
    // Stories : sans texte, jamais mêlées aux posts du fil, absentes de l'historique
    assert.equal((await add({ posts: [{ network: 'facebook-story' }, { network: 'facebook', text: 'x' }] })).status, 400);
    const story = (await (await add({ posts: [{ network: 'facebook-story' }] })).json()).item;
    calls.length = 0;
    assert.deepEqual(await runSchedule(env, { now: at + 120e3 }), { published: 'facebook-story', id: story.id });
    assert.equal(calls.filter((c) => c.endsWith('/photo_stories')).length, 2);
    await runSchedule(env, { now: at + 121e3 });
    assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.length, 0);
    // 6 stories : 4 au premier passage, la suite au suivant (limite de sous-requêtes)
    const many = (await (await add({ posts: [{ network: 'facebook-story' }], more: 4 })).json()).item;
    calls.length = 0;
    await runSchedule(env, { now: at + 125e3 });
    assert.equal(calls.filter((c) => c.endsWith('/photo_stories')).length, 4);
    const half = (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === many.id);
    assert.deepEqual([half.nets['facebook-story'].status, half.nets['facebook-story'].sent, half.nets['facebook-story'].total], ['pending', 4, 6]);
    await runSchedule(env, { now: at + 185e3 });
    assert.equal(calls.filter((c) => c.endsWith('/photo_stories')).length, 6);
    await runSchedule(env, { now: at + 186e3 });
    assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.length, 0);
    assert.equal((await (await worker('https://s.test/studio/api/history', { headers: key })).json()).items.length, hist.items.length);
    // Échec sur un réseau : gardée dans la liste avec l'erreur, visuels et jetons effacés
    const bad = (await (await add()).json()).item;
    const ok = globalThis.fetch;
    globalThis.fetch = async (url, opts) => (new URL(url).pathname.endsWith('/feed') ? new Response(JSON.stringify({ error: { message: 'Refusé' } }), { status: 400 }) : ok(url, opts));
    await runSchedule(env, { now: at + 180e3 });
    await runSchedule(env, { now: at + 240e3 });
    const before = pushes;
    await runSchedule(env, { now: at + 300e3 });
    await runSchedule(env, { now: at + 360e3 });
    assert.equal(pushes, before + 1, 'erreur : une seule notification');
    globalThis.fetch = ok;
    const kept = (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === bad.id);
    assert.equal(kept.nets.facebook.status, 'error');
    assert.equal(kept.nets.bluesky.status, 'done');
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('schedimg:')).length, 0);
    assert.equal(JSON.parse(env.DB.studio.get(`sched:${bad.id}`)).keys, null);
    // Une semaine plus tard : la trace disparaît
    await runSchedule(env, { now: at + 8 * 86400e3 });
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')).length, 0);
  } finally { globalThis.fetch = realFetch; }

  // Annulation avant l'heure ; envoi trop en retard (serveur arrêté plus d'un jour) : abandonné
  // « Publier » : confié au serveur avec l'heure actuelle, accepté
  const now = (await (await add({ at: Date.now() })).json()).item;
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: now.id }), headers: key });
  const j2 = (await (await add()).json()).item;
  const after = await (await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: j2.id }), headers: key })).json();
  assert.equal(after.items.length, 0);
  assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')).length, 0);
  const j3 = (await (await add()).json()).item;
  assert.equal(await runSchedule(env, { now: at + 2 * 86400e3 }), null);
  const l3 = await (await worker('https://s.test/studio/api/schedule', { headers: key })).json();
  assert.equal(l3.items.find((x) => x.id === j3.id).nets.facebook.status, 'expired');
  await disableStudio({ fetchFn });
});

test('page du créateur : vidéo confiée au serveur (stockage R2), publiée par le relevé puis effacée', async () => {
  saveConfig({ creator: true, social: {
    meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' },
    bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' },
    youtube: { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'secret-google', accessToken: 'yat', expiresAt: Date.now() + 3600e3, refreshToken: 'rt-google', name: 'Benjy Paddock' },
  } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const form = (o = {}) => {
    const f = new FormData();
    f.append('at', String(Date.now()));
    f.append('title', 'Ma vidéo');
    f.append('record', JSON.stringify({ key: 'post:v1', kind: 'post', title: 'Ma vidéo' }));
    f.append('posts', JSON.stringify(o.posts ?? [{ network: 'youtube', text: 'Titre\nTexte' }, { network: 'bluesky', text: 'Salut' }, { network: 'facebook-story' }]));
    f.append('x', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' }), 'x.jpg');
    f.append('video', o.video ?? new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }), 'v.mp4');
    f.append('videofull', new Blob([new Uint8Array([5, 6, 7, 8, 9, 10])], { type: 'video/mp4' }), 'v-full.mp4');
    f.append('vsize', '1080x1920');
    if (o.tiktok) f.append('tiktok', JSON.stringify(o.tiktok));
    return f;
  };
  const add = (o) => worker('https://s.test/studio/api/schedule', { method: 'POST', body: form(o), headers: key });
  // Sans stockage R2 : refusée ; vidéo d'un autre format : refusée
  const r2 = env.MEDIA;
  delete env.MEDIA;
  assert.equal((await add()).status, 503);
  env.MEDIA = fakeR2();
  const bucket = env.MEDIA.objs;
  assert.equal((await add({ video: new Blob(['x'], { type: 'image/gif' }) })).status, 400);
  assert.equal((await add({ posts: [{ network: 'tiktok', text: 'x' }], tiktok: { privacy: 'SELF_ONLY', brandContent: true } })).status, 409);   // TikTok non connecté
  const { item } = await (await add()).json();
  assert.deepEqual([...bucket.keys()].sort(), [`sched/${item.id}`, `sched/${item.id}-full`, `sched/${item.id}/x/0`]);
  assert.equal(bucket.get(`sched/${item.id}`).type, 'video/mp4');

  const realFetch = globalThis.fetch;
  const sent = {};
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) return new Response('{}', { headers: { location: 'https://up.test/yt' } });
    if (u === 'https://up.test/yt') { sent.youtube = opts.body.length; return new Response(JSON.stringify({ id: 'v42' })); }
    if (u.includes('/p1/video_stories')) return new Response(JSON.stringify({ video_id: 's1', upload_url: 'https://up.test/story' }));
    if (u === 'https://up.test/story') { sent.story = opts.body.size; return new Response(JSON.stringify({ success: true })); }
    const p = new URL(u).pathname;
    if (p.endsWith('createSession')) return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:moi' }));
    if (p.endsWith('uploadBlob')) { sent.blob = [opts.headers['Content-Type'], opts.body.size]; return new Response(JSON.stringify({ blob: { ref: 'b' } })); }
    if (p.endsWith('createRecord')) { sent.bluesky = JSON.parse(opts.body).record.embed; return new Response(JSON.stringify({ uri: 'at://did:plc:moi/app.bsky.feed.post/3k', cid: 'c' })); }
    throw new Error(`inattendu : ${u}`);
  };
  try {
    assert.equal((await runSchedule(env)).id, item.id);
    assert.deepEqual(await runSchedule(env), { published: 'bluesky', id: item.id });
    assert.deepEqual(await runSchedule(env), { published: 'facebook-story', id: item.id });
    await runSchedule(env);
  } finally { globalThis.fetch = realFetch; }
  // Vidéo de la zone sûre envoyée à YouTube et en story, version plein écran à Bluesky ; vidéos effacées une fois publiées
  assert.deepEqual(sent, { youtube: 4, story: 4, blob: ['video/mp4', 6], bluesky: { $type: 'app.bsky.embed.video', video: { ref: 'b' }, aspectRatio: { width: 1080, height: 1920 } } });
  assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.length, 0);
  const hist = await (await worker('https://s.test/studio/api/history', { headers: key })).json();
  assert.equal(hist.items.find((x) => x.key === 'post:v1').nets.youtube.url, 'https://youtube.com/shorts/v42');
  assert.equal(bucket.size, 0);
  // Annulation avant l'heure : vidéo effacée aussi
  const later = (await (await add()).json()).item;
  assert.equal(bucket.size, 3);
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: later.id }), headers: key });
  assert.equal(bucket.size, 0);
  env.MEDIA = r2;
  await disableStudio({ fetchFn });
});

test('page du créateur : post « lien » sans visuels (carte de l\'article affichée par le réseau)', async () => {
  saveConfig({ creator: true, social: { meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' } } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const add = (link, posts = [{ network: 'facebook', text: 'Texte Facebook https://www.formula1.com/a' }, { network: 'bluesky', text: 'Texte Bluesky' }], ig = 0, at = Date.now()) => {
    const f = new FormData();
    f.append('at', String(at));
    f.append('title', 'Article');
    f.append('posts', JSON.stringify(posts));
    f.append('link', JSON.stringify(link));
    for (let i = 0; i < ig; i++) f.append('ig', new Blob([new Uint8Array([0xff, 0xd8, 0xff, i])], { type: 'image/jpeg' }), `image-${i + 1}.jpg`);
    return worker('https://s.test/studio/api/schedule', { method: 'POST', body: f, headers: key });
  };
  const link = { url: 'https://www.formula1.com/a', title: 'Le titre', description: 'Le résumé' };
  assert.equal((await add({ url: 'http://pas-https.test/a' })).status, 400);
  // Instagram n'a pas de lien : visuels de l'onglet Post, obligatoires
  assert.equal((await add(link, [{ network: 'instagram', text: 'x' }])).status, 400);
  const igItem = (await (await add(link, [{ network: 'instagram', text: 'x' }], 1, Date.now() + 3600e3)).json()).item;
  assert.ok(igItem.id);
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: igItem.id }), headers: key });
  const { item } = await (await add(link)).json();
  const realFetch = globalThis.fetch;
  const sent = {};
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d));
    if (u.pathname.endsWith('/feed')) { sent.facebook = Object.fromEntries(opts.body); return ok({ id: 'p1_9' }); }
    if (u.pathname.endsWith('createSession')) return ok({ accessJwt: 'jwt', did: 'did:plc:moi' });
    if (u.pathname.endsWith('createRecord')) { sent.bluesky = JSON.parse(opts.body).record; return ok({ uri: 'at://did:plc:moi/app.bsky.feed.post/3k', cid: 'c' }); }
    throw new Error(`inattendu : ${url}`);
  };
  try {
    assert.deepEqual(await runSchedule(env), { published: 'facebook', id: item.id });
    assert.deepEqual(await runSchedule(env), { published: 'bluesky', id: item.id });
    await runSchedule(env);
  } finally { globalThis.fetch = realFetch; }
  // Facebook : texte et lien (adresse d'origine : la base de test n'a pas les liens suivis), sans photo ;
  // Bluesky : carte du lien sans image
  assert.deepEqual(sent.facebook, { message: 'Texte Facebook https://www.formula1.com/a', link: 'https://www.formula1.com/a', access_token: 'jeton-page' });
  assert.equal(sent.bluesky.embed.$type, 'app.bsky.embed.external');
  assert.deepEqual({ ...sent.bluesky.embed.external, uri: 'x' }, { uri: 'x', title: 'Le titre', description: 'Le résumé' });
  assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.some((x) => x.id === item.id), false);
  await disableStudio({ fetchFn });
});

test('page du créateur : photos libres de droits (Commons, Flickr par Openverse), licences « NC » et « ND » écartées', async () => {
  const { freePhotos, shortLicense } = await import('../analytics/photos.js');
  assert.equal(shortLicense('Attribution-ShareAlike License'), 'CC BY-SA');
  assert.equal(shortLicense('CC BY 4.0'), 'CC BY 4.0');
  const asked = [];
  const fetchFn = async (url) => {
    const u = new URL(url);
    asked.push(u.hostname);
    if (u.hostname === 'commons.wikimedia.org') {
      const q = u.searchParams.get('gsrsearch');
      const info = (name, license, extra = {}) => [{ thumburl: `https://upload.wikimedia.org/w/thumb/${name}/1600px-${name}`, extmetadata: { LicenseShortName: { value: license } }, ...extra }];
      // Fichiers au nom du pilote, le plus récent (année du nom, sinon de l'envoi) en tête
      if (q === 'intitle:"Lando Norris" filetype:bitmap') return new Response(JSON.stringify({ query: { pages: {
        1: { index: 1, title: 'File:2019 Monaco GP - Lando Norris.jpg', imageinfo: info('Old.jpg', 'CC BY 2.0', { timestamp: '2026-05-01T00:00:00Z' }) },
        2: { index: 2, title: 'File:Lando Norris (028A8482).jpg', imageinfo: info('N.jpg', 'CC BY-SA 4.0', { timestamp: '2026-03-01T00:00:00Z', descriptionurl: 'https://commons.wikimedia.org/wiki/File:N.jpg', extmetadata: { Artist: { value: '<a href="x">Jean &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, Categories: { value: 'Formula One drivers|McLaren' } } }) },
        3: { index: 3, title: 'File:2025 Lando Norris.jpg', imageinfo: info('b.jpg', 'CC BY-NC 2.0') },
        // Même nom, mais pas en F1 (homonyme, autre sport) : écartée
        4: { index: 4, title: 'File:Lando Norris Street.jpg', imageinfo: info('Z.jpg', 'CC BY 4.0', { timestamp: '2026-09-01T00:00:00Z' }) },
      } } }));
      // Puis la recherche dans les descriptions (par pertinence, pas par date), sans doublon, et seulement les
      // photos dont le titre, la description ou les catégories citent le pilote
      assert.equal(q, 'Lando Norris Formula 1 filetype:bitmap');
      assert.equal(u.searchParams.get('gsrsort'), null);
      return new Response(JSON.stringify({ query: { pages: {
        1: { index: 1, title: 'File:Stepro 1.jpg', imageinfo: info('N.jpg', 'CC BY-SA 4.0') },
        2: { index: 2, title: 'File:Stepro 2.jpg', imageinfo: info('S.jpg', 'CC BY-SA 4.0', { extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Categories: { value: 'Lando Norris in 2025|McLaren MCL39|Formula One cars' } } }) },
        3: { index: 3, title: 'File:Rathaus 1.jpg', imageinfo: info('T.jpg', 'CC BY 4.0', { extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, ImageDescription: { value: 'Marktplatz' } } }) },
      } } }));
    }
    if (u.hostname === 'api.openverse.org') {
      assert.equal(u.searchParams.get('source'), 'flickr');
      assert.equal(u.searchParams.get('q'), 'Lando Norris');
      assert.equal(u.searchParams.get('license_type'), 'commercial,modification');
      return new Response(JSON.stringify({ results: [
        { url: 'https://live.staticflickr.com/1/9_b.jpg', thumbnail: 'https://api.openverse.org/v1/images/9/thumb/', title: 'Lando Norris', creator: 'Fan F1', license: 'by', license_version: '2.0', foreign_landing_url: 'https://www.flickr.com/photos/o1/9' },
        { url: 'https://live.staticflickr.com/1/6_b.jpg', title: 'Coucher de soleil', tags: [{ name: 'norris' }], creator: 'Z', license: 'by', license_version: '2.0' },
        { url: 'https://live.staticflickr.com/1/8_b.jpg', creator: 'X', license: 'by-nc', license_version: '2.0' },
        { url: 'https://ailleurs.test/7.jpg', creator: 'Y', license: 'by', license_version: '4.0' },
      ] }));
    }
    throw new Error(`inattendu : ${url}`);
  };
  assert.deepEqual((await freePhotos(' x ', { fetchFn })).items, []);
  const r = await freePhotos('Lando Norris', { fetchFn });
  assert.deepEqual(r.items.map((p) => [p.site, p.author, p.license]), [['Wikimedia Commons', 'Jean & Co', 'CC BY-SA 4.0'], ['Wikimedia Commons', 'Wikimedia Commons', 'CC BY 2.0'],
    ['Wikimedia Commons', 'Wikimedia Commons', 'CC BY-SA 4.0'], ['Flickr', 'Fan F1', 'CC BY 2.0']]);
  assert.equal(r.items[0].thumb, 'https://upload.wikimedia.org/w/thumb/N.jpg/330px-N.jpg');
  assert.equal(r.items[2].url, 'https://upload.wikimedia.org/w/thumb/S.jpg/1600px-S.jpg');
  assert.equal(r.items[0].year, undefined);
  // Même recherche : réponse gardée une heure
  const n = asked.length;
  await freePhotos('Lando Norris', { fetchFn });
  assert.equal(asked.length, n);
});

test('page du créateur : photo principale d\'un article (livrée spéciale)', async () => {
  const fetchFn = (url, init) => worker(url, init);
  saveConfig({ creator: true, social: {} });
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === 'https://media.test/livree') return new Response('<html><head><meta property="og:image" content="https://cdn.media.test/williams-vegas.jpg"></head><body><p>Texte</p></body></html>', { headers: { 'Content-Type': 'text/html' } });
    if (url === 'https://cdn.media.test/williams-vegas.jpg') return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (url === 'https://media.test/sans-photo') return new Response('<html><body>Rien</body></html>', { headers: { 'Content-Type': 'text/html' } });
    throw new Error(`inattendu : ${url}`);
  };
  try {
    const r = await worker(`https://s.test/studio/api/artimg?u=${encodeURIComponent('https://media.test/livree')}`, { headers: key });
    assert.equal(r.headers.get('Content-Type'), 'image/jpeg');
    assert.equal((await r.arrayBuffer()).byteLength, 4);
    assert.equal((await worker(`https://s.test/studio/api/artimg?u=${encodeURIComponent('https://media.test/sans-photo')}`, { headers: key })).status, 404);
    assert.equal((await worker(`https://s.test/studio/api/artimg?u=${encodeURIComponent('http://127.0.0.1/x')}`, { headers: key })).status, 400);
  } finally { globalThis.fetch = realFetch; }
  await disableStudio({ fetchFn });
});

test('page du créateur : toutes les sources d\'actu en une réponse (octets d\'origine, sources en panne écartées)', async () => {
  const { packFeeds, unpackFeeds } = await import('../shared/feed-pack.js');
  const { feeds } = await import('../analytics/studio.js');
  const { DEFAULT_SOURCES, feedUrl } = await import('../shared/news-sources.js');
  const latin = Uint8Array.from([0x3c, 0x61, 0x3e, 0xe9, 0x0a, 0x3c, 0x2f, 0x61, 0x3e]);   // « <a>é\n</a> » en latin-1
  const back = unpackFeeds(packFeeds([{ id: 'x', type: 'text/xml; charset=iso-8859-1', body: latin }, null, { id: 'y', type: '', body: new Uint8Array() }]));
  assert.deepEqual(back.map((p) => [p.id, p.type, [...p.body]]), [['x', 'text/xml; charset=iso-8859-1', [...latin]], ['y', '', []]]);
  assert.deepEqual(unpackFeeds(new TextEncoder().encode('x\ntype\n999\nabc')), []);   // taille fausse : rien de lu
  const rss = DEFAULT_SOURCES.filter((s) => s.kind === 'rss');
  const urls = [];
  const res = await feeds({ fetchFn: async (u) => { urls.push(u); return u === feedUrl(rss[0]) ? new Response('<rss/>', { headers: { 'Content-Type': 'application/rss+xml' } }) : u === feedUrl(rss[1]) ? new Response('', { status: 403 }) : Promise.reject(new Error('panne')); } });
  assert.equal(urls.length, rss.length);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const parts = unpackFeeds(new Uint8Array(await res.arrayBuffer()));
  assert.deepEqual(parts.map((p) => [p.id, p.type, new TextDecoder().decode(p.body)]), [[rss[0].id, 'application/rss+xml', '<rss/>']]);
  // Lecture incomplète gardée 20 secondes, lecture complète 2 minutes
  const n = urls.length;
  const t0 = Date.now();
  assert.equal(unpackFeeds(new Uint8Array(await (await feeds({ fetchFn: async (u) => { urls.push(u); return new Response(''); }, now: t0 + 10e3 })).arrayBuffer())).length, 1);
  assert.equal(urls.length, n);
  await feeds({ fetchFn: async (u) => { urls.push(u); return new Response('<rss>ok</rss>'); }, now: t0 + 200e3 });
  assert.equal(urls.length, n + rss.length);
  await feeds({ fetchFn: async (u) => { urls.push(u); return new Response(''); }, now: t0 + 300e3 });
  assert.equal(urls.length, n + rss.length);
  // Toutes les sources en panne : dernières lectures réussies reprises ; résultat incomplet gardé
  // 20 secondes seulement
  const down = async (u) => { urls.push(u); throw new Error('panne'); };
  const kept = unpackFeeds(new Uint8Array(await (await feeds({ fetchFn: down, now: t0 + 400e3 })).arrayBuffer()));
  assert.equal(kept.length, rss.length);
  assert.ok(kept.every((p) => new TextDecoder().decode(p.body) === '<rss>ok</rss>'));
  const m = urls.length;
  await feeds({ fetchFn: down, now: t0 + 410e3 });
  assert.equal(urls.length, m);              // encore gardé
  await feeds({ fetchFn: down, now: t0 + 430e3 });
  assert.equal(urls.length, m + rss.length); // relu
});

test('page du créateur : vidéo du kit envoyée par le serveur (brouillon TikTok, Short YouTube en privé)', async () => {
  saveConfig({ creator: true, social: {
    meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'benjypaddock' },
    tiktok: { clientKey: 'ck', clientSecret: 'secret-tiktok', accessToken: 'vieux', expiresAt: 0, refreshToken: 'rt-tiktok', openId: 'o1', name: 'Benjy Paddock' },
    youtube: { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'secret-google', accessToken: 'yat', expiresAt: Date.now() + 3600e3, refreshToken: 'rt-google', name: 'Benjy Paddock' },
  } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const sealed = env.DB.studio.get('vault');
  for (const s of ['secret-tiktok', 'secret-google', 'rt-tiktok']) assert.ok(!sealed.includes(s));
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const me = await (await worker('https://s.test/studio/api/me', { headers: key })).json();
  assert.equal(me.tiktok, 'Benjy Paddock');
  assert.equal(me.youtube, 'Benjy Paddock');
  for (const s of ['secret-tiktok', 'secret-google', 'rt-tiktok', 'rt-google', '"yat"']) assert.ok(!JSON.stringify(me).includes(s));

  env.ASSETS = { fetch: async (req) => (new URL(req.url).pathname === '/kit/benjy/video.mp4' ? new Response(new Uint8Array([1, 2, 3, 4])) : new Response(null, { status: 404 })) };
  const realFetch = globalThis.fetch;
  const calls = [];
  const polls = {};
  let pid = 0;
  const { draftTiming } = await import('../shared/video-publish.js');
  Object.assign(draftTiming, { poll: 1, max: 2000 });
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push(u);
    if (u === 'https://open.tiktokapis.com/v2/oauth/token/') {
      assert.equal(new URLSearchParams(String(opts.body)).get('client_secret'), 'secret-tiktok');
      return new Response(JSON.stringify({ access_token: 'neuf', expires_in: 86400, refresh_token: 'rt-tiktok' }));
    }
    if (u.endsWith('/post/publish/inbox/video/init/')) {
      assert.equal(opts.headers.Authorization, 'Bearer neuf');
      return new Response(JSON.stringify({ data: { upload_url: 'https://up.test/tt', publish_id: `pid${++pid}` } }));
    }
    // État relu après l'envoi : d'abord en traitement, puis reçu (ou refusé pour le 3e envoi)
    if (u.endsWith('/post/publish/status/fetch/')) {
      const id = JSON.parse(opts.body).publish_id;
      polls[id] = (polls[id] || 0) + 1;
      if (id === 'pid3') return new Response(JSON.stringify({ data: { status: 'FAILED', fail_reason: 'spam_risk_too_many_pending_share' } }));
      return new Response(JSON.stringify({ data: { status: polls[id] < 2 ? 'PROCESSING_UPLOAD' : 'SEND_TO_USER_INBOX' } }));
    }
    if (u === 'https://up.test/tt') { assert.equal(opts.body.length, 4); return new Response(null, { status: 201 }); }
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      assert.equal(JSON.parse(opts.body).status.privacyStatus, 'private');
      return new Response('{}', { headers: { location: 'https://up.test/yt' } });
    }
    if (u === 'https://up.test/yt') return new Response(JSON.stringify({ id: 'v42' }));
    if (u.includes('graph.facebook.com')) {
      const g = new URL(u);
      const form = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : {};
      if (g.pathname.endsWith('/ig1/media')) {
        assert.equal(form.media_type, 'REELS');
        assert.equal(form.video_url, 'https://s.test/kit/benjy/video.mp4');
        assert.equal(form.caption, 'Bienvenue au paddock');
        return new Response(JSON.stringify({ id: 'r1' }));
      }
      if (g.searchParams.get('fields') === 'status_code,status') return new Response(JSON.stringify({ status_code: 'FINISHED' }));
      if (g.pathname.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'pub9' }));
      if (g.searchParams.get('fields') === 'permalink') return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/reel/abc/' }));
    }
    throw new Error(`inattendu : ${u}`);
  };
  const send = (body) => worker('https://s.test/studio/api/video', { method: 'POST', headers: key, body: JSON.stringify(body) });
  try {
    let r = await send({ network: 'tiktok', src: '/kit/benjy/video.mp4' });
    assert.equal(r.status, 200);
    assert.match((await r.json()).note, /Brouillon reçu par TikTok.*Notifications système/);
    // Jeton renouvelé gardé par le serveur : pas de nouveau renouvellement au 2e envoi
    r = await send({ network: 'tiktok', src: '/kit/benjy/video.mp4' });
    assert.equal(r.status, 200);
    assert.equal(calls.filter((u) => u.endsWith('/oauth/token/')).length, 1);
    // L'appli renvoie ses jetons (plus anciens) : ceux du serveur sont gardés
    await syncStudio({ force: true, fetchFn });
    r = await send({ network: 'tiktok', src: '/kit/benjy/video.mp4' });
    assert.equal(calls.filter((u) => u.endsWith('/oauth/token/')).length, 1);
    // Refus de TikTok après l'envoi : la raison est donnée
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /trop de brouillons en attente/);
    // État relu plus tard : encore en traitement (avec l'état de TikTok), puis reçu
    let st = await (await send({ network: 'tiktok-status', id: 'pid9' })).json();
    assert.equal(st.pending, true);
    assert.match(st.note, /état TikTok : PROCESSING_UPLOAD/);
    st = await (await send({ network: 'tiktok-status', id: 'pid9' })).json();
    assert.match(st.note, /Brouillon reçu par TikTok/);
    assert.equal((await send({ network: 'tiktok-status', id: '../x y' })).status, 400);
    r = await send({ network: 'youtube', src: '/kit/benjy/video.mp4', text: 'Bienvenue\nLe récap' });
    assert.equal((await r.json()).url, 'https://youtube.com/shorts/v42');
    // Reel Instagram : Instagram lit la vidéo à son adresse publique
    r = await send({ network: 'instagram-reel', src: '/kit/benjy/video.mp4', text: 'Bienvenue au paddock' });
    assert.equal((await r.json()).url, 'https://www.instagram.com/reel/abc/');
    assert.equal((await send({ network: 'instagram-reel', src: 'https://ailleurs.test/v.mp4' })).status, 400);
    // Seulement les vidéos du kit, seulement TikTok et YouTube
    assert.equal((await send({ network: 'tiktok', src: 'https://ailleurs.test/v.mp4' })).status, 400);
    assert.equal((await send({ network: 'tiktok', src: '/kit/../secret.mp4' })).status, 400);
    assert.equal((await send({ network: 'x', src: '/kit/benjy/video.mp4' })).status, 400);
    assert.equal((await send({ network: 'tiktok', src: '/kit/autre/video.mp4' })).status, 404);
    // Vidéo envoyée avec un post écrit à la main : Short YouTube par la publication du Studio
    const post = (net, file) => { const f = new FormData(); f.append('network', net); f.append('text', 'Titre\nTexte'); if (file) f.append('video', file, 'v.mp4'); return worker('https://s.test/studio/api/publish', { method: 'POST', headers: key, body: f }); };
    r = await post('youtube', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }));
    assert.match(await r.text(), /"done":true.*"url":"https:\/\/youtube\.com\/shorts\/v42".*"note":"Short envoyé en privé/);
    assert.equal((await post('youtube')).status, 400);   // TikTok et YouTube : vidéo obligatoire
    assert.equal((await post('youtube', new Blob(['x'], { type: 'image/gif' }))).status, 400);
  } finally { globalThis.fetch = realFetch; delete env.ASSETS; }

  // Publication directe sur TikTok : compte relu, réglages vérifiés, puis publiée
  const sent = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith('/post/publish/creator_info/query/')) {
      return new Response(JSON.stringify({ data: { creator_nickname: 'Benjy Paddock', creator_username: 'benjypaddock', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY', 'AUTRE'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 }, error: { code: 'ok' } }));
    }
    if (u.endsWith('/post/publish/video/init/')) { sent.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ data: { upload_url: 'https://up.test/tt', publish_id: 'd1' }, error: { code: 'ok' } })); }
    if (u === 'https://up.test/tt') return new Response(null, { status: 201 });
    if (u.endsWith('/post/publish/status/fetch/')) return new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] }, error: { code: 'ok' } }));
    throw new Error(`inattendu : ${u}`);
  };
  try {
    const info = await (await worker('https://s.test/studio/api/tiktok-creator', { headers: key })).json();
    assert.deepEqual(info, { nickname: 'Benjy Paddock', username: 'benjypaddock', avatar: '', privacy: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], comment: true, duet: false, stitch: true, maxDuration: 600 });
    const direct = (o) => { const f = new FormData(); f.append('network', 'tiktok'); f.append('text', 'Texte'); f.append('video', new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }), 'v.mp4'); f.append('tiktok', JSON.stringify(o)); return worker('https://s.test/studio/api/publish', { method: 'POST', headers: key, body: f }); };
    // Visibilité obligatoire, contenu de marque jamais privé
    assert.equal((await direct({ title: 'x' })).status, 400);
    assert.equal((await direct({ privacy: 'SELF_ONLY', brandContent: true })).status, 400);
    assert.equal(sent.length, 0);
    const r = await direct({ title: 'Mon titre #F1', privacy: 'PUBLIC_TO_EVERYONE', comment: true, brandOrganic: true, username: 'benjypaddock' });
    assert.match(await r.text(), /"done":true.*"url":"https:\/\/www\.tiktok\.com\/@benjypaddock\/video\/7123"/);
    assert.deepEqual(sent[0].post_info, { title: 'Mon titre #F1', privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, disable_duet: true, disable_stitch: true, brand_organic_toggle: true, brand_content_toggle: false });
    assert.equal(sent[0].source_info.video_size, 3);
  } finally { globalThis.fetch = realFetch; }
  await disableStudio({ fetchFn });
});

test('appli : post écrit à la main mis en forme par l\'IA du serveur (page web activée seulement)', async () => {
  saveConfig({ studio: null });
  await assert.rejects(studioRewrite('Norris prolonge chez McLaren jusqu\'en 2030.'), /activez d'abord la page web/);
  saveConfig({ studio: { key: 'cle-studio' } });
  let seen = null;
  const fetchFn = async (url, opts) => { seen = { url: String(url), key: opts.headers['X-Studio-Key'], body: JSON.parse(opts.body) }; return new Response(JSON.stringify({ title: 'Norris prolonge', summary: 'Résumé.', points: ['Un'] })); };
  const r = await studioRewrite('Norris prolonge chez McLaren jusqu\'en 2030.', { fetchFn });
  assert.equal(r.title, 'Norris prolonge');
  assert.match(seen.url, /\/studio\/api\/rewrite$/);
  assert.equal(seen.key, 'cle-studio');
  assert.equal(seen.body.text, 'Norris prolonge chez McLaren jusqu\'en 2030.');
  saveConfig({ studio: null });
});

test('Studio : saison résumée par le serveur, gardée 30 minutes, ancienne version si Jolpica ne répond pas', async () => {
  const urls = [];
  let down = false;
  const page = (extra) => ({ MRData: { total: '1', ...extra } });
  const fetchFn = async (u) => {
    urls.push(String(u));
    if (down) return new Response('', { status: 503 });
    const p = new URL(u).pathname;
    if (p.endsWith('/driverstandings.json')) return new Response(JSON.stringify(page({ StandingsTable: { StandingsLists: [{ DriverStandings: [{ position: '1', points: '300', wins: '7', Driver: { givenName: 'Lando', familyName: 'Norris', code: 'NOR', permanentNumber: '4' }, Constructors: [{ name: 'McLaren', constructorId: 'mclaren' }] }] }] } })));
    if (p.endsWith('/constructorstandings.json')) return new Response(JSON.stringify(page({ StandingsTable: { StandingsLists: [{ ConstructorStandings: [] }] } })));
    if (p.endsWith('/2026.json')) return new Response(JSON.stringify(page({ RaceTable: { Races: [{ round: '1', raceName: 'Australian Grand Prix', date: '2026-03-08', time: '04:00:00Z', Circuit: { circuitId: 'albert_park', Location: { country: 'Australia' } } }] } })));
    return new Response(JSON.stringify({ MRData: { total: '0', RaceTable: { Races: [] } } }));
  };
  const wait = async () => {};
  const t0 = Date.parse('2026-10-18T08:00:00Z');
  const a = await seasonRow(env, 2026, { now: t0, fetchFn, wait });
  assert.equal(a.v.races[0].name, 'Australian Grand Prix');
  assert.equal(a.v.drivers[0].points, 300);
  // Calendrier auquel on s'abonne : séances de la saison gardée, relu par l'agenda toutes les 6 h
  const { calendar } = await import('../analytics/worker.js');
  const cal = await (await calendar(env, 2026, false, { now: t0 })).text();
  assert.match(cal, /X-WR-CALNAME:Formule 1 \(Paddock Live\)/);
  assert.match(cal, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/);
  assert.match(cal, /SUMMARY:F1 Australian GP — Course/);
  const n = urls.length;
  assert.equal(n, 6);
  // Moins de 30 minutes après : version gardée, aucune demande
  assert.equal((await seasonRow(env, 2026, { now: t0 + 29 * 60e3, fetchFn, wait })).at, t0);
  assert.equal(urls.length, n);
  // Plus tard, Jolpica en panne : l'ancienne version sert
  down = true;
  assert.equal((await seasonRow(env, 2026, { now: t0 + 31 * 60e3, fetchFn, wait })).at, t0);
});

test('page du créateur : brouillons de posts (enregistrés, repris, mis à jour, supprimés)', async () => {
  saveConfig({ creator: true });
  await enableStudio(CODE, { fetchFn: (url, init) => worker(url, init) });
  const h = { 'X-Studio-Key': studioKey(CODE) };
  const call = (path, body) => worker(`https://s.test/studio/api/${path}`, body ? { method: 'POST', headers: h, body: JSON.stringify(body) } : { headers: h });
  const dr = { id: '0b5c1e9a-1111-4a2b-9c3d-123456789abc', title: 'Haas engage Câmara', kind: 'news', key: 'news:1', at: 1, fmt: 'ig', skip: ['question'], opts: { follow: false, question: true, hack: 'x' }, edited: { instagram: 'Mon texte' }, d: { news: true, title: 'Haas engage Câmara' } };
  assert.deepEqual((await (await call('drafts', dr)).json()).items, [{ id: dr.id, title: dr.title, kind: 'news', at: 1 }]);
  const got = await (await call(`draft?id=${dr.id}`)).json();
  assert.deepEqual(got.opts, { follow: false, question: true });   // champs inconnus écartés
  assert.equal(got.edited.instagram, 'Mon texte');
  assert.deepEqual(got.d, dr.d);
  // Même brouillon enregistré de nouveau : mis à jour, pas en double
  assert.equal((await (await call('drafts', { ...dr, title: 'Titre corrigé', at: 2 })).json()).items.length, 1);
  assert.equal((await (await call('drafts')).json()).items[0].title, 'Titre corrigé');
  assert.equal((await call('drafts', { ...dr, id: '../x' })).status, 400);
  assert.equal((await call('drafts', { ...dr, id: '0b5c1e9a-2222-4a2b-9c3d-123456789abc', d: { image: 'x'.repeat(1600000) } })).status, 400);   // trop lourd
  assert.deepEqual((await (await call('drafts/remove', { id: dr.id })).json()).items, []);
  assert.equal((await call(`draft?id=${dr.id}`)).status, 404);
});
