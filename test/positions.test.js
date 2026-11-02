import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Code de l'appli (chemins /shared/… du navigateur) chargé tel quel, chemins réécrits vers le dossier shared/
const src = readFileSync(new URL('../public/js/positions.js', import.meta.url), 'utf8').replace(/(['"])\/shared\//g, `$1${new URL('../shared/', import.meta.url).href}`);
const { Positions } = await import(`data:text/javascript,${encodeURIComponent(src)}`);

// Course simulée sans GPS. Le tracé est mesuré en secondes du tour de référence (comme les vrais tracés) : une
// voiture au rythme de référence avance d'une unité par seconde. Chaque pilote est plus ou moins rapide que la
// référence selon les portions (± 8 %), chaque tour un peu différent (± 1,5 %), et les messages du chronométrage
// arrivent plus ou moins vite (± 0,4 s autour du retard habituel, que la calibration des boucles compense déjà).
// 24 boucles par tour (3 secteurs de 8), calibrées.
const L = 80;
const SEGS = 8;
const N = 3 * SEGS;
const loops = { line: 0, segs: Object.fromEntries(Array.from({ length: N }, (_, k) => [`${Math.floor(k / SEGS)}-${k % SEGS}`, (k + 1) / N])) };
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

// utc : messages avec l'heure d'émission par la F1 (direct) ; l'horloge F1 est ici l'horloge locale
function simulate(laps = 4, utc = false) {
  const pos = new Positions((u) => u);
  pos.setTrack({ L, pointAt: (p) => ({ x: p, y: 0 }) });
  pos.setLoops(loops);
  const rand = rng(7);
  const cars = { 1: { pace: 1.04 }, 2: { pace: 1.07 } };
  const state = { TimingData: { Lines: {} }, TimingStats: { Lines: {} } };
  const events = [];
  for (const [num, c] of Object.entries(cars)) {
    const profile = Array.from({ length: N }, () => 0.92 + rand() * 0.16);
    state.TimingData.Lines[num] = { NumberOfLaps: 0, Sectors: [0, 1, 2].map(() => ({ Segments: Array.from({ length: SEGS }, () => ({ Status: 0 })) })) };
    let t = 1000 + Number(num) * 700;   // départ décalé
    const truth = [[t, 0]];
    let lapStart = t;
    for (let lap = 0; lap < laps; lap++) {
      const day = 0.985 + rand() * 0.03;
      for (let k = 0; k < N; k++) {
        t += (L / N) * c.pace * profile[k] * day * 1000;
        truth.push([t, lap * L + ((k + 1) * L) / N]);
        const late = (rand() - 0.5) * 800;
        const upd = k === N - 1 ? { NumberOfLaps: lap + 1, LastLapTime: { Value: fmt((t - lapStart) / 1000) } } : { Sectors: { [Math.floor(k / SEGS)]: { Segments: { [k % SEGS]: { Status: 2049 } } } } };
        events.push({ t: t + late, num, upd, utc: utc ? new Date(t).toISOString() : undefined });
      }
      lapStart = t;
    }
    c.truth = truth;
  }
  events.sort((a, b) => a.t - b.t);
  return { pos, cars, state, events };
}
// Vraie progression à l'instant t (interpolée entre deux passages)
const truthAt = (truth, t) => {
  let i = truth.findIndex(([tt]) => tt > t);
  if (i <= 0) i = truth.length - 1;
  const [t0, p0] = truth[i - 1]; const [t1, p1] = truth[i];
  return p0 + (p1 - p0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
};

// Mesures sur les tours 3 et 4 (temps des portions appris) : reculs, bonds (plus de 3 fois la vitesse sur une image),
// arrêts (immobile une image alors qu'elle roule), écart moyen et pire écart avec la vraie place (en secondes)
export function measure(utc = false) {
  const { pos, cars, state, events } = simulate(4, utc);
  const end = events.at(-1).t;
  let e = 0;
  const shown = { 1: [], 2: [] };
  for (let t = 1000; t < end; t += 50) {
    for (; e < events.length && events[e].t <= t; e++) {
      const { num, upd, utc: u } = events[e];
      const line = state.TimingData.Lines[num];
      if (upd.NumberOfLaps !== undefined) { line.NumberOfLaps = upd.NumberOfLaps; line.LastLapTime = upd.LastLapTime; }
      pos.onTiming(state, { Lines: { [num]: upd } }, events[e].t, u);
    }
    for (const num of ['1', '2']) {
      const g = pos.estimatedXY(num, t, 0.05);
      if (g) shown[num].push([t, g.x]);
    }
  }
  const res = {};
  for (const num of ['1', '2']) {
    const list = shown[num].filter(([t]) => truthAt(cars[num].truth, t) > 2 * L && t < cars[num].truth.at(-1)[0]);
    let back = 0; let jumps = 0; let stops = 0; let err = 0; let worst = 0;
    for (let i = 1; i < list.length; i++) {
      const step = list[i][1] - list[i - 1][1];
      if (step < -0.005) back++;
      if (step > 0.15) jumps++;
      if (step < 0.005) stops++;
    }
    for (const [t, x] of list) { const d = Math.abs(x - truthAt(cars[num].truth, t)); err += d; worst = Math.max(worst, d); }
    res[num] = { back, jumps, stops, mean: err / list.length, worst };
  }
  return res;
}

test('positions estimées : la voiture ne recule pas, ne bondit pas, ne s\'arrête pas, et reste près de sa vraie place', () => {
  for (const [num, r] of Object.entries(measure())) {
    console.log(`voiture ${num} : ${r.back} reculs, ${r.jumps} bonds, ${r.stops} arrêts, écart moyen ${r.mean.toFixed(2)} s, pire ${r.worst.toFixed(2)} s`);
    assert.equal(r.back, 0, `voiture ${num} : recule ${r.back} fois`);
    assert.equal(r.jumps, 0, `voiture ${num} : ${r.jumps} bonds`);
    assert.equal(r.stops, 0, `voiture ${num} : ${r.stops} arrêts`);
    assert.ok(r.mean < 0.25, `voiture ${num} : écart moyen ${r.mean.toFixed(2)} s`);
    assert.ok(r.worst < 0.8, `voiture ${num} : pire écart ${r.worst.toFixed(2)} s`);
  }
});

test('positions estimées : voiture au ralenti (plus de passage) : la voiture affichée attend, sans être recalée en arrière', () => {
  const { pos, state, events } = simulate(1);
  for (const ev of events.filter((x) => x.num === '1').slice(0, 6)) pos.onTiming(state, { Lines: { 1: ev.upd } }, ev.t);
  const t0 = events.filter((x) => x.num === '1')[5].t;
  let prev = -Infinity;
  for (let t = t0; t < t0 + 30000; t += 50) {
    const x = pos.estimatedXY('1', t, 0.05).x;
    assert.ok(x >= prev, `recul à ${t - t0} ms`);
    prev = x;
  }
  const est = pos.estimatedProgress('1', t0 + 30000);
  assert.ok(prev <= est + 0.02 * L + 0.05, `affichée ${prev.toFixed(2)} trop loin devant l'estimation ${est.toFixed(2)}`);
  // Longue pause de l'affichage (onglet caché) : recalée sur l'estimation, pas projetée au-delà
  assert.equal(pos.estimatedXY('1', t0 + 31000, 2).x, pos.estimatedProgress('1', t0 + 31000));
});

test('positions estimées : tour annoncé avec le temps passé au garage (« 6:25.889 ») : au tour suivant, la voiture ne saute pas', () => {
  const { pos, state, events } = simulate(2);
  const ev = events.filter((x) => x.num === '1');
  const garage = ev.find((x) => x.upd.NumberOfLaps === 1);
  garage.upd = { ...garage.upd, LastLapTime: { Value: '6:25.889' } };
  const line = state.TimingData.Lines[1];
  let e = 0, prev = null, jumps = 0;
  for (let t = ev[0].t; t < ev.at(-1).t; t += 50) {
    for (; e < ev.length && ev[e].t <= t; e++) {
      const { upd } = ev[e];
      if (upd.NumberOfLaps !== undefined) { line.NumberOfLaps = upd.NumberOfLaps; line.LastLapTime = upd.LastLapTime; }
      pos.onTiming(state, { Lines: { 1: upd } }, ev[e].t);
    }
    const x = pos.estimatedXY('1', t, 0.05)?.x;
    if (prev !== null && x - prev > 0.15) jumps++;   // plus de 3 fois sa vitesse sur une image
    prev = x;
  }
  assert.equal(jumps, 0, `${jumps} bonds`);
});

test('positions estimées : avec l\'heure d\'émission des messages (direct), la voiture colle à sa vraie place', () => {
  for (const [num, r] of Object.entries(measure(true))) {
    console.log(`voiture ${num}, heure d'émission : ${r.back} reculs, ${r.jumps} bonds, ${r.stops} arrêts, écart moyen ${r.mean.toFixed(2)} s, pire ${r.worst.toFixed(2)} s`);
    assert.equal(r.back + r.jumps + r.stops, 0);
    assert.ok(r.mean < 0.08, `voiture ${num} : écart moyen ${r.mean.toFixed(2)} s`);
    assert.ok(r.worst < 0.2, `voiture ${num} : pire écart ${r.worst.toFixed(2)} s`);
  }
});

test('GPS : voiture à vitesse constante, échantillons à l\'heure irrégulière : avance régulièrement, à sa vraie place', () => {
  // Cercle de 4 000 unités de rayon parcouru à 0,8 unité/ms ; un échantillon toutes les 250 ms environ, daté avec
  // ± 60 ms d'erreur (comme ceux de la F1 : à vitesse constante, deux échantillons de suite donnent 1,0 puis 0,4)
  const pos = new Positions((u) => u);
  const rand = rng(3), R = 4000, v = 0.8, at = (t) => ({ x: R * Math.cos((v * t) / R), y: R * Math.sin((v * t) / R) });
  const Position = [];
  for (let t = 0; t < 20000; t += 200 + rand() * 100) {
    const p = at(t);
    Position.push({ Timestamp: new Date(t + (rand() - 0.5) * 120).toISOString(), Entries: { 1: { X: p.x, Y: p.y } } });
  }
  pos.ingestPosition({ Position }, 20000);
  let prev = null, worst = 0, slow = Infinity, fast = 0;
  for (let t = 3000; t < 17000; t += 50) {
    const g = pos.gpsAt('1', t);
    worst = Math.max(worst, Math.hypot(g.x - at(t).x, g.y - at(t).y));
    if (prev) { const sp = Math.hypot(g.x - prev.x, g.y - prev.y) / 50; slow = Math.min(slow, sp); fast = Math.max(fast, sp); }
    prev = g;
  }
  assert.ok(fast / slow < 1.25, `vitesse affichée entre ${slow.toFixed(2)} et ${fast.toFixed(2)} unité/ms`);
  assert.ok(worst < 60, `jusqu'à ${worst.toFixed(0)} unités de sa vraie place`);
});

test('GPS : point aberrant de la F1 (à des kilomètres, un seul) : oublié, la voiture ne saute pas', () => {
  // Ligne droite à 0,8 unité/ms, un point toutes les 250 ms ; à 2 500 ms, un point à 14 km (vu aux EL1 de Mexico 2026)
  const pos = new Positions((u) => u);
  const Position = [];
  for (let t = 0; t < 6000; t += 250) Position.push({ Timestamp: new Date(t).toISOString(), Entries: { 1: t === 2500 ? { X: -4626, Y: -12975 } : { X: 0.8 * t + 10, Y: 50 } } });
  pos.ingestPosition({ Position }, 6000);
  let worst = 0;
  for (let t = 1000; t < 5000; t += 50) { const g = pos.gpsAt('1', t); worst = Math.max(worst, Math.hypot(g.x - (0.8 * t + 10), g.y - 50)); }
  assert.ok(worst < 60, `jusqu'à ${worst.toFixed(0)} unités de sa vraie place`);
  assert.equal(pos.gps.get('1').length, 23);
});

test('GPS : voiture arrêtée (stands) : reste immobile ; saut de plus de 250 m : pas de lissage à travers', () => {
  const pos = new Positions((u) => u);
  const Position = [];
  for (let t = 0; t < 5000; t += 250) Position.push({ Timestamp: new Date(t).toISOString(), Entries: { 1: { X: t < 2500 ? 100 : 9000, Y: 50 } } });
  pos.ingestPosition({ Position }, 5000);
  for (const t of [600, 1100, 1700]) assert.deepEqual([Math.round(pos.gpsAt('1', t).x), Math.round(pos.gpsAt('1', t).y)], [100, 50]);
  for (const t of [3200, 4100]) assert.equal(Math.round(pos.gpsAt('1', t).x), 9000);
});
