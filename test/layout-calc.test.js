import test from 'node:test';
import assert from 'node:assert/strict';
import { markSetup, setupToApply } from '../public/js/ui/layout-calc.js';

const list = [{ name: 'A', at: 1 }, { name: 'B', at: 2, kind: 'race' }, { name: 'C', at: 3, kind: 'quali' }];

test('dispositions : une seule marque par type de séance', () => {
  const l = markSetup(list, 'A', 'race');
  assert.deepEqual(l.map((s) => s.kind), ['race', undefined, 'quali'], 'B perd la marque « Course »');
  assert.ok(!('kind' in l[1]), 'champ retiré, pas laissé vide');
  assert.equal(l[0].at, 1, 'le reste de la disposition est gardé');
  assert.deepEqual(markSetup(list, 'C', '').map((s) => s.kind), [undefined, 'race', undefined], 'marque retirée');
  assert.deepEqual(markSetup(list, 'C', 'practice').map((s) => s.kind), [undefined, 'race', 'practice']);
});

test('dispositions : remise une seule fois au début de chaque séance', () => {
  assert.equal(setupToApply(list, 'race', '2026/Q', null)?.name, 'B');
  assert.equal(setupToApply(list, 'quali', '2026/Q', null)?.name, 'C');
  assert.equal(setupToApply(list, 'race', '2026/R', '2026/R'), null, 'séance déjà vue');
  assert.equal(setupToApply(list, 'practice', '2026/FP1', null), null, 'aucune disposition marquée');
  assert.equal(setupToApply(list, 'race', undefined, null), null, 'séance inconnue');
  assert.equal(setupToApply([{ name: 'X' }], 'race', 'id', null), null, 'ancienne disposition sans marque');
});
