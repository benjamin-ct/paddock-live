import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { LiveRelay, KEEP_MS, liveApi } from '../analytics/live-relay.js';
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

test('version web : son des radios relayé (par morceaux pour Safari), chemins hors archives refusés', async () => {
  const mp3 = new Uint8Array(1000).map((_, i) => i % 256);
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response(mp3, { status: 200 }); };
  try {
    const p = '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/TeamRadio/BEA_87_20261024_164338.mp3';
    const get = (q, headers = {}) => { const url = new URL(`https://app.test/live/api/archive/file?p=${encodeURIComponent(q)}`); return liveApi(new Request(url, { headers }), url, {}); };
    let r = await get(p);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
    assert.equal((await r.arrayBuffer()).byteLength, 1000);
    assert.equal(asked[0], `https://livetiming.formula1.com/static/${p}`);
    r = await get(p, { Range: 'bytes=10-19' });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('Content-Range'), 'bytes 10-19/1000');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    for (const bad of ['2026/../secret.mp3', 'https://autre.site/x.mp3', '2026/x.json']) assert.equal((await get(bad)).status, 404);
    assert.equal(asked.length, 2);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('relais web : séance en cours pour la page du créateur (avant l\'index de la saison de la F1)', async () => {
  const relay = new LiveRelay({}, {});
  const t0 = 1e12;
  relay.onFrame(JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: { Key: 10, Name: 'Qualifying', Type: 'Qualifying', Path: '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/', EndDate: '2026-10-24T17:00:00', GmtOffset: '-05:00:00', Meeting: { Name: 'United States Grand Prix', Country: { Code: 'USA' } } }, SessionStatus: { Status: 'Started' } } }), t0);
  relay.onFrame(feed('SessionStatus', { Status: 'Finished' }), t0 + 1000);
  assert.deepEqual(await relay.session(), { path: '2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Qualifying/', name: 'Qualifying', type: 'Qualifying', gp: 'United States Grand Prix', country: 'USA', endDate: '2026-10-24T17:00:00', gmtOffset: '-05:00:00', status: 'Finished' });
  const idle = new LiveRelay({}, {});
  idle.start = () => { idle.started = true; };   // pas de vraie connexion à la F1 dans les tests
  idle.idle = true;
  assert.equal(await idle.session(0), null);   // rien de connu : connexion courte lancée, rien à donner
  assert.equal(idle.started, true);
});
