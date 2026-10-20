import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { feedDiag } from '../server/feed-diag.js';

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
