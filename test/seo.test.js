import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { englishHome, sitemap, GUIDES } from '../analytics/launch/guides.mjs';

const FR = fs.readFileSync(new URL('../analytics/launch/index.html', import.meta.url), 'utf8');

test('référencement : accueil anglais (/en/) écrit en anglais, avec ses adresses', () => {
  const en = englishHome(FR);
  const head = en.split('</head>')[0];
  assert.match(head, /<html lang="en"/);
  assert.match(head, /<title>Paddock Live · Free F1 live timing/);
  assert.match(head, /<link rel="canonical" href="https:\/\/paddocklive\.app\/en\/">/);
  assert.match(head, /<meta property="og:url" content="https:\/\/paddocklive\.app\/en\/">/);
  assert.match(head, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/"/);
  assert.match(FR, /hreflang="en" href="https:\/\/paddocklive\.app\/en\/"/);
  // Textes, liens et champs en anglais ; plus aucun texte français visible
  assert.match(en, /data-en="Features">Features<\/a>/);
  assert.match(en, /href="\/en\/f1-live-timing\/"/);
  const body = en.split('<body')[1].replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const french = body.split(/<[^>]+>/).map((t) => t.trim()).filter((t) => /[éèàêçù]|\b(les|des|pour|avec|dans|ton|ta)\b/.test(t));
  assert.deepEqual(french, []);
  assert.throws(() => englishHome('<html lang="fr"><title>x</title>'), /introuvable/);
});

test('référencement : plan du site sans page exclue, accueil anglais compris', () => {
  const s = sitemap();
  assert.match(s, /<loc>https:\/\/paddocklive\.app\/en\/<\/loc>/);
  assert.doesNotMatch(s, /\?lang=en|\/p\/</);   // /p/ : page en noindex
  for (const g of GUIDES) assert.match(s, new RegExp(`/${g.slug}/</loc>`));
});
