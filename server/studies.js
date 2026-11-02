// Études de faisabilité (diagnostic des données F1, mode créateur) : sur toute une séance des archives, ce que
// valent les données pour les idées de la 2.0, mesuré plutôt que supposé :
// - rythme du GPS et de la télémétrie (mesures par seconde, trous) et échelle des coordonnées (m par unité) ;
// - trajectoires : écart à la ligne du tracé au point de chaque virage, dispersion d'un tour à l'autre pour un
//   même pilote (bruit) face à l'écart entre pilotes (signal), espacement des points ;
// - freinages : point de freinage avant chaque virage, dispersion d'un tour à l'autre ;
// - usure des pneus (courses) : perte par tour sur chaque relais et bruit autour de la droite ;
// - évolution de la piste (essais, qualifs) : meilleur tour par quart de séance ;
// - départ (courses) : places gagnées entre la grille et le premier virage, d'après le GPS ;
// - choix d'aileron : vitesse de pointe et meilleur tour de chaque écurie.
// Texte du rapport en lignes prêtes à lire (data-no-i18n côté page : outil interne).
import { Track } from '../shared/track.js';
import { applyEvent, createDerived } from '../shared/derive.js';
import { addPositions, addCarData } from '../shared/compare.js';
import { parseUtc, parseLapTime } from '../shared/f1.js';
import { neutralLaps } from '../shared/pits.js';
import { sessionCut } from '../shared/race-stats.js';

const KEEP = new Set(['SessionInfo', 'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages', 'TrackStatus', 'SessionStatus', 'LapCount', 'Heartbeat']);
const OFF_TRACK = 200;   // unités (≈ 20 m) : au-delà, voie des stands ou hors piste

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const quant = (a, q) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
// Dispersion robuste (écart médian absolu × 1,4826 ≈ écart-type sans les valeurs aberrantes)
const spread = (a) => { const m = median(a); return m === null ? null : 1.4826 * median(a.map((v) => Math.abs(v - m))); };
const f = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

export function studyCollector() {
  const events = [], cars = new Map(), tel = new Map(), beats = [];
  let info = null;
  return {
    keyframe(name, data) { if (name === 'SessionInfo') info = data; if (KEEP.has(name)) events.push({ t: -1, topic: name, data }); },
    add(name, off, data) {
      if (name === 'Position.z') addPositions(cars, data);
      else if (name === 'CarData.z') addCarData(tel, data);
      else if (KEEP.has(name)) {
        events.push({ t: off, topic: name, data });
        if (name === 'Heartbeat' && data?.Utc) beats.push([off, parseUtc(data.Utc)]);
        if (name === 'SessionInfo') info = { ...info, ...data };
      }
    },
    result: (load) => {
      // Archive commencée à une séance précédente (course de Mexico 2026) : la séance seule, liste des pilotes gardée
      const all = events.sort((a, b) => a.t - b.t);
      const cut = sessionCut(all.map((e) => ({ off: e.t })));
      const kept = cut ? all.filter((e) => e.t >= cut || e.topic === 'DriverList' || e.topic === 'SessionInfo') : all;
      return studies({ events: kept, cars, tel, beats, info, load });
    },
  };
}

// Mesures par seconde d'un flux (par voiture) : intervalle médian et 90e centile, trous de plus de 2 s
function rate(map) {
  const dts = [];
  let holes = 0;
  for (const c of map.values()) for (let i = 1; i < c.utc.length; i++) { const d = c.utc[i] - c.utc[i - 1]; dts.push(d); if (d > 2000) holes++; }
  return { med: median(dts), p90: quant(dts, 0.9), holes, cars: map.size };
}

// Écart signé à la ligne du tracé (unités ; positif à gauche du sens de la course) et temps de référence r
function along(track, x, y, hint) {
  const p = track.project(x, y, hint);
  const n = track.pts.length, a = track.pts[p.i], b = track.pts[(p.i + 1) % n];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { r: p.r, i: p.i, lat: ((x - a.x) * dy * -1 + (y - a.y) * dx) / len };
}

