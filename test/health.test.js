import test from 'node:test';
import assert from 'node:assert/strict';
import { healthCheck, noteExpiries } from '../analytics/health.js';

// Base D1 réduite : lignes du Studio, compteurs d'erreurs par jour, détail des erreurs
function fakeDB({ errors = {}, top = null } = {}) {
  const studio = new Map();
  return {
    studio,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (/^SELECT v FROM studio/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null;
          if (/FROM error_details/.test(sql)) return top;
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async all() {
          if (/FROM counts/.test(sql)) return { results: Object.entries(errors).filter(([d]) => d >= args[0] && d <= args[1]).map(([day, n]) => ({ day, n })) };
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio/.test(sql)) { studio.set(args[0], args[1]); return {}; }
          throw new Error(`SQL inattendu : ${sql}`);
        },
      };
      return st;
    },
  };
}
const now = Date.parse('2026-10-22T07:07:00Z');
const ok = async () => new Response(JSON.stringify({ connectionId: 'a', connectionToken: 'b' }));
const down = async () => new Response('Forbidden', { status: 403 });

test('bilan de santé : tout va bien, rien à signaler', async () => {
  const env = { DB: fakeDB({ errors: { '2026-10-21': 3, '2026-10-20': 2 } }) };
  const h = await healthCheck(env, { now, fetchFn: ok });
  assert.deepEqual(h.problems, []);
  assert.equal(h.f1ok, true);
  assert.equal(JSON.parse(env.DB.studio.get('health')).f1fails, 0);
});

test('bilan de santé : flux F1 en panne signalé au 2e échec, seulement s\'il a déjà répondu', async () => {
  // Jamais joignable depuis le serveur : pas d'alerte (la F1 peut bloquer les serveurs de Cloudflare)
  const never = { DB: fakeDB() };
  await healthCheck(never, { now, fetchFn: down });
  assert.deepEqual((await healthCheck(never, { now: now + 6 * 3600e3, fetchFn: down })).problems, []);
  // Déjà joignable : 1er échec patient, 2e signalé, puis une seule fois dans la journée
  const env = { DB: fakeDB() };
  await healthCheck(env, { now, fetchFn: ok });
  assert.deepEqual((await healthCheck(env, { now: now + 3600e3, fetchFn: down })).problems, []);
  const h = await healthCheck(env, { now: now + 2 * 3600e3, fetchFn: down });
  assert.deepEqual(h.problems.map((p) => p.k), ['f1']);
  assert.match(h.problems[0].m, /HTTP 403/);
  assert.equal(h.sent.f1, '2026-10-22');
  // Format changé : réponse sans identifiant de connexion
  const odd = { DB: fakeDB() };
  await healthCheck(odd, { now, fetchFn: ok });
  await healthCheck(odd, { now, fetchFn: async () => new Response('{}') });
  assert.match((await healthCheck(odd, { now, fetchFn: async () => new Response('{}') })).problems[0].m, /format changé/);
});

test('bilan de santé : pic d\'erreurs de l\'appli et jetons bientôt expirés', async () => {
  const errors = { '2026-10-21': 40 };
  for (let d = 14; d <= 20; d++) errors[`2026-10-${d}`] = 5;
  const env = { DB: fakeDB({ errors, top: { place: 'tower.js:12', version: '1.28.0', n: 30 } }) };
  // Jetons notés par le Studio : Threads dans 3 jours, F1 TV expiré, sans jamais garder les jetons eux-mêmes
  const jwtExp = () => now - 1000;
  await noteExpiries(env, { threads: { token: 'secret-threads', expiresAt: now + 3 * 86400e3 }, f1tv: 'jwt.secret' }, jwtExp);
  assert.ok(!env.DB.studio.get('expiries').includes('secret'));
  const h = await healthCheck(env, { now, fetchFn: ok });
  assert.deepEqual(h.problems.map((p) => p.k), ['errors', 'token.threads', 'token.f1tv']);
  assert.equal(h.problems[0].m, 'Erreurs de l\'appli : 40 hier, contre 5 par jour avant (surtout tower.js:12, v1.28.0)');
  assert.match(h.problems[1].m, /Threads : expire dans 3 jours/);
  assert.match(h.problems[2].m, /F1 TV expiré/);
  // Erreurs habituelles (pas de pic) : rien
  const usual = { '2026-10-21': 12 };
  for (let d = 14; d <= 20; d++) usual[`2026-10-${d}`] = 9;
  const calm = { DB: fakeDB({ errors: usual }) };
  assert.deepEqual((await healthCheck(calm, { now, fetchFn: ok })).problems, []);
});
