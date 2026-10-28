// Espace « Saison » (inspiré de formula1dashboard.com) : compte à rebours de la prochaine
// séance, calendrier, classements avec évolution des points, résultats et records, duels entre
// coéquipiers, statistiques détaillées. Données : API Jolpica (via le serveur, /api/season) et
// analyse des archives F1 Live Timing (/api/season/stats).
import { $, esc, api, teamColor, teamLogo, photoUrl, placeView, driverOpt } from '../util.js';
import { store } from '../store.js';
import { renderDrivers, renderConsistency, renderPits, renderSpeeds, renderCircuits, renderRatings, gradeBadge, stopTxt, DHL_NOTE, statusFr, fmtLap } from './season-stats.js';
import { driverRatings, qualiGaps, titleRace, placeForMaxPoints, retired, standingsAfter, lineage, pointsPath, shortTeams } from '/shared/season-calc.js';
import { renderTech, renderElements, setTechFilter, translateTechDetail, toggleTechOriginal } from './season-fia.js';
import { icon } from '../icons.js';
import { renderPredict, initPredict } from './predict-view.js';
import { renderReview, reviewAction } from './season-review.js';
import { renderDestructors, showDestructorsDriver } from './season-destructors.js';
import { DEC, LOCALE, EN, t } from '../i18n.js';
import { gpShort, gpFull } from '/shared/gp-names.js';
import { COUNTRY_ISO } from '/shared/social-season.js';
import { seasonPath, seasonTitle, slug, gpSlug, parseSeasonPath } from '/shared/season-urls.js';

// Couleurs officielles (utilisées si les couleurs contrastées sont désactivées)
const OFFICIAL = {
  mercedes: '00D7B6', ferrari: 'ED1131', mclaren: 'F47600', red_bull: '4781D7', rb: '6C98FF', williams: '1868DB',
  alpine: '00A1E8', aston_martin: '229971', haas: '9C9FA2', sauber: '01C00E', audi: 'F50537', cadillac: '909090',
};
const color = (team, teamId) => teamColor({ TeamName: team, TeamColour: OFFICIAL[teamId] || '8b95a8' });
const seasonOpt = (d) => driverOpt({ TeamName: d.team, TeamColour: OFFICIAL[d.teamId] || '8b95a8' }, d.number);
const chip = (d) => `<span class="sz-chip" style="--tc:${color(d.team, d.teamId)}">${esc(d.last || d.name || d.code)}</span>`;
const bar = (team, teamId) => `<span class="drv-bar" style="background:${color(team, teamId)}"></span>`;

let data = null;
let year = new Date().getUTCFullYear();   // année du serveur (UTC) : la nuit du réveillon, l'année suivante n'existe pas encore pour lui
let section = 'home';
let jump = false;          // rubrique choisie : affichée depuis le haut (calendrier : au prochain Grand Prix)
let loading = false;
let timer = null;
let stats = null;          // analyse des courses (archives) de l'année affichée
let statsTimer = null;
let drvCode = null;
let gpRound = null;        // fiche Grand Prix affichée (manche)
let wanted = null;         // rubrique demandée par l'adresse (version web) : pilote ou Grand Prix retrouvé une fois la saison chargée
let push = false;          // version web : prochaine adresse ajoutée à l'historique (rubrique choisie), sinon remplacée
let leaveTop = 0;          // version web : défilement de la rubrique quittée, gardé dans l'historique (retour au même endroit)
let urls = false;          // version web : l'adresse suit la rubrique affichée (à partager, moteurs de recherche)
let speedPt = 'ST';
let circSort = 'round';
let rateSort = 'season';
let cmpYear = null;        // Comparer deux saisons : saison comparée (par défaut la précédente), manche, pilotes ou écuries
let cmpRound = null;
let cmpKind = 'd';         // 'd' pilotes, 'c' écuries, 'p' un pilote face à lui-même
let cmpSort = 'pos';       // colonne du tri du tableau
let cmpDrv = null;         // « Un pilote » : pilote choisi
let dest = null;           // Championnat des casseurs de l'année affichée (dégâts estimés)
const others = new Map();  // autres saisons chargées pour la comparaison : année -> données, { loading } ou { error }
const STATS_SECTIONS = new Set(['drivers', 'consistency', 'pits', 'speeds', 'circuits', 'ratings', 'h2h', 'gp']);
let prev = null;           // saison précédente (comparaison des points d'un pilote)
let ratingsMemo = null;

// Notes des pilotes, recalculées seulement quand les données changent
function ratingsFor(d, st) {
  if (ratingsMemo?.d !== d || ratingsMemo?.st !== st) ratingsMemo = { d, st, v: driverRatings(d, st?.races ? st : null) };
  return ratingsMemo.v;
}

async function loadPrev() {
  const y = year - 1;
  if (prev?.year === y || prev?.loading === y) return;
  prev = { loading: y };
  try {
    const d = shortTeams(await api(`/api/season?year=${y}`));
    if (prev?.loading === y) prev = d;
  } catch (err) {
    if (prev?.loading === y) prev = { year: y, error: err.message };
  }
  if (section === 'drivers' && !$('#seasonView').hidden) render();
}
// Championnat des casseurs : dégâts estimés de l'année affichée, lus une fois sur le serveur
async function loadDest(y) {
  if (dest?.year === y) return;
  dest = { year: y, loading: true };
  try { dest = shortTeams(await api(`/api/season/destructors?year=${y}`)); } catch (err) { dest = { year: y, error: err.message }; }
  if (section === 'destructors' && !$('#seasonView').hidden) render();
}
// Saison comparée (Comparer deux saisons) : chargée une fois, gardée pour la session
async function loadOther(y) {
  if (others.has(y)) return;
  others.set(y, { loading: true });
  try { others.set(y, shortTeams(await api(`/api/season?year=${y}`))); } catch (err) { others.set(y, { error: err.message }); }
  if (section === 'compare' && !$('#seasonView').hidden) render();
}
const FIA_SECTIONS = new Set(['tech', 'elements']);
// Documents FIA et statistiques en cours de lecture par le serveur, ou erreur : relus toutes les 30 s (chaque lecture
// coûte au serveur), et plus du tout une fois la Saison fermée
const FOLLOW_MS = 30000;
let fia = null;            // documents FIA (évolutions techniques, éléments moteur)
let fiaTimer = null;

async function loadFia() {
  clearTimeout(fiaTimer);
  const y = year;
  try {
    const f = shortTeams(await api(`/api/season/fia?year=${y}`));
    if (y !== year) return;
    const same = fia?.year === f.year && fia.done === f.done && fia.total === f.total && fia.pending === f.pending && !fia.error;
    fia = f;
    if (f.pending) fiaTimer = setTimeout(loadFia, FOLLOW_MS);
    if (same) return;   // relecture pendant la lecture des documents : rien de nouveau, rien de redessiné
  } catch (err) {
    const lost = err instanceof TypeError;   // réseau coupé (« Load failed »)
    if (y === year) fia = { year: y, error: lost ? 'connexion perdue, nouvel essai dans 30 s' : err.message, events: [] };
    fiaTimer = setTimeout(loadFia, FOLLOW_MS);   // serveur indisponible (503…) aussi
  }
  if (FIA_SECTIONS.has(section) && !$('#seasonView').hidden) render();
}

// Statistiques détaillées : analysées par le serveur en arrière-plan, on suit l'avancement.
async function loadStats() {
  clearTimeout(statsTimer);
  const y = year;
  try {
    const s = shortTeams(await api(`/api/season/stats?year=${y}`));
    if (y !== year) return;
    const same = stats?.year === s.year && stats.done === s.done && stats.total === s.total && stats.pending === s.pending && !stats.error;
    stats = s;
    if (s.pending) statsTimer = setTimeout(loadStats, FOLLOW_MS);
    if (same) return;   // relecture pendant l'analyse : rien de nouveau, rien de redessiné (tableaux laissés où ils sont)
  } catch (err) {
    const lost = err instanceof TypeError;   // réseau coupé
    if (y === year) stats = { error: lost ? 'connexion perdue, nouvel essai dans 30 s' : err.message, races: [] };
    statsTimer = setTimeout(loadStats, FOLLOW_MS);   // serveur indisponible (503…) aussi
  }
  if (STATS_SECTIONS.has(section) && !$('#seasonView').hidden) render();
}

