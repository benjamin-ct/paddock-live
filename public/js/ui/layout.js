// Disposition libre : colonnes et panneaux redimensionnables, panneaux déplaçables par glisser-déposer,
// fenêtres secondaires (second écran) pouvant regrouper plusieurs panneaux, colonnes du classement.
import { $, $$, esc, storageGet, storageSet, sessionKind } from '../util.js';
import { prefs, setPref, towerCols, towerBig, PANELS_HIDDEN, TAB_HIDDEN } from '../prefs.js';
import { store, on, emit } from '../store.js';
import { toast } from './delay.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { track } from './stats.js';
import { tabList, canHideTab, pageTabs } from './tabmove.js';
import { markSetup, setupToApply } from './layout-calc.js';

export const PANELS = [
  { id: 'tower', cls: 'p-tower', name: 'Classement' },
  { id: 'map', cls: 'p-map', name: 'Circuit' },
  { id: 'feed', cls: 'p-feed', name: 'Messages (direction de course, enquêtes, limites de piste)' },
  { id: 'radio', cls: 'p-radio', name: 'Radios' },
  { id: 'duel', cls: 'p-duel', name: 'Duel' },
  { id: 'analysis', cls: 'p-analysis', name: 'Analyse (écarts, arrêts et stratégie, télémétrie, secteurs, comparaison…)' },
  { id: 'extra', cls: 'p-extra', name: 'Télémétrie' },
];
const SHORT = { tower: 'Classement', map: 'Circuit', feed: 'Messages', radio: 'Radios', duel: 'Duel', analysis: 'Analyse', extra: 'Télémétrie' };
// Panneaux ajoutés dans une version plus récente : placés à côté d'un panneau existant
// (dans la même colonne) quand on reprend une disposition enregistrée.
const ADDED_NEAR = { radio: ['feed', 1], analysis: ['extra', 0] }; // [voisin, 1 = après / 0 = avant]

export const COLUMNS = [
  ['name', 'Nom complet du pilote'], ['tags', 'État (stand, sortie, tour rapide…)'], ['int', 'Intervalle'], ['last', 'Dernier tour'], ['best', 'Meilleur tour'], ['sec', 'Secteurs'], ['pred', 'Tour en cours (qualifs)'],
  ['q', 'Q1/Q2/Q3'], ['tyre', 'Pneus'], ['pits', 'Arrêts / tours'], ['speed', 'Speed trap'],
];
// Colonnes facultatives, masquées par défaut (prefs.extraCols : celles ajoutées)
export const EXTRA_COLUMNS = [
  ['grid', 'Position de départ'], ['laps', 'Tours effectués'], ['gapf', 'Écart au pilote suivi'],
  ['spd', 'Vitesses I1 / I2 / arrivée'], ['bsec', 'Meilleurs secteurs (S1 / S2 / S3)'], ['team', 'Écurie'],
];

// Cases à cocher des colonnes (réglages et menu « Colonnes » du classement). Classement agrandi (⤢) :
// ses propres colonnes, d'abord les mêmes que d'habitude
function colOptsHtml() {
  const { hidden, extra } = towerCols();
  const box = (k, name, on, x) => `<label class="toggle small"><input type="checkbox" data-col="${k}"${x ? ' data-extra="1"' : ''} ${on ? 'checked' : ''}> ${esc(name)}</label>`;
  return (towerBig() ? '<div class="col-sep">Classement agrandi : ses propres colonnes</div>' : '')
    + COLUMNS.map(([k, n]) => box(k, n, !hidden.includes(k), false)).join('')
    + '<div class="col-sep">Colonnes en plus</div>'
    + EXTRA_COLUMNS.map(([k, n]) => box(k, n, extra.includes(k), true)).join('');
}
function onColChange(e) {
  const k = e.target.dataset.col;
  if (!k) return;
  const cur = towerCols();
  const flip = (list, on) => (on ? [...list, k] : list.filter((x) => x !== k));
  const next = e.target.dataset.extra ? { hidden: cur.hidden, extra: flip(cur.extra, e.target.checked) } : { hidden: flip(cur.hidden, !e.target.checked), extra: cur.extra };
  if (towerBig()) setPref('bigCols', next);
  else { setPref('hiddenCols', next.hidden); setPref('extraCols', next.extra); }
}

// Fenêtre courante : « main » ou une fenêtre secondaire (?win=…). « ?panel=x » : ancien lien d'un panneau seul.
const params = new URLSearchParams(location.search);
const legacyPanel = PANELS.some((p) => p.id === params.get('panel')) ? params.get('panel') : null;
export const WIN = params.get('win') || (legacyPanel ? `solo-${legacyPanel}` : 'main');
const isMain = WIN === 'main';
const LAYOUTS_KEY = 'paddock.layouts';
const MIN_W = 220, MIN_H = 110;

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('paddock-panels') : null;
const others = new Map(); // fenêtres secondaires ouvertes : win -> {panels, last, title}

function panelEl(id) {
  return $(`.${PANELS.find((p) => p.id === id).cls}`);
}

// ---------------- Modèle de disposition ----------------
// {cols: [{w, items: [{id, h}]}]} ; w et h sont des proportions (flex-grow). Des panneaux voisins d'une colonne avec
// le même `row` sont côte à côte (même hauteur, celle du premier ; largeurs : leur `w`).
// ---------------- Dispositions « Course » et « Qualif & essais » ----------------
// Chaque type de séance a sa propre disposition (panneaux, tailles, panneaux masqués,
// colonnes du classement, onglets ouverts), appliquée automatiquement selon la séance.
const PROFILES = { race: 'Course', quali: 'Qualif & essais' };
const PROFILE_KEY = 'paddock.layoutProfiles';   // { race: { hiddenPanels, hiddenCols }, quali: … }
const TABS_KEY = 'paddock.profileTabs';         // { race: { analysis: 'trace', … }, quali: … }
const TAB_DEFAULTS = {
  race: { feed: 'rcm', analysis: 'trace' },
  quali: { feed: 'rcm', analysis: 'compare' },
};
const profileDefaults = (prof = profile) => ({ hiddenPanels: [...PANELS_HIDDEN], hiddenCols: ['name'], hiddenTabs: [...TAB_HIDDEN[prof]] });
const profileFor = (mode, kind) => (mode === 'race' || mode === 'quali' ? mode : kind === 'race' ? 'race' : 'quali');
let profile = prefs.layoutMode === 'race' || prefs.layoutMode === 'quali' ? prefs.layoutMode : storageGet('paddock.lastProfile', 'race');
if (!PROFILES[profile]) profile = 'race';
// Fenêtre principale : une disposition par type de séance. Fenêtres secondaires (second écran) :
// une seule, quelle que soit la séance (sinon un changement de séance leur reprenait des panneaux)
const lkey = (win = WIN, prof = profile) => (prof === 'race' || win !== 'main' ? win : `${win}@${prof}`);

function defaultLayout(prof = profile) {
  if (!isMain) return { cols: [] };
  const quali = prof === 'quali';
  // Écran principal : Classement à gauche (plus large en qualifs et essais : Q1/Q2/Q3, tour en cours ; le duel passe
  // par-dessus), le Circuit au centre sur toute la hauteur, et à droite la Télémétrie, les Radios et la Direction de
  // course l'une sous l'autre. Analyse et Duel (masqués ici, s'ils sont affichés) : sous le Circuit
  return { cols: [
    { w: quali ? 1.2 : 1.05, items: [{ id: 'tower', h: 1 }] },
    { w: 1.15, items: [{ id: 'map', h: 1.6 }, { id: 'duel', h: 0.8 }, { id: 'analysis', h: 1 }] },
    { w: 0.95, items: [{ id: 'extra', h: 1 }, { id: 'radio', h: 1.1 }, { id: 'feed', h: 1.1 }] },
  ] };
}

function normalize(l) {
  const seen = new Set();
  const cols = (Array.isArray(l?.cols) ? l.cols : []).map((c) => ({
    w: Number(c?.w) > 0 ? Number(c.w) : 1,
    items: (Array.isArray(c?.items) ? c.items : []).filter((it) => {
      if (!PANELS.some((p) => p.id === it?.id) || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    }).map((it) => ({ id: it.id, h: Number(it.h) > 0 ? Number(it.h) : 1, ...(it.row ? { row: String(it.row), w: Number(it.w) > 0 ? Number(it.w) : 1 } : {}) })),
  })).filter((c) => c.items.length);
  // La fenêtre principale contient toujours tous les panneaux (ceux détachés y sont simplement cachés).
  if (isMain) {
    for (const p of PANELS) {
      if (seen.has(p.id)) continue;
      if (!cols.length) cols.push({ w: 1, items: [] });
      // Nouveau panneau : sous son voisin naturel s'il est dans cette fenêtre, sinon en dernière colonne
      const [near, after] = ADDED_NEAR[p.id] || [];
      const col = cols.find((c) => c.items.some((it) => it.id === near));
      if (col) col.items.splice(col.items.findIndex((it) => it.id === near) + after, 0, { id: p.id, h: 0.8 });
      else cols[cols.length - 1].items.push({ id: p.id, h: 1 });
      seen.add(p.id);
    }
  }
  const out = rescale({ cols });
  // Disposition libre : position et taille de chaque panneau (fractions de la zone des panneaux)
  if (l?.free && typeof l.free === 'object') {
    const rects = {};
    for (const [id, r] of Object.entries(l.free.rects || {})) {
      if (!PANELS.some((p) => p.id === id) || !r) continue;
      const n = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);
      rects[id] = { x: n(r.x, 0), y: n(r.y, 0), w: Math.max(0.05, n(r.w, 0.3)), h: Math.max(0.05, n(r.h, 0.3)) };
    }
    out.free = { rects, z: (Array.isArray(l.free.z) ? l.free.z : []).filter((id) => rects[id]) };
  }
  return out;
}

