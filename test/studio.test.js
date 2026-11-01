import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-studio-'));
delete process.env.F1TV_TOKEN;   // jeton de l'environnement : remplacerait celui des tests (server/config.js)
// Code d'essai (le vrai code n'est jamais dans le dépôt) : son empreinte remplace celle du créateur
const CODE = 'ESSAI-42';
const nodeCrypto = await import('node:crypto');
const HASH = nodeCrypto.createHash('sha256').update(nodeCrypto.pbkdf2Sync(CODE, 'paddock-live-studio', 200000, 32, 'sha256')).digest('hex');
process.env.PADDOCK_CREATOR_HASH = HASH;
const { studioApi, freshF1tv, runSchedule, schedInternal, seasonRow } = await import('../analytics/studio.js');
const { studioKey, enableStudio, syncStudio, disableStudio, studioInfo } = await import('../server/studio-sync.js');
const { saveConfig, getConfig } = await import('../server/config.js');

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
          if (/^SELECT k, v FROM studio WHERE k >= \? AND k < \?$/.test(sql)) return { results: [...studio].filter(([k]) => k >= args[0] && k < args[1]).map(([k, v]) => ({ k, v })) };
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio \(.*DO NOTHING$/.test(sql)) { if (studio.has(args[0])) return { meta: { changes: 0 } }; studio.set(args[0], args[1]); return { meta: { changes: 1 } }; }
          if (/^UPDATE studio SET v = \?, at = \? WHERE k = \? AND v = \?$/.test(sql)) { if (studio.get(args[2]) !== args[3]) return { meta: { changes: 0 } }; studio.set(args[2], args[0]); return { meta: { changes: 1 } }; }
          if (/^INSERT INTO studio \(/.test(sql)) studio.set(args[0], args[1]);
          else if (/^INSERT INTO studio_fail/.test(sql)) fails.set(`${args[0]}|${args[1]}`, (fails.get(`${args[0]}|${args[1]}`) || 0) + 1);
          else if (/^DELETE FROM studio$/.test(sql)) studio.clear();
          else if (/^DELETE FROM studio WHERE k >= \? AND k < \?$/.test(sql)) { for (const k of [...studio.keys()]) if (k >= args[0] && k < args[1]) studio.delete(k); }
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
    get: async (k) => (objs.has(k) ? { arrayBuffer: async () => objs.get(k).bytes.slice().buffer, body: new Blob([objs.get(k).bytes]).stream(), size: objs.get(k).bytes.length, httpEtag: '"e"', httpMetadata: { contentType: objs.get(k).type } } : null),
    delete: async (k) => { [k].flat().forEach((x) => objs.delete(x)); },
  };
}
const env = { DB: fakeDB(), MEDIA: fakeR2(), STUDIO_KEY_HASH: HASH, STATS_KEY: 'secret-du-serveur' };
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

  // Publication sur Facebook par le serveur : lien du post ; commentaire refusé (permission manquante) :
  // le post part quand même, avec la raison
  const realFetch = globalThis.fetch;
  let refuse = false;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname.endsWith('/photos')) return ok({ id: 'ph1' });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'p1_42' });
    if (u.pathname.endsWith('/comments')) return refuse ? new Response(JSON.stringify({ error: { message: '(#200) Permissions error' } }), { status: 403 }) : ok({ id: 'c1' });
    return realFetch(url, opts);
  };
  try {
    const key = { 'X-Studio-Key': studioKey(CODE) };
    const send = async () => {
      const form = new FormData();
      form.append('at', String(Date.now()));
      form.append('posts', JSON.stringify([{ network: 'facebook', text: 'Bonjour', comment: "Lire l'article : https://a.test/x" }]));
      form.append('ig', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], { type: 'image/jpeg' }), 'a.jpg');
      const { item } = await (await worker('https://s.test/studio/api/schedule', { method: 'POST', body: form, headers: key })).json();
      await runSchedule(env);
      const st = (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === item.id).nets.facebook;
      await runSchedule(env);   // passage suivant : nettoyage
      return st;
    };
    const st = await send();
    assert.deepEqual([st.status, st.url, st.comment, st.commentError], ['done', 'https://www.facebook.com/p1_42', true, null]);
    refuse = true;
    const r2 = await send();
    assert.deepEqual([r2.status, r2.comment], ['done', false]);
    assert.match(r2.commentError, /Permissions error.*permission manquante/);
  } finally { globalThis.fetch = realFetch; }

  await disableStudio({ fetchFn });
  assert.equal(studioInfo().enabled, false);
  assert.equal(env.DB.studio.size, 0);
});

