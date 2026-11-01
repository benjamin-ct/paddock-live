// Duel entre deux pilotes, façon bataille de la retransmission : écart en direct, tendance, chiffres face à face.
import { store, setDuel, displayNow, versionOf, on, emit } from '../store.js';
import { prefs } from '../prefs.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, teamMark, tyreBadge, currentStint, fmtSigned, photoUrl, driverOpt } from '../util.js';
import { parseGap, parseLapTime, catchLaps } from '/shared/f1.js';
import { carNow } from './gauge.js';
import { DEC, t } from '../i18n.js';
import { realStopCount } from '/shared/pits.js';

let skeletonFor = null;
let autoFilled = false;   // duel choisi tout seul une fois (jamais après un choix effacé à la main)
let lastSlowKey = '';
let lastFast = 0;
let bandTrend = '';   // tendance dans le bandeau (renderSlow), sous l'écart

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

// Tendance sur les derniers tours sans arrêt (4 au plus, 2 au moins), vue du pilote derrière : il reprend du temps ou
// en perd. -> { cls: 'closing' | 'pulling' | 'stable', html (panneau, avec le rattrapage estimé), band (bandeau),
// eta (bandeau : prévision du rattrapage, catchLaps) } ou null
function trend(series, tlaA, tlaB, gapNow) {
  // Tours qui se suivent sans arrêt ni saut de plus de 3 s de l'écart (tour de sortie des stands, voiture au ralenti)
  const pts = [];
  for (let i = series.length - 1; i >= 0 && pts.length < 4; i--) {
    const p = series[i], next = pts[0];
    if (p.pit || (next && (next.x - p.x !== 1 || Math.abs(next.y - p.y) > 3))) { if (pts.length >= 2) break; pts.length = 0; if (p.pit) continue; }
    pts.unshift(p);
  }
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const rate = (last.y - first.y) / (last.x - first.x || 1); // variation de l'écart par tour (A devant si > 0)
  const gap = gapNow ?? last.y;
  const r = Math.abs(rate).toFixed(2).replace('.', DEC);
  const back = gap >= 0 ? tlaB : tlaA;
  const on = pts.length - 1 > 1 ? `sur les ${pts.length - 1} derniers tours` : 'au dernier tour';
  if (Math.abs(rate) < 0.03) return { cls: 'stable', html: `Écart stable ${on}`, band: 'Écart stable' };
  const closing = (gap >= 0 && rate < 0) || (gap < 0 && rate > 0);
  if (!closing) return { cls: 'pulling', html: `<b>${esc(back)}</b> perd ${r} s/tour ${on}`, band: `<b>${esc(back)}</b> perd ${r} s/tour` };
  const lapsToCatch = Math.max(1, Math.ceil(Math.abs(gap) / Math.abs(rate) - 1e-9));
  const lc = store.state.LapCount;
  const remaining = lc?.TotalLaps && lc?.CurrentLap ? lc.TotalLaps - lc.CurrentLap : null;
  const eta = remaining !== null && lapsToCatch > remaining ? 'pas avant l\'arrivée' : `sur lui dans ~${lapsToCatch} tour(s)`;
  const n = catchLaps(Math.abs(gap), Math.abs(rate), remaining);
  const drs = (Number(store.state.SessionInfo?.StartDate?.slice(0, 4)) || 2026) < 2026;   // avant 2026 : DRS (comme le classement)
  const forecast = n === 'dep' ? (drs ? 'à portée du DRS' : 'à portée du DÉP') : n === 1 ? 'rattrape en ~1 tour' : n ? `rattrape en ~${n} tours` : '';
  return { cls: 'closing', html: `<b>${esc(back)}</b> reprend ${r} s/tour ${on} · ${eta}`, band: `<b>${esc(back)}</b> reprend ${r} s/tour`, eta: forecast };
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

// Bandeau du duel (les deux pilotes, l'écart au milieu), dans le panneau Duel et par-dessus le bas du Classement quand
// les deux pilotes y ont été choisis (A et B)
const BAND = '<div class="bt-band"><div class="bt-drv a" data-s="a"></div><div class="bt-gap" data-s="gap"></div><div class="bt-drv b" data-s="b"></div></div>';
const bands = () => [$('#bt'), $('#duelBand')].filter((el) => el && !el.hidden && el.querySelector('.bt-band'));
function showTowerBand(on) {
  const el = $('#duelBand');
  if (!el) return;
  if (on && !el.querySelector('.bt-band')) {
    el.innerHTML = `${BAND}<button type="button" class="bt-close icon-btn small" title="Fermer le duel" aria-label="Fermer le duel">✕</button>`;
    el.querySelector('.bt-close').addEventListener('click', () => { setDuel('a', null); setDuel('b', null); });
  }
  if (el.hidden === !on) return;
  el.hidden = !on;
  el.closest('.panel')?.classList.toggle('has-duel', on);
}

// Bataille façon retransmission : bandeau aux couleurs des deux écuries avec l'écart au milieu, tendance et petite
// courbe, quelques chiffres face à face, et la télémétrie en direct en barres
function skeleton() {
  $('#duelBody').innerHTML = `<div class="bt" id="bt">
    ${BAND}
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
  const ca = carNow(a, disp), cb = carNow(b, disp);   // télémétrie en direct (bandeau, barres du panneau)
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

  // Portrait, logo et code du pilote, sa position et son écurie, puis son pneu, son dernier tour (le plus rapide des deux
  // en vert) et sa vitesse en direct (remplie à chaque image, plus bas)
  const app = s.TimingAppData?.Lines || {};
  const lastA = parseLapTime(la.LastLapTime?.Value), lastB = parseLapTime(lb.LastLapTime?.Value);
  const side = (num, d, mine, other) => {
    const l = lines[num] || {}, st = currentStint(app[num]);
    const photo = photoUrl(d) ? `<img class="bt-photo" src="${esc(photoUrl(d))}" alt="" style="--tc:${teamColor(d)}" onerror="this.remove()">` : '';
    const last = l.LastLapTime?.Value ? `<span class="bt-last${mine !== null && other !== null && mine < other ? ' win' : ''}" title="Dernier tour">${esc(l.LastLapTime.Value)}</span>` : '';
    return `${photo}<div class="bt-id"><b class="bt-name" title="${esc(d.FullName || '')}">${teamMark(d)}${esc(d.Tla || num)}</b>
      <small>${l.Position ? `P${esc(l.Position)} · ` : ''}${esc(d.TeamName || '')}</small>
      <span class="bt-stats">${st ? `<span class="bt-tyre">${tyreBadge(st.Compound, st.TotalLaps, st.New)}</span>` : ''}${last}<span class="bt-kmh" hidden><b></b> km/h</span></span>
      <span class="bt-tele" hidden title="${esc(t('Accélérateur et frein en direct, rapport engagé'))}"><span class="bt-tg"></span><span class="bt-tb"><i class="thr"><b></b></i><i class="brk"><b></b></i></span></span></div>`;
  };
  const html = { a: side(a, da, lastA, lastB), b: side(b, db, lastB, lastA),
    gap: `<span class="bt-tag">${tag}</span><b class="bt-val">${main}${unit ? `<small>${unit}</small>` : ''}</b>${ahead ? `<span class="bt-who">${esc((ahead === 'a' ? da : db).Tla || '')} devant</span>` : ''}${bandTrend}` };
  for (const box of bands()) {
    box.style.setProperty('--ta', teamColor(da));
    box.style.setProperty('--tb', teamColor(db));
    box.classList.toggle('close', close);
    for (const k of ['a', 'b', 'gap']) { const el = box.querySelector(`.bt-band [data-s="${k}"]`); if (el._h !== html[k]) { el._h = html[k]; el.innerHTML = html[k]; } }
    for (const [k, c] of [['a', ca], ['b', cb]]) {
      const el = box.querySelector(`.bt-band [data-s="${k}"] .bt-kmh`);
      el.hidden = !c?.speed;
      if (c?.speed) el.firstChild.textContent = Math.round(c.speed);
      // Télémétrie en barres horizontales : accélérateur (vert) et frein (rouge), rapport engagé
      const tl = box.querySelector(`.bt-band [data-s="${k}"] .bt-tele`);
      tl.hidden = !c;
      if (!c) continue;
      tl.querySelector('.bt-tg').textContent = c.gear ? c.gear : 'N';
      tl.querySelector('.thr b').style.width = `${Math.max(0, Math.min(100, c.thr || 0))}%`;
      tl.querySelector('.brk b').style.width = `${c.brk ? (c.brk > 1 ? Math.min(100, c.brk) : 100) : 0}%`;
    }
  }
  renderLive(a, b, dl, ca, cb);
}

// Télémétrie en direct : vitesse, rapport, accélérateur et frein de chaque pilote
function renderLive(a, b, dl, ca, cb) {
  const host = $('#btLive');
  if (!host) return;   // version web : pas de panneau Duel, seulement le bandeau
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
    if ($('#btTrend')) $('#btTrend').className = `bt-trend ${tr?.cls || 'stable'}`;   // panneau Duel (absent de la version web)
    put('#btTrend', tr?.html || 'Tendance après deux tours communs');
    bandTrend = tr ? `<span class="bt-gtrend ${tr.cls}">${tr.band}</span>${tr.eta ? `<span class="bt-geta">${tr.eta}</span>` : ''}` : '';
  } else {
    bandTrend = '';
    if ($('#btTrend')) $('#btTrend').className = 'bt-trend stable';
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
  // Bandeau sur le Classement : seulement quand les deux pilotes y ont été choisis (pas le duel proposé tout seul)
  showTowerBand(!!(a && b && dl[a] && dl[b] && store.duel.manual));
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

// Version web (pas de panneau Duel) : seulement le bandeau sur le classement, quand deux pilotes y ont été cliqués,
// avec sa tendance et sa prévision (renderSlow) et sa télémétrie (renderHero)
let bandPair = '';
export function renderDuelBand() {
  const dl = drivers(store.state), { a, b } = store.duel;
  const on = !!(a && b && dl[a] && dl[b] && store.duel.manual);
  showTowerBand(on);
  if (!on) return;
  const now = performance.now(), slowKey = `${a}-${b}|${versionOf(['TimingData', 'TimingAppData', '__reset'])}`;
  if (slowKey !== bandPair && (slowKey.split('|')[0] !== bandPair.split('|')[0] || now - (renderDuelBand.lastSlow || 0) > 700)) {
    bandPair = slowKey;
    renderDuelBand.lastSlow = now;
    renderSlow(a, b);
  }
  if (now - lastFast > 200) { lastFast = now; renderHero(a, b); }
}

export function initDuel() {
  $('#duelA').addEventListener('change', (e) => setDuel('a', e.target.value || null, true));
  $('#duelB').addEventListener('change', (e) => setDuel('b', e.target.value || null, true));
  $('#duelSwap').addEventListener('click', () => {
    const { a, b } = store.duel;
    store.duel = { a: b, b: a, manual: store.duel.manual };
    setDuel('a', b);
    setDuel('b', a);
  });
  const auto = (mode) => {
    const a = store.duel.a || store.focus || orderedNumbers(store.state)[1];
    if (!a) return;
    store.duel = { a, b: store.duel.b, auto: store.duel.auto === mode ? null : mode, manual: store.duel.manual };
    skeletonFor = null;
  };
  $('#duelAhead').addEventListener('click', () => auto('ahead'));
  $('#duelBehind').addEventListener('click', () => auto('behind'));
  on('duel', () => { skeletonFor = null; });
}
