import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSocket } from '../analytics/live-relay.js';

// Table ai_usage réduite (compteurs du jour) et relais qui accepte tout
function fakeEnv() {
  const usage = new Map();
  const DB = {
    prepare(sql) {
      let a = [];
      const st = {
        bind(...x) { a = x; return st; },
        async first() { return usage.has(a[0]) ? { n: usage.get(a[0]) } : null; },
        async run() {
          const [k, n, limit] = a, v = (usage.get(k) || 0) + n;
          if (v > limit) return { meta: { changes: 0 } };
          usage.set(k, v);
          return { meta: { changes: 1 } };
        },
      };
      return st;
    },
  };
  const LIVE = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('ok') }) };
  return { DB, LIVE, usage };
}
const ask = (id, ip = '203.0.113.7') => new Request(`https://app.paddocklive.app/live/ws?d=5&u=${id}`, { headers: { 'CF-Connecting-IP': ip } });
const id = (i) => i.toString(16).padStart(32, '0');

test('version web : reconnexions au même relais d\'abonné non recomptées, 50 relais différents par jour au plus', async () => {
  const env = fakeEnv();
  // Mises à jour du serveur, coupures : cent reconnexions au même relais restent permises
  for (let i = 0; i < 100; i++) assert.equal((await liveSocket(ask(id(1)), env)).status, 200);
  for (let i = 2; i <= 50; i++) assert.equal((await liveSocket(ask(id(i)), env)).status, 200);
  // 51e relais différent de la journée refusé, et pas accepté en réessayant
  assert.equal((await liveSocket(ask(id(51)), env)).status, 429);
  assert.equal((await liveSocket(ask(id(51)), env)).status, 429);
  // Les relais déjà ouverts restent joignables ; une autre adresse a son propre plafond
  assert.equal((await liveSocket(ask(id(7)), env)).status, 200);
  assert.equal((await liveSocket(ask(id(51), '198.51.100.2'), env)).status, 200);
});
