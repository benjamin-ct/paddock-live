// Fichiers de shared/ exclus du déclenchement des bêtas (workflow « Application de bureau ») : l'appli ne doit pas les
// importer, sinon une modification de l'appli passerait sans bêta
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const wf = readFileSync('.github/workflows/desktop.yml', 'utf8');
const excluded = [...wf.matchAll(/'!shared\/([^']+)'/g)].map((m) => new RegExp(`^${m[1].replace(/\./g, '\\.').replace(/\*/g, '.*')}$`));
const appFiles = ['public', 'server', 'desktop'].flatMap((d) => readdirSync(d, { recursive: true }).map((f) => join(d, f)))
  .filter((f) => /\.(m?js|html)$/.test(f) && !/node_modules|[\\/]dist[\\/]/.test(f));

test('bêtas : les fichiers du Studio exclus ne sont pas importés par l\'appli', () => {
  assert.ok(excluded.length >= 5);
  const shared = readdirSync('shared').filter((f) => excluded.some((re) => re.test(f)));
  assert.ok(shared.includes('social-draw.js'));
  for (const f of appFiles) {
    const src = readFileSync(f, 'utf8');
    for (const name of shared) assert.ok(!src.includes(`shared/${name}`) && !src.includes(`/${name}'`), `${f} importe shared/${name}`);
  }
});
