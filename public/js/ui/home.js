// Page d'accueil, sans spoiler : prochaine séance (compte à rebours), dernière séance sans son
// résultat (replay depuis le début ou tableau de bord), dernières actualités, raccourcis.
// Ouverte au lancement quand aucune séance n'est en cours ; pendant une séance, l'appli s'ouvre
// directement sur le Direct.
import { $, $$, esc, api, drivers, placeView, hideBoot, dayIn, teamColor, teamLogo, teamMark, photoUrl, OFFICIAL, nightMark, calSession, tyreBadge } from '../util.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { DEC, LOCALE, LANG, t } from '../i18n.js';
import { gpShort, sessionLabel } from '/shared/gp-names.js';
import { toast } from './delay.js';
import { prefs, setPref, toggleFav, toggleTeamFav } from '../prefs.js';
import { teamKey } from '/shared/news.js';
import { openResults } from './results-view.js';
import { COUNTRY_ISO } from '/shared/country-iso.js';
import { nearestShape, shapeOutline } from '/shared/circuit-shapes.js';
import { cloudTranslate } from '../cloud.js';
import { upcomingAgenda, localDay } from '/shared/agenda.js';
import { openf1TestDays, testState } from '/shared/testing.js';
import { buildDayIcs } from '/shared/ics.js';

let schedule = null;   // [{ race, round, label, t }]
let archive = null;    // dernière séance rejouable { meeting, name, path, t }
let timer = 0;
let standings = null;  // classement du championnat (carte du favori)
let weather = null;    // { key, days, tz } : météo prévue du prochain Grand Prix, fuseau horaire du circuit
let reveal = false;    // favoris, classements et chiffres à jour dévoilés (peuvent contenir le dernier résultat)
let editFav = false;   // choix des pilotes et écuries favoris ouvert sur l'accueil
let touched = false;   // l'utilisateur a quitté l'accueil : plus d'ouverture ou de fermeture automatique
let resultsOpen = false;   // résultats de la dernière séance demandés : tableau de bord même sans direct

// Durée approximative d'une séance (fenêtre « en cours »)
const LONG = /course|race|grand prix/i;
const lengthOf = (label) => (LONG.test(label) && !/sprint/i.test(label) ? 150 : 75) * 60e3;
const sessionName = (n) => t(sessionLabel(n, LANG));   // nom anglais de la F1 ou libellé déjà en français

// Calendrier chargé une fois (accueil et écran « Pas de séance en direct »). Serveur injoignable (appli ouverte
// hors connexion) : pas de « Hors saison » ni de « Saison terminée » faute de données, nouvel essai chaque minute
let scheduleLoad = null, scheduleFailed = false;
const loadSchedule = () => (scheduleLoad ||= readSchedule());
async function readSchedule() {
  const year = new Date().getFullYear();
  const races = [];
  for (const y of [year, year + 1]) {
    try { races.push(...(await api(`/api/schedule?year=${y}`)).races.map((r) => ({ ...r, year: y }))); } catch {
      scheduleFailed = true;
      setTimeout(() => { scheduleLoad = null; loadSchedule().then(() => { noLiveCheck(); render(); }); }, 60e3);
      return;
    }
    if (races.some((r) => r.sessions.some((s) => Date.parse(s.t) > Date.now()))) break;
  }
  scheduleFailed = false;
  schedule = races.flatMap((r) => r.sessions.filter((s) => s.t).map((s) => ({ race: r.name, round: r.round, year: r.year, label: s.label, t: Date.parse(s.t), lat: r.lat, lon: r.lon, locality: r.locality, country: r.country, circuitId: r.circuitId })))
    .sort((a, b) => a.t - b.t);
}

// Heure de début d'une séance des archives (heure locale du circuit + décalage)
function archiveStart(s) {
  const m = /^(-)?(\d+):(\d+)/.exec(s.gmtOffset || '');
  const off = m ? (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60e3 : 0;
  return Date.parse(`${s.start}Z`) - off;
}

async function loadArchive() {
  if (store.web) return;   // version web : pas de replays (archives lues par le serveur de l'appli)
  const year = new Date().getFullYear();
  for (const y of [year, year - 1]) {
    let list;
    try { list = await api(`/api/archive?year=${y}`); } catch { continue; }
    const done = list.flatMap((m) => m.sessions.map((s) => ({ meeting: m.name, name: s.name, path: s.path, t: archiveStart(s) })))
      .filter((s) => s.t && s.t + lengthOf(s.name) < Date.now()).sort((a, b) => a.t - b.t);
    if (done.length) { archive = done.at(-1); return; }
  }
}

// Dernière séance terminée : archives F1 (rejouable), sinon calendrier (archives réservées aux
// abonnés F1 TV)
function lastSession() {
  const s = schedule?.filter((x) => x.t + lengthOf(x.label) < Date.now()).at(-1);
  if (archive && (!s || archive.t >= s.t - 3600e3)) return archive;
  return s ? { meeting: s.race, name: s.label, t: s.t, path: null } : archive;
}

const liveNow = () => schedule?.find((s) => Date.now() >= s.t - 10 * 60e3 && Date.now() <= s.t + lengthOf(s.label));
const nextSession = () => schedule?.find((s) => s.t > Date.now());

function countdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60e3));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  return d ? `${d} j ${String(h).padStart(2, '0')} h ${String(min).padStart(2, '0')} min` : h ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
}
function ago(t) {
  const h = Math.max(0, (Date.now() - t) / 3600e3);
  if (h < 1) return 'il y a moins d\'une heure';
  if (h < 24) return `il y a ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} jours`;
}
const when = (t) => new Date(t).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const flag = (country) => (COUNTRY_ISO[country] ? `<img class="cal-flag" src="https://flagcdn.com/w80/${COUNTRY_ISO[country]}.png" alt="" onerror="this.remove()">` : '');
const isSprint = (nx) => schedule.some((s) => s.race === nx.race && s.year === nx.year && s.label === 'Sprint');
// Programme du week-end du prochain Grand Prix, jour par jour (même présentation que le calendrier)
function daysHtml(nx) {
  const days = new Map(), sprint = isSprint(nx);
  for (const s of schedule.filter((x) => x.race === nx.race && x.year === nx.year)) {
    const k = new Date(s.t).toDateString();
    if (!days.has(k)) days.set(k, { t: s.t, list: [] });
    days.get(k).list.push(s);
  }
  const hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `<div class="cal-days">${[...days.values()].map((d) => `<div class="cal-day"><div class="cal-day-h">${esc(new Date(d.t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }))}</div>
    ${d.list.map((s) => calSession(s.label, nightMark(s.t) + hm(s.t), `${s.t < Date.now() ? 'past' : ''} ${s === nx ? 'now' : ''}`, sprint)).join('')}</div>`).join('')}</div>
    <button type="button" class="linkish cal-notes-tog" data-notes-tog><span class="nt-on">Masquer les explications</span><span class="nt-off">Afficher les explications</span></button>`;
}
// Explications sous les séances : lien sous le programme (appli et version web, qui n'a pas la fenêtre Réglages)
document.addEventListener('click', (e) => { if (e.target.closest('[data-notes-tog]')) setPref('sessionNotes', prefs.sessionNotes === false); });
const gp = (name) => gpShort(name, LANG);

