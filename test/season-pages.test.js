import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonSsr, seasonSitemap, legacySeasonUrl, parseEnSeasonPath, enSeasonPath, seasonRewriter, EN_PATHS } from '../analytics/season-pages.js';
import * as shared from '../shared/season-urls.js';
import { seasonPath, parseSeasonPath, seasonTitle, gpSlug, slug } from '../shared/season-urls.js';
import { STATS_VERSION } from '../shared/race-stats.js';

const now = Date.parse('2026-10-26T12:00:00Z');
const res = (pos, name, team, extra = {}) => ({ pos, posText: String(pos), name, last: name.split(' ').pop(), team, teamId: team.toLowerCase().replace(/ /g, '_'), points: [25, 18, 15][pos - 1] || 0, grid: pos + 1, laps: 71, time: pos === 1 ? '1:40:12.345' : '+5.123', status: 'Finished', ...extra });
const SEASON = {
  races: [
    { round: 19, name: 'Mexico City Grand Prix', circuit: 'Autódromo Hermanos Rodríguez', locality: 'Mexico City', country: 'Mexico', date: '2026-10-25T20:00:00Z', sprint: false,
      sessions: [], results: [res(1, 'Lando Norris', 'McLaren'), res(2, 'Max Verstappen', 'Red Bull'), res(3, 'Oscar <Piastri>', 'McLaren', { posText: 'R', time: null, status: 'Engine', points: 0 })],
      quali: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', teamId: 'mclaren', q: [77.1, 76.5, 75.586] }], sprintResults: [] },
    { round: 20, name: 'São Paulo Grand Prix', circuit: 'Interlagos', locality: 'São Paulo', country: 'Brazil', date: '2026-11-08T17:00:00Z', sprint: true,
      sessions: [{ label: 'EL1', t: '2026-11-06T14:30:00Z' }, { label: 'Course', t: '2026-11-08T17:00:00Z' }], results: [], quali: [], sprintResults: [] },
  ],
  drivers: [{ pos: 1, name: 'Lando Norris', team: 'McLaren', teamId: 'mclaren', points: 357, wins: 7 }, { pos: 2, name: 'Max Verstappen', team: 'Red Bull', teamId: 'red_bull', points: 300, wins: 5 }],
  constructors: [{ pos: 1, name: 'McLaren', id: 'mclaren', points: 700, wins: 12 }],
};
function fakeEnv() {
  const rows = new Map([
    ['season:2026', JSON.stringify({ at: now, v: SEASON })],
    ['racestats:2026:19', JSON.stringify({ v: STATS_VERSION, drivers: [{ tla: 'NOR', name: 'Lando Norris', last: 'Norris', team: 'McLaren', stops: [{ lap: 30, stop: 2.4, lane: 22 }], stopCount: 1 }], profile: {} })],
    ['racedhl:2026:19', JSON.stringify({ rows: [{ team: 'McLaren', last: 'Norris', time: 2.17, lap: 30 }] })],
  ]);
  return { DB: { prepare: () => ({ bind: (k) => ({ first: async () => (rows.has(k) ? { v: rows.get(k) } : null) }) }) } };
}
const ssr = (path) => seasonSsr(fakeEnv(), parseSeasonPath(path) || parseEnSeasonPath(path), { now });

test('Saison : adresses des rubriques, dans un sens et dans l\'autre', () => {
  assert.equal(seasonPath(2026), '/saison/2026/');
  assert.equal(seasonPath(2026, 'pits'), '/saison/2026/arrets-aux-stands/');
  assert.equal(seasonPath(2026, 'drivers', 'lando-norris'), '/saison/2026/pilotes/lando-norris/');
  assert.equal(seasonPath(2026, 'gp', gpSlug('United States Grand Prix')), '/saison/2026/grand-prix/etats-unis/');
  assert.deepEqual(parseSeasonPath('/saison/2026/pilotes/lando-norris/'), { year: 2026, section: 'drivers', item: 'lando-norris' });
  assert.deepEqual(parseSeasonPath('/saison/2026/'), { year: 2026, section: 'home', item: null });
  assert.deepEqual(parseSeasonPath('/saison/'), { year: null, section: 'home', item: null });
  for (const bad of ['/saison/2026/inconnu/', '/saison/2026/classements/x/', '/saison/2026/grand-prix/', '/saison/2026', '/live/']) assert.equal(parseSeasonPath(bad), null, bad);
  assert.equal(slug('Sergio Pérez'), 'sergio-perez');
  assert.equal(seasonTitle(2026, 'gp', 'Mexico City Grand Prix', false), 'Grand Prix de Mexico 2026 : programme');
});

test('Saison : premier contenu de chaque rubrique écrit par le serveur (moteurs de recherche)', async () => {
  const home = await ssr('/saison/2026/');
  assert.equal(home.url, 'https://app.paddocklive.app/saison/2026/');
  assert.equal(home.title, 'Saison 2026 de F1 : classements, calendrier et résultats');
  assert.match(home.html, /<a href="\/saison\/2026\/pilotes\/lando-norris\/"><b>Lando Norris<\/b><\/a>/);
  assert.match(home.html, /<a href="\/saison\/2026\/grand-prix\/mexico\/">Mexico<\/a>/);
  assert.match(home.html, /<a href="\/saison\/2026\/arrets-aux-stands\/">Arrêts aux stands F1 2026/);   // toutes les rubriques en liens

  const gp = await ssr('/saison/2026/grand-prix/mexico/');
  assert.equal(gp.title, 'Grand Prix de Mexico 2026 : résultats');
  assert.match(gp.desc, /vainqueur Lando Norris, pole Lando Norris/);
  assert.match(gp.html, /<td>—<\/td><td><a href="\/saison\/2026\/pilotes\/oscar-piastri\/"><b>Oscar &lt;Piastri&gt;<\/b><\/a><\/td><td>McLaren<\/td><td>Abandon<\/td>/);
  assert.match(gp.html, /1:15\.586/);
  assert.match(gp.html, /<td>2,17 s<\/td>/);   // arrêt DHL au centième
  assert.match(gp.html, /Copyright © DHL International GmbH/);
  const ev = gp.ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual([ev.startDate, ev.location.name, ev.url], ['2026-10-25T20:00:00Z', 'Autódromo Hermanos Rodríguez', 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/']);
  // Champs conseillés par Google (Search Console : « Améliorer l'apparence des éléments »)
  assert.equal(ev.endDate, '2026-10-25T22:00:00.000Z');
  assert.equal(ev.description, gp.desc);
  assert.match(ev.image, /^https:\/\/paddocklive\.app\/.+\.png$/);
  assert.equal(ev.organizer.name, 'Formula 1');
  assert.deepEqual(ev.performer.map((x) => x.name), ['Lando Norris', 'Max Verstappen', 'Oscar <Piastri>']);
  const next = (await ssr('/saison/2026/grand-prix/sao-paulo/')).ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual([next.startDate, next.performer.length], ['2026-11-06T14:30:00Z', 2]);   // 1re séance ; pilotes de la saison avant la course
  assert.match((await ssr('/saison/2026/grand-prix/sao-paulo/')).html, /Programme du week-end/);

  const d = await ssr('/saison/2026/pilotes/lando-norris/');
  assert.equal(d.title, 'Lando Norris : saison 2026 de F1, résultats et classement');
  assert.match(d.html, /1er du championnat avec 357 points, 7 victoires · McLaren/);
  assert.match(d.html, /<td>19<\/td><td><a href="\/saison\/2026\/grand-prix\/mexico\/">Mexico<\/a><\/td><td>P1<\/td><td>P2<\/td><td>P1<\/td><td>25<\/td>/);
  assert.equal(d.ld.find((x) => x['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, 'https://app.paddocklive.app/saison/2026/pilotes/lando-norris/');

  assert.equal((await ssr('/saison/2026/classements/')).title, 'Classements F1 2026 : pilotes et constructeurs');
  assert.match((await ssr('/saison/2026/arrets-aux-stands/')).desc, /immobilisations les plus rapides/);
  // Inconnu : 404 (pilote, Grand Prix, année hors des 8 saisons de l'appli)
  assert.equal(await ssr('/saison/2026/pilotes/inconnu/'), null);
  assert.equal(await ssr('/saison/2026/grand-prix/inconnu/'), null);
  assert.equal(await ssr('/saison/2018/'), null);
});

test('Saison : plan du site et anciennes pages publiques redirigées vers la version web', async () => {
  const map = await seasonSitemap(fakeEnv(), now);
  for (const u of ['/saison/2026/', '/saison/2026/classements/', '/saison/2026/pilotes/lando-norris/', '/saison/2026/grand-prix/sao-paulo/', '/saison/2019/calendrier/']) assert.ok(map.includes(`<loc>https://app.paddocklive.app${u}</loc>`), u);
  assert.ok(!map.includes('/saison/2018/') && !map.includes('/pronostics/'));
  // Date de mise à jour seulement quand elle est sûre : jour de la course courue (Grand Prix), de la dernière course (rubriques)
  assert.ok(map.includes('<loc>https://app.paddocklive.app/saison/2026/grand-prix/mexico/</loc><lastmod>2026-10-25</lastmod>'));
  assert.ok(map.includes('<loc>https://app.paddocklive.app/saison/2026/classements/</loc><lastmod>2026-10-25</lastmod>'));
  assert.ok(map.includes('<loc>https://app.paddocklive.app/saison/2026/grand-prix/sao-paulo/</loc></url>'), 'Grand Prix pas encore couru : sans date');
  assert.ok(!map.includes('<loc>https://app.paddocklive.app/saison/2019/calendrier/</loc><lastmod>'), 'saison absente de la base : sans date');
  for (const u of ['/en/season/2026/', '/en/season/2026/standings/', '/en/season/2026/drivers/lando-norris/', '/en/season/2026/grand-prix/mexico-city/', '/en/season/2019/calendar/']) assert.ok(map.includes(`<loc>https://app.paddocklive.app${u}</loc>`), u);
  assert.ok(!map.includes('/bilan/') && !map.includes('/duels/'), 'rubriques au contenu de l\'accueil : pas dans le plan du site');
  // 1er janvier 2027 : saison pas encore commencée, pas dans le plan du site
  const jan = await seasonSitemap(fakeEnv(), Date.parse('2027-01-01T00:30:00Z'));
  assert.ok(!jan.includes('/saison/2027/') && jan.includes('/saison/2026/classements/'));
  const old = (p) => legacySeasonUrl(fakeEnv(), new URL(`https://paddocklive.app${p}`));
  assert.equal(await old('/saison/'), 'https://app.paddocklive.app/saison/');
  assert.equal(await old('/saison/2026/mexico/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/en/season/2026/mexico-city/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/en/season/2026/drivers/lando-norris/'), 'https://app.paddocklive.app/saison/2026/pilotes/lando-norris/');
  assert.equal(await old('/saison/2026/ecuries/mclaren/'), 'https://app.paddocklive.app/saison/2026/classements/');
  assert.equal(await old('/en/season/2026/inconnu/'), 'https://app.paddocklive.app/saison/2026/resultats/');
  assert.equal(await old('/saison/2026/grand-prix/mexico/'), 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/');
  assert.equal(await old('/autre/'), null);
});

test('Saison en anglais : adresses /en/season/…, contenu en anglais, adresses réciproques des deux langues', async () => {
  assert.equal(enSeasonPath(2026, 'pits'), '/en/season/2026/pit-stops/');
  assert.deepEqual(parseEnSeasonPath('/en/season/2026/grand-prix/mexico-city/'), { year: 2026, section: 'gp', item: 'mexico-city', lang: 'en' });
  assert.deepEqual(parseEnSeasonPath('/en/season/'), { year: null, section: 'home', item: null, lang: 'en' });
  for (const bad of ['/en/season/2026/classements/', '/en/season/2026/grand-prix/', '/en/season/2026/standings/x/', '/saison/2026/']) assert.equal(parseEnSeasonPath(bad), null, bad);
  // Adresses françaises inchangées : pas lues comme anglaises, et l'inverse
  assert.equal(parseSeasonPath('/en/season/2026/'), null);

  const gp = await ssr('/en/season/2026/grand-prix/mexico-city/');
  assert.equal(gp.url, 'https://app.paddocklive.app/en/season/2026/grand-prix/mexico-city/');
  assert.equal(gp.title, 'Mexico City Grand Prix 2026: results');
  assert.equal(gp.lang, 'en');
  assert.deepEqual(gp.alt, { fr: 'https://app.paddocklive.app/saison/2026/grand-prix/mexico/', en: gp.url });
  assert.deepEqual(gp.app, { section: 'gp', year: 2026, item: 'mexico' });   // rubrique ouverte par l'appli (noms français)
  assert.match(gp.html, /^<h1 class="sz-ssr-title">Mexico City Grand Prix 2026: results<\/h1><p class="muted small"><a href="\/saison\/2026\/grand-prix\/mexico\/" hreflang="fr" lang="fr">Version française<\/a><\/p>/);
  assert.match(gp.html, /Round 19 · October 25, 2026 · Autódromo Hermanos Rodríguez/);
  assert.match(gp.html, /<a href="\/en\/season\/2026\/drivers\/oscar-piastri\/"><b>Oscar &lt;Piastri&gt;<\/b><\/a><\/td><td>McLaren<\/td><td>Retired<\/td>/);
  assert.match(gp.html, /<td>2\.17 s<\/td>/);
  assert.match(gp.html, /<a href="\/en\/season\/2026\/grand-prix\/sao-paulo\/">São Paulo GP →<\/a>/);
  assert.doesNotMatch(gp.html, /href="\/saison\/(?!2026\/grand-prix\/mexico\/")/, 'liens internes vers les pages anglaises');
  const ev = gp.ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual([ev.name, ev.inLanguage, ev.url], ['Mexico City Grand Prix 2026', 'en', gp.url]);
  assert.equal(gp.ld.find((x) => x['@type'] === 'WebPage').inLanguage, 'en');
  const next = await ssr('/en/season/2026/grand-prix/sao-paulo/');
  assert.match(next.html, /Weekend schedule \(UTC\).*<td>FP1<\/td><td>Friday, November 6 at 14:30<\/td>.*<td>Race<\/td>/);

  const d = await ssr('/en/season/2026/drivers/lando-norris/');
  assert.equal(d.title, 'Lando Norris: 2026 F1 season results');
  assert.match(d.html, /1st in the championship with 357 points, 7 wins · McLaren/);
  assert.match(d.desc, /^Lando Norris's 2026 Formula 1 season: 1st in the championship/);
  assert.equal(d.ld.find((x) => x['@type'] === 'BreadcrumbList').itemListElement[1].name, '2026 season');
  assert.equal((await ssr('/en/season/2026/standings/')).title, 'F1 2026 standings: drivers and constructors');
  assert.match((await ssr('/en/season/2026/')).html, /<a href="\/en\/season\/2026\/pit-stops\/">F1 2026 pit stops/);
  // Page française : lien et adresses vers l'anglais ; inconnu : 404
  const fr = await ssr('/saison/2026/grand-prix/mexico/');
  assert.equal(fr.alt.en, gp.url);
  assert.match(fr.html, /<a href="\/en\/season\/2026\/grand-prix\/mexico-city\/" hreflang="en" lang="en">English version<\/a>/);
  assert.equal(await ssr('/en/season/2026/grand-prix/mexico/'), null);
  assert.equal(await ssr('/en/season/2026/drivers/inconnu/'), null);
  assert.equal(await ssr('/en/season/2018/'), null);
});

test('Saison : calendrier en liste d\'événements (SportsEvent de chaque Grand Prix, comme sa page)', async () => {
  const cal = await ssr('/saison/2026/calendrier/');
  const evs = cal.ld.filter((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual(evs.map((x) => x.url), ['https://app.paddocklive.app/saison/2026/grand-prix/mexico/', 'https://app.paddocklive.app/saison/2026/grand-prix/sao-paulo/']);
  const page = (await ssr('/saison/2026/grand-prix/mexico/')).ld.find((x) => x['@type'] === 'SportsEvent');
  assert.deepEqual(evs[0], page);
  assert.equal((await ssr('/saison/2026/resultats/')).ld.filter((x) => x['@type'] === 'SportsEvent').length, 0);
});

// HTMLRewriter de Cloudflare remplacé : règles gardées, appliquées à de faux éléments
class FakeRewriter {
  constructor() { this.rules = []; FakeRewriter.last = this; }
  on(sel, h) { this.rules.push([sel, h]); return this; }
  transform(res) { return res; }
  run(sel, tagName = 'div') {
    const e = { tagName, attrs: {}, html: '', setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, setInnerContent(c) { this.html = c; }, append(c) { this.html += c; } };
    for (const [s, h] of this.rules) if (s === sel) h.element(e);
    return e;
  }
}

test('Saison : page écrite autour de l\'appli (langue, hreflang, un seul H1, titre de 60 caractères au plus)', async () => {
  globalThis.HTMLRewriter = FakeRewriter;
  try {
    const en = seasonRewriter(await ssr('/en/season/2026/grand-prix/mexico-city/'));
    assert.equal(en.run('html').attrs.lang, 'en');
    const head = en.run('head').html;
    assert.match(head, /<link rel="alternate" hreflang="fr" href="https:\/\/app\.paddocklive\.app\/saison\/2026\/grand-prix\/mexico\/">/);
    assert.match(head, /<link rel="alternate" hreflang="en" href="https:\/\/app\.paddocklive\.app\/en\/season\/2026\/grand-prix\/mexico-city\/">/);
    assert.match(head, /<link rel="alternate" hreflang="x-default" href="https:\/\/app\.paddocklive\.app\/saison\/2026\/grand-prix\/mexico\/">/);
    assert.match(head, /"inLanguage":"en"/);
    assert.equal(en.run('link[rel="canonical"]').attrs.href, 'https://app.paddocklive.app/en/season/2026/grand-prix/mexico-city/');
    assert.equal(en.run('meta[name="twitter:title"]').attrs.content, 'Mexico City Grand Prix 2026: results');
    assert.equal(en.run('title').html, 'Mexico City Grand Prix 2026: results · Paddock Live');
    const sz = en.run('#szContent');
    assert.deepEqual([sz.attrs['data-sz-section'], sz.attrs['data-sz-year'], sz.attrs['data-sz-item']], ['gp', '2026', 'mexico']);
    assert.equal(en.run('h1.hm-hello', 'h1').tagName, 'p');   // H1 de la coquille de l'appli : paragraphe
    const fr = seasonRewriter(await ssr('/saison/2026/pilotes/lando-norris/'));
    assert.equal(fr.run('html').attrs.lang, undefined);
    assert.match(fr.run('head').html, /hreflang="en" href="https:\/\/app\.paddocklive\.app\/en\/season\/2026\/drivers\/lando-norris\/"/);
    assert.equal(fr.run('#szContent').attrs['data-sz-section'], undefined);
    // Titre trop long pour Google avec « · Paddock Live » : sans
    assert.equal(fr.run('title').html, 'Lando Norris : saison 2026 de F1, résultats et classement');
    // Saison indisponible (pas de contenu) : coquille de l'appli inchangée
    assert.equal(seasonRewriter({ url: 'x', title: 't', desc: 'd' }).run('h1.hm-hello', 'h1').tagName, 'h1');
  } finally { delete globalThis.HTMLRewriter; }
});

test('Saison en anglais : servie sur app.paddocklive.app, anciennes adresses de paddocklive.app inchangées', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  // Saison gardée à l'instant (rien demandé à Jolpica : aucun appel réseau, fetch coupé)
  const y = new Date().getUTCFullYear(), row = JSON.stringify({ at: Date.now(), v: SEASON });
  const env = { DB: { prepare: () => ({ bind: (k) => ({ first: async (col) => (k === `season:${y}` ? (col ? row : { v: row }) : null) }) }) },
    ASSETS: { fetch: async (req) => new Response(`site:${new URL(req.url).pathname}`) } };
  const ctx = { waitUntil() {} };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('pas de réseau dans les tests'); };
  globalThis.HTMLRewriter = FakeRewriter;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  try {
    let r = await worker.fetch(new Request(`https://app.paddocklive.app/en/season/${y}/standings/`), env, ctx);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'site:/live/');
    assert.equal(FakeRewriter.last.run('html').attrs.lang, 'en');
    assert.match(FakeRewriter.last.run('#szContent').html, new RegExp(`^<h1 class="sz-ssr-title">F1 ${y} standings: drivers and constructors</h1>`));
    assert.equal((await worker.fetch(new Request(`https://app.paddocklive.app/en/season/${y}/classements/`), env, ctx)).status, 404);
    r = await worker.fetch(new Request('https://app.paddocklive.app/en/season/'), env, ctx);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), `https://app.paddocklive.app/en/season/${y}/`);
    r = await worker.fetch(new Request(`https://paddocklive.app/en/season/${y}/mexico-city/`), env, ctx);
    assert.deepEqual([r.status, r.headers.get('location')], [301, `https://app.paddocklive.app/saison/${y}/grand-prix/mexico/`]);
  } finally { delete globalThis.HTMLRewriter; delete globalThis.caches; globalThis.fetch = oldFetch; }
});

test('Saison en anglais : l\'appli (shared/season-urls.js) tient les mêmes adresses et titres que le serveur', async () => {
  assert.deepEqual(shared.EN_PATHS, EN_PATHS);
  for (const [y, sec, item] of [[2026, 'home'], [2026, 'pits'], [2026, 'drivers', 'lando-norris'], [2025, 'gp', 'mexico-city']]) assert.equal(shared.enSeasonPath(y, sec, item), enSeasonPath(y, sec, item));
  for (const path of ['/en/season/', '/en/season/2026/', '/en/season/2026/grand-prix/mexico-city/', '/en/season/2026/standings/x/', '/saison/2026/']) assert.deepEqual(shared.parseEnSeasonPath(path), parseEnSeasonPath(path), path);
  // Titres : ceux des pages du serveur, « · Paddock Live » seulement dans 60 caractères
  for (const path of ['/en/season/2026/standings/', '/en/season/2026/calendar/', '/en/season/2026/grand-prix/mexico-city/', '/en/season/2026/drivers/lando-norris/']) {
    const p = parseEnSeasonPath(path);
    const page = await ssr(path);
    const race = SEASON.races.find((r) => shared.enGpSlug(r.name) === p.item);
    const name = p.section === 'drivers' ? 'Lando Norris' : race?.name;
    assert.equal(shared.enSeasonTitle(p.year, p.section, name, !!race?.results.length), page.title, path);
  }
  assert.equal(shared.tabTitle('F1 2026 calendar'), 'F1 2026 calendar · Paddock Live');
  const long = 'F1 2026 destructors\' championship: crash damage and more';
  assert.equal(shared.tabTitle(long), long);
  assert.equal(shared.enGpSlug('Mexico City Grand Prix'), 'mexico-city');
});

test('Saison : page publique de la grille de la saison suivante (shared/grid-next.js)', async () => {
  const { GRID_NEXT } = await import('../shared/grid-next.js');
  const y = GRID_NEXT.year - 1;
  const fr = await ssr(`/saison/${y}/grille/`);
  assert.equal(fr.title, `Grille F1 ${GRID_NEXT.year} : pilotes confirmés et baquets à confirmer`);
  assert.equal(fr.title, seasonTitle(y, 'grid'));
  assert.equal(fr.alt.en, `https://app.paddocklive.app/en/season/${y}/grid/`);
  assert.equal((fr.html.match(/<tr><td>/g) || []).length, 22);
  assert.match(fr.html, /<td><b>McLaren<\/b><\/td><td><b>Lando Norris<\/b><\/td><td>Confirmé<\/td><td>29 août 2026 · <a href="https:\/\/www\.mclaren\.com\/[^"]+" rel="noopener">mclaren\.com<\/a><\/td>/);
  assert.match(fr.html, /<td><b>Mercedes<\/b><\/td><td>—<\/td><td>À confirmer<\/td><td><\/td>/);
  assert.doesNotMatch(fr.html, /déclaration de/);
  assert.match(fr.html, /Rafael Câmara remplace Esteban Ocon/);
  assert.match(fr.html, new RegExp(`<a href="/saison/${y}/grille/">`));   // dans la liste des rubriques
  const en = await ssr(`/en/season/${y}/grid/`);
  assert.equal(en.title, shared.enSeasonTitle(y, 'grid'));
  assert.match(en.html, /<td>To be confirmed<\/td>/);
  // Autre saison : pas de grille (404), ni de lien vers elle
  assert.equal(await ssr('/saison/2025/grille/'), null);
  assert.doesNotMatch((await ssr('/saison/2025/')).html || '', /grille/);
  assert.ok((await seasonSitemap(fakeEnv(), now)).includes(`<loc>https://app.paddocklive.app/saison/${y}/grille/</loc><lastmod>${GRID_NEXT.updated}</lastmod>`));
});
