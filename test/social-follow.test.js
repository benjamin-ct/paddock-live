import test from 'node:test';
import assert from 'node:assert/strict';
import { slidesFor, pointPages, slideName } from '../shared/social-draw.js';
import { creditCaptions, followCaptions, followReason } from '../shared/social-follow.js';
import { newsPost, newsCaptions, cleanPoints } from '../shared/social-news.js';
import { xLength } from '../shared/social.js';

const race = { kind: 'race', rows: [{}], facts: [{}], champ: null, summary: { paragraphs: [] } };
const item = { id: 'n1', title: 'Hamilton extends Ferrari deal', summary: 'Ferrari has extended Hamilton.', tags: ['HAM'], src: 'f1', t: Date.UTC(2026, 9, 16), link: 'https://www.formula1.com/a/1', lang: 'en', sources: 1 };

test('abonnement : dernière image des carrousels et du format X, pas sur une image seule', () => {
  assert.deepEqual(slidesFor(race), ['couverture', 'podium', 'classement', 'faits']);
  assert.equal(slidesFor(race, { fmt: 'ig', follow: true }).at(-1), 'abonnement');
  assert.equal(slidesFor(race, { fmt: 'story', follow: true }).at(-1), 'abonnement');
  // X : 4 images au plus, l'image de fin passe avant les dernières du post
  assert.deepEqual(slidesFor(race, { fmt: 'x', follow: true }), ['couverture', 'podium', 'classement', 'abonnement']);
  assert.deepEqual(slidesFor({ post: 'raceweek', tyres: {} }, { fmt: 'x', follow: true, question: true }), ['raceweek', 'horaires', 'question', 'abonnement']);
  assert.deepEqual(slidesFor(race, { fmt: 'x' }), slidesFor(race));
  assert.deepEqual(slidesFor({ post: 'flash', rows: [] }, { follow: true }), ['flash']);
  assert.deepEqual(slidesFor(newsPost(item, { title: 'T', summary: 'S' }), { follow: true }), ['news']);
  assert.equal(slideName('abonnement'), 'Abonnez-vous');
  assert.equal(slideName('essentiel-2'), "L'essentiel");
  assert.match(followReason({ post: 'prerace', sprint: true }), /le sprint/);
  assert.match(followReason({ news: true }), /actu/);
});

test('longueur X : emojis et flèches comptent double, liens 23', () => {
  assert.equal(xLength('Pole à 1:20'), 11);
  assert.equal(xLength('⚡ P1 → P2'), 11);
  assert.equal(xLength('⏱️🏆1️⃣'), 6);
  assert.equal(xLength('https://exemple.test/une/longue/adresse'), 23);
});

