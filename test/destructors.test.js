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
