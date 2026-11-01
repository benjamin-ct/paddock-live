import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniSectors } from '../server/compare.js';

test('comparaison : mini-secteurs reconstruits (boucles connues + interpolation)', () => {
  // Ligne à 0,1 du tracé ; fins de secteur à 0,4 et 0,7 (soit 0,3 et 0,6 depuis la ligne)
  const loops = { line: 0.1, segs: { S0: 0.4, S1: 0.7, '0-0': 0.2, '1-1': 0.6, '2-0': 0.8 } };
  const m = miniSectors(loops, [3, 3, 2]);
  assert.equal(m.length, 8);
  assert.deepEqual(m.map((x) => x.name), ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2']);
  // Boucle connue 0-0 : fin de 1.1 à 0,1 depuis la ligne ; 1.2 interpolée entre 0,1 et 0,3
  assert.ok(Math.abs(m[0].to - 0.1) < 1e-9 && !m[0].approx);
  assert.ok(Math.abs(m[1].to - 0.2) < 1e-9 && m[1].approx);
  // Fin de secteur et fin du tour exactes, sans trou ni chevauchement
  assert.ok(Math.abs(m[2].to - 0.3) < 1e-9);
  assert.equal(m.at(-1).to, 1);
  for (let i = 1; i < m.length; i++) assert.equal(m[i].from, m[i - 1].to);
  // Sans fin de secteur connue : seulement les boucles localisées
  assert.equal(miniSectors({ line: 0, segs: { '0-0': 0.2, '0-1': 0.5 } }, [2, 2, 2]).length, 2);
  assert.deepEqual(miniSectors(null), []);
});

test('comparaison : calcul commun (appli et version web) d\'après le GPS gardé, recalé sur le temps officiel', async () => {
  const { compareFrom, addPositions } = await import('../shared/compare.js');
  // Circuit « stade » (dixièmes de mètre) parcouru à vitesse constante : un tour = 60 s pour A, 61 s pour B
  const pts = [];
  const R = 2000, S = 10000;
  for (let x = 0; x < S; x += 100) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += 100 / R) pts.push([S + R * Math.cos(a), R + R * Math.sin(a)]);
  for (let x = S; x > 0; x -= 100) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < 1.5 * Math.PI; a += 100 / R) pts.push([R * Math.cos(a), R + R * Math.sin(a)]);
  const cdata = { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), rotation: 0, corners: [] };
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % pts.length][0] - pts[i - 1][0], pts[i % pts.length][1] - pts[i - 1][1]));
  const L = cum.at(-1);
  const at = (d) => { d = ((d % L) + L) % L; let i = 0; while (cum[i + 1] < d) i++; const f = (d - cum[i]) / (cum[i + 1] - cum[i]); const p = pts[i], q = pts[(i + 1) % pts.length]; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; };
  const t0 = Date.parse('2026-11-01T20:00:00Z');
  const cars = new Map();
  for (const [num, lap] of [['1', 60], ['16', 61]]) {
    const Position = [];
    for (let ms = 0; ms <= 3 * lap * 1000; ms += 250) { const [X, Y] = at((ms / 1000 / lap) * L); Position.push({ Timestamp: new Date(t0 + ms).toISOString(), Entries: { [num]: { X, Y } } }); }
    addPositions(cars, { Position });
  }
  const off = 5000;   // heure de réception = heure F1 + 5 s
  const lapEntry = (lap, n) => ({ lap: n, time: `1:${String(lap - 60).padStart(2, '0')}.000`, s: [null, null, null], t: t0 + n * lap * 1000 + off });
  const state = { SessionInfo: { StartDate: '2026-11-01T14:00:00', Meeting: { Circuit: { Key: 65 } } },
    TimingData: { Lines: { 1: { BestLapTime: { Value: '1:00.000', Lap: 2 } }, 16: { BestLapTime: { Value: '1:01.000', Lap: 2 } } } }, DriverList: { 1: { Tla: 'VER' }, 16: { Tla: 'LEC' } } };
  const derived = { laps: { 1: [lapEntry(60, 1), lapEntry(60, 2)], 16: [lapEntry(61, 1), lapEntry(61, 2)] } };
  const events = [{ t: t0 + off, topic: 'Heartbeat', data: { Utc: new Date(t0).toISOString() } }];
  const out = await compareFrom({ state, derived, events, cars, until: t0 + 200000 + off, a: '1', b: '16',
    load: async () => [cdata, { line: 0, segs: { S0: 1 / 3, S1: 2 / 3 } }] });
  assert.equal(out.gps, true, out.reason);
  assert.equal(out.minis.length, 3);
  const sum = (m) => m.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum(out.a.mini) - 60) < 0.01 && Math.abs(sum(out.b.mini) - 61) < 0.01, `${sum(out.a.mini)} ${sum(out.b.mini)}`);
  // Sans GPS du tour demandé : la raison est donnée (la version web la complète)
  const none = await compareFrom({ state, derived, events, cars: new Map(), until: t0 + 200000 + off, a: '1', b: '16', load: async () => [cdata, null] });
  assert.equal(none.gps, false);
  assert.match(none.reason, /GPS/);
});
