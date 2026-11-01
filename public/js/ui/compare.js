// Analyse → Comparaison : meilleurs tours de deux pilotes, secteur par secteur et mini-secteur
// par mini-secteur (P1 contre P2 par défaut, ou deux pilotes au choix). Les mini-secteurs sont
// mesurés par le serveur avec le GPS (voir server/compare.js), au rythme du délai TV.
import { store, serverNow, versionOf } from '../store.js';
import { $, esc, api, drivers, orderedNumbers, fmtLap, lapSeconds, storageGet, storageSet, driverOpt } from '../util.js';
import { cornerStats, typeStats, smoothDelta } from './compare-calc.js';

const KEY = 'paddock.compare';
const sel = { a: null, b: null, ...storageGet(KEY, {}), la: null, lb: null };   // null : P1 / P2 automatiques, meilleurs tours
let data = null;
let loading = false;
let lastReq = '';
let lastAt = 0;

const COL_A = 'var(--blue)', COL_B = 'var(--orange)';
const sgn = (v, d = 3) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;

// Pilotes classés ayant un meilleur tour
function ranked() {
  const lines = store.state.TimingData?.Lines || {};
  return orderedNumbers(store.state).filter((n) => lines[n]?.BestLapTime?.Value);
}

function pair() {
  const r = ranked();
  const a = sel.a && r.includes(sel.a) ? sel.a : r[0];
  const b = sel.b && r.includes(sel.b) && sel.b !== a ? sel.b : r.find((n) => n !== a);
  return [a, b];
}

function fillSelects(a, b) {
  const dl = drivers(store.state);
  const r = ranked();
  for (const [id, v] of [['#cmpA', a], ['#cmpB', b]]) {
    const el = $(id);
    const html = r.map((n, i) => `<option value="${n}"${driverOpt(dl[n] || {}, n)}>P${i + 1} · ${esc(dl[n]?.Tla || n)}</option>`).join('');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    if (v) el.value = v;
  }
  // Tour comparé : meilleur tour ou n'importe quel tour chronométré
  for (const [id, n, k] of [['#cmpLapA', a, 'la'], ['#cmpLapB', b, 'lb']]) {
    const el = $(id);
    const laps = (store.derived.laps?.[n] || []).filter((l) => lapSeconds(l.time) > 0);
    const html = `<option value="">Meilleur tour</option>${laps.map((l) => `<option value="${l.lap}">Tour ${l.lap} · ${fmtLap(lapSeconds(l.time))}${l.pit ? ' (stand)' : ''}</option>`).join('')}`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.value = sel[k] && laps.some((l) => Number(l.lap) === Number(sel[k])) ? String(sel[k]) : '';
  }
}

async function load(a, b) {
  const lines = store.state.TimingData?.Lines || {};
  const req = `${a}|${b}|${sel.la}|${sel.lb}|${lines[a]?.BestLapTime?.Value}|${lines[b]?.BestLapTime?.Value}|${store.status?.source?.path || ''}`;
  if (loading || (req === lastReq && Date.now() - lastAt < 30000)) return;
  loading = true;
  lastReq = req;
  lastAt = Date.now();
  try {
    data = await api(`/api/compare?a=${a}&b=${b}&until=${Math.round(serverNow() - store.delay)}${sel.la ? `&la=${sel.la}` : ''}${sel.lb ? `&lb=${sel.lb}` : ''}`);
  } catch (err) {
    data = { error: err.message };
  } finally {
    loading = false;
  }
  draw();
}

