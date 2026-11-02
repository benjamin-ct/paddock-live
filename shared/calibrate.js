// Calibration des boucles de chronométrage d'un circuit.
// À partir d'une session où le GPS est disponible (archive officielle), on mesure où se trouve
// chaque fin de mini-secteur et de secteur sur le tracé. En live sans GPS, les positions
// estimées s'appuient ensuite sur ces vrais emplacements au lieu d'une répartition uniforme.
import { parseUtc } from './f1.js';

function forEachEntry(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) obj.forEach((v, i) => v !== undefined && fn(i, v));
  else for (const k of Object.keys(obj)) fn(Number(k), obj[k]);
}

// Médiane circulaire (valeurs dans [0, L)).
function circularMedian(values, L) {
  const ref = values[0];
  const unwrapped = values.map((v) => {
    let d = v - ref;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return ref + d;
  }).sort((a, b) => a - b);
  const m = unwrapped[Math.floor(unwrapped.length / 2)];
  return ((m % L) + L) % L;
}

// Conversion heure F1 (UTC, ms) -> offset d'archive, par minimum glissant sur les Heartbeat
// (l'horloge des archives peut faire des sauts). Renvoie null sans Heartbeat.
export function archiveClock(events) {
  const hbs = events.filter((e) => e.topic === 'Heartbeat' && e.data?.Utc)
    .map((e) => ({ utc: parseUtc(e.data.Utc), d: e.off - parseUtc(e.data.Utc) }))
    .filter((h) => Number.isFinite(h.utc)).sort((a, b) => a.utc - b.utc);
  if (!hbs.length) return null;
  const smooth = hbs.map((h, i) => {
    let m = Infinity;
    for (let k = Math.max(0, i - 4); k <= Math.min(hbs.length - 1, i + 4); k++) m = Math.min(m, hbs[k].d);
    return { utc: h.utc, d: m };
  });
  return (utc) => {
    let lo = 0, hi = smooth.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (smooth[mid].utc <= utc) lo = mid; else hi = mid;
    }
    const h = Math.abs(smooth[lo].utc - utc) <= Math.abs(smooth[hi].utc - utc) ? smooth[lo] : smooth[hi];
    return utc + h.d;
  };
}

/**
 * @param track   instance de Track
 * @param events  [{off, topic, data}] triés : TimingData et Heartbeat
 * @param positions [{off, data}] messages Position décompressés
 * @returns {{L, segs: Object<string, number>, sectors: number[], samples: number}}
 */
export function calibrateLoops(track, events, positions) {
  const L = track.L;
  const toOff = archiveClock(events);
  if (!toOff) return null;

  const samples = new Map(); // num -> [{off, r}]
  const hints = new Map();
  for (const msg of positions) {
    for (const snap of msg.data?.Position || []) {
      const off = toOff(parseUtc(snap.Timestamp));
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (e.X === 0 && e.Y === 0)) continue;
        const proj = track.project(e.X, e.Y, hints.get(num) ?? -1);
        hints.set(num, proj.i);
        if (proj.d2 > 300 ** 2) continue; // hors du tracé (voie des stands, garage)
        let arr = samples.get(num);
        if (!arr) samples.set(num, (arr = []));
        if (!arr.length || off > arr[arr.length - 1].off) arr.push({ off, r: proj.r });
      }
    }
  }

  const rAt = (num, off) => {
    const arr = samples.get(num);
    if (!arr || arr.length < 2) return null;
    let lo = 0, hi = arr.length - 1;
    if (off < arr[0].off || off > arr[hi].off) return null;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].off <= off) lo = mid; else hi = mid;
    }
    const a = arr[lo], b = arr[hi];
    if (b.off - a.off > 2000) return null;
    let dr = b.r - a.r;
    if (dr < -L / 2) dr += L;
    if (dr > L / 2) dr -= L;
    const u = (off - a.off) / (b.off - a.off || 1);
    return (((a.r + dr * u) % L) + L) % L;
  };

  const found = {};
  const add = (key, r) => { if (r !== null) (found[key] ||= []).push(r); };
  const pit = {};
  for (const e of events) {
    if (e.topic !== 'TimingData' || !e.data?.Lines) continue;
    for (const [num, upd] of Object.entries(e.data.Lines)) {
      if (!upd || typeof upd !== 'object') continue;
      if (upd.InPit !== undefined) pit[num] = upd.InPit;
      if (upd.PitOut) pit[num] = true;
      if (upd.PitOut === false && !upd.InPit) pit[num] = false;
      if (pit[num]) continue;
      forEachEntry(upd.Sectors, (i, s) => {
        if (!s || typeof s !== 'object' || i > 2) return;
        forEachEntry(s.Segments, (j, seg) => {
          if (seg?.Status && seg.Status !== 2064) add(`${i}-${j}`, rAt(num, e.off));
        });
        if (s.Value && i < 2) add(`S${i}`, rAt(num, e.off));
      });
      if (upd.NumberOfLaps !== undefined) add('LINE', rAt(num, e.off));
    }
  }

  const segs = {};
  const spread = {};
  let total = 0;
  for (const [key, vals] of Object.entries(found)) {
    if (vals.length < 5) continue;
    const med = circularMedian(vals, L);
    const dev = vals.map((v) => { let d = Math.abs(v - med) % L; return Math.min(d, L - d); }).sort((a, b) => a - b);
    const mad = dev[Math.floor(dev.length / 2)];
    spread[key] = mad / L;
    // Boucle mal localisée (mises à jour groupées, retard du flux) : ignorée.
    if (mad / L > (globalThis.__CAL_MAX_SPREAD ?? 0.01)) continue;
    segs[key] = med / L;
    total += vals.length;
  }
  if (!Object.keys(segs).length) return null;
  return {
    L,
    segs,
    sectors: [0, segs.S0 ?? null, segs.S1 ?? null, 1],
    line: segs.LINE ?? 0,
    samples: total,
    spread,
  };
}

