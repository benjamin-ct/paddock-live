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
// - tâche planifiée (toutes les 5 min) : alertes des grosses news sur le téléphone du créateur (alerts.js) ;
//   toutes les 6 heures, bilan de santé (health.js) : flux F1, erreurs de l'appli, jetons.
import { cleanBatch } from '../shared/stats.js';
import { summary } from './usage.js';
import { studioApi, runSchedule, schedInternal, schedVideo, seasonRow, fails, failed, MAX_FAILS } from './studio.js';
import { loginPage, dashboardPage } from './page.js';
import { cleanRequest, translateBatch } from './translate.js';
import { cleanSummaryRequest, summarizeArticle } from './summarize.js';
import { newsAlerts } from './alerts.js';
import { transcribeRadio, cachedRadio, HASH_RE, MAX_AUDIO } from './transcribe.js';
import { download, mirror, FILES } from './download.js';
import { go, countClick } from './clicks.js';
import { SHORT_RE, SHORT } from '../shared/track-links.js';
import { feedbackPost, feedbackFile } from './feedback.js';
import { buildIcs } from '../shared/ics.js';
import { pronosApi, GROUP_RE } from './pronos.js';
import { pruneIpQuota, callerIp, ipQuota } from './quota.js';
import { healthCheck, HEALTH } from './health.js';
import { publicPushApi, pushRun, queuePush, sessionReminders } from './push-public.js';
import { liveSocket, liveApi } from './live-relay.js';
import { statsTick } from './race-stats.js';
import { fiaTick } from './fia-tech.js';
import { LIVE_HEADERS } from './live-page/headers.js';

// Fichier de la version web, avec ses en-têtes de sécurité (le fichier _headers ne s'applique pas ici)
async function liveAsset(env, req) {
  const res = await env.ASSETS.fetch(req);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(LIVE_HEADERS)) out.headers.set(k, v);
  return out;
}

export { LiveRelay } from './live-relay.js';

const MAX_BODY = 32 * 1024;
const COOKIE = 'pl_stats';
const SESSION_DAYS = 30;

// Adresse de l'appelant (plafonds d'IA par adresse) ; corps annoncé trop gros : refusé avant d'être lu
const clientIp = callerIp;
const tooBig = (req, max) => Number(req.headers.get('Content-Length') || 0) > max;
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
  // Lignes écrites par adresse et par jour (une appli en écrit quelques milliers au plus) : un script ne peut
  // pas remplir la base ni épuiser ses écritures du jour
  const rows = batch.items.length + (batch.errors?.length || 0);
  const ip = clientIp(req);
  if (ip && rows && !(await ipQuota(env, { key: 'ingest', day, ip, n: rows, limit: 10000 }))) return json({ error: 'Trop d\'envois aujourd\'hui' }, 429);
  const stmt = env.DB.prepare('INSERT INTO counts (day, event, device, version, os, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (day, event, device, version, os) DO UPDATE SET n = n + excluded.n');
  const estmt = env.DB.prepare('INSERT INTO error_details (day, version, os, device, kind, place, msg, stack, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (day, version, os, device, kind, place, msg, stack) DO UPDATE SET n = n + excluded.n');
  const all = [
    ...batch.items.map(([event, device, n]) => stmt.bind(day, event, device, batch.version, batch.os, n)),
    ...(batch.errors || []).map((e) => estmt.bind(day, batch.version, batch.os, e.d, e.k, e.w, e.m, e.s, e.n)),
  ];
  if (all.length) await env.DB.batch(all);
  return new Response(null, { status: 204 });
}

export { summary };

const periodOf = (url) => {
  const d = Number(url.searchParams.get('days'));
  return [7, 30, 90, 365].includes(d) ? d : 30;
};

