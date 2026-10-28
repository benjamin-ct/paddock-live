import test from 'node:test';
import assert from 'node:assert/strict';
import { gridSlot, gridIndex, gridWeight } from '../public/js/grid.js';

test('grille de départ : cases en quinconce derrière la ligne, pole devant, du côté de l\'intérieur du premier virage', () => {
  assert.deepEqual(gridSlot(0, 1), [6, 3.2], 'pole à 6 m de la ligne, côté du premier virage');
  assert.deepEqual(gridSlot(1, 1), [14, -3.2], '2e : 8 m derrière, de l\'autre côté');
  assert.deepEqual(gridSlot(2, 1), [22, 3.2], '3e : 16 m derrière la pole, du même côté');
  assert.deepEqual(gridSlot(0, -1), [6, -3.2], 'premier virage de l\'autre côté : pole de l\'autre côté');
  assert.equal(gridSlot(21, 1)[0], 174);
});

test('grille de départ : voitures posées avant le départ de la course seulement, à leur place', () => {
  const st = (o = {}) => ({ SessionInfo: { Type: 'Race' }, LapCount: { CurrentLap: 1 }, TimingAppData: { Lines: { 16: { GridPos: '1' }, 44: { GridPos: '7' }, 1: {} } },
    TimingData: { Lines: { 16: { NumberOfLaps: 0 }, 44: {}, 1: {} } }, ...o });
  assert.equal(gridIndex(st(), '16'), 0);
  assert.equal(gridIndex(st(), '44'), 6);
  assert.equal(gridIndex(st(), '1'), -1, 'place inconnue');
  assert.equal(gridIndex(st({ SessionInfo: { Type: 'Qualifying' } }), '16'), -1, 'pas en qualifications');
  assert.equal(gridIndex(st({ LapCount: { CurrentLap: 2 } }), '16'), -1, 'course partie');
  assert.equal(gridIndex(st({ TimingData: { Lines: { 16: { NumberOfLaps: 1 } } } }), '16'), -1, 'tour fini');
  assert.equal(gridIndex(st({ TimingData: { Lines: { 16: { Retired: true } } } }), '16'), -1, 'abandon');
  // De la case à la position réelle en une seconde, sans saut
  let k = 1;
  for (let i = 0; i < 4; i++) k = gridWeight(k, false, 0.25);
  assert.equal(k, 0);
  assert.ok(Math.abs(gridWeight(0.5, true, 0.1) - 0.6) < 1e-9);
  assert.equal(gridWeight(undefined, true, 2), 1);
});
