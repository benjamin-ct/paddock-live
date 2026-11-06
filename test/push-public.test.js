import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionReminders, resultMessages, pushRun, queuePush, publicPushApi, eveReminders, eveZones, cleanTz, morningDigests } from '../analytics/push-public.js';

const season = { races: [{ round: 19, name: 'United States Grand Prix', date: '2026-10-25T19:00:00Z', sessions: [{ label: 'Qualifications', t: '2026-10-24T21:00:00Z' }, { label: 'Course', t: '2026-10-25T19:00:00Z' }] }] };

test('alertes du téléphone : rappel 30 minutes avant une séance, une fois, en français et en anglais', () => {
  const at = (iso) => Date.parse(iso);
  assert.deepEqual(sessionReminders(season, at('2026-10-24T20:00:00Z')), []);   // 1 h avant : trop tôt
  const r = sessionReminders(season, at('2026-10-24T20:31:00Z'));
  assert.equal(r.length, 1);
  assert.equal(r[0].msg.fr.title, 'Qualifications dans 30 minutes');
  assert.equal(r[0].msg.fr.body, 'Grand Prix des États-Unis');
  assert.equal(r[0].msg.en.title, 'Qualifying in 30 minutes');
  assert.equal(sessionReminders(season, at('2026-10-24T20:50:00Z')).length, 0);   // moins de 20 minutes : trop tard
});

test('alertes du téléphone : résultats parus depuis la lecture précédente seulement', () => {
  const now = Date.parse('2026-10-25T21:00:00Z');
  const before = { races: [{ ...season.races[0], results: [], quali: [{ name: 'Lando Norris' }], sprintResults: [] }] };
  const after = { races: [{ ...season.races[0], results: [{ name: 'Max Verstappen' }], quali: [{ name: 'Lando Norris' }], sprintResults: [] }] };
  const m = resultMessages(before, after, now);
  assert.deepEqual(m.map((x) => x.msg.fr.title), ['Victoire de Max Verstappen']);
  assert.equal(m[0].msg.en.title, 'Max Verstappen wins');
});

test('alertes du téléphone : la veille à 21 h, séances entre minuit et 7 h chez l\'abonné (Las Vegas)', () => {
  const vegas = { races: [{ round: 22, name: 'Las Vegas Grand Prix', sessions: [{ label: 'Qualifications', t: '2026-11-21T04:00:00Z' }, { label: 'Course', t: '2026-11-22T04:00:00Z' }] }] };
  const tzs = ['Europe/Paris', 'America/New_York', 'Asia/Tokyo'];
  const r = eveReminders(vegas, tzs, Date.parse('2026-11-20T20:03:00Z'));   // 21 h 03 à Paris
  assert.equal(r.length, 1);
  assert.equal(r[0].topic, 'sessions,tz@Europe/Paris');
  assert.equal(r[0].k, 'eve:Europe/Paris:2026-11-20');
  assert.equal(r[0].msg.fr.title, 'Cette nuit : Qualifications à 5 h');
  assert.equal(r[0].msg.fr.body, 'Grand Prix de Las Vegas · rappel 30 minutes avant');
  assert.equal(r[0].msg.en.title, 'Overnight: Qualifying at 5:00 am');
  assert.equal(eveReminders(vegas, tzs, Date.parse('2026-11-20T20:12:00Z')).length, 0, 'après 21 h 10 : plus de rappel');
  assert.equal(eveReminders(vegas, ['America/New_York'], Date.parse('2026-11-21T02:00:00Z')).length, 0, 'New York : 23 h le jour même, pas la nuit');
  assert.equal(eveReminders({ races: [] }, tzs, Date.parse('2026-11-20T20:03:00Z')).length, 0);
  assert.equal(cleanTz('Europe/Paris'), 'Europe/Paris');
  for (const bad of ['Mars/Olympus', 'UTC', '../x', 'Europe/Paris,news', 42]) assert.equal(cleanTz(bad), null, String(bad));
});

