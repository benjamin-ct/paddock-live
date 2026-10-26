// Panneau « Analyse » (inspiré de MultiViewer) : Race Trace, positions tour par tour, temps au
// tour, historique des pneus, secteurs et vitesses de pointe. Calculé à partir de l'historique
// tour par tour (données dérivées) et des statistiques du chronométrage.
import { store, versionOf, on, setFocus } from '../store.js';
import { $, esc, api, drivers, orderedNumbers, sessionKind, teamColor, compoundInfo, fmtLap, lapSeconds, storageGet, storageSet, driverOpt } from '../util.js';
import { prefs, isFav } from '../prefs.js';
import { renderCompare, initCompare, openCompareLap } from './compare.js';
import { tx } from '../i18n.js';

const OPTS_KEY = 'paddock.analysis';
const opts = { trace: 'leader', ref: null, scope: 'top10', clamp: 60, lapsSlow: true, cutoff: 107, sort: 'ideal', ...storageGet(OPTS_KEY, {}) };
const saveOpts = () => storageSet(OPTS_KEY, opts);
// Clés de rendu par onglet (un onglet d'analyse peut être déplacé dans un autre panneau : plusieurs
// peuvent être affichés en même temps). Remise à zéro = tout redessiner.
let lastKeys = {};
let hoverX = null;
let highlight = null;

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

const RENDER = {};   // onglet -> fonction de rendu (rempli plus bas)

// Pilotes affichés dans les graphiques
function shownDrivers() {
  const nums = orderedNumbers(store.state);
  if (opts.scope === 'all') return nums;
  if (opts.scope === 'favs') { const f = nums.filter((n) => isFav(n)); return f.length ? f : nums.slice(0, 10); }
  if (opts.scope === 'duel') { const d = nums.filter((n) => n === store.duel.a || n === store.duel.b || n === store.focus); return d.length ? d : nums.slice(0, 5); }
  return nums.slice(0, 10);
}

// Pointillés pour le second pilote de chaque équipe (même couleur)
function dashFor(nums, dl) {
  const seen = new Map();
  const out = {};
  for (const n of orderedNumbers(store.state)) {
    const team = dl[n]?.TeamName || n;
    out[n] = seen.has(team);
    seen.set(team, true);
  }
  return (n) => out[n] || false;
}

