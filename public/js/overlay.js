// Overlays de streaming (OBS Studio, Streamlabs, Meld Studio) : une source navigateur par élément,
// fond transparent, même délai TV que l'appli. ?w= : banner (bandeaux de drapeau), laps (compteur de
// tours), countdown (compte à rebours), podium (trois premiers), telemetry (compteur du pilote suivi
// dans l'appli, sinon du leader). Le contenu est mis à l'échelle de la source.
import { translatePage, EN, t } from './i18n.js';
import { store, versionOf, on } from './store.js';
import { $, esc, api, drivers, orderedNumbers, sessionKind, teamColor, fmtDuration } from './util.js';
import { gpShort, gpFull, sessionLabel } from '/shared/gp-names.js';
import { connect } from './conn.js';
import { flagBanner, timeLeft } from './ui/session-info.js';
import { Dial, animate, carNow } from './ui/gauge.js';

translatePage();
const W = new URLSearchParams(location.search).get('w') || 'laps';
const ov = $('#ov');
ov.classList.add(`ov-${W}`);
let last = '';

// Mise à l'échelle : tout l'élément dans la source, agrandi ou réduit
function fit() {
  const html = document.documentElement;
  html.style.zoom = '';
  const w = ov.offsetWidth, h = ov.offsetHeight;
  if (w && h) html.style.zoom = String(Math.floor(Math.min(innerWidth / w, innerHeight / h) * 1000) / 1000);
}
window.addEventListener('resize', fit);
function show(html) {
  if (html === last) return;
  last = html;
  ov.innerHTML = html;
  fit();
}

const WAIT = '<div class="ov-card ov-wait">En attente des données de la séance…</div>';
const finished = () => ['Finished', 'Finalised', 'Ends'].includes(store.state.SessionStatus?.Status);
const session = () => { const i = store.state.SessionInfo; return i ? `${EN ? gpFull(i.Meeting?.Name, true, 'GP') : gpShort(i.Meeting?.Name)} · ${sessionLabel(i.Name, EN)}` : ''; };
const clock = (ms) => (ms === null ? '—' : fmtDuration(ms, ms >= 3600e3));

// Bandeaux : drapeau rouge, SC, VSC, jaune, vert à la reprise ; damier 30 s à l'arrivée
let endAt = 0;
function banner() {
  if (finished() && !endAt) endAt = performance.now();
  if (!finished()) endAt = 0;
  const b = flagBanner() || (endAt && performance.now() - endAt < 30000 ? { cls: 'chequered', text: 'Drapeau à damier', sub: session() } : null);
  show(b ? `<div class="flag-banner ${b.cls}"><span class="fb-icon"></span><span class="fb-text">${esc(b.text)}</span><span class="fb-sub">${esc(b.sub)}</span></div>` : '');
}

