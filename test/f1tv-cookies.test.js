// Cookies de connexion F1 TV : lecture par l'extension et par la fenêtre de connexion de l'appli de
// bureau (le site formula1.com a déjà changé de cookie une fois : login-session -> entitlement_token)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'none' })}.${b64(payload)}.c2ln`;
const SUB = jwt({ SubscriptionStatus: 'active', SubscribedProduct: 'F1 TV Pro', SessionId: 'secret-session', exp: 2e9 });
const OTHER = jwt({ ents: [], sub: 'x', exp: 2e9 });
const loginSession = (token) => encodeURIComponent(JSON.stringify({ data: { subscriptionToken: token } }));

// background.js de l'extension chargé avec une API de navigateur factice
function extension() {
  const noop = { addListener() {} };
  const ctx = vm.createContext({
    atob, Date, fetch() {}, AbortSignal,
    chrome: { cookies: { onChanged: noop }, runtime: { onStartup: noop, onInstalled: noop, onMessage: noop }, alarms: { onAlarm: noop } },
  });
  vm.runInContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), ctx);
  return ctx;
}

test('extension : garde seulement un jeton d\'abonnement F1 TV', () => {
  const { subscriptionToken } = extension();
  assert.equal(subscriptionToken(SUB), SUB, 'entitlement_token (site actuel)');
  assert.equal(subscriptionToken(loginSession(SUB)), SUB, 'login-session (ancien site, JSON encodé)');
  assert.equal(subscriptionToken(`Bearer ${SUB}`), SUB);
  assert.equal(subscriptionToken(OTHER), null, 'JWT sans état d\'abonnement');
  const old = jwt({ SubscriptionStatus: 'active', exp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal(subscriptionToken(loginSession(old)), null, 'connexion expirée (vieux cookie de l\'ancien site)');
  assert.equal(subscriptionToken('opaque-session-value'), null);
  assert.equal(subscriptionToken(''), null);
});

test('extension : le diagnostic donne les noms des champs, jamais leurs valeurs', () => {
  const { shape } = extension();
  const s = shape(SUB);
  assert.match(s, /^JWT \(.*SubscriptionStatus.*SessionId.*\)$/);
  assert.ok(!s.includes('secret-session') && !s.includes('active'));
  assert.equal(shape(loginSession(SUB)).startsWith('JWT ('), true);
  assert.equal(shape('abc'), '3 car.');
});

test('appli de bureau : cookies essayés dans l\'ordre, seulement sur formula1.com', () => {
  const { loginValues, diagnose } = createRequire(import.meta.url)('../desktop/f1-cookies.cjs');
  const cookies = [
    { name: 'entitlement_token', domain: 'f1tv.formula1.com', value: SUB },
    { name: 'login-session', domain: '.formula1.com', value: 'ancien' },
    { name: 'entitlement_token', domain: 'formula1.com.evil.example', value: 'piege' },
    { name: 'ST', domain: '.formula1.com', value: 'opaque' },
  ];
  assert.deepEqual(loginValues(cookies), ['ancien', SUB]);
  assert.deepEqual(loginValues([{ name: 'ST', domain: '.formula1.com', value: 'x' }]), []);
  const d = diagnose(cookies);
  assert.match(d, /entitlement_token : JWT \(SubscriptionStatus, SubscribedProduct, SessionId, exp\)/);
  assert.match(d, /\bST\b/);
  assert.ok(!d.includes('secret-session') && !d.includes('opaque') && !d.includes('piege'));
});