// ---------------- Graphique multi-séries (canvas) ----------------
function multiChart(canvas, series, o) {
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(240, wrap.clientWidth), H = Math.max(160, wrap.clientHeight);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) {
    ctx.fillStyle = '#8b95a8'; ctx.font = '13px "Titillium Web", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(tx(o.empty || 'Pas encore de données (il faut quelques tours).'), W / 2, H / 2);
    canvas._map = null;
    return;
  }
  const padL = 46, padR = 54, padT = 10, padB = 22;
  let xMin = Math.min(...pts.map((p) => p.x)), xMax = Math.max(...pts.map((p) => p.x));
  if (xMax === xMin) xMax = xMin + 1;
  let yMin = o.yMin ?? Math.min(...pts.map((p) => p.y)), yMax = o.yMax ?? Math.max(...pts.map((p) => p.y));
  if (yMax === yMin) { yMax += 1; yMin -= 1; }
  const X = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  // invert : valeurs croissantes vers le bas (écarts, positions)
  const Y = (y) => (o.invert ? padT + ((y - yMin) / (yMax - yMin)) * (H - padT - padB) : padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB));

  // Grille
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-2').trim() || '#2a2a31'; ctx.lineWidth = 1; ctx.fillStyle = '#7a8396'; ctx.font = '11px "Titillium Web", sans-serif';
  const yTicks = o.yTicks || ticks(yMin, yMax, 5);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yTicks) { const y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(tx(o.yFmt ? o.yFmt(v) : String(v)), padL - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of ticks(xMin, xMax, 8).filter((v) => Number.isInteger(v))) ctx.fillText(tx(String(v)), X(v), H - padB + 5);

  // Périodes neutralisées (safety car, VSC, drapeau rouge), en tours
  for (const b of o.bands || []) {
    const x1 = X(Math.max(xMin, b.from)), x2 = X(Math.min(xMax, b.to));
    if (x2 < padL || x1 > W - padR) continue;
    const w = Math.max(3, x2 - x1);
    ctx.fillStyle = b.kind === 'red' ? 'rgba(255,59,48,.16)' : b.kind === 'vsc' ? 'rgba(255,176,32,.08)' : 'rgba(255,176,32,.14)';
    ctx.fillRect(x1, padT, w, H - padT - padB);
    ctx.fillStyle = b.kind === 'red' ? '#ff6b61' : '#ffb020';
    ctx.font = '700 10px "Titillium Web", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(tx(b.kind === 'red' ? 'DRAPEAU ROUGE' : b.kind === 'vsc' ? 'VSC' : 'SC'), x1 + 3, padT + 2);
  }

  // Séries (la série mise en avant est dessinée en dernier, plus épaisse)
  const order = [...series].sort((a, b) => (a.num === highlight) - (b.num === highlight));
  const labels = [];
  for (const s of order) {
    if (s.points.length < 1) continue;
    const dim = highlight && s.num !== highlight;
    ctx.globalAlpha = dim ? 0.25 : 1;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.num === highlight ? 3 : 1.8;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const y = Math.max(padT, Math.min(H - padB, Y(p.y)));
      if (i === 0 || p.x - s.points[i - 1].x > 1) ctx.moveTo(X(p.x), y); else ctx.lineTo(X(p.x), y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // Marque d'arrêt aux stands
    ctx.fillStyle = s.color;
    for (const p of s.points) if (p.pit) { ctx.beginPath(); ctx.arc(X(p.x), Math.max(padT, Math.min(H - padB, Y(p.y))), 3, 0, Math.PI * 2); ctx.fill(); }
    // Étiquette en bout de courbe (placée après, sans chevauchement)
    const last = s.points[s.points.length - 1];
    labels.push({ s, x: X(last.x) + 4, y: Math.max(padT + 5, Math.min(H - padB - 5, Y(last.y))), alpha: dim ? 0.25 : 1 });
  }
  // Étiquettes : écartées verticalement quand elles se touchent (même fin de courbe)
  const GAP = 11;
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1], cur = labels[i];
    if (Math.abs(cur.x - prev.x) < 34 && cur.y - prev.y < GAP) cur.y = prev.y + GAP;
  }
  for (let i = labels.length - 2; i >= 0; i--) {
    const next = labels[i + 1], cur = labels[i];
    if (next.y > H - padB - 5) next.y = H - padB - 5;
    if (Math.abs(cur.x - next.x) < 34 && next.y - cur.y < GAP) cur.y = next.y - GAP;
  }
  ctx.font = '700 10.5px "Titillium Web", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const l of labels) { ctx.globalAlpha = l.alpha; ctx.fillStyle = l.s.color; ctx.fillText(tx(l.s.label), l.x, l.y); }
  ctx.globalAlpha = 1;

  // Réticule
  if (hoverX !== null && hoverX >= xMin && hoverX <= xMax) {
    ctx.strokeStyle = document.documentElement.dataset.scheme === 'light' ? 'rgba(14,17,22,.3)' : 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.moveTo(X(hoverX), padT); ctx.lineTo(X(hoverX), H - padB); ctx.stroke();
  }
  canvas._map = { X, Y, xMin, xMax, padL, padR, W, H, padT, padB, series, o };
}

function ticks(min, max, count) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// Infobulle : valeurs de tous les pilotes affichés pour le tour survolé
function bindHover(canvas, tipEl) {
  canvas.addEventListener('mousemove', (e) => {
    const m = canvas._map;
    if (!m) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.round(m.xMin + ((e.clientX - r.left - m.padL) / (m.W - m.padL - m.padR)) * (m.xMax - m.xMin));
    hoverX = Math.max(m.xMin, Math.min(m.xMax, x));
    const rows = m.series.map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) })).filter((r2) => r2.p)
      .sort((a, b) => (m.o.invert ? a.p.y - b.p.y : b.p.y - a.p.y));
    tipEl.innerHTML = `<b>Tour ${hoverX}</b>${rows.slice(0, 22).map(({ s, p }) => `<div><i style="background:${s.color}"></i>${esc(s.label)} <span>${m.o.tipFmt ? m.o.tipFmt(p.y) : p.y}</span>${p.pit ? ' <em>stand</em>' : ''}</div>`).join('')}`;
    tipEl.hidden = !rows.length;
    const left = e.clientX - r.left + 14;
    tipEl.style.left = `${left + 170 > r.width ? left - 190 : left}px`;
    tipEl.style.top = `${Math.max(4, e.clientY - r.top - 20)}px`;
    lastKeys = {};
  });
  canvas.addEventListener('mouseleave', () => { hoverX = null; tipEl.hidden = true; lastKeys = {}; });
}

