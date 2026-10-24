// Onglets déplaçables : chaque onglet d'un panneau (avec son contenu) peut être glissé vers un
// autre panneau à onglets, ou à une autre place dans le sien. La disposition des onglets est
// mémorisée et suivie par toutes les fenêtres (préférence tabLayout).
import { prefs, setPref } from '../prefs.js';
import { store, on, emit } from '../store.js';
import { $, sessionKind } from '../util.js';
import { toast } from './delay.js';

// Onglets proches réunis sous un seul onglet de la barre (le premier de la liste) : les autres sont
// choisis par un sélecteur en haut de leur contenu, et suivent l'onglet principal s'il est déplacé.
const GROUPS = { trace: ['trace', 'positions'], laptimes: ['laptimes', 'pace'], rcm: ['rcm', 'stewards', 'tracklimits'] };
const SEG = { trace: 'Écarts', positions: 'Positions', laptimes: 'Tours', pace: 'Rythme', rcm: 'Messages', stewards: 'Enquêtes', tracklimits: 'Limites de piste' };
const isMember = (t) => Object.values(GROUPS).some((g) => g.indexOf(t) > 0);
// Onglets inutiles selon la séance chargée (masqués, de retour à la séance suivante)
const QUALI_OFF = ['trace', 'positions', 'tyrehist', 'strategy', 'pitsim', 'battles', 'champ'];
const OFF = { race: ['compare'], quali: QUALI_OFF, practice: QUALI_OFF };

const HOSTS = ['feed', 'radio', 'analysis', 'extra'];   // panneaux à onglets
const origin = {};                                      // onglet -> panneau d'origine
const defaults = {};                                    // panneau -> onglets d'origine (ordre)

const panel = (id) => document.querySelector(`.panel.p-${id}`);
const head = (id) => panel(id)?.querySelector('.panel-head[data-tabs]');
const body = (id) => panel(id)?.querySelector('.panel-body');
const tabBtn = (t) => document.querySelector(`[data-tabs] [data-tab="${t}"]`);
const pane = (t) => document.querySelector(`.panel-body > [data-pane="${t}"]`);
// Onglets d'un panneau (les onglets regroupés suivent leur onglet principal : non comptés)
const tabsOf = (id) => [...(head(id)?.querySelectorAll(':scope > [data-tab]') || [])].map((b) => b.dataset.tab).filter((t) => !isMember(t));
const shownTabs = (id) => [...(head(id)?.querySelectorAll(':scope > [data-tab]:not([hidden]):not(.sess-off)') || [])];

// Panneau d'origine d'un onglet (légendes, mémoire de l'onglet ouvert…)
export const tabOrigin = (t) => origin[t] || null;

function activate(id, t) {
  const h = head(id), b = body(id);
  if (!h || !b) return;
  for (const x of h.querySelectorAll(':scope > [data-tab]')) x.classList.toggle('active', x.dataset.tab === t);
  for (const p of b.querySelectorAll(':scope > [data-pane]')) p.classList.toggle('active', p.dataset.pane === t);
}

// Après un déplacement : un seul onglet ouvert par panneau, panneau vide signalé
function tidy(id, prefer = null) {
  const h = head(id), b = body(id);
  if (!h || !b) return;
  const tabs = tabsOf(id);
  const active = [...h.querySelectorAll(':scope > [data-tab].active')].map((b) => b.dataset.tab);
  if (prefer && tabs.includes(prefer)) activate(id, prefer);
  else if (active.length !== 1 && tabs.length) activate(id, active[0] || tabs[0]);
  h.classList.toggle('many', shownTabs(id).length > 4);
  let empty = b.querySelector(':scope > .tab-empty');
  if (!tabs.length && !empty) {
    empty = document.createElement('div');
    empty.className = 'tab-empty note';
    empty.textContent = 'Panneau vide : glissez-y un onglet.';
    // Bouton pour masquer le panneau directement (fenêtre principale seulement : voir le CSS)
    const hide = document.createElement('button');
    hide.className = 'btn small';
    hide.textContent = 'Masquer ce panneau';
    hide.addEventListener('click', () => panel(id)?.querySelector('.panel-ctrl [data-act="hide"]')?.click());
    empty.append(document.createElement('br'), hide);
    b.appendChild(empty);
  }
  if (tabs.length) empty?.remove();
}

function place(t, id, before = null) {
  const btn = tabBtn(t), p = pane(t), h = head(id), b = body(id);
  if (!btn || !p || !h || !b) return;
  const ref = before && before !== t ? tabBtn(before) : null;
  h.insertBefore(btn, ref && ref.parentElement === h ? ref : h.querySelector(':scope > .panel-ctrl'));
  // Contenu déjà dans ce panneau : laissé en place (le déplacer remettrait sa liste en haut et
  // rejouerait ses animations, ex. toute la Direction de course)
  if (p.parentElement !== b) b.appendChild(p);
  follow(t);
}

