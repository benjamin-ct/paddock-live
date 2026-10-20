import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Fichiers de la page du Studio (chargés seulement par le navigateur) : une erreur de syntaxe
// empêcherait d'ouvrir le Studio sans qu'aucun autre test ne la voie
test('page du Studio : fichiers JavaScript sans erreur de syntaxe', () => {
  const dir = new URL('../analytics/studio-page/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 5);
  for (const f of files) assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', new URL(f, dir).pathname], { stdio: 'pipe' }), f);
});
