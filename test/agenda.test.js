import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENDA, upcomingAgenda, localDay } from '../shared/agenda.js';
import { buildDayIcs } from '../shared/ics.js';
import en from '../public/js/i18n-en.js';
import it from '../public/js/i18n-it.js';
import es from '../public/js/i18n-es.js';

const at = (s) => new Date(`${s}T12:00:00`).getTime();   // midi, heure de l'appareil

test('agenda : chaque date a sa source officielle, un jour valide et sa traduction', () => {
  for (const e of AGENDA) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    if (e.end) assert.ok(e.end > e.date, `${e.title} : fin après le début`);
    assert.match(e.link, /^https:\/\/(www\.)?(formula1\.com|fia\.com|[\w-]+\.(com|it|co\.uk))\//, `${e.title} : lien officiel`);
    for (const [lang, dict] of Object.entries({ en, it, es })) assert.ok(dict[e.title], `${e.title} : traduction ${lang}`);
  }
});

test('agenda : dates à venir ou en cours, dans l\'ordre', () => {
  const list = [{ date: '2027-02-24', end: '2027-02-27', title: 'B' }, { date: '2027-02-18', title: 'A' }];
  assert.deepEqual(upcomingAgenda(list, at('2027-01-10')).map((e) => e.title), ['A', 'B']);
  assert.deepEqual(upcomingAgenda(list, at('2027-02-18')).map((e) => e.title), ['A', 'B'], 'le jour même');
  assert.deepEqual(upcomingAgenda(list, at('2027-02-19')).map((e) => e.title), ['B']);
  assert.deepEqual(upcomingAgenda(list, at('2027-02-27')).map((e) => e.title), ['B'], 'dernier jour des essais');
  assert.deepEqual(upcomingAgenda(list, at('2027-02-28')), []);
  assert.equal(localDay(at('2027-03-05')), '2027-03-05');
});

test('agenda : fichier iCalendar en journées entières', () => {
  const ics = buildDayIcs([{ date: '2027-02-18', title: 'Lancement, Milan', link: 'https://www.formula1.com/x' }, { date: '2027-02-24', end: '2027-02-27', title: 'Essais' }, { date: 'bientôt', title: 'X' }], { name: 'F1', now: 0 });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2, 'date invalide ignorée');
  assert.match(ics, /DTSTART;VALUE=DATE:20270218\r\nDTEND;VALUE=DATE:20270219/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270224\r\nDTEND;VALUE=DATE:20270228/, 'fin exclusive : lendemain du dernier jour');
  assert.match(ics, /SUMMARY:Lancement\\, Milan/);
  assert.match(ics, /URL:https:\/\/www\.formula1\.com\/x/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lignes repliées à 75 octets');
});
