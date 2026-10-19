// Onglet « Pneus » : choix de composés et préconisations de Pirelli pour le Grand Prix, et jeux
// de pneus de chaque pilote sur tout le week-end (neufs encore disponibles, jeux déjà utilisés).
import { store, f1Now, versionOf } from '../store.js';
import { $, esc, api, drivers, orderedNumbers, teamColor, compoundInfo } from '../util.js';
import { buildSets, setSummary, DRY, WET } from '/shared/tyres.js';
import { translated, requestTranslations, onTranslation } from './fia-translate.js';
import { icon } from '../icons.js';
import { LOCALE, EN } from '../i18n.js';
import { gpFull } from '/shared/gp-names.js';

let data = null;          // réponse de /api/tyres
let dataKey = '';
let loading = false;
let loadedAt = 0;
let error = '';
let lastVer = -1;
let showFr = true;

const NAME_FR = { SOFT: 'Tendre', MEDIUM: 'Medium', HARD: 'Dur', INTERMEDIATE: 'Intermédiaire', WET: 'Pluie' };
const SESSION_FR = (n) => String(n || '').replace('Practice ', 'EL').replace('Sprint Qualifying', 'Qualif sprint').replace('Sprint Shootout', 'Qualif sprint').replace('Qualifying', 'Qualif').replace('Race', 'Course');

