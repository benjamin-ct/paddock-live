// Vues détaillées de l'espace « Saison » à partir de l'analyse des archives F1 Live Timing
// (/api/season/stats) et des résultats Jolpica : statistiques par pilote, régularité,
// arrêts aux stands, vitesses de pointe et profil des circuits.
import { esc, teamColor, teamMark } from '../util.js';
import { cleanLaps, lapsLed, similarCircuits, SEASON_CRITERIA, MATE_CRITERIA, GRADES, retired } from '/shared/season-calc.js';
import { icon } from '../icons.js';
import { DEC, LANG, t } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';
import { CIRCUIT_DNA, DNA_KEYS } from '/shared/circuit-dna.js';
import { nearestShape, shapeOutline } from '/shared/circuit-shapes.js';

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null;
};
const fr = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d).replace('.', DEC));
// Immobilisation : au centième quand elle vient de DHL, au dixième (F1) sinon
export const stopTxt = (s) => `${fr(s.stop, s.dhl ? 2 : 1)} s`;
export const DHL_NOTE = '<p class="muted small">Immobilisations au centième : DHL Fastest Pit Stop Award ; sans relevé DHL, au dixième (chronos de la F1). Copyright © DHL International GmbH. All Rights Reserved.</p>';
export const fmtLap = (s) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return `${m ? `${m}:` : ''}${(s - m * 60).toFixed(3).padStart(m ? 6 : 5, '0')}`.replace('.', DEC);
};
const isNum = (x) => /^\d+$/.test(x?.posText || '');
const STATUS_FR = { Finished: 'Arrivé', Retired: 'Abandon', Disqualified: 'Disqualifié', 'Did not start': 'Non partant', Withdrew: 'Forfait', Accident: 'Accident', Collision: 'Accrochage', Engine: 'Moteur', Gearbox: 'Boîte de vitesses', Hydraulics: 'Hydraulique', Brakes: 'Freins', Lapped: 'À un tour ou plus' };
export const statusFr = (st) => {
  const m = /^\+(\d+) Laps?$/.exec(st || '');
  return m ? `+${m[1]} tour${m[1] > 1 ? 's' : ''}` : STATUS_FR[st] || st || '';
};
const short = (name) => gpShort(name, LANG);
const mark = (team, col) => teamMark({ TeamName: team, TeamColour: col?.replace('#', '') });
const tcol = (team, col) => teamColor({ TeamName: team, TeamColour: col?.replace('#', '') });

// Pilotes de l'archive, indexés par trigramme pour chaque manche
function byRound(stats) {
  const m = new Map();
  for (const r of stats?.races || []) m.set(r.round, { race: r, by: new Map(r.drivers.map((d) => [d.tla, d])) });
  return m;
}

// Note sur 100 avec sa lettre (S, A, B, C, D, F)
export const gradeBadge = (score, g, big = false) => (score === null || score === undefined ? '<span class="muted">—</span>'
  : `<span class="sz-grade g-${g}${big ? ' big' : ''}">${g}</span><span class="sz-grade-n">${score}</span>`);

// Graphiques dessinés à la largeur réelle de la page (textes et traits gardent leur taille, pas étirés)
const pageWidth = () => Math.max(600, (document.querySelector('#szContent')?.clientWidth || 934) - 34);
const halfWidth = () => Math.max(300, Math.round(pageWidth() / 2 - 30));

