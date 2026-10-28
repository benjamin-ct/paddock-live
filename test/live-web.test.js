import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { LiveRelay, KEEP_MS, AUTH_MS, PRIVATE_MS, LEAD_MS, liveApi, pairSend, liveDevices, liveState } from '../analytics/live-relay.js';
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

test('version web : PDF de la FIA relayé pour être affiché (pas téléchargé), seulement ceux de fia.com', async () => {
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response(String(u).includes('pas-pdf') ? '<html>' : '%PDF-1.7 ...', { status: 200 }); };
  try {
    const get = (u) => { const url = new URL(`https://app.test/live/api/fia-pdf?${new URLSearchParams({ url: u })}`); return liveApi(new Request(url), url, {}); };
    const r = await get('https://www.fia.com/system/files/decision-document/2026_mexico_-_car_14.pdf');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'application/pdf');
    assert.match(r.headers.get('Content-Disposition'), /^inline; filename="2026_mexico_-_car_14\.pdf"$/);
    assert.equal(await r.text(), '%PDF-1.7 ...');
    for (const bad of ['https://autre.site/system/files/x.pdf', 'http://www.fia.com/system/files/x.pdf', 'https://www.fia.com/documents/x.pdf', 'https://www.fia.com/system/files/x.html']) assert.equal((await get(bad)).status, 400);
    assert.equal(asked.length, 1);
    assert.equal((await get('https://www.fia.com/system/files/pas-pdf.pdf')).status, 502);
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
  relay.ips.set('2001:db8:1::/48', 30);   // IPv6 : 30 places au plus pour tout un bloc /48, quel que soit le /64
  assert.equal((await ws({ Origin: 'https://app.paddocklive.app', 'CF-Connecting-IP': '2001:db8:1:5::1' })).status, 429);
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

  // Ordinateur : lit la clé du téléphone (et son type : téléphone par défaut, navigateur s'il le dit), chiffre la connexion, la dépose
  const { pub, kind } = await (await call('GET', `?code=${code}`)).json();
  assert.equal(kind, 'phone');
  const other = await (await call('POST', '', { pub: await jwk(await keys()), kind: 'browser' })).json();
  assert.equal((await (await call('GET', `?code=${other.code}`)).json()).kind, 'browser');
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

  // 5 codes en attente au plus par adresse (ici 1 déjà pris par « other »), corps de plus de 4 Ko refusé
  const pk = await jwk(await keys());
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '', { pub: pk })).status, 200);
  assert.equal((await call('POST', '', { pub: pk })).status, 429);
  assert.equal((await call('POST', '', { pub: pk, pad: 'x'.repeat(5000) })).status, 400);
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

// Appareils connectés (Studio) : type d'appareil et depuis quand, pour le relais du créateur
test('appareils connectés : liste des connexions du relais privé, type d\'appareil et durée', async () => {
  const inst = new LiveRelay({}, {});
  inst.userToken = okToken();
  inst.clients.add({ ua: 'Chrome sur Mac', since: Date.now() - 65000 });
  inst.clients.add({ ua: 'iPhone/iPad', since: Date.now() - 4000 });
  const r = inst.clientList();
  assert.equal(r.count, 2);
  assert.equal(r.authenticated, true);
  assert.equal(r.devices[0].ua, 'Chrome sur Mac');   // le plus ancien d'abord
  assert.ok(r.devices[0].since >= 60 && r.devices[1].since < 60);
  // Route interne /clients (appelée par liveDevices)
  const res = await inst.fetch(new Request('https://relay/clients', { headers: { 'X-Relay': 'u:abc' } }));
  assert.equal((await res.json()).count, 2);
  // liveDevices : relais privé résolu depuis le jeton ; jeton invalide → liste vide, sans toucher au relais
  const env = { LIVE: { idFromName: (n) => n, get: () => inst } };
  assert.equal((await liveDevices(env, okToken())).count, 2);
  assert.deepEqual(await liveDevices(env, 'pasunjeton'), { count: 0, devices: [] });
});

// Studio : résultats d'une séance qui vient de finir, d'après le direct, avant l'archive de la F1
test('état final d\'une séance d\'après le relais : état de base et messages reçus depuis, seulement la séance demandée', async () => {
  const inst = new LiveRelay({}, {});
  inst.base = { t: 1, state: { SessionInfo: { Path: '2026/2026-10-25_United_States_Grand_Prix/2026-10-25_Race/', Name: 'Race' }, LapCount: { CurrentLap: 55, TotalLaps: 56 } }, derived: createDerived() };
  inst.recent = [['LapCount', { CurrentLap: 56 }, 2]];
  const st = await inst.state('2026/2026-10-25_United_States_Grand_Prix/2026-10-25_Race/');
  assert.equal(st.LapCount.CurrentLap, 56);
  assert.equal(inst.base.state.LapCount.CurrentLap, 55);   // l'état gardé par le relais n'est pas modifié
  assert.equal(await inst.state('2026/autre/'), null);
  const env = { LIVE: { idFromName: (n) => n, get: () => inst } };
  assert.equal((await liveState(env, '2026/2026-10-25_United_States_Grand_Prix/2026-10-25_Race/')).LapCount.CurrentLap, 56);
  assert.equal(await liveState({}, 'x'), null);
});

