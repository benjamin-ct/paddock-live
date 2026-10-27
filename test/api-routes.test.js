import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Chaque adresse /api/… écrite dans l'interface existe dans le serveur de l'appli : une route retirée par erreur
// (traduction, transcription des radios, statistiques) faisait échouer ces appels sans rien dire
test('interface : toutes les adresses /api/ appelées existent dans le serveur local', () => {
  const files = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) files.push(p);
    }
  })('public');
  const server = fs.readFileSync('server/index.js', 'utf8');
  const routes = new Set([...server.matchAll(/case '[A-Z]+ (\/api\/[^']*)'/g)].map((m) => m[1]));
  const missing = [];
  for (const f of files) {
    // Adresse suivie d'une partie variable (`/api/social/${k}/login`) : non vérifiée
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/['`"](\/api\/[\w\-/.]*)(\$\{)?/g)) {
      const p = m[1].replace(/[/.]+$/, '');
      if (!m[2] && !routes.has(p)) missing.push(`${p} (${f})`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
