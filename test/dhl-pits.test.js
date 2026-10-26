import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dhlElements, dhlEvents, dhlEventFor, parseDhlTable, fetchDhl, withDhl, DHL_PAGE } from '../shared/dhl-pits.js';

const row = (pos, team, last, time, lap) => `<tr>
      <td class="align-center"><strong>${pos}</strong></td>
      <td>${team}</td>
      <td>${last}</td>
      <td>${time}</td>
      <td>${lap}</td>
      <td><strong>0</strong></td>
    </tr>`;
const TABLE = `<table class="f1-award-table">
  <tr><th class="align-center">Pos.</th><th>Team</th><th>Driver</th><th>Time (sec)</th><th>Lap</th><th>Points</th></tr>
  ${row(1, 'Mercedes', 'Russell', '2.17', 12)}${row(2, 'Audi', 'H&uuml;lkenberg', '2.58', 29)}${row(3, 'Red Bull', 'Verstappen', '2.40', 18)}${row(4, 'Red Bull', 'Verstappen', '2.24', 41)}
</table>`;
const PAGE = `<section class="f1-award-element" id="element_event" data-url="/api/f1-award-element-data/7373" data-type="pit_stop">
  <section class="f1-award-element" id="element_overview" data-url="/api/f1-award-element-data/7374">
  <section class="f1-award-element" id="element_average" data-url="/api/f1-award-element-data/7375">`;
const EVENTS = { data: { chart: { events: [
  { id: 1167, abbr: 'AUS', date: { date: '2026-03-08 00:00:00.000000' } },
  { id: 1181, abbr: 'ITA', date: { date: '2026-09-04 00:00:00.000000' } },
] } } };

test('DHL : page, Grands Prix et tableau des arrêts lus', () => {
  assert.deepEqual(dhlElements(PAGE), { event: '/api/f1-award-element-data/7373', average: '/api/f1-award-element-data/7375' });
  assert.equal(dhlElements('<html></html>'), null);
  const ev = dhlEvents(EVENTS);
  assert.equal(dhlEventFor(ev, '2026-03-08').id, 1167);
  assert.equal(dhlEventFor(ev, '2026-09-06T13:00:00Z').id, 1181);   // DHL date le vendredi
  assert.equal(dhlEventFor(ev, '2026-05-24'), null);
  assert.deepEqual(parseDhlTable(TABLE), [
    { team: 'Mercedes', last: 'Russell', time: 2.17, lap: 12 },
    { team: 'Audi', last: 'Hulkenberg', time: 2.58, lap: 29 },
    { team: 'Red Bull', last: 'Verstappen', time: 2.4, lap: 18 },
    { team: 'Red Bull', last: 'Verstappen', time: 2.24, lap: 41 },
  ]);
});

test('DHL : une lecture de la page, puis un Grand Prix à la fois ; pas encore publié -> absent', async () => {
  const asked = [];
  const get = async (url, json) => {
    asked.push(url);
    if (url === DHL_PAGE) return PAGE;
    if (url.endsWith('/7375')) return EVENTS;
    if (url.endsWith('/7373?event=1167')) return { htmlList: { table: TABLE } };
    return { htmlList: { table: '<table></table>' } };
  };
  const found = await fetchDhl([{ round: 1, date: '2026-03-08' }, { round: 16, date: '2026-09-06' }, { round: 9, date: '2026-05-24' }], get);
  assert.deepEqual([...found.keys()], [1]);
  assert.equal(found.get(1).length, 4);
  assert.equal(asked.length, 4);   // page, saison, Australie, Italie (pas encore publiée) ; manche 9 inconnue de DHL
});

test('DHL : immobilisations au centième sur les arrêts F1, arrêt manquant ajouté', () => {
  const race = {
    round: 1,
    drivers: [
      { tla: 'RUS', last: 'Russell', stops: [{ lap: 12, stop: 2.2, lane: 21.3 }], stopCount: 1 },
      { tla: 'HUL', last: 'Hülkenberg', stops: [{ lap: 28, stop: 2.6, lane: 22 }], stopCount: 1 },
      { tla: 'VER', last: 'Verstappen', stops: [{ lap: 18, stop: 2.4, lane: 21 }], stopCount: 2 },
      { tla: 'ALO', last: 'Alonso', stops: [{ lap: 11, stop: 10.2, lane: 30 }], stopCount: 1 },
    ],
    profile: { stops: 4, stopMedian: 2.5, pitLane: 21.6 },
  };
  const out = withDhl(race, parseDhlTable(TABLE));
  const by = (t) => out.drivers.find((d) => d.tla === t).stops;
  assert.deepEqual(by('RUS'), [{ lap: 12, stop: 2.17, lane: 21.3, dhl: true }]);
  assert.deepEqual(by('HUL'), [{ lap: 28, stop: 2.58, lane: 22, dhl: true }]);   // un tour d'écart, accents
  assert.deepEqual(by('VER').map((s) => [s.lap, s.stop, s.lane]), [[18, 2.4, 21], [41, 2.24, null]]);
  assert.deepEqual(by('ALO'), [{ lap: 11, stop: 10.2, lane: 30 }]);   // absent chez DHL : dixième de la F1
  assert.equal(out.dhl, true);
  assert.deepEqual([out.profile.stops, out.profile.pitLane], [5, 21.6]);
  assert.equal(out.drivers.find((d) => d.tla === 'VER').stopCount, 2);
  assert.equal(race.drivers[0].stops[0].stop, 2.2);   // course d'origine intacte
  assert.equal(withDhl(race, null), race);
});
