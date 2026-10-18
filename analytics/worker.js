// Petit serveur des statistiques d'utilisation de Paddock Live (Cloudflare Worker + base D1).
// - POST /e : lot de compteurs anonymes envoyé par l'appli (avec l'accord de l'utilisateur).
//   Seuls le jour (pris ici, pas chez l'utilisateur), la version, le système, le type d'appareil,
//   le nom de la fonction et un nombre sont gardés : ni adresse IP, ni identifiant, ni contenu.
// - POST /t : traduction partagée ; GET /r/<empreinte> et POST /r : transcription partagée des radios.
// - GET / ou /login : connexion (mot de passe = secret STATS_KEY du Worker), puis tableau de bord sur /stats.
//   Session : cookie signé (HMAC du mot de passe), valable 30 jours.
// - GET /stats.json : les mêmes chiffres en JSON (connecté, ou ?key=…).
// - /studio/ : page web du créateur (fichiers statiques du dossier site/) et son API /studio/api/…
//   (studio.js : accès par clé dérivée du code, jetons chiffrés, relais, publication) ;
// - /site/ : site de présentation de l'appli (racine d'un nom de domaine à soi) ; /download/… :
//   fichiers de la dernière version (download.js).
// - tâche planifiée (toutes les 5 min) : alertes des grosses news sur le téléphone du créateur (alerts.js).
import { cleanBatch, LABELS, FEATURE_GROUPS } from '../shared/stats.js';
import { studioApi, runSchedule, seasonRow } from './studio.js';
import { loginPage, dashboardPage } from './page.js';
import { cleanRequest, translateBatch } from './translate.js';
import { cleanSummaryRequest, summarizeArticle } from './summarize.js';
import { newsAlerts } from './alerts.js';
import { transcribeRadio, cachedRadio, HASH_RE, MAX_AUDIO } from './transcribe.js';
import { download } from './download.js';
import { buildIcs } from '../shared/ics.js';
import { pronosApi, GROUP_RE } from './pronos.js';

const MAX_BODY = 32 * 1024;
const COOKIE = 'pl_stats';
const SESSION_DAYS = 30;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store', ...headers } });

function html(body, nonce, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nonceOf = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

// Jeton de session : dépend du mot de passe (le changer déconnecte tout le monde), sans le contenir
async function sessionToken(env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STATS_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('paddock-live-stats-session-v1')));
}

