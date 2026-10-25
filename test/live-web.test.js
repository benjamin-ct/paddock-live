import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { LiveRelay, KEEP_MS, liveApi, pairSend } from '../analytics/live-relay.js';
import { WebHub } from '../analytics/live-page/web-hub.js';
import { applyEvent, createDerived } from '../shared/derive.js';

const fakeClient = () => ({ got: [], send(s) { this.got.push(JSON.parse(s)); } });
const snapshot = (key, lap) => JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: { Key: key, Name: 'Race', Meeting: { Name: 'Mexico City Grand Prix' } }, LapCount: { CurrentLap: lap, TotalLaps: 71 }, 'Position.z': 'xx' } });
const feed = (topic, data) => JSON.stringify({ type: 1, target: 'feed', arguments: [topic, data] });

test('relais web : état de la séance, messages groupés, messages anciens intégrés à la base', () => {
  const relay = new LiveRelay({}, {});
  const c = fakeClient();
  relay.clients.add(c);
  const t0 = 1e12;
  relay.onFrame(snapshot(10, 1), t0);
  const hello = c.got.at(-1);
  assert.equal(hello.type, 'hello');
  assert.equal(hello.keep, KEEP_MS);
  assert.equal(hello.status.session, 'Mexico City Grand Prix — Race');
  assert.equal(hello.base.state.LapCount.CurrentLap, 1);
  assert.equal('Position' in hello.base.state, false);   // GPS à part, compressé tel quel
  assert.deepEqual(hello.stream, []);
  assert.deepEqual(relay.stream, [['Position', 'xx', t0]]);

  relay.onFrame(feed('LapCount', { CurrentLap: 2 }), t0 + 1000);
  relay.onFrame(feed('CarData.z', 'xx'), t0 + 1100);
  relay.onFrame(feed('LapCount', { CurrentLap: 3 }), t0 + 2000);
  relay.flush();
  assert.deepEqual(c.got.at(-1), { type: 'evs', events: [['LapCount', { CurrentLap: 2 }, t0 + 1000], ['LapCount', { CurrentLap: 3 }, t0 + 2000]], stream: [['Position', 'xx', t0], ['CarData', 'xx', t0 + 1100]] });
  assert.equal(relay.status.authenticated, true);
  assert.deepEqual(relay.streamBetween(t0 + 500, t0 + 2000), [['CarData', 'xx', t0 + 1100]]);
  relay.flush();
  assert.equal(c.got.length, 2);   // rien de nouveau : rien d'envoyé

  relay.roll(t0 + 1500 + KEEP_MS);
  assert.equal(relay.base.state.LapCount.CurrentLap, 2);
  assert.equal(relay.recent.length, 1);
  relay.hello(c, t0 + 1000);
  assert.equal(c.got.at(-1).base.state.LapCount.CurrentLap, 2);
  assert.equal(c.got.at(-1).stream.length, 1);
  assert.equal(c.got.at(-1).events.length, 1);

  // Nouvelle séance : on repart de zéro
  relay.reconnectLater = () => { relay.reconnected = true; };
  relay.onFrame(feed('SessionInfo', { Key: 11 }), t0 + 3000);
  assert.equal(relay.reconnected, true);
  relay.onFrame(snapshot(11, 0), t0 + 4000);
  assert.equal(c.got.at(-1).type, 'hello');
  assert.equal(c.got.at(-1).base.state.SessionInfo.Key, 11);
  assert.deepEqual(c.got.at(-1).events, []);
});

