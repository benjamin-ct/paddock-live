import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Chrome Web Store : résumé (description du manifeste) coupé au-delà de 132 caractères, nom au-delà de 75
test('extension : nom et résumé dans les limites des boutiques, dans chaque langue', () => {
  for (const lang of fs.readdirSync('extension/_locales')) {
    const m = JSON.parse(fs.readFileSync(`extension/_locales/${lang}/messages.json`, 'utf8'));
    assert.ok(m.name.message.length <= 75, `${lang} : nom trop long`);
    assert.ok(m.description.message.length <= 132, `${lang} : résumé de ${m.description.message.length} caractères`);
  }
});