test('page du créateur : comptes repris sur un nouvel ordinateur, copie illisible par le serveur', async () => {
  const { restoreAccounts } = await import('../server/studio-sync.js');
  const fetchFn = (url, init) => worker(url, init);
  // Page jamais activée : rien à reprendre
  saveConfig({ creator: true, studio: null, social: {} });
  assert.equal(await restoreAccounts(CODE, { fetchFn }), 0);
  assert.equal(getConfig().studio, null);
  // Ancien ordinateur : X et clés des apps, absents du coffre
  const social = { x: { apiKey: 'cle-x', apiSecret: 'secret-x', accessToken: 'jeton-x', accessSecret: 'secret-jx', username: '@moi' }, meta: { appId: 'app1', appSecret: 'secret-app', pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, threads: { appSecret: 'secret-th', token: 'jeton-th', userId: 't1', username: 'moi' } };
  saveConfig({ social });
  assert.equal(studioInfo().backup, false);
  await enableStudio(CODE, { fetchFn });
  assert.equal(studioInfo().backup, true);
  const box = env.DB.studio.get('accounts');
  // « @moi » et pas « moi » : trois lettres se trouvent parfois par hasard dans une copie chiffrée (base64)
  for (const s of ['cle-x', 'secret-x', 'secret-app', 'secret-th', 'jeton-page', '@moi']) assert.ok(!box.includes(s));
  // Une ancienne appli qui renvoie ses comptes sans copie : la copie reste
  await worker('https://s.test/studio/api/sync', { method: 'POST', headers: { 'X-Studio-Key': studioKey(CODE) }, body: JSON.stringify({ vault: { meta: social.meta } }) });
  assert.equal(env.DB.studio.get('accounts'), box);
  // Le serveur a renouvelé le jeton Threads entre-temps
  await worker('https://s.test/studio/api/sync', { method: 'POST', headers: { 'X-Studio-Key': studioKey(CODE) }, body: JSON.stringify({ vault: { meta: social.meta, threads: { ...social.threads, token: 'jeton-th-2', expiresAt: Date.now() + 9e9 } } }) });

  // Nouvel ordinateur : rien de connecté, sauf Bluesky (gardé)
  saveConfig({ studio: null, f1tvToken: null, social: { bluesky: { handle: 'ici.bsky.social', appPassword: 'mdp-ici', did: 'did:ici' } } });
  assert.equal(await restoreAccounts(CODE, { fetchFn }), 3);
  const c = getConfig();
  assert.deepEqual(c.social.x, social.x);
  assert.equal(c.social.meta.appSecret, 'secret-app');
  assert.deepEqual([c.social.threads.appSecret, c.social.threads.token], ['secret-th', 'jeton-th-2']);
  assert.equal(c.social.bluesky.appPassword, 'mdp-ici');
  assert.equal(studioInfo().enabled, true);   // page web reliée à ce nouvel ordinateur
  assert.equal(await syncStudio({ fetchFn }), true);
  assert.equal(await restoreAccounts(CODE, { fetchFn }), 0);   // déjà tout là
  await disableStudio({ fetchFn });
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
    // Connexion F1 TV acceptée pour l'index de l'année mais fichier refusé (séance qui vient de finir) :
    // archive pas encore publiée, et non connexion refusée ; refusée partout : connexion refusée
    const tok = `x.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 4 * 86400 })).toString('base64url')}.y`;
    await worker('https://s.test/studio/api/sync', { method: 'POST', headers: { 'X-Studio-Key': key }, body: JSON.stringify({ vault: { f1tv: tok } }) });
    let indexOk = true;
    globalThis.fetch = async (url, init = {}) => new Response('{}', { status: init.headers?.Authorization && indexOk && String(url).endsWith('/2024/Index.json') ? 200 : 403 });
    r = await worker('https://s.test/studio/api/archive?p=2024/2024-10-20_United_States_Grand_Prix/2024-10-20_Race/TimingData.jsonStream', h);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'Archive pas encore publiée');
    indexOk = false;
    r = await worker('https://s.test/studio/api/archive?p=2023/2023-10-22_United_States_Grand_Prix/2023-10-22_Race/TimingData.jsonStream', h);
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /refuse la connexion F1 TV/);
  } finally { globalThis.fetch = realFetch; }
  assert.equal((await worker(`https://s.test/studio/api/img?u=${encodeURIComponent('https://evil.test/a.png')}`, h)).status, 400);
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
    if (o.id) f.append('id', o.id);
    f.append('at', String(o.at ?? at));
    f.append('title', 'Résultats');
    f.append('record', JSON.stringify({ key: 'race-2026-18', kind: 'race', title: 'Résultats' }));
    f.append('posts', JSON.stringify(o.posts ?? [{ network: 'facebook', text: 'Bonjour', comment: 'Lien' }, { network: 'bluesky', text: 'Salut' }]));
    f.append('ig', jpeg(1.2e6), 'a.jpg');
    f.append('ig', jpeg(10), 'b.jpg');
    f.append('x', jpeg(10), 'c.jpg');
    for (let i = 0; i < (o.more || 0); i++) f.append('ig', jpeg(10), `d${i}.jpg`);
    f.append('alts', JSON.stringify({ ig: ['Podium', 'Classement', 'en trop'], x: ['Podium X'] }));
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
  // Même identifiant envoyé deux fois (réponse perdue, nouvel appui) : une seule programmation
  const first = await (await add({ id: 'aaaaaaaaaaaaaaaa' })).json();
  const again = await (await add({ id: 'aaaaaaaaaaaaaaaa' })).json();
  assert.equal(first.item.id, 'aaaaaaaaaaaaaaaa');
  assert.equal(again.item.id, 'aaaaaaaaaaaaaaaa');
  assert.equal([...env.DB.studio.keys()].filter((k) => k === 'sched:aaaaaaaaaaaaaaaa').length, 1);
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', headers: key, body: JSON.stringify({ id: 'aaaaaaaaaaaaaaaa' }) });
  // Texte alternatif de chaque visuel, un par image (le surplus écarté)
  assert.deepEqual(JSON.parse(env.DB.studio.get(`sched:${item.id}`)).alts, { ig: ['Podium', 'Classement'], x: ['Podium X'] });
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
    assert.deepEqual([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')), [`scheddone:${item.id}`]);   // seul le témoin reste
    assert.equal([...env.MEDIA.objs.keys()].filter((k) => k.startsWith(`sched/${item.id}`)).length, 0);
    // Réponse perdue, nouvel appui sur Publier avec le même identifiant : rien n'est republié
    const sent = calls.length;
    assert.equal((await (await add({ id: item.id })).json()).item.id, item.id);
    assert.equal(await runSchedule(env, { now: at + 180e3 }), null);
    assert.equal(calls.length, sent);
    assert.deepEqual([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')), [`scheddone:${item.id}`]);
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
    // Échec sur un réseau : gardée dans la liste avec l'erreur ; visuels et jetons gardés 24 h (« Réessayer »)
    const post = (path, body) => worker(`https://s.test/studio/api/schedule/${path}`, { method: 'POST', headers: key, body: JSON.stringify(body) });
    const listed = async (id) => (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === id);
    const media = (id) => [...env.MEDIA.objs.keys()].filter((k) => k.startsWith(`sched/${id}`)).length;
    const ok = globalThis.fetch;
    const refuse = async (url, opts) => (new URL(url).pathname.endsWith('/feed') ? new Response(JSON.stringify({ error: { message: 'Refusé' } }), { status: 400 }) : ok(url, opts));
    const bad = (await (await add()).json()).item;
    globalThis.fetch = refuse;
    await runSchedule(env, { now: at + 180e3 });
    await runSchedule(env, { now: at + 240e3 });
    const before = pushes;
    await runSchedule(env, { now: at + 300e3 });
    await runSchedule(env, { now: at + 360e3 });
    assert.equal(pushes, before + 1, 'erreur : une seule notification');
    globalThis.fetch = ok;
    const kept = await listed(bad.id);
    assert.deepEqual([kept.nets.facebook.status, kept.nets.bluesky.status, kept.retry], ['error', 'done', true]);
    assert.ok(media(bad.id) > 0);
    // Réessayer : seulement un réseau en erreur ; publié au relevé suivant, puis tout est effacé
    assert.equal((await post('retry', { id: bad.id, net: 'bluesky' })).status, 409);
    // Compte reconnecté depuis la programmation : « Réessayer » prend les jetons du coffre à ce moment
    await worker('https://s.test/studio/api/sync', { method: 'POST', headers: key, body: JSON.stringify({ vault: { meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page-2', igId: 'ig1', igUsername: 'moi' }, bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' } } }) });
    assert.equal((await post('retry', { id: bad.id, net: 'facebook' })).status, 200);
    assert.equal((await listed(bad.id)).nets.facebook.status, 'pending');
    const t0 = Date.now();
    const sentTokens = [];
    globalThis.fetch = async (url, opts = {}) => { if (new URL(url).pathname.endsWith('/feed')) sentTokens.push(String(opts.body)); return ok(url, opts); };
    assert.deepEqual(await runSchedule(env, { now: t0 + 1e3 }), { published: 'facebook', id: bad.id });
    globalThis.fetch = ok;
    assert.ok(sentTokens.length && sentTokens.every((b) => b.includes('jeton-page-2')), 'nouveau jeton utilisé');
    await runSchedule(env, { now: t0 + 2e3 });
    assert.equal(await listed(bad.id), undefined);
    assert.equal(media(bad.id), 0);
    // Visuel manquant dans le stockage : erreur, jamais publié sans lui
    const gone = (await (await add({ posts: [{ network: 'facebook', text: 'x' }] })).json()).item;
    env.MEDIA.objs.delete(`sched/${gone.id}/ig/1`);
    const feeds = calls.filter((c) => c.endsWith('/feed')).length;
    await runSchedule(env, { now: at + 390e3 });
    assert.deepEqual([(await listed(gone.id)).nets.facebook.status, (await listed(gone.id)).nets.facebook.error], ['error', 'Visuels effacés du serveur']);
    assert.equal(calls.filter((c) => c.endsWith('/feed')).length, feeds);
    // Sans « Réessayer » : visuels et jetons effacés au bout de 24 h, la trace une semaine après
    const bad2 = (await (await add()).json()).item;
    globalThis.fetch = refuse;
    for (const k of [400, 460, 520]) await runSchedule(env, { now: at + k * 1e3 });
    globalThis.fetch = ok;
    assert.ok(media(bad2.id) > 0);
    await runSchedule(env, { now: at + 26 * 3600e3 });
    assert.equal(media(bad2.id), 0);
    assert.equal(JSON.parse(env.DB.studio.get(`sched:${bad2.id}`)).keys, null);
    assert.equal((await post('retry', { id: bad2.id, net: 'facebook' })).status, 410);
    await runSchedule(env, { now: at + 8 * 86400e3 });
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched') && !k.startsWith('scheddone:')).length, 0);   // témoins : purge du jour
  } finally { globalThis.fetch = realFetch; }

  // Modifier avant l'heure : nouvelle heure et textes ; plus possible une fois parti
  const ed = (await (await add()).json()).item;
  const upd = (body) => worker('https://s.test/studio/api/schedule/update', { method: 'POST', headers: key, body: JSON.stringify({ id: ed.id, ...body }) });
  assert.equal((await upd({ at: Date.now() + 30 * 86400e3 })).status, 400);
  const edited = (await (await upd({ at: at + 7200e3, texts: { facebook: 'Texte corrigé', bluesky: '' } })).json()).items.find((x) => x.id === ed.id);
  assert.equal(edited.at, at + 7200e3);
  assert.equal(edited.texts.facebook, 'Texte corrigé');
  assert.ok(edited.texts.bluesky);   // texte vide : l'ancien gardé
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: ed.id }), headers: key });
  // Annulation avant l'heure ; envoi trop en retard (serveur arrêté plus d'un jour) : abandonné
  // « Publier » : confié au serveur avec l'heure actuelle, accepté
  const now = (await (await add({ at: Date.now() })).json()).item;
  await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: now.id }), headers: key });
  const j2 = (await (await add()).json()).item;
  const after = await (await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: j2.id }), headers: key })).json();
  assert.equal(after.items.length, 0);
  assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched') && !k.startsWith('scheddone:')).length, 0);
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

