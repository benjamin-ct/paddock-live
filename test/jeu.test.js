import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIES, FIRST_DAY, parisDay, dailyIndex, hints, mark, stats, shareText, revealed, revealStart } from '../analytics/jeu/game.js';
import { gameData, gamePage, PATHS } from '../analytics/jeu/page.mjs';
import { sitemap } from '../analytics/launch/guides.mjs';

const T = { locale: 'fr-FR', country: 'Pays', length: 'Longueur', turns: 'Virages', first: 'Premier GP de F1', city: 'Ville',
  shareTitle: 'Devine le circuit', num: 'n° {}', shareStreak: '🔥 Série : {} jours', url: 'paddocklive.app/jeu/' };

test('jeu du jour : le jour est celui de Paris (minuit en France, pas en UTC)', () => {
  assert.equal(parisDay(new Date('2026-11-06T12:00:00Z')), FIRST_DAY);
  assert.equal(parisDay(new Date('2026-11-06T22:59:59Z')), FIRST_DAY);   // 23:59:59 à Paris (heure d'hiver)
  assert.equal(parisDay(new Date('2026-11-06T23:00:00Z')), FIRST_DAY + 1);   // minuit à Paris
  assert.equal(parisDay(new Date('2026-07-01T21:59:59Z')) + 1, parisDay(new Date('2026-07-01T22:00:00Z')));   // heure d'été
});

test('jeu du jour : même date = même circuit, jamais deux jours de suite le même, chacun une fois par cycle', () => {
  const n = 38;
  assert.equal(dailyIndex(FIRST_DAY, n), dailyIndex(parisDay(new Date('2026-11-06T08:00:00Z')), n));
  const days = Array.from({ length: 3000 }, (_, i) => dailyIndex(FIRST_DAY + i, n));
  for (const [i, x] of days.entries()) {
    assert.ok(Number.isInteger(x) && x >= 0 && x < n, `jour ${i}`);
    if (i) assert.notEqual(x, days[i - 1], `jours ${i - 1} et ${i}`);
  }
  // Un cycle de n jours (jour multiple de n) : chaque circuit exactement une fois
  const start = Math.ceil(FIRST_DAY / n) * n;
  for (let k = 0; k < 20; k++) {
    const cycle = Array.from({ length: n }, (_, i) => dailyIndex(start + k * n + i, n));
    assert.equal(new Set(cycle).size, n, `cycle ${k}`);
  }
});

test('jeu du jour : indices dans l\'ordre, essais comparés à la réponse', () => {
  const c = { id: 'jp-1962', country: 'Japon', km: 5.807, turns: 18, first: 1987, city: 'Suzuka' };
  assert.deepEqual(hints(c, T), [['Pays', 'Japon'], ['Longueur', '5,807 km'], ['Virages', '18'], ['Premier GP de F1', '1987'], ['Ville', 'Suzuka']]);
  assert.equal(hints({ ...c, km: 7.004 }, { ...T, locale: 'en-US' })[1][1], '7.004 km');
  assert.equal(mark('jp-1962', 'jp-1962'), 'hit');
  assert.equal(mark('it-1953', 'it-1922'), 'near');   // Imola pour Monza : même pays
  assert.equal(mark('gb-1948', 'it-1922'), 'miss');
});

test('jeu du jour : série, meilleure série et texte à partager', () => {
  const d = FIRST_DAY;
  const games = { [d]: { g: ['a'], r: 'w' }, [d + 1]: { g: ['a'], r: 'w' }, [d + 2]: { g: [], r: 'l' }, [d + 3]: { g: ['a'], r: 'w' }, [d + 4]: { g: ['a'], r: 'w' }, [d + 5]: { g: ['a'], r: 'w' } };
  assert.deepEqual(stats(games, d + 5), { played: 6, won: 5, streak: 3, best: 3 });
  assert.equal(stats(games, d + 6).streak, 3);   // pas encore joué aujourd'hui : la série d'hier tient
  assert.equal(stats({ ...games, [d + 6]: { g: ['b'] } }, d + 6).streak, 3);   // partie en cours
  assert.equal(stats(games, d + 7).streak, 0);   // un jour sauté
  assert.equal(stats({ ...games, [d + 6]: { g: [], r: 'l' } }, d + 6).streak, 0);
  assert.deepEqual(stats({}, d), { played: 0, won: 0, streak: 0, best: 0 });
  assert.equal(shareText({ num: 12, marks: ['miss', 'near', 'hit'], won: true, streak: 4, t: T }),
    'Devine le circuit · n° 12 · 3/6\n🟥🟨🟩\n🔥 Série : 4 jours\npaddocklive.app/jeu/');
  assert.equal(shareText({ num: 3, marks: Array(TRIES).fill('miss'), won: false, streak: 0, t: T }).split('\n')[0], 'Devine le circuit · n° 3 · X/6');
});

