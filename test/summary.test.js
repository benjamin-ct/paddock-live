import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary, gpNameFr, summaryFacts, favRace } from '../shared/summary.js';

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

test('résumé : dauphin à un tour, voitures arrêtées aux stands sous drapeau rouge', () => {
  const lap = { ...state, TimingData: { Lines: { ...state.TimingData.Lines, 16: { Position: '2', GapToLeader: '1L', NumberOfLaps: 52 } } } };
  assert.match(buildSummary(lap).paragraphs[0], /avec un tour d'avance sur son dauphin/);
  assert.match(buildSummary(lap, { lang: 'en' }).paragraphs[0], /a lap clear of second place/);
  // Drapeau rouge : Stroll arrêté dans la voie des stands reste en course, Alonso (abandon) non
  const red = { ...state, SessionStatus: { Status: 'Started' }, TrackStatus: { Status: '5' }, LapCount: { CurrentLap: 30, TotalLaps: 53 },
    TimingData: { Lines: { 1: { Position: '1', NumberOfLaps: 30 }, 16: { Position: '2', NumberOfLaps: 30 }, 44: { Position: '3', NumberOfLaps: 30 },
      18: { Position: '4', NumberOfLaps: 30, Stopped: true, InPit: true }, 14: { Position: '5', NumberOfLaps: 20, Retired: true } } } };
  const t = buildSummary(red).paragraphs.join('\n');
  assert.match(t, /Abandon : Alonso\./);
  assert.deepEqual(summaryFacts(red).out.map((d) => d.name), ['Alonso']);
});

test('résumé : noms des Grands Prix tirés de la même liste que l\'appli (gp-names.js)', () => {
  assert.equal(gpNameFr('Abu Dhabi Grand Prix'), "le Grand Prix d'Abou Dabi");
  assert.equal(gpNameFr('Sao Paulo Grand Prix'), 'le Grand Prix de São Paulo');
  assert.equal(gpNameFr('Bahrain Grand Prix in Malaysia'), 'le Grand Prix de Bahreïn');
  assert.equal(gpNameFr('Atlantis Grand Prix'), "le Grand Prix d'Atlantis");
  assert.equal(gpNameFr(''), 'ce Grand Prix');
});

test('course d\'un favori : grille → arrivée, premier tour, relais, meilleur tour, coéquipier, pénalités, points', () => {
  const dl = { ...state.DriverList, 18: { Tla: 'STR', LastName: 'Stroll', TeamName: 'Aston Martin', TeamColour: '229971' }, 14: { Tla: 'ALO', LastName: 'Alonso', TeamName: 'Aston Martin' } };
  const app = { ...state.TimingAppData.Lines, 18: { GridPos: '8', Stints: [{ Compound: 'MEDIUM', New: 'true', StartLaps: 0, TotalLaps: 20 }, { Compound: 'HARD', New: 'true', StartLaps: 0, TotalLaps: 32 }] } };
  const s = { ...state, DriverList: dl, TimingAppData: { Lines: app }, TimingStats: { Lines: { ...state.TimingStats.Lines, 18: { PersonalBestLapTime: { Value: '1:21.500', Position: 3, Lap: 48 } } } } };
  const r = favRace(s, 18, [{ lap: 1, pos: 6 }, { lap: 2, pos: 5 }]);
  assert.deepEqual([r.tla, r.color, r.grid, r.pos, r.out, r.lap1], ['STR', '#229971', 8, 4, false, 6]);
  assert.deepEqual(r.stints, [{ comp: 'MEDIUM', laps: 20 }, { comp: 'HARD', laps: 32 }]);
  assert.equal(r.stops, 1);
  assert.deepEqual(r.best, { time: '1:21.500', lap: 48, rank: 3 });
  assert.deepEqual(r.mate, { n: '14', tla: 'ALO', name: 'Alonso', pos: 5, out: true });
  assert.deepEqual(r.penalties, [{ kind: 'sec', sec: 5, lap: null }], 'pénalité purgée : pas comptée deux fois');
  assert.equal(r.points, 12);
  // Abandon : aucun point ; sans historique, pas de premier tour ; course pas terminée : pas encore de points
  assert.equal(favRace(s, '14').points, 0);
  assert.equal(favRace(s, '14').lap1, null);
  assert.equal(favRace({ ...s, SessionStatus: { Status: 'Started' } }, '18').points, null);
  // Sprint : barème du sprint ; hors course ou pilote absent : rien
  assert.equal(favRace({ ...s, SessionInfo: { ...s.SessionInfo, Name: 'Sprint' } }, '1').points, 8);
  assert.equal(favRace(s, '99'), null);
  assert.equal(favRace({ ...s, SessionInfo: { Type: 'Qualifying', Name: 'Qualifying' } }, '18'), null);
});