test('abonnement : ligne ajoutée aux textes, dans la limite de chaque réseau', () => {
  const d = { kind: 'race', rows: [{}] };
  const caps = {
    instagram: 'Norris remporte le Grand Prix !\n\nPodium :\n1. Lando Norris\n\n@moi\n\n#F1 #Formula1',
    threads: 'Norris remporte le Grand Prix !\n\n@moi\n\n#F1',
    x: 'Norris remporte le Grand Prix devant Verstappen.\n\n#F1 #MexicoGP',
    bsky: 'Norris remporte le Grand Prix devant Verstappen.\n\n#F1 #MexicoGP',
    story: 'Norris remporte le Grand Prix !',
  };
  const f = followCaptions(caps, d, '@moi');
  // Signature seule remplacée par l'appel, hashtags toujours à la fin
  assert.match(f.instagram, /\n\n🔔 Abonne-toi à @moi pour suivre toute l'actualité de la Formule 1 !\n\n#/);
  assert.ok(!f.instagram.includes('\n\n@moi\n\n'));
  assert.match(f.x, /🔔 Suis @moi pour toute l'actu F1 !/);
  assert.ok(xLength(f.x) <= 280);
  assert.ok(f.threads.length <= 500);
  assert.equal(f.story, caps.story);
  // X déjà plein : texte laissé tel quel
  const full = { x: `${'a'.repeat(270)}\n\n#F1` };
  assert.equal(followCaptions(full, d, '@moi').x, full.x);
  // Sans compte : appel générique, pas de ligne sur X
  const g = followCaptions({ instagram: 'Titre\n\n#F1', x: 'Titre\n\n#F1' }, d, '');
  assert.equal(g.instagram, "Titre\n\n🔔 Abonne-toi pour suivre toute l'actualité de la Formule 1 !\n\n#F1");
  assert.equal(g.x, 'Titre\n\n#F1');
});

test("news en plusieurs images : points clés répartis, légendes avec l'essentiel", () => {
  assert.deepEqual(cleanPoints('- Premier point du résumé.\n\n2) Deuxième point.\n•  Troisième   point.'), ['Premier point du résumé.', 'Deuxième point.', 'Troisième point.']);
  assert.equal(cleanPoints(Array(9).fill('Un point assez long.')).length, 6);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd']).map((p) => p.length), [2, 2]);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd', 'e']).map((p) => p.length), [3, 2]);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd', 'e'], 'story').map((p) => p.length), [5]);
  assert.deepEqual(pointPages([]), []);
  const points = ['Ferrari prolonge Hamilton de deux saisons.', 'Le Britannique restera jusqu’en 2028.', 'Vasseur salue son expérience.', 'Le duo avec Leclerc est maintenu.'];
  const d = newsPost(item, { title: 'Ferrari prolonge Hamilton', summary: 'Hamilton reste chez Ferrari.', points: points.join('\n') });
  assert.deepEqual(d.points, points);
  assert.deepEqual(slidesFor(d), ['news', 'essentiel-1', 'essentiel-2']);
  assert.deepEqual(slidesFor(d, { fmt: 'ig', follow: true }), ['news', 'essentiel-1', 'essentiel-2', 'abonnement']);
  assert.deepEqual(slidesFor(d, { fmt: 'story', follow: true }), ['news', 'essentiel-1', 'abonnement']);
  // Question en avant-dernière image des carrousels, aussi sur X
  assert.deepEqual(slidesFor(d, { fmt: 'ig', follow: true, question: true }), ['news', 'essentiel-1', 'essentiel-2', 'question', 'abonnement']);
  assert.deepEqual(slidesFor(d, { fmt: 'ig', question: true }).at(-1), 'question');
  assert.deepEqual(slidesFor(d, { fmt: 'x', follow: true, question: true }), ['news', 'essentiel-1', 'question', 'abonnement']);
  assert.ok(slidesFor(d, { fmt: 'x', follow: true }).length <= 4);
  const c = newsCaptions(d, '@moi');
  assert.match(c.instagram, /📌 L'essentiel :\n👉 Ferrari prolonge Hamilton de deux saisons\.\n👉 Le Britannique/);
  assert.match(c.facebook, /L'essentiel :/);
  assert.ok(!c.x.includes("L'essentiel"));
  // Instagram : 2 200 caractères au plus, les points restent sur les images
  const long = newsPost(item, { title: 'T', summary: 'S', points: Array(6).fill('x'.repeat(250)) });
  assert.ok(newsCaptions(long, '@moi').instagram.length <= 2200);
});

test('textes : sans ce que montraient les images écartées', async () => {
  const { keptData } = await import('../shared/social-draw.js');
  const d = { news: true, points: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] };
  assert.equal(keptData(d, new Set(), 'ig'), d);
  assert.deepEqual(keptData(d, new Set(['essentiel-2']), 'ig').points, ['p1', 'p2', 'p3']);
  assert.deepEqual(keptData(d, new Set(['essentiel-1']), 'story').points, ['p4', 'p5', 'p6']);   // story : 5 points par image au plus, 6 -> 2 images de 3
  assert.deepEqual(keptData({ post: 'recap', items: ['a', 'b', 'c'] }, new Set(['recap-2']), 'ig').items, ['a', 'c']);
  assert.deepEqual(keptData({ post: 'teamduels', rows: [1, 2, 3, 4, 5, 6, 7] }, new Set(['equipes-1']), 'ig').rows, [6, 7]);
  assert.deepEqual(keptData({ post: 'weekend', tyres: { soft: 3 }, forecast: [1] }, new Set(['infos']), 'ig'), { post: 'weekend', tyres: null, forecast: [] });
  assert.equal(keptData({ post: 'prerace', weather: { air: 20 }, tyres: {} }, new Set(['meteo']), 'ig').weather, null);
  assert.deepEqual(keptData({ kind: 'race', facts: [1] }, new Set(['faits']), 'ig').facts, []);
});

