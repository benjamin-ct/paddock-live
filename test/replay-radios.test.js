import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArchive } from '../server/replay.js';
import { HttpError } from '../server/net.js';

test('replay : radios d\'équipe non publiées par la F1 (premières séances de 2026) signalées', async () => {
  const path = '2026/2026-03-08_Australian_Grand_Prix/2026-03-08_Race/';
  const info = '00:00:01.000{"Name":"Race","Type":"Race","Path":"2026/2026-03-08_Australian_Grand_Prix/2026-03-08_Race/"}\r\n';
  const radio = '00:54:19.433{"Captures":[{"Utc":"2026-03-08T05:01:16.664Z","RacingNumber":"12","Path":"TeamRadio/ANT_12_20260308_160045.mp3"}]}\r\n';
  const archive = (files) => async (rel) => {
    const t = rel.slice(path.length).replace('.jsonStream', '');
    if (!(t in files)) throw new HttpError(401, rel);   // refusé par la F1, même avec la connexion F1 TV
    return files[t];
  };
  const topics = ['SessionInfo', 'TeamRadio'];
  assert.equal((await loadArchive(path, () => {}, topics, archive({ SessionInfo: info }))).noRadio, true);
  assert.equal((await loadArchive(path, () => {}, topics, archive({ SessionInfo: info, TeamRadio: radio }))).noRadio, false);
});
