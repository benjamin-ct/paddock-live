import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionPhases, yellowPeriods, SPEEDS } from '../server/replay.js';

const ev = (off, topic, data) => ({ off, topic, data });

test('parties de la séance : Q1, Q2, Q3 du feu vert au drapeau à damier', () => {
  const events = [
    ev(0, 'TimingData', { SessionPart: 1 }), ev(100, 'SessionStatus', { Status: 'Started' }), ev(200, 'SessionStatus', { Status: 'Finished' }),
    ev(250, 'TimingData', { SessionPart: 2 }), ev(260, 'SessionStatus', { Status: 'Inactive' }), ev(300, 'SessionStatus', { Status: 'Started' }),
    ev(400, 'SessionStatus', { Status: 'Finished' }), ev(450, 'TimingData', { SessionPart: 3 }), ev(500, 'SessionStatus', { Status: 'Started' }),
  ];
  assert.deepEqual(sessionPhases(events, 900), [{ start: 100, part: 1, end: 200 }, { start: 300, part: 2, end: 400 }, { start: 500, part: 3, end: 900 }]);
});

test('course interrompue : départ puis reprise', () => {
  const events = [ev(10, 'SessionStatus', { Status: 'Started' }), ev(50, 'SessionStatus', { Status: 'Aborted' }), ev(80, 'SessionStatus', { Status: 'Started' }), ev(120, 'SessionStatus', { Status: 'Finished' })];
  assert.deepEqual(sessionPhases(events, 200).map((p) => [p.start, p.end]), [[10, 50], [80, 120]]);
});

test('drapeaux jaunes et vitesses de lecture', () => {
  const events = [ev(5, 'TrackStatus', { Status: '2' }), ev(9, 'TrackStatus', { Status: '1' }), ev(20, 'TrackStatus', { Status: '2' })];
  assert.deepEqual(yellowPeriods(events, 30), [{ start: 5, end: 9 }, { start: 20, end: 30 }]);
  for (const s of [1, 2, 5, 10, 20, 30]) assert.ok(SPEEDS.includes(s));
});

test('archives : heures au-delà de 24 h (« j.hh:mm:ss ») et course commencée aux essais libres de la veille', async () => {
  const { lineOffset, parseStream, sessionCut } = await import('../shared/race-stats.js');
  const { loadArchive } = await import('../server/replay.js');
  assert.equal(lineOffset('1.01:46:26.209{"a":1}').off, ((25 * 60 + 46) * 60 + 26) * 1000 + 209);
  assert.equal(lineOffset('00:10:18.756{}').off, (10 * 60 + 18) * 1000 + 756);
  assert.deepEqual(parseStream('00:00:01.000{"x":1}\n1.00:00:02.500{"x":2}\n', 'T').map((e) => e.off), [1000, 86402500]);
  assert.equal(sessionCut([{ off: 0 }, { off: 3600e3 }]), 0);
  // Course de Mexico 2026 : essais libres 3 (départ à 10 min), 24 h de silence, puis la course (départ 54 min après sa reprise)
  const files = {
    'SessionStatus.jsonStream': '00:10:18.756{"Status":"Started"}\n1.02:40:51.858{"Status":"Started"}\n1.05:01:20.853{"Status":"Finished"}\n',
    'DriverList.jsonStream': '00:00:00.000{"16":{"Tla":"LEC"}}\n',
    'TimingData.jsonStream': '00:20:00.000{"Lines":{"16":{"Position":"7"}}}\n1.01:46:26.209{"Lines":{"16":{"Position":"3"}}}\n',
    'LapCount.jsonStream': '1.02:40:52.000{"CurrentLap":1,"TotalLaps":71}\n',
  };
  const get = async (p) => { const f = files[p.split('/').pop()]; if (f === undefined) throw new (await import('../server/net.js')).HttpError(404, p); return f; };
  const a = await loadArchive('2026/x/', () => {}, ['SessionStatus', 'DriverList', 'TimingData', 'LapCount'], get);
  const cut = ((25 * 60 + 46) * 60 + 26) * 1000 + 209;
  assert.equal(a.startOff, ((26 * 60 + 40) * 60 + 51) * 1000 + 858 - cut);   // départ de la course, pas des essais
  assert.equal(a.duration, ((29 * 60 + 1) * 60 + 20) * 1000 + 853 - cut);
  assert.deepEqual(a.events.filter((e) => e.topic === 'TimingData').map((e) => e.data.Lines['16'].Position), ['3']);   // rien des essais
  assert.equal(a.events.find((e) => e.topic === 'DriverList').data['16'].Tla, 'LEC');   // liste des pilotes gardée
});
