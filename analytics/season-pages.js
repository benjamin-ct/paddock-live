// Espace Saison de la version web pour les moteurs de recherche : chaque rubrique a son adresse
// (app.paddocklive.app/saison/2026/…, shared/season-urls.js). Le serveur y sert la page de l'appli avec le titre, la
// description et un premier contenu de la rubrique déjà écrits (classements, calendrier, résultats d'un Grand Prix,
// saison d'un pilote), remplacés par l'appli dès qu'elle démarre. Plan du site : paddocklive.app/saison/sitemap.xml.
// Anciennes pages publiques (paddocklive.app/saison/…, /en/season/…) : redirigées vers leur rubrique.
import { seasonRow } from './studio.js';
import { getRow } from './alerts.js';
import { raceStatsOf } from './race-stats.js';
import { gpShort, gpFull } from '../shared/gp-names.js';
import { SECTION_PATHS, seasonPath, seasonTitle, slug, gpSlug, parseSeasonPath } from '../shared/season-urls.js';

export const APP = 'https://app.paddocklive.app';
const YEARS = 8;   // comme le choix de l'année dans l'espace Saison (ui/season.js)
export const firstYear = (now = Date.now()) => new Date(now).getUTCFullYear() - YEARS + 1;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = (title, html) => `<section class="sz-box"><h3>${esc(title)}</h3>${html}</section>`;
const table = (head, rows) => `<div class="sz-scroll"><table class="sz-table"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '—');
const when = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const lapTime = (s) => (s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '');
const stopTxt = (s) => `${s.stop.toFixed(s.dhl ? 2 : 1).replace('.', ',')} s`;
const nth = (n) => (!n ? '—' : n === 1 ? '1er' : `${n}e`);
const STATUS = { R: 'Abandon', D: 'Disqualifié', E: 'Exclu', W: 'Forfait', F: 'Non qualifié', N: 'Non classé' };
const classified = (x) => /^\d+$/.test(x?.posText || '');
function result(x) {
  if (x.time) return x.time;
  const m = /^\+(\d+) Laps?$/.exec(x.status || '');
  return m ? `+${m[1]} tour${m[1] > 1 ? 's' : ''}` : STATUS[x.posText] || x.status || '';
}
const finish = (x) => (!x ? '—' : classified(x) ? `P${x.pos}` : STATUS[x.posText] || x.status || '—');
const dLink = (year, name) => `<a href="${seasonPath(year, 'drivers', slug(name))}"><b>${esc(name)}</b></a>`;
const gLink = (year, r, text = gpShort(r.name)) => `<a href="${seasonPath(year, 'gp', gpSlug(r.name))}">${esc(text)}</a>`;
const DHL = 'Immobilisations au centième : DHL Fastest Pit Stop Award. Copyright © DHL International GmbH. All Rights Reserved.';

const DESC = {
  home: 'Saison {} de Formule 1 : classements des pilotes et des constructeurs, calendrier, vainqueurs et résultats de chaque Grand Prix, statistiques détaillées.',
  calendar: 'Calendrier de la saison {} de Formule 1 : dates et horaires de chaque Grand Prix, vainqueurs des courses déjà disputées.',
  standings: 'Classements {} de Formule 1 : pilotes et constructeurs, points, écarts, victoires et évolution des points course après course.',
  title: 'Course au titre {} de Formule 1 : qui peut encore être champion, points encore à prendre et conditions pour le titre.',
  review: 'Bilan de la saison {} de Formule 1 : champion, victoires, poles, podiums, plus belles remontées et abandons.',
  results: 'Résultats de tous les Grands Prix de la saison {} de Formule 1 : vainqueurs, poles, podiums et records.',
  h2h: 'Duels entre coéquipiers en {} : qualifications, courses, points, écart en qualification de chaque paire de pilotes de F1.',
  ratings: 'Notes des pilotes de F1 en {}, course après course, face au coéquipier et sur la saison.',
  predict: 'Pronostics F1 {} entre amis : pronostiquez chaque Grand Prix et comparez vos points.',
  drivers: 'Pilotes de F1 en {} : la saison de chacun, résultats, qualifications, points et statistiques.',
  consistency: 'Régularité des pilotes de F1 en {} : écart-type des temps au tour, Grand Prix par Grand Prix.',
  pits: 'Arrêts aux stands F1 {} : immobilisations les plus rapides, médiane par écurie, Grand Prix par Grand Prix.',
  speeds: 'Vitesses de pointe des pilotes de F1 en {} : speed trap, ligne d\'arrivée et intermédiaires.',
  circuits: 'Profil des circuits de la saison {} de F1 : longueur, virages, vitesse moyenne, arrêts et dépassements.',
  tech: 'Évolutions techniques apportées par les écuries de F1 en {}, Grand Prix par Grand Prix, d\'après les documents de la FIA.',
  elements: 'Éléments moteur utilisés par chaque pilote de F1 en {}, d\'après les documents de la FIA.',
};

function standings(s, year, limit = Infinity) {
  return box('Classement des pilotes', table(['Pos.', 'Pilote', 'Écurie', 'Points', 'Victoires'], s.drivers.slice(0, limit).map((d) => [d.pos ?? '', dLink(year, d.name), esc(d.team), d.points, d.wins])))
    + box('Classement des constructeurs', table(['Pos.', 'Écurie', 'Points', 'Victoires'], s.constructors.slice(0, limit).map((c) => [c.pos ?? '', `<b>${esc(c.name)}</b>`, c.points, c.wins])));
}
const calendar = (s, year) => box('Calendrier et résultats', table(['Manche', 'Grand Prix', 'Date', 'Vainqueur', 'Pole'], s.races.map((r) => [r.round, gLink(year, r), day(r.date),
  esc(r.results.find((x) => x.pos === 1)?.name || ''), esc(r.quali.find((x) => x.pos === 1)?.name || '')])));
// Toutes les rubriques de la saison en liens (les boutons de l'appli n'en sont pas)
const nav = (year) => `<nav class="sz-box">${Object.keys(SECTION_PATHS).filter((k) => k !== 'gp' && k !== 'predict').map((k) => `<a href="${seasonPath(year, k)}">${esc(seasonTitle(year, k))}</a>`).join(' · ')}</nav>`;

function driverBody(s, year, d) {
  const key = slug(d.name);
  const rows = s.races.filter((r) => r.results.length || r.quali.length).map((r) => ({ r, res: r.results.find((x) => slug(x.name) === key), q: r.quali.find((x) => slug(x.name) === key), spr: r.sprintResults.find((x) => slug(x.name) === key) })).filter((x) => x.res || x.q);
  const races = rows.filter((x) => x.res), cl = races.filter((x) => classified(x.res)).map((x) => x.res.pos);
  const sprints = s.races.some((r) => r.sprintResults.length);
  return `<p class="muted">${esc(`${nth(d.pos)} du championnat avec ${d.points} point${d.points > 1 ? 's' : ''}${d.wins ? `, ${d.wins} victoire${d.wins > 1 ? 's' : ''}` : ''} · ${d.team}`)}</p>
    ${box('Bilan', table(['Victoires', 'Podiums', 'Poles', 'Meilleurs tours', 'Abandons', 'Meilleure arrivée', 'Arrivée moyenne'], [[d.wins, races.filter((x) => classified(x.res) && x.res.pos <= 3).length,
      rows.filter((x) => x.q?.pos === 1).length, races.filter((x) => x.res.fastest).length, races.length - cl.length, cl.length ? `P${Math.min(...cl)}` : '—',
      cl.length ? `P${(cl.reduce((a, b) => a + b, 0) / cl.length).toFixed(1).replace('.', ',')}` : '—']]))}
    ${box('Grand Prix par Grand Prix', table(['Manche', 'Grand Prix', 'Qualif.', 'Grille', ...(sprints ? ['Sprint'] : []), 'Arrivée', 'Points'], rows.map((x) => [x.r.round, gLink(year, x.r),
      x.q?.pos ? `P${x.q.pos}` : '—', x.res ? (x.res.grid ? `P${x.res.grid}` : 'Stands') : '—', ...(sprints ? [x.spr ? finish(x.spr) : ''] : []), esc(finish(x.res)), (x.res?.points || 0) + (x.spr?.points || 0) || ''])))}`;
}

function raceBody(s, year, r, stats) {
  const win = r.results.find((x) => x.pos === 1), pole = r.quali.find((x) => x.pos === 1);
  const i = s.races.indexOf(r), prev = s.races[i - 1], next = s.races[i + 1];
  const parts = [`<p class="muted">${esc(`Manche ${r.round} · ${day(r.date)} · ${[r.circuit, r.locality, r.country].filter(Boolean).join(', ')}`)}${win ? `<br>Vainqueur : <b>${esc(win.name)}</b> (${esc(win.team)})` : ''}${pole ? ` · Pole : <b>${esc(pole.name)}</b>` : ''}</p>`];
  if (r.results.length) parts.push(box('Course', table(['Pos.', 'Pilote', 'Écurie', 'Temps / écart', 'Tours', 'Grille', 'Points'], r.results.map((x) => [classified(x) ? x.pos : '—', dLink(year, x.name), esc(x.team), esc(result(x)), x.laps ?? '', x.grid ? `P${x.grid}` : 'Stands', x.points || '']))));
  else if (r.sessions?.length) parts.push(box('Programme du week-end (heure de Paris)', table(['Séance', 'Date'], r.sessions.filter((x) => x.t).map((x) => [esc(x.label), esc(when(x.t))]))));
  if (r.sprintResults.length) parts.push(box('Sprint', table(['Pos.', 'Pilote', 'Écurie', 'Temps / écart', 'Points'], r.sprintResults.map((x) => [classified(x) ? x.pos : '—', dLink(year, x.name), esc(x.team), esc(result(x)), x.points || '']))));
  if (r.quali.length) parts.push(box('Qualifications', table(['Pos.', 'Pilote', 'Écurie', 'Q1', 'Q2', 'Q3'], r.quali.map((x) => [x.pos ?? '', dLink(year, x.name), esc(x.team), ...x.q.map(lapTime)]))));
  const stops = (stats?.drivers || []).flatMap((d) => d.stops.filter((x) => x.stop > 0 && x.stop < 15).map((x) => ({ ...x, d }))).sort((a, b) => a.stop - b.stop).slice(0, 10);
  if (stops.length) parts.push(box('Arrêts aux stands les plus rapides', `${table(['#', 'Pilote', 'Écurie', 'Tour', 'Immob.'], stops.map((x, k) => [k + 1, dLink(year, x.d.name), esc(x.d.team), x.lap ?? '', stopTxt(x)]))}${stops.some((x) => x.dhl) ? `<p class="muted small">${esc(DHL)}</p>` : ''}`));
  parts.push(`<p>${prev ? `${gLink(year, prev, `← ${gpShort(prev.name)}`)} · ` : ''}<a href="${seasonPath(year, 'results')}">Tous les Grands Prix</a>${next ? ` · ${gLink(year, next, `${gpShort(next.name)} →`)}` : ''}</p>`);
  return parts.join('');
}

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${APP}${path}` })) });

