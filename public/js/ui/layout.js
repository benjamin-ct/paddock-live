// Disposition libre : colonnes et panneaux redimensionnables, panneaux déplaçables par glisser-déposer,
// fenêtres secondaires (second écran) pouvant regrouper plusieurs panneaux, colonnes du classement.
import { $, $$, esc, storageGet, storageSet, sessionKind } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { store, on } from '../store.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { track } from './stats.js';

export const PANELS = [
  { id: 'tower', cls: 'p-tower', name: 'Classement' },
  { id: 'map', cls: 'p-map', name: 'Circuit' },
  { id: 'feed', cls: 'p-feed', name: 'Direction de course (messages, enquêtes, limites de piste)' },
  { id: 'radio', cls: 'p-radio', name: 'Radios (transcriptions, audio)' },
  { id: 'duel', cls: 'p-duel', name: 'Duel' },
  { id: 'analysis', cls: 'p-analysis', name: 'Analyse (race trace, positions, temps, pneus, secteurs, télémétrie)' },
  { id: 'extra', cls: 'p-extra', name: 'Stratégie & course (arrêts, stratégie, simulateur, bagarres, météo, championnat)' },
];
const SHORT = { tower: 'Classement', map: 'Circuit', feed: 'Direction de course', radio: 'Radios', duel: 'Duel', analysis: 'Analyse', extra: 'Stratégie' };
// Panneaux ajoutés dans une version plus récente : placés à côté d'un panneau existant
// (dans la même colonne) quand on reprend une disposition enregistrée.
const ADDED_NEAR = { radio: ['feed', 1], analysis: ['extra', 0] }; // [voisin, 1 = après / 0 = avant]

export const COLUMNS = [
  ['name', 'Nom complet du pilote'], ['tags', 'État (stand, sortie, tour rapide…)'], ['int', 'Intervalle'], ['last', 'Dernier tour'], ['best', 'Meilleur tour'], ['sec', 'Secteurs'], ['pred', 'Tour en cours (qualifs)'],
  ['q', 'Q1/Q2/Q3'], ['tyre', 'Pneus'], ['pits', 'Arrêts / tours'], ['speed', 'Speed trap'], ['duel', 'Boutons duel'],
];
// Colonnes facultatives, masquées par défaut (prefs.extraCols : celles ajoutées)
export const EXTRA_COLUMNS = [
  ['grid', 'Position de départ'], ['laps', 'Tours effectués'], ['gapf', 'Écart au pilote suivi'],
  ['spd', 'Vitesses I1 / I2 / arrivée'], ['bsec', 'Meilleurs secteurs (S1 / S2 / S3)'], ['team', 'Écurie'],
];

