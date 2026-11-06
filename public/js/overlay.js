// Overlays de streaming (OBS Studio, Streamlabs, Meld Studio) : une source navigateur par élément,
// fond transparent, même délai TV que l'appli. ?w= : banner (bandeaux de drapeau), laps (compteur de
// tours), countdown (compte à rebours), podium (trois premiers), telemetry (compteur du pilote suivi
// dans l'appli, sinon du leader), rcm (direction de course), gap (écarts du pilote suivi), weather (météo),
// fastest (meilleur tour). Le contenu est mis à l'échelle de la source.
import { translatePage, EN, FR, LANG, LOCALE, DAY, DEC, t } from './i18n.js';
import { store, versionOf, on, f1Now } from './store.js';
import { $, esc, api, drivers, orderedNumbers, sessionKind, teamColor, fmtDuration } from './util.js';
import { gpShort, gpFull, sessionLabel } from '/shared/gp-names.js';
import { parseUtc, parseLapTime } from '/shared/f1.js';
import { rcmFr, rcmTag } from '/shared/rcm-fr.js';
import { connect } from './conn.js';
import { flagBanner, timeLeft } from './ui/session-info.js';
import { Dial, animate, carNow, energyOf } from './ui/gauge.js';

translatePage();
const W = new URLSearchParams(location.search).get('w') || 'laps';
const ov = $('#ov');
ov.classList.add(`ov-${W}`);
let last = '';

// Mise à l'échelle : tout l'élément dans la source, agrandi ou réduit
function fit() {
  const html = document.documentElement;
  html.style.zoom = '';
  const { width: w, height: h } = ov.getBoundingClientRect();
  // Bandeaux : même largeur quel que soit le texte (ajustés à la largeur de la source seulement)
  if (w && h) html.style.zoom = String(Math.floor(Math.min(innerWidth / w, W === 'banner' ? Infinity : innerHeight / h) * 1000) / 1000);
}
window.addEventListener('resize', fit);
// Polices chargées après le premier affichage : le texte change de taille, on réajuste
document.fonts?.addEventListener('loadingdone', fit);
function show(html) {
  if (html === last) return;
  last = html;
  ov.innerHTML = html;
  fit();
}

const WAIT = '<div class="ov-card ov-wait">En attente des données de la séance…</div>';
const finished = () => ['Finished', 'Finalised', 'Ends'].includes(store.state.SessionStatus?.Status);
const session = () => { const i = store.state.SessionInfo; return i ? `${EN ? gpFull(i.Meeting?.Name, true, 'GP') : gpShort(i.Meeting?.Name, LANG)} · ${sessionLabel(i.Name, LANG)}` : ''; };
const clock = (ms) => (ms === null ? '—' : fmtDuration(ms, ms >= 3600e3));
// Pilote : place, trait de l'écurie, prénom et nom, écurie ; valeur à droite (écart, temps)
const who = (d, pos, val = '') => `<div class="ov-pod"><b class="ov-pos">${esc(pos || '')}</b><i style="background:${teamColor(d)}"></i>
  <span class="ov-name">${esc(d.FirstName || '')} <b>${esc(d.LastName || d.Tla || '')}</b><small>${esc(d.TeamName || '')}</small></span>${val ? `<span class="ov-val">${esc(val)}</span>` : ''}</div>`;
