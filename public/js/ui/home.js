// Page d'accueil, sans spoiler : prochaine séance (compte à rebours), dernière séance sans son
// résultat (replay depuis le début ou tableau de bord), dernières actualités, raccourcis.
// Ouverte au lancement quand aucune séance n'est en cours ; pendant une séance, l'appli s'ouvre
// directement sur le Direct.
import { $, $$, esc, api, drivers, placeView, hideBoot, dayIn } from '../util.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { LOCALE, EN, t } from '../i18n.js';
import { gpShort, sessionLabel } from '/shared/gp-names.js';
import { toast } from './delay.js';
import { prefs, setPref, toggleFav, toggleTeamFav } from '../prefs.js';
import { teamKey } from '/shared/news.js';
import { openResults } from './results-view.js';
import { COUNTRY_ISO } from '/shared/social-season.js';

let schedule = null;   // [{ race, round, label, t }]
let archive = null;    // dernière séance rejouable { meeting, name, path, t }
let timer = 0;
let standings = null;  // classement du championnat (carte du favori)
let weather = null;    // { key, days, tz } : météo prévue du prochain Grand Prix, fuseau horaire du circuit
let showFav = false;   // carte du favori dévoilée (peut contenir le dernier résultat)
let editFav = false;   // choix des pilotes et écuries favoris ouvert sur l'accueil
let touched = false;   // l'utilisateur a quitté l'accueil : plus d'ouverture ou de fermeture automatique
let resultsOpen = false;   // résultats de la dernière séance demandés : tableau de bord même sans direct

// Durée approximative d'une séance (fenêtre « en cours »)
const LONG = /course|race|grand prix/i;
const lengthOf = (label) => (LONG.test(label) && !/sprint/i.test(label) ? 150 : 75) * 60e3;
const sessionName = (n) => sessionLabel(n, EN);

