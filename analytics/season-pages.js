// Pages publiques de la Saison, pour les moteurs de recherche : une page par saison (/saison/2026/, /en/season/2026/ :
// classements, calendrier), une par Grand Prix (/saison/2026/mexico/ : résultats, qualifications, sprint, arrêts
// les plus rapides), une par pilote (/saison/2026/pilotes/lando-norris/) et une par écurie (/saison/2026/ecuries/mclaren/),
// écrites par le serveur avec les mêmes données que l'espace Saison de l'appli (Jolpica, analyses
// des archives, arrêts DHL au centième). Plan du site : /saison/sitemap.xml, annoncé dans robots.txt.
import { seasonRow } from './studio.js';
import { getRow } from './alerts.js';
import { raceStatsOf } from './race-stats.js';
import { gpShort, gpFull } from '../shared/gp-names.js';
import { PAGE_STYLE } from './launch/guides.mjs';

const SITE = 'https://paddocklive.app';
export const FIRST_YEAR = 2018;   // comme l'espace Saison de la version web

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const slugOf = (name, en) => slug(gpShort(name, en));
// Nom du Grand Prix dans les listes : « Mexico » ; en anglais, le nom d'origine (« Mexico City Grand Prix »)
const gpName = (name, en) => (en ? name : gpShort(name));
const base = (en, year) => (en ? `/en/season/${year}/` : `/saison/${year}/`);
const raceUrl = (en, year, r) => `${base(en, year)}${slugOf(r.name, en)}/`;
const driverUrl = (en, year, name) => `${base(en, year)}${en ? 'drivers' : 'pilotes'}/${slug(name)}/`;
const teamUrl = (en, year, id) => `${base(en, year)}${en ? 'teams' : 'ecuries'}/${slug(id)}/`;
// Nom de pilote et d'écurie en lien vers leur page
const dLink = (en, year, name) => `<a href="${driverUrl(en, year, name)}"><b>${esc(name)}</b></a>`;
const tLink = (en, year, name, id) => (id ? `<a href="${teamUrl(en, year, id)}">${esc(name)}</a>` : esc(name));
const nth = (en, n) => (!n ? '—' : en ? `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}` : n === 1 ? '1er' : `${n}e`);
const T = {
  fr: { locale: 'fr-FR', home: '/', season: 'Saison', drivers: 'Classement des pilotes', teams: 'Classement des constructeurs', calendar: 'Calendrier et résultats',
    round: 'Manche', gp: 'Grand Prix', date: 'Date', winner: 'Vainqueur', pole: 'Pole', pos: 'Pos.', driver: 'Pilote', team: 'Écurie', pts: 'Points', wins: 'Victoires',
    race: 'Course', quali: 'Qualifications', sprint: 'Sprint', time: 'Temps / écart', laps: 'Tours', grid: 'Grille', schedule: 'Programme du week-end (heure de Paris)',
    stops: 'Arrêts aux stands les plus rapides', lap: 'Tour', stop: 'Immobilisation', prev: 'Grand Prix précédent', next: 'Grand Prix suivant', seasons: 'Autres saisons',
    cta: 'Suivre le prochain Grand Prix en direct avec Paddock Live', app: 'Live timing, carte GPS, radios traduites et stratégie, calés sur ta TV. Gratuit.',
    dhl: 'Immobilisations au centième : DHL Fastest Pit Stop Award. Copyright © DHL International GmbH. All Rights Reserved.',
    legal: 'Paddock Live est un projet indépendant, sans lien avec la Formula 1, la FIA ni les écuries. Résultats : Jolpica (Ergast).',
    status: { R: 'Abandon', D: 'Disqualifié', E: 'Exclu', W: 'Forfait', F: 'Non qualifié', N: 'Non classé' }, lapped: (n) => `+${n} tour${n > 1 ? 's' : ''}`, tz: 'Europe/Paris' },
  en: { locale: 'en-GB', home: '/en/', season: 'Season', drivers: 'Drivers\' standings', teams: 'Constructors\' standings', calendar: 'Calendar and results',
    round: 'Round', gp: 'Grand Prix', date: 'Date', winner: 'Winner', pole: 'Pole', pos: 'Pos.', driver: 'Driver', team: 'Team', pts: 'Points', wins: 'Wins',
    race: 'Race', quali: 'Qualifying', sprint: 'Sprint', time: 'Time / gap', laps: 'Laps', grid: 'Grid', schedule: 'Weekend schedule (UTC)',
    stops: 'Fastest pit stops', lap: 'Lap', stop: 'Stationary', prev: 'Previous Grand Prix', next: 'Next Grand Prix', seasons: 'Other seasons',
    cta: 'Follow the next Grand Prix live with Paddock Live', app: 'Live timing, GPS track map, team radio and strategy, synced to your TV. Free.',
    dhl: 'Stationary times to the hundredth: DHL Fastest Pit Stop Award. Copyright © DHL International GmbH. All Rights Reserved.',
    legal: 'Paddock Live is an independent project, not affiliated with Formula 1, the FIA or the teams. Results: Jolpica (Ergast).',
    status: { R: 'Retired', D: 'Disqualified', E: 'Excluded', W: 'Withdrawn', F: 'Did not qualify', N: 'Not classified' }, lapped: (n) => `+${n} lap${n > 1 ? 's' : ''}`, tz: 'UTC' },
};
const SESSION_EN = { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint qualifying', Sprint: 'Sprint', Qualifications: 'Qualifying', Course: 'Race' };

const day = (t, iso) => (iso ? new Date(iso).toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: t.tz }) : '—');
const when = (t, iso) => new Date(iso).toLocaleString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: t.tz });
const lapTime = (s) => (s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '');
const stopTxt = (s, l) => `${s.stop.toFixed(s.dhl ? 2 : 1)}${l === 'fr' ? ' s' : 's'}`.replace('.', l === 'fr' ? ',' : '.');
function result(t, r) {
  if (r.time) return r.time;
  const m = /^\+(\d+) Laps?$/.exec(r.status || '');
  if (m) return t.lapped(Number(m[1]));
  return t.status[r.posText] || r.status || '';
}
const table = (head, rows) => `<div class="tbl"><table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;

function page({ l, year, path, alt, title, desc, h1, eyebrow, body, ld }) {
  const t = T[l];
  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Paddock Live</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" hreflang="${l}" href="${SITE}${path}">
<link rel="alternate" hreflang="${l === 'fr' ? 'en' : 'fr'}" href="${SITE}${alt}">
<link rel="alternate" hreflang="x-default" href="${SITE}${l === 'en' ? path : alt}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/site/img/apercu.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/site/img/logo.png">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ld }).replace(/</g, '\\u003c')}</script>
<style>
${PAGE_STYLE}.tbl { overflow-x: auto; margin: 0 0 8px; border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 15px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
tr:last-child td { border-bottom: 0; }
.pager { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 40px 0 0; }
.note { color: var(--muted); font-size: 14px; }
.cta .btn { white-space: normal; text-align: center; }
.kv td { white-space: normal; }
</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="${t.home}"><img src="/site/img/logo.png" alt="" width="32" height="32">Paddock <b>Live</b></a>
  <a class="btn" href="${t.home}#telecharger">${l === 'fr' ? 'Télécharger' : 'Download'}</a>
</div></header>
<main class="wrap">
  <span class="eyebrow">${esc(eyebrow)}</span>
  <h1>${esc(h1)}</h1>
  ${body}
  <div class="cta"><a class="btn" href="${t.home}#telecharger">${esc(t.cta)}</a><small>${esc(t.app)}</small></div>
</main>
<footer><div class="wrap">
  <p><a href="${t.home}">Paddock Live</a> · <a href="${base(l === 'en', year)}">${t.season} ${year}</a> · <a href="${alt}">${l === 'fr' ? 'English' : 'Français'}</a></p>
  <p>${esc(t.legal)}</p>
</div></footer>
</body>
</html>
`;
}

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })) });

