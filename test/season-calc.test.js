import test from 'node:test';
import assert from 'node:assert/strict';
import { qualiGap, qualiGaps, driverRatings, grade, lapsLed, similarCircuits, titleRace, placeForMaxPoints } from '../shared/season-calc.js';

const res = (code, teamId, pos, points, grid = pos, posText = String(pos)) => ({ code, name: code, last: code, team: teamId, teamId, pos, posText, points, grid });
const q = (code, teamId, pos, times) => ({ code, teamId, pos, q: times });

test('écart en qualification : dernière partie commune', () => {
  assert.deepEqual(qualiGap(q('A', 't', 1, [80, 79.5, 79]), q('B', 't', 4, [80.2, 79.6, 79.3])).part, 3);
  const g = qualiGap(q('A', 't', 1, [80, 79.5, 79]), q('B', 't', 12, [80.2, 79.9, null]));
  assert.equal(g.part, 2);
  assert.equal(g.s, -0.4);
  assert.equal(qualiGap(q('A', 't', 1, [null, null, null]), q('B', 't', 2, [80, null, null])), null);
});

test('écarts manche par manche : les écarts aberrants ne comptent pas', () => {
  const races = [
    { round: 1, name: 'GP 1', quali: [q('A', 't', 1, [80, 80, 80]), q('B', 't', 2, [80.1, 80.1, 80.1])] },
    { round: 2, name: 'GP 2', quali: [q('A', 't', 1, [80, 80, 80]), q('B', 't', 2, [80.3, 80.3, 80.3])] },
    { round: 3, name: 'GP 3', quali: [q('A', 't', 20, [90, null, null]), q('B', 't', 2, [80, 80, 80])] },
  ];
  const g = qualiGaps(races, 'A', 'B');
  assert.equal(g.rounds.length, 3);
  assert.equal(g.rounds[2].outlier, true);
  assert.equal(Math.round(g.median * 1000), -200);
});

test('tours en tête', () => {
  assert.equal(lapsLed({ laps: [[1, 90, 4, 1], [2, 89, 0, 1], [3, 89, 0, 2]] }), 2);
  assert.equal(lapsLed(null), 0);
});

test('notes : le pilote qui domine obtient la meilleure note', () => {
  const races = [1, 2, 3, 4].map((round) => ({
    round, name: `GP ${round}`, sprintResults: [],
    results: [res('A', 'x', 1, 25), res('B', 'x', 3, 15), res('C', 'y', 2, 18), res('D', 'y', 4, 12, 4, 'R')],
    quali: [q('A', 'x', 1, [80, 79, 78]), q('C', 'y', 2, [80, 79, 78.2]), q('B', 'x', 3, [80, 79, 78.5]), q('D', 'y', 4, [80, 79, 78.6])],
  }));
  const r = driverRatings({ races }, null);
  const by = Object.fromEntries(r.map((e) => [e.code, e]));
  assert.equal(r[0].code, 'A');
  assert.ok(by.A.season >= 85 && by.A.season > by.C.season && by.C.season > by.D.season);
  assert.equal(by.A.seasonGrade, 'S');
  assert.ok(by.A.mate > 85 && by.B.mate < 15);
  assert.equal(by.A.h2h.qa, 4);
  assert.equal(by.D.metrics.finishRate, 0);
  assert.equal(by.D.metrics.avgFinish, 4, 'abandon = dernière place (ici 4 partants), pas 20e : 22 voitures en 2026');
  assert.deepEqual(by.A.mates, ['B']);
});

test('barème des notes', () => {
  assert.equal(grade(90), 'S');
  assert.equal(grade(70), 'A');
  assert.equal(grade(50), 'C');
  assert.equal(grade(10), 'F');
  assert.equal(grade(null), null);
});

test('circuits proches', () => {
  const items = [
    { round: 1, key: 'a', length: 5, corners: 16, avgSpeed: 220, topSpeed: 330 },
    { round: 2, key: 'b', length: 5.1, corners: 15, avgSpeed: 225, topSpeed: 332 },
    { round: 3, key: 'c', length: 3.3, corners: 19, avgSpeed: 160, topSpeed: 290 },
    { round: 4, key: 'a', length: 5, corners: 16, avgSpeed: 221, topSpeed: 330 },
  ];
  const near = similarCircuits(items, 2);
  assert.equal(near.get('b')[0].key, 'a');
  assert.ok(!near.get('a').some((x) => x.key === 'a'));
});