// Proportions ramenées à une moyenne de 1 : en CSS, des flex-grow dont la somme est
// inférieure à 1 ne remplissent qu'une partie de la place (espace vide sous un panneau).
function rescale(l) {
  const fit = (arr, key) => {
    const sum = arr.reduce((t, x) => t + x[key], 0);
    if (sum > 0) for (const x of arr) x[key] = Math.round(((x[key] * arr.length) / sum) * 1000) / 1000;
  };
  fit(l.cols, 'w');
  // Hauteurs : une rangée de panneaux côte à côte compte pour un (hauteur du premier, recopiée sur les autres)
  for (const c of l.cols) {
    const us = units(c.items);
    fit(us.map((u) => u[0]), 'h');
    for (const u of us) { for (const it of u) it.h = u[0].h; if (u.length > 1) fit(u, 'w'); }
  }
  return l;
}

// Panneaux d'une colonne regroupés en rangées : voisins avec le même `row`, sinon un panneau seul
function units(items) {
  const out = [];
  for (const it of items) {
    const last = out.at(-1);
    if (it.row && last?.[0].row === it.row) last.push(it); else out.push([it]);
  }
  return out;
}

function allLayouts() {
  const all = storageGet(LAYOUTS_KEY, {});
  return all && typeof all === 'object' ? all : {};
}

function storeLayout(win, l) {
  const all = allLayouts();
  if (l) all[win] = l; else delete all[win];
  storageSet(LAYOUTS_KEY, all);
}

// Application de bureau réglée sur « emplacement enregistré » : au lancement, les dispositions
// enregistrées remplacent celles de la dernière session (avant que les fenêtres ne se rouvrent)
if (isMain) {
  try {
    const saved = window.f1desktop?.startupLayouts?.();
    if (saved && typeof saved === 'object') storageSet(LAYOUTS_KEY, saved);
  } catch { /* version sans cette fonction */ }
}

let layout = normalize(allLayouts()[lkey()] || (!isMain && allLayouts()[`${WIN}@quali`]) || (legacyPanel ? { cols: [{ w: 1, items: [{ id: legacyPanel, h: 1 }] }] } : defaultLayout()));

function save() {
  storeLayout(lkey(), layout);
  announce();
}

function locate(id) {
  for (const [ci, c] of layout.cols.entries()) {
    const ii = c.items.findIndex((it) => it.id === id);
    if (ii >= 0) return { ci, ii, col: c, item: c.items[ii] };
  }
  return null;
}

function removeItem(id) {
  const loc = locate(id);
  if (!loc) return null;
  loc.col.items.splice(loc.ii, 1);
  if (!loc.col.items.length) layout.cols.splice(loc.ci, 1);
  rescale(layout);
  return loc.item;
}

function addAsColumn(id) {
  const w = layout.cols.length ? layout.cols.reduce((s, c) => s + c.w, 0) / layout.cols.length : 1;
  layout.cols.push({ w, items: [{ id, h: 1 }] });
  rescale(layout);
}

// Déplace `id` par rapport à `target` : left/right = nouvelle colonne, top/bottom = même colonne, center = échange.
function movePanel(id, target, zone) {
  if (id === target) return;
  if (zone === 'center') {
    const a = locate(id), b = locate(target);
    if (!a || !b) return;
    [a.item.id, b.item.id] = [b.item.id, a.item.id];
    return;
  }
  const moved = removeItem(id);
  const t = locate(target);
  if (!moved || !t) return;
  if (zone === 'top' || zone === 'bottom') {
    const h = t.item.h / 2;
    t.item.h = h;
    t.col.items.splice(t.ii + (zone === 'bottom' ? 1 : 0), 0, { id, h });
  } else {
    const w = t.col.w / 2;
    t.col.w = w;
    layout.cols.splice(t.ci + (zone === 'right' ? 1 : 0), 0, { w, items: [{ id, h: 1 }] });
  }
  rescale(layout);
}

// ---------------- Visibilité ----------------
function detachedElsewhere(id) {
  for (const o of others.values()) if (o.panels.includes(id)) return true;
  return false;
}

function isVisible(id) {
  if (!isMain) return !!locate(id);
  return !prefs.hiddenPanels.includes(id) && !detachedElsewhere(id);
}

// ---------------- Rendu ----------------
let renderKey = '';
// Redimensionnement en cours : la disposition change à chaque mouvement, mais la grille n'est pas
// redessinée (sinon la barre tenue serait remplacée et le relâchement perdu) ; elle l'est à la fin.
let resizing = false;
let renderLater = false;

function narrow() {
  return isMain && window.innerWidth <= 1000;
}

// Téléphone (et tablette en portrait) : un seul panneau à la fois, choisi dans la barre du bas.
const MOB_TABS = [
  ['tower', 'Classement'], ['extra', 'Télémétrie'], ['feed', 'Messages'], ['radio', 'Radios'], ['map', 'Carte'],
  ['duel', 'Duel'], ['analysis', 'Analyse'],
];
// Icônes dessinées, dans tous les thèmes
const MOB_SVG = {
  tower: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  map: '<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>',
  feed: '<path d="M4 5h16v11H8l-4 4z"/>',
  duel: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4"/>',
  analysis: '<path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-7"/>',
  extra: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>',
  radio: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
};
const MOB_KEY = 'paddock.mobileTab';
let mobTab = storageGet(MOB_KEY, 'tower');

function mobile() {
  return isMain && window.innerWidth <= 900;
}
// Téléphone : version simplifiée (l'essentiel seulement), sauf « version complète » dans les réglages
const simple = () => mobile() && !prefs.phoneFull;
const SIMPLE_TABS = ['tower', 'extra', 'feed', 'radio', 'map'];
// Téléphone : pas de fenêtres séparées, les panneaux qui s'ouvrent dans une fenêtre sur ordinateur restent des onglets
const phoneVisible = (id) => isVisible(id) || PANELS_HIDDEN.includes(id);

export function showMobilePanel(id) {
  mobTab = id;
  storageSet(MOB_KEY, id);
  render(true);
  // Panneau choisi : glisse en place
  if (!mobile()) return;
  const el = panelEl(id);
  el?.classList.add('mob-in');
  setTimeout(() => el?.classList.remove('mob-in'), 300);
}

function renderMobile(grid) {
  grid.classList.remove('custom', 'has-max', 'free');
  for (const p of PANELS) clearFree(panelEl(p.id));
  grid.classList.add('mobile');
  const tabs = MOB_TABS.filter(([id]) => phoneVisible(id) && (!simple() || SIMPLE_TABS.includes(id)));
  if (!tabs.some(([id]) => id === mobTab)) mobTab = tabs[0]?.[0] || 'tower';
  for (const p of PANELS) {
    const el = panelEl(p.id);
    el.style.flex = '';
    el.classList.remove('maximized');
    el.classList.toggle('hidden-panel', p.id !== mobTab || !phoneVisible(p.id));
    grid.appendChild(el);
  }
  for (const el of grid.querySelectorAll('.lcol, .lsplit-v, .lstash')) el.remove();
  // Téléphone : 5 boutons fixes en bas ; dans « Direct », les panneaux en onglets en haut
  const nav = $('#mobNav');
  nav.hidden = false;
  if (!nav.children.length) nav.innerHTML = MOB_NAV.map(([k, label, svg]) => `<button data-mob="${k}"><svg class="mn-svg" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span class="mn-l">${label}</span></button>`).join('');
  const strip = $('#mobPanels');
  strip.hidden = false;
  strip.innerHTML = tabs.map(([id, label]) => `<button data-mobp="${id}" class="${id === mobTab ? 'active' : ''}">${label}</button>`).join('');
  strip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  syncMobNav();
}

// Barre du bas du téléphone : Accueil, Direct, Saison, Actu, Plus (Replays, Commentaires…)
const MOB_NAV = [
  ['home', 'Accueil', '<path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10"/>'],
  ['live', 'Direct', '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"/>'],
  ['season', 'Saison', '<path d="M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 20h8M16 6h3a3 3 0 0 1-3 4M8 6H5a3 3 0 0 0 3 4"/>'],
  ['news', 'Actu', '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4"/>'],
  ['more', 'Plus', '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'],
];
function syncMobNav() {
  const open = (id) => !$(id)?.hidden;
  const cur = open('#homeView') ? 'home' : open('#seasonView') ? 'season' : open('#newsView') ? 'news' : open('#replayView') ? 'more' : 'live';
  for (const b of $$('#mobNav [data-mob]')) b.classList.toggle('active', b.dataset.mob === cur);
}