// Base réduite aux requêtes des alertes
function fakeDB() {
  const subs = new Map(), out = [], sent = new Set(), kv = new Map();
  let id = 0;
  const prepare = (sql) => {
    let a = [];
    const st = {
      bind(...x) { a = x; return st; },
      async first(col) {
        if (/FROM push_out ORDER BY id/.test(sql)) return out[0] || null;
        if (/SELECT 1 FROM push_out/.test(sql)) return out[0] ? { 1: 1 } : null;
        if (/COUNT\(\*\) AS n FROM push_subs WHERE/.test(sql)) return { n: [...subs.values()].filter((s) => `,${s.topics},`.includes(a[0])).length };
        if (/COUNT\(\*\) AS n FROM push_subs/.test(sql)) return { n: subs.size };
        if (/SELECT 1 FROM push_subs/.test(sql)) return subs.has(a[0]) ? { 1: 1 } : null;
        if (/FROM push_subs WHERE endpoint/.test(sql)) return subs.get(a[0]) || null;
        if (/FROM studio WHERE k = /.test(sql) && kv.has(a[0])) return col ? kv.get(a[0]).v : kv.get(a[0]);
        if (/FROM studio WHERE k/.test(sql)) return null;
        if (/FROM ai_usage/.test(sql)) return null;
        return col ? null : null;
      },
      async all() {
        if (/DISTINCT substr/.test(sql)) return { results: [...new Set([...subs.values()].filter((s) => s.topics.includes(a[0]) && `,${s.topics},`.includes(',sessions,')).map((s) => s.topics.slice(s.topics.indexOf(a[0]) + 3)))].map((tz) => ({ tz })) };
        if (/FROM studio WHERE k >=/.test(sql)) return { results: [...kv.entries()].filter(([k]) => k.startsWith('night:')).map(([k, v]) => ({ k, ...v })) };
        const list = [...subs.values()].filter((s) => `,${s.topics},`.includes(a[0]) && `,${s.topics},`.includes(a[3]) && s.endpoint > a[1]).sort((x, y) => (x.endpoint < y.endpoint ? -1 : 1)).slice(0, a[2]);
        return { results: list };
      },
      async run() {
        if (/INTO push_sent/.test(sql)) { if (sent.has(a[0])) return { meta: { changes: 0 } }; sent.add(a[0]); return { meta: { changes: 1 } }; }
        if (/INTO push_out/.test(sql)) out.push({ id: ++id, topic: a[0], msg: a[1], cursor: '', at: a[2] });
        else if (/DELETE FROM push_out WHERE id/.test(sql)) out.splice(out.findIndex((j) => j.id === a[0]), 1);
        else if (/UPDATE push_out SET cursor/.test(sql)) out.find((j) => j.id === a[1]).cursor = a[0];
        else if (/INTO push_subs/.test(sql)) subs.set(a[0], { endpoint: a[0], p256dh: a[1], auth: a[2], topics: a[3], lang: a[4] });
        else if (/DELETE FROM push_subs/.test(sql)) subs.delete(a[0]);
        else if (/INTO studio/.test(sql)) kv.set(a[0], { v: a[1], at: a[2] });
        else if (/DELETE FROM studio WHERE k/.test(sql)) kv.delete(a[0]);
        return { meta: { changes: 1 } };
      },
    };
    return st;
  };
  return { subs, out, kv, prepare };
}