test('jeu du jour : 40 tracés, indices complets, aucun nom de circuit en double', () => {
  for (const lang of ['fr', 'en']) {
    const data = gameData(lang);
    assert.equal(data.length, 40);
    assert.equal(new Set(data.map((c) => c.name)).size, 40);
    for (const c of data) {
      assert.ok(c.country && c.city && c.first >= 1950 && c.km > 3 && c.km < 7.1 && /^[\d.]+,[\d.]+( [\d.]+,[\d.]+)+$/.test(c.outline), c.id);
      assert.ok(c.turns === null || (c.turns >= 10 && c.turns <= 27), c.id);
    }
    assert.ok(data.filter((c) => c.turns).length >= 38);
  }
  const fr = Object.fromEntries(gameData('fr').map((c) => [c.id, c]));
  assert.equal(fr['jp-1962'].country, 'Japon');
  assert.equal(fr['qa-2004'].km, 5.419);   // longueur officielle (shared/circuits-info.js), pas celle du tracé (5 380 m)
  assert.equal(gameData('en').find((c) => c.id === 'gb-1948').country, 'United Kingdom');
});

test('jeu du jour : pages française et anglaise, crédit MIT, liées entre elles et au plan du site', () => {
  for (const [lang, other] of [['fr', 'en'], ['en', 'fr']]) {
    const html = gamePage(lang);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://paddocklive\\.app/${PATHS[lang]}/">`));
    assert.match(html, new RegExp(`href="/${PATHS[other]}/" hreflang="${other}"`));
    assert.match(html, /bacinger\/f1-circuits/);
    assert.match(html, /MIT/);
    assert.match(html, /<script type="module" src="\/jeu\/app\.js"><\/script>/);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.ok(/<title>([^<]*)<\/title>/.exec(html)[1].length <= 60, lang);
    assert.ok(/<meta name="description" content="([^"]*)"/.exec(html)[1].length <= 155, lang);
    const data = JSON.parse(/<script type="application\/json" id="data">(.*?)<\/script>/s.exec(html)[1]);
    assert.equal(data.circuits.length, 40);
    for (const k of ['num', 'next', 'hit', 'near', 'miss', 'locked', 'win', 'lose', 'played', 'streak', 'shareTitle', 'url']) assert.ok(data.t[k], `${lang} ${k}`);
    assert.match(sitemap(), new RegExp(`<loc>https://paddocklive\\.app/${PATHS[lang]}/</loc>`));
  }
  // Page anglaise sans texte français visible
  const body = gamePage('en').split('<body>')[1].replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<datalist[\s\S]*?<\/datalist>/, '');
  assert.deepEqual(body.split(/<[^>]+>/).map((s) => s.trim()).filter((s) => s !== 'Français' && /[éèàêç]|\b(les|des|pour|avec|dans|ton|ta)\b/.test(s)), []);
});

test('jeu du jour : un quart du tracé au départ, un peu plus à chaque erreur, tout en fin de partie', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((m) => revealed(m, false)), [0.25, 0.4, 0.55, 0.7, 0.85, 0.85]);
  assert.equal(revealed(2, true), 1);
  // Début du morceau visible : le même pour tous le même jour, différent d'un jour à l'autre, dans le tour
  assert.equal(revealStart(FIRST_DAY), revealStart(FIRST_DAY));
  assert.notEqual(revealStart(FIRST_DAY), revealStart(FIRST_DAY + 1));
  for (let d = FIRST_DAY; d < FIRST_DAY + 50; d++) assert.ok(revealStart(d) >= 0 && revealStart(d) < 1);
});

// ---------- Pilotes, difficultés et classement ----------
import { MIX_DAY, LEVELS, MODES, SPECIAL, plan, points, streakBonus, cluesShown, driverHints, teamHints, raceHints, REVEAL } from '../analytics/jeu/game.js';
import { driverData, teamData, raceData } from '../analytics/jeu/page.mjs';
import { jeuApi, nameOk, cleanName, periods } from '../analytics/jeu-board.js';
import fs from 'node:fs';