// ---------------- Données ----------------
const fmtGap = (v) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} s`);

// Heure de passage sur la ligne à la fin de chaque tour (ms), par pilote
function crossTimes() {
  const out = {};
  for (const [num, arr] of Object.entries(store.derived.laps || {})) {
    const m = new Map();
    for (const l of arr) if (l.lap > 0 && l.t) m.set(Number(l.lap), { t: l.t, pit: l.pit, pos: l.pos });
    out[num] = m;
  }
  return out;
}

function traceSeries() {
  const dl = drivers(store.state);
  const ct = crossTimes();
  const dashed = dashFor(null, dl);
  // Tour par tour : heure de passage du premier (leader) ou du pilote de référence
  const maxLap = Math.max(0, ...Object.values(ct).map((m) => Math.max(0, ...m.keys())));
  const leader = new Map();
  for (let lap = 1; lap <= maxLap; lap++) {
    let best = Infinity;
    for (const m of Object.values(ct)) { const v = m.get(lap); if (v && v.t < best) best = v.t; }
    if (best < Infinity) leader.set(lap, best);
  }
  let ref = leader;
  if (opts.trace === 'driver' && opts.ref && ct[opts.ref]) ref = new Map([...ct[opts.ref]].map(([k, v]) => [k, v.t]));
  if (opts.trace === 'average') {
    // Rythme moyen du leader sur la course : ligne de référence régulière
    const laps = [...leader.keys()];
    const l0 = laps[0], l1 = laps[laps.length - 1];
    const avg = l1 > l0 ? (leader.get(l1) - leader.get(l0)) / (l1 - l0) : 0;
    ref = new Map(laps.map((l) => [l, leader.get(l0) + (l - l0) * avg]));
  }
  return shownDrivers().filter((n) => ct[n]).map((n) => ({
    num: n,
    label: dl[n]?.Tla || n,
    color: teamColor(dl[n]),
    dashed: dashed(n),
    points: [...ct[n]].filter(([lap]) => ref.has(lap)).map(([lap, v]) => ({ x: lap, y: (v.t - ref.get(lap)) / 1000, pit: v.pit })),
  }));
}

function positionSeries() {
  const dl = drivers(store.state);
  const dashed = dashFor(null, dl);
  return shownDrivers().map((n) => ({
    num: n, label: dl[n]?.Tla || n, color: teamColor(dl[n]), dashed: dashed(n),
    points: (store.derived.laps?.[n] || []).filter((l) => l.lap > 0 && l.pos).map((l) => ({ x: Number(l.lap), y: l.pos, pit: l.pit })),
  }));
}

function lapTimeSeries() {
  const dl = drivers(store.state);
  const dashed = dashFor(null, dl);
  const all = [];
  const series = shownDrivers().map((n) => {
    const pts = (store.derived.laps?.[n] || []).map((l) => ({ x: Number(l.lap), y: lapSeconds(l.time), pit: l.pit })).filter((p) => p.x > 1 && p.y > 0);
    all.push(...pts.map((p) => p.y));
    return { num: n, label: dl[n]?.Tla || n, color: teamColor(dl[n]), dashed: dashed(n), points: pts };
  });
  if (opts.lapsSlow && all.length) {
    // Tours lents écartés (stands, safety car, drapeaux) : au-delà de 107 % du meilleur
    const best = Math.min(...all);
    for (const s of series) s.points = s.points.filter((p) => !p.pit && p.y <= best * (opts.cutoff / 100));
  }
  return series;
}

// Périodes de safety car / VSC / drapeau rouge en tours, d'après les messages de la direction de
// course (au rythme du délai TV)
export function neutralBands(state = store.state) {
  const raw = state.RaceControlMessages?.Messages;
  const msgs = Array.isArray(raw) ? raw : Object.values(raw || {});
  const out = [];
  let cur = null;
  const close = (lap) => { if (cur) { out.push({ ...cur, to: Math.max(cur.from + 0.5, lap) }); cur = null; } };
  for (const m of msgs) {
    const lap = Number(m?.Lap);
    if (!lap) continue;
    const text = String(m.Message || '').toUpperCase();
    if (m.Category === 'SafetyCar') {
      const vsc = /VIRTUAL/.test(String(m.Mode || text));
      if (m.Status === 'DEPLOYED') { if (!cur || cur.kind !== (vsc ? 'vsc' : 'sc')) { close(lap); cur = { kind: vsc ? 'vsc' : 'sc', from: lap }; } } else if (m.Status === 'ENDING' || m.Status === 'IN THIS LAP') close(lap);
    } else if (m.Flag === 'RED' && (m.Scope === 'Track' || /RED FLAG/.test(text))) {
      close(lap);
      out.push({ kind: 'red', from: lap - 0.15, to: lap + 0.15 });
    }
  }
  if (cur) out.push({ ...cur, to: Number(state.LapCount?.CurrentLap) || cur.from + 1 });
  return out;
}

// ---------------- Rendus ----------------
function renderTrace() {
  const series = traceSeries();
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const clamp = Number(opts.clamp) || 0;
  const yMin = Math.min(0, ...ys);
  const yMax = clamp ? Math.min(Math.max(...ys, 1), clamp) : undefined;
  multiChart($('#anaTraceCanvas'), series, { invert: true, yMin: opts.trace === 'leader' ? 0 : yMin, yMax, yFmt: (v) => `${v > 0 ? '+' : ''}${v}`, tipFmt: fmtGap, bands: neutralBands() });
}

function renderPositions() {
  const series = positionSeries();
  const n = orderedNumbers(store.state).length || 20;
  multiChart($('#anaPosCanvas'), series, { invert: true, yMin: 1, yMax: n, yTicks: [1, 5, 10, 15, 20].filter((v) => v <= n), yFmt: (v) => `P${v}`, tipFmt: (v) => `P${v}` });
}

// Rythme de course (inspiré de formula1dashboard.com) : répartition des tours « propres » de
// chaque pilote (boîte = 50 % des tours, trait = médiane, moustaches = min / max), classés par
// médiane, et les 20 tours les plus rapides de la séance.
function cleanLaps() {
  const dl = drivers(store.state);
  const all = [];
  const per = orderedNumbers(store.state).map((n) => {
    const laps = (store.derived.laps?.[n] || []).filter((l) => Number(l.lap) > 1 && !l.pit).map((l) => ({ n, lap: Number(l.lap), t: lapSeconds(l.time) })).filter((l) => l.t > 0);
    all.push(...laps);
    return { n, d: dl[n], laps };
  });
  const best = all.length ? Math.min(...all.map((l) => l.t)) : 0;
  const lim = best * (opts.cutoff / 100);
  for (const p of per) p.laps = p.laps.filter((l) => l.t <= lim);
  return { per, all: all.filter((l) => l.t <= lim), best };
}

const quant = (a, q) => { const i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };

function renderPace() {
  const { per, all } = cleanLaps();
  const rows = per.filter((p) => p.laps.length >= 3).map((p) => {
    const v = p.laps.map((l) => l.t).sort((a, b) => a - b);
    return { ...p, min: v[0], q1: quant(v, 0.25), med: quant(v, 0.5), q3: quant(v, 0.75), max: v.at(-1), count: v.length };
  }).sort((a, b) => a.med - b.med);
  const canvas = $('#anaPaceCanvas');
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(240, wrap.clientWidth), H = Math.max(160, wrap.clientHeight);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px "Titillium Web", sans-serif';
  if (!rows.length) {
    ctx.fillStyle = '#8b95a8'; ctx.textAlign = 'center'; ctx.fillText(tx('Pas encore assez de tours propres (3 par pilote minimum).'), W / 2, H / 2);
  } else {
    const padL = 54, padR = 8, padT = 10, padB = 34;
    const yMin = Math.min(...rows.map((r) => r.min)), yMax = Math.max(...rows.map((r) => r.max));
    const Y = (v) => padT + ((v - yMin) / Math.max(0.1, yMax - yMin)) * (H - padT - padB);
    const step = (W - padL - padR) / rows.length;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-2').trim() || '#2a2a31';
    ctx.fillStyle = '#7a8396'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticks(yMin, yMax, 5)) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke(); ctx.fillText(tx(fmtLap(v)), padL - 6, Y(v)); }
    rows.forEach((r, i) => {
      const cx = padL + step * (i + 0.5), bw = Math.min(26, step * 0.6);
      const c = teamColor(r.d);
      ctx.strokeStyle = c; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(cx, Y(r.min)); ctx.lineTo(cx, Y(r.q1)); ctx.moveTo(cx, Y(r.q3)); ctx.lineTo(cx, Y(r.max)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - bw / 4, Y(r.min)); ctx.lineTo(cx + bw / 4, Y(r.min)); ctx.moveTo(cx - bw / 4, Y(r.max)); ctx.lineTo(cx + bw / 4, Y(r.max)); ctx.stroke();
      ctx.globalAlpha = r.n === store.focus || !store.focus ? 0.9 : 0.55;
      ctx.fillStyle = c; ctx.fillRect(cx - bw / 2, Y(r.q1), bw, Math.max(2, Y(r.q3) - Y(r.q1)));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - bw / 2, Y(r.med)); ctx.lineTo(cx + bw / 2, Y(r.med)); ctx.stroke();
      ctx.save(); ctx.translate(cx, H - padB + 6); ctx.rotate(-Math.PI / 4); ctx.fillStyle = c; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = '700 10.5px "Titillium Web", sans-serif'; ctx.fillText(tx(r.d?.Tla || r.n), 0, 0); ctx.restore();
    });
    canvas._pace = { rows, padL, step };
  }
  const dl = drivers(store.state);
  const top = all.sort((a, b) => a.t - b.t).slice(0, 20);
  $('#anaFastest').innerHTML = `<table class="sector-board"><tr><th>#</th><th>Pilote</th><th>Tour</th><th>Temps</th></tr>${top.map((l, i) => `<tr data-num="${l.n}"><td>${i + 1}</td><td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[l.n])}"></span><b>${esc(dl[l.n]?.Tla || l.n)}</b></span></td><td>${l.lap}</td><td class="${i === 0 ? 'purple' : ''}">${fmtLap(l.t)}</td></tr>`).join('')}</table>`;
}

