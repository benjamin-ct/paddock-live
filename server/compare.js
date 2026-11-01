// Comparaison des meilleurs tours de deux pilotes : secteurs officiels et mini-secteurs.
// Les temps des mini-secteurs ne sont pas publiés par la F1 : on les mesure avec le GPS
// (passage de chaque voiture aux boucles de chronométrage, dont l'emplacement sur le tracé
// est calibré pour la carte), puis on les recale sur le temps officiel du tour.
// Tout est calculé à la date demandée par le navigateur (son délai TV) : aucun spoiler.
import zlib from 'node:zlib';
import { Track } from '../shared/track.js';
import { applyEvent, createDerived } from '../shared/derive.js';
import { parseUtc, parseLapTime } from '../shared/f1.js';
import { circuit, loops } from './circuits.js';

const MAX_GAP_MS = 2000;       // trou de GPS au-delà duquel la trajectoire est coupée
const OFF_TRACK2 = 300 ** 2;   // voie des stands, garage : hors du tracé

// Positions GPS décodées par pilote (cache par génération du hub) : { utc: [], x: [], y: [] }
let cache = { gen: -1, seen: new WeakSet(), cars: new Map() };

function decodePositions(hub) {
  if (cache.gen !== hub.gen) cache = { gen: hub.gen, seen: new WeakSet(), cars: new Map() };
  const items = [...(hub.posArchive || []), ...hub.stream].filter((s) => s.topic === 'Position' && !cache.seen.has(s));
  for (const s of items) {
    cache.seen.add(s);
    let msg;
    try { msg = JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')); } catch { continue; }
    for (const snap of msg?.Position || []) {
      const utc = parseUtc(snap.Timestamp);
      if (!Number.isFinite(utc)) continue;
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (e.X === 0 && e.Y === 0)) continue;
        let c = cache.cars.get(num);
        if (!c) cache.cars.set(num, (c = { utc: [], x: [], y: [] }));
        if (c.utc.length && utc <= c.utc[c.utc.length - 1]) continue;
        c.utc.push(utc); c.x.push(e.X); c.y.push(e.Y);
      }
    }
  }
  return cache.cars;
}

// Télémétrie décodée par pilote (cache par génération du hub) : { utc, v (km/h), g (rapport), th, br (%), rpm }
let telCache = { gen: -1, seen: new WeakSet(), cars: new Map() };

function decodeCarData(hub) {
  if (telCache.gen !== hub.gen) telCache = { gen: hub.gen, seen: new WeakSet(), cars: new Map() };
  const items = [...(hub.posArchive || []), ...hub.stream].filter((s) => s.topic === 'CarData' && !telCache.seen.has(s));
  for (const s of items) {
    telCache.seen.add(s);
    let msg;
    try { msg = JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')); } catch { continue; }
    for (const e of msg?.Entries || []) {
      const utc = parseUtc(e.Utc);
      if (!Number.isFinite(utc)) continue;
      for (const [num, car] of Object.entries(e.Cars || {})) {
        const ch = car?.Channels;
        if (!ch) continue;
        let c = telCache.cars.get(num);
        if (!c) telCache.cars.set(num, (c = { utc: [], v: [], g: [], th: [], br: [], rpm: [] }));
        if (c.utc.length && utc <= c.utc[c.utc.length - 1]) continue;
        // Valeurs > 100 sur l'accélérateur et le frein : donnée invalide (voiture à l'arrêt, capteur)
        const pct = (v) => (typeof v === 'number' && v >= 0 && v <= 100 ? v : null);
        c.utc.push(utc); c.v.push(ch['2'] ?? null); c.g.push(ch['3'] ?? null); c.th.push(pct(ch['4'])); c.br.push(pct(ch['5'])); c.rpm.push(ch['0'] ?? null);
      }
    }
  }
  return telCache.cars;
}

// Indice de l'échantillon de télémétrie le plus proche de utc (à moins de 600 ms), sinon -1
function telIndex(c, utc) {
  let lo = 0, hi = c.utc.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (c.utc[mid] < utc) lo = mid + 1; else hi = mid; }
  const j = lo > 0 && Math.abs(c.utc[lo - 1] - utc) < Math.abs(c.utc[lo] - utc) ? lo - 1 : lo;
  return Math.abs(c.utc[j] - utc) < 600 ? j : -1;
}

// Heure locale de réception - heure F1, d'après les Heartbeat reçus jusqu'à `until`
function clockOffset(events, until) {
  let best = null;
  for (const e of events) {
    if (e.t > until) break;
    if (e.topic !== 'Heartbeat' || !e.data?.Utc) continue;
    const off = e.t - parseUtc(e.data.Utc);
    if (Number.isFinite(off) && (best === null || off < best)) best = off;
  }
  return best;
}

