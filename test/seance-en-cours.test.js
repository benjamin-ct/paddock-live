import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSession } from '../scripts/seance-en-cours.mjs';

const race = {
  raceName: 'Mexico City Grand Prix', date: '2026-11-01', time: '20:00:00Z',
  SecondPractice: { date: '2026-10-30', time: '22:00:00Z' },
  Qualifying: { date: '2026-10-31', time: '21:00:00Z' },
};
const at = (iso) => Date.parse(iso);

test('séance en cours : de 15 min avant à 2 h 30 après son début', () => {
  assert.equal(liveSession(race, at('2026-10-30T21:50:00Z')), 'Mexico City Grand Prix · SecondPractice');
  assert.equal(liveSession(race, at('2026-10-30T22:14:00Z')), 'Mexico City Grand Prix · SecondPractice');
  assert.equal(liveSession(race, at('2026-11-01T22:00:00Z')), 'Mexico City Grand Prix · Race');
});

test('hors séance, ou pas de calendrier : déploiement permis', () => {
  assert.equal(liveSession(race, at('2026-10-30T21:40:00Z')), null);
  assert.equal(liveSession(race, at('2026-10-31T00:31:00Z')), null);
  assert.equal(liveSession(undefined), null);
});
