// Zones « ligne droite » (straight mode) et ligne de détection du mode dépassement (2026).
// Ni le flux F1 ni les données de circuit ne les décrivent : on les estime à partir de la
// télémétrie d'une séance archivée (vitesse + accélérateur recalés sur le GPS) :
//  - ligne droite : portion longue, quasi rectiligne, passée à fond par presque toutes les voitures ;
//  - détection : la FIA la place en général sur la ligne SC 1, à l'entrée des stands ; on prend
//    l'endroit où les voitures qui rentrent aux stands quittent la piste.
import { parseUtc } from './f1.js';

const M = 10;                 // unités GPS par mètre (dixièmes de mètre)
const MAX_SAMPLES = 400000;

function timelines(positions) {
  const cars = new Map();
  for (const p of positions) {
    for (const snap of p.data?.Position || []) {
      const t = parseUtc(snap.Timestamp);
      if (!Number.isFinite(t)) continue;
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (!e.X && !e.Y)) continue;
        if (!cars.has(num)) cars.set(num, []);
        cars.get(num).push({ t, x: e.X, y: e.Y });
      }
    }
  }
  for (const arr of cars.values()) arr.sort((a, b) => a.t - b.t);
  return cars;
}

function interp(arr, t) {
  let lo = 0, hi = arr.length - 1;
  if (hi < 1 || t < arr[0].t || t > arr[hi].t) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = arr[lo], b = arr[hi];
  if (b.t - a.t > 1500) return null;
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

// Point du tracé le plus proche, en cherchant d'abord autour du précédent (rapide).
function project(track, x, y, hint) {
  const pts = track.pts;
  const n = pts.length;
  const near = (from, to) => {
    let best = -1, bd = Infinity;
    for (let k = from; k <= to; k++) {
      const i = ((k % n) + n) % n;
      const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { idx: best, d: Math.sqrt(bd) };
  };
  if (hint >= 0) {
    const r = near(hint - 30, hint + 60);
    if (r.d < 30 * M) return r;
  }
  return near(0, n - 1);
}

// Cap (radians) entre deux points du tracé.
function heading(pts, i, j) {
  return Math.atan2(pts[j].y - pts[i].y, pts[j].x - pts[i].x);
}

function angleDiff(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

// official : définitions du plan FIA du circuit (voir shared/fia-circuit.js) ; les zones et
// points officiels remplacent alors les estimations (la télémétrie sert à trouver la fin des zones).
export function estimateZones(track, carData, positions, official = null) {
  const pts = track.pts;
  const n = pts.length;
  if (n < 20) return null;
  const tl = timelines(positions);
  if (!tl.size && !official) return null;

  // Distances cumulées le long du tracé
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % n].x - pts[i - 1].x, pts[i % n].y - pts[i - 1].y));
  const total = cum[n];
  const distFwd = (i, j) => { const d = cum[j] - cum[i]; return d >= 0 ? d : d + total; };

  // 1. Échantillons télémétrie -> point du tracé
  const bins = Array.from({ length: n }, () => []);   // [vitesse, à fond ?] par point
  const series = new Map();   // par voiture : [{t, idx, d, speed}]
  let samples = 0;
  for (const c of carData) {
    for (const entry of c.data?.Entries || []) {
      const t = parseUtc(entry.Utc);
      if (!Number.isFinite(t)) continue;
      for (const [num, car] of Object.entries(entry.Cars || {})) {
        const ch = car?.Channels;
        if (!ch) continue;
        const speed = Number(ch[2]), throttle = Number(ch[4]);
        if (!(speed > 30)) continue;
        const arr = tl.get(num);
        const p = arr && interp(arr, t);
        if (!p) continue;
        if (!series.has(num)) series.set(num, []);
        const s = series.get(num);
        const r = project(track, p.x, p.y, s.length ? s[s.length - 1].idx : -1);
        s.push({ t, idx: r.idx, d: r.d, speed, x: p.x, y: p.y });
        if (r.d > 15 * M) continue;
        bins[r.idx].push(speed, throttle >= 98 ? 1 : 0);
        if (++samples >= MAX_SAMPLES) break;
      }
      if (samples >= MAX_SAMPLES) break;
    }
    if (samples >= MAX_SAMPLES) break;
  }
  if (samples < 2000 && !official) return null;

  // 2. Proportion « à fond » par point, parmi les passages rapides (on écarte tours de
  //    rentrée, tours lents de qualif, safety car : vitesse < 85 % de la vitesse de référence),
  //    lissée sur ±25 m.
  const count = new Float64Array(n), full = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bins[i];
    if (b.length < 10) continue;
    const speeds = [];
    for (let k = 0; k < b.length; k += 2) speeds.push(b[k]);
    speeds.sort((x, y) => x - y);
    const ref = speeds[Math.floor(speeds.length * 0.9)];
    for (let k = 0; k < b.length; k += 2) {
      if (b[k] < ref * 0.85) continue;
      count[i]++;
      if (b[k + 1] && b[k] >= 160) full[i]++;
    }
  }
  const frac = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let c = count[i], f = full[i];
    for (let j = (i + 1) % n, g = 0; g < n && distFwd(i, j) <= 25 * M; j = (j + 1) % n, g++) { c += count[j]; f += full[j]; }
    for (let j = (i - 1 + n) % n, g = 0; g < n && distFwd(j, i) <= 25 * M; j = (j - 1 + n) % n, g++) { c += count[j]; f += full[j]; }
    frac[i] = c >= 5 ? f / c : 0;
  }

  // 3. Rectiligne : cap quasi constant sur ±60 m
  const ahead = (i, m) => { let j = i; for (let g = 0; g < n && distFwd(i, j) < m; g++) j = (j + 1) % n; return j; };
  const behind = (i, m) => { let j = i; for (let g = 0; g < n && distFwd(j, i) < m; g++) j = (j - 1 + n) % n; return j; };
  const straight = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = behind(i, 60 * M), b = ahead(i, 60 * M);
    straight[i] = angleDiff(heading(pts, a, i), heading(pts, i, b)) < (14 * Math.PI) / 180 ? 1 : 0;
  }
  const ok = (i) => straight[i] && frac[i] >= 0.7;

  // 4. Portions continues (circulaires), petits trous comblés, longueur minimale 300 m
  let startAt = 0;
  while (startAt < n && ok(startAt)) startAt++;
  if (startAt === n) return null;
  const runs = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (startAt + k) % n;
    if (ok(i)) {
      if (cur && distFwd(cur.to, i) <= 100 * M) cur.to = i;
      else { cur = { from: i, to: i }; runs.push(cur); }
    }
  }
  if (runs.length > 1) {
    const first = runs[0], last = runs[runs.length - 1];
    if (distFwd(last.to, first.from) <= 100 * M) { first.from = last.from; runs.pop(); }
  }
  const zones = runs
    .map((r) => ({ from: r.from, to: r.to, length: Math.round(distFwd(r.from, r.to) / M) }))
    .filter((r) => r.length >= 300);

  // 5. Détection ≈ entrée des stands : là où une voiture qui roule au limiteur hors piste
  //    a quitté le tracé (dernier point encore sur la piste avant la voie des stands).
  const entries = [];
  const passes = [];    // passages complets dans la voie des stands (points GPS)
  for (const s of series.values()) {
    for (let k = 0; k < s.length; k++) {
      if (!(s[k].d > 12 * M && s[k].speed > 40 && s[k].speed < 90)) continue;
      let e = k;
      while (e < s.length && s[e].d > 8 * M && s[e].speed < 95) e++;
      if (s[e - 1].t - s[k].t >= 8000) {
        let b = k;
        while (b > 0 && s[b].d > 4 * M && s[k].t - s[b].t < 20000) b--;
        if (s[b].d <= 4 * M) {
          entries.push(cum[s[b].idx]);
          // Retour sur la piste : premier point de nouveau sur le tracé
          let f = e;
          while (f < s.length && s[f].d > 4 * M && s[f].t - s[e - 1].t < 20000) f++;
          if (f < s.length && s[f].d <= 4 * M) passes.push(s.slice(b, f + 1));
        }
      }
      k = e;
    }
  }
  let detection = null;
  if (entries.length >= 2) {
    const ref = entries[0];
    const un = entries.map((v) => { let d = v - ref; if (d > total / 2) d -= total; if (d < -total / 2) d += total; return ref + d; }).sort((a, b) => a - b);
    const med = ((un[Math.floor(un.length / 2)] % total) + total) % total;
    let idx = 0;
    while (idx < n - 1 && cum[idx + 1] <= med) idx++;
    detection = { idx, samples: entries.length };
  }
  const pitLane = pitLanePath(passes);
  if (official) return { ...officialLayout(track, official, cum, frac, zones), pitLane, samples };
  return { v: 3, zones, detection, pitLane, samples };
}