// Calendrier chargé une fois (accueil et écran « Pas de séance en direct »)
let scheduleLoad = null;
const loadSchedule = () => (scheduleLoad ||= readSchedule());
async function readSchedule() {
  const year = new Date().getFullYear();
  const races = [];
  for (const y of [year, year + 1]) {
    try { races.push(...(await api(`/api/schedule?year=${y}`)).races.map((r) => ({ ...r, year: y }))); } catch { /* hors ligne */ }
    if (races.some((r) => r.sessions.some((s) => Date.parse(s.t) > Date.now()))) break;
  }
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
// Programme du week-end du prochain Grand Prix, jour par jour (même présentation que le calendrier)
function daysHtml(nx) {
  const days = new Map();
  for (const s of schedule.filter((x) => x.race === nx.race && x.year === nx.year)) {
    const k = new Date(s.t).toDateString();
    if (!days.has(k)) days.set(k, { t: s.t, list: [] });
    days.get(k).list.push(s);
  }
  const hm = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `<div class="cal-days">${[...days.values()].map((d) => `<div class="cal-day"><div class="cal-day-h">${esc(new Date(d.t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }))}</div>
    ${d.list.map((s) => `<div class="cal-s ${s.t < Date.now() ? 'past' : ''} ${s === nx ? 'now' : ''}"><span>${esc(s.label)}</span><b>${hm(s.t)}</b></div>`).join('')}</div>`).join('')}</div>`;
}
const gp = (name) => gpShort(name, EN);

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
    standings = { drivers: [], constructors: [] };
    try { standings = await api(`/api/season?year=${new Date().getFullYear()}`); } catch { /* hors ligne */ }
    renderFav();
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
const pts = (x) => `${x.points} pts${x.wins ? ` · ${x.wins} victoire${x.wins > 1 ? 's' : ''}` : ''}`;
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
  const head = `<div class="hm-kicker"><span class="hm-tag">${count === 1 ? 'Mon favori au championnat' : 'Mes favoris au championnat'}</span> ${edit}</div>`;
  if (!count) {
    return `<section class="hm-card hm-fav" id="hmFav">${head}${editFav ? favEditor(ds, teams)
      : '<div class="muted">Ajoutez vos pilotes et écuries favoris.</div>'}</section>`;
  }
  const recent = lastSession() && Date.now() - lastSession().t < 72 * 3600e3;
  const hide = recent && !showFav;
  // Pilotes puis écuries, chacun sous son titre ; mêmes colonnes pour toutes les lignes (grille commune)
  const rows = [
    ...(favD.length ? ['<div class="hm-fav-group muted">Pilotes</div>'] : []),
    ...favD.map((d) => `<div class="hm-fav-row"><span class="hm-fav-pos">P${d.pos}</span><b>${esc(d.name)}</b><span class="muted">${esc(d.team)}</span><span class="muted">${pts(d)}</span></div>`),
    ...(favT.length ? ['<div class="hm-fav-group muted">Écuries</div>'] : []),
    ...favT.map((c) => `<div class="hm-fav-row"><span class="hm-fav-pos">P${c.pos}</span><b>${esc(c.name)}</b><span></span><span class="muted">${pts(c)}</span></div>`),
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

function render() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  const live = liveNow();
  const nx = nextSession();
  // Hors saison (premier Grand Prix de la saison suivante à plus de 3 semaines, ou calendrier pas encore publié) : la
  // saison passée, les replays et l'actu (transferts, présentations des voitures) plutôt qu'un long compte à rebours.
  // Pas pendant la trêve d'été (prochaine manche de la même saison)
  const off = !live && schedule && (!nx || (nx.t - Date.now() > 21 * 86400e3 && Number(nx.round) === 1));
  const past = nx ? nx.year - 1 : new Date().getFullYear();
  const card = off
    ? `<section class="hm-card hm-next hm-off"><div class="hm-next-main"><div class="hm-kicker"><span class="hm-tag">${t('Hors saison')}</span></div>
        ${nx ? `<div class="hm-title">${flag(nx.country)}<span>${t('Saison {}', nx.year)} : ${esc(gp(nx.race))} <small>${esc(nx.label)}</small></span></div>
        <div class="hm-count" id="hmCount">${countdown(nx.t - Date.now())}</div>
        <div class="muted">${esc(when(nx.t))}</div>`
    : `<div class="hm-title">${t('Calendrier {} bientôt publié', past + 1)}</div>`}
        <div class="hm-actions"><button class="btn btn-accent" data-home="review:${past}">${icon('trophy')} ${t('Bilan de la saison {}', past)}</button>
          <button class="btn" data-home="replays">${icon('history')} ${t('Revoir les courses')}</button>
          <button class="btn" data-home="news">${icon('news')} ${t('Transferts et nouveautés')}</button></div></div></section>`
    : live
    ? `<section class="hm-card hm-live"><div class="hm-kicker"><span class="hm-tag"><span class="hm-dot"></span>Séance en cours</span></div>
        <div class="hm-title">${esc(gp(live.race))} : ${esc(live.label)}</div>
        <div class="muted">Commencée à ${esc(new Date(live.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))}</div>
        <div class="hm-actions"><button class="btn btn-accent" data-home="live">${icon('signal')} Regarder en direct</button></div></section>`
    : `<section class="hm-card hm-next"><div class="hm-next-main"><div class="hm-kicker"><span class="hm-tag">Prochaine séance</span>${nx ? `<span class="hm-round">Manche ${nx.round}</span>` : ''}</div>
        ${nx ? `<div class="hm-title">${flag(nx.country)}<span>${esc(gp(nx.race))} <small>${esc(nx.label)}</small></span></div>
        <div class="hm-count" id="hmCount">${countdown(nx.t - Date.now())}</div>
        <div class="muted">${esc(when(nx.t))}</div>
        ${weatherHtml(nx)}
        <div class="hm-actions"><a class="btn small" href="#" data-cal="${nx.year}" data-round="${nx.round}" title="Séances dans votre agenda (Google, Apple, Outlook)">${icon('calendar')} Ajouter ce week-end à mon agenda</a></div></div>
        ${daysHtml(nx)}`
          : `<div class="hm-title">${schedule ? 'Saison terminée' : 'Calendrier en chargement…'}</div></div>`}</section>`;
  const ls = live ? null : lastSession();
  const last = ls
    ? `<section class="hm-card hm-last"><div class="hm-kicker"><span class="hm-tag">Dernière séance</span></div>
        <div class="hm-title"><span>${esc(gp(ls.meeting))} <small>${esc(sessionName(ls.name))}</small></span></div>
        <div class="muted">${esc(ago(ls.t))} · résultat masqué</div>
        <div class="hm-actions"><button class="btn btn-accent" data-home="replay">${icon('play')} Revoir en replay</button>
          <button class="btn" data-home="results" title="Résultats de la séance (résultat visible)">${icon('checkered')} Voir les résultats</button></div></section>`
    : '';
  view.querySelector('.hm-main').innerHTML = `<h1 class="hm-hello">Paddock Live</h1>
    ${card}
    <div class="hm-grid">${last}${favHtml()}</div>
    <section class="hm-card hm-news"><div class="hm-kicker"><span class="hm-tag">Dernières actus</span> <button class="btn small" data-home="news">Toute l'actu ${icon('arrow-right', 'ic-s')}</button></div><div id="hmNews" class="hm-list"><div class="muted small">Chargement…</div></div></section>
    <nav class="hm-go">
      <button data-home="live">${icon('signal')}<b>Direct</b><small>Tableau de bord</small></button>
      <button data-home="season">${icon('trophy')}<b>Saison</b><small>Calendrier, classements</small></button>
      <button data-home="news">${icon('news')}<b>Actu</b><small>Toute l'actualité</small></button>
      <button data-home="replays">${icon('history')}<b>Replays</b><small>Rejouer une séance</small></button>
    </nav>
    <a class="hm-follow" href="https://paddocklive.app/liens/" target="_blank" rel="noopener">${icon('share')} Suivre Paddock Live sur les réseaux ${icon('arrow-right', 'ic-s')}</a>`;
  if (nx && !live) loadWeather(nx);
  // Actualités et favoris : l'accueil est complet quand les deux sont là
  return Promise.allSettled([news(), loadStandings()]);
}

