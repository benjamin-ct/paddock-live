// Calculs de la vue 3D sans three.js ni page (ui/map3d.js, chargés avec elle ; testés dans test/map3d.test.js)

// Qualité : 0 économe, 1 moyenne (seulement en Auto), 2 haute (rendu complet). pr : densité de pixels au plus ;
// shadow : taille de la carte des ombres, shadowAll : bâtiments et arbres font de l'ombre (sinon les voitures seules) ;
// trees, buildings : part des arbres et des bâtiments dessinés (les plus grands et les plus près de la piste) ;
// detail : taille du sol de détail (part de la taille complète) ; aniso : anisotropie des textures du sol
export const QUALITY = [
  { pr: 1, shadow: 1024, shadowAll: false, trees: 0.3, buildings: 0.4, detail: 0.5, aniso: 2 },
  { pr: 1.5, shadow: 1024, shadowAll: true, trees: 0.65, buildings: 0.75, detail: 0.5, aniso: 4 },
  { pr: 2, shadow: 2048, shadowAll: true, trees: 1, buildings: 1, detail: 1, aniso: 16 },
];

// Ordre de dessin des arbres ou des bâtiments : les plus grands et les plus près de la piste d'abord (les plus petits
// et les plus lointains sont les premiers laissés de côté en Économe). items : [[distance à la piste (m), taille (m)]…]
// -> indices dans cet ordre
export function nearFirst(items) {
  const score = items.map(([d, size]) => size / (Math.max(0, d) + 40));
  return items.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
}

// Qualité Auto : images/s mesurées par fenêtres de win ms (sans les arrêts de plus de 2 s : onglet caché, décor en
// construction) ; un cran plus bas dès qu'une fenêtre saccade (moins de low images/s, ou de 80 % de la limite cap
// quand la vue en dessine moins exprès), un cran plus haut seulement après calm fenêtres de suite à high images/s ou
// plus, sans limite, et jamais avant un délai qui double à chaque retour en arrière depuis ce niveau (pas de
// va-et-vient). La fenêtre qui suit un changement est ignorée (le temps que la vue s'y fasse).
export function autoQuality(level, { max = 2, win = 3000, low = 28, high = 50, calm = 3, retry = 60000 } = {}) {
  let t0 = -1, last = -1, n = 0, cap0 = Infinity, skip = 1, good = 0;
  const wait = [], until = [];
  return {
    get level() { return level; },
    // Image dessinée à now (ms) ; cap : images/s visées (Infinity : sans limite) -> nouveau niveau, sinon null
    frame(now, cap = Infinity) {
      if (t0 < 0 || now - last > 2000 || cap !== cap0) { t0 = last = now; n = 0; cap0 = cap; return null; }
      last = now;
      n++;
      if (now - t0 < win) return null;
      const fps = (n * 1000) / (now - t0);
      t0 = now;
      n = 0;
      if (skip) { skip--; return null; }
      if (level > 0 && fps < Math.min(low, 0.8 * cap)) {
        wait[level] = (wait[level] || retry / 2) * 2;
        until[level] = now + wait[level];
        level--;
        good = 0;
        skip = 1;
        return level;
      }
      good = cap === Infinity && fps >= high ? good + 1 : 0;
      if (good >= calm && level < max && now >= (until[level + 1] || 0)) {
        level++;
        good = 0;
        skip = 1;
        return level;
      }
      return null;
    },
  };
}

// Images/s visées (économie de batterie) : 5 quand rien ne bouge (replay en pause, aucune voiture en piste), 20 sous
// drapeau rouge, 30 sur téléphone sur batterie ; sans limite (Infinity) sinon. busy : on touche à la vue (caméra,
// glisser…) : pas de ralenti, seulement la limite de la batterie
export function frameCap({ still = false, red = false, battery = false, busy = false } = {}) {
  const cap = battery ? 30 : Infinity;
  return busy ? cap : Math.min(cap, still ? 5 : red ? 20 : Infinity);
}

