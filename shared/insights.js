// Analyse → Tendances : ce que les données publiques de la F1 permettent de mesurer sans deviner (vérifié sur la
// course et les qualifs de Mexico 2026 avec le diagnostic des données F1, server/studies.js) :
// - évolution de la piste (essais, qualifs) : meilleur tour de chaque quart de la séance ;
// - choix d'aileron : vitesse de pointe face au meilleur tour, par écurie ;
// - usure des pneus (course) : perte par tour sur le relais en cours, corrigée de l'allègement en carburant ;
// - départ (course) : places gagnées entre la grille et le premier virage, d'après le GPS.
// Les trajectoires et les points de freinage ne sont pas mesurables : la F1 publie des positions recalées sur une
// ligne de référence (à 4 cm près) et environ 4 mesures par seconde.
import { parseLapTime } from './f1.js';

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// ---------- Évolution de la piste ----------
// laps : derived.laps ({ num: [{ t, time, pit }] }) ; meilleur tour de chaque quart du temps écoulé depuis le premier tour
export function trackEvolution(laps) {
  const all = Object.values(laps || {}).flat().map((l) => ({ t: l.t, s: parseLapTime(l.time) })).filter((l) => l.s && Number.isFinite(l.t));
  if (all.length < 8) return null;
  const t0 = Math.min(...all.map((l) => l.t)), t1 = Math.max(...all.map((l) => l.t));
  const quarters = [0, 1, 2, 3].map((q) => {
    const v = all.filter((l) => l.t >= t0 + (q * (t1 - t0)) / 4 && l.t <= t0 + ((q + 1) * (t1 - t0)) / 4).map((l) => l.s);
    return v.length ? Math.min(...v) : null;
  });
  const first = quarters.find((v) => v !== null), last = [...quarters].reverse().find((v) => v !== null);
  return { quarters, gain: first !== undefined && last !== undefined ? first - last : null, minutes: (t1 - t0) / 60000 };
}

// ---------- Choix d'aileron ----------
// Par écurie : meilleure vitesse au point de mesure (médiane des pilotes) et meilleur tour ; trié par meilleur tour
export function wingChoice(state) {
  const teams = new Map();
  for (const [n, l] of Object.entries(state?.TimingData?.Lines || {})) {
    const d = state.DriverList?.[n];
    const st = Number(state.TimingStats?.Lines?.[n]?.BestSpeeds?.ST?.Value), lap = parseLapTime(l?.BestLapTime?.Value);
    if (!d?.TeamName || !st || !lap) continue;
    if (!teams.has(d.TeamName)) teams.set(d.TeamName, { team: d.TeamName, color: d.TeamColour || '', st: [], lap: [] });
    const t = teams.get(d.TeamName);
    t.st.push(st); t.lap.push(lap);
  }
  return [...teams.values()].map((t) => ({ team: t.team, color: t.color, st: median(t.st), lap: Math.min(...t.lap) })).sort((a, b) => a.lap - b.lap);
}

// ---------- Usure des pneus ----------
// Allègement en carburant : environ 0,04 s gagnée par tour (1,5 kg brûlé par tour, ~0,03 s par kg) ; la perte brute
// mesurée à Mexico était presque nulle car l'usure et le carburant se compensent
export const FUEL_GAIN = 0.04;
// Relais en cours de chaque pilote (tours propres depuis son dernier arrêt, hors 1er tour) : perte par tour corrigée du
// carburant (pente des temps + FUEL_GAIN), avec le type de pneu et l'âge du relais. Tours propres : à moins de 3 % du
// quart le plus rapide du relais, ce qui écarte safety car, VSC et incidents d'après leur seul temps (la liste des
// tours neutralisés peut se tromper : Mexico 2026, safety car sans message de fin avant le drapeau rouge)
export function tyreWear(laps, minLaps = 8) {
  const out = [];
  for (const [num, list] of Object.entries(laps || {})) {
    let stint = [];
    for (const l of list) {
      if (l.pit) { stint = []; continue; }
      if (stint.length && l.compound && stint.at(-1).compound && stint.at(-1).compound !== l.compound) stint = [];
      stint.push(l);
    }
    const all = stint.map((l) => ({ lap: l.lap, s: parseLapTime(l.time), compound: l.compound }));
    const times = all.map((l) => l.s).filter(Boolean).sort((a, b) => a - b);
    const ref = times[Math.floor(times.length / 4)];
    const clean = all.filter((l) => l.lap > 1 && l.s && l.s < ref * 1.03);
    if (clean.length < minLaps) continue;
    const mx = clean.reduce((a, l) => a + l.lap, 0) / clean.length, my = clean.reduce((a, l) => a + l.s, 0) / clean.length;
    const slope = clean.reduce((a, l) => a + (l.lap - mx) * (l.s - my), 0) / clean.reduce((a, l) => a + (l.lap - mx) ** 2, 0);
    out.push({ num, compound: stint.findLast((l) => l.compound)?.compound || null, laps: stint.length, wear: Math.round((slope + FUEL_GAIN) * 1000) / 1000 });
  }
  return out.sort((a, b) => a.wear - b.wear);
}

