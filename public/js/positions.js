// Positions des voitures sur la carte.
// - Mode GPS : échantillons Position.z (jeton F1 TV requis en live), interpolés à l'heure affichée.
// - Mode estimé : sans GPS, la position est déduite des passages aux mini-secteurs du chronométrage.
// Chaque voiture a une "progression" (en secondes du tour de référence, tours cumulés) qui sert
// à calculer l'écart en temps réel entre deux pilotes (duel).
import { parseUtc, parseLapTime } from '/shared/f1.js';

const HISTORY_MS = 200000;
const OFFSET_WINDOW = 40;

function forEachEntry(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) obj.forEach((v, i) => v !== undefined && fn(i, v));
  else for (const k of Object.keys(obj)) fn(Number(k), obj[k]);
}

function sampleIndex(arr, t) {
  // dernier index avec arr[i].t <= t
  let lo = 0, hi = arr.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

class OffsetEstimator {
  // Convertit l'horodatage F1 d'un échantillon en heure locale de réception.
  constructor() { this.cands = []; this.value = null; }
  add(c) {
    if (!Number.isFinite(c)) return;
    this.cands.push(c);
    if (this.cands.length > OFFSET_WINDOW) this.cands.shift();
    this.value = Math.min(...this.cands);
  }
}

export class Positions {
  // mapUtc(utc) : heure F1 -> heure locale de réception, via le Heartbeat (null si inconnu).
  // Place GPS et télémétrie sur la même échelle de temps que les chronos (et gère le replay accéléré).
  constructor(mapUtc = () => null, speed = () => 1) {
    this.track = null;
    this.loops = null;
    this.mapUtc = mapUtc;
    this.speed = speed;
    this.reset();
  }

  reset() {
    this.gps = new Map();     // num -> [{t, x, y, p}]
    this.gpsLap = new Map();  // num -> {lapIdx, lastR, hint}
    this.car = new Map();     // num -> [{t, rpm, speed, gear, thr, brk, drs}]
    this.posOffset = new OffsetEstimator();
    this.carOffset = new OffsetEstimator();
    this.est = new Map();     // num -> estimateur (mode sans GPS)
    this.disp = new Map();    // num -> progression lissée affichée (mode estimé)
    this.lastGpsAt = 0;
  }

  setTrack(track) {
    this.track = track;
    // Recalcule la progression des échantillons déjà reçus.
    this.gpsLap.clear();
    for (const [num, arr] of this.gps) for (const s of arr) s.p = this.progressOf(num, s.x, s.y);
    this.est.clear();
    this.disp.clear();
  }

  hasGps(now) {
    return this.gps.size > 0 && now - this.lastGpsAt < 30000;
  }

  // ---- Ingestion ----
  ingestPosition(data, t) {
    const list = data?.Position;
    if (!Array.isArray(list) || !list.length) return;
    const lastTs = parseUtc(list[list.length - 1].Timestamp);
    this.posOffset.add(t - lastTs);
    for (const snap of list) {
      const u = parseUtc(snap.Timestamp);
      const ts = this.mapUtc(u) ?? u + this.posOffset.value;
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (e.X === 0 && e.Y === 0)) continue;
        let arr = this.gps.get(num);
        if (!arr) this.gps.set(num, (arr = []));
        if (arr.length && ts <= arr[arr.length - 1].t) continue;
        arr.push({ t: ts, x: e.X, y: e.Y, off: e.Status === 'OffTrack', p: this.progressOf(num, e.X, e.Y) });
        this.lastGpsAt = Math.max(this.lastGpsAt, t);
      }
    }
    this.trim(this.gps, t);
  }

  ingestCarData(data, t) {
    const list = data?.Entries;
    if (!Array.isArray(list) || !list.length) return;
    this.carOffset.add(t - parseUtc(list[list.length - 1].Utc));
    for (const entry of list) {
      const u = parseUtc(entry.Utc);
      const ts = this.mapUtc(u) ?? u + this.carOffset.value;
      for (const [num, c] of Object.entries(entry.Cars || {})) {
        const ch = c?.Channels;
        if (!ch) continue;
        let arr = this.car.get(num);
        if (!arr) this.car.set(num, (arr = []));
        if (arr.length && ts <= arr[arr.length - 1].t) continue;
        // Les valeurs > 100 (ex. 104) signalent une donnée invalide (voiture à l'arrêt, capteur).
        const pct = (v) => (typeof v === 'number' && v <= 100 ? v : null);
        arr.push({ t: ts, rpm: ch['0'], speed: ch['2'], gear: ch['3'], thr: pct(ch['4']), brk: pct(ch['5']), drs: ch['45'] });
      }
    }
    this.trim(this.car, t);
  }

  trim(map, t) {
    for (const arr of map.values()) {
      if (arr.length > 50 && arr[0].t < t - HISTORY_MS - 10000) {
        const cut = sampleIndex(arr, t - HISTORY_MS);
        if (cut > 0) arr.splice(0, cut);
      }
    }
  }

  // Progression cumulée (tours * L + r) à partir d'une position GPS.
  progressOf(num, x, y) {
    const tr = this.track;
    if (!tr) return null;
    let st = this.gpsLap.get(num);
    const proj = tr.project(x, y, st ? st.hint : -1);
    if (proj.d2 > 1500 ** 2) return null; // trop loin du tracé (garage, erreur)
    if (!st) {
      st = { lapIdx: 0, lastR: proj.r, hint: proj.i };
      this.gpsLap.set(num, st);
    } else {
      if (proj.r < st.lastR - tr.L / 2) st.lapIdx++;
      else if (proj.r > st.lastR + tr.L / 2) st.lapIdx--;
      st.lastR = proj.r;
      st.hint = proj.i;
    }
    return st.lapIdx * tr.L + proj.r;
  }

  // ---- Chronométrage : recalage des tours (GPS) et ancrages (mode estimé) ----
  onTiming(state, data, t) {
    if (!this.track || !data?.Lines) return;
    const lines = state.TimingData?.Lines || {};
    for (const [num, upd] of Object.entries(data.Lines)) {
      if (!upd || typeof upd !== 'object') continue;
      const line = lines[num];
      if (!line) continue;
      if (upd.NumberOfLaps !== undefined) this.realignGpsLap(num, upd.NumberOfLaps, t);
      this.estimateFromTiming(state, num, upd, line, t);
    }
  }

  realignGpsLap(num, laps, t) {
    const arr = this.gps.get(num);
    const st = this.gpsLap.get(num);
    if (!arr || !arr.length || !st || !this.track) return;
    const i = sampleIndex(arr, t);
    const s = arr[Math.max(0, i)];
    if (s.p === null) return;
    const L = this.track.L;
    // Progression mesurée depuis la ligne de chronométrage (pas le début du tracé).
    const pl = s.p - this.lineFrac() * L;
    const r = pl - Math.floor(pl / L) * L;
    const sampleLap = Math.floor(pl / L);
    const expected = r < L / 2 ? laps : laps - 1;
    const diff = expected - sampleLap;
    if (diff === 0) return;
    for (const x of arr) if (x.p !== null) x.p += diff * L;
    st.lapIdx += diff;
  }

  sectorFractions(state) {
    const now = Date.now();
    if (this._fb && now - this._fbAt < 10000) return this._fb;
    const best = [Infinity, Infinity, Infinity];
    const statLines = state.TimingStats?.Lines || {};
    for (const l of Object.values(statLines)) {
      forEachEntry(l?.BestSectors, (i, s) => {
        const v = parseLapTime(s?.Value);
        if (v && i < 3 && v < best[i]) best[i] = v;
      });
    }
    let fb = [0, 1 / 3, 2 / 3, 1];
    if (best.every(Number.isFinite)) {
      const sum = best[0] + best[1] + best[2];
      fb = [0, best[0] / sum, (best[0] + best[1]) / sum, 1];
    }
    this._fb = fb;
    this._fbAt = now;
    return fb;
  }

  // Boucles de chronométrage calibrées (voir shared/calibrate.js) : emplacement réel
  // de chaque fin de mini-secteur sur le tracé.
  setLoops(loops) {
    this.loops = loops && loops.segs ? loops : null;
  }

  lineFrac() {
    return this.loops?.line ?? 0;
  }

  // q : fraction du tour depuis la ligne (0 = ligne) -> fraction du tracé.
  loopQ(key, fallback) {
    const f = this.loops?.segs?.[key];
    if (f === undefined || f === null) return fallback;
    return (((f - this.lineFrac()) % 1) + 1) % 1;
  }

  estimateFromTiming(state, num, upd, line, t) {
    const L = this.track.L;
    let est = this.est.get(num);
    if (!est) this.est.set(num, (est = { p0: null, t0: 0, rate: 0.97, cap: Infinity }));

    const last = parseLapTime(line.LastLapTime?.Value) || parseLapTime(line.BestLapTime?.Value);
    if (last) est.rate = Math.max(0.3, Math.min(1.2, L / last));

    const fb = this.sectorFractions(state);
    let bestQ = null;
    const consider = (q) => { if (bestQ === null || q > bestQ) bestQ = q; };

    forEachEntry(upd.Sectors, (i, s) => {
      if (!s || typeof s !== 'object' || i > 2) return;
      const segs = line.Sectors?.[i]?.Segments;
      const segCount = segs ? (Array.isArray(segs) ? segs.length : Object.keys(segs).length) : 0;
      forEachEntry(s.Segments, (j, seg) => {
        if (seg?.Status && seg.Status !== 2064 && segCount) {
          consider(this.loopQ(`${i}-${j}`, fb[i] + ((j + 1) / segCount) * (fb[i + 1] - fb[i])));
        }
      });
      if (s.Value && i < 2) consider(this.loopQ(`S${i}`, fb[i + 1]));
    });

    let q = bestQ;
    if (upd.NumberOfLaps !== undefined && (q === null || q >= 0.97)) q = 0;
    if (q === null) return;
    if (q >= 0.97) q = 0;

    const frac = this.lineFrac() + q; // position sur le tracé (peut dépasser 1)
    const lapsDone = Number(line.NumberOfLaps) || 0;
    let p;
    if (est.p0 === null) {
      p = lapsDone * L + frac * L;
      if (upd.NumberOfLaps === undefined && q === 0) p += L;
    } else {
      const cur = this.estimatedProgress(num, t);
      const k = Math.round((cur - frac * L) / L);
      p = k * L + frac * L;
    }
    est.p0 = p;
    est.t0 = t;
    est.cap = p + (this.loops ? 0.08 : 0.12) * L;
  }

  estimatedProgress(num, now) {
    const est = this.est.get(num);
    if (!est || est.p0 === null) return null;
    return Math.min(est.cap, est.p0 + ((now - est.t0) / 1000) * est.rate * this.speed());
  }

  // ---- Lecture ----
  gpsAt(num, now) {
    const arr = this.gps.get(num);
    if (!arr || !arr.length) return null;
    const i = sampleIndex(arr, now);
    if (i < 0) return null;
    const a = arr[i];
    if (now - a.t > 8000) return null; // données trop anciennes
    const b = arr[i + 1];
    if (!b) {
      // Échantillon suivant pas encore reçu (délai très court) : extrapolation le long du tracé.
      const prev = arr[i - 1];
      if (this.track && prev && a.p !== null && prev.p !== null && now - a.t < 4000 && a.t > prev.t) {
        const v = (a.p - prev.p) / (a.t - prev.t);
        if (v > 0 && v < 0.002) {
          const pt = this.track.pointAt(a.p + v * (now - a.t));
          return { x: pt.x, y: pt.y, off: a.off };
        }
      }
      return { x: a.x, y: a.y, off: a.off };
    }
    const u = (now - a.t) / (b.t - a.t || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, off: a.off };
  }

  progressAt(num, now) {
    const arr = this.gps.get(num);
    if (!arr || !arr.length) return null;
    const i = sampleIndex(arr, now);
    if (i < 0 || arr[i].p === null) return null;
    const a = arr[i], b = arr[i + 1];
    if (!b || b.p === null) return a.p;
    const u = (now - a.t) / (b.t - a.t || 1);
    return a.p + (b.p - a.p) * u;
  }

  // Position estimée lissée (x, y) pour l'affichage sans GPS.
  estimatedXY(num, now, dt) {
    const target = this.estimatedProgress(num, now);
    if (target === null || !this.track) return null;
    let d = this.disp.get(num);
    if (d === undefined || Math.abs(target - d) > 0.15 * this.track.L) d = target;
    else d += (target - d) * Math.min(1, dt * 3);
    this.disp.set(num, d);
    return this.track.pointAt(d);
  }

  // Écart en temps réel entre deux voitures (GPS) : temps écoulé depuis que la voiture
  // de devant est passée à l'endroit où se trouve celle de derrière.
  liveGap(a, b, now) {
    if (!this.track) return null;
    const la = this.gps.get(a), lb = this.gps.get(b);
    if (!la?.length || !lb?.length) return null;
    // On se place au dernier instant couvert par les deux voitures (pas d'extrapolation).
    now = Math.min(now, la[la.length - 1].t, lb[lb.length - 1].t);
    const pa = this.progressAt(a, now), pb = this.progressAt(b, now);
    if (pa === null || pb === null) return null;
    const L = this.track.L;
    const aheadIsA = pa >= pb;
    const ahead = aheadIsA ? a : b;
    const pAhead = aheadIsA ? pa : pb, pBehind = aheadIsA ? pb : pa;
    const laps = Math.floor((pAhead - pBehind) / L);
    const target = pBehind + laps * L;
    const arr = this.gps.get(ahead);
    let i = sampleIndex(arr, now);
    for (; i > 0; i--) {
      const s1 = arr[i], s0 = arr[i - 1];
      if (s0.p === null || s1.p === null) continue;
      if (s0.p <= target && s1.p >= target) {
        const u = (target - s0.p) / (s1.p - s0.p || 1);
        const tt = s0.t + u * (s1.t - s0.t);
        return { ahead, gap: (now - tt) / 1000, laps };
      }
    }
    return null;
  }

  carAt(num, now) {
    const arr = this.car.get(num);
    if (!arr || !arr.length) return null;
    const i = sampleIndex(arr, now);
    if (i < 0 || now - arr[i].t > 10000) return null;
    return arr[i];
  }

  // Télémétrie interpolée entre les deux échantillons qui encadrent l'heure affichée (la F1
  // n'en envoie que 3 à 4 par seconde) : vitesse, régime, accélérateur et frein varient en
  // continu ; le rapport reste celui de l'échantillon précédent.
  carLerp(num, now) {
    const arr = this.car.get(num);
    if (!arr || !arr.length) return null;
    const i = sampleIndex(arr, now);
    if (i < 0 || now - arr[i].t > 10000) return null;
    const a = arr[i], b = arr[i + 1];
    if (!b || b.t - a.t > 2000) return a;
    const u = Math.max(0, Math.min(1, (now - a.t) / (b.t - a.t || 1)));
    const mix = (x, y) => (typeof x === 'number' && typeof y === 'number' ? x + (y - x) * u : x);
    return { t: now, rpm: mix(a.rpm, b.rpm), speed: mix(a.speed, b.speed), gear: a.gear, thr: mix(a.thr, b.thr), brk: mix(a.brk, b.brk), drs: a.drs };
  }

  carHistory(num, from, to) {
    const arr = this.car.get(num);
    if (!arr) return [];
    const i0 = Math.max(0, sampleIndex(arr, from));
    const i1 = sampleIndex(arr, to);
    return arr.slice(i0, i1 + 1);
  }
}
