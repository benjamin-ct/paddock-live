// Barre du haut, menus façon MultiViewer : documents officiels de la FIA, vitesses de chaque
// pilote (intermédiaires, ligne d'arrivée, speed trap) et meilleurs secteurs (tour idéal).
import { store, f1Now } from '../store.js';
import { $, esc, api, drivers, orderedNumbers, teamMark, lapSeconds, fmtLap, storageGet, storageSet } from '../util.js';
import { docSummaryFr } from '/shared/fia-docs-fr.js';
import { parseFiaDoc } from '/shared/stewards.js';
import { fiaState } from './feed.js';
import { icon } from '../icons.js';
import { LOCALE, EN } from '../i18n.js';
import { gpFull } from '/shared/gp-names.js';
import { pdfHref } from './pdf-view.js';

let open = null;      // outil ouvert : 'docs' | 'speeds' | 'sectors' | 'weather'
let pop = null;
let timer = 0;
let lastHtml = '';
let filter = '';
const sort = { speeds: { k: 'ST', dir: -1 }, sectors: { k: 'ideal', dir: 1 } };
let speedMode = 'best';   // 'best' : meilleures vitesses de la séance ; 'last' : dernier passage

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));

// Documents d'un autre Grand Prix de la saison (choisi dans la liste) : chargés une fois, et ceux de
// tous les Grands Prix déjà commencés lus d'avance, l'un après l'autre (liste aussitôt affichée)
let docGp = '';       // '' : Grand Prix de la séance affichée
let races = null;     // Grands Prix déjà commencés de la saison, du plus récent au plus ancien
const otherDocs = new Map();
function loadRaces() {
  if (races) return;
  races = [];
  const year = new Date().getFullYear();
  api(`/api/schedule?year=${year}`).then((d) => {
    races = d.races.filter((r) => r.sessions.some((s) => Date.parse(s.t) < Date.now())).reverse().map((r) => ({ name: r.name, locality: r.locality || '', year }));
    render(true);
    (async () => { for (const r of races) await otherState(r).job; })();
  }).catch(() => { races = null; });
}
function otherState(r) {
  let o = otherDocs.get(r.name);
  if (!o) {
    o = { key: r.name, docs: [], loading: true };
    otherDocs.set(r.name, o);
    o.job = api(`/api/fia-docs?${new URLSearchParams({ year: r.year, name: r.name, location: r.locality, country: '' })}`)
      .then((x) => { o.docs = x.docs || []; o.page = x.page; })
      .catch((err) => { o.error = err.message; otherDocs.delete(r.name); })
      .finally(() => { o.loading = false; if (docGp === r.name) render(true); });
  }
  return o;
}

// Documents publiés avant l'instant affiché (pas de spoiler en replay ni avec le délai TV) ;
// all = false : Grand Prix de la séance seulement (point de nouveauté sur l'icône)
function visibleDocs(all = true) {
  const current = store.state.SessionInfo?.Meeting?.Name;
  const r = all && docGp && docGp !== current ? races?.find((x) => x.name === docGp) : null;
  if (r) { const f = otherState(r); return { f, docs: f.docs || [] }; }
  const f = fiaState();
  const now = f1Now();
  return { f, docs: (f.docs || []).filter((d) => !d.published || d.published <= now + 60000) };
}

