import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary, gpNameFr, summaryFacts } from '../shared/summary.js';

const state = {
  SessionInfo: { Type: 'Race', Name: 'Race', Meeting: { Name: 'Italian Grand Prix' } },
  SessionStatus: { Status: 'Finished' },
  LapCount: { CurrentLap: 53, TotalLaps: 53 },
  DriverList: { 1: { Tla: 'NOR', LastName: 'Norris', TeamName: 'McLaren' }, 16: { Tla: 'LEC', LastName: 'Leclerc' }, 44: { Tla: 'HAM', LastName: 'Hamilton' }, 14: { Tla: 'ALO', LastName: 'Alonso' }, 18: { Tla: 'STR', LastName: 'Stroll' } },
  TimingData: { Lines: {
    1: { Position: '1', NumberOfLaps: 53 }, 16: { Position: '2', GapToLeader: '+2.5', NumberOfLaps: 53 }, 44: { Position: '3', NumberOfLaps: 53 },
    18: { Position: '4', NumberOfLaps: 52, Stopped: true }, 14: { Position: '5', NumberOfLaps: 20, Retired: true },
  } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM' }, { Compound: 'HARD' }] }, 16: { GridPos: '1' }, 44: { GridPos: '10' }, 18: { GridPos: '8' }, 14: { GridPos: '6' } } },
  TimingStats: { Lines: { 44: { PersonalBestLapTime: { Value: '1:21.000', Position: 1, Lap: 50 } } } },
  RaceControlMessages: { Messages: [{ Message: 'SAFETY CAR DEPLOYED', Lap: 12 }, { Message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 18 (STR) - SPEEDING IN THE PIT LANE' },
    { Message: 'FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 18 (STR) - SPEEDING IN THE PIT LANE' }] },   // purgée : pas une 2e
};

test('résumé : course terminée (vainqueur, écart, remontée, stratégie, neutralisations, abandons, pénalités)', () => {
  const s = buildSummary(state);
  assert.equal(s.title, "Norris remporte le Grand Prix d'Italie");
  const t = s.paragraphs.join('\n');
  assert.match(t, /Norris \(McLaren\) s'impose devant Leclerc et Hamilton, avec 2,5 s d'avance sur son dauphin, après être parti 2e\./);
  assert.match(t, /Belles remontées : Hamilton \(10e → 3e, \+7\)/);
  assert.match(t, /Stratégie de Norris : 1 arrêt \(médiums → durs\)/);
  assert.match(t, /une voiture de sécurité \(tour 12\)/);
  // VSC écrite « VSC DEPLOYED » depuis 2026
  const v = buildSummary({ ...state, RaceControlMessages: { Messages: [{ Message: 'VSC DEPLOYED', Lap: 51 }] } }).paragraphs.join(' ');
  assert.match(v, /une VSC \(tour 51\)/);
  assert.doesNotMatch(v, /voiture de sécurité/);
  assert.match(t, /Abandon : Alonso\./, 'Stroll, garé après l\'arrivée avec 52 tours, est classé');
  assert.match(t, /Pénalités : Stroll \(5 s\)/);
  assert.match(t, /Meilleur tour : Hamilton en 1:21.000 \(tour 50\)/);
  assert.equal(s.final, true);
});

test('résumé : course en cours (provisoire) et nom du Grand Prix en français', () => {
  const s = buildSummary({ ...state, SessionStatus: { Status: 'Started' }, LapCount: { CurrentLap: 30, TotalLaps: 53 }, RaceControlMessages: { Messages: [] } });
  assert.equal(s.title, 'Norris en tête (tour 30 / 53)');
  assert.match(s.paragraphs.join('\n'), /Pas de neutralisation jusqu'ici\./);
  assert.match(s.paragraphs.at(-1), /provisoire/);
  assert.equal(gpNameFr('Azerbaijan Grand Prix'), "le Grand Prix d'Azerbaïdjan");
  assert.equal(gpNameFr('United States Grand Prix'), 'le Grand Prix des États-Unis');
});

test('résumé : sans données', () => {
  assert.equal(buildSummary({}).title, 'Résumé indisponible');
});

test('résumé en cartes : mêmes éléments en données (podium, remontées, stratégie, neutralisations, abandons)', () => {
  const f = summaryFacts(state);
  assert.equal(f.kind, 'race');
  assert.equal(f.final, true);
  assert.deepEqual(f.top.map((d) => [d.tla, d.gap, d.grid]), [['NOR', '', 2], ['LEC', '+2.5', 1], ['HAM', '', 10]]);
  assert.deepEqual(f.up.map((m) => [m.tla, m.from, m.to, m.d]), [['HAM', 10, 3, 7], ['STR', 8, 4, 4]]);
  assert.deepEqual(f.leaderStrat, ['MEDIUM', 'HARD']);
  assert.deepEqual(f.sc, [12]);
  assert.deepEqual(f.out.map((d) => d.tla), ['ALO'], 'Stroll, garé après l\'arrivée avec 52 tours, est classé');
  assert.deepEqual(f.penalties, ['Stroll (5 s)']);
  assert.equal(f.fastest.tla, 'HAM');
  assert.equal(f.fastest.lap, 50);
});
