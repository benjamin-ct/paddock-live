// Direction de course, radios d'équipe, arrêts aux stands.
import { store, versionOf, on, f1Now, displayNow } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { $, esc, drivers, teamColor, fmtClock, fmtLap, api, stintsOf, tyreBadge, orderedNumbers } from '../util.js';
import { parseUtc, parseLapTime } from '/shared/f1.js';
import { analyzeStewards, isOpen, STATUS_LABEL, linkFiaDocs, parseFiaDoc, deletedLapsDoc } from '/shared/stewards.js';
import { icon } from '../icons.js';
import { DEC, FR, t } from '../i18n.js';
import { cloudOn, cloudTranslate } from '../cloud.js';
import { continuesStint } from '/shared/pits.js';
import { pdfHref } from './pdf-view.js';
import { rcmFr, reasonFr as rcmReasonFr } from '/shared/rcm-fr.js';

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj.filter(Boolean) : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]).filter(Boolean);
}

const FLAG_FR = {
  GREEN: 'Vert', YELLOW: 'Jaune', 'DOUBLE YELLOW': 'Double jaune', RED: 'Rouge', BLUE: 'Bleu',
  CLEAR: 'Fin de drapeau', CHEQUERED: 'Damier', 'BLACK AND WHITE': 'Noir et blanc', 'BLACK AND ORANGE': 'Noir et orange', BLACK: 'Noir',
};

let rcmVer = -1, rcmCount = 0;
let pitVer = -1;

function rcmFlagClass(m) {
  if (m.Flag) return `flag-${m.Flag.replace(/ /g, '-')}`;
  if (m.Category === 'SafetyCar') return 'flag-SC';
  if (m.Category === 'Drs') return 'flag-DRS';
  return '';
}

// Type d'un message de la direction de course (filtre « Type »)
export function rcmType(m) {
  const t = String(m.Message || '').toUpperCase();
  if (m.Category === 'SafetyCar' || /SAFETY CAR|\bVSC\b/.test(t)) return 'sc';
  if (/TRACK LIMITS|\bDELETED\b/.test(t)) return 'limits';
  if (/STEWARDS|INVESTIGAT|PENALTY|NOTED|REPRIMAND|NO FURTHER ACTION|SUMMONED|DECISION/.test(t)) return 'stewards';
  if (m.Flag || m.Category === 'Flag') return 'flags';
  return 'other';
}

function rcmShown(m) {
  if (!prefs.rcmBlue && m.Flag === 'BLUE') return false;
  if (!prefs.rcmDeleted && /\bDELETED\b/.test(m.Message || '')) return false;
  if (prefs.rcmType === 'mine') return carsOf(m).some((n) => isFav(n) || n === store.duel.a || n === store.duel.b);
  if (prefs.rcmType && prefs.rcmType !== 'all' && rcmType(m) !== prefs.rcmType) return false;
  return true;
}
// Voitures nommées dans un message (« CAR 44 (HAM) », « CARS 1 (VER) AND 4 (NOR) ») et son numéro
const carsOf = (m) => [m.RacingNumber, ...[...String(m.Message || '').matchAll(/\b(\d{1,2}) \([A-Z]{3}\)/g)].map((x) => x[1])].filter(Boolean).map(String);

// Messages en français : formules connues traduites ici (drapeaux, incidents, pénalités…), les autres
// par le serveur Paddock Live (une fois pour tous, gardées en mémoire ici)
const rcmTr = new Map();   // message -> traduction (null : en cours ou refusée)
let rcmTrVer = 0;
const rcmTranslating = () => FR && prefs.rcmTranslate !== false;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Majuscules partout : la traduction automatique les prend pour des sigles. En minuscules, sauf les
// codes pilotes et les sigles connus.
const sentence = (msg) => cap(msg.toLowerCase().replace(/\b(fia|drs|vsc|sc|[a-z]{3}(?=\)))\b/g, (w) => w.toUpperCase()));
function rcmTranslation(msg) {
  if (!msg || !rcmTranslating()) return null;
  const local = rcmFr(msg);
  if (local) return local;
  if (!cloudOn()) return null;
  if (rcmTr.has(msg)) return rcmTr.get(msg);
  rcmTr.set(msg, null);
  cloudTranslate(sentence(msg), 'en', 'fr').then((t) => {
    if (t) { rcmTr.set(msg, t); rcmTrVer++; renderRcm(); }
    else if (!cloudOn()) rcmTr.delete(msg);   // serveur indisponible : nouvel essai plus tard
  });
  return null;
}

