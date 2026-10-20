// Duel entre deux pilotes : écart en direct, tendance, historique, comparaison détaillée.
import { store, setDuel, displayNow, versionOf, on, emit } from '../store.js';
import { prefs } from '../prefs.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, tyreBadge, currentStint, fmtLap, fmtSigned, photoUrl } from '../util.js';
import { parseGap, parseLapTime } from '/shared/f1.js';
import { lineChart } from './charts.js';
import { Dial, animate, carNow, energyOf } from './gauge.js';
import { DEC } from '../i18n.js';
import { realStopCount } from '/shared/pits.js';

let skeletonFor = null;
let autoFilled = false;   // duel choisi tout seul une fois (jamais après un choix effacé à la main)
let lastSlowKey = '';
let liveSeries = [];
let liveSeriesKey = '';
let lastLiveSample = 0;
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

function trendText(series, tlaA, tlaB, gapNow) {
  const clean = series.filter((p) => !p.pit);
  if (clean.length < 3) return 'La tendance apparaîtra après quelques tours communs.';
  const pts = clean.slice(-4);
  const first = pts[0], last = pts[pts.length - 1];
  const rate = (last.y - first.y) / (last.x - first.x || 1); // variation de l'écart par tour (A devant si > 0)
  const gap = gapNow ?? last.y;
  if (Math.abs(rate) < 0.03) return `Écart <b>stable</b> (${fmtSigned(rate, 2)} s/tour sur les ${pts.length} derniers tours).`;
  const front = gap >= 0 ? tlaA : tlaB, back = gap >= 0 ? tlaB : tlaA;
  const closing = (gap >= 0 && rate < 0) || (gap < 0 && rate > 0);
  const r = Math.abs(rate).toFixed(2).replace('.', DEC);
  if (!closing) return `<b>${esc(front)}</b> creuse l'écart : <b>+${r} s/tour</b> sur ${esc(back)}.`;
  const lapsToCatch = Math.abs(gap) / Math.abs(rate);
  const lc = store.state.LapCount;
  const remaining = lc?.TotalLaps && lc?.CurrentLap ? lc.TotalLaps - lc.CurrentLap : null;
  let eta = `rattrapage estimé dans <b>~${Math.max(1, Math.round(lapsToCatch))} tour(s)</b>`;
  if (remaining !== null && lapsToCatch > remaining) eta += ` (au-delà des ${remaining} tours restants)`;
  return `<b>${esc(back)}</b> revient sur ${esc(front)} : <b>−${r} s/tour</b> · ${eta}.`;
}

function fillSelect(sel, value, dl, nums) {
  const opts = ['<option value="">— Choisir —</option>', ...nums.map((n) => `<option value="${n}" ${n === value ? 'selected' : ''}>${esc(dl[n]?.Tla || n)} · ${esc(dl[n]?.LastName || dl[n]?.FullName || '')}</option>`)];
  const html = opts.join('');
  if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
  sel.value = value || '';
}

function skeleton() {
  $('#duelBody').innerHTML = `
    <div class="duel-hero" id="dHero"><div id="dSideA"></div><div id="dGap"></div><div id="dSideB"></div></div>
    <div class="duel-trend" id="dTrend"></div>
    <div id="dTele"></div>
    <div id="dLiveWrap"><div class="chart-title"><span>Écart en direct (GPS) — 3 dernières minutes</span><span>positif = A devant</span></div><div class="duel-chart" id="dLive"></div></div>
    <div id="dLapWrap"><div class="chart-title"><span>Écart à chaque tour (s)</span><span>positif = A devant</span></div><div class="duel-chart" id="dLap"></div></div>
    <div id="dPaceWrap"><div class="chart-title"><span>Rythme : temps au tour (s)</span><span class="legend-inline" id="dPaceLegend"></span></div><div class="duel-chart" id="dPace"></div></div>
    <table class="cmp" id="dCmp"></table>
    <div class="chart-title"><span>Derniers tours</span></div>
    <table class="laps-cmp" id="dLaps"></table>`;
}

