import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveRelay, relayId, accountOf } from '../analytics/live-relay.js';

// Jeton F1 TV factice (signature non vérifiée par le relais) : compte et expiration au choix
const jwt = (sub, expMin) => ['e30', Buffer.from(JSON.stringify({ SubscriberId: sub, SubscriptionStatus: 'active', exp: Math.floor(Date.now() / 1000) + expMin * 60 })).toString('base64url'), 'sig'].join('.');
const sock = () => ({ got: [], send(s) { this.got.push(JSON.parse(s).type); } });

test('relais web par compte F1 TV : mêmes relais pour toutes les connexions du compte, chaque appareil doit présenter la sienne', async () => {
  const a1 = jwt(42, 60), a2 = jwt(42, 600), b = jwt(7, 60);
  assert.equal(accountOf(a1), '42');
  assert.equal(await relayId(a1), await relayId(a2));       // extension et appairage : même relais
  assert.notEqual(await relayId(a1), await relayId(b));

  const r = Object.create(LiveRelay.prototype);
  Object.assign(r, { name: `u:${await relayId(a1)}`, clients: new Set(), ips: new Map(), status: { authenticated: true }, base: {}, recent: [], stream: [] });
  let connects = 0;
  r.connect = () => { connects++; };
  r.reconnectLater = () => {};
  const phone = sock(), pc = sock(), stranger = sock();
  for (const ws of [phone, pc, stranger]) r.track(ws, {});
  // Rien n'est envoyé à un appareil pas encore reconnu
  r.broadcast(JSON.stringify({ type: 'up' }));
  assert.deepEqual([phone.got, pc.got, stranger.got], [[], [], []]);
  await r.auth(a1, phone);
  assert.deepEqual(phone.got, ['hello']);
  assert.equal(connects, 1);
  // Autre connexion du même compte, qui expire plus tard : reçoit le direct, gardée pour parler à la F1
  await r.auth(a2, pc);
  assert.deepEqual(pc.got, ['hello']);
  assert.equal(r.userToken, a2);
  await r.auth(a1, phone);
  assert.equal(r.userToken, a2);                              // la plus ancienne ne la remplace pas
  // Jeton d'un autre compte : refusé, toujours rien reçu
  await r.auth(b, stranger);
  r.broadcast(JSON.stringify({ type: 'up' }));
  assert.deepEqual(stranger.got, []);
  assert.deepEqual(phone.got, ['hello', 'up']);
});

test('relais web : pendant une séance, connexion à la F1 gardée 15 min après le départ du dernier appareil', async () => {
  const { LIVE_IDLE_MS } = await import('../analytics/live-relay.js');
  const r = Object.create(LiveRelay.prototype);
  Object.assign(r, { base: { t: 0, state: {} }, recent: [] });
  assert.equal(r.idleMs(), 60e3);                                   // relais vide : une minute
  r.base = { t: 1, state: { SessionStatus: { Status: 'Started' } } };
  assert.equal(r.idleMs(), LIVE_IDLE_MS);                           // séance en cours (appli quittée, veille)
  r.recent = [['SessionStatus', { Status: 'Finalised' }, 2]];
  assert.equal(r.idleMs(), 60e3);                                   // séance terminée : une minute
});