async function load(path) {
  if (loading) return;
  loading = true;
  try {
    const info = store.state.SessionInfo || {};
    const q = new URLSearchParams({ path, until: Math.round(f1Now()), name: info.Meeting?.Name || '', location: info.Meeting?.Location || '', country: info.Meeting?.Country?.Name || '', session: info.Name || '' });
    data = await api(`/api/tyres?${q}`);
    dataKey = path;
    error = '';
  } catch (err) {
    error = err.message;
    dataKey = path;
  } finally {
    loading = false;
    loadedAt = Date.now();
    lastVer = -1;
  }
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
const tr = (en) => (showFr && translated(en)) || en;

function pirelliCard(d) {
  const n = d.nominations;
  const a = d.allocation;
  const comp = (key, c) => {
    const ci = compoundInfo(key);
    return `<div class="ty-comp" style="--tc:${ci.color}"><span class="tyre">${ci.letter}</span><div><b>${c ? `C${c}` : '—'}</b><span>${NAME_FR[key]} · ${a[key]} jeux${key === 'SOFT' && !d.meeting.sprint ? ' (+1 en Q3)' : ''}</span></div></div>`;
  };
  return `<div class="ty-card">
    <div class="ty-card-head"><b>Choix de Pirelli</b><span class="muted small">${esc(gpFull(d.meeting.name, EN))}${d.meeting.sprint ? ' · week-end sprint' : ''}</span>
      ${n?.url ? `<a class="ty-src" href="${esc(n.url)}" target="_blank" rel="noopener">source ${icon('external', 'ic-s')}</a>` : ''}</div>
    ${n ? `<div class="ty-comps">${comp('HARD', n.hard)}${comp('MEDIUM', n.medium)}${comp('SOFT', n.soft)}</div>`
      : `<div class="note">Composés pas encore annoncés par Pirelli pour ce Grand Prix.</div>`}
    <div class="small muted">Par pilote : ${a.HARD + a.MEDIUM + a.SOFT} jeux pour le sec, plus intermédiaires et pluie. C1 = le plus dur, C5 = le plus tendre.</div>
  </div>`;
}

function adviceCard(d) {
  const arts = (d.articles || []).filter((a) => a.advice?.length || a.paras?.length);
  if (!arts.length) return '';
  const texts = arts.flatMap((a) => a.advice.length ? a.advice : a.paras.slice(0, 1));
  const missing = !EN && texts.some((t) => !translated(t));   // en anglais : communiqués tels quels
  const host = store.isHost !== false;
  return `<div class="ty-card">
    <div class="ty-card-head"><b>Ce que préconise Pirelli</b><span class="muted small">communiqués du week-end</span>
      ${missing && host ? '<button class="btn small" id="tyTranslate" title="Traduction faite sur cet ordinateur (même moteur que les radios)">Traduire</button>' : ''}
      ${!missing && !EN ? `<label class="toggle small"><input type="checkbox" id="tyFr" ${showFr ? 'checked' : ''}> Français</label>` : ''}</div>
    ${arts.map((a) => `<div class="ty-art">
      <div class="ty-art-head"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a><span class="muted small">${fmtDate(a.date)}</span></div>
      <ul>${(a.advice.length ? a.advice : a.paras.slice(0, 1)).map((t) => `<li>${esc(tr(t))}</li>`).join('')}</ul>
    </div>`).join('')}
  </div>`;
}

function setsTable(d) {
  const s = store.state;
  const dl = drivers(s);
  const cur = s.TimingAppData?.Lines || {};
  const currentStints = Object.fromEntries(Object.entries(cur).map(([n, l]) => [n, l?.Stints]));
  const sessions = [...d.sessions, { name: d.current, stints: currentStints }];
  const sets = buildSets(sessions);
  const q3 = new Set(d.sessions.flatMap((x) => x.q3 || []));
  const nums = orderedNumbers(s).filter((n) => dl[n]);
  const wetUsed = nums.some((n) => (sets[n] || []).some((x) => WET.includes(x.compound)));
  const cols = [...DRY, ...(wetUsed ? WET : [])];
  const cell = (sum, key, curSet) => {
    const ci = compoundInfo(key);
    const used = sum.used.map((l) => `<span class="ty-used${curSet && curSet.compound === key && curSet.laps === l ? ' on' : ''}" title="Jeu utilisé : ${l} tour(s)">${l}</span>`).join('');
    const nw = sum.newLeft === null ? '' : `<span class="ty-new ${sum.newLeft ? '' : 'zero'}" style="--tc:${ci.color}" title="Jeux neufs jamais montés (allocation ${sum.allocated})">${sum.newLeft}</span>`;
    return `<td class="ty-cell">${nw}${used || (sum.newLeft === null ? '<span class="dim">—</span>' : '')}</td>`;
  };
  const rows = nums.map((n) => {
    const mine = sets[n] || [];
    const sum = setSummary(mine, d.allocation, q3.has(n));
    const lastStint = [...(Array.isArray(cur[n]?.Stints) ? cur[n].Stints : Object.values(cur[n]?.Stints || {}))].pop();
    const curSet = lastStint ? mine.filter((x) => x.compound === lastStint.Compound).find((x) => x.laps === Number(lastStint.TotalLaps)) : null;
    return `<tr><td class="ty-drv" style="--c:${teamColor(dl[n])}"><b>${esc(dl[n].Tla)}</b>${q3.has(n) ? '<span class="ty-q3" title="Qualifié en Q3 : un jeu de tendres en plus">Q3</span>' : ''}</td>${cols.map((c) => cell(sum[c], c, curSet)).join('')}</tr>`;
  }).join('');
  const done = d.sessions.map((x) => SESSION_FR(x.name)).join(', ');
  return `<div class="ty-card">
    <div class="ty-card-head"><b>Jeux de pneus du week-end</b><span class="muted small">${done ? `${esc(done)} + ` : ''}${esc(SESSION_FR(d.current))} (en direct)</span></div>
    <div class="ty-scroll"><table class="ty-table">
      <thead><tr><th>Pilote</th>${cols.map((c) => { const ci = compoundInfo(c); return `<th><span class="tyre" style="--tc:${ci.color}">${ci.letter}</span> ${NAME_FR[c]}</th>`; }).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

export function renderTyres() {
  const el = $('#tyres');
  if (!el || !el.classList.contains('active')) return;
  const path = store.state.SessionInfo?.Path;
  if (!path) { el.innerHTML = '<div class="note">En attente de la séance…</div>'; return; }
  // Données du week-end : à la séance, puis toutes les 10 min (nouveaux communiqués Pirelli)
  if ((path !== dataKey || Date.now() - loadedAt > 10 * 60 * 1000) && !loading) load(path);
  if (!data || dataKey !== path) { el.innerHTML = error ? `<div class="note">${esc(error)}</div>` : '<div class="note">Chargement des séances du week-end…</div>'; return; }
  const v = versionOf(['TimingAppData', 'DriverList', 'TimingData', '__reset']);
  if (v === lastVer && performance.now() - (renderTyres.last || 0) < 5000) return;
  if (performance.now() - (renderTyres.last || 0) < 1000) return;
  renderTyres.last = performance.now();
  lastVer = v;
  const scroll = el.querySelector('.ty-scroll')?.scrollTop;
  el.innerHTML = `<div class="ty">${pirelliCard(data)}${adviceCard(data)}${setsTable(data)}</div>`;
  if (scroll) el.querySelector('.ty-scroll').scrollTop = scroll;
}

export function initTyres() {
  const el = $('#tyres');
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.target.closest('#tyTranslate')) {
      const texts = (data?.articles || []).flatMap((a) => a.advice.length ? a.advice : a.paras.slice(0, 1));
      requestTranslations(texts);
      e.target.closest('#tyTranslate').disabled = true;
      e.target.closest('#tyTranslate').textContent = 'Traduction…';
    }
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'tyFr') { showFr = e.target.checked; lastVer = -1; renderTyres.last = 0; } });
  onTranslation(() => { lastVer = -1; renderTyres.last = 0; });
}
