import test from 'node:test';
import assert from 'node:assert/strict';
import { openf1TestDays, indexTestDays, mergeTestDays, testState } from '../shared/testing.js';

// Calendrier d'OpenF1 pour 2027 (relevé le 6 novembre 2026) : heures provisoires, décalage horaire faux (+4 à Bahreïn)
const openf1 = [
  ...[1, 2, 3, 4].map((n) => ({ session_name: `Day ${n}`, session_type: 'Practice', date_start: `2027-02-2${3 + n}T04:00:00+00:00`, gmt_offset: '04:00:00', circuit_short_name: 'Sakhir', country_name: 'Bahrain', is_cancelled: false })),
  { session_name: 'Practice 1', session_type: 'Practice', date_start: '2027-03-12T08:00:00+00:00', gmt_offset: '04:00:00', circuit_short_name: 'Sakhir', country_name: 'Bahrain' },
];
// Index.json des archives de la F1 : heure locale du circuit et décalage
const index = { Meetings: [
  { Name: 'Pre-Season Testing', Location: 'Sakhir', Country: { Name: 'Bahrain' }, Circuit: { ShortName: 'Sakhir' }, Sessions: [
    { Name: 'Day 1', Type: 'Practice', StartDate: '2027-02-24T10:00:00', EndDate: '2027-02-24T19:00:00', GmtOffset: '03:00:00' },
    { Name: 'Day 2', Type: 'Practice', StartDate: '2027-02-25T10:00:00', EndDate: '2027-02-25T19:00:00', GmtOffset: '03:00:00', Path: '2027/x/' },
  ] },
  { Name: 'Bahrain Grand Prix', Sessions: [{ Name: 'Practice 1', Type: 'Practice', StartDate: '2027-03-12T14:30:00', GmtOffset: '03:00:00' }] },
] };

test('essais d\'hiver : journées d\'OpenF1 (jour sur place, sans les heures provisoires)', () => {
  const days = openf1TestDays(openf1);
  assert.deepEqual(days.map((d) => [d.day, d.n, d.start]), [['2027-02-24', 1, null], ['2027-02-25', 2, null], ['2027-02-26', 3, null], ['2027-02-27', 4, null]]);
  assert.equal(days[0].country, 'Bahrain');
  assert.deepEqual(openf1TestDays({ detail: 'erreur' }), [], 'réponse inattendue');
  assert.deepEqual(openf1TestDays([{ ...openf1[0], is_cancelled: true }]), [], 'journée annulée');
});

test('essais d\'hiver : heures officielles de l\'index des archives, prioritaires jour par jour', () => {
  const idx = indexTestDays(index);
  assert.equal(idx.length, 2, 'seulement les journées d\'essais');
  assert.equal(idx[0].start, Date.parse('2027-02-24T07:00:00Z'));
  assert.equal(idx[0].end, Date.parse('2027-02-24T16:00:00Z'));
  const all = mergeTestDays(openf1TestDays(openf1), idx);
  assert.deepEqual(all.map((d) => [d.day, d.start !== null]), [['2027-02-24', true], ['2027-02-25', true], ['2027-02-26', false], ['2027-02-27', false]]);
  assert.deepEqual(indexTestDays(null), []);
});

test('essais d\'hiver : journée en cours et prochaine journée', () => {
  const days = mergeTestDays(openf1TestDays(openf1), indexTestDays(index));
  const at = (iso) => testState(days, Date.parse(iso));
  assert.equal(at('2027-01-15T10:00:00Z').next.n, 1);
  assert.equal(at('2027-01-15T10:00:00Z').current, null);
  assert.equal(at('2027-02-24T06:55:00Z').current?.n, 1, '10 min avant le début');
  assert.equal(at('2027-02-24T17:00:00Z').current, null, 'journée terminée');
  assert.equal(at('2027-02-24T17:00:00Z').next.n, 2);
  // Heure pas encore connue : toute la journée (date de l'appareil)
  const noon = new Date(2027, 1, 26, 12).getTime();
  assert.equal(testState(days, noon).current?.n, 3);
  assert.equal(testState(days, noon).next.n, 4);
  const after = testState(days, new Date(2027, 1, 28, 12).getTime());
  assert.equal(after.current, null);
  assert.equal(after.next, null, 'essais terminés');
  assert.deepEqual(testState([]), { current: null, next: null });
});