test('version web, espace Saison : saisons depuis 2018, une saison finie gardée une semaine', async () => {
  const now = new Date().getUTCFullYear();
  // Saison gardée sans l'année (forme de buildSeason) : la réponse l'ajoute, comme /api/season de l'appli
  const rows = new Map([[`season:${now}`, { at: Date.now(), v: { races: [] } }], ['season:2019', { at: Date.now() - 3 * 86400e3, v: { races: [] } }]]);
  const DB = { prepare: () => ({ bind: (k) => ({ first: async () => (rows.has(k) ? { v: JSON.stringify(rows.get(k)) } : null) }) }) };
  const realFetch = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = async () => { asked++; throw new Error('pas de réseau dans les tests'); };
  try {
    const get = (y) => { const url = new URL(`https://app.test/live/api/season?year=${y}`); return liveApi(new Request(url), url, { DB }); };
    assert.equal((await (await get(2019)).json()).year, 2019);
    assert.equal((await (await get(now)).json()).year, now);
    assert.equal(asked, 0);   // saison de 2019 lue il y a 3 jours : pas relue chez Jolpica
    for (const y of [2017, now + 2, 'x']) assert.equal((await get(y)).status, 400);
  } finally { globalThis.fetch = realFetch; }
});

test('saison lue chez Jolpica : trop de demandes (429), nouvel essai après l\'attente demandée', async () => {
  const { buildSeason } = await import('../analytics/season-cache.js');
  const waits = [];
  let refused = 2;
  const fetchFn = async (u) => {
    if (refused-- > 0) return new Response('', { status: 429, headers: { 'Retry-After': '3' } });
    return Response.json({ MRData: { total: '0', RaceTable: { Races: [] }, StandingsTable: { StandingsLists: [] } } });
  };
  const d = await buildSeason(2024, { fetchFn, wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(d.races, []);
  assert.deepEqual(waits.slice(0, 3), [300, 3000, 3000]);
  const never = async () => new Response('', { status: 429 });
  await assert.rejects(buildSeason(2024, { fetchFn: never, wait: async () => {} }), /injoignable \(erreur 429\)/);
});

test('version web : séances d\'un week-end dans son agenda (fichier .ics, comme l\'appli)', async () => {
  const now = new Date().getUTCFullYear();
  const races = [{ round: 1, name: 'Australian Grand Prix', locality: 'Melbourne', country: 'Australia', sessions: [{ label: 'Course', t: `${now}-03-08T04:00:00Z` }] },
    { round: 2, name: 'Chinese Grand Prix', locality: 'Shanghai', country: 'China', sessions: [{ label: 'Course', t: `${now}-03-15T07:00:00Z` }] }];
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ v: JSON.stringify({ at: Date.now(), v: { races } }) }) }) }) };
  const url = new URL(`https://app.test/live/api/calendar.ics?year=${now}&round=2`);
  const r = await liveApi(new Request(url), url, { DB });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /text\/calendar/);
  assert.match(r.headers.get('Content-Disposition'), new RegExp(`f1-${now}-manche-2\\.ics`));
  const ics = await r.text();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Chin/);
  assert.doesNotMatch(ics, /Austral/);
});

test('relais web : compte F1 TV suivi par l\'appli, GPS laissé après deux coupures et repris à la demande', () => {
  const relay = new LiveRelay({}, {});
  let reconnects = 0;
  relay.reconnectLater = () => reconnects++;
  const t0 = 1e12;
  relay.here();   // rien à reprendre
  assert.equal(reconnects, 0);
  relay.lost('jeton', t0);
  relay.lost('jeton', t0 + 4000);
  assert.deepEqual([relay.elsewhere, relay.status.elsewhere], [true, true]);
  relay.here();
  assert.deepEqual([relay.elsewhere, relay.status.elsewhere, relay.losses.length, reconnects], [false, false, 0, 1]);
});