function trackSvg(d) {
  const all = d.minis.flatMap((m) => m.pts);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const pad = Math.max(w, h) * 0.06;
  const sw = Math.max(w, h) / 70;
  const paths = d.minis.map((m, i) => {
    const delta = d.a.mini[i] - d.b.mini[i];
    const col = Math.abs(delta) < 0.0005 ? 'var(--muted)' : delta < 0 ? COL_A : COL_B;
    const pts = m.pts.map((p) => `${p[0]},${p[1]}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${m.approx ? `stroke-dasharray="${sw * 2.2} ${sw * 0.9}"` : ''}><title>Mini-secteur ${esc(m.name)} : ${esc(delta < 0 ? d.a.tla : d.b.tla)} plus rapide de ${Math.abs(delta).toFixed(3)} s${m.approx ? ' (emplacement estimé)' : ''}</title></polyline>`;
  }).join('');
  const s = d.minis[0].pts[0];
  return `<svg class="cmp-map" viewBox="${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}" preserveAspectRatio="xMidYMid meet">
    <g opacity=".22">${d.minis.map((m) => `<polyline points="${m.pts.map((p) => `${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="var(--text)" stroke-width="${sw * 2.4}" stroke-linecap="round"/>`).join('')}</g>
    ${paths}<circle cx="${s[0]}" cy="${s[1]}" r="${sw * 1.3}" fill="#fff" stroke="#000" stroke-width="${sw * 0.4}"><title>Ligne d'arrivée</title></circle></svg>`;
}

function deltaSvg(d) {
  const W = 600, H = 150, pl = 40, pr = 12, pt = 12, pb = 22;
  let cum = 0;
  const pts = [[0, 0], ...d.minis.map((m, i) => { cum += d.a.mini[i] - d.b.mini[i]; return [m.to, cum]; })];
  const max = Math.max(0.1, ...pts.map((p) => Math.abs(p[1])));
  const X = (f) => pl + f * (W - pl - pr), Y = (v) => pt + ((max - v) / (2 * max)) * (H - pt - pb);
  const secLines = [1, 2].map((si) => d.minis.find((m) => m.sector === si)?.from).filter((f) => f > 0)
    .map((f, i) => `<line x1="${X(f)}" x2="${X(f)}" y1="${pt}" y2="${H - pb}" class="cmp-sec"/><text x="${X(f) + 4}" y="${H - 8}" class="cmp-ax">S${i + 2}</text>`).join('');
  return `<svg class="cmp-delta" viewBox="0 0 ${W} ${H}">
    <text x="${pl - 6}" y="${Y(max) + 4}" class="cmp-ax" text-anchor="end">+${max.toFixed(2)}</text>
    <text x="${pl - 6}" y="${Y(0) + 4}" class="cmp-ax" text-anchor="end">0</text>
    <text x="${pl - 6}" y="${Y(-max) + 4}" class="cmp-ax" text-anchor="end">−${max.toFixed(2)}</text>
    <line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" class="cmp-zero"/>
    <text x="${X(0) + 4}" y="${H - 8}" class="cmp-ax">S1</text>${secLines}
    <polyline points="${pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="var(--text)" stroke-width="2"/>
    ${pts.slice(1).map((p) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="2.5" fill="${p[1] < 0 ? COL_A : p[1] > 0 ? COL_B : 'var(--muted)'}"/>`).join('')}</svg>`;
}

// ---------- Comparaison de télémétrie (trace du serveur : K+1 points sur la distance du tour) ----------
const TW = 640, TL = 46, TR = 10;   // largeur, marges gauche et droite des courbes
const tx = (tr, i) => TL + (i / tr.K) * (TW - TL - TR);
const km = (tr, i) => (tr.len ? `${((i / tr.K) * tr.len / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round((i / tr.K) * 100)} %`);

// Courbes empilées : écart cumulé, vitesse, accélérateur, frein, rapport, régime ; numéros des virages en haut
function traceSvg(d) {
  const tr = d.trace, A = tr.a, B = tr.b;
  const rows = [
    { key: 'dt', label: 'Écart (s)', h: 96 },
    ...(tr.tel ? [
      { key: 'v', label: 'Vitesse (km/h)', h: 130 },
      { key: 'th', label: 'Accélérateur (%)', h: 56, min: 0, max: 100 },
      { key: 'br', label: 'Frein', h: 30, min: 0, max: 100 },
      { key: 'g', label: 'Rapport', h: 56, min: 1, max: 8 },
      { key: 'rpm', label: 'Régime (tr/min)', h: 56 },
    ] : []),
  ];
  const dt = smoothDelta(tr);
  let y = 28, body = '';
  for (const r of rows) {
    const sa = r.key === 'dt' ? dt : A[r.key], sb = r.key === 'dt' ? null : B[r.key];
    const vals = [...sa, ...(sb || [])].filter((v) => v !== null);
    if (!vals.length) continue;
    let lo = r.min ?? Math.min(...vals), hi = r.max ?? Math.max(...vals);
    if (r.key === 'dt') { hi = Math.max(0.05, ...vals.map(Math.abs)); lo = -hi; }
    if (hi === lo) hi = lo + 1;
    const Y = (v) => y + 4 + ((hi - v) / (hi - lo)) * (r.h - 8);
    const line = (s) => {
      let dpath = '', pen = false;
      s.forEach((v, i) => { if (v === null) { pen = false; return; } dpath += `${pen ? 'L' : 'M'}${tx(tr, i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      return dpath;
    };
    body += `<g class="ctl-row"><rect x="${TL}" y="${y}" width="${TW - TL - TR}" height="${r.h}" class="ctl-bg"/>
      <text x="${TL - 5}" y="${y + 12}" class="cmp-ax" text-anchor="end">${r.key === 'dt' ? `+${hi.toFixed(2)}` : Math.round(hi)}</text>
      <text x="${TL - 5}" y="${y + r.h - 3}" class="cmp-ax" text-anchor="end">${r.key === 'dt' ? `−${hi.toFixed(2)}` : Math.round(lo)}</text>
      <text x="${TL + 5}" y="${y + 12}" class="ctl-label">${esc(r.label)}</text>`;
    if (r.key === 'dt') {
      // Au-dessus de 0 : B devant (A perd du temps) ; zone colorée selon le pilote devant
      const z = Y(0);
      body += `<line x1="${TL}" x2="${TW - TR}" y1="${z}" y2="${z}" class="cmp-zero"/>
        <path d="${line(dt)}" fill="none" stroke="var(--text)" stroke-width="1.6"/>
        <text x="${TW - TR - 4}" y="${y + 12}" class="ctl-label" text-anchor="end" style="fill:${COL_B}">${esc(d.b.tla)} devant ▲</text>
        <text x="${TW - TR - 4}" y="${y + r.h - 4}" class="ctl-label" text-anchor="end" style="fill:${COL_A}">${esc(d.a.tla)} devant ▼</text>`;
    } else {
      body += `<path d="${line(sb)}" fill="none" stroke="${COL_B}" stroke-width="1.4" opacity=".95"/><path d="${line(sa)}" fill="none" stroke="${COL_A}" stroke-width="1.4"/>`;
    }
    body += '</g>';
    y += r.h + 6;
  }
  // Numéros des virages : sur une deuxième rangée quand ils sont trop près du précédent
  let lastX = -99, row = 0;
  const marks = tr.corners.map((c) => {
    const x = tx(tr, c.q * tr.K);
    row = x - lastX < 16 ? 1 - row : 0;
    lastX = x;
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${row ? 22 : 13}" y2="${y - 6}" class="ctl-corner"/><text x="${x.toFixed(1)}" y="${row ? 21 : 11}" class="cmp-ax" text-anchor="middle">${c.n}</text>`;
  }).join('');
  const ticks = tr.len ? Array.from({ length: Math.floor(tr.len / 500) + 1 }, (_, k) => k * 500).map((m) => { const x = tx(tr, (m / tr.len) * tr.K).toFixed(1); return `<text x="${x}" y="${y + 8}" class="cmp-ax" text-anchor="middle">${(m / 1000).toFixed(1).replace('.', ',')}</text>`; }).join('') : '';
  return `<svg class="ctl-svg" viewBox="0 0 ${TW} ${y + 12}">${marks}${body}${ticks}
    <line class="ctl-cursor" x1="0" x2="0" y1="24" y2="${y - 6}" visibility="hidden"/><rect class="ctl-hit" x="${TL}" y="0" width="${TW - TL - TR}" height="${y}" fill="transparent"/></svg>`;
}