function renderLapTimes() {
  multiChart($('#anaLapCanvas'), lapTimeSeries(), { yFmt: (v) => fmtLap(v), tipFmt: (v) => fmtLap(v), empty: 'Pas encore de tours chronométrés.' });
}

function renderTyres() {
  const dl = drivers(store.state);
  const nums = orderedNumbers(store.state);
  const maxLap = Math.max(0, ...nums.map((n) => Math.max(0, ...(store.derived.laps?.[n] || []).map((l) => Number(l.lap) || 0))));
  const el = $('#anaTyres');
  if (!maxLap) { el.innerHTML = '<div class="note">Pas encore de tours.</div>'; return; }
  const best = Math.min(...nums.flatMap((n) => (store.derived.laps?.[n] || []).map((l) => lapSeconds(l.time)).filter((v) => v > 0)));
  const head = Array.from({ length: maxLap }, (_, i) => `<th>${i + 1}</th>`).join('');
  const rows = nums.map((n) => {
    const by = new Map((store.derived.laps?.[n] || []).map((l) => [Number(l.lap), l]));
    const cells = Array.from({ length: maxLap }, (_, i) => {
      const l = by.get(i + 1);
      if (!l) return '<td></td>';
      const ci = compoundInfo(l.compound);
      const v = lapSeconds(l.time);
      const cls = l.pit ? 'pit' : v && v <= best + 0.001 ? 'best' : '';
      return `<td class="${cls}${v ? ' cmp-link' : ''}" style="--tc:${ci.color}" ${v ? `data-cmp="${n}|${i + 1}"` : ''} title="Tour ${i + 1} · ${esc(ci.name)}${l.pit ? ' · stand' : ''}${v ? ' · clic : comparer ce tour' : ''}">${v ? fmtLap(v) : '—'}</td>`;
    }).join('');
    return `<tr><th class="sticky"><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[n])}"></span>${esc(dl[n]?.Tla || n)}</span></th>${cells}</tr>`;
  }).join('');
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 30;
  el.innerHTML = `<table class="tyre-hist"><tr><th class="sticky">Tour</th>${head}</tr>${rows}</table>
    <div class="small muted tyre-legend">${['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map((c) => `<span style="--tc:${compoundInfo(c).color}">${esc(compoundInfo(c).name)}</span>`).join('')} · case encadrée = arrêt aux stands · violet = meilleur tour</div>`;
  if (atEnd) el.scrollLeft = el.scrollWidth;
}