test('page du créateur : vidéo programmée sur Instagram (fichier envoyé tel quel) et Threads (adresse du serveur)', async () => {
  saveConfig({ creator: true, social: {
    meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' },
    threads: { token: 'jeton-th', userId: 't1', username: 'moi', expiresAt: Date.now() + 9e9 },
  } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const f = new FormData();
  f.append('at', String(Date.now()));
  f.append('title', 'Ma vidéo');
  f.append('posts', JSON.stringify([{ network: 'instagram', text: 'Légende' }, { network: 'threads', text: 'Texte', topic: 'Formule 1' }]));
  f.append('video', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }), 'v.mp4');
  f.append('videofull', new Blob([new Uint8Array([5, 6, 7, 8, 9, 10])], { type: 'video/mp4' }), 'v-full.mp4');
  const { item } = await (await worker('https://s.test/studio/api/schedule', { method: 'POST', body: f, headers: key })).json();
  const { schedVideo } = await import('../analytics/studio.js');
  const { timing } = await import('../shared/meta-publish.js');
  const was = { ...timing };
  Object.assign(timing, { visible: [], threadsVideo: [1] });
  const realFetch = globalThis.fetch;
  const sent = {};
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d));
    if (u.hostname === 'rupload.facebook.com') { sent.ig = opts.body.size; return ok({ success: true }); }
    if (u.pathname.endsWith('/ig1/media')) { sent.igForm = Object.fromEntries(new URLSearchParams(String(opts.body))); return ok({ id: 'c1', uri: 'https://rupload.facebook.com/ig-api-upload/v25.0/c1' }); }
    if (u.pathname.endsWith('/t1/threads')) {
      // Lu par Threads pendant l'envoi : la version plein écran, servie par le serveur
      sent.threadsUrl = new URLSearchParams(String(opts.body)).get('video_url');
      sent.topic = new URLSearchParams(String(opts.body)).get('topic_tag');
      sent.served = [...new Uint8Array(await (await schedVideo(new Request(sent.threadsUrl), env, sent.threadsUrl.split('/studio/v/')[1])).arrayBuffer())];
      return ok({ id: 'c2' });
    }
    if (/\/c[12]$/.test(u.pathname)) return ok({ status_code: 'FINISHED', status: 'FINISHED' });
    if (u.pathname.endsWith('_publish')) return ok({ id: 'p1' });
    if (u.pathname.endsWith('/p1')) return ok({ permalink: 'https://example.test/p/1' });
    throw new Error(`inattendu : ${url}`);
  };
  try {
    for (let i = 0; i < 3; i++) await runSchedule(env);
  } finally { globalThis.fetch = realFetch; Object.assign(timing, was); }
  assert.equal(sent.ig, 4, 'vidéo de la zone sûre envoyée à Instagram');
  assert.deepEqual([sent.igForm.media_type, sent.igForm.upload_type, sent.igForm.video_url], ['REELS', 'resumable', undefined]);
  assert.equal(sent.threadsUrl, `https://paddock-live-stats.paddock-live.workers.dev/studio/v/${item.id}-full.mp4`);
  assert.deepEqual(sent.served, [5, 6, 7, 8, 9, 10]);
  assert.equal(sent.topic, 'Formule 1', 'sujet Threads choisi dans le Studio');
  const nets = (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === item.id)?.nets;
  assert.ok(!nets || Object.values(nets).every((x) => x.status === 'done'));
  // Nom inconnu ou mal formé : rien
  assert.equal((await schedVideo(new Request('https://s.test/'), env, '../vault')).status, 404);
  assert.equal((await schedVideo(new Request('https://s.test/'), env, 'aaaaaaaaaaaaaaaa')).status, 404);
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

