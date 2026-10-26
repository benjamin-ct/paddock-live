import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRace, trackLength, outline } from '../server/race-stats.js';

// Deux pilotes, 4 tours ; safety car pendant le 3e tour ; arrêt de A au 2e tour.
const lap = (off, num, n, time, pos, extra = {}) => ({ off, topic: 'TimingData', data: { Lines: { [num]: { NumberOfLaps: n, LastLapTime: { Value: time }, Position: String(pos), ...extra } } } });
const events = [
  { off: 0, topic: 'TrackStatus', data: { Status: '1' } },
  { off: 0, topic: 'TimingData', data: { Lines: { 1: { Position: '1' }, 2: { Position: '2' } } } },
  lap(90000, '1', 1, '1:30.000', 1), lap(91000, '2', 1, '1:31.000', 2),
  lap(180000, '1', 2, '1:40.000', 2), lap(181000, '2', 2, '1:29.500', 1),
  { off: 200000, topic: 'TrackStatus', data: { Status: '4' } },
  { off: 290000, topic: 'TrackStatus', data: { Status: '1' } },
  lap(300000, '1', 3, '2:00.000', 2), lap(301000, '2', 3, '2:00.500', 1),
  lap(400000, '1', 4, '1:29.000', 1), lap(401000, '2', 4, '1:29.900', 2),
];
const keyframes = {
  DriverList: { 1: { Tla: 'AAA', FullName: 'Pilote A', TeamName: 'Ferrari', TeamColour: 'ED1131' }, 2: { Tla: 'BBB', FullName: 'Pilote B', TeamName: 'McLaren', TeamColour: 'F47600' } },
  TimingStats: { Lines: { 1: { PersonalBestLapTime: { Value: '1:29.000' }, BestSpeeds: { ST: { Value: '331' }, FL: { Value: '300' } } }, 2: { BestSpeeds: { ST: { Value: '328' } } } } },
  PitStopSeries: { PitTimes: { 1: [{ PitStop: { RacingNumber: '1', PitStopTime: '2.4', PitLaneTime: '21.5', Lap: '2' } }] } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM', TotalLaps: 2, New: 'true' }, { Compound: 'HARD', TotalLaps: 2, New: 'true' }] } } },
  LapCount: { TotalLaps: 4 },
};

test('summarizeRace : tours, drapeaux, vitesses, arrêts', () => {
  const res = summarizeRace({ events, keyframes });
  const a = res.drivers.find((d) => d.tla === 'AAA');
  const b = res.drivers.find((d) => d.tla === 'BBB');
  assert.deepEqual(a.laps.map((l) => l[0]), [1, 2, 3, 4]);
  assert.equal(a.laps[0][2] & 4, 4, '1er tour marqué');
  assert.equal(a.laps[1][2] & 1, 1, 'tour de l\'arrêt marqué');
  assert.equal(a.laps[2][2] & 2, 2, 'tour sous safety car marqué');
  assert.equal(a.laps[3][2], 0, 'tour propre');
  assert.equal(b.laps[1][2], 0);
  assert.equal(a.laps[1][1], 100);
  assert.deepEqual(a.speeds, { ST: 331, FL: 300, I1: null, I2: null });
  assert.deepEqual(a.stops, [{ lap: 2, stop: 2.4, lane: 21.5 }]);
  assert.equal(a.grid, 2);
  assert.equal(a.best, 89);
  assert.equal(a.stints.length, 2);
  assert.equal(res.profile.laps, 4);
  assert.equal(res.profile.topSpeed.tla, 'AAA');
  assert.equal(res.profile.stops, 1);
  assert.equal(res.profile.neutralLaps, 1);
  assert.equal(res.profile.fastest.tla, 'AAA');
});

test('longueur et tracé simplifié', () => {
  // Carré de 1 km de côté (coordonnées en dixièmes de mètre)
  const pts = [[0, 0], [10000, 0], [10000, 10000], [0, 10000]].map(([x, y]) => ({ x, y }));
  const track = { pts, rotation: 0 };
  assert.equal(trackLength(track), 4);
  const o = outline(track).split(' ');
  assert.equal(o.length, 4);
  assert.ok(o.every((p) => p.split(',').every((v) => Number(v) >= 0 && Number(v) <= 100)));
});

// Serveur de la version web : course analysée par la tâche planifiée avec la connexion F1 TV gardée, puis servie
test('version web : statistiques calculées par le serveur, une course à la fois, gardées', async () => {
  const { keepArchiveToken } = await import('../analytics/studio.js');
  const { statsTick, seasonStatsWeb } = await import('../analytics/race-stats.js');
  const rows = new Map();
  const DB = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    all: async () => ({ results: [...rows].filter(([k]) => k.startsWith(a[0].replace('%', ''))).map(([k, v]) => ({ k, v })) }),
    run: async () => { if (sql.startsWith('INSERT INTO studio')) rows.set(a[0], a[1]); else throw new Error(sql); },
  }) }) };
  const env = { DB, STATS_KEY: 'cle-de-test' };
  const now = Date.parse('2026-06-01T12:00:00Z');
  const race = (round, date) => ({ round, name: `GP ${round}`, date, results: [{ pos: 1 }], quali: [], sessions: [] });
  rows.set('season:2026', JSON.stringify({ at: now, v: { year: 2026, races: [race(5, '2026-05-10'), race(6, '2026-05-24'), { round: 7, date: '2026-06-07', results: [] }] } }));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'none' })}.${b64({ exp: now / 1000 + 4 * 86400, SessionId: 's1' })}.x`;
  const fmt = (off) => new Date(off).toISOString().slice(11, 23);
  const stream = (topic) => events.filter((e) => e.topic === topic).map((e) => `${fmt(e.off)}${JSON.stringify(e.data)}`).join('\r\n');
  const asked = [];
  const fetchFn = async (u, o) => {
    asked.push(u);
    if (u.includes('multiviewer')) return new Response('', { status: 404 });
    assert.equal(o.headers.Authorization, `Bearer ${jwt}`);
    const p = u.replace('https://livetiming.formula1.com/static/', '');
    if (p === '2026/Index.json') return Response.json({ Meetings: [{ Name: 'GP 5', Sessions: [{ Name: 'Race', Type: 'Race', StartDate: '2026-05-10T13:00:00', Path: '2026/gp5/race/' }] }] });
    const m = /^2026\/gp5\/race\/(\w+)\.(json|jsonStream)$/.exec(p);
    if (m?.[2] === 'jsonStream') return new Response(`﻿${stream(m[1])}`);
    if (m && keyframes[m[1]]) return Response.json(keyframes[m[1]]);
    return new Response('', { status: 404 });
  };

  // Sans connexion F1 TV gardée : rien d'analysé, la page le dit
  assert.equal((await seasonStatsWeb(env, 2026, { now, fetchFn })).error, 'statistiques pas encore calculées par le serveur');
  assert.match((await statsTick(env, { now, fetchFn })).error, /F1 TV/);
  assert.equal(asked.length, 0);

  await keepArchiveToken(env, jwt);
  assert.ok(!rows.get('racestats:f1tv').includes(jwt));   // chiffré
  const first = await seasonStatsWeb(env, 2026, { now, fetchFn });
  assert.deepEqual([first.total, first.done, first.pending], [2, 0, true]);
  // Un passage : manche 5 analysée, puis manche 6 (absente des archives) essayée dans la foulée
  assert.deepEqual(await statsTick(env, { now, fetchFn }), { year: 2026, round: 6, error: 'course absente de l\'index des archives', done: 1 });
  assert.equal(await statsTick(env, { now: now + 120e3, fetchFn }), null);   // manche 6 réessayée dans 6 heures seulement
  const out = await seasonStatsWeb(env, 2026, { now: now + 180e3, fetchFn });
  assert.deepEqual([out.done, out.pending], [1, false]);
  assert.deepEqual(out.races[0].drivers.find((d) => d.tla === 'AAA').laps.map((l) => l[0]), [1, 2, 3, 4]);
  assert.equal(out.races[0].round, 5);

  // F1 TV retirée du coffre : copie effacée
  await keepArchiveToken(env, null);
  assert.equal(rows.get('racestats:f1tv'), '');
});