// Références du circuit (éditions précédentes) : chargées une fois par circuit
let records = null, recordsKey = '', recordsLoading = false;
function recordsStrip(rows, dl) {
  const info = store.state.SessionInfo;
  const key = info?.Meeting?.Circuit?.Key;
  const year = Number(String(info?.StartDate || '').slice(0, 4)) || new Date().getFullYear();
  if (!key) return '';
  const k = `${key}|${year}`;
  if (k !== recordsKey && !recordsLoading) {
    recordsLoading = true;
    api(`/api/records?key=${key}&year=${year}`).then((r) => { records = r; recordsKey = k; }).catch(() => { records = null; recordsKey = k; })
      .finally(() => { recordsLoading = false; lastKeys = {}; });
  }
  if (recordsKey !== k || !records?.editions?.length) return '';
  const race = sessionKind(store.state) === 'race';
  const ref = race ? records.bestRaceLap : records.bestPole;
  const last = records.editions[0];
  const lastRef = race ? last.fastest : last.pole;
  const best = rows.filter((r) => r.best > 0).sort((a, b) => a.best - b.best)[0];
  const cmp = (r) => (best && r ? ` <span class="${best.best <= r.time ? 'sec-better' : 'sec-worse'}">${best.best <= r.time ? '−' : '+'}${Math.abs(best.best - r.time).toFixed(3)} s</span>` : '');
  const item = (e, kind) => (e[kind] ? `<span class="rec-i"><b>${e.year}</b><i style="background:#${esc(e[kind].color || '888')}"></i><span class="rec-t">${esc(e[kind].tla)}</span>${fmtLap(e[kind].time)}</span>` : '<span></span>');
  return `<div class="rec-strip" style="--n:${records.editions.length}">
    <div class="rec-row"><span class="rec-k">Pole</span>${records.editions.map((e) => item(e, 'pole')).join('')}</div>
    <div class="rec-row"><span class="rec-k">Meilleur tour en course</span>${records.editions.map((e) => item(e, 'fastest')).join('')}</div>
    ${best ? `<div class="rec-row rec-now"><span class="rec-k">Cette séance</span><span class="rec-i"><i style="background:${teamColor(dl[best.n])}"></i><span class="rec-t">${esc(dl[best.n]?.Tla || best.n)}</span>${fmtLap(best.best)}</span>
      ${lastRef ? `<span class="muted">vs ${race ? 'meilleur tour' : 'pole'} ${last.year} :</span>${cmp(lastRef)}` : ''}
      ${ref && ref.year !== last.year ? `<span class="muted">· vs meilleur ${race ? 'tour' : 'pole'} (${ref.year}) :</span>${cmp(ref)}` : ''}</div>` : ''}
  </div>`;
}

