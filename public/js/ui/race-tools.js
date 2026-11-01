// Outils de course : simulateur d'arrêt au stand et détection des bagarres.
import { store, setDuelPair, versionOf, displayNow } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, fmtSigned, driverOpt } from '../util.js';
import { parseGap, parseLapTime } from '/shared/f1.js';
import { currentTrack } from './map.js';
import { lapGapSeries } from './duel.js';
import { icon } from '../icons.js';
import { DEC, t } from '../i18n.js';
import { measuredPitLoss, passIsRealStop, stintList, neutralLaps } from '/shared/pits.js';

// Écart au leader en secondes (les retardataires sont convertis avec le dernier tour du leader).
function gapsToLeader(state) {
  const lines = state.TimingData?.Lines || {};
  const nums = orderedNumbers(state).filter((n) => lines[n] && !lines[n].Retired && !lines[n].Stopped);
  const leader = nums[0];
  const leaderLap = parseLapTime(lines[leader]?.LastLapTime?.Value) || parseLapTime(lines[leader]?.BestLapTime?.Value) || 90;
  const out = [];
  for (const n of nums) {
    const g = parseGap(lines[n].GapToLeader);
    let s = null;
    if (n === leader || g?.leader) s = 0;
    else if (g?.laps) s = g.laps * leaderLap;
    else if (g && g.s !== undefined) s = g.s;
    if (s !== null) out.push({ num: n, gap: s, lapped: g?.laps || 0 });
  }
  out.sort((a, b) => a.gap - b.gap);
  out.lap = leaderLap;
  return out;
}

// Cercle de position (comme le « Circle of Doom » de MultiViewer) : un tour = un tour de cercle.
// Les voitures tournent avec leur position sur la piste à l'heure affichée (GPS ou estimée, comme
// sur la carte), ligne d'arrivée en haut ; sans tracé, elles sont placées selon leur écart au
// leader (le leader en haut). La sortie des stands du pilote choisi le suit, en retard du temps
// perdu au stand.
const R = 112, C = 228, TAU = 2 * Math.PI, RL = R + 40, RL2 = 32;   // RL : rayon des étiquettes (RL2 : deuxième rangée)
const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
const f1 = (v) => v.toFixed(1);
function trackAngle(num) {
  const pos = store.positions, L = pos.track?.L, now = displayNow();
  if (!L) return null;
  const p = pos.hasGps(now) ? pos.progressAt(num, now) : pos.estimatedProgress(num, now);
  return p === null || p === undefined ? null : ((((p / L - pos.lineFrac()) % 1) + 1) % 1) * TAU;
}

// État de la piste affiché au centre du cercle
const TRACK = { 1: ['Piste dégagée', 'green'], 2: ['Drapeau jaune', 'yellow'], 4: ['Voiture de sécurité', 'yellow'], 5: ['Drapeau rouge', 'red'], 6: ['VSC', 'yellow'], 7: ['Fin de VSC', 'yellow'] };