export function seasonPage(s, year, l) {
  const t = T[l], en = l === 'en';
  const winner = (r) => r.results.find((x) => x.pos === 1);
  const pole = (r) => r.quali.find((x) => x.pos === 1);
  const done = s.races.filter((r) => r.results.length);
  const leader = s.drivers[0];
  const body = `<p class="lead">${esc(en
    ? `${done.length} of ${s.races.length} Grands Prix run${leader ? `, ${leader.name} leads with ${leader.points} points` : ''}.`
    : `${done.length} Grands Prix courus sur ${s.races.length}${leader ? `, ${leader.name} en tête avec ${leader.points} points` : ''}.`)}</p>
  <h2>${t.drivers}</h2>
  ${table([t.pos, t.driver, t.team, t.pts, t.wins], s.drivers.map((d) => [d.pos ?? '', dLink(en, year, d.name), tLink(en, year, d.team, d.teamId), d.points, d.wins]))}
  <h2>${t.teams}</h2>
  ${table([t.pos, t.team, t.pts, t.wins], s.constructors.map((c) => [c.pos ?? '', `<b>${tLink(en, year, c.name, c.id)}</b>`, c.points, c.wins]))}
  <h2>${t.calendar}</h2>
  ${table([t.round, t.gp, t.date, t.winner, t.pole], s.races.map((r) => [r.round, `<a href="${raceUrl(en, year, r)}">${esc(gpName(r.name, en))}</a>`, day(t, r.date), esc(winner(r)?.name || ''), esc(pole(r)?.name || '')]))}
  <h2>${t.seasons}</h2>
  <div class="more">${Array.from({ length: new Date().getUTCFullYear() - FIRST_YEAR + 1 }, (_, i) => new Date().getUTCFullYear() - i).filter((y) => y !== year).map((y) => `<a href="${base(en, y)}">${t.season} ${y}</a>`).join('')}</div>`;
  const title = en ? `${year} F1 season: standings, calendar and results` : `Saison ${year} de F1 : classements, calendrier et résultats`;
  return page({
    l, year, path: base(en, year), alt: base(!en, year), title, h1: title, eyebrow: `Formula 1 · ${year}`, body,
    desc: en ? `${year} Formula 1 season: drivers' and constructors' standings, calendar, winners and results of every Grand Prix.`
      : `Saison ${year} de Formule 1 : classement des pilotes et des constructeurs, calendrier, vainqueurs et résultats de chaque Grand Prix.`,
    ld: [crumbs([['Paddock Live', t.home], [`${t.season} ${year}`, base(en, year)]])],
  });
}

