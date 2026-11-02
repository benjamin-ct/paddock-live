import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studyCollector } from '../server/studies.js';

// Course simulée sur un circuit « stade » (coordonnées en dixièmes de mètre, comme la F1) : deux voitures à 180 km/h,
// GPS toutes les 250 ms, télémétrie toutes les 250 ms ; dans les virages, VER passe 2 m à gauche de la ligne et LEC
// 1 m à droite (± 0,3 m d'un tour à l'autre), freinage 2 s avant chaque virage ; tours de 65 s + 0,05 s par tour
test('études de faisabilité : rythme, échelle, trajectoires, freinages et usure des pneus mesurés sur une séance', async () => {
  const pts = [];
  const R = 2000, S = 10000;
  for (let x = 0; x < S; x += 100) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += 100 / R) pts.push([S + R * Math.cos(a), R + R * Math.sin(a)]);
  for (let x = S; x > 0; x -= 100) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < 1.5 * Math.PI; a += 100 / R) pts.push([R * Math.cos(a), R + R * Math.sin(a)]);
  const cdata = { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), rotation: 0, corners: [{ number: 1, trackPosition: { x: S + R, y: R } }, { number: 2, trackPosition: { x: -R, y: R } }] };
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % pts.length][0] - pts[i - 1][0], pts[i % pts.length][1] - pts[i - 1][1]));
  const L = cum.at(-1);
  // Point à la distance d (unités) de la ligne, décalé de lat unités à gauche du sens de la course
  const at = (d, lat) => {
    d = ((d % L) + L) % L;
    let i = 0;
    while (cum[i + 1] < d) i++;
    const p = pts[i], q = pts[(i + 1) % pts.length], u = (d - cum[i]) / (cum[i + 1] - cum[i]);
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    return [p[0] + dx * u - (dy / len) * lat, p[1] + dy * u + (dx / len) * lat];
  };
  const corner = [cum[pts.findIndex((p) => p[0] >= S + R - 1)], cum[pts.findIndex((p, i) => i > 200 && p[0] <= -R + 1)]];
  const v = 50;   // m/s (180 km/h) = 500 unités/s
  const t0 = Date.parse('2026-11-08T17:00:00Z');
  const c = studyCollector();
  c.keyframe('SessionInfo', { Type: 'Race', Name: 'Race', StartDate: '2026-11-08T14:00:00', Meeting: { Name: 'Test', Circuit: { Key: 99 } } });
  c.keyframe('DriverList', { 1: { Tla: 'VER', TeamName: 'Red Bull' }, 16: { Tla: 'LEC', TeamName: 'Ferrari' } });
  c.keyframe('TimingAppData', { Lines: { 1: { Stints: [{ Compound: 'MEDIUM', StartLaps: 0 }] }, 16: { Stints: [{ Compound: 'MEDIUM', StartLaps: 0 }] } } });
  // Départ à t0 : grille LEC devant VER
  c.add('Heartbeat', 0, { Utc: new Date(t0).toISOString() });
  c.add('TimingData', 0, { Lines: { 1: { Position: '2' }, 16: { Position: '1' } } });
  c.add('SessionStatus', 0, { Status: 'Started' });
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const laps = 12, lapMs = (L / 10 / v) * 1000;
  for (const [num, lat0] of [['1', 20], ['16', -10]]) {
    const Position = [], Entries = [];
    for (let ms = 0; ms <= laps * lapMs; ms += 250) {
      const d = (ms / 1000) * v * 10;
      const inLap = d % L;
      // décalage dans les virages seulement (± 3 unités de bruit), sur la ligne ailleurs
      const near = corner.some((k) => Math.abs(inLap - k) < 2000);
      const [X, Y] = at(d, near ? lat0 + rnd() * 6 : 0);
      Position.push({ Timestamp: new Date(t0 + ms).toISOString(), Entries: { [num]: { X, Y, Z: 0 } } });
      const brake = corner.some((k) => { const before = ((k - inLap) % L + L) % L; return before > 0 && before < 2 * v * 10; });
      Entries.push({ Utc: new Date(t0 + ms + 30).toISOString(), Cars: { [num]: { Channels: { 0: 11000, 2: 180, 3: 6, 4: brake ? 0 : 100, 5: brake ? 100 : 0 } } } });
    }
    c.add('Position.z', 0, { Position });
    c.add('CarData.z', 0, { Entries });
    for (let lap = 1; lap <= laps; lap++) {
      const s = 65 + 0.05 * lap + (num === '16' ? 0.3 : 0);
      c.add('TimingData', lap * 65000, { Lines: { [num]: { NumberOfLaps: lap, LastLapTime: { Value: `1:${s.toFixed(3).replace(/^6/, '0')}` }, Position: num === '1' ? '1' : '2', BestLapTime: { Value: '1:05.050' } } } });
    }
  }
  const { lines } = await c.result(async () => cdata);
  const text = lines.join('\n');
  assert.match(text, /GPS : un point toutes les 250 ms/);
  assert.match(text, /Échelle des coordonnées : (9,9\d|10,0\d) unité\(s\) par mètre/);   // dixièmes de mètre (cordes des virages : un peu moins)
  // Virage 1 : bruit 0,3 m environ (3 unités × écart-type d'un tirage uniforme), signal 1,5 m (moitié de 3 m d'écart)
  const v1 = lines.find((l) => l.startsWith('Virage 1 '));
  const noise = Number(/bruit (\d+,\d)/.exec(v1)[1].replace(',', '.')), signal = Number(/signal (\d+,\d)/.exec(v1)[1].replace(',', '.'));
  assert.ok(noise < 1 && signal > 1, v1);
  assert.match(v1, /un point tous les 12 m/);   // 50 m/s × 0,25 s = 12,5 m d'arc, un peu moins en ligne droite entre deux points du virage
  assert.match(v1, /freinage : dispersion \d+ m, une mesure tous les 13 m \(2 pilotes\)/);
  assert.match(text, /Bilan : 2 virage\(s\) sur 2 lisible\(s\)/);
  // Départ : les deux voitures vues au premier virage, places gagnées comptées
  assert.match(text, /## Départ \(grille → premier virage, GPS\)\n2 voitures sur 2 vues au premier virage/);
  // Usure : 0,05 s par tour, sans bruit
  assert.match(text, /MEDIUM · 2 relais · perte 0,050 s\/tour · bruit 0,00 s/);
});
