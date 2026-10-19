// Légendes affichées sous chaque panneau : à quoi correspondent les couleurs et les badges.
// Elles changent avec l'onglet actif et se masquent dans Réglages → Apparence.
import { tabOrigin } from './tabmove.js';
import { prefs, setPref } from '../prefs.js';
import { on } from '../store.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { compoundInfo } from '../util.js';

const sw = (color, label, shape = 'bar') => `<span class="lg-i"><i class="lg-${shape}" style="--c:${color}"></i>${label}</span>`;
const tag = (cls, text, label) => `<span class="lg-i"><span class="tag ${cls}">${text}</span>${label}</span>`;
const tyre = (color, letter, label) => `<span class="lg-i"><span class="tyre lg-tyre" style="--tc:${color}">${letter}</span>${label}</span>`;

const L = {
  tower: {
    // Recalculée à chaque affichage : couleurs des pneus selon l'apparence (sombre / claire)
    get _() { return [
      sw('var(--purple)', 'meilleur de tous'), sw('var(--green)', 'record perso'), sw('var(--yellow)', 'plus lent'), sw('var(--blue)', 'stands'),
      tag('pit', 'STAND', 'aux stands'), tag('out', 'SORTIE', 'sort des stands'), tag('push', 'TOUR', 'tour rapide'), tag('ret', 'ABD', 'abandon'),
      tyre(compoundInfo('SOFT').color, 'S', 'tendre'), tyre(compoundInfo('MEDIUM').color, 'M', 'médium'), tyre(compoundInfo('HARD').color, 'H', 'dur'), tyre(compoundInfo('INTERMEDIATE').color, 'I', 'intermédiaire'), tyre(compoundInfo('WET').color, 'W', 'pluie'),
    ]; },
  },
  map: {
    _: [sw('#3cc86e', 'ligne droite', 'dash'), sw('#ff4fd8', 'détection'), sw('#3ce08a', 'activation'), sw('#4a4a55', 'voie des stands')],
  },
  duel: {
    _: [sw('var(--blue)', 'pilote A'), sw('var(--orange)', 'pilote B')],
  },
  analysis: {
    compare: [sw('var(--blue)', 'pilote A plus rapide'), sw('var(--orange)', 'pilote B plus rapide')],
  },
};

const PANEL_IDS = ['tower', 'map', 'feed', 'radio', 'duel', 'analysis', 'extra'];

function update(panel, id) {
  let el = panel.querySelector(':scope > .panel-legend');
  if (!prefs.legends) { el?.remove(); return; }
  const tab = panel.querySelector('.panel-head [data-tab].active')?.dataset.tab || '_';
  // Onglet venu d'un autre panneau : sa légende le suit
  const items = L[id]?.[tab] || L[tabOrigin(tab)]?.[tab] || L[id]?._;
  if (!items) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'panel-legend';
    el.classList.toggle('compact', panel.getBoundingClientRect().height < COMPACT_H && !panel.closest('.grid.mobile'));
    panel.appendChild(el);
  }
  const html = `<button class="lg-more" title="Afficher la légende de ce panneau">${icon('info')} Légende</button><div class="lg-body">${items.join('')}</div><button class="lg-hide" title="Masquer les légendes">${icon('close')} Masquer</button>`;
  const k = `${id}|${tab}|${document.documentElement.dataset.scheme}`;
  if (el.dataset.k !== k) { el.innerHTML = html; el.dataset.k = k; }
}

// Panneau trop court : la légende se replie en un bouton « Légende » (déroulée par-dessus le
// contenu au clic) pour laisser la place aux graphiques et aux tableaux
const COMPACT_H = 420;
const sizes = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target.querySelector(':scope > .panel-legend');
    const compact = e.contentRect.height < COMPACT_H && !e.target.closest('.grid.mobile');
    if (el && el.classList.contains('compact') !== compact) { el.classList.toggle('compact', compact); el.classList.remove('open'); }
  }
});

function updateAll() {
  for (const id of PANEL_IDS) {
    const panel = document.querySelector(`.panel.p-${id}`);
    if (panel) update(panel, id);
  }
}

export function initLegends() {
  for (const id of PANEL_IDS) {
    const panel = document.querySelector(`.panel.p-${id}`);
    panel?.querySelector('.panel-head')?.addEventListener('click', (e) => { if (e.target.closest('[data-tab]')) setTimeout(() => update(panel, id), 0); });
    if (panel) sizes.observe(panel);
  }
  on('prefs', (k) => { if (k === 'legends') updateAll(); });
  on('scheme', () => updateAll());
  on('tabsMoved', () => updateAll());
  document.addEventListener('click', (e) => {
    const more = e.target.closest('.lg-more');
    if (more) { more.parentElement.classList.toggle('open'); return; }
    // Légende déroulée : se replie au clic ailleurs
    for (const open of document.querySelectorAll('.panel-legend.open')) if (!open.contains(e.target)) open.classList.remove('open');
    if (!e.target.closest('.lg-hide')) return;
    setPref('legends', false);
    toast('Légendes masquées (Réglages → Apparence pour les remettre)', 6000);
  });
  updateAll();
}

export function legendsToggle(checkbox) {
  checkbox.checked = prefs.legends;
  checkbox.addEventListener('change', () => setPref('legends', checkbox.checked));
  on('prefs', (k) => { if (k === 'legends') checkbox.checked = prefs.legends; });
}

