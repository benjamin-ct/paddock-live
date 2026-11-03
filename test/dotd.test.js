import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotd, withDotd, DOTD_URL } from '../analytics/dotd.js';

// Forme des données de la page formula1.com (texte échappé dans le script de la page, objets imbriqués entre les champs)
const entry = (pos, pct, date, tla, key) => `{\\"votePosition\\":${pos},\\"votePercentage\\":${pct},\\"driverId\\":31,\\"driverFirstName\\":\\"Max\\",\\"meetingEndDate\\":\\"${date}\\",\\"driverTLA\\":\\"${tla}\\",\\"driverKey\\":\\"902\\",\\"meetingKey\\":\\"${key}\\",\\"driverAvatarImage\\":{\\"public_id\\":\\"common/f1/x\\"},\\"teamLogoImage\\":{\\"public_id\\":\\"y\\"}}`;
const PAGE = `<html><script>self.__next_f.push([1,"...\\"accordianData\\":[[${[
  entry(1, 30, '2026-03-08', 'VER', 1279), entry(2, 14.23, '2026-03-08', 'LEC', 1279), entry(3, 10.54, '2026-03-08', 'LIN', 1279),
  entry(1, 20.62, '2026-11-01', 'VER', 1298), entry(2, 18.45, '2026-11-01', 'PER', 1298), entry(3, 15.04, '2026-11-01', 'HAM', 1298),
  entry(4, 11.32, '2026-11-01', 'ANT', 1298), entry(5, 5.62, '2026-11-01', 'LEC', 1298),
].join(',')}]]"])</script></html>`;

test('pilote du jour : 5 premiers et pourcentages lus dans la page de formula1.com', () => {
  const d = parseDotd(PAGE);
  assert.deepEqual(Object.keys(d), ['2026-03-08', '2026-11-01']);
  assert.deepEqual(d['2026-11-01'], [{ code: 'VER', pct: 20.62 }, { code: 'PER', pct: 18.45 }, { code: 'HAM', pct: 15.04 }, { code: 'ANT', pct: 11.32 }, { code: 'LEC', pct: 5.62 }]);
  assert.equal(d['2026-03-08'][0].pct, 30);
  assert.deepEqual(parseDotd('<html>autre forme</html>'), {});
});

test('pilote du jour : ajouté aux courses terminées, page relue seulement s\'il en manque', async () => {
  const urls = [];
  const fetchFn = async (u) => { urls.push(u); return new Response(PAGE, { status: 200 }); };
  const race = (round, date, done) => ({ round, date, results: done ? [{ code: 'VER' }] : [] });
  const v = { races: [race(1, '2026-03-08', true), race(20, '2026-11-01', true), race(21, '2026-11-08', false)] };
  const out = await withDotd(2026, v, null, { fetchFn, now: Date.parse('2026-11-02T12:00:00Z') });
  assert.deepEqual(urls, [DOTD_URL(2026)]);
  assert.equal(out.races[0].dotd[0].code, 'VER');
  assert.equal(out.races[1].dotd[1].code, 'PER');
  assert.equal(out.races[2].dotd, undefined, 'course à venir : rien');
  // Saison relue : votes repris, page pas relue
  const again = await withDotd(2026, { races: [race(1, '2026-03-08', true), race(20, '2026-11-01', true), race(21, '2026-11-08', false)] }, out, { fetchFn });
  assert.equal(urls.length, 1);
  assert.equal(again.races[1].dotd[0].pct, 20.62);
  // Course finie sans vote publié : cherchée 3 jours, puis abandonnée (tableau vide, plus de lecture)
  const fresh = { races: [race(21, '2026-11-08', true)] };
  await withDotd(2026, fresh, null, { fetchFn, now: Date.parse('2026-11-09T12:00:00Z') });
  assert.equal(fresh.races[0].dotd, undefined);
  await withDotd(2026, fresh, null, { fetchFn, now: Date.parse('2026-11-12T12:00:00Z') });
  assert.deepEqual(fresh.races[0].dotd, []);
  // Page injoignable : rien ne change
  const down = { races: [race(20, '2026-11-01', true)] };
  await withDotd(2026, down, null, { fetchFn: async () => { throw new Error('réseau'); } });
  assert.equal(down.races[0].dotd, undefined);
});