// Positions officielles (« 45m after T19 ») -> indices du tracé, fin des zones « ligne droite » : celle de la bande
// dessinée sur le plan FIA (official.marks, shared/fia-drawing.js), sinon là où les voitures cessent d'être à fond
// (télémétrie), au plus tard au virage suivant. Détection et activation : traits du plan s'ils sont lus.
function officialLayout(track, official, cum, frac, estimated = []) {
  const pts = track.pts;
  const n = pts.length;
  const total = cum[n];
  const cornerIdx = new Map(track.corners.map((c) => [c.number, track.nearestIndex(c.x, c.y)]));
  const idxAt = (dist) => {
    const d = ((dist % total) + total) % total;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    return lo;
  };
  const at = (p) => {
    if (!p || !cornerIdx.has(p.turn)) return null;
    return idxAt(cum[cornerIdx.get(p.turn)] + p.dir * p.m * M);
  };
  const distFwd = (i, j) => { const d = cum[j] - cum[i]; return d >= 0 ? d : d + total; };
  const corners = [...cornerIdx.values()];
  const zones = [];
  const marks = official.marks || null;
  for (const z of official.zones || []) {
    const from = at(z.normal) ?? at(z.low);
    if (from === null) continue;
    let end = from;
    const hasTelemetry = frac.some((v) => v > 0);
    // Bande du plan qui contient le début de la zone, ou qui commence dans les 300 m qui suivent
    const run = marks?.runs?.find((r) => distFwd(r.from, from) <= distFwd(r.from, r.to) || distFwd(from, r.from) < 300 * M);
    if (run) end = run.to;
    else if (hasTelemetry) {
      // Fin : là où les voitures cessent d'être à fond (au moins 60 m d'affilée : un léger
      // lever de pied dans un virage rapide ne termine pas la zone), 2,5 km au plus
      let lowSince = null;
      for (let j = (from + 1) % n, g = 0; g < n && distFwd(from, j) < 2500 * M; j = (j + 1) % n, g++) {
        if (frac[j] >= 0.5) { end = j; lowSince = null; continue; }
        lowSince ??= j;
        if (distFwd(lowSince, j) > 60 * M && distFwd(from, j) > 80 * M) break;
      }
      // Ligne droite estimée qui commence juste après (ou contient le départ) : jusqu'à sa fin
      for (const ez of estimated) {
        const starts = distFwd(from, ez.from) < 400 * M || distFwd(ez.from, from) <= distFwd(ez.from, ez.to);
        if (starts && distFwd(from, ez.to) > distFwd(from, end) && distFwd(from, ez.to) < 2500 * M) end = ez.to;
      }
    } else {
      const next = corners.map((c) => distFwd(from, c)).filter((d) => d > 100 * M).sort((a, b) => a - b)[0] ?? 1000 * M;
      end = idxAt(cum[from] + next - 60 * M);
    }
    zones.push({ name: z.name, from, to: end, length: Math.round(distFwd(from, end) / M), lowFrom: at(z.low), text: z.normal?.text || z.low?.text || '' });
  }
  const point = (p, drawn) => { const idx = drawn ?? at(p); return idx === null ? null : { idx, text: p?.text || '' }; };
  return { v: 3, official: true, source: official.source, zones, detection: point(official.detection, marks?.detection), activation: point(official.activation, marks?.activation),
    drawing: marks ? { err: marks.err } : false };   // plan FIA lu (écart moyen du recalage, en m) ou non
}

