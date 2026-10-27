// Pneus du week-end (onglet Pneus de l'appli et de la version web, /live/api/tyres) : relais des séances précédentes
// du Grand Prix (archives F1, lues avec la connexion F1 TV du créateur comme les statistiques de la Saison, voir
// archiveToken), choix de composés de Pirelli et communiqués Pirelli (flux RSS de press.pirelli.com, relu toutes les
// 30 min). Choix repérés dans le flux et relais des séances finies gardés dans la base.
import { setRow, readJSON } from './alerts.js';
import { archiveToken } from './studio.js';
import { archiveText } from './race-stats.js';
import { indexMeetings } from '../shared/race-stats.js';
import { dryAllocation, builtinNomination } from '../shared/tyres.js';
import { fold } from '../shared/news.js';

const FEED = 'https://press.pirelli.com/feed/';
const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const FOUND = 'pirelli:found';
const json = (d, ttl) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });

// ---------- Flux Pirelli ----------
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, '\'')
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…');

const tag = (xml, name) => {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return m ? m[1].trim() : '';
};

// Articles du flux : { title, url, date (ms), paras: [texte] }
export function parseFeed(xml) {
  return xml.split('<item>').slice(1).map((it) => {
    const html = tag(it, 'description');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => decode(m[1].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 1);
    return { title: decode(tag(it, 'title')), url: tag(it, 'link'), date: Date.parse(tag(it, 'pubDate')) || 0, paras };
  });
}

// Articles Formule 1 (le flux mêle MotoGP, Superbike, rallye, pneus de série…)
export function isF1Article(a) {
  const head = `${a.title} ${a.paras[0] || ''}`;
  if (/\b(moto ?gp|moto2|moto3|superbike|worldsbk|wrc|rally|cycling|bicycle)\b/i.test(head)) return false;
  if (/p zero|bespoke|cyber tyre|investment|board of directors|decree|shareholder/i.test(a.title)) return false;
  return /\bC[1-6]\b|grand prix|\bFP[123]\b|qualifying|sprint|pole/i.test(`${a.title} ${a.paras.join(' ')}`);
}

// Paragraphes sur la F1 seulement (les comptes rendus finissent souvent par la F2 / F3)
const OTHER_SERIES = /\b(formula [23]|F[23] (?:sprint|feature|championship)|feature race|sprint race was won)\b/i;
export const f1Paragraphs = (paras) => paras.filter((p) => !OTHER_SERIES.test(p));