// Menu « Plus » du téléphone
function mobMore(btn) {
  document.querySelector('.lpop-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'lpop-menu mob-more';
  // Version simplifiée : sans les replays (pilotés depuis l'ordinateur) ni les commentaires audio
  menu.innerHTML = [
    ['results', 'checkered', 'Résultats de la séance'], ['replays', 'history', 'Replays'], ['comm', 'mic', 'Commentaires en direct'], ['summary', 'doc', 'Résumé de la séance'],
    ['settings', 'gear', 'Réglages'],
  ].filter(([k]) => !simple() || !['replays', 'comm'].includes(k)).map(([k, ic, label]) => `<button data-more="${k}">${icon(ic)} ${label}</button>`).join('');
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.right = '8px';
  menu.style.bottom = `${innerHeight - r.top + 8}px`;
  menu.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-more]')?.dataset.more;
    if (!k) return;
    menu.remove();
    if (k === 'results') { (await import('./home.js')).closeHome(); (await import('./results-view.js')).openResults(); }
    else if (k === 'replays') (await import('./replays.js')).openReplays();
    else if (k === 'comm') $('#commBtn')?.click();
    else if (k === 'summary') $('#summaryBtn')?.click();
    else if (k === 'settings') $('#settingsBtn')?.click();
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

function render(force = false) {
  if (resizing) { renderLater = true; return; }
  const grid = $('.grid');
  const key = `${mobile()}|${simple()}|${narrow()}|${JSON.stringify(layout)}|${PANELS.map((p) => isVisible(p.id)).join()}`;
  if (key === renderKey && !force) return;
  document.documentElement.classList.toggle('phone', mobile());
  document.documentElement.classList.toggle('simple', simple());
  document.documentElement.classList.toggle('sess-race', profile === 'race');
  renderKey = key;
  if (mobile()) { renderMobile(grid); return; }
  grid.classList.remove('mobile');
  if ($('#mobNav')) $('#mobNav').hidden = true;
  if ($('#mobPanels')) $('#mobPanels').hidden = true;
  const stash = grid.querySelector('.lstash') || Object.assign(document.createElement('div'), { className: 'lstash', hidden: true });
  if (narrow()) {
    // Petit écran : empilement vertical classique
    grid.classList.remove('custom', 'free');
    for (const p of PANELS) {
      const el = panelEl(p.id);
      clearFree(el);
      el.style.flex = '';
      el.classList.toggle('hidden-panel', !isVisible(p.id));
      grid.appendChild(el);
    }
    for (const el of grid.querySelectorAll('.lcol, .lsplit-v')) el.remove();
    return;
  }
  grid.classList.add('custom');
  grid.appendChild(stash);
  for (const p of PANELS) { const el = panelEl(p.id); el.classList.remove('hidden-panel'); clearFree(el); stash.appendChild(el); }
  for (const el of grid.querySelectorAll('.lcol, .lsplit-v')) el.remove();
  grid.classList.toggle('free', !!layout.free);
  if (layout.free) { renderFree(grid, stash); return; }
  const cols = layout.cols.map((c) => ({ c, items: c.items.filter((it) => isVisible(it.id)) })).filter((x) => x.items.length);
  const sumW = cols.reduce((t, x) => t + x.c.w, 0) || 1;
  cols.forEach(({ c, items }, i) => {
    if (i) {
      const sv = document.createElement('div');
      sv.className = 'lsplit-v';
      sv.title = 'Glisser pour redimensionner les colonnes';
      splitter(sv, 'x', cols[i - 1].c, c);
      grid.insertBefore(sv, stash);
    }
    const col = document.createElement('div');
    col.className = 'lcol';
    col.style.flex = `${(c.w * cols.length) / sumW} 1 0`;
    const us = units(items), sumH = us.reduce((t, u) => t + u[0].h, 0) || 1;
    col._model = c;
    us.forEach((u, j) => {
      if (j) {
        const sh = document.createElement('div');
        sh.className = 'lsplit-h';
        sh.title = 'Glisser pour redimensionner les panneaux';
        splitter(sh, 'y', us[j - 1][0], u[0]);
        col.appendChild(sh);
      }
      const grow = `${(u[0].h * us.length) / sumH} 1 0`;
      if (u.length === 1) {
        const el = panelEl(u[0].id);
        el.style.flex = grow;
        el._model = u[0];
        col.appendChild(el);
        return;
      }
      // Rangée : panneaux côte à côte, séparés par une barre qui règle leurs largeurs
      const row = document.createElement('div');
      row.className = 'lrow';
      row.style.flex = grow;
      const sumW = u.reduce((t, it) => t + it.w, 0) || 1;
      u.forEach((it, k) => {
        if (k) {
          const sr = document.createElement('div');
          sr.className = 'lsplit-r';
          sr.title = 'Glisser pour redimensionner les panneaux';
          splitter(sr, 'x', u[k - 1], it);
          row.appendChild(sr);
        }
        const el = panelEl(it.id);
        el.style.flex = `${(it.w * u.length) / sumW} 1 0`;
        el._model = it;
        row.appendChild(el);
      });
      col.appendChild(row);
    });
    grid.insertBefore(col, stash);
  });
  if (!cols.length) {
    const note = document.createElement('div');
    note.className = 'lcol note';
    note.textContent = isMain ? 'Tous les panneaux sont masqués ou ouverts dans une autre fenêtre.' : 'Fenêtre vide.';
    grid.insertBefore(note, stash);
  }
}

// ---------------- Disposition libre ----------------
// Chaque panneau a sa position et sa taille (en fractions de la zone des panneaux) : on le
// déplace avec la poignée et on le redimensionne par son coin, n'importe où ; il s'aimante aux bords
// de la zone et des autres panneaux. Clic sur un panneau = il passe au premier plan.
const FREE_GAP = 10;    // écart entre deux panneaux, et avec le bord de la zone (px) : le même qu'en colonnes
const SNAP = 18;        // distance d'aimantation (px)
const NEAR = FREE_GAP + 12;   // bords considérés comme collés (même séparation)

// Rectangle d'un panneau libre en pixels { l, t, r, b } et retour en fractions de la zone
const toPx = (f, g) => ({ l: g.left + f.x * g.width, t: g.top + f.y * g.height, r: g.left + (f.x + f.w) * g.width, b: g.top + (f.y + f.h) * g.height });
const toFrac = (p, g) => ({ x: (p.l - g.left) / g.width, y: (p.t - g.top) / g.height, w: (p.r - p.l) / g.width, h: (p.b - p.t) / g.height });
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;

// Marges régulières : bords proches d'un voisin ou de la zone calés à FREE_GAP (après un déplacement, à l'affichage)
function tidyFree(ids) {
  const g = $('.grid').getBoundingClientRect();
  if (!g.width || !g.height) return;
  const R = ids.map((id) => [id, toPx(layout.free.rects[id], g)]);
  for (const [, r] of R) {
    if (r.l - g.left < NEAR) r.l = g.left + FREE_GAP;
    if (g.right - r.r < NEAR) r.r = g.right - FREE_GAP;
    if (r.t - g.top < NEAR) r.t = g.top + FREE_GAP;
    if (g.bottom - r.b < NEAR) r.b = g.bottom - FREE_GAP;
  }
  for (const [, a] of R) {
    for (const [, b] of R) {
      if (a === b) continue;
      if (overlap(a.t, a.b, b.t, b.b) && Math.abs(b.l - a.r) < NEAR) b.l = a.r + FREE_GAP;
      if (overlap(a.l, a.r, b.l, b.r) && Math.abs(b.t - a.b) < NEAR) b.t = a.b + FREE_GAP;
    }
  }
  for (const [id, r] of R) {
    if (r.r - r.l < MIN_W || r.b - r.t < MIN_H) continue;
    layout.free.rects[id] = toFrac(r, g);
    applyRect(panelEl(id), layout.free.rects[id]);
  }
}

function clearFree(el) {
  if (!el._free) return;
  for (const k of ['position', 'left', 'top', 'width', 'height', 'zIndex']) el.style[k] = '';
  for (const h of el.querySelectorAll(':scope > .fr-rs, :scope > .fr-edge')) h.remove();
  el._free = false;
}

// Positions de départ du mode libre : celles des panneaux tels qu'ils sont affichés (colonnes)
function freeFromCurrent() {
  const g = $('.grid').getBoundingClientRect();
  const rects = {};
  for (const p of PANELS) {
    const r = panelEl(p.id).getBoundingClientRect();
    if (r.width && r.height) rects[p.id] = { x: (r.left - g.left) / g.width, y: (r.top - g.top) / g.height, w: r.width / g.width, h: r.height / g.height };
  }
  // Panneaux invisibles pour l'instant : en cascade au centre
  let i = 0;
  for (const p of PANELS) if (!rects[p.id]) { rects[p.id] = { x: 0.3 + 0.03 * i, y: 0.2 + 0.03 * i, w: 0.4, h: 0.45 }; i++; }
  return { rects, z: [] };
}

export function setFreeLayout(on) {
  if (!!layout.free === on) return;
  layout.free = on ? freeFromCurrent() : undefined;
  if (!on) delete layout.free;
  renderKey = '';
  render(true);
  save();
}
export const isFreeLayout = () => !!layout.free;

function applyRect(el, r) {
  Object.assign(el.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
}

function renderFree(grid, stash) {
  const ids = PANELS.map((p) => p.id).filter(isVisible);
  const z = layout.free.z;
  for (const id of ids) {
    if (!layout.free.rects[id]) layout.free.rects[id] = { x: 0.3, y: 0.25, w: 0.4, h: 0.45 };
    // Panneau qui dépasse de la zone (fenêtre plus petite qu'avant) : ramené dedans
    const fr = layout.free.rects[id];
    fr.w = Math.min(1, fr.w); fr.h = Math.min(1, fr.h);
    fr.x = Math.max(0, Math.min(fr.x, 1 - fr.w)); fr.y = Math.max(0, Math.min(fr.y, 1 - fr.h));
    const el = panelEl(id);
    el.style.flex = '';
    el.style.position = 'absolute';
    applyRect(el, layout.free.rects[id]);
    el.style.zIndex = String(10 + z.indexOf(id) + 1);   // panneaux cliqués en dernier au-dessus
    el._free = true;
    el._model = null;
    if (!el.querySelector(':scope > .fr-rs')) {
      // Redimensionnement par chaque bord et chaque coin (poignée visible : coin en bas à droite)
      for (const dir of ['se', 'n', 's', 'e', 'w', 'ne', 'nw', 'sw']) {
        const rs = document.createElement('div');
        rs.className = dir === 'se' ? 'fr-rs' : `fr-edge fr-${dir}`;
        rs.title = 'Glisser pour redimensionner';
        rs.addEventListener('pointerdown', (e) => freeDrag(id, e, dir));
        el.appendChild(rs);
      }
    }
    grid.insertBefore(el, stash);
  }
  if (!ids.length) {
    const note = document.createElement('div');
    note.className = 'lcol note';
    note.textContent = isMain ? 'Tous les panneaux sont masqués ou ouverts dans une autre fenêtre.' : 'Fenêtre vide.';
    grid.insertBefore(note, stash);
  }
  tidyFree(ids);
}

function bringToFront(id) {
  if (!layout.free || layout.free.z.at(-1) === id) return;
  layout.free.z = [...layout.free.z.filter((x) => x !== id), id];
  layout.free.z.forEach((x, i) => { panelEl(x).style.zIndex = String(11 + i); });
}

// Déplacement (mode 'move') ou redimensionnement (mode 'resize') d'un panneau en disposition libre
function freeDrag(id, e, mode) {
  e.preventDefault();
  e.stopPropagation();
  const grid = $('.grid');
  const g = grid.getBoundingClientRect();
  const el = panelEl(id);
  const r0 = el.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  bringToFront(id);
  const otherIds = PANELS.map((p) => p.id).filter((x) => x !== id && isVisible(x));
  const start = Object.fromEntries(otherIds.map((x) => { const o = panelEl(x).getBoundingClientRect(); return [x, { l: o.left, t: o.top, r: o.right, b: o.bottom }]; }));
  // Redimensionnement : les panneaux collés au bord tiré le suivent (même séparation) : bord en face (écart gardé)
  // ou bord aligné du même côté (panneaux empilés). links : { id, edge, off } par axe
  const links = { x: [], y: [] };
  if (mode !== 'move') {
    const edge = (axis, line, out, inn) => {
      for (const x of otherIds) {
        const o = start[x];
        if (Math.abs(o[out] - line) < NEAR + FREE_GAP && Math.abs(o[out] - line) >= FREE_GAP / 2 && Math.sign(o[out] - line) === (out === 'l' || out === 't' ? 1 : -1)) links[axis].push({ id: x, edge: out, off: o[out] - line });
        else if (Math.abs(o[inn] - line) < NEAR / 2) links[axis].push({ id: x, edge: inn, off: o[inn] - line });
      }
    };
    if (mode.includes('e')) edge('x', r0.right, 'l', 'r');
    if (mode.includes('w')) edge('x', r0.left, 'r', 'l');
    if (mode.includes('s')) edge('y', r0.bottom, 't', 'b');
    if (mode.includes('n')) edge('y', r0.top, 'b', 't');
  }
  const linked = new Set([...links.x, ...links.y].map((k) => k.id));
  // Bords auxquels s'aimanter : zone des panneaux et autres panneaux visibles (sauf ceux qui suivent)
  const others = otherIds.filter((x) => !linked.has(x)).map((x) => panelEl(x).getBoundingClientRect());
  const xs = [g.left, g.right, ...others.flatMap((o) => [o.left - FREE_GAP, o.right + FREE_GAP, o.left, o.right])];
  const ys = [g.top, g.bottom, ...others.flatMap((o) => [o.top - FREE_GAP, o.bottom + FREE_GAP, o.top, o.bottom])];
  const snap = (v, list) => { let best = v, d = SNAP; for (const c of list) if (Math.abs(c - v) < d) { d = Math.abs(c - v); best = c; } return best; };
  document.body.classList.add('dragging-panel');
  const target = e.currentTarget;
  target.setPointerCapture?.(e.pointerId);
  startResize();
  let rect = { left: r0.left, top: r0.top, width: r0.width, height: r0.height };
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (mode === 'move') {
      let left = Math.max(g.left, Math.min(g.right - r0.width, r0.left + dx));
      // Le panneau reste entièrement dans la zone des panneaux (pas sous la barre de replay)
      let top = Math.max(g.top, Math.min(Math.max(g.top, g.bottom - r0.height), r0.top + dy));
      // Aimantation du bord gauche ou droit, du haut ou du bas
      const sl = snap(left, xs), sr = snap(left + r0.width, xs) - r0.width;
      left = Math.abs(sl - left) <= Math.abs(sr - left) ? sl : sr;
      const st = snap(top, ys), sb = snap(top + r0.height, ys) - r0.height;
      top = Math.max(g.top, Math.min(Math.max(g.top, g.bottom - r0.height), Math.abs(st - top) <= Math.abs(sb - top) ? st : sb));
      rect = { left, top, width: r0.width, height: r0.height };
    } else {
      // mode : bords tirés (n, s, e, w et coins) ; les autres restent en place
      let left = mode.includes('w') ? snap(Math.max(g.left, Math.min(r0.right - MIN_W, r0.left + dx)), xs) : r0.left;
      let right = mode.includes('e') ? snap(Math.min(g.right, Math.max(r0.left + MIN_W, r0.right + dx)), xs) : r0.right;
      let top = mode.includes('n') ? snap(Math.max(g.top, Math.min(r0.bottom - MIN_H, r0.top + dy)), ys) : r0.top;
      let bottom = mode.includes('s') ? snap(Math.min(g.bottom, Math.max(r0.top + MIN_H, r0.bottom + dy)), ys) : r0.bottom;
      // Panneaux qui suivent : chacun garde sa taille minimale (le bord tiré s'arrête avant)
      const keep = (v, axis) => {
        for (const k of links[axis]) {
          const o = start[k.id], min = axis === 'x' ? MIN_W : MIN_H;
          const e = v + k.off;
          if (k.edge === 'l' && o.r - e < min) v = o.r - min - k.off;
          if (k.edge === 'r' && e - o.l < min) v = o.l + min - k.off;
          if (k.edge === 't' && o.b - e < min) v = o.b - min - k.off;
          if (k.edge === 'b' && e - o.t < min) v = o.t + min - k.off;
        }
        return v;
      };
      if (mode.includes('e')) right = keep(right, 'x');
      if (mode.includes('w')) left = keep(left, 'x');
      if (mode.includes('s')) bottom = keep(bottom, 'y');
      if (mode.includes('n')) top = keep(top, 'y');
      rect = { left, top, width: right - left, height: bottom - top };
      const lines = { x: mode.includes('e') ? right : left, y: mode.includes('s') ? bottom : top };
      for (const axis of ['x', 'y']) {
        for (const k of links[axis]) {
          const p = { ...start[k.id], [k.edge]: lines[axis] + k.off };
          layout.free.rects[k.id] = toFrac(p, g);
          applyRect(panelEl(k.id), layout.free.rects[k.id]);
        }
      }
    }
    const r = { x: (rect.left - g.left) / g.width, y: (rect.top - g.top) / g.height, w: rect.width / g.width, h: rect.height / g.height };
    layout.free.rects[id] = r;
    applyRect(el, r);
  };
  let done = false;
  const up = () => {
    if (done) return;
    done = true;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', up);
    endResize();
    tidyFree(PANELS.map((p) => p.id).filter(isVisible));   // marges régulières
    save();
    window.dispatchEvent(new Event('resize'));   // graphiques et carte à la nouvelle taille
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
}

// Début et fin d'un redimensionnement (séparateur ou coin d'un panneau libre)
function startResize() { resizing = true; renderLater = false; }
function endResize() {
  resizing = false;
  document.body.classList.remove('resizing-x', 'resizing-y', 'dragging-panel');
  renderKey = '';
  if (renderLater) { renderLater = false; render(true); }
}

// Séparateur : redistribue la place entre les deux voisins (a avant, b après) en gardant leur total.
function splitter(el, axis, a, b) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const prev = el.previousElementSibling, next = el.nextElementSibling;
    const size = (x) => (axis === 'x' ? x.getBoundingClientRect().width : x.getBoundingClientRect().height);
    const pa = size(prev), pb = size(next);
    const key = axis === 'x' ? 'w' : 'h';
    const total = a[key] + b[key];
    const min = axis === 'x' ? MIN_W : MIN_H;
    const start = axis === 'x' ? e.clientX : e.clientY;
    // Valeurs affichées = proportions × facteur commun (panneaux masqués exclus, voir render)
    const k = (parseFloat(prev.style.flexGrow) || a[key]) / a[key];
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('active');
    document.body.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    startResize();
    const move = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const na = Math.max(min, Math.min(pa + pb - min, pa + d));
      a[key] = (total * na) / (pa + pb);
      b[key] = total - a[key];
      prev.style.flex = `${a[key] * k} 1 0`;
      next.style.flex = `${b[key] * k} 1 0`;
    };
    // Relâchement où qu'il ait lieu (hors de la barre, hors de la fenêtre, capture perdue) : une seule fin
    let done = false;
    const up = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      el.removeEventListener('lostpointercapture', up);
      el.classList.remove('active');
      endResize();
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    el.addEventListener('lostpointercapture', up);
  });
  // Double-clic : partage égal
  el.addEventListener('dblclick', () => {
    const key = axis === 'x' ? 'w' : 'h';
    const avg = (a[key] + b[key]) / 2;
    a[key] = b[key] = avg;
    render(true);
    save();
  });
}

