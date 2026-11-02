// Rythme de course d'un Grand Prix passé (Saison → Grand Prix) à partir de l'analyse des archives F1 Live Timing :
// 20 meilleurs tours, tours propres (seuil réglable, % du meilleur tour de la course), évolution du rythme, répartition
// des temps (boîtes à moustaches) et positions tour par tour.
import { esc } from '../util.js';
import { median } from '/shared/season-calc.js';
import { fmtLap } from './season-stats.js';

let cut = 107;          // seuil des tours propres (% du meilleur tour de la course)
let scope = 'top';      // 'top' (10 premiers à l'arrivée) | 'all'
export const setPaceCut = (v) => { cut = Math.min(115, Math.max(101, Number(v) || 107)); };
export const setPaceScope = (v) => { scope = v; };

const PIT = 1, NEUTRAL = 2, LAP1 = 4;   // drapeaux de chaque tour (shared/race-stats.js)
const COMP = { SOFT: ['T', '#e8002d'], MEDIUM: ['M', '#ffd12e'], HARD: ['D', '#e5e5e5'], INTERMEDIATE: ['I', '#43b02a'], WET: ['P', '#0067ad'] };
// Graduation : « 1:38 », « 1:38,5 »
const axis = (t) => fmtLap(t).replace(/0+$/, '').replace(/[.,]$/, '');
const pageWidth = () => Math.max(600, (document.querySelector('#szContent')?.clientWidth || 934) - 34);

// Pneu de chaque tour d'après les relais (dans l'ordre, n tours chacun)
function compoundAt(d, lap) {
  let end = 0;
  for (const s of d.stints || []) { end += s.n; if (lap <= end) return s.c; }
  return null;
}
const tyre = (c) => (COMP[c] ? `<span class="sz-tyre" style="--tc:${COMP[c][1]}" title="${esc(c)}">${COMP[c][0]}</span>` : '');