test('version web : délai TV appliqué dans le navigateur, comme le serveur local', () => {
  const shown = [];
  let state = null;
  const hub = new WebHub({
    apply: applyEvent,
    reset: (m) => { shown.push('reset'); state = m.state; },
    batch: (m) => { shown.push(m.events.length); for (const e of m.events) applyEvent(state, createDerived(), ...e); },
  });
  const t0 = 1e12;
  const base = { t: t0, state: {}, derived: createDerived() };
  applyEvent(base.state, base.derived, '__snapshot', { LapCount: { CurrentLap: 1 } }, t0);
  hub.hello({ base, keep: KEEP_MS, events: [['LapCount', { CurrentLap: 2 }, t0 + 1000]] });
  hub.push([['LapCount', { CurrentLap: 3 }, t0 + 2000], ['LapCount', { CurrentLap: 4 }, t0 + 3000]]);
  assert.equal(hub.start(), t0);

  hub.tick(t0 + 1500);
  assert.equal(state.LapCount.CurrentLap, 2);
  hub.tick(t0 + 3000);
  assert.equal(state.LapCount.CurrentLap, 4);
  assert.deepEqual(shown, ['reset', 2]);
  hub.tick(t0 + 1200);   // délai allongé : retour en arrière
  assert.equal(state.LapCount.CurrentLap, 2);
  assert.equal(base.state.LapCount.CurrentLap, 1);   // la base n'est jamais modifiée par l'affichage

  hub.tick(t0 + 3000);
  hub.roll(t0 + 2500 + KEEP_MS);
  assert.equal(hub.base.state.LapCount.CurrentLap, 3);
  assert.equal(hub.events.length, 1);
  hub.push([['LapCount', { CurrentLap: 5 }, t0 + 4000]]);
  hub.tick(t0 + 4000);
  assert.equal(state.LapCount.CurrentLap, 5);
});

test('relais web : séance commencée sans GPS malgré la connexion F1 TV, une nouvelle connexion (une fois)', () => {
  const relay = new LiveRelay({}, {});
  const t0 = 1e12;
  relay.key = 10;
  relay.token = 'jeton';
  relay.connectedAt = t0;
  relay.lastTimingAt = t0 + 50000;
  assert.equal(relay.gpsRetry(t0 + 55000), false);
  assert.equal(relay.gpsRetry(t0 + 61000), true);
  relay.lastTimingAt = t0 + 120000;
  assert.equal(relay.gpsRetry(t0 + 125000), false);   // déjà essayé pour cette séance
  relay.token = null;
  relay.key = 11;
  assert.equal(relay.gpsRetry(t0 + 125000), false);   // sans connexion F1 TV : rien à espérer
});

test('version web : GPS et télémétrie décompressés, envoyés un peu en avance, plus anciens demandés au relais', async () => {
  const z = (o) => zlib.deflateRawSync(Buffer.from(JSON.stringify(o))).toString('base64');
  const got = [];
  const asked = [];
  const hub = new WebHub({
    apply: applyEvent, reset: (m) => got.push(['reset', m.stream.map((s) => s[2])]), batch: (m) => got.push(['batch', m.stream.map((s) => s[2])]),
    inflate: async (raw) => JSON.parse(zlib.inflateRawSync(Buffer.from(raw, 'base64')).toString()), ask: (from, to) => asked.push([from, to]),
  });
  const t0 = 1e12;
  hub.hello({ base: { t: t0, state: {}, derived: createDerived() }, keep: KEEP_MS, events: [], stream: [['Position', z({ Position: [] }), t0 + 70000], ['CarData', 'pas compressé', t0 + 71000]] });
  await hub.pushStream([['CarData', z({ Entries: [] }), t0 + 80000]]);
  assert.deepEqual(hub.stream.map((s) => s[2]), [t0 + 70000, t0 + 80000]);   // illisible : ignoré
  hub.tick(t0 + 75000);
  assert.deepEqual(got.at(-1), ['reset', [t0 + 70000, t0 + 80000]]);   // 6 s d'avance
  assert.deepEqual(asked, [[t0 + 15000, t0 + 70000]]);   // une minute avant le délai : manquant
  hub.tick(t0 + 76000);
  assert.equal(got.length, 1);
  await hub.pushStream([['Position', z({ Position: [] }), t0 + 81000]]);
  hub.tick(t0 + 76000);
  assert.deepEqual(got.at(-1), ['batch', [t0 + 81000]]);
  await hub.pushStream([['Position', z({ Position: [] }), t0 + 20000]], true);   // réponse du relais : en tête
  hub.tick(t0 + 76000);
  assert.deepEqual(got.at(-1), ['reset', [t0 + 20000, t0 + 70000, t0 + 80000, t0 + 81000]]);
  assert.equal(asked.length, 1);
});

