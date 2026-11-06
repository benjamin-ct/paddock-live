import test from 'node:test';
import assert from 'node:assert/strict';
import { lineCall } from '../shared/last-lap.js';

test('encore un tour : rien en dehors des 3 dernières minutes ou sans allure', () => {
  assert.equal(lineCall({ remaining: 181, toLine: 10, rate: 1 }), null);
  assert.equal(lineCall({ remaining: 120, toLine: 10, rate: 0 }), null, 'voiture arrêtée');
  assert.equal(lineCall({ remaining: 120, toLine: NaN, rate: 1 }), null, 'place sur le tour inconnue');
});

test('encore un tour : à temps, juste, trop tard (tour de lancement)', () => {
  // 40 s de tour de référence jusqu'à la ligne à 0,8 : 50 s de route ; marge « juste » de 7 s
  assert.equal(lineCall({ remaining: 70, toLine: 40, rate: 0.8 }).call, 'go');
  assert.equal(lineCall({ remaining: 55, toLine: 40, rate: 0.8 }).call, 'tight');
  assert.equal(lineCall({ remaining: 45, toLine: 40, rate: 0.8 }).call, 'tight', 'quelques secondes de retard : juste');
  assert.equal(lineCall({ remaining: 40, toLine: 40, rate: 0.8 }).call, 'late');
  const r = lineCall({ remaining: 70, toLine: 40, rate: 0.8 });
  assert.equal(r.eta, 50);
  assert.equal(r.margin, 20);
});

test('encore un tour : en tour lancé, dernier tour s\'il finit après le drapeau', () => {
  assert.equal(lineCall({ remaining: 30, toLine: 50, rate: 1, hot: true }).call, 'last');
  assert.equal(lineCall({ remaining: 90, toLine: 50, rate: 1, hot: true }).call, 'go', 'il pourra en lancer un autre');
  // Après le drapeau : seulement les tours lancés commencés à temps
  assert.equal(lineCall({ remaining: 0, toLine: 20, rate: 1, hot: true, startedInTime: true }).call, 'last');
  assert.equal(lineCall({ remaining: 0, toLine: 20, rate: 1, hot: true, startedInTime: false }), null);
  assert.equal(lineCall({ remaining: 0, toLine: 20, rate: 0.7 }), null, 'tour de lancement après le drapeau : rien');
});