function cookieOf(req, name) {
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

async function signedIn(req, env) {
  const c = cookieOf(req, COOKIE);
  return !!c && sameKey(c, await sessionToken(env));
}

async function sessionCookie(env) {
  return `${COOKIE}=${await sessionToken(env)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

async function ingest(req, env) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: 'Trop volumineux' }, 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'Trop volumineux' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
  const batch = cleanBatch(body);
  if (!batch) return json({ error: 'Lot invalide' }, 400);
  const day = new Date().toISOString().slice(0, 10);
  const stmt = env.DB.prepare('INSERT INTO counts (day, event, device, version, os, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (day, event, device, version, os) DO UPDATE SET n = n + excluded.n');
  const estmt = env.DB.prepare('INSERT INTO error_details (day, version, os, device, kind, place, msg, stack, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (day, version, os, device, kind, place, msg, stack) DO UPDATE SET n = n + excluded.n');
  const all = [
    ...batch.items.map(([event, device, n]) => stmt.bind(day, event, device, batch.version, batch.os, n)),
    ...(batch.errors || []).map((e) => estmt.bind(day, batch.version, batch.os, e.d, e.k, e.w, e.m, e.s, e.n)),
  ];
  if (all.length) await env.DB.batch(all);
  return new Response(null, { status: 204 });
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const TIMELINE = { 'app.active': 'active', 'app.open': 'open', 'app.install': 'install', 'session.live': 'live', 'session.replay': 'replay' };
const OS_NAMES = { win: 'Windows', mac: 'macOS', linux: 'Linux', other: 'Autre' };
const DEVICE_NAMES = { desktop: 'Ordinateur (appli)', phone: 'Téléphone / tablette', browser: 'Navigateur' };

// Chiffres du tableau de bord pour les `days` derniers jours (et la période d'avant, pour comparer)
export async function summary(env, days, now = Date.now()) {
  const until = dayOf(now);
  const since = dayOf(now - (days - 1) * 86400e3);
  const prevSince = dayOf(now - (2 * days - 1) * 86400e3);
  const q = (sql, ...p) => env.DB.prepare(sql).bind(...p).all().then((r) => r.results || []);
  const [daily, events, versions, systems, errDetails, errCounts] = await Promise.all([
    q("/*daily*/ SELECT day, event, SUM(n) AS n FROM counts WHERE day >= ?1 AND (event IN ('app.active', 'app.open', 'app.install', 'session.live', 'session.replay') OR event LIKE 'error.%') GROUP BY day, event", prevSince),
    q('/*events*/ SELECT event, device, SUM(n) AS n FROM counts WHERE day >= ?1 GROUP BY event, device', since),
    q("/*versions*/ SELECT version, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY version ORDER BY n DESC", since),
    q("/*systems*/ SELECT os, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY os ORDER BY n DESC", since),
    q('/*errdetails*/ SELECT place, kind, msg, stack, version, device, SUM(n) AS n, MAX(day) AS last FROM error_details WHERE day >= ?1 GROUP BY place, kind, msg, stack, version, device', since).catch(() => []),
    q("/*errcounts*/ SELECT event, version, device, SUM(n) AS n, MAX(day) AS last FROM counts WHERE day >= ?1 AND event LIKE 'error.%' GROUP BY event, version, device", since),
  ]);

  // Séries jour par jour (jours sans données = 0) et totaux de la période précédente
  const dates = Array.from({ length: days }, (_, i) => dayOf(now - (days - 1 - i) * 86400e3));
  const idx = new Map(dates.map((d, i) => [d, i]));
  const keys = ['active', 'open', 'install', 'live', 'replay', 'errors'];
  const series = { dates, ...Object.fromEntries(keys.map((k) => [k, Array(days).fill(0)])) };
  const prev = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of daily) {
    const k = TIMELINE[r.event] || (r.event.startsWith('error.') ? 'errors' : null);
    if (!k) continue;
    if (idx.has(r.day)) series[k][idx.get(r.day)] += r.n;
    else if (r.day < since) prev[k] += r.n;
  }
  prev.activeAvg = prev.active / days;

  const byEvent = new Map();
  for (const r of events) {
    const e = byEvent.get(r.event) || { event: r.event, total: 0, desktop: 0, phone: 0, browser: 0 };
    e.total += r.n;
    if (r.device in e) e[r.device] += r.n;
    byEvent.set(r.event, e);
  }
  const all = [...byEvent.values()].sort((a, b) => b.total - a.total || a.event.localeCompare(b.event));
  const groupOf = (ev) => (ev.split('.')[0] in FEATURE_GROUPS ? ev.split('.')[0] : null);
  const features = all.filter((e) => groupOf(e.event)).map((e) => ({ ...e, group: groupOf(e.event), label: LABELS[e.event] || e.event }));
  const used = new Set(features.map((f) => f.event));
  const unused = Object.keys(LABELS).filter((k) => ['rail', 'tab', 'season', 'feature'].includes(k.split('.')[0]) && !used.has(k)).map((k) => LABELS[k]);
  const devices = Object.entries(byEvent.get('app.open') || {}).filter(([k, n]) => k in DEVICE_NAMES && n > 0)
    .map(([k, n]) => ({ label: DEVICE_NAMES[k], n })).sort((a, b) => b.n - a.n);
  const langs = [['lang.fr', 'Français'], ['lang.en', 'Anglais']].map(([k, label]) => ({ label, n: byEvent.get(k)?.total || 0 })).filter((r) => r.n).sort((a, b) => b.n - a.n);

  return {
    days, since, until, series, prev,
    groups: FEATURE_GROUPS,
    features, unused,
    versions: versions.map((r) => ({ label: r.version === 'dev' ? 'dev (développement)' : `v${r.version}`, n: r.n })),
    systems: systems.map((r) => ({ label: OS_NAMES[r.os] || r.os, n: r.n })),
    devices, langs,
    errors: errorRows(errDetails, errCounts),
  };
}

// Erreurs regroupées (endroit, type, message, chemin d'appel) avec versions, appareils et dernier jour.
// Versions d'avant le détail des erreurs (1.27.4 et avant) : compteur seul, « sans détail ».
export const DETAIL_SINCE = [1, 27, 5];
const olderThanDetail = (v) => {
  const p = String(v).split('.').map(Number);
  if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) return false;   // « dev »
  for (let i = 0; i < 3; i++) if (p[i] !== DETAIL_SINCE[i]) return p[i] < DETAIL_SINCE[i];
  return false;
};
function errorRows(details, counts) {
  const rows = new Map();
  const row = (key, base) => rows.get(key) || rows.set(key, { ...base, versions: {}, desktop: 0, phone: 0, browser: 0, total: 0, last: '' }).get(key);
  const addTo = (r, version, device, n, last) => {
    r.versions[version] = (r.versions[version] || 0) + n;
    if (device in r && device !== 'total') r[device] += n;
    r.total += n;
    if (last > r.last) r.last = last;
  };
  for (const d of details) {
    addTo(row(['d', d.place, d.kind, d.msg, d.stack].join('\u0001'), { place: d.place, kind: d.kind, msg: d.msg, stack: d.stack }), d.version, d.device, d.n, d.last);
  }
  for (const c of counts) {
    if (!olderThanDetail(c.version)) continue;
    const place = c.event.replace(/^error\./, '');
    addTo(row(`c\u0001${place}`, { place, kind: place === 'server' ? 'server' : '', msg: '', stack: '', legacy: true }), c.version, c.device, c.n, c.last);
  }
  return [...rows.values()].map((r) => ({ ...r, versions: Object.entries(r.versions).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n })) }))
    .sort((a, b) => b.total - a.total || b.last.localeCompare(a.last)).slice(0, 60);
}

const periodOf = (url) => {
  const d = Number(url.searchParams.get('days'));
  return [7, 30, 90, 365].includes(d) ? d : 30;
};

export default {
  // Toutes les minutes : publications programmées de la page du créateur (un réseau par passage) ;
  // toutes les 5 minutes, grosses news signalées sur son téléphone (s'il est abonné) ; saison du
  // Studio tenue à jour (relue toutes les 30 minutes)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const sent = await runSchedule(env).catch(() => null);
      if (!sent && new Date(event.scheduledTime || Date.now()).getUTCMinutes() % 5 === 0) await newsAlerts(env).catch(() => null);
      if (!sent && env.DB) await seasonRow(env, new Date().getUTCFullYear()).catch(() => null);
    })());
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    // Site de l'appli : liens de téléchargement vers la dernière version ; sur un nom de domaine
    // à soi (pas *.workers.dev), la racine affiche le site au lieu de la page des statistiques
    if (req.method === 'GET' && url.pathname.startsWith('/download/')) return download(url.pathname);
    // Scènes OBS toutes prêtes : adresse courte à donner aux streamers
    if (req.method === 'GET' && url.pathname === '/obs') return Response.redirect(new URL('/obs/paddock-live-obs.json', url), 302);
    // Page des streamers : le bloc Streaming du site (aperçu, scènes OBS, installation)
    if (req.method === 'GET' && url.pathname === '/streaming') return Response.redirect(new URL('/#streaming', url), 302);
    if (req.method === 'GET' && /^\/calendar(-en)?\.ics$/.test(url.pathname)) return calendar(env, new Date().getUTCFullYear(), url.pathname.includes('-en'));
    // Ancienne adresse (*.workers.dev) : les pages ouvertes dans un navigateur (connexion,
    // statistiques) passent sur le nom de domaine (SITE_ORIGIN) ; l'appli y garde ses appels
    if (env.SITE_ORIGIN && url.hostname.endsWith('.workers.dev') && req.method === 'GET' && ['/', '/login', '/stats'].includes(url.pathname)) {
      return Response.redirect(`${env.SITE_ORIGIN}${url.pathname === '/' ? '/login' : url.pathname}${url.search}`, 302);
    }
    const ownDomain = !url.hostname.endsWith('.workers.dev') && url.hostname !== 'localhost';
    // www.paddocklive.app -> paddocklive.app (même chemin ; les fichiers du site, servis avant le
    // Worker, restent aussi lisibles sur www)
    if (ownDomain && url.hostname.startsWith('www.')) return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    if (req.method === 'GET' && url.pathname === '/' && ownDomain && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL('/site/', url), req));
    }
    if (req.method === 'POST' && url.pathname === '/e') {
      try { return await ingest(req, env); } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Traduction partagée (actualités, radios) : ouverte à l'appli, plafonnée par jour
    if (req.method === 'POST' && url.pathname === '/t') {
      if (!env.AI) return json({ error: 'Traduction indisponible' }, 503);
      const text = await req.text();
      if (text.length > 64 * 1024) return json({ error: 'Trop volumineux' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
      const r = cleanRequest(body);
      if (!r) return json({ error: 'Requête invalide' }, 400);
      try {
        const res = await translateBatch(env, r);
        return json(res, res.limited ? 429 : 200);
      } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Résumé d'un article en points clés (posts « news » en plusieurs images), même plafond
    if (req.method === 'POST' && url.pathname === '/s') {
      if (!env.AI) return json({ error: 'Résumé indisponible' }, 503);
      const text = await req.text();
      if (text.length > 64 * 1024) return json({ error: 'Trop volumineux' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
      const r = cleanSummaryRequest(body);
      if (!r) return json({ error: 'Requête invalide' }, 400);
      try {
        const res = await summarizeArticle(env, r);
        return json(res, res.limited ? 429 : res.points ? 200 : 502);
      } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Pronostics entre amis en ligne : API, et page de chaque groupe (fichier statique /p/)
    if (url.pathname.startsWith('/p/api/')) {
      try { return await pronosApi(req, env, url); } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/p/') && GROUP_RE.test(url.pathname.slice(3).replace(/\/$/, '')) && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL('/p/', url), req));
    }
    // Page web du créateur : API (la page elle-même est un fichier statique, dossier site/)
    if (url.pathname.startsWith('/studio/api/')) {
      try { return await studioApi(req, env, url); } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Transcription partagée des radios : déjà faite (empreinte du fichier son), sinon envoi du son
    if (url.pathname === '/r' || url.pathname.startsWith('/r/')) {
      if (!env.AI) return json({ error: 'Transcription indisponible' }, 503);
      try {
        if (req.method === 'GET' && HASH_RE.test(url.pathname.slice(3))) {
          const hit = await cachedRadio(env, url.pathname.slice(3));
          return hit ? json(hit) : json({ error: 'Pas encore transcrite' }, 404);
        }
        if (req.method === 'POST' && url.pathname === '/r') {
          if (Number(req.headers.get('Content-Length') || 0) > MAX_AUDIO) return json({ error: 'Trop volumineux' }, 413);
          const r = await transcribeRadio(env, new Uint8Array(await req.arrayBuffer()));
          if (r.invalid) return json({ error: 'Fichier son invalide' }, 400);
          if (r.limited) return json({ error: 'Plafond du jour atteint' }, 429);
          return json({ text: r.text, d: r.d });
        }
      } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (!env.STATS_KEY) return json({ error: 'Mot de passe STATS_KEY non configuré' }, 503);

    // Connexion : à la racine sur *.workers.dev, et sur /login partout (sur un nom de domaine à soi,
    // la racine affiche le site de l'appli)
    if ((url.pathname === '/' || url.pathname === '/login') && req.method === 'GET') {
      if (await signedIn(req, env)) return redirect('/stats');
      const nonce = nonceOf();
      return html(loginPage({ nonce }), nonce);
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      let key = '';
      try { key = String((await req.formData()).get('key') || ''); } catch { /* formulaire illisible */ }
      if (sameKey(key, env.STATS_KEY)) return redirect('/stats', { 'Set-Cookie': await sessionCookie(env) });
      await new Promise((r) => setTimeout(r, 800));   // freine les essais à la chaîne
      const nonce = nonceOf();
      return html(loginPage({ nonce, error: 'Mot de passe incorrect' }), nonce, 401);
    }
    if (url.pathname === '/logout') return redirect('/login', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });

    if (req.method === 'GET' && (url.pathname === '/stats' || url.pathname === '/stats.json')) {
      const key = url.searchParams.get('key');
      const ok = (await signedIn(req, env)) || (key !== null && sameKey(key, env.STATS_KEY));
      if (!ok) return url.pathname === '/stats' ? redirect('/login') : json({ error: 'Non connecté' }, 403);
      const days = periodOf(url);
      // Ancien lien avec ?key= : on ouvre la session et on retire le mot de passe de l'adresse
      if (key !== null && url.pathname === '/stats') return redirect(`/stats?days=${days}`, { 'Set-Cookie': await sessionCookie(env) });
      const s = await summary(env, days);
      if (url.pathname === '/stats.json') return json(s);
      const nonce = nonceOf();
      return html(dashboardPage(s, { nonce }), nonce);
    }
    return json({ error: 'Introuvable' }, 404);
  },
};

// Calendrier des séances auquel on s'abonne depuis l'appli (webcal://paddocklive.app/calendar.ics,
// ou Google Agenda) : saison en cours, gardée dans la base et relue par la tâche planifiée ; l'agenda
// se met à jour tout seul quand les horaires changent.
export async function calendar(env, year, en = false, opts = {}) {
  const row = await seasonRow(env, year, opts).catch(() => null);
  if (!row) return new Response('Calendrier indisponible', { status: 503 });
  return new Response(buildIcs(row.v.races, { year, lang: en ? 'en' : 'fr', subscribe: true }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="f1${en ? '-en' : ''}.ics"`, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
