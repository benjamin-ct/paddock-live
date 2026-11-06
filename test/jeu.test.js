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
    assert.equal((html.match(/<h1>/g) || []).length, 1);
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
