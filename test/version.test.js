import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { changelogFor, newItems } from '../shared/changelog.js';

const { newer } = createRequire(import.meta.url)('../desktop/version.cjs');

test('mises à jour : versions comparées, bêtas avant la version finale', () => {
  assert.equal(newer('1.2.10', '1.2.9'), true);
  assert.equal(newer('v1.28.0', '1.27.55'), true);
  assert.equal(newer('1.27.55', '1.27.55'), false);
  // Bêtas : la plus récente gagne, la version finale passe devant ses bêtas, la suivante devant tout
  assert.equal(newer('1.28.0-beta.3', '1.28.0-beta.2'), true);
  assert.equal(newer('1.28.0-beta.2', '1.28.0-beta.10'), false);
  assert.equal(newer('1.28.0', '1.28.0-beta.9'), true);
  assert.equal(newer('1.28.0-beta.9', '1.28.0'), false);
  assert.equal(newer('1.28.0-beta.1', '1.27.55'), true);
  assert.equal(newer('1.28.1', '1.28.0-beta.4'), true);
});

test('journal : une bêta reprend la section de sa version', () => {
  const md = '# Journal\n\n## v1.28.0 — à venir\n\n### Divers\n- Truc.\n\n## v1.27.54 — 2026-10-18\n\n- Avant.\n';
  assert.equal(changelogFor(md, 'v1.28.0-beta.3').version, '1.28.0');
  assert.match(changelogFor(md, 'v1.28.0-beta.3').body, /Truc/);
  assert.equal(changelogFor(md, 'v1.27.54').body, '- Avant.');
});

test('journal : « Nouveau dans cette bêta » = ajouté depuis la bêta précédente, par thème', () => {
  const before = '### Actu\n- Livrées repérées.\n\n### Divers\n- Petites améliorations internes.';
  const now = '### Actu\n- Livrées repérées.\n- Tenues repérées,\n  dans toutes les langues.\n\n### Vidéo\n- Plein écran.\n\n### Divers\n- Petites améliorations internes.';
  assert.equal(newItems(before, now), '### Actu\n- Tenues repérées,\n  dans toutes les langues.\n\n### Vidéo\n- Plein écran.');
  assert.equal(newItems(now, now), '');
});
