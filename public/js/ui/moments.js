// Moments clés du replay : liste cliquable (départ, drapeaux, leaders, dépassements pour le
// podium, arrêts, abandons, incidents, pénalités, meilleur tour, arrivée) et repères sur la barre
// de lecture. Anti-spoiler : les moments pas encore vus n'affichent que leur type et leur tour.
import { store, serverNow } from '../store.js';
import { $, esc, api, fmtDuration } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { icon } from '../icons.js';
import { MOMENT_LABEL } from '/shared/moments.js';
import { EN, t } from '../i18n.js';

export const KIND = {
  start: ['flag', 'flag'], part: ['flag', 'flag'], finish: ['checkered', 'flag'],
  sc: ['siren', 'flag'], vsc: ['siren', 'flag'], red: ['flag', 'flag'], green: ['flag', 'flag'],
  lead: ['trophy', 'race'], overtake: ['tri-up', 'race'], fastest: ['stopwatch', 'race'],
  pit: ['wrench', 'pit'], retire: ['warning', 'inc'], incident: ['warning', 'inc'], penalty: ['scales', 'inc'],
};
const FILTERS = [['all', 'Tout'], ['flag', 'Drapeaux'], ['race', 'Course'], ['pit', 'Arrêts'], ['inc', 'Incidents']];

let moments = [];
let loadedFor = null;
let filter = 'all';
let open = false;
let lastKey = '';

const src = () => store.status?.source;
function position() {
  const s = src();
  return Math.max(0, (serverNow() - store.delay - (s?.anchor || 0)) * (s?.speed || 1));
}

async function load() {
  const s = src();
  const key = s?.mode === 'replay' && !s.loading ? s.path : null;
  if (key === loadedFor) return;
  loadedFor = key;
  moments = [];
  if (key) {
    try { moments = (await api(`/api/replay/moments${EN ? '?lang=en' : ''}`)).moments || []; } catch { moments = []; }
  }
  lastKey = '';
  renderMarks();
}

export function seek(off) {
  const s = src();
  // Quelques secondes avant le moment, pour le voir arriver ; délai TV pris en compte
  api('/api/replay/control', { method: 'POST', body: { action: 'seek', toMs: Math.max(0, off - 8000) + store.delay * (s?.speed || 1) } }).catch(() => {});
}

// Repères sur la barre de lecture (couleur selon le type, sans nom)
function renderMarks() {
  let marks = $('#rpMarks');
  if (!marks) {
    marks = document.createElement('div');
    marks.id = 'rpMarks';
    marks.className = 'rp-marks';
    $('#rpTrack')?.insertBefore(marks, $('#rpRange'));
  }
  const dur = src()?.duration || 1;
  marks.innerHTML = moments.filter((m) => !['start', 'part', 'finish', 'green'].includes(m.kind))
    .map((m) => `<i class="rp-mark k-${KIND[m.kind]?.[1] || 'race'}" style="left:${(100 * Math.min(dur, m.off)) / dur}%"></i>`).join('');
}

// Moment à venir masqué (anti-spoiler) : seulement son type, sauf drapeaux et neutralisations
const masked = (m, pos) => m.off > pos + 2000 && !prefs.momentsSpoil && !['start', 'part', 'sc', 'vsc', 'red', 'green', 'finish'].includes(m.kind);