const PLACES = 22;   // voitures en 2026 ; en course et en sprint, la dernière colonne : abandons
// Répartition des places (course, sprint ou qualifs) ; en qualifs, traits des éliminations après la 16e (Q1) et la
// 10e place (Q2)
let histKind = 'race';
export const setHistKind = (k) => { histKind = k; };
function placeHistogram(list, col, quali = false) {
  const n = new Array(PLACES + (quali ? 0 : 1)).fill(0);
  for (const x of list) {
    if (quali) { if (x.pos >= 1 && x.pos <= PLACES) n[x.pos - 1]++; } else if (isNum(x) || retired(x)) n[isNum(x) && x.pos <= PLACES ? x.pos - 1 : PLACES]++;
  }
  const hi = Math.max(1, ...n);
  const W = halfWidth(), H = 170, pl = 6, pt = quali ? 16 : 0, pb = 22, bw = (W - pl * 2) / n.length;
  const bars = n.map((v, i) => {
    const h = ((H - pb - pt - 16) * v) / hi;
    const x = pl + i * bw;
    const c = i === PLACES ? 'var(--red)' : i < 3 ? '#ffd166' : col;
    return `${v ? `<rect x="${x + 2}" y="${H - pb - h}" width="${bw - 4}" height="${h}" rx="2" fill="${c}"><title>${i === PLACES ? 'Abandons' : `P${i + 1}`} : ${v}</title></rect><text x="${x + bw / 2}" y="${H - pb - h - 4}" class="sz-ax" text-anchor="middle">${v}</text>` : ''}
      ${bw >= 14 || i % 2 === 0 || i === PLACES ? `<text x="${x + bw / 2}" y="${H - 6}" class="sz-ax" text-anchor="middle">${i === PLACES ? 'Ab' : i + 1}</text>` : ''}`;
  }).join('');
  const cuts = quali ? [[0, 10, 'Q3'], [10, 16, 'Q2'], [16, PLACES, 'Q1']].map(([a, b, l]) => `${a ? `<line x1="${pl + a * bw}" x2="${pl + a * bw}" y1="2" y2="${H - pb}" class="sz-gl" stroke-dasharray="3 3"/>` : ''}<text x="${pl + ((a + b) / 2) * bw}" y="11" class="sz-ax" text-anchor="middle">${l}</text>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="sz-svg">${cuts}${bars}</svg>`;
}

// Points cumulés manche par manche : saison affichée et saison précédente
function pointsVsPrev(drv, data, prev, col) {
  const cum = (d, code) => {
    let t = 0;
    return d.races.filter((r) => r.results.length).map((r) => {
      t += (r.results.find((x) => x.code === code)?.points || 0) + (r.sprintResults.find((x) => x.code === code)?.points || 0);
      return t;
    });
  };
  if (!prev) return '<div class="note small">Chargement de la saison précédente…</div>';
  if (prev.error) return `<div class="note small">Saison ${data.year - 1} indisponible.</div>`;
  const now = cum(data, drv.code);
  const before = prev.races.some((r) => r.results.some((x) => x.code === drv.code)) ? cum(prev, drv.code) : null;
  if (!before) return `<div class="note small">${esc(drv.last || drv.name)} n'a pas couru en ${data.year - 1}.</div>`;
  const W = halfWidth(), H = 170, pl = 34, pr = 50, pt = 8, pb = 22;
  const nMax = Math.max(now.length, before.length);
  const yMax = Math.max(1, ...now, ...before);
  const X = (i) => pl + (i / Math.max(1, nMax - 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - v / yMax) * (H - pt - pb);
  const step = Math.max(25, Math.ceil(yMax / 4 / 25) * 25);
  let grid = '';
  for (let v = 0; v <= yMax; v += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 5}" y="${Y(v) + 4}" class="sz-ax" text-anchor="end">${v}</text>`;
  for (let i = 0; i < nMax; i += Math.ceil(nMax / 8)) grid += `<text x="${X(i)}" y="${H - 6}" class="sz-ax" text-anchor="middle">${i + 1}</text>`;
  const line = (a, c, dash) => `<polyline fill="none" stroke="${c}" stroke-width="2.2" ${dash ? 'stroke-dasharray="5 4"' : 'pathLength="1"'} points="${a.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>`;
  const lbl = (a, c, txt) => `<text x="${X(a.length - 1) + 5}" y="${Y(a.at(-1)) + 4}" fill="${c}" class="sz-lbl">${txt}</text>`;
  const same = before[now.length - 1];
  const diff = same !== undefined ? now.at(-1) - same : null;
  return `<svg viewBox="0 0 ${W} ${H}" class="sz-svg">${grid}${line(before, 'var(--muted)', true)}${line(now, col)}${lbl(before, 'var(--muted)', data.year - 1)}${now.length ? lbl(now, col, data.year) : ''}</svg>
    ${diff !== null ? `<div class="small muted">Après ${now.length} courses : <b class="${diff >= 0 ? 'sz-up' : 'sz-down'}">${diff >= 0 ? '+' : ''}${diff} pts</b> par rapport à ${data.year - 1} (${now.at(-1)} contre ${same}).</div>` : ''}`;
}

function pendingNote(stats) {
  if (!stats) return '<div class="note">Chargement des statistiques détaillées…</div>';
  if (stats.error) return `<div class="note">Statistiques détaillées indisponibles (${esc(stats.error)}).</div>`;
  if (stats.pending || stats.done < stats.total) {
    return `<div class="note">${stats.pending ? `${icon('hourglass')} Analyse des courses de la saison` : 'Courses analysées'} : <b>${stats.done} / ${stats.total}</b></div>`;
  }
  return '';
}

// Barres horizontales [{label, html?, v, text, color}]
function hbars(rows, { max, invert = false } = {}) {
  const vals = rows.map((r) => r.v).filter((v) => v !== null);
  const hi = max ?? Math.max(...vals), lo = invert ? Math.min(...vals) : 0;
  return `<div class="sz-hbars">${rows.map((r) => {
    const w = r.v === null ? 0 : invert ? (hi === lo ? 100 : 25 + (75 * (hi - r.v)) / (hi - lo)) : (100 * r.v) / (hi || 1);
    return `<div class="sz-hbar"><div class="sz-hb-l">${r.html || esc(r.label)}</div><div class="sz-hb-t"><i style="width:${Math.max(2, w)}%;background:${r.color || 'var(--accent)'}"></i></div><div class="sz-hb-v">${r.text}</div></div>`;
  }).join('')}</div>`;
}

// Cellule de carte thermique (0 = meilleur … 1 = moins bon)
const heat = (k, txt) => (k === null ? '<td class="sz-hm muted">—</td>'
  : `<td class="sz-hm" style="background:color-mix(in srgb, ${k < 0.5 ? 'var(--green)' : 'var(--orange)'} ${Math.round(Math.abs(k - 0.5) * 2 * 55)}%, transparent)">${txt}</td>`);

// ---------------- Pilotes ----------------
export function renderDrivers(ctx, code) {
  const { data, stats } = ctx;
  const drv = data.drivers.find((d) => d.code === code) || data.drivers[0];
  if (!drv) return '<div class="note">Pas encore de résultats.</div>';
  const races = data.races.filter((r) => r.results.length);
  const R = byRound(stats);
  const rows = races.map((r) => {
    const res = r.results.find((x) => x.code === drv.code);
    const q = r.quali.find((x) => x.code === drv.code);
    const spr = r.sprintResults.find((x) => x.code === drv.code);
    const a = R.get(r.round)?.by.get(drv.code);
    return { r, res, q, spr, a };
  }).filter((x) => x.res || x.q);
  const started = rows.filter((x) => x.res);
  const fin = started.filter((x) => isNum(x.res));
  const mate = (r) => r.results.find((x) => x.teamId === drv.teamId && x.code !== drv.code);
  let qd = [0, 0];
  for (const x of rows) {
    const m = x.r.quali.find((y) => y.teamId === drv.teamId && y.code !== drv.code);
    if (x.q?.pos && m?.pos) qd[x.q.pos < m.pos ? 0 : 1]++;
  }
  const mateName = rows.map((x) => mate(x.r)).find(Boolean)?.last;
  const tops = rows.map((x) => x.a?.speeds?.ST).filter(Boolean);
  const stops = rows.flatMap((x) => x.a?.stops || []).map((s) => s.stop).filter((v) => v > 0 && v < 15);
  const sig = rows.map((x) => { const c = x.a && cleanLaps(x.a); return c ? sd(c) : null; }).filter((v) => v !== null);
  const gained = started.filter((x) => x.res.grid && isNum(x.res)).reduce((n, x) => n + (x.res.grid - x.res.pos), 0);
  const col = ctx.color(drv.team, drv.teamId);
  const card = (label, v, sub = '') => `<div class="sz-card sz-kpi"><div class="muted small">${label}</div><div class="sz-big">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
  const pts = started.reduce((n, x) => n + x.res.points, 0) + rows.reduce((n, x) => n + (x.spr?.points || 0), 0);
  const rt = ctx.ratings?.find((e) => e.code === drv.code);
  const led = rows.map((x) => (x.a ? lapsLed(x.a) : null));
  const ledTotal = led.reduce((n, v) => n + (v || 0), 0);
  const climb = started.filter((x) => x.res.grid && isNum(x.res)).sort((a, b) => (b.res.grid - b.res.pos) - (a.res.grid - a.res.pos))[0];

  // Graphique : position au départ (pointillés) et à l'arrivée, manche par manche
  const W = pageWidth(), H = 230, pl = 30, pr = 12, pt = 10, pb = 24;
  const rounds = races.map((r) => r.round);
  const X = (rd) => pl + ((rounds.indexOf(rd)) / Math.max(1, rounds.length - 1)) * (W - pl - pr);
  const Y = (p) => pt + ((p - 1) / 21) * (H - pt - pb);
  const line = (pts2, dash) => `<polyline fill="none" stroke="${col}" stroke-width="2.2" ${dash ? 'stroke-dasharray="4 4" opacity=".6"' : 'pathLength="1"'} points="${pts2.map(([x, y]) => `${x},${y}`).join(' ')}"/>`;
  const finPts = started.filter((x) => isNum(x.res)).map((x) => [X(x.r.round), Y(x.res.pos)]);
  const gridPts = started.filter((x) => x.res.grid).map((x) => [X(x.r.round), Y(x.res.grid)]);
  let grid = '';
  for (const p of [1, 5, 10, 15, 20]) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(p)}" y2="${Y(p)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(p) + 4}" class="sz-ax" text-anchor="end">${p}</text>`;
  for (const rd of rounds) grid += `<text x="${X(rd)}" y="${H - 6}" class="sz-ax" text-anchor="middle">R${rd}</text>`;
  const dots = started.map((x) => (isNum(x.res)
    ? `<circle cx="${X(x.r.round)}" cy="${Y(x.res.pos)}" r="${x.res.pos <= 3 ? 5 : 3.5}" fill="${x.res.pos === 1 ? '#ffd166' : col}" stroke="var(--panel)" stroke-width="1.5"><title>R${x.r.round} ${esc(short(x.r.name))} : P${x.res.pos}</title></circle>`
    : `<path d="M${X(x.r.round) - 3.5} ${H - pb - 9}l7 7m0 -7l-7 7" class="sz-dnf-x"/>`)).join('');
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="sz-svg">${grid}${line(gridPts, true)}${line(finPts)}${dots}</svg>`;

  // Cartes des pilotes (portrait sur la couleur de l'écurie, logo en filigrane) : la carte touchée choisit le pilote
  const look = (d) => { const logo = ctx.logo(d.team); return `--tc:${ctx.color(d.team, d.teamId)}${logo ? `;--logo:url('${logo}')` : ''}`; };
  const pic = (d) => { const u = ctx.photo(d); return u ? `<img src="${u}" alt="" loading="lazy" onerror="this.remove()">` : ''; };
  return `<div class="sz-drv-strip">${data.drivers.map((d) => `<button type="button" class="sz-drv-card${d.code === drv.code ? ' on' : ''}" data-szdrv="${esc(d.code)}" style="${look(d)}" aria-pressed="${d.code === drv.code}">
      <span class="nm">${esc(d.last || d.name)}</span><span class="tm">${esc(d.team)}</span><b class="no">${esc(d.number || '')}</b>${pic(d)}</button>`).join('')}</div>
    <div class="sz-drv-hero" style="${look(drv)}"><div class="txt"><div class="sz-drv-name">${esc(drv.name)}</div><b class="no">${esc(drv.number || '')}</b>
      <div class="sub">${esc(drv.team)} · P${drv.pos} au championnat · ${drv.points} pts</div></div>${pic(drv)}</div>
    <div class="sz-cards sz-kpis">
      ${card('Victoires', drv.wins || 0)}
      ${card('Podiums', fin.filter((x) => x.res.pos <= 3).length)}
      ${card('Poles', rows.filter((x) => x.q?.pos === 1).length)}
      ${card('Meilleurs tours', started.filter((x) => x.res.fastest).length)}
      ${card('Points par course', fr(started.length ? pts / started.length : null), `${pts} pts en ${started.length} GP (sprints inclus)`)}
      ${card('Dans les points', `${started.filter((x) => x.res.points > 0).length}/${started.length}`)}
      ${card('Moyenne au départ', fr(mean(started.map((x) => x.res.grid).filter(Boolean))))}
      ${card('Moyenne à l\'arrivée', fr(mean(fin.map((x) => x.res.pos))), fin.length ? `meilleur : P${Math.min(...fin.map((x) => x.res.pos))}` : '')}
      ${card('Places gagnées', `${gained >= 0 ? '+' : ''}${gained}`, 'de la grille à l\'arrivée, cumul')}
      ${card('Abandons', started.filter((x) => retired(x.res)).length)}
      ${card('Duel qualif', `${qd[0]} – ${qd[1]}`, mateName ? `face à ${esc(mateName)}` : '')}
      ${card('Vitesse de pointe', tops.length ? `${Math.max(...tops)} km/h` : '—', tops.length ? `moyenne ${fr(mean(tops), 0)} km/h` : '')}
      ${card('Immobilisation moyenne', stops.length ? `${fr(mean(stops))} s` : '—', stops.length ? `${stops.length} arrêts` : '')}
      ${card('Régularité', sig.length ? `${fr(median(sig), 3)} s` : '—', 'écart-type médian des tours')}
      ${card('Tours en tête', stats?.races ? ledTotal : '—', stats?.races ? `${led.filter((v) => v > 0).length} course(s) menée(s)` : '')}
      ${card('Plus belle remontée', climb && climb.res.grid > climb.res.pos ? `+${climb.res.grid - climb.res.pos}` : '—', climb && climb.res.grid > climb.res.pos ? `P${climb.res.grid} ${icon('arrow-right', 'ic-s')} P${climb.res.pos} · ${esc(short(climb.r.name))}` : '')}
      ${card('Note de la saison', rt ? gradeBadge(rt.season, rt.seasonGrade, true) : '—', rt?.season !== null && rt ? `<button class="linkish" data-szgo="ratings">voir le détail ${icon('arrow-right', 'ic-s')}</button>` : 'pas assez de courses')}
      ${card('Note face au coéquipier', rt ? gradeBadge(rt.mate, rt.mateGrade, true) : '—', rt?.mates?.length ? `face à ${esc(rt.mates.join(', '))}` : '')}
    </div>
    <section class="sz-box"><h3>Départ (pointillés) et arrivée, course par course</h3>${chart}</section>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Répartition des places</h3>
        <div class="tab-seg">${[['race', 'Course'], ['quali', 'Qualifs'], ['sprint', 'Sprint']].map(([k, l]) => `<button type="button" data-hist="${k}" class="${histKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${histKind === 'quali' ? placeHistogram(rows.map((x) => x.q).filter(Boolean), col, true)
    : histKind === 'sprint' ? (rows.some((x) => x.spr) ? placeHistogram(rows.map((x) => x.spr).filter(Boolean), col) : '<div class="note small">Aucun sprint couru cette saison.</div>')
      : placeHistogram(started.map((x) => x.res), col)}</section>
      <section class="sz-box"><h3>Points cumulés : ${data.year} et ${data.year - 1}</h3>${pointsVsPrev(drv, data, ctx.prev, col)}</section>
    </div>
    <section class="sz-box"><h3>Courses</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Qualif.</th><th>Grille</th><th>Arrivée</th><th>Points</th><th>En tête</th><th>Meilleur tour</th><th>V. max</th><th>Arrêts</th><th>Statut</th></tr>
      ${rows.map((x, i) => `<tr><td>R${x.r.round}</td><td>${esc(short(x.r.name))}${x.spr ? ` <span class="sz-tag sprint">Sprint P${x.spr.pos ?? '—'}</span>` : ''}</td><td>${x.q?.pos ? `P${x.q.pos}` : '—'}</td>
        <td>${x.res?.grid ? `P${x.res.grid}` : x.res ? 'Stands' : '—'}</td><td><b>${x.res ? (isNum(x.res) ? `P${x.res.pos}` : 'Abandon') : '—'}</b></td><td>${x.res?.points || ''}</td><td>${led[i] ? `${led[i]} t.` : x.a ? '' : '—'}</td>
        <td>${x.a?.best ? fmtLap(x.a.best) : '—'}${x.res?.fastest ? ' <span class="sz-tag sprint">MT</span>' : ''}</td><td>${x.a?.speeds?.ST ? `${x.a.speeds.ST} km/h` : '—'}</td>
        <td>${x.a ? x.a.stops.map(stopTxt).join(' · ') || '0' : '—'}</td><td class="muted small">${esc(statusFr(x.res?.status))}</td></tr>`).join('')}</table></section>
    ${rows.some((x) => x.a?.stops.some((s) => s.dhl)) ? DHL_NOTE : ''}${pendingNote(stats)}`;
}

// ---------------- Notes des pilotes ----------------
const pctTxt = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)}`);
const METRIC_SHORT = { ppr: 'Pts / course', pace: 'Rythme', avgFinish: 'Arrivée moy.', avgQuali: 'Qualif moy.', gained: 'Places gagnées', finishRate: 'Arrivées' };
const METRIC_FMT = {
  ppr: (v) => fr(v), pace: (v) => (v === null ? '—' : `+${fr(v, 2)} %`), avgFinish: (v) => fr(v), avgQuali: (v) => fr(v),
  gained: (v) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${fr(v)}`), finishRate: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
};

