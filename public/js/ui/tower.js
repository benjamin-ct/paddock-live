// Tableau de classement (course / qualifications / essais).
import { store, setDuel, setFocus, versionOf, displayNow, f1Now, on } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamMark, tyreBadge, currentStint, lapSeconds, fmtLap } from '../util.js';
import { prefs, isFav, toggleFav, towerCols, towerBig } from '../prefs.js';
import { segmentClass, parseUtc } from '/shared/f1.js';
import { icon } from '../icons.js';
import { realStopCount } from '/shared/pits.js';
import { stewardsData } from './feed.js';

let lastKey = '';
let lastRender = 0;
const prevPos = new Map();
const flashes = new Map();
let freshReset = true;

function timingClass(obj) {
  if (!obj) return '';
  if (obj.OverallFastest) return 'purple';
  if (obj.PersonalFastest) return 'green';
  return '';
}

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function sectorCell(sec) {
  const segs = list(sec?.Segments);
  const val = sec?.Value || '';
  return `<td class="sector c-sec"><div class="sector-val ${timingClass(sec)}">${esc(val) || '<span class="dim">—</span>'}</div>` +
    (segs.length ? `<div class="segs">${segs.map((s) => `<i class="seg ${segmentClass(s?.Status)}"></i>`).join('')}</div>` : '') + '</td>';
}

function gapText(v) {
  if (v === undefined || v === null || v === '') return '<span class="dim">—</span>';
  if (/^LAP/i.test(v)) return '<span class="dim">Leader</span>';
  return esc(v);
}