// Compteur de tours (course), partie et temps restant (qualifications), temps restant (essais)
function laps() {
  const s = store.state;
  if (!s.SessionInfo) return show(WAIT);
  const kind = sessionKind(s);
  const lc = s.LapCount;
  let label, value, sub = '', frac = null;
  if (kind === 'race') {
    const cur = Number(lc?.CurrentLap) || 0, tot = Number(lc?.TotalLaps) || 0;
    label = 'Tour';
    value = cur ? `${cur}<small> / ${tot || '—'}</small>` : '—';
    if (tot) { frac = Math.min(1, cur / tot); sub = finished() ? 'Arrivée' : tot - cur + 1 > 1 ? `${tot - cur + 1} tours restants` : 'Dernier tour'; }
  } else {
    label = kind === 'quali' ? 'Qualifications' : sessionLabel(s.SessionInfo.Name, EN);
    const part = s.TimingData?.SessionPart;
    value = kind === 'quali' && part ? `${/sprint/i.test(s.SessionInfo.Name) ? 'SQ' : 'Q'}${part}` : clock(timeLeft());
    sub = kind === 'quali' ? `Temps restant ${clock(timeLeft())}` : 'Temps restant';
  }
  show(`<div class="ov-card"><div class="ov-label">${esc(label)}</div><div class="ov-big">${value}</div>
    ${frac === null ? '' : `<div class="ov-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>`}<div class="ov-sub">${esc(sub)}</div></div>`);
}

// Compte à rebours : temps restant de la séance en cours, sinon début de la prochaine séance
let schedule = null;
async function loadSchedule() {
  const y = new Date().getFullYear();
  const all = [];
  for (const year of [y, y + 1]) {
    try { all.push(...(await api(`/api/schedule?year=${year}`)).races.flatMap((r) => r.sessions.filter((x) => x.t).map((x) => ({ race: r.name, label: x.label, t: Date.parse(x.t) })))); } catch { /* hors ligne */ }
    if (all.some((x) => x.t > Date.now())) break;
  }
  schedule = all.sort((a, b) => a.t - b.t);
}
function countdown() {
  const st = store.state.SessionStatus?.Status;
  const rem = timeLeft();
  if ((st === 'Started' || st === 'Aborted') && rem !== null) {
    return show(`<div class="ov-card"><div class="ov-label">${esc(session())}</div><div class="ov-big">${clock(rem)}</div><div class="ov-sub">Temps restant</div></div>`);
  }
  const nx = schedule?.find((x) => x.t > Date.now());
  if (!nx) return show(schedule ? '' : WAIT);
  const left = Math.floor((nx.t - Date.now()) / 1000);
  const d = Math.floor(left / 86400);
  const two = (n) => String(n).padStart(2, '0');
  show(`<div class="ov-card"><div class="ov-label">${esc(gpFull(nx.race, EN))}</div>
    <div class="ov-big">${d ? `${d}<small> ${EN ? 'd' : 'j'}</small> ` : ''}${two(Math.floor(left / 3600) % 24)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}</div>
    <div class="ov-sub">${esc(t(nx.label))} · ${esc(new Date(nx.t).toLocaleString(EN ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</div></div>`);
}

// Podium : les trois premiers (podium à l'arrivée d'une course), écart au premier ou meilleur temps
function podium() {
  const s = store.state;
  const dl = drivers(s), lines = s.TimingData?.Lines || {};
  const top = orderedNumbers(s).filter((n) => dl[n] && lines[n]?.Position).slice(0, 3);
  if (!top.length) return show(WAIT);
  const race = sessionKind(s) === 'race';
  const part = Number(s.TimingData?.SessionPart) || 1;
  const val = (n, i) => {
    const l = lines[n];
    if (race) return i ? String(l.GapToLeader || '') : (finished() ? 'Vainqueur' : 'Leader');
    const st = Object.values(l.Stats || {})[part - 1];
    return i ? st?.TimeDiffToFastest || l.TimeDiffToFastest || '' : Object.values(l.BestLapTimes || {})[part - 1]?.Value || l.BestLapTime?.Value || '';
  };
  show(`<div class="ov-card"><div class="ov-label">${race && finished() ? 'Podium' : 'Top 3'} · ${esc(session())}</div>
    ${top.map((n, i) => `<div class="ov-pod"><b class="ov-pos">${i + 1}</b><i style="background:${teamColor(dl[n])}"></i>
      <span class="ov-name">${esc(dl[n].FirstName || '')} <b>${esc(dl[n].LastName || dl[n].Tla || n)}</b><small>${esc(dl[n].TeamName || '')}</small></span><span class="ov-val">${esc(val(n, i))}</span></div>`).join('')}</div>`);
}

// Télémétrie : compteur (vitesse, régime, rapport, accélérateur, frein) du pilote suivi dans l'appli
let dial = null, dialNum = null;
function telemetry() {
  const s = store.state;
  const dl = drivers(s);
  const num = dl[store.focus] ? store.focus : orderedNumbers(s).find((n) => dl[n]);
  if (!num) { dialNum = null; return show(WAIT); }
  const d = dl[num];
  show(`<div class="ov-card"><div class="ov-pod"><b class="ov-pos">${esc(s.TimingData?.Lines?.[num]?.Position || '')}</b><i style="background:${teamColor(d)}"></i>
    <span class="ov-name">${esc(d.FirstName || '')} <b>${esc(d.LastName || d.Tla)}</b><small>${esc(d.TeamName || '')}</small></span></div><div id="ovDial"></div></div>`);
  if (!dial || dialNum !== num || !$('#ovDial').firstChild) {
    dial = dial || new Dial(teamColor(d));
    dial.setColor(teamColor(d));
    dialNum = num;
    $('#ovDial').append(dial.el);
    fit();
  }
}
if (W === 'telemetry') animate('ov', (dt) => { if (dial && dialNum) dial.update(carNow(dialNum), dt); });

const RENDER = { banner, laps, countdown, podium, telemetry };
const render = RENDER[W] || laps;
const topics = ['SessionInfo', 'SessionStatus', 'TrackStatus', 'LapCount', 'TimingData', 'DriverList', 'ExtrapolatedClock', '__reset'];
let ver = '';
on('focus', () => { ver = ''; });
on('connection', () => { ver = ''; });
setInterval(() => {
  // Chaque seconde au moins (horloges), sinon dès que les données changent
  const v = `${versionOf(topics)}|${Math.floor(Date.now() / 1000)}|${store.focus}`;
  if (v !== ver) { ver = v; render(); }
}, 200);
if (W === 'countdown') { loadSchedule(); setInterval(loadSchedule, 3600e3); }
connect();
