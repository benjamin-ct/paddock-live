import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSource } from '../server/live.js';

test('direct : séance en cours sans GPS malgré le jeton, nouvelle connexion (une fois par séance et par jeton)', () => {
  let token = 'jeton';
  const hub = { source: { mode: 'live' }, sessionKey: 9001 };
  const live = new LiveSource(hub, () => token);
  const t0 = 1e12;
  live.connectedAt = t0;   // connecté avant le début de la séance
  live.lastTimingAt = t0 + 50000;
  assert.equal(live.gpsRetry(t0 + 55000), false);   // moins d'une minute après la connexion
  assert.equal(live.gpsRetry(t0 + 61000), true);
  live.connectedAt = t0 + 62000;   // reconnecté
  live.lastTimingAt = t0 + 125000;
  assert.equal(live.gpsRetry(t0 + 130000), false);   // compte sans accès au GPS : pas de reconnexion en boucle
  token = 'jeton-renouvele';   // jeton renouvelé : un nouvel essai
  assert.equal(live.gpsRetry(t0 + 130000), true);
  hub.sessionKey = 9002;   // séance suivante
  live.lastTimingAt = t0 + 500000;
  assert.equal(live.gpsRetry(t0 + 600000), false);   // hors séance (plus de chronos depuis 100 s)
  live.lastTimingAt = t0 + 595000;
  live.status.authenticated = true;   // GPS déjà reçu : la connexion est gardée
  assert.equal(live.gpsRetry(t0 + 600000), false);
  live.status.authenticated = false;
  token = null;   // sans jeton : rien à espérer
  assert.equal(live.gpsRetry(t0 + 600000), false);
});

test('direct : compte F1 TV suivi sur un autre appareil, deux coupures en 5 min et le GPS lui est laissé', () => {
  const hub = { source: { mode: 'live' }, sessionKey: 9001 };
  const live = new LiveSource(hub, () => 'jeton');
  let restarts = 0;
  live.restart = () => restarts++;
  const t0 = 1e12;
  live.lost(null, t0);   // connexion sans F1 TV : la F1 ne la coupe pas pour un autre appareil
  live.lost('jeton', t0, 1006);   // deux coupures du Wi-Fi coup sur coup : pas un autre appareil
  live.lost('jeton', t0 + 2000, 1006);
  assert.equal(live.elsewhere, false);
  live.lost('jeton', t0);
  live.lost('jeton', t0 + 6 * 60e3);   // coupures espacées (réseau) : on garde le GPS
  assert.equal(live.elsewhere, false);
  live.lost('jeton', t0 + 6 * 60e3 + 3000);   // l'autre appareil la reprend aussitôt
  assert.equal(live.elsewhere, true);
  assert.equal(hub.source.elsewhere, true);
  assert.equal(live.gpsRetry(t0 + 7 * 60e3), false);   // pas de nouvel essai qui le lui reprendrait
  live.here();   // « Reprendre ici »
  assert.deepEqual([live.elsewhere, hub.source.elsewhere, live.losses.length, restarts], [false, false, 0, 1]);
});