function renderHero(a, b) {
  const s = store.state;
  const dl = drivers(s);
  const da = dl[a] || {}, db = dl[b] || {};
  const lines = s.TimingData?.Lines || {};
  const disp = displayNow();
  const off = officialGap(s, a, b);
  const la = lines[a] || {}, lb = lines[b] || {};
  const running = !la.Retired && !lb.Retired && !la.Stopped && !lb.Stopped;
  let live = sessionKind(s) === 'race' && running ? store.positions.liveGap(a, b, disp) : null;
  // Garde-fou : si le GPS contredit nettement le chronométrage (voiture au garage, tour de retard…), on s'en tient à l'officiel.
  if (live && off && (off.laps || (off.gap !== null && Math.abs(live.gap - off.gap) > 5))) live = null;

  let main = '—', lbl = '', src = '';
  if (live && !live.laps) {
    main = live.gap.toFixed(live.gap < 10 ? 2 : 1).replace('.', DEC);
    lbl = `${esc(dl[live.ahead]?.Tla || live.ahead)} devant`;
    src = off?.gap !== null && off?.gap !== undefined ? `Officiel : ${off.gap.toFixed(3).replace('.', DEC)} s · GPS temps réel` : 'GPS temps réel';
  } else if (off) {
    const aheadNum = off.ahead === 'a' ? a : b;
    if (off.laps) { main = `+${off.laps} T`; lbl = `${esc(dl[aheadNum]?.Tla || aheadNum)} a un tour d'avance`; }
    else if (off.gap !== null) { main = off.gap.toFixed(3).replace('.', DEC); lbl = `${esc(dl[aheadNum]?.Tla || aheadNum)} devant`; }
    src = sessionKind(s) === 'race' ? 'Chronométrage officiel' : 'Écart sur le meilleur tour';
  }

  const side = (num, d, cls) => {
    const l = lines[num] || {};
    const pos = l.Position ? `P${l.Position}` : '';
    const photo = photoUrl(d) ? `<img class="duel-photo" src="${esc(photoUrl(d))}" alt="" onerror="this.remove()">` : '';
    return `<div class="duel-side ${cls}"><div class="duel-id">${photo}<div><div class="duel-name"><span class="duel-swatch" style="background:${teamColor(d)}"></span>${esc(d.Tla || num)}</div>
      <div class="duel-sub">${esc(pos)} · ${esc(d.TeamName || '')}</div></div></div></div>`;
  };
  // Mise à jour ciblée (évite de recharger les photos à chaque rafraîchissement).
  const put = (id, html) => { const el = $(id); if (el._h !== html) { el._h = html; el.innerHTML = html; } };
  put('#dSideA', side(a, da, 'a'));
  put('#dSideB', side(b, db, 'b'));
  put('#dGap', `<div class="duel-gap"><div class="duel-gap-val">${main}${main !== '—' && !main.includes('T') ? '<small style="font-size:16px"> s</small>' : ''}</div>
      <div class="duel-gap-lbl">${lbl}</div><div class="duel-gap-src">${src}</div></div>`);

  // Échantillonnage de l'écart GPS pour le graphique "en direct"
  const key = `${a}-${b}-${store.ver.__reset || 0}`;
  if (key !== liveSeriesKey) { liveSeries = []; liveSeriesKey = key; }
  if (live && !live.laps && disp - lastLiveSample >= 1000) {
    lastLiveSample = disp;
    liveSeries.push({ t: disp, y: live.ahead === a ? live.gap : -live.gap });
    while (liveSeries.length && disp - liveSeries[0].t > 180000) liveSeries.shift();
  }
  $('#dLiveWrap').hidden = !liveSeries.length;
  if (liveSeries.length) {
    lineChart($('#dLive'), liveSeries.map((p) => ({ x: (p.t - disp) / 1000, y: p.y })), {
      height: 110, color: '#3ea6ff', yFmt: (v) => v.toFixed(1), xFmt: (v) => `${Math.round(v)} s`,
      tipFmt: (p) => `${Math.round(-p.x)} s avant : ${p.y >= 0 ? 'A' : 'B'} devant de ${Math.abs(p.y).toFixed(2)} s`, yMinSpan: 0.5,
    });
  }
}

function cmpRow(label, va, vb, better = null) {
  // better : 'low' | 'high' | null (comparaison numérique des valeurs brutes)
  let ca = '', cb = '';
  if (better && va.n !== null && vb.n !== null && va.n !== vb.n) {
    const aWins = better === 'low' ? va.n < vb.n : va.n > vb.n;
    ca = aWins ? 'win' : ''; cb = aWins ? '' : 'win';
  }
  return `<tr><td class="${ca}">${va.html}</td><td>${esc(label)}</td><td class="${cb}">${vb.html}</td></tr>`;
}