function renderSectors() {
  const dl = drivers(store.state);
  const stats = store.state.TimingStats?.Lines || {};
  const lines = store.state.TimingData?.Lines || {};
  const nums = orderedNumbers(store.state);
  const rows = nums.map((n) => {
    const st = stats[n] || {};
    const sec = list(st.BestSectors).map((b) => lapSeconds(b?.Value));
    const sp = st.BestSpeeds || {};
    const speed = (k) => Number(sp[k]?.Value) || null;
    const ideal = sec.length === 3 && sec.every((v) => v > 0) ? sec[0] + sec[1] + sec[2] : null;
    const bestLap = lapSeconds(st.PersonalBestLapTime?.Value) || lapSeconds(lines[n]?.BestLapTime?.Value);
    return { n, s1: sec[0] || null, s2: sec[1] || null, s3: sec[2] || null, ideal, best: bestLap, i1: speed('I1'), i2: speed('I2'), fl: speed('FL'), st: speed('ST') };
  });
  const cols = [['s1', 'S1', 'time'], ['s2', 'S2', 'time'], ['s3', 'S3', 'time'], ['ideal', 'Tour idéal', 'time'], ['best', 'Meilleur tour', 'time'],
    ['i1', 'Inter 1', 'speed'], ['i2', 'Inter 2', 'speed'], ['fl', 'Ligne', 'speed'], ['st', 'Speed trap', 'speed']];
  const extreme = {};
  for (const [k, , kind] of cols) {
    const vals = rows.map((r) => r[k]).filter((v) => v > 0);
    extreme[k] = vals.length ? (kind === 'time' ? Math.min(...vals) : Math.max(...vals)) : null;
  }
  const kind = cols.find((c) => c[0] === opts.sort)?.[2] || 'time';
  rows.sort((a, b) => (a[opts.sort] > 0 ? 0 : 1) - (b[opts.sort] > 0 ? 0 : 1) || (kind === 'time' ? a[opts.sort] - b[opts.sort] : b[opts.sort] - a[opts.sort]));
  const fmt = (v, k) => (!v ? '<span class="dim">—</span>' : cols.find((c) => c[0] === k)[2] === 'time' ? (k === 'ideal' || k === 'best' ? fmtLap(v) : v.toFixed(3)) : String(v));
  // Écarts à un pilote de référence (comme MultiViewer) : temps en ±s, vitesses en ±km/h
  const ref = opts.secRef && rows.find((r) => r.n === opts.secRef);
  const cell = (r, k) => {
    const v = r[k];
    if (!ref || r === ref || !v || !ref[k]) return `<td class="${v && v === extreme[k] ? 'purple' : ''}${ref && r === ref ? ' sec-ref' : ''}">${fmt(v, k)}</td>`;
    const time = cols.find((c) => c[0] === k)[2] === 'time';
    const d = v - ref[k];
    const better = time ? d < 0 : d > 0;
    const txt = time ? `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(3)}` : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
    return `<td class="${d === 0 ? '' : better ? 'sec-better' : 'sec-worse'}" title="${fmt(v, k)}">${txt}</td>`;
  };
  const refSel = $('#secRef');
  const refHtml = `<option value="">Temps de chacun</option>${rows.filter((r) => dl[r.n]).map((r) => `<option value="${r.n}"${driverOpt(dl[r.n], r.n)}>Écart à ${esc(dl[r.n].Tla)}</option>`).join('')}`;
  if (refSel._html !== refHtml) { refSel.innerHTML = refHtml; refSel._html = refHtml; }
  refSel.value = ref ? ref.n : '';
  $('#anaSectors').innerHTML = `${recordsStrip(rows, dl)}<table class="sector-board"><tr><th>#</th><th>Pilote</th>${cols.map(([k, label]) => `<th class="${opts.sort === k ? 'sorted' : ''}" data-sort="${k}" title="Trier">${label}</th>`).join('')}</tr>
    ${rows.map((r, i) => `<tr data-num="${r.n}" class="${ref && r === ref ? 'is-ref' : ''}"><td>${i + 1}</td><td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[r.n])}"></span><b>${esc(dl[r.n]?.Tla || r.n)}</b></span></td>
      ${cols.map(([k]) => cell(r, k)).join('')}</tr>`).join('')}</table>
    <div class="small muted" style="padding:6px 10px">Tour idéal = meilleurs secteurs additionnés · violet = meilleur de la séance · vitesses en km/h</div>`;
}