test('alertes du téléphone : abonnement vérifié, file envoyée par lots, abonnements disparus retirés', async () => {
  const DB = fakeDB();
  const kv = new Map();
  DB.prepare = ((orig) => (sql) => {
    if (/FROM studio WHERE k/.test(sql)) return { bind: (k) => ({ first: async () => (kv.has(k) ? { v: kv.get(k) } : null) }) };
    if (/INTO studio/.test(sql)) return { bind: (k, v) => ({ run: async () => { kv.set(k, v); } }) };
    return orig(sql);
  })(DB.prepare);
  const env = { DB };
  const post = (path, body) => publicPushApi(new Request(`https://p.test/a/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, path);
  // Clés d'un vrai téléphone (format) : clé publique P-256 de 65 octets, secret de 16 octets
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh, auth } });
  assert.equal((await post('sub', { subscription: { endpoint: 'https://pirate.example/x', keys: { p256dh, auth } }, topics: ['news'] })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await post('sub', { subscription: sub(i), topics: i === 4 ? ['news'] : ['sessions', 'news', 'inconnu'], lang: i === 1 ? 'en' : 'fr' })).status, 200);
  assert.equal(DB.subs.get(sub(0).endpoint).topics, 'sessions,news');
  // Fuseau gardé avec le rappel des séances seulement (sujet interne en dernier), jamais renvoyé à la page
  const withTz = await (await post('sub', { subscription: sub(5), topics: ['sessions'], lang: 'fr', tz: 'Europe/Paris' })).json();
  assert.deepEqual(withTz.topics, ['sessions']);
  assert.equal(DB.subs.get(sub(5).endpoint).topics, 'sessions,tz@Europe/Paris');
  await post('sub', { subscription: sub(6), topics: ['news'], tz: 'Asia/Tokyo' });
  await post('sub', { subscription: sub(7), topics: ['sessions'], tz: 'Pas/Un,fuseau' });
  assert.equal(DB.subs.get(sub(6).endpoint).topics, 'news,tz@Asia/Tokyo');
  assert.equal(DB.subs.get(sub(7).endpoint).topics, 'sessions');
  assert.deepEqual(await eveZones(env), ['Europe/Paris'], 'Tokyo : pas abonné aux séances');
  for (const i of [5, 6, 7]) await post('sub', { subscription: sub(i), topics: [] });
  assert.equal((await (await publicPushApi(new Request('https://p.test/a/key'), env, 'key')).json()).key.length, 87);

  assert.equal(await queuePush(env, 'remind:x', 'sessions', { fr: { title: 'Course dans 30 minutes', body: 'GP' }, en: { title: 'Race in 30 minutes', body: 'GP' }, url: '/alertes/' }), true);
  assert.equal(await queuePush(env, 'remind:x', 'sessions', { fr: {}, en: {} }), false, 'pas deux fois le même rappel');
  const calls = [];
  const fetchFn = async (u) => { calls.push(u); return new Response(null, { status: u.endsWith('abc2') ? 410 : 201 }); };
  let r = await pushRun(env, { fetchFn, batch: 2 });
  assert.deepEqual([r.sent, r.more], [2, true]);
  r = await pushRun(env, { fetchFn, batch: 2 });
  assert.deepEqual([r.sent, r.gone, r.more], [1, 1, true]);
  r = await pushRun(env, { fetchFn, batch: 2 });
  assert.deepEqual([r.sent, r.more], [0, false]);
  assert.equal(DB.out.length, 0, 'message fini : retiré de la file');
  assert.equal(calls.length, 4, 'abonné aux grosses news seulement : pas de rappel');
  assert.equal(DB.subs.has(sub(2).endpoint), false, 'abonnement disparu (410) retiré');
  // Aucun sujet : désabonné
  await post('sub', { subscription: sub(0), topics: [] });
  assert.equal(DB.subs.has(sub(0).endpoint), false);
});

test('alertes du téléphone : grosses news de la nuit gardées et regroupées à 7 h chez l\'abonné', async () => {
  const DB = fakeDB();
  const env = { DB };
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const add = (n, topics, lang = 'fr') => DB.subs.set(`https://fcm.googleapis.com/fcm/send/n${n}`, { endpoint: `https://fcm.googleapis.com/fcm/send/n${n}`, p256dh, auth, topics, lang });
  add(1, 'news,tz@Europe/Paris');        // 3 h du matin à Paris
  add(2, 'news,tz@America/New_York');    // 21 h à New York
  add(3, 'news');                        // fuseau inconnu : envoyé tout de suite
  const calls = [];
  const fetchFn = async (u) => { calls.push(u); return new Response(null, { status: 201 }); };
  const night = Date.parse('2026-11-20T02:00:00Z');
  const news = (i, title) => ({ fr: { title: 'Officiel · FIA', body: title }, en: { title: 'FIA', body: title }, url: `https://example.com/${i}` });
  await queuePush(env, 'news:a', 'news', news(1, 'Première news'), night);
  await pushRun(env, { fetchFn, now: night });
  await queuePush(env, 'news:b', 'news', news(2, 'Seconde news'), night + 3600e3);
  await pushRun(env, { fetchFn, now: night + 3600e3 });
  assert.deepEqual(calls.map((u) => u.slice(-2)).sort(), ['n2', 'n2', 'n3', 'n3'], 'Paris dort : rien envoyé (envois en parallèle : ordre libre)');
  assert.equal(JSON.parse(DB.kv.get('night:Europe/Paris').v).length, 2);
  // 6 h 30 à Paris : pas encore
  await morningDigests(env, Date.parse('2026-11-20T05:30:00Z'));
  assert.equal(DB.out.length, 0);
  // 7 h 00 à Paris : un seul message, pour Paris seulement
  await morningDigests(env, Date.parse('2026-11-20T06:00:00Z'));
  assert.equal(DB.kv.has('night:Europe/Paris'), false);
  assert.equal(DB.out.length, 1);
  assert.equal(DB.out[0].topic, 'news,tz@Europe/Paris');
  const m = JSON.parse(DB.out[0].msg);
  assert.equal(m.fr.title, 'Cette nuit : 2 grosses news');
  assert.equal(m.fr.body, 'Première news · Seconde news');
  assert.equal(m.en.title, 'Overnight: 2 big stories');
  calls.length = 0;
  await pushRun(env, { fetchFn, now: Date.parse('2026-11-20T06:00:00Z') });
  assert.deepEqual(calls.map((u) => u.slice(-2)), ['n1']);
});

test('alertes du téléphone : lots enchaînés dans la minute tant qu\'il en reste (appels du Worker à lui-même)', async () => {
  const { publicPush } = await import('../analytics/worker.js');
  let queue = 7;   // lots en file
  const DB = { prepare: (sql) => ({ bind: () => ({ first: async () => null }), first: async () => (/push_out/.test(sql) && queue > 0 ? { 1: 1 } : null) }) };
  let calls = 0;
  const env = { DB, STATS_KEY: 'k', SELF: { fetch: async () => { calls++; queue--; return new Response('{}'); } } };
  await publicPush(env, Date.now());
  assert.deepEqual([calls, queue], [7, 0]);   // tous partis, puis arrêt
  // Au plus 40 s par minute : la suite à la minute d'après
  queue = 100;
  calls = 0;
  let t = 0;
  await publicPush(env, Date.now(), () => (t += 15e3));
  assert.ok(calls >= 1 && calls <= 3, `${calls} lots`);
  // Appel refusé : arrêt aussitôt
  queue = 5;
  calls = 0;
  env.SELF.fetch = async () => { calls++; return new Response('', { status: 429 }); };
  await publicPush(env, Date.now());
  assert.equal(calls, 1);
});
