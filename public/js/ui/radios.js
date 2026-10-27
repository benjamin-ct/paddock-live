// Radios d'équipe, façon MultiViewer :
// - en haut, une bande de cartes (plus récentes à gauche) : photo du pilote, nom, tour et heure,
//   durée ; un clic joue la radio (barre de progression dans la carte, point tant qu'elle n'a pas
//   été écoutée) ;
// - en dessous, le fil des radios retranscrites (et traduites) : photo, texte en grand,
//   « pilote · tour · heure » ; un clic rejoue la radio.
// Lecture automatique des nouvelles radios au rythme du délai TV.
//
// Les deux listes sont mises à jour élément par élément : une traduction terminée ou une radio
// qui démarre ne redessine que son élément (rien ne « se recharge », le défilement reste en place).
import { store, versionOf, on, utcToLocal } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { $, esc, drivers, teamColor, fmtClock, storageGet, storageSet, photoUrl } from '../util.js';
import { parseUtc } from '/shared/f1.js';
import { radioEntry, requestTranscripts, setTranscribe, transcribeStatus } from './transcribe.js';
import { icon } from '../icons.js';
import { visibleOnboard, onboardStatus } from './onboard-radio.js';
import { track } from './stats.js';
import { DEC } from '../i18n.js';

const HEARD_KEY = 'paddock.radioHeard';
const SPEEDS = [1, 1.25, 1.5, 2];

const list = (o) => (!o ? [] : Array.isArray(o) ? o.filter(Boolean) : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]).filter(Boolean));
const base = () => (store.state.SessionInfo?.Path ? `https://livetiming.formula1.com/static/${store.state.SessionInfo.Path}` : null);
// Les archives de la F1 ne sont plus ouvertes à tous : les radios passent par l'appli (connexion F1 TV)
const ARCHIVE = 'https://livetiming.formula1.com/static/';
const playable = (url) => (url.startsWith(ARCHIVE) ? `/api/archive/file?p=${encodeURIComponent(url.slice(ARCHIVE.length))}` : url);
const fmtDur = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

let heard = new Set(storageGet(HEARD_KEY, []));
const durations = new Map();          // url -> durée (s), connue après lecture ou transcription
let audio = null;                      // lecteur unique (écoute manuelle et automatique)
let cur = null;                        // radio en cours { url, num }
let speed = 1;
let textVer = 0;
let renderKey = '';
let ordered = [];                      // radios affichées, dans l'ordre : [{ url, num, utc }]
const cards = new Map();               // url -> { el, html } (bande du haut)
const lines = new Map();               // url -> { el, html } (fil des transcriptions)

export function radioAllowed(num) {
  num = String(num);
  if (prefs.radioFilter === 'fav') return isFav(num);
  if (prefs.radioFilter === 'duel') return num === store.duel.a || num === store.duel.b;
  return true;
}

function markHeard(url) {
  if (heard.has(url)) return;
  heard.add(url);
  const arr = [...heard];
  if (arr.length > 500) heard = new Set(arr.slice(-400));
  storageSet(HEARD_KEY, [...heard]);
}

// Tour du pilote au moment de la radio (tours bouclés avant + 1). Les tours sont datés à l'heure
// locale de réception, la radio à l'heure F1.
function lapAt(num, utc) {
  const laps = store.derived.laps?.[num];
  const t = Number.isFinite(utc) ? utcToLocal(utc) : null;
  if (!laps?.length || !Number.isFinite(t)) return null;
  let n = 0;
  for (const l of laps) if (l.t <= t && Number(l.lap) > n) n = Number(l.lap);
  return n + 1;
}

