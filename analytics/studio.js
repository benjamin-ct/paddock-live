// Page web du créateur (/studio/) : posts des séances et des grosses news, préparés dans le
// navigateur (téléphone compris) et publiés sur Facebook, Instagram et Threads depuis ce serveur,
// toujours après validation. Rien n'est publié tout seul. Vidéos du kit de lancement : brouillon
// TikTok et Short YouTube en privé, envoyés par ce serveur.
//
// Accès : clé dérivée du code du mode créateur (PBKDF2, calculée par l'appli et par la page, jamais
// le code lui-même sauf à l'activation, vérifiée contre son empreinte). Les jetons des réseaux
// (envoyés par l'appli) sont chiffrés avec cette clé (AES-GCM) : sans elle, la base ne contient
// rien d'utilisable. Essais ratés limités par adresse et par jour.
import { DEFAULT_SOURCES, feedUrl } from '../shared/news-sources.js';
import { extractArticle } from '../shared/article.js';
import { decodeBody } from '../shared/news-collect.js';
import { publishFacebook, publishInstagram, publishThreads, freshThreads, commentFacebook, replyThreads, withComment, storyInstagram, storyFacebook, reelInstagram, hostVideo, publishFacebookVideo, publishThreadsVideo, publishFacebookLink, publishThreadsLink } from '../shared/meta-publish.js';
import { publishBluesky, replyBluesky } from '../shared/bluesky-publish.js';
import { freshTiktok, freshYoutube, tiktokDraft, tiktokStatus, tiktokOutcome, youtubeUpload, tiktokCreator, tiktokDirect, TIKTOK_PRIVACY } from '../shared/video-publish.js';
import { addEntry, removeEntry, cleanKey } from '../shared/post-history.js';
import { postStats } from '../shared/post-stats.js';
import { recentPosts, importEntries } from './post-import.js';
import { trackPost, clickStats } from './clicks.js';
import { pushApi, notifyPhones } from './alerts.js';
import { feedbackApi } from './feedback.js';
import { freePhotos, PHOTO_UA } from './photos.js';
import { packFeeds } from '../shared/feed-pack.js';
import { cleanPostRequest, rewritePost } from './summarize.js';
import { buildSeason, SEASON_TTL } from './season-cache.js';
import { accountStats } from './account-stats.js';

