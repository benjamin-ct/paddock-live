// Espace Saison de la version web pour les moteurs de recherche : chaque rubrique a son adresse
// (app.paddocklive.app/saison/2026/…, shared/season-urls.js). Le serveur y sert la page de l'appli avec le titre, la
// description et un premier contenu de la rubrique déjà écrits (classements, calendrier, résultats d'un Grand Prix,
// saison d'un pilote), remplacés par l'appli dès qu'elle démarre. Plan du site : paddocklive.app/saison/sitemap.xml.
// Anciennes pages publiques (paddocklive.app/saison/…, /en/season/…) : redirigées vers leur rubrique.
// Version anglaise des mêmes rubriques sur app.paddocklive.app/en/season/… (EN_PATHS) ; sur paddocklive.app, /en/season/…
// reste l'ancienne adresse redirigée.
import { seasonRow } from './studio.js';
import { getRow } from './alerts.js';
import { raceStatsOf } from './race-stats.js';
import { gpShort, gpFull } from '../shared/gp-names.js';
import { retired } from '../shared/season-calc.js';
import { SECTION_PATHS, seasonPath, seasonTitle, slug, gpSlug, parseSeasonPath, titleYear } from '../shared/season-urls.js';
import { GRID_NEXT, gridSummary } from '../shared/grid-next.js';

export const APP = 'https://app.paddocklive.app';
const IMAGE = 'https://paddocklive.app/site/img/apercu.png';   // aperçu de la version web (balise og:image)
const YEARS = 8;   // comme le choix de l'année dans l'espace Saison (ui/season.js)
export const firstYear = (now = Date.now()) => new Date(now).getUTCFullYear() - YEARS + 1;

