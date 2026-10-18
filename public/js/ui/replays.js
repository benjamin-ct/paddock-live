// Espace Replays : rejouer une séance des archives officielles F1 (compte F1 TV) ou une séance
// enregistrée sur cet ordinateur, et revenir au direct. Remplace l'ancien onglet « Source » des réglages.
import { $, $$, esc, api, placeView } from '../util.js';
import { store, on } from '../store.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { LOCALE, EN } from '../i18n.js';
import { gpFull, sessionLabel } from '/shared/gp-names.js';

let section = 'gp';
let openedAt = 0;
let year = new Date().getFullYear();
const cache = new Map();   // année -> { meetings } | { error }

const fmtDay = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) : '');
const startAt = () => ($$('input[name=rvStart]').find((i) => i.checked)?.value === 'begin' ? { startOffsetMs: 0 } : {});

async function loadYear(y) {
  if (!cache.has(y)) {
    try {
      const list = await api(`/api/archive?year=${y}`);
      cache.set(y, { meetings: list.filter((m) => m.sessions.length).reverse() });
    } catch (err) { return { error: err.message }; }
  }
  return cache.get(y);
}

// « Replays 2026 indisponibles : la F1 réserve… » -> « La F1 réserve… » (le titre dit déjà l'année)
const reason = (msg) => { const r = String(msg).replace(/^Replays \d+ indisponibles : /, ''); return r.charAt(0).toUpperCase() + r.slice(1); };

async function renderGps(body) {
  body.innerHTML = '<div class="muted">Chargement des séances…</div>';
  const d = await loadYear(year);
  if (section !== 'gp') return;
  if (d.error) {
    body.innerHTML = `<div class="sz-box rv-empty">${icon('lock')}<div><b>Archives ${year} indisponibles</b><p class="muted">${esc(reason(d.error))}</p>
      <button class="btn btn-accent" data-rv-f1tv>${icon('lock')} Connecter mon compte F1 TV</button>
      <button class="btn" data-rv-go="rec">${icon('save')} Mes enregistrements</button></div></div>`;
    return;
  }
  if (!d.meetings.length) { body.innerHTML = `<div class="muted">Aucune séance disponible pour ${year}.</div>`; return; }
  const playing = store.status?.source?.mode === 'replay' ? store.status.source.path : null;
  body.innerHTML = `<div class="rv-grid">${d.meetings.map((m) => `<section class="sz-box rv-gp">
      <div class="rv-gp-head"><b>${esc(gpFull(m.name, EN))}</b><span class="muted small">${esc([m.location, fmtDay(m.sessions.at(-1)?.start)].filter(Boolean).join(' · '))}</span></div>
      <div class="rv-sessions">${m.sessions.map((s) => `<button class="btn small${s.path === playing ? ' on' : ''}" data-rv-path="${esc(s.path)}" data-rv-name="${esc(`${gpFull(m.name, EN)} — ${sessionLabel(s.name, EN)}`)}">${icon('play')} ${esc(sessionLabel(s.name, EN))}</button>`).join('')}</div>
    </section>`).join('')}</div>`;
}

