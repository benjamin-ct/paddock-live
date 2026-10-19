import test from 'node:test';
import assert from 'node:assert/strict';
import { newsAlerts, pushApi, encryptPush, validSubscription, vapidKeys } from '../analytics/alerts.js';
import { DEFAULT_SOURCES, feedUrl } from '../shared/news-sources.js';

function fakeDB() {
  const studio = new Map();
  return {
    studio,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { if (/FROM studio WHERE k/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null; throw new Error(sql); },
        async run() { if (/^INSERT INTO studio \(/.test(sql)) { studio.set(args[0], args[1]); return {}; } throw new Error(sql); },
      };
      return st;
    },
  };
}

const b64url = (b) => Buffer.from(b).toString('base64url');
const enc = new TextEncoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, n) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}

// Téléphone simulé : clés du navigateur et déchiffrement comme le fait le navigateur (RFC 8291)
async function phone(endpoint = 'https://fcm.googleapis.com/fcm/send/abc123') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint, keys: { p256dh: b64url(pub), auth: b64url(auth) } };
  const decrypt = async (body) => {
    const salt = body.slice(0, 16);
    assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
    const as = body.slice(21, 21 + body[20]);
    const asKey = await crypto.subtle.importKey('raw', as, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, pair.privateKey, 256));
    const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), pub, as), 32);
    const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12) }, cek, body.slice(21 + body[20])));
    assert.equal(plain.at(-1), 2);
    return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
  };
  return { sub, decrypt };
}

async function checkVapid(header, pub, endpoint) {
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, pub);
  const [h, p, s] = jwt.split('.');
  const key = await crypto.subtle.importKey('raw', Buffer.from(pub, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(s, 'base64url'), enc.encode(`${h}.${p}`)), 'signature VAPID');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.aud, new URL(endpoint).origin);
  assert.match(claims.sub, /^https:\/\//);
}

const NOW = Date.parse('2026-10-16T12:00:00Z');
const rss = (items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>x</title>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><description>${i.desc || ''}</description><pubDate>${new Date(i.t).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
const F1_URL = feedUrl(DEFAULT_SOURCES.find((s) => s.id === 'f1'));
const FIA_URL = feedUrl(DEFAULT_SOURCES.find((s) => s.id === 'fia-news'));

test('alertes : abonnements vérifiés (services de notification connus seulement)', async () => {
  const { sub } = await phone();
  assert.ok(validSubscription(sub));
  assert.ok(validSubscription({ ...sub, endpoint: 'https://web.push.apple.com/QGuQyavXutnMH' }));
  assert.ok(!validSubscription({ ...sub, endpoint: 'https://evil.example/push' }));
  assert.ok(!validSubscription({ ...sub, endpoint: 'http://fcm.googleapis.com/x' }));
  assert.ok(!validSubscription({ ...sub, keys: { ...sub.keys, auth: 'AAAA' } }));
});

test('alertes : message chiffré pour le téléphone, lisible par lui seul', async () => {
  const { sub, decrypt } = await phone();
  const body = await encryptPush(sub, JSON.stringify({ title: 'Été', body: 'Pénalité' }));
  assert.deepEqual(await decrypt(body), { title: 'Été', body: 'Pénalité' });
});

test('alertes : relevé des flux, grosse news envoyée une seule fois, abonnement disparu retiré', async () => {
  const env = { DB: fakeDB() };
  const api = (path, method = 'GET', body) => pushApi(path, new Request('https://s.test/', { method, body: body && JSON.stringify(body) }), env);
  // Personne d'abonné : aucun flux relevé
  let fetched = 0;
  assert.deepEqual(await newsAlerts(env, { fetchFn: async () => { fetched++; return new Response(''); }, now: NOW }), { skipped: 'no-subscriber' });
  assert.equal(fetched, 0);

  const { sub, decrypt } = await phone();
  assert.equal((await api('push', 'POST', { subscription: { ...sub, endpoint: 'https://evil.example/x' } })).status, 400);
  assert.equal((await (await api('push', 'POST', { subscription: sub })).json()).count, 1);
  const { key } = await (await api('push')).json();
  assert.equal(key, (await vapidKeys(env)).pub);

  const pushes = [];
  const feeds = {
    [F1_URL]: rss([
      { title: 'Verstappen disqualified from the Mexico City Grand Prix', link: 'https://www.formula1.com/a/dsq', t: NOW - 30 * 60e3 },
      { title: 'Pirelli tyre choices for Brazil', link: 'https://www.formula1.com/a/tyres', t: NOW - 20 * 60e3 },
      { title: 'Williams reveal special livery for Las Vegas', link: 'https://www.formula1.com/a/livery', t: NOW - 25 * 60e3 },
      { title: 'Official: Hamilton signs new contract', link: 'https://www.formula1.com/a/old', t: NOW - 30 * 3600e3 },
    ]),
    // Autre championnat de la FIA : pas d'alerte
    [FIA_URL]: rss([{ title: 'Entry lists confirmed for the FIA World Cup at the Macau Grand Prix', link: 'https://www.fia.com/news/macau', t: NOW - 10 * 60e3 }]),
  };
  const fetchFn = async (url, init) => {
    if (url === sub.endpoint) { pushes.push(init); return new Response(null, { status: 201 }); }
    return feeds[url] ? new Response(feeds[url], { headers: { 'Content-Type': 'application/rss+xml' } }) : new Response('', { status: 404 });
  };
  const r = await newsAlerts(env, { fetchFn, now: NOW });
  assert.equal(r.alerts, 2);   // nouvelle F1 importante et récente, et livrée spéciale, seulement
  assert.equal(pushes.length, 2);
  assert.equal(pushes[0].headers['Content-Encoding'], 'aes128gcm');
  await checkVapid(pushes[0].headers.Authorization, key, sub.endpoint);
  const msg = await decrypt(new Uint8Array(pushes[0].body));
  assert.equal(msg.body, 'Verstappen disqualified from the Mexico City Grand Prix');   // pas de traduction sans Workers AI
  assert.match(msg.title, /Formula 1|F1/);
  assert.equal(msg.url, `/studio/?alert=${encodeURIComponent(msg.id)}`);
  const alerts = (await (await api('alerts')).json()).items;
  assert.equal(alerts[0].id, msg.id);
  assert.equal(alerts[0].link, 'https://www.formula1.com/a/dsq');

  assert.equal(alerts[1].link, 'https://www.formula1.com/a/livery');
  // Mêmes nouvelles reprises au passage suivant : pas de deuxième alerte
  assert.equal((await newsAlerts(env, { fetchFn, now: NOW + 5 * 60e3 })).sent, 0);
  assert.equal(pushes.length, 2);

  // Téléphone désabonné du côté du navigateur (410) : abonnement retiré
  feeds[F1_URL] = rss([{ title: 'Ferrari team principal leaves the team', link: 'https://www.formula1.com/a/tp', t: NOW + 9 * 60e3 }]);
  const gone = async (url, init) => (url === sub.endpoint ? new Response(null, { status: 410 }) : fetchFn(url, init));
  await newsAlerts(env, { fetchFn: gone, now: NOW + 10 * 60e3 });
  assert.equal((await (await api('push')).json()).count, 0);
});