// Intersaison : prochaines dates annoncées officiellement (présentations, lancement de la saison, essais ; liste tenue
// à la main, shared/agenda.js), chacune avec le lien de son annonce, et toutes ensemble dans son agenda (.ics)
const dayOf = (s, o) => new Date(`${s}T12:00:00`).toLocaleDateString(LOCALE, o);
function agendaDate(e) {
  if (!e.end) return dayOf(e.date, { day: 'numeric', month: 'short' });
  return e.end.slice(0, 7) === e.date.slice(0, 7) ? `${dayOf(e.date, { day: 'numeric' })}–${dayOf(e.end, { day: 'numeric', month: 'short' })}`
    : `${dayOf(e.date, { day: 'numeric', month: 'short' })} – ${dayOf(e.end, { day: 'numeric', month: 'short' })}`;
}
function agendaHtml(list) {
  if (!list.length) return '';
  return `<div class="cal-days hm-agenda"><div class="cal-day"><div class="cal-day-h">${t('Prochaines dates')}</div>
    ${list.map((e) => `<a class="cal-s" href="${esc(e.link)}" target="_blank" rel="noopener" title="${t('Annonce officielle')}"><span>${esc(t(e.title))}</span><b>${esc(agendaDate(e))}</b></a>`).join('')}
    <div class="hm-ag-add"><button class="btn small" data-home="agenda" title="${t('Google Agenda, Apple Calendrier, Outlook…')}">${icon('calendar')} ${t('Ajouter ces dates à mon agenda')}</button></div></div></div>`;
}
function agendaFile() {
  const ics = buildDayIcs(upcomingAgenda().map((e) => ({ ...e, key: e.title, title: `F1 · ${t(e.title)}` })), { name: t('F1 · intersaison') });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'f1-intersaison.ics' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Essais d'hiver de la saison (shared/testing.js) : jours connus dès la publication du calendrier, heures quand la F1
// les publie. Appli : son serveur (OpenF1 et index des archives de la F1) ; version web : OpenF1 directement
let tests = null, testsKey = '';
function loadTests(year) {
  const key = `${year}|${Math.floor(Date.now() / (6 * 3600e3))}`;   // relus toutes les 6 h
  if (testsKey === key) return;
  testsKey = key;
  (store.web ? fetch(`https://api.openf1.org/v1/sessions?year=${year}`).then((r) => r.json()).then(openf1TestDays)
    : api(`/api/testing?year=${year}`).then((d) => d.days || []))
    .catch(() => tests || []).then((days) => { tests = days; if (isHomeOpen()) render(); });
}
const testDay = (n) => sessionName(`Day ${n}`);
// Compte à rebours de la prochaine journée (en jours tant que son heure n'est pas annoncée) ou journée en cours
function testsHead(ts, nx, year) {
  const d = ts.current || ts.next, first = tests[0];
  const days = Math.round((Date.parse(`${d.day}T12:00:00Z`) - Date.parse(`${localDay(Date.now())}T12:00:00Z`)) / 86400e3);
  const count = ts.current ? ''
    : d.start ? `<div class="hm-count" id="hmCount" role="timer">${countHtml(d.start - Date.now())}</div>`
    : `<div class="hm-count"><span class="hm-cd"><b>${days}</b><small>${CD_UNITS[0]}</small></span></div>`;
  return `<div class="hm-title">${flag(first.country)}<span>${t('Essais d’hiver {}', year)} <small>${esc(first.place)}</small></span></div>
    ${count}
    <div class="muted">${ts.current ? esc(t('{} : en piste aujourd’hui', testDay(d.n)))
      : `${esc(testDay(d.n))} · ${d.start ? `${nightMark(d.start)}${esc(when(d.start))}` : `${esc(dayOf(d.day, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${t('horaires pas encore annoncés')}`}`}</div>
    ${nx ? `<div class="muted small">${t('Premier Grand Prix')} : ${esc(gp(nx.race))}, ${esc(when(nx.t))}</div>` : ''}`;
}
// Programme des essais, jour par jour (même présentation que celui d'un week-end de Grand Prix)
function testDaysHtml(ts) {
  const at = ts.next ? tests.indexOf(ts.next) : tests.length;
  const hm = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `<div class="cal-days hm-tests">${tests.map((d, i) => `<div class="cal-day"><div class="cal-day-h">${esc(dayOf(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</div>
    <div class="cal-s${d === ts.current ? ' now' : i < at ? ' past' : ''}"><span>${esc(testDay(d.n))}</span><b>${d.start ? `${nightMark(d.start)}${hm(d.start)}` : `<span title="${t('Horaire pas encore annoncé')}">–</span>`}</b></div></div>`).join('')}</div>`;
}

// Tracés des circuits (tuile Calendrier de l'Accueil, comme le Calendrier de la Saison), chargés à la demande
let shapes = null, shapeList = null;
const loadShapes = () => (shapes ??= fetch('/data/f1-circuits.json').then((r) => r.json()).then((d) => (shapeList = d.circuits || [])).catch(() => []));

// Météo prévue des jours du prochain week-end (Open-Meteo, 16 jours au plus)
async function loadWeather(nx) {
  if (!nx?.lat) return;
  const key = `${nx.race}|${nx.year}`;
  // Temps actuel et prochaines heures : rechargés toutes les 30 min
  if (weather?.key === key && Date.now() - weather.at < 30 * 60e3) return;
  weather = { ...(weather?.key === key ? weather : { days: null, tz: null, current: null, hours: null }), key, at: Date.now() };
  try {
    const d = await api(`/api/forecast?lat=${nx.lat}&lon=${nx.lon}`);
    const dates = new Set(schedule.filter((s) => s.race === nx.race && s.year === nx.year).map((s) => dayIn(s.t, d.tz)));
    weather.days = (d.days || []).filter((x) => dates.has(x.date));
    weather.tz = d.tz || null;
    weather.current = d.current || null;
    weather.hours = d.hours || null;
  } catch { weather.days ??= []; }
  if (isHomeOpen()) render();
}
function weatherHtml(nx) {
  const days = weather?.key === `${nx.race}|${nx.year}` ? weather.days : null;
  if (!days?.length) return '';
  return `<div class="hm-wx">${days.map((d) => `<span title="Météo prévue sur le circuit"><b>${esc(new Date(`${d.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short' }))}</b> ${Math.round(d.tmax)}° ${d.rain != null ? `<small>${icon('rain')} ${d.rain} %</small>` : ''}</span>`).join('')}</div>`;
}

// ---------- Avant le départ en une minute : dans l'heure avant la course ----------
// Pneus Pirelli du week-end, pluie prévue pendant la course, enjeu du championnat ; la grille officielle de la FIA (départs
// des stands, pénalités : elle dévoile le résultat des qualifications) seulement après le clic sur « Voir la grille »
let pre = null;   // { key, open, loading, grid: undefined (pas lue) | null (pas encore publiée) | {…}, error }
const preRace = () => schedule?.find((s) => s.label === 'Course' && s.t > Date.now() && s.t - Date.now() <= 3600e3);
function preRain(r) {
  if (weather?.key !== `${r.race}|${r.year}`) return null;
  const during = (weather.hours || []).filter((h) => h.t >= r.t - 1800e3 && h.t <= r.t + 2 * 3600e3 && h.rain != null);
  if (during.length) return Math.max(...during.map((h) => h.rain));
  return weather.days?.find((d) => d.date === dayIn(r.t, weather.tz))?.rain ?? null;
}
// Enjeu du championnat des pilotes (course au titre de la Saison) ; résultat du sprint du week-end pas encore vu : masqué
function preStake(r) {
  if (!K || !standings?.drivers?.length) return standings?.loading ? sk('line') : '—';
  const sp = spoiler();
  if (sp) return `<span class="muted">${esc(t('Masqué : il dévoile le résultat de la manche {}.', sp.round))}</span>`;
  const tr = K.titleRace(standings, boardYear());
  if (tr.champion) return esc(t('{} est champion du monde', tr.champion.name));
  const [a, b] = tr.drivers.filter((e) => e.alive).sort((x, y) => y.points - x.points);
  const now = tr.clinchD?.earliest?.round === Number(r.round) ? t('Titre possible dès cette course pour {}', a.last || a.name)
    : `${tr.drivers.filter((e) => e.alive).length} ${t('pilotes encore en lice')}`;
  return `${b ? esc(t('{} mène avec {} pts d\'avance sur {}', a.last || a.name, a.points - b.points, b.last || b.name)) : ''}<div class="muted small">${esc(now)}</div>`;
}
// Grille de la FIA (après le clic) : P1, P2… dans l'ordre de lecture, départs des stands, puis les pénalités
function preGrid() {
  if (pre.loading) return `<div class="hm-pre-grid">${sk('row').repeat(4)}</div>`;
  if (pre.error) return state('Grille indisponible pour l\'instant', 'grid');
  if (!pre.grid) return state('Grille pas encore publiée par la FIA', 'grid');
  const g = pre.grid, ds = standings?.drivers || [];
  const who = (n) => g.rows.find((x) => x.num === n);
  const mark = (x) => { const d = ds.find((y) => String(y.number) === x.num) || ds.find((y) => y.last === x.last); return `<span class="drv-bar" style="background:${teamColor(d ? { TeamName: d.team, TeamColour: OFFICIAL[d.teamId] || '8b95a8' } : { TeamName: x.team })}"></span>`; };
  return `${g.final ? '' : `<div class="hm-pre-note">${esc(t('Grille provisoire : la grille définitive n\'est pas encore publiée.'))} <button class="btn small" data-home="grid">${icon('refresh')} ${t('Relire')}</button></div>`}
    <ol class="hm-pre-grid">${g.rows.map((x) => `<li${x.pitlane ? ' class="pit"' : ''}><b>${x.pitlane ? t('Stands') : `P${x.pos}`}</b>${mark(x)}<span data-no-i18n>${esc(x.last)}</span></li>`).join('')}</ol>
    ${g.penalties?.length ? `<ul class="hm-pre-pen">${g.penalties.map((p) => `<li><b data-no-i18n>${esc(p.cars.map((n) => who(n)?.last || `#${n}`).join(', '))}</b> <span${LANG === 'fr' ? '' : ' data-no-i18n'}>${esc(LANG === 'fr' ? p.fr : p.text)}</span></li>`).join('')}</ul>` : ''}`;
}
function preHtml() {
  const r = preRace();
  if (!r) return '';
  const key = `${r.race}|${r.year}`;
  if (pre?.key !== key) pre = { key, open: false };
  loadWeather(r);
  if (!extra.stats) loadExtra('stats');
  const ty = extra.stats?.v?.tyres?.[r.round];
  const rain = preRain(r);
  const hm = new Date(r.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `<section class="hm-card hm-pre" id="hmPre"><div class="hm-kicker"><span class="hm-tag">${icon('flag')} Avant le départ en une minute</span><span class="hm-round">${esc(t('Départ à {}', hm))}</span></div>
    <div class="hm-pre-facts">
      <div><div class="hm-ctx">Pneus Pirelli</div>${ty ? `<div class="hm-pre-ty">${tyreBadge('HARD')} C${ty.hard} ${tyreBadge('MEDIUM')} C${ty.medium} ${tyreBadge('SOFT')} C${ty.soft}</div>` : `<div class="muted small">${extra.stats?.loading ? 'Chargement…' : 'Composés pas encore annoncés'}</div>`}</div>
      <div><div class="hm-ctx">Pluie prévue</div>${rain == null ? '<div class="muted small">Météo indisponible</div>' : `<div>${icon('rain')} <b>${rain} %</b> <span class="muted small">${rain >= 40 ? 'de risque pendant la course' : 'risque faible'}</span></div>`}</div>
      <div><div class="hm-ctx">Championnat</div><div>${preStake(r)}</div></div>
    </div>
    ${pre.open ? preGrid() : `<div class="hm-actions"><button class="btn btn-accent" data-home="grid">${icon('eye-off')} Voir la grille</button><span class="muted small">${t('Départs des stands et pénalités : dévoile le résultat des qualifications')}</span></div>`}</section>`;
}
function renderPre() {
  const box = $('#hmPre');
  if (box) box.outerHTML = preHtml();
}
async function openGrid() {
  const r = preRace();
  if (!r || !pre) return;
  Object.assign(pre, { open: true, loading: true, error: false });
  renderPre();
  try {
    pre.grid = (await api(`/api/fia-grid?${new URLSearchParams({ year: r.year, name: r.race, location: r.locality || '', country: r.country || '' })}`)).grid;
  } catch { pre.error = true; }
  pre.loading = false;
  renderPre();
}

// Barre du haut entre deux séances : le prochain Grand Prix (prochaine séance, course, fiche du
// circuit, météo prévue, fuseau horaire). null pendant une séance, un replay ou les résultats.
export function upcoming() {
  if (!schedule || resultsOpen || store.status?.source?.mode === 'replay') return null;
  const st = store.state.SessionStatus?.Status;
  if (st === 'Started' || st === 'Aborted' || liveNow()) return null;
  const nx = nextSession();
  if (!nx) return null;
  loadWeather(nx);
  const week = schedule.filter((s) => s.race === nx.race && s.year === nx.year);
  const race = week.find((s) => s.label === 'Course') || week.at(-1);
  const w = weather?.key === `${nx.race}|${nx.year}` ? weather : null;
  return { ...nx, first: week[0].t, raceT: race.t, raceDay: w?.days?.find((d) => d.date === dayIn(race.t, w.tz)) || null, tz: w?.tz || null, days: w?.days || null, current: w?.current || null, hours: w?.hours || null, week };
}

// Pilotes et écuries favoris : position et points au championnat. Masqué juste après une séance (il
// peut dévoiler le résultat) tant qu'on ne demande pas à le voir. Les favoris se choisissent ici aussi.
let standingsLoad = null;
function loadStandings() {
  return (standingsLoad ||= (async () => {
    standings = { drivers: [], constructors: [], loading: true };
    try {
      K = await kpi();
      standings = await K.seasonGet(`/api/season?year=${new Date().getFullYear()}`);
    } catch (err) { standings = { drivers: [], constructors: [], error: true, offline: offline(err) }; }
    boardAt = Date.now();
    renderFav();
    renderStd();
    renderKpis();   // manches des chiffres (nom du Grand Prix) connues avec la saison
    renderPre();
  })());
}

// Choix des favoris hors de l'accueil (premier lancement) : mêmes boutons, mêmes actions
export async function favPicker() {
  await loadStandings();
  return favEditor(standings.drivers || [], teamsOf(standings.constructors || []));
}
export function favAction(k) {
  if (k.startsWith('favd:')) toggleDriver(k.slice(5));
  else if (k.startsWith('favt:')) toggleTeamFav(k.slice(5));
}

// Numéro de course : celui de la séance chargée (le champion porte le n° 1), sinon le numéro permanent
const driverNums = (d) => [Object.entries(drivers(store.state)).find(([, x]) => x.Tla === d.code)?.[0], d.number && String(d.number)].filter(Boolean);
const isFavDriver = (d) => driverNums(d).some((n) => prefs.favs.includes(n));
const teamsOf = (cs) => cs.map((c) => ({ ...c, key: teamKey(c.id, c.name) })).filter((c, i, all) => c.key && all.findIndex((x) => x.key === c.key) === i);
// Points, puis victoires (sous les points quand les favoris sont sur deux colonnes)
const pts = (x) => `${x.points} pts${x.wins ? `<i class="hm-fav-sep"> · </i><span class="hm-fav-w">${x.wins} victoire${x.wins > 1 ? 's' : ''}</span>` : ''}`;
const byName = (a, b) => a.localeCompare(b, LOCALE);

function favEditor(ds, teams) {
  if (!ds.length && !teams.length) return '<div class="hm-fav-edit muted small">Classement indisponible : choisissez vos favoris avec l\'étoile du classement du Direct.</div>';
  const dChips = [...ds].sort((a, b) => byName(a.last || a.name, b.last || b.name))
    .map((d) => `<button class="fav${isFavDriver(d) ? ' on' : ''}" data-home="favd:${esc(d.code)}" title="${esc(d.team)}">${esc(d.name)}</button>`).join('');
  const tChips = [...teams].sort((a, b) => byName(a.name, b.name))
    .map((c) => `<button class="fav${prefs.favTeams.includes(c.key) ? ' on' : ''}" data-home="favt:${esc(c.key)}">${esc(c.name)}</button>`).join('');
  return `<div class="hm-fav-edit"><div class="small muted">Pilotes</div><div class="fav-list">${dChips}</div>
    <div class="small muted">Écuries</div><div class="fav-list">${tChips}</div>
    <div class="small muted">Mis en avant dans le classement, les alertes et l'actu.</div></div>`;
}

function favHtml() {
  const ds = standings?.drivers || [];
  const teams = teamsOf(standings?.constructors || []);
  const favD = ds.filter(isFavDriver);
  const favT = teams.filter((c) => prefs.favTeams.includes(c.key));
  const count = favD.length + favT.length;
  const edit = `<button class="btn small" data-home="editfav">${icon(editFav ? 'check' : 'star')} ${editFav ? 'Terminé' : count ? 'Modifier' : 'Choisir mes favoris'}</button>`;
  const head = `<div class="hm-kicker"><span class="hm-tag">${count === 1 ? 'Mon favori' : 'Mes favoris'}</span> ${edit}</div>`;
  if (!count) {
    return `<section class="hm-card hm-fav" id="hmFav">${head}${editFav ? favEditor(ds, teams)
      : '<div class="muted">Ajoutez vos pilotes et écuries favoris.</div>'}</section>`;
  }
  const recent = lastSession() && Date.now() - lastSession().t < RECENT;
  const hide = recent && !reveal;
  // Pilotes puis écuries, chacun sous son titre ; mêmes colonnes pour toutes les lignes (grille commune)
  // Portrait du pilote (cerclé de la couleur de son écurie), logo de l'écurie
  const tc = (team, id) => teamColor({ TeamName: team, TeamColour: OFFICIAL[id] || '8b95a8' });
  const face = (d) => { const u = photoUrl({ Tla: d.code }); return u ? `<img class="hm-fav-pic" src="${u}" alt="" loading="lazy" style="--tc:${tc(d.team, d.teamId)}" onerror="this.remove()">` : ''; };
  const logo = (c) => { const u = teamLogo(c.name); return u ? `<span class="team-logo color" style="--tc:${tc(c.name, c.id || c.key)};background-image:url('${u}')"></span>` : ''; };
  // Une colonne par groupe : côte à côte sur ordinateur (la carte reste à la hauteur des classements), l'une sous l'autre
  // ailleurs ; sur deux colonnes, le prénom s'efface
  const name = (d) => `<span>${d.last && d.name.endsWith(d.last) ? `<span class="hm-fav-first">${esc(d.name.slice(0, -d.last.length))}</span>${esc(d.last)}` : esc(d.name)}</span>`;
  const rows = [
    ...(favD.length ? [`<div class="hm-fav-col"><div class="hm-fav-group muted">Pilotes</div>${favD.map((d) => `<div class="hm-fav-row"><span class="hm-fav-pos">P${d.pos}</span><b class="hm-fav-who">${face(d)}${name(d)}</b><span class="muted">${esc(d.team)}</span><span class="muted">${pts(d)}</span></div>`).join('')}</div>`] : []),
    ...(favT.length ? [`<div class="hm-fav-col"><div class="hm-fav-group muted">Écuries</div>${favT.map((c) => `<div class="hm-fav-row"><span class="hm-fav-pos">P${c.pos}</span><b class="hm-fav-who">${logo(c)}${esc(c.name)}</b><span></span><span class="muted">${pts(c)}</span></div>`).join('')}</div>`] : []),
  ];
  return `<section class="hm-card hm-fav" id="hmFav">${head}
    <div class="hm-favs${hide ? ' hm-blur' : ''}">${rows.join('')}</div>
    ${hide ? `<button class="btn small" data-home="showfav">${icon('eye-off')} Afficher (peut dévoiler le dernier résultat)</button>` : ''}
    ${editFav ? favEditor(ds, teams) : ''}</section>`;
}

// Carte des favoris seule (choix d'un favori, classement reçu) : le reste de l'accueil ne bouge pas
function renderFav() {
  const box = $('#hmFav');
  if (box) box.outerHTML = favHtml();
}

function toggleDriver(code) {
  const d = standings?.drivers?.find((x) => x.code === code);
  if (!d) return;
  const nums = driverNums(d);
  if (isFavDriver(d)) setPref('favs', prefs.favs.filter((n) => !nums.includes(n)));
  else toggleFav(nums[0]);
}

// ---------- Tableau de bord : calendrier, classements, chiffres de la saison ----------
// Calculs et lectures de la Saison partagés (season-kpi.js, petit module chargé avec le classement) ; statistiques,
// documents FIA et casseurs lus seulement quand leur carte approche de l'écran, après le premier affichage
let kpiLoad = null;
const kpi = () => (kpiLoad ||= import('./season-kpi.js').catch((err) => { kpiLoad = null; throw err; }));
let K = null;          // module season-kpi.js, une fois chargé
let extra = {};        // source -> { loading } | { v } | { error, offline }
let boardAt = 0;       // lecture du classement : tout est relu après 30 min (appli restée ouverte)
let io = null;
// Hors connexion : réseau coupé, ou serveur de l'appli qui ne joint plus celui de Paddock Live (server/index.js)
const offline = (err) => err instanceof TypeError || navigator.onLine === false || /injoignable/.test(err?.message);
const boardYear = () => standings?.year || new Date().getFullYear();
const KPIS = [
  { id: 'pits', src: 'stats', sz: 'pits', title: 'Arrêt le plus rapide' },
  { id: 'dmg', src: 'destructors', sz: 'destructors', title: 'Coût des dégâts' },
  { id: 'el', src: 'fia', sz: 'elements', title: 'Éléments moteur utilisés' },
  { id: 'tech', src: 'fia', sz: 'tech', title: 'Évolutions techniques' },
];

// Anti-spoiler : course ou sprint commencés il y a moins de 72 h (même délai que Mes favoris), résultat peut-être pas
// encore vu. Classements d'avant cette manche, arrêts et dégâts sans elle, jusqu'au clic sur « Afficher »
const RECENT = 72 * 3600e3;
function spoiler() {
  if (reveal) return null;
  const s = schedule?.filter((x) => /^(Course|Sprint)$/.test(x.label) && x.t < Date.now() && Date.now() - x.t < RECENT).at(-1);
  return s && s.year === boardYear() ? { round: Number(s.round), race: s.race } : null;
}

const sk = (cls) => `<i class="hm-sk ${cls}"></i>`;
const state = (text, retry) => `<div class="hm-state"><span>${text}</span>${retry ? `<button class="btn small" data-home="retry:${retry}">${icon('refresh')} Réessayer</button>` : ''}</div>`;
const unavailable = (e, retry) => state(e.offline ? 'Indisponible hors connexion' : 'Indisponible pour l\'instant', retry);
// Carte qui ouvre sa rubrique de la Saison (toute la carte, à la souris, au doigt et au clavier)
const linkCard = (cls, id, title, sz, body, busy = false, attrs = '') => `<section class="hm-card hm-link ${cls}" id="${id}"${busy ? ' aria-busy="true"' : ''}${attrs}>
  <div class="hm-kicker"><span class="hm-tag">${title}</span>${icon('arrow-right', 'hm-open')}</div>${body}
  <button class="hm-hit" data-home="sz:${sz}" aria-label="Voir dans la Saison : ${title}"></button></section>`;
const num = (v) => v.toLocaleString(LOCALE);
const sign = (v) => (v < 0 ? '−' : '+');
const pct = (v, base) => (base > 0 ? ` <span class="muted">(${sign(v)}${(Math.round((Math.abs(v) / base) * 1000) / 10).toFixed(1).replace('.', DEC)} %)</span>` : '');
const raceAt = (round) => standings?.races?.find((r) => r.round === round);
const where = (round) => `<div class="hm-ctx" data-no-i18n>${round === 0 ? esc(t('Roulage de Barcelone')) : round ? `R${round}${raceAt(round) ? ` · ${esc(gp(raceAt(round).name))}` : ''}` : ''}</div>`;
// Écart à la manche précédente ; fmt : mise en forme du nombre (montants des dégâts)
const trend = (delta, base, fmt = num) => (delta ? `<div class="hm-trend"><b>${sign(delta)}${fmt(Math.abs(delta))}</b>${pct(delta, base)} <span class="muted">vs manche précédente</span></div>` : '');

// Calendrier : manche, ville, tracé du circuit et part de la saison courue (calendrier déjà lu par l'Accueil)
function calHtml(nx) {
  const title = t('Calendrier {}', nx?.year ?? new Date().getFullYear());
  if (!schedule) return linkCard('hm-cal', 'hmCal', title, 'calendar', scheduleFailed ? state('Calendrier indisponible pour l\'instant') : `${sk('title')}${sk('big')}${sk('line')}`, !scheduleFailed);
  const y = nx?.year ?? new Date().getFullYear();
  const rounds = new Map();
  for (const s of schedule) if (s.year === y) rounds.set(s.round, { ...s, end: Math.max(rounds.get(s.round)?.end || 0, s.t + lengthOf(s.label)) });
  const list = [...rounds.values()].sort((a, b) => a.round - b.round);
  if (!list.length) return linkCard('hm-cal', 'hmCal', title, 'calendar', state(t('Calendrier {} bientôt publié', y)));
  const n = list.filter((r) => r.end < Date.now()).length;
  const cur = (nx && list.find((r) => r.round === nx.round)) || list.at(-1);
  const shape = shapeList && nearestShape(shapeList, Number(cur.lat), Number(cur.lon));
  return linkCard('hm-cal', 'hmCal', title, 'calendar', `<div class="hm-cal-main">
      <div class="hm-title">${flag(cur.country)}<span data-no-i18n>${esc(cur.locality || gp(cur.race))}</span></div>
      <div class="hm-ctx">${esc(t('Manche {} / {}', cur.round, list.length))} · <span data-no-i18n>${esc(gp(cur.race))}</span></div>
      <div class="hm-big">${(Math.round((n / list.length) * 1000) / 10).toFixed(1).replace('.', DEC)}<small> %</small></div>
      <div class="hm-ctx">de la saison terminée</div></div>
    <span class="hm-cal-trk" data-lat="${esc(cur.lat)}" data-lon="${esc(cur.lon)}">${shape ? `<svg viewBox="-4 -4 108 108" aria-hidden="true"><polygon points="${shapeOutline(shape.line)}"/></svg>` : ''}</span>
    <div class="hm-prog" role="img" aria-label="${esc(t('{} manches courues sur {}', n, list.length))}">${list.map((r) => `<i class="${r.end < Date.now() ? 'done' : r === cur ? 'now' : ''}"></i>`).join('')}</div>`);
}

// Classements du championnat, 10 premiers : points, écart au premier, places gagnées ou perdues à la dernière manche.
// Résultat peut-être pas vu (spoiler()) : classement d'avant cette manche, et « Afficher » pour le classement à jour
function stdHtml(kind) {
  const drv = kind === 'd';
  const title = drv ? 'Classement des pilotes' : 'Classement des constructeurs';
  const card = (body, busy) => linkCard('hm-std', drv ? 'hmStdD' : 'hmStdC', title, 'standings', body, busy);
  if (!standings || standings.loading || !K) return card(`<div class="hm-std-sk">${sk('row').repeat(10)}</div>`, true);
  if (standings.error) return card(unavailable(standings, 'standings'));
  const official = drv ? standings.drivers : standings.constructors;
  if (!official?.length) return card(state(t('Le classement {} commence au premier Grand Prix.', boardYear())));
  const after = (r) => K.standingsAfter(standings, r)[drv ? 'drivers' : 'constructors'];
  const sp = spoiler();
  const upTo = sp ? sp.round - 1 : Math.max(0, ...standings.races.filter((r) => r.results?.length).map((r) => r.round));
  const rows = sp ? (upTo > 0 ? after(upTo) : []) : official;
  const key = (x) => (drv ? x.code : x.id);
  const prev = upTo > 1 ? new Map(after(upTo - 1).map((x) => [key(x), x.pos])) : null;
  const favD = new Set(standings.drivers.filter(isFavDriver).map((x) => x.code));
  const fav = (x) => (drv ? favD.has(x.code) : prefs.favTeams.includes(teamKey(x.id, x.name)));
  const lead = rows[0]?.points || 0;
  const evo = (x) => {
    const g = prev?.has(key(x)) ? prev.get(key(x)) - x.pos : null;
    if (g === null) return '<td class="hm-evo"></td>';
    if (!g) return '<td class="hm-evo"><span aria-hidden="true">–</span><span class="sr-only">=</span></td>';
    return `<td class="hm-evo ${g > 0 ? 'up' : 'down'}">${icon(g > 0 ? 'tri-up' : 'tri-down')}<span class="sr-only">${g > 0 ? '+' : '−'}</span>${Math.abs(g)}</td>`;
  };
  const who = (x) => (drv
    ? `${teamMark({ TeamName: x.team, TeamColour: OFFICIAL[x.teamId] || '8b95a8' })}<b data-no-i18n>${esc(x.last || x.name)}</b>`
    : `${teamMark({ TeamName: x.name, TeamColour: OFFICIAL[x.id] || '8b95a8' })}<b data-no-i18n>${esc(K.teamShort(x.name))}</b>`);
  const mask = sp ? `<div class="hm-std-mask"><span class="muted">${esc(upTo > 0 ? t('Avant la manche {} : le dernier résultat reste masqué.', sp.round) : t('Masqué : il dévoile le résultat de la manche {}.', sp.round))}</span>
    <button class="btn small" data-home="showfav">${icon('eye-off')} Afficher le classement à jour</button></div>` : '';
  const table = rows.length ? `<table class="hm-std-t"><thead><tr><th>Pos.</th><th>${drv ? 'Pilote' : 'Écurie'}</th><th class="n">Points</th><th class="n">Écart</th><th class="n"><span class="sr-only">Évolution</span></th></tr></thead>
    <tbody>${rows.slice(0, 10).map((x) => `<tr${fav(x) ? ' class="fav"' : ''}><td class="hm-std-pos">${x.pos}</td><td class="hm-std-who">${who(x)}</td><td class="n">${num(x.points)}</td><td class="n hm-std-gap">${x.points === lead ? '' : `−${num(lead - x.points)}`}</td>${evo(x)}</tr>`).join('')}</tbody></table>` : '';
  return card(mask + table);
}
function renderStd() {
  for (const k of ['d', 'c']) { const box = $(k === 'd' ? '#hmStdD' : '#hmStdC'); if (box) box.outerHTML = stdHtml(k); }
}

// Chiffres de la saison (arrêts, dégâts, éléments moteur, évolutions techniques) : même calcul que leur rubrique
function kpiBody(k, v) {
  const sp = spoiler(), upTo = sp ? sp.round - 1 : Infinity;
  const races = standings?.races || [];
  const big = (x) => `<div class="hm-big">${x}</div>`;
  if (k.id === 'pits') {
    const s = K.fastestStop(v, upTo);
    return s && `${big(K.stopTxt(s))}<div class="hm-trend">${teamMark({ TeamName: s.d.team, TeamColour: s.d.color })}<b data-no-i18n>${esc(s.d.last || s.d.tla)}</b> <span class="muted" data-no-i18n>${esc(s.d.team)}</span></div>${where(s.round)}`;
  }
  if (k.id === 'dmg') {
    const d = K.damage(v.rows, upTo);
    return d && `${big(K.usd(d.total))}${trend(d.delta, d.total - d.delta, K.usd)}${where(d.round)}`;
  }
  const x = k.id === 'el' ? K.elementsTotal(races, v) : K.techTotal(races, v);
  return x && `${big(num(x.total))}${trend(x.delta, x.total - x.delta)}${where(x.ev.round)}`;
}
// Calcul qui échoue sur des données inattendues : la carte le dit (et propose de relire) au lieu de rester en chargement
function kpiSafe(k, v) {
  try { return kpiBody(k, v) || state(v?.pending ? 'Analyse en cours…' : t('Pas encore de données pour {}', boardYear())); }
  catch (err) { console.warn('[accueil]', k.id, err); return unavailable({}, k.src); }
}
function kpiHtml(k) {
  const e = extra[k.src];
  const body = !e || e.loading || !K ? `${sk('big')}${sk('line')}${sk('line short')}`
    : e.error || e.v?.error ? unavailable(e, k.src)
    : kpiSafe(k, e.v);
  return linkCard('hm-kpi', `hmK-${k.id}`, k.title, k.sz, body, !e || e.loading, ` data-src="${k.src}"`);
}
function renderKpis(src) {
  for (const k of KPIS) if (!src || k.src === src) { const box = $(`#hmK-${k.id}`); if (box) box.outerHTML = kpiHtml(k); }
}
async function loadExtra(src) {
  if (extra[src]) return;
  extra[src] = { loading: true };
  try {
    K ||= await kpi();
    // Réponse qui n'arrive pas (serveur lent ou en cours de mise à jour) : « Indisponible » et « Réessayer » après 30 s
    // (la demande bloquée est oubliée, pour que « Réessayer » en fasse une nouvelle)
    const path = `/api/season/${src}?year=${boardYear()}`;
    let timer;
    const late = new Promise((_, no) => { timer = setTimeout(() => { K.takeEarly(path); no(new Error()); }, 30e3); });
    extra[src] = { v: await Promise.race([K.seasonGet(path), late]).finally(() => clearTimeout(timer)) };
  } catch (err) { extra[src] = { error: true, offline: offline(err) }; }
  renderKpis(src);
  if (src === 'stats') renderPre();
}
// Après l'affichage : données des cartes de chiffres quand elles approchent de l'écran, tracé du circuit du calendrier
function watchBoard() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  io?.disconnect();
  io = new IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) { io.unobserve(e.target); loadExtra(e.target.dataset.src); }
  }, { root: view, rootMargin: '240px 0px' });
  for (const el of view.querySelectorAll('.hm-kpi[data-src]')) if (!extra[el.dataset.src]) io.observe(el);
  const trk = view.querySelector('.hm-cal-trk:empty');
  if (trk) loadShapes().then(() => { if (trk.isConnected && shapeList) $('#hmCal').outerHTML = calHtml(nextSession()); });
}

// Compte à rebours : jours, heures, minutes, secondes (cases du chronométrage)
const CD_UNITS = ['jours', 'heures', 'minutes', 'secondes'];
function cdParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1e3));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0'));
}
const countHtml = (ms) => cdParts(ms).map((v, i) => `<span class="hm-cd"><b data-v="${v}">${v}</b><small>${CD_UNITS[i]}</small></span>`).join('');
// Chiffre qui change : il roule comme celui de la Saison (l'ancien sort par le bas, le nouveau entre par le haut)
const roll = (v, old) => [...v].map((c, k) => (old.length === v.length && old[k] !== c ? `<i class="chg"><em class="o">${old[k]}</em><em>${c}</em></i>` : `<i>${c}</i>`)).join('');
let countTo = null;   // heure visée par le compte à rebours affiché (prochaine séance, ou essais d'hiver)
function tickCount() {
  const box = $('#hmCount');
  if (!box || !countTo) return;
  const v = cdParts(countTo - Date.now());
  box.querySelectorAll('b').forEach((b, i) => { if (b.dataset.v !== v[i]) { b.innerHTML = roll(v[i], b.dataset.v || ''); b.dataset.v = v[i]; } });
}