export function racePage(s, year, r, stats, l) {
  const t = T[l], en = l === 'en';
  const full = `${gpFull(r.name, en)} ${year}`;
  const i = s.races.indexOf(r), prev = s.races[i - 1], next = s.races[i + 1];
  const win = r.results.find((x) => x.pos === 1), pole = r.quali.find((x) => x.pos === 1);
  const where = [r.circuit, r.locality, r.country].filter(Boolean).join(', ');
  const parts = [`<p class="lead">${esc(`${day(t, r.date)} · ${where}`)}${win ? `<br>${t.winner} : <b>${esc(win.name)}</b> (${esc(win.team)})` : ''}${pole ? ` · ${t.pole} : <b>${esc(pole.name)}</b>` : ''}</p>`];
  if (r.results.length) {
    parts.push(`<h2>${t.race}</h2>`, table([t.pos, t.driver, t.team, t.time, t.laps, t.grid, t.pts], r.results.map((x) => [x.posText && /^\d+$/.test(x.posText) ? x.pos : '—', dLink(en, year, x.name), tLink(en, year, x.team, x.teamId), esc(result(t, x)), x.laps ?? '', x.grid || (en ? 'Pit lane' : 'Stands'), x.points || ''])));
  }
  if (r.sprintResults.length) parts.push(`<h2>${t.sprint}</h2>`, table([t.pos, t.driver, t.team, t.time, t.pts], r.sprintResults.map((x) => [x.pos ?? '—', dLink(en, year, x.name), tLink(en, year, x.team, x.teamId), esc(result(t, x)), x.points || ''])));
  if (r.quali.length) parts.push(`<h2>${t.quali}</h2>`, table([t.pos, t.driver, t.team, 'Q1', 'Q2', 'Q3'], r.quali.map((x) => [x.pos ?? '', dLink(en, year, x.name), tLink(en, year, x.team, x.teamId), ...x.q.map(lapTime)])));
  const stops = (stats?.drivers || []).flatMap((d) => d.stops.filter((x) => x.stop > 0 && x.stop < 15).map((x) => ({ ...x, d }))).sort((a, b) => a.stop - b.stop).slice(0, 10);
  if (stops.length) {
    parts.push(`<h2>${t.stops}</h2>`, table([t.pos, t.driver, t.team, t.lap, t.stop], stops.map((x, k) => [k + 1, dLink(en, year, x.d.name), esc(x.d.team), x.lap ?? '', stopTxt(x, l)])));
    if (stops.some((x) => x.dhl)) parts.push(`<p class="note">${esc(t.dhl)}</p>`);
  }
  if (!r.results.length && r.sessions?.length) {
    parts.push(`<h2>${t.schedule}</h2>`, table([en ? 'Session' : 'Séance', t.date], r.sessions.filter((x) => x.t).map((x) => [esc(en ? SESSION_EN[x.label] || x.label : x.label), esc(when(t, x.t))])));
  }
  parts.push(`<div class="pager">${prev ? `<a href="${raceUrl(en, year, prev)}">← ${esc(gpName(prev.name, en))}</a>` : '<span></span>'}<a href="${base(en, year)}">${t.season} ${year}</a>${next ? `<a href="${raceUrl(en, year, next)}">${esc(gpName(next.name, en))} →</a>` : '<span></span>'}</div>`);
  const title = r.results.length ? (en ? `${full}: results` : `${full} : résultats`) : (en ? `${full}: schedule` : `${full} : programme`);
  const desc = r.results.length
    ? (en ? `${full} results (${r.circuit}): winner ${win?.name}${pole ? `, pole ${pole.name}` : ''}, full classification, qualifying${r.sprint ? ', sprint' : ''} and fastest pit stops.`
      : `Résultats du ${full} (${r.circuit}) : vainqueur ${win?.name}${pole ? `, pole ${pole.name}` : ''}, classement complet, qualifications${r.sprint ? ', sprint' : ''} et arrêts aux stands les plus rapides.`)
    : (en ? `${full} at ${r.circuit}: weekend schedule, then results, qualifying and pit stops after the race.`
      : `${full} au ${r.circuit} : programme du week-end, puis résultats, qualifications et arrêts aux stands après la course.`);
  const event = { '@type': 'SportsEvent', name: full, sport: 'Formula 1', startDate: r.date, eventStatus: 'https://schema.org/EventScheduled', url: `${SITE}${raceUrl(en, year, r)}`,
    location: { '@type': 'Place', name: r.circuit, address: { '@type': 'PostalAddress', addressLocality: r.locality, addressCountry: r.country } } };
  return page({
    l, year, path: raceUrl(en, year, r), alt: raceUrl(!en, year, r), title, h1: title, eyebrow: `${t.round} ${r.round} · ${year}`, desc, body: parts.join('\n  '),
    ld: [event, crumbs([['Paddock Live', t.home], [`${t.season} ${year}`, base(en, year)], [gpName(r.name, en), raceUrl(en, year, r)]])],
  });
}