// Cases à cocher des colonnes (réglages et menu « Colonnes » du classement)
function colOptsHtml() {
  const box = (k, name, on, extra) => `<label class="toggle small"><input type="checkbox" data-col="${k}"${extra ? ' data-extra="1"' : ''} ${on ? 'checked' : ''}> ${esc(name)}</label>`;
  return COLUMNS.map(([k, n]) => box(k, n, !prefs.hiddenCols.includes(k), false)).join('')
    + '<div class="col-sep">Colonnes en plus</div>'
    + EXTRA_COLUMNS.map(([k, n]) => box(k, n, prefs.extraCols.includes(k), true)).join('');
}
function onColChange(e) {
  const k = e.target.dataset.col;
  if (!k) return;
  if (e.target.dataset.extra) setPref('extraCols', e.target.checked ? [...prefs.extraCols, k] : prefs.extraCols.filter((x) => x !== k));
  else setPref('hiddenCols', e.target.checked ? prefs.hiddenCols.filter((x) => x !== k) : [...prefs.hiddenCols, k]);
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
// {cols: [{w, items: [{id, h}]}]} ; w et h sont des proportions (flex-grow).
// ---------------- Dispositions « Course » et « Qualif & essais » ----------------
// Chaque type de séance a sa propre disposition (panneaux, tailles, panneaux masqués,
// colonnes du classement, onglets ouverts), appliquée automatiquement selon la séance.
const PROFILES = { race: 'Course', quali: 'Qualif & essais' };
const PROFILE_KEY = 'paddock.layoutProfiles';   // { race: { hiddenPanels, hiddenCols }, quali: … }
const TABS_KEY = 'paddock.profileTabs';         // { race: { analysis: 'trace', … }, quali: … }
const TAB_DEFAULTS = {
  race: { feed: 'rcm', analysis: 'trace', extra: 'pits' },
  quali: { feed: 'rcm', analysis: 'compare', extra: 'tyres' },
};
const PROFILE_DEFAULTS = { race: { hiddenPanels: [], hiddenCols: [] }, quali: { hiddenPanels: [], hiddenCols: [] } };
const profileFor = (mode, kind) => (mode === 'race' || mode === 'quali' ? mode : kind === 'race' ? 'race' : 'quali');
let profile = prefs.layoutMode === 'race' || prefs.layoutMode === 'quali' ? prefs.layoutMode : storageGet('paddock.lastProfile', 'race');
if (!PROFILES[profile]) profile = 'race';
// Fenêtre principale : une disposition par type de séance. Fenêtres secondaires (second écran) :
// une seule, quelle que soit la séance (sinon un changement de séance leur reprenait des panneaux)
const lkey = (win = WIN, prof = profile) => (prof === 'race' || win !== 'main' ? win : `${win}@${prof}`);

function defaultLayout(prof = profile) {
  if (!isMain) return { cols: [] };
  const quali = prof === 'quali';
  if (window.innerWidth <= 1500) {
    return quali ? { cols: [
      { w: 1.3, items: [{ id: 'tower', h: 1.5 }, { id: 'feed', h: 0.7 }, { id: 'radio', h: 0.6 }] },
      { w: 1, items: [{ id: 'map', h: 1.1 }, { id: 'duel', h: 0.9 }, { id: 'analysis', h: 1 }, { id: 'extra', h: 0.6 }] },
    ] } : { cols: [
      { w: 1.2, items: [{ id: 'tower', h: 1.4 }, { id: 'feed', h: 0.7 }, { id: 'radio', h: 0.7 }] },
      { w: 1, items: [{ id: 'map', h: 1.1 }, { id: 'duel', h: 0.9 }, { id: 'analysis', h: 1 }, { id: 'extra', h: 0.8 }] },
    ] };
  }
  // Qualif : classement plus large (Q1/Q2/Q3, tour en cours), duel et secteurs mis en avant
  return quali ? { cols: [
    { w: 1.8, items: [{ id: 'tower', h: 1 }] },
    { w: 1, items: [{ id: 'map', h: 1.15 }, { id: 'feed', h: 0.85 }, { id: 'radio', h: 0.7 }] },
    { w: 0.95, items: [{ id: 'duel', h: 1 }, { id: 'analysis', h: 1.2 }, { id: 'extra', h: 0.55 }] },
  ] } : { cols: [
    { w: 1.6, items: [{ id: 'tower', h: 1 }] },
    { w: 1, items: [{ id: 'map', h: 1.2 }, { id: 'feed', h: 0.75 }, { id: 'radio', h: 0.75 }] },
    { w: 0.95, items: [{ id: 'duel', h: 0.85 }, { id: 'analysis', h: 1.1 }, { id: 'extra', h: 0.85 }] },
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
    }).map((it) => ({ id: it.id, h: Number(it.h) > 0 ? Number(it.h) : 1 })),
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
  for (const c of l.cols) fit(c.items, 'h');
  return l;
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
  ['tower', 'Classement'], ['map', 'Carte'], ['feed', 'Course'], ['duel', 'Duel'],
  ['analysis', 'Analyse'], ['extra', 'Stratégie'], ['radio', 'Radios'],
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
const SIMPLE_TABS = ['tower', 'map', 'feed', 'radio'];

export function showMobilePanel(id) {
  mobTab = id;
  storageSet(MOB_KEY, id);
  render(true);
}

function renderMobile(grid) {
  grid.classList.remove('custom', 'has-max', 'free');
  for (const p of PANELS) clearFree(panelEl(p.id));
  grid.classList.add('mobile');
  const tabs = MOB_TABS.filter(([id]) => isVisible(id) && (!simple() || SIMPLE_TABS.includes(id)));
  if (!tabs.some(([id]) => id === mobTab)) mobTab = tabs[0]?.[0] || 'tower';
  for (const p of PANELS) {
    const el = panelEl(p.id);
    el.style.flex = '';
    el.classList.remove('maximized');
    el.classList.toggle('hidden-panel', p.id !== mobTab || !isVisible(p.id));
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
    const sumH = items.reduce((t, it) => t + it.h, 0) || 1;
    col._model = c;
    items.forEach((it, j) => {
      if (j) {
        const sh = document.createElement('div');
        sh.className = 'lsplit-h';
        sh.title = 'Glisser pour redimensionner les panneaux';
        splitter(sh, 'y', items[j - 1], it);
        col.appendChild(sh);
      }
      const el = panelEl(it.id);
      el.style.flex = `${(it.h * items.length) / sumH} 1 0`;
      el._model = it;
      col.appendChild(el);
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
const FREE_GAP = 6;     // écart laissé entre deux panneaux aimantés (px)
const SNAP = 12;        // distance d'aimantation (px)

function clearFree(el) {
  if (!el._free) return;
  for (const k of ['position', 'left', 'top', 'width', 'height', 'zIndex']) el.style[k] = '';
  el.querySelector(':scope > .fr-rs')?.remove();
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
      const rs = document.createElement('div');
      rs.className = 'fr-rs';
      rs.title = 'Glisser pour redimensionner';
      rs.addEventListener('pointerdown', (e) => freeDrag(id, e, 'resize'));
      el.appendChild(rs);
    }
    grid.insertBefore(el, stash);
  }
  if (!ids.length) {
    const note = document.createElement('div');
    note.className = 'lcol note';
    note.textContent = isMain ? 'Tous les panneaux sont masqués ou ouverts dans une autre fenêtre.' : 'Fenêtre vide.';
    grid.insertBefore(note, stash);
  }
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
  // Bords auxquels s'aimanter : zone des panneaux et autres panneaux visibles
  const others = PANELS.map((p) => p.id).filter((x) => x !== id && isVisible(x)).map((x) => panelEl(x).getBoundingClientRect());
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
      const right = snap(Math.min(g.right, Math.max(r0.left + MIN_W, r0.right + dx)), xs);
      const bottom = snap(Math.min(g.bottom, Math.max(r0.top + MIN_H, r0.bottom + dy)), ys);
      rect = { left: r0.left, top: r0.top, width: right - r0.left, height: bottom - r0.top };
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
  for (const p of $$('.panel.maximized')) p.classList.remove('maximized');
  $('.grid').classList.remove('has-max');
}

function maximize(id) {
  const el = panelEl(id);
  const was = el.classList.contains('maximized');
  unmaximize();
  if (!was) {
    el.classList.add('maximized');
    $('.grid').classList.add('has-max');
  }
}

// Fenêtre mise au premier plan (application de bureau : aussi si elle est réduite)
function focusSelf() {
  if (window.f1desktop?.focusWindow) window.f1desktop.focusWindow();
  else window.focus();
}

// Ouvre un panneau en grand (barre latérale) : réaffiché s'il était masqué. S'il est dans une
// autre fenêtre (second écran), c'est cette fenêtre qui l'affiche en grand et passe devant :
// renvoie alors 'elsewhere'.
export function showPanelLarge(id) {
  if (!isMain) return false;
  const holder = [...others.entries()].find(([, o]) => o.panels.includes(id))?.[0];
  if (holder) {
    channel?.postMessage({ type: 'show', win: holder, panel: id });
    return 'elsewhere';
  }
  if (prefs.hiddenPanels.includes(id)) setPref('hiddenPanels', prefs.hiddenPanels.filter((p) => p !== id));
  if (mobile()) { showMobilePanel(id); return true; }
  if (!panelEl(id).classList.contains('maximized')) maximize(id);
  return true;
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
}

function switchProfile(next, quiet = false) {
  if (!PROFILES[next] || next === profile) return;
  if (isMain) {
    // Panneaux masqués et colonnes du classement : propres à chaque disposition
    const st = storageGet(PROFILE_KEY, {});
    st[profile] = { hiddenPanels: prefs.hiddenPanels, hiddenCols: prefs.hiddenCols, extraCols: prefs.extraCols };
    storageSet(PROFILE_KEY, st);
    const n = st[next] || PROFILE_DEFAULTS[next];
    profile = next;
    storageSet('paddock.lastProfile', next);
    setPref('hiddenPanels', n.hiddenPanels || []);
    setPref('hiddenCols', n.hiddenCols || []);
    setPref('extraCols', n.extraCols || []);
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
export function initLayout() {
  if (!isMain) {
    document.body.classList.add('solo');
    if (legacyPanel && !allLayouts()[lkey()]) storeLayout(lkey(), layout);
    // Fenêtre secondaire : bascule colonnes / disposition libre (panneaux n'importe où)
    const fb = $('#soloFreeBtn');
    if (fb) {
      fb.hidden = false;
      const sync = () => { fb.classList.toggle('on', !!layout.free); fb.title = layout.free ? 'Disposition libre (cliquer pour ranger les panneaux en colonnes)' : 'Panneaux en colonnes (cliquer pour les placer librement : poignée pour déplacer, coin pour redimensionner)'; };
      fb.addEventListener('click', () => { unmaximize(); setFreeLayout(!layout.free); sync(); toast(layout.free ? 'Disposition libre : glissez la poignée pour déplacer un panneau, son coin pour le redimensionner' : 'Panneaux rangés en colonnes', 2500, layout.free ? 'move' : 'columns'); });
      sync();
    }
  }
  initChannel();
  for (const p of PANELS) {
    const head = panelEl(p.id).querySelector('.panel-head');
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-ctrl';
    ctrl.innerHTML = `<button data-act="drag" class="lgrip" title="Glisser pour déplacer ce panneau (colonnes : à côté, au-dessus, en dessous d'un autre ou échange ; disposition libre : n'importe où)">${icon('grip')}</button>`
      + `<button data-act="max" title="Agrandir / réduire (Échap)">${icon('maximize')}</button>`
      + `<button data-act="pop" title="Envoyer vers une autre fenêtre (second écran) : nouvelle fenêtre ou fenêtre déjà ouverte">${icon('external')}</button>`
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
    if (['hiddenPanels', 'hiddenCols', 'extraCols', 'towerFit'].includes(k)) renderLayoutOptions();
  });
  render(true);
  renderLayoutOptions();
  // Menu « Colonnes » du classement : se ferme au clic ailleurs ou avec Échap
  const colMenu = $('#towerCols');
  if (colMenu) {
    document.addEventListener('pointerdown', (e) => { if (colMenu.open && !colMenu.contains(e.target)) colMenu.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') colMenu.open = false; });
  }
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
  on('events', (events) => { if (events.some(([t]) => t === 'SessionInfo')) checkProfile(); });
  on('prefs', (k) => { if (k === 'layoutMode') checkProfile(); });
  checkProfile();
}

// ---------------- Emplacement des fenêtres enregistré ----------------
// « Enregistrer » garde les dispositions de toutes les fenêtres (panneaux, tailles, mode libre)
// et la place de chaque fenêtre ; « Revenir » remet tout comme au moment de l'enregistrement.
// Application de bureau : la place des fenêtres est gérée par l'application (et peut être reprise
// à chaque lancement) ; navigateur : les fenêtres secondaires sont rouvertes à leur place.
const SNAP_KEY = 'paddock.savedWindows';
export const hasWindowsSnapshot = () => !!storageGet(SNAP_KEY, null)?.layouts;

export async function saveWindowsSnapshot() {
  if (!isMain) return;
  save();
  const layouts = allLayouts();
  const wins = [...others.entries()].map(([win, o]) => ({ win, bounds: o.bounds || null }));
  storageSet(SNAP_KEY, { at: Date.now(), layouts, wins });
  try { await window.f1desktop?.saveWindows?.(layouts); } catch { /* ancienne version */ }
  toast(`Emplacement des fenêtres enregistré (${wins.length + 1} fenêtre${wins.length ? 's' : ''})`, 3500);
}

export async function restoreWindowsSnapshot() {
  if (!isMain) return;
  const snap = storageGet(SNAP_KEY, null);
  if (!snap?.layouts) { toast('Aucun emplacement enregistré'); return; }
  storageSet(LAYOUTS_KEY, snap.layouts);
  unmaximize();
  layout = normalize(snap.layouts[lkey()] || defaultLayout());
  renderKey = '';
  if (window.f1desktop?.restoreWindows) {
    // L'application ferme les fenêtres secondaires et les rouvre à leur place enregistrée
    others.clear();
    await window.f1desktop.restoreWindows();
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
    if (blocked) toast(`${blocked} fenêtre(s) bloquée(s) par le navigateur : autorisez les fenêtres pop-up de Paddock Live`, 5000);
  }
  render(true);
  renderLayoutOptions();
}

// Retour à l'interface par défaut : disposition, panneaux masqués, colonnes du classement ;
// les fenêtres secondaires se ferment (leurs panneaux reviennent dans la fenêtre principale).
export function resetLayout(ask = true) {
  if (!isMain) return;
  if (ask && !window.confirm('Réinitialiser l\'interface ?\n\nDisposition des panneaux et des onglets, panneaux masqués, colonnes du classement et fenêtres secondaires reviennent à l\'état par défaut.')) return;
  channel?.postMessage({ type: 'reset', win: WIN });
  others.clear();
  storageSet(LAYOUTS_KEY, {});
  storageSet(PROFILE_KEY, {});
  storageSet(TABS_KEY, {});
  unmaximize();
  const def = PROFILE_DEFAULTS[profile];
  setPref('hiddenPanels', [...def.hiddenPanels]);
  setPref('hiddenCols', [...def.hiddenCols]);
  setPref('extraCols', []);
  setPref('tabLayout', null);
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
    $('#layoutProfileNow').textContent = `Disposition affichée : « ${PROFILES[profile]} ». Panneaux, tailles, colonnes et onglets ci-dessous s'appliquent à celle-ci.`;
  }
  $('#panelOpts').innerHTML = PANELS.map((p) => `<label class="toggle small"><input type="checkbox" data-panel="${p.id}" ${prefs.hiddenPanels.includes(p.id) ? '' : 'checked'}> ${esc(p.name)}</label>`).join('');
  $('#panelOpts').onchange = (e) => {
    const id = e.target.dataset.panel;
    if (!id) return;
    setPref('hiddenPanels', e.target.checked ? prefs.hiddenPanels.filter((x) => x !== id) : [...prefs.hiddenPanels, id]);
  };
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
