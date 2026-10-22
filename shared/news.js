// Actualités : lecture des flux (RSS, Atom, YouTube), repérage des pilotes et écuries cités,
// importance d'une nouvelle et regroupement des articles qui parlent du même sujet.
// Code pur (sans accès réseau), partagé par le serveur et les tests.

// ---- Lecture XML minimale (flux RSS 2.0 / Atom) ----
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', iacute: 'í', oacute: 'ó', aacute: 'á', uacute: 'ú' };

Object.assign(ENTITIES, { szlig: 'ß', aelig: 'æ', oelig: 'œ', oslash: 'ø', laquo: '«', raquo: '»', euro: '€', bull: '•', middot: '·', deg: '°', times: '×', shy: '', sbquo: '‚', bdquo: '„', copy: '©', reg: '®', trade: '™', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª' });
const ACCENTS = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', cedil: '\u0327', ring: '\u030a' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    if (Object.hasOwn(ENTITIES, e)) return ENTITIES[e];
    // Lettres accentuées (« &Eacute; », « &ocirc; »…) : lettre + accent combinés (majuscule gardée)
    const acc = e.match(/^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i);
    if (acc) return (acc[1] + ACCENTS[acc[2].toLowerCase()]).normalize('NFC');
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Texte d'un élément : CDATA déballé, balises HTML retirées, entités décodées, espaces resserrés
export function cleanText(s) {
  let t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Les flux encodent souvent le HTML (&lt;p&gt;) : on décode une fois avant de retirer les balises
  if (/&lt;\/?[a-z]/i.test(t)) t = decodeEntities(t);
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  // Entités encodées deux fois (« &amp;#8211; ») : encore un décodage
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) t = decodeEntities(t);
  // Emojis des titres (vidéos, publications) retirés : l'appli n'en affiche pas
  t = t.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3]/gu, '');
  return t.replace(/\s+/g, ' ').replace(/\s+([,.!?:;…])/g, '$1').trim();
}

function tagContent(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  return xml.match(re)?.[1] ?? null;
}

function tagAttr(xml, tag, attr, where = null) {
  const re = new RegExp(`<${tag}\\b([^>]*)/?>`, 'gi');
  for (const m of xml.matchAll(re)) {
    const attrs = m[1];
    if (where && !where(attrs)) continue;
    const v = attrs.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
    if (v) return decodeEntities(v[1]);
  }
  return null;
}

