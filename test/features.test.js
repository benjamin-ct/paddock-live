import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Track } from '../shared/track.js';
import { calibrateLoops } from '../shared/calibrate.js';
import { applyEvent, createDerived } from '../shared/derive.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-'));
process.env.PADDOCK_DATA_DIR = tmp;
const { Recorder, readRecording, listRecordings } = await import('../server/recorder.js');
const { Hub } = await import('../server/hub.js');

// Circuit carré de 4 km parcouru en 100 s à vitesse constante.
function squareTrack() {
  const x = [], y = [], t = [];
  const side = 1000, n = 100;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * 4 * side;
    const s = Math.floor(d / side), u = d % side;
    const pt = [[u, 0], [side, u], [side - u, side], [0, side - u]][s];
    x.push(pt[0] * 10); y.push(pt[1] * 10); t.push(i);
  }
  return new Track({ x, y, trackPositionTime: t, rotation: 0, candidateLap: { lapTime: 100 } });
}

test('calibration : retrouve l\'emplacement des boucles de chrono à partir du GPS', () => {
  const track = squareTrack();
  const base = Date.parse('2026-09-26T12:00:00Z');
  const events = [];
  const positions = [];
  // Heartbeat : archive décalée de 5 s par rapport à l'heure F1
  for (let s = 0; s <= 400; s += 15) events.push({ off: s * 1000 + 5000, topic: 'Heartbeat', data: { Utc: new Date(base + s * 1000).toISOString() } });
  // 3 voitures, GPS toutes les 0,5 s, tour de 100 s
  for (let ms = 0; ms <= 400000; ms += 500) {
    const entries = {};
    for (const [num, lag] of [['1', 0], ['2', 7000], ['3', 15000]]) {
      const r = (((ms - lag) / 1000) % 100 + 100) % 100;
      const p = track.pointAt(r);
      entries[num] = { X: p.x, Y: p.y, Status: 'OnTrack' };
    }
    positions.push({ off: ms + 5000, data: { Position: [{ Timestamp: new Date(base + ms).toISOString(), Entries: entries }] } });
  }
  // Boucle du segment 0-3 à 25 % du tour, fin de secteur 1 à 40 %
  for (const [num, lag] of [['1', 0], ['2', 7000], ['3', 15000]]) {
    for (let lap = 0; lap < 3; lap++) {
      const t0 = lap * 100000 + lag;
      events.push({ off: t0 + 25000 + 5000, topic: 'TimingData', data: { Lines: { [num]: { Sectors: { 0: { Segments: { 3: { Status: 2049 } } } } } } } });
      events.push({ off: t0 + 40000 + 5000, topic: 'TimingData', data: { Lines: { [num]: { Sectors: { 0: { Value: '40.000' } } } } } });
    }
  }
  events.sort((a, b) => a.off - b.off);
  const res = calibrateLoops(track, events, positions);
  assert.ok(res, 'calibration obtenue');
  assert.ok(Math.abs(res.segs['0-3'] - 0.25) < 0.01, `boucle 0-3 à ${res.segs['0-3']}`);
  assert.ok(Math.abs(res.segs.S0 - 0.40) < 0.01, `fin S1 à ${res.segs.S0}`);
});

test('enregistrement : écriture puis relecture dans l\'ordre, liste des sessions', async () => {
  const rec = new Recorder();
  const file = rec.open({ Key: 42, Name: 'Race', StartDate: '2026-09-26T15:00:00', Meeting: { Name: 'Test GP' } });
  rec.write(1000, '__snapshot', { LapCount: { CurrentLap: 1 } });
  rec.write(2000, 'Position', 'abc', true);
  rec.write(3000, 'LapCount', { CurrentLap: 2 });
  await new Promise((r) => rec.stream.end(r));
  fs.appendFileSync(file, '{"tronqué'); // arrêt brutal : dernière ligne incomplète
  const { events, stream } = await readRecording(file);
  assert.deepEqual(events.map((e) => e.t), [1000, 3000]);
  assert.equal(stream[0].raw, 'abc');
  assert.equal(listRecordings().length, 1);
});

test('replay accéléré : retime recalcule les horodatages et force la reconstruction', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  hub.reset({ mode: 'test' });
  hub.load([{ off: 0, t: 0, topic: 'LapCount', data: { CurrentLap: 1 } }, { off: 10000, t: 10000, topic: 'LapCount', data: { CurrentLap: 2 } }], []);
  const gen = hub.gen;
  hub.retime(1000, 4);
  assert.deepEqual(hub.events.map((e) => e.t), [1000, 3500]);
  assert.equal(hub.sync.at(-1).t, 3500, 'les repères de synchro suivent');
  assert.ok(hub.gen > gen);
  hub.close();
});

test('horloge : point de référence Heartbeat pour le replay accéléré', () => {
  const d = createDerived();
  const utc = Date.parse('2026-09-26T12:00:00Z');
  applyEvent({}, d, 'Heartbeat', { Utc: new Date(utc).toISOString() }, 5000);
  assert.deepEqual(d.clockRef, { t: 5000, utc });
});

test('temps d\'immobilisation du topic PitStop', () => {
  const state = {}, derived = createDerived();
  applyEvent(state, derived, 'PitStop', { RacingNumber: '12', PitStopTime: '3.0', PitLaneTime: '31.843', Lap: '14' }, 1000);
  applyEvent(state, derived, 'PitStop', { RacingNumber: '3', PitStopTime: '2.4', PitLaneTime: '31.067' }, 2000);
  assert.deepEqual(derived.pitStops.map((p) => [p.num, p.lap, p.time]), [['12', 14, 3], ['3', null, 2.4]]);
});

test('enregistrements : les plus anciens effacés à chaque nouvelle séance (jamais celle en cours)', async () => {
  const { REC_DIR, pruneRecordings, KEEP_RECORDINGS } = await import('../server/recorder.js');
  for (const f of fs.readdirSync(REC_DIR)) fs.unlinkSync(path.join(REC_DIR, f));
  const old = Date.now() / 1000 - 86400;
  for (let i = 0; i < KEEP_RECORDINGS + 3; i++) {
    const f = path.join(REC_DIR, `2026-01-${String(i + 1).padStart(2, '0')}_GP_Race_${i}.jsonl`);
    fs.writeFileSync(f, '[]\n');
    fs.utimesSync(f, old + i, old + i);
  }
  const rec = new Recorder();
  const file = rec.open({ StartDate: '2026-10-25T19:00:00', Meeting: { Name: 'United States Grand Prix' }, Name: 'Race', Key: 99 });
  assert.equal(listRecordings().length, KEEP_RECORDINGS);
  assert.ok(fs.existsSync(file));
  assert.ok(!fs.existsSync(path.join(REC_DIR, '2026-01-01_GP_Race_0.jsonl')), 'le plus ancien est effacé');
  pruneRecordings(0, file);   // « Tout supprimer » : la séance en cours reste
  assert.deepEqual(fs.readdirSync(REC_DIR), [path.basename(file)]);
  rec.close();
});