// Unités par mètre : distance GPS parcourue face à la vitesse intégrée (télémétrie), sur les mêmes instants
function unitsPerMetre(cars, tel) {
  const ratios = [];
  for (const [num, c] of cars) {
    const t = tel.get(num);
    if (!t || c.utc.length < 50) continue;
    let du = 0, dm = 0, j = 0;
    for (let i = 1; i < c.utc.length; i++) {
      const dt = c.utc[i] - c.utc[i - 1];
      if (dt > 1000) continue;
      while (j < t.utc.length - 1 && t.utc[j] < c.utc[i - 1]) j++;
      const v = t.v[j];
      if (!(v > 80)) continue;
      du += Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1]);
      dm += (v / 3.6) * (dt / 1000);
    }
    if (dm > 2000) ratios.push(du / dm);
  }
  return median(ratios);
}

// Positions d'une voiture projetées une fois sur le tracé : [{ r, lat, utc, x, y }] (null : hors piste)
function projected(track, c) {
  let hint = -1;
  return c.utc.map((utc, i) => {
    const p = along(track, c.x[i], c.y[i], hint);
    hint = p.i;
    return Math.abs(p.lat) > OFF_TRACK ? null : { r: p.r, lat: p.lat, utc, x: c.x[i], y: c.y[i] };
  });
}
// Premier indice de a (croissant) dont la valeur est >= v
const bisect = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };

// Passages au point r0 du tracé (positions déjà projetées) : [{ utc, lat, gap (unités entre les deux points) }]
function passes(track, proj, r0) {
  const out = [];
  let prev = null;
  const L = track.L;
  for (const cur of proj) {
    if (!cur) { prev = null; continue; }
    if (prev && cur.utc - prev.utc < 1500) {
      let a = prev.r, b = cur.r, target = r0;
      if (b < a - L / 2) b += L;   // passage de la ligne de référence du tracé
      if (target < a) target += L;
      if (a <= target && target <= b && b > a) {
        const u = (target - a) / (b - a);
        out.push({ utc: prev.utc + u * (cur.utc - prev.utc), lat: prev.lat + u * (cur.lat - prev.lat), gap: Math.hypot(cur.x - prev.x, cur.y - prev.y), rA: prev.r });
      }
    }
    prev = cur;
  }
  return out;
}

// Trajectoires et freinages, virage par virage
function corners(track, cars, tel, upm, dl) {
  const rows = [];
  const proj = new Map([...cars].map(([num, c]) => [num, projected(track, c)]));
  const metresPerRef = (track.pts.reduce((s, p, i, a) => s + (i ? Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) : 0), 0) / upm) / track.L;
  for (const c of track.corners) {
    const r0 = track.project(c.x, c.y).r;
    const noise = [], means = [], gaps = [], brakeNoise = [], brakeGaps = [];
    for (const [num] of cars) {
      const ps = passes(track, proj.get(num), r0);
      if (ps.length < 3) continue;
      const lats = ps.map((p) => p.lat / upm);
      noise.push(spread(lats));
      means.push(median(lats));
      gaps.push(...ps.map((p) => p.gap / upm));
      // Freinage : premier échantillon « frein » dans les 4 s avant le passage, distance au virage (m)
      const t = tel.get(num);
      if (!t) continue;
      const dists = [];
      for (const p of ps) {
        let j = bisect(t.utc, p.utc - 4000);
        if (j < 1 || j >= t.utc.length) continue;
        for (; j < t.utc.length && t.utc[j] <= p.utc; j++) {
          if (t.br[j] > 0 && !(t.br[j - 1] > 0) && t.v[j] > 150) {
            // distance parcourue entre le freinage et le passage : vitesse intégrée
            let d = 0;
            for (let k = j; k < t.utc.length - 1 && t.utc[k] < p.utc; k++) d += (t.v[k] / 3.6) * (Math.min(t.utc[k + 1], p.utc) - t.utc[k]) / 1000;
            dists.push(d);
            brakeGaps.push((t.v[j] / 3.6) * ((t.utc[j] - t.utc[j - 1]) / 1000));
            break;
          }
        }
      }
      if (dists.length >= 3) brakeNoise.push(spread(dists));
    }
    if (!noise.length) continue;
    rows.push({ n: c.number, drivers: noise.length, noise: median(noise), signal: spread(means), spacing: median(gaps), brakeDrivers: brakeNoise.length, brake: median(brakeNoise), brakeSpacing: median(brakeGaps) });
  }
  return { rows, metresPerRef, drivers: Object.keys(dl).length };
}