function circleSvg(gaps, me, dl, live) {
  const lap = gaps.lap || 90, s = store.state;
  const cur = Number(s.LapCount?.CurrentLap) || 0, total = Number(s.LapCount?.TotalLaps) || 0;
  const [stTxt, stCls] = TRACK[String(s.TrackStatus?.Status || '1')] || TRACK[1];
  // Graduations : une par seconde, plus longues et numérotées toutes les 10 s (temps derrière la ligne / le leader)
  const ticks = Array.from({ length: Math.floor(lap) }, (_, i) => {
    const a = -(i / lap) * TAU, big = i % 10 === 0 && i;
    const [ax, ay] = pt(a, R - (big ? 15 : 9)), [bx, by] = pt(a, R - 4);
    const lbl = big ? (() => { const [tx2, ty2] = pt(a, R - 24); return `<text x="${f1(tx2)}" y="${f1(ty2)}" class="cd-sec">${i}</text>`; })() : '';
    return `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}"${big ? ' class="big"' : ''}/>${lbl}`;
  }).join('');
  const cars = gaps.map((g) => {
    const col = teamColor(dl[g.num]);
    return `<g class="cd-car${g.num === me ? ' me' : ''}" data-num="${g.num}"><line class="cd-lead" stroke="${col}"/><circle class="cd-dot" r="${g.num === me ? 7.5 : 5.5}" fill="${col}"/>
      <g class="cd-tag"><rect x="-19" y="-12" width="38" height="24" rx="4" fill="${col}"/><text y="-3" class="t1">${esc(dl[g.num]?.Tla || g.num)}</text><text y="7.5" class="t2"></text></g></g>`;
  }).join('');
  const flag = `<g class="cd-flag" transform="translate(${C - 7} ${C - R - 23})">${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 ? '' : `<rect x="${c * 3.5}" y="${r * 3.5}" width="3.5" height="3.5"/>`)).join('')).join('')}<rect x="0" y="0" width="14" height="10.5" class="cd-flag-box"/></g>`;
  return `<svg class="cd" viewBox="0 0 ${2 * C} ${2 * C}" role="img" aria-label="Cercle de position">
    <circle cx="${C}" cy="${C}" r="${R + 22}" class="cd-bg"/><circle cx="${C}" cy="${C}" r="${R}" class="cd-ring"/><g class="cd-ticks">${ticks}</g>
    ${live ? flag : ''}
    <path class="cd-loss"/><g class="cd-in-loss"></g><circle r="9.5" class="cd-ghost"/>
    <g class="cd-ghost-l"><rect x="-38" y="-9" width="76" height="18" rx="5"/><text y="1">${esc(t('Après l\'arrêt'))}</text></g>
    ${cars}
    <text x="${C}" y="${C - 14}" class="cd-lap">${cur ? `${cur}${total ? `/${total}` : ''}` : ''}</text>
    <g transform="translate(${C} ${C + 8})"><rect x="-44" y="-9" width="88" height="17" rx="4" class="cd-st ${stCls}"/><text y="0" class="cd-st-t">${esc(t(stTxt))}</text></g>
    <text x="${C}" y="${C + 30}" class="cd-mid2">${esc(t('Tour de référence : {}', `${f1(lap).replace('.', DEC)} s`))}</text>
    <text x="${C}" y="${C + 43}" class="cd-mid3">${esc(t('Écart à {}', dl[me]?.Tla || me))} · ${live ? esc(t('ligne en haut')) : esc(t('leader en haut'))}</text>
  </svg>`;
}

