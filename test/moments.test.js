import test from 'node:test';
import assert from 'node:assert/strict';
import { keyMoments } from '../shared/moments.js';

const ev = (off, topic, data) => ({ off, topic, data });
const pos = (off, map) => ev(off, 'TimingData', { Lines: Object.fromEntries(Object.entries(map).map(([n, p]) => [n, { Position: String(p) }])) });

test('moments clés : départ, voiture de sécurité, leader, arrêts groupés, pénalité, arrivée', () => {
  const events = [
    ev(0, 'DriverList', { 1: { Tla: 'NOR' }, 16: { Tla: 'LEC' }, 44: { Tla: 'HAM' } }),
    pos(500, { 1: 1, 16: 2, 44: 3 }),
    ev(1000, 'SessionStatus', { Status: 'Started' }),
    ev(2000, 'LapCount', { CurrentLap: 5 }),
    pos(60000, { 16: 1, 1: 2 }),
    ev(90000, 'TrackStatus', { Status: '4' }),
    ev(91000, 'TimingData', { Lines: { 16: { InPit: true } } }),
    ev(95000, 'TimingData', { Lines: { 1: { InPit: true } } }),
    ev(150000, 'TrackStatus', { Status: '1' }),
    ev(160000, 'RaceControlMessages', { Messages: { 3: { Message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION (14:00:00)' } } }),
    ev(170000, 'RaceControlMessages', { Messages: { 4: { Message: 'FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (NOR) AND 16 (LEC) NO FURTHER ACTION' } } }),
    ev(180000, 'RaceControlMessages', { Messages: { 5: { Message: 'FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION (14:02:00)' } } }),
    ev(200000, 'SessionStatus', { Status: 'Finished' }),
    ev(205000, 'TimingData', { Lines: { 44: { Stopped: true } } }),
  ];
  const m = keyMoments(events, { kind: 'race' });
  const k = m.map((x) => x.kind);
  assert.deepEqual(k, ['start', 'lead', 'sc', 'pit', 'green', 'penalty', 'finish']);
  assert.equal(m[1].text, 'LEC prend la tête devant NOR');
  assert.equal(m[3].text, 'Arrêts de LEC, NOR', 'arrêts sous voiture de sécurité regroupés');
  assert.equal(m[5].text, 'HAM : 5 s de pénalité (collision)');
  assert.equal(m[1].lap, 5);
});

test('moments clés : qualifications (parties, pole en Q3 seulement)', () => {
  const events = [
    ev(0, 'DriverList', { 1: { Tla: 'NOR' }, 63: { Tla: 'RUS' } }),
    ev(1000, 'TimingData', { SessionPart: 1 }),
    ev(1000, 'SessionStatus', { Status: 'Started' }),
    pos(20000, { 1: 1, 63: 2 }), pos(30000, { 63: 1, 1: 2 }),
    ev(40000, 'SessionStatus', { Status: 'Finished' }),
    ev(50000, 'TimingData', { SessionPart: 3 }),
    ev(50000, 'SessionStatus', { Status: 'Started' }),
    pos(60000, { 1: 1, 63: 2 }),
    ev(70000, 'SessionStatus', { Status: 'Finished' }),
  ];
  const m = keyMoments(events, { kind: 'quali' });
  assert.deepEqual(m.map((x) => x.text), ['Début de Q1', 'Fin de Q1', 'Début de Q3', 'NOR passe en tête (Q3)', 'Fin de Q3 : pole pour NOR']);
});
