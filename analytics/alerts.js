// Alertes des grosses news sur le téléphone du créateur : le serveur relève les flux d'actu toutes
// les 5 minutes (sources officielles à chaque fois, médias à tour de rôle), repère les nouvelles
// importantes et envoie une notification (Web Push, standard des navigateurs, gratuit) à la page
// web du créateur installée sur le téléphone. La notification ouvre le post prêt à relire.
//
// Notifications chiffrées pour chaque abonnement (RFC 8291, aes128gcm) et signées par le serveur
// (VAPID, RFC 8292) ; les clés du serveur sont créées au premier envoi et gardées en base.
import { DEFAULT_SOURCES, feedUrl } from '../shared/news-sources.js';
import { feedItems, decodeBody } from '../shared/news-collect.js';
import { newsSimilarity } from '../shared/news.js';
import { newsKind, sameStoryOf, isBreaking, LOOKS } from '../shared/social-news.js';
import { translateBatch } from './translate.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
// Services de notification des navigateurs (Chrome/Android, Firefox, Safari/iPhone, Edge)
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+(\.[\w-]+)*\.push\.apple\.com|[\w-]+(\.[\w-]+)*\.notify\.windows\.com)$/;
const OFFICIAL = new Set(['f1', 'fia-press', 'fia-news']);
const MEDIA_PER_RUN = 3;
const FRESH = 6 * 3600e3;        // nouvelles de moins de 6 heures seulement
const MAX_ALERTS = 40;           // gardées pour la page
const MAX_PER_RUN = 3;
const MAX_PER_DAY = 8;
const MAX_SUBS = 10;
const CONTACT = 'https://github.com/benjamin-ct/paddock-live';

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function getRow(env, k) {
  return (await env.DB.prepare('SELECT v FROM studio WHERE k = ?').bind(k).first())?.v ?? null;
}
async function setRow(env, k, v) {
  await env.DB.prepare('INSERT INTO studio (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, v, Date.now()).run();
}
const readJSON = async (env, k, fallback) => { try { return JSON.parse(await getRow(env, k)) ?? fallback; } catch { return fallback; } };

// ---------- Clés du serveur (VAPID) ----------
export async function vapidKeys(env) {
  const saved = await readJSON(env, 'vapid', null);
  if (saved?.jwk && saved?.pub) return saved;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = { jwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)) };
  await setRow(env, 'vapid', JSON.stringify(keys));
  return keys;
}