// Placement des voitures, à chaque image tant que le simulateur est affiché (mouvement lissé)
let cd = null;
const cdAng = new Map();
let cdLast = 0;
function placeCars() {
  const svg = $('#pitsim svg.cd');
  if (!svg || !cd) return;
  const now = performance.now(), k = Math.min(1, ((now - cdLast) / 1000) * 5);
  cdLast = now;
  const { gaps, me, projected } = cd, lap = gaps.lap || 90;
  const lead = trackAngle(gaps[0].num) ?? 0, mine = gaps.find((g) => g.num === me);
  const list = [];
  for (const g of gaps) {
    const el = svg.querySelector(`.cd-car[data-num="${g.num}"]`);
    if (!el) continue;
    const target = trackAngle(g.num) ?? lead - ((g.gap % lap) / lap) * TAU;
    const prev = cdAng.get(g.num);
    const a = prev === undefined ? target : prev + Math.atan2(Math.sin(target - prev), Math.cos(target - prev)) * k;
    cdAng.set(g.num, a);
    list.push({ g, el, a, la: a });
  }
  // Étiquettes à l'extérieur, au moins MIN radians les unes des autres, au plus près de leur voiture : tour coupé au plus
  // grand vide entre deux voitures, puis passe avant (pousser vers l'avant) et passe arrière (vers l'arrière), moyennées
  // Deux rangées en alternance quand elles se suivent de près : l'écart minimal se compte entre voisines de rangée
  const MIN = Math.min(0.15, (TAU * 0.96) / Math.max(1, list.length));
  const norm = (x) => (((x % TAU) + TAU) % TAU);
  list.sort((x, y) => norm(x.a) - norm(y.a));
  if (list.length > 1) {
    let cut = 0, gapMax = -1;
    list.forEach((o, i) => { const d = norm(list[(i + 1) % list.length].a - o.a) || TAU; if (d > gapMax) { gapMax = d; cut = (i + 1) % list.length; } });
    const seq = [...list.slice(cut), ...list.slice(0, cut)];
    let base = norm(seq[0].a);
    const want = seq.map((o) => { const v = norm(o.a - base) + base; return v; });
    const fw = [], bw = [];
    want.forEach((v, i) => { fw.push(i ? Math.max(v, fw[i - 1] + MIN) : v); });
    for (let i = want.length - 1; i >= 0; i--) bw[i] = i === want.length - 1 ? want[i] : Math.min(want[i], bw[i + 1] - MIN);
    seq.forEach((o, i) => { o.la = (fw[i] + bw[i]) / 2; });
    seq.forEach((o, i) => { o.ring = i && o.la - seq[i - 1].la < 0.27 ? 1 - seq[i - 1].ring : 0; });
  } else list.forEach((o) => { o.la = o.a; o.ring = 0; });
  for (const { g, el, a, la, ring } of list) {
    const rl = RL + (ring ? RL2 : 0), [x, y] = pt(a, R), [lx, ly] = pt(la, rl), [ex, ey] = pt(la, rl - 13), [sx, sy] = pt(a, R + 8);
    const dot = el.querySelector('.cd-dot'), lead2 = el.querySelector('.cd-lead'), tag = el.querySelector('.cd-tag');
    dot.setAttribute('cx', f1(x)); dot.setAttribute('cy', f1(y));
    lead2.setAttribute('x1', f1(sx)); lead2.setAttribute('y1', f1(sy)); lead2.setAttribute('x2', f1(ex)); lead2.setAttribute('y2', f1(ey));
    tag.setAttribute('transform', `translate(${f1(lx)} ${f1(ly)})`);
    // Écart avec le pilote choisi (lui : sa position) ; voitures à un tour ou plus : « 1T »
    const d = g.gap - mine.gap, t2 = tag.querySelector('.t2');
    const txt = g.num === me ? `P${gaps.indexOf(g) + 1}` : g.lapped && g.lapped !== mine.lapped ? `${Math.abs(g.lapped - (mine.lapped || 0))}T` : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1).replace('.', DEC)}`;
    if (t2.textContent !== txt) t2.textContent = txt;
  }
  // Sortie des stands : arc violet en retard du temps perdu au stand ; repère des voitures que l'arc couvre
  const aMe = cdAng.get(me) ?? 0, span = ((projected - mine.gap) / lap) * TAU, a1 = aMe - span;
  const [x0, y0] = pt(aMe, R), [x1, y1] = pt(a1, R), [gx, gy] = pt(a1, R - 30);
  svg.querySelector('.cd-loss').setAttribute('d', `M${f1(x0)} ${f1(y0)} A${R} ${R} 0 ${Math.abs(span) > Math.PI ? 1 : 0} 0 ${f1(x1)} ${f1(y1)}`);
  const inLoss = list.filter((o) => o.g.num !== me && o.g.gap > mine.gap && o.g.gap <= projected).map((o) => {
    const [ax, ay] = pt(o.a, R - 8), [bx, by] = pt(o.a, R + 8);
    return `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}"/>`;
  }).join('');
  const box = svg.querySelector('.cd-in-loss');
  if (box._h !== inLoss) { box.innerHTML = inLoss; box._h = inLoss; }
  const gh = svg.querySelector('.cd-ghost');
  gh.setAttribute('cx', f1(x1)); gh.setAttribute('cy', f1(y1));
  svg.querySelector('.cd-ghost-l').setAttribute('transform', `translate(${f1(gx)} ${f1(gy)})`);
}

// ---------------- Simulateur d'arrêt ----------------
let simDriver = null;
let lossOverride = null;
let simKey = '';