// Usure des pneus : droite temps du tour / tour du relais sur chaque relais propre de 6 tours ou plus
function tyreWear(derived, state) {
  const neutral = neutralLaps(state.RaceControlMessages?.Messages);
  const by = new Map();
  for (const laps of Object.values(derived.laps)) {
    const clean = laps.filter((l) => l.lap > 1 && !l.pit && !neutral.has(l.lap) && parseLapTime(l.time));
    const med = median(clean.map((l) => parseLapTime(l.time)));
    let stint = [];
    const flush = () => {
      if (stint.length >= 6) {
        const xs = stint.map((l, i) => i), ys = stint.map((l) => parseLapTime(l.time));
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
        const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        const res = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
        const k = stint[0].compound || '?';
        if (!by.has(k)) by.set(k, { slopes: [], noise: [], n: 0 });
        const g = by.get(k);
        g.slopes.push(slope); g.noise.push(spread(res)); g.n++;
      }
      stint = [];
    };
    for (const l of laps) {
      const t = parseLapTime(l.time);
      if (l.pit || (stint.length && stint.at(-1).compound !== l.compound)) flush();
      if (l.lap > 1 && !l.pit && !neutral.has(l.lap) && t && t < med * 1.07) stint.push(l);
    }
    flush();
  }
  return [...by].map(([k, g]) => ({ compound: k, stints: g.n, slope: median(g.slopes), noise: median(g.noise) }));
}

// Évolution de la piste : meilleur tour de chaque quart de séance (tous pilotes)
function evolution(derived) {
  const all = Object.values(derived.laps).flat().map((l) => ({ t: l.t, s: parseLapTime(l.time) })).filter((l) => l.s && l.t >= 0);
  if (all.length < 20) return null;
  const t0 = Math.min(...all.map((l) => l.t)), t1 = Math.max(...all.map((l) => l.t));
  return [0, 1, 2, 3].map((q) => { const v = all.filter((l) => l.t >= t0 + (q * (t1 - t0)) / 4 && l.t <= t0 + ((q + 1) * (t1 - t0)) / 4).map((l) => l.s); return v.length ? Math.min(...v) : null; });
}

// Départ : ordre sur la grille (premières positions du chronométrage) et ordre au premier virage (GPS)
function start(track, cars, events, beats, dl) {
  const st = events.find((e) => e.topic === 'SessionStatus' && e.data?.Status === 'Started');
  if (!st || !beats.length || !track.corners.length) return null;
  const off = median(beats.map(([o, u]) => u - o));
  const t0 = st.t + off;
  const grid = new Map();
  for (const e of events) {
    if (e.topic !== 'TimingData' || e.t > st.t) continue;
    for (const [n, l] of Object.entries(e.data?.Lines || {})) if (l?.Position) grid.set(n, Number(l.Position));
  }
  const r1 = track.project(track.corners[0].x, track.corners[0].y).r;
  const at = [];
  for (const [num, c] of cars) {
    const i0 = bisect(c.utc, t0 - 2000);
    if (i0 >= c.utc.length) continue;
    const sub = { utc: c.utc.slice(i0, i0 + 200), x: c.x.slice(i0, i0 + 200), y: c.y.slice(i0, i0 + 200) };
    const first = passes(track, projected(track, sub), r1).find((p) => p.utc >= t0);
    if (first) at.push({ num, utc: first.utc });
  }
  at.sort((a, b) => a.utc - b.utc);
  const moves = at.map((x, i) => ({ tla: dl[x.num]?.Tla || x.num, grid: grid.get(x.num), t1: i + 1 })).filter((x) => x.grid);
  return { cars: cars.size, seen: at.length, moves: moves.map((x) => ({ ...x, gained: x.grid - x.t1 })).sort((a, b) => b.gained - a.gained) };
}

// Choix d'aileron : vitesse au point de mesure (meilleure) et meilleur tour, médiane par écurie
function wings(state) {
  const teams = new Map();
  for (const [n, l] of Object.entries(state.TimingData?.Lines || {})) {
    const team = state.DriverList?.[n]?.TeamName;
    const st = Number(state.TimingStats?.Lines?.[n]?.BestSpeeds?.ST?.Value), lap = parseLapTime(l?.BestLapTime?.Value);
    if (!team || !st || !lap) continue;
    if (!teams.has(team)) teams.set(team, { st: [], lap: [] });
    teams.get(team).st.push(st); teams.get(team).lap.push(lap);
  }
  return [...teams].map(([team, v]) => ({ team, st: median(v.st), lap: median(v.lap) })).sort((a, b) => a.lap - b.lap);
}