// Adresse de la Saison ({ year, section, item }, parseSeasonPath) -> { title, desc, url, html, ld } ; null : adresse inconnue
// (année, pilote ou Grand Prix) ; sans html : saison indisponible pour le moment (l'appli la chargera elle-même)
export async function seasonSsr(env, p, { now = Date.now() } = {}) {
  const current = new Date(now).getUTCFullYear(), year = p.year;
  if (year < firstYear(now) || year > current) return null;
  const row = await seasonRow(env, year, { now, maxAge: year < current ? 7 * 86400e3 : 6 * 3600e3 }).catch(() => null);
  const s = row?.v;
  if (!s?.races) return { url: `${APP}${seasonPath(year, p.section, p.item)}`, title: seasonTitle(year, p.section), desc: (DESC[p.section] || DESC.home).replace('{}', year) };
  const trail = [['Paddock Live', '/'], [`Saison ${year}`, seasonPath(year)]];
  let title = seasonTitle(year, p.section), desc = (DESC[p.section] || DESC.home).replace('{}', year), body, ld = [];
  if (p.section === 'drivers' && p.item) {
    const d = s.drivers.find((x) => slug(x.name) === p.item);
    if (!d) return null;
    title = seasonTitle(year, 'drivers', d.name);
    desc = `Saison ${year} de ${d.name} en Formule 1 : ${nth(d.pos)} du championnat avec ${d.points} points, résultats Grand Prix par Grand Prix, qualifications, grilles et points.`;
    body = driverBody(s, year, d);
    ld = [{ '@type': 'Person', name: d.name, memberOf: { '@type': 'SportsTeam', name: d.team, sport: 'Formula 1' } }];
    trail.push([d.name, seasonPath(year, 'drivers', p.item)]);
  } else if (p.section === 'gp') {
    const r = s.races.find((x) => gpSlug(x.name) === p.item);
    if (!r) return null;
    const win = r.results.find((x) => x.pos === 1), pole = r.quali.find((x) => x.pos === 1);
    title = seasonTitle(year, 'gp', r.name, r.results.length > 0);
    desc = r.results.length ? `Résultats du ${gpFull(r.name)} ${year} (${r.circuit}) : vainqueur ${win?.name}${pole ? `, pole ${pole.name}` : ''}, classement complet, qualifications${r.sprint ? ', sprint' : ''} et arrêts aux stands les plus rapides.`
      : `${gpFull(r.name)} ${year} au ${r.circuit} : programme du week-end, puis résultats, qualifications et arrêts aux stands après la course.`;
    body = raceBody(s, year, r, r.results.length ? await raceStatsOf(env, year, r.round).catch(() => null) : null);
    ld = [{ '@type': 'SportsEvent', name: `${gpFull(r.name)} ${year}`, sport: 'Formula 1', startDate: r.date, eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: r.circuit, address: { '@type': 'PostalAddress', addressLocality: r.locality, addressCountry: r.country } } }];
    trail.push([gpShort(r.name), seasonPath(year, 'gp', p.item)]);
  } else if (p.section === 'drivers') {
    body = box('Pilotes', table(['Pos.', 'Pilote', 'Écurie', 'Points'], s.drivers.map((d) => [d.pos ?? '', dLink(year, d.name), esc(d.team), d.points])));
  } else if (p.section === 'standings') {
    body = standings(s, year);
  } else if (p.section === 'calendar' || p.section === 'results') {
    body = calendar(s, year);
  } else {
    const done = s.races.filter((r) => r.results.length).length;
    body = `<p class="muted">${esc(`${done} Grands Prix courus sur ${s.races.length}${s.drivers[0] ? `, ${s.drivers[0].name} en tête avec ${s.drivers[0].points} points` : ''}.`)}</p>${standings(s, year, 10)}${calendar(s, year)}`;
  }
  if (p.section !== 'home' && !p.item) trail.push([title, seasonPath(year, p.section)]);
  const url = `${APP}${seasonPath(year, p.section, p.item)}`;
  return { url, title, desc, html: `<h1 class="sz-ssr-title">${esc(title)}</h1>${body}${nav(year)}`, ld: [...ld.map((x) => ({ ...x, url })), crumbs(trail)] };
}

// Plan du site : chaque rubrique des 8 dernières saisons ; pilotes et Grands Prix des saisons déjà gardées dans la base
// (lu sans interroger Jolpica : une demande de robot reste rapide)
export async function seasonSitemap(env, now = Date.now()) {
  const urls = [];
  for (let y = new Date(now).getUTCFullYear(); y >= firstYear(now); y--) {
    urls.push(...Object.keys(SECTION_PATHS).filter((k) => k !== 'gp' && k !== 'predict').map((k) => seasonPath(y, k)));
    const s = JSON.parse(await getRow(env, `season:${y}`) || 'null')?.v;
    if (s?.races?.length) urls.push(...s.drivers.map((d) => seasonPath(y, 'drivers', slug(d.name))), ...s.races.map((r) => seasonPath(y, 'gp', gpSlug(r.name))));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${APP}${u}</loc></url>`).join('\n')}
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
