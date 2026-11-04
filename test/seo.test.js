import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { englishHome, sitemap, robots, GUIDES, guidePage } from '../analytics/launch/guides.mjs';

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

test('référencement : robots.txt ferme les adresses internes et les fichiers, pas les pages', () => {
  const rules = robots().split('\n').filter((l) => l.startsWith('Disallow: ')).map((l) => l.slice(10));
  // Règle robots.txt : préfixe, « $ » = fin d'adresse
  const blocked = (p) => rules.some((r) => (r.endsWith('$') ? p === r.slice(0, -1) : p.startsWith(r)));
  for (const p of ['/f', '/p/api/new', '/download/windows', '/download/latest.json', '/dl/Paddock-Live.exe', '/studio/', '/login']) assert.ok(blocked(p), p);
  for (const p of ['/', '/en/', '/en/f1-live-track-map/', '/carte-gps-f1/', '/p/', '/saison/2026/', '/legal/privacy']) assert.ok(!blocked(p), p);
});

test('référencement : descriptions de 155 caractères au plus, titres de 60, Twitter et organisation sur l\'accueil', () => {
  const meta = (html, name) => new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(html)?.[1];
  const desc = meta(FR, 'description');
  assert.ok(desc.length >= 140 && desc.length <= 155, `accueil : ${desc.length}`);
  assert.ok(meta(FR, 'twitter:title') && meta(FR, 'twitter:description'));
  const en = englishHome(FR);
  assert.equal(meta(en, 'twitter:description'), meta(en, 'description'));
  assert.match(meta(en, 'twitter:title'), /^Paddock Live · Free F1/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(FR)[1]);
  assert.deepEqual(ld['@graph'].find((x) => x['@type'] === 'Organization'), { '@type': 'Organization', name: 'Paddock Live', url: 'https://paddocklive.app/', logo: 'https://paddocklive.app/site/img/logo.png' });
  const lt = guidePage('live-timing-f1');
  assert.ok(meta(lt, 'description').length <= 155, 'live-timing-f1');
  assert.equal(meta(lt, 'twitter:title'), GUIDES.find((g) => g.slug === 'live-timing-f1').title);
  for (const g of GUIDES) assert.ok(/<title>([^<]*)<\/title>/.exec(guidePage(g.slug))[1].length <= 60, g.slug);
  assert.match(guidePage('radios-f1-traduites'), /<title>Radios F1 traduites en français, en direct · Paddock Live<\/title>/);
});

test('référencement : un seul H1 par page légale, et une vraie description', () => {
  for (const f of ['terms', 'privacy', 'mentions', 'publication']) {
    const html = fs.readFileSync(new URL(`../analytics/legal/${f}.html`, import.meta.url), 'utf8');
    assert.equal(html.match(/<h1\b/g).length, 1, f);
    assert.ok(/<meta name="description" content="([^"]{120,155})">/.test(html), f);
  }
});