test('jeu du jour : programme (type, difficulté) le même pour tous, jamais deux jours de suite le même type hors week-end de GP', () => {
  assert.deepEqual(plan(FIRST_DAY), { mode: 'circuit', level: 'medium', race: null });   // parties déjà jouées avant le mélange
  assert.deepEqual(plan(MIX_DAY - 1), { mode: 'circuit', level: 'medium', race: null });
  const days = Array.from({ length: 2000 }, (_, i) => plan(MIX_DAY + i));
  for (const [i, p] of days.entries()) {
    assert.ok(MODES.includes(p.mode) && LEVELS.includes(p.level), `jour ${i}`);
    if (i && !SPECIAL[MIX_DAY + i]) assert.notEqual(p.mode, days[i - 1].mode, `deux fois ${p.mode} au jour ${i}`);
  }
  for (const m of MODES) assert.ok(days.filter((p) => p.mode === m).length > 400, m);
  for (const l of LEVELS) assert.ok(days.filter((p) => p.level === l).length > 550, l);
  // Week-ends de Grand Prix : « qui a gagné ? » sur une course de la liste, qui existe dans les deux langues
  for (const [d, key] of Object.entries(SPECIAL)) {
    assert.deepEqual([plan(Number(d)).mode, plan(Number(d)).race], ['race', key]);
    for (const lang of ['fr', 'en']) assert.ok(raceData(lang).some((r) => r.key === key), `${lang} ${key}`);
  }
});

test('jeu du jour : écuries et courses célèbres (indices complets, vainqueurs dans la liste des pilotes)', () => {
  const T = { tFirst: 'Première saison', tTitles: 'Titres', wins: 'Victoires', nat: 'Pays', tLast: 'Dernière saison', active: 'En activité', initials: 'Initiales',
    grid: 'Départ', gridPos: '{}e sur la grille', pitStart: 'Des stands', rTeam: 'Écurie', titles: 'Titres mondiaux', debut: 'Débuts' };
  for (const lang of ['fr', 'en']) {
    const teams = teamData(lang), races = raceData(lang), drivers = new Set(driverData(lang).map((d) => d.id));
    assert.ok(teams.length >= 20 && races.length >= 30);
    assert.equal(new Set(teams.map((x) => x.name)).size, teams.length);
    for (const c of teams) assert.ok(c.country && c.first >= 1950 && c.last >= c.first, c.id);
    for (const r of races) assert.ok(drivers.has(r.winner) && r.title && r.team && r.grid >= 0, r.key);
  }
  const ferrari = teamData('fr').find((x) => x.id === 'ferrari');
  assert.deepEqual(teamHints(ferrari, T).map((x) => x[1]), ['1950', '16', '251', 'Italie', 'En activité', 'F.']);
  const r = raceData('fr').find((x) => x.key === '2024-21'), max = driverData('fr').find((x) => x.id === 'max_verstappen');
  assert.equal(r.title, 'Grand Prix de São Paulo 2024');
  assert.deepEqual(raceHints(r, max, T).slice(0, 2).map((x) => x[1]), ['17e sur la grille', 'Red Bull']);
});

test('jeu du jour : difficulté (part du tracé, indices du pilote) et points du classement', () => {
  assert.ok(REVEAL.easy[0] > REVEAL.medium[0] && REVEAL.medium[0] > REVEAL.hard[0]);
  assert.equal(revealed(0, false, 'hard'), 0.12);
  assert.equal(revealed(2, true, 'hard'), 1);
  assert.deepEqual([cluesShown(0, false, 'easy'), cluesShown(0, false, 'medium'), cluesShown(0, false, 'hard')], [3, 2, 1]);
  assert.equal(cluesShown(9, false, 'hard'), 6);
  assert.equal(cluesShown(0, true, 'hard'), 6);
  // 10 au départ, -1 par erreur, -2 par joker, au moins 1 si trouvé, fois la difficulté
  assert.equal(points('easy', 0, 0, true), 10);
  assert.equal(points('hard', 0, 0, true), 30);
  assert.equal(points('medium', 2, 1, true), 12);
  assert.equal(points('hard', 5, 5, true), 3);   // au moins 1, fois 3
  assert.equal(points('hard', 5, 0, false), 0);
  assert.deepEqual([0, 1, 3, 5, 9].map(streakBonus), [0, 1, 3, 5, 5]);
});

