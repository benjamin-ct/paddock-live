import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { feedDiag, overtakeChrono } from '../server/feed-diag.js';

const z = (o) => JSON.stringify(zlib.deflateRawSync(Buffer.from(JSON.stringify(o))).toString('base64'));
const car = (n, ch) => ({ Entries: [{ Utc: '2026-10-11T12:00:00Z', Cars: { [n]: { Channels: ch } } }] });

test('diagnostic des données F1 : toute la séance, champs et canaux', async () => {
  const P = '2026/x/y/';
  const files = {
    [`${P}Index.json`]: { Feeds: { 'CarData.z': { KeyFramePath: 'CarData.z.json', StreamPath: 'CarData.z.jsonStream' }, DriverRaceInfo: { StreamPath: 'DriverRaceInfo.jsonStream' }, Absent: { StreamPath: 'Absent.jsonStream' } } },
    [`${P}CarData.z.json`]: JSON.parse(z(car('1', { 0: 9000, 3: 7 }))),
  };
  const streams = {
    [`${P}CarData.z.jsonStream`]: [`00:00:01.000${z(car('1', { 0: 10000, 3: 8, 47: 12 }))}`, `00:00:02.000${z(car('44', { 0: 11000, 3: 57 }))}`, 'ligne illisible'].join('\r\n'),
    [`${P}DriverRaceInfo.jsonStream`]: '00:00:01.000{"1":{"Position":"1","OvertakeState":2,"_kf":true}}\n00:00:02.000{"44":{"OvertakeState":1}}',
  };
  const get = async (p) => { if (!(p in streams)) throw new Error('404'); return streams[p]; };
  const getJSON = async (p) => { if (!(p in files)) throw new Error('404'); return files[p]; };
  const r = await feedDiag(P, { get, getJSON });

  assert.deepEqual(r.feeds.map((f) => f.name), ['Absent', 'CarData.z', 'DriverRaceInfo']);
  assert.equal(r.feeds[0].error, '404');
  const carData = Object.fromEntries(r.feeds[1].fields.map((f) => [f.path, f]));
  assert.equal(r.feeds[1].lines, 2);
  // Canaux gardés par numéro (pilotes regroupés), image de départ comprise, valeurs les plus hautes
  const gear = carData['CarData.z.Entries.*.Cars.*.Channels.3'];
  assert.equal(gear.n, 3);
  assert.equal(gear.max, 57);
  assert.deepEqual(gear.highest[0], [57, 1]);
  assert.ok(carData['CarData.z.Entries.*.Cars.*.Channels.47']);
  // Champ d'un flux que le replay ne lit pas ; marqueurs internes ignorés
  const dri = r.feeds[2].fields.map((f) => f.path);
  assert.deepEqual(dri, ['DriverRaceInfo.*.OvertakeState', 'DriverRaceInfo.*.Position']);
  assert.deepEqual(r.feeds[2].fields[0].top, [['2', 1], ['1', 1]]);
});

test('diagnostic : chronologie du mode dépassement (OvertakeState, indicateurs 4096 / 8192)', () => {
  const { summary, events, overtakes } = overtakeChrono([
    { off: 3000, feed: 'DriverRaceInfo', data: { 16: { Interval: '+0.640', OvertakeState: 1 } } },
    { off: -1, feed: 'DriverList', data: { 16: { Tla: 'LEC' } } },
    { off: 1000, feed: 'TimingData', data: { Lines: { 16: { NumberOfLaps: 12, Position: '4', Status: 64 } } } },
    { off: 2000, feed: 'DriverRaceInfo', data: { 16: { Interval: '+1.900', OvertakeState: 0 } } },
    { off: 4000, feed: 'TimingData', data: { Lines: { 16: { Status: 4160, IntervalToPositionAhead: { Value: '+0.700' } } } } },
    { off: 5000, feed: 'DriverRaceInfo', data: { 16: { Interval: '+1 LAP', OvertakeState: 2 } } },
    { off: 6000, feed: 'OvertakeSeries', data: { Overtakes: { 16: { 0: { Timestamp: '2026-10-11T12:41:47.731Z', count: 1 } } } } },
  ]);
  // Premier état connu : pas un changement ; écart « +1 LAP » : inconnu
  assert.deepEqual(events.map((e) => [e.off, e.tla, e.lap, e.pos, e.what, e.from, e.to, e.gap]), [
    [3000, 'LEC', 12, 4, 'OvertakeState', 0, 1, 0.64],
    [4000, 'LEC', 12, 4, 'Status', 0, 4096, 0.7],
    [5000, 'LEC', 12, 4, 'OvertakeState', 1, 2, null],
    [6000, 'LEC', 12, 4, 'Overtake', null, 1, null],
  ]);
  assert.deepEqual(overtakes, [{ tla: 'LEC', n: 1, sum: 1 }]);
  assert.deepEqual(summary.find((x) => x.change === 'OvertakeState → 1'), { change: 'OvertakeState → 1', n: 1, median: 0.64, under1: 1, known: 1 });
});
