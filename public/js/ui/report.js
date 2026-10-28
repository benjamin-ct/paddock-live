// Séance en cartes (podium, remontées, stratégies, neutralisations, abandons, meilleur tour) et
// classement complet : fenêtre « Résumé » et page Résultats. Au rythme du délai TV (état affiché).
import { esc, teamMark, tyreBadge, compoundInfo } from '../util.js';
import { icon } from '../icons.js';
import { t, FR, LANG, DEC } from '../i18n.js';
import { summaryFacts } from '/shared/summary.js';
import { realStints, realStopCount } from '/shared/pits.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));
// Écart : « +7.335 » -> « +7,335 s » ; « +1L » / « 1 LAP » -> « +1 tour »
function gapText(g) {
  const v = String(g || '').trim();
  const laps = /^\+?(\d+)\s*L(?:APS?)?$/i.exec(v);
  if (laps) return Number(laps[1]) === 1 ? t('+1 tour') : t('+{} tours', laps[1]);
  return /^\+?\d/.test(v) ? `+${v.replace('+', '').replace('.', DEC)} s` : esc(v);
}
// Numéro de tour court : « T12 » (Lap -> « L12 ») ; pas de gabarit « T{} », qui happerait tout texte en T
const lapNo = (l) => `${{ en: 'L', it: 'G', es: 'V' }[LANG] || 'T'}${l}`;   // tour, lap, giro, vuelta

// Pilote : repère d'écurie (logo ou barre) + trigramme
function who(d, dl, full = false) {
  return `<span class="rp-drv">${teamMark(dl[d.n] || { TeamName: d.team, TeamColour: d.color.slice(1) })}<b>${esc(d.tla)}</b>${full ? `<span class="muted">${esc(d.name)}</span>` : ''}</span>`;
}
const tile = (title, body, cls = '') => `<section class="rp-tile ${cls}"><h4>${title}</h4>${body}</section>`;
const tyres = (comps) => comps.map((c) => tyreBadge(c)).join(`<span class="rp-arr">${icon('arrow-right', 'ic-s')}</span>`);

// État de la séance : « Terminé », « Tour 44 / 62 », « Q2 en cours »…
export function statusLabel(f) {
  if (f.final) return t('Terminé');
  if (f.kind === 'race') return f.lap ? t('Tour {} / {}', f.lap, f.total || '?') : t('En cours');
  if (f.kind === 'quali') return t('Q{} en cours', f.part);
  return t('En cours');
}

function podium(f, dl) {
  const val = (d, i) => {
    if (f.kind === 'race') return i ? gapText(d.gap) : `<span class="rp-lead">${f.final ? t('Vainqueur') : t('En tête')}</span>`;
    return esc(d.time || '—');
  };
  const sub = (d, i) => {
    if (f.kind === 'race') return d.grid ? (d.grid === 1 ? t('Parti de la pole') : t('Parti P{}', d.grid)) : '';
    return i && d.gap ? gapText(d.gap) : '';
  };
  return `<div class="rp-podium">${f.top.map((d, i) => `<div class="rp-pod p${i + 1}" style="--tc:${d.color}">
      <div class="rp-pos">${i + 1}</div>
      <div class="rp-pod-who">${teamMark(dl[d.n] || {})}<div><b>${esc(d.tla)}</b><span>${esc(d.name)}</span></div></div>
      <div class="rp-val">${val(d, i)}</div><div class="rp-sub muted">${sub(d, i)}</div></div>`).join('')}</div>`;
}

