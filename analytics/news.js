// Actualités de l'appli (onglet Actu, /news/api) : le serveur relit chaque source régulièrement (flux officiels F1 et
// FIA, écuries, pilotes, médias du monde entier, chaînes YouTube, comptes Bluesky, et les sources ajoutées depuis le
// Studio), garde les nouvelles 10 jours, repère pilotes et écuries cités, note leur importance et regroupe les
// articles d'un même sujet (titres traduits en français déjà connus du serveur, pour réunir le même sujet publié en
// plusieurs langues). L'appli relit la liste ; la version web n'a pas d'Actu. Même logique que l'appli auparavant.
import { setRow, readJSON } from './alerts.js';
import { keyOf } from './translate.js';
import { DEFAULT_SOURCES, feedUrl } from '../shared/news-sources.js';
import { parseFeed, cleanText, newsTags, newsImportance, clusterNews, webLink } from '../shared/news.js';
import { readArticle } from '../shared/article.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const KEEP_MS = 10 * 24 * 3600e3;
const MAX_ITEMS = 1500;         // gardées dans une seule ligne de la base (moins de 2 Mo)
const LIST = 800;               // envoyées à l'appli
const PER_TICK = 8;             // sources lues à chaque passage (chaque minute)
const F1_ONLY = /formula 1|formula one|\bf1\b|grand prix|formule 1/i;
const EVERY = { official: 3 * 60e3, rss: 6 * 60e3, youtube: 10 * 60e3, bsky: 5 * 60e3 };
const LANGS = new Set(['en', 'fr', 'es', 'it', 'de', 'nl', 'pt', 'ja', 'zh']);
const CATS = new Set(['official', 'team', 'driver', 'media']);

