import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanText, newsTags, newsImportance, clusterNews, newsSimilarity, teamKey } from '../shared/news.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Exemple</title><language>en-GB</language>
<item>
  <title><![CDATA[Verstappen handed five-place grid penalty for Singapore]]></title>
  <link>https://example.com/news/1/</link>
  <guid isPermaLink="false">abc-1</guid>
  <description>&lt;p&gt;The &lt;b&gt;Red Bull&lt;/b&gt; driver &amp;amp; team were summoned.&lt;/p&gt;</description>
  <pubDate>Tue, 13 Oct 2026 10:00:00 GMT</pubDate>
  <media:content url="https://example.com/img.jpg" medium="image" />
</item>
<item>
  <title>Sans lien</title>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
 <title>FORMULA 1</title>
 <entry>
  <id>yt:video:XYZ</id>
  <title>Race Highlights | 2026 Singapore Grand Prix</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=XYZ"/>
  <published>2026-10-11T15:00:00+00:00</published>
  <media:group><media:thumbnail url="https://i.ytimg.com/vi/XYZ/hqdefault.jpg" width="480" height="360"/><media:description>Leclerc and Norris battle.</media:description></media:group>
 </entry>
</feed>`;

test('actualités : lecture d\'un flux RSS (CDATA, HTML encodé, image, date)', () => {
  const f = parseFeed(RSS);
  assert.equal(f.lang, 'en');
  assert.equal(f.items.length, 1, 'un article sans lien est ignoré');
  const it = f.items[0];
  assert.equal(it.title, 'Verstappen handed five-place grid penalty for Singapore');
  assert.equal(it.link, 'https://example.com/news/1/');
  assert.equal(it.summary, 'The Red Bull driver & team were summoned.');
  assert.equal(it.img, 'https://example.com/img.jpg');
  assert.equal(it.t, Date.parse('2026-10-13T10:00:00Z'));
});

test('actualités : lecture d\'un flux Atom (vidéos YouTube)', () => {
  const [it] = parseFeed(ATOM).items;
  assert.equal(it.title, 'Race Highlights | 2026 Singapore Grand Prix');
  assert.equal(it.link, 'https://www.youtube.com/watch?v=XYZ');
  assert.equal(it.img, 'https://i.ytimg.com/vi/XYZ/hqdefault.jpg');
  assert.equal(it.summary, 'Leclerc and Norris battle.');
  assert.equal(it.t, Date.parse('2026-10-11T15:00:00Z'));
});

test('actualités : nettoyage du texte', () => {
  assert.equal(cleanText('<p>Hülkenberg&#8217;s &quot;best&quot;</p><script>x()</script>'), 'Hülkenberg’s "best"');
  assert.equal(cleanText('Abwehrschlacht &amp;#8211; doch wie'), 'Abwehrschlacht – doch wie');
  assert.equal(cleanText('Hello George 🤣 🥶 #f1 | Max 🆚 Charles 🇸🇬 !'), 'Hello George #f1 | Max Charles!');
});

test('actualités : pilotes et écuries cités', () => {
  assert.deepEqual(newsTags('Hulkenberg and Sainz clash; Ferrari protest'), ['SAI', 'HUL', 'ferrari']);
  assert.deepEqual(newsTags('Pérez gives Cadillac its first points'), ['PER', 'cadillac']);
  assert.deepEqual(newsTags('Racing Bulls confirm Lindblad'), ['LIN', 'rb']);
  // Mots entiers seulement : « Norristown » ne cite pas Norris
  assert.deepEqual(newsTags('Norristown fan club'), []);
});

test('actualités : importance', () => {
  assert.equal(newsImportance({ title: 'Verstappen handed grid penalty' }, 'media'), 1);
  assert.equal(newsImportance({ title: 'Stewards decision: Hamilton penalty confirmed' }, 'official'), 3);
  assert.equal(newsImportance({ title: 'Gallery: the best pictures from Singapore' }, 'media'), 0);
  assert.equal(newsImportance({ title: 'Alonso signe un nouveau contrat avec Aston Martin' }, 'media'), 1);
  assert.equal(newsImportance({ title: 'Our Singapore weekend in numbers' }, 'team'), 0);
});

test('actualités : regroupement des articles d\'un même sujet', () => {
  const mk = (id, src, title, t) => ({ id, src, title, t, tags: newsTags(title) });
  const h = 3600e3;
  const list = clusterNews([
    mk('a', 'autosport', 'Verstappen handed five-place grid penalty for Singapore', 0),
    mk('b', 'bbc', 'Singapore GP: Verstappen gets five-place grid penalty', 1 * h),
    mk('c', 'lequipe', 'Hamilton prolonge chez Ferrari', 2 * h),
    mk('d', 'marca', 'Verstappen, cinco puestos de penalización en Singapur', 3 * h),
    mk('e', 'bbc', 'Verstappen handed grid penalty again', 50 * h),
  ]);
  const by = Object.fromEntries(list.map((x) => [x.id, x.cluster]));
  assert.equal(by.b, 'a');
  assert.equal(by.c, 'c');
  assert.equal(by.d, 'd', 'trop peu de mots en commun entre langues');
  assert.equal(by.e, 'e', 'hors de la fenêtre de 36 h');
  assert.ok(newsSimilarity(list[0], list[1]) >= 0.6);
});

test('actualités : même article en plusieurs langues réuni grâce aux titres traduits', () => {
  const mk = (id, src, title, t) => ({ id, src, title, t, tags: newsTags(title) });
  const h = 3600e3;
  const FR = { 'Verstappen handed five-place grid penalty for Singapore': 'Verstappen reçoit une pénalité de cinq places sur la grille à Singapour',
    'Verstappen, cinco puestos de penalización en Singapur': 'Verstappen, pénalité de cinq places sur la grille à Singapour' };
  const list = clusterNews([
    mk('a', 'autosport', 'Verstappen handed five-place grid penalty for Singapore', 0),
    mk('b', 'lequipe', 'Pénalité de cinq places sur la grille pour Verstappen à Singapour', 1 * h),
    mk('c', 'marca', 'Verstappen, cinco puestos de penalización en Singapur', 2 * h),
  ], { titleOf: (x) => FR[x.title] });
  assert.deepEqual(list.map((x) => x.cluster), ['a', 'a', 'a']);
});

test('actualités : dates avec fuseau en lettres', async () => {
  const { parseDate } = await import('../shared/news.js');
  assert.equal(parseDate('Wed, 14 Oct 2026 06:00:00 BST'), Date.parse('2026-10-14T05:00:00Z'));
  assert.equal(parseDate('Wed, 14 Oct 2026 05:42:11 EST'), Date.parse('2026-10-14T10:42:11Z'));
  assert.equal(parseDate('Wed, 14 Oct 2026 12:08:08 +0200'), Date.parse('2026-10-14T10:08:08Z'));
  assert.equal(parseDate('pas une date'), null);
});

test('actualités : écurie du classement -> clé des écuries favorites', () => {
  assert.equal(teamKey('red_bull', 'Red Bull'), 'redbull');
  assert.equal(teamKey('rb', 'RB F1 Team'), 'rb');
  assert.equal(teamKey('sauber', 'Kick Sauber'), 'audi');
  assert.equal(teamKey('aston_martin', 'Aston Martin'), 'aston');
  assert.equal(teamKey('ferrari', 'Ferrari'), 'ferrari');
  // Identifiant inconnu : reconnue par son nom, sinon aucune clé (jamais « fia »)
  assert.equal(teamKey('haas_2027', 'Haas F1 Team'), 'haas');
  assert.equal(teamKey('fia', 'FIA'), null);
  assert.equal(teamKey('nouvelle_ecurie', 'Nouvelle Écurie'), null);
});
