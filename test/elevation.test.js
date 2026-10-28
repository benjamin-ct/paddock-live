import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../shared/track.js';
import { accumulate, fillGaps, smooth, elevationProfile } from '../shared/elevation.js';

// Cercle de 200 points (rayon 500 m) ; altitude réelle : une colline de 20 m (sinus du tour)
const N = 200, R = 5000;
const track = new Track({ x: Array.from({ length: N }, (_, i) => Math.round(R * Math.cos((2 * Math.PI * i) / N))),
  y: Array.from({ length: N }, (_, i) => Math.round(R * Math.sin((2 * Math.PI * i) / N))) });
const hill = (a) => 1000 + 100 * Math.sin(a);   // 1/10 m
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function lap(car, { lat = 0, noise = 0, from = 0, to = 1, step = 0.002 } = {}) {
  const out = [];
  for (let f = from; f < to; f += step) {
    const a = 2 * Math.PI * f;
    out.push({ car, x: (R + lat) * Math.cos(a), y: (R + lat) * Math.sin(a), z: hill(a) + (rnd() - 0.5) * 2 * noise });
  }
  return out;
}

test('altitude : projection sur le tracé, moyenne des Z par point, positions loin du tracé écartées', () => {
  const samples = [...lap('1', { lat: 40 }), ...lap('16', { lat: -40 }),
    { car: '1', x: R + 400, y: 0, z: 9999 },   // 40 m du tracé (stands) : écartée
    { car: '1', x: 0, y: 0, z: 5 },            // position nulle : écartée
    { car: '1', x: R, y: 1, z: NaN }];         // sans Z : écartée
  const { z, used } = accumulate(track, samples);
  assert.equal(used, 1000);
  assert.equal(z.length, N);
  assert.ok(z.every((v) => !Number.isNaN(v)), 'tous les points vus');
  assert.ok(Math.max(...z) < 1110, 'Z de la position des stands non compté');
  // Moyenne : les deux voitures (de part et d'autre de la ligne) donnent l'altitude du point
  for (const i of [0, 50, 120]) assert.ok(Math.abs(z[i] - hill((2 * Math.PI * (i + 0.5)) / N)) < 3, `point ${i} : ${z[i]}`);
});

test('altitude : trous comblés entre voisins (boucle comprise), lissage circulaire', () => {
  assert.deepEqual(fillGaps([10, NaN, NaN, 40, NaN]), [10, 20, 30, 40, 25]);
  assert.deepEqual(fillGaps([NaN, 7, NaN]), [7, 7, 7]);
  assert.equal(fillGaps([NaN, NaN]), null);
  assert.deepEqual(smooth([0, 0, 9, 0, 0, 0], 1), [0, 3, 3, 3, 0, 0]);
  assert.deepEqual(smooth([9, 0, 0, 0], 1), [3, 3, 0, 3], 'le premier et le dernier point sont voisins');
});

test('altitude : profil d\'un circuit d\'après des tours bruités (moitié vue au moins)', () => {
  const samples = [];
  for (let k = 0; k < 4; k++) samples.push(...lap(String(k), { lat: (k - 1.5) * 20, noise: 30 }));   // ±3 m de bruit
  const p = elevationProfile(track, samples);
  assert.equal(p.n, N);
  assert.equal(p.cover, 1);
  assert.ok(p.z.every(Number.isInteger));
  const err = p.z.map((v, i) => Math.abs(v - hill((2 * Math.PI * (i + 0.5)) / N)));
  assert.ok(Math.max(...err) < 12, `écart max ${Math.max(...err)} (1/10 m)`);
  assert.ok(Math.max(...p.z) - Math.min(...p.z) > 180, 'dénivelé gardé (~20 m)');

  // Un quart du tour seulement : pas de profil
  assert.equal(elevationProfile(track, lap('1', { to: 0.25 })), null);
  // Deux tiers : profil complet, la partie sans voiture interpolée
  const part = elevationProfile(track, lap('1', { to: 0.67 }));
  assert.equal(part.z.length, N);
  assert.ok(part.cover > 0.6 && part.cover < 0.7);
});

test('altitude le long du tracé : lissée selon la distance (points inégalement espacés : pas de marches), vraies pentes gardées', async () => {
  const { smoothAlong } = await import('../shared/elevation.js');
  // Cercle de 1 km de tour, points alternativement à 0,2 m et 19,8 m (comme le tracé MultiViewer d'Austin)
  const pts = [], ang = [], L = 1000, R1 = L / (2 * Math.PI);
  for (let s = 0; s < L - 1; s += 20) for (const ds of [0, 0.2]) { const a = (2 * Math.PI * (s + ds)) / L; ang.push(a); pts.push([R1 * Math.cos(a), R1 * Math.sin(a)]); }
  // Vraie colline : 30 m d'amplitude (pentes jusqu'à 19 %) ; gardée à 2 % près
  const real = ang.map((a) => 30 * Math.sin(a));
  smoothAlong(pts, real).forEach((v, i) => assert.ok(Math.abs(v - real[i]) < 0.6, `point ${i} : ${v} au lieu de ${real[i]}`));
  // Profil en marches (3 m d'écart entre deux points à 0,2 m l'un de l'autre) : continu une fois lissé
  const steps = real.map((v, i) => v + (i % 2 ? 1.5 : -1.5));
  const out = smoothAlong(pts, steps);
  for (let i = 0; i < out.length; i += 2) assert.ok(Math.abs(out[i + 1] - out[i]) < 0.2, `marche de ${out[i + 1] - out[i]} m au point ${i}`);
  // Altitude constante : inchangée
  assert.ok(smoothAlong(pts, pts.map(() => 7)).every((v) => Math.abs(v - 7) < 1e-9));
});
