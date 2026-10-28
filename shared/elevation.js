// Profil d'altitude d'un circuit (carte 3D) : le tracé MultiViewer n'a que x, y ; le GPS des voitures (Position.z)
// donne aussi Z, dans le même repère et la même unité (1/10 m). Chaque position est projetée sur le tracé
// (à moins de 15 m : pas les stands ni les sorties de piste), l'altitude d'un point du tracé est la moyenne des Z
// qui y tombent ; les points sans voiture sont interpolés entre leurs voisins, puis le profil est lissé (le Z brut
// est bruité de quelques mètres). Calculé par le serveur (analytics/zones.js), d'après une séance archivée.

const NEAR = 150;      // 15 m du tracé au plus
const SMOOTH = 4;      // moyenne glissante sur 2 × 4 + 1 points
const MIN_COVER = 0.5; // au moins la moitié des points du tracé vus par une voiture, sinon pas de profil

// Z brut moyen par point du tracé : samples = [{ car, x, y, z }] dans l'ordre du temps (recherche locale par voiture)
export function accumulate(track, samples) {
  const n = track.pts.length, sum = new Float64Array(n), cnt = new Uint32Array(n), hint = new Map();
  let used = 0;
  for (const s of samples) {
    if ((!s.x && !s.y) || !Number.isFinite(s.z)) continue;
    const pr = track.project(s.x, s.y, hint.get(s.car) ?? -1);
    if (pr.d2 > NEAR ** 2) continue;
    hint.set(s.car, pr.i);
    sum[pr.i] += s.z;
    cnt[pr.i]++;
    used++;
  }
  return { z: Array.from(sum, (v, i) => (cnt[i] ? v / cnt[i] : NaN)), used };
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
  return { z: smooth(fillGaps(z)).map(Math.round), n, samples: used, cover: Math.round((seen / n) * 100) / 100 };
}
