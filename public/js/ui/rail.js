// Barre de navigation latérale (Accueil, Direct, Résultats, Saison, Replays, Radios,
// Réglages). Elle reprend les actions des boutons du haut, masqués.
import { $, $$, api, esc, placeView } from '../util.js';
import { openSeason, closeSeason } from './season-lazy.js';
import { openNews, closeNews } from './news.js';
import { openHome, closeHome, homeTouched, startWindows } from './home.js';
import { openReplays, closeReplays } from './replays.js';
import { openResults, closeResults, isResultsOpen } from './results-view.js';
import { unmaximize, windowSetups, restoreWindowsSnapshot, openInWindow } from './layout.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { prefs, setPref } from '../prefs.js';
import { on, store } from '../store.js';
import { t } from '../i18n.js';
import { SCHEMES, openPalette } from './palette.js';

const schemeOf = () => SCHEMES.find(([k]) => k === (prefs.scheme || 'auto')) || SCHEMES[0];
function schemeButton() {
  const b = $('#rail [data-rail="scheme"]');
  if (!b) return;
  const [, short, long, svg] = schemeOf();
  b.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg><small>${short}</small>`;
  b.title = `Apparence : ${long}`;
}
function schemeMenu(btn) {
  document.querySelector('.lpop-menu')?.remove();
  const cur = prefs.scheme || 'auto';
  const menu = document.createElement('div');
  menu.className = 'lpop-menu rail-menu';
  menu.innerHTML = SCHEMES.map(([k, , long, svg]) => `<button data-s="${k}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg> ${long}${k === cur ? icon('check', 'ic-on') : ''}</button>`).join('');
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  document.body.appendChild(menu);
  menu.style.top = `${Math.max(8, Math.min(r.top - 20, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('[data-s]')?.dataset.s;
    if (!k) return;
    menu.remove();
    setPref('scheme', k);
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

// Dispo. : les dispositions enregistrées, remises en un clic, puis les réglages de la disposition
function layoutMenu(btn) {
  const list = windowSetups();
  document.querySelector('.lpop-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'lpop-menu rail-menu';
  // Fenêtres à ouvrir (Circuit, Analyse, Duel, Comparaison seule), puis dispositions enregistrées et réglages
  // Le mini-classement aussi (pas de menu « Plus »), grisé sans séance comme son bouton
  const wins = [['map', 'Circuit'], ['analysis', 'Analyse'], ['duel', 'Duel'], ['compare', 'Comparaison'], ['mini', 'Mini-classement']];
  menu.innerHTML = `<div class="muted small">Ouvrir dans une fenêtre</div>${wins.map(([id, name]) => `<button data-open="${id}"${id === 'mini' && $('#miniBtn')?.disabled ? ' disabled' : ''}>${icon(id === 'mini' ? 'window' : 'external')} ${name}</button>`).join('')}
    ${list.length ? `<div class="rail-sep"></div><div class="muted small">Dispositions enregistrées</div>${list.map((w, i) => `<button data-w="${i}">${icon('layout')} <span data-no-i18n>${esc(w.name)}</span></button>`).join('')}` : ''}<div class="rail-sep"></div><button data-w="set">${icon('sliders')} Réglages de la disposition</button>`;
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  document.body.appendChild(menu);
  menu.style.top = `${Math.max(8, Math.min(r.top - 20, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]')?.dataset.open;
    if (o) { menu.remove(); if (o === 'mini') $('#miniBtn').click(); else openInWindow(o); return; }
    const k = e.target.closest('[data-w]')?.dataset.w;
    if (!k) return;
    menu.remove();
    if (k === 'set') openSettings('display'); else restoreWindowsSnapshot(list[Number(k)].name);
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

// Plus : les entrées moins utilisées, rangées dans un menu (leurs boutons restent dans la barre, cachés : chacun garde
// sa logique, grisé sans séance, Résumé seulement quand il existe)
const MORE = [['results', 'Résultats'], ['summary', 'Résumé'], ['radio', 'Commentaires'], ['mini', 'Mini-classement'], ['scheme', 'Apparence']];
function moreMenu(btn) {
  document.querySelector('.lpop-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'lpop-menu rail-menu';
  menu.innerHTML = MORE.map(([k, label]) => {
    const b = $(`#rail [data-rail="${k}"]`);
    if (!b || b.hidden) return '';
    const on = b.classList.contains('on') || b.classList.contains('playing');
    return `<button data-more="${k}" ${b.disabled ? 'disabled' : ''}>${b.querySelector('svg').outerHTML.replace('<svg', '<svg class="ic"')} ${esc(t(label))}${on ? icon('check', 'ic-on') : ''}</button>`;
  }).join('');
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  document.body.appendChild(menu);
  menu.style.top = `${Math.max(8, Math.min(r.top - 20, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('[data-more]')?.dataset.more;
    if (!k) return;
    menu.remove();
    if (k === 'scheme') schemeMenu(btn); else $(`#rail [data-rail="${k}"]`).click();
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

function openSettings(group) {
  $('#settingsBtn').click();
  if (group) $(`#setNav [data-sgroup="${group}"]`)?.click();
}

const ACTIONS = {
  home: () => openHome(),
  live: () => {
    homeTouched(); closeHome(); closeReplays(); closeSeason(); closeNews(); closeResults(); unmaximize();
    // Pendant un replay : retour au direct (écran d'attente s'il n'y a pas de séance)
    if (store.status?.source?.mode === 'replay') api('/api/live', { method: 'POST' }).then(() => toast('Retour au direct'), (err) => toast(err.message));
  },
  results: () => {
    if (isResultsOpen()) { closeResults(); return; }
    homeTouched(); closeHome(); closeReplays(); closeSeason(); closeNews(); openResults();
  },
  season: () => { closeNews(); closeReplays(); if ($('#seasonView').hidden) openSeason(); else closeSeason(); },
  news: () => { closeReplays(); if ($('#newsView').hidden) openNews(); else closeNews(); },
  replay: () => {
    // Pendant un replay, depuis une autre page (Accueil, Actu, Saison, Résultats) : retour au replay en cours
    const page = !$('#homeView')?.hidden || !$('#newsView').hidden || !$('#seasonView').hidden || isResultsOpen();
    if (store.status?.source?.mode === 'replay' && page) { homeTouched(); closeHome(); closeSeason(); closeNews(); closeResults(); return; }
    if ($('#replayView').hidden) openReplays(); else closeReplays();
  },
  radio: () => $('#commBtn').click(),
  more: (btn) => moreMenu(btn),
  search: (btn) => openPalette(btn),   // Télémétrie : palette de commandes (aussi Ctrl+K, ⌘K)
  reset: (btn) => layoutMenu(btn),   // Dispo. : dispositions enregistrées, réglages de la disposition (panneaux, onglets, colonnes, fenêtres)
  scheme: (btn) => schemeMenu(btn),
  settings: () => openSettings(),
};

// Élément actif : page ouverte (Accueil, Replays, Actu, Saison, Résultats), sinon le tableau de bord :
// Replays pendant un replay, Direct sinon
function sync() {
  const season = !$('#seasonView').hidden;
  const news = !$('#newsView').hidden;
  const home = !$('#homeView')?.hidden;
  const replays = !$('#replayView')?.hidden;
  const results = isResultsOpen();
  const page = home ? 'home' : replays ? 'replay' : news ? 'news' : season ? 'season' : results ? 'results' : null;
  // Résultats est une vue de la séance (contrôle segmenté du Direct), Direct ou Replays restent allumés
  const cur = (page === 'results' ? null : page) || (store.status?.source?.mode === 'replay' ? 'replay' : 'live');
  // Tableau de bord affiché : fenêtres du second écran rouvertes (pas sur l'accueil)
  if (!page) startWindows();
  for (const b of $$('#rail [data-rail]')) {
    const k = b.dataset.rail;
    b.classList.toggle('on', k === cur || (k === 'more' && cur === 'results'));   // Résultats : rangé dans Plus
    if (k === 'radio') b.classList.toggle('playing', $('#commBtn').classList.contains('on'));
  }
  syncViews();
}

// Vues de la séance (Tableau de bord · Résultats · Résumé · Commentaires) en tête du Direct, quand une séance ou un
// replay est chargé. Chaque segment reprend l'action existante ; le segment choisi suit la vue ouverte.
const shown = (id) => !!$(id) && !$(id).hidden;
const VIEWS = {
  board: () => { closeResults(); $('#summaryDlg')?.close(); $('#commPanel').hidden = true; },
  results: () => { $('#commPanel').hidden = true; if (!isResultsOpen()) ACTIONS.results(); },
  summary: () => $('#summaryBtn').click(),
  radio: () => { closeResults(); if ($('#commPanel').hidden) $('#commBtn').click(); },
};
function syncViews() {
  const bar = $('#sessViews');
  if (!bar) return;
  const page = ['#homeView', '#seasonView', '#newsView', '#replayView', '#noLiveView'].some(shown);
  const off = page || !store.state.SessionInfo || document.body.classList.contains('solo');
  if (bar.hidden !== off) {
    bar.hidden = off;
    if (isResultsOpen()) placeView($('#resultsView'));   // la page Résultats commence sous le contrôle
  }
  // Panneau des commentaires : sous le contrôle, sans le recouvrir
  const comm = $('#commPanel');
  if (comm) comm.style.top = off ? '' : `${Math.round(bar.getBoundingClientRect().bottom) + 8}px`;
  if (off) return;
  const cur = $('#summaryDlg')?.open ? 'summary' : isResultsOpen() ? 'results' : shown('#commPanel') ? 'radio' : 'board';
  for (const b of bar.querySelectorAll('[data-sv]')) {
    b.classList.toggle('on', b.dataset.sv === cur);
    if (b.dataset.sv === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
  // Téléphone : bouton « Séance » qui ouvre les vues ; il prend le nom de la vue ouverte (hors tableau de bord)
  const more = bar.querySelector('.sv-more');
  if (more) {
    more.classList.toggle('on', cur !== 'board');
    const label = cur === 'board' ? t('Séance') : bar.querySelector(`[data-sv="${cur}"]`).textContent;
    if (more.firstElementChild.textContent !== label) more.firstElementChild.textContent = label;
  }
}
// Menu des vues au téléphone : la pilule des vues s'ouvre sous le bouton « Séance »
function svMenu(open) {
  const bar = $('#sessViews'), more = bar?.querySelector('.sv-more');
  if (!more) return;
  bar.classList.toggle('open', open);
  more.setAttribute('aria-expanded', String(open));
  if (!open) return;
  const r = more.getBoundingClientRect(), seg = bar.querySelector('.sv-seg');
  seg.style.top = `${Math.round(r.bottom + 6)}px`;
  seg.style.right = `${Math.round(innerWidth - r.right)}px`;
  (seg.querySelector('.on') || seg.querySelector('button'))?.focus({ preventScroll: true });
}

export function initRail() {
  const rail = $('#rail');
  if (!rail) return;
  // Libellé long une fois traduit (« Impostazioni », « Repeticiones ») : plus petit, comme « Commentaires »
  for (const s of rail.querySelectorAll('.rail-btn small')) if (s.textContent.trim().length > 10) s.classList.add('rail-long');
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rail]');
    if (!b) return;
    ACTIONS[b.dataset.rail]?.(b);
    sync();
  });
  $('#sessViews')?.addEventListener('click', (e) => {
    if (e.target.closest('.sv-more')) { svMenu(!$('#sessViews').classList.contains('open')); return; }
    const k = e.target.closest('[data-sv]')?.dataset.sv;
    if (!k) return;
    svMenu(false);
    VIEWS[k]();
    sync();
  });
  document.addEventListener('pointerdown', (e) => { if ($('#sessViews')?.classList.contains('open') && !e.target.closest('#sessViews')) svMenu(false); });
  addEventListener('resize', () => svMenu(false));
  // Résumé (fenêtre de dialogue) : ouvert par son bouton, d'où qu'il vienne ; refermé : retour au segment d'avant
  $('#summaryBtn')?.addEventListener('click', () => setTimeout(syncViews));
  document.addEventListener('close', (e) => { if (e.target.id === 'summaryDlg') syncViews(); }, true);
  // Échap : ferme d'abord un petit menu ouvert (Dispo., thème), seul ; sinon la page Résultats
  // (Accueil, Saison, Actu, Replays : leur propre Échap)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if ($('#sessViews')?.classList.contains('open')) { e.stopPropagation(); svMenu(false); $('#sessViews .sv-more').focus(); return; }
    const menu = document.querySelector('.lpop-menu');
    if (menu) { e.stopPropagation(); menu.remove(); return; }
    if (isResultsOpen()) { closeResults(); sync(); }
  }, true);
  const mo = new MutationObserver(sync);
  mo.observe($('#seasonView'), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('#newsView'), { attributes: true, attributeFilter: ['hidden'] });
  for (const id of ['#homeView', '#replayView', '#resultsView', '#noLiveView', '#commPanel']) if ($(id)) mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('.grid'), { attributes: true, attributeFilter: ['class'] });
  mo.observe($('#commBtn'), { attributes: true, attributeFilter: ['class'] });
  // Replay lancé ou arrêté : Replays ou Direct
  let mode = store.status?.source?.mode;
  on('status', (s) => { if (s?.source?.mode !== mode) { mode = s?.source?.mode; sync(); } });
  sync();
  schemeButton();
  // Résumé et mini-classement : grisés tant qu'aucune séance n'est chargée
  const noSession = () => { const off = !store.state.SessionInfo; for (const k of ['summary', 'mini', 'results']) { const b = $(`#rail [data-rail="${k}"]`); if (b) b.disabled = off; } syncViews(); };
  noSession();
  setInterval(noSession, 2000);
  on('prefs', (k) => { if (k === 'scheme') schemeButton(); });
}
