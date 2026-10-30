import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { LiveSource } from '../server/live.js';
import { relayId } from '../shared/f1tv-account.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'none' })}.${b64({ SubscriberId: 'abonne-1', SubscriptionStatus: 'active', exp: Date.now() / 1000 + 3600 })}.sig`;
const until = async (ok, ms = 4000) => { for (const t0 = Date.now(); !ok(); await new Promise((r) => setTimeout(r, 20))) if (Date.now() - t0 > ms) throw new Error('délai dépassé'); };

function fakeHub() {
  return {
    source: { mode: 'live' }, sessionKey: null, events: [], stream: [], resets: 0,
    reset(src) { this.source = { ...src }; this.sessionKey = null; this.events = []; this.stream = []; this.resets++; },
    addEvent(topic, data, t) { this.events.push({ topic, data, t }); },
    addStream(topic, raw, t) { this.stream.push({ topic, raw, t }); },
  };
}

test('appli de bureau : direct par le relais du compte F1 TV, reconnexion sans doublons, repli sur la F1', async () => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const conns = [];
  wss.on('connection', (ws, req) => { const c = { ws, req, msgs: [] }; ws.on('message', (d) => c.msgs.push(JSON.parse(d))); conns.push(c); });
  const hub = fakeHub();
  const live = new LiveSource(hub, () => token, null, `ws://127.0.0.1:${wss.address().port}/live/ws`);
  try {
    live.start();
    await until(() => conns[0]?.msgs.length);
    const url = new URL(conns[0].req.url, 'http://x');
    assert.equal(url.searchParams.get('u'), await relayId(token));   // même relais que la version web de ce compte
    assert.equal(conns[0].req.headers.origin, 'https://app.paddocklive.app');
    assert.deepEqual(conns[0].msgs[0], { type: 'auth', token });

    const now = Date.now();
    const base = { t: now - 1000, state: { SessionInfo: { Key: 42, Meeting: { Name: 'Mexico City Grand Prix' }, Name: 'Practice 3' } } };
    const ev1 = ['TimingData', { a: 1 }, now - 500], gps1 = ['Position', 'raw1', now - 400];
    conns[0].ws.send(JSON.stringify({ type: 'hello', now, base, events: [ev1], stream: [gps1], status: { connected: true, authenticated: true } }));
    conns[0].ws.send(JSON.stringify({ type: 'evs', events: [['TimingData', { a: 2 }, now - 100]], stream: [['Position', 'raw2', now - 50]] }));
    await until(() => hub.events.length === 3 && hub.stream.length === 2);
    assert.deepEqual(hub.events.map((e) => e.topic), ['__snapshot', 'TimingData', 'TimingData']);
    assert.equal(hub.sessionKey, 42);
    assert.equal(live.status.authenticated, true);
    assert.equal(hub.source.session, 'Mexico City Grand Prix — Practice 3');

    // Coupure : nouvelle connexion, le relais renvoie tout ; seul le nouveau message est ajouté, sans tout effacer
    conns[0].ws.terminate();
    await until(() => conns[1]?.msgs.length);
    conns[1].ws.send(JSON.stringify({ type: 'hello', now: Date.now() + 7, base, events: [ev1, ['TimingData', { a: 2 }, now - 100], ['TimingData', { a: 3 }, now - 10]], stream: [gps1, ['Position', 'raw2', now - 50]], status: { connected: true, authenticated: true } }));
    await until(() => hub.events.length === 4);
    assert.equal(hub.resets, 2);   // au démarrage et à l'arrivée de la séance, pas à la reconnexion
    assert.equal(hub.stream.length, 2);

    // Badge « GPS ailleurs » touché : demandé au relais
    live.here();
    await until(() => conns[1].msgs.some((m) => m.type === 'here'));

    // Connexion F1 TV refusée par le relais : connexion directe à la F1 pour ce jeton
    conns[1].ws.close(4001, 'Connexion F1 TV attendue');
    await until(() => live.relayOff === token);
  } finally {
    live.stop();
    for (const c of wss.clients) c.terminate();
    wss.close();
  }
});
