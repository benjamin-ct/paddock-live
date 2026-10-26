// Analyse → Comparaison : meilleurs tours de deux pilotes, secteur par secteur et mini-secteur
// par mini-secteur (P1 contre P2 par défaut, ou deux pilotes au choix). Les mini-secteurs sont
// mesurés par le serveur avec le GPS (voir server/compare.js), au rythme du délai TV.
import { store, serverNow, versionOf } from '../store.js';
import { $, esc, api, drivers, orderedNumbers, fmtLap, lapSeconds, storageGet, storageSet, driverOpt } from '../util.js';

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
    ${sp ? `<table class="cmp-speeds"><tr><th>Vitesse max (km/h)</th><th style="color:${COL_A}">${esc(A.tla)}</th><th style="color:${COL_B}">${esc(B.tla)}</th></tr>${sp}</table>` : ''}
    <p class="muted small">${A.lap.best && B.lap.best ? 'Meilleur tour de chaque pilote' : 'Tours choisis'}</p>`;
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
