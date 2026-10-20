// Compteurs de télémétrie et courbe de vitesse, animés image par image.
// Le SVG est construit une seule fois ; à chaque image, seuls la longueur des arcs (via
// stroke-dasharray) et les textes changent. Les valeurs viennent de la télémétrie interpolée
// (positions.carLerp) puis d'un léger lissage, pour un mouvement continu à 60 images/s.
import { store, displayNow } from '../store.js';
import { t, dec } from '../i18n.js';
import { energyNow, energyTotals } from '/shared/energy.js';
import { parseLapTime } from '/shared/f1.js';

const NS = 'http://www.w3.org/2000/svg';
export const SPEED_MAX = 360;

// ---- Boucle d'animation partagée ----
const jobs = new Map();
let raf = 0, lastFrame = 0;
function frame(t) {
  raf = 0;
  const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0.016;
  lastFrame = t;
  for (const [id, fn] of jobs) {
    let keep = false;
    try { keep = fn(dt, t) !== false; } catch (err) { console.error(err); }
    if (!keep) jobs.delete(id);
  }
  if (jobs.size) raf = requestAnimationFrame(frame);
  else lastFrame = 0;
}
// fn(dt, t) est appelée à chaque image tant qu'elle ne renvoie pas false
export function animate(id, fn) {
  jobs.set(id, fn);
  if (!raf) raf = requestAnimationFrame(frame);
}