// Phrases de préconisation (stratégie, pressions, carrossage)
export function adviceSentences(paras) {
  const out = [];
  for (const p of paras) {
    if (/last year|twelve months ago|previous edition|\bC6\b|\b(?:in|of) 20\d\d\b/i.test(p)) continue;   // rappel des années passées
    for (const s of p.split(/(?<=[.!?”"])\s+/)) {
      if (/one-stop|two-stop|three-stop|\bstrateg|recommend|minimum (?:starting )?pressure|camber|psi\b/i.test(s)) out.push(s.replace(/^[“"]|[”"]$/g, '').trim());
    }
  }
  return [...new Set(out)];
}

// Choix de composés annoncés dans un texte : [{ text, c: [dur, medium, tendre] }]
export function findNominations(text) {
  const out = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    let c = null;
    const named = /C([1-6]) as (?:the )?Hard,? (?:the )?C([1-6]) as (?:the )?Medium,? and (?:the )?C([1-6]) as (?:the )?Soft/i.exec(sentence);
    if (named) c = [+named[1], +named[2], +named[3]];
    else {
      const trio = /\b(?:the )?C([1-6]),? C([1-6]),? and (?:the )?C([1-6])\b/i.exec(sentence);
      if (trio && /select|nominat|chosen|bring|opted|will be|range/i.test(sentence)) c = [+trio[1], +trio[2], +trio[3]].sort((a, b) => a - b);
    }
    if (c && c[0] < c[1] && c[1] < c[2]) out.push({ text: sentence, c });
  }
  return out;
}

// Articles F1 du flux, gardés 30 min (5 min si Pirelli ne répond pas) ; choix de composés repérés gardés dans la base
// (le flux ne garde que les derniers articles)
async function feed(env, fetchFn) {
  const ck = new Request('https://live.cache/pirelli-feed');
  const hit = await caches.default.match(ck);
  if (hit) return hit.json();
  let items = [], ttl = 1800;
  try {
    const r = await fetchFn(FEED, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    items = parseFeed(await r.text()).filter(isF1Article);
    const known = await readJSON(env, FOUND, []);
    let changed = false;
    for (const a of items) {
      for (const n of findNominations(a.paras.join(' '))) {
        if (known.some((k) => k.text === n.text)) continue;
        known.push({ ...n, url: a.url, date: a.date });
        changed = true;
      }
    }
    if (changed) await setRow(env, FOUND, JSON.stringify(known.slice(-200)));
  } catch (err) {
    console.warn('[pirelli]', err.message);
    ttl = 300;
  }
  await caches.default.put(ck, json(items, ttl));
  return items;
}

// Mots qui désignent un Grand Prix dans les textes de Pirelli (lieu et nom ; pas le pays, qui
// peut accueillir plusieurs Grands Prix)
function meetingWords(m) {
  return [m.location, m.name?.replace(/ Grand Prix$/i, ''), m.circuit].filter(Boolean)
    .map(fold);
}

export function nominationFor(year, m, found = []) {
  // Table intégrée (vérifiée), sinon annonce repérée dans le flux de Pirelli : une phrase qui
  // cite ce Grand Prix, publiée dans les quatre mois qui précèdent
  const row = builtinNomination(year, m);
  if (row) return row;
  const words = meetingWords(m);
  const hit = [...found].sort((a, b) => b.date - a.date).find((n) => {
    if (n.date && m.start && (n.date > m.start + 3 * 86400000 || n.date < m.start - 120 * 86400000)) return false;
    const t = fold(n.text);
    return words.some((w) => w.length > 3 && t.includes(w));
  });
  return hit ? { hard: hit.c[0], medium: hit.c[1], soft: hit.c[2], url: hit.url } : null;
}

// Composés choisis pour chaque manche d'une saison (table intégrée et annonces déjà repérées) :
// { manche: { hard, medium, soft, url } }
export async function seasonNominations(env, year, races) {
  const found = await readJSON(env, FOUND, []);
  const out = {};
  for (const r of races) {
    const n = nominationFor(year, { name: r.name, location: r.locality, circuit: r.circuit, start: Date.parse(r.date) || 0 }, found);
    if (n) out[r.round] = n;
  }
  return out;
}

// ---------- Relais des séances précédentes ----------
// Index des archives de l'année, gardé 10 min
async function seasonIndex(year, token, fetchFn) {
  const ck = new Request(`https://live.cache/archive-index/${year}`);
  const hit = await caches.default.match(ck);
  if (hit) return hit.json();
  const index = indexMeetings(JSON.parse(await archiveText(`${year}/Index.json`, token, fetchFn)));
  await caches.default.put(ck, json(index, 600));
  return index;
}

async function sessionStints(env, ses, token, fetchFn) {
  const k = `tyres:${ses.path}`;
  const kept = await readJSON(env, k, null);
  if (kept) return kept;
  const read = (f) => archiveText(`${ses.path}${f}`, token, fetchFn).then(JSON.parse);
  const stints = (await read('TyreStintSeries.json').catch(() => null))?.Stints || {};
  let q3 = [];
  if (ses.type === 'Qualifying' && !/sprint/i.test(ses.name)) {
    const td = await read('TimingData.json').catch(() => null);
    q3 = Object.entries(td?.Lines || {}).filter(([, l]) => !l.KnockedOut && Number(l.Position) >= 1 && Number(l.Position) <= 10).map(([n]) => n);
  }
  const data = { name: ses.name, type: ses.type, stints, q3 };
  // Archive définitive quelques heures après la séance : gardée dans la base
  if (Object.keys(stints).length && Date.parse(ses.start) < Date.now() - 6 * 3600 * 1000) await setRow(env, k, JSON.stringify(data));
  return data;
}

// Tout ce qu'il faut pour le panneau Pneus (même forme que /api/tyres des anciennes applis). until : instant affiché
// (pas d'article publié après). hint : { name, location, country, session } d'après SessionInfo, si la séance n'est
// pas encore dans l'index des archives (tout début de séance en direct). Sans connexion F1 TV du créateur : choix
// et communiqués de Pirelli seulement
export async function weekendTyres(env, sessionPath, until = Date.now(), hint = {}, { fetchFn = fetch } = {}) {
  const year = Number(String(sessionPath).slice(0, 4));
  if (!year) throw new Error('Séance inconnue');
  const token = await archiveToken(env, { fetchFn }).catch(() => null);
  const index = token ? await seasonIndex(year, token, fetchFn).catch(() => []) : [];
  let meeting = index.find((m) => m.sessions.some((s) => s.path === sessionPath));
  if (!meeting && hint.name) {
    const folder = String(sessionPath).split('/')[1];
    meeting = index.find((m) => m.sessions.some((s) => s.path.split('/')[1] === folder))
      || { name: hint.name, location: hint.location, country: hint.country, sessions: [] };
    meeting = { ...meeting, sessions: [...meeting.sessions.filter((s) => s.path !== sessionPath), { name: hint.session || '', path: sessionPath, start: new Date(until).toISOString() }] };
  }
  if (!meeting) throw new Error('Grand Prix introuvable dans les archives');
  const idx = meeting.sessions.findIndex((s) => s.path === sessionPath);
  const before = meeting.sessions.slice(0, idx).filter((s) => !/test/i.test(s.name));
  const sessions = [];
  for (const s of before) sessions.push(await sessionStints(env, s, token, fetchFn));
  const sprint = meeting.sessions.some((s) => /sprint/i.test(s.name)) || /sprint/i.test(hint.session || '');
  const start = Date.parse(meeting.sessions[0]?.start) || 0;
  const m = { name: meeting.name, location: meeting.location, country: meeting.country, start };

  const items = await feed(env, fetchFn);
  const found = await readJSON(env, FOUND, []);
  const words = meetingWords(m);
  const raceEnd = (Date.parse(meeting.sessions[meeting.sessions.length - 1]?.start) || start) + 86400000;
  const articles = items
    .filter((a) => a.date <= until && a.date >= start - 12 * 86400000 && a.date <= raceEnd)
    .filter((a) => { const t = fold(`${a.title} ${a.paras.join(' ')}`); return words.some((w) => w.length > 3 && t.includes(w)); })
    .sort((a, b) => b.date - a.date)
    .slice(0, 6)
    .map((a) => { const paras = f1Paragraphs(a.paras); return { ...a, paras, advice: adviceSentences(paras) }; });

  return {
    meeting: { name: meeting.name, location: meeting.location, country: meeting.country, sprint },
    current: meeting.sessions[idx]?.name,
    sessions,
    allocation: dryAllocation(sprint),
    nominations: nominationFor(year, m, found),
    articles,
  };
}
