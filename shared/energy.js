// Énergie 2026 estimée à partir de la télémétrie publique (vitesse, accélérateur, frein) : la F1 ne publie
// ni la charge de la batterie, ni le Boost, ni le mode dépassement. Deux signes se voient quand même :
// - « recharge » (lift and coast) : pied levé sans freiner à haute vitesse, souvent avant un freinage ;
// - « batterie vide » (clipping) : pied au plancher à haute vitesse mais la voiture n'accélère plus.
// Estimation seulement : une fin de ligne droite très rapide peut aussi plafonner sans batterie vide.

const GAP = 1500;        // trou entre deux échantillons au-delà duquel on ne compte rien (ms)
const WINDOW = 1000;     // recul pour mesurer l'accélération (ms)

// État d'un échantillon s (avec l'échantillon `prev` pris ~1 s plus tôt) : 'harvest', 'clip' ou null
function stateOf(s, prev) {
  if (!s || typeof s.speed !== 'number' || s.thr === null || s.thr === undefined) return null;
  if (s.thr <= 5 && !s.brk && s.speed >= 150) return 'harvest';
  if (s.thr >= 98 && !s.brk && s.speed >= 200 && prev && s.t - prev.t >= WINDOW * 0.6 && s.speed - prev.speed <= 0) return 'clip';
  return null;
}

// Échantillon ~1 s avant l'indice i (même série, sans trou)
function before(samples, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (samples[j + 1].t - samples[j].t > GAP) return null;
    if (samples[i].t - samples[j].t >= WINDOW) return samples[j];
  }
  return null;
}

// État à la fin de la série, s'il dure depuis au moins 0,5 s (sinon null : évite les clignotements)
export function energyNow(samples) {
  const n = samples?.length || 0;
  const st = (i) => stateOf(samples[i], before(samples, i));
  const last = n ? st(n - 1) : null;
  if (!last) return null;
  for (let i = n - 2; i >= 0; i--) {
    if (samples[i + 1].t - samples[i].t > GAP || st(i) !== last) return null;
    if (samples[n - 1].t - samples[i].t >= 500) return last;
  }
  return null;
}

// Secondes passées en recharge et en batterie vide sur la série
export function energyTotals(samples) {
  const out = { harvest: 0, clip: 0 };
  for (let i = 0; i + 1 < (samples?.length || 0); i++) {
    const dt = samples[i + 1].t - samples[i].t;
    if (dt > GAP) continue;
    const st = stateOf(samples[i], before(samples, i));
    if (st) out[st] += dt / 1000;
  }
  return out;
}
