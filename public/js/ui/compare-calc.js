// Comparaison de télémétrie (Analyse → Comparaison) : calculs sur les deux tours renvoyés par le serveur
// (trace : K+1 points sur la distance du tour, t temps écoulé, v vitesse, th accélérateur, br frein ; corners : virages
// en fraction du tour). Écarts : tour A moins tour B (négatif : A plus rapide).

// Écart cumulé A − B le long du tour, lissé sur ±1/80 du tour (5 points sur 400, environ 50 m) : le temps de passage
// vient du GPS, dont le bruit ferait trembler la courbe de quelques centièmes
export function smoothDelta(tr) {
  const { K, a, b } = tr, raw = a.t.map((t, i) => (t !== null && b.t[i] !== null ? t - b.t[i] : null)), W = Math.max(1, Math.round(K / 80));
  return raw.map((v, i) => {
    if (v === null) return null;
    if (i === 0 || i === K) return v;   // départ (0) et arrivée (écart officiel) exacts
    let s = 0, n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(K, i + W); j++) if (raw[j] !== null) { s += raw[j]; n++; }
    return s / n;
  });
}

// Type de virage d'après la vitesse minimale (km/h)
export const cornerType = (v) => (v === null ? null : v < 120 ? 'slow' : v <= 225 ? 'medium' : 'fast');

const minOf = (arr, lo, hi) => { let m = null; for (let i = lo; i <= hi; i++) if (arr[i] !== null && (m === null || arr[i] < m)) m = arr[i]; return m; };
const maxOf = (arr, lo, hi) => { let m = null; for (let i = lo; i <= hi; i++) if (arr[i] !== null && (m === null || arr[i] > m)) m = arr[i]; return m; };

// Ce que fait le pilote à l'approche et dans le virage : 'brake' (freine), 'lift' (lève le pied, accélérateur sous 90 %),
// 'flat' (à fond), null sans télémétrie
function action(s, lo, hi) {
  const th = minOf(s.th, lo, hi), br = maxOf(s.br, lo, hi);
  if (th === null && br === null) return null;
  return br > 0 ? 'brake' : th !== null && th < 90 ? 'lift' : 'flat';
}

// Virage par virage : fenêtre autour de chaque virage (jusqu'à mi-chemin des virages voisins, 2,5 % du tour au plus),
// vitesse minimale de chaque pilote, type, action, écart de temps dans la fenêtre
export function cornerStats(tr) {
  const { K, corners, a, b } = tr;
  const ix = (q) => Math.max(0, Math.min(K, Math.round(q * K)));
  const dl = smoothDelta(tr);
  return corners.map((c, i) => {
    const prev = i ? corners[i - 1].q : c.q - 0.05, next = i < corners.length - 1 ? corners[i + 1].q : c.q + 0.05;
    const lo = ix(Math.max(c.q - 0.025, (prev + c.q) / 2)), hi = ix(Math.min(c.q + 0.025, (c.q + next) / 2));
    const vA = minOf(a.v, lo, hi), vB = minOf(b.v, lo, hi);
    return {
      n: c.n, lo, hi, vA, vB,
      type: cornerType(vA !== null && vB !== null ? (vA + vB) / 2 : vA ?? vB),
      actA: action(a, lo, hi), actB: action(b, lo, hi),
      dt: dl[hi] !== null && dl[lo] !== null ? Math.round((dl[hi] - dl[lo]) * 1000) / 1000 : null,
    };
  });
}

// Par type de virage (lents, moyens, rapides) puis lignes droites et le reste : nombre de virages, vitesse minimale
// moyenne de chaque pilote, écart de temps cumulé ; lignes droites : vitesse de pointe
export function typeStats(tr, stats) {
  const out = ['slow', 'medium', 'fast'].map((type) => {
    const list = stats.filter((s) => s.type === type);
    const avg = (k) => { const v = list.map((s) => s[k]).filter((x) => x !== null); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
    return { type, n: list.length, vA: avg('vA'), vB: avg('vB'), dt: list.length ? Math.round(list.reduce((t, s) => t + (s.dt || 0), 0) * 1000) / 1000 : null };
  });
  const { K, a, b } = tr;
  const total = a.t[K] !== null && b.t[K] !== null ? a.t[K] - b.t[K] : null;
  const inCorners = stats.reduce((t, s) => t + (s.dt || 0), 0);
  out.push({ type: 'straight', n: null, vA: maxOf(a.v, 0, K), vB: maxOf(b.v, 0, K), dt: total === null ? null : Math.round((total - inCorners) * 1000) / 1000 });
  return out.filter((r) => r.type === 'straight' || r.n);
}