// « 2026-10-11 Singapore Grand Prix Race 11388 » -> « GP de Singapour · Course », date à part
function recLabel(name) {
  const m = /^(\d{4}-\d{2}-\d{2}) (.+? Grand Prix) (.+?) \d+$/.exec(name || '');
  if (!m) return { title: name, date: '' };
  return { title: `${gpFull(m[2], EN, 'GP')} · ${sessionLabel(m[3], EN)}`, date: new Date(`${m[1]}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) };
}

async function renderRecordings(body) {
  body.innerHTML = '<div class="muted">Chargement…</div>';
  let recs;
  try { recs = await api('/api/recordings'); } catch (err) { body.textContent = err.message; return; }
  if (section !== 'rec') return;
  body.innerHTML = `${recs.length ? `<div class="sz-box rec-list">${recs.map((r) => { const l = recLabel(r.name); return `<div class="rec"><span class="rec-name" title="${esc(r.name)}">${esc(l.title)}${l.date ? ` <span class="muted small">${esc(l.date)}</span>` : ''}</span>
      <span class="muted">${(r.size / 1e6).toFixed(1).replace('.', EN ? '.' : ',')} Mo</span>
      <button class="btn small" data-rv-local="${esc(r.id)}" data-rv-name="${esc(l.title)}">${icon('play')} Revoir</button><button class="btn small" data-rv-del="${esc(r.id)}" title="Supprimer">${icon('trash')}</button></div>`; }).join('')}</div>`
      : '<div class="muted">Aucun enregistrement pour l\'instant : ils se créent automatiquement pendant les séances suivies en direct.</div>'}`;
}

function render() {
  const body = $('#rvContent');
  for (const b of $$('#rvNav [data-rv]')) b.classList.toggle('active', b.dataset.rv === section);
  $('#rvYearRow').hidden = section !== 'gp';
  (section === 'gp' ? renderGps : renderRecordings)(body);
}

export function openReplays(sec) {
  if (sec) section = sec;
  import('./season.js').then((m) => m.closeSeason());
  import('./news.js').then((m) => m.closeNews());
  import('./home.js').then((m) => { m.homeTouched(); m.closeHome(); });
  placeView($('#replayView'));
  $('#replayView').hidden = false;
  openedAt = Date.now();
  render();
}

export function closeReplays() { if ($('#replayView')) $('#replayView').hidden = true; }

async function play(body, name) {
  try {
    await api('/api/replay', { method: 'POST', body });
    closeReplays();
    toast(`Chargement du replay : ${name}`, 4000);
  } catch (err) { toast(err.message, 6000); }
}

export function initReplays() {
  const view = $('#replayView');
  if (!view) return;
  const now = new Date().getFullYear();
  $('#rvYear').innerHTML = Array.from({ length: now - 2018 + 1 }, (_, i) => now - i).map((y) => `<option>${y}</option>`).join('');
  $('#rvYear').addEventListener('change', (e) => { year = Number(e.target.value); render(); });
  $('#rvNav').addEventListener('click', (e) => { const b = e.target.closest('[data-rv]'); if (b) { section = b.dataset.rv; render(); $('#rvContent').scrollTop = 0; } });
  $('#rvLive').addEventListener('click', async () => {
    try { await api('/api/live', { method: 'POST' }); } catch (err) { toast(err.message); return; }
    closeReplays();
    toast('Connexion au flux live…');
  });
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-rv-path], [data-rv-local], [data-rv-del], [data-rv-f1tv], [data-rv-go]');
    if (!t) return;
    if (t.dataset.rvPath) play({ path: t.dataset.rvPath, ...startAt() }, t.dataset.rvName);
    else if (t.dataset.rvLocal) play({ local: t.dataset.rvLocal }, t.dataset.rvName);
    else if (t.dataset.rvGo) { section = t.dataset.rvGo; render(); }
    else if ('rvF1tv' in t.dataset) { $('#settingsBtn').click(); $('#setNav [data-sgroup="f1tv"]')?.click(); }
    else if (t.dataset.rvDel && confirm('Supprimer définitivement cet enregistrement ?')) {
      try { await api(`/api/recordings?id=${encodeURIComponent(t.dataset.rvDel)}`, { method: 'DELETE' }); render(); } catch (err) { toast(err.message); }
    }
  });
  // Badge de la source (LIVE / REPLAY) : ouvre cet espace
  $('#sourceBadge')?.addEventListener('click', () => openReplays());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !view.hidden && !document.querySelector('dialog[open]')) closeReplays(); });
  // Replay lancé ailleurs (accueil, autre écran) : place au tableau de bord
  on('status', (s) => { if (s?.source?.mode === 'replay' && !view.hidden && Date.now() - openedAt > 1500) closeReplays(); });
}