export function renderTower(force = false) {
  const now = performance.now();
  const key = `${versionOf(['TimingData', 'TimingAppData', 'DriverList', 'TimingStats', 'RaceControlMessages', '__reset'])}|${store.duel.a}|${store.duel.b}|${store.focus}|${towerBig()}|${towerCols().hidden.join()}|${towerCols().extra.join()}|${prefs.favs.join()}|${prefs.hotLapDim}`;
  const carTick = store.positions.car.size ? Math.floor(now / 500) : 0;
  if (!force && key + carTick === lastKey) return;
  if (!force && now - lastRender < 250) return;
  lastKey = key + carTick;
  lastRender = now;

  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const stats = s.TimingStats?.Lines || {};
  const nums = orderedNumbers(s);
  const dispNow = displayNow();
  const showDrs = (Number(s.SessionInfo?.StartDate?.slice(0, 4)) || 2026) < 2026;

  const part = Number(s.TimingData?.SessionPart) || 1;
  const noEntries = list(s.TimingData?.NoEntries);
  const cutoff = kind === 'quali' && part < 3 ? Number(noEntries[part]) || null : null;

  const TH = (cls, label, title = '') => `<th class="${cls}"${title ? ` title="${title}"` : ''}>${label}</th>`;
  const secHead = TH('c-sec', 'S1') + TH('c-sec', 'S2') + TH('c-sec', 'S3');
  // Colonnes facultatives (menu « Colonnes » du classement)
  const extraHead = TH('c-grid', 'Grille', 'Position de départ') + TH('c-laps', 'Tours', 'Tours effectués')
    + TH('c-gapf', 'Suivi', 'Écart au pilote suivi (clic sur un pilote)') + TH('c-spd', 'I1 · I2 · Arr.', 'Vitesses aux intermédiaires 1 et 2 et sur la ligne d\'arrivée (km/h)')
    + [1, 2, 3].map((i) => TH('t-lap c-bsec', `Meill. S${i}`, `Meilleur secteur ${i} du pilote dans la séance (violet : meilleur de tous)`)).join('') + TH('c-team', 'Écurie');
  // Écart au pilote suivi : course = écart au leader, essais / qualifs = meilleur tour
  const gapSec = (n) => {
    const l = lines[n] || {};
    if (kind === 'race') {
      const g = String(l.GapToLeader ?? '');
      if (/^LAP/i.test(g) || (Number(l.Position) === 1 && !g)) return 0;
      return /L/i.test(g) ? null : parseFloat(g.replace('+', '')) || null;
    }
    return bestOf(l);
  };
  let head;
  if (kind === 'race') {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('c-tags', '') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-last', 'Dernier') + TH('t-lap c-best', 'Meilleur') +
      secHead + TH('c-tyre', 'Pneu') + TH('c-pits', 'Arr.', 'Arrêts aux stands') + TH('c-speed', 'V.max', 'Vitesse au speed trap') + extraHead + TH('c-duel', 'Duel');
  } else if (kind === 'quali') {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('c-tags', '') + TH('t-lap', 'Meilleur') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-pred', 'Tour en cours', 'Temps prévu du tour lancé et position visée') +
      TH('t-lap c-last', 'Dernier') + secHead + TH('t-lap c-q', 'Q1') + TH('t-lap c-q', 'Q2') + TH('t-lap c-q', 'Q3') + TH('c-tyre', 'Pneu') + extraHead + TH('c-duel', 'Duel');
  } else {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('c-tags', '') + TH('t-lap', 'Meilleur') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-pred', 'Tour en cours', 'Temps prévu du tour lancé') +
      TH('t-lap c-last', 'Dernier') + secHead + TH('c-tyre', 'Pneu') + TH('c-pits', 'Tours') + extraHead + TH('c-duel', 'Duel');
  }

  // Meilleurs temps de la partie en cours (qualifs) / de la séance, pour classer les tours en cours.
  const bestOf = (l) => kind === 'quali' ? lapSeconds(list(l.BestLapTimes)[part - 1]?.Value) : lapSeconds(l.BestLapTime?.Value);
  const bests = nums.map((n) => ({ n, t: bestOf(lines[n] || {}) })).filter((x) => x.t);
  const focusGap = store.focus ? gapSec(store.focus) : null;

  const hot = hotLaps();
  // Course : pénalités en temps pas encore purgées (au prochain arrêt, sinon ajoutées à l'arrivée)
  const pens = {};
  if (kind === 'race') {
    for (const d of stewardsData().decisions) {
      const sec = !d.servedAt && /(\d+) SECOND TIME PENALTY/.exec(d.text)?.[1];
      if (sec) for (const c of d.cars) pens[c.num] = (pens[c.num] || 0) + Number(sec);
    }
  }
  const rows = nums.map((num) => {
    const d = dl[num] || {};
    const l = lines[num] || {};
    const a = app[num] || {};
    const pos = l.Position || d.Line || '';
    const stint = currentStint(a);
    const tags = [];
    if (l.Retired) tags.push('<span class="tag ret">ABD</span>');
    else if (l.Stopped) tags.push('<span class="tag stop">ARRÊT</span>');
    else if (l.InPit) tags.push('<span class="tag pit">STAND</span>');
    else if (l.PitOut) tags.push('<span class="tag out">SORTIE</span>');
    if (showDrs) {
      const car = store.positions.carAt(num, dispNow);
      if (car && car.drs >= 10) tags.push('<span class="tag drs">DRS</span>');
    }
    const pred = kind !== 'race' ? predictLap(l, stats[num]) : null;
    if (pred) tags.push('<span class="tag push" title="Tour rapide en cours">TOUR</span>');
    if (pens[num]) tags.push(`<span class="tag pen" title="Pénalité en temps : purgée au prochain arrêt, sinon ajoutée à son temps de course">+${pens[num]} s</span>`);

    // Changement de position : surbrillance verte / rouge (animation CSS, voir syncRows)
    const p = Number(pos);
    const prev = prevPos.get(num);
    if (p && prev && p !== prev && !freshReset) flashes.set(num, p < prev ? 'up' : 'down');
    if (p) prevPos.set(num, p);

    let posDelta = '';
    if (kind === 'race' && a.GridPos && pos) {
      const dlt = Number(a.GridPos) - Number(pos);
      if (dlt) posDelta = `<span class="pos-delta ${dlt > 0 ? 'up' : 'down'}">${icon(dlt > 0 ? 'tri-up' : 'tri-down')}${Math.abs(dlt)}</span>`;
    }

    const drv = `<td><div class="drv">${teamMark(d)}<span class="drv-num">${esc(d.RacingNumber || num)}</span><span class="drv-tla" title="${esc(d.FullName || '')} — ${esc(d.TeamName || '')}">${esc(d.Tla || num)}</span><span class="drv-last">${esc(d.LastName || '')}</span><button class="fav-btn ${isFav(num) ? 'on' : ''}" data-fav="${num}" title="${isFav(num) ? 'Retirer des favoris' : 'Ajouter aux favoris (alertes, radios…)'}">${icon(isFav(num) ? 'star-fill' : 'star')}</button></div></td><td class="c-tags"><div class="drv-tags">${tags.join('')}</div></td>`;
    const sectors = list(l.Sectors);
    const secCells = [0, 1, 2].map((i) => sectorCell(sectors[i])).join('');
    const tyre = `<td class="c-tyre">${stint ? tyreBadge(stint.Compound, stint.TotalLaps, stint.New) : '<span class="dim">—</span>'}</td>`;
    const duel = `<td class="c-duel"><div class="duel-btns"><button class="ab a ${store.duel.a === num ? 'on' : ''}" data-duel="a" data-num="${num}" title="Pilote A du duel">A</button><button class="ab b ${store.duel.b === num ? 'on' : ''}" data-duel="b" data-num="${num}" title="Pilote B du duel">B</button></div></td>`;
    const last = `<td class="t-lap c-last ${timingClass(l.LastLapTime)}">${esc(l.LastLapTime?.Value || '') || '<span class="dim">—</span>'}</td>`;
    let predCell = '<td class="t-lap c-pred"><span class="dim">—</span></td>';
    if (pred) {
      const own = bestOf(l);
      const rank = bests.filter((x) => x.n !== num && x.t < pred.time).length + 1;
      const cls = rank === 1 ? 'purple' : own === null || pred.time < own ? 'green' : 'yellow';
      predCell = `<td class="t-lap c-pred"><span class="pred ${cls}" title="${pred.done} secteur(s) réalisé(s)">${fmtLap(pred.time)} <small>${icon('arrow-right', 'ic-s')} P${rank}</small></span></td>`;
    }

    const g = focusGap !== null && store.focus !== num ? gapSec(num) : null;
    const dg = g !== null ? g - focusGap : null;
    const sp = l.Speeds || {};
    const v = (k) => (sp[k]?.Value ? `<b class="${timingClass(sp[k])}">${esc(sp[k].Value)}</b>` : '<span class="dim">—</span>');
    const extra = `<td class="c-grid">${a.GridPos ? `P${esc(a.GridPos)}` : '<span class="dim">—</span>'}</td>`
      + `<td class="c-laps">${esc(l.NumberOfLaps ?? '') || '<span class="dim">—</span>'}</td>`
      + `<td class="c-gapf ${dg === null ? '' : dg < 0 ? 'ahead' : 'behind'}">${store.focus === num ? '<span class="dim">suivi</span>' : dg === null ? '<span class="dim">—</span>' : `${dg < 0 ? '−' : '+'}${Math.abs(dg).toFixed(3)}`}</td>`
      + `<td class="c-spd">${v('I1')} · ${v('I2')} · ${v('FL')}</td>`
      + list(stats[num]?.BestSectors).slice(0, 3).concat([null, null, null]).slice(0, 3)
        .map((b) => `<td class="t-lap c-bsec ${b?.Position === 1 ? 'purple' : ''}">${esc(b?.Value || '') || '<span class="dim">—</span>'}</td>`).join('')
      + `<td class="c-team">${esc(d.TeamName || '')}</td>`;

    let cells;
    if (kind === 'race') {
      const int = l.IntervalToPositionAhead || {};
      const best = l.BestLapTime?.Value || '';
      const bestPurple = stats[num]?.PersonalBestLapTime?.Position === 1;
      const st = l.Speeds?.ST;
      cells = `<td class="pos">${esc(pos)}${posDelta}</td>${drv}
        <td class="t-gap">${gapText(l.GapToLeader)}</td>
        <td class="t-int c-int ${int.Catching ? 'catching' : ''}">${gapText(int.Value)}</td>
        ${last}<td class="t-lap c-best ${bestPurple ? 'purple' : ''}">${esc(best) || '<span class="dim">—</span>'}</td>
        ${secCells}${tyre}<td class="c-pits">${realStopCount(store.state.TimingAppData?.Lines?.[num], l)}</td>
        <td class="c-speed ${timingClass(st)}">${esc(st?.Value || '') || '<span class="dim">—</span>'}</td>${extra}${duel}`;
    } else if (kind === 'quali') {
      const bl = list(l.BestLapTimes);
      const stp = list(l.Stats)[part - 1] || {};
      const best = bl[part - 1]?.Value || '';
      const q = [0, 1, 2].map((i) => `<td class="t-lap c-q ${i === part - 1 ? '' : 'dim'}">${esc(bl[i]?.Value || '') || '<span class="dim">—</span>'}</td>`).join('');
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(best) || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(stp.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int c-int">${esc(stp.TimeDifftoPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${predCell}${last}${secCells}${q}${tyre}${extra}${duel}`;
    } else {
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(l.BestLapTime?.Value || '') || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(l.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int c-int">${esc(l.TimeDiffToPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${predCell}${last}${secCells}${tyre}<td class="c-pits">${esc(l.NumberOfLaps ?? '')}</td>${extra}${duel}`;
    }

    const cls = ['trow'];
    if (l.KnockedOut || l.Retired) cls.push('out');
    if (cutoff && Number(pos) > cutoff && !l.KnockedOut) cls.push('danger');
    if (cutoff && Number(pos) === cutoff) cls.push('cut');
    if (store.focus === num) cls.push('focus');
    if (hot && !pred && store.focus !== num && store.duel.a !== num && store.duel.b !== num) cls.push('cool');
    if (store.duel.a === num) cls.push('duel-a');
    if (store.duel.b === num) cls.push('duel-b');
    return { num, cls: cls.join(' '), cells };
  });
  freshReset = false;

  // Qualifs : temps à battre pour passer à la partie suivante
  let cutInfo = '';
  if (cutoff) {
    const atCut = nums.find((n) => Number(lines[n]?.Position) === cutoff);
    const t = atCut ? bestOf(lines[atCut]) : null;
    const threatened = nums.filter((n) => Number(lines[n]?.Position) > cutoff && !lines[n]?.KnockedOut).map((n) => dl[n]?.Tla || n);
    if (t) cutInfo = `<caption class="cutline">Limite ${/sprint/i.test(s.SessionInfo?.Name || '') ? 'SQ' : 'Q'}${part} (P${cutoff}) : <b>${fmtLap(t)}</b>${threatened.length ? ` · en danger : ${esc(threatened.join(', '))}` : ''}</caption>`;
  }

  const table = $('#tower');
  const cols = towerCols();
  table.className = `tower ${cols.hidden.map((c) => `hide-${c}`).join(' ')} ${cols.extra.map((c) => `show-${c}`).join(' ')}`;
  syncTable(table, cutInfo, head, rows);
  fitTower();
}

// Mise à jour du tableau ligne par ligne (au lieu de tout reconstruire) : seules les cellules
// qui changent sont réécrites, et une voiture qui gagne ou perd des places glisse jusqu'à sa
// nouvelle ligne (technique FLIP) avec une surbrillance qui s'estompe en douceur.
const rowEls = new Map();      // numéro -> <tr>
const rowHtml = new Map();     // numéro -> contenu actuel
let headHtml = '';
let lastOrder = '';
let captionHtml = '';

function syncTable(table, cutInfo, head, rows) {
  if (!table.tHead || table.dataset.built !== '1') {
    table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
    table.dataset.built = '1';
    rowEls.clear(); rowHtml.clear(); headHtml = ''; captionHtml = ''; lastOrder = '';
  }
  if (cutInfo !== captionHtml) {
    table.caption?.remove();
    if (cutInfo) table.insertAdjacentHTML('afterbegin', cutInfo);
    captionHtml = cutInfo;
  }
  if (head !== headHtml) { table.tHead.rows[0].innerHTML = head; headHtml = head; }
  const tbody = table.tBodies[0];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="note">En attente des données de chronométrage…</td></tr>';
    rowEls.clear(); rowHtml.clear();
    return;
  }
  tbody.querySelector('td.note')?.parentElement.remove();

  // Positions avant mise à jour (pour l'animation de glissement) : mesurées seulement si l'ordre
  // change, pour ne pas forcer un recalcul de mise en page à chaque rafraîchissement.
  const order = rows.map((r) => r.num).join();
  const reordered = order !== lastOrder;
  lastOrder = order;
  const before = new Map();
  if (reordered) for (const [num, tr] of rowEls) if (tr.isConnected) before.set(num, tr.getBoundingClientRect().top);

  const keep = new Set();
  rows.forEach((r, i) => {
    keep.add(r.num);
    let tr = rowEls.get(r.num);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.num = r.num;
      rowEls.set(r.num, tr);
    }
    const fl = [...tr.classList].filter((c) => c === 'flash-up' || c === 'flash-down');
    const cls = [r.cls, ...fl].join(' ');
    if (tr.className !== cls) tr.className = cls;
    if (rowHtml.get(r.num) !== r.cells) { tr.innerHTML = r.cells; rowHtml.set(r.num, r.cells); }
    if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] || null);
  });
  for (const [num, tr] of rowEls) {
    if (!keep.has(num)) { tr.remove(); rowEls.delete(num); rowHtml.delete(num); }
  }

  // Surbrillance : relancée à chaque changement de position
  for (const [num, dir] of flashes) {
    const tr = rowEls.get(num);
    if (!tr) continue;
    tr.classList.remove('flash-up', 'flash-down');
    void tr.offsetWidth;
    tr.classList.add(`flash-${dir}`);
    tr.addEventListener('animationend', () => tr.classList.remove(`flash-${dir}`), { once: true });
  }
  flashes.clear();

  // Glissement : chaque ligne déplacée part de son ancienne place et rejoint la nouvelle
  if (!reordered || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const zoom = Number(table.style.zoom) || 1;
  for (const [num, tr] of rowEls) {
    const old = before.get(num);
    if (old === undefined) continue;
    const dy = (old - tr.getBoundingClientRect().top) / zoom;
    if (Math.abs(dy) < 1) continue;
    tr.style.transition = 'none';
    tr.style.transform = `translateY(${dy}px)`;
    tr.style.position = 'relative';
    tr.style.zIndex = '2';
    requestAnimationFrame(() => {
      tr.style.transition = 'transform .6s cubic-bezier(.22, .8, .3, 1)';
      tr.style.transform = '';
      tr.addEventListener('transitionend', () => { tr.style.zIndex = ''; tr.style.position = ''; tr.style.transition = ''; }, { once: true });
    });
  }
}

