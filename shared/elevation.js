// Profil d'altitude d'un circuit (carte 3D) : le tracé MultiViewer n'a que x, y ; le GPS des voitures (Position.z)
// donne aussi Z, dans le même repère et la même unité (1/10 m). Chaque position est projetée sur le tracé
// (à moins de 15 m : pas les stands ni les sorties de piste), l'altitude d'un point du tracé est la médiane des Z
// qui y tombent (quelques Z aberrants ne la tirent pas) ; un point très loin de ses voisins est écarté, les points sans
// voiture sont interpolés entre leurs voisins, puis le profil est lissé (le Z brut est bruité de quelques mètres).
// Calculé par le serveur (analytics/zones.js), d'après une séance archivée.

const NEAR = 150;      // 15 m du tracé au plus
const SMOOTH = 4;      // moyenne glissante sur 2 × 4 + 1 points
const MIN_COVER = 0.5; // au moins la moitié des points du tracé vus par une voiture, sinon pas de profil
const SPIKE = 150;     // 15 m d'écart à la médiane des 2 × 12 voisins : point aberrant (une piste ne fait pas ça)
export const VERSION = 2;   // profils gardés par le serveur d'une version plus ancienne : recalculés

const median = (a) => { const v = a.slice().sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Z brut médian par point du tracé : samples = [{ car, x, y, z }] dans l'ordre du temps (recherche locale par voiture)
export function accumulate(track, samples) {
  const n = track.pts.length, zs = Array.from({ length: n }, () => []), hint = new Map();
  let used = 0;
  for (const s of samples) {
    if ((!s.x && !s.y) || !Number.isFinite(s.z)) continue;
    const pr = track.project(s.x, s.y, hint.get(s.car) ?? -1);
    if (pr.d2 > NEAR ** 2) continue;
    hint.set(s.car, pr.i);
    zs[pr.i].push(s.z);
    used++;
  }
  return { z: zs.map((v) => (v.length ? median(v) : NaN)), used };
}

// Points aberrants (Z faux sur quelques points de suite : lissés, ils faisaient un creux de 85 m à Spa) : écart de plus
// de 15 m à la médiane de leurs voisins connus (12 de chaque côté, sur la boucle : une dizaine de points faux de suite
// restent minoritaires) -> NaN, comblés ensuite comme les trous
export function despike(z, k = 12, t = SPIKE) {
  const n = z.length;
  return z.map((v, i) => {
    if (Number.isNaN(v)) return v;
    const near = [];
    for (let d = 1; d <= k; d++) for (const j of [(i + d) % n, (i - d + n) % n]) if (!Number.isNaN(z[j])) near.push(z[j]);
    return near.length >= k && Math.abs(v - median(near)) > t ? NaN : v;
  });
}

// Points sans valeur : interpolation linéaire entre les voisins connus (le tracé est une boucle)
export function fillGaps(z) {
  const n = z.length, known = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(z[i])) known.push(i);
  if (!known.length) return null;
  const out = z.slice();
  for (let k = 0; k < known.length; k++) {
    const a = known[k], b = known[(k + 1) % known.length], span = (b - a + n) % n || n;
    for (let d = 1; d < span; d++) out[(a + d) % n] = z[a] + ((z[b] - z[a]) * d) / span;
  }
  return out;
}

// Moyenne glissante circulaire
export function smooth(z, w = SMOOTH) {
  const n = z.length;
  return z.map((_, i) => {
    let s = 0;
    for (let k = -w; k <= w; k++) s += z[(((i + k) % n) + n) % n];
    return s / (2 * w + 1);
  });
}

// Profil complet : { z: [altitude de chaque point du tracé, 1/10 m], n, samples, cover } ou null (trop peu de données)
export function elevationProfile(track, samples) {
  const { z, used } = accumulate(track, samples);
  const n = z.length, seen = z.filter((v) => !Number.isNaN(v)).length;
  if (!n || seen < n * MIN_COVER) return null;
  return { z: smooth(fillGaps(despike(z))).map(Math.round), n, samples: used, cover: Math.round((seen / n) * 100) / 100, v: VERSION };
}

// Altitude lissée selon la distance le long du tracé (vue 3D), et non selon le numéro du point : les points du tracé
// MultiViewer sont très inégalement espacés (de 0,2 à 20 m), un profil lissé point par point y fait des marches de
// plusieurs mètres entre deux points presque confondus. Moyenne pondérée (gaussienne de sigma m, chaque point compté
// pour la longueur qu'il représente) sur la boucle : une pente régulière reste la même (Raidillon).
// pts : [[x, y]] (m), z : altitude de chaque point -> altitudes lissées (même unité que z)
export function smoothAlong(pts, z, sigma = 12) {
  const n = pts.length, s = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) s[i] = s[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]);
  const L = s[n], len = (j) => (s[j + 1] - s[(j - 1 + n) % n] + (j ? 0 : L)) / 2;   // longueur représentée par le point j
  return z.map((_, i) => {
    let sw = 0, sz = 0;
    for (let k = 0; k < n; k++) {   // de part et d'autre de i, jusqu'à 3 sigma
      let stop = 0;
      for (const j of k ? [(i + k) % n, (i - k + n) % n] : [i]) {
        const d = Math.min(Math.abs(s[j] - s[i]), L - Math.abs(s[j] - s[i]));
        if (d > 3 * sigma) { stop++; continue; }
        const w = Math.exp(-0.5 * (d / sigma) ** 2) * (len(j) || 1e-3);
        sw += w;
        sz += w * z[j];
      }
      if (stop === 2 || 2 * k + 1 >= n) break;
    }
    return sz / sw;
  });
}
