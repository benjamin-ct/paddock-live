// Liste des documents officiels de la FIA (fia.com/documents) : lecture des pages, sans accès
// réseau. Partagé entre l'appli (serveur) et la page web du créateur.
import { fold } from './news.js';

export const BASE = 'https://www.fia.com';
export const CHAMPIONSHIP = '/documents/championships/fia-formula-one-world-championship-14';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  }).replace(/\s+/g, ' ').trim();
}

// Les dates de publication sont à l'heure de Paris ("26.09.26 17:40").
function parisOffset(ms) {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(tz);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000 : 0;
}

export function parsePublished(s) {
  const m = /(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const wall = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return wall - parisOffset(wall - parisOffset(wall));
}

export function parseDocumentList(html) {
  // Une ligne par document ; le lien peut être directement dans la ligne ou dans un bloc
  // intermédiaire (mise en page fia.com de 2026), le titre dans des blocs imbriqués.
  const docs = [];
  for (const chunk of html.split(/<li class="document-row/).slice(1)) {
    const href = /<a href="([^"]+)"/.exec(chunk);
    const t0 = chunk.indexOf('<div class="title">');
    const date = /date-display-single">([^<]*)</.exec(chunk);
    if (!href || t0 < 0) continue;
    const t1 = chunk.indexOf('class="published"', t0);
    const title = decode(chunk.slice(t0 + 19, t1 > 0 ? t1 : undefined).replace(/<[^>]*>?/g, ' '));
    docs.push({ title, url: new URL(decode(href[1]), BASE).toString(), published: parsePublished(date?.[1]) });
  }
  return docs;
}

export function options(html, re) {
  return [...html.matchAll(re)].map((m) => ({ path: decode(m[1]), label: decode(m[2]) }));
}

// Page du championnat : chemin de chaque saison et noms des épreuves de la saison en cours
export function parseSeasons(html) {
  const bySeason = {};
  for (const o of options(html, /<option value="([^"]*\/season\/season-(\d{4})-\d+)"/g)) bySeason[o.label] = o.path;
  const events = options(html, /<option value="([^"]*\/event\/[^"]+)">([^<]+)</g).map((o) => o.label);
  return { bySeason, events };
}

// Page d'une saison : ses épreuves (pages de documents), [{ name, page }]
export function seasonEventList(html) {
  const seen = new Set();
  return options(html, /<option value="([^"]*\/season\/season-\d{4}-\d+\/event\/[^"]+)">([^<]+)</g)
    .filter((o) => !seen.has(o.path) && seen.add(o.path))
    .map((o) => ({ name: o.label, page: BASE + o.path }));
}

const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['grand', 'prix', 'of', 'the', 'formula', '1', 'gp']);

// Nom de l'épreuve côté FIA (« Italian Grand Prix », « Grand Prix of Japan »…).
export function pickEvent(events, { name, country, location }) {
  const exact = events.find((e) => norm(e) === norm(name));
  if (exact) return exact;
  const words = new Set([name, country, location].flatMap((s) => norm(s).split(' ')).filter((w) => w && !STOP.has(w)));
  let best = null, bestScore = 0;
  for (const e of events) {
    const score = norm(e).split(' ').filter((w) => words.has(w) || [...words].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}
