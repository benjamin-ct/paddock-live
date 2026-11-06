import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EXT_KEY, extensionProof } from '../server/guard.js';

// Chrome Web Store : résumé (description du manifeste) coupé au-delà de 132 caractères, nom au-delà de 75
test('extension : nom et résumé dans les limites des boutiques, dans chaque langue', () => {
  for (const lang of fs.readdirSync('extension/_locales')) {
    const m = JSON.parse(fs.readFileSync(`extension/_locales/${lang}/messages.json`, 'utf8'));
    assert.ok(m.name.message.length <= 75, `${lang} : nom trop long`);
    assert.ok(m.description.message.length <= 132, `${lang} : résumé de ${m.description.message.length} caractères`);
  }
});

// Extension chargée avec de faux navigateur et appli (aucun réseau). apps : port → appli simulée

const jwt = (p) => ['e30', Buffer.from(JSON.stringify(p)).toString('base64url'), 'sig'].join('.');
const TOKEN = jwt({ SubscriptionStatus: 'active', exp: Math.floor(Date.now() / 1000) + 86400 });

// Appli simulée comme server/index.js (GET et POST /api/auth) ; old : appli d'avant la clé partagée
function fakeApp(port, { old = false } = {}) {
  const app = { port, extKey: null, posts: [] };
  app.handle = async (url, opts = {}) => {
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      app.posts.push(body.token);
      const paired = !old && EXT_KEY.test(body.pair || '');
      if (paired) app.extKey = body.pair;
      return Response.json({ hasToken: true, ...(paired ? { paired: true } : {}) });
    }
    const c = url.searchParams.get('c');
    return Response.json({ hasToken: app.posts.length > 0, ...(old ? {} : { pairing: true }), ...(!old && c && app.extKey ? { proof: extensionProof(app.extKey, c, port) } : {}) });
  };
  return app;
}

function loadExtension(apps) {
  const store = {};
  let onMessage;
  const on = { addListener() {} };
  const chrome = {
    cookies: { getAll: async (q) => (q.name === 'entitlement_token' ? [{ name: q.name, domain: '.formula1.com', value: TOKEN }] : []), onChanged: on },
    storage: { local: {
      get: async (k) => Object.fromEntries([k].flat().map((x) => [x, store[x]])),
      set: async (o) => { Object.assign(store, o); },
    } },
    permissions: { contains: async () => true },
    runtime: { onStartup: on, onInstalled: on, onMessage: { addListener: (fn) => { onMessage = fn; } } },
    alarms: { create() {}, onAlarm: on },
  };
  const fetch = async (u, opts) => {
    const url = new URL(u);
    const app = apps[url.port];
    if (!app) throw new TypeError('fetch failed');
    return app.handle(url, opts);
  };
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), { chrome, fetch, crypto: globalThis.crypto, TextEncoder, AbortSignal, atob, btoa, Response, URL, console });
  const sync = (msg = {}) => new Promise((resolve) => onMessage({ type: 'sync', ...msg }, {}, resolve));
  return { store, sync };
}

test('extension : connexion F1 TV envoyée seulement à l\'appli reliée (clé partagée)', async () => {
  const apps = { 3000: fakeApp(3000) };
  const ext = loadExtension(apps);
  // Premier envoi : l'appli garde la clé
  assert.equal((await ext.sync()).justSent, true);
  assert.equal(apps[3000].extKey, ext.store.pairKey);
  assert.equal(ext.store.paired, true);
  // Appli fermée, autre programme sur le même port : rien ne lui est envoyé
  const intrus = fakeApp(3000);
  apps[3000] = intrus;
  ext.store.sent = null;
  const s = await ext.sync();
  assert.equal(s.app.known, false);
  assert.deepEqual(intrus.posts, []);
  // Clic sur « Envoyer » (appli réinstallée) : reliée de nouveau
  assert.equal((await ext.sync({ force: true })).justSent, true);
  assert.equal(intrus.extKey, ext.store.pairKey);
});

test('extension : preuve de l\'appli relayée par un programme sur un autre port, refusée', async () => {
  const real = fakeApp(3001);
  const apps = { 3001: real };
  const ext = loadExtension(apps);
  await ext.sync();
  const relay = { posts: [], handle: async (url, opts = {}) => {
    if (opts.method === 'POST') { relay.posts.push(1); return Response.json({ hasToken: true }); }
    return real.handle(url, opts);   // même question posée à la vraie appli
  } };
  apps[3000] = relay;
  ext.store.sent = null;
  const s = await ext.sync();
  assert.equal(s.app.port, 3001);
  assert.equal(relay.posts.length, 0);
  assert.equal(real.posts.length, 2);
  assert.notEqual(extensionProof('k', 'n', 3000), extensionProof('k', 'n', 3001));
});

test('extension : appli d\'avant la clé partagée, envoi comme avant et sans renvoi en boucle', async () => {
  const apps = { 3000: fakeApp(3000, { old: true }) };
  const ext = loadExtension(apps);
  assert.equal((await ext.sync()).justSent, true);
  assert.equal(ext.store.paired, undefined);
  await ext.sync();
  assert.equal(apps[3000].posts.length, 1);
  // Appli mise à jour ensuite : renvoyée une fois pour la relier, puis plus
  apps[3000] = fakeApp(3000);
  await ext.sync();
  await ext.sync();
  assert.equal(apps[3000].posts.length, 1);
  assert.equal(ext.store.paired, true);
});