// Photo du pilote (initiales sur la couleur de l'écurie si elle manque) avec le micro
function avatar(d, num, playing) {
  const src = photoUrl(d);
  const photo = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="rd-av" style="--tc:${teamColor(d)}"><b>${esc(d.Tla || num)}</b>${photo}<i class="rd-mic">${icon(playing ? 'pause' : 'mic')}</i></span>`;
}

const fullName = (d, num) => esc([d.FirstName, d.LastName].filter(Boolean).join(' ') || d.FullName || d.Tla || num);
const when = (c) => { const lap = lapAt(c.num, c.utc); return `${lap ? `Tour ${lap} · ` : ''}${fmtClock(c.utc)}`; };
const isPlaying = (url) => cur?.url === url && audio && !audio.paused;

function cardHtml(c, d) {
  const dur = durations.get(c.url) ?? radioEntry(c.url)?.d;
  return `${avatar(d, c.num, isPlaying(c.url))}<span class="rd-c-main"><b class="rd-c-name">${fullName(d, c.num)}</b><span class="rd-c-when">${when(c)}</span></span>
    <span class="rd-c-dur">${fmtDur(dur)}</span><span class="rd-fill"></span><span class="rd-prog"><i></i></span>`;
}

function lineHtml(c, d) {
  const e = c.ob || radioEntry(c.url);
  const lang = prefs.radioLang;
  let text;
  if (!e) text = '<div class="rd-text pending">transcription…</div>';
  else if (!e.en) text = '<div class="rd-text muted">(pas de parole reconnue)</div>';
  else if (lang === 'none') text = `<div class="rd-text">${esc(e.en)}</div>`;
  else if (e.tr?.[lang]) text = `<div class="rd-text">${esc(e.tr[lang])}</div><div class="rd-orig">${esc(e.en)}</div>`;
  else text = `<div class="rd-text">${esc(e.en)}</div><div class="rd-orig pending">traduction…</div>`;
  const tag = c.ob ? ' <span class="rd-ob" title="Radio captée sur le son de la caméra embarquée F1 TV">caméra embarquée</span>' : '';
  return `${avatar(d, c.num, isPlaying(c.url))}<div class="rd-l-main">${text}<div class="rd-l-who">${fullName(d, c.num)} · ${when(c)}${tag}</div></div>`;
}

// Radio embarquée déjà publiée par la F1 (même pilote, même moment, même texte) : pas de doublon
const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z']+/g) || []);
function duplicate(ob, official) {
  const a = words(ob.en);
  return official.some((c) => {
    if (c.num !== String(ob.num) || Math.abs(c.utc - ob.utc) > 90000) return false;
    const b = words(radioEntry(c.url)?.en);
    if (!a.size || !b.size) return false;
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    return n / Math.min(a.size, b.size) >= 0.6;
  });
}

const cardClass = (c) => `rd-card${cur?.url === c.url ? ' playing' : ''}${heard.has(c.url) ? '' : ' unheard'}`;
const lineClass = (c) => `rd-line${c.ob ? ' ob' : ''}${cur?.url === c.url ? ' playing' : ''}`;

// Met une liste en conformité avec les radios (créées, mises à jour si leur contenu change, remises
// dans l'ordre, retirées)
function sync(container, store_, items, tag, html, cls) {
  const keep = new Set();
  let prev = null;
  for (const c of items) {
    keep.add(c.url);
    let r = store_.get(c.url);
    if (!r) {
      const el = document.createElement(tag);
      el.dataset.url = c.url;
      el.dataset.num = c.num;
      r = { el, html: '' };
      store_.set(c.url, r);
    }
    const h = html(c);
    if (r.html !== h) { r.el.innerHTML = h; r.html = h; }
    r.el.className = cls(c);
    const want = prev ? prev.nextSibling : container.firstChild;
    if (want !== r.el) container.insertBefore(r.el, want);
    prev = r.el;
  }
  for (const [url, r] of store_) if (!keep.has(url)) { r.el.remove(); store_.delete(url); }
}

export function renderRadios(force = false) {
  const strip = $('#radioStrip'), feed = $('#radioList');
  if (!strip || !feed) return;
  // Tours des radios revus toutes les 5 s (pas à chaque mise à jour des chronos)
  const key = `${versionOf(['TeamRadio', 'DriverList', '__reset'])}|${Math.floor(performance.now() / 5000)}|${prefs.obRadio}|${prefs.radioFilter}|${prefs.radioText}|${prefs.radioLang}|${store.duel.a}|${store.duel.b}|${prefs.favs.join()}|${textVer}|${document.documentElement.dataset.scheme}`;
  if (key === renderKey && !force) return;
  renderKey = key;
  $('#radioOpts').hidden = !prefs.radioText;
  const b = base();
  const dl = drivers(store.state);
  ordered = b ? list(store.state.TeamRadio?.Captures)
    .filter((c) => c.Path && radioAllowed(c.RacingNumber))
    .map((c) => ({ url: b + c.Path, num: String(c.RacingNumber), utc: parseUtc(c.Utc) }))
    .sort((x, y) => y.utc - x.utc) : [];
  const empty = $('#radioEmpty');
  empty.hidden = !!ordered.length;
  empty.textContent = b ? 'Aucune radio d\'équipe pour l\'instant.' : 'Pas de séance en cours.';
  sync(strip, cards, ordered, 'button', (c) => cardHtml(c, dl[c.num] || {}), cardClass);

  // Fil des transcriptions : radios officielles retranscrites et radios des caméras embarquées
  $('#radioTextOff').hidden = prefs.radioText || prefs.obRadio || !ordered.length;
  if (prefs.radioText) {
    // Les 12 plus récentes seulement (au-delà, la machine traduirait des radios que personne ne lit)
    requestTranscripts(ordered.slice(0, 12).map((c) => {
      const d = dl[c.num] || {};
      return { url: c.url, who: [d.FullName || d.Tla, d.TeamName].filter(Boolean).join(', ') };
    }));
  }
  const official = prefs.radioText ? ordered.slice(0, 60) : [];
  const onboard = prefs.obRadio ? visibleOnboard().filter((e) => radioAllowed(e.num) && !duplicate(e, official))
    .map((e) => ({ url: e.id, num: String(e.num), utc: e.utc, ob: e })) : [];
  const items = onboard.length ? [...official, ...onboard].sort((x, y) => y.utc - x.utc).slice(0, 150) : official;
  sync(feed, lines, items, 'li', (c) => lineHtml(c, dl[c.num] || {}), lineClass);
  paintProgress();
}

function refresh(url) {
  const c = ordered.find((x) => x.url === url);
  if (!c) return;
  const d = drivers(store.state)[c.num] || {};
  for (const [m, html, cls] of [[cards, cardHtml, cardClass], [lines, lineHtml, lineClass]]) {
    const r = m.get(url);
    if (!r) continue;
    const h = html(c, d);
    if (r.html !== h) { r.el.innerHTML = h; r.html = h; }
    r.el.className = cls(c);
  }
}

// ---------- Lecteur ----------
function player() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = prefs.radioVolume;
  // Radio en cours : les commentaires baissent (commentary.js)
  const duck = (on) => window.dispatchEvent(new CustomEvent('paddock:radio', { detail: on }));
  audio.addEventListener('playing', () => duck(true));
  for (const ev of ['pause', 'ended', 'error']) audio.addEventListener(ev, () => duck(false));
  audio.addEventListener('loadedmetadata', () => {
    if (cur && Number.isFinite(audio.duration)) { durations.set(cur.url, audio.duration); refresh(cur.url); }
  });
  audio.addEventListener('play', () => { if (cur) refresh(cur.url); tick(); });
  audio.addEventListener('pause', () => { if (cur) refresh(cur.url); });
  audio.addEventListener('ended', () => {
    const done = cur;
    if (!playQueued()) { cur = null; if (done) refresh(done.url); }
    else if (done) refresh(done.url);
  });
  audio.addEventListener('error', () => { if (cur) refresh(cur.url); });
  return audio;
}

export function playRadio(url) {
  const a = player();
  if (cur?.url === url) {
    if (a.paused) a.play().catch(() => {}); else a.pause();
    return;
  }
  const prev = cur;
  track('feature.radio-play');
  cur = { url, num: ordered.find((x) => x.url === url)?.num };
  a.src = playable(url);
  a.playbackRate = speed;
  markHeard(url);
  if (prev) refresh(prev.url);
  refresh(url);
  a.play().catch(() => { /* le navigateur exige une interaction préalable */ });
}

function paintProgress() {
  if (!cur || !audio) return;
  const p = audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
  const el = cards.get(cur.url)?.el;
  if (!el) return;
  // Toute la carte se remplit de gauche à droite, avec une barre pleine largeur en bas
  for (const x of el.querySelectorAll('.rd-fill, .rd-prog i')) x.style.transform = `scaleX(${p})`;
  const dur = el.querySelector('.rd-c-dur');
  if (dur && audio.duration > 0) dur.textContent = `${fmtDur(audio.currentTime) || '0:00'} / ${fmtDur(audio.duration)}`;
}

let ticking = false;
function tick() {
  if (ticking) return;
  ticking = true;
  const step = () => {
    paintProgress();
    if (audio && !audio.paused && !audio.ended) requestAnimationFrame(step);
    else ticking = false;
  };
  requestAnimationFrame(step);
}

// ---------- Lecture automatique des nouvelles radios ----------
// Une seule fenêtre joue les radios (sinon chaque fenêtre ouverte les lit aussi et le son est
// en double) : verrou partagé, repris par une autre fenêtre si celle qui le détient se ferme.
const queue = [];
const seen = new Set();
let isRadioPlayer = !navigator.locks;
navigator.locks?.request('paddock-radio-player', () => {
  isRadioPlayer = true;
  return new Promise(() => {});
});

function playQueued() {
  const next = queue.shift();
  if (!next) return false;
  playRadio(next);
  return true;
}

// ---------- Initialisation ----------
export function initRadios() {
  $('#radioFilter').value = prefs.radioFilter;
  $('#radioAuto').checked = prefs.radioAuto;
  $('#radioText').checked = prefs.radioText;
  $('#radioLang').value = prefs.radioLang;
  setTranscribe(prefs.radioText, prefs.radioLang);
  $('#radioFilter').addEventListener('change', (e) => setPref('radioFilter', e.target.value));
  $('#radioAuto').addEventListener('change', (e) => setPref('radioAuto', e.target.checked));
  $('#radioText').addEventListener('change', (e) => setPref('radioText', e.target.checked));
  $('#radioLang').addEventListener('change', (e) => setPref('radioLang', e.target.value));
  $('#radioTextOn').addEventListener('click', () => setPref('radioText', true));
  on('prefs', (k) => {
    if (k === 'radioAuto') $('#radioAuto').checked = prefs.radioAuto;
    if (k === 'radioFilter') $('#radioFilter').value = prefs.radioFilter;
    if (!['radioText', 'radioLang'].includes(k)) return;
    $('#radioText').checked = prefs.radioText;
    $('#radioLang').value = prefs.radioLang;
    setTranscribe(prefs.radioText, prefs.radioLang);
    showStatus();
  });
  const showStatus = () => { $('#radioTextStatus').textContent = prefs.radioText ? transcribeStatus().msg : ''; };
  on('radioStatus', showStatus);
  showStatus();
  on('radioText', () => { textVer++; });

  $('#radioStrip').addEventListener('click', (e) => {
    const card = e.target.closest('.rd-card');
    if (!card) return;
    // Clic sur la barre de progression de la radio en cours : saut à cet endroit
    const bar = e.target.closest('.rd-prog');
    if (bar && cur?.url === card.dataset.url && audio?.duration > 0) {
      const r = bar.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      paintProgress();
      return;
    }
    playRadio(card.dataset.url);
  });
  // Molette verticale : défilement horizontal de la bande
  $('#radioStrip').addEventListener('wheel', (e) => {
    const s = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && s.scrollWidth > s.clientWidth) { s.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  on('obText', () => { textVer++; });
  const showOb = () => { $('#obRadioStatus').textContent = onboardStatus(); };
  on('obStatus', showOb);
  showOb();
  $('#radioList').addEventListener('click', (e) => {
    const li = e.target.closest('li.rd-line:not(.ob)');
    if (li) playRadio(li.dataset.url);
  });
  $('#radioSpeed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    if (audio) audio.playbackRate = speed;
    $('#radioSpeed').textContent = `${String(speed).replace('.', DEC)}×`;
  });
  const vol = $('#radioVol');
  vol.value = prefs.radioVolume;
  vol.addEventListener('input', () => { setPref('radioVolume', Number(vol.value)); if (audio) audio.volume = prefs.radioVolume; });

  // Nouvelles radios (au rythme du délai TV) : lecture automatique, l'une après l'autre
  on('events', (events) => {
    const b = base();
    if (!b) return;
    for (const [topic, data] of events) {
      if (topic !== 'TeamRadio' || !data?.Captures) continue;
      for (const c of list(data.Captures)) {
        if (!c?.Path || seen.has(c.Path)) continue;
        seen.add(c.Path);
        if (prefs.radioAuto && isRadioPlayer && radioAllowed(c.RacingNumber)) queue.push(b + c.Path);
      }
    }
    if (queue.length && (!audio || audio.paused || audio.ended)) playQueued();
  });
  on('reset', () => { queue.length = 0; });
}
