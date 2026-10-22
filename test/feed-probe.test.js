import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-probe-'));
const { isProbe, probeAnswer, probeFeed, probeState, PROBE_TOPICS } = await import('../server/feed-probe.js');
const { LIVE_TOPICS } = await import('../shared/f1.js');

test('flux cachés testés en direct : réponses notées et gardées sur le disque', () => {
  // Aucun flux de l'appli dans la liste testée (ils n'entreraient plus dans l'appli)
  assert.deepEqual(PROBE_TOPICS.filter((x) => LIVE_TOPICS.includes(x)), []);
  assert.ok(isProbe('EnergyData') && !isProbe('TimingData'));
  assert.equal(probeState().at, null);
  probeAnswer({ DriverRaceInfo: { 1: { OvertakeState: 1 } } }, null, 'Singapore Grand Prix — Race');
  probeFeed('EnergyData', { Cars: { 1: { Soc: 62 } } });
  probeFeed('EnergyData', { Cars: { 1: { Soc: 60 } } });
  const s = probeState();
  assert.equal(s.session, 'Singapore Grand Prix — Race');
  assert.equal(s.found.DriverRaceInfo.n, 1);
  assert.equal(s.found.EnergyData.n, 2);
  assert.equal(s.found.EnergyData.sample, '{"Cars":{"1":{"Soc":60}}}');
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.PADDOCK_DATA_DIR, 'feed-probe.json'), 'utf8'));
  assert.ok(saved.found.EnergyData && saved.found.DriverRaceInfo);
});