function render() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  const live = liveNow();
  const nx = nextSession();
  // Hors saison (premier Grand Prix de la saison suivante à plus de 3 semaines, ou calendrier pas encore publié) : la
  // saison passée, les replays et l'actu (transferts, présentations des voitures) plutôt qu'un long compte à rebours.
  // Pas pendant la trêve d'été (prochaine manche de la même saison)
  // Essais d'hiver à venir ou en cours : la carte reste « Hors saison » jusqu'à leur fin, avec leur compte à rebours
  const past = nx ? nx.year - 1 : new Date().getFullYear();
  if (!live && schedule && (!nx || Number(nx.round) === 1)) loadTests(past + 1);
  const ts = testState(tests || []), testing = !!(ts.current || ts.next);
  const off = !live && schedule && (!nx || (Number(nx.round) === 1 && (nx.t - Date.now() > 21 * 86400e3 || testing)));
  countTo = off && testing ? ts.next?.start ?? null : nx?.t;
  const card = off
    ? `<section class="hm-card hm-next hm-off${ts.current ? ' hm-tlive' : ''}"><div class="hm-next-main"><div class="hm-kicker"><span class="hm-tag">${ts.current ? `<span class="hm-dot"></span>${t('Essais en cours')}` : t('Hors saison')}</span></div>
        ${testing ? testsHead(ts, nx, past + 1) : nx ? `<div class="hm-title">${flag(nx.country)}<span>${t('Saison {}', nx.year)} : ${esc(gp(nx.race))} <small>${esc(nx.label)}</small></span></div>
        <div class="hm-count" id="hmCount" role="timer">${countHtml(nx.t - Date.now())}</div>
        <div class="muted">${nightMark(nx.t)}${esc(when(nx.t))}</div>`
    : `<div class="hm-title">${t('Calendrier {} bientôt publié', past + 1)}</div>`}
        <div class="hm-actions">${ts.current ? `<button class="btn btn-accent" data-home="live">${icon('signal')} ${t('Regarder en direct')}</button>` : ''}
          <button class="btn${ts.current ? '' : ' btn-accent'}" data-home="review:${past}">${icon('trophy')} ${t('Bilan de la saison {}', past)}</button>
          ${store.web ? '' : `<button class="btn" data-home="replays">${icon('history')} ${t('Revoir les courses')}</button>
          <button class="btn" data-home="news">${icon('news')} ${t('Transferts et nouveautés')}</button>`}</div></div>
        ${testing ? testDaysHtml(ts) : ''}${agendaHtml(upcomingAgenda().filter((e) => !(testing && e.kind === 'tests')))}</section>`
    : live
    ? `<section class="hm-card hm-live"><div class="hm-kicker"><span class="hm-tag"><span class="hm-dot"></span>Séance en cours</span></div>
        <div class="hm-title">${esc(gp(live.race))} : ${esc(live.label)}</div>
        <div class="muted">Commencée à ${esc(new Date(live.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))}</div>
        <div class="hm-actions"><button class="btn btn-accent" data-home="live">${icon('signal')} Regarder en direct</button></div></section>`
    : `<section class="hm-card hm-next"><div class="hm-next-main"><div class="hm-kicker"><span class="hm-tag">Prochaine séance</span>${nx ? `<span class="hm-round">Manche ${nx.round}</span>${isSprint(nx) ? '<span class="sz-tag sprint">Week-end sprint</span>' : ''}` : ''}</div>
        ${nx ? `<div class="hm-title">${flag(nx.country)}<span>${esc(gp(nx.race))} <small>${esc(nx.label)}</small></span></div>
        <div class="hm-count" id="hmCount" role="timer">${countHtml(nx.t - Date.now())}</div>
        <div class="muted">${nightMark(nx.t)}${esc(when(nx.t))}</div>
        ${weatherHtml(nx)}
        <div class="hm-actions"><a class="btn small" href="#" data-cal="${nx.year}" data-round="${nx.round}" title="Séances dans votre agenda (Google, Apple, Outlook)">${icon('calendar')} Ajouter ce week-end à mon agenda</a></div></div>
        ${daysHtml(nx)}`
          : `${schedule ? '<div class="hm-title">Saison terminée</div>' : state(scheduleFailed ? 'Calendrier indisponible pour l\'instant' : 'Calendrier en chargement…')}</div>`}</section>`;
  const ls = live ? null : lastSession();
  const last = ls
    ? `<section class="hm-card hm-last"><div class="hm-kicker"><span class="hm-tag">Dernière séance</span></div>
        <div class="hm-title"><span>${esc(gp(ls.meeting))} <small>${esc(sessionName(ls.name))}</small></span></div>
        <div class="muted">${esc(ago(ls.t))} · résultat masqué</div>
        <div class="hm-actions">${store.web ? '' : `<button class="btn btn-accent" data-home="replay">${icon('play')} Revoir en replay</button>`}
          <button class="btn${store.web ? ' btn-accent' : ''}" data-home="results" title="Résultats de la séance (résultat visible)">${icon('checkered')} Voir les résultats</button></div></section>`
    : '';
  // Un seul titre H1 dans la page : un paragraphe quand la page en a déjà un (pages de la Saison de la version web)
  // Un seul H1 : pas celui de l'Accueil quand la page en a un autre, ni sur une adresse de la Saison (version web : la
  // Saison pose le sien, #szH1)
  const hello = document.querySelector('h1:not(.hm-hello)') || /^\/(saison|en\/season)\//.test(location.pathname) ? 'p' : 'h1';
  view.querySelector('.hm-main').innerHTML = `<${hello} class="hm-hello">Paddock Live</${hello}>${preHtml()}
    <div class="hm-board${ls ? '' : ' hm-nolast'}">${card}${last}
      ${stdHtml('d')}${stdHtml('c')}${favHtml()}${calHtml(nx)}${KPIS.map(kpiHtml).join('')}
      <section class="hm-card hm-news"><div class="hm-kicker"><span class="hm-tag">Dernières actus</span>${store.web ? '' : ` <button class="btn small" data-home="news">Toute l'actu ${icon('arrow-right', 'ic-s')}</button>`}</div><div id="hmNews" class="hm-list"><div class="muted small">Chargement…</div></div></section>
    </div>
    <nav class="hm-go">
      <button data-home="live">${icon('signal')}<b>Direct</b><small>Tableau de bord</small></button>
      <button data-home="season">${icon('trophy')}<b>Saison</b><small>Calendrier, classements</small></button>
      ${store.web ? `<button data-home="alerts">${icon('bell')}<b>${t('Alertes')}</b><small>${t('Rappels, résultats, news')}</small></button>
      <button data-home="app">${icon('window')}<b>${t('Appli complète')}</b><small>${t('Replays, actu, alertes')}</small></button>` : `<button data-home="news">${icon('news')}<b>Actu</b><small>Toute l'actualité</small></button>
      <button data-home="replays">${icon('history')}<b>Replays</b><small>Rejouer une séance</small></button>`}
    </nav>
    <a class="hm-follow" href="https://paddocklive.app/${LANG === 'fr' ? 'jeu' : 'en/guess-the-circuit'}/" target="_blank" rel="noopener">${icon('flag')} ${t('Jeu du jour : devine le circuit')} ${icon('arrow-right', 'ic-s')}</a>
    <a class="hm-follow" href="https://paddocklive.app/liens/" target="_blank" rel="noopener">${icon('share')} Suivre Paddock Live sur les réseaux ${icon('arrow-right', 'ic-s')}</a>`;
  if (nx && !live) loadWeather(nx);
  (window.requestIdleCallback || setTimeout)(watchBoard, { timeout: 1500 });
  // Actualités et favoris : l'accueil est complet quand les deux sont là
  return Promise.allSettled([news(), loadStandings()]);
}

// again : titres traduits entre-temps, réaffichés une fois
async function news(again = true) {
  const box = $('#hmNews');
  if (!box) return;
  if (store.web) { webNews(box); return; }
  try {
    const list = await (await import('./news.js')).latestNews(4, again ? () => news(false) : null);
    box.innerHTML = list.length ? list.map((n) => `<button class="hm-news-item" data-home="news"><span class="hm-news-t" data-no-i18n>${esc(n.title)}</span><span class="muted small"><span data-no-i18n>${esc(n.src)}</span> · <span>${esc(n.when)}</span></span></button>`).join('') : '<div class="muted small">Aucune actualité pour le moment.</div>';
  } catch { box.innerHTML = '<div class="muted small">Actualités indisponibles.</div>'; }
}

// Version web : les 4 dernières nouvelles du serveur Paddock Live, ouvertes sur leur site dans un nouvel onglet. Titre
// dans la langue de la page : déjà traduit par le serveur (fr), sinon demandé au serveur (chaque titre est traduit une
// fois pour tous, comme pour l'appli) puis réaffiché
let webList = null;
const webTitles = new Map();   // titre d'origine -> traduction
async function webNews(box) {
  try {
    webList ||= fetch('/news/api').then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
    const d = await webList;
    const src = Object.fromEntries((d.sources || []).map((x) => [x.id, x.name]));
    const list = (d.items || []).filter((it) => it.kind !== 'video' && /^https:\/\//.test(it.link || '')).sort((a, b) => b.t - a.t).slice(0, 4);
    const title = (n) => (n.lang === LANG ? n.title : (LANG === 'fr' && n.fr) || webTitles.get(n.title) || n.title);
    const draw = () => {
      box.innerHTML = list.length ? list.map((n) => `<a class="hm-news-item" href="${esc(n.link)}" target="_blank" rel="noopener"><span class="hm-news-t" data-no-i18n>${esc(title(n))}</span><span class="muted small"><span data-no-i18n>${esc(src[n.src] || n.src)}</span> · <span>${esc(ago(n.t))}</span></span></a>`).join('') : '<div class="muted small">Aucune actualité pour le moment.</div>';
    };
    draw();
    const missing = list.filter((n) => title(n) === n.title && n.lang !== LANG);
    if (missing.length) {
      const out = await Promise.all(missing.map((n) => cloudTranslate(n.title, n.lang, LANG, 'news')));
      missing.forEach((n, i) => { if (out[i]) webTitles.set(n.title, out[i]); });
      if (out.some(Boolean) && box.isConnected) draw();
    }
  } catch { webList = null; box.innerHTML = '<div class="muted small">Actualités indisponibles.</div>'; }
}

export function openHome() {
  const view = $('#homeView');
  if (!view) return;
  import('./season-lazy.js').then((m) => m.closeSeason());
  if ($('#newsView')) import('./news.js').then((m) => m.closeNews());   // pas d'Actu ni de Replays dans la version web
  if ($('#replayView')) import('./replays.js').then((m) => m.closeReplays());
  placeView($('#homeView'));
  view.hidden = false;
  // Ouverture : cartes en cascade (une fois, pas à chaque mise à jour)
  const main = view.querySelector('.hm-main');
  main?.classList.add('hm-anim');
  clearTimeout(openHome.t);
  openHome.t = setTimeout(() => main?.classList.remove('hm-anim'), 900);
  // Appli restée ouverte : classement et chiffres relus (nouvelle course entre-temps)
  if (boardAt && Date.now() - boardAt > 30 * 60e3) { standingsLoad = null; extra = {}; boardAt = 0; }
  render();
  clearInterval(timer);
  // Secondes du compte à rebours
  timer = setInterval(() => {
    tickCount();
    // Séance qui commence pendant que l'accueil est affiché : carte « en cours »
    if (!!liveNow() !== !!$('#homeView .hm-live') || !!preRace() !== !!$('#hmPre') || (tests && !!testState(tests).current !== !!$('#homeView .hm-tlive'))) render();
  }, 1e3);
  document.dispatchEvent(new Event('viewchange'));
}

// Appli de bureau : fenêtres du second écran rouvertes au premier passage au tableau de bord
export function startWindows() {
  try { window.f1desktop?.openStartupWindows?.(); } catch { /* navigateur */ }
}

export function closeHome() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  view.hidden = true;
  clearInterval(timer);
  document.dispatchEvent(new Event('viewchange'));
}

export const isHomeOpen = () => !$('#homeView')?.hidden;

async function act(k) {
  touched = true;
  if (k === 'showfav') { reveal = true; renderFav(); renderStd(); renderKpis(); renderPre(); return; }
  if (k === 'grid' || k === 'retry:grid') { openGrid(); return; }
  if (k.startsWith('sz:')) { (await import('./season-lazy.js')).openSeason(k.slice(3)); return; }
  if (k.startsWith('retry:')) {
    const src = k.slice(6);
    if (src === 'standings') { standingsLoad = null; loadStandings(); renderStd(); } else { delete extra[src]; loadExtra(src); }
    return;
  }
  if (k === 'editfav') { editFav = !editFav; renderFav(); return; }
  if (k.startsWith('favd:')) { toggleDriver(k.slice(5)); return; }
  if (k.startsWith('favt:')) { toggleTeamFav(k.slice(5)); return; }
  if (k === 'results') {
    resultsOpen = true; closeHome(); noLiveCheck();
    // Version web : résultats de la dernière séance de l'écran « Pas de séance en direct » (web.js)
    if (store.web) { resultsOpen = false; noLiveCheck(); $('#webResultsBtn')?.click(); } else openResults();
    return;
  }
  if (k === 'live') { closeHome(); noLiveCheck(); return; }
  if (k === 'agenda') { agendaFile(); return; }
  if (k === 'app') { open('https://paddocklive.app/', '_blank', 'noopener'); return; }   // version web : l'appli de bureau
  if (k === 'alerts') { $('#alertBtn')?.click(); return; }   // version web : alertes sur cet appareil (web.js)
  // Saison et Actu ferment l'accueil elles-mêmes ; Replays : l'accueil reste derrière les réglages
  // jusqu'au lancement du replay
  if (k === 'season') { (await import('./season-lazy.js')).openSeason(); return; }
  if (k.startsWith('review:')) { (await import('./season-lazy.js')).openSeason('review', Number(k.slice(7))); return; }
  if (k === 'news') { (await import('./news.js')).openNews(); return; }
  if (k === 'replays') { (await import('./replays.js')).openReplays(); return; }
  if (k === 'replay') {
    const ls = lastSession();
    // Séance absente des archives (compte F1 TV non connecté) : espace Replays (enregistrements)
    if (!ls?.path) { act('replays'); return; }
    try {
      // Départ du replay : 1 min avant le début de la séance (choix par défaut du serveur)
      await api('/api/replay', { method: 'POST', body: { path: ls.path } });
      closeHome();
      $('#noLiveView').hidden = true;
      toast(`Chargement du replay : ${gp(ls.meeting)} — ${sessionName(ls.name)}`, 4000);
    } catch (err) { toast(err.message, 5000); }
  }
}

export function initHome() {
  const view = $('#homeView');
  // Fenêtres détachées (second écran) : pas d'accueil
  if (!view || new URLSearchParams(location.search).has('win')) { hideBoot(); return; }
  addEventListener('resize', () => { if (isHomeOpen()) placeView($('#homeView')); });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-home]');
    if (b) act(b.dataset.home);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isHomeOpen() && !document.querySelector('dialog[open]')) { touched = true; closeHome(); } });
  // Au lancement : accueil, sauf replay déjà en cours (page rechargée) ou séance en direct
  if (store.status?.source?.mode !== 'replay') openHome();
  // Replay lancé (ici ou depuis un autre écran) : place au tableau de bord
  let mode = store.status?.source?.mode;
  on('status', (s) => {
    if (s?.source?.mode === 'replay' && mode !== 'replay') closeHome();
    mode = s?.source?.mode;
  });
  on('prefs', (k) => { if ((k === 'favs' || k === 'favTeams') && isHomeOpen()) { renderFav(); renderStd(); } });
  // Écran de chargement retiré quand l'accueil est complet (ou le tableau de bord, en direct)
  Promise.all([loadSchedule(), loadArchive()]).then(() => {
    noLiveCheck();
    if (!touched && liveNow() && isHomeOpen()) { closeHome(); return; }
    return render();
  }).finally(hideBoot);
  setTimeout(hideBoot, 12000);
}

// Navigation ailleurs (Direct, Saison, Actu…) : l'accueil ne se rouvre ni ne se ferme plus tout seul
export function homeTouched() { touched = true; }

// ---------- Pas de séance en direct ----------
// Le tableau de bord n'apparaît qu'en direct, en replay, ou quand on demande les résultats de la
// dernière séance : sinon un écran d'attente (prochaine séance, replay, résultats).
const COVERS = ['#homeView', '#seasonView', '#newsView', '#replayView'];
let noLiveKey = '';
// show = false (contrôle régulier, évènements de la séance) : l'écran peut seulement se retirer.
// Il ne s'affiche qu'en arrivant sur le tableau de bord, jamais par-dessus des résultats en cours de lecture.
function noLiveCheck(show = true) {
  const view = $('#noLiveView');
  if (!view) return;
  const st = store.state.SessionStatus?.Status;
  const running = st === 'Started' || st === 'Aborted' || !!liveNow();
  if (running) resultsOpen = false;
  const covered = COVERS.some((s) => $(s) && !$(s).hidden);
  if ((!schedule && !scheduleFailed) || running || covered || resultsOpen || store.status?.source?.mode === 'replay') { view.hidden = true; return; }
  if (view.hidden && !show) return;
  if (view.hidden) { placeView(view); view.hidden = false; noLiveKey = ''; }
  const nx = nextSession(), ls = lastSession();
  const key = `${nx?.t}|${ls?.t}|${nx ? countdown(nx.t - Date.now()) : ''}`;
  if (key === noLiveKey) return;
  noLiveKey = key;
  $('#noLiveBox').innerHTML = `<div class="nl-icon">${icon('signal')}</div>
    <h2>Pas de séance en direct</h2>
    ${nx ? `<p class="nl-next">Prochaine séance : <b>${esc(gp(nx.race))} : ${esc(nx.label)}</b><br><span class="muted">${esc(when(nx.t))}</span></p>
      <div class="nl-count">${countdown(nx.t - Date.now())}</div>${daysHtml(nx)}` : `<p class="muted">${schedule ? 'Saison terminée.' : 'Calendrier indisponible pour l\'instant : nouvel essai dans une minute.'}</p>`}
    <p class="muted small">Le tableau de bord s'ouvre tout seul au début de la séance.</p>
    <div class="nl-actions">
      ${ls ? `<button class="btn btn-accent" data-nl="replay">${icon('play')} ${esc(t('Revoir {} : {}', gp(ls.meeting), sessionName(ls.name)))}</button>` : ''}
      <button class="btn" data-nl="results" title="Résultats de la dernière séance (résultat visible)">${icon('checkered')} Voir les résultats</button>
      <button class="btn" data-nl="replays">${icon('history')} Toutes les séances</button>
    </div>`;
}

export function initNoLive() {
  const view = $('#noLiveView');
  if (!view || new URLSearchParams(location.search).has('win')) return;
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nl]');
    if (!b) return;
    if (b.dataset.nl === 'results') { resultsOpen = true; noLiveCheck(); openResults(); } else act(b.dataset.nl);
  });
  // Vues ouvertes ou fermées, source changée, séance qui démarre : écran affiché ou retiré aussitôt
  const mo = new MutationObserver(() => noLiveCheck());
  for (const s of COVERS) if ($(s)) mo.observe($(s), { attributes: true, attributeFilter: ['hidden'] });
  // Retour au direct après un replay : comme une arrivée sur le tableau de bord
  let mode = store.status?.source?.mode;
  on('status', (s) => { noLiveCheck(mode === 'replay' && s?.source?.mode !== 'replay'); mode = s?.source?.mode; });
  on('events', (events) => { if (events.some(([t]) => t === 'SessionStatus' || t === 'SessionInfo')) noLiveCheck(false); });
  addEventListener('resize', () => { if (!view.hidden) placeView(view); });
  setInterval(() => noLiveCheck(false), 5000);
  noLiveCheck();
  // Sans accueil (version web) : le calendrier est chargé ici
  loadSchedule().then(() => noLiveCheck());
}