function arc(cx, cy, r, a0, a1) {
  const pt = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

let dialSeq = 0;
// Compteur : vitesse sur l'anneau extérieur (0 à 360 km/h), accélérateur (gauche) et frein
// (droite) sur les arcs intérieurs, régime et rapport au centre
export class Dial {
  constructor(color) {
    const uid = `d${++dialSeq}`;
    const cx = 130, cy = 128, R = 98, r = 64;
    let ticks = '';
    for (let v = 0; v <= SPEED_MAX; v += 60) {
      const a = ((-135 + (270 * v) / SPEED_MAX) * Math.PI) / 180;
      const tx = cx + (R + 19) * Math.sin(a), ty = cy - (R + 19) * Math.cos(a);
      ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" class="dl-tick">${v || ''}</text>`;
    }
    // Libellés au milieu de l'espace entre l'anneau de vitesse et les arcs intérieurs
    const mid = (R - 6 + r + 4) / 2 - 3;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg viewBox="0 0 260 248" class="dial">
      <defs><path id="thr${uid}" d="${arc(cx, cy, mid, -122, -28)}"/><path id="brk${uid}" d="${arc(cx, cy, mid, 28, 122)}"/></defs>
      <path d="${arc(cx, cy, R, -135, 135)}" class="dl-track"/>
      <path d="${arc(cx, cy, R, -135, 135)}" class="dl-speed" pathLength="1000" data-k="speed"/>
      ${ticks}
      <path d="${arc(cx, cy, r, -130, -20)}" class="dl-in"/>
      <path d="${arc(cx, cy, r, -130, -20)}" class="dl-thr" pathLength="1000" data-k="thr"/>
      <path d="${arc(cx, cy, r, 130, 20)}" class="dl-in"/>
      <path d="${arc(cx, cy, r, 130, 20)}" class="dl-brk" pathLength="1000" data-k="brk"/>
      <text class="dl-arc-lbl"><textPath href="#thr${uid}" startOffset="50%">ACCÉLÉRATEUR</textPath></text>
      <text class="dl-arc-lbl"><textPath href="#brk${uid}" startOffset="50%">FREIN</textPath></text>
      <text x="${cx}" y="${cy - 6}" class="dl-speed-val" data-k="speedTxt">—</text>
      <text x="${cx}" y="${cy + 10}" class="dl-unit">KM/H</text>
      <text x="${cx}" y="${cy + 33}" class="dl-rpm" data-k="rpmTxt">—</text>
      <text x="${cx}" y="${cy + 46}" class="dl-unit">TR/MIN</text>
      <text x="${cx}" y="${cy + 70}" class="dl-energy" data-k="energy"></text>
      <text x="${cx}" y="${cy + 116}" class="dl-unit" data-k="energyLap"></text>
      <text x="${cx}" y="${cy + 96}" class="dl-gear"><tspan class="dl-unit">RAPPORT </tspan><tspan data-k="gearTxt">—</tspan></text>
    </svg>`;
    this.el = wrap.firstElementChild;
    this.k = {};
    for (const n of this.el.querySelectorAll('[data-k]')) this.k[n.dataset.k] = n;
    this.v = null;       // valeurs lissées affichées
    this.txt = {};
    this.setColor(color);
  }

  setColor(color) {
    if (color !== this.color) { this.color = color; this.k.speed.style.stroke = color; }
  }

  // Remplissage d'un arc (0 à 1) ; rien du tout à 0 (sinon le bout arrondi laisse un point)
  fill(path, f) {
    const v = Math.round(Math.max(0, Math.min(1, f)) * 1000);
    if (path._v === v) return;
    path._v = v;
    path.style.strokeDasharray = `${v} 3000`;
    path.style.opacity = v ? 1 : 0;
  }

  text(key, s) {
    if (this.txt[key] !== s) { this.txt[key] = s; this.k[key].textContent = s; }
  }

  // c : télémétrie interpolée (ou null) ; dt : secondes depuis l'image précédente ; e : énergie estimée
  // (energyOf), sous le régime
  update(c, dt = 0, e = null) {
    const tgt = c ? { speed: c.speed ?? 0, thr: c.thr ?? 0, brk: c.brk ?? 0, rpm: c.rpm ?? 0 } : { speed: 0, thr: 0, brk: 0, rpm: 0 };
    // Lissage exponentiel très court (~50 ms) : gomme les cassures entre échantillons sans retard visible
    const a = !this.v || !dt ? 1 : 1 - Math.exp(-dt / 0.05);
    if (!this.v) this.v = { ...tgt };
    for (const k of Object.keys(tgt)) this.v[k] += (tgt[k] - this.v[k]) * a;
    const v = this.v;
    this.fill(this.k.speed, v.speed / SPEED_MAX);
    this.fill(this.k.thr, v.thr / 100);
    this.fill(this.k.brk, v.brk / 100);
    this.text('speedTxt', c?.speed === null || c?.speed === undefined ? '—' : String(Math.round(v.speed)));
    this.text('rpmTxt', c?.rpm === null || c?.rpm === undefined ? '—' : String(Math.round(v.rpm / 10) * 10));
    this.text('gearTxt', c?.gear === 0 ? 'N' : c?.gear === null || c?.gear === undefined ? '—' : String(c.gear));
    const now = c ? e?.now : null;
    this.text('energy', now === 'harvest' ? t('RECHARGE') : now === 'clip' ? t('BATTERIE VIDE ?') : '');
    if (this.k.energy._k !== now) { this.k.energy._k = now; this.k.energy.setAttribute('class', `dl-energy ${now || ''}`); }
    const lap = e?.lap;
    this.text('energyLap', lap && (lap.harvest >= 0.5 || lap.clip >= 0.5) ? t('1 TOUR : RECHARGE {} S · VIDE {} S', dec(lap.harvest.toFixed(1)), dec(lap.clip.toFixed(1))) : '');
  }
}

// Énergie estimée d'un pilote (shared/energy.js) : état du moment (recharge, batterie vide) et
// secondes de chaque sur le dernier tour (durée du dernier tour bouclé), recalculées chaque seconde
const lapEnergy = new Map();
export function energyOf(num, at = displayNow()) {
  const hist = (from) => store.positions.carHistory(num, from, at);
  let lap = lapEnergy.get(num);
  if (!lap || Math.abs(at - lap.at) > 1000) {
    const dur = parseLapTime(store.state.TimingData?.Lines?.[num]?.LastLapTime?.Value) || 90;
    lap = { at, ...energyTotals(hist(at - dur * 1000)) };
    lapEnergy.set(num, lap);
  }
  return { now: energyNow(hist(at - 2500)), lap };
}

// Télémétrie d'un pilote à l'heure affichée (interpolée). Sans délai TV, l'échantillon suivant
// n'est souvent pas encore arrivé (la F1 les envoie par paquets) : la lecture se décale alors d'un
// petit retard qui s'ajuste tout seul (monte vite si les données manquent, redescend doucement),
// pour toujours interpoler entre deux échantillons au lieu d'avancer par à-coups.
let lag = 0, lagAt = 0;
export function carNow(num, t = displayNow()) {
  const last = store.positions.car.get(num)?.at(-1)?.t;
  const now = performance.now();
  const dt = lagAt ? Math.min(0.5, (now - lagAt) / 1000) : 0;
  lagAt = now;
  if (last !== undefined && t - last > -10000) {
    const need = Math.min(2000, t - last + 120);
    if (need > lag) lag += (need - lag) * Math.min(1, dt * 6);
    else lag = Math.max(need, lag - dt * 60);
    lag = Math.max(0, lag);
  }
  return store.positions.carLerp(num, t - lag);
}

// Vitesse des `span` dernières secondes, un trait par pilote, qui défile en continu
export class SpeedTrace {
  constructor(host, span = 30) {
    this.host = host;
    this.span = span;
    this.H = 110;
    host.innerHTML = `<svg class="sz-svg tele-trace" preserveAspectRatio="none"><g class="tt-grid"></g><g class="tt-lines"></g></svg><div class="muted small tt-empty" hidden>Pas encore de trace.</div>`;
    this.svg = host.firstElementChild;
    this.grid = this.svg.firstElementChild;
    this.lines = this.svg.lastElementChild;
    this.empty = host.lastElementChild;
    this.W = 0; this.lo = null; this.hi = null; this.polys = [];
    this.id = ++dialSeq;
  }

  // series : [{ num, color, dash }]
  update(series, now = displayNow()) {
    now -= lag;   // même retard que les compteurs
    const W = Math.max(300, Math.round(this.host.clientWidth || 600)), H = this.H, pl = 30, pr = 6, pt = 6, pb = 16;
    const data = series.map((s) => {
      const pts = store.positions.carHistory(s.num, now - this.span * 1000 - 1000, now).map((h) => [h.t, h.speed || 0]);
      const c = store.positions.carLerp(s.num, now);
      if (c && pts.length) pts.push([now, c.speed || 0]);
      return pts;
    });
    const all = data.flat().map((p) => p[1]);
    this.empty.hidden = !!all.length;
    this.svg.style.display = all.length ? '' : 'none';
    if (!all.length) return;
    // Échelle par pas de 20 km/h : ne change que rarement (pas de tremblement de la courbe)
    const lo = Math.max(0, Math.floor((Math.min(...all) - 10) / 20) * 20);
    const hi = Math.max(lo + 60, Math.ceil((Math.max(...all) + 10) / 20) * 20);
    const X = (t) => pl + ((t - now) / 1000 / this.span + 1) * (W - pl - pr);
    const Y = (y) => pt + (1 - (y - lo) / (hi - lo)) * (H - pt - pb);
    if (W !== this.W || lo !== this.lo || hi !== this.hi) {
      this.W = W; this.lo = lo; this.hi = hi;
      this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      let g = '';
      for (const v of [lo, (lo + hi) / 2, hi]) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 4}" y="${Y(v) + 3}" class="sz-ax" text-anchor="end">${Math.round(v)}</text>`;
      const XS = (x) => pl + ((x + this.span) / this.span) * (W - pl - pr);
      for (const x of [-30, -20, -10, 0].filter((x) => x >= -this.span)) g += `<text x="${XS(x)}" y="${H - 3}" class="sz-ax" text-anchor="${x === -this.span ? 'start' : x ? 'middle' : 'end'}">${x ? `${x} s` : 'maint.'}</text>`;
      g += `<clipPath id="ttclip${this.id}"><rect x="${pl}" y="0" width="${W - pl - pr}" height="${H}"/></clipPath>`;
      this.grid.innerHTML = g;
      this.lines.setAttribute('clip-path', `url(#ttclip${this.id})`);
    }
    while (this.polys.length < series.length) {
      const p = document.createElementNS(NS, 'polyline');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linejoin', 'round');
      this.lines.appendChild(p);
      this.polys.push(p);
    }
    while (this.polys.length > series.length) this.polys.pop().remove();
    series.forEach((s, i) => {
      const p = this.polys[i];
      p.setAttribute('stroke', s.color);
      if (s.dash) p.setAttribute('stroke-dasharray', '5 4'); else p.removeAttribute('stroke-dasharray');
      p.setAttribute('points', data[i].map(([t, y]) => `${X(t).toFixed(1)},${Y(y).toFixed(1)}`).join(' '));
    });
  }
}
