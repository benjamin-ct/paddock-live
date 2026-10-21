import test from 'node:test';
import assert from 'node:assert/strict';
import { bigNews, newsKind, newsKinds, sortNews, newsPost, newsCaptions, shortSummary, isBreaking } from '../shared/social-news.js';
import { slidesFor } from '../shared/social-draw.js';
import { xLength } from '../shared/social.js';
import { newsVideoTiming } from '../shared/social-news-video.js';

const NOW = Date.UTC(2026, 9, 16, 12);
const H = 3600e3;
const it = (o) => ({ id: o.title, cluster: o.title, kind: 'article', cat: 'media', lang: 'en', imp: 1, sources: 1, t: NOW - H, tags: [], summary: '', ...o });

test('posts news : type de nouvelle', () => {
  assert.equal(newsKind({ title: 'Haas sign Ferrari junior Rafael Camara for 2027' }).key, 'transfert');
  assert.equal(newsKind({ title: 'Ten things we learned in Austin' }).key, 'actu');
  assert.equal(newsKind({ title: 'Camara signs multi-year deal with Haas' }).key, 'transfert');
  assert.equal(newsKind({ title: 'Russell handed grid penalty for new engine' }).label, 'PÉNALITÉ');
  // Livrées spéciales (toutes langues), gardées même peu reprises
  for (const t of ['Red Bull reveals special livery for Las Vegas Grand Prix', 'Alpine dévoile une livrée spéciale pour Mexico', 'Ferrari svela la livrea speciale per Monza', 'Haas mit Sonderlackierung in Austin']) assert.equal(newsKind({ title: t }).label, 'LIVRÉE');
  assert.equal(bigNews([{ id: 'l', title: 'McLaren unveil one-off look for Silverstone', t: Date.now(), imp: 0 }]).length, 1);
  // Tenues des pilotes (combinaison, casque spécial) ; un accident où le casque est cité reste un accident
  for (const t of ['Hamilton to wear special helmet design for Mexico', 'Norris dévoile un casque spécial pour Silverstone', 'Alpine dévoile une combinaison spéciale', 'Verstappen mit Sonderhelm in Zandvoort']) assert.equal(newsKind({ title: t }).label, 'TENUE');
  assert.equal(newsKind({ title: 'Stroll crash: helmet damaged after FP1 accident' }).key, 'accident');
  assert.equal(bigNews([{ id: 'h', title: 'Leclerc unveils tribute helmet for Monza', t: Date.now(), imp: 0 }]).length, 1);
  assert.equal(newsKind({ title: 'Bottas annonce sa retraite' }).key, 'depart');
  assert.equal(newsKind({ title: 'Calendar update', cat: 'official' }).key, 'officiel');
});

test('posts news : grosses news seulement, un seul article par sujet (même dans deux langues)', () => {
  const items = [
    it({ title: 'Rafael Camara signs multi-year deal with Haas', cat: 'official', sources: 9, t: NOW - 20 * H }),
    it({ title: 'Why Haas decided to risk promoting rookie Camara', cat: 'official', imp: 2, t: NOW - 20 * H }),
    it({ title: 'Rafael Câmara s\'engage avec Haas', lang: 'fr', sources: 7, t: NOW - 20 * H }),
    it({ title: 'Mekies extends Red Bull contract', imp: 2, sources: 6, t: NOW - 30 * H }),
    it({ title: 'Ten things we learned from practice', imp: 0, sources: 5 }),
    it({ title: 'Watch: onboard lap', kind: 'video', imp: 3 }),
    it({ title: 'Old contract news', imp: 3, t: NOW - 60 * H }),
  ];
  const big = bigNews(items, { now: NOW });
  assert.deepEqual(big.map((x) => x.title), ['Rafael Camara signs multi-year deal with Haas', 'Mekies extends Red Bull contract']);
  assert.equal(big[0].sources, 17);   // articles des trois sujets réunis
  assert.equal(bigNews(items, { now: NOW, all: true }).length, 3);
});