// Trajectoire d'un pilote en « tours parcourus depuis la ligne » (continue par morceaux)
function progressRuns(car, track, line, untilUtc) {
  const L = track.L;
  const runs = [];
  let run = null, hint = -1, prevRaw = null, prog = 0, prevUtc = -Infinity;
  for (let i = 0; i < car.utc.length && car.utc[i] <= untilUtc + 5000; i++) {
    const p = track.project(car.x[i], car.y[i], hint);
    hint = p.i ?? hint;
    if (p.d2 > OFF_TRACK2) { run = null; continue; }
    const raw = (((p.r / L - line) % 1) + 1) % 1;
    if (!run || car.utc[i] - prevUtc > MAX_GAP_MS) {
      run = { utc: [], p: [] };
      runs.push(run);
      prog = raw;
    } else {
      let d = raw - prevRaw;
      if (d < -0.5) d += 1;
      if (d > 0.5) d -= 1;
      prog += d;
    }
    run.utc.push(car.utc[i]);
    run.p.push(prog);
    prevRaw = raw;
    prevUtc = car.utc[i];
  }
  return runs;
}

// Heure (UTC) où la trajectoire atteint la progression P (interpolation linéaire)
function timeAt(run, P) {
  const { p, utc } = run;
  for (let i = 1; i < p.length; i++) {
    if (p[i - 1] <= P && p[i] >= P) {
      if (utc[i] - utc[i - 1] > MAX_GAP_MS) return null;
      const u = (P - p[i - 1]) / (p[i] - p[i - 1] || 1);
      return utc[i - 1] + u * (utc[i] - utc[i - 1]);
    }
  }
  return null;
}

// Mini-secteurs : fin de chaque boucle de chronométrage, en fraction de tour depuis la ligne.
// segCounts : nombre officiel de mini-secteurs par secteur. Les boucles mal localisées par la
// calibration sont placées par interpolation entre les boucles connues (approx = true).
export function miniSectors(loopData, segCounts) {
  if (!loopData?.segs) return [];
  const line = loopData.line ?? 0;
  const qOf = (k) => {
    const f = loopData.segs[k];
    if (f === undefined || f === null) return null;
    const q = (((f - line) % 1) + 1) % 1;
    return q < 0.01 ? 1 : q;
  };
  const bounds = [0, qOf('S0'), qOf('S1'), 1];
  if (bounds[1] === null || bounds[2] === null || !(bounds[1] < bounds[2])) {
    // Sans fin de secteur connue : uniquement les boucles localisées
    let from = 0;
    return Object.keys(loopData.segs).filter((k) => /^\d-\d+$/.test(k))
      .map((k) => { const [si, j] = k.split('-').map(Number); return { sector: si, name: `${si + 1}.${j + 1}`, q: qOf(k), approx: false }; })
      .sort((x, y) => x.q - y.q).filter((m) => m.q - from > 0.002 && ((from = m.q), true))
      .map((m, i, arr) => ({ ...m, from: i ? arr[i - 1].q : 0, to: m.q }));
  }
  const out = [];
  for (let si = 0; si < 3; si++) {
    const n = segCounts?.[si] || 0;
    if (!n) { out.push({ sector: si, name: `S${si + 1}`, from: bounds[si], to: bounds[si + 1], approx: true }); continue; }
    // Points d'ancrage (index, q) : début et fin du secteur + boucles connues de ce secteur
    const anchors = [[0, bounds[si]], [n, bounds[si + 1]]];
    for (let j = 0; j < n - 1; j++) {
      const q = qOf(`${si}-${j}`);
      if (q !== null && q > bounds[si] && q < bounds[si + 1]) anchors.push([j + 1, q]);
    }
    anchors.sort((x, y) => x[0] - y[0]);
    const at = (idx) => {
      const hit = anchors.find((x) => x[0] === idx);
      if (hit) return { q: hit[1], approx: false };
      const lo = [...anchors].reverse().find((x) => x[0] < idx), hi = anchors.find((x) => x[0] > idx);
      return { q: lo[1] + ((idx - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]), approx: true };
    };
    let from = bounds[si];
    for (let j = 0; j < n; j++) {
      const end = at(j + 1);
      if (end.q <= from) continue;
      out.push({ sector: si, name: `${si + 1}.${j + 1}`, from, to: end.q, approx: end.approx });
      from = end.q;
    }
  }
  return out;
}

