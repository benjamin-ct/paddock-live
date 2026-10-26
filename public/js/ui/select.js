// Listes déroulantes aux couleurs de l'application. Le <select> d'origine reste en place
// (valeur, évènements « change », code existant inchangé) ; seule la liste qui s'ouvre est
// remplacée par un menu dessiné ici, à la place de celle de Windows (blanche et bleue).
// Sur écran tactile, on garde le sélecteur natif du téléphone, plus pratique au doigt.
const coarse = matchMedia('(pointer: coarse)');
const usePopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

let pop = null;       // menu ouvert
let sel = null;       // <select> correspondant
let items = [];       // [{ el, opt }]
let active = -1;
let typed = '';
let typedAt = 0;

const eligible = (s) => s instanceof HTMLSelectElement && !s.multiple && s.size <= 1 && !s.disabled && !coarse.matches;

function setActive(i, scroll = true) {
  if (!items.length) return;
  active = Math.max(0, Math.min(items.length - 1, i));
  items.forEach((it, k) => it.el.classList.toggle('active', k === active));
  if (scroll) items[active].el.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  const s = sel;
  const it = items[i];
  close();
  if (!s || !it || it.opt.disabled) return;
  if (s.value !== it.opt.value || s.selectedIndex !== it.opt.index) {
    s.selectedIndex = it.opt.index;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  s.focus({ preventScroll: true });
}

function close() {
  if (!pop) return;
  if (usePopover) try { pop.hidePopover(); } catch { /* déjà fermé */ }
  pop.remove();
  sel?.classList.remove('csel-open');
  pop = null;
  sel = null;
  items = [];
  active = -1;
}

function open(s) {
  close();
  sel = s;
  pop = document.createElement('div');
  pop.className = 'csel-pop';
  pop.setAttribute('role', 'listbox');
  if (usePopover) pop.popover = 'manual';
  const add = (opt, inGroup) => {
    if (opt.hidden) return;
    const el = document.createElement('div');
    el.className = `csel-opt${inGroup ? ' in-group' : ''}${opt.disabled ? ' disabled' : ''}${opt.selected ? ' sel' : ''}`;
    el.setAttribute('role', 'option');
    const label = opt.label || opt.text;
    if (opt.dataset.mark === undefined) el.textContent = label;
    else {
      // Pilote : repère d'écurie (écrit par l'appli, util.js driverOpt), numéro, nom
      el.classList.add('drv');
      el.innerHTML = opt.dataset.mark;
      const num = document.createElement('b'), name = document.createElement('span');
      num.className = 'csel-num';
      num.textContent = opt.dataset.num || '';
      name.textContent = label;
      el.append(num, name);
    }
    if (opt.title) el.title = opt.title;
    el.dataset.i = items.length;
    items.push({ el, opt });
    pop.appendChild(el);
  };
  for (const child of s.children) {
    if (child.tagName === 'OPTGROUP') {
      const g = document.createElement('div');
      g.className = 'csel-group';
      g.textContent = child.label;
      pop.appendChild(g);
      for (const o of child.children) add(o, true);
    } else if (child.tagName === 'OPTION') add(child, false);
  }
  if (!items.length) { pop = null; sel = null; return; }
  // Dans une fenêtre modale (Réglages), le menu doit en faire partie pour rester cliquable ;
  // « popover » le place au premier plan, au-dessus de tout le reste
  (s.closest('dialog[open]') || document.body).appendChild(pop);
  if (usePopover) pop.showPopover();
  s.classList.add('csel-open');

  const r = s.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  pop.style.minWidth = `${Math.round(r.width)}px`;
  const below = vh - r.bottom - 8, above = r.top - 8;
  const want = Math.min(pop.scrollHeight, 360);
  const up = below < want && above > below;
  pop.style.maxHeight = `${Math.max(120, Math.min(360, up ? above : below))}px`;
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(6, Math.min(r.left, vw - w - 6))}px`;
  pop.style.top = up ? `${Math.max(6, r.top - 4 - pop.offsetHeight)}px` : `${r.bottom + 4}px`;

  setActive(items.findIndex((it) => it.opt.selected), true);
  pop.addEventListener('mousemove', (e) => { const el = e.target.closest('.csel-opt'); if (el && !el.classList.contains('disabled')) setActive(Number(el.dataset.i), false); });
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', (e) => { const el = e.target.closest('.csel-opt'); if (el && !el.classList.contains('disabled')) choose(Number(el.dataset.i)); });
}

function onKey(e) {
  if (pop) {
    const step = (d) => {
      let i = active;
      do { i += d; } while (items[i]?.opt.disabled);
      if (items[i]) setActive(i);
    };
    const keys = {
      ArrowDown: () => step(1), ArrowUp: () => step(-1), Home: () => setActive(0), End: () => setActive(items.length - 1),
      PageDown: () => setActive(active + 8), PageUp: () => setActive(active - 8),
      Enter: () => choose(active), ' ': () => choose(active), Escape: () => { const s = sel; close(); s?.focus(); }, Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      e.stopPropagation();
      keys[e.key]();
      return;
    }
    // Saisie de lettres : aller à l'option correspondante
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      typed = Date.now() - typedAt > 800 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = Date.now();
      const i = items.findIndex((it) => !it.opt.disabled && (it.opt.label || it.opt.text).toLowerCase().startsWith(typed));
      if (i >= 0) setActive(i);
    }
    return;
  }
  const s = e.target;
  if (s?.tagName === 'SELECT' && eligible(s) && (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) {
    e.preventDefault();
    e.stopPropagation();
    open(s);
  }
}

export function initSelects() {
  document.addEventListener('mousedown', (e) => {
    if (pop && pop.contains(e.target)) return;
    // Liste, ou intitulé de la case qui la contient (« Pilotes [Tous] »)
    const s = e.target.closest?.('select') || (e.target.tagName === 'LABEL' ? e.target.querySelector(':scope > select') : null);
    if (s && e.button === 0 && eligible(s)) {
      e.preventDefault();
      s.focus({ preventScroll: true });
      if (sel === s) close(); else open(s);
      return;
    }
    close();
  }, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) close(); }, true);
}