// Onglets d'analyse affichés (actifs dans leur panneau, panneau visible), où qu'ils soient
// Données du chronométrage seules changées (plusieurs fois par seconde en course) : une fois par seconde au plus ;
// réglages, survol, pilote suivi, taille : tout de suite
const lastAt = {};
export function renderAnalysis(force = false) {
  const data = versionOf(['TimingData', 'TimingAppData', 'TimingStats', 'DriverList', 'RaceControlMessages', '__reset']);
  const ui = `${JSON.stringify(opts)}|${highlight}|${hoverX}|${store.duel.a}|${store.duel.b}|${prefs.favs.join()}`;
  for (const [tab, fn] of Object.entries(RENDER)) {
    const pane = document.querySelector(`[data-pane="${tab}"]`);
    if (!pane?.classList.contains('active') || !pane.offsetParent) continue;
    const view = `|${ui}|${pane.clientWidth}x${pane.clientHeight}`;
    const key = `${data}${view}`;
    if (!force && key === lastKeys[tab]) continue;
    if (!force && lastKeys[tab]?.endsWith(view) && performance.now() - (lastAt[tab] || 0) < 1000) continue;
    lastKeys[tab] = key;
    lastAt[tab] = performance.now();
    fn();
  }
}
Object.assign(RENDER, { trace: renderTrace, positions: renderPositions, laptimes: renderLapTimes, tyrehist: renderTyres, sectors: renderSectors, pace: renderPace, compare: renderCompare });

function fillRefSelect() {
  const dl = drivers(store.state);
  const sel = $('#anaRef');
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  const html = nums.map((n) => `<option value="${n}" ${n === opts.ref ? 'selected' : ''}${driverOpt(dl[n], n)}>${esc(dl[n].Tla)}</option>`).join('');
  if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
  if (!opts.ref && nums[0]) opts.ref = nums[0];
}

