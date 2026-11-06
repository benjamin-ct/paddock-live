import test from 'node:test';
import assert from 'node:assert/strict';
import { gpShort, gpFull, sessionLabel, sameGp } from '../shared/gp-names.js';

test('noms des Grands Prix : courant et couru dans un autre pays', () => {
  assert.equal(gpShort('Australian Grand Prix'), 'Australie');
  assert.equal(gpFull('Australian Grand Prix'), "Grand Prix d'Australie");
  // 2026 : le Grand Prix de Bahreïn couru à Sepang
  const n = 'Bahrain Grand Prix in Malaysia';
  assert.equal(gpShort(n), 'Bahreïn (Malaisie)');
  assert.equal(gpShort(n, true), 'Bahrain (Malaysia)');
  assert.equal(gpFull(n), 'Grand Prix de Bahreïn en Malaisie');
  assert.equal(gpFull(n, true), n);
});

test('noms des Grands Prix et des séances en italien et en espagnol', () => {
  assert.equal(gpShort('Japanese Grand Prix', 'it'), 'Giappone');
  assert.equal(gpFull('Italian Grand Prix', 'it'), "Gran Premio d'Italia");
  assert.equal(gpFull('Mexico City Grand Prix', 'es', 'GP'), 'GP de la Ciudad de México');
  assert.equal(gpFull('Bahrain Grand Prix in Malaysia', 'it'), 'Gran Premio del Bahrein in Malesia');
  assert.equal(gpFull('Bahrain Grand Prix in Malaysia', 'es'), 'Gran Premio de Baréin en Malasia');
  assert.equal(gpFull('Australian Grand Prix', 'en'), 'Australian Grand Prix');
  assert.equal(gpFull('Australian Grand Prix', 'fr'), "Grand Prix d'Australie");
  assert.equal(sessionLabel('Qualifying', 'it'), 'Qualifiche');
  assert.equal(sessionLabel('Practice 1', 'es'), 'Libres 1');
  assert.equal(sessionLabel('Race'), 'Course');
  assert.equal(sessionLabel('Race', true), 'Race');
});

test('Grand Prix du calendrier reconnu dans la séance de la F1 même sous un autre nom (Brésil 2026)', () => {
  const info = { Path: '2026/2026-11-08_São_Paulo_Grand_Prix/2026-11-06_Practice_1/', Meeting: { Name: 'São Paulo Grand Prix', Location: 'São Paulo' } };
  assert.equal(sameGp({ name: 'Brazilian Grand Prix', locality: 'São Paulo', year: 2026 }, info), true);
  assert.equal(sameGp({ name: 'São Paulo Grand Prix', locality: '', year: 2026 }, info), true);
  assert.equal(sameGp({ name: 'Brazilian Grand Prix', locality: 'São Paulo', year: 2027 }, info), false);   // replay d'une autre saison
  assert.equal(sameGp({ name: 'Las Vegas Grand Prix', locality: 'Las Vegas', year: 2026 }, info), false);
  assert.equal(sameGp({ name: 'Brazilian Grand Prix', locality: 'São Paulo', year: 2026 }, null), false);
});