export function reportHtml(state) {
  const f = summaryFacts(state, { lang: FR ? 'fr' : 'en' });
  const dl = state?.DriverList || {};
  if (!f.top.length) return `<div class="note">${t('Pas encore de classement pour cette séance.')}</div>`;
  const tiles = [];
  if (f.kind === 'race') {
    const move = (m, up) => `<div class="rp-row">${who(m, dl)}<span class="muted">P${m.from} ${icon('arrow-right', 'ic-s')} P${m.to}</span><span class="rp-delta ${up ? 'up' : 'down'}">${up ? '+' : ''}${m.d}</span></div>`;
    if (f.up.length) tiles.push(tile(`${icon('arrow-up', 'ic-s')} ${t('Belles remontées')}`, f.up.map((m) => move(m, true)).join('')));
    if (f.down.length) tiles.push(tile(`${icon('arrow-down', 'ic-s')} ${t('Course difficile')}`, f.down.map((m) => move(m, false)).join('')));
    if (f.leaderStrat.length) {
      const stops = f.leaderStrat.length - 1;
      tiles.push(tile(t('Stratégie de {}', f.top[0].name), `<div class="rp-tyres">${tyres(f.leaderStrat)}</div><div class="muted small">${stops === 1 ? t('1 arrêt') : stops ? t('{} arrêts', stops) : t('Aucun arrêt')}</div>`));
    }
    if (f.common) tiles.push(tile(t('Stratégie la plus courante'), `<div class="rp-tyres">${tyres(f.common.comps)}</div><div class="muted small">${t('{} pilotes', f.common.count)}</div>`));
    const neut = [
      ...f.sc.map((l) => `<span class="rp-chip sc">${t('Voiture de sécurité')} · ${lapNo(l)}</span>`),
      ...f.vsc.map((l) => `<span class="rp-chip vsc">VSC · ${lapNo(l)}</span>`),
      ...f.red.map((l) => `<span class="rp-chip red">${t('Drapeau rouge')} · ${lapNo(l)}</span>`),
    ];
    tiles.push(tile(t('Neutralisations'), neut.length ? `<div class="rp-chips">${neut.join('')}</div>` : `<div class="rp-calm"><span class="rp-chip green">${t('Drapeau vert')}</span> <span class="muted small">${f.final ? t('de bout en bout') : t('aucune jusqu\'ici')}</span></div>`));
    if (f.out.length) tiles.push(tile(t('Abandons'), `<div class="rp-chips">${f.out.map((d) => `<span class="rp-chip out">${who(d, dl)}</span>`).join('')}</div>`));
    if (f.fastest) tiles.push(tile(t('Meilleur tour'), `<div class="rp-row">${who(f.fastest, dl, true)}</div><div class="rp-best">${esc(f.fastest.time)}</div><div class="muted small">${f.fastest.lap ? t('Tour {}', f.fastest.lap) : ''}</div>`, 'fl'));
  } else if (f.kind === 'quali') {
    for (const p of Object.keys(f.knocked).sort()) tiles.push(tile(t('Éliminés en Q{}', p), `<div class="rp-chips">${f.knocked[p].map((d) => `<span class="rp-chip">${who(d, dl)} <span class="muted">P${d.pos}</span></span>`).join('')}</div>`));
  } else if (f.mostLaps) {
    tiles.push(tile(t('Le plus de tours'), `<div class="rp-row">${who(f.mostLaps, dl, true)}</div><div class="rp-best plain">${f.mostLaps.laps}</div><div class="muted small">${t('tours')}</div>`));
  }
  if (f.kind !== 'race' && f.red.length) tiles.push(tile(t('Drapeaux rouges'), `<div class="rp-chips">${f.red.map((l) => `<span class="rp-chip red">${t('Drapeau rouge')}${l ? ` · ${lapNo(l)}` : ''}</span>`).join('')}</div>`));
  if (f.penalties.length) tiles.push(tile(t('Pénalités'), f.penalties.map((p) => `<div class="rp-row">${esc(p)}</div>`).join('')));
  return `${podium(f, dl)}${tiles.length ? `<div class="rp-tiles">${tiles.join('')}</div>` : ''}`;
}