export function renderRcm() {
  const v = `${versionOf(['RaceControlMessages', '__reset'])}|${prefs.rcmBlue}|${prefs.rcmDeleted}|${prefs.rcmType}|${rcmTranslating()}|${rcmTrVer}|${prefs.rcmType === 'mine' ? `${prefs.favs}|${store.duel.a}|${store.duel.b}` : ''}`;
  if (v === rcmVer) return;
  const sameList = String(rcmVer).split('|')[0] === v.split('|')[0] || rcmVer === -1;
  rcmVer = v;
  const all = list(store.state.RaceControlMessages?.Messages);
  const msgs = all.filter(rcmShown);
  // Surlignage des nouveaux messages (pas quand on change seulement le filtre)
  const fresh = !sameList && all.length > rcmCount && rcmCount > 0 ? all.slice(rcmCount).filter(rcmShown).length : 0;
  rcmCount = all.length;
  const hidden = all.length - msgs.length;
  const msgHtml = (msg) => {
    const t = rcmTranslation(msg);
    return t ? `<div class="rcm-msg" data-no-i18n title="${esc(msg)}">${esc(t)}</div>` : `<div class="rcm-msg">${esc(msg)}</div>`;
  };
  $('#rcmHidden').textContent = hidden ? `${hidden} message(s) masqué(s)` : '';
  $('#rcmList').innerHTML = msgs.length
    ? msgs.slice().reverse().map((m, i) => {
      const t = parseUtc(m.Utc);
      const title = m.Flag ? `Drapeau ${FLAG_FR[m.Flag] || m.Flag}${m.Scope === 'Sector' ? ` (secteur ${m.Sector})` : ''}` : m.Category;
      return `<li class="${i < fresh ? 'new' : ''}"><div class="rcm-time">${Number.isFinite(t) ? fmtClock(t) : ''}${m.Lap ? `<br>Tour ${m.Lap}` : ''}</div>
        <div class="rcm-flag ${rcmFlagClass(m)}" title="${esc(title)}"></div>${msgHtml(m.Message)}</li>`;
    }).join('')
    : '<li class="note">Aucun message de la direction de course.</li>';
  const bar = $('#rcBar'), last = msgs[msgs.length - 1];
  if (bar) {
    bar.hidden = !last;
    if (last) {
      bar.querySelector('.rcm-flag').className = `rcm-flag ${rcmFlagClass(last)}`;
      bar.querySelector('.rc-msg').outerHTML = msgHtml(last.Message).replace('rcm-msg', 'rc-msg');
      bar.querySelector('.rc-lap').textContent = last.Lap ? `Tour ${last.Lap}` : '';
    }
  }
}

// Immobilisation estimée par la télémétrie (vitesse nulle) quand la F1 ne fournit pas le temps
// officiel : plus longue période à l'arrêt pendant le passage dans la voie des stands.
// Mémorisée, car l'historique télémétrie n'est conservé que quelques minutes.
const telemetryStops = new Map();
let telemetryVer = 0;

function estimateStationary(p) {
  if (!p.duration || !p.t) return null;
  const samples = store.positions.carHistory(p.num, p.t - (p.duration + 15) * 1000, p.t + 5000);
  if (samples.length < 10) return null;
  let best = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!(samples[i].speed <= 1)) continue;
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].speed <= 1) j++;
    const end = samples[j + 1] ? samples[j + 1].t : null;   // premier échantillon en mouvement
    if (end && i > 0) best = Math.max(best, (end - samples[i].t) / 1000);
    i = j;
  }
  return best >= 1 && best < 60 ? best : null;
}

