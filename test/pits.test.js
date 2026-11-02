import test from 'node:test';
import assert from 'node:assert/strict';
import { continuesStint, realStints, realStopCount, passIsRealStop, neutralLaps, measuredPitLoss } from '../shared/pits.js';
import { keyMoments } from '../shared/moments.js';
import { buildSummary } from '../shared/summary.js';

// Relais réels de Bakou 2026 : tout le monde passe par les stands sous voiture de sécurité au
// tour 36 (« ALL CARS THROUGH THE PIT LANE »), sans changer de pneus
const NOR = { Stints: [{ Compound: 'MEDIUM', New: 'true', StartLaps: 0, TotalLaps: 31 }, { Compound: 'SOFT', New: 'true', StartLaps: 0, TotalLaps: 5 }, { Compound: 'SOFT', New: 'false', StartLaps: 5, TotalLaps: 20, TyresNotChanged: '1' }] };
const SAI = { Stints: { 0: { Compound: 'MEDIUM', New: 'true', StartLaps: 0, TotalLaps: 20 }, 1: { Compound: 'SOFT', New: 'false', StartLaps: 4, TotalLaps: 14 }, 2: { Compound: 'SOFT', New: 'false', StartLaps: 4, TotalLaps: 10 }, 3: { Compound: 'SOFT', New: 'false', StartLaps: 10, TotalLaps: 25 } } };
const LAW = { Stints: [{ Compound: 'SOFT', New: 'true', StartLaps: 0, TotalLaps: 31 }, { Compound: 'MEDIUM', New: 'true', StartLaps: 0, TotalLaps: 5 }, { Compound: 'SOFT', New: 'true', StartLaps: 0, TotalLaps: 15 }] };

test('arrêts : un passage par les stands sans changer de pneus n\'est pas un arrêt', () => {
  assert.equal(realStopCount(NOR, { NumberOfPitStops: 2 }), 1, 'indication officielle TyresNotChanged');
  assert.equal(realStopCount(SAI, { NumberOfPitStops: 3 }), 2, 'usure qui reprend au même nombre de tours');
  assert.equal(realStopCount(LAW, { NumberOfPitStops: 2 }), 2, 'deux vrais arrêts (pneus neufs au tour 36)');
  assert.equal(realStopCount(null, { NumberOfPitStops: 2 }), 2, 'sans relais : compteur officiel');
  assert.deepEqual(realStints(NOR.Stints).map((s) => [s.Compound, s.StartLaps, s.TotalLaps]), [['MEDIUM', 0, 31], ['SOFT', 0, 20]]);
  assert.deepEqual([0, 1].map((i) => passIsRealStop(NOR.Stints, i)), [true, false]);
  assert.equal(passIsRealStop(NOR.Stints, 5), true, 'relais pas encore connu : compté');
  // Jeu déjà utilisé remonté pendant un vrai arrêt (usure différente) : c'est un arrêt
  assert.equal(continuesStint({ Compound: 'SOFT', TotalLaps: 14 }, { Compound: 'SOFT', New: 'false', StartLaps: 4 }), false);
});

test('arrêts : résumé de course sans les passages sous voiture de sécurité', () => {
  const s = buildSummary({
    SessionInfo: { Type: 'Race', Name: 'Race', Meeting: { Name: 'Azerbaijan Grand Prix' } }, SessionStatus: { Status: 'Finished' },
    DriverList: { 1: { Tla: 'NOR', LastName: 'Norris' }, 2: { Tla: 'AAA', LastName: 'A' } },
    TimingData: { Lines: { 1: { Position: '1' }, 2: { Position: '2' } } },
    TimingAppData: { Lines: { 1: NOR } }, RaceControlMessages: { Messages: [] },
  });
  assert.match(s.paragraphs.join('\n'), /Stratégie de Norris : 1 arrêt \(médiums → tendres\)/);
});

test('arrêts : tours neutralisés d\'après la direction de course', () => {
  const n = neutralLaps([{ Category: 'SafetyCar', Status: 'DEPLOYED', Lap: 31 }, { Category: 'SafetyCar', Status: 'IN THIS LAP', Lap: 34 }, { Flag: 'RED', Scope: 'Track', Lap: 40 }]);
  assert.deepEqual([...n].sort((a, b) => a - b), [31, 32, 33, 34, 35, 40, 41]);
  // Voiture de sécurité puis drapeau rouge : la période se referme au drapeau rouge
  const r = neutralLaps([{ Category: 'SafetyCar', Status: 'DEPLOYED', Lap: 10 }, { Flag: 'RED', Scope: 'Track', Lap: 12 }]);
  assert.deepEqual([...r].sort((a, b) => a - b), [10, 11, 12, 13]);
});

test('arrêts : temps perdu au stand mesuré sur les secteurs d\'entrée et de sortie', () => {
  // Tours normaux : S1 30 s, S3 25 s ; arrêt au tour 10 (entrée) : S3 +6 s, S1 du tour 11 +16 s
  const mk = (stopLap, extra = 0) => Array.from({ length: 20 }, (_, i) => {
    const lap = i + 1;
    return { lap, s1: lap === stopLap + 1 ? 46 + extra : 30, s3: lap === stopLap ? 31 : 25, pit: lap === stopLap || lap === stopLap + 1 };
  });
  const laps = { 1: mk(10), 2: mk(12), 3: mk(14, 3), 4: mk(16) };
  const stops = [{ num: '1', lap: 10, stop: 2.4 }, { num: '2', lap: 12, stop: 2.6 }, { num: '3', lap: 14, stop: 5.6 }, { num: '4', lap: 16, stop: 2.5 }];
  const m = measuredPitLoss(laps, stops);
  assert.equal(m.n, 4);
  assert.equal(m.value, 22, 'arrêt raté (5,6 s) ramené à l\'immobilisation habituelle');
  assert.equal(measuredPitLoss(laps, stops, new Set([10, 11, 12, 13, 14, 15])), null, 'arrêts sous neutralisation ignorés (moins de 2 restants)');
});

test('arrêts : moments clés sans les passages sous voiture de sécurité', () => {
  const ev = [
    { off: 0, topic: 'DriverList', data: { 1: { Tla: 'NOR' }, 2: { Tla: 'PIA' } } },
    { off: 1, topic: 'TimingData', data: { Lines: { 1: { Position: '1' }, 2: { Position: '2' } } } },
    { off: 2, topic: 'SessionStatus', data: { Status: 'Started' } },
    { off: 100000, topic: 'TimingData', data: { Lines: { 1: { InPit: true } } } },
    { off: 120000, topic: 'TimingData', data: { Lines: { 1: { InPit: false } } } },
    { off: 400000, topic: 'TimingData', data: { Lines: { 1: { InPit: true } } } },
    { off: 420000, topic: 'TimingData', data: { Lines: { 1: { InPit: false } } } },
    { off: 430000, topic: 'TimingAppData', data: { Lines: { 1: { Stints: { 0: NOR.Stints[0], 1: NOR.Stints[1], 2: NOR.Stints[2] } } } } },
  ];
  const pits = keyMoments(ev, { kind: 'race' }).filter((m) => m.kind === 'pit');
  assert.equal(pits.length, 1);
  assert.equal(pits[0].off, 100000);
});