// Lecture au survol (ou au doigt) : distance, écart et valeurs des deux pilotes au point choisi
function wireTrace(el, d) {
  const svg = el.querySelector('.ctl-svg'), out = el.querySelector('.ctl-read');
  if (!svg || !out) return;
  const tr = d.trace, cur = svg.querySelector('.ctl-cursor');
  const show = (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * TW;
    const i = Math.max(0, Math.min(tr.K, Math.round(((x - TL) / (TW - TL - TR)) * tr.K)));
    cur.setAttribute('x1', tx(tr, i)); cur.setAttribute('x2', tx(tr, i)); cur.setAttribute('visibility', 'visible');
    const one = (s, x2, col) => `<span style="color:${col}"><b>${esc(x2.tla)}</b> ${s.v[i] ?? '—'} km/h · ${s.g[i] ? `${s.g[i]}e` : 'N'} · ${s.th[i] ?? '—'} %${s.br[i] > 0 ? ' · frein' : ''}</span>`;
    const g = smoothDelta(tr)[i];
    out.innerHTML = `<span class="muted">${km(tr, i)}</span>${g === null ? '' : ` · <b>${sgn(g)} s</b>`}${tr.tel ? ` · ${one(tr.a, d.a, COL_A)} · ${one(tr.b, d.b, COL_B)}` : ''}`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { cur.setAttribute('visibility', 'hidden'); out.innerHTML = '<span class="muted">Survoler les courbes pour lire les valeurs</span>'; });
}