// Arrivée d'un pilote : « P3 », ou abandon, disqualification…
const finish = (t, x) => (!x ? '—' : /^\d+$/.test(x.posText || '') ? `P${x.pos}` : t.status[x.posText] || x.status || '—');
const P = {
  fr: { results: 'Grand Prix par Grand Prix', podiums: 'Podiums', poles: 'Poles', fastest: 'Meilleurs tours', dnf: 'Abandons', best: 'Meilleure arrivée', avg: 'Arrivée moyenne',
    standing: 'Championnat', teamOf: 'Écurie', mates: 'Pilotes', total: 'Points du week-end', finish: 'Arrivée', grid: 'Grille', quali: 'Qualif.', sprint: 'Sprint',
    dTitle: (n, y) => `${n} : saison ${y} de F1, résultats et classement`, dDesc: (n, y, d) => `Saison ${y} de ${n} en Formule 1 : ${d}, résultats Grand Prix par Grand Prix, qualifications, grilles et points.`,
    tTitle: (n, y) => `${n} : saison ${y} de F1, résultats et classement`, tDesc: (n, y, d) => `Saison ${y} de l'écurie ${n} en Formule 1 : ${d}, résultats de ses pilotes Grand Prix par Grand Prix.`,
    summary: (pos, pts, wins) => `${nth(false, pos)} du championnat avec ${pts} point${pts > 1 ? 's' : ''}${wins ? `, ${wins} victoire${wins > 1 ? 's' : ''}` : ''}` },
  en: { results: 'Race by race', podiums: 'Podiums', poles: 'Poles', fastest: 'Fastest laps', dnf: 'Retirements', best: 'Best finish', avg: 'Average finish',
    standing: 'Championship', teamOf: 'Team', mates: 'Drivers', total: 'Weekend points', finish: 'Finish', grid: 'Grid', quali: 'Quali', sprint: 'Sprint',
    dTitle: (n, y) => `${n}: ${y} F1 season, results and standings`, dDesc: (n, y, d) => `${n}'s ${y} Formula 1 season: ${d}, results race by race, qualifying, grid positions and points.`,
    tTitle: (n, y) => `${n}: ${y} F1 season, results and standings`, tDesc: (n, y, d) => `${n}'s ${y} Formula 1 season: ${d}, results of its drivers race by race.`,
    summary: (pos, pts, wins) => `${nth(true, pos)} in the championship with ${pts} point${pts === 1 ? '' : 's'}${wins ? `, ${wins} win${wins > 1 ? 's' : ''}` : ''}` },
};
const ran = (s) => s.races.filter((r) => r.results.length || r.quali.length);
const kv = (pairs) => `<div class="tbl"><table class="kv">${pairs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></div>`;

