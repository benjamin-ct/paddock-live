// Barre de navigation latérale (Accueil, Direct, Résultats, Saison, Replays, Radios,
// Réglages). Elle reprend les actions des boutons du haut, masqués.
import { $, $$ } from '../util.js';
import { openSeason, closeSeason } from './season.js';
import { openNews, closeNews } from './news.js';
import { openHome, closeHome, homeTouched, startWindows } from './home.js';
import { openReplays, closeReplays } from './replays.js';
import { openResults, closeResults, isResultsOpen } from './results-view.js';
import { unmaximize, setFreeLayout, isFreeLayout, saveWindowsSnapshot, restoreWindowsSnapshot, hasWindowsSnapshot } from './layout.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { prefs, setPref } from '../prefs.js';
import { on, store } from '../store.js';

// Apparence : automatique (comme le système), sombre ou clair
const SCHEMES = [
  ['auto', 'Auto', 'Automatique (comme le système)', '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'],
  ['dark', 'Sombre', 'Sombre', '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
  ['light', 'Clair', 'Clair', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
];
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

function openSettings(group) {
  $('#settingsBtn').click();
  if (group) $(`#setNav [data-sgroup="${group}"]`)?.click();
}

const ACTIONS = {
  home: () => openHome(),
  live: () => { homeTouched(); closeHome(); closeReplays(); closeSeason(); closeNews(); closeResults(); unmaximize(); },
  results: () => {
    if (isResultsOpen()) { closeResults(); return; }
    homeTouched(); closeHome(); closeReplays(); closeSeason(); closeNews(); openResults();
  },
  season: () => { closeNews(); closeReplays(); if ($('#seasonView').hidden) openSeason(); else closeSeason(); },
  news: () => { closeReplays(); if ($('#newsView').hidden) openNews(); else closeNews(); },
  replay: () => ($('#replayView').hidden ? openReplays() : closeReplays()),
  radio: () => $('#commBtn').click(),
  reset: (btn) => layoutMenu(btn),
  scheme: (btn) => schemeMenu(btn),
  settings: () => openSettings(),
};

// Menu « Dispo. » : panneaux rangés en colonnes ou placés librement, réinitialisation
function layoutMenu(btn) {
  document.querySelector('.lpop-menu')?.remove();
  const free = isFreeLayout();
  const menu = document.createElement('div');
  menu.className = 'lpop-menu rail-menu';
  menu.innerHTML = `<button data-l="cols">${icon('columns')} Panneaux rangés en colonnes${free ? '' : icon('check', 'ic-on')}</button>
    <button data-l="free">${icon('move')} Disposition libre : panneaux n'importe où${free ? icon('check', 'ic-on') : ''}</button>
    <div class="rail-sep"></div>
    <button data-l="save">${icon('save')} Enregistrer l'emplacement des fenêtres</button>
    <button data-l="restore" ${hasWindowsSnapshot() ? '' : 'disabled'}>${icon('undo')} Revenir à l'emplacement enregistré</button>
    <div class="rail-sep"></div>
    <button data-l="reset">${icon('refresh')} Réinitialiser l'interface</button>`;
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  document.body.appendChild(menu);
  menu.style.top = `${Math.max(8, Math.min(r.top - 40, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('[data-l]')?.dataset.l;
    if (!k) return;
    menu.remove();
    if (k === 'reset') $('#resetUiBtn').click();
    else if (k === 'save') saveWindowsSnapshot();
    else if (k === 'restore') restoreWindowsSnapshot();
    else {
      unmaximize();
      setFreeLayout(k === 'free');
      toast(k === 'free' ? 'Disposition libre : poignée pour déplacer, coin pour redimensionner' : 'Panneaux rangés en colonnes', 2500, k === 'free' ? 'move' : 'columns');
    }
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

// Élément actif : page ouverte (Accueil, Replays, Actu, Saison, Résultats), sinon le tableau de bord :
// Replays pendant un replay, Direct sinon
function sync() {
  const season = !$('#seasonView').hidden;
  const news = !$('#newsView').hidden;
  const home = !$('#homeView')?.hidden;
  const replays = !$('#replayView')?.hidden;
  const results = isResultsOpen();
  const page = home ? 'home' : replays ? 'replay' : news ? 'news' : season ? 'season' : results ? 'results' : null;
  const cur = page || (store.status?.source?.mode === 'replay' ? 'replay' : 'live');
  // Tableau de bord affiché : fenêtres du second écran rouvertes (pas sur l'accueil)
  if (!page) startWindows();
  for (const b of $$('#rail [data-rail]')) {
    const k = b.dataset.rail;
    b.classList.toggle('on', k === cur);
    if (k === 'radio') b.classList.toggle('playing', $('#commBtn').classList.contains('on'));
  }
}

export function initRail() {
  const rail = $('#rail');
  if (!rail) return;
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rail]');
    if (!b) return;
    ACTIONS[b.dataset.rail]?.(b);
    sync();
  });
  const mo = new MutationObserver(sync);
  mo.observe($('#seasonView'), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('#newsView'), { attributes: true, attributeFilter: ['hidden'] });
  for (const id of ['#homeView', '#replayView', '#resultsView']) if ($(id)) mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('.grid'), { attributes: true, attributeFilter: ['class'] });
  mo.observe($('#commBtn'), { attributes: true, attributeFilter: ['class'] });
  // Replay lancé ou arrêté : Replays ou Direct
  let mode = store.status?.source?.mode;
  on('status', (s) => { if (s?.source?.mode !== mode) { mode = s?.source?.mode; sync(); } });
  sync();
  schemeButton();
  // Résumé et mini-classement : grisés tant qu'aucune séance n'est chargée
  const noSession = () => { const off = !store.state.SessionInfo; for (const k of ['summary', 'mini', 'results']) { const b = $(`#rail [data-rail="${k}"]`); if (b) b.disabled = off; } };
  noSession();
  setInterval(noSession, 2000);
  on('prefs', (k) => { if (k === 'scheme') schemeButton(); });
}