// Jeton F1 TV d'essai (forme d'un JWT d'abonnement, signature factice)
const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const okToken = (extra = {}) => jwt({ exp: Math.floor(Date.now() / 1000) + 86400, SubscriptionStatus: 'active', ...extra });

test('version web : son des radios relayé par le relais du visiteur (séance en cours seulement, par morceaux pour Safari)', async () => {
  const mp3 = new Uint8Array(1000).map((_, i) => i % 256);
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  const path = '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/';
  const p = `${path}TeamRadio/BEA_87_20261024_164338.mp3`;
  const locked = `${path}TeamRadio/HAM_44_20261024_164400.mp3`;   // réservée aux abonnés F1 TV
  globalThis.fetch = async (u, opts = {}) => {
    asked.push([String(u), opts.headers?.Authorization || null]);
    return String(u).endsWith(locked) && !opts.headers?.Authorization ? new Response(null, { status: 403 }) : new Response(mp3, { status: 200 });
  };
  const relays = {};
  const make = (name) => { const r = new LiveRelay({}, {}); r.name = name; r.onFrame(JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: { Key: 10, Path: path } } }), 1e12); return (relays[name] = r); };
  make('f1');
  const token = okToken();
  const { relayId } = await import('../analytics/live-relay.js');
  const id = await relayId(token);
  make(`u:${id}`).userToken = token;
  const env = { LIVE: { idFromName: (n) => n, get: (n) => relays[n] } };
  try {
    const get = (q, headers = {}) => { const url = new URL(`https://app.test/live/api/archive/file?p=${encodeURIComponent(q)}`); return liveApi(new Request(url, { headers }), url, env); };
    let r = await get(p);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
    assert.equal((await r.arrayBuffer()).byteLength, 1000);
    assert.deepEqual(asked[0], [`https://livetiming.formula1.com/static/${p}`, null]);
    r = await get(p, { Range: 'bytes=10-19' });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('Content-Range'), 'bytes 10-19/1000');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    asked.length = 0;
    // Autre séance, adresses invalides : refusées sans rien demander à la F1
    for (const bad of ['2026/2026-10-26_Autre/TeamRadio/x.mp3', '2026/../secret.mp3', 'https://autre.site/x.mp3', '2026/x.json']) assert.equal((await get(bad)).status, 404);
    assert.equal(asked.length, 0);
    // Radio réservée : refusée au relais commun (plus de connexion F1 TV du créateur), servie avec celle du visiteur
    assert.equal((await get(locked)).status, 404);
    assert.equal((await get(locked, { Cookie: `plu=${id}` })).status, 200);
    assert.equal(asked.at(-1)[1], `Bearer ${token}`);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('relais web : séance en cours pour la page du créateur, sans rallumer le relais sur un appel public', async () => {
  const relay = new LiveRelay({}, {});
  const t0 = 1e12;
  relay.onFrame(JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: { Key: 10, Name: 'Qualifying', Type: 'Qualifying', Path: '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/', EndDate: '2026-10-24T17:00:00', GmtOffset: '-05:00:00', Meeting: { Name: 'United States Grand Prix', Country: { Code: 'USA' } } }, SessionStatus: { Status: 'Started' } } }), t0);
  relay.onFrame(feed('SessionStatus', { Status: 'Finished' }), t0 + 1000);
  assert.deepEqual(await relay.session(), { path: '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/', name: 'Qualifying', type: 'Qualifying', gp: 'United States Grand Prix', country: 'USA', endDate: '2026-10-24T17:00:00', gmtOffset: '-05:00:00', status: 'Finished', live: false });
  const idle = new LiveRelay({}, {});
  idle.start = () => { idle.started = true; };   // pas de vraie connexion à la F1 dans les tests
  idle.idle = true;
  assert.equal(await idle.session(), null);           // appel public : rien de connu, rien de rallumé
  assert.equal(idle.started, undefined);
  assert.equal(await idle.session(true, 0), null);    // Studio : connexion courte lancée
  assert.equal(idle.started, true);
});

