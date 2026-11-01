import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStartUtc, futureSession } from '../shared/f1.js';

test('séance à venir (répétition de la F1 la veille) : reconnue d\'après SessionInfo', () => {
  const race = { StartDate: '2026-11-01T14:00:00', GmtOffset: '-06:00:00' };   // Mexico : 14 h locales = 20 h UTC
  assert.equal(sessionStartUtc(race), Date.parse('2026-11-01T20:00:00Z'));
  assert.equal(sessionStartUtc({ StartDate: '2026-04-05T15:00:00', GmtOffset: '09:00:00' }), Date.parse('2026-04-05T06:00:00Z'));
  assert.ok(Number.isNaN(sessionStartUtc({})));
  // La veille à 15 h UTC (répétition) : séance à venir ; pendant la course ou juste avant : non
  assert.equal(futureSession(race, Date.parse('2026-10-31T15:00:00Z')), true);
  assert.equal(futureSession(race, Date.parse('2026-11-01T19:00:00Z')), false);
  assert.equal(futureSession(race, Date.parse('2026-11-01T21:00:00Z')), false);
  assert.equal(futureSession({}, Date.now()), false);                           // inconnue : enregistrée comme avant
});

test('index des archives : séance pas encore commencée (répétition de la F1) laissée de côté', async () => {
  const { indexMeetings } = await import('../shared/race-stats.js');
  const raw = { Meetings: [{ Key: 1, Name: 'Mexico City Grand Prix', Sessions: [
    { Key: 11400, Name: 'Qualifying', Type: 'Qualifying', StartDate: '2026-10-31T15:00:00', GmtOffset: '-06:00:00', Path: '2026/x/q/' },
    { Key: 11404, Name: 'Race', Type: 'Race', StartDate: '2026-11-01T14:00:00', GmtOffset: '-06:00:00', Path: '2026/x/r/' },
  ] }] };
  assert.deepEqual(indexMeetings(raw, Date.parse('2026-11-01T11:00:00Z'))[0].sessions.map((s) => s.name), ['Qualifying']);
  assert.deepEqual(indexMeetings(raw, Date.parse('2026-11-01T22:00:00Z'))[0].sessions.map((s) => s.name), ['Qualifying', 'Race']);
});