// Pilotes de la saison (classement, puis ceux qui n'y figurent pas encore) : [{ name, code, team, teamId, pos, points, wins }]
export function seasonDrivers(s) {
  const out = new Map(s.drivers.map((d) => [slug(d.name), d]));
  for (const r of s.races) for (const x of [...r.results, ...r.quali]) if (!out.has(slug(x.name))) out.set(slug(x.name), { name: x.name, code: x.code, team: x.team, teamId: x.teamId, pos: null, points: 0, wins: 0 });
  return [...out.values()];
}
export function seasonTeams(s) {
  const out = new Map(s.constructors.map((c) => [slug(c.id), c]));
  for (const r of s.races) for (const x of r.results) if (x.teamId && !out.has(slug(x.teamId))) out.set(slug(x.teamId), { name: x.team, id: x.teamId, pos: null, points: 0, wins: 0 });
  return [...out.values()];
}

export function driverPage(s, year, d, l) {
  const t = T[l], p = P[l], en = l === 'en', key = slug(d.name);
  const rows = ran(s).map((r) => ({ r, res: r.results.find((x) => slug(x.name) === key), q: r.quali.find((x) => slug(x.name) === key), spr: r.sprintResults.find((x) => slug(x.name) === key) })).filter((x) => x.res || x.q);
  const races = rows.filter((x) => x.res);
  const classified = races.filter((x) => /^\d+$/.test(x.res.posText || '')).map((x) => x.res.pos);
  const teams = [...new Map(rows.map((x) => { const y = x.res || x.q; return [y.teamId, y]; })).values()];
  const sprints = s.races.some((r) => r.sprintResults.length);
  const summary = p.summary(d.pos, d.points, d.wins);
  const body = `<p class="lead">${esc(summary)} · ${teams.map((x) => tLink(en, year, x.team, x.teamId)).join(', ')}</p>
  ${kv([[p.standing, `${nth(en, d.pos)} · ${d.points} pts`], [t.wins, d.wins], [p.podiums, races.filter((x) => x.res.pos <= 3 && classified.includes(x.res.pos)).length],
    [p.poles, rows.filter((x) => x.q?.pos === 1).length], [p.fastest, races.filter((x) => x.res.fastest).length], [p.dnf, races.length - classified.length],
    [p.best, classified.length ? `P${Math.min(...classified)}` : '—'], [p.avg, classified.length ? `P${(classified.reduce((a, b) => a + b, 0) / classified.length).toFixed(1).replace('.', en ? '.' : ',')}` : '—']])}
  <h2>${p.results}</h2>
  ${table([t.round, t.gp, p.quali, p.grid, ...(sprints ? [p.sprint] : []), p.finish, t.pts], rows.map((x) => [x.r.round, `<a href="${raceUrl(en, year, x.r)}">${esc(gpName(x.r.name, en))}</a>`,
    x.q?.pos ? `P${x.q.pos}` : '—', x.res ? (x.res.grid ? `P${x.res.grid}` : en ? 'Pit lane' : 'Stands') : '—', ...(sprints ? [x.spr ? finish(t, x.spr) : ''] : []), esc(finish(t, x.res)),
    (x.res?.points || 0) + (x.spr?.points || 0) || '']))}`;
  const title = p.dTitle(d.name, year);
  return page({
    l, year, path: driverUrl(en, year, d.name), alt: driverUrl(!en, year, d.name), title, h1: title, eyebrow: `${t.driver} · ${year}`, body, desc: p.dDesc(d.name, year, summary),
    ld: [{ '@type': 'Person', name: d.name, url: `${SITE}${driverUrl(en, year, d.name)}`, memberOf: teams.map((x) => ({ '@type': 'SportsTeam', name: x.team, sport: 'Formula 1' })) },
      crumbs([['Paddock Live', t.home], [`${t.season} ${year}`, base(en, year)], [d.name, driverUrl(en, year, d.name)]])],
  });
}