export function initAnalysis() {
  initCompare();
  for (const id of ['anaTraceCanvas', 'anaPosCanvas', 'anaLapCanvas']) bindHover($(`#${id}`), $(`#${id}`).parentElement.querySelector('.ana-tip'));
  const sync = () => {
    $('#anaTrace').value = opts.trace;
    $('#anaClamp').value = String(opts.clamp);
    $('#anaRefWrap').hidden = opts.trace !== 'driver';
    for (const s of document.querySelectorAll('.ana-scope')) s.value = opts.scope;
    $('#anaSlow').checked = opts.lapsSlow;
    for (const r of document.querySelectorAll('.ana-cutoff')) r.value = opts.cutoff;
    for (const o of document.querySelectorAll('.ana-cutoff-val')) o.textContent = `${opts.cutoff} %`;
  };
  sync();
  const set = (k, v) => { opts[k] = v; saveOpts(); sync(); renderAnalysis(true); };
  $('#anaTrace').addEventListener('change', (e) => set('trace', e.target.value));
  $('#anaClamp').addEventListener('change', (e) => set('clamp', Number(e.target.value)));
  $('#anaRef').addEventListener('change', (e) => set('ref', e.target.value));
  for (const s of document.querySelectorAll('.ana-scope')) s.addEventListener('change', (e) => set('scope', e.target.value));
  $('#anaSlow').addEventListener('change', (e) => set('lapsSlow', e.target.checked));
  for (const r of document.querySelectorAll('.ana-cutoff')) r.addEventListener('input', (e) => set('cutoff', Number(e.target.value)));
  $('#anaFastest').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-num]'); if (tr) setFocus(tr.dataset.num); });
  // Export d'un graphique en image PNG (fond du thème)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.ana-png');
    if (!b) return;
    const src = b.closest('.tabpane').querySelector('canvas');
    if (!src) return;
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const c = out.getContext('2d');
    c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#0b0b0d';
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(src, 0, 0);
    const a = document.createElement('a');
    a.download = `paddock-live-${b.closest('.tabpane').dataset.pane}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  });
  $('#secRef').addEventListener('change', (e) => set('secRef', e.target.value || null));
  // Comparer un tour précis : clic sur un temps (Pneus) ou sur un point du graphique Temps au tour
  $('#anaTyres').addEventListener('click', (e) => {
    const td = e.target.closest('[data-cmp]');
    if (td) { const [n, lap] = td.dataset.cmp.split('|'); openCompareLap(n, lap); }
  });
  $('#anaLapCanvas').addEventListener('click', (e) => {
    const m = $('#anaLapCanvas')._map;
    if (!m || hoverX === null) return;
    const y = e.clientY - $('#anaLapCanvas').getBoundingClientRect().top;
    let best = null;
    for (const sr of m.series) {
      const p = sr.points.find((q) => q.x === hoverX);
      if (!p) continue;
      const d = Math.abs(m.Y(p.y) - y);
      if (d < 16 && (!best || d < best.d)) best = { d, num: sr.num };
    }
    if (best) openCompareLap(best.num, hoverX);
  });
  $('#anaSectors').addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) { set('sort', th.dataset.sort); return; }
    const tr = e.target.closest('tr[data-num]');
    if (tr) setFocus(tr.dataset.num);
  });
  // Survol du nom en bout de courbe : met le pilote en avant ; clic : pilote suivi
  for (const id of ['anaTraceCanvas', 'anaPosCanvas', 'anaLapCanvas']) {
    $(`#${id}`).addEventListener('click', () => {
      const m = $(`#${id}`)._map;
      if (!m || hoverX === null) return;
      highlight = highlight ? null : store.focus;
      lastKeys = {};
    });
  }
  on('focus', () => { highlight = store.focus; lastKeys = {}; });
  setInterval(fillRefSelect, 2000);
  fillRefSelect();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { lastKeys = {}; });
    for (const b of document.querySelectorAll('.panel-body')) ro.observe(b);
  }
  // Changement d'onglet (dans n'importe quel panneau : les onglets se déplacent)
  document.addEventListener('click', (e) => { if (e.target.closest('[data-tabs] [data-tab]')) setTimeout(() => renderAnalysis(true), 0); });
  on('tabsMoved', () => setTimeout(() => renderAnalysis(true), 0));
}
