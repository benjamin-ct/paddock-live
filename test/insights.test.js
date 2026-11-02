import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackEvolution, wingChoice, tyreWear, FUEL_GAIN } from '../shared/insights.js';
import { clockOffset } from '../shared/compare.js';

const lt = (s) => `1:${(s - 60).toFixed(3).padStart(6, '0')}`;

test('Tendances : évolution de la piste, meilleur tour de chaque quart de la séance', () => {
  // 4 pilotes, un tour toutes les 2 min pendant 60 min, la piste gagne 0,02 s par minute
  const laps = {};
  for (const n of ['1', '4', '16', '44']) laps[n] = Array.from({ length: 30 }, (_, i) => ({ lap: i + 1, t: i * 120000, time: lt(78 - i * 0.04 + Number(n) / 1000) }));
  const e = trackEvolution(laps);
  assert.equal(e.quarters.length, 4);
  assert.ok(e.quarters.every((v, i) => !i || v < e.quarters[i - 1]), JSON.stringify(e.quarters));
  assert.ok(Math.abs(e.gain - 0.04 * 21) < 0.1, `gain ${e.gain}`);
  assert.equal(trackEvolution({ 1: [{ t: 0, time: '1:20.000' }] }), null);
});

test('Tendances : choix d\'aileron, vitesse de pointe et meilleur tour par écurie', () => {
  const state = {
    DriverList: { 1: { TeamName: 'Red Bull', TeamColour: '3671C6' }, 22: { TeamName: 'Red Bull' }, 16: { TeamName: 'Ferrari', TeamColour: 'E8002D' } },
    TimingData: { Lines: { 1: { BestLapTime: { Value: '1:19.300' } }, 22: { BestLapTime: { Value: '1:19.900' } }, 16: { BestLapTime: { Value: '1:19.200' } } } },
    TimingStats: { Lines: { 1: { BestSpeeds: { ST: { Value: '350' } } }, 22: { BestSpeeds: { ST: { Value: '352' } } }, 16: { BestSpeeds: { ST: { Value: '345' } } } } },
  };
  assert.deepEqual(wingChoice(state).map((r) => [r.team, r.st, r.lap]), [['Ferrari', 345, 79.2], ['Red Bull', 351, 79.3]]);
});

test('Tendances : usure des pneus sur le relais en cours, corrigée du carburant', () => {
  // VER : relais de 10 tours qui perd 0,02 s par tour (brut) après un arrêt ; tour 1, tour de sortie et tour lent (safety car) ignorés
  const laps = { 1: [
    ...Array.from({ length: 5 }, (_, i) => ({ lap: i + 1, time: lt(81), compound: 'MEDIUM' })),
    { lap: 6, time: lt(100), compound: 'MEDIUM', pit: true },
    ...Array.from({ length: 10 }, (_, i) => ({ lap: 7 + i, time: lt(80 + 0.02 * i + (i === 4 ? 9 : 0)), compound: 'HARD' })),
  ] };
  const [w] = tyreWear(laps);
  assert.equal(w.compound, 'HARD');
  assert.equal(w.laps, 10);
  assert.ok(Math.abs(w.wear - (0.02 + FUEL_GAIN)) < 0.003, `usure ${w.wear}`);
  assert.deepEqual(tyreWear({ 1: laps[1].slice(0, 7) }), []);   // moins de 8 tours propres
});

test('heure F1 de l\'archive : écart médian des Heartbeat (Mexico 2026 : quelques-uns décalés de 20 min)', () => {
  const events = [0, 1, 2, 3, 4].map((i) => ({ t: 1000 + i * 5000, topic: 'Heartbeat', data: { Utc: new Date(Date.parse('2026-11-01T20:00:00Z') + i * 5000 + (i === 2 ? 1200e3 : 0)).toISOString() } }));
  assert.equal(clockOffset(events, Infinity), 1000 - Date.parse('2026-11-01T20:00:00Z'));
  assert.equal(clockOffset([], Infinity), null);
});