// Classement complet de la séance
export function classificationHtml(state) {
  const f = summaryFacts(state);
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const stats = state?.TimingStats?.Lines || {};
  if (!f.ranked.length) return '';
  const name = (n) => `<td><span class="rp-c-drv">${teamMark(dl[n] || {})}<b>${esc(dl[n]?.Tla || n)}</b> <span class="muted">${esc(dl[n]?.LastName || '')}</span></span></td>`;
  let head, rows;
  if (f.kind === 'race') {
    const outSet = new Set((f.out || []).map((d) => d.n));
    head = `<th>${t('Pos.')}</th><th>${t('Pilote')}</th><th>${t('Grille')}</th><th>${t('Écart')}</th><th>${t('Tours')}</th><th>${t('Arrêts')}</th><th>${t('Pneus')}</th><th>${t('Meilleur tour')}</th>`;
    rows = f.ranked.map((n, i) => {
      const l = lines[n], grid = Number(app[n]?.GridPos) || null, pos = Number(l.Position);
      const d = grid ? grid - pos : 0;
      const gap = outSet.has(n) ? `<span class="rp-dnf">${t('Abandon')}</span>` : i === 0 ? (f.final ? t('Vainqueur') : t('En tête')) : gapText(l.GapToLeader);
      const pb = stats[n]?.PersonalBestLapTime;
      return `<tr class="${outSet.has(n) ? 'out' : ''}"><td class="rp-c-pos">${pos}</td>${name(n)}
        <td>${grid ? `${grid}${d ? ` <span class="rp-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}` : '—'}</td>
        <td class="rp-num">${gap}</td><td class="rp-num">${esc(l.NumberOfLaps ?? '—')}</td><td class="rp-num">${realStopCount(app[n], l)}</td>
        <td><span class="rp-c-tyres">${realStints(list(app[n]?.Stints)).map((s) => tyreBadge(s?.Compound)).join('')}</span></td>
        <td class="rp-num ${pb?.Position === 1 ? 'rp-purple' : ''}">${esc(pb?.Value || '—')}</td></tr>`;
    });
  } else if (f.kind === 'quali') {
    head = `<th>${t('Pos.')}</th><th>${t('Pilote')}</th><th>Q1</th><th>Q2</th><th>Q3</th><th>${t('Écart')}</th>`;
    const pole = Math.min(...f.ranked.map((n) => list(lines[n].BestLapTimes)[2]?.Value).filter(Boolean).map(sec).filter((x) => x > 0));
    rows = f.ranked.map((n) => {
      const l = lines[n], q = list(l.BestLapTimes);
      const last = [2, 1, 0].find((i) => q[i]?.Value);
      const gap = last === 2 && Number.isFinite(pole) && sec(q[2].Value) > pole ? `+${(sec(q[2].Value) - pole).toFixed(3).replace('.', DEC)} s` : '';
      return `<tr class="${l.KnockedOut ? 'out' : ''}"><td class="rp-c-pos">${esc(l.Position)}</td>${name(n)}
        ${[0, 1, 2].map((i) => `<td class="rp-num">${esc(q[i]?.Value || '—')}</td>`).join('')}<td class="rp-num">${gap}</td></tr>`;
    });
  } else {
    head = `<th>${t('Pos.')}</th><th>${t('Pilote')}</th><th>${t('Meilleur tour')}</th><th>${t('Écart')}</th><th>${t('Tours')}</th>`;
    rows = f.ranked.map((n) => {
      const l = lines[n];
      return `<tr><td class="rp-c-pos">${esc(l.Position)}</td>${name(n)}<td class="rp-num">${esc(l.BestLapTime?.Value || '—')}</td>
        <td class="rp-num">${l.TimeDiffToFastest ? gapText(l.TimeDiffToFastest) : ''}</td><td class="rp-num">${esc(l.NumberOfLaps ?? '—')}</td></tr>`;
    });
  }
  return `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// 83.456 -> « 1:23.456 »
const fmtSec = (v) => `${Math.floor(v / 60)}:${(v % 60).toFixed(3).padStart(6, '0')}`;

// « 1:23.456 » -> secondes
function sec(v) {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(v || '').trim());
  return m ? (Number(m[1]) || 0) * 60 + Number(m[2]) : NaN;
}

// Graphique sous les cartes (page Résultats) : en course, la stratégie de chaque pilote (relais
// colorés par pneu, longueur = tours) ; en qualifications et en essais, l'écart au meilleur temps.
export function chartHtml(state) {
  const f = summaryFacts(state);
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  if (!f.ranked.length) return '';
  const label = (n) => `<span class="rp-bar-who">${teamMark(dl[n] || {})}<b>${esc(dl[n]?.Tla || n)}</b></span>`;
  if (f.kind === 'race') {
    const total = Number(f.total) || Math.max(...f.ranked.map((n) => Number(lines[n]?.NumberOfLaps) || 0), 1);
    const rows = f.ranked.map((n) => {
      const stints = realStints(list(app[n]?.Stints));
      const segs = stints.map((s) => {
        const laps = Math.max(0, (Number(s?.TotalLaps) || 0) - (Number(s?.StartLaps) || 0));
        const ci = compoundInfo(s?.Compound);
        return laps ? `<i style="width:${(laps / total) * 100}%;--tc:${ci.color}" title="${esc(ci.name)} · ${t('{} tours', laps)}">${laps >= 6 ? `${ci.letter} ${laps}` : ''}</i>` : '';
      }).join('');
      return `<div class="rp-bar-row">${label(n)}<div class="rp-stints">${segs}</div></div>`;
    }).join('');
    return `<section class="rp-tile rp-chart"><h4>${t('Stratégies')}</h4>${rows}
      <div class="muted small">${t('Un bloc = un relais (pneu, tours), pilotes dans l\'ordre final.')}</div></section>`;
  }
  // Qualifications et essais : écart au meilleur tour de la séance (en qualifs : le meilleur des parties)
  const best = (n) => Math.min(...[lines[n]?.BestLapTime?.Value, ...list(lines[n]?.BestLapTimes).map((x) => x?.Value)].map(sec).filter((v) => v > 0));
  const times = f.ranked.map((n) => [n, best(n)]).filter(([, v]) => Number.isFinite(v));
  if (!times.length) return '';
  const top = Math.min(...times.map(([, v]) => v));
  const max = Math.max(...times.map(([, v]) => v - top), 0.001);
  const rows = times.map(([n, v]) => {
    const g = v - top;
    const col = (dl[n]?.TeamColour && `#${dl[n].TeamColour}`) || '#8b95a8';
    return `<div class="rp-bar-row">${label(n)}<div class="rp-gapbar"><i style="width:${Math.max(1.5, (g / max) * 100)}%;background:${col}"></i></div><span class="rp-num rp-gapv">${g ? `+${g.toFixed(3).replace('.', DEC)}` : fmtSec(v)}</span></div>`;
  }).join('');
  return `<section class="rp-tile rp-chart"><h4>${t('Écarts au meilleur tour de la séance')}</h4>${rows}</section>`;
}

// Chiffres de la séance (page Résultats, sous le classement) : arrêts, limites de piste, enquêtes,
// neutralisations, abandons, météo
export function numbersHtml(state) {
  const f = summaryFacts(state);
  if (!f.ranked.length) return '';
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const msgs = list(state?.RaceControlMessages?.Messages).map((m) => String(m?.Message || ''));
  const w = state?.WeatherData || {};
  const items = [];
  if (f.kind === 'race') {
    items.push([f.ranked.reduce((s, n) => s + realStopCount(app[n], lines[n]), 0), t('arrêts aux stands')]);
    items.push([f.ranked.length - f.out.length, t('pilotes classés')]);
    items.push([f.out.length, t('abandons')]);
    items.push([f.sc.length + f.vsc.length + f.red.length, t('neutralisations')]);
  } else {
    items.push([f.ranked.reduce((s, n) => s + (Number(lines[n]?.NumberOfLaps) || 0), 0), t('tours bouclés')]);
  }
  items.push([msgs.filter((m) => /(TIME|LAP) DELETED/.test(m)).length, t('temps supprimés (limites de piste)')]);
  items.push([msgs.filter((m) => /UNDER INVESTIGATION/.test(m)).length, t('enquêtes des commissaires')]);
  items.push([f.penalties.length, t('pénalités')]);
  if (w.TrackTemp) items.push([`${String(w.TrackTemp).replace('.', DEC)}°`, t('piste')]);
  if (w.AirTemp) items.push([`${String(w.AirTemp).replace('.', DEC)}°`, t('air')]);
  return `<section class="sz-box rp-numbers"><h3>${t('Chiffres de la séance')}</h3>
    <div class="rp-num-grid">${items.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div></section>`;
}