// Retour de la connexion Facebook de l'appli de bureau (mode créateur) : Meta n'accepte que des adresses
// https, cette page renvoie donc le navigateur vers l'appli de la personne (127.0.0.1, port écrit au début de
// « state » par l'appli), avec la réponse de Meta telle quelle. Rien n'est lu ni gardé ici ; seule l'appli
// qui a ouvert la connexion connaît le reste de « state » et la clé secrète pour utiliser le code.
const FB_STATE = /^(\d{2,5})\.[0-9a-f]{32}$/;
export function fbCallback(url) {
  const port = Number(FB_STATE.exec(url.searchParams.get('state') || '')?.[1]);
  if (!(port >= 1024 && port <= 65535)) return new Response('Connexion Facebook : demande invalide, recommencez depuis Paddock Live.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const keep = new URLSearchParams();
  for (const k of ['code', 'state', 'error', 'error_reason', 'error_description']) if (url.searchParams.has(k)) keep.set(k, url.searchParams.get(k).slice(0, 2000));
  return new Response(null, { status: 302, headers: { Location: `http://127.0.0.1:${port}/meta-callback/?${keep}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export default {
  // Toutes les minutes : publications de la page du créateur (programmées ou « Publier ») ;
  // toutes les 5 minutes, grosses news signalées sur son téléphone (s'il est abonné) ; saison du
  // Studio tenue à jour (relue toutes les 30 minutes)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const sent = await runSchedule(env).catch(() => null);
      if (!sent && new Date(event.scheduledTime || Date.now()).getUTCMinutes() % 5 === 0) await newsAlerts(env).catch(() => null);
      if (!sent && env.DB) await seasonRow(env, new Date().getUTCFullYear()).catch(() => null);
      // Alertes du téléphone : rappels des séances proches mis en file, puis un lot de la file envoyé (appel du
      // Worker à lui-même : ses envois ont leurs propres limites)
      if (env.DB) await publicPush(env, event.scheduledTime || Date.now()).catch(() => null);
      // Une fois par jour : compteurs d'IA par adresse des jours passés, traductions de plus de 90 jours et
      // détail des erreurs de plus d'un an effacés
      const t = new Date(event.scheduledTime || Date.now());
      if (env.DB && t.getUTCHours() === 3 && t.getUTCMinutes() === 0) await prune(env, t.getTime()).catch(() => null);
      // Toutes les 6 heures : bilan de santé (flux F1, erreurs de l'appli, jetons), sur le téléphone si besoin
      if (t.getUTCMinutes() === 7 && t.getUTCHours() % HEALTH.every === 1) await healthCheck(env).catch(() => null);
      // Espace Saison de la version web : statistiques des courses et documents FIA, une minute sur deux chacun (l'un
      // prend la minute de l'autre s'il n'a rien à faire), pour que l'un n'attende pas que l'autre ait tout fini
      if (!sent) {
        const [first, then] = t.getUTCMinutes() % 2 ? [fiaTick, statsTick] : [statsTick, fiaTick];
        if (!(await first(env, { now: t.getTime() }).catch(() => null))) await then(env, { now: t.getTime() }).catch(() => null);
      }
    })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Site de l'appli : liens de téléchargement vers la dernière version ; sur un nom de domaine
    // à soi (pas *.workers.dev), la racine affiche le site au lieu de la page des statistiques
    if (req.method === 'GET' && url.pathname.startsWith('/download/')) {
      const os = url.pathname.slice(10);
      // Compté seulement si quelqu'un a cliqué dans un navigateur (Sec-Fetch-User) : pas les programmes
      // qui suivent tous les liens de la page (antivirus, analyseurs de liens, moteurs de recherche)
      if (FILES[os] && env.DB && req.headers.get('Sec-Fetch-User') === '?1') ctx?.waitUntil?.(countClick(req, env, 'download', os) || Promise.resolve());
      return download(url.pathname, { env });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/dl/')) {
      let name;
      try { name = decodeURIComponent(url.pathname.slice(4)); } catch { return json({ error: 'Introuvable' }, 404); }
      return mirror(req, env, name);
    }
    // Lien suivi d'un post : clic compté, puis l'adresse d'origine
    if (req.method === 'GET' && url.pathname.startsWith('/go/') && env.DB) return go(req, env, ctx, url.pathname.slice(4));
    if (req.method === 'GET' && SHORT_RE.test(url.pathname.slice(1)) && env.DB) return go(req, env, ctx, url.pathname.slice(1));
    // Nom court des liens (pdkl.app) : tout le reste renvoie sur le site
    if (env.SITE_ORIGIN && url.hostname === new URL(SHORT).hostname) return Response.redirect(`${env.SITE_ORIGIN}${url.pathname}${url.search}`, 301);
    // Page des streamers : le bloc Streaming du site
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
    if (req.method === 'GET' && url.pathname === '/fb-callback') return fbCallback(url);
    // Version web du direct : seulement sur son nom, app.paddocklive.app (sa page à la racine). Ailleurs
    // (paddocklive.app/live/, adresse workers.dev) : la page renvoie là-bas, le reste n'existe pas. Les fichiers
    // /live/* passent par le Worker d'abord (run_worker_first, wrangler.toml), avec les en-têtes de sécurité
    const app = url.hostname.startsWith('app.');
    if (url.pathname === '/live' || url.pathname.startsWith('/live/')) {
      if (!app) return ['/live', '/live/'].includes(url.pathname) && req.method === 'GET' ? Response.redirect('https://app.paddocklive.app/', 301) : new Response('Introuvable', { status: 404 });
      if (url.pathname !== '/live/ws' && !url.pathname.startsWith('/live/api/') && env.ASSETS) return liveAsset(env, req);
    }
    if (req.method === 'GET' && url.pathname === '/' && app && env.ASSETS) return liveAsset(env, new Request(new URL('/live/', url), req));
    if (req.method === 'GET' && url.pathname === '/' && ownDomain && env.ASSETS) {
      // Ancienne adresse de l'accueil en anglais : page à part depuis
      if (url.searchParams.get('lang') === 'en') return Response.redirect(`${url.origin}/en/`, 301);
      return env.ASSETS.fetch(new Request(new URL('/site/', url), req));
    }
    if (req.method === 'POST' && url.pathname === '/e') {
      try { return await ingest(req, env); } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Questions et suggestions (appli, site) : lues dans le Studio
    if (req.method === 'POST' && url.pathname === '/f') {
      try { return await feedbackPost(req, env); } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (req.method === 'POST' && url.pathname === '/f/file') {
      try { return await feedbackFile(req, env, url); } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Traduction partagée (actualités, radios) : ouverte à l'appli, plafonnée par jour
    if (req.method === 'POST' && url.pathname === '/t') {
      if (!env.AI) return json({ error: 'Traduction indisponible' }, 503);
      if (tooBig(req, 64 * 1024)) return json({ error: 'Trop volumineux' }, 413);
      const text = await req.text();
      if (text.length > 64 * 1024) return json({ error: 'Trop volumineux' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
      const r = cleanRequest(body);
      if (!r) return json({ error: 'Requête invalide' }, 400);
      try {
        const res = await translateBatch(env, r, undefined, clientIp(req));
        return json(res, res.limited ? 429 : 200);
      } catch { return json({ error: 'Erreur' }, 500); }
    }
    // Résumé d'un article en points clés (posts « news » en plusieurs images), même plafond
    if (req.method === 'POST' && url.pathname === '/s') {
      if (!env.AI) return json({ error: 'Résumé indisponible' }, 503);
      if (tooBig(req, 64 * 1024)) return json({ error: 'Trop volumineux' }, 413);
      const text = await req.text();
      if (text.length > 64 * 1024) return json({ error: 'Trop volumineux' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
      const r = cleanSummaryRequest(body);
      if (!r) return json({ error: 'Requête invalide' }, 400);
      try {
        const res = await summarizeArticle(env, r, undefined, clientIp(req));
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
    // Publication d'un réseau, appelée par la tâche planifiée elle-même (voir runSchedule)
    // Version web du direct (fichiers statiques dans /live/) : relais du flux F1, tracé des circuits et photos
    if (url.pathname === '/live/ws') return liveSocket(req, env);
    if (url.pathname.startsWith('/live/api/')) {
      try { return await liveApi(req, url, env); } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (req.method === 'POST' && url.pathname === '/internal/sched') return schedInternal(req, env);
    if (req.method === 'POST' && url.pathname === '/internal/push') {
      if (!env.STATS_KEY || !sameKey(req.headers.get('X-Sched-Key') || '', env.STATS_KEY)) return json({ error: 'Interdit' }, 403);
      return json(await pushRun(env));
    }
    // Alertes sur le téléphone (page /alertes/) : clé du serveur, abonnement, désabonnement, essai
    if (url.pathname.startsWith('/a/') && /^(key|sub|off|test)$/.test(url.pathname.slice(3))) {
      try { return await publicPushApi(req, env, url.pathname.slice(3)); } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (['GET', 'HEAD'].includes(req.method) && url.pathname.startsWith('/studio/v/')) return schedVideo(req, env, url.pathname.slice(10));
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
          const r = await transcribeRadio(env, new Uint8Array(await req.arrayBuffer()), undefined, clientIp(req));
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
      const ok = await statsKey(req, env, key);
      if (ok) return redirect('/stats', { 'Set-Cookie': await sessionCookie(env) });
      const nonce = nonceOf();
      return html(loginPage({ nonce, error: ok === null ? 'Trop d\'essais aujourd\'hui' : 'Mot de passe incorrect' }), nonce, ok === null ? 429 : 401);
    }
    if (url.pathname === '/logout') return redirect('/login', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });

    if (req.method === 'GET' && (url.pathname === '/stats' || url.pathname === '/stats.json')) {
      const key = url.searchParams.get('key');
      const ok = (await signedIn(req, env)) || (key !== null && await statsKey(req, env, key));
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

// Mot de passe des statistiques : true, false (raté, compté et freiné) ou null (trop d'essais aujourd'hui)
async function statsKey(req, env, key) {
  if (await fails(env, req) >= MAX_FAILS) return null;
  if (sameKey(key, env.STATS_KEY)) return true;
  await failed(env, req);
  return false;
}

async function publicPush(env, now) {
  const row = JSON.parse(await env.DB.prepare('SELECT v FROM studio WHERE k = ?1').bind(`season:${new Date(now).getUTCFullYear()}`).first('v') || 'null');
  for (const r of sessionReminders(row?.v, now)) await queuePush(env, r.k, 'sessions', r.msg, now);
  if (!(await env.DB.prepare('SELECT 1 FROM push_out LIMIT 1').first())) return;
  if (env.SELF && env.STATS_KEY) await env.SELF.fetch(new Request('https://self/internal/push', { method: 'POST', headers: { 'X-Sched-Key': env.STATS_KEY } }));
  else await pushRun(env, { now });
}

export async function prune(env, now) {
  await pruneIpQuota(env, new Date(now).toISOString().slice(0, 10));
  await env.DB.prepare('DELETE FROM translations WHERE at < ?1').bind(now - 90 * 86400e3).run();
  await env.DB.prepare('DELETE FROM error_details WHERE day < ?1').bind(new Date(now - 365 * 86400e3).toISOString().slice(0, 10)).run();
  // Compteurs par adresse des jours passés (essais ratés, messages, groupes de pronostics) et textes des radios
  // de plus d'un an (redemandés si quelqu'un revoit une si vieille séance)
  const today = new Date(now).toISOString().slice(0, 10);
  for (const t of ['studio_fail', 'feedback_new', 'pronos_new']) await env.DB.prepare(`DELETE FROM ${t} WHERE day < ?1`).bind(today).run();
  await env.DB.prepare('DELETE FROM radio_texts WHERE at < ?1').bind(now - 365 * 86400e3).run();
  await env.DB.prepare('DELETE FROM push_sent WHERE at < ?1').bind(now - 30 * 86400e3).run();
}

// Calendrier des séances auquel on s'abonne depuis l'appli (webcal://paddocklive.app/calendar.ics,
// ou Google Agenda) : saison en cours, gardée dans la base et relue par la tâche planifiée ; l'agenda
// se met à jour tout seul quand les horaires changent. Jamais relue chez Jolpica pour un abonné (la tâche
// planifiée s'en charge toutes les 30 minutes) : seulement si la saison gardée a plus de 6 heures
export async function calendar(env, year, en = false, opts = {}) {
  const row = await seasonRow(env, year, { maxAge: 6 * 3600e3, ...opts }).catch(() => null);
  if (!row) return new Response('Calendrier indisponible', { status: 503 });
  return new Response(buildIcs(row.v.races, { year, lang: en ? 'en' : 'fr', subscribe: true }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="f1${en ? '-en' : ''}.ics"`, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
