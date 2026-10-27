import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeBackup, readBackup } from '../shared/backup.js';

// Réglages écrits dans un dossier temporaire (pas dans le config.json du projet)
process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-backup-'));
const { exportServerSettings, importServerSettings } = await import('../server/backup.js');
const { getConfig, saveConfig } = await import('../server/config.js');

test('sauvegarde : fichier relu à l\'identique, caches et état de séance écartés', () => {
  const ui = { prefs: { favs: ['44'], scheme: 'light' }, delayMs: 12000, layouts: { a: 1 }, radioTexts: { x: 1 }, duel: { a: '1' } };
  const file = makeBackup(ui, { news: { disabled: [], custom: [] } }, new Date('2026-10-15T10:00:00Z'));
  assert.equal(file.app, 'paddock-live');
  assert.equal(file.date, '2026-10-15T10:00:00.000Z');
  assert.deepEqual(Object.keys(file.interface).sort(), ['delayMs', 'layouts', 'prefs']);
  const back = readBackup(JSON.stringify(file));
  assert.deepEqual(back.ui, { prefs: ui.prefs, delayMs: 12000, layouts: { a: 1 } });
  assert.deepEqual(back.server, { news: { disabled: [], custom: [] } });
});

test('sauvegarde : fichiers refusés avec un message clair', () => {
  assert.throws(() => readBackup('pas du json'), /illisible/);
  assert.throws(() => readBackup('{"app":"autre"}'), /pas une sauvegarde/);
  assert.throws(() => readBackup('{"app":"paddock-live","type":"reglages","version":2}'), /plus récente/);
  const r = readBackup(JSON.stringify({ app: 'paddock-live', type: 'reglages', version: 1, interface: { prefs: [1], inconnu: 1, delayMs: 5000 } }));
  assert.deepEqual(r.ui, { delayMs: 5000 }, 'prefs invalides et clés inconnues ignorées');
  assert.equal(r.server, null);
});

test('sauvegarde serveur : sans jeton ni clé, restauration revérifiée', () => {
  saveConfig({
    f1tvToken: 'a.b.c', lanKey: 'secret',
    lights: { provider: 'hue', after: 'keep', hue: { ip: '192.168.1.5', user: 'cle-hue', lights: ['1', '2'] }, ha: { url: '', token: 'jeton-ha', entities: [] } },
    news: { disabled: ['yt-x'], custom: [{ id: 'c-abc', kind: 'rss', url: 'https://exemple.fr/rss', name: 'Exemple', cat: 'media', lang: 'fr' }] },
    radioHosts: ['radio.exemple.fr'],
  });
  const out = exportServerSettings();
  const text = JSON.stringify(out);
  for (const secret of ['a.b.c', 'secret', 'cle-hue', 'jeton-ha']) assert.ok(!text.includes(secret), `${secret} absent`);
  assert.deepEqual(out.lights.hue, { ip: '192.168.1.5', lights: ['1', '2'] });

  saveConfig({ news: { disabled: [], custom: [] }, lights: { provider: 'off' }, radioHosts: [] });
  importServerSettings({
    ...out,
    news: { disabled: ['yt-x', 42, '../x'], custom: [{ id: 'c-bad', kind: 'rss', url: 'http://127.0.0.1/x', name: 'x' }] },
    radioHosts: ['radio.exemple.fr', 'pas un hôte', 42],
  });
  const c = getConfig();
  assert.deepEqual(out.news, { disabled: ['yt-x'] }, 'sources ajoutées des anciennes versions plus sauvegardées');
  assert.deepEqual(c.news, { disabled: ['yt-x'] }, 'identifiants invalides ignorés, plus de sources ajoutées');
  assert.equal(c.lights.provider, 'hue');
  assert.equal(c.lights.after, 'keep');
  assert.deepEqual(c.lights.hue.lights, ['1', '2']);
  assert.deepEqual(c.radioHosts, ['radio.exemple.fr']);
  assert.equal(c.f1tvToken, 'a.b.c', 'connexion F1 TV inchangée');
});

test('mode créateur : un mauvais code ne l\'active pas', async () => {
  const { setCreator, creatorEnabled } = await import('../server/creator.js');
  assert.equal(setCreator('PL-FAUX-CODE'), false);
  assert.equal(creatorEnabled(), false);
  setCreator(null, false);
  assert.equal(creatorEnabled(), false);
});
