import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSource } from '../server/live.js';

test('direct : jeton renouvelé après une connexion sans GPS, nouvelle connexion (une seule fois)', () => {
  let token = null;   // jeton expiré au lancement : connexion sans jeton
  const live = new LiveSource({ source: { mode: 'live' } }, () => token);
  live.usedToken = live.getToken();
  assert.equal(live.tokenChanged(), false);
  token = 'jeton-renouvele';   // renouvelé tout seul 5 s plus tard
  assert.equal(live.tokenChanged(), true);
  live.usedToken = live.getToken();   // reconnecté avec ce jeton
  assert.equal(live.tokenChanged(), false);   // compte sans accès au GPS : pas de reconnexion en boucle
  token = 'jeton-suivant';
  live.status.authenticated = true;   // GPS déjà reçu : la connexion en cours est gardée
  assert.equal(live.tokenChanged(), false);
});