export function renderRatings(ctx, sortBy = 'season') {
  const { stats } = ctx;
  const all = ctx.ratings || [];
  if (!all.length) return '<div class="note">Pas encore de résultats.</div>';
  // Tri par la colonne touchée : note de la saison, face au coéquipier, ou un critère (rang parmi les pilotes, meilleur en haut)
  const val = (e) => (sortBy === 'season' || sortBy === 'mate' ? e[sortBy] : e.parts[sortBy]) ?? -1;
  const rows = [...all].sort((a, b) => val(b) - val(a) || b.pts - a.pts);
  const th = (k, label, title = 'Trier par cette colonne') => `<th class="sz-sort${k === sortBy ? ' on' : ''}"><button type="button" data-rate-sort="${k}" title="${esc(title)}">${label}</button></th>`;
  // Nom de famille seul (nom complet et écurie au survol) : les 12 colonnes tiennent dans la case
  const drvCell = (e) => `${ctx.bar(e.team, e.teamId)}<b title="${esc(`${e.name} · ${e.team}`)}">${esc(e.last || e.name)}</b>`;
  const top = (k) => rows.filter((e) => e[k] !== null).sort((a, b) => b[k] - a[k])[0];
  const best = top('season'), bestMate = top('mate');
  const card = (title, e, k, g) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${e ? `${ctx.bar(e.team, e.teamId)}${esc(e.last || e.name)}` : '—'}</div><div class="small">${e ? gradeBadge(e[k], e[g]) : ''}</div></div>`;
  const noPace = !stats?.races?.length;
  return `${pendingNote(stats)}
    <div class="sz-cards">${card('Meilleure note de la saison', best, 'season', 'seasonGrade')}${card('Domine le plus son coéquipier', bestMate, 'mate', 'mateGrade')}
      <div class="sz-card"><div class="muted small">Barème</div><div class="sz-grade-scale">${GRADES.map(([g, min], i) => `<span><span class="sz-grade g-${g}">${g}</span> ${min > -Infinity ? `${min}${i ? `–${GRADES[i - 1][1] - 1}` : '+'}` : `< ${GRADES[i - 1][1]}`}</span>`).join('')}</div></div>
    </div>
    <section class="sz-box"><h3>Notes des pilotes</h3><div class="sz-scroll"><table class="sz-table sz-rate"><tr><th>#</th><th>Pilote</th>${th('season', 'Saison')}${th('mate', 'Coéquipier')}
      ${SEASON_CRITERIA.map(([k, , l]) => th(k, METRIC_SHORT[k], l)).join('')}<th>Duels Q / C</th><th>Écart qualif</th></tr>
      ${rows.map((e, i) => `<tr class="${e.season === null ? 'muted' : ''}"><td>${i + 1}</td><td>${drvCell(e)}</td><td class="sz-rate-g">${gradeBadge(e.season, e.seasonGrade)}</td><td class="sz-rate-g">${gradeBadge(e.mate, e.mateGrade)}</td>
        ${SEASON_CRITERIA.map(([k]) => heat(e.parts[k] === null || e.parts[k] === undefined ? null : 1 - e.parts[k], `${METRIC_FMT[k](e.metrics[k])}`)).join('')}
        <td>${e.h2h.qa}–${e.h2h.qb} / ${e.h2h.ra}–${e.h2h.rb}</td><td>${e.gapPct === null ? '—' : `${e.gapPct <= 0 ? '−' : '+'}${fr(Math.abs(e.gapPct), 2)} %`}</td></tr>`).join('')}</table></div></section>
    <section class="sz-box sz-how"><h3>Comment les notes sont calculées</h3>
      <p><b>Note de la saison (sur 100)</b> : rang parmi les pilotes présents à 40 % des Grands Prix, pour chaque critère :</p>
      <ul>${SEASON_CRITERIA.map(([, w, l]) => `<li>${esc(l)} : <b>${w} %</b></li>`).join('')}</ul>
      <p class="small muted">Rythme : écart au plus rapide de chaque course${noPace ? ' (pas encore analysé)' : ''}. Abandon = dernière place.</p>
      <p><b>Note face au coéquipier (sur 100, 50 = à égalité)</b> : comparaison avec le coéquipier de chaque course.</p>
      <ul>${MATE_CRITERIA.map(([, w, l]) => `<li>${esc(l)} : <b>${w} %</b></li>`).join('')}</ul>
      <p class="small muted">Écart en qualification : médiane, dans la dernière partie disputée par les deux ; écarts de plus de 3 % ignorés. La voiture n'est pas prise en compte.</p>
    </section>`;
}

// ---------------- Régularité ----------------
export function renderConsistency(ctx) {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  // Par course : écart-type des tours propres, et rythme (écart de la médiane au meilleur pilote)
  const per = new Map();   // tla -> { d, sig: Map(round -> σ), pace: [] }
  for (const rd of rounds) {
    const { race } = R.get(rd);
    const meds = [];
    for (const d of race.drivers) {
      const c = cleanLaps(d);
      if (!c) continue;
      const e = per.get(d.tla) || { d, sig: new Map(), pace: [] };
      e.d = d;
      e.sig.set(rd, sd(c));
      e.med = e.med || new Map();
      e.med.set(rd, median(c));
      per.set(d.tla, e);
      meds.push(median(c));
    }
    const best = Math.min(...meds);
    for (const e of per.values()) if (e.med?.has(rd)) e.pace.push(((e.med.get(rd) - best) / best) * 100);
  }
  const rows = [...per.values()].filter((e) => e.sig.size >= Math.max(2, rounds.length / 3))
    .map((e) => ({ ...e, score: median([...e.sig.values()]), paceAvg: mean(e.pace) }))
    .sort((a, b) => a.score - b.score);
  // Régularité des résultats (Jolpica)
  const fin = new Map();
  for (const r of data.races.filter((x) => x.results.length)) {
    for (const x of r.results) {
      const f = fin.get(x.code) || { pos: [], n: 0, pts: 0 };
      f.n++;
      if (isNum(x)) f.pos.push(x.pos);
      if (x.points > 0) f.pts++;
      fin.set(x.code, f);
    }
  }
  const allSig = rows.flatMap((e) => [...e.sig.values()]);
  const lo = Math.min(...allSig), hi = Math.max(...allSig);
  const k = (v) => (v === undefined ? null : (v - lo) / ((hi - lo) || 1));
  return `${pendingNote(stats)}
    <p class="muted small">Régularité = écart-type des tours propres (hors 1er tour, stands, safety car) : plus bas = plus régulier. Rythme = écart au plus rapide de chaque course.</p>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Les plus réguliers (écart-type médian)</h3>${hbars(rows.map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.score, text: `${fr(e.score, 3)} s`, color: tcol(e.d.team, e.d.color) })), { invert: true })}</section>
      <section class="sz-box"><h3>Rythme de course (écart au plus rapide)</h3>${hbars([...rows].sort((a, b) => a.paceAvg - b.paceAvg).map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.paceAvg, text: `+${fr(e.paceAvg, 2)} %`, color: tcol(e.d.team, e.d.color) })), { invert: true })}</section>
    </div>
    <section class="sz-box"><h3>Écart-type par Grand Prix (s)</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Pilote</th>${rounds.map((rd) => `<th title="${esc(short(data.races.find((r) => r.round === rd)?.name))}">R${rd}</th>`).join('')}<th>Médiane</th></tr>
      ${rows.map((e) => `<tr><td>${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b></td>${rounds.map((rd) => heat(k(e.sig.get(rd)), e.sig.has(rd) ? fr(e.sig.get(rd), 2) : '—')).join('')}<td><b>${fr(e.score, 3)}</b></td></tr>`).join('')}</table></div></section>
    <section class="sz-box"><h3>Régularité des résultats</h3><table class="sz-table"><tr><th>Pilote</th><th>Arrivées</th><th>Dans les points</th><th>Position moyenne</th><th>Écart-type des positions</th></tr>
      ${data.drivers.map((d) => { const f = fin.get(d.code); return f ? `<tr><td>${ctx.bar(d.team, d.teamId)}<b>${esc(d.name)}</b></td><td>${f.pos.length}/${f.n}</td><td>${Math.round((f.pts / f.n) * 100)} %</td><td>${fr(mean(f.pos))}</td><td>${fr(sd(f.pos))}</td></tr>` : ''; }).join('')}</table></section>`;
}

// ---------------- Arrêts aux stands ----------------
export function renderPits(ctx) {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const all = [];
  for (const { race } of R.values()) for (const d of race.drivers) for (const s of d.stops) all.push({ ...s, d, round: race.round });
  const valid = all.filter((s) => s.stop > 0 && s.stop < 15);
  const name = (rd) => short(data.races.find((r) => r.round === rd)?.name);
  const teams = new Map();
  for (const s of all) {
    const t = teams.get(s.d.team) || { team: s.d.team, color: s.d.color, stops: [], n: 0, best: null };
    t.n++;
    if (s.stop > 0 && s.stop < 15) { t.stops.push(s.stop); if (!t.best || s.stop < t.best.stop) t.best = s; }
    teams.set(s.d.team, t);
  }
  const tl = [...teams.values()].filter((t) => t.stops.length).map((t) => ({ ...t, med: median(t.stops), under25: t.stops.filter((v) => v < 2.5).length }))
    .sort((a, b) => a.med - b.med);
  const fastest = [...valid].sort((a, b) => a.stop - b.stop).slice(0, 15);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  return `${pendingNote(stats)}
    <div class="sz-cards">
      <div class="sz-card sz-kpi"><div class="muted small">Arrêts</div><div class="sz-big">${all.length}</div><div class="muted small">${R.size} Grands Prix analysés</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Immobilisation médiane</div><div class="sz-big">${fr(median(valid.map((s) => s.stop)), 2)} s</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Arrêt le plus rapide</div><div class="sz-big">${fastest[0] ? stopTxt(fastest[0]) : '—'}</div><div class="muted small">${fastest[0] ? `${esc(fastest[0].d.team)} · ${esc(fastest[0].d.tla)} · R${fastest[0].round}` : ''}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Temps médian dans la voie des stands</div><div class="sz-big">${fr(median(all.map((s) => s.lane).filter((v) => v > 5 && v < 60)), 1)} s</div></div>
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Immobilisation médiane par écurie</h3>${hbars(tl.map((t) => ({ html: `${mark(t.team, t.color)}<b>${esc(t.team)}</b>`, v: t.med, text: `${fr(t.med, 2)} s`, color: tcol(t.team, t.color) })), { invert: true })}</section>
      <section class="sz-box"><h3>Les 15 arrêts les plus rapides</h3><table class="sz-table"><tr><th>#</th><th>Écurie</th><th>Pilote</th><th>Grand Prix</th><th>Tour</th><th>Immob.</th></tr>
        ${fastest.map((s, i) => `<tr><td>${i + 1}</td><td>${mark(s.d.team, s.d.color)}${esc(s.d.team)}</td><td><b>${esc(s.d.tla)}</b></td><td>R${s.round} ${esc(name(s.round))}</td><td>${s.lap ?? '—'}</td><td><b>${stopTxt(s)}</b></td></tr>`).join('')}</table></section>
    </div>
    <section class="sz-box"><h3>Écuries</h3><table class="sz-table"><tr><th>Écurie</th><th>Arrêts</th><th>Médiane</th><th>Meilleur</th><th>Sous 2,5 s</th></tr>
      ${tl.map((t) => `<tr><td>${mark(t.team, t.color)}<b>${esc(t.team)}</b></td><td>${t.n}</td><td>${fr(t.med, 2)} s</td><td>${stopTxt(t.best)}</td><td>${t.under25}</td></tr>`).join('')}</table></section>
    <section class="sz-box"><h3>Par Grand Prix</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Arrêts</th><th>Immob. médiane</th><th>Plus rapide</th><th>Voie des stands</th></tr>
      ${rounds.map((rd) => { const p = R.get(rd).race.profile; const f = valid.filter((s) => s.round === rd).sort((a, b) => a.stop - b.stop)[0];
        return `<tr><td>R${rd}</td><td>${esc(name(rd))}</td><td>${p.stops}</td><td>${p.stopMedian ? `${fr(p.stopMedian, 2)} s` : '—'}</td><td>${f ? `${stopTxt(f)} · ${esc(f.d.tla)}` : '—'}</td><td>${p.pitLane ? `${fr(p.pitLane, 1)} s` : '—'}</td></tr>`; }).join('')}</table></section>
    ${[...R.values()].some(({ race }) => race.dhl) ? DHL_NOTE : ''}`;
}

// ---------------- Vitesses de pointe ----------------
const SPEED_POINTS = { ST: 'Speed trap', FL: 'Ligne d\'arrivée', I1: 'Intermédiaire 1', I2: 'Intermédiaire 2' };

export function renderSpeeds(ctx, point = 'ST') {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  const drv = new Map();
  const team = new Map();   // team -> { color, byRound: Map(rd -> max) }
  for (const rd of rounds) {
    for (const d of R.get(rd).race.drivers) {
      const v = d.speeds?.[point];
      if (!v) continue;
      const e = drv.get(d.tla) || { d, vals: [] };
      e.vals.push(v);
      drv.set(d.tla, e);
      const t = team.get(d.team) || { team: d.team, color: d.color, by: new Map() };
      t.by.set(rd, Math.max(t.by.get(rd) || 0, v));
      team.set(d.team, t);
    }
  }
  const dl = [...drv.values()].map((e) => ({ ...e, max: Math.max(...e.vals), avg: mean(e.vals) })).sort((a, b) => b.max - a.max);
  const tl = [...team.values()].map((t) => ({ ...t, avg: mean([...t.by.values()]) })).sort((a, b) => b.avg - a.avg);
  const lo = Math.min(...dl.map((e) => e.avg)) - 3;
  const top = (rd) => Math.max(...[...team.values()].map((t) => t.by.get(rd) || 0));
  const low = (rd) => Math.min(...[...team.values()].map((t) => t.by.get(rd)).filter(Boolean));
  return `${pendingNote(stats)}
    <div class="sz-h2h-pick"><label class="small">Point de mesure <select id="szSpeedPt">${Object.entries(SPEED_POINTS).map(([k, l]) => `<option value="${k}" ${k === point ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Écuries : moyenne des meilleures vitesses par course</h3>${hbars(tl.map((t) => ({ html: `${mark(t.team, t.color)}<b>${esc(t.team)}</b>`, v: t.avg - lo, text: `${fr(t.avg, 1)} km/h`, color: tcol(t.team, t.color) })))}</section>
      <section class="sz-box"><h3>Pilotes : vitesse maximale de la saison</h3>${hbars(dl.slice(0, 22).map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.max - lo, text: `${e.max} km/h`, color: tcol(e.d.team, e.d.color) })))}</section>
    </div>
    <section class="sz-box"><h3>Meilleure vitesse de chaque écurie par Grand Prix (km/h)</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Écurie</th>${rounds.map((rd) => `<th title="${esc(short(data.races.find((r) => r.round === rd)?.name))}">R${rd}</th>`).join('')}<th>Moy.</th></tr>
      ${tl.map((t) => `<tr><td>${mark(t.team, t.color)}<b>${esc(t.team)}</b></td>${rounds.map((rd) => { const v = t.by.get(rd); if (!v) return '<td class="muted">—</td>'; const span = top(rd) - low(rd) || 1; return heat((top(rd) - v) / span, v); }).join('')}<td><b>${fr(t.avg, 1)}</b></td></tr>`).join('')}</table></div></section>
    <section class="sz-box"><h3>Vitesse maximale par Grand Prix</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Vitesse</th><th>Pilote</th></tr>
      ${rounds.map((rd) => { const b = R.get(rd).race.drivers.filter((d) => d.speeds?.[point]).sort((a, c) => c.speeds[point] - a.speeds[point])[0];
        return `<tr><td>R${rd}</td><td>${esc(short(data.races.find((r) => r.round === rd)?.name))}</td><td><b>${b ? `${b.speeds[point]} km/h` : '—'}</b></td><td>${b ? `${mark(b.team, b.color)}${esc(b.tla)}` : ''}</td></tr>`; }).join('')}</table></section>
    <p class="muted small">Meilleure vitesse de chaque pilote au point de mesure choisi.</p>`;
}

// ---------------- Profil des circuits ----------------
const SORTS = { round: 'Calendrier', avgSpeed: 'Vitesse moyenne', topSpeed: 'Vitesse de pointe', tyre: 'Contrainte sur les pneus', stopsPerCar: 'Arrêts par pilote', gains: 'Dépassements', neutral: 'Neutralisations', length: 'Longueur' };
// Sollicitation des pneus d'après le composé le plus dur choisi par Pirelli (C1 = le plus dur)
const STRESS = { 1: ['Très élevée', 5], 2: ['Élevée', 4], 3: ['Moyenne', 3], 4: ['Faible', 2], 5: ['Très faible', 1] };

// Circuits sans tracé dans l'API des cartes (Madring, nouveau ; Sepang, absent depuis 2017) : longueur et virages
// officiels (formula1.com : 5,414 km et 22 virages ; Sepang : 5,543 km et 15 virages)
// ADN du circuit : notes Pirelli de 1 à 5 (traction, adhérence, abrasion…), avec la source
export function dnaBlock(circuitId, head = true) {
  const n = CIRCUIT_DNA[circuitId];
  if (!n) return '';
  return `<div class="sz-dna">${head ? '<div class="muted small sz-dna-h">ADN du circuit</div>' : ''}${DNA_KEYS.map(([k, l]) => `<div class="sz-meter sz-stress"><span>${l}</span><div class="sz-dots">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n[k] ? 'on' : ''}"></i>`).join('')}</div><b>${n[k]}/5</b></div>`).join('')}
    <div class="muted small"><span>D'après Pirelli :</span> <a href="${esc(n.source)}" target="_blank" rel="noopener">${t('preview du Grand Prix {}', n.season)}</a></div></div>`;
}