// Empreinte du code (la même que dans l'appli) : SHA-256 de « paddock-live:<CODE> » (STUDIO_CODE_HASH :
// autre empreinte, pour les tests)
const CODE_HASH = '821f51db5c6d39c7ae10873a31723f8d4748fc2a925c6736f4a57afa7d2dacc0';
const MAX_FAILS = 30;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const ARCHIVE = 'https://livetiming.formula1.com/static/';
const IMG_HOSTS = new Set(['media.formula1.com', 'www.formula1.com', 'flagcdn.com', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'live.staticflickr.com']);   // + photos libres (photos.js)

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const unb64url = (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '='));
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const sameHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function getRow(env, k) {
  return (await env.DB.prepare('SELECT v FROM studio WHERE k = ?').bind(k).first())?.v ?? null;
}
async function setRow(env, k, v) {
  await env.DB.prepare('INSERT INTO studio (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, v, Date.now()).run();
}

// ---------- Saison résumée (onglet Saison du Studio) ----------
// Gardée dans la base, relue au plus toutes les 30 minutes (par la tâche planifiée, sinon à la
// demande) ; l'ancienne version sert si Jolpica ne répond pas.
// maxAge : âge accepté sans reconstruire (pronostics : la saison relue en arrière-plan suffit, le
// visiteur n'attend jamais la reconstruction)
export async function seasonRow(env, year, { now = Date.now(), fetchFn, wait, maxAge = SEASON_TTL } = {}) {
  const key = `season:${year}`;
  const row = JSON.parse(await getRow(env, key) || 'null');
  if (row && now - row.at < maxAge) return row;
  try {
    const fresh = { at: now, v: await buildSeason(year, { fetchFn, wait }) };
    await setRow(env, key, JSON.stringify(fresh));
    return fresh;
  } catch (err) {
    if (row) return row;
    throw err;
  }
}

// ---------- Essais ratés ----------
const ipOf = (req) => req.headers.get('CF-Connecting-IP') || 'local';
const today = () => new Date().toISOString().slice(0, 10);
async function fails(env, req) {
  return (await env.DB.prepare('SELECT n FROM studio_fail WHERE ip = ? AND day = ?').bind(ipOf(req), today()).first())?.n || 0;
}
async function failed(env, req) {
  await env.DB.prepare('INSERT INTO studio_fail (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ipOf(req), today()).run();
  await new Promise((r) => setTimeout(r, 600));
}

// ---------- Coffre chiffré (jetons des réseaux, connexion F1 TV) ----------
const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(raw, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(raw), enc.encode(JSON.stringify(data)));
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
}
async function open(raw, sealed) {
  if (!sealed) return null;
  const { iv, ct } = JSON.parse(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(raw), unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// Contenu accepté du coffre (rien d'autre n'est gardé)
function cleanVault(v) {
  const s = (x, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : '');
  const out = { at: Date.now() };
  const page = (p) => ({ pageId: s(p?.pageId, 40), pageName: s(p?.pageName, 120), pageToken: s(p?.pageToken), igId: s(p?.igId, 40), igUsername: s(p?.igUsername, 60) });
  // pages : toutes les pages du compte Meta (statistiques de chaque compte)
  if (v?.meta?.pageToken) out.meta = { ...page(v.meta), pages: (Array.isArray(v.meta.pages) ? v.meta.pages : []).slice(0, 10).map(page).filter((p) => p.pageToken) };
  for (const k of ['threads', 'threads2']) if (v?.[k]?.token) out[k] = { token: s(v[k].token), userId: s(v[k].userId, 40), username: s(v[k].username, 60), expiresAt: Number(v[k].expiresAt) || null };
  if (v?.bluesky?.appPassword) out.bluesky = { handle: s(v.bluesky.handle, 120), appPassword: s(v.bluesky.appPassword, 100), did: s(v.bluesky.did, 120) };
  for (const k of ['tiktok', 'tiktok2']) if (v?.[k]?.refreshToken) out[k] = { clientKey: s(v[k].clientKey, 200), clientSecret: s(v[k].clientSecret, 200), accessToken: s(v[k].accessToken), expiresAt: Number(v[k].expiresAt) || 0, refreshToken: s(v[k].refreshToken), openId: s(v[k].openId, 200), name: s(v[k].name, 120) };
  if (v?.youtube?.refreshToken) out.youtube = { clientId: s(v.youtube.clientId, 300), clientSecret: s(v.youtube.clientSecret, 200), accessToken: s(v.youtube.accessToken), expiresAt: Number(v.youtube.expiresAt) || 0, refreshToken: s(v.youtube.refreshToken), name: s(v.youtube.name, 120) };
  if (v?.f1tv) out.f1tv = s(v.f1tv, 6000);
  if (v?.f1tvOff === true) out.f1tvOff = true;
  return out;
}

// Clé de l'en-tête vérifiée : octets de la clé, ou réponse d'erreur
async function auth(req, env) {
  if (await fails(env, req) >= MAX_FAILS) return { error: json({ error: 'Trop d\'essais aujourd\'hui, réessayez demain' }, 429) };
  let raw;
  try { raw = unb64url(req.headers.get('X-Studio-Key') || ''); } catch { raw = null; }
  if (!raw || raw.length !== 32) { await failed(env, req); return { error: json({ error: 'Code incorrect' }, 401) }; }
  const verifier = await getRow(env, 'verifier');
  if (!verifier) return { error: json({ error: 'Page pas encore activée : activez-la depuis l\'appli (Posts → Publier… → Comptes…)' }, 409) };
  if (!sameHex(await sha(raw), verifier)) { await failed(env, req); return { error: json({ error: 'Code incorrect' }, 401) }; }
  return { raw };
}

// ---------- Jetons tenus à jour par le serveur (l'appli peut rester fermée) ----------
const jwtExp = (jwt) => {
  try { return (JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0) * 1000; } catch { return 0; }
};
// Session du compte formula1.com contenue dans le jeton (envoyée telle quelle à la F1)
const jwtSession = (jwt) => {
  try { const id = JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).SessionId; return typeof id === 'string' && id ? id : null; } catch { return null; }
};

// Connexion F1 TV (jeton de ~4 jours) : renouvelée dans ses dernières 24 heures avec la session du
// compte formula1.com (~30 jours), comme le fait l'appli. Clé et identifiant publics du site F1.
export async function freshF1tv(token, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!token || jwtExp(token) - now > 24 * 3600e3) return token;
  const sid = jwtSession(token);
  if (!sid) return token;
  try {
    const res = await fetchFn('https://api.formula1.com/v1/account/Subscriber/RetrieveSubscriber', {
      method: 'POST', body: '{}',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', apikey: 'fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7', 'CD-SystemId': '60a9ad84-e93d-480f-80d6-af37494f2e22', 'cd-sessionid': sid, orderSubmitted: 'true' },
    });
    if (res.status !== 200) return token;
    const next = (await res.json())?.data?.subscriptionToken;
    return next && jwtExp(next) > jwtExp(token) ? next : token;
  } catch { return token; }
}

// Jetons prolongés si besoin (Threads : 60 jours, F1 TV : 4 jours), coffre réenregistré s'ils changent
async function refresh(env, raw, vault) {
  const th = vault.threads?.token ? await freshThreads(vault.threads) : vault.threads;
  const th2 = vault.threads2?.token ? await freshThreads(vault.threads2) : vault.threads2;
  const f1tv = await freshF1tv(vault.f1tv);
  if (th === vault.threads && th2 === vault.threads2 && f1tv === vault.f1tv) return vault;
  const next = { ...vault, threads: th, threads2: th2, f1tv };
  await setRow(env, 'vault', await seal(raw, next));
  return next;
}

// Envoi de l'appli : ses jetons remplacent ceux du serveur, sauf s'ils sont plus anciens que ceux
// que le serveur a lui-même prolongés (appli restée fermée longtemps)
function keepNewer(old, incoming) {
  const out = { ...incoming };
  for (const k of ['threads', 'threads2']) if (old[k]?.token && out[k]?.token && old[k].userId === out[k].userId && (old[k].expiresAt || 0) > (out[k].expiresAt || 0)) out[k] = old[k];
  if (old.f1tv && out.f1tv && jwtSession(old.f1tv) === jwtSession(out.f1tv) && jwtExp(old.f1tv) > jwtExp(out.f1tv)) out.f1tv = old.f1tv;
  // TikTok, YouTube : jetons renouvelés par le serveur gardés s'ils sont plus récents (même compte, même app)
  for (const k of ['tiktok', 'tiktok2']) if (old[k] && out[k] && old[k].openId === out[k].openId && old[k].clientKey === out[k].clientKey && (old[k].expiresAt || 0) > (out[k].expiresAt || 0)) out[k] = { ...out[k], accessToken: old[k].accessToken, expiresAt: old[k].expiresAt, refreshToken: old[k].refreshToken };
  if (old.youtube && out.youtube && old.youtube.clientId === out.youtube.clientId && old.youtube.refreshToken === out.youtube.refreshToken && (old.youtube.expiresAt || 0) > (out.youtube.expiresAt || 0)) out.youtube = { ...out.youtube, accessToken: old.youtube.accessToken, expiresAt: old.youtube.expiresAt };
  // Jeton expiré dans l'appli (restée fermée) : celui que le serveur a renouvelé est gardé
  if (old.f1tv && !out.f1tv && !out.f1tvOff && jwtExp(old.f1tv) > Date.now()) out.f1tv = old.f1tv;
  delete out.f1tvOff;
  return out;
}

// ---------- Relais (le navigateur ne peut pas lire ces sites directement) ----------
async function cached(req, url, init, ttl) {
  const cache = caches.default;
  const key = new Request(`https://studio.cache/${encodeURIComponent(url)}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(url, init);
  if (res.status !== 200) return new Response(null, { status: [401, 403, 404].includes(res.status) ? res.status : 502 });
  const out = new Response(res.body, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': `max-age=${ttl}` } });
  await cache.put(key, out.clone());
  return out;
}

async function feed(req, url) {
  const s = DEFAULT_SOURCES.find((x) => x.id === url.searchParams.get('id') && x.kind !== 'bsky');
  if (!s) return json({ error: 'Source inconnue' }, 404);
  return cached(req, feedUrl(s), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } }, 180);
}

// Toutes les sources d'actu en une seule réponse (au lieu d'une requête par source depuis le
// téléphone) : lues en parallèle, 5 secondes au plus chacune. Gardées 2 minutes par le serveur : en
// mémoire (adresse workers.dev, où le cache de Cloudflare ne fonctionne pas) et dans le cache
// (domaine personnalisé)
const FEEDS_TTL = 120e3;
let feedsMemo = null;
let feedsLoading = null;
let feedsLoadingAt = 0;
const feedsGood = new Map();   // dernière lecture réussie de chaque source
export async function feeds({ fetchFn = fetch, now = Date.now() } = {}) {
  const key = new Request('https://studio.cache/feeds-all');
  // Réponse jamais gardée par le navigateur (« Actualiser » relit toujours le serveur)
  const send = (body) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=x-user-defined', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  if (feedsMemo && now - feedsMemo.at < FEEDS_TTL) return send(feedsMemo.body);
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) return send(hit.body);
  // Plusieurs « Actualiser » en même temps : une seule lecture des sources, partagée. Une lecture
  // commencée par une requête annulée peut ne jamais se terminer : au-delà de 15 s, une nouvelle part.
  if (!feedsLoading || now - feedsLoadingAt > 15e3) {
    feedsLoadingAt = now;
    const job = (async () => {
      const list = DEFAULT_SOURCES.filter((s) => s.kind === 'rss');
      let missing = 0;
      const parts = await Promise.all(list.map(async (s) => {
        try {
          const res = await fetchFn(feedUrl(s), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(8000) });
          if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
          const part = { id: s.id, type: res.headers.get('Content-Type') || '', body: new Uint8Array(await res.arrayBuffer()) };
          feedsGood.set(s.id, { ...part, at: now });
          return part;
        } catch {
          // Source lente ou en panne : dernière lecture réussie (moins de 6 heures), sinon absente
          missing++;
          const old = feedsGood.get(s.id);
          return old && now - old.at < 6 * 3600e3 ? old : null;
        }
      }));
      // Texte pour la compression de Cloudflare ; lu en octets par la page
      const body = packFeeds(parts);
      // Lecture incomplète : gardée 20 secondes seulement (la suivante réessaie les sources en panne)
      feedsMemo = { at: missing > list.length / 5 ? now - FEEDS_TTL + 20e3 : now, body };
      await caches.default.put(key, new Response(body, { headers: { 'Cache-Control': `max-age=${FEEDS_TTL / 1000}` } })).catch(() => {});
      return body;
    })();
    feedsLoading = job;
    job.finally(() => { if (feedsLoading === job) feedsLoading = null; }).catch(() => {});
  }
  return send(await feedsLoading);
}

async function archive(req, url, vault) {
  const p = url.searchParams.get('p') || '';
  if (!/^\d{4}\/[\w .,'()-]+(\/[\w .,'()-]+)*\.(json|jsonStream)$/.test(p) || p.includes('..')) return json({ error: 'Chemin invalide' }, 400);
  const ttl = p.endsWith('Index.json') ? 300 : 600;
  // Archives de la F1 : accès libre, sinon avec la connexion F1 TV de l'appli (refusées sans depuis octobre 2026)
  let res = await cached(req, ARCHIVE + p, { headers: { 'User-Agent': UA } }, ttl);
  const live = vault?.f1tv && jwtExp(vault.f1tv) > Date.now();
  if (res.status !== 200 && live) res = await cached(req, ARCHIVE + p, { headers: { 'User-Agent': UA, Authorization: `Bearer ${vault.f1tv}`, ascendontoken: vault.f1tv } }, ttl);
  if (res.status === 200) return res;
  // Raison précise, affichée par le Studio
  const error = res.status === 404 ? 'Archive pas encore publiée'
    : !vault?.f1tv ? 'Archives réservées aux abonnés F1 TV : connectez F1 TV dans l\'appli'
    : !live ? 'Connexion F1 TV expirée : ouvrez l\'appli Paddock Live pour la renvoyer (sinon reconnectez-vous sur formula1.com)'
    : res.status === 401 || res.status === 403 ? 'La F1 refuse la connexion F1 TV envoyée par l\'appli : reconnectez-vous sur formula1.com'
    : 'Archives de la F1 injoignables pour le moment';
  return json({ error }, res.status === 404 ? 404 : 502);
}

// Page d'un article de l'Actu (résumé détaillé, lu dans le navigateur) : https seulement, nom de site
// (pas d'adresse IP), 3 Mo au plus
export function articleUrl(u) {
  let x;
  try { x = new URL(u); } catch { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.hostname) || /^[\d.]+$/.test(x.hostname) || /(^|\.)(localhost|local|internal)$/i.test(x.hostname)) return null;
  return x.href;
}
async function page(req, url) {
  const u = articleUrl(url.searchParams.get('u') || '');
  if (!u) return json({ error: 'Adresse refusée' }, 400);
  const res = await cached(req, u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }, 1800);
  if (res.status !== 200) return json({ error: 'Le site refuse la lecture de cet article' }, 502);
  if (Number(res.headers.get('Content-Length') || 0) > 3e6) return json({ error: 'Page trop volumineuse' }, 413);
  // Rendue comme du texte (jamais comme une page du serveur), encodage d'origine gardé
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('Content-Type') || '')?.[1];
  return new Response(res.body, { headers: { 'Content-Type': `text/plain${charset ? `; charset=${charset}` : ''}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}

// Photo principale d'un article (livrée spéciale d'une écurie…) : lue sur la page, image seulement
async function articleImage(req, url) {
  const u = articleUrl(url.searchParams.get('u') || '');
  if (!u) return json({ error: 'Adresse refusée' }, 400);
  const res = await cached(req, u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }, 1800);
  if (res.status !== 200) return json({ error: 'Le site refuse la lecture de cet article' }, 502);
  const src = articleUrl(extractArticle(await decodeBody(res), u).image || '');
  if (!src) return json({ error: 'Pas de photo sur cet article' }, 404);
  const img = await cached(req, src, { headers: { 'User-Agent': UA } }, 86400);
  if (img.status !== 200 || !/^image\/(jpeg|png|webp)/.test(img.headers.get('Content-Type') || '')) return json({ error: 'Photo de l\'article illisible' }, 502);
  return img;
}

// Documents de la FIA (liste des documents d'un Grand Prix, PDF des commissaires) : grille officielle
const FIA_PAGE = /^\/documents\/championships\/fia-formula-one-world-championship-14(\/season\/season-\d{4}-\d+(\/event\/[\w%.'()-]+)?)?$/;
const FIA_PDF = /^\/system\/files\/decision-document\/[\w%.'()-]+\.pdf$/;
async function fia(req, url) {
  const p = url.searchParams.get('p') || '';
  if (p.includes('..') || !(FIA_PAGE.test(p) || FIA_PDF.test(p))) return json({ error: 'Adresse refusée' }, 400);
  return cached(req, `https://www.fia.com${p}`, { headers: { 'User-Agent': UA } }, FIA_PDF.test(p) ? 3600 : 300);
}

async function image(req, url) {
  let u;
  try { u = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'Adresse invalide' }, 400); }
  if (u.protocol !== 'https:' || !IMG_HOSTS.has(u.hostname)) return json({ error: 'Adresse refusée' }, 400);
  return cached(req, u.href, { headers: { 'User-Agent': u.hostname.endsWith('.wikimedia.org') ? PHOTO_UA : UA } }, 86400);
}

// Envoi sur un réseau (publication directe ou programmée). threads() : compte Threads à jour.
// video : vidéo du créateur (Reel sur Instagram, vidéo sur Facebook et Threads ; Bluesky garde les visuels)
// link : post « lien » { url, title, description } sans visuels, la carte de l'article affichée par le réseau
async function sendTo(net, vault, { text, comment, images, small = [], video = null, link = null }, threads) {
  if (link && net === 'facebook') return publishFacebookLink(vault.meta, text, link.url);
  if (link && net === 'threads') return publishThreadsLink(await threads(), text.slice(0, 500), link.url);
  if (link && net === 'bluesky') return publishBluesky(vault.bluesky, [...text].slice(0, 300).join(''), [], link);
  if (video && net === 'instagram') return reelInstagram(vault.meta, (await hostVideo(vault.meta, video)).url, text.slice(0, 2200));
  if (video && net === 'facebook') return withComment(() => publishFacebookVideo(vault.meta, text, video), comment, (id, t) => commentFacebook(vault.meta, id, t));
  if (video && net === 'threads') {
    const th = await threads();
    return withComment(() => publishThreadsVideo(th, vault.meta, text.slice(0, 500), video), comment, (id, t) => replyThreads(th, id, t));
  }
  if (net === 'bluesky') {
    const pics = small.slice(0, 4).map((blob) => ({ blob, width: 1080, height: 1350 }));   // format X de shared/social-draw.js
    return withComment(() => publishBluesky(vault.bluesky, [...text].slice(0, 300).join(''), pics), comment, (id, t) => replyBluesky(vault.bluesky, id, t));
  }
  if (net === 'facebook') return withComment(() => publishFacebook(vault.meta, text, images), comment, (id, t) => commentFacebook(vault.meta, id, t));
  if (net === 'instagram') return publishInstagram(vault.meta, text.slice(0, 2200), images);
  if (net === 'instagram-story') return storyInstagram(vault.meta, images);
  if (net === 'facebook-story') return storyFacebook(vault.meta, images);
  const th = await threads();
  return withComment(() => publishThreads(th, vault.meta, text.slice(0, 500), images), comment, (id, t) => replyThreads(th, id, t));
}
const NETS = ['facebook', 'instagram', 'threads', 'bluesky'];
const CLIPS = ['tiktok', 'youtube'];   // vidéo seulement : brouillon TikTok, Short YouTube
const VIDEO_MAX = 50e6;
const STORIES = ['instagram-story', 'facebook-story'];   // une story par visuel, sans texte
const STORY_STEP = 4;   // stories programmées : images envoyées par passage du serveur (limite de 50 sous-requêtes)
// Post « lien » : carte de l'article affichée par le réseau (Instagram, sans lien : visuels de l'onglet Post)
const LINKS = ['facebook', 'threads', 'bluesky'];
// Compte du réseau absent du coffre : raison, sinon null
function missing(net, vault) {
  if (CLIPS.includes(net)) return vault[net] ? null : `Compte ${net === 'tiktok' ? 'TikTok' : 'YouTube'} non envoyé : connectez-le dans l'appli (Comptes…), puis « Renvoyer les comptes »`;
  if (net === 'bluesky') return vault.bluesky ? null : 'Compte Bluesky non envoyé : connectez-le dans l\'appli';
  if (!vault.meta?.pageToken) return 'Comptes Meta non envoyés : connectez-les dans l\'appli';
  if (net === 'threads' && !vault.threads?.token) return 'Compte Threads non envoyé : connectez-le dans l\'appli';
  return null;
}
const resultOf = (r) => ({ url: r.url || null, id: r.id ?? null, comment: !!r.comment, commentError: r.commentError || null, ...(r.visible != null ? { visible: r.visible } : {}) });

// ---------- Publication : progression ligne par ligne (JSON), puis le résultat ----------
async function publish(req, env, raw, vault) {
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Formulaire illisible' }, 400); }
  const net = String(form.get('network') || '');
  // Liens remplacés par des liens suivis (clics comptés dans les statistiques)
  const { text, comment } = await trackPost(env, net, { text: String(form.get('text') || ''), comment: String(form.get('comment') || '').trim().slice(0, 500) }, String(form.get('title') || ''));
  const images = form.getAll('images').filter((f) => typeof f === 'object' && f && /^image\/(png|jpeg)$/.test(f.type) && f.size < 8e6).slice(0, 20);
  const v = form.get('video');
  const video = typeof v === 'object' && v && /^video\/(mp4|quicktime)$/.test(v.type) && v.size <= VIDEO_MAX ? v : null;
  if (v && !video) return json({ error: 'Vidéo MP4 ou MOV de 50 Mo au plus' }, 400);
  if (!NETS.includes(net) && !STORIES.includes(net) && !CLIPS.includes(net)) return json({ error: 'Réseau inconnu' }, 400);
  if (missing(net, vault)) return json({ error: missing(net, vault) }, 409);
  if (CLIPS.includes(net) && !video) return json({ error: 'Aucune vidéo' }, 400);
  if (!CLIPS.includes(net) && !images.length && !(video && net !== 'bluesky')) return json({ error: 'Aucune image' }, 400);
  // TikTok : publication directe si la page envoie ses réglages, sinon brouillon
  const direct = net === 'tiktok' && form.get('tiktok') ? tiktokOptions(form.get('tiktok')) : null;
  if (direct?.error) return json({ error: direct.error }, 400);
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const line = (o) => w.write(enc.encode(`${JSON.stringify(o)}\n`));
  (async () => {
    try {
      await line({ step: video ? 'Envoi de la vidéo…' : 'Envoi des images…' });
      const r = CLIPS.includes(net) ? await sendClip(net, () => clipAccount(env, raw, vault, net), new Uint8Array(await video.arrayBuffer()), video.type, text, direct)
        : await sendTo(net, vault, { text, comment, images, small: images, video }, async () => (await refresh(env, raw, vault)).threads);
      await line({ done: true, ...resultOf(r), ...(r.note ? { note: r.note } : {}) });
    } catch (err) {
      await line({ error: String(err?.message || err).slice(0, 300) });
    } finally {
      await w.close();
    }
  })();
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------- Vidéo du kit de lancement : brouillon TikTok, Short YouTube en privé, Reel Instagram ----------
// Seulement les vidéos du kit (fichiers du site) : rien d'autre ne transite par ici.
async function sendVideo(req, env, raw, vault, url) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const net = String(body?.network || '');
  const src = String(body?.src || '');
  // État d'un brouillon TikTok déjà envoyé (encore en traitement au premier coup d'œil)
  if (net === 'tiktok-status') {
    const id = String(body?.id || '');
    if (!vault.tiktok || !/^[\w.~-]{1,120}$/.test(id)) return json({ error: 'Envoi inconnu' }, 400);
    try {
      const acc = await freshTiktok(vault.tiktok);
      if (acc !== vault.tiktok) await setRow(env, 'vault', await seal(raw, { ...vault, tiktok: acc }));
      return json({ ok: true, ...tiktokOutcome(id, await tiktokStatus(acc.accessToken, id)) });
    } catch (err) { return json({ error: String(err?.message || err).slice(0, 300) }, 502); }
  }
  if (net !== 'tiktok' && net !== 'youtube' && net !== 'instagram-reel') return json({ error: 'Réseau inconnu' }, 400);
  if (!/^\/kit\/[a-z]+\/video\.mp4$/.test(src)) return json({ error: 'Vidéo inconnue' }, 400);
  if (net === 'instagram-reel') {
    if (!vault.meta?.igId) return json({ error: 'Compte Instagram non envoyé : connectez-le dans l\'appli' }, 409);
    // Instagram lit lui-même la vidéo à son adresse publique
    try {
      const r = await reelInstagram(vault.meta, new URL(src, url).href, String(body?.text || ''));
      return json({ ok: true, url: r.url, id: r.id ?? null, note: 'Reel publié' });
    } catch (err) { return json({ error: String(err?.message || err).slice(0, 300) }, 502); }
  }
  if (missing(net, vault)) return json({ error: missing(net, vault) }, 409);
  if (!/^\/kit\/[a-z]+\/video\.mp4$/.test(src) || !env.ASSETS) return json({ error: 'Vidéo inconnue' }, 400);
  const file = await env.ASSETS.fetch(new Request(new URL(src, url)));
  if (!file.ok) return json({ error: 'Vidéo du kit introuvable' }, 404);
  try {
    const r = await sendClip(net, () => clipAccount(env, raw, vault, net), new Uint8Array(await file.arrayBuffer()), 'video/mp4', String(body?.text || ''));
    return json({ ok: true, url: r.url || null, id: r.id ?? null, note: r.note, ...(r.pending ? { pending: true } : {}) });
  } catch (err) { return json({ error: err.message }, 502); }
}
// Brouillon TikTok ou Short YouTube. account() : compte aux jetons à jour
// direct : réglages d'une publication directe sur TikTok (sinon brouillon)
async function sendClip(net, account, video, mime, text, direct = null) {
  try {
    const acc = await account();
    if (net === 'youtube') return await youtubeUpload(acc.accessToken, video, mime, text);
    return direct ? await tiktokDirect(acc.accessToken, video, mime, direct) : await tiktokDraft(acc.accessToken, video, mime);
  } catch (err) {
    throw new Error(err.code === 'invalid_grant' || err.code === 'invalid_client'
      ? `Connexion ${net === 'tiktok' ? 'TikTok' : 'YouTube'} expirée : reconnectez-vous dans l'appli (Comptes…), puis « Renvoyer les comptes »`
      : String(err?.message || err).slice(0, 300));
  }
}

// Compte TikTok ou YouTube aux jetons à jour (gardés par le serveur s'ils ont été renouvelés)
async function clipAccount(env, raw, vault, net) {
  const acc = await (net === 'youtube' ? freshYoutube : freshTiktok)(vault[net]);
  if (acc !== vault[net]) await setRow(env, 'vault', await seal(raw, { ...vault, [net]: acc }));
  return acc;
}
// Réglages de publication directe TikTok envoyés par la page : vérifiés, sinon raison du refus
function tiktokOptions(raw) {
  let o;
  try { o = JSON.parse(String(raw || '')); } catch { return { error: 'Réglages TikTok illisibles' }; }
  if (!o || typeof o !== 'object') return { error: 'Réglages TikTok illisibles' };
  if (!TIKTOK_PRIVACY.includes(o.privacy)) return { error: 'Choisissez qui peut voir la vidéo sur TikTok' };
  if (o.brandContent && o.privacy === 'SELF_ONLY') return { error: 'Un contenu de marque ne peut pas être privé sur TikTok' };
  const title = String(o.title || '');
  if (title.length > 2200) return { error: 'Texte TikTok trop long (2 200 caractères au plus)' };
  return { title, privacy: o.privacy, comment: o.comment === true, duet: o.duet === true, stitch: o.stitch === true, brandOrganic: o.brandOrganic === true, brandContent: o.brandContent === true,
    username: /^[\w.]{1,64}$/.test(o.username || '') ? o.username : '' };
}

// ---------- Publications programmées ----------
// Le post (textes de chaque réseau, visuels) est gardé dans la base et publié à l'heure choisie par
// le relevé du serveur (toutes les minutes), même page fermée. Stories comprises (visuels au format Story). Les jetons
// utiles sont copiés pour l'occasion, chiffrés avec une clé tirée du secret du serveur (STATS_KEY,
// hors de la base) : la base seule ne permet toujours pas de publier. Visuels et jetons sont effacés
// une fois la publication faite. Vidéo (50 Mo au plus) gardée dans le stockage R2 (MEDIA), pas dans la base.
const SCHED = { max: 20, ahead: 7 * 86400e3, late: 24 * 3600e3, keep: 7 * 86400e3, running: 15 * 60e3, img: 1.4e6 };
const schedKey = async (env) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`paddock-live-schedule-v1:${env.STATS_KEY}`)));
// Base64 par morceaux (visuels de plus d'un Mo)
function b64big(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
async function rowsLike(env, prefix) {
  const r = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind(`${prefix}%`).all();
  return r.results || [];
}
const delLike = (env, prefix) => env.DB.prepare('DELETE FROM studio WHERE k LIKE ?').bind(`${prefix}%`).run();

// Programmations avec l'état de chaque réseau (pending, running, done, error, expired)
async function schedJobs(env) {
  const states = new Map((await rowsLike(env, 'schedpost:')).map((r) => [r.k, JSON.parse(r.v)]));
  return (await rowsLike(env, 'sched:')).map((r) => {
    const j = JSON.parse(r.v);
    return { ...j, nets: Object.fromEntries(j.posts.map((p) => [p.network, states.get(`schedpost:${j.id}:${p.network}`) || { status: 'pending' }])) };
  }).sort((a, b) => a.at - b.at);
}
const schedSummary = (j) => ({ id: j.id, at: j.at, title: j.title, nets: j.nets });

async function scheduleAdd(req, env, raw, vault, now = Date.now()) {
  if (!env.STATS_KEY) return json({ error: 'Secret du serveur absent : programmation impossible' }, 503);
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Formulaire illisible' }, 400); }
  const at = Number(form.get('at'));
  if (!Number.isFinite(at) || at < now - 60e3 || at > now + SCHED.ahead) return json({ error: 'Date de publication invalide (dans les 7 prochains jours)' }, 400);
  let posts, record;
  try { posts = JSON.parse(String(form.get('posts') || '[]')); record = JSON.parse(String(form.get('record') || 'null')); } catch { return json({ error: 'JSON invalide' }, 400); }
  const v0 = form.get('video');
  const video = typeof v0 === 'object' && v0 && /^video\/(mp4|quicktime)$/.test(v0.type) && v0.size <= VIDEO_MAX ? v0 : null;
  if (v0 && !video) return json({ error: 'Vidéo MP4 ou MOV de 50 Mo au plus' }, 400);
  if (video && !env.MEDIA) return json({ error: 'Stockage des vidéos (R2) absent du serveur' }, 503);
  let link = null;
  try { link = JSON.parse(String(form.get('link') || 'null')); } catch { return json({ error: 'JSON invalide' }, 400); }
  if (link) {
    if (video || !/^https:\/\/\S+$/.test(String(link.url || '')) || String(link.url).length > 1000) return json({ error: 'Lien invalide' }, 400);
    link = { url: String(link.url), title: String(link.title || '').slice(0, 300), description: String(link.description || '').slice(0, 500) };
  }
  if (!Array.isArray(posts) || !posts.length) return json({ error: 'Aucun réseau choisi' }, 400);
  const nets = posts.map((p) => String(p?.network || ''));
  // Stories ou posts du fil, jamais les deux : les visuels n'ont pas le même format ; TikTok et YouTube avec une vidéo
  const allowed = link ? [...LINKS, 'instagram'] : video ? [...NETS, ...CLIPS] : nets.some((n) => STORIES.includes(n)) ? STORIES : NETS;
  posts = posts.map((p) => ({ network: String(p?.network || ''), text: String(p?.text || '').slice(0, 5000), comment: String(p?.comment || '').trim().slice(0, 500) }));
  if (nets.some((n) => !allowed.includes(n)) || new Set(nets).size !== nets.length) return json({ error: 'Réseau inconnu' }, 400);
  for (const p of posts) if (missing(p.network, vault)) return json({ error: missing(p.network, vault) }, 409);
  const files = (k, n) => form.getAll(k).filter((f) => typeof f === 'object' && f && /^image\/(png|jpeg)$/.test(f.type)).slice(0, n);
  const sets = { ig: files('ig', 20), x: files('x', 4) };
  if ([...sets.ig, ...sets.x].some((f) => f.size > SCHED.img)) return json({ error: 'Visuel trop lourd (1,4 Mo au plus)' }, 413);
  if ((link ? nets.includes('instagram') : !video && posts.some((p) => p.network !== 'bluesky')) && !sets.ig.length) return json({ error: 'Aucune image' }, 400);
  if (!link && posts.some((p) => p.network === 'bluesky') && !sets.x.length) return json({ error: 'Aucune image' }, 400);
  const tiktok = video && nets.includes('tiktok') && form.get('tiktok') ? tiktokOptions(form.get('tiktok')) : null;
  if (tiktok?.error) return json({ error: tiktok.error }, 400);
  if ((await schedJobs(env)).filter((j) => Object.values(j.nets).some((s) => s.status === 'pending')).length >= SCHED.max) return json({ error: `${SCHED.max} publications programmées au plus` }, 409);
  // Jetons du moment (Threads prolongé si besoin), seulement ceux des réseaux choisis
  const v = await refresh(env, raw, vault);
  const keys = { ...(nets.some((n) => n !== 'bluesky' && !CLIPS.includes(n)) ? { meta: v.meta } : {}), ...Object.fromEntries(['threads', 'bluesky', ...CLIPS].filter((n) => nets.includes(n)).map((n) => [n, v[n]])) };
  const id = hex(crypto.getRandomValues(new Uint8Array(8)));
  for (const [set, list] of Object.entries(sets)) {
    for (const [i, f] of list.entries()) await setRow(env, `schedimg:${id}:${set}:${i}`, JSON.stringify({ type: f.type, data: b64big(new Uint8Array(await f.arrayBuffer())) }));
  }
  if (video) await env.MEDIA.put(`sched/${id}`, video, { httpMetadata: { contentType: video.type } });
  const job = { id, at, title: String(form.get('title') || '').slice(0, 200), record: record && typeof record === 'object' ? record : null, posts, sets: { ig: sets.ig.length, x: sets.x.length }, video: video ? video.type : null, tiktok, link, keys: await seal(await schedKey(env), keys), created: now };
  await setRow(env, `sched:${id}`, JSON.stringify(job));
  return json({ item: schedSummary({ ...job, nets: Object.fromEntries(nets.map((n) => [n, { status: 'pending' }])) }) });
}

async function scheduleCancel(env, id) {
  if (!/^[a-f0-9]{16}$/.test(String(id))) return json({ error: 'Publication inconnue' }, 404);
  const j = (await schedJobs(env)).find((x) => x.id === id);
  if (!j) return json({ error: 'Publication inconnue' }, 404);
  if (Object.values(j.nets).some((s) => s.status === 'running')) return json({ error: 'Publication en cours' }, 409);
  await delLike(env, `schedimg:${id}:`);
  await env.MEDIA?.delete(`sched/${id}`);
  await delLike(env, `schedpost:${id}:`);
  await delLike(env, `sched:${id}`);
  return json({ items: (await schedJobs(env)).map(schedSummary) });
}

// Notification de fin d'une programmation : réseaux publiés, ou ceux en erreur
const NET_LABEL = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', bluesky: 'Bluesky', tiktok: 'TikTok', youtube: 'YouTube', 'instagram-story': 'Story Instagram', 'facebook-story': 'Story Facebook' };
function schedNotice(j) {
  const nets = Object.entries(j.nets);
  const bad = nets.filter(([, s]) => s.status !== 'done' || s.commentError || s.visible === false).map(([n]) => NET_LABEL[n] || n);
  const ok = nets.filter(([, s]) => s.status === 'done').map(([n]) => NET_LABEL[n] || n);
  return {
    title: bad.length ? `Publication programmée : souci sur ${bad.join(', ')}` : 'Publication programmée : publiée',
    body: `${j.title || 'Post'}${ok.length ? ` · publié sur ${ok.join(', ')}` : ''}`,
    id: `sched-${j.id}`, url: '/studio/?alert=schedule',
  };
}

// Relevé du serveur : publie les programmations arrivées à l'heure, un réseau par passage. Renvoie
// { published } si un post est parti (le relevé des alertes attend alors le passage suivant), null sinon.
export async function runSchedule(env, { now = Date.now() } = {}) {
  if (!env.DB || !env.STATS_KEY) return null;
  const jobs = await schedJobs(env);
  const setState = (j, net, st) => setRow(env, `schedpost:${j.id}:${net}`, JSON.stringify(st));
  // Un seul réseau par passage (toutes les minutes) : chacun a toutes les sous-requêtes permises à un passage
  // du Worker (50 ; un carrousel Instagram en prend déjà une bonne part). Réseau marqué « en cours » avant
  // l'envoi, commencé dans les 40 premières secondes : le passage suivant (une minute plus tard, parfois en
  // même temps que celui-ci) relit les états après lui et ne renvoie jamais un post
  const start = Date.now();
  let out = null;
  for (const j of jobs) {
    // Envoi resté « en cours » (serveur interrompu) : jamais renvoyé en double
    for (const [net, st] of Object.entries(j.nets)) {
      if (st.status === 'running' && now - (st.started || 0) > SCHED.running) { st.status = 'error'; st.error = 'Envoi interrompu : vérifiez sur le réseau'; await setState(j, net, st); }
    }
    const pending = j.at <= now ? j.posts.filter((p) => j.nets[p.network].status === 'pending') : [];
    const due = !out && Date.now() - start <= 40e3 ? pending.slice(0, 1) : [];
    if (pending.length && now - j.at > SCHED.late) {
      for (const p of pending) { j.nets[p.network].status = 'expired'; await setState(j, p.network, j.nets[p.network]); }
    } else if (due.length) {
      for (const p of due) { Object.assign(j.nets[p.network], { status: 'running', started: now }); await setState(j, p.network, j.nets[p.network]); }
      const keys = await open(await schedKey(env), j.keys).catch(() => null);
      const imgs = async (set, from = 0, to = j.sets?.[set] || 0) => {
        const list = [];
        for (let i = from; i < Math.min(to, j.sets?.[set] || 0); i++) {
          const row = JSON.parse(await getRow(env, `schedimg:${j.id}:${set}:${i}`) || 'null');
          if (row) list.push(new Blob([unb64(row.data)], { type: row.type }));
        }
        return list;
      };
      // Vidéo relue pour chaque réseau : une seule copie en mémoire à la fois
      const media = async () => {
        const o = await env.MEDIA?.get(`sched/${j.id}`);
        if (!o) throw new Error('Vidéo effacée du serveur');
        return new Blob([await o.arrayBuffer()], { type: j.video });
      };
      for (const p of due) {
        const st = j.nets[p.network];
        try {
          if (!keys) throw new Error('Jetons effacés');
          const tr = await trackPost(env, p.network, { text: p.text, comment: p.network === 'instagram' ? '' : p.comment }, j.record?.title);
          const video = j.video && p.network !== 'bluesky' ? await media() : null;
          // Stories : STORY_STEP images par passage (Instagram fait 4 à 6 demandes par image), suite au passage suivant
          const story = STORIES.includes(p.network) && { from: st.sent || 0, total: Math.min(j.sets?.ig || 0, 10) };
          const r = story ? await sendTo(p.network, keys, { images: await imgs('ig', story.from, story.from + STORY_STEP) })
            : CLIPS.includes(p.network)
            ? await sendClip(p.network, () => (p.network === 'youtube' ? freshYoutube : freshTiktok)(keys[p.network]), new Uint8Array(await video.arrayBuffer()), j.video, tr.text, j.tiktok)
            : j.link && LINKS.includes(p.network) ? await sendTo(p.network, keys, { text: tr.text, link: { ...j.link, url: (await trackPost(env, p.network, { text: j.link.url }, j.record?.title)).text } }, () => freshThreads(keys.threads))
            : await sendTo(p.network, keys, { text: tr.text, comment: tr.comment, images: p.network === 'bluesky' || video ? [] : await imgs('ig'), small: p.network === 'bluesky' ? await imgs('x') : [], video }, () => freshThreads(keys.threads));
          if (story) Object.assign(st, { sent: story.from + r.count, total: story.total });
          Object.assign(st, { status: story && st.sent < story.total ? 'pending' : 'done', at: Date.now(), ...resultOf(r), ...(r.note ? { note: r.note } : {}) });
          // Stories (24 heures) : pas dans l'historique, qui garde le post du fil
          if (j.record && !STORIES.includes(p.network)) await setRow(env, 'history', JSON.stringify(addEntry(JSON.parse(await getRow(env, 'history') || '[]'), { ...j.record, at: Date.now(), nets: { [p.network]: { id: st.id, url: st.url } } })));
        } catch (err) {
          Object.assign(st, { status: 'error', error: `${String(err?.message || err).slice(0, 300)}${st.sent ? ` (${st.sent} stories publiées sur ${st.total})` : ''}` });
        }
        await setState(j, p.network, st);
        out = { published: p.network, id: j.id };
      }
    }
    // Programmation terminée : tout publié sans souci, effacée aussitôt (plus dans la liste du Studio) ;
    // sinon (erreur, commentaire refusé…) visuels, vidéo et jetons effacés, la trace gardée 7 jours.
    // Une fois, au passage suivant le dernier envoi (sous-requêtes de celui-ci) : notification sur le téléphone
    const states = Object.values(j.nets);
    const finish = out?.id !== j.id && j.keys;   // jetons effacés après la première fin : une seule notification
    if (finish && states.every((s) => !['pending', 'running'].includes(s.status))) await notifyPhones(env, schedNotice(j), { now }).catch(() => 0);
    if (out?.id === j.id) continue;
    if (states.every((s) => s.status === 'done' && !s.commentError && s.visible !== false)) {
      await delLike(env, `schedimg:${j.id}:`); await env.MEDIA?.delete(`sched/${j.id}`); await delLike(env, `schedpost:${j.id}:`); await delLike(env, `sched:${j.id}`);
    } else if (states.every((s) => !['pending', 'running'].includes(s.status))) {
      if (j.keys) { await delLike(env, `schedimg:${j.id}:`); await env.MEDIA?.delete(`sched/${j.id}`); const { nets, ...rest } = j; await setRow(env, `sched:${j.id}`, JSON.stringify({ ...rest, keys: null })); }
      if (now - j.at > SCHED.keep) { await delLike(env, `schedpost:${j.id}:`); await delLike(env, `sched:${j.id}`); }
    }
  }
  return out;
}

// ---------- Routes /studio/api/… ----------
export async function studioApi(req, env, url) {
  if (!env.DB) return json({ error: 'Base indisponible' }, 503);
  const path = url.pathname.slice('/studio/api/'.length);

  // Activation depuis l'appli : code vérifié une fois, puis seule la clé dérivée sert
  if (path === 'init' && req.method === 'POST') {
    if (await fails(env, req) >= MAX_FAILS) return json({ error: 'Trop d\'essais aujourd\'hui' }, 429);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const code = String(body?.code || '').trim().toUpperCase();
    if (!sameHex(await sha(`paddock-live:${code}`), env.STUDIO_CODE_HASH || CODE_HASH)) { await failed(env, req); return json({ error: 'Code incorrect' }, 401); }
    let raw;
    try { raw = unb64url(body.key); } catch { raw = null; }
    if (!raw || raw.length !== 32) return json({ error: 'Clé invalide' }, 400);
    await setRow(env, 'verifier', await sha(raw));
    await setRow(env, 'vault', await seal(raw, cleanVault(body.vault)));
    return json({ ok: true });
  }

  const a = await auth(req, env);
  if (a.error) return a.error;
  let vault = await open(a.raw, await getRow(env, 'vault')).catch(() => null) || {};

  if (path === 'sync' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    await setRow(env, 'vault', await seal(a.raw, keepNewer(vault, cleanVault(body?.vault))));
    return json({ ok: true });
  }
  if (path === 'forget' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM studio').run();
    return json({ ok: true });
  }
  if (path === 'me' && req.method === 'GET') {
    vault = await refresh(env, a.raw, vault);
    return json({
      facebook: vault.meta?.pageName || null, instagram: vault.meta?.igId ? `@${vault.meta.igUsername || ''}` : null,
      threads: vault.threads?.token ? `@${vault.threads.username || ''}` : null, bluesky: vault.bluesky ? `@${vault.bluesky.handle}` : null, f1tv: !!vault.f1tv, at: vault.at || null,
      tiktok: vault.tiktok ? vault.tiktok.name || 'TikTok' : null, youtube: vault.youtube ? vault.youtube.name || 'YouTube' : null,
      sources: DEFAULT_SOURCES.filter((s) => s.kind === 'rss').map(({ id, name, cat, lang, filter }) => ({ id, name, cat, lang, filter: filter || null })),
    });
  }
  // Post écrit à la main : texte mis en forme par l'IA (titre, résumé, points clés)
  if (path === 'rewrite' && req.method === 'POST') {
    if (!env.AI) return json({ error: 'IA indisponible' }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const text = cleanPostRequest(body);
    if (!text) return json({ error: 'Texte trop court' }, 400);
    const r = await rewritePost(env, text);
    return json(r.limited ? { error: 'Plafond du jour atteint, réessayez demain' } : r, r.limited ? 429 : r.error ? 502 : 200);
  }
  // Journal des publications (partagé avec l'appli)
  if (path === 'history' || path === 'history/remove') {
    const list = JSON.parse(await getRow(env, 'history') || '[]');
    const removed = JSON.parse(await getRow(env, 'history-removed') || '[]');
    if (req.method === 'GET' && path === 'history') return json({ items: list, removed });
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      // Post supprimé sur les réseaux : retiré du journal et des statistiques
      if (path === 'history/remove') {
        if (!cleanKey(body?.key)) return json({ error: 'Post inconnu' }, 400);
        const r = removeEntry(list, removed, body.key);
        await setRow(env, 'history', JSON.stringify(r.items));
        await setRow(env, 'history-removed', JSON.stringify(r.removed));
        return json(r);
      }
      const next = addEntry(list, body?.entry);
      await setRow(env, 'history', JSON.stringify(next));
      // Même post republié : il compte de nouveau
      const k = cleanKey(body?.entry?.key);
      if (k && removed.includes(k)) await setRow(env, 'history-removed', JSON.stringify(removed.filter((x) => x !== k)));
      return json({ items: next });
    }
  }
  // Posts publiés hors du Studio (à la main, kit de démarrage) : retrouvés sur les comptes reliés
  if (path === 'history/import' && req.method === 'POST') {
    const v = await refresh(env, a.raw, vault);
    const { posts, errors } = await recentPosts({ meta: v.meta, threads: v.threads, bluesky: v.bluesky });
    const list = JSON.parse(await getRow(env, 'history') || '[]');
    const removed = JSON.parse(await getRow(env, 'history-removed') || '[]');
    const add = importEntries(list, removed, posts);
    if (add.length) await setRow(env, 'history', JSON.stringify(add.reduce(addEntry, list)));
    return json({ added: add.length, errors });
  }
  // Chiffres des posts et chiffres des comptes : deux appels, chacun sous la limite de 50 requêtes
  // vers l'extérieur par appel du serveur (ensemble, Facebook ou TikTok la dépassaient)
  if (path === 'stats' && req.method === 'GET') {
    const v = await refresh(env, a.raw, vault);
    // 6 posts au plus
    const posts = await postStats(JSON.parse(await getRow(env, 'history') || '[]'), { meta: v.meta, threads: v.threads, bluesky: v.bluesky }, { limit: 6 });
    return json({ ...posts, clicks: await clickStats(env).catch(() => null) });
  }
  if (path === 'stats/accounts' && req.method === 'GET') {
    let v = await refresh(env, a.raw, vault);
    // Jetons YouTube et TikTok renouvelés l'un après l'autre : chaque enregistrement garde le précédent
    const tokens = {};
    for (const net of [...CLIPS, 'tiktok2']) {
      // Renouvellement refusé : sa raison est montrée (au lieu de « compte non relié »)
      const acc = v[net] ? await clipAccount(env, a.raw, v, net).catch((err) => { tokens[`${net}Error`] = String(err?.message || err).slice(0, 120); return null; }) : null;
      if (acc) { v = { ...v, [net]: acc }; tokens[`${net}Token`] = acc.accessToken; }
    }
    return json({ accounts: await accountStats(v, tokens) });
  }
  if (path === 'season' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year'));
    if (!Number.isInteger(year) || year < 1950 || year > new Date().getUTCFullYear() + 1) return json({ error: 'Année invalide' }, 400);
    try { return json(await seasonRow(env, year)); } catch (err) { return json({ error: String(err?.message || err) }, 502); }
  }
  if (path === 'feed' && req.method === 'GET') return feed(req, url);
  if (path === 'feeds' && req.method === 'GET') return feeds();
  if (path === 'archive' && req.method === 'GET') return archive(req, url, await refresh(env, a.raw, vault));
  if (path === 'img' && req.method === 'GET') return image(req, url);
  if (path === 'photos' && req.method === 'GET') return json(await freePhotos(url.searchParams.get('q')));
  if (path === 'fia' && req.method === 'GET') return fia(req, url);
  if (path === 'page' && req.method === 'GET') return page(req, url);
  if (path === 'artimg' && req.method === 'GET') return articleImage(req, url);
  if (path === 'schedule' && req.method === 'GET') return json({ items: (await schedJobs(env)).map(schedSummary) });
  if (path === 'schedule' && req.method === 'POST') return scheduleAdd(req, env, a.raw, vault);
  if (path === 'schedule/cancel' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    return scheduleCancel(env, body?.id);
  }
  // Texte avec ses liens suivis (X : partagé depuis le téléphone ; appli : publication directe)
  if (path === 'links' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const out = await trackPost(env, String(body?.net || ''), { text: String(body?.text || '').slice(0, 5000), comment: String(body?.comment || '').slice(0, 1000) }, String(body?.title || ''));
    return json(out);
  }
  if (path === 'publish' && req.method === 'POST') {
    if (!vault.meta?.pageToken && !vault.bluesky) return json({ error: 'Comptes non envoyés : activez la page depuis l\'appli' }, 409);
    return publish(req, env, a.raw, vault);
  }
  if (path === 'video' && req.method === 'POST') return sendVideo(req, env, a.raw, vault, url);
  // Compte TikTok relu avant une publication directe : nom, visibilités et interactions permises, durée maximale
  if (path === 'tiktok-creator' && req.method === 'GET') {
    if (!vault.tiktok) return json({ error: missing('tiktok', vault) }, 409);
    try {
      return json(await tiktokCreator((await clipAccount(env, a.raw, vault, 'tiktok')).accessToken));
    } catch (err) {
      const m = String(err?.message || err);
      return json({ error: /scope/i.test(m) ? 'Publication directe pas encore autorisée : activez « Direct Post » (video.publish) dans votre app TikTok, cochez « Publication directe » dans l\'appli (Comptes…, TikTok), reconnectez TikTok puis « Renvoyer les comptes »' : m.slice(0, 300), scope: /scope/i.test(m) }, 502);
    }
  }
  // Alertes des grosses news sur le téléphone (abonnements, dernières alertes)
  const pushed = await pushApi(path, req, env);
  if (pushed) return pushed;
  // Questions et suggestions des utilisateurs
  const fb = await feedbackApi(path, req, env, url);
  if (fb) return fb;
  return json({ error: 'Introuvable' }, 404);
}