const TYPE_FR = { slow: ['Lents', 'sous 120 km/h'], medium: ['Moyens', '120 à 225 km/h'], fast: ['Rapides', 'plus de 225 km/h'], straight: ['Lignes droites et le reste', 'vitesse de pointe'] };
const ACT = { flat: ['À fond', 'flat'], lift: ['Levé', 'lift'], brake: ['Freiné', 'brake'] };

// Virages : actions de chaque pilote, tableau par type de virage, tableau virage par virage
function cornersHtml(d) {
  const tr = d.trace, st = cornerStats(tr), A = d.a, B = d.b;
  const dtCell = (v) => (v === null ? '<td class="muted">—</td>' : `<td class="cmp-dt" style="color:${Math.abs(v) < 0.005 ? 'var(--muted)' : v < 0 ? COL_A : COL_B}">${sgn(v)} s</td>`);
  const dv = (a, b) => (a === null || b === null ? '<td class="muted">—</td>' : `<td>${a - b > 0 ? '+' : a - b < 0 ? '−' : '±'}${Math.abs(a - b)} km/h</td>`);
  const head = `<th style="color:${COL_A}">${esc(A.tla)}</th><th style="color:${COL_B}">${esc(B.tla)}</th>`;
  const acts = tr.tel ? `<div class="ctl-acts">${[[A, 'actA', COL_A], [B, 'actB', COL_B]].map(([x, k, col]) => `<div class="ctl-act-row"><b style="color:${col}">${esc(x.tla)}</b>${st.map((c) => (c[k] ? `<span class="ctl-act ${ACT[c[k]][1]}" title="Virage ${c.n} : ${ACT[c[k]][0]}">${c.n}</span>` : '')).join('')}</div>`).join('')}
    <div class="muted small">${Object.values(ACT).map(([t, c]) => `<span class="ctl-act ${c}"></span> ${t}`).join(' · ')}</div></div>` : '';
  const types = tr.tel ? `<table class="ctl-table"><tr><th>Virages</th>${head}<th>Écart vitesse</th><th>Écart temps</th></tr>${typeStats(tr, st).map((r) => `<tr><td>${esc(TYPE_FR[r.type][0])}${r.n ? ` · ${r.n}` : ''}<br><small class="muted">${esc(TYPE_FR[r.type][1])}</small></td><td>${r.vA ?? '—'}</td><td>${r.vB ?? '—'}</td>${dv(r.vA, r.vB)}${dtCell(r.dt)}</tr>`).join('')}</table>` : '';
  const each = `<table class="ctl-table"><tr><th>Virage</th>${tr.tel ? `<th>Type</th>${head}<th>Écart vitesse</th>` : ''}<th>Écart temps</th></tr>${st.map((c) => `<tr><td><b>${c.n}</b></td>${tr.tel ? `<td>${c.type ? `<span class="ctl-type ${c.type}">${esc(TYPE_FR[c.type][0].replace(/s$/, ''))}</span>` : '—'}</td><td>${c.vA ?? '—'}</td><td>${c.vB ?? '—'}</td>${dv(c.vA, c.vB)}` : ''}${dtCell(c.dt)}</tr>`).join('')}</table>`;
  return `${acts}<div class="ctl-tables">${types}${each}</div>`;
}

