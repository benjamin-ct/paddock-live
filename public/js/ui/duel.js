// Duel entre deux pilotes, façon bataille de la retransmission : écart en direct, tendance, chiffres face à face.
import { store, setDuel, displayNow, versionOf, on, emit } from '../store.js';
import { prefs } from '../prefs.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, teamMark, tyreBadge, currentStint, fmtSigned, photoUrl, driverOpt } from '../util.js';
import { parseGap, parseLapTime } from '/shared/f1.js';
import { carNow } from './gauge.js';
import { DEC } from '../i18n.js';
import { realStopCount } from '/shared/pits.js';

let skeletonFor = null;
let autoFilled = false;   // duel choisi tout seul une fois (jamais après un choix effacé à la main)
let lastSlowKey = '';
let lastFast = 0;

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function gapSeconds(raw) {
  const g = parseGap(raw);
  if (!g) return null;
  if (g.leader) return 0;
  return g.s ?? null;
}

// Écart officiel (chronométrage). Renvoie {ahead: 'a'|'b', gap (s) | null, laps}
export function officialGap(state, a, b) {
  const kind = sessionKind(state);
  const lines = state.TimingData?.Lines || {};
  const la = lines[a] || {}, lb = lines[b] || {};
  if (kind === 'race') {
    const pa = Number(la.Position), pb = Number(lb.Position);
    if (!pa || !pb) return null;
    const ahead = pa < pb ? 'a' : 'b';
    const front = ahead === 'a' ? la : lb, back = ahead === 'a' ? lb : la;
    if (Math.abs(pa - pb) === 1) {
      const iv = parseGap(back.IntervalToPositionAhead?.Value);
      if (iv?.laps) return { ahead, gap: null, laps: iv.laps };
      if (iv && iv.s !== undefined && !iv.leader) return { ahead, gap: iv.s, laps: 0 };
    }
    const gf = parseGap(front.GapToLeader), gb = parseGap(back.GapToLeader);
    if (!gf || !gb) return { ahead, gap: null, laps: 0 };
    if (gb.laps || gf.laps) return { ahead, gap: null, laps: (gb.laps || 0) - (gf.laps || 0) || 1 };
    return { ahead, gap: (gb.leader ? 0 : gb.s) - (gf.leader ? 0 : gf.s), laps: 0 };
  }
  const part = Number(state.TimingData?.SessionPart) || 1;
  const best = (l) => kind === 'quali' ? parseLapTime(list(l.BestLapTimes)[part - 1]?.Value) : parseLapTime(l.BestLapTime?.Value);
  const ta = best(la), tb = best(lb);
  if (ta === null && tb === null) return null;
  if (ta === null) return { ahead: 'b', gap: null, laps: 0 };
  if (tb === null) return { ahead: 'a', gap: null, laps: 0 };
  return { ahead: ta <= tb ? 'a' : 'b', gap: Math.abs(tb - ta), laps: 0 };
}

// Série "écart par tour" : positif = A devant B.
export function lapGapSeries(a, b) {
  const la = store.derived.laps[a] || [], lb = store.derived.laps[b] || [];
  const byLap = new Map(lb.map((e) => [e.lap, e]));
  const out = [];
  for (const ea of la) {
    const eb = byLap.get(ea.lap);
    if (!eb) continue;
    const ga = gapSeconds(ea.gap), gb = gapSeconds(eb.gap);
    if (ga === null || gb === null) continue;
    out.push({ x: ea.lap, y: gb - ga, pit: ea.pit || eb.pit, pitA: ea.pit, pitB: eb.pit });
  }
  return out;
}