test('page du créateur : Bluesky, suite du fil (images 5 à 8) publiée en réponse ; anciens envois sans suite inchangés', async () => {
  saveConfig({ creator: true, social: { bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' } } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const add = (n, post) => {
    const f = new FormData();
    f.append('at', String(Date.now()));
    f.append('title', 'Qualifs');
    f.append('posts', JSON.stringify([post]));
    for (let i = 0; i < n; i++) f.append('x', new Blob([new Uint8Array([0xff, 0xd8, 0xff, i])], { type: 'image/jpeg' }), `x-${i + 1}.jpg`);
    f.append('alts', JSON.stringify({ ig: [], x: Array.from({ length: n }, (_, i) => `Image ${i + 1}`) }));
    return worker('https://s.test/studio/api/schedule', { method: 'POST', body: f, headers: key });
  };
  const realFetch = globalThis.fetch;
  let records = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d));
    if (u.pathname.endsWith('createSession')) return ok({ accessJwt: 'jwt', did: 'did:plc:moi', handle: 'moi.bsky.social' });
    if (u.pathname.endsWith('uploadBlob')) return ok({ blob: { ref: 'b' } });
    if (u.pathname.endsWith('createRecord')) { records.push(JSON.parse(opts.body).record); return ok({ uri: `at://did:plc:moi/app.bsky.feed.post/r${records.length}`, cid: `c${records.length}` }); }
    throw new Error(`inattendu : ${url}`);
  };
  try {
    // Post de 4 images, suite de 3 en réponse, puis le premier commentaire
    const { item } = await (await add(7, { network: 'bluesky', text: 'Qualifs', comment: 'Lien', more: '📊 La suite : meilleurs secteurs' })).json();
    assert.equal(JSON.parse(env.DB.studio.get(`sched:${item.id}`)).posts[0].more, '📊 La suite : meilleurs secteurs');
    assert.deepEqual(await runSchedule(env), { published: 'bluesky', id: item.id });
    assert.deepEqual(records.map((r) => [r.text, r.embed?.images.length ?? 0, r.reply?.parent.uri.slice(-2) ?? null]), [['Qualifs', 4, null], ['📊 La suite : meilleurs secteurs', 3, 'r1'], ['Lien', 0, 'r1']]);
    assert.deepEqual(records[1].embed.images.map((i) => i.alt), ['Image 5', 'Image 6', 'Image 7']);
    await runSchedule(env);
    // Ancienne version de la page : 4 images, pas de suite ; texte « more » ignoré hors Bluesky ou sans images en plus
    records = [];
    const old = (await (await add(4, { network: 'bluesky', text: 'Avant' })).json()).item;
    assert.equal('more' in JSON.parse(env.DB.studio.get(`sched:${old.id}`)).posts[0], false);
    assert.deepEqual(await runSchedule(env), { published: 'bluesky', id: old.id });
    assert.deepEqual(records.map((r) => [r.text, r.embed.images.length]), [['Avant', 4]]);
    await runSchedule(env);
    records = [];
    const four = (await (await add(4, { network: 'bluesky', text: 'Quatre', more: '📊 La suite' })).json()).item;
    await runSchedule(env);
    assert.equal(records.length, 1);
    await runSchedule(env);
    assert.equal((await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.some((x) => [item.id, old.id, four.id].includes(x.id)), false);
  } finally { globalThis.fetch = realFetch; }
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

test('page du créateur : vidéo programmée sur TikTok (brouillon ou publication directe) et en Short YouTube privé', async () => {
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

  const { draftTiming } = await import('../shared/video-publish.js');
  Object.assign(draftTiming, { poll: 1, max: 2000 });
  const realFetch = globalThis.fetch;
  const sent = [];
  const polls = {};
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === 'https://open.tiktokapis.com/v2/oauth/token/') {
      assert.equal(new URLSearchParams(String(opts.body)).get('client_secret'), 'secret-tiktok');
      return new Response(JSON.stringify({ access_token: 'neuf', expires_in: 86400, refresh_token: 'rt-tiktok' }));
    }
    if (u.endsWith('/post/publish/creator_info/query/')) {
      return new Response(JSON.stringify({ data: { creator_nickname: 'Benjy Paddock', creator_username: 'benjypaddock', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY', 'AUTRE'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 }, error: { code: 'ok' } }));
    }
    if (u.endsWith('/post/publish/inbox/video/init/')) {
      assert.equal(opts.headers.Authorization, 'Bearer neuf');
      return new Response(JSON.stringify({ data: { upload_url: 'https://up.test/tt', publish_id: 'pid1' } }));
    }
    if (u.endsWith('/post/publish/video/init/')) { sent.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ data: { upload_url: 'https://up.test/tt', publish_id: 'd1' }, error: { code: 'ok' } })); }
    if (u === 'https://up.test/tt') { assert.equal(opts.body.length, 4); return new Response(null, { status: 201 }); }
    // État relu après l'envoi : brouillon d'abord en traitement, puis reçu ; publication directe finie
    if (u.endsWith('/post/publish/status/fetch/')) {
      const id = JSON.parse(opts.body).publish_id;
      polls[id] = (polls[id] || 0) + 1;
      if (id === 'd1') return new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] }, error: { code: 'ok' } }));
      return new Response(JSON.stringify({ data: { status: polls[id] < 2 ? 'PROCESSING_UPLOAD' : 'SEND_TO_USER_INBOX' } }));
    }
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      assert.equal(JSON.parse(opts.body).status.privacyStatus, 'private');
      return new Response('{}', { headers: { location: 'https://up.test/yt' } });
    }
    if (u === 'https://up.test/yt') return new Response(JSON.stringify({ id: 'v42' }));
    throw new Error(`inattendu : ${u}`);
  };
  const add = (posts, tiktok) => {
    const f = new FormData();
    f.append('at', String(Date.now()));
    f.append('posts', JSON.stringify(posts));
    f.append('video', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }), 'v.mp4');
    if (tiktok) f.append('tiktok', JSON.stringify(tiktok));
    return worker('https://s.test/studio/api/schedule', { method: 'POST', body: f, headers: key });
  };
  const nets = async (id) => (await (await worker('https://s.test/studio/api/schedule', { headers: key })).json()).items.find((x) => x.id === id)?.nets;
  try {
    // Brouillon TikTok (jeton renouvelé) et Short YouTube en privé
    const a = (await (await add([{ network: 'tiktok', text: 'Titre' }, { network: 'youtube', text: 'Titre\nTexte' }])).json()).item;
    await runSchedule(env);
    await runSchedule(env);
    const na = await nets(a.id);
    assert.equal(na.tiktok.status, 'done');
    assert.match(na.tiktok.note, /Brouillon reçu par TikTok/);
    assert.equal(na.youtube.url, 'https://youtube.com/shorts/v42');
    await runSchedule(env);
    // Publication directe : compte relu, réglages vérifiés (visibilité obligatoire, contenu de marque jamais privé)
    const info = await (await worker('https://s.test/studio/api/tiktok-creator', { headers: key })).json();
    assert.deepEqual(info, { nickname: 'Benjy Paddock', username: 'benjypaddock', avatar: '', privacy: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], comment: true, duet: false, stitch: true, maxDuration: 600 });
    assert.equal((await add([{ network: 'tiktok', text: 'x' }], { title: 'x' })).status, 400);
    assert.equal((await add([{ network: 'tiktok', text: 'x' }], { privacy: 'SELF_ONLY', brandContent: true })).status, 400);
    const d = (await (await add([{ network: 'tiktok', text: 'Texte' }], { title: 'Mon titre #F1', privacy: 'PUBLIC_TO_EVERYONE', comment: true, brandOrganic: true, username: 'benjypaddock' })).json()).item;
    await runSchedule(env);
    assert.equal((await nets(d.id)).tiktok.url, 'https://www.tiktok.com/@benjypaddock/video/7123');
    assert.deepEqual(sent[0].post_info, { title: 'Mon titre #F1', privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, disable_duet: true, disable_stitch: true, brand_organic_toggle: true, brand_content_toggle: false });
    assert.equal(sent[0].source_info.video_size, 4);
    await runSchedule(env);
  } finally { globalThis.fetch = realFetch; }
  await disableStudio({ fetchFn });
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
  // Échec noté : pas de nouvelle demande à Jolpica avant 10 minutes
  const tried = urls.length;
  assert.equal((await seasonRow(env, 2026, { now: t0 + 32 * 60e3, fetchFn, wait })).at, t0);
  assert.equal(urls.length, tried);
  down = false;
  assert.equal((await seasonRow(env, 2026, { now: t0 + 42 * 60e3, fetchFn, wait })).at, t0 + 42 * 60e3);
});