// Onglets regroupés : juste après leur onglet principal, dans le même panneau
function follow(t) {
  const btn = tabBtn(t), h = btn?.parentElement, b = pane(t)?.parentElement;
  if (!h || !b) return;
  let after = btn;
  for (const m of GROUPS[t]?.slice(1) || []) {
    const mb = tabBtn(m), mp = pane(m);
    if (!mb || !mp) continue;
    if (after.nextElementSibling !== mb) h.insertBefore(mb, after.nextElementSibling);
    if (mp.parentElement !== b) b.appendChild(mp);
    after = mb;
  }
}

function apply(layout) {
  const want = {};
  for (const id of HOSTS) want[id] = [];
  const used = new Set();
  for (const id of HOSTS) {
    for (const t of layout?.[id] || []) if (origin[t] && !used.has(t) && !isMember(t)) { want[id].push(t); used.add(t); }
  }
  // Onglets absents de la disposition (nouveaux) : à leur place d'origine
  for (const id of HOSTS) for (const t of defaults[id]) if (!used.has(t)) want[id].push(t);
  // Seuls les panneaux dont les onglets changent sont touchés (la disposition enregistrée après un
  // glisser-déposer est déjà celle affichée : rien ne bouge)
  const changed = HOSTS.filter((id) => tabsOf(id).join() !== want[id].join());
  if (!changed.length) return;
  for (const id of changed) for (const t of want[id]) place(t, id);
  for (const id of HOSTS) tidy(id);
  emit('tabsMoved');
}

function current() {
  const out = {};
  for (const id of HOSTS) out[id] = tabsOf(id);
  return out;
}

const isDefault = (l) => HOSTS.every((id) => (l[id] || []).join() === defaults[id].join());

function save() {
  const l = current();
  setPref('tabLayout', isDefault(l) ? null : l);
}

// ---------- Glisser-déposer ----------
let drag = null;

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const pnl = el?.closest('.panel');
  const id = HOSTS.find((h) => pnl?.classList.contains(`p-${h}`));
  if (!id || !head(id)) return null;
  // Place : avant le premier onglet dont le milieu est à droite du pointeur (même ligne)
  const tabs = [...head(id).querySelectorAll(':scope > [data-tab]')].filter((b) => b !== drag.btn && b.offsetParent);
  let before = null;
  for (const b of tabs) {
    const r = b.getBoundingClientRect();
    if (y < r.bottom && (y < r.top || x < r.left + r.width / 2)) { before = b; break; }
  }
  return { id, before };
}

function showMarker(t) {
  let m = drag.marker;
  if (!t) { m.hidden = true; return; }
  const h = head(t.id);
  const ref = t.before?.getBoundingClientRect();
  const tabs = [...h.querySelectorAll(':scope > [data-tab]')].filter((b) => b !== drag.btn && b.offsetParent);
  const last = tabs.at(-1)?.getBoundingClientRect();
  const hr = h.getBoundingClientRect();
  const x = ref ? ref.left - 3 : last ? last.right + 3 : hr.left + 12;
  const r = ref || last || { top: hr.top + 8, height: hr.height - 16 };
  Object.assign(m.style, { left: `${x - 1}px`, top: `${r.top}px`, height: `${r.height}px` });
  m.hidden = false;
  for (const id of HOSTS) panel(id)?.classList.toggle('tab-drop', id === t.id);
}

function endDrag(commit) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost?.remove();
  d.marker?.remove();
  document.body.classList.remove('tab-dragging');
  for (const id of HOSTS) panel(id)?.classList.remove('tab-drop');
  if (!commit || !d.target) return;
  const t = d.btn.dataset.tab;
  const from = HOSTS.find((h) => head(h)?.contains(d.btn));
  place(t, d.target.id, d.target.before?.dataset.tab || null);
  tidy(d.target.id, t);
  if (from && from !== d.target.id) tidy(from);
  save();
  emit('tabsMoved');
  if (from !== d.target.id) toast(`Onglet « ${d.btn.textContent.trim()} » déplacé.`, 3500, 'move');
}