const list = (o) => (Array.isArray(o) ? o : Object.values(o || {})).filter(Boolean);


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
    label = kind === 'quali' ? 'Qualifications' : sessionLabel(s.SessionInfo.Name, LANG);
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
  show(`<div class="ov-card"><div class="ov-label">${esc(gpFull(nx.race, LANG))}</div>
    <div class="ov-big">${d ? `${d}<small> ${DAY}</small> ` : ''}${two(Math.floor(left / 3600) % 24)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}</div>
    <div class="ov-sub">${esc(t(nx.label))} · ${esc(new Date(nx.t).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</div></div>`);
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
    ${top.map((n, i) => who(dl[n], i + 1, val(n, i))).join('')}</div>`);
}

// Télémétrie : compteur (vitesse, régime, rapport, accélérateur, frein) du pilote suivi dans l'appli
let dial = null, dialNum = null;
function telemetry() {
  const s = store.state;
  const dl = drivers(s);
  const num = dl[store.focus] ? store.focus : orderedNumbers(s).find((n) => dl[n]);
  if (!num) { dialNum = null; return show(WAIT); }
  // Séance sans télémétrie (pas de F1 TV, replay sans données des voitures) : rien plutôt qu'un compteur vide
  if (store.status?.hasCarData === false) { dialNum = null; return show(''); }
  const d = dl[num];
  show(`<div class="ov-card">${who(d, s.TimingData?.Lines?.[num]?.Position)}<div id="ovDial"></div></div>`);
  if (!dial || dialNum !== num || !$('#ovDial').firstChild) {
    dial = dial || new Dial(teamColor(d));
    dial.setColor(teamColor(d));
    dialNum = num;
    $('#ovDial').append(dial.el);
    fit();
  }
}
if (W === 'telemetry') animate('ov', (dt) => { if (dial && dialNum) dial.update(carNow(dialNum), dt, energyOf(dialNum)); });

// Direction de course : les 3 derniers messages (drapeaux, neutralisations, enquêtes, limites de piste), en français
// quand la formule est connue, chacun affiché 90 s ; rien entre deux (fond transparent). Pas les drapeaux bleus
const RCM_SHOW = 90e3;
function rcm() {
  const now = f1Now();
  const msgs = list(store.state.RaceControlMessages?.Messages)
    .filter((m) => m.Flag !== 'BLUE' && m.Message && now - parseUtc(m.Utc) < RCM_SHOW && now - parseUtc(m.Utc) > -5e3).slice(-3).reverse();
  if (!msgs.length) return show('');
  show(`<div class="ov-card ov-rcms"><div class="ov-label">${esc(t('Direction de course'))}</div>${msgs.map((m) => {
    const [k, label] = rcmTag(m);
    const txt = (FR && rcmFr(m.Message)) || m.Message;
    return `<div class="ov-msg"><span class="ov-tag k-${k}">${esc(t(label))}</span><span class="ov-msg-t"${txt !== m.Message ? ' data-no-i18n' : ''}>${esc(txt)}</span></div>`;
  }).join('')}</div>`);
}

// Écarts du pilote suivi dans l'appli (sinon le leader) : le pilote devant, lui, celui derrière, avec l'intervalle
// (course) ou l'écart au temps de devant (essais, qualifications)
function gap() {
  const s = store.state, dl = drivers(s), lines = s.TimingData?.Lines || {};
  const order = orderedNumbers(s).filter((n) => dl[n] && lines[n]?.Position);
  if (!order.length) return show(WAIT);
  const num = order.includes(String(store.focus)) ? String(store.focus) : order[0];
  const i = order.indexOf(num);
  const race = sessionKind(s) === 'race';
  const ahead = (n) => String((race ? lines[n]?.IntervalToPositionAhead?.Value : lines[n]?.TimeDiffToPositionAhead) || '');
  const rows = [order[i - 1], num, order[i + 1]].filter(Boolean);
  show(`<div class="ov-card"><div class="ov-label">${esc(t(race ? 'Intervalles' : 'Écarts'))} · ${esc(session())}</div>${rows.map((n) => {
    // Comme à la TV : « − » pour la voiture de devant, « + » pour celle de derrière (tours d'écart gardés tels quels)
    const raw = n === num ? '' : n === order[i - 1] ? ahead(num) : ahead(n);
    const val = raw.replace(/^[+-]/, '');
    const shown = !val || /L/i.test(val) ? val : `${n === order[i - 1] ? '−' : '+'}${val}`;
    return `<div class="${n === num ? 'ov-me' : ''}">${who(dl[n], lines[n].Position, shown)}</div>`;
  }).join('')}</div>`);
}

// Météo de la piste : air, piste, humidité, vent, pluie
function weather() {
  const w = store.state.WeatherData;
  if (!w) return show(WAIT);
  const wind = Number(w.WindSpeed);
  const rain = w.Rainfall === '1' || w.Rainfall === 1;
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d).replace('.', DEC) : '—');
  const cell = (label, val, unit = '') => `<div class="ov-wx"><span class="ov-label">${esc(t(label))}</span><b>${val}${unit ? `<small>${unit}</small>` : ''}</b></div>`;
  show(`<div class="ov-card"><div class="ov-label">${esc(t('Météo'))} · ${esc(session())}</div><div class="ov-wxs">
    ${cell('Air', num(w.AirTemp, 1), '°')}${cell('Piste', num(w.TrackTemp, 1), '°')}${cell('Humidité', num(w.Humidity), ' %')}
    ${cell('Vent', Number.isFinite(wind) ? num(wind * 3.6) : '—', ' km/h')}${cell('Pluie', esc(t(rain ? 'Oui' : 'Non')))}</div></div>`);
}

// Meilleur tour de la séance : pilote, temps et tour où il l'a signé
function fastest() {
  const s = store.state, dl = drivers(s), lines = s.TimingData?.Lines || {};
  let best = null;
  for (const [n, l] of Object.entries(lines)) {
    const v = l?.BestLapTime?.Value, ms = parseLapTime(v);
    if (dl[n] && ms && (!best || ms < best.ms)) best = { n, ms, v, lap: l.BestLapTime.Lap };
  }
  if (!best) return show(WAIT);
  show(`<div class="ov-card ov-fast"><div class="ov-label">${esc(t('Meilleur tour'))} · ${esc(session())}</div>
    <div class="ov-big">${esc(best.v)}</div>${who(dl[best.n], lines[best.n]?.Position, best.lap ? t('Tour {}', best.lap) : '')}</div>`);
}

const RENDER = { banner, laps, countdown, podium, telemetry, rcm, gap, weather, fastest };
const render = RENDER[W] || laps;
const topics = ['SessionInfo', 'SessionStatus', 'TrackStatus', 'LapCount', 'TimingData', 'DriverList', 'ExtrapolatedClock', 'RaceControlMessages', 'WeatherData', '__reset'];
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
