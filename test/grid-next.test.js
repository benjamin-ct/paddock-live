import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_NEXT, gridSummary } from '../shared/grid-next.js';

test('grille 2027 : 11 écuries, 22 baquets, chaque baquet confirmé a sa date et le lien de son annonce', () => {
  assert.equal(GRID_NEXT.teams.length, 11);
  assert.equal(new Set(GRID_NEXT.teams.map((x) => x.id)).size, 11);
  for (const x of GRID_NEXT.teams) {
    assert.equal(x.seats.length, 2, x.team);
    assert.equal(x.was.length, 2, x.team);
    for (const s of x.seats.filter((y) => y.driver)) {
      assert.match(s.url, /^https:\/\/[^/\s]+\.[a-z]+\//, s.driver);
      assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/, s.driver);
      assert.ok(s.date <= GRID_NEXT.updated, `${s.driver} : annonce après la mise à jour`);
      if (s.replaces) assert.ok(x.was.includes(s.replaces), `${s.driver} remplace un pilote de l'écurie`);
    }
    // À confirmer : aucun nom, aucune source (pas de rumeur)
    for (const s of x.seats.filter((y) => !y.driver)) assert.deepEqual(s, {}, x.team);
  }
  const drivers = GRID_NEXT.teams.flatMap((x) => x.seats.map((s) => s.driver).filter(Boolean));
  assert.equal(new Set(drivers).size, drivers.length, 'un pilote dans un seul baquet');
  const s = gridSummary();
  assert.equal(s.seats, 22);
  assert.equal(s.confirmed + s.open, 22);
  assert.equal(s.confirmed, drivers.length);
});

test('grille 2027 : changements par rapport à 2026', () => {
  const s = gridSummary({ year: 2027, teams: [
    { team: 'A', id: 'a', was: ['P1', 'P2'], seats: [{ driver: 'P1' }, { driver: 'P2' }] },
    { team: 'B', id: 'b', was: ['P3', 'P4'], seats: [{ driver: 'N1', replaces: 'P3' }, {}] },
    { team: 'C', id: 'c', was: ['P5', 'P6'], seats: [{}, {}] },
  ] });
  assert.deepEqual(s.teams.map((x) => [x.open, x.same, x.arrivals.map((a) => a.driver)]), [[0, true, []], [1, false, ['N1']], [2, false, []]]);
  assert.deepEqual([s.seats, s.confirmed, s.open, s.complete, s.arrivals.length], [6, 3, 3, 1, 1]);
});

test('grille 2027 : bouton de la Saison à l\'année de la grille, traduit', async () => {
  const fs = await import('node:fs');
  const label = `Grille ${GRID_NEXT.year}`;
  assert.ok(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes(`<use href="#i-swap"/></svg> ${label}</button>`));
  for (const l of ['en', 'it', 'es']) assert.ok((await import(`../public/js/i18n-${l}.js`)).default[label], l);
});