async function vapidHeader(keys, endpoint, now = Date.now()) {
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: CONTACT })));
  const key = await crypto.subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${keys.pub}`;
}

// ---------- Chiffrement du message (RFC 8291) ----------
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export async function encryptPush(sub, payload) {
  const uaPublic = unb64url(sub.keys.p256dh);
  const authSecret = unb64url(sub.keys.auth);
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = concat(enc.encode(payload), new Uint8Array([2]));   // dernier (et seul) bloc
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, data));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

// Envoi à un abonnement : true si reçu, 'gone' s'il n'existe plus (désabonné, appli désinstallée)
export async function sendPush(keys, sub, message, { fetchFn = fetch, now = Date.now() } = {}) {
  const res = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(keys, sub.endpoint, now), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'high' },
    body: await encryptPush(sub, JSON.stringify(message)),
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok;
}

// Message à chaque téléphone abonné (nombre reçu) ; abonnements disparus retirés
export async function notifyPhones(env, message, { fetchFn = fetch, now = Date.now() } = {}) {
  const subs = await readJSON(env, 'push', []);
  if (!subs.length) return 0;
  const keys = await vapidKeys(env);
  const gone = new Set();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const r = await sendPush(keys, s, message, { fetchFn, now }).catch(() => false);
    if (r === 'gone') gone.add(s.endpoint);
    else if (r) sent++;
  }));
  if (gone.size) await setRow(env, 'push', JSON.stringify(subs.filter((s) => !gone.has(s.endpoint))));
  return sent;
}

export function validSubscription(s) {
  try {
    const u = new URL(s?.endpoint);
    return u.protocol === 'https:' && PUSH_HOST.test(u.hostname) && unb64url(s.keys?.p256dh).length === 65 && unb64url(s.keys?.auth).length === 16;
  } catch { return false; }
}

// ---------- Abonnements (routes /studio/api/push…, après vérification de la clé) ----------
export async function pushApi(path, req, env) {
  const subs = await readJSON(env, 'push', []);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  // Corps lu seulement pour ses routes : sinon la requête arrive vide aux routes suivantes (messages)
  const body = req.method === 'POST' && path.startsWith('push') ? await req.json().catch(() => null) : null;
  if (path === 'push' && req.method === 'GET') return json({ key: (await vapidKeys(env)).pub, count: subs.length });
  if (path === 'push' && req.method === 'POST') {
    const s = body?.subscription;
    if (!validSubscription(s)) return json({ error: 'Abonnement invalide' }, 400);
    const next = [{ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: Date.now() }, ...subs.filter((x) => x.endpoint !== s.endpoint)].slice(0, MAX_SUBS);
    await setRow(env, 'push', JSON.stringify(next));
    return json({ ok: true, count: next.length });
  }
  if (path === 'push/off' && req.method === 'POST') {
    const next = subs.filter((x) => x.endpoint !== body?.endpoint);
    await setRow(env, 'push', JSON.stringify(next));
    return json({ ok: true, count: next.length });
  }
  if (path === 'push/test' && req.method === 'POST') {
    const s = subs.find((x) => x.endpoint === body?.endpoint);
    if (!s) return json({ error: 'Ce téléphone n\'est pas abonné' }, 404);
    const r = await sendPush(await vapidKeys(env), s, { title: 'Alertes activées', body: 'Chaque grosse news F1 (transfert, pénalité, annonce officielle…) arrivera ici, avec le post prêt à relire.', url: '/studio/' }).catch(() => false);
    return r === true ? json({ ok: true }) : json({ error: 'Envoi refusé par le service de notification' }, 502);
  }
  if (path === 'alerts' && req.method === 'GET') return json({ items: await readJSON(env, 'alerts', []) });
  return null;
}

// ---------- Relevé des flux (tâche planifiée) ----------
// Déjà signalée : même lien, même article, ou même sujet (titres proches, ou mêmes noms et même type précis)
function known(it, alerts) {
  return alerts.some((a) => a.id === it.id || (a.link && a.link === it.link) || (Math.abs(a.t - it.t) < 48 * 3600e3 && (
    newsSimilarity(a, it) >= 0.45 || (newsKind(a).key === newsKind(it).key && !['actu', 'officiel'].includes(newsKind(it).key) && sameStoryOf(a, it)))));
}

async function frenchTitle(env, it) {
  if (it.lang === 'fr' || !env.AI) return it.title;
  try {
    return (await translateBatch(env, { to: 'fr', items: [{ text: it.title, from: it.lang }] })).out?.[0] || it.title;
  } catch { return it.title; }
}

export async function newsAlerts(env, { fetchFn = fetch, now = Date.now() } = {}) {
  if (!env.DB) return { skipped: 'db' };
  const subs = await readJSON(env, 'push', []);
  if (!subs.length) return { skipped: 'no-subscriber' };   // personne à prévenir : rien à relever
  // Sources du passage : officielles + quelques médias à tour de rôle
  const media = DEFAULT_SOURCES.filter((s) => s.kind === 'rss' && !OFFICIAL.has(s.id));
  const turn = Number(await getRow(env, 'alerts-turn')) || 0;
  const picked = [...DEFAULT_SOURCES.filter((s) => OFFICIAL.has(s.id)), ...Array.from({ length: MEDIA_PER_RUN }, (_, i) => media[(turn * MEDIA_PER_RUN + i) % media.length])];
  await setRow(env, 'alerts-turn', String((turn + 1) % Math.ceil(media.length / MEDIA_PER_RUN)));
  const items = [];
  await Promise.all(picked.map(async (s) => {
    try {
      const res = await fetchFn(feedUrl(s), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
      if (res.ok) items.push(...feedItems(s, await decodeBody(res), now));
    } catch { /* source indisponible */ }
  }));
  const alerts = await readJSON(env, 'alerts', []);
  const day = new Date(now).toISOString().slice(0, 10);
  let sentToday = alerts.filter((a) => new Date(a.at).toISOString().slice(0, 10) === day).length;
  // La FIA publie aussi pour ses autres championnats : sujets F1 seulement
  const f1 = (it) => !it.src.startsWith('fia') || /formula 1|formula one|\bf1\b/i.test(`${it.title} ${it.summary}`);
  // Grosses news, et livrées ou tenues spéciales (photos à reprendre dans un post)
  const fresh = items.filter((it) => ((it.imp || 0) >= 2 || LOOKS.has(newsKind(it).key)) && f1(it) && it.t >= now - FRESH && it.t <= now + 10 * 60e3)
    .sort((a, b) => (b.imp - a.imp) || (b.cat === 'official') - (a.cat === 'official') || b.t - a.t);
  const added = [];
  for (const it of fresh) {
    if (added.length >= MAX_PER_RUN || sentToday >= MAX_PER_DAY) break;
    if (known(it, [...alerts, ...added])) continue;
    added.push({ ...it, _tok: undefined, titleFr: await frenchTitle(env, it), at: now });
    sentToday++;
  }
  if (!added.length) return { checked: picked.length, items: items.length, sent: 0 };
  await setRow(env, 'alerts', JSON.stringify([...added, ...alerts].slice(0, MAX_ALERTS)));
  // Envoi à chaque téléphone abonné
  let sent = 0;
  for (const a of added) {
    sent += await notifyPhones(env, { title: `${isBreaking(a) ? 'BREAKING · ' : ''}${newsKind(a).label} · ${a.srcName}`, body: a.titleFr, id: a.id, url: `/studio/?alert=${encodeURIComponent(a.id)}` }, { fetchFn, now });
  }
  return { checked: picked.length, items: items.length, alerts: added.length, sent };
}
