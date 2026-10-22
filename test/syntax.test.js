import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Fichiers que les autres tests ne chargent pas (server/index.js, interface, appli de bureau) :
// une erreur de syntaxe (nom importé deux fois…) empêcherait l'appli de démarrer
const DIRS = ['server', 'shared', 'public/js', 'desktop', 'analytics'];
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return ['node_modules', 'site'].includes(e.name) ? [] : files(p);
  return /\.(c|m)?js$/.test(e.name) ? [p] : [];
});

test('syntaxe : tous les fichiers de l\'appli et du serveur se lisent', async () => {
  const list = DIRS.flatMap(files);
  const run = promisify(execFile);
  const bad = [];
  for (let i = 0; i < list.length; i += 16) {
    await Promise.all(list.slice(i, i + 16).map((f) => run(process.execPath, ['--check', f]).catch((e) => bad.push(`${f}: ${e.stderr.split('\n').find((l) => /Error/.test(l))}`))));
  }
  assert.deepEqual(bad, []);
});