// Temps perdu au stand mesuré pendant cette course (arrêts sous drapeau vert, shared/pits.js),
// recalculé quand de nouveaux tours ou arrêts arrivent
let measured = { key: '', val: null };
const lst = (o) => (Array.isArray(o) ? o : Object.values(o || {})).filter(Boolean);
function sessionLoss() {
  const key = versionOf(['TimingData', 'PitLaneTimeCollection', 'TimingAppData', 'PitStopSeries', 'RaceControlMessages', '__reset']);
  if (measured.key === key) return measured.val;
  const s = store.state, d = store.derived;
  const app = s.TimingAppData?.Lines || {};
  const laps = {};
  for (const [n, arr] of Object.entries(d.laps || {})) laps[n] = arr.map((x) => ({ lap: x.lap, s1: parseLapTime(x.s?.[0]), s3: parseLapTime(x.s?.[2]), pit: x.pit }));
  const stopTime = new Map();
  for (const [n, arr] of Object.entries(s.PitStopSeries?.PitTimes || {})) {
    for (const p of lst(arr)) { const ps = p.PitStop || p; if (ps?.Lap) stopTime.set(`${n}-${ps.Lap}`, parseLapTime(ps.PitStopTime)); }
  }
  const byNum = {};
  for (const x of [...(d.pitLane || [])].sort((a, b) => a.t - b.t)) (byNum[x.num] ||= []).push(x);
  const stops = [];
  for (const [n, arr] of Object.entries(byNum)) {
    const st = stintList(app[n]);
    arr.forEach((x, i) => { if (passIsRealStop(st, i)) stops.push({ num: n, lap: x.lap, stop: stopTime.get(`${n}-${x.lap}`) ?? null }); });
  }
  measured = { key, val: measuredPitLoss(laps, stops, neutralLaps(s.RaceControlMessages?.Messages)) };
  return measured.val;
}

function defaultLoss() {
  const pl = currentTrack()?.raw?.pitLoss;
  const ts = String(store.state.TrackStatus?.Status || '1');
  const m = sessionLoss();
  // Au moins 3 arrêts mesurés : la mesure de la course prime sur la valeur du circuit
  const useM = m && m.n >= 3;
  const normal = useM ? m.value : Number(pl?.normal) || 22;
  const src = useM ? `mesuré sur ${m.n} arrêts de la course` : pl ? 'valeur du circuit' : 'valeur par défaut';
  // Sous neutralisation, les autres roulent lentement : la perte est plus faible (même proportion
  // que pour les valeurs du circuit, sinon environ 63 % sous safety car et 72 % sous VSC)
  const ratio = (k, def) => (pl?.[k] && pl?.normal ? Number(pl[k]) / Number(pl.normal) : def);
  if (ts === '4') return { value: Math.round(normal * ratio('sc', 0.63) * 10) / 10, label: `sous voiture de sécurité · ${src}` };
  if (ts === '6' || ts === '7') return { value: Math.round(normal * ratio('vsc', 0.72) * 10) / 10, label: `sous VSC · ${src}` };
  return { value: normal, label: `en conditions normales · ${src}` };
}