// Meilleur tour d'un pilote retrouvé dans le GPS : deux passages de ligne séparés du temps officiel
// endUtc (facultatif) : heure de fin du tour cherché ; le passage sur la ligne doit y correspondre
function findLapRun(runs, lapTime, untilUtc, endUtc = null) {
  let best = null;
  for (const run of runs) {
    if (run.p.length < 10) continue;
    for (let n = Math.ceil(run.p[0]); n + 1 <= run.p.at(-1); n++) {
      const t0 = timeAt(run, n), t1 = timeAt(run, n + 1);
      if (t0 === null || t1 === null || t1 > untilUtc) continue;
      if (endUtc !== null && Math.abs(t1 - endUtc) > 6000) continue;
      const err = Math.abs((t1 - t0) / 1000 - lapTime) + (endUtc !== null ? Math.abs(t1 - endUtc) / 20000 : 0);
      if (err < 0.8 && (!best || err < best.err)) best = { run, n, t0, t1, err };
    }
  }
  return best;
}

function bestLap(state, derived, num) {
  const line = state.TimingData?.Lines?.[num];
  const raw = line?.BestLapTime?.Value;
  const time = parseLapTime(raw);
  if (!time) return null;
  const entry = (derived.laps[num] || []).find((l) => parseLapTime(l.time) === time);
  const s = entry?.s?.map((v) => parseLapTime(v)) || [null, null, null];
  return { time, lap: Number(line.BestLapTime.Lap) || entry?.lap || null, sectors: s, best: true, endT: entry?.t ?? null };
}

// Tour précis d'un pilote (numéro de tour), sinon son meilleur tour
function pickLap(state, derived, num, lapNo) {
  if (!lapNo) return bestLap(state, derived, num);
  const entry = (derived.laps[num] || []).find((l) => Number(l.lap) === Number(lapNo));
  const time = parseLapTime(entry?.time);
  if (!time) return null;
  const best = bestLap(state, derived, num);
  return { time, lap: Number(entry.lap), sectors: entry.s?.map((v) => parseLapTime(v)) || [null, null, null], best: !!best && best.time === time, endT: entry.t ?? null };
}

/**
 * @param hub  Hub (événements et flux GPS horodatés)
 * @param a, b numéros des pilotes
 * @param until heure locale : rien après (délai TV du navigateur)
 */
