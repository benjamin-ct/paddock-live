import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionReminders, resultMessages, pushRun, queuePush, publicPushApi } from '../analytics/push-public.js';

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

// Base réduite aux requêtes des alertes
function fakeDB() {
  const subs = new Map(), out = [], sent = new Set();
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
        if (/FROM studio WHERE k/.test(sql)) return a[0] === 'vapid' ? null : null;
        if (/FROM ai_usage/.test(sql)) return null;
        return col ? null : null;
      },
      async all() {
        const list = [...subs.values()].filter((s) => `,${s.topics},`.includes(a[0]) && s.endpoint > a[1]).sort((x, y) => (x.endpoint < y.endpoint ? -1 : 1)).slice(0, a[2]);
        return { results: list };
      },
      async run() {
        if (/INTO push_sent/.test(sql)) { if (sent.has(a[0])) return { meta: { changes: 0 } }; sent.add(a[0]); return { meta: { changes: 1 } }; }
        if (/INTO push_out/.test(sql)) out.push({ id: ++id, topic: a[0], msg: a[1], cursor: '', at: a[2] });
        else if (/DELETE FROM push_out WHERE id/.test(sql)) out.splice(out.findIndex((j) => j.id === a[0]), 1);
        else if (/UPDATE push_out SET cursor/.test(sql)) out.find((j) => j.id === a[1]).cursor = a[0];
        else if (/INTO push_subs/.test(sql)) subs.set(a[0], { endpoint: a[0], p256dh: a[1], auth: a[2], topics: a[3], lang: a[4] });
        else if (/DELETE FROM push_subs/.test(sql)) subs.delete(a[0]);
        return { meta: { changes: 1 } };
      },
    };
    return st;
  };
  return { subs, out, prepare };
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