export function renderPitSim(force = false) {
  const el = $('#pitsim');
  if (!el.classList.contains('active') && !force) return;
  const key = `${versionOf(['TimingData', 'TrackStatus', 'DriverList', '__reset'])}|${simDriver}|${lossOverride}|${store.focus}`;
  if (key === simKey && !force) return;
  // Pas de reconstruction pendant la saisie, et au plus une fois par seconde.
  if (!force && performance.now() - (renderPitSim.last || 0) < 1000) return;
  renderPitSim.last = performance.now();
  simKey = key;
  const s = store.state;
  const dl = drivers(s);
  if (sessionKind(s) !== 'race') {
    el.innerHTML = '<div class="note">Le simulateur d\'arrêt au stand est disponible pendant les courses (et sprints).</div>';
    return;
  }
  const gaps = gapsToLeader(s);
  if (!gaps.length) { el.innerHTML = '<div class="note">En attente des écarts…</div>'; return; }
  const me = simDriver && gaps.find((g) => g.num === simDriver) ? simDriver : (store.focus && gaps.find((g) => g.num === store.focus) ? store.focus : store.duel.a && gaps.find((g) => g.num === store.duel.a) ? store.duel.a : gaps[0].num);
  const loss = defaultLoss();
  const lossVal = lossOverride ?? loss.value;
  const mine = gaps.find((g) => g.num === me);
  const projected = mine.gap + lossVal;
  const others = gaps.filter((g) => g.num !== me);
  const ahead = [...others].reverse().find((g) => g.gap <= projected);
  const behind = others.find((g) => g.gap > projected);
  const newPos = others.filter((g) => g.gap <= projected).length + 1;
  const curPos = gaps.findIndex((g) => g.num === me) + 1;
  const order = [...others, { num: me, gap: projected, me: true }].sort((a, b) => a.gap - b.gap);
  const idx = order.findIndex((o) => o.me);
  const slice = order.slice(Math.max(0, idx - 3), idx + 4);

  // Les commandes sont construites une seule fois : elles ne bougent pas sous la souris
  // pendant que le résultat se met à jour.
  if (!el.querySelector('.pitsim-ctrl')) {
    el.innerHTML = `<div class="pitsim">
      <div class="pitsim-ctrl">
        <label class="small muted">Pilote <select id="simDriver"></select></label>
        <div class="loss-box">
          <div class="small muted">Temps perdu au stand <span id="simLossSrc"></span></div>
          <div class="stepper">
            <button class="btn" data-step="-1" title="−1 s">−1</button>
            <button class="btn" data-step="-0.5" title="−0,5 s">−0,5</button>
            <output id="simLossVal"></output>
            <button class="btn" data-step="0.5" title="+0,5 s">+0,5</button>
            <button class="btn" data-step="1" title="+1 s">+1</button>
            <button class="btn small" id="simLossReset" title="Revenir à la valeur du circuit">Auto</button>
          </div>
          <input id="simLoss" type="range" min="10" max="45" step="0.1" aria-label="Temps perdu au stand">
        </div>
      </div>
      <div id="simOut"></div>
      <p class="small muted">Estimation : écart au leader + temps perdu dans les stands (ajustable). Sans pneus neufs ni trafic.</p>
    </div>`;
    $('#simDriver').onchange = (e) => { simDriver = e.target.value; renderPitSim(true); };
    const setLoss = (v) => { lossOverride = Math.round(Math.max(5, Math.min(60, v)) * 10) / 10; renderPitSim(true); };
    $('#simLoss').oninput = (e) => setLoss(parseFloat(e.target.value));
    el.querySelector('.stepper').onclick = (e) => {
      const b = e.target.closest('[data-step]');
      if (b) setLoss((lossOverride ?? defaultLoss().value) + Number(b.dataset.step));
    };
    $('#simLossReset').onclick = () => { lossOverride = null; renderPitSim(true); };
  }
  const sel = $('#simDriver');
  const opts = gaps.map((g) => `<option value="${g.num}"${driverOpt(dl[g.num] || {}, g.num)}>${esc(dl[g.num]?.Tla || g.num)}</option>`).join('');
  if (sel._opts !== opts) { sel.innerHTML = opts; sel._opts = opts; }
  if (document.activeElement !== sel) sel.value = me;
  $('#simLossVal').textContent = `${lossVal.toFixed(1).replace('.', DEC)} s`;
  $('#simLossSrc').textContent = `(${lossOverride !== null ? 'réglage manuel' : loss.label})`;
  if (document.activeElement !== $('#simLoss')) $('#simLoss').value = lossVal;
  $('#simLossReset').hidden = lossOverride === null;
  $('#simOut').innerHTML = `<div class="pitsim-cols"><div class="cd-wrap">${circleSvg(gaps, me, dl, trackAngle(gaps[0].num) !== null)}</div><div class="pitsim-res"><div class="pit-result">
      <div class="small muted">Si <b>${esc(dl[me]?.Tla || me)}</b> s'arrête maintenant (actuellement P${curPos}) :</div>
      <div class="big">P${newPos}</div>
      <div class="small">${ahead ? t('à {} derrière {}', `<b>${(projected - ahead.gap).toFixed(1).replace('.', DEC)} s</b>`, esc(dl[ahead.num]?.Tla || ahead.num)) : t('en tête')}${behind ? ` ${t('· {} devant {}', `<b>${(behind.gap - projected).toFixed(1).replace('.', DEC)} s</b>`, esc(dl[behind.num]?.Tla || behind.num))}` : ''}</div>
      ${behind && behind.gap - projected < 1.5 ? `<div class="small" style="color:var(--orange)">${icon('warning')} Sortie des stands très serrée : risque de ressortir derrière.</div>` : ''}
    </div>
    <table class="pit-order">${slice.map((o) => `<tr class="${o.me ? 'me' : ''}"><td>P${order.indexOf(o) + 1}</td>
      <td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[o.num])}"></span>${esc(dl[o.num]?.Tla || o.num)}${o.me ? ' (après arrêt)' : ''}</span></td>
      <td style="text-align:right">${o.me ? '' : fmtSigned(o.gap - projected, 1) + ' s'}</td></tr>`).join('')}</table></div></div>`;
  cd = { gaps, me, projected };
  placeCars();
}