function draw() {
  const el = $('#anaCompare');
  if (!el) return;
  const d = data;
  if (!d) { el.innerHTML = '<div class="note">Chargement de la comparaison…</div>'; return; }
  if (d.error) { el.innerHTML = `<div class="note">Comparaison indisponible : ${esc(d.error)}</div>`; return; }
  if (!d.a?.lap || !d.b?.lap) { el.innerHTML = `<div class="note">${esc(d.reason || 'Pas encore de tour chronométré.')}</div>`; return; }
  const A = d.a, B = d.b;
  const gap = A.lap.time - B.lap.time;
  const chip = (x, col) => `<span class="cmp-chip" style="--c:${col}">${esc(x.tla)}</span>`;
  const sectors = [0, 1, 2].map((si) => {
    const a = A.lap.sectors[si], b = B.lap.sectors[si];
    if (!(a > 0 && b > 0)) return `<div class="cmp-sector"><div class="muted small">Secteur ${si + 1}</div><div class="muted">—</div></div>`;
    const dd = a - b;
    const win = dd < 0 ? A : dd > 0 ? B : null;
    return `<div class="cmp-sector" style="--c:${dd < 0 ? COL_A : dd > 0 ? COL_B : 'var(--muted)'}"><div class="muted small">Secteur ${si + 1}</div>
      <div class="cmp-row"><span>${chip(A, COL_A)} ${a.toFixed(3)}</span><span>${chip(B, COL_B)} ${b.toFixed(3)}</span></div>
      <div class="cmp-win">${win ? `${esc(win.tla)} plus rapide de ${Math.abs(dd).toFixed(3)} s` : 'Égalité'}</div></div>`;
  }).join('');
  let minis = '';
  let summary = '';
  if (d.gps && A.mini && B.mini) {
    const wins = d.minis.map((m, i) => A.mini[i] - B.mini[i]);
    const nA = wins.filter((v) => v < -0.0005).length, nB = wins.filter((v) => v > 0.0005).length;
    summary = `<div class="cmp-summary">${chip(A, COL_A)} plus rapide dans <b>${nA}</b> mini-secteur${nA > 1 ? 's' : ''}, ${chip(B, COL_B)} dans <b>${nB}</b> sur ${d.minis.length}.</div>`;
    minis = `<div class="cmp-minis">${d.minis.map((m, i) => {
      const v = wins[i];
      const col = Math.abs(v) < 0.0005 ? 'var(--muted)' : v < 0 ? COL_A : COL_B;
      const k = Math.min(1, Math.abs(v) / 0.15);
      return `<div class="cmp-mini${m.approx ? ' approx' : ''}" style="--c:${col};--k:${(0.18 + 0.6 * k).toFixed(2)}" title="${esc(A.tla)} ${A.mini[i].toFixed(3)} s · ${esc(B.tla)} ${B.mini[i].toFixed(3)} s${m.approx ? ' · emplacement estimé' : ''}"><span>${esc(m.name)}</span><b>${Math.abs(v) < 0.0005 ? '=' : `${esc(v < 0 ? A.tla : B.tla)} ${Math.abs(v).toFixed(3)}`}</b></div>`;
    }).join('')}</div>`;
  }
  const sp = [['ST', 'Speed trap'], ['I1', 'Inter 1'], ['I2', 'Inter 2'], ['FL', 'Ligne']].map(([k, label]) => {
    const a = A.speeds?.[k], b = B.speeds?.[k];
    if (!a && !b) return '';
    return `<tr><td class="muted">${label}</td><td class="${a > b ? 'best' : ''}">${a || '—'}</td><td class="${b > a ? 'best' : ''}">${b || '—'}</td></tr>`;
  }).join('');
  el.innerHTML = `
    <div class="cmp-head">
      <div class="cmp-drv" style="--c:${COL_A}"><b>${esc(A.tla)}</b><span>${fmtLap(A.lap.time)}</span><small class="muted">${esc(A.team)}${A.lap.lap ? ` · tour ${A.lap.lap}` : ''}${A.lap.best ? ' (meilleur)' : ''}</small></div>
      <div class="cmp-gap"><b>${sgn(gap)}</b><small class="muted">${gap < 0 ? `${esc(A.tla)} devant` : gap > 0 ? `${esc(B.tla)} devant` : 'égalité'}</small></div>
      <div class="cmp-drv right" style="--c:${COL_B}"><b>${esc(B.tla)}</b><span>${fmtLap(B.lap.time)}</span><small class="muted">${esc(B.team)}${B.lap.lap ? ` · tour ${B.lap.lap}` : ''}${B.lap.best ? ' (meilleur)' : ''}</small></div>
    </div>
    <div class="cmp-sectors">${sectors}</div>
    ${d.gps ? `${summary}<div class="cmp-vis">${trackSvg(d)}<div class="cmp-right"><div class="muted small">Écart cumulé le long du tour (s) · au-dessus de 0 : <span style="color:${COL_B}">${esc(B.tla)} devant</span> · en dessous : <span style="color:${COL_A}">${esc(A.tla)} devant</span></div>${deltaSvg(d)}</div></div>${minis}` : `<div class="note small">${esc(d.reason || '')}</div>`}
    ${d.trace ? `<section class="ctl"><h4>Télémétrie des deux tours</h4>${d.trace.tel ? '' : '<div class="note small">Télémétrie indisponible pour ces tours (compte F1 TV nécessaire en direct) : seulement l\'écart et les virages.</div>'}
      <div class="ctl-read"><span class="muted">Survoler les courbes pour lire les valeurs</span></div>${traceSvg(d)}${cornersHtml(d)}</section>` : ''}
    ${sp ? `<table class="cmp-speeds"><tr><th>Vitesse max (km/h)</th><th style="color:${COL_A}">${esc(A.tla)}</th><th style="color:${COL_B}">${esc(B.tla)}</th></tr>${sp}</table>` : ''}
    <p class="muted small">${A.lap.best && B.lap.best ? 'Meilleur tour de chaque pilote' : 'Tours choisis'}</p>`;
  if (d.trace) wireTrace(el, d);
}