// Version anglaise (app.paddocklive.app/en/season/…), comme les pages de fonctionnalités du site (/en/f1-live-timing/ ↔
// /live-timing-f1/) : mêmes rubriques et mêmes données, chemins anglais. Correspondance avec les chemins français
// (SECTION_PATHS, shared/season-urls.js) : /saison/2026/classements/ ↔ /en/season/2026/standings/,
// /saison/2026/pilotes/lando-norris/ ↔ /en/season/2026/drivers/lando-norris/ (même nom du pilote),
// /saison/2026/grand-prix/mexico/ ↔ /en/season/2026/grand-prix/mexico-city/ (nom anglais du Grand Prix, gpShort(…, 'en'))
export const EN_PATHS = {
  home: '', calendar: 'calendar', standings: 'standings', title: 'title-race', compare: 'compare', destructors: 'destructors', review: 'review', results: 'results', quali: 'qualifying',
  h2h: 'head-to-head', ratings: 'ratings', predict: 'predictions', drivers: 'drivers', teams: 'teams', consistency: 'consistency', pits: 'pit-stops',
  speeds: 'top-speeds', circuits: 'circuits', tech: 'upgrades', elements: 'power-unit-elements', gp: 'grand-prix', grid: 'grid',
};
export function enSeasonPath(year, section = 'home', item = null) {
  const p = EN_PATHS[section] || '';
  return `/en/season/${year}/${p ? `${p}/` : ''}${p && item ? `${item}/` : ''}`;
}
// « /en/season/2026/drivers/lando-norris/ » -> { year, section, item, lang: 'en' } ; year null pour « /en/season/ » ; null sinon
export function parseEnSeasonPath(path) {
  if (path === '/en/season/' || path === '/en/season') return { year: null, section: 'home', item: null, lang: 'en' };
  const m = /^\/en\/season\/(\d{4})\/(?:([a-z-]+)\/(?:([a-z0-9-]+)\/)?)?$/.exec(path);
  if (!m) return null;
  const section = m[2] ? Object.keys(EN_PATHS).find((k) => EN_PATHS[k] === m[2]) : 'home';
  if (!section || (m[3] && section !== 'drivers' && section !== 'gp') || (section === 'gp' && !m[3])) return null;
  return { year: Number(m[1]), section, item: m[3] || null, lang: 'en' };
}
const EN_TITLES = {
  home: 'F1 {} season: standings, calendar and results', calendar: 'F1 {} calendar', standings: 'F1 {} standings: drivers and constructors',
  title: 'F1 {} title race', compare: 'Compare the F1 {} season with another', destructors: 'F1 {} destructors\' championship: crash damage', review: 'F1 {} season review',
  results: 'F1 {} results: every Grand Prix', quali: 'F1 {} qualifying: gap to pole by team', h2h: 'F1 {} teammate head-to-heads', ratings: 'F1 {} driver ratings',
  predict: 'F1 {} predictions with friends', drivers: 'F1 {} drivers', teams: 'F1 {} teams: drivers, points and results', consistency: 'F1 {} driver consistency',
  pits: 'F1 {} pit stops: fastest, by team', speeds: 'F1 {} top speeds', circuits: 'F1 {} circuit profiles', tech: 'F1 {} technical upgrades',
  elements: 'F1 {} power unit elements', gp: 'F1 {} Grands Prix', grid: 'F1 {} grid: confirmed drivers and seats to be confirmed',
};
function enTitle(year, section, name = null, run = true) {
  if (section === 'drivers' && name) return `${name}: ${year} F1 season results`;
  if (section === 'gp' && name) return `${gpFull(name, 'en')} ${year}: ${run ? 'results' : 'schedule'}`;
  return (EN_TITLES[section] || EN_TITLES.home).replace('{}', titleYear(year, section));
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = (title, html) => `<section class="sz-box"><h3>${esc(title)}</h3>${html}</section>`;
const table = (head, rows) => `<div class="sz-scroll"><table class="sz-table"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
const lapTime = (s) => (s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '');
const classified = (x) => /^\d+$/.test(x?.posText || '');
const DHL = 'DHL Fastest Pit Stop Award. Copyright © DHL International GmbH. All Rights Reserved.';

// Textes de chaque langue (français : ceux d'origine ; anglais : dates en anglais, heures UTC, point décimal)
const FR = {
  lang: 'fr', path: seasonPath, title: seasonTitle, gpItem: (r) => gpSlug(r.name), gpName: (r) => gpShort(r.name), gpFull: (r) => gpFull(r.name),
  day: (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '—'),
  when: (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }),
  dec: (s) => s.replace('.', ','), nth: (n) => (!n ? '—' : n === 1 ? '1er' : `${n}e`), laps: (n) => `+${n} tour${n > 1 ? 's' : ''}`,
  STATUS: { R: 'Abandon', D: 'Disqualifié', E: 'Exclu', W: 'Forfait', F: 'Non qualifié', N: 'Non classé' }, sessionName: (l) => l,
  pos: 'Pos.', driver: 'Pilote', team: 'Écurie', points: 'Points', wins: 'Victoires', round: 'Manche', gp: 'Grand Prix', date: 'Date', winner: 'Vainqueur', pole: 'Pole',
  standingsD: 'Classement des pilotes', standingsC: 'Classement des constructeurs', calendar: 'Calendrier et résultats', drivers: 'Pilotes',
  summary: 'Bilan', summaryHead: ['Victoires', 'Podiums', 'Poles', 'Meilleurs tours', 'Abandons', 'Meilleure arrivée', 'Arrivée moyenne'],
  byRace: 'Grand Prix par Grand Prix', quali: 'Qualif.', grid: 'Grille', pitLane: 'Stands', finish: 'Arrivée', race: 'Course', gap: 'Temps / écart', lapsH: 'Tours',
  schedule: 'Programme du week-end (heure de Paris)', session: 'Séance', sprint: 'Sprint', qualifying: 'Qualifications', stops: 'Arrêts aux stands les plus rapides',
  lap: 'Tour', stop: 'Immob.', dhl: `Immobilisations au centième : ${DHL}`, all: 'Tous les Grands Prix', prev: (r) => `← ${gpShort(r.name)}`, next: (r) => `${gpShort(r.name)} →`,
  season: (y) => `Saison ${y}`, other: ['en', 'English version'],
  driverLine: (d) => `${FR.nth(d.pos)} du championnat avec ${d.points} point${d.points > 1 ? 's' : ''}${d.wins ? `, ${d.wins} victoire${d.wins > 1 ? 's' : ''}` : ''} · ${d.team}`,
  raceLine: (r, day) => `Manche ${r.round} · ${day}`, winLine: 'Vainqueur : ', poleLine: ' · Pole : ',
  gridHead: ['Écurie', 'Pilote', 'Statut', 'Annonce'], confirmed: 'Confirmé', tbc: 'À confirmer', changes: (y) => `Changements par rapport à ${y}`,
  replaces: (a, b) => `${a} remplace ${b}`, same: (teams) => `Même duo qu'en ${GRID_NEXT.year - 1} : ${teams.join(', ')}`, by: (who) => `déclaration de ${who}`,
  gridLine: (n, c, upd) => `${c} baquets confirmés sur ${n}. Annonces officielles seulement (communiqué de l'écurie ou de la F1) : un baquet sans annonce reste « à confirmer ». À jour au ${upd}.`,
  home: (done, n, d) => `${done} Grands Prix courus sur ${n}${d ? `, ${d.name} en tête avec ${d.points} points` : ''}.`,
  driverDesc: (d, year) => `Saison ${year} de ${d.name} en Formule 1 : ${FR.nth(d.pos)} du championnat avec ${d.points} points, résultats Grand Prix par Grand Prix, qualifications, grilles et points.`,
  gpDesc: (r, year, win, pole) => (r.results.length ? `Résultats du ${gpFull(r.name)} ${year} (${r.circuit}) : vainqueur ${win?.name}${pole ? `, pole ${pole.name}` : ''}, classement complet, qualifications${r.sprint ? ', sprint' : ''} et arrêts aux stands les plus rapides.`
    : `${gpFull(r.name)} ${year} au ${r.circuit} : programme du week-end, puis résultats, qualifications et arrêts aux stands après la course.`),
};
const EN_SESSIONS = { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint qualifying', Qualifications: 'Qualifying', Course: 'Race' };
const enNth = (n) => (!n ? '—' : `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`);
const EN = {
  ...FR, lang: 'en', path: enSeasonPath, title: enTitle, gpItem: (r) => slug(gpShort(r.name, 'en')), gpName: (r) => `${gpShort(r.name, 'en')} GP`, gpFull: (r) => gpFull(r.name, 'en'),
  day: (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—'),
  when: (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }),
  dec: (s) => s, nth: enNth, laps: (n) => `+${n} lap${n > 1 ? 's' : ''}`,
  STATUS: { R: 'Retired', D: 'Disqualified', E: 'Excluded', W: 'Withdrawn', F: 'Did not qualify', N: 'Not classified' }, sessionName: (l) => EN_SESSIONS[l] || l,
  driver: 'Driver', team: 'Team', wins: 'Wins', round: 'Round', winner: 'Winner',
  standingsD: 'Drivers\' standings', standingsC: 'Constructors\' standings', calendar: 'Calendar and results', drivers: 'Drivers',
  summary: 'Summary', summaryHead: ['Wins', 'Podiums', 'Poles', 'Fastest laps', 'Retirements', 'Best finish', 'Average finish'],
  byRace: 'Race by race', quali: 'Quali', grid: 'Grid', pitLane: 'Pit lane', finish: 'Finish', race: 'Race', gap: 'Time / gap', lapsH: 'Laps',
  schedule: 'Weekend schedule (UTC)', session: 'Session', qualifying: 'Qualifying', stops: 'Fastest pit stops',
  lap: 'Lap', stop: 'Stop', dhl: `Stop times to the hundredth: ${DHL}`, all: 'All Grands Prix', prev: (r) => `← ${gpShort(r.name, 'en')} GP`, next: (r) => `${gpShort(r.name, 'en')} GP →`,
  season: (y) => `${y} season`, other: ['fr', 'Version française'],
  driverLine: (d) => `${enNth(d.pos)} in the championship with ${d.points} point${d.points > 1 ? 's' : ''}${d.wins ? `, ${d.wins} win${d.wins > 1 ? 's' : ''}` : ''} · ${d.team}`,
  raceLine: (r, day) => `Round ${r.round} · ${day}`, winLine: 'Winner: ', poleLine: ' · Pole: ',
  gridHead: ['Team', 'Driver', 'Status', 'Announcement'], confirmed: 'Confirmed', tbc: 'To be confirmed', changes: (y) => `Changes from ${y}`,
  replaces: (a, b) => `${a} replaces ${b}`, same: (teams) => `Same pairing as in ${GRID_NEXT.year - 1}: ${teams.join(', ')}`, by: (who) => `statement by ${who}`,
  gridLine: (n, c, upd) => `${c} of ${n} seats confirmed. Official announcements only (team or F1 announcement): a seat without one stays "to be confirmed". Updated ${upd}.`,
  home: (done, n, d) => `${done} of ${n} Grands Prix run${d ? `, ${d.name} leads with ${d.points} points` : ''}.`,
  driverDesc: (d, year) => `${d.name}'s ${year} Formula 1 season: ${enNth(d.pos)} in the championship with ${d.points} points, race-by-race results, qualifying, grid positions and points.`,
  gpDesc: (r, year, win, pole) => (r.results.length ? `${gpFull(r.name, 'en')} ${year} results (${r.circuit}): won by ${win?.name}${pole ? `, pole for ${pole.name}` : ''}, full classification, qualifying${r.sprint ? ', sprint' : ''} and fastest pit stops.`
    : `${gpFull(r.name, 'en')} ${year} at ${r.circuit}: weekend schedule, then results, qualifying and pit stops after the race.`),
};
const LANG = { fr: FR, en: EN };

function result(t, x) {
  if (x.time) return x.time;
  const m = /^\+(\d+) Laps?$/.exec(x.status || '');
  return m ? t.laps(m[1]) : t.STATUS[x.posText] || x.status || '';
}
const finish = (t, x) => (!x ? '—' : classified(x) ? `P${x.pos}` : t.STATUS[x.posText] || x.status || '—');
const stopTxt = (t, s) => `${t.dec(s.stop.toFixed(s.dhl ? 2 : 1))} s`;
const dLink = (t, year, name) => `<a href="${t.path(year, 'drivers', slug(name))}"><b>${esc(name)}</b></a>`;
const gLink = (t, year, r, text = t.gpName(r)) => `<a href="${t.path(year, 'gp', t.gpItem(r))}">${esc(text)}</a>`;

const DESC = {
  home: 'Saison {} de Formule 1 : classements des pilotes et des constructeurs, calendrier, vainqueurs et résultats de chaque Grand Prix, statistiques détaillées.',
  calendar: 'Calendrier de la saison {} de Formule 1 : dates et horaires de chaque Grand Prix, vainqueurs des courses déjà disputées.',
  standings: 'Classements {} de Formule 1 : pilotes et constructeurs, points, écarts, victoires et évolution des points course après course.',
  title: 'Course au titre {} de Formule 1 : qui peut encore être champion, points encore à prendre et conditions pour le titre.',
  compare: 'Saison {} de Formule 1 comparée à une autre : classements des pilotes et des constructeurs après le même nombre de Grands Prix.',
  destructors: 'Championnat des casseurs {} de Formule 1 : coût estimé des dégâts de chaque pilote et de chaque écurie, Grand Prix par Grand Prix.',
  review: 'Bilan de la saison {} de Formule 1 : champion, victoires, poles, podiums, plus belles remontées et abandons.',
  results: 'Résultats de tous les Grands Prix de la saison {} de Formule 1 : vainqueurs, poles, podiums et records.',
  quali: 'Qualifications {} de Formule 1 : écart de chaque écurie à la pole, Grand Prix par Grand Prix.',
  h2h: 'Duels entre coéquipiers en {} : qualifications, courses, points, écart en qualification de chaque paire de pilotes de F1.',
  ratings: 'Notes des pilotes de F1 en {}, course après course, face au coéquipier et sur la saison.',
  predict: 'Pronostics F1 {} entre amis : pronostiquez chaque Grand Prix et comparez vos points.',
  drivers: 'Pilotes de F1 en {} : la saison de chacun, résultats, qualifications, points et statistiques.',
  teams: 'Écuries de F1 en {} : place au championnat, points, pilotes, victoires, podiums et poles.',
  consistency: 'Régularité des pilotes de F1 en {} : écart-type des temps au tour, Grand Prix par Grand Prix.',
  pits: 'Arrêts aux stands F1 {} : immobilisations les plus rapides, médiane par écurie, Grand Prix par Grand Prix.',
  speeds: 'Vitesses de pointe des pilotes de F1 en {} : speed trap, ligne d\'arrivée et intermédiaires.',
  circuits: 'Profil des circuits de la saison {} de F1 : longueur, virages, vitesse moyenne, arrêts et dépassements.',
  tech: 'Évolutions techniques apportées par les écuries de F1 en {}, Grand Prix par Grand Prix, d\'après les documents de la FIA.',
  elements: 'Éléments moteur utilisés par chaque pilote de F1 en {}, d\'après les documents de la FIA.',
  grid: 'Grille F1 {} : les deux pilotes de chaque écurie, baquets confirmés par une annonce officielle (date et lien) ou encore à confirmer, changements de l\'intersaison.',
};
const EN_DESC = {
  home: '{} Formula 1 season: drivers\' and constructors\' standings, calendar, winners and results of every Grand Prix, detailed statistics.',
  calendar: '{} Formula 1 calendar: dates and times of every Grand Prix, winners of the races already run.',
  standings: '{} Formula 1 standings: drivers and constructors, points, gaps, wins and how the points evolved race after race.',
  title: '{} Formula 1 title race: who can still be champion, points still available and what each contender needs.',
  compare: 'The {} Formula 1 season compared with another: drivers\' and constructors\' standings after the same number of Grands Prix.',
  destructors: '{} Formula 1 destructors\' championship: estimated crash damage cost of every driver and team, Grand Prix by Grand Prix.',
  review: '{} Formula 1 season review: champion, wins, poles, podiums, best comebacks and retirements.',
  results: 'Results of every Grand Prix of the {} Formula 1 season: winners, poles, podiums and records.',
  quali: '{} Formula 1 qualifying: each team\'s gap to pole, Grand Prix by Grand Prix.',
  h2h: '{} teammate head-to-heads: qualifying, races, points and qualifying gap of every pair of F1 drivers.',
  ratings: 'F1 driver ratings in {}, race after race, against the teammate and over the season.',
  predict: 'F1 {} predictions with friends: predict every Grand Prix and compare your points.',
  drivers: 'F1 drivers in {}: each driver\'s season, results, qualifying, points and statistics.',
  teams: 'F1 teams in {}: championship position, points, drivers, wins, podiums and poles.',
  consistency: 'F1 driver consistency in {}: standard deviation of lap times, Grand Prix by Grand Prix.',
  pits: 'F1 {} pit stops: fastest stops, median by team, Grand Prix by Grand Prix.',
  speeds: 'F1 driver top speeds in {}: speed trap, finish line and intermediates.',
  circuits: 'Circuit profiles of the {} F1 season: length, corners, average speed, pit stops and overtakes.',
  tech: 'Technical upgrades brought by the F1 teams in {}, Grand Prix by Grand Prix, from the FIA documents.',
  elements: 'Power unit elements used by every F1 driver in {}, from the FIA documents.',
  grid: 'F1 {} grid: both drivers of every team, seats confirmed by an official announcement (date and link) or still to be confirmed, off-season changes.',
};
FR.desc = (section, year) => (DESC[section] || DESC.home).replace('{}', titleYear(year, section));
EN.desc = (section, year) => (EN_DESC[section] || EN_DESC.home).replace('{}', titleYear(year, section));

function standings(t, s, year, limit = Infinity) {
  return box(t.standingsD, table([t.pos, t.driver, t.team, t.points, t.wins], s.drivers.slice(0, limit).map((d) => [d.pos ?? '', dLink(t, year, d.name), esc(d.team), d.points, d.wins])))
    + box(t.standingsC, table([t.pos, t.team, t.points, t.wins], s.constructors.slice(0, limit).map((c) => [c.pos ?? '', `<b>${esc(c.name)}</b>`, c.points, c.wins])));
}
const calendar = (t, s, year) => box(t.calendar, table([t.round, t.gp, t.date, t.winner, t.pole], s.races.map((r) => [r.round, gLink(t, year, r), t.day(r.date),
  esc(r.results.find((x) => x.pos === 1)?.name || ''), esc(r.quali.find((x) => x.pos === 1)?.name || '')])));
// Toutes les rubriques de la saison en liens (les boutons de l'appli n'en sont pas)
const nav = (t, year) => `<nav class="sz-box">${Object.keys(SECTION_PATHS).filter((k) => k !== 'gp' && k !== 'predict' && (k !== 'grid' || year === GRID_NEXT.year - 1)).map((k) => `<a href="${t.path(year, k)}">${esc(t.title(year, k))}</a>`).join(' · ')}</nav>`;

// Grille de la saison suivante (shared/grid-next.js) : les 22 baquets, l'annonce de chacun, changements par rapport à 2026
function gridBody(t) {
  const g = gridSummary(), day = (iso) => t.day(`${iso}T12:00:00Z`);
  const ann = (s) => `${esc(day(s.date))} · <a href="${esc(s.url)}" rel="noopener">${esc(s.by ? t.by(s.by) : new URL(s.url).hostname.replace(/^www\./, ''))}</a>`;
  const rows = g.teams.flatMap((x) => x.seats.map((s) => [`<b>${esc(x.team)}</b>`, s.driver ? `<b>${esc(s.driver)}</b>` : '—', s.driver ? t.confirmed : t.tbc, s.driver ? ann(s) : '']));
  const same = g.teams.filter((x) => x.same).map((x) => x.team);
  const chg = [...g.arrivals.map((a) => (a.replaces ? t.replaces(a.driver, a.replaces) : a.driver)), ...(same.length ? [t.same(same)] : [])];
  return `<p class="muted">${esc(t.gridLine(g.seats, g.confirmed, day(GRID_NEXT.updated)))}</p>${box(t.season(GRID_NEXT.year), table(t.gridHead, rows))}${box(t.changes(GRID_NEXT.year - 1), `<ul>${chg.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`)}`;
}

function driverBody(t, s, year, d) {
  const key = slug(d.name);
  const rows = s.races.filter((r) => r.results.length || r.quali.length).map((r) => ({ r, res: r.results.find((x) => slug(x.name) === key), q: r.quali.find((x) => slug(x.name) === key), spr: r.sprintResults.find((x) => slug(x.name) === key) })).filter((x) => x.res || x.q);
  const races = rows.filter((x) => x.res), cl = races.filter((x) => classified(x.res)).map((x) => x.res.pos);
  const sprints = s.races.some((r) => r.sprintResults.length);
  return `<p class="muted">${esc(t.driverLine(d))}</p>
    ${box(t.summary, table(t.summaryHead, [[d.wins, races.filter((x) => classified(x.res) && x.res.pos <= 3).length,
      rows.filter((x) => x.q?.pos === 1).length, races.filter((x) => x.res.fastest).length, races.filter((x) => retired(x.res)).length, cl.length ? `P${Math.min(...cl)}` : '—',
      cl.length ? `P${t.dec((cl.reduce((a, b) => a + b, 0) / cl.length).toFixed(1))}` : '—']]))}
    ${box(t.byRace, table([t.round, t.gp, t.quali, t.grid, ...(sprints ? [t.sprint] : []), t.finish, t.points], rows.map((x) => [x.r.round, gLink(t, year, x.r),
      x.q?.pos ? `P${x.q.pos}` : '—', x.res ? (x.res.grid ? `P${x.res.grid}` : t.pitLane) : '—', ...(sprints ? [x.spr ? finish(t, x.spr) : ''] : []), esc(finish(t, x.res)), (x.res?.points || 0) + (x.spr?.points || 0) || ''])))}`;
}

function raceBody(t, s, year, r, stats) {
  const win = r.results.find((x) => x.pos === 1), pole = r.quali.find((x) => x.pos === 1);
  const i = s.races.indexOf(r), prev = s.races[i - 1], next = s.races[i + 1];
  const parts = [`<p class="muted">${esc(`${t.raceLine(r, t.day(r.date))} · ${[r.circuit, r.locality, r.country].filter(Boolean).join(', ')}`)}${win ? `<br>${t.winLine}<b>${esc(win.name)}</b> (${esc(win.team)})` : ''}${pole ? `${t.poleLine}<b>${esc(pole.name)}</b>` : ''}</p>`];
  if (r.results.length) parts.push(box(t.race, table([t.pos, t.driver, t.team, t.gap, t.lapsH, t.grid, t.points], r.results.map((x) => [classified(x) ? x.pos : '—', dLink(t, year, x.name), esc(x.team), esc(result(t, x)), x.laps ?? '', x.grid ? `P${x.grid}` : t.pitLane, x.points || '']))));
  else if (r.sessions?.length) parts.push(box(t.schedule, table([t.session, t.date], r.sessions.filter((x) => x.t).map((x) => [esc(t.sessionName(x.label)), esc(t.when(x.t))]))));
  if (r.sprintResults.length) parts.push(box(t.sprint, table([t.pos, t.driver, t.team, t.gap, t.points], r.sprintResults.map((x) => [classified(x) ? x.pos : '—', dLink(t, year, x.name), esc(x.team), esc(result(t, x)), x.points || '']))));
  if (r.quali.length) parts.push(box(t.qualifying, table([t.pos, t.driver, t.team, 'Q1', 'Q2', 'Q3'], r.quali.map((x) => [x.pos ?? '', dLink(t, year, x.name), esc(x.team), ...x.q.map(lapTime)]))));
  const stops = (stats?.drivers || []).flatMap((d) => d.stops.filter((x) => x.stop > 0 && x.stop < 15).map((x) => ({ ...x, d }))).sort((a, b) => a.stop - b.stop).slice(0, 10);
  if (stops.length) parts.push(box(t.stops, `${table(['#', t.driver, t.team, t.lap, t.stop], stops.map((x, k) => [k + 1, dLink(t, year, x.d.name), esc(x.d.team), x.lap ?? '', stopTxt(t, x)]))}${stops.some((x) => x.dhl) ? `<p class="muted small">${esc(t.dhl)}</p>` : ''}`));
  parts.push(`<p>${prev ? `${gLink(t, year, prev, t.prev(prev))} · ` : ''}<a href="${t.path(year, 'results')}">${t.all}</a>${next ? ` · ${gLink(t, year, next, t.next(next))}` : ''}</p>`);
  return parts.join('');
}

// Week-end du Grand Prix (1re séance -> fin de la course, environ 2 h) ; pilotes au départ, ceux de la saison avant la course
const gpEvent = (t, s, year, r) => ({ '@type': 'SportsEvent', name: `${t.gpFull(r)} ${year}`, sport: 'Formula 1', description: t.gpDesc(r, year, r.results.find((x) => x.pos === 1), r.quali.find((x) => x.pos === 1)), image: IMAGE,
  startDate: r.sessions?.[0]?.t || r.date, endDate: new Date(Date.parse(r.date) + 2 * 3600e3).toISOString(), eventStatus: 'https://schema.org/EventScheduled',
  location: { '@type': 'Place', name: r.circuit, address: { '@type': 'PostalAddress', addressLocality: r.locality, addressCountry: r.country } },
  organizer: { '@type': 'Organization', name: 'Formula 1', url: 'https://www.formula1.com/' },
  performer: (r.results.length ? r.results : s.drivers).map((d) => ({ '@type': 'Person', name: d.name })),
  ...(t.lang === 'en' ? { inLanguage: 'en' } : {}) });

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${APP}${path}` })) });

// Adresse de la Saison ({ year, section, item, lang }, parseSeasonPath ou parseEnSeasonPath) -> { title, desc, url, html, ld,
// lang, alt, app } ; null : adresse inconnue (année, pilote ou Grand Prix) ; sans html : saison indisponible pour le moment
// (l'appli la chargera elle-même). alt : adresse de la page dans chaque langue (hreflang) ; app : rubrique à ouvrir par
// l'appli ({ section, year, item } aux noms français), pour la version anglaise dont l'appli ne lit pas l'adresse
export async function seasonSsr(env, p, { now = Date.now() } = {}) {
  const current = new Date(now).getUTCFullYear(), year = p.year;
  if (year < firstYear(now) || year > current || (p.section === 'grid' && year !== GRID_NEXT.year - 1)) return null;
  const t = LANG[p.lang] || FR;
  const row = await seasonRow(env, year, { now, maxAge: year < current ? 7 * 86400e3 : 6 * 3600e3 }).catch(() => null);
  const s = row?.v;
  const alt = (fr, en) => ({ fr: `${APP}${seasonPath(year, p.section, fr)}`, en: `${APP}${enSeasonPath(year, p.section, en)}` });
  if (!s?.races && p.section !== 'grid') {
    return { url: `${APP}${t.path(year, p.section, p.item)}`, title: t.title(year, p.section), desc: t.desc(p.section, year), lang: t.lang,
      ...(p.section !== 'gp' ? { alt: alt(p.item, p.item) } : {}) };
  }
  const trail = [['Paddock Live', '/'], [t.season(year), t.path(year)]];
  let title = t.title(year, p.section), desc = t.desc(p.section, year), body, ld = [], links = alt(p.item, p.item), appItem = p.item;
  if (p.section === 'drivers' && p.item) {
    const d = s.drivers.find((x) => slug(x.name) === p.item);
    if (!d) return null;
    title = t.title(year, 'drivers', d.name);
    desc = t.driverDesc(d, year);
    body = driverBody(t, s, year, d);
    ld = [{ '@type': 'Person', name: d.name, memberOf: { '@type': 'SportsTeam', name: d.team, sport: 'Formula 1' } }];
    trail.push([d.name, t.path(year, 'drivers', p.item)]);
  } else if (p.section === 'gp') {
    const r = s.races.find((x) => t.gpItem(x) === p.item);
    if (!r) return null;
    title = t.title(year, 'gp', r.name, r.results.length > 0);
    desc = t.gpDesc(r, year, r.results.find((x) => x.pos === 1), r.quali.find((x) => x.pos === 1));
    body = raceBody(t, s, year, r, r.results.length ? await raceStatsOf(env, year, r.round).catch(() => null) : null);
    ld = [gpEvent(t, s, year, r)];
    links = alt(FR.gpItem(r), EN.gpItem(r));
    appItem = FR.gpItem(r);
    trail.push([t.gpName(r).replace(/ GP$/, ''), t.path(year, 'gp', p.item)]);
  } else if (p.section === 'grid') {
    body = gridBody(t);
  } else if (p.section === 'drivers') {
    body = box(t.drivers, table([t.pos, t.driver, t.team, t.points], s.drivers.map((d) => [d.pos ?? '', dLink(t, year, d.name), esc(d.team), d.points])));
  } else if (p.section === 'standings') {
    body = standings(t, s, year);
  } else if (p.section === 'calendar' || p.section === 'results') {
    body = calendar(t, s, year);
    // Calendrier : chaque Grand Prix de la saison, comme sur sa page (moteurs de recherche : liste d'événements)
    if (p.section === 'calendar') ld = s.races.map((r) => ({ ...gpEvent(t, s, year, r), url: `${APP}${t.path(year, 'gp', t.gpItem(r))}` }));
  } else {
    const done = s.races.filter((r) => r.results.length).length;
    body = `<p class="muted">${esc(t.home(done, s.races.length, s.drivers[0]))}</p>${standings(t, s, year, 10)}${calendar(t, s, year)}`;
  }
  if (p.section !== 'home' && !p.item) trail.push([title, t.path(year, p.section)]);
  const url = `${APP}${t.path(year, p.section, p.item)}`;
  // Lien vers la même page dans l'autre langue
  const [ol, otext] = t.other;
  const other = `<p class="muted small"><a href="${links[ol].slice(APP.length)}" hreflang="${ol}" lang="${ol}">${otext}</a></p>`;
  if (t.lang === 'en') ld.push({ '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'en' });
  return { url, title, desc, lang: t.lang, alt: links, app: { section: p.section, year, item: appItem },
    html: `<h1 class="sz-ssr-title">${esc(title)}</h1>${other}${body}${nav(t, year)}`, ld: [...ld.map((x) => ({ ...x, url: x.url || url })), crumbs(trail)] };
}

// Page de la version web (/live/index.html) -> page d'une rubrique de la Saison (seasonSsr) : titre (sans « · Paddock Live »
// au-delà de 60 caractères), description, adresses, données structurées et premier contenu ; un seul titre H1, celui
// du contenu (le « Paddock Live » de l'accueil de l'appli, écrit dans la page, devient un paragraphe). Lu par le Worker
// (HTMLRewriter de Cloudflare)
export function seasonRewriter(ssr) {
  const attr = (name, v) => ({ element(e) { e.setAttribute(name, v); } });
  const full = `${ssr.title} · Paddock Live`;
  const alt = ssr.alt ? [['fr', ssr.alt.fr], ['en', ssr.alt.en], ['x-default', ssr.alt.fr]].map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`).join('') : '';
  return new HTMLRewriter()
    .on('html', { element(e) { if (ssr.lang === 'en') e.setAttribute('lang', 'en'); } })
    .on('title', { element(e) { e.setInnerContent(full.length <= 60 ? full : ssr.title); } })
    .on('meta[name="description"]', attr('content', ssr.desc))
    .on('meta[property="og:title"]', attr('content', ssr.title))
    .on('meta[property="og:description"]', attr('content', ssr.desc))
    .on('meta[name="twitter:title"]', attr('content', ssr.title))
    .on('meta[name="twitter:description"]', attr('content', ssr.desc))
    .on('meta[property="og:url"]', attr('content', ssr.url))
    .on('link[rel="canonical"]', attr('href', ssr.url))
    .on('head', { element(e) {
      e.append(alt, { html: true });
      if (ssr.ld) e.append(`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ssr.ld }).replace(/</g, '\\u003c')}</script>`, { html: true });
    } })
    .on('h1.hm-hello', { element(e) { if (ssr.html) e.tagName = 'p'; } })
    .on('#seasonView', { element(e) { if (ssr.html) e.removeAttribute('hidden'); } })
    .on('#szContent', { element(e) {
      if (!ssr.html) return;
      e.setInnerContent(ssr.html, { html: true });
      if (ssr.lang === 'en' && ssr.app) for (const [k, v] of Object.entries(ssr.app)) if (v != null) e.setAttribute(`data-sz-${k}`, String(v));
    } });
}

