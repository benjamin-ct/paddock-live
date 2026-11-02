import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornerStats, typeStats, smoothDelta, cornerType } from '../public/js/ui/compare-calc.js';

// Tour fictif de 100 points : un virage lent au milieu (q = 0,5), A plus lent de 0,2 s dans le virage seulement
function trace() {
  const K = 100, mk = (slow) => {
    const s = { t: [], v: [], g: [], th: [], br: [], rpm: [] };
    for (let i = 0; i <= K; i++) {
      const inCorner = i >= 48 && i <= 52;
      s.t.push(i * 0.8 + (slow && i > 50 ? 0.2 : 0));
      s.v.push(inCorner ? (slow ? 90 : 95) : 300);
      s.g.push(inCorner ? 2 : 8);
      s.th.push(inCorner ? 20 : 100);
      s.br.push(i >= 46 && i <= 49 ? 100 : 0);
      s.rpm.push(11000);
    }
    return s;
  };
  return { K, len: 5000, corners: [{ n: 1, q: 0.5 }], tel: true, a: mk(true), b: mk(false) };
}

test('comparaison de télémétrie : virage, type, action et écart', () => {
  const tr = trace(), [c] = cornerStats(tr);
  assert.equal(c.n, 1);
  assert.equal(c.vA, 90);
  assert.equal(c.vB, 95);
  assert.equal(c.type, 'slow');
  assert.equal(c.actA, 'brake');
  assert.ok(c.dt > 0.15 && c.dt <= 0.2, `écart dans le virage ${c.dt}`);
  const rows = typeStats(tr, [c]);
  assert.deepEqual(rows.map((r) => r.type), ['slow', 'straight']);
  assert.equal(rows[1].vA, 300);
  // Écart total = virage + lignes droites
  assert.ok(Math.abs(rows[0].dt + rows[1].dt - 0.2) < 0.001);
});

test('comparaison de télémétrie : écart lissé exact au départ et à l’arrivée, types de virage', () => {
  const d = smoothDelta(trace());
  assert.equal(d[0], 0);
  assert.ok(Math.abs(d[100] - 0.2) < 1e-9);
  assert.equal(cornerType(100), 'slow');
  assert.equal(cornerType(180), 'medium');
  assert.equal(cornerType(240), 'fast');
  assert.equal(cornerType(null), null);
});