export function renderPace(an, results) {
  if (!an?.drivers?.length) return '';
  const order = results.map((x) => x.code);
  const drivers = [...an.drivers].sort((a, b) => ((order.indexOf(a.tla) + 1) || 99) - ((order.indexOf(b.tla) + 1) || 99));
  const all = drivers.flatMap((d) => d.laps.map((l) => ({ d, lap: l[0], t: l[1], f: l[2], pos: l[3] }))).filter((l) => l.t > 0);
  if (!all.length) return '';
  const fastest = Math.min(...all.map((l) => l.t));
  const clean = (l) => !(l.f & (PIT | NEUTRAL | LAP1)) && l.t <= fastest * (cut / 100);
  const shown = scope === 'all' ? drivers : drivers.slice(0, 10);
  const seen = new Set();
  const style = new Map(shown.map((d) => { const dash = seen.has(d.team); seen.add(d.team); return [d.tla, { col: d.color || '#888', dash }]; }));
  const W = pageWidth();

  // 20 meilleurs tours de la course
  const top = [...all].sort((a, b) => a.t - b.t).slice(0, 20);
  const best = `<section class="sz-box"><h3>20 meilleurs tours</h3><div class="sz-scroll"><table class="sz-table"><tr><th>#</th><th>Pilote</th><th>Tour</th><th>Temps</th><th>Écart</th><th>Pneu</th></tr>
    ${top.map((l, i) => `<tr><td>${i + 1}</td><td><span class="drv-bar" style="background:${l.d.color || '#888'}"></span><b>${esc(l.d.last || l.d.tla)}</b> <span class="muted small">${esc(l.d.team || '')}</span></td><td>${l.lap}</td><td><b>${fmtLap(l.t)}</b></td><td class="muted">${i ? `+${fmtLap(l.t - fastest)}` : ''}</td><td>${tyre(compoundAt(l.d, l.lap))}</td></tr>`).join('')}</table></div></section>`;

  // Évolution du rythme : tours propres de chaque pilote affiché
  const laps = Math.max(...all.map((l) => l.lap));
  const cleanAll = all.filter(clean);
  const lo = Math.min(...cleanAll.map((l) => l.t)), hi = Math.max(...cleanAll.map((l) => l.t));
  const H = 300, pl = 54, pr = 14, pt = 10, pb = 24;
  const X = (lap) => pl + ((lap - 1) / Math.max(1, laps - 1)) * (W - pl - pr);
  const Y = (t) => pt + ((t - lo) / Math.max(0.5, hi - lo)) * (H - pt - pb);
  let grid = '';
  const step = [0.5, 1, 2, 5].find((s) => (hi - lo) / s <= 6) || 10;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(t) + 4}" class="sz-ax" text-anchor="end">${axis(t)}</text>`;
  for (let lap = 5; lap <= laps; lap += 5) grid += `<text x="${X(lap)}" y="${H - 6}" class="sz-ax" text-anchor="middle">${lap}</text>`;
  const trace = shown.map((d) => {
    const s = style.get(d.tla);
    const pts = d.laps.map((l) => ({ lap: l[0], t: l[1], f: l[2] })).filter(clean);
    return pts.length > 1 ? `<polyline fill="none" stroke="${s.col}" stroke-width="1.6" ${s.dash ? 'stroke-dasharray="4 3"' : 'pathLength="1"'} points="${pts.map((p) => `${X(p.lap)},${Y(p.t)}`).join(' ')}"><title>${esc(d.tla)}</title></polyline>` : '';
  }).join('');
  const evo = `<section class="sz-box"><h3>Évolution du rythme (tours propres)</h3><div class="sz-scroll"><svg viewBox="0 0 ${W} ${H}" class="sz-svg">${grid}${trace}</svg></div>
    <div class="sz-legend small">${shown.map((d) => `<span><i style="background:${style.get(d.tla).col}${style.get(d.tla).dash ? ';opacity:.6' : ''}"></i>${esc(d.tla)}</span>`).join('')}</div></section>`;

  // Répartition des temps des tours propres (boîtes à moustaches), du plus rapide au plus lent en médiane
  const boxes = shown.map((d) => {
    const v = d.laps.map((l) => ({ t: l[1], f: l[2] })).filter(clean).map((l) => l.t).sort((a, b) => a - b);
    if (v.length < 4) return null;
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
    return { d, n: v.length, min: v[0], q1: q(0.25), med: median(v), q3: q(0.75), max: v.at(-1) };
  }).filter(Boolean).sort((a, b) => a.med - b.med);
  let box = '';
  if (boxes.length) {
    const bl = 54, br = 70, row = 22, bh = boxes.length * row + 26;
    const bmin = Math.min(...boxes.map((b) => b.min)), bmax = Math.max(...boxes.map((b) => b.max));
    const BX = (t) => bl + ((t - bmin) / Math.max(0.2, bmax - bmin)) * (W - bl - br);
    let g = '';
    for (let t = Math.ceil(bmin / step) * step; t <= bmax; t += step) g += `<line x1="${BX(t)}" x2="${BX(t)}" y1="4" y2="${bh - 20}" class="sz-gl"/><text x="${BX(t)}" y="${bh - 6}" class="sz-ax" text-anchor="middle">${axis(t)}</text>`;
    const items = boxes.map((b, i) => {
      const y = 8 + i * row, c = style.get(b.d.tla).col;
      return `<text x="${bl - 6}" y="${y + 11}" class="sz-ax" text-anchor="end">${esc(b.d.tla)}</text>
        <line x1="${BX(b.min)}" x2="${BX(b.max)}" y1="${y + 7}" y2="${y + 7}" stroke="${c}" stroke-width="1.2" opacity=".7"/>
        <rect x="${BX(b.q1)}" y="${y}" width="${Math.max(2, BX(b.q3) - BX(b.q1))}" height="14" rx="3" fill="${c}" fill-opacity=".35" stroke="${c}"><title>${esc(b.d.tla)} : médiane ${fmtLap(b.med)} · ${b.n} tours propres</title></rect>
        <line x1="${BX(b.med)}" x2="${BX(b.med)}" y1="${y - 1}" y2="${y + 15}" stroke="var(--text)" stroke-width="2"/>
        <text x="${W - br + 6}" y="${y + 11}" class="sz-ax">${fmtLap(b.med)}</text>`;
    }).join('');
    box = `<section class="sz-box"><h3>Répartition des temps (tours propres)</h3><div class="sz-scroll"><svg viewBox="0 0 ${W} ${bh}" class="sz-svg">${g}${items}</svg></div>
      <div class="muted small">Boîte : la moitié des tours (du 1er au 3e quart), trait : la médiane, ligne : du plus rapide au plus lent.</div></section>`;
  }

  // Positions tour par tour
  const PH = 320, ppl = 30, ppr = 46;
  const PX = (lap) => ppl + ((lap - 1) / Math.max(1, laps - 1)) * (W - ppl - ppr);
  const PY = (p) => pt + ((p - 1) / 21) * (PH - pt - pb);
  let pg = '';
  for (const p of [1, 5, 10, 15, 20]) pg += `<line x1="${ppl}" x2="${W - ppr}" y1="${PY(p)}" y2="${PY(p)}" class="sz-gl"/><text x="${ppl - 6}" y="${PY(p) + 4}" class="sz-ax" text-anchor="end">${p}</text>`;
  for (let lap = 5; lap <= laps; lap += 5) pg += `<text x="${PX(lap)}" y="${PH - 6}" class="sz-ax" text-anchor="middle">${lap}</text>`;
  const posLines = shown.map((d) => {
    const s = style.get(d.tla);
    const pts = d.laps.filter((l) => l[3]).map((l) => `${PX(l[0])},${PY(l[3])}`);
    const last = d.laps.filter((l) => l[3]).at(-1);
    return pts.length > 1 ? `<polyline fill="none" stroke="${s.col}" stroke-width="1.8" ${s.dash ? 'stroke-dasharray="4 3"' : 'pathLength="1"'} points="${pts.join(' ')}"><title>${esc(d.tla)}</title></polyline><text x="${PX(last[0]) + 4}" y="${PY(last[3]) + 4}" fill="${s.col}" class="sz-lbl">${esc(d.tla)}</text>` : '';
  }).join('');
  const pos = `<section class="sz-box"><h3>Positions tour par tour</h3><div class="sz-scroll"><svg viewBox="0 0 ${W} ${PH}" class="sz-svg">${pg}${posLines}</svg></div></section>`;

  return `<section class="sz-box sz-pace-opts"><h3>Rythme de course</h3>
      <div class="sz-grid-opts"><div class="tab-seg">${[['top', '10 premiers'], ['all', 'Tous les pilotes']].map(([k, l]) => `<button type="button" data-pace-scope="${k}" class="${scope === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="small sz-pace-cut"><span>Tours propres : jusqu'à <b>${cut} %</b> du meilleur tour</span><input type="range" id="szPaceCut" min="101" max="115" step="1" value="${cut}"></label></div>
      <div class="muted small">Sans le 1er tour, les tours avec un arrêt et ceux sous voiture de sécurité (réelle ou virtuelle).</div></section>
    ${evo}${box}${pos}${best}`;
}
