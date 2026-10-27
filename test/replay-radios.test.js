import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArchive } from '../server/replay.js';
import { applyEvent, createDerived } from '../shared/derive.js';

test('replay : radios d\'équipe de l\'archive affichables (adresse de la séance complétée si l\'archive ne la donne pas)', async () => {
  const path = '2026/2026-10-25_United_States_Grand_Prix/2026-10-25_Race/';
  const files = {
    SessionInfo: '﻿00:00:01.000{"Meeting":{"Name":"United States Grand Prix"},"Name":"Race","Type":"Race"}\r\n',
    TeamRadio: '00:54:19.433{"Captures":[{"Utc":"2026-10-25T20:01:16.664Z","RacingNumber":"12","Path":"TeamRadio/ANT_12_20261025_150045.mp3"}]}\r\n'
      + '01:07:00.727{"Captures":{"1":{"Utc":"2026-10-25T20:13:56.306Z","RacingNumber":"87","Path":"TeamRadio/BEA_87_20261025_151329.mp3"}}}\r\n',
  };
  const get = async (rel) => files[rel.slice(path.length).replace('.jsonStream', '')]?.replace(/^﻿/, '') ?? '';
  const a = await loadArchive(path, () => {}, ['SessionInfo', 'TeamRadio'], get);
  const state = {}, d = createDerived();
  for (const e of a.events) applyEvent(state, d, e.topic, e.data, e.off);
  assert.equal(state.SessionInfo.Path, path);   // adresse des sons : static + Path + Path de la radio
  assert.deepEqual(state.TeamRadio.Captures.map((c) => c.RacingNumber), ['12', '87']);
});