// ---------- Départ (GPS) ----------
const OFF_TRACK = 200;   // unités (≈ 20 m) : au-delà, voie des stands ou hors piste
// Premier indice de a (croissant) dont la valeur est >= v
export const bisect = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };

// Écart signé à la ligne du tracé (unités ; positif à gauche du sens de la course) et temps de référence r
export function along(track, x, y, hint) {
  const p = track.project(x, y, hint);
  const n = track.pts.length, a = track.pts[p.i], b = track.pts[(p.i + 1) % n];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { r: p.r, i: p.i, lat: ((y - a.y) * dx - (x - a.x) * dy) / len };
}
// Positions d'une voiture ({ utc, x, y } en tableaux) projetées une fois sur le tracé : [{ r, lat, utc, x, y }] (null : hors piste)
export function projected(track, c) {
  let hint = -1;
  return c.utc.map((utc, i) => {
    const p = along(track, c.x[i], c.y[i], hint);
    hint = p.i;
    return Math.abs(p.lat) > OFF_TRACK ? null : { r: p.r, lat: p.lat, utc, x: c.x[i], y: c.y[i] };
  });
}
// Passages au point r0 du tracé (positions projetées) : [{ utc, lat, gap (unités entre les deux points) }]
export function passes(track, proj, r0) {
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
        out.push({ utc: prev.utc + u * (cur.utc - prev.utc), lat: prev.lat + u * (cur.lat - prev.lat), gap: Math.hypot(cur.x - prev.x, cur.y - prev.y) });
      }
    }
    prev = cur;
  }
  return out;
}

// Ordre au premier virage après le départ (t0 : heure F1 du départ, ms) face à la grille (grid : Map num -> place) ;
// [{ num, grid, t1, gained }] triés par places gagnées, et le nombre de voitures vues ; rien après maxUtc (délai TV)
export function startGains(track, cars, t0, grid, maxUtc = Infinity) {
  if (!track.corners.length || !Number.isFinite(t0)) return null;
  const r1 = track.project(track.corners[0].x, track.corners[0].y).r;
  const at = [];
  for (const [num, c] of cars) {
    const i0 = bisect(c.utc, t0 - 2000), i1 = Math.min(i0 + 200, bisect(c.utc, maxUtc + 1));
    if (i0 >= i1) continue;
    const sub = { utc: c.utc.slice(i0, i1), x: c.x.slice(i0, i1), y: c.y.slice(i0, i1) };
    const first = passes(track, projected(track, sub), r1).find((p) => p.utc >= t0);
    if (first) at.push({ num, utc: first.utc });
  }
  if (!at.length) return null;
  at.sort((a, b) => a.utc - b.utc);
  const moves = at.map((x, i) => ({ num: x.num, grid: grid.get(x.num) || null, t1: i + 1 })).filter((x) => x.grid)
    .map((x) => ({ ...x, gained: x.grid - x.t1 })).sort((a, b) => b.gained - a.gained || a.t1 - b.t1);
  return { seen: at.length, moves };
}