function renderSlow(a, b) {
  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const la = lines[a] || {}, lb = lines[b] || {};
  const tlaA = dl[a]?.Tla || a, tlaB = dl[b]?.Tla || b;

  // Graphique tour par tour + tendance (course)
  const series = kind === 'race' ? lapGapSeries(a, b) : [];
  $('#dLapWrap').hidden = kind !== 'race';
  if (kind === 'race') {
    lineChart($('#dLap'), series, {
      height: 130, color: '#ff9f1a', xFmt: (v) => `T${v}`, yFmt: (v) => v.toFixed(1),
      tipFmt: (p) => `Tour ${p.x} : ${p.y >= 0 ? tlaA : tlaB} devant de ${Math.abs(p.y).toFixed(3)} s${p.pit ? ' (arrêt)' : ''}`,
      markers: series.filter((p) => p.pit).map((p) => ({ x: p.x, y: p.y, label: `Arrêt aux stands — tour ${p.x}${p.pitA ? ' ' + tlaA : ''}${p.pitB ? ' ' + tlaB : ''}` })),
      empty: 'Le graphique se remplit à chaque tour bouclé par les deux pilotes.',
    });
    const off = officialGap(s, a, b);
    const gapNow = off && off.gap !== null && !off.laps ? (off.ahead === 'a' ? off.gap : -off.gap) : null;
    $('#dTrend').innerHTML = trendText(series, tlaA, tlaB, gapNow);
  } else {
    $('#dTrend').innerHTML = kind === 'quali' ? 'Comparaison sur la partie de qualification en cours.' : 'Comparaison des meilleurs tours de la séance.';
  }

  // Rythme : temps au tour hors tours de stand, 1er tour et tours anormaux (SC, incidents)
  const pace = (n) => {
    const pts = (store.derived.laps[n] || []).filter((e) => !e.pit && e.lap > 1).map((e) => ({ x: e.lap, y: parseLapTime(e.time) })).filter((p) => p.y);
    const med = pts.map((p) => p.y).sort((x, y) => x - y)[Math.floor(pts.length / 2)];
    return pts.filter((p) => p.y < med * 1.07).slice(-30);
  };
  const pA = pace(a), pB = pace(b);
  $('#dPaceWrap').hidden = pA.length + pB.length < 2;
  if (pA.length + pB.length >= 2) {
    $('#dPaceLegend').innerHTML = `<span><i style="background:#3ea6ff"></i>${esc(tlaA)} (A)</span><span><i style="background:#ff9f1a"></i>${esc(tlaB)} (B)</span>`;
    const main = pA.length ? pA : pB;
    lineChart($('#dPace'), main, {
      height: 120, color: pA.length ? '#3ea6ff' : '#ff9f1a', zero: false, yMinSpan: 1, xFmt: (v) => `T${v}`, yFmt: (v) => v.toFixed(1),
      extra: pA.length ? [{ points: pB, color: '#ff9f1a' }] : [],
      tipAll: (x) => {
        const va = pA.find((p) => p.x === x), vb = pB.find((p) => p.x === x);
        return `Tour ${x} · ${tlaA} ${va ? fmtLap(va.y) : '—'} · ${tlaB} ${vb ? fmtLap(vb.y) : '—'}`;
      },
    });
  }

  // Comparatif
  const num = (v) => ({ html: esc(v ?? '—') || '—', n: null });
  const lap = (v) => ({ html: v ? esc(v) : '<span class="dim">—</span>', n: parseLapTime(v) });
  const part = Number(s.TimingData?.SessionPart) || 1;
  const bestOf = (l) => kind === 'quali' ? list(l.BestLapTimes)[part - 1]?.Value : l.BestLapTime?.Value;
  const sec = (l, i) => list(l.Sectors)[i]?.Value;
  const stA = currentStint(app[a]), stB = currentStint(app[b]);
  const tyre = (st) => ({ html: st ? `${tyreBadge(st.Compound, st.TotalLaps, st.New)}` : '—', n: null });
  const spd = (l) => { const v = Number(l.Speeds?.ST?.Value); return { html: v ? `${v} km/h` : '—', n: v || null }; };
  const posv = (l) => ({ html: l.Position ? `P${esc(l.Position)}` : '—', n: Number(l.Position) || null });

  let rows = cmpRow('Position', posv(la), posv(lb), 'low');
  rows += cmpRow('Dernier tour', lap(la.LastLapTime?.Value), lap(lb.LastLapTime?.Value), 'low');
  rows += cmpRow(kind === 'quali' ? `Meilleur (Q${part})` : 'Meilleur tour', lap(bestOf(la)), lap(bestOf(lb)), 'low');
  for (let i = 0; i < 3; i++) rows += cmpRow(`Secteur ${i + 1}`, lap(sec(la, i)), lap(sec(lb, i)), 'low');
  rows += cmpRow('Pneus', tyre(stA), tyre(stB));
  if (kind === 'race') {
    // Vrais arrêts (changements de pneus), sans les passages par les stands sous voiture de sécurité
    rows += cmpRow('Arrêts', num(realStopCount(app[a], la)), num(realStopCount(app[b], lb)));
    rows += cmpRow('Écart leader', num(/^LAP/i.test(la.GapToLeader || '') ? 'Leader' : la.GapToLeader), num(/^LAP/i.test(lb.GapToLeader || '') ? 'Leader' : lb.GapToLeader));
  } else {
    rows += cmpRow('Tours', num(la.NumberOfLaps), num(lb.NumberOfLaps));
  }
  rows += cmpRow('Speed trap', spd(la), spd(lb), 'high');
  $('#dCmp').innerHTML = `<tr><td><b style="color:var(--blue)">A</b> ${esc(tlaA)}</td><td></td><td>${esc(tlaB)} <b style="color:var(--orange)">B</b></td></tr>${rows}`;

  // Derniers tours
  const lapsA = store.derived.laps[a] || [], lapsB = store.derived.laps[b] || [];
  const mapB = new Map(lapsB.map((e) => [e.lap, e]));
  const common = lapsA.filter((e) => mapB.has(e.lap) && (e.time || mapB.get(e.lap).time)).slice(-8).reverse();
  $('#dLaps').innerHTML = common.length
    ? `<tr><th>Tour</th><th>${esc(tlaA)}</th><th>${esc(tlaB)}</th><th>Δ (A − B)</th><th>Plus rapide</th></tr>` + common.map((ea) => {
      const eb = mapB.get(ea.lap);
      const ta = parseLapTime(ea.time), tb = parseLapTime(eb.time);
      const dlt = ta !== null && tb !== null ? ta - tb : null;
      const faster = dlt === null || dlt === 0 ? '' : dlt < 0 ? tlaA : tlaB;
      return `<tr><td>T${ea.lap}${ea.pit || eb.pit ? ' <span class="tag pit">P</span>' : ''}</td><td>${esc(ea.time || '—')}</td><td>${esc(eb.time || '—')}</td>
        <td>${dlt === null ? '—' : fmtSigned(dlt)}</td><td>${esc(faster)}</td></tr>`;
    }).join('')
    : '<tr><td class="note">Aucun tour commun pour l\'instant.</td></tr>';
}