test('Studio : saison gardée servie tout de suite jusqu\'à 6 h, sans attendre Jolpica', async () => {
  const env4 = { DB: fakeDB(), STUDIO_KEY_HASH: HASH };
  const w = (p) => studioApi(new Request(`https://s.test/studio/api/${p}`, { headers: { 'X-Studio-Key': studioKey(CODE) } }), env4, new URL(`https://s.test/studio/api/${p}`));
  assert.equal((await studioApi(new Request('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ key: studioKey(CODE), vault: {} }) }), env4, new URL('https://s.test/studio/api/init'))).status, 200);
  const empty = async () => new Response(JSON.stringify({ MRData: { total: '0', RaceTable: { Races: [] } } }));
  const at = Date.now() - 2 * 3600e3;
  await seasonRow(env4, 2026, { now: at, fetchFn: empty, wait: async () => {} });
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Jolpica lent'); };
  try {
    const r = await w('season?year=2026');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).at, at);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = real; }
});

test('Studio : résultats parus signalés une fois (post prêt), seulement pour un Grand Prix récent', async () => {
  const { resultsReady } = await import('../analytics/season-cache.js');
  const now = Date.parse('2026-10-19T22:00:00Z');
  const gp = (extra) => ({ round: 19, name: 'United States Grand Prix', date: '2026-10-19T19:00:00Z', results: [], quali: [], sprintResults: [], ...extra });
  const before = { races: [gp({ quali: [{ code: 'NOR' }] }), { ...gp({}), round: 1, date: '2026-03-08T04:00:00Z' }] };
  const after = { races: [gp({ quali: [{ code: 'NOR' }], results: [{ code: 'VER' }] }), { ...gp({ results: [{ code: 'NOR' }] }), round: 1, date: '2026-03-08T04:00:00Z' }] };
  assert.deepEqual(resultsReady(before, after, now), [{ title: 'Post prêt : résultats de la course', body: 'United States Grand Prix : à publier depuis le Studio', id: 'ready-19-course', url: '/studio/' }]);
  assert.deepEqual(resultsReady(after, after, now), []);
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

test('publications programmées : retard de plus de 5 minutes signalé une seule fois', async () => {
  const e = { DB: fakeDB(), STATS_KEY: 'secret-du-serveur' };
  const at = Date.now() - 6 * 60e3;
  e.DB.studio.set('sched:bbbbbbbbbbbbbbbb', JSON.stringify({ id: 'bbbbbbbbbbbbbbbb', at, title: 'Résultats', posts: [{ network: 'facebook', text: 'x' }], sets: {} }));
  await runSchedule(e, { now: at + 6 * 60e3 });
  assert.equal(e.DB.studio.get('schedpost:bbbbbbbbbbbbbbbb:late'), '1');
  // Trop tôt : rien
  e.DB.studio.set('sched:cccccccccccccccc', JSON.stringify({ id: 'cccccccccccccccc', at: Date.now(), title: 'Grille', posts: [{ network: 'facebook', text: 'x' }], sets: {} }));
  await runSchedule(e, { now: Date.now() + 60e3 });
  assert.equal(e.DB.studio.get('schedpost:cccccccccccccccc:late'), undefined);
});

test('journal des publications : deux réseaux qui finissent en même temps sont gardés tous les deux', async () => {
  const e = { DB: fakeDB(), STATS_KEY: 'secret-du-serveur' };
  const { _addHistory } = await import('../analytics/studio.js');
  const rec = { key: 'race-2026-19', kind: 'session', title: 'Résultats', at: Date.now() };
  // Lectures simultanées : la deuxième écriture voit que la ligne a changé et recommence
  await Promise.all([_addHistory(e, { ...rec, nets: { facebook: { id: 'f1', url: 'https://f.test/1' } } }), _addHistory(e, { ...rec, nets: { bluesky: { id: { uri: 'at://b', cid: 'c' }, url: 'https://b.test/1' } } })]);
  const h = JSON.parse(e.DB.studio.get('history'));
  assert.deepEqual(Object.keys(h[0].nets).sort(), ['bluesky', 'facebook']);
});

test('version web : la connexion F1 TV du créateur n\'est plus gardée pour le relais (ancienne copie effacée)', async () => {
  const key = { 'X-Studio-Key': studioKey(CODE) };
  env.DB.studio.set('live:f1tv', '{"iv":"x","ct":"y"}');   // copie d'une version précédente
  const r = await worker('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ key: studioKey(CODE), vault: { f1tv: 'e30.e30.sig' } }) });
  assert.equal(r.status, 200);
  assert.equal(env.DB.studio.get('live:f1tv'), '');
  // Séance du relais pour le Studio (relais absent ici : rien)
  assert.equal(await (await worker('https://s.test/studio/api/live-session', { headers: key })).json(), null);
});

test('onglet Suivi sans Google : tâches, journal et posts gardés par le serveur, clé des sessions Claude', async () => {
  const skey = { 'X-Studio-Key': studioKey(CODE) };
  const call = (p, init = {}, headers = skey) => worker(`https://s.test/studio/api/${p}`, { ...init, headers });
  assert.equal((await worker('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ key: studioKey(CODE), vault: {} }) })).status, 200);
  let d = await (await call('suivi')).json();
  assert.deepEqual(d.tasks, []);
  assert.equal(d.keySet, false);
  // Session sans clé, ou clé fausse : refusée
  assert.equal((await call('suivi', {}, { 'X-Suivi-Key': 'x'.repeat(48) })).status, 401);
  const { key } = await (await call('suivi/key', { method: 'POST' })).json();
  assert.equal(key.length, 48);
  assert.ok(![...env.DB.studio.values()].some((v) => String(v).includes(key)), 'seule l\'empreinte de la clé est gardée');
  const sess = { 'X-Suivi-Key': key };
  const post = (ops, h = sess) => call('suivi/ops', { method: 'POST', body: JSON.stringify({ ops }) }, h);
  let r = await post([
    { op: 'task.add', task: { list: 'À tester avant la version finale (1.30)', when: 'bêta 51', domain: 'Appli et site', title: 'Compte à rebours stable', detail: 'Barre du haut / secondes' } },
    { op: 'log.add', entry: { domain: 'Développement', text: 'PR #372 fusionnée', where: 'Fait' } },
    { op: 'posts.put', name: 'Week-end de Mexico · textes des posts', text: 'Week-end de Mexico\n1. LUNDI 2 NOVEMBRE · 12 H · REVIS LA COURSE\nTexte long :\nBonjour' },
  ]);
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.ids.length, 1);
  assert.equal(out.tasks[0].status, 'À faire');
  assert.match(out.log[0].date, /^\d{1,2}\/\d{1,2}\/\d{4}$/);
  // Réservé au Studio : nouvelle clé et remplissage ; opération inconnue ou tâche introuvable : rien d'écrit
  assert.equal((await call('suivi/key', { method: 'POST' }, sess)).status, 403);
  assert.equal((await post([{ op: 'task.set', id: 'inconnue', status: 'Fait' }])).status, 400);
  assert.equal((await post([{ op: 'task.add', task: { title: 'B' } }, { op: 'zut' }])).status, 400);
  // Coche du Studio par l'identifiant, ou d'une session par le titre : « Fait » avec la date du jour
  r = await post([{ op: 'task.set', id: 'Compte à rebours stable', status: 'Fait' }], skey);
  const t = (await r.json()).tasks[0];
  assert.equal(t.status, 'Fait');
  assert.ok(t.doneAt);
  d = await (await call('suivi', {}, sess)).json();
  assert.equal(d.tasks.length, 1, 'la liste refusée n\'a rien ajouté');
  assert.equal(d.posts[0].name, 'Week-end de Mexico · textes des posts');
  assert.equal(d.keySet, true);
  // Import (remplace la partie) puis remplissage des abonnés du lundi par le Studio
  const head = ['Lundi', 'Instagram', 'Total'];
  await post([{ op: 'part.put', part: 'net', data: { app: [head, ['19/10/2026', '3', '3']], posts: [], benjy: [], streamers: [] } }], skey);
  const accounts = [{ name: 'Paddock Live', nets: { instagram: { stats: { followers: 5 } } } }];
  r = await (await call('suivi/fill', { method: 'POST', body: JSON.stringify({ accounts }) })).json();
  assert.equal(r.cells, 2);
  const app = (await (await call('suivi/net')).json()).net.app;
  assert.deepEqual(app.at(-1).slice(1), [5, 5]);
  // Nouvelle clé : l'ancienne ne marche plus
  await call('suivi/key', { method: 'POST' });
  assert.equal((await call('suivi', {}, sess)).status, 401);
});

test('onglet Suivi : photos et vidéos des posts gardées par le serveur, adresse publique, effacées avec leur Grand Prix', async () => {
  const { suiviFile } = await import('../analytics/suivi.js');
  const skey = { 'X-Studio-Key': studioKey(CODE) };
  const call = (p, init = {}, headers = skey) => worker(`https://s.test/studio/api/${p}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const put = (gp, f, body, type = 'image/png') => call(`suivi/file?gp=${encodeURIComponent(gp)}&f=${encodeURIComponent(f)}`, { method: 'PUT', body, headers: { 'Content-Type': type, 'Content-Length': String(body.length) } });
  const gp = 'Week-end de Mexico · textes des posts';
  assert.equal((await put(gp, 'a.exe', new Uint8Array(10), 'application/x-msdownload')).status, 415);
  let r = await put(gp, 'mx-1.png', new Uint8Array([1, 2, 3]));
  assert.equal(r.status, 200);
  const f = (await r.json()).file;
  assert.match(f.url, /^\/studio\/f\/[a-f0-9]{16}\/mx-1\.png$/);
  // Adresse publique (sans clé), morceaux acceptés
  const got = await suiviFile(new Request(`https://s.test${f.url}`), env, f.url.slice(10));
  assert.equal(got.status, 200);
  assert.deepEqual([...new Uint8Array(await got.arrayBuffer())], [1, 2, 3]);
  assert.equal((await suiviFile(new Request('https://s.test/x'), env, 'zzzz/mx-1.png')).status, 404);
  // Même nom : remplacé (l'ancien fichier effacé) ; textes des posts envoyés ensuite : fichiers gardés
  await put(gp, 'mx-1.png', new Uint8Array([9]));
  assert.equal(env.MEDIA.objs.has(`suivi/${f.key}/mx-1.png`), false);
  await call('suivi/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'posts.put', name: gp, text: '1. LUNDI · TEST' }] }) });
  let doc = (await (await call('suivi/posts')).json()).posts.find((x) => x.name === gp);
  assert.equal(doc.files.length, 1);
  assert.equal(doc.text, '1. LUNDI · TEST');
  // Fichier retiré : effacé du stockage
  const key = doc.files[0].key;
  await call('suivi/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'file.del', name: gp, file: 'mx-1.png' }] }) });
  doc = (await (await call('suivi/posts')).json()).posts.find((x) => x.name === gp);
  assert.equal(doc.files.length, 0);
  assert.equal(env.MEDIA.objs.has(`suivi/${key}/mx-1.png`), false);
  // Lignes ajoutées à une table des réseaux
  await call('suivi/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'net.add', table: 'posts', rows: [['08/11/2026', '12:00', 'Instagram', 'Test']] }] }) });
  assert.equal((await (await call('suivi/net')).json()).net.posts.at(-1)[3], 'Test');
});

test('onglet Suivi : feuille « Suivi réseaux » remplie avec les chiffres du Studio', async () => {
  const { sheetUpdates, mondayParis } = await import('../analytics/suivi.js');
  const now = Date.UTC(2026, 9, 26, 8);   // lundi 26 octobre, 9 h à Paris
  assert.equal(mondayParis(now), '26/10/2026');
  assert.equal(mondayParis(Date.UTC(2026, 10, 1, 22, 59)), '26/10/2026');   // dimanche 23 h 59 à Paris
  const head = ['Lundi', 'Instagram', 'Facebook', 'TikTok', 'X', 'Threads', 'Bluesky', 'YouTube', 'Total', 'Gagnés depuis lundi dernier'];
  const tables = {
    'Abonnés Paddock Live': [head, ['19/10/2026', '1', '1', '', '', '', '', '', '5'], ['26/10/2026'], ['02/11/2026']],
    'Benjy Paddock': [[...head.slice(0, 9), 'Gagnés en une semaine', 'Meilleur post de la semaine', 'Vues du meilleur post'], ['26/10/2026', '7']],   // déjà rempli à la main : rien
    'Posts Paddock Live': [['Date', 'Heure', 'Réseau', 'Sujet', 'Lien du post', 'Vues', "J'aime", 'Commentaires'], ['24/10/2026', '12:00', 'Instagram', 'Zéro spoiler', 'https://www.instagram.com/p/ABC/?igsh=x', '10', '', ''], ['24/10/2026', '12:00', 'X', 'Zéro spoiler', '']],
  };
  const accounts = [{ name: 'Benjy Paddock', nets: { instagram: { stats: { followers: 3 } } } }, { name: 'Paddock Live', nets: { instagram: { stats: { followers: 4 } }, threads: { stats: { followers: 3 } }, x: { note: 'chiffres payants chez X' } } }];
  const history = [{ key: 'post:1', title: 'Zéro spoiler', at: now - 2 * 86400e3, nets: { instagram: { url: 'https://instagram.com/p/ABC' } } }];
  const kept = [{ key: 'post:1', at: now, stats: { instagram: { views: 221, likes: 18, comments: 2 } } }];
  const out = sheetUpdates(tables, accounts, { history, kept, now });
  assert.deepEqual(out, [
    { range: "'Abonnés Paddock Live'!B3", values: [[4]] },
    { range: "'Abonnés Paddock Live'!F3", values: [[3]] },
    { range: "'Abonnés Paddock Live'!I3", values: [[7]] },
    { range: "'Abonnés Paddock Live'!J3", values: [[2]] },
    { range: "'Posts Paddock Live'!F2", values: [[221]] },
    { range: "'Posts Paddock Live'!G2", values: [[18]] },
    { range: "'Posts Paddock Live'!H2", values: [[2]] },
  ]);
  // Semaine sans ligne dans la feuille : rien d'inventé
  assert.equal(sheetUpdates(tables, accounts, { now: Date.UTC(2026, 9, 20) }).length, 0);
  // Réseau en erreur ce lundi : ligne laissée vide (nouvel essai l'heure suivante) ; chiffre tapé à la main plus grand : gardé
  const down = [{ name: 'Paddock Live', nets: { ...accounts[1].nets, youtube: { error: 'invalid_grant' } } }];
  tables['Posts Paddock Live'][1][5] = '5000';
  assert.deepEqual(sheetUpdates(tables, down, { history, kept, now }).map((o) => o.range), ["'Posts Paddock Live'!G2", "'Posts Paddock Live'!H2"]);
});

test('Suivi : lien d\'un post prévu retrouvé dans le journal (même réseau, même jour, heure la plus proche)', async () => {
  const { sheetUpdates } = await import('../analytics/suivi.js');
  const paris = (h, m) => Date.UTC(2026, 9, 24, h - 2, m);   // 24 octobre, heure d'été à Paris
  const tables = { 'Posts Paddock Live': [['Date', 'Heure', 'Réseau', 'Sujet', 'Lien du post', 'Vues'],
    ['24/10/2026', '', 'Instagram Reels', 'Vidéo'], ['24/10/2026', '12:00', 'Instagram', 'Zéro spoiler'], ['24/10/2026', '12:00', 'X', 'Zéro spoiler'], ['25/10/2026', '19:00', 'Instagram', 'Règle ton délai']] };
  const history = [
    { key: 'reel', at: paris(18, 30), nets: { instagram: { url: 'https://www.instagram.com/reel/R/' } } },
    { key: 'imp', at: paris(12, 4), nets: { instagram: { url: 'https://www.instagram.com/p/P/' }, facebook: { url: 'https://facebook.com/1' } } },
  ];
  const kept = [{ key: 'imp', at: paris(13, 0), stats: { instagram: { views: 90 } } }];
  assert.deepEqual(sheetUpdates(tables, [], { history, kept }), [
    { range: "'Posts Paddock Live'!E3", values: [['https://www.instagram.com/p/P/']] },
    { range: "'Posts Paddock Live'!F3", values: [[90]] },
    { range: "'Posts Paddock Live'!E2", values: [['https://www.instagram.com/reel/R/']] },
  ]);
});

test('page du créateur : connexions expirées signalées avant de publier (YouTube refusé, TikTok injoignable, Threads)', async () => {
  const env2 = { DB: fakeDB(), MEDIA: fakeR2(), STUDIO_KEY_HASH: HASH, STATS_KEY: 's' };
  const w = (p, init = {}) => studioApi(new Request(`https://s.test/studio/api/${p}`, init), env2, new URL(`https://s.test/studio/api/${p}`));
  const vault = {
    youtube: { clientId: 'yt.apps', clientSecret: 'secret-google', refreshToken: 'rt-yt', accessToken: 'a', expiresAt: 0 },
    tiktok: { clientKey: 'ck', clientSecret: 'secret-tiktok', refreshToken: 'rt-tk', accessToken: 'b', expiresAt: 0, openId: 'o1' },
    threads: { token: 'th', userId: 'u1', username: 'benjypaddock', expiresAt: Date.now() - 1000 },
  };
  assert.equal((await w('init', { method: 'POST', body: JSON.stringify({ key: studioKey(CODE), vault }) })).status, 200);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 });
    if (u.includes('tiktokapis.com')) throw new TypeError('fetch failed');
    if (u.includes('threads.net')) return new Response(JSON.stringify({ error: { message: 'Session has expired', code: 190 } }), { status: 400 });
    throw new Error(`inattendu : ${u}`);
  };
  try {
    const r = await (await w('accounts/check', { headers: { 'X-Studio-Key': studioKey(CODE) } })).json();
    assert.match(r.youtube, /Connexion YouTube expirée.*Renvoyer les comptes.*7 jours/);
    assert.equal(r.tiktok, undefined, 'réseau injoignable : pas annoncé comme expiré');
    assert.match(r.threads, /Connexion Threads expirée/);
  } finally { globalThis.fetch = realFetch; }
});

test('page du créateur : « Reste à faire » (X avec ses images, fichiers refusés, fait = effacé, 7 jours au plus)', async () => {
  const env3 = { DB: fakeDB(), MEDIA: fakeR2(), STUDIO_KEY_HASH: HASH, STATS_KEY: 's' };
  const w = (p, init = {}) => studioApi(new Request(`https://s.test/studio/api/${p}`, { ...init, headers: { 'X-Studio-Key': studioKey(CODE), ...init.headers } }), env3, new URL(`https://s.test/studio/api/${p}`));
  assert.equal((await studioApi(new Request('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ key: studioKey(CODE), vault: {} }) }), env3, new URL('https://s.test/studio/api/init'))).status, 200);
  const form = (kind, files = []) => { const f = new FormData(); f.append('kind', kind); f.append('title', 'Publier sur X : Essai'); f.append('text', 'Texte du post'); f.append('after', String(Date.now() + 3600e3)); files.forEach((x) => f.append('f', x, x.name)); return f; };
  const img = new File([new Uint8Array([0xff, 0xd8, 1, 2])], 'x-1.jpg', { type: 'image/jpeg' });
  const r = await (await w('todo', { method: 'POST', body: form('x', [img, img]) })).json();
  assert.equal(r.item.kind, 'x');
  assert.ok(r.item.after > Date.now());
  assert.equal(env3.MEDIA.objs.size, 2);
  assert.equal((await w('todo', { method: 'POST', body: form('inconnu') })).status, 400);
  assert.equal((await w('todo', { method: 'POST', body: form('x', [new File(['a'], 'a.gif', { type: 'image/gif' })]) })).status, 400);
  const f0 = await w(`todo/file?id=${r.item.id}&i=1`);
  assert.deepEqual([...new Uint8Array(await f0.arrayBuffer())], [0xff, 0xd8, 1, 2]);
  assert.equal((await w('todo/file?id=../x&i=0')).status, 404);
  assert.equal((await (await w('todo')).json()).items.length, 1);
  const done = await (await w('todo/done', { method: 'POST', body: JSON.stringify({ id: r.item.id }) })).json();
  assert.deepEqual(done.items, []);
  assert.equal(env3.MEDIA.objs.size, 0, 'fichiers effacés avec la tâche');
  // Tâche de plus de 7 jours : effacée à la lecture
  env3.DB.studio.set('todo', JSON.stringify([{ id: 'a'.repeat(16), kind: 'tiktok', title: 'Vieux', text: '', after: 0, at: Date.now() - 8 * 86400e3, files: [] }]));
  assert.deepEqual((await (await w('todo')).json()).items, []);
});