// Grand écran / fenêtre détachée : le classement s'agrandit pour occuper toute la hauteur
// disponible. D'abord un zoom (limité pour que toutes les colonnes restent visibles), puis,
// quand la largeur ne permet pas d'agrandir davantage (qualifications : beaucoup de colonnes),
// des lignes plus hautes pour remplir le reste.
let fitKey = '';
const ROW_H = 34;

export function fitTower(force = false) {
  const table = $('#tower');
  const wrap = table?.parentElement;
  if (!wrap || !wrap.clientHeight) return;
  const rows = table.tBodies[0]?.rows.length || 0;
  const key = `${wrap.clientWidth}x${wrap.clientHeight}|${rows}|${table.className}|${prefs.towerFit}`;
  if (key === fitKey && !force) return;
  fitKey = key;
  table.style.zoom = '';
  table.style.removeProperty('--tower-row-h');
  if (!prefs.towerFit || rows < 5 || table.closest('.grid.mobile')) return;
  const fits = () => wrap.scrollWidth <= wrap.clientWidth + 1 && wrap.scrollHeight <= wrap.clientHeight + 1;
  let z = 1;
  const room = (wrap.clientHeight - 2) / table.offsetHeight;
  if (wrap.scrollWidth > wrap.clientWidth + 1) {
    // Un peu trop large (qualifications, Q1 à Q3) : légère réduction pour voir toutes les colonnes
    if (wrap.clientWidth / wrap.scrollWidth >= 0.8) {
      z = Math.floor((wrap.clientWidth / wrap.scrollWidth) * 100) / 100;
      table.style.zoom = z;
    }
  } else if (room >= 1.04) {
    z = Math.min(1.8, Math.floor(room * 50) / 50);
    while (z > 1.04) {
      table.style.zoom = z;
      if (fits()) break;
      z = Math.round((z - 0.04) * 100) / 100;
    }
    if (z <= 1.04) { z = 1; table.style.zoom = ''; }
  }
  // Hauteur restante répartie entre les lignes (au plus 1,8 fois la hauteur normale)
  const left = wrap.clientHeight - 2 - table.getBoundingClientRect().height;
  if (left < rows * 2) return;
  let h = Math.min(ROW_H * 1.8, ROW_H + Math.floor(left / rows / z));
  for (; h > ROW_H; h--) {
    table.style.setProperty('--tower-row-h', `${h}px`);
    if (wrap.scrollHeight <= wrap.clientHeight + 1) return;   // la largeur ne change pas
  }
  table.style.removeProperty('--tower-row-h');
}