// Télémétrie côte à côte : les mêmes compteurs que l'onglet Télémétrie, animés image par image
let duelTele = null;   // { a, b, dialA, dialB }
function renderDuelTele(a, b) {
  const host = $('#dTele');
  if (!store.positions.car.size) { if (duelTele) { host.innerHTML = ''; duelTele = null; } return; }
  if (!duelTele || duelTele.a !== a || duelTele.b !== b || !host.contains(duelTele.dialA.el)) {
    const dl = drivers(store.state);
    const head = (n, cls, letter) => `<div class="tele-name" style="--tc:${teamColor(dl[n] || {})}"><b class="duel-letter ${cls}">${letter}</b><b>${esc(dl[n]?.Tla || n)}</b><span class="muted small">${esc(dl[n]?.LastName || '')}</span></div>`;
    host.innerHTML = `<div class="chart-title"><span>Télémétrie</span></div><div class="tele2-dials two duel-dials">
      <div class="tele2-col">${head(a, 'a', 'A')}<div class="tele-dial" id="dDialA"></div></div><div class="tele2-vs">VS</div>
      <div class="tele2-col">${head(b, 'b', 'B')}<div class="tele-dial" id="dDialB"></div></div></div>`;
    duelTele = { a, b, dialA: new Dial(teamColor(dl[a] || {})), dialB: new Dial(teamColor(dl[b] || {})) };
    $('#dDialA').appendChild(duelTele.dialA.el);
    $('#dDialB').appendChild(duelTele.dialB.el);
  }
  animate('duel', (dt) => {
    const t = duelTele;
    if (!t || !t.dialA.el.isConnected || !t.dialA.el.getClientRects().length) return false;
    const disp = displayNow();
    t.dialA.update(carNow(t.a, disp), dt, energyOf(t.a, disp));
    t.dialB.update(carNow(t.b, disp), dt, energyOf(t.b, disp));
    return true;
  });
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
    renderDuelTele(a, b);
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