export function renderCompare(force = false) {
  const [a, b] = pair();
  fillSelects(a, b);
  if (!a || !b) { $('#anaCompare').innerHTML = '<div class="note">Il faut au moins deux pilotes avec un tour chronométré.</div>'; return; }
  if (data && (data.a?.num !== a || data.b?.num !== b || (data.a?.lap && sel.la && data.a.lap.lap !== Number(sel.la)) || (data.b?.lap && sel.lb && data.b.lap.lap !== Number(sel.lb)))) data = null;
  if (force) lastReq = '';
  draw();
  load(a, b);
}

export function initCompare() {
  const set = (k, v) => { sel[k] = v; storageSet(KEY, { a: sel.a, b: sel.b }); data = null; renderCompare(true); };
  $('#cmpA').addEventListener('change', (e) => { sel.la = null; set('a', e.target.value); });
  $('#cmpB').addEventListener('change', (e) => { sel.lb = null; set('b', e.target.value); });
  $('#cmpLapA').addEventListener('change', (e) => set('la', e.target.value || null));
  $('#cmpLapB').addEventListener('change', (e) => set('lb', e.target.value || null));
  $('#cmpSwap').addEventListener('click', () => { const [a, b] = pair(); sel.a = b; sel.b = a; [sel.la, sel.lb] = [sel.lb, sel.la]; storageSet(KEY, sel); data = null; renderCompare(true); });
  $('#cmpTop').addEventListener('click', () => { sel.a = null; sel.b = null; sel.la = null; sel.lb = null; storageSet(KEY, sel); data = null; renderCompare(true); });
}

// Ouvre la comparaison sur un tour précis d'un pilote (clic sur un temps : Temps au tour, Pneus).
// L'autre pilote garde son tour (meilleur tour par défaut).
export function openCompareLap(num, lap) {
  num = String(num);
  const [a, b] = pair();
  if (num === b) { sel.b = a; sel.lb = sel.la; }
  sel.a = num;
  sel.la = lap ? Number(lap) : null;
  if (!sel.b || sel.b === num) sel.b = num === b ? a : b;
  storageSet(KEY, { a: sel.a, b: sel.b });
  data = null;
  document.querySelector('[data-tab="compare"]')?.click();
  renderCompare(true);
}