export async function compareLaps(hub, { a, b, until, la = null, lb = null }) {
  const state = {};
  const derived = createDerived();
  for (const e of hub.events) {
    if (e.t > until) break;
    applyEvent(state, derived, e.topic, e.data, e.t);
  }
  const dl = state.DriverList || {};
  const stats = state.TimingStats?.Lines || {};
  const who = (num, lapNo) => {
    const d = dl[num] || {};
    const lap = pickLap(state, derived, num, lapNo);
    const sp = stats[num]?.BestSpeeds || {};
    const speeds = Object.fromEntries(['I1', 'I2', 'FL', 'ST'].map((k) => [k, Number(sp[k]?.Value) || null]));
    return { num, tla: d.Tla || num, name: d.FullName || d.BroadcastName || num, team: d.TeamName || '', color: d.TeamColour || '', lap, speeds };
  };
  const out = { a: who(a, la), b: who(b, lb), gps: false, minis: [], track: null, reason: null };
  if (!out.a.lap || !out.b.lap) { out.reason = 'Pas encore de tour chronométré pour l\'un des deux pilotes.'; return out; }

  const info = state.SessionInfo;
  const key = info?.Meeting?.Circuit?.Key;
  const year = Number(String(info?.StartDate || '').slice(0, 4)) || new Date().getFullYear();
  if (!key || !hub.hasPositions) { out.reason = 'Mini-secteurs : positions GPS indisponibles (compte F1 TV nécessaire en direct).'; return out; }
  const [cdata, ldata] = await Promise.all([circuit(key, year), loops(key, year).catch(() => null)]);
  // Nombre officiel de mini-secteurs par secteur (le plus fréquent parmi les pilotes)
  const segCounts = [0, 1, 2].map((si) => {
    const tally = new Map();
    for (const l of Object.values(state.TimingData?.Lines || {})) {
      const segs = l?.Sectors?.[si]?.Segments;
      const c = segs ? (Array.isArray(segs) ? segs.length : Object.keys(segs).length) : 0;
      if (c) tally.set(c, (tally.get(c) || 0) + 1);
    }
    return [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 0;
  });
  const minis = miniSectors(ldata, segCounts);
  if (!cdata || !minis.length) { out.reason = 'Mini-secteurs : emplacement des boucles de chronométrage inconnu pour ce circuit.'; return out; }
  const track = new Track(cdata);
  const offset = clockOffset(hub.events, until);
  if (offset === null) { out.reason = 'Mini-secteurs : horloge du flux indisponible.'; return out; }
  const untilUtc = until - offset;
  const cars = decodePositions(hub);
  const laps = {};

  for (const side of ['a', 'b']) {
    const d = out[side];
    const car = cars.get(String(d.num));
    if (!car) { out.reason = `Pas de GPS pour ${d.tla}.`; return out; }
    const endUtc = d.lap.endT != null ? d.lap.endT - offset : null;
    const runs = progressRuns(car, track, ldata.line ?? 0, untilUtc);
    const found = findLapRun(runs, d.lap.time, untilUtc, endUtc) || (d.lap.best ? findLapRun(runs, d.lap.time, untilUtc) : null);
    if (!found) { out.reason = `Tour ${d.lap.lap || ''} de ${d.tla} introuvable dans le GPS.`; return out; }
    laps[side] = found;
    const raw = [];
    let prev = found.t0;
    for (const m of minis) {
      const t = m.to >= 1 ? found.t1 : timeAt(found.run, found.n + m.to);
      if (t === null) { out.reason = `GPS incomplet sur le tour de ${d.tla}.`; return out; }
      raw.push((t - prev) / 1000);
      prev = t;
    }
    // Recalage sur les temps officiels : par secteur si connus, sinon sur le tour
    const sectors = d.lap.sectors;
    const bySector = sectors.every((v) => v > 0) && [0, 1, 2].every((si) => minis.some((m) => m.sector === si));
    const scale = (i) => {
      if (!bySector) return d.lap.time / ((found.t1 - found.t0) / 1000);
      const si = minis[i].sector;
      const sum = minis.reduce((t, m, k) => t + (m.sector === si ? raw[k] : 0), 0);
      return sectors[si] / (sum || 1);
    };
    const times = raw.map((v, i) => Math.round(v * scale(i) * 1000) / 1000);
    d.mini = times;
  }

  // Tracé de chaque mini-secteur (coordonnées écran, orientées comme la carte)
  const ang = (track.rotation * Math.PI) / 180, cos = Math.cos(ang), sin = Math.sin(ang);
  const line = ldata.line ?? 0;
  const pt = (q) => {
    const p = track.pointAt((((line + q) % 1) + 1) % 1 * track.L);
    return [Math.round(p.x * cos - p.y * sin), Math.round(-(p.x * sin + p.y * cos))];
  };
  out.minis = minis.map((m) => {
    const pts = [];
    const steps = Math.max(3, Math.ceil((m.to - m.from) / 0.004));
    for (let i = 0; i <= steps; i++) pts.push(pt(m.from + ((m.to - m.from) * i) / steps));
    return { name: m.name, sector: m.sector, from: m.from, to: m.to, approx: !!m.approx, pts };
  });
  out.gps = true;
  out.trace = lapTraces(hub, out, laps, track, line);
  return out;
}

// Comparaison de télémétrie : pour chaque tour, K+1 points répartis sur la distance du tour (fraction q depuis la
// ligne) : temps écoulé (recalé sur le temps officiel), et si la F1 envoie la télémétrie, vitesse, rapport,
// accélérateur, frein et régime. Avec la position des virages (fraction du tour) et la longueur du tour (m).
const K = 400;
export function lapTraces(hub, out, laps, track, line) {
  const tel = hub.hasCarData ? decodeCarData(hub) : null;
  const side = (d, found) => {
    const k = d.lap.time / ((found.t1 - found.t0) / 1000), c = tel?.get(String(d.num));
    const r = { t: [], v: [], g: [], th: [], br: [], rpm: [] };
    let n = 0;
    for (let i = 0; i <= K; i++) {
      const t = i === K ? found.t1 : i === 0 ? found.t0 : timeAt(found.run, found.n + i / K);
      const j = t !== null && c ? telIndex(c, t) : -1;
      if (j >= 0) n++;
      r.t.push(t === null ? null : Math.round(((t - found.t0) / 1000) * k * 1000) / 1000);
      for (const ch of ['v', 'g', 'th', 'br', 'rpm']) r[ch].push(j >= 0 ? c[ch][j] : null);
    }
    r.tel = n > K * 0.8;   // télémétrie sur presque tout le tour
    return r;
  };
  const a = side(out.a, laps.a), b = side(out.b, laps.b);
  const corners = track.corners.map((c) => {
    const p = track.project(c.x, c.y, -1);
    return { n: c.number, q: Math.round(((((p.r / track.L - line) % 1) + 1) % 1) * 10000) / 10000 };
  }).sort((x, y) => x.q - y.q);
  // Longueur du tour (m) : vitesse intégrée sur le temps (les coordonnées du tracé n'ont pas d'échelle fiable)
  let len = 0;
  for (let i = 0; i < K; i++) if (a.v[i] !== null && a.v[i + 1] !== null && a.t[i] !== null && a.t[i + 1] !== null) len += ((a.v[i] + a.v[i + 1]) / 7.2) * (a.t[i + 1] - a.t[i]);
  return { K, len: a.tel ? Math.round(len) : null, corners, tel: a.tel && b.tel, a, b };
}