// ---------------- Glisser-déposer des panneaux ----------------
function startDrag(id, e) {
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'ldrag-ghost';
  ghost.textContent = SHORT[id];
  const hint = document.createElement('div');
  hint.className = 'ldrop';
  document.body.append(ghost, hint);
  document.body.classList.add('dragging-panel');
  let drop = null;
  const show = (z, text) => {
    hint.hidden = false;
    Object.assign(hint.style, { left: `${z[0]}px`, top: `${z[1]}px`, width: `${z[2]}px`, height: `${z[3]}px` });
    hint.textContent = text;
  };
  const panelId = (el) => el && PANELS.find((p) => el.classList.contains(p.cls))?.id;
  const move = (ev) => {
    ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
    const grid = $('.grid');
    const g = grid.getBoundingClientRect();
    const els = document.elementsFromPoint(ev.clientX, ev.clientY);
    const colsEl = [...grid.querySelectorAll(':scope > .lcol')].filter((c) => c.querySelector('.panel'));
    drop = null;
    hint.hidden = true;
    // Bords de la fenêtre : nouvelle colonne sur toute la hauteur
    const edge = 28;
    if (colsEl.length && ev.clientX >= g.left && ev.clientX <= g.right && ev.clientY >= g.top && ev.clientY <= g.bottom
      && (ev.clientX < g.left + edge || ev.clientX > g.right - edge)) {
      const left = ev.clientX < g.left + edge;
      const col = left ? colsEl[0] : colsEl.at(-1);
      // Cible : un autre panneau de cette colonne (seul dans sa colonne : il y est déjà)
      const tid = [...col.querySelectorAll('.panel')].map(panelId).find((x) => x && x !== id);
      if (tid) {
        drop = { tid, zone: left ? 'left' : 'right' };
        show([left ? g.left : g.right - 90, g.top, 90, g.height], left ? 'Nouvelle colonne tout à gauche' : 'Nouvelle colonne tout à droite');
      }
      return;
    }
    // Séparateur entre deux colonnes : nouvelle colonne à cet endroit
    const sv = els.find((n) => n.classList?.contains('lsplit-v'));
    if (sv) {
      const tid = [...(sv.nextElementSibling?.querySelectorAll('.panel') || [])].map(panelId).find((x) => x && x !== id);
      if (tid) {
        const r = sv.getBoundingClientRect();
        drop = { tid, zone: 'left' };
        show([r.left - 40, g.top, r.width + 80, g.height], 'Nouvelle colonne ici');
      }
      return;
    }
    // Séparateur entre deux panneaux d'une colonne : insertion entre les deux
    const sh = els.find((n) => n.classList?.contains('lsplit-h'));
    if (sh) {
      const tid = panelId(sh.nextElementSibling);
      if (tid && tid !== id) {
        const r = sh.getBoundingClientRect();
        drop = { tid, zone: 'top' };
        show([r.left, r.top - 30, r.width, r.height + 60], 'Ici, entre les deux');
      }
      return;
    }
    // Fenêtre vide
    if (!colsEl.length && grid.classList.contains('custom') && els.includes(grid)) {
      drop = { zone: 'append' };
      show([g.left + 10, g.top + 10, g.width - 20, g.height - 20], 'Placer ici');
      return;
    }
    const under = els.find((n) => n.classList?.contains('panel') && n.closest('.lcol'));
    const tid = panelId(under);
    if (!tid || tid === id) return;
    const r = under.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
    const zone = fx < 0.25 ? 'left' : fx > 0.75 ? 'right' : fy < 0.3 ? 'top' : fy > 0.7 ? 'bottom' : 'center';
    drop = { tid, zone };
    const z = {
      left: [r.left, r.top, r.width / 2, r.height], right: [r.left + r.width / 2, r.top, r.width / 2, r.height],
      top: [r.left, r.top, r.width, r.height / 2], bottom: [r.left, r.top + r.height / 2, r.width, r.height / 2],
      center: [r.left + r.width * 0.1, r.top + r.height * 0.1, r.width * 0.8, r.height * 0.8],
    }[zone];
    show(z, zone === 'center' ? `Échanger avec ${SHORT[tid]}` : { left: 'Nouvelle colonne à gauche', right: 'Nouvelle colonne à droite', top: 'Au-dessus', bottom: 'En dessous' }[zone]);
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    ghost.remove();
    hint.remove();
    document.body.classList.remove('dragging-panel');
    if (drop?.zone === 'append') {
      removeItem(id);
      addAsColumn(id);
      render();
      save();
    } else if (drop) {
      movePanel(id, drop.tid, drop.zone);
      render();
      save();
    }
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ---------------- Fenêtres secondaires ----------------
function winTitle(panels) {
  return panels.map((p) => SHORT[p]).join(' + ') || 'Fenêtre';
}

function announce() {
  if (isMain || !channel) return;
  const panels = layout.cols.flatMap((c) => c.items.map((it) => it.id));
  channel.postMessage({ type: 'alive', win: WIN, panels, bounds: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight } });
  document.title = `Paddock Live · ${winTitle(panels)}`;
}

function openWindow(win) {
  track('feature.popout');
  return window.open(`/?win=${encodeURIComponent(win)}`, `paddock-${win}`, 'width=1200,height=800');
}

// Carte flottante (application de bureau) : la carte part dans une fenêtre transparente, sans cadre,
// au-dessus de tout ; elle revient ici quand on ferme cette fenêtre.
export function floatMap() {
  if (!isMain) return;
  if ([...others.values()].some((o) => o.panels?.includes('map'))) { toast('La carte est déjà dans une autre fenêtre : ramenez-la d\'abord ici', 3500, 'warning'); return; }
  const all = allLayouts();
  for (const k of Object.keys(all)) { const w = k.split('@')[0]; if (w !== 'main' && !others.has(w)) delete all[k]; }
  const target = `float${Date.now().toString(36)}`;
  all[lkey(target)] = { cols: [{ w: 1, items: [{ id: 'map', h: 1 }] }] };
  storageSet(LAYOUTS_KEY, all);
  track('feature.floatmap');
  if (!window.open(`/?win=${target}&float=1`, `paddock-${target}`, 'width=560,height=460')) return;
  others.set(target, { panels: ['map'], last: Date.now() + 5000 });
  if ($('.grid').classList.contains('has-max')) unmaximize();
  render();
}

// Envoie un panneau vers une autre fenêtre (existante : il s'y ajoute ; sinon nouvelle fenêtre).
function sendTo(id, target) {
  if (target === 'main') {
    // Retour dans la fenêtre principale : il suffit de le retirer d'ici.
    removeItem(id);
    save();
    if (!layout.cols.length) window.close();
    else render();
    return;
  }
  if (target === 'new') {
    // Nettoie les dispositions de fenêtres fermées
    const all = allLayouts();
    for (const k of Object.keys(all)) { const w = k.split('@')[0]; if (w !== 'main' && w !== WIN && !others.has(w)) delete all[k]; }
    target = `w${Date.now().toString(36)}`;
    all[lkey(target)] = { cols: [{ w: 1, items: [{ id, h: 1 }] }] };
    storageSet(LAYOUTS_KEY, all);
    const w = openWindow(target);
    if (!w) return;
  } else {
    channel?.postMessage({ type: 'add', win: target, panel: id });
  }
  others.set(target, { panels: [...(others.get(target)?.panels || []), id], last: Date.now() + 5000 });
  if (isMain) {
    if ($('.grid').classList.contains('has-max')) unmaximize();
    render();
  } else {
    removeItem(id);
    save();
    if (!layout.cols.length) setTimeout(() => window.close(), 200);
    else render();
  }
}

function popMenu(id, anchor) {
  const targets = [...others.entries()].filter(([w, o]) => w !== WIN && Date.now() - o.last < 3500 + 5000);
  if (!targets.length) { sendTo(id, 'new'); return; }
  document.querySelector('.lpop-menu')?.remove();
  const m = document.createElement('div');
  m.className = 'lpop-menu';
  m.innerHTML = `<div class="muted small">Envoyer « ${esc(SHORT[id])} » vers…</div>
    ${targets.map(([w, o], i) => `<button data-to="${esc(w)}">${icon('window')} Fenêtre ${i + 1} : ${esc(winTitle(o.panels))} <span class="muted small">(ajouter)</span></button>`).join('')}
    <button data-to="new">${icon('plus')} Nouvelle fenêtre</button>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  m.style.top = `${r.bottom + 4}px`;
  m.onclick = (e) => {
    const b = e.target.closest('[data-to]');
    if (!b) return;
    m.remove();
    sendTo(id, b.dataset.to);
  };
  setTimeout(() => document.addEventListener('pointerdown', function close(ev) {
    if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', close); }
  }), 0);
}

function initChannel() {
  if (!channel) return;
  channel.onmessage = (e) => {
    const { type, win, panels, panel } = e.data || {};
    if (type === 'reset' && !isMain) { window.close(); return; }
    if (!win || win === WIN) {
      // Panneau demandé depuis la barre latérale de la fenêtre principale : affiché en grand ici
      if (type === 'show' && win === WIN && locate(panel)) {
        if (!panelEl(panel).classList.contains('maximized')) maximize(panel);
        focusSelf();
        return;
      }
      if (type === 'add' && win === WIN && PANELS.some((p) => p.id === panel) && !locate(panel)) {
        addAsColumn(panel);
        render();
        save();
        window.focus();
      }
      return;
    }
    if (type === 'alive') others.set(win, { panels: (panels || []).filter((p) => PANELS.some((x) => x.id === p)), bounds: e.data.bounds, last: Date.now() });
    if (type === 'closed') others.delete(win);
    if (type === 'hello' && !isMain) announce();
    if (isMain) render();
  };
  if (isMain) {
    channel.postMessage({ type: 'hello', win: WIN });
    // Fenêtre fermée brutalement : plus de signe de vie depuis 3,5 s -> ses panneaux reviennent.
    setInterval(() => {
      let changed = false;
      for (const [w, o] of others) if (Date.now() - o.last > 3500) { others.delete(w); changed = true; }
      if (changed) render();
    }, 1000);
  } else {
    announce();
    setInterval(announce, 1000);
    // Les autres fenêtres secondaires se signalent aussi (pour le menu « envoyer vers »).
    setInterval(() => { for (const [w, o] of others) if (Date.now() - o.last > 3500) others.delete(w); }, 1000);
    window.addEventListener('pagehide', () => channel.postMessage({ type: 'closed', win: WIN }));
  }
}

// ---------------- Agrandir ----------------
export function unmaximize() {
  const tower = $('.p-tower.maximized');
  for (const p of $$('.panel.maximized')) p.classList.remove('maximized');
  $('.grid').classList.remove('has-max');
  if (tower) { renderLayoutOptions(); emit('towerSize'); }   // colonnes du classement : celles d'habitude
}

function maximize(id) {
  const el = panelEl(id);
  const was = el.classList.contains('maximized');
  unmaximize();
  if (!was) {
    el.classList.add('maximized');
    $('.grid').classList.add('has-max');
    if (id === 'tower') { renderLayoutOptions(); emit('towerSize'); }   // colonnes du classement agrandi
  }
}

// Fenêtre mise au premier plan (application de bureau : aussi si elle est réduite)
function focusSelf() {
  if (window.f1desktop?.focusWindow) window.f1desktop.focusWindow();
  else window.focus();
}


// ---------------- Changement de disposition (Course / Qualif & essais) ----------------
const tabHeads = () => PANELS.map((p) => [p.id, panelEl(p.id)?.querySelector('[data-tabs]')]).filter(([, h]) => h);

function applyTabs() {
  const saved = storageGet(TABS_KEY, {})[profile] || {};
  for (const [id, head] of tabHeads()) {
    const want = saved[id] || TAB_DEFAULTS[profile]?.[id];
    const b = want && head.querySelector(`[data-tab="${want}"]`);
    if (b && !b.classList.contains('active')) b.click();
  }
  visibleTabs();
}

// Onglet ouvert masqué : premier onglet affiché du panneau à la place
function visibleTabs() {
  for (const [, head] of tabHeads()) {
    const cur = head.querySelector(':scope > [data-tab].active');
    // Onglet regroupé (limites de piste, enquêtes…) : bouton caché par principe, choisi dans son sélecteur
    if (cur && (cur.classList.contains('tab-member') ? prefs.hiddenTabs.includes(cur.dataset.tab) : getComputedStyle(cur).display === 'none')) [...head.querySelectorAll(':scope > [data-tab]')].find((b) => getComputedStyle(b).display !== 'none')?.click();
  }
}

function switchProfile(next, quiet = false) {
  if (!PROFILES[next] || next === profile) return;
  if (isMain) {
    // Panneaux et onglets masqués, colonnes du classement : propres à chaque disposition
    const st = storageGet(PROFILE_KEY, {});
    st[profile] = { hiddenPanels: prefs.hiddenPanels, hiddenTabs: prefs.hiddenTabs, hiddenCols: prefs.hiddenCols, extraCols: prefs.extraCols };
    storageSet(PROFILE_KEY, st);
    const n = st[next] || profileDefaults(next);
    profile = next;
    storageSet('paddock.lastProfile', next);
    setPref('hiddenPanels', n.hiddenPanels || []);
    setPref('hiddenCols', n.hiddenCols || ['name']);
    setPref('extraCols', n.extraCols || []);
    setPref('hiddenTabs', n.hiddenTabs || TAB_HIDDEN[next]);
  } else profile = next;
  // Fenêtre secondaire : elle garde ses panneaux (même disposition pour toutes les séances)
  if (isMain) layout = normalize(allLayouts()[lkey()] || defaultLayout());
  unmaximize();
  render(true);
  save();
  applyTabs();
  renderLayoutOptions();
  if (isMain && !quiet) toast(`Disposition « ${PROFILES[next]} » (Réglages → Disposition)`, 3500);
}

function checkProfile() {
  const kind = store.state.SessionInfo ? sessionKind(store.state) : null;
  if (!kind && prefs.layoutMode !== 'race' && prefs.layoutMode !== 'quali') return;
  switchProfile(profileFor(prefs.layoutMode, kind));
  autoSetup();
}

// Début d'une séance (direct ou replay) : la disposition enregistrée marquée pour son type est remise toute seule, une
// seule fois par séance (séance gardée : pas remise de nouveau au rechargement de la page)
const AUTO_KEY = 'paddock.autoSetupSession';
const AUTO_MSG = {
  race: (n) => `Disposition « ${n} » remise pour la course`,
  quali: (n) => `Disposition « ${n} » remise pour les qualifs`,
  practice: (n) => `Disposition « ${n} » remise pour les essais`,
};
function autoSetup() {
  const info = store.state.SessionInfo, id = info?.Path || info?.Key;
  if (!isMain || !info?.Type || !id) return;
  const kind = sessionKind(store.state);
  const snap = setupToApply(windowSetups(), kind, String(id), storageGet(AUTO_KEY, null));
  storageSet(AUTO_KEY, String(id));
  if (snap) restoreWindowsSnapshot(snap.name, AUTO_MSG[kind](snap.name));
}

// Boutons de panneau (poignée, agrandir, envoyer, masquer) centrés sur la hauteur de la première ligne de l'en-tête (titre, outils ou
// onglets), quelle que soit sa hauteur réelle (thème, boutons « Calques », onglets sur 2 lignes)
function alignCtrl(head) {
  const items = [...head.children].filter((x) => !x.classList.contains('panel-ctrl') && x.offsetParent);
  if (!items.length) return;
  const top = head.getBoundingClientRect().top;
  const firstTop = Math.min(...items.map((x) => x.getBoundingClientRect().top));
  const row = items.filter((x) => x.getBoundingClientRect().top < firstTop + 6).map((x) => x.getBoundingClientRect());
  const mid = (Math.min(...row.map((r) => r.top)) + Math.max(...row.map((r) => r.bottom))) / 2 - top;
  head.style.setProperty('--ctrl-top', `${Math.max(0, Math.round(mid - 13))}px`);
}
const headObserver = 'ResizeObserver' in window ? new ResizeObserver((entries) => { const heads = entries.map((e) => e.target); requestAnimationFrame(() => heads.forEach(alignCtrl)); }) : null;

// ---------------- Initialisation ----------------
// 1.30 : nouvel écran principal pour tout le monde, une seule fois (layoutV 4 ; nouvelle installation : déjà fait,
// prefs.js). L'ancienne disposition est gardée dans les dispositions enregistrées (« Ma disposition d'avant », ou
// « Ma disposition 4 panneaux » pour celle des premières bêtas de la 1.30) ; les fenêtres secondaires gardent leurs
// panneaux, seules les dispositions de la fenêtre principale repartent de zéro. Radios traduites d'office.
// layoutV 3 (bêtas 42 à 45, écran sans le Circuit) : seulement le Circuit remis au centre.
function migrateLayout() {
  if ((prefs.layoutV || 0) >= 4) return;
  if (prefs.layoutV === 3) {
    storageSet(LAYOUTS_KEY, Object.fromEntries(Object.entries(allLayouts()).filter(([k]) => !k.startsWith('main'))));
    storageSet(PROFILE_KEY, {});
    setPref('hiddenPanels', (prefs.hiddenPanels || []).filter((id) => id !== 'map'));
    setPref('hiddenCols', [...new Set([...(prefs.hiddenCols || []), 'name'])]);   // classement : code du pilote seul
    setPref('layoutV', 4);
    layout = normalize(defaultLayout());
    setTimeout(() => toast('Le Circuit revient dans l\'écran principal, au centre ; le classement n\'affiche plus que le code des pilotes (nom complet : menu Colonnes)', 8000, 'map'), 1500);
    return;
  }
  const name = prefs.layoutV === 2 ? t('Ma disposition 4 panneaux') : t('Ma disposition d\'avant');
  const before = { name, at: Date.now(), layouts: allLayouts(), wins: [], desk: null, ...viewState() };
  before.prefs.tabLayout ||= pageTabs();   // onglets à leur place d'avant (sans disposition : celle de la page)
  storageSet(SETUPS_KEY, [...windowSetups().filter((s) => s.name !== name), before]);
  storageSet(LAYOUTS_KEY, Object.fromEntries(Object.entries(allLayouts()).filter(([k]) => !k.startsWith('main'))));
  storageSet(PROFILE_KEY, {});
  storageSet(TABS_KEY, {});
  const def = profileDefaults();
  setPref('hiddenPanels', def.hiddenPanels);
  setPref('hiddenTabs', def.hiddenTabs);
  setPref('hiddenCols', [...new Set([...(prefs.hiddenCols || []), 'name'])]);   // classement : code du pilote seul
  setPref('tabLayout', null);
  setPref('radioText', true);
  setPref('layoutV', 4);
  layout = normalize(defaultLayout());
  setTimeout(() => toast(`Nouvel écran : Classement, Circuit, Télémétrie, Radios traduites et Direction de course. Analyse et Duel s'ouvrent dans une fenêtre (menu Fenêtres ou bouton + d'un panneau). L'ancienne disposition : Réglages → Disposition → Fenêtres (« ${name} »)`, 14000), 1500);
}

