import test from 'node:test';
import assert from 'node:assert/strict';
import { gpShort, gpFull, sessionLabel } from '../shared/gp-names.js';

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
