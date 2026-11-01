// Onglets : télémétrie du pilote suivi, stratégie pneus, météo, championnat (prévision).
import { store, displayNow, versionOf } from '../store.js';
import { Dial, SpeedTrace, animate, carNow, energyOf } from './gauge.js';
import { $, esc, drivers, orderedNumbers, teamColor, teamMark, stintsOf, compoundInfo, COMPOUNDS, fmtLap, fmtSigned, lapSeconds } from '../util.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { realStints } from '/shared/pits.js';

let lastTele = 0;
let stratVer = -1, champVer = -1;

function focusDriver() {
  const dl = drivers(store.state);
  if (store.focus && dl[store.focus]) return store.focus;
  if (store.duel.a && dl[store.duel.a]) return store.duel.a;
  return orderedNumbers(store.state)[0] || null;
}

// Pilote B de la télémétrie (comparaison) : choisi dans l'onglet, sinon pilote B du duel

// Compteurs et courbe : construits une fois par choix de pilotes, puis animés image par image
// (voir gauge.js) ; ce rendu périodique ne gère que la structure.
let tele = null;   // { dialA, trace, num }

function animateTelemetry() {
  animate('telemetry', (dt) => {
    const el = $('#telemetry');
    if (!tele || !el.isConnected || !el.classList.contains('active') || !el.contains(tele.dialA.el)) return false;
    const dl = drivers(store.state);
    const disp = displayNow();
    const colA = teamColor(dl[tele.num] || {});
    tele.dialA.setColor(colA);
    tele.dialA.update(carNow(tele.num, disp), dt, energyOf(tele.num, disp));
    tele.trace.update([{ num: tele.num, color: colA }], disp);
    return true;
  });
}

export function renderTelemetry() {
  const now = performance.now();
  if (now - lastTele < 120) return;
  lastTele = now;
  const el = $('#telemetry');
  if (!el.classList.contains('active')) return;
  const dl = drivers(store.state);
  const num = focusDriver();
  if (!store.positions.car.size) {
    el.innerHTML = `<div class="note">${store.status?.source?.mode === 'replay' ? 'Pas de télémétrie dans ce replay.' : 'Pas de télémétrie : en direct, connectez F1 TV dans Réglages.'}</div>`;
    el._k = null;
    tele = null;
    return;
  }
  if (!num) return;
  // Le pilote suivi seul, choisi en cliquant dans le classement (deux pilotes côte à côte : bandeau du duel)
  const key = num;
  if (el._k !== key) {
    el._k = key;
    const d = dl[num] || {};
    el.innerHTML = `<div class="tele2">
      <div class="tele2-dials one">
        <div class="tele2-col"><div class="tele-name" style="--tc:${teamColor(d)}" title="${esc(t('clic sur un pilote du classement = pilote suivi'))}">${teamMark(d)}<b>${esc(d.Tla || num)}</b><span class="muted small">${esc(d.LastName || '')}</span></div><div class="tele-dial" id="teleDialA"></div></div>
      </div>
      <div class="trace"><div class="chart-title"><span>Vitesse — 30 dernières secondes (km/h)</span></div><div id="teleTrace"></div></div></div>`;
    tele = { num, dialA: new Dial(teamColor(d)), trace: new SpeedTrace($('#teleTrace')) };
    $('#teleDialA').appendChild(tele.dialA.el);
  }
  animateTelemetry();
}


export function renderStrategy() {
  const v = versionOf(['TimingAppData', 'LapCount', 'DriverList', 'TimingData', '__reset']);
  if (v === stratVer) return;
  if (!$('#strategy').classList.contains('active') || performance.now() - (renderStrategy.last || 0) < 1000) return;
  renderStrategy.last = performance.now();
  stratVer = v;
  const s = store.state;
  const dl = drivers(s);
  const app = s.TimingAppData?.Lines || {};
  const nums = orderedNumbers(s).filter((n) => dl[n]);
  let total = Number(s.LapCount?.TotalLaps) || 0;
  const rows = nums.map((num) => {
    let start = 0;
    // Relais réels : un passage par les stands sans changer de pneus ne coupe pas le relais
    const stints = realStints(stintsOf(app[num])).map((st) => {
      const len = Math.max(0, (Number(st.TotalLaps) || 0) - (Number(st.StartLaps) || 0));
      const out = { ...st, from: start, len };
      start += len;
      return out;
    });
    return { num, stints, laps: start, pace: stintPace(num) };
  });
  total = Math.max(total, ...rows.map((r) => r.laps), 1);
  $('#strategy').innerHTML = `<div class="strat">
    <div class="strat-legend">${Object.values(COMPOUNDS).map((c) => `<span><span class="tyre" style="--tc:${c.color}">${c.letter}</span> ${c.name}</span>`).join('')}</div>
    <div class="strat-row strat-headrow"><span></span><span></span><span class="small muted" title="Moyenne des 5 derniers tours propres du relais en cours">Rythme</span><span class="small muted" title="Évolution du temps au tour sur le relais">Usure</span></div>
    ${rows.map((r) => `<div class="strat-row"><div class="strat-name" style="border-left:3px solid ${teamColor(dl[r.num])};padding-left:5px">${esc(dl[r.num].Tla)}</div>
      <div class="strat-track">${r.stints.map((st) => {
        const ci = compoundInfo(st.Compound);
        return `<div class="strat-stint" title="${esc(ci.name)} · ${st.len} tour(s)${st.New === 'false' || st.New === false ? ' · pneus déjà utilisés' : ''}" style="left:${(st.from / total) * 100}%;width:${Math.max(0.8, (st.len / total) * 100)}%;background:${ci.color}">${st.len >= 3 ? st.len : ''}</div>`;
      }).join('')}</div>
      <span class="strat-pace">${r.pace ? fmtLap(r.pace.avg) : '<span class="dim">—</span>'}</span>
      <span class="strat-deg ${r.pace?.deg > 0.08 ? 'down' : r.pace?.deg < -0.02 ? 'up' : ''}">${r.pace && r.pace.n >= 4 ? `${fmtSigned(r.pace.deg, 2)} s/t` : '<span class="dim">—</span>'}</span></div>`).join('')}
    <div class="strat-axis"><span></span><span style="display:flex;justify-content:space-between"><span>Tour 0</span><span>Tour ${total}</span></span></div>
    <p class="small muted">Usure : perte moyenne par tour sur le relais (positif = le pilote ralentit).</p>
  </div>`;
}