// Plan du site : les rubriques des 8 dernières saisons qui ont leur propre contenu écrit par le serveur (les autres
// reprennent celui de l'accueil : du contenu en double pour Google) ; pilotes et Grands Prix des saisons déjà gardées
// dans la base (lu sans interroger Jolpica : une demande de robot reste rapide). En français et en anglais ; lastmod :
// jour de la dernière course courue (rubriques, pilotes) ou de la course (Grand Prix couru), rien sans course courue
const OWN = ['home', 'calendar', 'standings', 'results', 'drivers'];
const isoDay = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : null);
export async function seasonSitemap(env, now = Date.now()) {
  const urls = [];
  for (let y = new Date(now).getUTCFullYear(); y >= firstYear(now); y--) {
    const s = JSON.parse(await getRow(env, `season:${y}`) || 'null')?.v;
    if (y === new Date(now).getUTCFullYear() && !s?.races?.some((r) => r.results?.length)) continue;   // pas encore de course
    const last = isoDay(s?.races?.filter((r) => r.results?.length).at(-1)?.date);
    for (const t of [FR, EN]) {
      urls.push(...OWN.map((k) => [t.path(y, k), last]));
      if (y === GRID_NEXT.year - 1) urls.push([t.path(y, 'grid'), GRID_NEXT.updated]);
      if (s?.races?.length) urls.push(...s.drivers.map((d) => [t.path(y, 'drivers', slug(d.name)), last]), ...s.races.map((r) => [t.path(y, 'gp', t.gpItem(r)), r.results?.length ? isoDay(r.date) : null]));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, mod]) => `  <url><loc>${APP}${u}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

// Anciennes pages publiques (paddocklive.app/saison/…, /en/season/…) -> adresse de la rubrique dans la version web, ou null
export async function legacySeasonUrl(env, url) {
  if (parseSeasonPath(url.pathname)) return `${APP}${url.pathname}`;   // adresse de l'appli tapée sur le site
  const m = /^\/(saison|en\/season)\/(?:(\d{4})\/(?:(pilotes|ecuries|drivers|teams)\/)?(?:([a-z0-9-]+)\/)?)?$/.exec(url.pathname);
  if (!m) return null;
  const y = m[2];
  if (!y) return `${APP}/saison/`;
  if (m[3] === 'pilotes' || m[3] === 'drivers') return `${APP}${seasonPath(y, 'drivers', m[4] || null)}`;
  if (m[3]) return `${APP}${seasonPath(y, 'standings')}`;   // écuries : pas de fiche dans l'appli
  if (!m[4]) return `${APP}${seasonPath(y)}`;
  // Grand Prix : adresse anglaise (« mexico-city ») -> nom français de l'appli (« mexico »)
  let gp = m[4];
  if (m[1] !== 'saison') {
    const s = JSON.parse(await getRow(env, `season:${y}`) || 'null')?.v;
    const r = s?.races?.find((x) => slug(gpShort(x.name, true)) === m[4]);
    gp = r ? gpSlug(r.name) : null;
  }
  return `${APP}${gp ? seasonPath(y, 'gp', gp) : seasonPath(y, 'results')}`;
}