// Météo de la vue 3D. choice : 'reelle' (d'après la F1), 'sec' ou 'pluie' (pour essayer) ; rainfall : Rainfall de la
// station météo de la F1 (WeatherData) ; compounds : pneus montés en piste ; cloud : nébulosité prévue (%, en direct)
// -> { rain : il pleut (0 ou 1), wet : piste mouillée (0 à 1 : la pluie, ou la part des voitures en intermédiaires ou
// pneus pluie, la moitié suffit), cloud : ciel couvert (0 à 1) }
export function weatherState(choice, { rainfall = null, compounds = [], cloud = null } = {}) {
  if (choice === 'sec') return { rain: 0, wet: 0, cloud: 0 };
  if (choice === 'pluie') return { rain: 1, wet: 1, cloud: 1 };
  const rain = rainfall === '1' || rainfall === 1 || rainfall === true ? 1 : 0;
  const share = compounds.length ? compounds.filter((c) => c === 'INTERMEDIATE' || c === 'WET').length / compounds.length : 0;
  const wet = Math.max(rain, Math.min(1, share * 2));
  const sky = cloud !== null && Number.isFinite(Number(cloud)) ? Math.min(1, Math.max(0, Number(cloud) / 100)) : 0;
  return { rain, wet, cloud: Math.max(rain, wet * 0.85, sky) };
}

