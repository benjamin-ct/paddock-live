// Palette de commandes (Ctrl+K, ⌘K, loupe de la barre latérale en Télémétrie) : trouve un espace, une vue de la séance,
// une fenêtre, un réglage ou une rubrique de la Saison. Chaque entrée reprend l'action existante (bouton de l'appli
// ou fonction déjà exportée) : rien n'est refait ici.
import { $, $$, esc } from '../util.js';
import { icon } from '../icons.js';
import { prefs, setPref } from '../prefs.js';
import { t } from '../i18n.js';
import { WIN, openInWindow } from './layout.js';
import { openSeason } from './season.js';
import { isResultsOpen } from './results-view.js';

// Apparence : automatique (comme le système), sombre ou clair (aussi bouton Apparence de la barre latérale)
export const SCHEMES = [
  ['auto', 'Auto', 'Automatique (comme le système)', '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'],
  ['dark', 'Sombre', 'Sombre', '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
  ['light', 'Clair', 'Clair', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
];

let dlg = null;
let items = [];     // entrées affichées (après filtre), dans l'ordre de la liste
let active = -1;    // entrée choisie au clavier
let opener = null;  // élément qui avait le focus : il le retrouve à la fermeture

// Recherche sans accents ni casse
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const click = (sel) => () => $(sel)?.click();
const hidden = (sel) => !$(sel) || $(sel).hidden;
// Espace : bouton de la barre latérale, sauf s'il est déjà ouvert (le bouton le refermerait)
const space = (k, view) => () => { if (!view || hidden(view)) $(`#rail [data-rail="${k}"]`)?.click(); };
// Grisé comme dans la barre latérale (pas de séance chargée)
const railOff = (k) => () => !!$(`#rail [data-rail="${k}"]`)?.disabled;

function entries() {
  const root = document.documentElement.classList;
  const simple = root.contains('phone') && root.contains('simple');
  const L = [];
  const add = (group, ic, label, run, more = {}) => L.push({ group, ic, label, run, ...more });
  const G = { spaces: t('Espaces'), session: t('Séance'), windows: t('Fenêtres'), scheme: t('Apparence'), settings: t('Réglages'), season: t('Saison') };
  add(G.spaces, 'home', t('Accueil'), space('home', '#homeView'));
  add(G.spaces, 'signal', t('Direct'), space('live'));
  add(G.spaces, 'trophy', t('Saison'), space('season', '#seasonView'));
  add(G.spaces, 'news', t('Actu'), space('news', '#newsView'));
  add(G.spaces, 'history', t('Replays'), space('replay', '#replayView'));
  add(G.session, 'checkered', t('Résultats de la séance'), () => { if (!isResultsOpen()) $('#rail [data-rail="results"]')?.click(); }, { off: railOff('results') });
  add(G.session, 'doc', t('Résumé de la séance'), click('#summaryBtn'), { off: railOff('summary') });
  if (!simple) add(G.session, 'mic', t('Commentaires en direct'), () => { if (hidden('#commPanel')) $('#commBtn')?.click(); });
  add(G.session, 'window', t('Mini-classement'), click('#miniBtn'), { off: railOff('mini') });
  // Fenêtres séparées : ordinateur seulement
  if (!root.contains('phone')) for (const [id, name] of [['map', 'Circuit'], ['analysis', 'Analyse'], ['duel', 'Duel'], ['compare', 'Comparaison']]) add(G.windows, 'external', t(name), () => openInWindow(id));
  for (const [k, , name, svg] of SCHEMES) add(G.scheme, null, t(name), () => setPref('scheme', k), { svg, on: (prefs.scheme || 'auto') === k });
  add(G.settings, 'gear', t('Réglages'), click('#settingsBtn'));
  for (const b of $$('#setNav [data-sgroup]')) {
    if (simple && b.hasAttribute('data-full')) continue;
    add(G.settings, 'sliders', b.querySelector('b')?.textContent.trim() || '', () => { $('#settingsBtn')?.click(); b.click(); });
  }
  // Rubriques de la Saison (textes déjà traduits dans la page)
  for (const b of $$('#szNav [data-sz]')) {
    if (simple && b.hasAttribute('data-full')) continue;
    const name = b.textContent.trim();
    add(G.season, b.querySelector('use')?.getAttribute('href')?.slice(3) || 'trophy', b.dataset.sz === 'home' ? `${G.season} · ${name}` : name, () => openSeason(b.dataset.sz));
  }
  return L;
}

// Filtre : chaque mot cherché dans le libellé ou le groupe ; le libellé qui commence par la recherche passe devant
function filter(all, q) {
  const words = fold(q).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return all;
  const f = fold(q).trim();
  return all.map((e, i) => {
    const label = fold(e.label), hay = `${label} ${fold(e.group)}`;
    if (!words.every((w) => hay.includes(w))) return null;
    const score = label.startsWith(f) ? 0 : label.split(/[\s'’·:(]+/).some((w) => w.startsWith(words[0])) ? 1 : label.includes(words[0]) ? 2 : 3;
    return { e, score, i };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.i - b.i).map((x) => x.e);
}

function render() {
  const q = $('#ckInput').value;
  items = filter(entries(), q);
  const list = $('#ckList');
  let group = '';
  list.innerHTML = items.map((e, i) => {
    // Groupes en titres tant que rien n'est cherché, puis rappelés à droite de chaque entrée
    const head = !q.trim() && e.group !== group ? `<li class="ck-group" role="presentation">${esc((group = e.group))}</li>` : '';
    const off = e.off?.();
    return `${head}<li class="ck-opt" role="option" id="ck-${i}" data-i="${i}" aria-selected="false"${off ? ' aria-disabled="true"' : ''}>${e.svg ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${e.svg}</svg>` : icon(e.ic)}<span>${esc(e.label)}</span>${e.on ? icon('check', 'ck-on') : ''}${q.trim() ? `<small>${esc(e.group)}</small>` : ''}</li>`;
  }).join('');
  $('#ckEmpty').hidden = items.length > 0;
  move(0, true);
}

// Entrée choisie : la première utilisable à partir de « from », dans le sens « dir » (les grisées sont sautées)
function move(from, reset = false, dir = 1) {
  const opts = $$('#ckList .ck-opt');
  if (reset) active = -1;
  let i = from;
  for (let n = 0; n < opts.length && opts[i]?.getAttribute('aria-disabled') === 'true'; n++) i = (i + dir + opts.length) % opts.length;
  if (!opts[i] || opts[i].getAttribute('aria-disabled') === 'true') i = -1;
  active = i;
  for (const o of opts) o.setAttribute('aria-selected', String(Number(o.dataset.i) === i));
  const input = $('#ckInput');
  if (i >= 0) { input.setAttribute('aria-activedescendant', `ck-${i}`); opts[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
}

function run(i) {
  const e = items[i];
  if (!e || e.off?.()) return;
  dlg.close();
  e.run();
}

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'cmdk';
  dlg.id = 'cmdk';
  dlg.setAttribute('aria-label', t('Palette de commandes'));
  dlg.dataset.noI18n = '';   // textes déjà traduits ici (t())
  dlg.innerHTML = `<div class="ck-search">${icon('search')}
      <input id="ckInput" class="x-native" type="text" role="combobox" aria-expanded="true" aria-controls="ckList" aria-autocomplete="list" autocomplete="off" spellcheck="false"
        placeholder="${esc(t('Rechercher un écran, une vue de la séance, un réglage…'))}" aria-label="${esc(t('Rechercher'))}">
      <kbd>${esc(t('Échap'))}</kbd></div>
    <ul class="ck-list" id="ckList" role="listbox" aria-label="${esc(t('Commandes'))}"></ul>
    <div class="ck-empty" id="ckEmpty" hidden>${esc(t('Aucun résultat'))}</div>
    <div class="ck-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> ${esc(t('choisir'))}</span><span><kbd>↵</kbd> ${esc(t('ouvrir'))}</span></div>`;
  document.body.appendChild(dlg);
  const input = $('#ckInput');
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    const n = items.length;
    if (!n) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      move(((active < 0 ? (dir > 0 ? -1 : 0) : active) + dir + n) % n, false, dir);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(e.key === 'Home' ? 0 : n - 1, false, e.key === 'Home' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    }
  });
  const list = $('#ckList');
  list.addEventListener('click', (e) => { const o = e.target.closest('.ck-opt'); if (o) run(Number(o.dataset.i)); });
  // Souris : l'entrée survolée devient l'entrée choisie (pas au toucher : le défilement ne choisit rien)
  list.addEventListener('pointermove', (e) => {
    const o = e.pointerType === 'mouse' && e.target.closest('.ck-opt:not([aria-disabled="true"])');
    if (o && Number(o.dataset.i) !== active) move(Number(o.dataset.i));
  });
  // Clic sur le fond : fermeture
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); opener = null; });
}

export function openPalette(from) {
  // Une autre fenêtre de dialogue déjà ouverte (Réglages…) : elle garde la main
  if (document.querySelector('dialog[open]')) return;
  if (!dlg) build();
  opener = from || document.activeElement;
  $('#ckInput').value = '';
  render();
  dlg.showModal();
  $('#ckInput').focus();
}

export function initPalette() {
  // Fenêtre principale seulement (pas les fenêtres détachées, la carte flottante ni les overlays de streaming)
  const root = document.documentElement.classList;
  if (WIN !== 'main' || root.contains('overlay') || root.contains('float-map')) return;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat) return;
    e.preventDefault();
    if (dlg?.open) dlg.close(); else openPalette();
  });
}