test('relais web : GPS seulement avec la connexion F1 TV du visiteur, sur son propre relais', async () => {
  const { f1tvToken, relayId } = await import('../analytics/live-relay.js');
  const token = okToken();
  assert.equal(f1tvToken(token), token);
  for (const bad of [jwt({ exp: Math.floor(Date.now() / 1000) - 10, SubscriptionStatus: 'active' }), jwt({ exp: Math.floor(Date.now() / 1000) + 99 }), 'pas-un-jeton', null]) assert.equal(f1tvToken(bad), null);
  // Relais commun : jamais de jeton (plus celui du créateur), donc pas d'abonnement au GPS
  const shared = new LiveRelay({}, {});
  assert.equal(shared.userToken, null);
  // Relais d'un abonné : rien avant sa connexion ; une connexion qui n'est pas la sienne est ignorée
  const mine = new LiveRelay({}, {});
  mine.name = `u:${await relayId(token)}`;
  let connects = 0;
  mine.connect = () => { connects++; };
  await mine.auth(okToken({ other: 1 }));
  assert.equal(mine.userToken, null);
  await mine.auth(token);
  assert.equal(mine.userToken, token);
  assert.equal(connects, 1);
  await mine.auth(token);
  assert.equal(connects, 1);   // même connexion : rien de plus
});

test('relais web : page d\'un autre site refusée, places limitées par adresse', async () => {
  const relay = new LiveRelay({}, {});
  const ws = (headers) => relay.fetch(new Request('https://relay/live/ws', { headers: { Upgrade: 'websocket', 'X-Relay': 'f1', ...headers } }));
  assert.equal((await ws({ Origin: 'https://autre.site' })).status, 403);
  assert.equal((await ws({})).status, 403);
  relay.ips.set('1.2.3.4', 10);
  assert.equal((await ws({ Origin: 'https://app.paddocklive.app', 'CF-Connecting-IP': '1.2.3.4' })).status, 429);
});

test('version web : rien de montré avant que le délai TV ait rattrapé un relais qui vient de démarrer', () => {
  const shown = [];
  const hub = new WebHub({ apply: applyEvent, reset: () => shown.push('reset'), batch: () => shown.push('batch') });
  const t0 = 1e12;
  hub.hello({ base: { t: t0, state: { LapCount: { CurrentLap: 40 } }, derived: createDerived() }, events: [], keep: KEEP_MS });
  hub.tick(t0 - 45000);   // délai de 45 s : l'état de base est le direct, 45 s trop tôt
  assert.deepEqual(shown, []);
  assert.equal(hub.wait, 45000);
  hub.tick(t0);
  assert.deepEqual(shown, ['reset']);
  assert.equal(hub.wait, 0);
});

