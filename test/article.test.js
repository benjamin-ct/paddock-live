import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractArticle, youtubeId } from '../shared/article.js';
import { createArticleReader } from '../server/article.js';

const para = (n) => `Phrase numéro ${n} de l'article, assez longue pour être gardée comme un vrai paragraphe du texte.`;

test('lecture d\'article : texte de la page (bloc <article> le plus fourni, imbriqués compris)', () => {
  const html = `<html><head><title>Titre de page</title>
    <meta property="og:title" content="Câmara chez Haas">
    <meta property="og:image" content="/img/camara.jpg">
    <meta property="og:site_name" content="Motorsport">
    <meta property="article:published_time" content="2026-10-15T10:00:00Z"></head>
    <body><nav><p>${para('menu')}</p></nav>
    <article class="main"><h2>Intertitre en tête</h2><p>${para(1)}</p>
      <article class="teaser"><p>Lire aussi : autre article</p></article>
      <figure><p>Légende de la photo, Getty Images</p></figure>
      <p>${para(2)}</p><h2>Le contrat</h2><p>${para(3)}</p>
      <p>Isack Hadjar (Red Bull)</p><p>Newsletter : abonnez-vous pour tout recevoir.</p>
      <p>Gemei&szlig;elt &Eacute;t&eacute; &laquo;ici&raquo;.</p><p>${para(4)}</p>
    </article><footer><p>${para('pied')}</p></footer></body></html>`;
  const a = extractArticle(html, 'https://fr.motorsport.com/f1/news/x/1/');
  assert.equal(a.title, 'Câmara chez Haas');
  assert.equal(a.site, 'Motorsport');
  assert.equal(a.image, 'https://fr.motorsport.com/img/camara.jpg');
  assert.deepEqual(a.blocks, [{ p: para(1) }, { p: para(2) }, { h: 'Le contrat' }, { p: para(3) }, { p: 'Gemeißelt Été «ici».' }, { p: para(4) }]);
});

test('lecture d\'article : données structurées (JSON-LD), légendes et cellules de tableau écartées', () => {
  const body = [para(1), 'Isack Hadjar (Red Bull)', 'Photo de: Guido De Bortoli / LAT Images', para(2), 'Pilote', 'Écurie', '2030', para(3)].join('\n');
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'NewsArticle', headline: 'Grille 2027', articleBody: body, author: [{ name: 'A. Auteur' }], image: { url: 'https://x.test/a.jpg' }, datePublished: '2026-10-15' }] })}</script><p>court</p>`;
  const a = extractArticle(html);
  assert.equal(a.title, 'Grille 2027');
  assert.equal(a.author, 'A. Auteur');
  assert.equal(a.image, 'https://x.test/a.jpg');
  assert.deepEqual(a.blocks.map((b) => b.p), [para(1), para(2), para(3)]);
});

test('lecture d\'article : vidéo YouTube', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=H-8NhmkeGmE'), 'H-8NhmkeGmE');
  assert.equal(youtubeId('https://youtu.be/H-8NhmkeGmE'), 'H-8NhmkeGmE');
  assert.equal(youtubeId('https://www.youtube.com/shorts/H-8NhmkeGmE'), 'H-8NhmkeGmE');
  assert.equal(youtubeId('https://www.formula1.com/en/latest'), null);
});

test('lecture d\'article : liens de l\'Actu seulement, nouvel essai, page illisible, mémoire', async () => {
  const article = `<article>${[1, 2, 3, 4, 5, 6].map((n) => `<p>${para(n)}</p>`).join('')}</article>`;
  const calls = [];
  let status = [403, 200];
  const reader = createArticleReader({
    items: () => [{ link: 'https://a.test/1', lang: 'en', title: 'T1', summary: 'Résumé', img: 'https://a.test/i.jpg' }, { link: 'https://a.test/video', lang: 'en', title: 'V' }],
    fetch: async (url) => { calls.push(url); const s = status.shift() ?? 200; return { status: s, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(url.endsWith('video') ? '<p>Vidéo</p>' : article) }; },
    retryDelay: 0,
  });
  await assert.rejects(reader.get('http://127.0.0.1:3000/api/stats'), /Article inconnu/);
  const a = await reader.get('https://a.test/1');
  assert.equal(a.readable, true);
  assert.equal(a.blocks.length, 6);
  assert.equal(a.title, 'T1');
  assert.equal(calls.length, 2);   // refusé une fois, puis lu
  await reader.get('https://a.test/1');
  assert.equal(calls.length, 2);   // gardé en mémoire
  const v = await reader.get('https://a.test/video');
  assert.equal(v.readable, false);
  assert.match(v.reason, /pas de texte lisible/);
});

test('photos de l\'article : la principale en tête, une taille par photo, sans logos, vignettes, vidéos ni encarts', () => {
  const big = (n) => `<img src="https://cdn.test/2026/livree-${n}-600x400.jpg" srcset="https://cdn.test/2026/livree-${n}-600x400.jpg 600w, https://cdn.test/2026/livree-${n}-2048x1365.jpg 2048w">`;
  const html = `<meta property="og:image" content="https://cdn.test/2026/livree-1.jpg"><img src="https://cdn.test/logo.png">
    <article>${[1, 2, 3].map((n) => `<p>${para(n)}</p>`).join('')}
      <figure>${big(1)}</figure><figure>${big(2)}</figure><img data-src="/2026/livree-3.webp" width="1600">
      <img src="https://cdn.test/2026/pub.jpg" width="120"><img src="https://cdn.test/icon-share.png">
      <a href="/autre-article"><img src="https://cdn.test/2026/autre.jpg"></a>
      <img src="https://media.test/image/upload/c_fill,w_352/v1/autre-2.webp">
      <img src="https://cdn.test/2026/auteur.jpg" srcset="https://cdn.test/2026/auteur.jpg?height=270 270w" sizes="100px">
      <div class="sdc-site-video__poster"><img src="https://cdn.test/2026/podcast.jpg"></div>
      <div class="sdc-site-tile__image-wrap"><img src="https://cdn.test/2026/abonnement-sky.jpg"></div>
      <figure class="kg-card kg-image-card"><img src="https://cdn.test/2026/livree-4.jpg"></figure>
      <div class="sdc-site-tile"><figure><div><picture>${'<source srcset="https://cdn.test/2026/promo.jpg?w=1" media="(min-width: 1px)">'.repeat(40)}<img src="https://cdn.test/2026/promo-sky-now.jpg"></picture></div></figure></div>
    </article>`;
  assert.deepEqual(extractArticle(html, 'https://cdn.test/a').images, [
    'https://cdn.test/2026/livree-1.jpg',
    'https://cdn.test/2026/livree-2-2048x1365.jpg',
    'https://cdn.test/2026/livree-3.webp',
    'https://cdn.test/2026/livree-4.jpg',
  ]);
  assert.deepEqual(extractArticle('<p>Rien</p>').images, []);
});
