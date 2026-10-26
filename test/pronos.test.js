import test from 'node:test';
import assert from 'node:assert/strict';
import { pronosApi } from '../analytics/pronos.js';
import { liveApi } from '../analytics/live-relay.js';

// Base D1 réduite aux requêtes des pronostics en ligne (et à la saison gardée)
function fakeD1(seasonV) {
  const groups = new Map(); const picks = new Map(); const created = new Map(); const admins = new Map();
  const studio = new Map([['season:2026', JSON.stringify({ at: Date.now(), v: seasonV })]]);
  return {
    picks,
    prepare(sql) {
      const st = (a) => ({
        async first() {
          if (sql.startsWith('SELECT v FROM studio')) return studio.has(a[0]) ? { v: studio.get(a[0]) } : null;
          if (sql.startsWith('SELECT id, name FROM pronos_groups')) return groups.get(a[0]) || null;
          if (sql.startsWith('SELECT tok FROM pronos_admins')) return admins.has(a[0]) ? { tok: admins.get(a[0]) } : null;
          if (sql.startsWith('SELECT n FROM pronos_new')) return created.has(`${a[0]}|${a[1]}`) ? { n: created.get(`${a[0]}|${a[1]}`) } : null;
          throw new Error(`requête inattendue : ${sql}`);
        },
        async all() {
          if (sql.startsWith('SELECT round, pkey')) return { results: [...picks.values()].filter((r) => r.grp === a[0] && r.year === a[1]) };
          if (sql.startsWith('SELECT DISTINCT tok')) return { results: [...new Set([...picks.values()].filter((r) => r.grp === a[0]).map((r) => r.tok))].map((tok) => ({ tok })) };
          throw new Error(`requête inattendue : ${sql}`);
        },
        async run() {
          if (sql.startsWith('INSERT INTO pronos_new')) created.set(`${a[0]}|${a[1]}`, (created.get(`${a[0]}|${a[1]}`) || 0) + 1);
          else if (sql.startsWith('INSERT INTO pronos_groups')) groups.set(a[0], { id: a[0], name: a[1] });
          else if (sql.startsWith('INSERT INTO pronos_admins')) admins.set(a[0], a[1]);
          else if (sql.startsWith('DELETE FROM pronos WHERE')) { for (const [k, r] of picks) if (r.grp === a[0]) picks.delete(k); }
          else if (sql.startsWith('DELETE FROM pronos_admins')) admins.delete(a[0]);
          else if (sql.startsWith('DELETE FROM pronos_groups')) groups.delete(a[0]);
          else if (sql.startsWith('INSERT INTO pronos ')) {
            const [grp, year, round, pkey, name, pole, p1, p2, p3, tok, at] = a;
            const k = `${grp}|${year}|${round}|${pkey}`;
            picks.set(k, { ...(picks.get(k) || { tok }), grp, year, round, pkey, name, pole, p1, p2, p3, at });
          } else throw new Error(`requête inattendue : ${sql}`);
        },
      });
      return { bind: (...a) => st(a) };
    },
  };
}