function onDown(e) {
  const btn = e.target.closest('.panel-head[data-tabs] > [data-tab]');
  if (!btn || e.button !== 0 || window.innerWidth <= 900) return;
  const sx = e.clientX, sy = e.clientY;
  const move = (ev) => {
    if (!drag) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      drag = { btn, target: null };
      drag.ghost = btn.cloneNode(true);
      drag.ghost.className = 'tab active tab-ghost';
      drag.marker = document.createElement('div');
      drag.marker.className = 'tab-marker';
      drag.marker.hidden = true;
      document.body.append(drag.ghost, drag.marker);
      document.body.classList.add('tab-dragging');
    }
    drag.ghost.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 8}px)`;
    drag.target = dropTarget(ev.clientX, ev.clientY);
    showMarker(drag.target);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', esc);
    if (!drag) return;
    // Le clic qui suit le relâchement ne doit pas ouvrir l'onglet de départ. Aucun clic quand le
    // relâchement a lieu ailleurs : le blocage s'arrête aussitôt (sinon le clic suivant serait perdu).
    const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 50);
    endDrag(true);
  };
  const esc = (ev) => { if (ev.key === 'Escape') endDrag(false); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', esc);
}

// ---------- Onglets regroupés ----------
function buildGroups() {
  for (const list of Object.values(GROUPS)) {
    for (const t of list.slice(1)) {
      const b = tabBtn(t);
      if (b) { b.hidden = true; b.classList.add('tab-member'); }
    }
    for (const t of list) {
      const p = pane(t);
      if (!p || p.querySelector('.tab-seg')) continue;
      const seg = document.createElement('div');
      seg.className = 'tab-seg';
      seg.innerHTML = list.map((x) => `<button type="button" data-seg="${x}" class="${x === t ? 'on' : ''}">${SEG[x]}<span class="tab-badge" hidden></span></button>`).join('');
      seg.addEventListener('click', (e) => {
        const s = e.target.closest('[data-seg]');
        if (s && s.dataset.seg !== t) tabBtn(s.dataset.seg)?.click();
      });
      const bar = p.querySelector(':scope > .subbar');
      if (bar) bar.prepend(seg);
      else { seg.classList.add('alone'); p.prepend(seg); }
    }
  }
  // Pastilles des onglets regroupés (enquêtes, limites de piste) recopiées dans les sélecteurs
  const badges = () => {
    for (const s of document.querySelectorAll('.tab-seg [data-seg]')) {
      const src = tabBtn(s.dataset.seg)?.querySelector('.tab-badge');
      const dst = s.querySelector('.tab-badge');
      if (!src) continue;
      dst.hidden = src.hidden;
      dst.textContent = src.textContent;
    }
  };
  const mo = new MutationObserver(badges);
  for (const b of document.querySelectorAll('[data-tabs] .tab-badge')) mo.observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
  badges();
  // Onglet principal marqué ouvert quand un de ses onglets regroupés l'est
  const sync = () => {
    for (const [main, list] of Object.entries(GROUPS)) {
      tabBtn(main)?.classList.toggle('group-on', list.slice(1).some((m) => tabBtn(m)?.classList.contains('active')));
    }
  };
  const co = new MutationObserver(sync);
  for (const list of Object.values(GROUPS)) for (const t of list) if (tabBtn(t)) co.observe(tabBtn(t), { attributes: true, attributeFilter: ['class'] });
  sync();
}

// ---------- Onglets selon la séance ----------
function applySession() {
  const off = new Set(store.state.SessionInfo ? OFF[sessionKind(store.state)] || [] : []);
  for (const b of document.querySelectorAll('[data-tabs] > [data-tab]')) {
    const t = b.dataset.tab;
    const list = GROUPS[t];
    b.classList.toggle('sess-off', list ? list.every((x) => off.has(x)) : off.has(t));
  }
  for (const s of document.querySelectorAll('.tab-seg [data-seg]')) s.hidden = off.has(s.dataset.seg);
  for (const id of HOSTS) {
    const h = head(id);
    if (!h) continue;
    const cur = h.querySelector(':scope > [data-tab].active');
    const t = cur?.dataset.tab;
    if (!t || !off.has(t)) continue;
    // Onglet ouvert masqué : un autre onglet du même regroupement, sinon le premier onglet affiché
    const main = Object.keys(GROUPS).find((g) => GROUPS[g].includes(t));
    const alt = main && GROUPS[main].find((x) => !off.has(x));
    (alt ? tabBtn(alt) : shownTabs(id)[0])?.click();
  }
  for (const id of HOSTS) head(id)?.classList.toggle('many', shownTabs(id).length > 4);
}

export function resetTabs() {
  setPref('tabLayout', null);
}

export function initTabMove() {
  buildGroups();
  for (const id of HOSTS) {
    defaults[id] = tabsOf(id);
    for (const b of head(id)?.querySelectorAll(':scope > [data-tab]') || []) origin[b.dataset.tab] = id;
  }
  if (prefs.tabLayout) apply(prefs.tabLayout);
  // Disposition d'une version précédente (onglet regroupé déplacé seul) : il rejoint son onglet principal
  for (const t of Object.keys(GROUPS)) follow(t);
  for (const id of HOSTS) tidy(id);
  // Disposition changée dans les réglages : ses onglets rouverts (layout.js) sont filtrés ensuite
  on('prefs', (k) => { if (k === 'tabLayout') apply(prefs.tabLayout); if (k === 'layoutMode') setTimeout(applySession, 0); });
  applySession();
  on('reset', applySession);
  on('events', (events) => { if (events.some(([t]) => t === 'SessionInfo' || t === '__snapshot')) setTimeout(applySession, 0); });
  document.addEventListener('pointerdown', onDown);
  $('#tabsReset')?.addEventListener('click', () => { resetTabs(); toast('Onglets remis à leur place d\'origine', 2500, 'check'); });
}
