import { test } from 'node:test';
import assert from 'node:assert/strict';
import { energyNow, energyTotals } from '../shared/energy.js';

// Échantillons toutes les 250 ms à partir de valeurs [vitesse, accélérateur, frein]
const run = (rows, t0 = 0) => rows.map(([speed, thr, brk], i) => ({ t: t0 + i * 250, speed, thr, brk }));

test('énergie estimée : recharge (pied levé sans freiner à haute vitesse)', () => {
  const s = run([[290, 100, 0], [300, 100, 0], [298, 0, 0], [292, 0, 0], [285, 0, 0], [280, 0, 0]]);
  assert.equal(energyNow(s), 'harvest');
  assert.equal(energyTotals(s).harvest, 0.75);
  // Pied levé depuis moins de 0,5 s : pas encore affiché
  assert.equal(energyNow(s.slice(0, 4)), null);
  // Lent (virage) ou en freinant : pas une recharge
  assert.equal(energyNow(run([[120, 0, 0], [118, 0, 0], [115, 0, 0], [112, 0, 0]])), null);
  assert.equal(energyNow(run([[290, 0, 100], [270, 0, 100], [250, 0, 100], [230, 0, 100]])), null);
});

test('énergie estimée : batterie vide (plein gaz sans accélérer)', () => {
  // Accélère d'abord, puis plafonne et ralentit pied au plancher
  const s = run([[260, 100, 0], [266, 100, 0], [272, 100, 0], [278, 100, 0], [284, 100, 0], [284, 100, 0], [283, 100, 0], [281, 100, 0], [280, 100, 0], [278, 100, 0], [277, 100, 0]]);
  assert.equal(energyNow(s), 'clip');
  assert.equal(energyTotals(s).clip, 0.5);
  // Accélère encore : batterie qui débite, rien à signaler
  assert.equal(energyNow(s.slice(0, 5)), null);
  // Données invalides ou trou : rien
  assert.equal(energyNow([]), null);
  assert.deepEqual(energyTotals(run([[290, 0, 0]]).concat(run([[290, 0, 0]], 5000))), { harvest: 0, clip: 0 });
});