const call = (env, method, path, body, now) => pronosApi(new Request(`https://paddocklive.app${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }), env, new URL(`https://paddocklive.app${path}`), { now }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

test('pronostics en ligne : groupe partagé, pseudo réservé, choix des autres cachés jusqu\'à la fermeture', async () => {
  const drv = (code, name) => ({ code, name, team: 'X' });
  const season = {
    drivers: [drv('VER', 'Max Verstappen'), drv('NOR', 'Lando Norris'), drv('LEC', 'Charles Leclerc'), drv('HAM', 'Lewis Hamilton')],
    races: [{ round: 18, name: 'United States Grand Prix', date: '2026-10-25T19:00:00Z', results: [], quali: [],
      sessions: [{ label: 'Qualifications', t: '2026-10-24T21:00:00Z' }, { label: 'Course', t: '2026-10-25T19:00:00Z' }] }],
  };
  const env = { DB: fakeD1(season) };
  const now = Date.parse('2026-10-20T10:00:00Z');
  const g = await call(env, 'POST', '/p/api/new', { name: 'Les copains' }, now);
  assert.match(g.id, /^[a-z0-9]{10}$/);
  assert.equal(g.name, 'Les copains');
  // Alice pronostique : un jeton lui est rendu
  const a = await call(env, 'POST', `/p/api/${g.id}`, { year: 2026, round: 18, name: 'Alice', pole: 'VER', p1: 'NOR', p2: 'VER', p3: 'LEC' }, now);
  assert.equal(a.status, 200);
  assert.ok(a.tok.length >= 20);
  // Quelqu'un d'autre ne peut pas prendre le pseudo d'Alice
  const b = await call(env, 'POST', `/p/api/${g.id}`, { year: 2026, round: 18, name: 'alice', p1: 'HAM' }, now);
  assert.equal(b.status, 403);
  assert.match(b.error, /pseudo est déjà pris/);
  // Alice modifie avec son jeton
  assert.equal((await call(env, 'POST', `/p/api/${g.id}`, { year: 2026, round: 18, name: 'Alice', pole: 'VER', p1: 'VER', p2: 'NOR', p3: 'LEC', tok: a.tok }, now)).status, 200);
  // Vue de Bob (sans jeton) : choix d'Alice cachés avant les qualifications ; vue d'Alice : les siens
  const bob = await call(env, 'GET', `/p/api/${g.id}?year=2026`, null, now);
  assert.equal(bob.group.name, 'Les copains');
  assert.deepEqual([bob.races[0].picks[0].pole, bob.races[0].picks[0].p1, bob.races[0].picks[0].mine], ['?', '?', false]);
  const alice = await call(env, 'GET', `/p/api/${g.id}?year=2026&tok=${a.tok}`, null, now);
  assert.deepEqual([alice.races[0].picks[0].p1, alice.races[0].picks[0].mine], ['VER', true]);
  // Après le départ : fermé, et tout le monde voit les choix
  const late = Date.parse('2026-10-25T19:05:00Z');
  assert.match((await call(env, 'POST', `/p/api/${g.id}`, { year: 2026, round: 18, name: 'Bob', p1: 'HAM' }, late)).error, /fermés/);
  assert.equal((await call(env, 'GET', `/p/api/${g.id}?year=2026`, null, late)).races[0].picks[0].p1, 'VER');
  // Groupe inconnu
  assert.equal((await call(env, 'GET', '/p/api/abcdefghij', null, now)).status, 404);
});

test('pronostics en ligne : saison enregistrée utilisée sans attendre sa reconstruction', async () => {
  const season = { drivers: [], races: [] };
  const env = { DB: fakeD1(season) };
  // Saison relue il y a 2 h (au-delà des 30 min du Studio) : servie telle quelle, sans appel réseau
  env.DB.prepare('INSERT INTO pronos_groups').bind('abcdefghij', 'Test').run();
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('reconstruction inattendue'); };
  try {
    const studioRow = JSON.stringify({ at: Date.now() - 2 * 3600e3, v: season });
    const prep = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => (sql.startsWith('SELECT v FROM studio') ? { bind: () => ({ first: async () => ({ v: studioRow }) }) } : prep(sql));
    const r = await call(env, 'GET', '/p/api/abcdefghij?year=2026', null, Date.now());
    assert.equal(r.status, 200);
    assert.equal(r.group.name, 'Test');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = old; }
});

test('pronostics en ligne : suppression du groupe par son créateur (ou son seul joueur pour les anciens groupes)', async () => {
  const season = { drivers: [{ code: 'VER', name: 'Max Verstappen', team: 'X' }, { code: 'NOR', name: 'Lando Norris', team: 'X' }],
    races: [{ round: 18, name: 'United States Grand Prix', date: '2026-10-25T19:00:00Z', results: [], quali: [], sessions: [{ label: 'Course', t: '2026-10-25T19:00:00Z' }] }] };
  const env = { DB: fakeD1(season) };
  const now = Date.parse('2026-10-20T10:00:00Z');
  const g = await call(env, 'POST', '/p/api/new', { name: 'Les copains' }, now);
  assert.ok(g.admin.length >= 20);
  const a = await call(env, 'POST', `/p/api/${g.id}`, { year: 2026, round: 18, name: 'Alice', p1: 'VER' }, now);
  // Un joueur qui n'a pas créé le groupe ne peut pas le supprimer, même seul
  const refus = await call(env, 'DELETE', `/p/api/${g.id}`, { tok: a.tok }, now);
  assert.equal(refus.status, 403);
  assert.match(refus.error, /créateur/);
  assert.equal((await call(env, 'DELETE', `/p/api/${g.id}`, { admin: g.admin }, now)).status, 200);
  assert.equal((await call(env, 'GET', `/p/api/${g.id}?year=2026`, null, now)).status, 404);
  assert.equal(env.DB.picks.size, 0);
  // Groupe créé avant le jeton du créateur : supprimable par son seul joueur, plus dès qu'il y en a deux
  await env.DB.prepare('INSERT INTO pronos_groups').bind('ancienxxxx', 'Ancien').run();
  const x = await call(env, 'POST', '/p/api/ancienxxxx', { year: 2026, round: 18, name: 'Xavier', p1: 'VER' }, now);
  await call(env, 'POST', '/p/api/ancienxxxx', { year: 2026, round: 18, name: 'Yves', p1: 'NOR' }, now);
  assert.match((await call(env, 'DELETE', '/p/api/ancienxxxx', { tok: x.tok }, now)).error, /autres joueurs/);
  await env.DB.prepare('INSERT INTO pronos_groups').bind('seulxxxxxx', 'Seul').run();
  const s = await call(env, 'POST', '/p/api/seulxxxxxx', { year: 2026, round: 18, name: 'Sam', p1: 'VER' }, now);
  assert.equal((await call(env, 'DELETE', '/p/api/seulxxxxxx', {}, now)).status, 403);
  assert.equal((await call(env, 'DELETE', '/p/api/seulxxxxxx', { tok: s.tok }, now)).status, 200);
});

test('pronostics depuis la version web : groupe en ligne relayé comme par l\'appli, pas de pronostics gardés sur l\'appareil', async () => {
  const env = { DB: fakeD1({ drivers: [], races: [] }) };
  const web = (method, q, body) => { const url = new URL(`https://app.paddocklive.app/live/api/predictions/online${q}`); return liveApi(new Request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), url, env).then(async (r) => ({ status: r.status, ...(await r.json()) })); };
  const g = await web('POST', '', { name: 'Bureau' });
  assert.match(g.id, /^[a-z0-9]{10}$/);
  assert.ok(g.admin);
  const v = await web('GET', `?g=${g.id}&year=&tok=`);
  assert.equal(v.status, 200);
  assert.equal(v.group.name, 'Bureau');
  assert.equal((await web('GET', '?g=../x')).status, 400);
  const local = new URL('https://app.paddocklive.app/live/api/predictions?year=2026');
  assert.deepEqual(await (await liveApi(new Request(local), local, env)).json(), { online: true });
});