test('jeu du jour : pilotes (indices complets, noms uniques, nationalités connues), indices dans l\'ordre', () => {
  for (const lang of ['fr', 'en']) {
    const d = driverData(lang);
    assert.ok(d.length >= 40, `${d.length} pilotes`);
    assert.equal(new Set(d.map((x) => x.name)).size, d.length);
    for (const x of d) assert.ok(x.country && x.team && x.first >= 1950 && x.wins >= 0 && x.titles >= 0 && x.flag.length, x.id);
  }
  const ham = driverData('fr').find((x) => x.id === 'hamilton');
  assert.equal(ham.titles, 7);
  const h = driverHints(ham, { debut: 'Débuts', titles: 'Titres', wins: 'Victoires', nat: 'Pays', team: 'Écurie', initials: 'Initiales' });
  assert.deepEqual(h.map((x) => x[0]), ['Débuts', 'Titres', 'Victoires', 'Pays', 'Écurie', 'Initiales']);
  assert.deepEqual(h[0], ['Débuts', '2007']);
  assert.deepEqual(h[5], ['Initiales', 'L. H.']);
  assert.equal(mark('alonso', 'hamilton', (a, b) => a === 'norris' && b === 'hamilton'), 'miss');
  assert.equal(mark('norris', 'hamilton', (a, b) => a === 'norris' && b === 'hamilton'), 'near');
});

test('jeu du jour : pseudos du classement (nettoyés, insultes refusées, faux comptes officiels refusés)', () => {
  assert.equal(cleanName('  <b>Max</b>  33 '), 'bMaxb 33');
  for (const ok of ['Dominique', 'Hitchcock', 'Violette', 'Max33', 'Lé o', 'Scunthorpe', 'Computer', 'Benjypaddock', 'BenjyPaddock']) assert.ok(nameOk(ok), ok);
  for (const bad of ['connard', 'C0nn4rd', 'FDP', 'gros pd', 'Fuck you', 'admin', 'PaddockLive', 'Paddock Live', 'x']) assert.ok(!nameOk(cleanName(bad)), bad);
});

// Base SQLite de Node (22 et plus) habillée comme D1, avec le schéma du serveur
const sqlite = await import('node:sqlite').catch(() => null);
function d1() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../analytics/schema.sql', import.meta.url), 'utf8'));
  return { prepare: (sql) => ({ bind: (...a) => ({ first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => db.prepare(sql).run(...a) }),
    first: async () => db.prepare(sql).get() ?? null, all: async () => ({ results: db.prepare(sql).all() }) }) };
}
test('jeu du jour : périodes des classements (semaine du lundi, mois)', () => {
  const d = parisDay(new Date(Date.UTC(2026, 10, 11, 12)));   // mercredi 11 novembre 2026
  const p = periods(d);
  assert.equal(new Date(p.week[0] * 864e5).toISOString().slice(0, 10), '2026-11-09');   // lundi
  assert.equal(new Date(p.month[0] * 864e5).toISOString().slice(0, 10), '2026-11-01');
  assert.deepEqual(p.today, [d, d]);
});
test('jeu du jour : classement du serveur (un résultat par jour, points, jokers, bonus de série, pseudo réservé, jours refusés)', { skip: !sqlite && 'node:sqlite absent (Node 20)' }, async () => {
  const env = { DB: d1() }, t0 = Date.UTC(2026, 10, 9, 12);
  const at = (k) => t0 + k * 864e5, dayOf = (k) => parisDay(new Date(at(k)));
  const send = (b, k = 0, ip = '1.2.3.4') => jeuApi(new Request('https://paddocklive.app/jeu/api/score', { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(b) }), env, new URL('https://paddocklive.app/jeu/api/score'), { now: at(k) });
  const A = 'a'.repeat(24), B = 'b'.repeat(24), day = dayOf(0), lv = (k) => plan(dayOf(k)).level;
  let r = await send({ uid: A, name: 'Max', day, tries: 2, won: true, jokers: 1 });
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.boards.today.top[0].pts, points(lv(0), 1, 1, true));
  assert.deepEqual(j.mine, { pts: points(lv(0), 1, 1, true), bonus: 0, jokers: 1, tries: 2, won: 1, streak: 1 });
  // Deuxième envoi du même jour : le premier reste
  await send({ uid: A, name: 'Max', day, tries: 1, won: true });
  assert.equal((await send({ uid: B, name: 'max', day, tries: 1, won: true })).status, 409);   // pseudo pris
  j = await (await send({ uid: B, name: 'Leo', day, tries: 6, won: false })).json();
  assert.deepEqual(j.boards.today.top.map((x) => [x.name, x.pts]), [['Max', points(lv(0), 1, 1, true)], ['Leo', 0]]);
  assert.equal(j.boards.today.players, 2);
  assert.deepEqual(j.boards.today.me, { pts: 0, rank: 2 });
  for (const bad of [{ uid: B, name: 'Leo', day: day + 1, tries: 1, won: true }, { uid: B, name: 'Leo', day: day - 2, tries: 1, won: true },
    { uid: B, name: 'Leo', day, tries: 3, won: false }, { uid: 'court', name: 'Leo', day, tries: 1, won: true }, { uid: B, name: 'connard', day, tries: 1, won: true },
    { uid: B, name: 'Leo', day, tries: 1, won: true, jokers: 9 }]) {
    assert.equal((await send(bad)).status, 400, JSON.stringify(bad));
  }
  // Jours suivants : bonus de série (+1 par jour trouvé d'affilée avant, jusqu'à +5), série affichée, classement général
  for (const k of [1, 2]) await send({ uid: A, name: 'Max', day: dayOf(k), tries: 1, won: true }, k);
  j = await (await jeuApi(new Request(`https://paddocklive.app/jeu/api/board?day=${dayOf(2)}&uid=${A}`), env, new URL(`https://paddocklive.app/jeu/api/board?day=${dayOf(2)}&uid=${A}`), { now: at(2) })).json();
  assert.equal(j.mine.bonus, 2);
  assert.equal(j.mine.pts, points(lv(2), 0, 0, true) + 2);
  assert.equal(j.boards.all.top[0].streak, 3);
  assert.equal(j.boards.all.top[0].pts, points(lv(0), 1, 1, true) + points(lv(1), 0, 0, true) + 1 + points(lv(2), 0, 0, true) + 2);
  assert.equal(j.boards.all.players, 2);
  // Un jour sauté : plus de bonus
  r = await send({ uid: A, name: 'Max', day: dayOf(4), tries: 1, won: true }, 4);
  assert.equal((await r.json()).mine.bonus, 0);
});