export function teamPage(s, year, c, l) {
  const t = T[l], p = P[l], en = l === 'en', id = slug(c.id);
  const drivers = [...new Map(s.races.flatMap((r) => r.results.filter((x) => slug(x.teamId) === id)).map((x) => [slug(x.name), x.name])).values()];
  const rows = ran(s).filter((r) => r.results.length);
  const summary = p.summary(c.pos, c.points, c.wins);
  const body = `<p class="lead">${esc(summary)}</p>
  ${kv([[p.standing, `${nth(en, c.pos)} · ${c.points} pts`], [t.wins, c.wins], [p.mates, drivers.map((n) => dLink(en, year, n)).join(', ')]])}
  <h2>${p.results}</h2>
  ${table([t.round, t.gp, ...drivers.map(esc), p.total], rows.map((r) => {
    const mine = (n) => r.results.find((x) => slug(x.name) === slug(n) && slug(x.teamId) === id);
    const pts = [...r.results, ...r.sprintResults].filter((x) => slug(x.teamId) === id).reduce((a, x) => a + (x.points || 0), 0);
    return [r.round, `<a href="${raceUrl(en, year, r)}">${esc(gpName(r.name, en))}</a>`, ...drivers.map((n) => esc(mine(n) ? finish(t, mine(n)) : '')), pts || ''];
  }))}`;
  const title = p.tTitle(c.name, year);
  return page({
    l, year, path: teamUrl(en, year, c.id), alt: teamUrl(!en, year, c.id), title, h1: title, eyebrow: `${t.team} · ${year}`, body, desc: p.tDesc(c.name, year, summary),
    ld: [{ '@type': 'SportsTeam', name: c.name, sport: 'Formula 1', url: `${SITE}${teamUrl(en, year, c.id)}`, member: drivers.map((n) => ({ '@type': 'Person', name: n })) },
      crumbs([['Paddock Live', t.home], [`${t.season} ${year}`, base(en, year)], [c.name, teamUrl(en, year, c.id)]])],
  });
}

// Plan du site (sans lecture chez Jolpica : une demande de robot reste rapide)
export async function seasonSitemap(env, now = Date.now()) {
  const urls = [];
  for (let y = new Date(now).getUTCFullYear(); y >= FIRST_YEAR; y--) {
    // Page de chaque saison ; ses Grands Prix, pilotes et écuries dès qu'elle est gardée dans la base (une visite suffit)
    const s = JSON.parse(await getRow(env, `season:${y}`) || 'null')?.v;
    for (const en of [false, true]) {
      urls.push(base(en, y));
      if (s?.races?.length) urls.push(...s.races.map((r) => raceUrl(en, y, r)), ...seasonDrivers(s).map((d) => driverUrl(en, y, d.name)), ...seasonTeams(s).map((c) => teamUrl(en, y, c.id)));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`;
}

// /saison/…, /en/season/… : page, plan du site, ou null (adresse inconnue : le Worker répond 404)
export async function seasonPages(env, url, { now = Date.now() } = {}) {
  const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  if (url.pathname === '/saison/sitemap.xml') return new Response(await seasonSitemap(env, now), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  const m = /^\/(saison|en\/season)\/(?:(\d{4})\/(?:(pilotes|ecuries|drivers|teams)\/)?(?:([a-z0-9-]+)\/)?)?$/.exec(url.pathname);
  if (!m) return null;
  const en = m[1] !== 'saison', current = new Date(now).getUTCFullYear(), year = Number(m[2]);
  if (!m[2]) return Response.redirect(`${url.origin}${base(en, current)}`, 302);
  if (year < FIRST_YEAR || year > current) return null;
  const row = await seasonRow(env, year, { now, maxAge: year < current ? 7 * 86400e3 : 6 * 3600e3 }).catch(() => null);
  if (!row?.v?.races) return new Response('Saison indisponible pour le moment', { status: 503, headers: { 'Retry-After': '600' } });
  const s = row.v, l = en ? 'en' : 'fr';
  if (m[3] && (['drivers', 'teams'].includes(m[3]) !== en || !m[4])) return null;
  if (m[3] === 'pilotes' || m[3] === 'drivers') { const d = seasonDrivers(s).find((x) => slug(x.name) === m[4]); return d ? html(driverPage(s, year, d, l)) : null; }
  if (m[3]) { const c = seasonTeams(s).find((x) => slug(x.id) === m[4]); return c ? html(teamPage(s, year, c, l)) : null; }
  if (!m[4]) return html(seasonPage(s, year, l));
  const r = s.races.find((x) => slugOf(x.name, en) === m[4]);
  if (!r) return null;
  return html(racePage(s, year, r, r.results.length ? await raceStatsOf(env, year, r.round).catch(() => null) : null, l));
}