const fmtDate = (t, o) => new Date(t).toLocaleDateString(LOCALE, o || { day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const done = (r) => r.results.length > 0;

async function load(force = false) {
  // Une autre année demandée pendant un chargement : on la charge (la réponse en retard
  // de l'année précédente est ignorée)
  if ((loading === year) || (data?.year === year && !force)) return;
  const y = year;
  loading = y;
  $('#szContent').innerHTML = `<div class="note">Chargement de la saison ${y}…</div>`;
  let d;
  try {
    d = shortTeams(await api(`/api/season?year=${y}`));
  } catch (err) {
    if (y !== year) return;
    loading = false;
    $('#szContent').innerHTML = `<div class="note">Données de la saison ${y} indisponibles (${esc(err.message)}). <button class="btn small" id="szRetry">Réessayer</button></div>`;
    $('#szRetry')?.addEventListener('click', () => load(true));
    return;
  }
  if (y !== year) return;
  loading = false;
  data = d;
  render();
  follow();
}
// Lecture des statistiques et des documents FIA (re)lancée si elle n'est pas finie
function follow() {
  if (!stats || stats.year !== year || stats.pending) loadStats();
  if (!fia || fia.year !== year || fia.pending) loadFia();
}

// ---------------- Calculs ----------------
function nextSession() {
  const now = Date.now();
  for (const r of data.races) for (const s of r.sessions) if (s.t && Date.parse(s.t) > now) return { race: r, s };
  return null;
}

// Points cumulés par manche (course + sprint)
function pointsByRound() {
  const cum = new Map();
  const series = new Map();
  for (const r of data.races.filter(done)) {
    for (const x of [...r.results, ...r.sprintResults]) cum.set(x.code, (cum.get(x.code) || 0) + x.points);
    for (const [code, pts] of cum) {
      if (!series.has(code)) series.set(code, []);
      series.get(code).push({ x: r.round, y: pts });
    }
  }
  return series;
}

function seasonStats() {
  const races = data.races.filter(done);
  const count = (fn) => {
    const m = new Map();
    for (const r of races) for (const x of fn(r)) if (x) m.set(x.code, { d: x, n: (m.get(x.code)?.n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n)[0] || null;
  };
  const wins = count((r) => [r.results[0]]);
  const podiums = count((r) => r.results.slice(0, 3));
  const poles = count((r) => [r.quali.find((q) => q.pos === 1)]);
  // Meilleure moyenne d'arrivée (au moins la moitié des courses)
  const fin = new Map();
  for (const r of races) for (const x of r.results) if (x.pos && /^\d+$/.test(x.posText)) { const f = fin.get(x.code) || { d: x, s: 0, n: 0 }; f.s += x.pos; f.n++; fin.set(x.code, f); }
  const avg = [...fin.values()].filter((f) => f.n >= races.length / 2).map((f) => ({ d: f.d, v: f.s / f.n })).sort((a, b) => a.v - b.v)[0] || null;
  // Places gagnées (cumul) et plus belle remontée
  const gained = new Map();
  let comeback = null;
  for (const r of races) for (const x of r.results) {
    if (!x.grid || !/^\d+$/.test(x.posText)) continue;
    const g = x.grid - x.pos;
    gained.set(x.code, { d: x, v: (gained.get(x.code)?.v || 0) + Math.max(0, g) });
    if (!comeback || g > comeback.v) comeback = { d: x, v: g, r, from: x.grid, to: x.pos };
  }
  const mostGained = [...gained.values()].sort((a, b) => b.v - a.v)[0] || null;
  // Écarts de victoire
  const margins = races.map((r) => ({ r, d: r.results[0], v: parseFloat(String(r.results[1]?.time || '').replace('+', '')) })).filter((m) => m.v > 0);
  margins.sort((a, b) => a.v - b.v);
  return { wins, podiums, poles, avg, mostGained, comeback, closest: margins[0] || null, largest: margins.at(-1) || null, races: races.length };
}

// ---------------- Rendus ----------------
function standingsTable(rows, kind, limit = Infinity) {
  const lead = rows[0]?.points || 0;
  return `<table class="sz-table"><tr><th>Pos.</th><th>${kind === 'd' ? 'Pilote' : 'Écurie'}</th><th>Points</th><th>Écart</th><th>Vict.</th></tr>
    ${rows.slice(0, limit).map((x) => `<tr><td>${x.pos ?? '—'}</td><td>${kind === 'd' ? `${bar(x.team, x.teamId)}<b>${esc(x.name)}</b> <span class="muted small">${esc(x.team)}</span>` : `${bar(x.name, x.id)}<b>${esc(x.name)}</b>`}</td>
      <td><b>${x.points}</b></td><td class="muted">${x.points === lead ? '—' : `−${lead - x.points}`}</td><td>${x.wins || ''}</td></tr>`).join('')}</table>`;
}

function renderHome() {
  const nx = nextSession();
  const doneRaces = data.races.filter(done);
  const last = doneRaces.at(-1);
  const pct = data.races.length ? Math.round((doneRaces.length / data.races.length) * 1000) / 10 : 0;
  const [p1, p2] = data.drivers;
  const [c1, c2] = data.constructors;
  const tr = titleRace(data, data.year), champ = tr.champion, inRace = tr.drivers.filter((e) => e.alive).length;
  return `<div class="sz-cards sz-home-cards">
      <div class="sz-card sz-count">${nx ? `<div class="sz-kicker"><span class="sz-badge">R${nx.race.round}</span> ${esc(gpFull(nx.race.name, EN))} : ${esc(nx.s.label)}</div>
        <div class="sz-countdown" id="szCountdown" data-t="${esc(nx.s.t)}"></div>
        <div class="small sz-when">${fmtDate(nx.s.t, { weekday: 'long', day: 'numeric', month: 'long' })} à ${fmtTime(nx.s.t)}</div>` : '<div class="sz-kicker">Saison terminée</div>'}</div>
      <div class="sz-card"><div class="muted small">Calendrier ${data.year}</div><div class="sz-big">${esc(nx?.race.locality || nx?.race.country || '—')}</div>
        <div class="sz-progress"><i style="width:${pct}%"></i></div><div class="muted small">${pct.toString().replace('.', DEC)} % de la saison · ${doneRaces.length}/${data.races.length} courses</div></div>
      <div class="sz-card"><div class="muted small">Leader pilotes</div><div class="sz-big">${p1 ? `${bar(p1.team, p1.teamId)}${esc(p1.last)}` : '—'}</div>
        <div class="muted small">${p1 ? `${p1.points} pts${p2 ? ` · +${p1.points - p2.points} sur ${esc(p2.last)}` : ''}` : ''}</div></div>
      <div class="sz-card"><div class="muted small">Leader constructeurs</div><div class="sz-big">${c1 ? `${bar(c1.name, c1.id)}${esc(c1.name)}` : '—'}</div>
        <div class="muted small">${c1 ? `${c1.points} pts${c2 ? ` · +${c1.points - c2.points} sur ${esc(c2.name)}` : ''}` : ''}</div></div>
      ${last ? `<div class="sz-card"><div class="muted small">Dernier vainqueur · R${last.round}</div><div class="sz-big">${bar(last.results[0].team, last.results[0].teamId)}${esc(last.results[0].last)}</div><div class="muted small">${esc(gpFull(last.name, EN))}</div></div>` : ''}
      ${last ? `<div class="sz-card sz-wide"><div class="muted small">Course au titre</div><div class="sz-big">${champ ? `${bar(champ.team, champ.teamId)}${esc(champ.last || champ.name)}` : t('{} en lice', inRace)}</div>
        <div class="muted small">${champ ? t('Champion du monde') : tr.clinchD?.earliest ? t('Titre possible dès : {}', esc(gpShort(tr.clinchD.earliest.name, EN))) : t('Rien de joué avant la dernière manche')}</div>
        <button class="btn small" data-szgo="title">${t('Course au titre')} ${icon('arrow-right', 'ic-s')}</button></div>` : ''}
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Classement pilotes</h3>${standingsTable(data.drivers, 'd', 10)}<button class="btn small" data-szgo="standings">Classement complet ${icon('arrow-right', 'ic-s')}</button></section>
      <section class="sz-box"><h3>Classement constructeurs</h3>${standingsTable(data.constructors, 'c', 10)}<button class="btn small" data-szgo="standings">Classement complet ${icon('arrow-right', 'ic-s')}</button></section>
    </div>`;
}

// Calendrier façon habillage TV : le prochain Grand Prix en grand (programme jour par jour, compte à
// rebours), puis toute la saison en liste groupée par mois ; une ligne s'ouvre sur ses séances
const flagOf = (r) => (COUNTRY_ISO[r.country] ? `<img class="cal-flag" src="https://flagcdn.com/w80/${COUNTRY_ISO[r.country]}.png" alt="" loading="lazy" onerror="this.remove()">` : '');
const calIcs = (r) => `<a class="btn small" href="#" data-cal="${year}" data-round="${r.round}" title="Séances dans votre agenda (Google, Apple, Outlook)">${icon('calendar')} Ajouter ce week-end à mon agenda</a>`;
// Dates du week-end : « 23 – 25 oct. » (« 30 oct. – 1 nov. » d'un mois à l'autre)
function calSpan(r) {
  const a = r.sessions[0]?.t || r.date;
  const same = new Date(a).getMonth() === new Date(r.date).getMonth();
  return `${fmtDate(a, same ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmtDate(r.date, { day: 'numeric', month: 'short' })}`;
}
function calDays(r) {
  const days = new Map();
  for (const s of r.sessions.filter((x) => x.t)) {
    const k = new Date(s.t).toDateString();
    if (!days.has(k)) days.set(k, { t: s.t, list: [] });
    days.get(k).list.push(s);
  }
  return `<div class="cal-days">${[...days.values()].map((d) => `<div class="cal-day"><div class="cal-day-h">${esc(fmtDate(d.t, { weekday: 'short', day: 'numeric' }))}</div>
    ${d.list.map((s) => `<div class="cal-s ${Date.parse(s.t) < Date.now() ? 'past' : ''}"><span>${esc(s.label)}</span><b>${fmtTime(s.t)}</b></div>`).join('')}</div>`).join('')}</div>`;
}
// Lien vers la fiche d'un Grand Prix (vraie adresse dans la version web, pour la partager et pour les moteurs de recherche)
const gpLink = (r, text, cls = '', pre = '') => `<a href="${seasonPath(year, 'gp', gpSlug(r.name))}" data-szgp="${r.round}"${cls ? ` class="${cls}"` : ''}>${pre}${esc(text)}</a>`;

// Fiche d'un Grand Prix : résultats, sprint, qualifications, arrêts les plus rapides (analyse des archives)
function renderGp() {
  const r = data.races.find((x) => x.round === gpRound) || data.races.filter(done).at(-1) || data.races[0];
  if (!r) return '<div class="note">Pas encore de Grand Prix.</div>';
  gpRound = r.round;
  const i = data.races.indexOf(r), prev = data.races[i - 1], next = data.races[i + 1];
  const who = (x) => `${bar(x.team, x.teamId)}<b>${esc(x.name)}</b> <span class="muted small">${esc(x.team)}</span>`;
  const pos = (x) => (/^\d+$/.test(x.posText || '') ? x.pos : '—');
  const gap = (x) => x.time || esc(statusFr(x.status));
  const win = r.results[0], pole = r.quali.find((q) => q.pos === 1);
  const parts = [`<section class="sz-box"><h3>${flagOf(r)}${esc(gpFull(r.name, EN))} ${data.year}</h3>
    <div class="muted">${t('Manche {}', r.round)} · ${calSpan(r)} · ${esc([r.circuit, r.locality].filter(Boolean).join(' · '))}</div>
    ${win ? `<p>${icon('trophy')} ${chip(win)}${pole ? ` <span class="muted">pole</span> ${chip(pole)}` : ''}</p>` : ''}</section>`];
  if (r.results.length) {
    parts.push(`<section class="sz-box"><h3>Course</h3><div class="sz-scroll"><table class="sz-table"><tr><th>Pos.</th><th>Pilote</th><th>Temps / écart</th><th>Tours</th><th>Grille</th><th>Points</th></tr>
      ${r.results.map((x) => `<tr><td>${pos(x)}</td><td>${who(x)}</td><td>${gap(x)}</td><td>${x.laps ?? ''}</td><td>${x.grid ? `P${x.grid}` : 'Stands'}</td><td>${x.points || ''}</td></tr>`).join('')}</table></div></section>`);
  } else {
    parts.push(`<section class="sz-box"><h3>Programme du week-end</h3>${calDays(r)}${calIcs(r)}</section>`);
  }
  if (r.sprintResults.length) {
    parts.push(`<section class="sz-box"><h3>Sprint</h3><div class="sz-scroll"><table class="sz-table"><tr><th>Pos.</th><th>Pilote</th><th>Temps / écart</th><th>Points</th></tr>
      ${r.sprintResults.map((x) => `<tr><td>${pos(x)}</td><td>${who(x)}</td><td>${gap(x)}</td><td>${x.points || ''}</td></tr>`).join('')}</table></div></section>`);
  }
  if (r.quali.length) {
    parts.push(`<section class="sz-box"><h3>Qualifications</h3><div class="sz-scroll"><table class="sz-table"><tr><th>Pos.</th><th>Pilote</th><th>Q1</th><th>Q2</th><th>Q3</th></tr>
      ${r.quali.map((x) => `<tr><td>${x.pos ?? ''}</td><td>${who(x)}</td>${x.q.map((v) => `<td>${v ? fmtLap(v) : ''}</td>`).join('')}</tr>`).join('')}</table></div></section>`);
  }
  const an = (stats?.year === data.year ? stats.races : [])?.find((x) => x.round === r.round);
  const stops = (an?.drivers || []).flatMap((d) => d.stops.filter((s) => s.stop > 0 && s.stop < 15).map((s) => ({ ...s, d }))).sort((a, b) => a.stop - b.stop).slice(0, 10);
  if (stops.length) {
    parts.push(`<section class="sz-box"><h3>Arrêts aux stands les plus rapides</h3><table class="sz-table"><tr><th>#</th><th>Pilote</th><th>Tour</th><th>Immob.</th></tr>
      ${stops.map((s, k) => `<tr><td>${k + 1}</td><td>${bar(s.d.team, null)}<b>${esc(s.d.name)}</b> <span class="muted small">${esc(s.d.team)}</span></td><td>${s.lap ?? '—'}</td><td><b>${stopTxt(s)}</b></td></tr>`).join('')}</table>
      ${stops.some((s) => s.dhl) ? DHL_NOTE : ''}</section>`);
  }
  parts.push(`<div class="sz-gp-nav">${prev ? gpLink(prev, `← ${gpShort(prev.name, EN)}`, 'btn small') : '<span></span>'}<button class="btn small" data-szgo="results">Tous les Grands Prix</button>${next ? gpLink(next, `${gpShort(next.name, EN)} →`, 'btn small') : '<span></span>'}</div>`);
  return parts.join('');
}

// Version web : l'adresse suit la rubrique affichée (remplacée, pas ajoutée à l'historique)
// Titre de l'onglet : celui de la rubrique (la barre de la séance ne le change pas tant que data-season-title est posé)
function syncUrl() {
  if (!urls || !data || $('#seasonView').hidden) return;
  const d = section === 'drivers' ? data.drivers.find((x) => x.code === drvCode) : null;
  const r = section === 'gp' ? data.races.find((x) => x.round === gpRound) : null;
  const p = seasonPath(data.year, section, d ? slug(d.name) : r ? gpSlug(r.name) : null);
  if (location.pathname !== p && push) {
    history.replaceState({ szTop: leaveTop }, '');
    history.pushState(null, '', p);
  } else if (location.pathname !== p) history.replaceState(history.state, '', p);
  push = false;
  document.documentElement.dataset.seasonTitle = '1';
  document.title = `${seasonTitle(data.year, section, d?.name || r?.name, !!r?.results.length)} · Paddock Live`;
}

// Version web : adresses de la Saison (appelé par la page, analytics/live-page/web.js). Chaque rubrique ou fiche
// ouverte est ajoutée à l'historique : le retour en arrière (geste, bouton du navigateur) ramène à la précédente,
// puis au direct
export function seasonUrls() {
  urls = true;
  addEventListener('popstate', (e) => {
    const p = parseSeasonPath(location.pathname);
    if (p) openSeason(p.section, p.year || undefined, p.item, true);
    else if (!$('#seasonView').hidden) closeSeason();
    // Retour à l'endroit où l'on était (encore une fois une fois les tableaux ou les statistiques affichés)
    const top = e.state?.szTop;
    if (p && top) for (const ms of [0, 400, 1200]) setTimeout(() => { $('#szContent').scrollTop = top; }, ms);
  });
}

function renderCalendar() {
  const nx = nextSession();
  const next = nx?.race;
  const ran = data.races.filter(done).length;
  const hero = next ? `<section class="cal-hero">
      <div class="cal-hero-main">
        <div class="cal-hero-top"><span class="cal-tag">Prochain Grand Prix</span><span class="cal-round">Manche ${next.round} / ${data.races.length}</span>${next.sprint ? '<span class="sz-tag sprint">Sprint</span>' : ''}</div>
        <h2 class="cal-hero-name">${flagOf(next)}${esc(gpShort(next.name, EN))}</h2>
        <div class="cal-hero-sub">${esc([next.circuit, next.locality].filter(Boolean).join(' · '))} · ${calSpan(next)}</div>
        <div class="cal-next">${esc(nx.s.label)} dans</div>
        <div class="sz-countdown" id="szCountdown" data-t="${esc(nx.s.t)}"></div>
        ${calIcs(next)}
      </div>
      ${calDays(next)}
    </section>` : '';
  // Grands Prix à venir d'abord (dans l'ordre), puis ceux déjà courus, du plus récent au plus ancien
  let month = '';
  const row = (r) => {
    const m = fmtDate(r.date, { month: 'long' });
    const sep = m !== month ? `<div class="cal-month">${esc(m)}</div>` : '';
    month = m;
    const w = r.results[0];
    const pole = r.quali.find((q) => q.pos === 1) || r.quali[0];
    const state = done(r) ? 'done' : next?.round === r.round ? 'next' : 'future';
    const poleOf = (d) => (d ? ` <span class="cal-pole"><span class="muted">pole</span> ${chip(d)}</span>` : '');
    // Sprint : vainqueur et pole (1er sur la grille du sprint)
    const sw = r.sprintResults[0], sp = r.sprintResults.find((x) => x.grid === 1);
    const opt = (d) => (d ? chip(d) : '<span class="muted">—</span>');
    const right = w && sw
      // Week-end sprint couru : petit tableau, vainqueurs et poles alignés
      ? `<span class="cal-grid"><span></span>${icon('trophy')}<span class="muted">pole</span>
        <span class="sz-tag">Course</span>${chip(w)}${opt(pole)}<span class="sz-tag sprint">Sprint</span>${chip(sw)}${opt(sp)}</span>`
      : `${w ? `<span class="cal-res">${icon('trophy')} ${chip(w)}${poleOf(pole)}</span>` : `<span class="cal-state">${state === 'next' ? 'Prochain' : 'À venir'}</span>`}${
        r.sprint ? `<span class="cal-res"><span class="sz-tag sprint">Sprint</span>${sw ? ` ${chip(sw)}${poleOf(sp)}` : ''}</span>` : ''}`;
    return `${sep}<details class="cal-row ${state}">
      <summary><span class="cal-num">${r.round}</span>${flagOf(r)}<span class="cal-name"><b>${esc(gpShort(r.name, EN))}</b><small>${esc(r.circuit || '')}</small></span>
        <span class="cal-date">${calSpan(r)}</span>
        <span class="cal-out">${right}</span>${icon('chevron-down', 'cal-chev')}</summary>
      <div class="cal-row-body">${calDays(r)}${done(r) ? gpLink(r, 'Résultats du Grand Prix', 'btn small') : calIcs(r)}</div>
    </details>`;
  };
  const list = (races) => { month = ''; return races.length ? `<div class="cal-list">${races.map(row).join('')}</div>` : ''; };
  const past = data.races.filter(done).reverse();
  return `<div class="cal">${hero}
    <div class="cal-progress"><span>Saison ${data.year} · <b>${ran} / ${data.races.length}</b> Grands Prix courus</span><div class="sz-progress"><i style="width:${data.races.length ? (ran / data.races.length) * 100 : 0}%"></i></div></div>
    ${list(data.races.filter((r) => !done(r)))}
    ${past.length ? `<div class="cal-group">Grands Prix courus</div>${list(past)}` : ''}
    <p class="muted small"><a class="btn small" href="#" data-cal="${year}" title="Toutes les séances de la saison dans votre agenda (Google, Apple, Outlook), même Paddock Live fermé : abonnement mis à jour tout seul, ou fichier">${icon('calendar')} Ajouter toute la saison à mon agenda</a></p></div>`;
}

function lineChartSvg(series, { w = 900, h = 300 } = {}) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return '<div class="note">Pas encore de résultats.</div>';
  const xMax = Math.max(...pts.map((p) => p.x)), xMin = Math.min(...pts.map((p) => p.x)), yMax = Math.max(...pts.map((p) => p.y)) || 1;
  const pl = 36, pr = 70, pt = 10, pb = 22;
  const X = (x) => pl + ((x - xMin) / Math.max(1, xMax - xMin)) * (w - pl - pr);
  const Y = (y) => pt + (1 - y / yMax) * (h - pt - pb);
  const step = Math.max(50, Math.ceil(yMax / 5 / 50) * 50);
  let grid = '';
  for (let v = 0; v <= yMax; v += step) grid += `<line x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(v) + 4}" class="sz-ax" text-anchor="end">${v}</text>`;
  for (let x = xMin; x <= xMax; x++) grid += `<text x="${X(x)}" y="${h - 6}" class="sz-ax" text-anchor="middle">R${x}</text>`;
  // Étiquettes de fin de courbe écartées pour ne pas se chevaucher
  const labels = series.filter((s) => s.points.length).map((s) => ({ s, last: s.points.at(-1), y: Y(s.points.at(-1).y) + 4 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  const over = (labels.at(-1)?.y ?? 0) - (h - pb);
  if (over > 0) for (let i = labels.length - 1; i >= 0; i--) labels[i].y = Math.min(labels[i].y, (labels[i + 1]?.y ?? h - pb + 13) - 13);
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4"' : ''} points="${s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`).join('')
    + labels.map(({ s, last, y }) => `<text x="${X(last.x) + 5}" y="${y}" fill="${s.color}" class="sz-lbl">${esc(s.label)} ${last.y}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="sz-svg">${grid}${lines}</svg>`;
}

function renderStandings() {
  const pr = pointsByRound();
  const seen = new Set();
  const top = data.drivers.slice(0, 10).map((d) => {
    const dashed = seen.has(d.teamId);
    seen.add(d.teamId);
    return { label: d.code, color: color(d.team, d.teamId), dashed, points: pr.get(d.code) || [] };
  });
  // Dessiné à la largeur réelle de la page : textes et traits gardent leur taille (pas étirés)
  const w = Math.max(600, ($('#szContent')?.clientWidth || 934) - 34);
  return `<section class="sz-box"><h3>Évolution des points — 10 premiers</h3>${lineChartSvg(top, { w, h: 340 })}</section>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Pilotes</h3>${standingsTable(data.drivers, 'd')}</section>
      <section class="sz-box"><h3>Constructeurs</h3>${standingsTable(data.constructors, 'c')}</section>
    </div>`;
}

function renderResults() {
  const st = seasonStats();
  const card = (title, main, sub) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${main}</div><div class="muted small">${sub || ''}</div></div>`;
  const who = (x) => (x ? `${bar(x.d.team, x.d.teamId)}${esc(x.d.last)}` : '—');
  return `<div class="sz-cards">
      ${card('Plus de victoires', st.wins ? `${st.wins.n} <small>victoires</small>` : '—', who(st.wins))}
      ${card('Plus de podiums', st.podiums ? `${st.podiums.n} <small>podiums</small>` : '—', who(st.podiums))}
      ${card('Plus de poles', st.poles ? `${st.poles.n} <small>poles</small>` : '—', who(st.poles))}
      ${card('Meilleure moyenne à l\'arrivée', st.avg ? st.avg.v.toFixed(1).replace('.', DEC) : '—', who(st.avg))}
      ${card('Plus de places gagnées', st.mostGained ? `+${st.mostGained.v} <small>places</small>` : '—', who(st.mostGained))}
      ${card('Plus belle remontée', st.comeback ? `+${st.comeback.v} <small>places</small>` : '—', st.comeback ? `${who(st.comeback)} · P${st.comeback.from} ${icon('arrow-right', 'ic-s')} P${st.comeback.to} · R${st.comeback.r.round}` : '')}
      ${card('Plus large victoire', st.largest ? `+${st.largest.v.toFixed(3).replace('.', DEC)} s` : '—', st.largest ? `${esc(st.largest.d.last)} · R${st.largest.r.round} ${esc(st.largest.r.locality || '')}` : '')}
      ${card('Victoire la plus serrée', st.closest ? `+${st.closest.v.toFixed(3).replace('.', DEC)} s` : '—', st.closest ? `${esc(st.closest.d.last)} · R${st.closest.r.round} ${esc(st.closest.r.locality || '')}` : '')}
    </div>
    <section class="sz-box"><h3>Grands Prix</h3><table class="sz-table sz-results"><tr><th>Manche</th><th>Grand Prix</th><th>Date</th><th>Vainqueur</th><th>2e</th><th>3e</th><th>Pole</th><th>Vainqueur sprint</th></tr>
      ${data.races.map((r) => `<tr class="${done(r) ? '' : 'muted'}"><td>R${r.round}</td><td>${gpLink(r, gpShort(r.name, EN), 'sz-gp-chip', flagOf(r))}</td><td>${fmtDate(r.date)}</td>
        <td>${r.results[0] ? chip(r.results[0]) : '—'}</td><td>${r.results[1] ? chip(r.results[1]) : ''}</td><td>${r.results[2] ? chip(r.results[2]) : ''}</td>
        <td>${r.quali.find((q) => q.pos === 1) ? chip(r.quali.find((q) => q.pos === 1)) : '—'}</td><td>${r.sprintResults[0] ? chip(r.sprintResults[0]) : '—'}</td></tr>`).join('')}</table></section>`;
}

let h2hTeam = null;
let h2hMode = 'team';     // 'team' (coéquipiers) | 'drivers' (pilote contre pilote)
let h2hA = null, h2hB = null;
let trKind = 'd';          // course au titre : 'd' (pilotes) | 'c' (constructeurs)

// Écart en qualification entre les deux coéquipiers, manche par manche
// « en faveur de Russell », « en faveur d'Antonelli »
const favour = (name) => (/^[aeiouyàâéèêîïôû]/i.test(name || '') ? t("en faveur d'{}", esc(name)) : t('en faveur de {}', esc(name)));
function qualiGapBox(g, A, B, ca) {
  if (!g.rounds.length) return '<section class="sz-box"><h3>Écart en qualification</h3><div class="note small">Temps de qualification indisponibles pour cette saison.</div></section>';
  const f3 = (v) => `${Math.abs(v).toFixed(3).replace('.', DEC)} s`;
  const lead = g.median <= 0 ? A : B;
  // Largeur d'après le nombre de manches : la courbe tient dans sa case (moitié de l'écran, téléphone)
  const H = 200, pl = 44, pr = 10, pt = 14, pb = 34, mid = (H - pb + pt) / 2, W = pl + pr + Math.max(10, g.rounds.length) * 26;
  // Échelle calée sur le 2e plus grand écart : un écart isolé est coupé (sa valeur est écrite)
  const abs = g.rounds.filter((x) => !x.outlier).map((x) => Math.abs(x.s)).sort((a, b) => b - a);
  const cap = Math.max(0.2, Math.min(abs[0] || 0, (abs[1] ?? abs[0] ?? 0) * 1.4));
  const bw = (W - pl - pr) / g.rounds.length;
  const Y = (v) => mid - (Math.max(-cap, Math.min(cap, v)) / cap) * ((H - pb - pt) / 2);
  const bars = g.rounds.map((x, i) => {
    const y = Y(-x.s), x0 = pl + i * bw + bw * 0.18;
    const c = x.s <= 0 ? ca : 'var(--muted)';
    return `<rect x="${x0}" y="${Math.min(y, mid)}" width="${bw * 0.64}" height="${Math.max(1, Math.abs(y - mid))}" rx="2" fill="${c}" ${x.outlier ? 'opacity=".35"' : ''}><title>R${x.round} ${esc(gpShort(x.name, EN))} (Q${x.part}) : ${esc(x.s <= 0 ? A.last : B.last)} devant de ${f3(x.s)}</title></rect>
      ${Math.abs(x.s) > cap ? `<text x="${pl + i * bw + bw / 2}" y="${x.s < 0 ? y + 12 : y - 4}" class="sz-ax sz-clip" text-anchor="middle">${Math.abs(x.s).toFixed(2).replace('.', DEC)} s</text>` : ''}
      <text x="${pl + i * bw + bw / 2}" y="${H - 18}" class="sz-ax" text-anchor="middle">R${x.round}</text><text x="${pl + i * bw + bw / 2}" y="${H - 5}" class="sz-ax" text-anchor="middle">Q${x.part}</text>`;
  }).join('');
  const axis = `<line x1="${pl}" x2="${W - pr}" y1="${mid}" y2="${mid}" class="sz-gl"/>
    <text x="${pl - 6}" y="${pt + 8}" class="sz-ax" text-anchor="end">${esc(A.code)}</text><text x="${pl - 6}" y="${H - pb}" class="sz-ax" text-anchor="end">${esc(B.code)}</text>`;
  return `<section class="sz-box"><h3>Écart en qualification</h3>
    <div class="sz-cards sz-kpis">
      <div class="sz-card sz-kpi"><div class="muted small">Écart médian</div><div class="sz-big">${g.median === null ? '—' : f3(g.median)}</div><div class="muted small">${g.median ? `${favour(lead.last)} · ${Math.abs(g.medianPct).toFixed(2).replace('.', DEC)} %` : ''}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Écart moyen</div><div class="sz-big">${g.mean === null ? '—' : f3(g.mean)}</div><div class="muted small">${g.mean ? favour((g.mean <= 0 ? A : B).last) : ''}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Plus devant</div><div class="sz-big">${esc(A.code)} ${g.rounds.filter((x) => x.s < 0).length} – ${g.rounds.filter((x) => x.s > 0).length} ${esc(B.code)}</div><div class="muted small">séances où l'un a battu l'autre au temps</div></div>
    </div>
    <div class="sz-scroll"><svg viewBox="0 0 ${W} ${H}" class="sz-svg sz-gap-chart">${axis}${bars}</svg></div>
    <div class="muted small">Barre vers le haut : ${esc(A.last)} plus rapide ; vers le bas : ${esc(B.last)}.</div></section>`;
}

// Logo de l'écurie (pastille de sa couleur), sinon barre de couleur
function logoMark(team, teamId) {
  const url = teamLogo(team);
  return url ? `<span class="team-logo color" style="--tc:${color(team, teamId)};background-image:url('${url}')"></span>` : bar(team, teamId);
}

// Duel : deux coéquipiers (choix de l'écurie par son logo) ou deux pilotes quelconques
function renderH2H() {
  const teams = data.constructors.map((c) => ({ id: c.id, name: c.name }));
  h2hTeam ||= teams[0]?.id;
  let A, B;
  if (h2hMode === 'drivers') {
    const all = data.drivers;
    h2hA = all.some((d) => d.code === h2hA) ? h2hA : all[0]?.code;
    h2hB = all.some((d) => d.code === h2hB) && h2hB !== h2hA ? h2hB : all.find((d) => d.code !== h2hA)?.code;
    A = all.find((d) => d.code === h2hA);
    B = all.find((d) => d.code === h2hB);
  } else {
    // Pilotes de l'écurie (le plus de courses)
    const count = new Map();
    for (const r of data.races) for (const x of [...r.results, ...r.quali]) if (x.teamId === h2hTeam) count.set(x.code, { d: x, n: (count.get(x.code)?.n || 0) + 1 });
    [A, B] = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.d);
  }
  const mode = `<div class="tab-seg sz-h2h-mode"><button type="button" data-h2h-mode="team" class="${h2hMode === 'team' ? 'on' : ''}">Coéquipiers</button><button type="button" data-h2h-mode="drivers" class="${h2hMode === 'drivers' ? 'on' : ''}">Pilote contre pilote</button></div>`;
  const opts = (sel) => data.drivers.map((d) => `<option value="${esc(d.code)}" ${d.code === sel ? 'selected' : ''}${seasonOpt(d)}>${esc(d.name || d.code)}</option>`).join('');
  const pick = h2hMode === 'drivers'
    ? `<div class="sz-h2h-drivers"><label class="small">Pilote A <select id="szH2hA">${opts(h2hA)}</select></label><span class="sz-vs">VS</span><label class="small">Pilote B <select id="szH2hB">${opts(h2hB)}</select></label></div>`
    : `<div class="sz-team-pick">${teams.map((t) => `<button type="button" class="sz-team-btn${t.id === h2hTeam ? ' on' : ''}" data-h2h-team="${esc(t.id)}" style="--tc:${color(t.name, t.id)}">${logoMark(t.name, t.id)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
  const top = `<div class="sz-h2h-pick">${mode}</div>${pick}`;
  if (!A || !B) return `${top}<div class="note">${h2hMode === 'drivers' ? 'Pas assez de données pour ces pilotes.' : 'Pas assez de données pour cette écurie.'}</div>`;
  const mates = A.teamId === B.teamId;
  const stat = (fn) => [fn(A.code), fn(B.code)];
  const races = data.races.filter(done);
  const q = { a: 0, b: 0 }, rr = { a: 0, b: 0 };
  for (const r of races) {
    const qa = r.quali.find((x) => x.code === A.code), qb = r.quali.find((x) => x.code === B.code);
    if (qa?.pos && qb?.pos) qa.pos < qb.pos ? q.a++ : q.b++;
    const ra = r.results.find((x) => x.code === A.code), rb = r.results.find((x) => x.code === B.code);
    if (ra && rb) {
      const pa = /^\d+$/.test(ra.posText) ? ra.pos : 99, pb = /^\d+$/.test(rb.posText) ? rb.pos : 99;
      if (pa !== pb) pa < pb ? rr.a++ : rr.b++;
    }
  }
  const sum = (code, f) => races.reduce((n, r) => n + f(r, code), 0);
  const res = (r, code) => r.results.find((x) => x.code === code);
  const rows = [
    ['Duel en qualifications', [q.a, q.b]],
    ['Duel en course', [rr.a, rr.b]],
    ['Points', stat((c) => data.drivers.find((d) => d.code === c)?.points || 0)],
    ['Victoires', stat((c) => sum(c, (r, k) => (res(r, k)?.pos === 1 ? 1 : 0)))],
    ['Podiums', stat((c) => sum(c, (r, k) => (res(r, k)?.pos <= 3 && /^\d+$/.test(res(r, k)?.posText || '') ? 1 : 0)))],
    ['Poles', stat((c) => sum(c, (r, k) => (r.quali.find((x) => x.code === k)?.pos === 1 ? 1 : 0)))],
    ['Arrivées dans les points', stat((c) => sum(c, (r, k) => ((res(r, k)?.points || 0) > 0 ? 1 : 0)))],
    ['Abandons', stat((c) => sum(c, (r, k) => (retired(res(r, k)) ? 1 : 0)))],
  ];
  const ca = color(A.team, A.teamId);
  // Pilote B dans la couleur de son écurie (gris entre coéquipiers : même couleur que A)
  const cb = mates ? '' : color(B.team, B.teamId);
  const gaps = qualiGaps(races, A.code, B.code);
  const rt = ratingsFor(data, stats?.year === data.year ? stats : null);
  const ra = rt.find((e) => e.code === A.code), rb = rt.find((e) => e.code === B.code);
  const note = (e) => (!e ? '—' : mates ? gradeBadge(e.mate, e.mateGrade) : gradeBadge(e.season, e.seasonGrade));
  return `${top}
    <div class="sz-h2h-layout">
    <section class="sz-box sz-h2h"><div class="sz-h2h-head"><span class="sz-h2h-who">${logoMark(A.team, A.teamId)}<b style="color:${ca}">${esc(A.name)}</b></span><span class="sz-vs">VS</span><span class="sz-h2h-who b"><b ${cb ? `style="color:${cb}"` : ''}>${esc(B.name)}</b>${logoMark(B.team, B.teamId)}</span></div>
      ${rows.map(([label, [a, b]]) => {
        const tot = a + b || 1;
        const better = label === 'Abandons' ? (a < b ? 'a' : b < a ? 'b' : '') : (a > b ? 'a' : b > a ? 'b' : '');
        return `<div class="sz-h2h-row"><div class="sz-h2h-label">${label}</div>
          <div class="sz-h2h-bar"><span class="${better === 'a' ? 'win' : ''}">${a}</span><div class="sz-h2h-track"><i class="a" style="width:${(a / tot) * 50}%;background:${ca}"></i><i class="b" style="width:${(b / tot) * 50}%${cb ? `;background:${cb}` : ''}"></i></div><span class="${better === 'b' ? 'win' : ''}">${b}</span></div></div>`;
      }).join('')}
      <div class="sz-h2h-row"><div class="sz-h2h-label">${mates ? 'Note face au coéquipier' : 'Note de la saison'}</div><div class="sz-h2h-bar sz-h2h-grades"><span>${note(ra)}</span><div></div><span>${note(rb)}</span></div></div>
    </section>
    ${qualiGapBox(gaps, A, B, ca)}
    </div>
    <p class="muted small">Course : meilleure place à l'arrivée (abandon = défaite). Qualif : dernière partie disputée par les deux ; écarts de plus de 3 % non comptés.</p>`;
}

// Course au titre : pilotes et constructeurs encore capables d'être champions ; les autres grisés,
// avec la manche où ils ont été éliminés (mathématiquement)
function renderTitle() {
  const tr = titleRace(data, data.year);
  const dl = Object.values(store.state.DriverList || {});
  const photo = (code) => photoUrl(dl.find((x) => x?.Tla === code) || { Tla: code });
  const out = (e, team) => (e.alive ? '' : `<div class="tr-out">${team ? t('Éliminée') : t('Éliminé')} · R${e.outRound} ${esc(gpShort(e.outName, EN))}</div>`);
  // Barre : points actuels (couleur d'écurie) + maximum encore possible (hachures) ; trait = leader
  const bars = (e, list, col) => {
    const lead = Math.max(...list.map((x) => x.points));
    const top = Math.max(...list.map((x) => x.maxPts), 1);
    return `<div class="tr-bar"><i class="now" style="width:${(e.points / top) * 100}%;background:${col}"></i><i class="max" style="width:${((e.maxPts - e.points) / top) * 100}%;--tc:${col}"></i><b style="left:${(lead / top) * 100}%"></b></div>`;
  };
  const sub = (e, team) => (e.alive
    ? (e.behind ? `<div class="tr-sub">${t('{} pts du leader', e.behind)}</div>` : `<div class="tr-sub lead">${t('Leader')}</div>`)
    : out(e, team));
  const driverCard = (e) => {
    const col = color(e.team, e.teamId);
    const img = photo(e.code);
    return `<div class="tr-card${e.alive ? '' : ' out'}" style="--tc:${col}">
      <div class="tr-pic">${img ? `<img src="${img}" alt="" loading="lazy">` : `<span>${esc(e.code)}</span>`}<em>${e.pos}</em></div>
      <div class="tr-info"><b>${esc(e.name)}</b><span class="tr-team">${esc(e.team)}</span>
        <div class="tr-pts"><b>${e.points}</b> pts <span class="muted">· max ${e.maxPts}</span></div>${sub(e, false)}${bars(e, tr.drivers, col)}</div></div>`;
  };
  const teamCard = (e) => {
    const col = color(e.name, e.id);
    const logo = teamLogo(e.name);
    return `<div class="tr-card team${e.alive ? '' : ' out'}" style="--tc:${col}">
      <div class="tr-pic logo">${logo ? `<span class="team-logo color" style="--tc:${col};background-image:url('${logo}')"></span>` : bar(e.name, e.id)}<em>${e.pos}</em></div>
      <div class="tr-info"><b>${esc(e.name)}</b>
        <div class="tr-pts"><b>${e.points}</b> pts <span class="muted">· max ${e.maxPts}</span></div>${sub(e, true)}${bars(e, tr.constructors, col)}</div></div>`;
  };
  const alive = (l) => l.filter((e) => e.alive).length;
  const head = (l, champ, kind) => (champ
    ? `<div class="tr-champ">${icon('trophy')} ${kind === 'd' ? t('{} est champion du monde', esc(champ.name)) : t('{} est championne du monde des constructeurs', esc(champ.name))}</div>`
    : `<div class="tr-count"><b>${alive(l)}</b> ${kind === 'd' ? t('pilotes encore en lice') : t('écuries encore en lice')}</div>`);
  // Quand le titre peut-il se jouer : au plus tôt, et toutes les conditions au prochain Grand Prix (tableau compact)
  const clinchBox = (c, kind) => {
    if (!c) return '';
    const gp = (r) => `<b>${esc(gpShort(r.name, EN))}</b> <span class="muted">R${r.round}</span>`;
    const L = esc(c.leader.name);
    const top = c.needs[0];
    const atNext = c.earliest?.round === c.next.round;
    const list = kind === 'd' ? tr.drivers : tr.constructors;
    const who = (n) => {
      const e = list.find((x) => x.key === n.key) || {};
      return `<span class="tr-cl-who" style="--tc:${kind === 'd' ? color(e.team, e.teamId) : color(e.name, e.id)}" title="${esc(n.name)}">${esc(kind === 'd' ? n.code : n.name)}</span>`;
    };
    // Place à l'arrivée qu'il faut au rival quand le leader finit 1er (25 pts) ou 2e (18 pts)
    const place = (n, lp, lpos) => {
      const allowed = lp - n.margin;
      if (allowed < 0) return '—';
      const p = placeForMaxPoints(allowed);
      if (p < lpos || (lpos === 1 && p <= 2)) return t('suffit');
      return p > 10 ? t('hors des points') : t('P{} ou plus loin', p === lpos ? p + 1 : p);
    };
    const places = kind === 'd' && !c.next.sprint;
    const gap = (m) => (m === 1 ? t('+1 pt ou plus') : m > 0 ? t('+{} pts ou plus', m) : m === 0 ? t('égalité ou mieux') : m === -1 ? t('−1 pt au pire') : t('−{} pts au pire', -m));
    const head = `<div class="tr-cl-head"><span>${icon('trophy')} ${t(atNext ? 'Titre possible dès le prochain Grand Prix : {}' : 'Titre possible au plus tôt : {}', c.earliest ? gp(c.earliest) : t('Dernière manche'))}</span>
      ${!atNext && top ? `<span class="muted">${t('si {} marque le maximum à chaque manche jusque-là et {} aucun point', L, esc(top.name))}</span>` : ''}</div>`;
    const body = !c.possibleNext
      ? `<div class="tr-cl-note">${t('Pas encore à {} : il faudrait {} points de plus que {} ({} au maximum sur le week-end).', esc(gpShort(c.next.name, EN)), top.margin, esc(top.name), c.next.max)}</div>`
      : `<div class="tr-cl-sub">${c.needs.length > 1 ? t('Conditions pour {}, toutes à la fois', L) : t('Condition pour {}', L)}${c.next.sprint ? ` <span class="muted">· ${t('sprint et course cumulés')}</span>` : ''}</div>
        <div class="tr-cl-scroll"><table class="tr-cl-tbl"><thead><tr><th>${t('Rival')}</th><th>${t('Sur le week-end')}</th>${places ? `<th>${t('En gagnant')}</th><th>${t('En finissant 2e')}</th>` : ''}</tr></thead>
        <tbody>${c.needs.map((n) => `<tr><td>${who(n)}</td><td><b>${gap(n.margin)}</b></td>${places ? `<td>${place(n, 25, 1)}</td><td>${place(n, 18, 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        <div class="tr-cl-note">${t('À égalité de points, le titre va au plus grand nombre de victoires.')}</div>`;
    return `<div class="tr-clinch">${head}${body}</div>`;
  };
  const left = tr.races ? `${t('{} courses', tr.races)}${tr.sprints ? ` ${t('et {} sprints', tr.sprints)}` : ''} ${t('à disputer')}` : t('Saison terminée');
  return `<div class="tr-intro sz-box"><div><div class="muted small">${t('Reste')}</div><div class="tr-big">${left}</div></div>
      <div><div class="muted small">${t('Points encore à prendre')}</div><div class="tr-big">${tr.maxD} <span class="muted small">${t('par pilote')}</span> · ${tr.maxC} <span class="muted small">${t('par écurie')}</span></div></div></div>
    <div class="sz-h2h-pick"><div class="tab-seg">${[['d', 'Championnat pilotes'], ['c', 'Championnat constructeurs']].map(([k, l]) => `<button type="button" data-tr-kind="${k}" class="${trKind === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div></div>
    ${trKind === 'd'
    ? `<section class="sz-box"><h3>${t('Championnat pilotes')}</h3>${head(tr.drivers, tr.champion, 'd')}${clinchBox(tr.clinchD, 'd')}<div class="tr-grid">${tr.drivers.map(driverCard).join('')}</div></section>`
    : `<section class="sz-box"><h3>${t('Championnat constructeurs')}</h3>${head(tr.constructors, tr.champTeam, 'c')}${clinchBox(tr.clinchC, 'c')}<div class="tr-grid">${tr.constructors.map(teamCard).join('')}</div></section>`}`;
}

// Comparer deux saisons : le leader de chaque saison et une phrase de résumé, la courbe des points des deux leaders,
// puis un seul tableau (une ligne par pilote ou écurie : points des deux saisons au même moment, écart, places
// gagnées ou perdues ; tri par colonne). « Un pilote » : sa saison face à la précédente, Grand Prix par Grand Prix
function renderCompare() {
  const other = cmpYear && cmpYear !== data.year ? cmpYear : data.year - 1;
  const ran = data.races.filter(done).length || data.races.length;
  const o = others.get(other);
  if (!o) loadOther(other);
  const years = Array.from({ length: 8 }, (_, i) => new Date().getUTCFullYear() - i).filter((y) => y !== data.year);
  const max = Math.min(ran, o?.races?.length || ran);
  const round = Math.max(1, Math.min(cmpRound || ran, max));
  const nth = (r) => (EN ? `${r}${['th', 'st', 'nd', 'rd'][(r % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][r % 100] || 'th'}` : r === 1 ? '1er' : `${r}e`);
  const raceOf = (d) => [...d.races].sort((a, b) => a.round - b.round)[round - 1];
  const drvOpts = data.drivers.map((d) => `<option value="${d.code}" ${d.code === (cmpDrv || data.drivers[0]?.code) ? 'selected' : ''}${seasonOpt(d)}>${esc(d.name)}</option>`).join('');
  const picks = `<div class="sz-h2h-pick"><label class="small">${t('Comparer avec')} <select id="szCmpYear">${years.map((y) => `<option value="${y}" ${y === other ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label class="small">${t('Après le')} <select id="szCmpRound">${Array.from({ length: Math.max(1, max) }, (_, i) => i + 1).map((r) => `<option value="${r}" ${r === round ? 'selected' : ''}>${t('{} Grand Prix', nth(r))}</option>`).join('')}</select></label>
      ${cmpKind === 'p' ? `<label class="small">${t('Pilote')} <select id="szCmpDrv">${drvOpts}</select></label>` : ''}</div>
    <div class="sz-h2h-pick"><div class="tab-seg">${[['d', 'Pilotes'], ['c', 'Constructeurs'], ['p', 'Un pilote']].map(([k, l]) => `<button type="button" data-cmp-kind="${k}" class="${cmpKind === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div></div>`;
  if (!data.races.some(done)) return `${picks}<div class="note small">${t('Aucun Grand Prix couru en {} pour l\'instant.', data.year)}</div>`;
  if (!o || o.loading) return `${picks}<div class="note small">${t('Chargement de la saison {}…', other)}</div>`;
  if (o.error || !o.races?.length) return `${picks}<div class="note small">${t('Saison {} indisponible.', other)}</div>`;
  const w = Math.max(600, ($('#szContent')?.clientWidth || 934) - 34);
  const sign = (v, unit = '') => (v > 0 ? `<b class="up">+${v}${unit}</b>` : v < 0 ? `<b class="down">−${-v}${unit}</b>` : `<span class="muted">=</span>`);
  if (cmpKind === 'p') return picks + compareDriver(o, other, round, w, sign);
  const kind = cmpKind === 'd' ? 'd' : 'c', key = kind === 'd' ? 'drivers' : 'constructors';
  const id = (e) => (kind === 'd' ? e.key : lineage(e.key));
  const a = standingsAfter(data, round)[key], b = standingsAfter(o, round)[key];
  const atB = new Map(b.map((e) => [id(e), e]));
  const name = (e) => esc(e.last || e.name);
  const barOf = (e) => (kind === 'd' ? bar(e.team, e.teamId) : bar(e.name, e.id));
  const who = (e) => (kind === 'd' ? `${barOf(e)}<b>${name(e)}</b> <span class="muted small">${esc(e.team)}</span>` : `${barOf(e)}<b>${name(e)}</b>`);
  // En tête : où en était chaque saison à ce moment (leader et son avance), et une phrase qui résume
  const lead = (y, d, l) => `<div class="sz-card"><div class="muted small">${t('{} · après {}', y, esc(gpShort(raceOf(d)?.name || '', EN)))}</div>
      <div class="sz-big">${l[0] ? `${barOf(l[0])}${name(l[0])}` : '—'}</div>
      <div class="muted small">${l[0] ? `${t('en tête avec {} pts', l[0].points)}${l[1] ? ` · ${t('{} pts d\'avance sur {}', l[0].points - l[1].points, name(l[1]))}` : ''}` : ''}</div></div>`;
  const [a1, a2] = a, [b1, b2] = b;
  const gapA = a1 && a2 ? a1.points - a2.points : 0, gapB = b1 && b2 ? b1.points - b2.points : 0;
  const summary = a1 && b1 ? `<p class="note sz-box">${t('Après {} Grands Prix, le leader {} compte {} que celui de {} au même moment, et son avance est {} ({} pts contre {}).', round, data.year,
    a1.points === b1.points ? t('autant de points') : t(a1.points > b1.points ? '{} pts de plus' : '{} pts de moins', Math.abs(a1.points - b1.points)), other,
    gapA === gapB ? t('la même') : t(gapA > gapB ? 'plus large' : 'plus courte'), gapA, gapB)}</p>` : '';
  // Courbe des points des deux leaders, manche par manche (l'autre saison en pointillés)
  const path = (d, e) => pointsPath(d, kind, kind === 'd' ? e.code : e.key, round).map(({ x, y }) => ({ x, y }));
  const chart = a1 && b1 ? lineChartSvg([
    { label: kind === 'd' ? a1.code : a1.name, color: kind === 'd' ? color(a1.team, a1.teamId) : color(a1.name, a1.id), points: path(data, a1) },
    { label: kind === 'd' ? b1.code : b1.name, color: kind === 'd' ? color(b1.team, b1.teamId) : color(b1.name, b1.id), dashed: true, points: path(o, b1) },
  ], { w, h: 260 }) : '';
  // Tableau : tri par colonne (touchée une deuxième fois : retour à la position)
  const rows = a.map((e) => { const x = atB.get(id(e)); return { e, x, diff: x ? e.points - x.points : null, moved: x ? x.pos - e.pos : null }; });
  const by = { pos: (r) => r.e.pos, pts: (r) => -r.e.points, old: (r) => (r.x ? -r.x.points : Infinity), diff: (r) => (r.diff === null ? Infinity : -r.diff), place: (r) => (r.moved === null ? Infinity : -r.moved) }[cmpSort] || ((r) => r.e.pos);
  rows.sort((p, q) => by(p) - by(q) || p.e.pos - q.e.pos);
  const th = (k, label) => `<th class="sz-sort${cmpSort === k ? ' on' : ''}"><button type="button" data-cmp-sort="${k}" title="${esc(t('Trier par cette colonne'))}">${label}</button></th>`;
  const row = ({ e, x, diff, moved }) => `<tr><td>${e.pos}</td><td>${who(e)}</td><td><b>${e.points}</b></td>
      ${x ? `<td>${x.points} <span class="muted small">P${x.pos}</span></td><td>${sign(diff)}</td><td>${moved === 0 ? '<span class="muted">=</span>' : sign(moved, moved > 0 ? ' ▲' : ' ▼')}</td>`
    : `<td class="muted" colspan="3">${t('pas en {}', other)}</td>`}</tr>`;
  return `${picks}<div class="sz-cards">${lead(data.year, data, a)}${lead(other, o, b)}</div>${summary}
    <section class="sz-box"><h3>${t('Points des deux leaders, Grand Prix par Grand Prix')} <small class="muted">${t('trait plein : {} · pointillés : {}', data.year, other)}</small></h3>${chart}</section>
    <section class="sz-box"><h3>${t('{} face à {}, après {} Grands Prix', data.year, other, round)}</h3>
      <p class="hint">${t('Chaque ligne : les points en {} et, à côté, ceux du même {} au même moment de {}. Touchez un titre de colonne pour trier.', data.year, kind === 'd' ? t('pilote') : t('écurie'), other)}</p>
      <div class="sz-scroll"><table class="sz-table"><tr>${th('pos', t('Pos.'))}<th>${kind === 'd' ? t('Pilote') : t('Écurie')}</th>${th('pts', t('Points {}', data.year))}${th('old', t('Points {}', other))}${th('diff', t('Écart'))}${th('place', t('Place'))}</tr>
      ${rows.map(row).join('')}</table></div></section>`;
}

// « Un pilote » : sa saison face à l'autre, Grand Prix par Grand Prix (arrivée, points cumulés, écart)
function compareDriver(o, other, round, w, sign) {
  const d = data.drivers.find((x) => x.code === cmpDrv) || data.drivers[0];
  if (!d) return '';
  const a = pointsPath(data, 'd', d.code, round), b = pointsPath(o, 'd', d.code, round);
  if (!b.length || !b.some((p) => p.pos)) return `<div class="note small">${t('{} n\'a pas couru en {}.', esc(d.name), other)}</div>`;
  const count = (d2, fn) => (d2.races || []).filter((r) => r.round <= round).reduce((n, r) => n + (r.results.some((x) => x.code === d.code && fn(x)) ? 1 : 0), 0);
  const stat = (d2) => ({ pts: (pointsPath(d2, 'd', d.code, round).at(-1)?.y) || 0, wins: count(d2, (x) => x.pos === 1), pods: count(d2, (x) => x.pos && x.pos <= 3) });
  const sa = stat(data), sb = stat(o);
  const card = (title, va, vb) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${va} <span class="muted small">${t('contre {} en {}', vb, other)}</span></div><div class="small">${sign(va - vb)}</div></div>`;
  const col = color(d.team, d.teamId);
  const chart = lineChartSvg([{ label: String(data.year), color: col, points: a.map(({ x, y }) => ({ x, y })) }, { label: String(other), color: col, dashed: true, points: b.map(({ x, y }) => ({ x, y })) }], { w, h: 240 });
  const rows = Array.from({ length: round }, (_, i) => i + 1).map((r) => {
    const pa = a.find((p) => p.x === r), pb = b.find((p) => p.x === r);
    const fin = (p) => (!p ? '—' : /^\d+$/.test(String(p.pos)) ? `P${p.pos}` : p.pos ? t('Abandon') : '—');
    return pa || pb ? `<tr><td>R${r}</td><td>${pa ? esc(gpShort(pa.gp, EN)) : '—'} <span class="muted small">${fin(pa)}</span></td><td><b>${pa ? pa.y : '—'}</b></td>
      <td>${pb ? esc(gpShort(pb.gp, EN)) : '—'} <span class="muted small">${fin(pb)}</span></td><td>${pb ? pb.y : '—'}</td><td>${pa && pb ? sign(pa.y - pb.y) : ''}</td></tr>` : '';
  }).join('');
  return `<div class="sz-cards">${card(t('Points'), sa.pts, sb.pts)}${card(t('Victoires'), sa.wins, sb.wins)}${card(t('Podiums'), sa.pods, sb.pods)}</div>
    <section class="sz-box"><h3>${t('{} : {} face à {}', esc(d.name), data.year, other)}</h3>${chart}</section>
    <section class="sz-box"><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Manche')}</th><th>${t('Grand Prix {}', data.year)}</th><th>${t('Points {}', data.year)}</th><th>${t('Grand Prix {}', other)}</th><th>${t('Points {}', other)}</th><th>${t('Écart')}</th></tr>${rows}</table></div></section>`;
}

// Explication en tête des vues qui n'en ont pas déjà une
function render() {
  if (!data) return;
  // Pilote ou Grand Prix demandé par l'adresse : retrouvé dans la saison chargée
  if (wanted?.year === data.year) {
    if (wanted.section === 'drivers') drvCode = data.drivers.find((d) => slug(d.name) === wanted.item)?.code ?? drvCode;
    if (wanted.section === 'gp') gpRound = data.races.find((r) => gpSlug(r.name) === wanted.item)?.round ?? null;
    wanted = null;
  }
  for (const b of document.querySelectorAll('#szNav [data-sz]')) b.classList.toggle('active', b.dataset.sz === section);
  if ($('#szCur')) $('#szCur').textContent = $('#szNav .active')?.textContent.trim() || (section === 'gp' ? 'Grand Prix' : '');
  const st = stats?.year === data.year || stats?.error ? stats : null;
  const ctx = { data, stats: st, color, bar, opt: seasonOpt, official: (id) => OFFICIAL[id] || '8b95a8', ratings: ratingsFor(data, st), prev: prev?.year === data.year - 1 ? prev : null };
  if (section === 'drivers') loadPrev();
  const fiaData = fia?.year === data.year ? fia : null;
  const html = {
    home: renderHome, calendar: renderCalendar, standings: renderStandings, title: renderTitle, compare: renderCompare, destructors: () => { loadDest(data.year); return renderDestructors({ ...ctx, chart: lineChartSvg, w: Math.max(600, ($('#szContent')?.clientWidth || 934) - 34) }, dest?.year === data.year && !dest.loading ? dest : null); }, results: renderResults, h2h: renderH2H,
    drivers: () => renderDrivers(ctx, drvCode), consistency: () => renderConsistency(ctx), pits: () => renderPits(ctx),
    speeds: () => renderSpeeds(ctx, speedPt), circuits: () => renderCircuits(ctx, circSort), ratings: () => renderRatings(ctx, rateSort),
    tech: () => renderTech(ctx, fiaData), elements: () => renderElements(ctx, fiaData), predict: () => renderPredict(data.year, (code) => { const d = data.drivers.find((x) => x.code === code); return d ? seasonOpt(d) : ''; }), review: () => renderReview(ctx),
    gp: renderGp,
  }[section]();
  // Tableaux larges : défilement de côté gardé quand la rubrique est redessinée (nouvelle course analysée…)
  const wide = () => $('#szContent').querySelectorAll('.sz-box, .sz-scroll');
  const scrolls = jump ? [] : [...wide()].map((e) => e.scrollLeft);
  if (jump && push) leaveTop = $('#szContent').scrollTop;   // rubrique quittée : défilement gardé pour le retour
  $('#szContent').innerHTML = `${data.stale ? '<div class="note small">Hors ligne : dernières données enregistrées.</div>' : ''}${html}`;
  wide().forEach((e, i) => { if (scrolls[i]) e.scrollLeft = scrolls[i]; });
  tick();
  syncUrl();
  if (section === 'tech' && fiaData) translateTechDetail(ctx, fiaData);
  if (jump) {
    jump = false;
    $('#szContent').scrollTop = 0;
    // Téléphone : la rubrique choisie visible dans le bandeau du haut
    $('#szNav .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function tick() {
  const el = $('#szCountdown');
  if (!el) return;
  const ms = Math.max(0, Date.parse(el.dataset.t) - Date.now());
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (v) => String(v).padStart(2, '0');
  el.innerHTML = [[d, 'jours'], [h, 'h'], [m, 'min'], [s, 's']].map(([v, l]) => `<span><b>${p(v)}</b><small>${l}</small></span>`).join('');
}

// Changement de rubrique : le contenu apparaît en cascade (une seule fois, pas à chaque mise à jour)
function animate() {
  const el = $('#szContent');
  el.classList.remove('sz-anim');
  void el.offsetWidth;
  el.classList.add('sz-anim');
  clearTimeout(animate.t);
  animate.t = setTimeout(() => el.classList.remove('sz-anim'), 500);
}

// y : saison à afficher (bilan de la saison passée depuis l'accueil hors saison) ; item : pilote ou Grand Prix demandé
// par l'adresse de la version web (« lando-norris », « mexico »)
export function openSeason(sec, y, item, back = false) {
  if (sec) section = sec;
  push = !back;
  wanted = item ? { year: y || year, section: sec, item } : null;
  if (back && sec === 'drivers' && !item) drvCode = null;   // retour sur « Pilotes » : sans le pilote choisi ensuite
  if (y && y !== year) { year = y; data = null; stats = null; fia = null; $('#szYear').value = String(y); }
  jump = true;
  if ($('#newsView')) import('./news.js').then((m) => m.closeNews());   // pas d'Actu dans la version web
  import('./home.js').then((m) => { m.homeTouched(); m.closeHome(); });
  import('./replays.js').then((m) => m.closeReplays());
  $('#seasonView').hidden = false;
  placeView($('#seasonView'));   // après l'affichage : la barre du haut peut s'alléger (version web sur téléphone)
  animate();
  $('#seasonBtn').classList.add('on');
  load();
  if (data?.year === year) follow();   // saison déjà chargée : load() ne relance rien
  render();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

// Téléphone : panneau des rubriques, ouvert sur la gauche par le bouton ☰
function szMenu(open) {
  $('#seasonView').classList.toggle('sz-open', open);
  $('#szMenu')?.setAttribute('aria-expanded', String(open));
}

export function closeSeason() {
  szMenu(false);
  $('#seasonView').hidden = true;
  $('#seasonBtn').classList.remove('on');
  if (urls && location.pathname.startsWith('/saison/')) history.pushState(null, '', '/');
  if (urls) { delete document.documentElement.dataset.seasonTitle; document.title = 'Paddock Live'; }
  clearInterval(timer);
  clearTimeout(fiaTimer);
  clearTimeout(statsTimer);
}

export function initSeason() {
  initPredict();
  const sel = $('#szYear');
  const now = new Date().getUTCFullYear();
  sel.innerHTML = Array.from({ length: 8 }, (_, i) => now - i).map((y) => `<option value="${y}">${y}</option>`).join('');
  sel.addEventListener('change', () => { year = Number(sel.value); push = true; data = null; stats = null; fia = null; clearTimeout(statsTimer); clearTimeout(fiaTimer); setTechFilter(null, 'all'); load(); });
  $('#seasonBtn').addEventListener('click', () => ($('#seasonView').hidden ? openSeason() : closeSeason()));
  $('#szClose').addEventListener('click', closeSeason);
  $('#szNav').addEventListener('click', (e) => { const b = e.target.closest('[data-sz]'); if (b) { section = b.dataset.sz; jump = true; push = true; szMenu(false); animate(); render(); } });
  $('#szMenu')?.addEventListener('click', () => szMenu(true));
  $('#szScrim')?.addEventListener('click', () => szMenu(false));
  $('#szContent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-szgo]');
    if (b) { section = b.dataset.szgo; jump = true; push = true; animate(); render(); return; }
    const g = e.target.closest('[data-szgp]');
    if (g) { e.preventDefault(); section = 'gp'; push = true; gpRound = Number(g.dataset.szgp); jump = true; animate(); render(); return; }
    const rv = e.target.closest('[data-review]');
    if (rv && data) { reviewAction(rv.dataset.review, data); return; }
    const t = e.target.closest('[data-h2h-team]'), m = e.target.closest('[data-h2h-mode]');
    if (t) { h2hTeam = t.dataset.h2hTeam; render(); } else if (m) { h2hMode = m.dataset.h2hMode; render(); }
    const ck = e.target.closest('[data-cmp-kind]');
    if (ck) { cmpKind = ck.dataset.cmpKind; render(); return; }
    const dd = e.target.closest('[data-dest-drv]');
    if (dd) { showDestructorsDriver(Number(dd.dataset.destDrv)); render(); return; }
    const cs = e.target.closest('[data-cmp-sort]');
    if (cs) { cmpSort = cmpSort === cs.dataset.cmpSort ? 'pos' : cs.dataset.cmpSort; render(); return; }
    const k = e.target.closest('[data-tr-kind]');
    if (k) { trKind = k.dataset.trKind; render(); }
    const rs = e.target.closest('[data-rate-sort]');
    if (rs) { rateSort = rs.dataset.rateSort; render(); }
  });
  $('#szContent').addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'szH2hA') h2hA = e.target.value;
    else if (id === 'szH2hB') h2hB = e.target.value;
    else if (id === 'szDriver') { drvCode = e.target.value; push = true; }
    else if (id === 'szSpeedPt') speedPt = e.target.value;
    else if (id === 'szCircSort') circSort = e.target.value;
    else if (id === 'szCmpYear') cmpYear = Number(e.target.value);
    else if (id === 'szCmpRound') cmpRound = Number(e.target.value);
    else if (id === 'szCmpDrv') cmpDrv = e.target.value;
    else if (id === 'szTechGp') setTechFilter(e.target.value, 'all');
    else if (id === 'szTechTeam') setTechFilter(undefined, e.target.value);
    else if (id === 'szTechOrig') toggleTechOriginal(e.target.checked);
    else return;
    render();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#seasonView').hidden && !document.querySelector('dialog[open]')) { if ($('#seasonView').classList.contains('sz-open')) szMenu(false); else closeSeason(); } });
}