/**
 * Reconstruit le tracé d'un circuit absent de la base MultiViewer à partir du GPS d'une session :
 * on prend le tour chronométré le plus rapide et les positions de ce pilote pendant ce tour.
 * @returns données au format MultiViewer ({x, y, trackPositionTime, rotation, …}) ou null
 */
export function buildTrackFromArchive(events, positions) {
  const toOff = archiveClock(events);
  if (!toOff) return null;
  // Fins de tour (changement de NumberOfLaps) par pilote, hors passages aux stands
  const laps = new Map();
  const pit = {};
  for (const e of events) {
    if (e.topic !== 'TimingData' || !e.data?.Lines) continue;
    for (const [num, upd] of Object.entries(e.data.Lines)) {
      if (!upd || typeof upd !== 'object') continue;
      if (upd.InPit !== undefined) pit[num] = upd.InPit;
      if (upd.PitOut) pit[num] = true;
      if (upd.NumberOfLaps !== undefined) {
        if (!laps.has(num)) laps.set(num, []);
        laps.get(num).push({ off: e.off, pit: !!pit[num] });
        if (!upd.InPit) pit[num] = false;
      }
    }
  }
  const cands = [];
  for (const [num, ends] of laps) {
    for (let i = 1; i < ends.length; i++) {
      const d = ends[i].off - ends[i - 1].off;
      if (ends[i].pit || ends[i - 1].pit || d < 40000 || d > 200000) continue;
      cands.push({ num, from: ends[i - 1].off, to: ends[i].off, d });
    }
  }
  // Tour le plus rapide qui a ses positions GPS (le serveur ne garde pas toutes celles d'une longue séance)
  let best = null, pts = [];
  for (const c of cands.sort((a, b) => a.d - b.d).slice(0, 10)) {
    pts = [];
    for (const msg of positions) {
      for (const snap of msg.data?.Position || []) {
        const e = snap.Entries?.[c.num];
        if (!e || (e.X === 0 && e.Y === 0)) continue;
        const off = toOff(parseUtc(snap.Timestamp));
        if (off >= c.from && off <= c.to && (!pts.length || off > pts[pts.length - 1].off)) pts.push({ off, x: e.X, y: e.Y });
      }
    }
    if (pts.length >= 100) { best = c; break; }
  }
  if (!best) return null;
  // Orientation : rotation (pas de 5°) qui donne le cadre le plus compact, en format paysage.
  let rotation = 0, bestArea = Infinity;
  for (let r = 0; r < 180; r += 5) {
    const a = (r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c;
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (ry < y0) y0 = ry; if (ry > y1) y1 = ry;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea) { bestArea = area; rotation = (x1 - x0) >= (y1 - y0) ? r : r + 90; }
  }
  return {
    x: pts.map((p) => p.x),
    y: pts.map((p) => p.y),
    trackPositionTime: pts.map((p) => (p.off - best.from) / 1000),
    rotation,
    candidateLap: { driverNumber: best.num, lapTime: best.d / 1000 },
    corners: [],
    marshalSectors: [],
    generated: true,
  };
}
