import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterPrefix } from '../analytics/alerts.js';

// Chaque ligne parcourue compte dans le quota de lectures de la base (5 millions par jour) : une recherche
// « k LIKE 'prefix%' » parcourt toute la table à chaque passage de la tâche planifiée (quota dépassé le 27 oct. 2026)
test('base du serveur : pas de recherche LIKE sur la clé de la table studio, bornes sur la clé à la place', () => {
  for (const f of fs.readdirSync('analytics').filter((x) => x.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(`analytics/${f}`, 'utf8'), /FROM studio WHERE k LIKE/, f);
  }
  assert.equal(afterPrefix('racestats:2026:'), 'racestats:2026;');
  assert.ok('racestats:2026:12' >= 'racestats:2026:' && 'racestats:2026:12' < afterPrefix('racestats:2026:'));
  assert.ok(!('racestats:2027:1' < afterPrefix('racestats:2026:')));
});
