import test from 'node:test';
import assert from 'node:assert/strict';
import { destructors } from '../shared/destructors.js';
import { DESTRUCTORS } from '../analytics/destructors-data.js';

test('championnat des casseurs : totaux par pilote, écurie et pièce, plus gros dégâts', () => {
  const rows = [
    { round: 1, num: 87, driver: 'Bearman', team: 'Haas', parts: [['Front Wing', 150000, 1], ['Tyre', 3000, 2]] },
    { round: 2, num: 31, driver: 'Ocon', team: 'Haas', parts: [['Floor', 200000, 1]] },
    { round: 3, num: 87, driver: 'Bearman', team: 'Haas', parts: [['Front Wing', 150000, 2]] },
  ];
  const d = destructors(rows);
  assert.equal(d.total, 656000);
  assert.deepEqual(d.drivers.map((x) => [x.driver, x.cost, x.incidents, x.pos]), [['Bearman', 456000, 2, 1], ['Ocon', 200000, 1, 2]]);
  assert.deepEqual(d.teams.map((x) => [x.team, x.cost, x.incidents]), [['Haas', 656000, 3]]);
  assert.deepEqual(d.parts[0], { name: 'Front Wing', price: 150000, qty: 3, cost: 450000 });
  assert.deepEqual(d.top.map((x) => [x.driver, x.round, x.cost]), [['Bearman', 3, 300000], ['Ocon', 2, 200000], ['Bearman', 1, 156000]]);
});

test('championnat des casseurs 2026 : données reprises, même total que la source (24 371 000 $)', () => {
  assert.equal(DESTRUCTORS.year, 2026);
  assert.equal(destructors(DESTRUCTORS.rows).total, 24371000);
  assert.equal(destructors(DESTRUCTORS.rows).drivers[0].driver, 'Bearman');
});

function fakeDB() {
  const studio = new Map();
  return {
    studio,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return studio.has(args[0]) ? { v: studio.get(args[0]) } : null; },
        async run() { studio.set(args[0], args[1]); return {}; },
      };
      return st;
    },
  };
}
// Page de Formula 1 Dashboard : données glissées par Next.js dans self.__next_f
const page = (rows, year = 2026) => `<title>${year} F1 Destructors Championship: Crash Costs</title><script>self.__next_f.push([1,${JSON.stringify(`5:{"state":{"data":${JSON.stringify(rows)}},"x":1}`)}])</script>`;
const ROW = { round: 1, driver_number: 87, driver_name: 'Bearman', constructor_name: 'Haas F1 Team', grand_prix_country: 'Australia', components: [{ component_id: 1, name: 'Front Wing', price: 150000, quantity: 2 }] };

test('championnat des casseurs : page de Formula 1 Dashboard lue (année, dégâts, pièces)', async () => {
  const { parseDashboard } = await import('../shared/destructors.js');
  assert.deepEqual(parseDashboard(page([ROW])), { year: 2026, rows: [{ round: 1, num: 87, driver: 'Bearman', team: 'Haas F1 Team', parts: [['Front Wing', 150000, 2]] }] });
  assert.equal(parseDashboard('<html>autre page</html>'), null);
});

test('championnat des casseurs : relu au plus toutes les 12 h, dernière lecture gardée si la page ne répond pas', async () => {
  const { destructorsWeb } = await import('../analytics/destructors.js');
  const now = Date.UTC(2026, 9, 28, 8);
  const env = { DB: fakeDB() };
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, text: async () => page([ROW]) }; };
  const down = async () => { calls++; throw new Error('injoignable'); };
  assert.equal((await destructorsWeb(env, 2026, { now, fetchFn: ok })).rows.length, 1);
  assert.equal((await destructorsWeb(env, 2026, { now: now + 3600e3, fetchFn: ok })).rows.length, 1);
  assert.equal(calls, 1, 'pas relue avant 12 h');
  assert.equal((await destructorsWeb(env, 2026, { now: now + 13 * 3600e3, fetchFn: down })).rows.length, 1, 'dernière lecture gardée');
  assert.equal(calls, 2);
  await destructorsWeb(env, 2026, { now: now + 13.5 * 3600e3, fetchFn: down });
  assert.equal(calls, 2, 'nouvel essai seulement une heure plus tard');
  assert.equal((await destructorsWeb({ DB: fakeDB() }, 2026, { now, fetchFn: down })).rows.length, DESTRUCTORS.rows.length, 'jamais lue : données livrées avec le serveur');
  assert.deepEqual((await destructorsWeb(env, 2025, { now, fetchFn: ok })).rows, [], 'autre saison : rien');
});
