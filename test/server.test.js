import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { Hub } from '../server/hub.js';
import { parseF1tvToken, tokenInfo } from '../server/config.js';

class FakeWs extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; }
  send(s) { this.sent.push(JSON.parse(s)); }
}

function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b(payload)}.sig`;
}

test('jeton F1 TV : JWT brut, cookie login-session encodé, JSON', () => {
  const t = jwt({ exp: Math.floor(Date.now() / 1000) + 3600, SubscriptionStatus: 'active' });
  assert.equal(parseF1tvToken(t), t);
  assert.equal(parseF1tvToken(`Bearer ${t}`), t);
  const cookie = encodeURIComponent(JSON.stringify({ data: { subscriptionStatus: 'active', subscriptionToken: t } }));
  assert.equal(parseF1tvToken(cookie), t);
  assert.equal(parseF1tvToken('pas un jeton'), null);
  const info = tokenInfo(t);
  assert.equal(info.hasToken, true);
  assert.equal(info.expired, false);
  assert.equal(tokenInfo(jwt({ exp: 1 })).expired, true);
});

test('hub : chaque client reçoit l\'état à (maintenant - délai) et reconstruit quand le délai augmente', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  const now = Date.now();
  hub.reset({ mode: 'test' });
  hub.addEvent('__snapshot', { LapCount: { CurrentLap: 1 } }, now - 60000);
  hub.addEvent('LapCount', { CurrentLap: 2 }, now - 40000);
  hub.addEvent('LapCount', { CurrentLap: 3 }, now - 10000);

  const ws = new FakeWs();
  const c = hub.addClient(ws);
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 30000 })));
  hub.tick();
  let reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.state.LapCount.CurrentLap, 2, 'délai 30 s -> tour 2');

  // Réduction du délai : simple avance, sans reconstruction
  ws.sent = [];
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 0 })));
  hub.tick();
  assert.equal(ws.sent[0].type, 'batch');
  assert.deepEqual(ws.sent[0].events.map((e) => e[1].CurrentLap), [3]);

  // Augmentation du délai : reconstruction de l'état passé
  ws.sent = [];
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 50000 })));
  hub.tick();
  reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.state.LapCount.CurrentLap, 1);
  assert.equal(c.delay, 50000);
  hub.close();
});

test('hub : GPS décompressé et envoyé avec avance, synchro TV non retardée', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  const now = Date.now();
  hub.reset({ mode: 'test' });
  const raw = zlib.deflateRawSync(Buffer.from(JSON.stringify({ Position: [{ Timestamp: new Date(now).toISOString(), Entries: {} }] }))).toString('base64');
  hub.addStream('Position', raw, now - 8000);
  hub.addEvent('LapCount', { CurrentLap: 5 }, now - 5000);
  const ws = new FakeWs();
  hub.addClient(ws);
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 10000 })));
  hub.tick();
  const reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.stream.length, 1, 'le GPS de t-8 s est envoyé en avance à un client retardé de 10 s');
  assert.equal(reset.stream[0][0], 'Position');
  assert.equal(reset.state.LapCount, undefined, 'le tour 5 (t-5 s) n\'est pas encore visible');
  const status = hub.statusPayload();
  assert.equal(status.sync.at(-1).text, 'Tour 5', 'les repères de synchro sont en temps réel');
  assert.equal(hub.hasPositions, true);
  hub.close();
});

test('hub : les téléphones du réseau local reçoivent le délai TV de l\'ordinateur', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  hub.reset({ mode: 'test' });
  const pc = new FakeWs();
  hub.addClient(pc);
  pc.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 42000 })));
  const phone = new FakeWs();
  hub.addClient(phone, { host: false });
  assert.deepEqual(phone.sent.find((m) => m.type === 'role'), { type: 'role', host: false, hostDelay: 42000, hostFocus: null, overlayCfg: null, boot: null });
  // Nouveau réglage sur l'ordinateur : transmis au téléphone ; pas l'inverse
  pc.sent = [];
  pc.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 45000 })));
  assert.deepEqual(phone.sent.at(-1), { type: 'hostDelay', ms: 45000 });
  assert.equal(pc.sent.some((m) => m.type === 'hostDelay'), false);
  phone.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 5000 })));
  assert.equal(hub.hostDelay, 45000);
  hub.close();
});

test('hub : délai changé à distance (Stream Deck), suivi par les fenêtres, les overlays et les téléphones', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  hub.reset({ mode: 'test' });
  const pc = new FakeWs();
  hub.addClient(pc);
  pc.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 30000 })));
  const overlay = new FakeWs();
  hub.addClient(overlay, { host: false });
  assert.equal(hub.setHostDelay(hub.hostDelay + 1500), 31500);
  assert.deepEqual(pc.sent.at(-1), { type: 'setDelay', ms: 31500 });
  assert.deepEqual(overlay.sent.at(-1), { type: 'hostDelay', ms: 31500 });
  assert.equal(hub.setHostDelay(-5000), 5000);   // jamais sous le minimum (GPS et télémétrie fluides)
  hub.close();
});

test('hub : pilote suivi dans l\'appli repris par les overlays, pas l\'inverse', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  hub.reset({ mode: 'test' });
  const pc = new FakeWs();
  hub.addClient(pc);
  const overlay = new FakeWs();
  hub.addClient(overlay, { host: false });
  pc.emit('message', Buffer.from(JSON.stringify({ type: 'focus', num: '16' })));
  assert.deepEqual(overlay.sent.at(-1), { type: 'hostFocus', num: '16' });
  overlay.emit('message', Buffer.from(JSON.stringify({ type: 'focus', num: '1' })));
  assert.equal(hub.hostFocus, '16');
  const late = new FakeWs();
  hub.addClient(late, { host: false });
  assert.equal(late.sent.find((m) => m.type === 'role').hostFocus, '16');
  hub.close();
});

test('hub : réglages des overlays (Réglages → Streaming) appliqués en direct, gardés et nettoyés', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  hub.reset({ mode: 'test' });
  const saved = [];
  hub.onOverlayCfg = (cfg) => saved.push(cfg);
  const pc = new FakeWs();
  hub.addClient(pc);
  const overlay = new FakeWs();
  hub.addClient(overlay, { host: false });
  pc.emit('message', Buffer.from(JSON.stringify({ type: 'overlays', cfg: { mini: { bg: 140, cols: ['delta', 'int', '<b>'] }, map: { bg: 0, layers: ['labels'] }, autre: { bg: 5 } } })));
  const cfg = { mini: { bg: 100, cols: ['delta', 'int'] }, map: { bg: 0, layers: ['labels'] } };
  assert.deepEqual(overlay.sent.at(-1), { type: 'overlayCfg', cfg });
  assert.deepEqual(saved, [cfg]);
  // Un overlay ou un téléphone ne change pas les réglages ; un overlay ouvert plus tard les reçoit
  overlay.emit('message', Buffer.from(JSON.stringify({ type: 'overlays', cfg: {} })));
  assert.deepEqual(hub.overlayCfg, cfg);
  const late = new FakeWs();
  hub.addClient(late, { host: false });
  assert.deepEqual(late.sent.find((m) => m.type === 'role').overlayCfg, cfg);
  hub.close();
});

test('replay : périodes de drapeau rouge', async () => {
  const { redFlagPeriods } = await import('../server/replay.js');
  const ev = (off, Status) => ({ off, topic: 'TrackStatus', data: { Status } });
  const events = [ev(0, '1'), ev(1000, '2'), ev(5000, '5'), ev(6000, '5'), { off: 7000, topic: 'LapCount', data: {} }, ev(9000, '4'), ev(20000, '5')];
  assert.deepEqual(redFlagPeriods(events, 30000), [{ start: 5000, end: 9000 }, { start: 20000, end: 30000 }]);
  assert.deepEqual(redFlagPeriods([ev(0, '1')], 100), []);
  // Reprise réelle de la séance plus tard que le retour au vert de la piste
  const st = (off, Status) => ({ off, topic: 'SessionStatus', data: { Status } });
  assert.deepEqual(redFlagPeriods([st(0, 'Started'), ev(100, '5'), st(101, 'Aborted'), ev(500, '1'), st(900, 'Started')], 2000), [{ start: 100, end: 900 }]);
});

test('réseau : relance des refus temporaires (422, 429, 5xx), pas des ressources absentes', async () => {
  const { withRetry, HttpError } = await import('../server/net.js');
  let n = 0;
  assert.equal(await withRetry(async () => { if (++n < 3) throw new HttpError(422, 'u'); return 'ok'; }, { delay: 1 }), 'ok');
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new HttpError(404, 'u'); }, { delay: 1 }));
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new HttpError(503, 'u'); }, { tries: 2, delay: 1 }));
  assert.equal(n, 2);
});