// Appairage d'un téléphone : rendez-vous chiffré de bout en bout, le serveur ne voit jamais la connexion F1 TV
test('appairage : la connexion passe chiffrée, le serveur ne la lit pas, le code sert une seule fois', async () => {
  const { subtle } = globalThis.crypto;
  const relay = new LiveRelay({}, {});
  const call = (method, search = '', body) => relay.pair(
    new Request(`https://relay/pair${search}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    new URL(`https://relay/pair${search}`));
  const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
  const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  const keys = () => subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const jwk = async (k) => { const j = await subtle.exportKey('jwk', k.publicKey); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
  const aes = async (priv, pj) => subtle.deriveKey({ name: 'ECDH', public: await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pj.x, y: pj.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const token = okToken();

  // Téléphone : publie sa clé, reçoit un code
  const phone = await keys();
  const { code } = await (await call('POST', '', { pub: await jwk(phone) })).json();
  assert.match(code, /^\d{6}$/);

  // Ordinateur : lit la clé du téléphone, chiffre la connexion, la dépose
  const { pub } = await (await call('GET', `?code=${code}`)).json();
  const comp = await keys();
  const key = await aes(comp.privateKey, pub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = b64(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  assert.equal((await (await call('PUT', `?code=${code}`, { spub: await jwk(comp), iv: b64(iv), data })).json()).ok, true);

  // Ce que le serveur garde est le message chiffré, jamais la connexion en clair
  assert.ok(!JSON.stringify([...relay.pairs.values()]).includes(token));

  // Téléphone : récupère et déchiffre exactement la connexion
  const box = await (await call('GET', `?code=${code}&claim=1`)).json();
  const back = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await aes(phone.privateKey, box.spub), unb64(box.data)));
  assert.equal(back, token);

  // Code à usage unique : plus rien après récupération
  assert.equal((await call('GET', `?code=${code}&claim=1`)).status, 404);
});

test('appairage : clé invalide, code inconnu et données trop grosses refusés', async () => {
  const relay = new LiveRelay({}, {});
  const call = (method, search = '', body) => relay.pair(
    new Request(`https://relay/pair${search}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    new URL(`https://relay/pair${search}`));
  assert.equal((await call('POST', '', { pub: { kty: 'RSA' } })).status, 400);
  assert.equal((await call('GET', '?code=000000')).status, 404);
  assert.equal((await call('GET', '?code=abc')).status, 400);
  const pub = { kty: 'EC', crv: 'P-256', x: 'a', y: 'b' };
  const { code } = await (await call('POST', '', { pub })).json();
  assert.equal((await call('PUT', `?code=${code}`, { spub: pub, iv: 'x', data: 'y'.repeat(20000) })).status, 400);
});

// Appairage depuis le Studio (pairSend) : le serveur chiffre la connexion du créateur pour le téléphone
test('appairage Studio : la connexion est chiffrée pour le téléphone, lisible seulement par lui', async () => {
  const { subtle } = globalThis.crypto;
  const inst = new LiveRelay({}, {});
  const env = { LIVE: { idFromName: (n) => n, get: () => inst } };
  const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
  const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  const token = okToken();

  // Téléphone : publie sa clé, reçoit un code (directement sur l'instance, comme /live/api/pair)
  const phone = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const pj = await subtle.exportKey('jwk', phone.publicKey);
  const { code } = await (await inst.pair(new Request('https://relay/pair', { method: 'POST', body: JSON.stringify({ pub: { kty: pj.kty, crv: pj.crv, x: pj.x, y: pj.y } }) }), new URL('https://relay/pair'))).json();

  // Studio : envoie la connexion du créateur à ce code
  assert.deepEqual(await pairSend(env, code, token), { ok: true });
  assert.ok(!JSON.stringify([...inst.pairs.values()]).includes(token));   // le serveur ne garde que le chiffré

  // Téléphone : récupère et déchiffre
  const box = await (await inst.pair(new Request(`https://relay/pair?code=${code}&claim=1`), new URL(`https://relay/pair?code=${code}&claim=1`))).json();
  const their = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: box.spub.x, y: box.spub.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await subtle.deriveKey({ name: 'ECDH', public: their }, phone.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const back = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data)));
  assert.equal(back, token);

  // Code inconnu, connexion absente/expirée : refusés proprement
  assert.match((await pairSend(env, '000000', token)).error, /inconnu|expir/);
  assert.match((await pairSend(env, code, 'pasunjeton')).error, /absente|expir/);
});