// again : titres traduits entre-temps, réaffichés une fois
async function news(again = true) {
  const box = $('#hmNews');
  if (!box) return;
  try {
    const list = await (await import('./news.js')).latestNews(4, again ? () => news(false) : null);
    box.innerHTML = list.length ? list.map((n) => `<button class="hm-news-item" data-home="news"><span class="hm-news-t" data-no-i18n>${esc(n.title)}</span><span class="muted small"><span data-no-i18n>${esc(n.src)}</span> · <span>${esc(n.when)}</span></span></button>`).join('') : '<div class="muted small">Aucune actualité pour le moment.</div>';
  } catch { box.innerHTML = '<div class="muted small">Actualités indisponibles.</div>'; }
}


export function openHome() {
  const view = $('#homeView');
  if (!view) return;
  import('./season.js').then((m) => m.closeSeason());
  import('./news.js').then((m) => m.closeNews());
  import('./replays.js').then((m) => m.closeReplays());
  placeView($('#homeView'));
  view.hidden = false;
  render();
  clearInterval(timer);
  timer = setInterval(() => {
    const nx = nextSession();
    if ($('#hmCount') && nx) $('#hmCount').textContent = countdown(nx.t - Date.now());
    // Séance qui commence pendant que l'accueil est affiché : carte « en cours »
    if (!!liveNow() !== !!$('#homeView .hm-live')) render();
  }, 30e3);
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
  if (k === 'showfav') { showFav = true; renderFav(); return; }
  if (k === 'editfav') { editFav = !editFav; renderFav(); return; }
  if (k.startsWith('favd:')) { toggleDriver(k.slice(5)); return; }
  if (k.startsWith('favt:')) { toggleTeamFav(k.slice(5)); return; }
  if (k === 'results') { resultsOpen = true; closeHome(); noLiveCheck(); openResults(); return; }
  if (k === 'live') { closeHome(); noLiveCheck(); return; }
  // Saison et Actu ferment l'accueil elles-mêmes ; Replays : l'accueil reste derrière les réglages
  // jusqu'au lancement du replay
  if (k === 'season') { (await import('./season.js')).openSeason(); return; }
  if (k.startsWith('review:')) { (await import('./season.js')).openSeason('review', Number(k.slice(7))); return; }
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
  on('prefs', (k) => { if ((k === 'favs' || k === 'favTeams') && isHomeOpen()) renderFav(); });
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
  if (!schedule || running || covered || resultsOpen || store.status?.source?.mode === 'replay') { view.hidden = true; return; }
  if (view.hidden && !show) return;
  if (view.hidden) { placeView(view); view.hidden = false; noLiveKey = ''; }
  const nx = nextSession(), ls = lastSession();
  const key = `${nx?.t}|${ls?.t}|${nx ? countdown(nx.t - Date.now()) : ''}`;
  if (key === noLiveKey) return;
  noLiveKey = key;
  $('#noLiveBox').innerHTML = `<div class="nl-icon">${icon('signal')}</div>
    <h2>Pas de séance en direct</h2>
    ${nx ? `<p class="nl-next">Prochaine séance : <b>${esc(gp(nx.race))} : ${esc(nx.label)}</b><br><span class="muted">${esc(when(nx.t))}</span></p>
      <div class="nl-count">${countdown(nx.t - Date.now())}</div>${daysHtml(nx)}` : '<p class="muted">Saison terminée.</p>'}
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