// Ouvre un panneau dans sa propre fenêtre (bouton + d'un panneau, menu Dispo.) ; s'il est déjà dans une fenêtre, rien
export function openInWindow(id) {
  if (!isMain || detachedElsewhere(id)) return;
  sendTo(id, 'new');
}
on('openWindow', openInWindow);

export function initLayout() {
  if (isMain) migrateLayout();
  if (!isMain) {
    document.body.classList.add('solo');
    if (legacyPanel && !allLayouts()[lkey()]) storeLayout(lkey(), layout);
    // Fenêtre secondaire : bascule colonnes / disposition libre (panneaux n'importe où)
    const fb = $('#soloFreeBtn');
    if (fb) {
      fb.hidden = false;
      const sync = () => { fb.classList.toggle('on', !!layout.free); fb.title = layout.free ? 'Disposition libre (cliquer pour ranger les panneaux en colonnes)' : 'Panneaux en colonnes (cliquer pour les placer librement)'; };
      fb.addEventListener('click', () => { unmaximize(); setFreeLayout(!layout.free); sync(); toast(layout.free ? 'Disposition libre : poignée pour déplacer, coin pour redimensionner' : 'Panneaux rangés en colonnes', 2500, layout.free ? 'move' : 'columns'); });
      sync();
    }
  }
  initChannel();
  for (const p of PANELS) {
    const head = panelEl(p.id).querySelector('.panel-head');
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-ctrl';
    ctrl.innerHTML = `<button data-act="drag" class="lgrip" title="Glisser pour déplacer ce panneau">${icon('grip')}</button>`
      + `<button data-act="max" title="Agrandir / réduire (Échap)">${icon('maximize')}</button>`
      + `<button data-act="pop" title="Envoyer vers une autre fenêtre (second écran)">${icon('external')}</button>`
      + (isMain ? `<button data-act="hide" title="Masquer ce panneau (réaffichable dans Réglages)">${icon('close')}</button>`
        : `<button data-act="back" title="Remettre ce panneau dans la fenêtre principale">${icon('window-in')}</button>`);
    head.appendChild(ctrl);
    headObserver?.observe(head);
    ctrl.querySelector('.lgrip').addEventListener('pointerdown', (e) => {
      if (narrow() || mobile()) return;
      if (layout.free) freeDrag(p.id, e, 'move'); else startDrag(p.id, e);
    });
    panelEl(p.id).addEventListener('pointerdown', () => { if (layout.free) bringToFront(p.id); });
    ctrl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const act = b?.dataset.act;
      if (act === 'max') maximize(p.id);
      if (act === 'pop') popMenu(p.id, b);
      if (act === 'back') sendTo(p.id, 'main');
      if (act === 'hide') setPref('hiddenPanels', [...new Set([...prefs.hiddenPanels, p.id])]);
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('.grid').classList.contains('has-max') && !document.querySelector('dialog[open]')) unmaximize();
  });
  // Raccourcis : Maj+1 à Maj+9 remettent la disposition enregistrée n° 1 à 9 (e.code : la touche, quel que soit le
  // clavier), D ferme le duel du classement (son ✕)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const n = e.shiftKey && /^Digit[1-9]$/.test(e.code) ? Number(e.code[5]) : 0;
    const snap = n && windowSetups()[n - 1];
    if (snap) { e.preventDefault(); restoreWindowsSnapshot(snap.name); }
    else if (e.key === 'd' || e.key === 'D') $('#duelBand:not([hidden]) .bt-close')?.click();
  });
  window.addEventListener('resize', () => render());
  $('#mobNav')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mob]');
    if (!b) return;
    const k = b.dataset.mob;
    if (k === 'more') { mobMore(b); return; }
    const [home, season, news, replays] = await Promise.all([import('./home.js'), import('./season.js'), import('./news.js'), import('./replays.js')]);
    if (k === 'home') { home.openHome(); return; }
    home.homeTouched();
    home.closeHome();
    replays.closeReplays();
    if (k === 'season') season.openSeason();
    else if (k === 'news') news.openNews();
    else { season.closeSeason(); news.closeNews(); (await import('./results-view.js')).closeResults(); }
  });
  $('#mobPanels')?.addEventListener('click', (e) => { const b = e.target.closest('[data-mobp]'); if (b) showMobilePanel(b.dataset.mobp); });
  // Bouton actif de la barre du bas : suit les espaces ouverts (accueil, saison, actu, replays)
  const mo = new MutationObserver(syncMobNav);
  for (const id of ['#homeView', '#seasonView', '#newsView', '#replayView']) if ($(id)) mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  // Disposition modifiée dans une autre instance de la même fenêtre (rechargement) : rien à faire ;
  // la fenêtre principale suit seulement les préférences.
  on('prefs', (k) => {
    if (k === 'hiddenPanels' || k === 'phoneFull') render();
    if (['hiddenPanels', 'hiddenTabs', 'tabLayout', 'hiddenCols', 'extraCols', 'towerFit'].includes(k)) renderLayoutOptions();
  });
  render(true);
  renderLayoutOptions();
  // Menu « Colonnes » du classement : se ferme au clic ailleurs ou avec Échap
  const colMenu = $('#towerCols');
  if (colMenu) {
    document.addEventListener('pointerdown', (e) => { if (colMenu.open && !colMenu.contains(e.target)) colMenu.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') colMenu.open = false; });
  }
  // Menus « Colonnes » et « Calques » : posés par-dessus l'écran (coupés par le bord d'un petit panneau sinon),
  // sous le bouton ou au-dessus s'il y a plus de place, avec défilement si la fenêtre est trop basse
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    const menu = d.matches?.('.map-layers') && d.open && !d.closest('.float-bar, .grid.mobile') && d.querySelector('.map-layers-menu');
    if (!menu) return;
    const r = d.querySelector('summary').getBoundingClientRect();
    // Réglages de la vue 3D : dans le corps du panneau, qui contient ses menus (contain: paint) et en devient le
    // repère : un menu « fixé » se décalait (coordonnées de l'écran) et sortait de la vue. Sous le bouton, à gauche,
    // à la hauteur restante du panneau, avec défilement si le panneau est petit
    if (d.matches('.map3d-opts')) {
      const box = d.closest('.panel-body')?.getBoundingClientRect();
      Object.assign(menu.style, { position: '', top: '', bottom: '', left: '0', right: 'auto', overflowY: 'auto',
        maxHeight: `${Math.max(90, (box ? box.bottom : innerHeight) - r.bottom - 14)}px` });
      // Trop près du bord droit de la vue : aligné à droite du bouton
      if (box && r.left + menu.offsetWidth > box.right - 8) Object.assign(menu.style, { left: 'auto', right: '0' });
      return;
    }
    const below = innerHeight - r.bottom - 14, above = r.top - 14;
    const up = below < 280 && above > below;
    Object.assign(menu.style, { position: 'fixed', right: 'auto', overflowY: 'auto', maxHeight: `${Math.max(120, up ? above : below)}px`,
      top: up ? 'auto' : `${r.bottom + 6}px`, bottom: up ? `${innerHeight - r.top + 6}px` : 'auto' });
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, d.matches('.tower-cols') ? r.left : r.right - w))}px`;
  }, true);
  addEventListener('resize', () => { for (const d of document.querySelectorAll('.map-layers[open]')) d.open = false; });
  // Menu « Options » des radios (et tout autre menu de ce type) : fermé au clic ailleurs ou avec Échap
  document.addEventListener('pointerdown', (e) => { for (const d of document.querySelectorAll('.rd-menu[open]')) if (!d.contains(e.target)) d.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const d of document.querySelectorAll('.rd-menu[open]')) d.open = false; });
  // Onglets ouverts : mémorisés pour chaque disposition
  for (const [id, head] of tabHeads()) {
    head.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      const all = storageGet(TABS_KEY, {});
      all[profile] = { ...(all[profile] || {}), [id]: b.dataset.tab };
      storageSet(TABS_KEY, all);
    });
  }
  applyTabs();
  on('reset', checkProfile);
  // Séance connue par son message, ou par l'instantané du début (direct ouvert avant la séance, replay)
  on('events', (events) => { if (events.some(([t]) => t === 'SessionInfo' || t === '__snapshot')) checkProfile(); });
  on('prefs', (k) => { if (k === 'layoutMode') checkProfile(); });
  checkProfile();
}

// ---------------- Dispositions enregistrées ----------------
// « Enregistrer » garde, sous un nom, les dispositions de toutes les fenêtres (panneaux, tailles, mode libre)
// et la place de chaque fenêtre ; un clic sur son nom remet tout comme au moment de l'enregistrement.
// Application de bureau : la place des fenêtres est gérée par l'application (desk : renvoyé à l'enregistrement,
// la dernière disposition enregistrée ou remise peut être reprise à chaque lancement) ; navigateur : les fenêtres
// secondaires sont rouvertes à leur place.
const SNAP_KEY = 'paddock.savedWindows';     // dernière disposition enregistrée ou remise (seule gardée avant la 1.30)
const SETUPS_KEY = 'paddock.windowSetups';   // [{ name, at, layouts, wins, desk, kind? }]
export function windowSetups() {
  const list = storageGet(SETUPS_KEY, null);
  if (Array.isArray(list)) return list;
  const old = storageGet(SNAP_KEY, null);
  return old?.layouts ? [{ name: t('Mon emplacement'), ...old }] : [];
}
// Emplacement unique d'une version précédente : gardé dans la liste avec la place des fenêtres de l'application
export async function migrateWindowSetups() {
  if (Array.isArray(storageGet(SETUPS_KEY, null))) return;
  const list = windowSetups();
  if (list[0] && !list[0].desk) {
    try { list[0].desk = (await window.f1desktop?.savedWindows?.()) || null; } catch { /* ancienne version */ }
  }
  storageSet(SETUPS_KEY, list);
}

export async function saveWindowsSnapshot(name) {
  if (!isMain) return;
  save();
  const layouts = allLayouts();
  const wins = [...others.entries()].map(([win, o]) => ({ win, bounds: o.bounds || null }));
  let desk = null;
  try { desk = await window.f1desktop?.saveWindows?.(layouts); } catch { /* ancienne version */ }
  const kind = windowSetups().find((s) => s.name === name)?.kind;   // même nom : garde son type de séance
  const snap = { name, at: Date.now(), layouts, wins, desk: desk && typeof desk === 'object' ? desk : null, ...viewState(), ...(kind && { kind }) };
  storageSet(SNAP_KEY, snap);
  storageSet(SETUPS_KEY, [...windowSetups().filter((s) => s.name !== name), snap]);
  toast(`Disposition « ${name} » enregistrée (${wins.length + 1} fenêtre${wins.length ? 's' : ''})`, 3500, 'check');
}

// Panneaux et onglets affichés, colonnes du classement, onglets ouverts : gardés avec la disposition
// (onglets placés avant les panneaux affichés : un panneau Radios ou Stratégie affiché vide reprend ses onglets, tabmove.js)
const VIEW_PREFS = ['tabLayout', 'hiddenTabs', 'hiddenPanels', 'hiddenCols', 'extraCols'];
function viewState() {
  return { prefs: Object.fromEntries(VIEW_PREFS.map((k) => [k, prefs[k]])), profiles: storageGet(PROFILE_KEY, {}), tabs: storageGet(TABS_KEY, {}) };
}

// Disposition remise toute seule au début d'un type de séance ('quali', 'race', 'practice' ; vide : aucun)
export function setWindowSetupKind(name, kind) {
  storageSet(SETUPS_KEY, markSetup(windowSetups(), name, kind));
}

export function deleteWindowSetup(name) {
  storageSet(SETUPS_KEY, windowSetups().filter((s) => s.name !== name));
}

export async function restoreWindowsSnapshot(name, msg) {
  if (!isMain) return;
  const snap = windowSetups().find((s) => s.name === name);
  if (!snap?.layouts) { toast('Aucun emplacement enregistré'); return; }
  storageSet(SNAP_KEY, snap);
  storageSet(LAYOUTS_KEY, snap.layouts);
  // Disposition enregistrée avant la 1.30 : sans les panneaux ni les onglets affichés (gardés tels quels)
  if (snap.prefs) {
    storageSet(PROFILE_KEY, snap.profiles || {});
    storageSet(TABS_KEY, snap.tabs || {});
    for (const k of VIEW_PREFS) if (k in snap.prefs) setPref(k, snap.prefs[k]);
  }
  unmaximize();
  layout = normalize(snap.layouts[lkey()] || defaultLayout());
  renderKey = '';
  if (window.f1desktop?.restoreWindows) {
    // L'application ferme les fenêtres secondaires et les rouvre à leur place enregistrée (sans place enregistrée :
    // les fenêtres restent où elles sont)
    if (snap.desk) {
      others.clear();
      await window.f1desktop.restoreWindows(snap.desk);
    }
  } else {
    channel?.postMessage({ type: 'reset', win: WIN });
    others.clear();
    // Navigateur : une seule fenêtre peut s'ouvrir par clic, les autres sont bloquées par le navigateur
    let blocked = 0;
    for (const w of snap.wins || []) {
      const b = w.bounds;
      const feat = b ? `left=${b.x},top=${b.y},width=${b.w},height=${b.h}` : 'width=1200,height=800';
      if (!window.open(`/?win=${encodeURIComponent(w.win)}`, `paddock-${w.win}`, feat)) blocked++;
    }
    if (blocked) toast(`${blocked} fenêtre(s) bloquée(s) : autorisez les pop-up`, 5000);
  }
  render(true);
  applyTabs();
  renderLayoutOptions();
  toast(msg || `Disposition « ${name} » remise`, msg ? 4000 : 2500, 'check');
}

// Retour à l'interface par défaut : disposition, panneaux masqués, colonnes du classement ;
// les fenêtres secondaires se ferment (leurs panneaux reviennent dans la fenêtre principale).
export function resetLayout(ask = true) {
  if (!isMain) return;
  if (ask && !window.confirm('Réinitialiser l\'interface ?\n\nPanneaux, onglets, colonnes et fenêtres reviennent par défaut.')) return;
  channel?.postMessage({ type: 'reset', win: WIN });
  others.clear();
  storageSet(LAYOUTS_KEY, {});
  storageSet(PROFILE_KEY, {});
  storageSet(TABS_KEY, {});
  unmaximize();
  const def = profileDefaults();
  setPref('hiddenPanels', [...def.hiddenPanels]);
  setPref('hiddenCols', [...def.hiddenCols]);
  setPref('extraCols', []);
  setPref('bigCols', null);
  setPref('tabLayout', null);
  setPref('hiddenTabs', [...def.hiddenTabs]);
  if (!prefs.towerFit) setPref('towerFit', true);
  layout = normalize(defaultLayout());
  applyTabs();
  render(true);
  save();
}

export function renderLayoutOptions() {
  const sel = $('#layoutModeSel');
  if (sel) {
    sel.value = prefs.layoutMode;
    sel.onchange = () => setPref('layoutMode', sel.value);
    $('#layoutProfileNow').textContent = `Disposition affichée : « ${PROFILES[profile]} ».`;
  }
  $('#panelOpts').innerHTML = PANELS.map((p) => `<label class="toggle small"><input type="checkbox" data-panel="${p.id}" ${prefs.hiddenPanels.includes(p.id) ? '' : 'checked'}> ${esc(p.name)}</label>`).join('');
  $('#panelOpts').onchange = (e) => {
    const id = e.target.dataset.panel;
    if (!id) return;
    setPref('hiddenPanels', e.target.checked ? prefs.hiddenPanels.filter((x) => x !== id) : [...prefs.hiddenPanels, id]);
  };
  // Onglets visibles : ceux de chaque panneau, sauf le dernier qu'il reste (masquer alors le panneau)
  const tabs = $('#tabOpts');
  if (tabs) {
    tabs.innerHTML = tabList().filter(([p]) => SHORT[p]).sort((a, b) => PANELS.findIndex((x) => x.id === a[0]) - PANELS.findIndex((x) => x.id === b[0]))
      .map(([p, t, name]) => `<label class="toggle small"><input type="checkbox" data-tabopt="${t}" ${prefs.hiddenTabs.includes(t) ? '' : 'checked'}> <span>${esc(SHORT[p])}</span> · ${esc(name)}</label>`).join('');
    tabs.onchange = (e) => {
      const t = e.target.dataset.tabopt;
      if (!t) return;
      if (!e.target.checked && !canHideTab(t)) { e.target.checked = true; toast('Dernier onglet de ce panneau : masquez plutôt le panneau (Panneaux visibles)', 4000, 'warning'); return; }
      setPref('hiddenTabs', e.target.checked ? prefs.hiddenTabs.filter((x) => x !== t) : [...prefs.hiddenTabs, t]);
    };
  }
  $('#towerFit').checked = prefs.towerFit;
  $('#towerFit').onchange = (e) => setPref('towerFit', e.target.checked);
  for (const b of [$('#layoutReset'), $('#resetUiBtn')]) if (b) b.onclick = () => resetLayout();
  const fs = $('#freeSel');
  if (fs) {
    fs.value = layout.free ? 'free' : 'cols';
    fs.onchange = () => setFreeLayout(fs.value === 'free');
  }
  for (const box of [$('#colOpts'), $('#towerColOpts')]) {
    if (!box) continue;
    box.innerHTML = colOptsHtml();
    box.onchange = onColChange;
  }
}