// Temps prévu d'un tour lancé : secteurs réalisés + meilleurs secteurs personnels restants.
// Pilotes dans un tour lancé (essais / qualifs), pour estomper les autres (option, comme
// MultiViewer). Vide en course ou si l'option est coupée.
let hotKey = '', hotSet = new Set();
export function hotLaps() {
  const s = store.state;
  if (!prefs.hotLapDim || sessionKind(s) === 'race') return null;
  const k = versionOf(['TimingData', 'TimingStats', '__reset']);
  if (k !== hotKey) {
    hotKey = k;
    const lines = s.TimingData?.Lines || {}, stats = s.TimingStats?.Lines || {};
    hotSet = new Set(Object.keys(lines).filter((n) => predictLap(lines[n], stats[n])));
  }
  return hotSet;
}

function predictLap(l, st) {
  if (l.InPit || l.PitOut || l.Retired || l.Stopped) return null;
  const secs = list(l.Sectors);
  const best = list(st?.BestSectors).map((b) => lapSeconds(b?.Value));
  if (secs.length < 3 || best.length < 3 || best.some((b) => !b)) return null;
  let done = 0, time = 0, good = 0, seen = 0;
  for (let i = 0; i < 3; i++) {
    const segs = list(secs[i]?.Segments);
    const statuses = segs.map((g) => g?.Status || 0);
    seen += statuses.filter(Boolean).length;
    good += statuses.filter((x) => x === 2049 || x === 2051).length;
    const complete = segs.length && statuses.every(Boolean) && !statuses.includes(2064);
    if (complete && i === done) {
      const v = lapSeconds(secs[i].Value);
      if (!v) return null;
      time += v;
      done++;
    }
  }
  if (!done || done === 3 || seen < 2 || good / seen < 0.5) return null;
  for (let i = done; i < 3; i++) time += best[i];
  return { time, done };
}
export function initTower() {
  const wrap = $('#tower').parentElement;
  // Ajustement à l'image suivante : le faire pendant la mesure relançait l'observateur en boucle
  let fitFrame = 0;
  if ('ResizeObserver' in window) new ResizeObserver(() => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => fitTower()); }).observe(wrap);
  on('prefs', (k) => { if (k === 'towerFit') fitTower(true); if (k === 'bigCols') renderTower(true); });
  on('reset', () => { freshReset = true; prevPos.clear(); flashes.clear(); });
  on('towerSize', () => renderTower(true));   // agrandi ou réduit : ses colonnes
  $('#tower').addEventListener('click', (e) => {
    const b = e.target.closest('[data-duel]');
    if (b) {
      const slot = b.dataset.duel;
      setDuel(slot, store.duel[slot] === b.dataset.num ? null : b.dataset.num);
      renderTower(true);
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      toggleFav(fav.dataset.fav);
      renderTower(true);
      return;
    }
    const row = e.target.closest('tr[data-num]');
    if (row) {
      setFocus(store.focus === row.dataset.num ? null : row.dataset.num);
      renderTower(true);
    }
  });
}