test('images choisies : écartées du post, sommaire et numéros des points suivent', async () => {
  const { chosenSlides, drawSlide } = await import('../shared/social-draw.js');
  const { newsPost } = await import('../shared/social-news.js');
  assert.deepEqual(chosenSlides(['news', 'essentiel-1', 'essentiel-2', 'abonnement'], ['essentiel-1']), ['news', 'essentiel-2', 'abonnement']);
  assert.deepEqual(chosenSlides(['a', 'b'], ['a', 'b']), ['a']);   // une image au moins
  // Faux canvas : textes écrits relevés
  const texts = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : k === 'fillText' ? (s) => texts.push(String(s))
      : ['createLinearGradient', 'createRadialGradient'].includes(k) ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const canvas = { getContext: () => ctx };
  const d = newsPost({ id: 'a', title: 'Hamilton signs new Ferrari deal', summary: 'Résumé.', tags: [], src: 'f1', t: Date.UTC(2026, 9, 14), link: 'https://x.test', lang: 'fr', sources: 3 }, { sourceName: 'Formula 1' });
  d.points = ['Premier point clé assez long pour la diapo.', 'Deuxième point clé assez long pour la diapo.', 'Troisième point clé assez long pour la diapo.', 'Quatrième point clé assez long pour la diapo.', 'Cinquième point clé assez long pour la diapo.'];
  const list = ['news', 'essentiel-2'];   // 1re image de points écartée (3 points)
  drawSlide(canvas, 'news', 'ig', d, { slides: list });
  assert.ok(texts.some((x) => /EN 2 POINTS/.test(x)), texts.join(' | '));
  texts.length = 0;
  drawSlide(canvas, 'essentiel-2', 'ig', d, { slides: list });
  assert.ok(texts.includes('01') && texts.includes('02') && !texts.includes('04'));
  texts.length = 0;
  drawSlide(canvas, 'essentiel-2', 'ig', d, {});   // sans choix : numéros d'origine
  assert.ok(texts.includes('04') && texts.includes('05'));
});

test('news avec les photos de l\'article : une image par photo, avant l\'essentiel', () => {
  const d = newsPost({ id: 'l', title: 'Livrée spéciale', summary: 'S', t: 0, cat: 'news' }, { title: 'Livrée spéciale', summary: 'S', points: 'Un\nDeux' });
  d.gallery = [{}, {}];
  assert.deepEqual(slidesFor(d), ['news', 'photo-1', 'photo-2', 'essentiel-1']);
  assert.equal(slideName('photo-2'), 'Photo');
});

test('mention IA et appli : ligne avant les hashtags, compte de l\'appli selon le réseau, dans la limite', () => {
  const caps = { instagram: 'Titre\n\n@moi\n\n#F1 #BenjyPaddock', facebook: 'Titre\n\n@moi', threads: 'Titre\n\n#F1', x: 'Titre\n\n#BenjyPaddock', bsky: 'Titre\n\n#BenjyPaddock' };
  const c = creditCaptions(caps);
  assert.equal(c.instagram, "Titre\n\n@moi\n\n🤖 Fait par IA avec l'appli @paddockliveapp\n\n#F1 #BenjyPaddock");
  assert.equal(c.facebook, "Titre\n\n@moi\n\n🤖 Fait par IA avec l'appli @paddockliveapp");
  assert.match(c.threads, /@paddockliveapp\n\n#F1$/);
  assert.match(c.bsky, /avec l'appli @paddocklive\.app\n\n#BenjyPaddock$/);
  assert.equal(creditCaptions({ x: `${'a'.repeat(260)}\n\n#F1` }).x, `${'a'.repeat(260)}\n\n#F1`, 'X plein : texte inchangé');
});
