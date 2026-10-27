import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dossier de données temporaire : le test ne touche pas au cache de l'utilisateur
process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-test-'));
const { getTranslations, addTranslations } = await import('../server/translations.js');

test('traductions FIA : ajout, gardées sans être remplacées, anciennes traductions de l\'ordinateur refaites, entrées invalides', () => {
  const en = `Revised front wing flap ${Date.now()}`;
  assert.equal(addTranslations('fr', [{ en, t: 'Volet d\'aileron avant révisé', q: 'cloud' }]), 1);
  assert.equal(addTranslations('fr', [{ en, t: 'Autre version', q: 'cloud' }]), 0, 'une traduction gardée n\'est pas remplacée');
  assert.deepEqual(getTranslations('fr')[en], { t: 'Volet d\'aileron avant révisé', q: 'cloud' });
  assert.equal(addTranslations('fr', [{ en: '', t: 'x' }, { en: 'a', t: 42 }, null]), 0);
  assert.equal(addTranslations('xx', [{ en: 'a', t: 'b' }]), 0);
  assert.deepEqual(getTranslations('xx'), {});
  assert.equal(addTranslations('fr', [{ en: '__proto__', t: 'x', q: 'high' }, { en: 'constructor', t: 'y', q: 'high' }]), 0, 'noms réservés ignorés');
  assert.equal(Object.getPrototypeOf(getTranslations('fr')), Object.prototype);
  // Fichier de la 1.28 (traductions faites sur l'ordinateur) : seules celles du serveur restent
  fs.writeFileSync(path.join(process.env.PADDOCK_DATA_DIR, '.cache', 'translations-de.json'), JSON.stringify({ Floor: { t: 'Boden', q: 'high' }, Wing: { t: 'Flügel', q: 'light' }, Duct: { t: 'Kanal', q: 'cloud' } }));
  assert.deepEqual(Object.keys(getTranslations('de')), ['Duct']);
});
