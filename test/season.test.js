import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../server/season.js';

const drv = (code, last) => ({ code, givenName: 'X', familyName: last, permanentNumber: '1' });
const res = (pos, code, last, team, grid, pts) => ({ position: String(pos), positionText: String(pos), grid: String(grid), points: String(pts), status: 'Finished', Driver: drv(code, last), Constructor: { name: team, constructorId: team.toLowerCase() } });

test('saison : manches regroupées (pages), séances, résultats et classements', () => {
  const sched = [{ round: '1', raceName: 'Test Grand Prix', date: '2026-03-08', time: '04:00:00Z', Circuit: { circuitName: 'C', Location: { locality: 'L', country: 'P' } },
    FirstPractice: { date: '2026-03-06', time: '01:30:00Z' }, Qualifying: { date: '2026-03-07', time: '05:00:00Z' }, Sprint: { date: '2026-03-07', time: '01:00:00Z' } }];
  // Résultats de la manche 1 répartis sur deux pages de l'API
  const results = [{ round: '1', Results: [res(1, 'AAA', 'Alpha', 'Mercedes', 3, 25)] }, { round: '1', Results: [res(2, 'BBB', 'Beta', 'Ferrari', 1, 18)] }];
  const s = summarize({ schedule: sched, driverStandings: [{ position: '1', points: '25', wins: '1', Driver: drv('AAA', 'Alpha'), Constructors: [{ name: 'Mercedes', constructorId: 'mercedes' }] }],
    constructorStandings: [], results, quali: [{ round: '1', QualifyingResults: [{ position: '1', Driver: drv('BBB', 'Beta'), Constructor: { name: 'Ferrari', constructorId: 'ferrari' } }] }], sprint: [] });
  const r = s.races[0];
  assert.equal(r.results.length, 2);
  assert.deepEqual(r.results.map((x) => [x.code, x.grid, x.pos, x.points]), [['AAA', 3, 1, 25], ['BBB', 1, 2, 18]]);
  assert.equal(r.sprint, true);
  assert.deepEqual(r.sessions.map((x) => x.label), ['EL1', 'Sprint', 'Qualifications', 'Course']);
  assert.equal(r.quali[0].code, 'BBB');
  assert.equal(s.drivers[0].team, 'Mercedes');
});

test('saison : séance sans heure (horaires pas encore publiés) : pas d\'heure, date seule', () => {
  const sched = [{ round: '1', raceName: 'Test Grand Prix', date: '2027-03-07', Circuit: { circuitName: 'C', Location: {} }, Qualifying: { date: '2027-03-06' }, FirstPractice: { date: '2027-03-05', time: '01:30:00Z' } }];
  const r = summarize({ schedule: sched, driverStandings: [], constructorStandings: [], results: [], quali: [], sprint: [] }).races[0];
  assert.deepEqual(r.sessions, [{ label: 'EL1', t: '2027-03-05T01:30:00Z' }, { label: 'Qualifications', t: null, day: '2027-03-06' }, { label: 'Course', t: null, day: '2027-03-07' }]);
  assert.equal(r.date, '2027-03-07T00:00:00Z', 'date de la course gardée (tri, manches courues)');
});