// Tendance sur les 4 derniers tours sans arrêt : { cls: 'closing' | 'pulling' | 'stable', html }
function trend(series, tlaA, tlaB, gapNow) {
  const clean = series.filter((p) => !p.pit);
  if (clean.length < 3) return { cls: 'stable', html: 'Tendance après quelques tours communs' };
  const pts = clean.slice(-4);
  const first = pts[0], last = pts[pts.length - 1];
  const rate = (last.y - first.y) / (last.x - first.x || 1); // variation de l'écart par tour (A devant si > 0)
  const gap = gapNow ?? last.y;
  const r = Math.abs(rate).toFixed(2).replace('.', DEC);
  if (Math.abs(rate) < 0.03) return { cls: 'stable', html: `Écart stable · ${fmtSigned(rate, 2).replace('.', DEC)} s/tour` };
  const front = gap >= 0 ? tlaA : tlaB, back = gap >= 0 ? tlaB : tlaA;
  const closing = (gap >= 0 && rate < 0) || (gap < 0 && rate > 0);
  if (!closing) return { cls: 'pulling', html: `<b>${esc(front)}</b> s'échappe · +${r} s/tour` };
  const lapsToCatch = Math.max(1, Math.round(Math.abs(gap) / Math.abs(rate)));
  const lc = store.state.LapCount;
  const remaining = lc?.TotalLaps && lc?.CurrentLap ? lc.TotalLaps - lc.CurrentLap : null;
  const eta = remaining !== null && lapsToCatch > remaining ? 'pas avant l\'arrivée' : `dans ~${lapsToCatch} tour(s)`;
  return { cls: 'closing', html: `<b>${esc(back)}</b> revient · −${r} s/tour · ${eta}` };
}