function updateTelemetryStops(official) {
  for (const p of store.derived.pitLane) {
    const k = `${p.num}-${p.lap}`;
    if (official.has(k) || telemetryStops.has(k)) continue;
    if (displayNow() - p.t > 240000) { telemetryStops.set(k, null); continue; }
    const v = estimateStationary(p);
    if (v) { telemetryStops.set(k, v); telemetryVer++; }
  }
}

export function renderPits() {
  // Temps d'immobilisation officiels (flux PitStopSeries ou PitStop selon les séances)
  const stationary = new Map();
  for (const [num, arr] of Object.entries(store.state.PitStopSeries?.PitTimes || {})) {
    for (const p of list(arr)) {
      const ps = p.PitStop || p;
      if (ps?.Lap) stationary.set(`${num}-${ps.Lap}`, parseLapTime(ps.PitStopTime));
    }
  }
  for (const ps of store.derived.pitStops || []) {
    if (!(ps.time > 0)) continue;
    let lap = ps.lap;
    if (!lap) {
      // Rapprochement avec le passage dans la voie des stands le plus proche dans le temps
      const near = store.derived.pitLane.filter((x) => x.num === ps.num && Math.abs(x.t - ps.t) < 90000)
        .sort((a, b) => Math.abs(a.t - ps.t) - Math.abs(b.t - ps.t))[0];
      lap = near?.lap;
    }
    if (lap && !stationary.has(`${ps.num}-${lap}`)) stationary.set(`${ps.num}-${lap}`, ps.time);
  }
  updateTelemetryStops(stationary);
  const v = `${versionOf(['PitLaneTimeCollection', 'PitStopSeries', 'PitStop', 'TimingAppData', 'DriverList', '__reset'])}|${prefs.pitView}|${telemetryVer}`;
  if (v === pitVer) return;
  pitVer = v;
  const dl = drivers(store.state);
  const estimated = new Set();
  for (const [k, val] of telemetryStops) if (val && !stationary.has(k)) { stationary.set(k, val); estimated.add(k); }
  const byDriver = new Map();
  for (const p of store.derived.pitLane.slice().sort((a, b) => a.t - b.t)) {
    if (!byDriver.has(p.num)) byDriver.set(p.num, []);
    byDriver.get(p.num).push(p);
  }
  // Pneus avant / après chaque arrêt (n-ième arrêt = passage du relais n au relais n+1)
  const apps = store.state.TimingAppData?.Lines || {};
  const stops = [];
  for (const [num, arr] of byDriver) {
    const stints = stintsOf(apps[num]);
    arr.forEach((p, i) => stops.push({ ...p, n: i + 1, st: stationary.get(`${p.num}-${p.lap}`) ?? null, est: estimated.has(`${p.num}-${p.lap}`), from: stints[i] || null, to: stints[i + 1] || null }));
  }
  if (!stops.length) {
    $('#pitList').innerHTML = '<div class="note">Aucun arrêt aux stands enregistré depuis le début du suivi.</div>';
    return;
  }
  // Passage sans changement de pneus (voie des stands sous voiture de sécurité ou drapeau rouge,
  // drive-through…) : indication officielle TyresNotChanged, sinon usure qui continue (shared/pits.js)
  const sameTyres = (p) => continuesStint(p.from, p.to);
  const real = stops.filter((p) => !sameTyres(p));
  const nth = new Map();
  for (const p of real.slice().sort((a, b) => a.t - b.t)) { const k = (nth.get(p.num) || 0) + 1; nth.set(p.num, k); p.k = k; }
  const lanes = real.map((p) => p.duration).filter((x) => x > 0);
  const stats = real.map((p) => p.st).filter((x) => x > 0);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const laneMed = med(lanes), stMed = med(stats);
  const laneMin = Math.min(...lanes), laneMax = Math.max(...lanes);
  const stMin = stats.length ? Math.min(...stats) : null, stMax = stats.length ? Math.max(...stats) : null;
  const fastest = (key) => real.filter((p) => p[key] > 0).sort((a, b) => a[key] - b[key])[0];
  const fSt = fastest('st'), fLane = fastest('duration');
  const tla = (num) => esc(dl[num]?.Tla || num);
  const chip = (num) => `<span class="drv"><span class="drv-bar" style="background:${teamColor(dl[num])}"></span><b>${tla(num)}</b></span>`;
  const sec = (x) => `${x.toFixed(1).replace('.', DEC)} s`;
  const tyre = (s) => (s ? tyreBadge(s.Compound, s.TotalLaps, s.New) : '<span class="muted">?</span>');
  // Pneus montés : neufs ou d'occasion (avec leur nombre de tours au montage)
  const fitted = (s) => {
    if (!s) return '<span class="muted">?</span>';
    const used = s.New === false || s.New === 'false' || Number(s.StartLaps) > 0;
    return `${tyreBadge(s.Compound, null, s.New)} <span class="muted small">${used ? `occasion${Number(s.StartLaps) > 0 ? ` (${Number(s.StartLaps)} t.)` : ''}` : 'neufs'}</span>`;
  };
  const bar = (val, min, max, cls) => {
    const w = Number.isFinite(min) && max > min ? 12 + 88 * Math.max(0, Math.min(1, (val - min) / (max - min))) : 50;
    return `<span class="pbar ${cls}"><i style="width:${w.toFixed(0)}%"></i></span>`;
  };
  const stClass = (x) => (x === null ? '' : x <= stMin + 0.15 ? 'best' : x >= 8 ? 'bad' : x >= Math.max(4, (stMed || 3) + 1.2) ? 'slow' : '');
  const laneNote = (p) => (!p.duration || !laneMed ? '' : p.duration > laneMed + 12 ? '<span class="pit-tag bad" title="Beaucoup plus long que les autres : problème, pénalité purgée ?">très long</span>'
    : p.st === null && !p.to && p.duration < laneMed - 1.5 ? '<span class="pit-tag" title="Passage sans arrêt (drive-through probable)">sans arrêt ?</span>' : '');

  const summary = `<div class="pit-summary">
    <div class="pit-card"><div class="muted small">Arrêts</div><div class="pit-big">${real.length}</div><div class="muted small">${byDriver.size} pilote(s)${stops.length > real.length ? ` · +${stops.length - real.length} passage(s) sans changement de pneus` : ''}</div></div>
    ${fSt ? `<div class="pit-card"><div class="muted small">Arrêt le plus rapide</div><div class="pit-big best">${fSt.est ? "≈" : ""}${sec(fSt.st)}</div><div class="small">${chip(fSt.num)} <span class="muted">tour ${esc(fSt.lap ?? '—')}</span></div></div>` : ''}
    ${fLane ? `<div class="pit-card"><div class="muted small">Voie des stands la plus rapide</div><div class="pit-big">${sec(fLane.duration)}</div><div class="small">${chip(fLane.num)} <span class="muted">tour ${esc(fLane.lap ?? '—')}</span></div></div>` : ''}
    ${stMed ? `<div class="pit-card"><div class="muted small">Immobilisation médiane</div><div class="pit-big">${sec(stMed)}</div><div class="muted small">voie : ${laneMed ? sec(laneMed) : '—'}</div></div>` : ''}
  </div>
  <div class="subbar"><label class="toggle"><input type="radio" name="pitView" value="chrono" ${prefs.pitView !== 'driver' ? 'checked' : ''}> Chronologique</label>
    <label class="toggle"><input type="radio" name="pitView" value="driver" ${prefs.pitView === 'driver' ? 'checked' : ''}> Par pilote</label></div>`;

  let body;
  if (prefs.pitView === 'driver') {
    const order = orderedNumbers(store.state).filter((n) => dl[n]);
    const nums = [...new Set([...order, ...byDriver.keys()])];
    body = `<table class="pits"><tr><th>Pilote</th><th>Arr.</th><th>Relais</th><th>Immobilisations</th></tr>${nums.map((num) => {
      const mine = real.filter((p) => p.num === num);
      const stints = stintsOf(apps[num]);
      // Relais consécutifs avec les mêmes pneus (passage sous drapeau rouge…) : fusionnés
      const merged = [];
      for (const st of stints) {
        const prev = merged.at(-1);
        if (prev && prev.Compound === st.Compound && Number(st.StartLaps) > 0 && Number(st.StartLaps) === Number(prev.TotalLaps)) merged[merged.length - 1] = { ...prev, TotalLaps: st.TotalLaps };
        else merged.push(st);
      }
      const seq = merged.map((st, i) => `${i ? `<span class="muted">${icon('arrow-right', 'ic-s')}</span>` : ''}${tyreBadge(st.Compound, st.TotalLaps, st.New)}`).join(' ');
      return `<tr><td>${chip(num)}</td><td class="pit-n">${mine.length}</td><td class="pit-seq">${seq || '<span class="muted">—</span>'}</td>
        <td>${mine.map((p) => `<span class="pit-pill ${stClass(p.st)}" title="Tour ${esc(p.lap ?? '—')} · voie ${p.duration ? sec(p.duration) : '—'}">T${esc(p.lap ?? '—')} · ${p.st ? `${p.est ? '≈' : ''}${sec(p.st)}` : '—'}</span>`).join(' ') || '<span class="muted">—</span>'}</td></tr>`;
    }).join('')}</table>`;
  } else {
    body = `<table class="pits"><tr><th>Tour</th><th>Pilote</th><th title="Pneus retirés (tours effectués), puis pneus montés">Pneus</th><th>Voie des stands</th><th>Immobilisation</th></tr>${stops.slice().sort((a, b) => b.t - a.t).map((p) => `<tr>
      <td><span class="lap-pill">T${esc(p.lap ?? '—')}</span></td>
      <td>${chip(p.num)} <span class="muted small">${p.k ? `${p.k}${p.k === 1 ? 'er' : 'e'} arrêt` : 'passage'}</span></td>
      <td class="pit-tyres">${sameTyres(p) ? `${tyre(p.from)} <span class="muted small">mêmes pneus</span>` : p.from || p.to ? `${tyre(p.from)} <span class="muted">${icon('arrow-right', 'ic-s')}</span> ${fitted(p.to)}` : '<span class="muted">—</span>'}</td>
      <td>${p.duration ? `<div class="pit-cell">${bar(p.duration, laneMin, laneMax, 'lane')}<span class="pit-val">${sec(p.duration)}</span>${laneNote(p)}</div>` : '—'}</td>
      <td>${p.st ? `<div class="pit-cell">${bar(p.st, stMin, stMax, stClass(p.st))}<span class="pit-val ${stClass(p.st)}"${p.est ? ' title="Estimé par la télémétrie (pas de temps officiel)"' : ''}>${p.est ? '≈' : ''}${sec(p.st)}</span></div>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</table>`;
  }
  $('#pitList').innerHTML = summary + body;
  for (const r of document.querySelectorAll('input[name=pitView]')) r.onchange = (e) => setPref('pitView', e.target.value);
}

export function initRcmFilters() {
  for (const [id, key] of [['rcmBlue', 'rcmBlue'], ['rcmDeleted', 'rcmDeleted']]) {
    $(`#${id}`).checked = prefs[key];
    $(`#${id}`).addEventListener('change', (e) => setPref(key, e.target.checked));
  }
  on('prefs', (k) => { if (k === 'rcmBlue' || k === 'rcmDeleted') $(`#${k}`).checked = prefs[k]; });
  // Traduction : interface en français seulement
  $('#rcmTranslateBox').hidden = !FR;
  $('#rcmTranslate').checked = prefs.rcmTranslate !== false;
  $('#rcmTranslate').addEventListener('change', (e) => setPref('rcmTranslate', e.target.checked));
  on('prefs', (k) => { if (k === 'rcmTranslate') $('#rcmTranslate').checked = prefs.rcmTranslate !== false; });
  const type = $('#rcmType');
  type.value = prefs.rcmType || 'all';
  type.addEventListener('change', (e) => setPref('rcmType', e.target.value));
  on('prefs', (k) => { if (k === 'rcmType') type.value = prefs.rcmType; });
}

// ---- Enquêtes des commissaires et limites de piste ----
const reasonFr = (reason) => cap(rcmReasonFr(reason));

let stwVer = -1, stwCache = null;

export function stewardsData() {
  const v = versionOf(['RaceControlMessages', '__reset']);
  if (v !== stwVer) {
    stwVer = v;
    stwCache = analyzeStewards(list(store.state.RaceControlMessages?.Messages));
  }
  return stwCache;
}

// Documents officiels FIA de l'épreuve (rafraîchis toutes les 2 min, cache côté serveur).
let fia = { key: '', docs: [], page: null, at: 0, loading: false };

export function fiaState() {
  const info = store.state.SessionInfo;
  const name = info?.Meeting?.Name;
  if (!name) return fia;
  const year = Number(String(info.Path || '').slice(0, 4)) || new Date(parseUtc(info.StartDate) || Date.now()).getFullYear();
  const key = `${year}|${name}`;
  if (key !== fia.key) fia = { key, docs: [], page: null, at: 0, loading: false };
  if (!fia.loading && Date.now() - fia.at > (fia.error ? 30000 : 120000)) {
    fia.loading = true;
    const q = new URLSearchParams({ year, name, country: info.Meeting.Country?.Name || '', location: info.Meeting.Location || '' });
    const cur = fia;
    api(`/api/fia-docs?${q}`)
      .then((r) => { cur.docs = r.docs || []; cur.page = r.page; cur.error = null; })
      .catch((err) => { cur.error = err.message; })
      .finally(() => { cur.loading = false; cur.at = Date.now(); stwRenderKey = ''; });
  }
  return fia;
}

const DOC_KIND = { decision: 'Décision', infringement: 'Infraction', offence: 'Infraction', summons: 'Convocation' };

function docLink(doc, dl) {
  if (!doc) return '';
  const info = parseFiaDoc(doc);
  const who = info.cars[0] ? ` — ${esc(dl[info.cars[0]]?.Tla || `voiture ${info.cars[0]}`)}` : '';
  return `<a class="fia-doc" href="${esc(pdfHref(doc.url))}" data-pdf="${esc(doc.title)}" target="_blank" rel="noopener" title="${esc(doc.title)}">${icon('doc')} ${esc(DOC_KIND[info.type] || 'Document')} FIA${info.num ? ` n° ${info.num}` : ''}${who}<span class="muted"> · ${esc(info.subject.replace(/^Cars?\s+[\d\s,&and]+-\s*/i, ''))}</span> ${icon('external', 'ic-s')}</a>`;
}

let stwRenderKey = '';

function sessionEnded() {
  const st = store.state.SessionStatus?.Status || store.state.SessionInfo?.SessionStatus;
  return ['Finished', 'Finalised', 'Ends'].includes(st);
}

function penaltyState(d) {
  if (d.kind !== 'penalty' || !/SECOND TIME|DRIVE|STOP/.test(d.text) || store.state.SessionInfo?.Type !== 'Race') return '';
  if (/SECOND TIME/.test(d.text) && sessionEnded()) return '<span class="muted small">ajoutée à son temps de course</span>';
  return '<span class="muted small">à purger</span>';
}

export function renderStewards() {
  const data = stewardsData();
  const dl = drivers(store.state);
  const docs = fiaState();
  const now = f1Now();
  const visible = docs.docs.filter((d) => d.published <= now).length;
  const open = data.incidents.filter(isOpen);
  const badge = $('#stewardsBadge');
  badge.hidden = !open.length;
  badge.textContent = open.length;
  const tlWarn = data.trackLimits.filter((d) => d.deletions.length >= 3 || d.blackWhite).length;
  $('#tlBadge').hidden = !tlWarn;
  $('#tlBadge').textContent = tlWarn;
  $('#tlBadge').title = t('{} pilote(s) à 3 infractions ou plus (drapeau noir et blanc ; pénalité à la 4e en course)', tlWarn);

  const filter = document.querySelector('input[name=stwFilter]:checked')?.value || 'open';
  const key = `${stwVer}|${filter}|${Object.keys(dl).length}|${docs.key}|${docs.docs.length}|${visible}|${sessionEnded()}`;
  if (key === stwRenderKey) return;
  stwRenderKey = key;
  linkFiaDocs(data, docs.docs, now);

  const car = (c) => `<span><span class="drv-bar" style="background:${teamColor(dl[c.num])}"></span>${esc(dl[c.num]?.Tla || c.tla)}</span>`;
  const who = (cars) => cars.map((c) => `<span class="inc-who"><span class="drv-bar" style="background:${teamColor(dl[c.num])}"></span>${esc(dl[c.num]?.Tla || c.tla)}${dl[c.num]?.LastName ? ` <span class="muted">${esc(dl[c.num].LastName)}</span>` : ''}</span>`).join(' ');
  const decision = (d) => `<div class="inc-dec ${d.kind}"><div class="inc-dec-line"><span class="inc-dec-label">${icon('scales')} ${esc(d.label)}</span> pour ${who(d.cars) || '—'}
      ${d.servedAt ? `<span class="inc-served">purgée à ${fmtClock(d.servedAt)}</span>` : penaltyState(d)}</div>
      ${d.reason ? `<div class="muted small">${esc(reasonFr(d.reason))}</div>` : ''}
      ${docLink(d.doc, dl)}</div>`;
  const penalties = data.decisions.filter((d) => d.kind === 'penalty').length;
  const docsNote = docs.page ? ` · <a href="${esc(docs.page)}" target="_blank" rel="noopener">documents FIA ${icon('external', 'ic-s')}</a>` : docs.error ? ' · <span title="' + esc(docs.error) + '">documents FIA indisponibles</span>' : '';
  $('#stewardsSummary').innerHTML = `${open.length} en cours · ${data.incidents.length} au total · ${penalties} pénalité(s)${docsNote}`;
  const shown = (filter === 'open' ? open : data.incidents).slice().sort((a, b) => (isOpen(b) - isOpen(a)) || b.updated - a.updated);
  const loose = filter === 'all' ? data.decisions.filter((d) => !d.incident) : [];
  $('#stewardsList').innerHTML = shown.length || loose.length
    ? shown.map((inc) => `<div class="inc">
        <div class="inc-head"><span class="inc-status ${inc.status}">${esc(STATUS_LABEL[inc.status] || inc.status)}</span>
          <span class="inc-cars">${inc.cars.map(car).join('')}</span>
          <span class="inc-where">${esc(inc.location || '')}${inc.lap ? ` · tour ${inc.lap}` : ''}</span></div>
        ${inc.reason ? `<div class="inc-reason" title="${esc(inc.reason)}">${esc(reasonFr(inc.reason))}</div>` : ''}
        ${inc.decisions.map(decision).join('')}
        ${inc.docs.map((d) => docLink(d, dl)).join('')}
        <ul class="inc-steps">${inc.history.map((h) => `<li title="${esc(h.text)}">${fmtClock(h.t)}${h.lap ? ` (T${h.lap})` : ''} · <b>${esc(h.label)}</b>${h.cars?.length ? ` ${icon('arrow-right', 'ic-s')} ${esc(h.cars.map((c) => dl[c.num]?.Tla || c.tla).join(', '))}` : ''}</li>`).join('')}</ul>
      </div>`).join('') + loose.map((d) => `<div class="inc"><div class="inc-head"><span class="inc-status ${d.kind}">${esc(d.label)}</span>
        <span class="inc-cars">${d.cars.map(car).join('')}</span><span class="inc-where">${fmtClock(d.t)}${d.lap ? ` · tour ${d.lap}` : ''}</span></div>
        ${decision(d)}</div>`).join('')
    : `<div class="note">${filter === 'open' ? 'Aucune enquête en cours.' : 'Aucun incident signalé par les commissaires.'}</div>`;

  // Limites de piste
  const race = store.state.SessionInfo?.Type === 'Race';
  const tlDoc = deletedLapsDoc(docs.docs, store.state.SessionInfo?.Name, sessionEnded() ? Infinity : now);
  $('#tlList').innerHTML = data.trackLimits.length
    ? `<table class="tl-table"><tr><th>Pilote</th><th>Infractions</th><th>Virages</th><th>Dernière</th><th>Statut</th></tr>
      ${data.trackLimits.map((d) => {
        const n = d.deletions.length;
        // Le drapeau noir et blanc est placé sur l'infraction qui l'a déclenché.
        const bwAt = d.blackWhite ? Math.max(0, d.deletions.filter((x) => x.t <= d.blackWhite.t + 1000).length - 1) : -1;
        const penAt = d.penalties.length ? Math.max(0, d.deletions.filter((x) => x.t <= d.penalties[0].t + 1000).length - 1) : -1;
        const pips = Array.from({ length: Math.max(race ? 4 : 3, n) }, (_, i) => {
          const cls = i < n ? `on${i === bwAt ? ' bw' : ''}${i === penAt ? ' pen' : ''}` : '';
          return `<i class="${cls}" title="${i < n ? `Infraction ${i + 1}${i === bwAt ? ' — drapeau noir et blanc' : ''}${i === penAt ? ' — pénalité' : ''}` : ''}"></i>`;
        }).join('');
        const turns = [...new Set(d.deletions.map((x) => x.turn))].sort((a, b) => a - b).map((t) => `V${t}`).join(', ');
        const last = d.deletions.at(-1);
        const status = d.penalties.length ? `<b style="color:var(--red)">${esc(d.penalties.map((p) => p.label).join(', '))}</b>`
          : d.blackWhite ? '<b>Drapeau noir et blanc</b>'
          : race && n === 2 ? '<span class="muted">encore 1 avant l\'avertissement</span>' : '';
        const other = d.otherDeletions.length ? ` <span class="muted small" title="Temps supprimés pour une autre raison (double drapeau jaune…)">+${d.otherDeletions.length} autre(s)</span>` : '';
        return `<tr><td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[d.num])}"></span><b>${esc(dl[d.num]?.Tla || d.tla)}</b></span></td>
          <td><span class="pips">${pips}</span> ${n}${other}</td><td>${esc(turns) || '—'}</td>
          <td>${last ? `T${last.lap}${last.time ? ` (${esc(last.time)})` : ''}` : '—'}</td><td>${status}</td></tr>`;
      }).join('')}</table>
      ${tlDoc ? `<p class="note"><a class="fia-doc" href="${esc(pdfHref(tlDoc.url))}" data-pdf="${esc(tlDoc.title)}" target="_blank" rel="noopener">${icon('doc')} Document FIA : ${esc(tlDoc.title.replace(/^Doc \d+ - /, ''))} ${icon('external', 'ic-s')}</a></p>` : ''}
`
    : '<div class="note">Aucun temps supprimé pour limites de piste.</div>';
}

export function initStewards() {
  for (const r of document.querySelectorAll('input[name=stwFilter]')) r.addEventListener('change', () => { stwRenderKey = ''; renderStewards(); });
}