// Survol de la barre de lecture : heure, repères et zone colorée sous la souris (le curseur de
// lecture, posé sur toute la barre, empêche les infobulles des repères eux-mêmes)
function hover(e) {
  const track = $('#rpTrack');
  const s = src();
  let tip = $('#rpTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'rpTip';
    tip.className = 'rp-tip';
    tip.dataset.noI18n = '';
    track.appendChild(tip);
  }
  if (!s?.duration || e.type === 'pointerleave') { tip.hidden = true; return; }
  const r = track.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
  const dur = s.duration, at = (x / r.width) * dur, pos = position();
  const near = (off) => Math.abs((off / dur) * r.width - x) <= 5;
  const lines = moments.filter((m) => !['start', 'part', 'finish', 'green'].includes(m.kind) && near(m.off)).slice(0, 4)
    .map((m) => `${m.lap ? `T${m.lap} · ` : ''}${masked(m, pos) ? t(MOMENT_LABEL[m.kind] || 'Moment') : m.text}`);
  const zones = [[s.redFlags, () => t('Drapeau rouge')]];
  if (prefs.replayMarks) zones.push([s.neutralized, (z) => t(z.kind === 'sc' ? 'Voiture de sécurité' : 'Voiture de sécurité virtuelle')], [s.yellows, () => t('Drapeau jaune')]);
  for (const [list, label] of zones) {
    const z = (list || []).find((p) => at >= p.start && at <= p.end);
    if (z) { lines.push(label(z)); break; }
  }
  tip.innerHTML = `<b>${fmtDuration(at)}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
  tip.hidden = false;
  tip.style.left = `${Math.max(tip.offsetWidth / 2, Math.min(r.width - tip.offsetWidth / 2, x))}px`;
}

function render() {
  const pop = $('#momentsPop');
  if (!pop || !open) return;
  const pos = position();
  const s = src();
  const start = s?.sessionStart || 0;
  const key = `${moments.length}|${filter}|${prefs.momentsSpoil}|${Math.floor(pos / 5000)}`;
  if (key === lastKey) return;
  lastKey = key;
  const list = moments.filter((m) => filter === 'all' || KIND[m.kind]?.[1] === filter);
  const rows = list.map((m) => {
    const future = m.off > pos + 2000;
    const text = masked(m, pos) ? MOMENT_LABEL[m.kind] || 'Moment' : m.text;
    const when = m.lap ? `T${m.lap}` : fmtDuration(Math.max(0, m.off - start), false);
    return `<button class="mo-row k-${KIND[m.kind]?.[1] || 'race'}${future ? ' future' : ''}" data-off="${m.off}">
      <span class="mo-ic">${icon(KIND[m.kind]?.[0] || 'dot')}</span><span class="mo-when">${esc(when)}</span><span class="mo-txt">${esc(text)}</span></button>`;
  }).join('');
  pop.querySelector('.mo-list').innerHTML = rows || '<div class="muted small mo-empty">Aucun moment de ce type pour cette séance.</div>';
  for (const b of pop.querySelectorAll('[data-mf]')) b.classList.toggle('on', b.dataset.mf === filter);
  pop.querySelector('#moSpoil').checked = !!prefs.momentsSpoil;
}

function toggle(force) {
  open = force ?? !open;
  $('#momentsPop').hidden = !open;
  $('#rpMoments')?.classList.toggle('on', open);
  lastKey = '';
  render();
}

export function initMoments() {
  const side = $('#replayBar .rp-side');
  if (!side) return;
  const btn = document.createElement('button');
  btn.className = 'btn small';
  btn.id = 'rpMoments';
  btn.title = 'Moments clés : cliquer pour y aller';
  btn.innerHTML = `${icon('highlights')}<span class="rp-mo-l"> Moments</span>`;
  side.insertBefore(btn, $('#rpStart'));
  const pop = document.createElement('div');
  pop.id = 'momentsPop';
  pop.className = 'moments-pop';
  pop.hidden = true;
  pop.innerHTML = `<div class="mo-head"><b>${icon('highlights')} Moments clés</b>
      <div class="mo-filters">${FILTERS.map(([k, l]) => `<button data-mf="${k}">${l}</button>`).join('')}</div>
      <button class="icon-btn" data-mo-close title="Fermer">${icon('close')}</button></div>
    <div class="mo-list"></div>
    <label class="toggle small mo-spoil"><input type="checkbox" id="moSpoil"> Afficher le détail des moments à venir (spoiler)</label>`;
  document.body.appendChild(pop);
  btn.dataset.track = 'feature.moments';
  btn.addEventListener('click', () => toggle());
  pop.addEventListener('click', (e) => {
    const f = e.target.closest('[data-mf]');
    if (f) { filter = f.dataset.mf; lastKey = ''; render(); return; }
    if (e.target.closest('[data-mo-close]')) { toggle(false); return; }
    const r = e.target.closest('[data-off]');
    if (r) seek(Number(r.dataset.off));
  });
  pop.querySelector('#moSpoil').addEventListener('change', (e) => setPref('momentsSpoil', e.target.checked));
  for (const ev of ['pointermove', 'pointerleave']) $('#rpTrack')?.addEventListener(ev, hover);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  setInterval(() => {
    load();
    const active = src()?.mode === 'replay' && !src()?.loading;
    if (!active && open) toggle(false);
    render();
  }, 1000);
}
