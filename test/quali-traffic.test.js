import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficAlerts } from '../shared/quali-traffic.js';

const L = 90;

test('trafic en qualifs : tour lancé à moins de 5 s d\'une voiture lente devant', () => {
  const cars = [
    { num: '44', p: 100, rate: 1, hot: true },
    { num: '23', p: 103.1, rate: 0.6, hot: false },
  ];
  const [a] = trafficAlerts(cars, L);
  assert.equal(a.hot, '44');
  assert.equal(a.slow, '23');
  assert.ok(Math.abs(a.gap - 3.1) < 1e-9);
});

test('trafic en qualifs : rien si la voiture lente est loin, derrière, ou si personne n\'est lent', () => {
  assert.deepEqual(trafficAlerts([{ num: '44', p: 100, rate: 1, hot: true }, { num: '23', p: 110, rate: 0.6 }], L), [], 'à 10 s');
  assert.deepEqual(trafficAlerts([{ num: '44', p: 100, rate: 1, hot: true }, { num: '23', p: 98, rate: 0.6 }], L), [], 'déjà dépassée');
  assert.deepEqual(trafficAlerts([{ num: '44', p: 100, rate: 1, hot: true }, { num: '1', p: 102, rate: 1, hot: true }], L), [], 'deux tours lancés');
  assert.deepEqual(trafficAlerts([{ num: '44', p: 100, rate: 1, hot: true }, { num: '4', p: 102, rate: 0.95 }], L), [], 'voiture qui roule vite (début de son tour lancé)');
});

test('trafic en qualifs : la plus proche devant, d\'un tour à l\'autre, triées par écart', () => {
  const cars = [
    { num: '44', p: 88, rate: 1, hot: true },                 // fin de tour : la voiture lente est au début du suivant
    { num: '23', p: 181.5, rate: 0.7 },                        // 2 tours plus loin en progression cumulée, 3,5 s devant
    { num: '10', p: 183, rate: 0.7 },
    { num: '16', p: 40, rate: 1, hot: true },
    { num: '31', p: 41, rate: 0.5 },
  ];
  assert.deepEqual(trafficAlerts(cars, L).map((a) => [a.hot, a.slow, Math.round(a.gap * 10) / 10]), [['16', '31', 1], ['44', '23', 3.5]]);
});