function docsHtml() {
  const { f, docs } = visibleDocs();
  const dl = drivers(store.state);
  const tlaOf = new Map(Object.values(dl).map((d) => [String(d.RacingNumber), d.Tla]));
  const q = filter.trim().toLowerCase();
  const rows = docs.map((d) => {
    const sum = docSummaryFr(d.title);
    const cars = parseFiaDoc(d).cars.map((n) => tlaOf.get(n)).filter(Boolean);
    return { d, sum, cars };
  }).filter(({ d, sum, cars }) => !q || `${d.title} ${sum.text} ${cars.join(' ')}`.toLowerCase().includes(q));
  const time = (ms) => {
    if (!ms) return '';
    const t = new Date(ms);
    return t.toLocaleString(LOCALE, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  };
  loadRaces();
  const current = store.state.SessionInfo?.Meeting?.Name || '';
  const choices = [['', current ? `${gpFull(current, EN)} (séance affichée)` : 'Grand Prix de la séance'], ...(races || []).filter((r) => r.name !== current).map((r) => [r.name, gpFull(r.name, EN)])];
  const gpSel = `<select id="tbDocGp" aria-label="Grand Prix">${choices.map(([v, l]) => `<option value="${esc(v)}"${v === (docGp === current ? '' : docGp) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const body = rows.length ? rows.map(({ d, sum, cars }) => `<div class="tbd-doc">
      <div class="tbd-main"><div class="tbd-title">${esc(d.title)}</div>
        <div class="tbd-sum">${cars.length ? `<b>${esc(cars.join(', '))}</b> · ` : ''}${esc(sum.text)}</div></div>
      <span class="tbd-time">${esc(time(d.published))}</span>
      <a class="tbd-dl" href="${esc(pdfHref(d.url))}" data-pdf="${esc(d.title)}" target="_blank" rel="noopener" title="Afficher le PDF">${icon('doc', 'ic-s')}</a></div>`).join('')
    : `<div class="note">${f.loading && !f.docs?.length ? 'Chargement des documents…' : f.error ? `Documents indisponibles : ${esc(f.error)}` : q ? 'Aucun document ne correspond.' : 'Aucun document publié pour l\'instant.'}</div>`;
  return `<div class="tbp-head"><b>Documents FIA</b>${gpSel}<span class="muted small">${docs.length} document${docs.length > 1 ? 's' : ''}</span>
      ${f.page ? `<a class="small" href="${esc(f.page)}" target="_blank" rel="noopener">fia.com ${icon('external', 'ic-s')}</a>` : ''}</div>
    <input class="tbp-filter" id="tbDocFilter" type="search" placeholder="Filtrer (pilote, convocation, classement…)" value="${esc(filter)}">
    <div class="tbp-scroll">${body}</div>`;
}

// Tableau triable : cols = [[clé, libellé, title]], rows = [{ num, cells: {clé: {v, html, best}} }]
function table(tool, cols, rows, defaultDir) {
  const st = sort[tool];
  const val = (r) => r.cells[st.k]?.v;
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
    if (vb === null || vb === undefined) return -1;
    return (va - vb) * st.dir;
  });
  const dl = drivers(store.state);
  return `<table class="tbp-table"><thead><tr><th>Pilote</th>${cols.map(([k, label, title]) => `<th data-sort="${k}" data-dir="${defaultDir(k)}" class="${st.k === k ? 'sorted' : ''}" title="${esc(title || '')}">${esc(label)}${st.k === k ? icon(st.dir > 0 ? 'chevron-up' : 'chevron-down', 'ic-s') : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => {
      const d = dl[r.num] || {};
      return `<tr><td><span class="drv">${teamMark(d)}<b>${esc(d.Tla || r.num)}</b></span></td>${cols.map(([k]) => {
        const c = r.cells[k];
        return `<td class="${c?.best ? 'purple' : ''}">${c?.html ?? '<span class="dim">—</span>'}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>`;
}

function speedsHtml() {
  const s = store.state;
  const nums = orderedNumbers(s).filter((n) => drivers(s)[n]);
  const stats = s.TimingStats?.Lines || {};
  const lines = s.TimingData?.Lines || {};
  const keys = [['I1', 'Intermédiaire 1'], ['I2', 'Intermédiaire 2'], ['FL', 'Ligne d\'arrivée'], ['ST', 'Speed trap']];
  const top = {};
  for (const [k] of keys) top[k] = Math.max(0, ...nums.map((n) => Number((speedMode === 'best' ? stats[n]?.BestSpeeds?.[k] : lines[n]?.Speeds?.[k])?.Value) || 0));
  const rows = nums.map((n) => ({
    num: n,
    cells: Object.fromEntries(keys.map(([k]) => {
      const src = speedMode === 'best' ? stats[n]?.BestSpeeds?.[k] : lines[n]?.Speeds?.[k];
      const v = Number(src?.Value) || null;
      return [k, v ? { v, html: String(v), best: speedMode === 'best' ? src?.Position === 1 || v === top[k] : src?.OverallFastest } : null];
    })),
  }));
  return `<div class="tbp-head"><b>Vitesses</b><span class="muted small">km/h · clic sur une colonne pour trier</span>
      <span class="tbp-seg"><button data-mode="best" class="${speedMode === 'best' ? 'on' : ''}">Meilleures</button><button data-mode="last" class="${speedMode === 'last' ? 'on' : ''}">Dernier passage</button></span></div>
    <div class="tbp-scroll">${table('speeds', keys.map(([k, t]) => [k, { I1: 'Secteur 1', I2: 'Secteur 2', FL: 'Arrivée', ST: 'Speed trap' }[k], t]), rows, () => -1)}</div>`;
}

function sectorsHtml() {
  const s = store.state;
  const nums = orderedNumbers(s).filter((n) => drivers(s)[n]);
  const stats = s.TimingStats?.Lines || {};
  const per = nums.map((n) => list(stats[n]?.BestSectors).slice(0, 3).map((b) => ({ v: lapSeconds(b?.Value), raw: b?.Value, pos: b?.Position })));
  const best = [0, 1, 2].map((i) => Math.min(...per.map((p) => p[i]?.v || Infinity)));
  const ideals = per.map((p) => (p.length === 3 && p.every((x) => x.v) ? p.reduce((a, x) => a + x.v, 0) : null));
  const bestIdeal = Math.min(...ideals.filter(Boolean), Infinity);
  const rows = nums.map((n, j) => ({
    num: n,
    cells: {
      ...Object.fromEntries([0, 1, 2].map((i) => {
        const x = per[j][i];
        if (!x?.v) return [`s${i}`, null];
        const gap = x.v - best[i];
        return [`s${i}`, { v: x.v, best: x.pos === 1 || gap < 0.0005, html: `${esc(x.raw)}${gap >= 0.0005 ? `<small>+${gap.toFixed(3)}</small>` : ''}` }];
      })),
      ideal: ideals[j] ? { v: ideals[j], best: ideals[j] - bestIdeal < 0.0005, html: `${fmtLap(ideals[j])}${ideals[j] - bestIdeal >= 0.0005 ? `<small>+${(ideals[j] - bestIdeal).toFixed(3)}</small>` : ''}` } : null,
    },
  }));
  return `<div class="tbp-head"><b>Meilleurs secteurs</b><span class="muted small">meilleur temps de chaque pilote dans la séance · violet = meilleur de tous</span></div>
    <div class="tbp-scroll">${table('sectors', [['s0', 'Secteur 1'], ['s1', 'Secteur 2'], ['s2', 'Secteur 3'], ['ideal', 'Tour idéal', 'Somme des trois meilleurs secteurs du pilote']], rows, () => 1)}</div>`;
}

function render(force = false) {
  if (!pop || open === 'weather') return;
  const html = open === 'docs' ? docsHtml() : open === 'speeds' ? speedsHtml() : sectorsHtml();
  if (!force && html === lastHtml) return;
  // Le champ de filtre garde le focus et la position du curseur
  const fe = document.activeElement?.id === 'tbDocFilter' ? document.activeElement.selectionStart : null;
  const scroll = pop.querySelector('.tbp-scroll')?.scrollTop || 0;
  lastHtml = html;
  pop.innerHTML = html;
  const sc = pop.querySelector('.tbp-scroll');
  if (sc) sc.scrollTop = scroll;
  if (fe !== null) { const i = $('#tbDocFilter'); i.focus(); i.setSelectionRange(fe, fe); }
}

function close() {
  // Météo : le bloc (mis à jour par extra.js et radar.js) retourne dans son abri
  const wx = $('#weather');
  if (wx && open === 'weather') $('#weatherHold')?.appendChild(wx);
  pop?.remove();
  pop = null;
  open = null;
  clearInterval(timer);
  for (const b of document.querySelectorAll('.tb-tool')) b.classList.remove('on');
}

function show(tool, btn) {
  if (open === tool) { close(); return; }
  close();
  open = tool;
  btn.classList.add('on');
  pop = document.createElement('div');
  pop.className = `tb-pop tb-pop-${tool}`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.right = `${Math.max(8, innerWidth - r.right - 40)}px`;
  pop.addEventListener('input', (e) => { if (e.target.id === 'tbDocFilter') { filter = e.target.value; render(); } });
  pop.addEventListener('change', (e) => { if (e.target.id === 'tbDocGp') { docGp = e.target.value; render(true); } });
  pop.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) {
      const st = sort[open];
      if (st.k === th.dataset.sort) st.dir = -st.dir;
      else { st.k = th.dataset.sort; st.dir = Number(th.dataset.dir) || 1; }
      render(true);
    }
    const m = e.target.closest('[data-mode]');
    if (m) { speedMode = m.dataset.mode; render(true); }
  });
  if (tool === 'docs') { markDocsSeen(); $('.tb-tool[data-tool="docs"] .tb-dot').hidden = true; }
  if (tool === 'weather') {
    pop.innerHTML = '<div class="tbp-head"><b>Météo du circuit</b></div>';
    pop.appendChild($('#weather'));
    return;
  }
  render(true);
  timer = setInterval(() => render(), 1000);
}

// Point sur l'icône des documents quand de nouveaux documents sont publiés (depuis la dernière
// ouverture de la liste, pour ce Grand Prix)
const seenDocs = () => { const v = storageGet('paddock.docsSeen', null); return v && v.key === fiaState().key ? v.n : 0; };
function markDocsSeen() { storageSet('paddock.docsSeen', { key: fiaState().key, n: visibleDocs(false).docs.length }); }
function docsBadge() {
  const dot = $('.tb-tool[data-tool="docs"] .tb-dot');
  const { f, docs } = visibleDocs(false);
  if (!dot || !f.key) return;
  if (open === 'docs') markDocsSeen();
  dot.hidden = open === 'docs' || docs.length <= seenDocs();
}

export function initTopInfo() {
  const tools = $('#tbTools');
  if (!tools) return;
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) show(b.dataset.tool, b);
  });
  document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !tools.contains(e.target) && !e.target.closest('.csel-pop')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  setInterval(docsBadge, 3000);
}
