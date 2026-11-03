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

// Départ : circuit circulaire (100 points, tour de 100 s), virage 1 au quart du tour ; voitures à vitesse constante
// après le feu vert, une position GPS toutes les 250 ms
const N = 100, R = 1000;
const circle = { x: Array.from({ length: N }, (_, i) => R * Math.cos((2 * Math.PI * i) / N)), y: Array.from({ length: N }, (_, i) => R * Math.sin((2 * Math.PI * i) / N)),
  candidateLap: { lapTime: 100 }, corners: [{ number: 1, trackPosition: { x: 0, y: R } }] };
const T0 = Date.parse('2026-11-01T20:00:00Z');
const car = (p0, speed) => {
  const c = { utc: [], x: [], y: [] };
  for (let t = T0 - 5000; t <= T0 + 30000; t += 250) {
    const p = p0 + speed * Math.max(0, t - T0) / 1000, a = (2 * Math.PI * p) / N;
    c.utc.push(t); c.x.push(R * Math.cos(a)); c.y.push(R * Math.sin(a));
  }
  return c;
};
// Grille : 1 en pole, 16 deuxième, 44 troisième mais plus rapide (au virage 1 à 11 s, 1 à 12,7 s, 16 à 12,8 s)
const startCars = () => new Map([['1', car(6, 1.5)], ['16', car(4.5, 1.6)], ['44', car(3, 2)]]);
const startGrid = new Map([['1', 1], ['16', 2], ['44', 3]]);

test('Tendances : départ, places gagnées entre la grille et le premier virage (GPS)', async () => {
  const { startGains } = await import('../shared/insights.js');
  const { Track } = await import('../shared/track.js');
  const track = new Track(circle);
  const g = startGains(track, startCars(), T0, startGrid);
  assert.equal(g.seen, 3);
  assert.deepEqual(g.moves.map((m) => [m.num, m.grid, m.t1, m.gained]), [['44', 3, 1, 2], ['1', 1, 2, -1], ['16', 2, 3, -1]]);
  // Délai TV : rien après maxUtc (seul 44 a passé le virage 1 à 11,5 s)
  assert.deepEqual(startGains(track, startCars(), T0, startGrid, T0 + 11500).moves.map((m) => m.num), ['44']);
  assert.equal(startGains(new Track({ ...circle, corners: [] }), startCars(), T0, startGrid), null, 'pas de virage connu');
  assert.equal(startGains(track, startCars(), NaN, startGrid), null);
});

test('Tendances : départ d\'après le flux (grille avant le feu vert, heure F1 des Heartbeat, tracé chargé)', async () => {
  const { raceStartFrom } = await import('../shared/compare.js');
  const OFF = 5000;   // heure locale de réception = heure F1 + 5 s
  const events = [
    { t: T0 - 60000 + OFF, topic: 'SessionInfo', data: { Meeting: { Circuit: { Key: 65 } }, StartDate: '2026-11-01T14:00:00' } },
    { t: T0 - 30000 + OFF, topic: 'TimingData', data: { Lines: { 1: { Position: '1' }, 16: { Position: '2' }, 44: { Position: '3' } } } },
    ...[-20000, -10000, 0, 10000].map((d) => ({ t: T0 + d + OFF, topic: 'Heartbeat', data: { Utc: new Date(T0 + d).toISOString() } })),
    { t: T0 + OFF, topic: 'SessionStatus', data: { Status: 'Started' } },
    { t: T0 + 1000 + OFF, topic: 'TimingData', data: { Lines: { 44: { Position: '1' } } } },   // après le départ : pas la grille
  ];
  const asked = [];
  const load = async (key, year) => { asked.push([key, year]); return [circle]; };
  const s = await raceStartFrom({ events, cars: startCars(), until: T0 + 60000 + OFF, load });
  assert.deepEqual(asked, [[65, 2026]]);
  assert.deepEqual(s.moves.map((m) => [m.num, m.grid, m.gained]), [['44', 3, 2], ['1', 1, -1], ['16', 2, -1]]);
  // Départ pas encore affiché (délai TV), pas de GPS, pas de tracé : rien
  assert.equal(await raceStartFrom({ events, cars: startCars(), until: T0 + OFF - 1, load }), null);
  assert.equal(await raceStartFrom({ events, cars: new Map(), until: Infinity, load }), null);
  assert.equal(await raceStartFrom({ events, cars: startCars(), until: Infinity, load: async () => [null] }), null);
  assert.equal(await raceStartFrom({ events: events.filter((e) => e.topic !== 'SessionStatus'), cars: startCars(), until: Infinity, load }), null);
});