// Voie des stands : moyenne des passages des voitures (rééchantillonnés le long de leur
// chemin), en écartant ceux dont la longueur s'éloigne de la médiane (arrêt atypique, GPS).
export function pitLanePath(passes, n = 80) {
  const resample = (pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = cum.at(-1);
    if (!(L > 0)) return null;
    const out = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const target = (L * k) / (n - 1);
      while (j < pts.length - 2 && cum[j + 1] < target) j++;
      const u = cum[j + 1] > cum[j] ? (target - cum[j]) / (cum[j + 1] - cum[j]) : 0;
      out.push([pts[j].x + (pts[j + 1].x - pts[j].x) * u, pts[j].y + (pts[j + 1].y - pts[j].y) * u]);
    }
    return { L, out };
  };
  const rs = passes.filter((p) => p.length >= 6).map(resample).filter(Boolean);
  if (rs.length < 2) return null;
  const lens = rs.map((r) => r.L).sort((a, b) => a - b);
  const med = lens[lens.length >> 1];
  const keep = rs.filter((r) => Math.abs(r.L - med) <= med * 0.2);
  if (keep.length < 2 || med < 150 * M || med > 1500 * M) return null;
  const path = [];
  for (let k = 0; k < n; k++) {
    const xs = keep.map((r) => r.out[k][0]).sort((a, b) => a - b), ys = keep.map((r) => r.out[k][1]).sort((a, b) => a - b);
    path.push([Math.round(xs[xs.length >> 1]), Math.round(ys[ys.length >> 1])]);
  }
  return { path, length: Math.round(med / M), samples: keep.length };
}
