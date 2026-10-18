// Onglets : télémétrie du pilote suivi, stratégie pneus, météo, championnat (prévision).
import { store, displayNow, versionOf, setFocus } from '../store.js';
import { Dial, SpeedTrace, animate, carNow } from './gauge.js';
import { $, esc, drivers, orderedNumbers, teamColor, teamMark, stintsOf, compoundInfo, COMPOUNDS, fmtLap, fmtSigned, lapSeconds } from '../util.js';
import { icon } from '../icons.js';
import { realStints } from '/shared/pits.js';
import { upcoming } from './home.js';
import { DEC, LOCALE, t } from '../i18n.js';

let lastTele = 0;
let stratVer = -1, wxVer = -1, champVer = -1;

function focusDriver() {
  const dl = drivers(store.state);
  if (store.focus && dl[store.focus]) return store.focus;
  if (store.duel.a && dl[store.duel.a]) return store.duel.a;
  return orderedNumbers(store.state)[0] || null;
}

// Pilote B de la télémétrie (comparaison) : choisi dans l'onglet, sinon pilote B du duel
let teleB = null;
let teleBOff = false;

// Compteurs et courbe : construits une fois par choix de pilotes, puis animés image par image
// (voir gauge.js) ; ce rendu périodique ne gère que la structure.
let tele = null;   // { dialA, dialB, trace, num, numB }

function animateTelemetry() {
  animate('telemetry', (dt) => {
    const el = $('#telemetry');
    if (!tele || !el.isConnected || !el.classList.contains('active') || !el.contains(tele.dialA.el)) return false;
    const dl = drivers(store.state);
    const disp = displayNow();
    const colA = teamColor(dl[tele.num] || {});
    tele.dialA.setColor(colA);
    tele.dialA.update(carNow(tele.num, disp), dt);
    let colB = null;
    if (tele.numB && tele.dialB) {
      colB = teamColor(dl[tele.numB] || {});
      tele.dialB.setColor(colB);
      tele.dialB.update(carNow(tele.numB, disp), dt);
    }
    tele.trace.update([
      { num: tele.num, color: colA },
      ...(tele.numB ? [{ num: tele.numB, color: colB, dash: dl[tele.numB]?.TeamName === dl[tele.num]?.TeamName }] : []),
    ], disp);
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
    el.innerHTML = `<div class="note">Pas de télémétrie : en direct, connectez F1 TV dans Réglages.</div>`;
    el._k = null;
    tele = null;
    return;
  }
  if (!num) return;
  // Pilote B : choisi ici, sinon pilote B (ou A) du duel s'il est différent du pilote suivi
  const numB = teleBOff ? null : teleB && dl[teleB] && teleB !== num ? teleB
    : [store.duel.b, store.duel.a].find((n) => n && n !== num && dl[n]) || null;
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  const key = `${num}|${numB}|${nums.join(',')}`;
  if (el._k !== key) {
    el._k = key;
    const pick = (id, cur, none) => `<select id="${id}" class="tele-pick">${none ? '<option value="">+ Comparer…</option>' : ''}${nums.map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${esc(dl[n].Tla)}</option>`).join('')}</select>`;
    const head = (n) => {
      const d = dl[n] || {};
      return `<div class="tele-name" style="--tc:${teamColor(d)}">${teamMark(d)}<b>${esc(d.Tla || n)}</b><span class="muted small">${esc(d.LastName || '')}</span></div>`;
    };
    el.innerHTML = `<div class="tele2">
      <div class="tele2-bar"><span class="tele-chip" style="--tc:${teamColor(dl[num] || {})}">${pick('teleSel', num)}</span>
        <span class="tele-vs">vs</span>
        <span class="tele-chip ${numB ? '' : 'empty'}" style="--tc:${numB ? teamColor(dl[numB] || {}) : 'var(--border)'}">${pick('teleSelB', numB, true)}${numB ? `<button class="tele-x" id="teleClearB" title="Un seul pilote" aria-label="Retirer le second pilote">${icon('close')}</button>` : ''}</span>
        <span class="muted small tele-hint">clic sur un pilote du classement = pilote suivi</span></div>
      <div class="tele2-dials ${numB ? 'two' : 'one'}">
        <div class="tele2-col">${head(num)}<div class="tele-dial" id="teleDialA"></div></div>
        ${numB ? `<div class="tele2-vs">VS</div><div class="tele2-col">${head(numB)}<div class="tele-dial" id="teleDialB"></div></div>` : ''}
      </div>
      <div class="trace"><div class="chart-title"><span>Vitesse — 30 dernières secondes (km/h)</span></div><div id="teleTrace"></div></div></div>`;
    $('#teleSel').addEventListener('change', (e) => setFocus(e.target.value));
    $('#teleSelB').addEventListener('change', (e) => { teleB = e.target.value || null; teleBOff = !teleB; el._k = null; lastTele = 0; renderTelemetry(); });
    $('#teleClearB')?.addEventListener('click', () => { teleB = null; teleBOff = true; el._k = null; lastTele = 0; renderTelemetry(); });
    tele = { num, numB, dialA: new Dial(teamColor(dl[num] || {})), dialB: numB ? new Dial(teamColor(dl[numB] || {})) : null, trace: new SpeedTrace($('#teleTrace')) };
    $('#teleDialA').appendChild(tele.dialA.el);
    if (tele.dialB) $('#teleDialB').appendChild(tele.dialB.el);
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
    <div class="strat-row strat-headrow"><span></span><span></span><span class="small muted" title="Moyenne des 5 derniers tours propres du relais en cours">Rythme</span><span class="small muted" title="Évolution du temps au tour sur le relais en cours (régression linéaire, hors tours perturbés)">Usure</span></div>
    ${rows.map((r) => `<div class="strat-row"><div class="strat-name" style="border-left:3px solid ${teamColor(dl[r.num])};padding-left:5px">${esc(dl[r.num].Tla)}</div>
      <div class="strat-track">${r.stints.map((st) => {
        const ci = compoundInfo(st.Compound);
        return `<div class="strat-stint" title="${esc(ci.name)} · ${st.len} tour(s)${st.New === 'false' || st.New === false ? ' · pneus déjà utilisés' : ''}" style="left:${(st.from / total) * 100}%;width:${Math.max(0.8, (st.len / total) * 100)}%;background:${ci.color}">${st.len >= 3 ? st.len : ''}</div>`;
      }).join('')}</div>
      <span class="strat-pace">${r.pace ? fmtLap(r.pace.avg) : '<span class="dim">—</span>'}</span>
      <span class="strat-deg ${r.pace?.deg > 0.08 ? 'down' : r.pace?.deg < -0.02 ? 'up' : ''}">${r.pace && r.pace.n >= 4 ? `${fmtSigned(r.pace.deg, 2)} s/t` : '<span class="dim">—</span>'}</span></div>`).join('')}
    <div class="strat-axis"><span></span><span style="display:flex;justify-content:space-between"><span>Tour 0</span><span>Tour ${total}</span></span></div>
    <p class="small muted">Usure : variation moyenne du temps au tour sur le relais en cours (positive = le pilote ralentit, les pneus se dégradent). Le carburant qui s'allège fait gagner ~0,05 s/tour, à garder en tête.</p>
  </div>`;
}