// ---------------- Bagarres ----------------
let battleKey = '';

export function renderBattles(force = false) {
  const el = $('#battles');
  if (!el.classList.contains('active') && !force) return;
  const key = versionOf(['TimingData', 'DriverList', '__reset']);
  if (key === battleKey && !force) return;
  battleKey = key;
  const s = store.state;
  if (sessionKind(s) !== 'race') {
    el.innerHTML = '<div class="note">Bagarres en course : pilotes à moins de 1,5 s.</div>';
    return;
  }
  el.innerHTML = battleList(s) || '<div class="note">Aucune bagarre en cours (aucun écart sous 1,5 s).</div>';
}

export function battleList(s, max = 20) {
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const nums = orderedNumbers(s).filter((n) => lines[n] && !lines[n].Retired && !lines[n].Stopped && !lines[n].InPit);
  const out = [];
  for (let i = 1; i < nums.length; i++) {
    const back = nums[i], front = nums[i - 1];
    const iv = parseGap(lines[back].IntervalToPositionAhead?.Value);
    if (!iv || iv.laps || iv.leader || iv.s === undefined || iv.s > 1.5) continue;
    const series = lapGapSeries(front, back).filter((p) => !p.pit).slice(-4);
    let trend = '';
    if (series.length >= 2) {
      const rate = (series.at(-1).y - series[0].y) / (series.at(-1).x - series[0].x || 1);
      if (Math.abs(rate) >= 0.05) trend = rate < 0 ? `se rapproche (${fmtSigned(rate, 2)} s/tour)` : `s'éloigne (${fmtSigned(rate, 2)} s/tour)`;
      else trend = 'écart stable';
    }
    out.push({ front, back, gap: iv.s, trend, pos: lines[back].Position });
  }
  out.sort((a, b) => a.gap - b.gap);
  return out.slice(0, max).map((b) => `<div class="battle ${b.gap < 1 ? 'hot' : ''}">
    <div><div class="battle-pair"><span class="drv-bar" style="background:${teamColor(dl[b.front])}"></span>${esc(dl[b.front]?.Tla || b.front)}
      <span class="muted">vs</span><span class="drv-bar" style="background:${teamColor(dl[b.back])}"></span>${esc(dl[b.back]?.Tla || b.back)}
      <span class="muted small">P${Number(b.pos) - 1}–P${b.pos}</span></div>
      <div class="battle-sub">${b.gap < 1 ? 'Dans la seconde · ' : ''}${esc(b.trend)}</div></div>
    <div style="display:flex;align-items:center;gap:10px"><span class="battle-gap">${b.gap.toFixed(3).replace('.', DEC)}</span>
      <button class="btn small" data-battle="${b.front},${b.back}">Duel</button></div></div>`).join('');
}

export function initRaceTools() {
  const tick = () => { requestAnimationFrame(tick); if (document.visibilityState === 'visible' && $('#pitsim')?.classList.contains('active')) placeCars(); };
  requestAnimationFrame(tick);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-battle]');
    if (!b) return;
    const [front, back] = b.dataset.battle.split(',');
    setDuelPair(front, back);
  });
}