// Circuits qui se ressemblent : familles d'après les notes Pirelli (virages lents, mixtes ou rapides selon traction et
// appui latéral ; contrainte sur les pneus forte, moyenne ou faible), en cartes avec le mini-tracé de chaque circuit
const PROFILES = [[1, 'Virages rapides, appui latéral'], [0, 'Profil mixte'], [-1, 'Virages lents, traction']];
const STRESSES = [['hi', 'Pneus très sollicités', (s) => s >= 4], ['mid', 'Pneus moyennement sollicités', (s) => s === 3], ['lo', 'Pneus peu sollicités', (s) => s <= 2]];
let shapes = null;
export function dnaMap(races) {
  const list = races.map((r) => ({ r, n: CIRCUIT_DNA[r.circuitId] })).filter((x) => x.n);
  if (!list.length) return '';
  const fams = STRESSES.flatMap(([k, sl, inS]) => PROFILES.map(([p, pl]) => ({ k, sl, pl,
    items: list.filter(({ n }) => inS(n.tyreStress) && Math.sign(n.lateral - n.traction) === p).sort((a, b) => b.n.tyreStress - a.n.tyreStress || a.r.round - b.r.round) })))
    .filter((f) => f.items.length);
  // Tracés (fichier déjà utilisé par le Calendrier) : posés une fois la rubrique affichée
  (shapes ??= fetch('/data/f1-circuits.json').then((x) => x.json()).then((d) => d.circuits || []).catch(() => [])).then((all) => {
    for (const el of document.querySelectorAll('.sz-fam-trk:not(.ok)')) {
      const s = nearestShape(all, Number(el.dataset.lat), Number(el.dataset.lon));
      if (s) el.innerHTML = `<polygon points="${shapeOutline(s.line)}"/>`;
      el.classList.add('ok');
    }
  });
  return `<section class="sz-box"><h3>Circuits qui se ressemblent</h3><div class="sz-fams">${fams.map((f) => `<article class="sz-fam ${f.k}">
      <div class="sz-fam-h"><b>${t(f.pl)}</b><span class="muted small">${t(f.sl)}</span></div>
      <div class="sz-fam-list">${f.items.map(({ r }) => `<div class="sz-fam-c"><svg class="sz-fam-trk" viewBox="0 0 100 100" aria-hidden="true" data-lat="${r.lat}" data-lon="${r.lon}"></svg><span>${esc(r.locality || short(r.name))}</span></div>`).join('')}</div>
    </article>`).join('')}</div>
    <p class="muted small">${t('Familles d\'après les notes des previews Pirelli : virages lents (traction) ou rapides (appui latéral), et contrainte sur les pneus.')}</p></section>`;
}