function firstImage(html) {
  const m = String(html || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : null;
}

const isImage = (attrs) => /image\//i.test(attrs) || /\.(jpe?g|png|webp|gif)(\?|["'])/i.test(attrs) || /medium=["']image/i.test(attrs) || !/type=/i.test(attrs);

// Fuseaux écrits en lettres que Date.parse ne connaît pas (« 06:00:00 BST »)
const TZ = { BST: '+0100', IST: '+0100', WEST: '+0100', CET: '+0100', CEST: '+0200', MEZ: '+0100', MESZ: '+0200', EET: '+0200', EEST: '+0300', JST: '+0900', AEST: '+1000', AEDT: '+1100', BRT: '-0300' };

export function parseDate(s) {
  const str = String(s || '').trim().replace(/\b([A-Z]{3,4})$/, (m, z) => TZ[z] || m);
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
}

// Adresse web (http/https) ou null : un flux ne peut pas glisser de lien « javascript: » ou « file: »
export function webLink(u) {
  const s = String(u || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
}

// Flux → [{ guid, title, summary, link, img, t, lang? }] ; lang : langue déclarée par le flux
export function parseFeed(xml) {
  const src = String(xml || '');
  const lang = (tagContent(src.slice(0, 4000), 'language') || src.match(/<feed[^>]*xml:lang=["']([^"']+)/i)?.[1] || '').trim().slice(0, 2).toLowerCase() || null;
  const atom = /<feed[\s>]/i.test(src) && !/<rss[\s>]/i.test(src);
  const blocks = [...src.matchAll(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const items = blocks.map((b) => {
    const title = cleanText(tagContent(b, 'title'));
    let link = atom
      ? tagAttr(b, 'link', 'href', (a) => !/rel=["'](?!alternate)/i.test(a))
      : cleanText(tagContent(b, 'link')) || tagAttr(b, 'link', 'href');
    const guid = cleanText(tagContent(b, atom ? 'id' : 'guid')) || link;
    if (!link && /^https?:/.test(guid || '')) link = guid;
    const rawSummary = tagContent(b, 'media:description') ?? tagContent(b, 'description') ?? tagContent(b, 'summary') ?? tagContent(b, 'content') ?? tagContent(b, 'content:encoded') ?? '';
    const img = tagAttr(b, 'media:thumbnail', 'url') || tagAttr(b, 'media:content', 'url', isImage) || tagAttr(b, 'enclosure', 'url', isImage)
      || firstImage(tagContent(b, 'content:encoded')) || firstImage(rawSummary);
    const t = parseDate(tagContent(b, 'pubDate') ?? tagContent(b, 'published') ?? tagContent(b, 'updated') ?? tagContent(b, 'dc:date'));
    return { guid, title, summary: cleanText(rawSummary).slice(0, 600), link: webLink(link), img: webLink(img), t };
  }).filter((it) => it.title && it.link);
  return { lang, items };
}

// ---- Pilotes, écuries et personnalités cités ----
// Clés : trigramme des pilotes, identifiant court des écuries. Les noms sont cherchés en mots
// entiers, sans accents ni casse.
export const NEWS_DRIVERS = [
  ['VER', ['verstappen']], ['HAD', ['hadjar']], ['LEC', ['leclerc']], ['HAM', ['hamilton']],
  ['NOR', ['norris']], ['PIA', ['piastri']], ['RUS', ['russell']], ['ANT', ['antonelli']],
  ['ALO', ['alonso']], ['STR', ['stroll']], ['ALB', ['albon']], ['SAI', ['sainz']],
  ['GAS', ['gasly']], ['COL', ['colapinto']], ['OCO', ['ocon']], ['BEA', ['bearman']],
  ['HUL', ['hulkenberg', 'hülkenberg', 'huelkenberg']], ['BOR', ['bortoleto']], ['LAW', ['lawson']], ['LIN', ['lindblad']],
  ['PER', ['perez', 'pérez', 'checo']], ['BOT', ['bottas']],
];

export const NEWS_TEAMS = [
  ['ferrari', 'Ferrari', ['ferrari', 'scuderia', 'maranello']],
  ['mercedes', 'Mercedes', ['mercedes', 'brackley']],
  ['mclaren', 'McLaren', ['mclaren', 'woking']],
  ['redbull', 'Red Bull', ['red bull racing', 'red bull', 'redbull']],
  ['rb', 'Racing Bulls', ['racing bulls', 'vcarb', 'visa cash app rb']],
  ['aston', 'Aston Martin', ['aston martin']],
  ['williams', 'Williams', ['williams']],
  ['alpine', 'Alpine', ['alpine', 'enstone']],
  ['haas', 'Haas', ['haas']],
  ['audi', 'Audi', ['audi', 'sauber']],
  ['cadillac', 'Cadillac', ['cadillac']],
  ['fia', 'FIA', ['fia', 'stewards', 'commissaires', 'ben sulayem']],
];

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (names) => new RegExp(`(?:^|[^a-z0-9])(?:${names.map((n) => escapeRe(fold(n))).join('|')})(?:$|[^a-z0-9])`);
const DRIVER_RES = NEWS_DRIVERS.map(([k, names]) => [k, nameRe(names)]);
const TEAM_RES = NEWS_TEAMS.map(([k, , names]) => [k, nameRe(names)]);

// Écurie des classements (identifiant et nom de Jolpica, ou nom de la F1) -> clé ci-dessus
const TEAM_IDS = { red_bull: 'redbull', rb: 'rb', racing_bulls: 'rb', aston_martin: 'aston', sauber: 'audi', kick_sauber: 'audi' };
export function teamKey(id, name = '') {
  const team = (k) => k !== 'fia' && NEWS_TEAMS.some(([key]) => key === k);
  return TEAM_IDS[id] || (team(id) ? id : newsTags(name).find(team) || null);
}

export function newsTags(text) {
  const t = fold(text);
  const out = [];
  for (const [k, re] of DRIVER_RES) if (re.test(t)) out.push(k);
  for (const [k, re] of TEAM_RES) if (re.test(t)) out.push(k);
  // « Red Bull » contient aussi les Racing Bulls : on ne garde que l'écurie la plus précise
  if (out.includes('rb') && out.includes('redbull') && !/red bull racing/.test(t)) out.splice(out.indexOf('redbull'), 1);
  return out;
}

// ---- Importance ----
// Mots qui signalent un fait marquant, dans les langues des sources (racines sans accents).
const STRONG = [
  // anglais
  'breaking', 'official', 'confirm', 'announce', 'signs', 'signed', 'contract', 'penalt', 'disqualif', 'crash', 'injur', 'hospital',
  'retire', 'sacked', 'fired', 'quits', 'resign', 'replace', 'banned', 'suspend', 'appeal', 'protest', 'cancel', 'postpone', 'red flag',
  'investigation', 'summoned', 'grid drop', 'team principal', 'leaves', 'joins', 'dies', 'died', 'death', 'agreement', 'deal to',
  // français
  'officiel', 'confirme', 'annonce', 'signe', 'contrat', 'penalite', 'sanction', 'disqualifi', 'accident', 'blesse', 'hopital', 'retraite',
  'limoge', 'quitte', 'demission', 'remplace', 'suspendu', 'appel', 'reclamation', 'annule', 'reporte', 'drapeau rouge', 'enquete',
  'convoque', 'rejoint', 'deces', 'sacre champion', 'accord ',
  // espagnol, italien, portugais
  'oficial', 'confirmado', 'anuncia', 'firma', 'contrato', 'sancion', 'penalizacion', 'descalific', 'accidente', 'herido', 'retirada',
  'despedido', 'ufficiale', 'confermato', 'annuncia', 'contratto', 'penalita', 'squalific', 'incidente', 'infortun', 'ritiro', 'licenziato',
  'punicao', 'acidente', 'confirma', 'acuerdo', 'accordo',
  // allemand, néerlandais
  'offiziell', 'bestatigt', 'vertrag', 'strafe', 'disqualifiz', 'unfall', 'verletz', 'rucktritt', 'entlassen', 'officieel', 'bevestigd', 'straf',
];
const STRONG_RE = new RegExp(`(?:^|[^a-z])(?:${STRONG.map(escapeRe).join('|')})`);
const CLICKBAIT_RE = /\b(quiz|podcast|gallery|galerie|in pictures|en images|wallpaper|live blog|as it happened|ranked|rumou?r round-?up)\b/;

// 0 : ordinaire · 1 : à noter · 2 : important (alerte) · 3 : majeur. cat : catégorie de la source.
export function newsImportance(item, cat) {
  const text = fold(`${item.title} ${item.summary || ''}`.slice(0, 400));
  const title = fold(item.title);
  let s = 0;
  if (cat === 'official') s += 1;
  if (STRONG_RE.test(title)) s += 1;
  else if (STRONG_RE.test(text)) s += 0.5;
  if (cat === 'official' && /(press release|communique|decision|stewards|statement|declaration)/.test(text)) s += 1;
  if (CLICKBAIT_RE.test(title)) s -= 1;
  return Math.max(0, Math.min(3, Math.floor(s)));
}

// ---- Regroupement des articles sur un même sujet ----
const STOP = new Set(('the a an of to in on for and with at from by is are was be as his her its their after over into new f1 formula one grand prix gp '
  + 'le la les un une des du de d l au aux et en pour par sur dans avec est son sa ses qui que apres plus '
  + 'el los las del y con por para que se al lo una der die das und mit von zu im fur ist den dem ein eine il lo gli di e con per che non het een van op '
  + 'race course carrera rennen gara corrida says said dit ha has have will why how what who when could would should can after before '
  + 'team teams driver drivers season year week weekend first last next new f1s formel formula1 formule formel1').split(' '));

// Noms (pilotes, écuries, prénoms courants) : déjà comptés par les étiquettes, ils ne suffisent pas
// à dire que deux articles parlent du même sujet
const NAME_WORDS = new Set([
  ...NEWS_DRIVERS.flatMap(([, n]) => n.map(fold)), ...NEWS_TEAMS.flatMap(([, , n]) => n.flatMap((x) => fold(x).split(' '))),
  ...'max charles lewis lando oscar george kimi andrea fernando lance alex carlos pierre franco esteban oliver nico gabriel liam arvid sergio valtteri isack toto fred zak andrea laurent christian helmut jonathan james ayao gp1 bull racing'.split(' '),
]);

export function newsTokens(item) {
  const words = fold(item.title).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w) && !NAME_WORDS.has(w));
  // Pluriels et formes en -s ramenés au même mot (« returns » = « return »)
  return { words: new Set(words.map((w) => (w.length > 4 ? w.replace(/s$/, '') : w))), tags: new Set(item.tags || []) };
}

// Proximité de deux articles (0 à 1) : mots du sujet en commun (hors noms), un peu plus si les
// mêmes pilotes ou écuries sont cités. Moins de deux mots en commun : 0.
// weight : poids de chaque mot (rare = lourd). Les mots présents dans beaucoup de titres du moment
// (lieu du Grand Prix, « pole », « sprint »…) pèsent peu : ils ne distinguent pas un sujet d'un autre.
export function newsSimilarity(a, b, weight = null) {
  const A = a._tok || newsTokens(a);
  const B = b._tok || newsTokens(b);
  if (!A.words.size || !B.words.size) return 0;
  const w = (x) => (weight ? weight(x) : 1);
  let common = 0;
  let shared = 0;
  for (const x of A.words) if (B.words.has(x)) { common++; shared += w(x); }
  if (common < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (const x of A.words) sa += w(x);
  for (const x of B.words) sb += w(x);
  let tags = 0;
  for (const t of A.tags) if (B.tags.has(t)) tags++;
  return Math.min(1, shared / Math.min(sa, sb) + (tags ? 0.1 : 0));
}

// Range chaque article dans un sujet (cluster) : celui d'un article proche des 36 dernières
// heures, sinon un nouveau sujet. Il doit aussi rester proche du premier article du sujet, pour
// éviter les chaînes (A ressemble à B qui ressemble à C…). items : du plus ancien au plus récent.
// titleOf(it) : titre traduit s'il est connu (le même article publié en plusieurs langues est réuni)
export function clusterNews(items, { window = 36 * 3600e3, threshold = 0.45, titleOf = null } = {}) {
  const recent = [];
  const founder = new Map();
  for (const it of items) { const tr = titleOf?.(it); it._tok = newsTokens(tr ? { ...it, title: tr } : it); }
  // Poids des mots : inverse de leur fréquence dans les titres de la période
  const df = new Map();
  for (const it of items) for (const w of it._tok.words) df.set(w, (df.get(w) || 0) + 1);
  const n = Math.max(items.length, 20);
  const weight = (w) => Math.log(1 + n / (df.get(w) || 1));
  for (const it of items) {
    let best = null;
    let bestScore = threshold;
    for (let i = recent.length - 1; i >= 0; i--) {
      const o = recent[i];
      if (it.t - o.t > window) break;
      if (o.src === it.src) continue;
      const sc = newsSimilarity(it, o, weight);
      if (sc < bestScore) continue;
      const f = founder.get(o.cluster);
      if (f && f !== o && newsSimilarity(it, f, weight) < threshold * 0.7) continue;
      best = o;
      bestScore = sc;
    }
    it.cluster = best ? best.cluster : it.id;
    if (!best) founder.set(it.id, it);
    recent.push(it);
  }
  for (const it of items) delete it._tok;
  return items;
}
