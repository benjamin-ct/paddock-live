import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoint, parseCircuitData } from '../shared/fia-circuit.js';

test('plan FIA : positions « Xm after Tn »', () => {
  assert.deepEqual(parsePoint('- 90m after T16'), { m: 90, dir: 1, turn: 16, text: '90m after T16' });
  assert.equal(parsePoint('20m before T17').dir, -1);
  assert.deepEqual(parsePoint('- Entry T11'), { m: 0, dir: 1, turn: 11, text: 'Entry T11' });
  assert.equal(parsePoint('N/A'), null);
});

test('plan FIA : encadré CIRCUIT DATA (mode dépassement et zones ligne droite)', () => {
  // Positions des textes comme dans le PDF du Grand Prix d'Azerbaïdjan 2026
  const it = (x, y, s) => ({ x, y, s });
  const page = [
    it(97, 88, 'CIRCUIT DATA'), it(273, 88, 'OVERTAKE'), it(430, 88, 'STRAIGHT MODE'),
    it(171, 78, '- 45m before T5'), it(246, 78, 'DETECTION'), it(293, 78, '- 90m after T16'), it(391, 78, '45m after T19'),
    it(447, 78, '-'), it(453, 78, 'ZONE A1'), it(485, 78, '-'), it(498, 78, '45m after T20'),
    it(247, 71, 'ACTIVATION'), it(293, 71, '- 20m before T17'), it(392, 71, '110m after T2'),
    it(446, 71, '-'), it(453, 71, 'ZONE A2'), it(486, 71, '-'), it(498, 71, '160m after T2'),
  ];
  const d = parseCircuitData([[it(10, 500, 'autre page')], page]);
  assert.equal(d.detection.text, '90m after T16');
  assert.equal(d.activation.text, '20m before T17');
  assert.deepEqual(d.zones.map((z) => [z.name, z.normal.text, z.low.text]), [['A1', '45m after T19', '45m after T20'], ['A2', '110m after T2', '160m after T2']]);
  assert.equal(parseCircuitData([[it(1, 1, 'rien')]]), null);
});