async function studies({ events, cars, tel, beats, info, load }) {
  const state = {}, derived = createDerived();
  for (const e of events) applyEvent(state, derived, e.topic, e.data, e.t);
  const dl = state.DriverList || {};
  const kind = String(info?.Type || state.SessionInfo?.Type || '');
  const lines = [`Séance : ${info?.Meeting?.Name || '?'} · ${info?.Name || kind} · ${Object.keys(dl).length} pilotes`];
  const pos = rate(cars), car = rate(tel);
  lines.push('', '## Rythme des données',
    `GPS : un point toutes les ${f(pos.med, 0)} ms (90 % sous ${f(pos.p90, 0)} ms), ${pos.holes} trous de plus de 2 s, ${pos.cars} voitures`,
    `Télémétrie : une mesure toutes les ${f(car.med, 0)} ms (90 % sous ${f(car.p90, 0)} ms), ${car.holes} trous de plus de 2 s, ${car.cars} voitures`);
  const upm = cars.size && tel.size ? unitsPerMetre(cars, tel) : null;
  lines.push(`Échelle des coordonnées : ${f(upm, 2)} unité(s) par mètre (vitesse intégrée face au GPS)`);
  const key = info?.Meeting?.Circuit?.Key, year = Number(String(info?.StartDate || '').slice(0, 4));
  let track = null;
  try { const data = key ? await load(key, year) : null; track = data ? new Track(data) : null; } catch { track = null; }
  if (track && upm && cars.size) {
    const c = corners(track, cars, tel, upm, dl);
    lines.push('', '## Trajectoires et freinages (par virage)',
      'Bruit = dispersion d\'un tour à l\'autre pour un même pilote ; signal = écart entre les trajectoires moyennes des pilotes. Lisible si bruit < 1 m et signal > bruit.',
      ...c.rows.map((r) => `Virage ${r.n} · ${r.drivers} pilotes · trajectoire : bruit ${f(r.noise)} m, signal ${f(r.signal)} m, un point tous les ${f(r.spacing, 0)} m · freinage : ${r.brakeDrivers ? `dispersion ${f(r.brake, 0)} m, une mesure tous les ${f(r.brakeSpacing, 0)} m (${r.brakeDrivers} pilotes)` : '—'}`));
    const ok = c.rows.filter((r) => r.noise < 1 && r.signal > r.noise).length;
    lines.push(`Bilan : ${ok} virage(s) sur ${c.rows.length} lisible(s) pour les trajectoires.`);
    const s = /race|sprint/i.test(kind) ? start(track, cars, events, beats, dl) : null;
    if (s) {
      lines.push('', '## Départ (grille → premier virage, GPS)', `${s.seen} voitures sur ${s.cars} vues au premier virage.`,
        s.moves.map((m) => `${m.tla} ${m.gained > 0 ? '+' : ''}${m.gained} (P${m.grid} → P${m.t1})`).join(' · '));
    }
  } else lines.push('', '## Trajectoires et freinages', track ? 'GPS ou télémétrie absents de cette séance.' : 'Tracé du circuit indisponible.');
  if (/race|sprint/i.test(kind)) {
    const w = tyreWear(derived, state);
    lines.push('', '## Usure des pneus (relais propres de 6 tours ou plus)', 'Perte = secondes perdues par tour de relais ; bruit = dispersion autour de la droite.',
      ...(w.length ? w.map((g) => `${g.compound} · ${g.stints} relais · perte ${f(g.slope, 3)} s/tour · bruit ${f(g.noise, 2)} s`) : ['Pas assez de relais propres.']));
  } else {
    const e = evolution(derived);
    if (e) lines.push('', '## Évolution de la piste (meilleur tour par quart de séance)', e.map((v, i) => `Q${i + 1} ${f(v, 3)} s`).join(' · '), e[0] && e[3] ? `Gain du 1er au dernier quart : ${f(e[0] - e[3], 3)} s` : '');
  }
  const w = wings(state);
  if (w.length) lines.push('', '## Choix d\'aileron (médiane par écurie)', ...w.map((x) => `${x.team} · vitesse de pointe ${f(x.st, 0)} km/h · meilleur tour ${f(x.lap, 3)} s`));
  return { lines };
}