const json = (d, status = 200, headers = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const hash = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 14);
const normLink = (u) => String(u || '').replace(/^http:/, 'https:').replace(/[?#].*$/, '').replace(/\/$/, '');

// Sources par défaut et sources ajoutées depuis le Studio
export async function newsSources(env) {
  return [...DEFAULT_SOURCES, ...(await readJSON(env, 'news:custom', []))];
}

// Texte d'une réponse dans son encodage (en-tête HTTP, sinon déclaration XML, sinon UTF-8)
async function bodyText(res) {
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 200));
  const label = ((res.headers.get('Content-Type') || '').match(/charset=([\w-]+)/i)?.[1] || head.match(/encoding=["']([\w-]+)["']/i)?.[1] || 'utf-8').toLowerCase();
  try { return new TextDecoder(label).decode(buf); } catch { return new TextDecoder().decode(buf); }
}

// Publications Bluesky -> même forme que les articles d'un flux
export function parseBsky(data, handle) {
  const out = [];
  for (const { post, reason } of data.feed || []) {
    if (reason || !post?.record?.text) continue;
    const text = String(post.record.text).replace(/\s+/g, ' ').trim();
    const rkey = String(post.uri || '').split('/').pop();
    const img = post.embed?.images?.[0]?.thumb || post.embed?.external?.thumb || post.embed?.media?.images?.[0]?.thumb || null;
    out.push({ guid: post.uri, title: text.length > 160 ? `${text.slice(0, 157)}…` : text, summary: text.length > 160 ? text.slice(0, 600) : '', link: `https://bsky.app/profile/${handle}/post/${rkey}`, img: webLink(img), t: Date.parse(post.record.createdAt) || null });
  }
  return { lang: null, items: out };
}

async function fetchSource(s, rt, fetchFn) {
  const headers = { 'User-Agent': UA, Accept: s.kind === 'bsky' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
  if (rt.etag) headers['If-None-Match'] = rt.etag;
  if (rt.modified) headers['If-Modified-Since'] = rt.modified;
  const res = await fetchFn(feedUrl(s), { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 304) return null;
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  rt.etag = res.headers.get('ETag') || null;
  rt.modified = res.headers.get('Last-Modified') || null;
  const body = await bodyText(res);
  return s.kind === 'bsky' ? parseBsky(JSON.parse(body), s.handle) : parseFeed(body);
}

// Nouvelles d'une source pas encore connues
async function readSource(s, rt, known, now, fetchFn) {
  const feed = await fetchSource(s, rt, fetchFn);
  const added = [];
  for (const raw of feed?.items || []) {
    const id = await hash(`${s.id}|${normLink(raw.link) || raw.guid}`);
    if (known.has(id)) continue;
    if (s.filter === 'f1' && !F1_ONLY.test(`${raw.title} ${raw.summary}`)) continue;
    if (s.match && !new RegExp(s.match, 'i').test(`${raw.title} ${raw.summary}`)) continue;
    // Date absente ou illisible : heure de découverte si la source était déjà suivie ; à la première lecture,
    // l'article est placé plus bas (il peut être ancien)
    const dated = !!raw.t && raw.t <= now + 10 * 60e3;
    const t = dated ? raw.t : rt.primed ? now : now - 24 * 3600e3;
    const lang = LANGS.has(s.lang) ? s.lang : (LANGS.has(feed.lang) ? feed.lang : 'en');
    const it = {
      id, src: s.id, title: raw.title.slice(0, 300), summary: raw.summary || '', link: raw.link, img: raw.img, t, seen: now,
      lang, cat: s.cat, kind: s.kind === 'youtube' ? 'video' : s.kind === 'bsky' ? 'post' : 'article', cluster: id,
    };
    it.tags = newsTags(`${it.title} ${it.summary}`);
    it.imp = newsImportance(it, s.cat);
    known.add(id);
    added.push(it);
  }
  return added;
}

// Titres traduits en français déjà gardés par le serveur (l'appli fait traduire les actualités d'avance), notés dans la
// nouvelle (it.fr) une fois trouvés. Chaque ligne lue compte dans le quota de lectures de la base : au plus 60 titres
// par passage, ceux des dernières 24 heures, chacun revu au plus toutes les 30 minutes
async function frTitles(env, list, now) {
  const keys = new Map();
  for (const it of list) {
    if (it.fr || it.lang === 'fr' || it.t < now - 24 * 3600e3 || now - (it.frAt || 0) < 30 * 60e3 || keys.size >= 60) continue;
    it.frAt = now;
    keys.set(await keyOf(it.lang, 'fr', it.title), it);
  }
  if (!keys.size) return;
  const all = [...keys.keys()];
  const { results } = await env.DB.prepare(`SELECT k, out FROM translations WHERE k IN (${all.map(() => '?').join(',')})`).bind(...all).all().catch(() => ({ results: [] }));
  for (const r of results || []) keys.get(r.k).fr = r.out;
}

// Tâche planifiée (chaque minute) : les sources dont c'est le tour, lues en même temps
export async function newsTick(env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return null;
  const rts = await readJSON(env, 'news:rt', {});
  const due = (await newsSources(env)).filter((s) => !(rts[s.id]?.nextAt > now)).slice(0, PER_TICK);
  if (!due.length) return null;
  const items = await readJSON(env, 'news:items', []);
  const known = new Set(items.map((it) => it.id));
  const added = [];
  await Promise.all(due.map(async (s) => {
    const rt = (rts[s.id] ||= {});
    try {
      added.push(...await readSource(s, rt, known, now, fetchFn));
      Object.assign(rt, { ok: true, error: null, fails: 0, last: now });
    } catch (err) {
      Object.assign(rt, { ok: false, error: String(err.message || err).slice(0, 200), fails: (rt.fails || 0) + 1 });
    }
    rt.primed = true;
    const every = s.cat === 'official' && s.kind === 'rss' ? EVERY.official : EVERY[s.kind] || EVERY.rss;
    rt.nextAt = now + Math.min(60 * 60e3, every * 2 ** Math.min(4, rt.fails || 0)) + Math.random() * 20e3;
  }));
  if (added.length) {
    const list = [...items, ...added].filter((it) => it.t >= now - KEEP_MS).sort((a, b) => b.t - a.t).slice(0, MAX_ITEMS);
    // Sujets des 3 derniers jours, du plus ancien au plus récent
    const recent = list.filter((it) => it.t >= now - 3 * 24 * 3600e3).reverse();
    await frTitles(env, recent, now);
    clusterNews(recent, { titleOf: (it) => it.fr || null });
    for (const s of due) rts[s.id].count = list.filter((it) => it.src === s.id).length;
    await setRow(env, 'news:items', JSON.stringify(list));
  }
  await setRow(env, 'news:rt', JSON.stringify(rts));
  return { sources: due.length, added: added.length };
}

// Nombre de sources différentes par sujet (3 derniers jours)
function clusterSizes(list, now) {
  const m = new Map();
  for (const it of list) if (it.t >= now - 3 * 24 * 3600e3) (m.get(it.cluster) || m.set(it.cluster, new Set()).get(it.cluster)).add(it.src);
  return m;
}

// /news/api : nouvelles (les plus récentes d'abord) et état des sources, même forme que /api/news de l'appli ;
// /news/api/article?u= : page d'un article réduite au texte (mode lecture), seulement les liens des nouvelles
export async function newsApi(req, env, url, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return json({ error: 'Base indisponible' }, 503);
  const article = url.pathname === '/news/api/article';
  const u = url.searchParams.get('u') || '';
  // Réponses gardées une minute (liste) ou 6 heures (article) : sans cela, chaque appli lirait la base chaque minute
  const ck = new Request(article ? `https://news.cache/article/${await hash(u)}` : 'https://news.cache/list');
  const hit = await caches.default.match(ck);
  if (hit) return hit;
  const items = await readJSON(env, 'news:items', []);
  let res;
  if (article) {
    const item = items.find((it) => it.link === u);
    if (!item) return json({ error: 'Article inconnu' }, 404);
    const data = await readArticle(item, { fetch: articleFetch(fetchFn), ua: UA });
    // Page illisible (refus, panne) : nouvel essai 10 minutes plus tard
    res = json(data, 200, { 'Cache-Control': `public, max-age=${data.readable ? 6 * 3600 : 600}` });
  } else {
    const rts = await readJSON(env, 'news:rt', {});
    const sizes = clusterSizes(items, now);
    res = json({
      items: items.slice(0, LIST).map(({ frAt, ...it }) => ({ ...it, sources: sizes.get(it.cluster)?.size || 1 })),
      sources: (await newsSources(env)).map((s) => {
        const rt = rts[s.id] || {};
        return { id: s.id, name: s.name, cat: s.cat, lang: s.lang, kind: s.kind, ok: rt.ok ?? null, error: rt.error || null, last: rt.last || null, count: rt.count ?? 0 };
      }),
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  await caches.default.put(ck, res.clone());
  return res;
}

// Lecture d'une page pour le mode lecture : { status, headers: { 'content-type' }, body (octets) }
const articleFetch = (fetchFn) => async (u, { headers }) => {
  const r = await fetchFn(u, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  return { status: r.status, headers: { 'content-type': r.headers.get('Content-Type') || '' }, body: new Uint8Array(await r.arrayBuffer()) };
};

// ---------- Sources ajoutées depuis le Studio ----------
function safeUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname)) return null;
  return u;
}
async function text(u, fetchFn, headers = {}) {
  const r = await fetchFn(String(u), { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000) });
  if (r.status !== 200) throw new Error(`${new URL(String(u)).hostname} : HTTP ${r.status}`);
  return bodyText(r);
}
async function resolveYouTube(u, fetchFn) {
  let id = u.pathname.match(/\/channel\/(UC[\w-]{20,})/)?.[1];
  if (!id) {
    const html = await text(u, fetchFn, { 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1' });
    id = html.match(/"externalId":"(UC[\w-]+)"/)?.[1] || html.match(/channel_id=(UC[\w-]+)/)?.[1];
  }
  if (!id) throw new Error('Chaîne YouTube introuvable');
  const xml = await text(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, fetchFn);
  return { kind: 'youtube', channel: id, name: cleanText(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || 'YouTube', lang: parseFeed(xml).lang || 'en' };
}
async function resolveBsky(handle, fetchFn) {
  const p = JSON.parse(await text(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`, fetchFn));
  if (!p?.handle) throw new Error('Compte Bluesky introuvable');
  return { kind: 'bsky', handle: p.handle, name: `${p.displayName || p.handle} (Bluesky)`, lang: 'en' };
}
async function resolveFeed(u, fetchFn) {
  const body = await text(u, fetchFn, { Accept: 'application/rss+xml, application/atom+xml, text/html, */*' });
  const feed = parseFeed(body);
  if (feed.items.length) return { kind: 'rss', url: u.toString(), name: (cleanText(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || u.hostname).slice(0, 60), lang: feed.lang || 'en' };
  // Page web : on cherche le flux qu'elle annonce
  const alt = body.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!alt) throw new Error('Aucun flux RSS / Atom trouvé à cette adresse');
  const next = safeUrl(new URL(alt.replace(/&amp;/g, '&'), u).toString());
  if (!next) throw new Error('Flux annoncé non pris en charge');
  const b2 = await text(next, fetchFn);
  const f2 = parseFeed(b2);
  if (!f2.items.length) throw new Error('Le flux trouvé est vide');
  return { kind: 'rss', url: next.toString(), name: (cleanText(b2.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || next.hostname).slice(0, 60), lang: f2.lang || 'en' };
}

// Studio : { add: adresse ou @compte, cat, lang } ajoute une source ; { remove: id } la retire avec ses nouvelles
export async function editSources(env, body, { fetchFn = fetch } = {}) {
  const custom = await readJSON(env, 'news:custom', []);
  if (body?.remove) {
    const id = String(body.remove);
    await setRow(env, 'news:custom', JSON.stringify(custom.filter((s) => s.id !== id)));
    await setRow(env, 'news:items', JSON.stringify((await readJSON(env, 'news:items', [])).filter((it) => it.src !== id)));
    return { custom: custom.filter((s) => s.id !== id) };
  }
  const raw = String(body?.add || '').trim();
  if (!raw) throw new Error('Adresse vide');
  let found;
  const handle = raw.replace(/^@/, '').match(/^(?:https:\/\/bsky\.app\/profile\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i)?.[1];
  if (handle && (/bsky\.app\/profile\//i.test(raw) || /\.bsky\.social$/i.test(handle) || raw.startsWith('@'))) found = await resolveBsky(handle, fetchFn);
  else {
    const u = safeUrl(raw);
    if (!u) throw new Error('Adresse invalide (https:// attendu)');
    found = /(^|\.)youtube\.com$/i.test(u.hostname) ? await resolveYouTube(u, fetchFn) : await resolveFeed(u, fetchFn);
  }
  const key = found.channel || found.handle || found.url;
  const id = `c-${await hash(key)}`;
  if (custom.some((s) => s.id === id) || DEFAULT_SOURCES.some((s) => (s.channel || s.handle || s.url) === key)) throw new Error('Source déjà présente');
  const src = { id, ...found, cat: CATS.has(body.cat) ? body.cat : 'media', lang: LANGS.has(body.lang) ? body.lang : (LANGS.has(found.lang) ? found.lang : 'en') };
  await setRow(env, 'news:custom', JSON.stringify([...custom, src].slice(0, 100)));
  return { source: src, custom: [...custom, src] };
}

