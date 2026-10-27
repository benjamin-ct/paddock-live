import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dossier de données temporaire : le test ne touche pas à la config de l'utilisateur
process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-test-'));
delete process.env.F1TV_TOKEN;
const { sessionOf, renew, state } = await import('../server/f1tv-auth.js');
const { getConfig, saveConfig } = await import('../server/config.js');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const now = Math.floor(Date.now() / 1000);
const session = jwt({ nbf: now - 86400, exp: now + 29 * 86400 });

test('session formula1.com lue dans le jeton F1 TV', () => {
  const s = sessionOf(jwt({ exp: now + 3600, SessionId: session }));
  assert.equal(s.id, session);
  assert.equal(s.expiresAt, (now + 29 * 86400) * 1000);
  assert.equal(sessionOf(jwt({ exp: now + 3600 })), null);
});

test('renouvellement : nouveau jeton enregistré, rien avant les dernières 24 h', async () => {
  const old = jwt({ exp: now + 3600, SessionId: session });
  const fresh = jwt({ exp: now + 4 * 86400, SessionId: session });
  saveConfig({ f1tvToken: old });
  let sent = null;
  const send = async (url, opts) => { sent = { url, opts }; return { status: 200, body: Buffer.from(JSON.stringify({ data: { subscriptionToken: fresh } })) }; };
  assert.equal(await renew({ send }), fresh);
  assert.equal(getConfig().f1tvToken, fresh);
  assert.match(sent.url, /Subscriber\/RetrieveSubscriber$/);
  assert.equal(sent.opts.headers['cd-sessionid'], session);
  assert.equal(sent.opts.method, 'POST');
  // Jeton encore valable 4 jours : pas de requête
  sent = null;
  assert.equal(await renew({ send }), null);
  assert.equal(sent, null);
});

test('échange (swap) : jeton du compte gardé même s\'il n\'expire pas plus tard', async () => {
  const site = jwt({ exp: now + 4 * 86400, SessionId: session, SubscriptionStatus: 'active' });
  const account = jwt({ exp: now + 4 * 86400 - 60, SessionId: session, SubscribedProduct: 'F1 TV Pro Annual' });
  const send = async () => ({ status: 200, body: Buffer.from(JSON.stringify({ data: { subscriptionToken: account } })) });
  saveConfig({ f1tvToken: site });
  await assert.rejects(renew({ force: true, send }), /pas de nouveau jeton/);   // renouvellement : expire plus tôt, refusé
  assert.equal(await renew({ force: true, swap: true, send }), account);
  assert.equal(getConfig().f1tvToken, account);
});

test('renouvellement refusé par la F1 : il faudra se reconnecter', async () => {
  saveConfig({ f1tvToken: jwt({ exp: now - 60, SessionId: session }) });
  await assert.rejects(renew({ send: async () => ({ status: 401, body: Buffer.from('') }) }), /reconnectez-vous/);
  assert.equal(state.rejected, true);
  // Session formula1.com terminée : pas de requête inutile
  state.rejected = false;
  saveConfig({ f1tvToken: jwt({ exp: now - 60, SessionId: jwt({ exp: now - 10 }) }) });
  await assert.rejects(renew({ send: async () => { throw new Error('ne doit pas être appelé'); } }), /Session formula1\.com expirée/);
});