test('version web : relais d\'un abonné fermé sans connexion F1 TV au bout de 15 s, et au bout de 6 h', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const sockets = [];
  globalThis.WebSocketPair = class {
    constructor() {
      const s = { closed: null, accept() {}, addEventListener() {}, send() {}, close(code) { this.closed = code; } };
      sockets.push(s);
      return { 0: {}, 1: s };
    }
  };
  const open = async (relay) => {
    relay.connect = () => {};   // pas de connexion à la F1 dans le test
    const req = new Request('https://relay/ws', { headers: { Upgrade: 'websocket', Origin: 'https://app.paddocklive.app', 'X-Relay': relay.name } });
    await relay.fetch(req).catch(() => {});   // Response 101 refusée par Node : la connexion est déjà acceptée
    return sockets.at(-1);
  };
  try {
    const idle = new LiveRelay({}, {});
    idle.name = 'u:'.padEnd(34, 'a');
    const s1 = await open(idle);
    t.mock.timers.tick(AUTH_MS);
    assert.equal(s1.closed, 4001);   // aucune connexion F1 TV reçue : fermé, la page repasse au relais commun
    assert.equal(idle.clients.size, 0);

    const mine = new LiveRelay({}, {});
    mine.name = 'u:'.padEnd(34, 'b');
    const s2 = await open(mine);
    mine.userToken = 'jeton';
    t.mock.timers.tick(AUTH_MS);
    assert.equal(s2.closed, null);   // connexion F1 TV reçue : gardé
    t.mock.timers.tick(PRIVATE_MS);
    assert.equal(s2.closed, 4000);   // au bout de 6 h : la page se reconnecte

    const shared = new LiveRelay({}, {});
    const s3 = await open(shared);
    t.mock.timers.tick(PRIVATE_MS);
    assert.equal(s3.closed, null);   // relais commun : pas concerné
    for (const r of [idle, mine, shared]) { r.clients.clear(); r.stop(); }
  } finally { delete globalThis.WebSocketPair; }
});

test('relais web : au repos hors séance (F1 débranchée, veille), réveillé avant la séance suivante', async () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const alarms = [];
  const relay = new LiveRelay({ storage: { setAlarm: async (t) => alarms.push(t) } }, { DB: {} });
  relay.connect = () => {};
  const sent = [];
  relay.clients.add({ send: (s) => sent.push(JSON.parse(s)) });
  relay.start();
  relay.base.t = now;
  // Séance dans 10 min, ou chronos reçus il y a 30 s : le relais reste branché
  relay.sched = { at: now, starts: [now + 10 * 60e3] };
  await relay.sleepUntilNext(now);
  assert.equal(relay.active, true);
  relay.sched = { at: now, starts: [now - 5 * 3600e3, now + 2 * 86400e3] };
  relay.lastTimingAt = now - 30e3;
  await relay.sleepUntilNext(now);
  assert.equal(relay.active, true, 'séance encore en cours d\'après les chronos');
  // Plus rien : repos jusqu'à 30 min avant la séance suivante, minuteries arrêtées
  relay.lastTimingAt = now - 10 * 60e3;
  await relay.sleepUntilNext(now);
  assert.equal(relay.active, false);
  assert.equal(relay.timers.length, 0);
  assert.deepEqual(alarms, [now + 2 * 86400e3 - LEAD_MS]);
  assert.deepEqual([sent.at(-1).type, sent.at(-1).status.rest, sent.at(-1).status.next], ['up', true, now + 2 * 86400e3]);
  await relay.alarm();
  assert.equal(relay.active, true, 'réveillé pour la séance');
  assert.equal(relay.status.rest, false);
  for (const t of relay.timers) clearInterval(t), clearTimeout(t);
});

test('relais web : une page qui arrive pendant le repos reçoit « Hors séance » sans rebrancher la F1', async () => {
  const sockets = [];
  globalThis.WebSocketPair = class {
    constructor() {
      const s = { sent: [], accept() {}, addEventListener() {}, send(m) { this.sent.push(JSON.parse(m)); }, close() {} };
      sockets.push(s);
      return { 0: {}, 1: s };
    }
  };
  try {
    // Relais sorti de la veille complète (état oublié) : le réveil programmé dit qu'il est au repos
    const wake = Date.now() + 86400e3;
    const relay = new LiveRelay({ storage: { getAlarm: async () => wake } }, {});
    let connects = 0;
    relay.connect = () => { connects++; };
    const req = new Request('https://relay/ws', { headers: { Upgrade: 'websocket', Origin: 'https://app.paddocklive.app', 'X-Relay': 'live' } });
    await relay.fetch(req).catch(() => {});
    const hello = sockets.at(-1).sent.find((m) => m.type === 'hello');
    assert.deepEqual([hello.status.rest, hello.status.next, !!relay.active, connects], [true, wake + LEAD_MS, false, 0]);
    // Réveil avant la séance : rebranché pour les pages ouvertes
    await relay.alarm();
    assert.deepEqual([relay.active, relay.resting, connects], [true, false, 1]);
    relay.clients.clear(); relay.stop();
  } finally { delete globalThis.WebSocketPair; }
});

test('relais web : connexions des navigateurs retrouvées après la veille (adresse, appareil, relais)', () => {
  const ws = { deserializeAttachment: () => ({ nets: ['1.2.3.4'], ua: 'iPhone', since: 5, name: 'u:abc' }) };
  const relay = new LiveRelay({ getWebSockets: () => [ws] }, {});
  assert.equal(relay.clients.size, 1);
  assert.equal(relay.ips.get('1.2.3.4'), 1);
  assert.equal(relay.name, 'u:abc');
  assert.deepEqual(relay.clientList().devices.map((d) => d.ua), ['iPhone']);
});