const gauge = (lbl, val, unit) => `<div class="gauge"><div class="gauge-lbl">${lbl}</div><div class="gauge-val">${val}<small> ${unit}</small></div></div>`;
const windArrow = (dir) => `<span class="wind-arrow" style="transform:rotate(${dir + 180}deg)" title="Direction ${dir}°">${icon('arrow-up')}</span>`;
// Entre deux séances : temps qu'il fait sur le circuit du prochain Grand Prix et prévisions du
// week-end (Open-Meteo), plutôt que la station météo de la dernière séance chargée
function upcomingWeather(nx) {
  const c = nx.current, place = nx.locality || nx.race;
  const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(d).replace('.', DEC) : '—');
  $('#wxGauges').innerHTML = `${c ? `<div class="wx">
    ${gauge('Air', num(c.air, 1), '°C')}${gauge('Humidité', num(c.humidity), '%')}${gauge('Pression', num(c.pressure, 1), 'hPa')}
    ${gauge('Vent', num(c.wind), `km/h ${Number.isFinite(c.windDir) ? windArrow(c.windDir) : ''}`)}${gauge('Pluie', Number(c.rain) > 0 ? `${icon('rain')} ${num(c.rain, 1)}` : 'Non', Number(c.rain) > 0 ? 'mm' : '')}
  </div>` : ''}
    ${nx.days?.length ? `<div class="hm-wx">${nx.days.map((d) => `<span><b>${esc(new Date(`${d.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }))}</b> ${Math.round(d.tmin)}–${Math.round(d.tmax)}° ${d.rain != null ? `<small>${icon('rain')} ${d.rain} %</small>` : ''}</span>`).join('')}</div>` : ''}
    <p class="note">${c || nx.days?.length ? 'Open-Meteo' : esc(t('Météo de {} en cours de chargement…', place))}</p>`;
}

export function renderWeather() {
  const nx = upcoming();
  const v = `${versionOf(['WeatherData', '__reset'])}|${nx ? `${nx.race}|${JSON.stringify(nx.current)}|${nx.days?.length}` : ''}`;
  if (v === wxVer) return;
  wxVer = v;
  const w = store.state.WeatherData;
  // Deux zones : jauges (ici) et radar des précipitations (radar.js), rafraîchies séparément
  if (!$('#wxGauges')) $('#weather').innerHTML = '<div id="wxGauges"></div><div id="wxRadar"></div>';
  if (nx) { upcomingWeather(nx); return; }
  if (!w) { $('#wxGauges').innerHTML = '<div class="note">Pas de données météo.</div>'; return; }
  const g = gauge;
  const wind = Number(w.WindSpeed);
  const dir = Number(w.WindDirection) || 0;
  $('#wxGauges').innerHTML = `<div class="wx">
    ${g('Air', esc(w.AirTemp), '°C')}${g('Piste', esc(w.TrackTemp), '°C')}${g('Humidité', esc(w.Humidity), '%')}
    ${g('Pression', esc(w.Pressure), 'hPa')}
    ${g('Vent', Number.isFinite(wind) ? (wind * 3.6).toFixed(0) : '—', `km/h ${windArrow(dir)}`)}
    ${g('Pluie', w.Rainfall === '1' || w.Rainfall === 1 ? `${icon('rain')} Oui` : 'Non', '')}
  </div><p class="note">Vent : ${dir}° (d'où il vient)</p>`;
}

export function renderChampionship() {
  const v = versionOf(['ChampionshipPrediction', 'DriverList', '__reset']);
  if (v === champVer) return;
  champVer = v;
  const cp = store.state.ChampionshipPrediction;
  const dl = drivers(store.state);
  if (!cp?.Drivers) {
    $('#champ').innerHTML = '<div class="note">La projection du championnat est publiée par la F1 pendant les courses (et sprints).</div>';
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
