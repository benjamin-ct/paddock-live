import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../server/f1tv.js';

test('F1 TV : lecture des résultats de recherche', () => {
  const page = { resultObj: { containers: [
    { metadata: { contentId: 1, title: 'Rencontre', emfAttributes: {} } },
    { retrieveItems: { resultObj: { containers: [
      { metadata: { contentId: 1000010385, title: '2026 Azerbaijan Grand Prix', contentSubtype: 'REPLAY', emfAttributes: { MeetingSessionKey: '11377' } } },
      { metadata: { contentId: 42, title: 'Sans attributs' } },
    ] } } },
  ] } };
  assert.deepEqual(_test.containersOf(page).map((c) => c.metadata.contentId), [1, 1000010385]);
});

test('F1 TV : le relais n\'accepte que les hôtes vidéo connus', () => {
  assert.equal(_test.hostAllowed('f1tv.formula1.com'), true);
  assert.equal(_test.hostAllowed('f1prodlive.akamaized.net'), true);
  assert.equal(_test.hostAllowed('example.com'), false);
  assert.equal(_test.hostAllowed('formula1.com.evil.net'), false);
});

test('radio : lecture des listes de lecture .pls / .m3u', async () => {
  const http = await import('node:http');
  const { resolvePlaylist } = await import('../server/f1tv.js');
  const srv = http.createServer((req, res) => {
    res.end(req.url.endsWith('.pls')
      ? '[playlist]\nNumberOfEntries=1\nFile1=https://radio.example/live.mp3\nTitle1=Radio\n'
      : '#EXTM3U\n#EXTINF:-1,Radio\nhttp://radio.example:8000/stream.aac\n');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    await assert.rejects(resolvePlaylist(`${base}/a.pls`), /locale refusée/);
    assert.equal(await resolvePlaylist(`${base}/a.pls`, { allowLocal: true }), 'https://radio.example/live.mp3');
    assert.equal(await resolvePlaylist(`${base}/b.m3u`, { allowLocal: true }), 'http://radio.example:8000/stream.aac');
  } finally {
    srv.close();
  }
});

test('F1 TV : canaux de commentaires et caméras embarquées', () => {
  const md = { additionalStreams: [
    { type: 'additional', title: 'INTERNATIONAL', channelId: 1, playbackUrl: 'CONTENT/PLAY?contentId=1000' },
    { type: 'additional', title: 'F1 LIVE', channelId: 2, playbackUrl: 'CONTENT/PLAY?contentId=1000&channelId=2' },
    { type: 'additional', title: 'TRACKER', channelId: 3 },
    { type: 'obc', title: 'VER', channelId: 10, racingNumber: 1, driverFirstName: 'Max', driverLastName: 'Verstappen' },
    { type: 'obc', title: 'HAD', channelId: 11, racingNumber: 6 },
    { type: 'obc', title: 'SANS NUMÉRO', channelId: 12 },
  ] };
  assert.deepEqual(_test.channelsOf(md).map((c) => [c.title, c.main]), [['INTERNATIONAL', true], ['F1 LIVE', false]]);
  assert.deepEqual(_test.onboardsOf(md), [
    { channelId: 10, num: '1', tla: 'VER', name: 'Max Verstappen' },
    { channelId: 11, num: '6', tla: 'HAD', name: null },
  ]);
  assert.deepEqual(_test.onboardsOf({}), []);
});

test('relais : jamais vers cet ordinateur ni le réseau local (même autorisé comme station de radio)', async () => {
  const { privateAddress, localTarget, proxy, allowHost } = await import('../server/f1tv.js');
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.20', '172.20.0.1', '169.254.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(privateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '151.101.1.1', '2606:4700::1']) assert.ok(!privateAddress(ip), ip);
  assert.ok(localTarget('localhost') && localTarget('[::1]') && !localTarget('f1tv.formula1.com'));
  allowHost('127.0.0.1:3000');
  let status = 0;
  await proxy({ method: 'POST', headers: {} }, { writeHead: (s) => { status = s; }, end() {} }, 'http://127.0.0.1:3000/api/social/publish', null);
  assert.equal(status, 403);
});