test('jeu du jour : classement entre amis (groupe créé par un joueur inscrit, lien, classement des seuls membres, sortie)', { skip: !sqlite && 'node:sqlite absent (Node 20)' }, async () => {
  const env = { DB: d1() }, now = Date.UTC(2026, 10, 9, 12), day = parisDay(new Date(now));
  const call = (path, body) => jeuApi(new Request(`https://paddocklive.app${path}`, body ? { method: 'POST', headers: { 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify(body) } : {}), env, new URL(`https://paddocklive.app${path}`), { now });
  const [A, B, C] = ['a', 'b', 'c'].map((x) => x.repeat(24));
  assert.equal((await call('/jeu/api/group', { uid: A, name: 'Potes' })).status, 403);   // pas encore de pseudo
  for (const [uid, name, tries] of [[A, 'Max', 1], [B, 'Leo', 2], [C, 'Zoe', 3]]) await call('/jeu/api/score', { uid, name, day, tries, won: true });
  assert.equal((await call('/jeu/api/group', { uid: A, name: 'connard' })).status, 400);
  const g = (await (await call('/jeu/api/group', { uid: A, name: 'Les potes' })).json()).group;
  assert.match(g.id, /^[a-z0-9]{8}$/);
  assert.deepEqual([g.name, g.members, g.member], ['Les potes', 1, true]);
  assert.equal((await (await call('/jeu/api/group', { uid: C, action: 'join', g: g.id })).json()).group.members, 2);
  let b = await (await call(`/jeu/api/board?day=${day}&uid=${C}&g=${g.id}`)).json();
  assert.deepEqual(b.boards.today.top.map((x) => x.name), ['Max', 'Zoe']);   // Leo n'est pas dans le groupe
  assert.deepEqual(b.boards.today.me.rank, 2);
  assert.equal(b.group.member, true);
  assert.equal((await call(`/jeu/api/board?day=${day}&g=zzzzzzzz`)).status, 404);
  await call('/jeu/api/group', { uid: C, action: 'leave', g: g.id });
  b = await (await call(`/jeu/api/board?day=${day}&g=${g.id}`)).json();
  assert.deepEqual(b.boards.today.top.map((x) => x.name), ['Max']);
  // Envoi d'un résultat avec le lien d'invitation : entrée dans le groupe
  await call('/jeu/api/score', { uid: B, name: 'Leo', day, tries: 2, won: true, g: g.id });
  b = await (await call(`/jeu/api/board?day=${day}&g=${g.id}`)).json();
  assert.deepEqual(b.boards.today.top.map((x) => x.name), ['Max', 'Leo']);
});