// Petite courbe de l'écart sur les 12 derniers tours (plus haut : A plus loin devant ; ligne pointillée : à égalité)
function spark(series) {
  const pts = series.slice(-12);
  if (pts.length < 2) return '';
  let lo = Math.min(...pts.map((p) => p.y)), hi = Math.max(...pts.map((p) => p.y));
  const pad = Math.max(0.25, (hi - lo) * 0.15);
  lo -= pad; hi += pad;
  const x = (i) => (i / (pts.length - 1)) * 100, y = (v) => 28 - ((v - lo) / (hi - lo)) * 26;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const pits = pts.map((p, i) => (p.pit ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="1.6" class="bt-pit"/>` : '')).join('');
  const zero = lo < 0 && hi > 0 ? `<line x1="0" y1="${y(0).toFixed(1)}" x2="100" y2="${y(0).toFixed(1)}" class="bt-zero"/>` : '';
  const fmt = (v) => Math.abs(v).toFixed(1).replace('.', DEC);
  return `<svg class="bt-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">${zero}
    <polygon points="0,30 ${line} 100,30" class="bt-area"/><polyline points="${line}" class="bt-line"/>${pits}</svg>
    <div class="bt-spark-lbl"><span>T${pts[0].x}</span><span>Écart : ${fmt(pts[0].y)} s → ${fmt(pts.at(-1).y)} s</span><span>T${pts.at(-1).x}</span></div>`;
}

function fillSelect(sel, value, dl, nums) {
  const opts = ['<option value="">— Choisir —</option>', ...nums.map((n) => `<option value="${n}" ${n === value ? 'selected' : ''}${driverOpt(dl[n] || {}, n)}>${esc(dl[n]?.Tla || n)} · ${esc(dl[n]?.LastName || dl[n]?.FullName || '')}</option>`)];
  const html = opts.join('');
  if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
  sel.value = value || '';
}

// Bataille façon retransmission : bandeau aux couleurs des deux écuries avec l'écart au milieu, tendance et petite
// courbe, quelques chiffres face à face, et la télémétrie en direct en barres
function skeleton() {
  $('#duelBody').innerHTML = `<div class="bt" id="bt">
    <div class="bt-band"><div class="bt-drv a" id="btA"></div><div class="bt-gap" id="btGap"></div><div class="bt-drv b" id="btB"></div></div>
    <div class="bt-trend" id="btTrend"></div>
    <div class="bt-sparkbox" id="btSpark"></div>
    <div class="bt-rows" id="btRows"></div>
    <div class="bt-live" id="btLive" hidden></div>
  </div>`;
}

const put = (id, html) => { const el = $(id); if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };

function renderHero(a, b) {
  const s = store.state;
  const dl = drivers(s);
  const da = dl[a] || {}, db = dl[b] || {};
  const lines = s.TimingData?.Lines || {};
  const disp = displayNow();
  const race = sessionKind(s) === 'race';
  const off = officialGap(s, a, b);
  const la = lines[a] || {}, lb = lines[b] || {};
  const running = !la.Retired && !lb.Retired && !la.Stopped && !lb.Stopped;
  let live = race && running ? store.positions.liveGap(a, b, disp) : null;
  // Garde-fou : si le GPS contredit nettement le chronométrage (voiture au garage, tour de retard…), on s'en tient à l'officiel.
  if (live && off && (off.laps || (off.gap !== null && Math.abs(live.gap - off.gap) > 5))) live = null;

  let main = '—', unit = '', tag = race ? 'Écart' : 'Écart au meilleur tour', ahead = null, close = false;
  if (live && !live.laps) {
    main = live.gap.toFixed(live.gap < 10 ? 2 : 1).replace('.', DEC); unit = 's'; ahead = live.ahead === a ? 'a' : 'b';
    close = live.gap < 1;
  } else if (off) {
    ahead = off.ahead;
    if (off.laps) { main = `+${off.laps}`; unit = off.laps > 1 ? 'tours' : 'tour'; }
    else if (off.gap !== null) { main = off.gap.toFixed(3).replace('.', DEC); unit = 's'; close = race && off.gap < 1; }
  }
  if (close) tag = 'À moins d\'une seconde';

  const side = (num, d, cls) => {
    const l = lines[num] || {};
    const photo = photoUrl(d) ? `<img class="bt-photo" src="${esc(photoUrl(d))}" alt="" onerror="this.remove()">` : '';
    const name = d.LastName || d.FullName || d.Tla || num;
    return `<span class="bt-pos">${esc(l.Position || '–')}</span>${photo}<div class="bt-id"><b class="bt-name" title="${esc(d.FullName || '')}"><span class="bt-full">${esc(name)}</span><span class="bt-tla">${esc(d.Tla || num)}</span></b>
      <small>${teamMark(d)}${esc(d.TeamName || '')}</small></div>`;
  };
  const box = $('#bt');
  box.style.cssText = `--ta:${teamColor(da)};--tb:${teamColor(db)}`;
  box.dataset.ahead = ahead || '';
  box.classList.toggle('close', close);
  put('#btA', side(a, da, 'a'));
  put('#btB', side(b, db, 'b'));
  put('#btGap', `<span class="bt-tag">${tag}</span><b class="bt-val">${main}${unit ? `<small>${unit}</small>` : ''}</b>${ahead ? `<span class="bt-who">${esc((ahead === 'a' ? da : db).Tla || '')} devant</span>` : ''}`);
  renderLive(a, b, dl, disp);
}

// Télémétrie en direct : vitesse, rapport, accélérateur et frein de chaque pilote
function renderLive(a, b, dl, disp) {
  const host = $('#btLive');
  const ca = carNow(a, disp), cb = carNow(b, disp);
  host.hidden = !ca && !cb;
  if (host.hidden) return;
  if (host.dataset.pair !== `${a}-${b}`) {
    host.dataset.pair = `${a}-${b}`;
    const row = (n, k) => `<div class="bt-car ${k}"><b class="bt-car-tla">${esc(dl[n]?.Tla || n)}</b><span class="bt-spd"><b>—</b><small>km/h</small></span><span class="bt-gear">–</span>
      <span class="bt-bar thr" title="Accélérateur"><i></i></span><span class="bt-bar brk" title="Frein"><i></i></span></div>`;
    host.innerHTML = `${row(a, 'a')}${row(b, 'b')}<div class="bt-live-lbl"><span>Vitesse</span><span>Rapport</span><span>Accélérateur</span><span>Frein</span></div>`;
  }
  for (const [c, k] of [[ca, 'a'], [cb, 'b']]) {
    const el = host.querySelector(`.bt-car.${k}`);
    el.querySelector('.bt-spd b').textContent = c?.speed ? Math.round(c.speed) : '—';
    el.querySelector('.bt-gear').textContent = c?.gear ? c.gear : 'N';
    el.querySelector('.thr i').style.width = `${Math.max(0, Math.min(100, c?.thr || 0))}%`;
    el.querySelector('.brk i').style.width = `${c?.brk ? (c.brk > 1 ? Math.min(100, c.brk) : 100) : 0}%`;
  }
}

// Ligne face à face : valeur de A, nom, valeur de B ; la meilleure aux couleurs de son écurie
function row(label, va, vb, better = null) {
  let w = '';
  if (better && va.n !== null && vb.n !== null && va.n !== vb.n) w = (better === 'low' ? va.n < vb.n : va.n > vb.n) ? 'a' : 'b';
  return `<div class="bt-row"><span class="bt-v a${w === 'a' ? ' win' : ''}">${va.html}</span><span class="bt-k">${esc(label)}</span><span class="bt-v b${w === 'b' ? ' win' : ''}">${vb.html}</span></div>`;
}

function renderSlow(a, b) {
  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const la = lines[a] || {}, lb = lines[b] || {};
  const tlaA = dl[a]?.Tla || a, tlaB = dl[b]?.Tla || b;

  // Tendance et petite courbe (course)
  const series = kind === 'race' ? lapGapSeries(a, b) : [];
  if (kind === 'race') {
    const off = officialGap(s, a, b);
    const gapNow = off && off.gap !== null && !off.laps ? (off.ahead === 'a' ? off.gap : -off.gap) : null;
    const tr = trend(series, tlaA, tlaB, gapNow);
    $('#btTrend').className = `bt-trend ${tr.cls}`;
    put('#btTrend', tr.html);
  } else {
    $('#btTrend').className = 'bt-trend stable';
    put('#btTrend', kind === 'quali' ? `Meilleurs tours de la Q${Number(s.TimingData?.SessionPart) || 1}` : 'Meilleurs tours de la séance');
  }
  put('#btSpark', spark(series));

  const lap = (v) => ({ html: v ? esc(v) : '—', n: parseLapTime(v) });
  const part = Number(s.TimingData?.SessionPart) || 1;
  const bestOf = (l) => kind === 'quali' ? list(l.BestLapTimes)[part - 1]?.Value : l.BestLapTime?.Value;
  const sec = (l, i) => list(l.Sectors)[i]?.Value;
  const tyre = (st) => ({ html: st ? tyreBadge(st.Compound, st.TotalLaps, st.New) : '—', n: null });
  const spd = (l) => { const v = Number(l.Speeds?.ST?.Value); return { html: v ? `${v}<small> km/h</small>` : '—', n: v || null }; };
  const num = (v) => ({ html: esc(v ?? '—') || '—', n: null });

  let rows = '';
  if (kind === 'race') {
    rows += row('Dernier tour', lap(la.LastLapTime?.Value), lap(lb.LastLapTime?.Value), 'low');
    rows += row('Meilleur tour', lap(bestOf(la)), lap(bestOf(lb)), 'low');
    rows += row('Pneus', tyre(currentStint(app[a])), tyre(currentStint(app[b])));
    // Vrais arrêts (changements de pneus), sans les passages par les stands sous voiture de sécurité
    rows += row('Arrêts', num(realStopCount(app[a], la)), num(realStopCount(app[b], lb)));
  } else {
    rows += row(kind === 'quali' ? `Meilleur Q${part}` : 'Meilleur tour', lap(bestOf(la)), lap(bestOf(lb)), 'low');
    for (let i = 0; i < 3; i++) rows += row(`Secteur ${i + 1}`, lap(sec(la, i)), lap(sec(lb, i)), 'low');
    rows += row('Pneus', tyre(currentStint(app[a])), tyre(currentStint(app[b])));
  }
  rows += row('Vitesse de pointe', spd(la), spd(lb), 'high');
  put('#btRows', rows);
}

export function renderDuel() {
  const s = store.state;
  const dl = drivers(s);
  const nums = orderedNumbers(s).filter((n) => dl[n]);
  // Aucun duel choisi : le pilote favori contre la voiture de devant (de derrière s'il mène),
  // sinon les deux premiers ; modifiable comme d'habitude
  if (!autoFilled && !store.duel.a && !store.duel.b && nums.length >= 2) {
    autoFilled = true;
    const fav = nums.find((n) => prefs.favs.includes(String(n)));
    store.duel = fav
      ? { a: fav, b: null, auto: nums.indexOf(fav) === 0 ? 'behind' : 'ahead' }
      : { a: nums[0], b: nums[1], auto: null };
    emit('duel', store.duel);
  }
  if (store.duel.a || store.duel.b) autoFilled = true;
  fillSelect($('#duelA'), store.duel.a, dl, nums);
  fillSelect($('#duelB'), store.duel.b, dl, nums);
  // Duel automatique contre la voiture de devant / derrière
  if (store.duel.auto && store.duel.a) {
    const i = nums.indexOf(store.duel.a);
    const other = store.duel.auto === 'ahead' ? nums[i - 1] : nums[i + 1];
    if (other && other !== store.duel.b) { store.duel = { ...store.duel, b: other }; skeletonFor = null; }
  }
  $('#duelAhead').classList.toggle('on', store.duel.auto === 'ahead');
  $('#duelBehind').classList.toggle('on', store.duel.auto === 'behind');
  const { a, b } = store.duel;
  if (!a || !b || !dl[a] || !dl[b]) {
    if (skeletonFor !== 'empty') {
      skeletonFor = 'empty';
      $('#duelBody').innerHTML = `<div class="duel-empty">Choisissez deux pilotes ci-dessus,<br>ou cliquez sur <b style="color:var(--blue)">A</b> et <b style="color:var(--orange)">B</b> dans le classement.</div>`;
    }
    return;
  }
  const pair = `${a}-${b}`;
  if (skeletonFor !== pair) { skeletonFor = pair; lastSlowKey = ''; skeleton(); }

  const now = performance.now();
  if (now - lastFast > 200) {
    lastFast = now;
    renderHero(a, b);
  }
  const slowKey = `${versionOf(['TimingData', 'TimingAppData', '__reset'])}`;
  if (slowKey !== lastSlowKey && now - (renderDuel.lastSlow || 0) > 700) {
    lastSlowKey = slowKey;
    renderDuel.lastSlow = now;
    renderSlow(a, b);
  }
}

export function initDuel() {
  $('#duelA').addEventListener('change', (e) => setDuel('a', e.target.value || null));
  $('#duelB').addEventListener('change', (e) => setDuel('b', e.target.value || null));
  $('#duelSwap').addEventListener('click', () => {
    const { a, b } = store.duel;
    store.duel = { a: b, b: a };
    setDuel('a', b);
    setDuel('b', a);
  });
  const auto = (mode) => {
    const a = store.duel.a || store.focus || orderedNumbers(store.state)[1];
    if (!a) return;
    store.duel = { a, b: store.duel.b, auto: store.duel.auto === mode ? null : mode };
    skeletonFor = null;
  };
  $('#duelAhead').addEventListener('click', () => auto('ahead'));
  $('#duelBehind').addEventListener('click', () => auto('behind'));
  on('duel', () => { skeletonFor = null; });
}