// Deuxième couleur d'une écurie (dérives, flancs des ailerons, rétroviseurs) : la F1 ne donne que TeamColour, donc
// une teinte dérivée, plus sombre pour une couleur vive ou claire, plus claire pour une couleur sombre ; null si
// la couleur est illisible. hex : 'RRGGBB' ou '#RRGGBB'
export function accentColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const out = lum > 0.25 ? rgb.map((v) => v * 0.45) : rgb.map((v) => v + (255 - v) * 0.55);
  return `#${out.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// Volet de l'aileron arrière ouvert : canal DRS de la télémétrie (CarData, canal 45) ; 10, 12 et 14 : ouvert
export const drsOpen = (drs) => Number(drs) >= 10;

// Pneus montés : composé du dernier relais qui en donne un (Stints de TimingAppData, tableau ou objet indexé ; le
// relais d'après un arrêt arrive parfois avant son composé) ; null si inconnu
export function compoundOf(stints) {
  const arr = Array.isArray(stints) ? stints : Object.keys(stints || {}).sort((a, b) => a - b).map((k) => stints[k]);
  for (let i = arr.length - 1; i >= 0; i--) {
    const c = arr[i]?.Compound;
    if (c) return /UNKNOWN/i.test(c) ? null : String(c).toUpperCase();
  }
  return null;
}

// Écart en secondes d'un texte du chronométrage (« +0.512 », « 1:02.345 ») ; null pour un tour ou plus (« 1 L ») ou vide
export function seconds(v) {
  const m = /^\+?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(v ?? '').trim());
  return m ? (Number(m[1]) || 0) * 60 + Number(m[2]) : null;
}

// Caméra Réalisation : quelle voiture suivre. lines : [{ num, pos (classement), gap (s à la voiture devant, null si
// inconnu), drs (volet ouvert), gained (places gagnées depuis peu) }] des voitures en piste ; cur : { num, since } du
// plan en cours (ou null). Une bataille compte d'autant plus que l'écart est petit (moins de 2,5 s), que la voiture
// attaque (DRS), vient de dépasser, ou se bat devant ; sans bataille, le leader. Plan gardé au moins min ms, changé
// ensuite pour une bataille nettement meilleure (ou pour le leader quand la bataille en cours est finie), et au bout de
// max ms pour une autre s'il y en a une. -> { num, since }
export function pickBattle(lines, cur, now, { min = 8000, max = 30000 } = {}) {
  const score = (l) => (l.gap === null || l.gap > 2.5 ? (l.pos === 1 ? 0.05 : 0) : ((2.5 - l.gap) / (l.gap + 0.3)) * (l.drs ? 1.6 : 1) * (l.gained > 0 ? 2.5 : 1) * (1 + 1.5 / l.pos));
  const ranked = lines.map((l) => [l.num, score(l)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const mine = cur && lines.find((l) => l.num === cur.num);
  if (!ranked.length) {
    // Plus de bataille : le plan en cours au moins min ms, puis le leader
    const leader = lines.find((l) => l.pos === 1)?.num ?? null;
    return mine && (now - cur.since < min || !leader || leader === cur.num) ? cur : { num: leader, since: now };
  }
  if (!mine) return { num: ranked[0][0], since: now };
  if (now - cur.since < min) return cur;
  const s = score(mine), [best, bs] = ranked[0];
  if (best !== cur.num && (s === 0 || bs > 1.3 * s + 0.1)) return { num: best, since: now };   // plus de bataille : la meilleure (ou le leader)
  if (now - cur.since > max) {
    const other = ranked.find(([n]) => n !== cur.num);
    if (other) return { num: other[0], since: now };
  }
  return cur;
}

// Fantôme du meilleur tour. Tour le plus rapide d'après les tours de chaque pilote (store.derived.laps : { num : [{ lap,
// t (heure locale de fin du tour), time (« 1:36.250 ») }] }), seulement ceux dont on connaît le début (fin du tour
// d'avant) et qui passent ok (ex. positions GPS encore gardées), essayés du plus rapide au plus lent ; only : ce pilote
// seulement -> { num, lap, time (s), t0, t1 } ou null
export function bestLap(laps, only = null, ok = () => true) {
  const all = [];
  for (const [num, list] of Object.entries(laps || {})) {
    if (only && num !== only) continue;
    for (let i = 1; i < list.length; i++) {
      const time = seconds(list[i].time);
      if (time && list[i].lap === list[i - 1].lap + 1) all.push({ num, lap: list[i].lap, time, t0: list[i - 1].t, t1: list[i].t });
    }
  }
  return all.sort((a, b) => a.time - b.time).find(ok) || null;
}

// Meilleur tour officiel de la séance (chronométrage : connu même pour un tour d'avant le début du replay) ;
// lines : TimingStats.Lines -> { num, time (s) } ou null
export function sessionBest(lines) {
  const [num, l] = Object.entries(lines || {}).find(([, x]) => Number(x?.PersonalBestLapTime?.Position) === 1) || [];
  const time = num ? seconds(l.PersonalBestLapTime.Value) : null;
  return time ? { num, time } : null;
}

// Trajet d'un tour : positions GPS [{ t, x, y }] entre t0 et t1 -> [{ dt (ms depuis t0), x, y }] ; position au temps dt
// du tour (interpolée), null hors du tour
export function lapTrace(samples, t0, t1) {
  return samples.filter((s) => s.t >= t0 && s.t <= t1).map((s) => ({ dt: s.t - t0, x: s.x, y: s.y }));
}
export function traceAt(trace, dt) {
  if (!trace?.length || dt < trace[0].dt || dt > trace.at(-1).dt) return null;
  let lo = 0, hi = trace.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (trace[m].dt <= dt) lo = m; else hi = m; }
  const a = trace[lo], b = trace[hi], u = b.dt > a.dt ? (dt - a.dt) / (b.dt - a.dt) : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

// Ouvertures dans les murs à l'entrée et à la sortie des stands. parts : morceaux de mur [{ a: [x, z], b: [x, z], wall
// (même valeur pour les morceaux qui se suivent d'un même mur) }], pit : points du milieu de la voie [[x, z]…] (m).
// Là où la voie traverse un mur, le morceau et ses voisins du même mur (12 m pour des morceaux de 4 m, voie de 7 m) ;
// pas quand elle le longe (moins de 10° : son tracé, approximatif, zigzague sur le mur des stands) -> indices
export function wallCuts(parts, pit) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const crosses = ({ a, b }, c, d) => {
    if (side(a, b, c) === side(a, b, d) || side(c, d, a) === side(c, d, b)) return false;
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - c[0], vz = d[1] - c[1];
    return Math.abs(ux * vz - uz * vx) > Math.sin(Math.PI / 18) * Math.hypot(ux, uz) * Math.hypot(vx, vz);
  };
  const out = new Set();
  parts.forEach((w, k) => {
    if (!pit.some((q, j) => j && crosses(w, pit[j - 1], q))) return;
    for (const n of [k - 1, k, k + 1]) if (parts[n]?.wall === w.wall) out.add(n);
  });
  return [...out].sort((x, y) => x - y);
}