test('course au titre : éliminés quand points + maximum restant < leader, manche de l\'élimination', () => {
  const res = (pts) => Object.entries(pts).map(([code, points]) => ({ code, teamId: code === 'BBB' ? 'red' : 'blue', points }));
  const data = {
    races: [
      { round: 1, name: 'GP A', sprint: false, results: res({ AAA: 25, BBB: 18, CCC: 0 }), sprintResults: [] },
      { round: 2, name: 'GP B', sprint: true, results: res({ AAA: 25, BBB: 18, CCC: 0 }), sprintResults: res({ AAA: 8, BBB: 7 }) },
      { round: 3, name: 'GP C', sprint: false, results: [], sprintResults: [] },
    ],
    drivers: [{ pos: 1, code: 'AAA', points: 58, team: 'Blue', teamId: 'blue' }, { pos: 2, code: 'BBB', points: 43, team: 'Red', teamId: 'red' }, { pos: 3, code: 'CCC', points: 0, team: 'Blue', teamId: 'blue' }],
    constructors: [{ pos: 1, id: 'blue', name: 'Blue', points: 58 }, { pos: 2, id: 'red', name: 'Red', points: 43 }],
  };
  const t = titleRace(data, 2026);
  assert.equal(t.races, 1);
  assert.equal(t.maxD, 25, 'une course de 25 points à disputer');
  const d = Object.fromEntries(t.drivers.map((e) => [e.code, e]));
  assert.equal(d.AAA.alive, true);
  assert.equal(d.BBB.alive, true, '43 + 25 >= 58');
  assert.equal(d.CCC.alive, false);
  assert.equal(d.CCC.outRound, 2, 'après la manche 2 : 0 + 25 < 58 (après la manche 1 : 0 + 58 >= 25)');
  assert.equal(d.BBB.behind, 15);
  assert.equal(t.champion, null);
  // Meilleur tour (1 point) compté de 2019 à 2024
  assert.equal(titleRace(data, 2022).maxD, 26);
});

test('course au titre : au plus tôt et conditions au prochain GP', () => {
  const pts = (o) => Object.entries(o).map(([code, points]) => ({ code, teamId: code, points }));
  const data = {
    races: [
      { round: 1, name: 'GP A', results: pts({ AAA: 25, BBB: 0 }), sprintResults: [] },
      { round: 2, name: 'GP B', results: pts({ AAA: 25, BBB: 0 }), sprintResults: [] },
      { round: 3, name: 'GP C', results: [], sprintResults: [] },
      { round: 4, name: 'GP D', results: [], sprintResults: [] },
    ],
    drivers: [{ pos: 1, code: 'AAA', name: 'A', points: 50, teamId: 'AAA' }, { pos: 2, code: 'BBB', name: 'B', points: 30, teamId: 'BBB' }, { pos: 3, code: 'CCC', name: 'C', points: 10, teamId: 'CCC' }],
    constructors: [],
  };
  const c = titleRace(data, 2026).clinchD;
  assert.equal(c.leader.code, 'AAA');
  // Après le GP C il reste 25 points : AAA doit avoir 26 d'avance, il en a 20 -> 6 de plus que BBB au GP C
  assert.equal(c.next.name, 'GP C');
  // CCC (40 pts de retard) : AAA peut lui céder jusqu'à 14 points au GP C
  assert.deepEqual(c.needs.map((n) => [n.code, n.margin]), [['BBB', 6], ['CCC', -14]]);
  assert.equal(c.possibleNext, true);
  assert.equal(c.earliest.name, 'GP C');
  assert.equal(placeForMaxPoints(25 - 6), 2, 'si AAA gagne, BBB doit finir 2e (18 pts) ou plus loin');
  assert.equal(placeForMaxPoints(0), 11);
});

test('course au titre : sprint au prochain GP, dernière manche, titre déjà joué', () => {
  const pts = (o) => Object.entries(o).map(([code, points]) => ({ code, teamId: code, points }));
  const race = (round, done) => ({ round, name: `GP ${round}`, results: done ? pts({ AAA: 25, BBB: 18 }) : [], sprintResults: [] });
  const drivers = (a, b) => [{ pos: 1, code: 'AAA', name: 'A', points: a, teamId: 'AAA' }, { pos: 2, code: 'BBB', name: 'B', points: b, teamId: 'BBB' }];
  const constructors = (a, b) => [{ pos: 1, id: 'AAA', name: 'A', points: a }, { pos: 2, id: 'BBB', name: 'B', points: b }];
  // Week-end sprint à venir : 25 + 8 = 33 points en jeu, puis une course (25)
  let data = { races: [race(1, true), { ...race(2), sprint: true }, race(3)], drivers: drivers(50, 30), constructors: constructors(50, 30) };
  let c = titleRace(data, 2026).clinchD;
  assert.deepEqual(c.next, { round: 2, name: 'GP 2', sprint: true, max: 33 });
  assert.equal(c.needs[0].margin, 25 - 20 + 1);
  assert.equal(c.earliest.round, 2);
  // Constructeurs : 43 + 15 au week-end sprint, puis 43 -> 24 de plus que BBB
  assert.equal(titleRace(data, 2026).clinchC.next.max, 58);
  assert.equal(titleRace(data, 2026).clinchC.needs[0].margin, 43 - 20 + 1);
  // Dernière manche : il suffit de finir devant au total (égalité non comptée)
  data = { races: [race(1, true), race(2)], drivers: drivers(30, 20), constructors: [] };
  c = titleRace(data, 2026).clinchD;
  assert.equal(c.earliest.round, 2);
  assert.equal(c.possibleNext, true);
  assert.equal(c.needs[0].margin, 0 - 10 + 1);
  // Titre déjà joué : plus d'encadré ; plus de manche à venir : rien non plus
  data = { races: [race(1, true), race(2)], drivers: drivers(60, 20), constructors: [] };
  assert.equal(titleRace(data, 2026).champion.code, 'AAA');
  assert.equal(titleRace(data, 2026).clinchD, null);
  data = { races: [race(1, true)], drivers: drivers(25, 18), constructors: [] };
  assert.equal(titleRace(data, 2026).clinchD, null);
});