const KNOWN = { madring: { length: 5.414, corners: 22 }, sepang: { length: 5.543, corners: 15 } };
// Longueur du circuit d'une manche (km) : analyse des archives, sinon valeur connue
export const circuitLength = (ctx, round) => byRound(ctx.stats).get(round)?.race.profile.length || KNOWN[ctx.data.races.find((r) => r.round === round)?.circuitId]?.length || null;
export function renderCircuits(ctx, sort = 'round') {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const items = [...R.values()].map(({ race }) => {
    const r = data.races.find((x) => x.round === race.round) || {};
    const k = !race.profile.length && KNOWN[r.circuitId];
    const p = k ? { ...race.profile, ...k, distance: Math.round(k.length * race.profile.laps * 10) / 10,
      fastest: race.profile.fastest && { ...race.profile.fastest, avgSpeed: Math.round((k.length / race.profile.fastest.time) * 36000) / 10 } } : race.profile;
    const ty = stats.tyres?.[race.round] || null;
    const cars = race.drivers.filter((d) => d.laps.length > p.laps * 0.9).length || race.drivers.length || 1;
    const finStops = race.drivers.filter((d) => d.laps.length > p.laps * 0.9).reduce((n, d) => n + (d.stopCount ?? d.stops.length), 0);
    return {
      round: race.round, r, p, ty, avgSpeed: p.fastest?.avgSpeed || 0, topSpeed: p.topSpeed?.kmh || 0, gains: p.gains || 0, neutral: p.neutralPct || 0, length: p.length || 0,
      tyre: ty ? 6 - ty.hard : 0, stopsPerCar: finStops / cars,
      // Caractéristiques comparées pour trouver les circuits proches
      key: r.circuit, corners: p.corners, passes: p.laps ? p.gains / p.laps : null, hard: ty?.hard ?? null, ...CIRCUIT_DNA[r.circuitId],
    };
  });
  for (const x of items) { x.avgSpeed ||= null; x.topSpeed ||= null; x.length ||= null; }
  const near = similarCircuits(items);
  items.sort((a, b) => (sort === 'round' ? a.round - b.round : (b[sort] || 0) - (a[sort] || 0)));
  const range = (k) => { const v = items.map((x) => x[k]).filter(Boolean); return [Math.min(...v), Math.max(...v)]; };
  const rg = { avgSpeed: range('avgSpeed'), topSpeed: range('topSpeed'), gains: range('gains'), neutral: range('neutral'), stopsPerCar: range('stopsPerCar') };
  const meter = (label, k, v, txt) => {
    const [a, b] = rg[k];
    const w = b > a ? 8 + (92 * (v - a)) / (b - a) : 50;
    return `<div class="sz-meter"><span>${label}</span><div><i style="width:${v ? w : 0}%"></i></div><b>${txt}</b></div>`;
  };
  return `${pendingNote(stats)}
    ${dnaMap(data.races)}
    <div class="sz-h2h-pick"><label class="small">Trier par <select id="szCircSort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="sz-circs">${items.map(({ round, r, p, ty, stopsPerCar, key }) => `<article class="sz-circ">
      <div class="sz-circ-head"><span class="muted">R${round}</span> <b>${esc(short(r.name))}</b><div class="muted small">${esc(r.circuit || '')} · ${esc(r.locality || '')}</div></div>
      <div class="sz-circ-body">
        ${p.outline ? `<svg viewBox="0 0 100 100" class="sz-outline"><polygon points="${p.outline}"/></svg>` : '<div class="sz-outline muted small">Tracé indisponible</div>'}
        <dl class="sz-facts">
          <dt>Longueur</dt><dd>${p.length ? `${fr(p.length, 3)} km` : '—'}</dd>
          <dt>Virages</dt><dd>${p.corners ?? '—'}</dd>
          <dt>Tours</dt><dd>${p.laps || '—'}${p.distance ? ` · ${fr(p.distance, 1)} km` : ''}</dd>
          <dt>Meilleur tour</dt><dd>${p.fastest ? `${fmtLap(p.fastest.time)} · ${esc(p.fastest.tla)}` : '—'}</dd>
          <dt>Arrêts</dt><dd>${p.stops}${p.stopMedian ? ` · ${fr(p.stopMedian, 1)} s` : ''}</dd>
          <dt>Voie des stands</dt><dd>${p.pitLane ? `${fr(p.pitLane, 1)} s` : '—'}</dd>
          <dt>Pneus Pirelli</dt><dd>${ty ? `<span class="sz-cpd">C${ty.hard} · C${ty.medium} · C${ty.soft}</span>` : '—'}</dd>
        </dl>
      </div>
      ${dnaBlock(r.circuitId) || `<div class="sz-meter sz-stress"><span>Contrainte pneus</span><div class="sz-dots">${ty ? Array.from({ length: 5 }, (_, i) => `<i class="${i < STRESS[ty.hard][1] ? 'on' : ''}"></i>`).join('') : ''}</div><b>${ty ? STRESS[ty.hard][0] : '—'}</b></div>`}
      ${meter('Arrêts par pilote', 'stopsPerCar', stopsPerCar, fr(stopsPerCar))}
      ${meter('Vitesse moyenne', 'avgSpeed', p.fastest?.avgSpeed, p.fastest?.avgSpeed ? `${fr(p.fastest.avgSpeed, 0)} km/h` : '—')}
      ${meter('Vitesse de pointe', 'topSpeed', p.topSpeed?.kmh, p.topSpeed ? `${p.topSpeed.kmh} km/h` : '—')}
      ${meter('Dépassements', 'gains', p.gains, `${p.gains}`)}
      ${meter('Neutralisations', 'neutral', p.neutralPct, `${fr(p.neutralPct, 0)} % des tours`)}
      ${near.get(key)?.length ? `<div class="sz-near"><span class="muted small">Circuits les plus proches</span>${near.get(key).map((b) => `<span class="sz-tag" title="R${b.round} ${esc(b.r.name || '')}">${esc(b.r.locality || short(b.r.name))}</span>`).join('')}</div>` : ''}
    </article>`).join('')}</div>`;
}