test('posts news : données du post et légendes', () => {
  const item = it({ title: 'Norris signs new McLaren contract', tags: ['NOR', 'mclaren'], sources: 4, link: 'https://x.test/a' });
  const dl = { 4: { Tla: 'NOR', FirstName: 'Lando', LastName: 'Norris', TeamName: 'McLaren', TeamColour: 'FF8000', HeadshotUrl: 'https://h.test/n.png' } };
  const d = newsPost(item, { title: 'Norris prolonge avec McLaren', summary: 'Première phrase. Deuxième phrase. Troisième phrase très longue '.repeat(5), driverList: dl, sourceName: 'Autosport' });
  assert.equal(d.badge.key, 'transfert');
  // Portrait officiel de la saison (grand format), même sans la liste des pilotes de la séance
  assert.match(d.drivers[0].headshot, /w_800.*\/2026mclarenlannor01right\.webp$/);
  const other = newsPost(it({ title: 'Lindblad extends with Racing Bulls', tags: ['LIN'] }), { title: 'Lindblad prolonge', summary: 'Une phrase.', sourceName: 'X' });
  assert.match(other.drivers[0].headshot, /\/2026racingbullsarvlin01right\.webp$/);
  assert.equal(other.drivers[0].color, '#6692FF');   // couleur d'écurie de la saison
  assert.equal(d.color, '#FF8000');
  assert.ok(d.summary.length <= 280);
  assert.deepEqual(slidesFor(d), ['news']);
  const c = newsCaptions(d, '@moi');
  assert.match(c.instagram, /^✍️ TRANSFERT \| Norris prolonge avec McLaren\n\nPremière phrase\./);
  assert.match(c.instagram, /📰 Source : Autosport\n/);
  assert.doesNotMatch(c.instagram, /repris par/);
  assert.match(c.instagram, /#LandoNorris #McLaren/);
  assert.ok(xLength(c.x) <= 280 && c.threads.length <= 500);
  // Lien de l'article : Facebook, Threads et X, pas Instagram (non cliquable)
  for (const k of ['facebook', 'threads', 'x']) assert.ok(c[k].includes('https://x.test/a'), k);
  assert.ok(!c.instagram.includes('https://x.test/a'));
  assert.match(c.facebook, /📰 Source : Autosport\n🔗 Lire l'article : https:\/\/x\.test\/a/);
  // Titre très long et lien très long : X tient en 280 (lien compté 23), lien gardé
  const long = newsCaptions({ ...d, title: 'Très long titre '.repeat(30), link: `https://x.test/${'a'.repeat(200)}` }, '@moi');
  assert.ok(xLength(long.x) <= 280, String(xLength(long.x)));
  assert.ok(long.x.includes('a'.repeat(200)));
  assert.ok(long.threads.length <= 500 && long.threads.includes('a'.repeat(200)));
  assert.equal(xLength('Voir https://exemple.test/un/lien/tres/long/vraiment'), 28);
  assert.equal(shortSummary('Court.'), 'Court.');
});

test('posts news : tri à la une ou récentes, déjà publiées en dernier, types présents', () => {
  const a = { id: 'a', title: 'Vieille grosse news', score: 9, t: NOW - 40 * H };
  const b = { id: 'b', title: 'Russell handed grid penalty', score: 7, t: NOW - 2 * H };
  const c = { id: 'c', title: 'Norris signs new McLaren contract', score: 8, t: NOW - 10 * H };
  const d = { id: 'd', title: 'Haas sign Camara', score: 9, t: NOW - H };
  const ids = (l) => l.map((x) => x.id).join('');
  // À la une : la fraîcheur départage (la vieille news de 40 h passe derrière)
  assert.equal(ids(sortNews([a, b, c, d], { now: NOW })), 'dcba');
  assert.equal(ids(sortNews([a, b, c, d], { by: 'recent', now: NOW })), 'dbca');
  // Déjà publiée : en dernier, quel que soit l'ordre
  assert.equal(ids(sortNews([a, b, c, d], { now: NOW, done: (x) => x.id === 'd' })), 'cbad');
  const kinds = newsKinds([a, b, c, d]);
  assert.deepEqual(kinds.map((k) => [k.key, k.n]), [['transfert', 2], ['actu', 1], ['penalite', 1]]);
});

test('vidéo Breaking news : durée selon le texte, 4 points clés au plus', () => {
  const d = newsPost({ title: 'x', tags: ['NOR'], t: NOW }, { title: 'Norris prolonge avec McLaren', summary: 'Contrat signé jusqu\'en 2030.', points: ['Un', 'Deux points', 'Trois', 'Quatre', 'Cinq'] });
  const tm = newsVideoTiming(d);
  assert.equal(tm.pts.length, 4);
  assert.equal(tm.starts.length, 6);
  assert.ok(tm.main >= 5 && tm.main <= 9);
  assert.ok(Math.abs(tm.duration - (1.8 + 5 + 4 * 3 + 2.8)) < 1e-9);   // textes courts : durées minimales
  const court = newsVideoTiming({ ...d, points: [] });
  assert.equal(court.starts.length, 2);
  assert.ok(court.duration < 13);
});

test('très grosse info (Breaking news) : importance maximale, ou reprise partout et importante', () => {
  const it = (o) => ({ title: 'Some news', summary: '', t: NOW, ...o });
  assert.equal(isBreaking(it({ imp: 3 })), true);
  assert.equal(isBreaking(it({ imp: 2, sources: 12 })), true);
  assert.equal(isBreaking(it({ imp: 1, sources: 30, title: 'Camara signs for Haas' })), true);   // transfert
  assert.equal(isBreaking(it({ imp: 1, sources: 35, title: 'Horner takes swipe at Steiner' })), false);
  assert.equal(isBreaking(it({ imp: 1, sources: 13, title: 'Russell handed engine penalty' })), true);   // pénalité
  assert.equal(isBreaking(it({ imp: 1, sources: 6, title: 'Russell handed engine penalty' })), false);
  assert.equal(isBreaking(it({ imp: 2, sources: 4 })), false);
  assert.equal(newsPost(it({ imp: 3, tags: [] }), {}).breaking, true);
});

test('autres articles sur la même nouvelle : un par média, vidéos et liens non https exclus', async () => {
  const { similarArticles } = await import('../shared/social-news.js');
  const t = Date.parse('2026-10-20T10:00:00Z');
  const it = { id: 'a', src: 'sky', cluster: 'c1', title: 'Cadillac reveals special livery for Austin', link: 'https://sky.test/a', t };
  const items = [it,
    { id: 'b', src: 'f1', cluster: 'c1', title: 'Cadillac unveil Austin livery', link: 'https://f1.test/b', t: t + 3600e3 },
    { id: 'c', src: 'f1', cluster: 'c1', title: 'Cadillac livery gallery', link: 'https://f1.test/c', t: t + 7200e3 },
    { id: 'd', src: 'yt', cluster: 'c1', title: 'Cadillac livery video', link: 'https://yt.test/d', t, kind: 'video' },
    { id: 'e', src: 'ms', title: 'Cadillac special livery for Austin revealed', link: 'https://ms.test/e', t: t + 1800e3 },
    { id: 'f', src: 'x', cluster: 'c1', title: 'Cadillac', link: 'http://x.test/f', t },
    { id: 'g', src: 'rt', cluster: 'c9', title: 'Verstappen wins in Mexico', link: 'https://rt.test/g', t }];
  assert.deepEqual(similarArticles(it, items).map((x) => x.id), ['e', 'b']);
});