export function renderChampionship() {
  const v = versionOf(['ChampionshipPrediction', 'DriverList', '__reset']);
  if (v === champVer) return;
  champVer = v;
  const cp = store.state.ChampionshipPrediction;
  const dl = drivers(store.state);
  if (!cp?.Drivers) {
    $('#champ').innerHTML = '<div class="note">Projection du championnat pendant les courses et sprints.</div>';
    return;
  }
  const rows = Object.values(cp.Drivers).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
  const teams = Object.values(cp.Teams || {}).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
  // Points marqués sur la course en cours (projetés - actuels)
  const gain = (cur, pred) => {
    const d = (Number(pred) || 0) - (Number(cur) || 0);
    return d > 0 ? `<span class="pts-gain">+${d}</span>` : '<span class="dim">—</span>';
  };
  const mv = (cur, pred) => {
    const d = (cur || 0) - (pred || 0);
    return d ? `<span class="${d > 0 ? 'up' : 'down'}">${icon(d > 0 ? 'tri-up' : 'tri-down')}${Math.abs(d)}</span>` : '';
  };
  $('#champ').innerHTML = `<table class="champ"><tr><th>Proj.</th><th>Pilote</th><th>Pts actuels</th><th>Gagnés</th><th>Pts projetés</th><th></th></tr>
    ${rows.map((r) => {
      const d = dl[r.RacingNumber] || {};
      return `<tr><td>${r.PredictedPosition ?? '—'}</td><td><span class="drv">${teamMark(d)}<b>${esc(d.Tla || r.RacingNumber)}</b></span></td>
        <td>${r.CurrentPoints ?? '—'}</td><td>${gain(r.CurrentPoints, r.PredictedPoints)}</td><td><b>${r.PredictedPoints ?? '—'}</b></td><td>${mv(r.CurrentPosition, r.PredictedPosition)}</td></tr>`;
    }).join('')}</table>
    ${teams.length ? `<table class="champ" style="margin-top:10px"><tr><th>Proj.</th><th>Écurie</th><th>Pts actuels</th><th>Gagnés</th><th>Pts projetés</th><th></th></tr>
      ${teams.map((t) => `<tr><td>${t.PredictedPosition ?? '—'}</td><td><span class="drv">${teamMark(Object.values(dl).find((d) => d.TeamName === t.TeamName) || { TeamName: t.TeamName })}${esc(t.TeamName || '')}</span></td><td>${t.CurrentPoints ?? '—'}</td><td>${gain(t.CurrentPoints, t.PredictedPoints)}</td><td><b>${t.PredictedPoints ?? '—'}</b></td><td>${mv(t.CurrentPosition, t.PredictedPosition)}</td></tr>`).join('')}</table>` : ''}`;
}

// Rythme et dégradation sur le relais en cours (tours "propres" uniquement).
function stintPace(num) {
  const laps = store.derived.laps[num] || [];
  let start = 0;
  for (let i = laps.length - 1; i >= 0; i--) if (laps[i].pit) { start = i + 1; break; }
  const pts = laps.slice(start).filter((e) => e.lap > 1 && !e.pit).map((e) => ({ x: e.lap, y: lapSeconds(e.time) })).filter((p) => p.y);
  if (!pts.length) return null;
  const med = pts.map((p) => p.y).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  const clean = pts.filter((p) => p.y < med * 1.04);
  if (!clean.length) return null;
  const last5 = clean.slice(-5);
  const avg = last5.reduce((a, p) => a + p.y, 0) / last5.length;
  let deg = 0;
  if (clean.length >= 2) {
    const mx = clean.reduce((a, p) => a + p.x, 0) / clean.length;
    const my = clean.reduce((a, p) => a + p.y, 0) / clean.length;
    const num2 = clean.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const den = clean.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    deg = den ? num2 / den : 0;
  }
  return { avg, deg, n: clean.length };
}

// Onglet Météo : weather.js
export { renderWeather } from './weather.js';
