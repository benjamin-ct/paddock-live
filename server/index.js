// Point d'entrée : serveur HTTP (interface + API) et WebSocket vers le navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { LiveSource } from './live.js';
import { ReplaySource, seasonIndex } from './replay.js';
import { HttpError, request } from './net.js';
import { circuit } from './circuits.js';
import { season, SEASON_URL } from './season.js';
import { findSessionContent, playback, proxy as f1tvProxy, allowHost, resolvePlaylist, localTarget } from './f1tv.js';
import { Recorder, listRecordings, pruneRecordings, recordingPath } from './recorder.js';
import { ROOT, settings, getConfig, saveConfig, parseF1tvToken, tokenInfo } from './config.js';
import { createLan, isLoopback, qrSvg } from './lan.js';
import { getTranslations, addTranslations } from './translations.js';
import { compareLaps } from './compare.js';
import { startNews, refreshNews, newsSnapshot, onNews, setNewsSourceEnabled } from './news.js';
import { parseChangelog } from '../shared/changelog.js';
import { buildIcs } from '../shared/ics.js';
import { osmTile } from './tiles.js';
import { pronosOnline } from './predict.js';
import { lightsInfo, saveLights, hueDiscover, huePair, lightDevices, setLights } from './lights.js';
import { exportServerSettings, importServerSettings } from './backup.js';
import { creatorEnabled, setCreator } from './creator.js';
import { studioInfo, enableStudio, disableStudio, restoreAccounts, syncStudio, startStudioSync } from './studio-sync.js';
import { accountsInfo, saveAccount, tiktokLoginUrl, tiktokCallback, youtubeLoginUrl, youtubeCallback, metaLoginUrl, metaCallback } from './social-publish.js';
import { startAutoRenew, renew as renewF1tv, sessionOf, state as renewState, resetRenewState } from './f1tv-auth.js';
import { localHost, sameSiteRequest, decodePath, extensionRequest, EXTENSION_ROUTES } from './guard.js';
import { stats, startStats, sendFeedback, sendFeedbackFile } from './stats.js';
import { archivePath, sendArchiveFile, archiveError } from './archive.js';
import { feedDiag } from './feed-diag.js';
import { probeState } from './feed-probe.js';
import { cloud, createCloudTranslator } from './cloud-translate.js';
import { cloudRadio } from './cloud-transcribe.js';
import { createNewsTranslator, startNewsTranslation } from './news-translate.js';

let lan = null;   // accès depuis un téléphone / une tablette du réseau local

// État de la connexion F1 TV : jeton (~4 jours) et session formula1.com (~30 jours), qui permet
// de renouveler le jeton automatiquement
function authInfo() {
  const token = getConfig().f1tvToken;
  const info = tokenInfo(token);
  if (!info.hasToken) return info;
  const ses = sessionOf(token);
  return {
    ...info,
    autoRenew: !!ses,
    sessionExpiresAt: ses?.expiresAt || null,
    lastRenewal: renewState.lastRenewal || null,
    renewError: renewState.lastError,
    renewRejected: renewState.rejected,
  };
}

const hub = new Hub({ maxDelayMs: settings.maxDelayMs });
// Réglages des overlays de streaming (Réglages → Streaming), gardés d'un lancement à l'autre
hub.overlayCfg = getConfig().overlays || null;
hub.onOverlayCfg = (cfg) => saveConfig({ overlays: cfg });
// Démarrage du serveur (nouvelle version après une mise à jour) : les overlays ouverts dans OBS se rechargent
hub.boot = Date.now();
const recorder = process.env.NO_RECORDING ? null : new Recorder();
const live = new LiveSource(hub, () => {
  const token = getConfig().f1tvToken;
  return token && !tokenInfo(token).expired ? token : null;
}, recorder);
const replay = new ReplaySource(hub);
const feedDiags = new Map();   // diagnostic des données F1, par séance
// Actualités traduites d'avance (server/news-translate.js)
const newsTranslator = createNewsTranslator({
  // File d'attente à part : la traduction de fond ne retarde jamais ce qui est à l'écran
  cloud: createCloudTranslator(),
  snapshot: () => newsSnapshot().items,
  known: getTranslations,
  store: addTranslations,
  lang: () => getConfig().newsTranslateLang || null,
});
for (const h of getConfig().radioHosts || []) allowHost(h);

// ---- HTTP ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// Saison demandée : un nombre entier plausible, sinon la saison en cours (une année farfelue
// renverrait une erreur des serveurs de résultats, ou créerait un cache vide)
function yearOf(v) {
  const now = new Date().getFullYear(), y = Number(v);
  return Number.isInteger(y) && y >= 1950 && y <= now + 1 ? y : now;
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// Données lues sur le serveur de Paddock Live (mêmes adresses que la version web : /api/x -> /live/api/x), relayées
// telles quelles : une correction y arrive sans mise à jour de l'appli
async function fromServer(res, url, path = `/live${url.pathname}`) {
  let r;
  try {
    r = await request(`${SEASON_URL}${path}${url.search}`, { timeout: 30000 });
  } catch (err) {
    return sendJSON(res, 503, { error: `serveur de Paddock Live injoignable (${err.message})` });
  }
  const keep = ['content-type', 'content-disposition', 'cache-control'].filter((h) => r.headers[h]);
  res.writeHead(r.status, Object.fromEntries(keep.map((h) => [h, r.headers[h]])));
  res.end(r.body);
}

// Requête mal formée : erreur 400 (et non 500)
class BadRequest extends Error {}

// Corps brut (au plus max octets)
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new BadRequest('Requête trop volumineuse')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readBody(req, max = 1e6) {
  const text = (await readRaw(req, max)).toString('utf8');
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new BadRequest('JSON invalide'); }
  // Les routes attendent un objet : « null », un nombre ou une liste valent un corps vide
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function serveStatic(req, res, pathname) {
  let base = path.join(ROOT, 'public');
  let rel = pathname;
  if (pathname.startsWith('/shared/')) {
    base = path.join(ROOT, 'shared');
    rel = pathname.slice('/shared'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  // L'API ne répond qu'à l'interface elle-même : un autre site ouvert dans le navigateur ne peut
  // ni la lire ni déclencher d'action (relais F1 TV avec le jeton, réglages, enregistrements…)
  const fromExtension = extensionRequest(req.headers) && EXTENSION_ROUTES.has(route) && isLoopback(req.socket.remoteAddress);
  if (!sameSiteRequest(req.headers) && !fromExtension) return sendJSON(res, 403, { error: 'Origine refusée' });

  switch (route) {
    // QR code de la page des alertes du téléphone (paddocklive.app/alertes), affiché dans les Réglages
    case 'GET /api/qr/alertes':
      return sendJSON(res, 200, { url: 'https://paddocklive.app/alertes/', svg: qrSvg('https://paddocklive.app/alertes/') });
    case 'GET /api/lan':
    case 'POST /api/lan': {
      // Réglage de l'accès réseau : uniquement depuis cet ordinateur
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      if (req.method === 'GET') return sendJSON(res, 200, lan.info());
      const body = await readBody(req);
      return sendJSON(res, 200, await lan.set({ enabled: body.enabled, regenerate: !!body.regenerate, port: body.port }));
    }

    // Traductions des textes FIA (évolutions techniques), partagées entre appareils
    case 'GET /api/translations':
      return sendJSON(res, 200, getTranslations(url.searchParams.get('lang') || 'fr'));
    case 'POST /api/translations': {
      const body = await readBody(req);
      return sendJSON(res, 200, { added: addTranslations(body.lang, body.items) });
    }

    case 'GET /api/status':
      return sendJSON(res, 200, { ...hub.statusPayload(), auth: authInfo() });

    // Meilleurs tours de deux pilotes : secteurs et mini-secteurs (à la date du délai TV)
    case 'GET /api/compare': {
      const a = url.searchParams.get('a'), b = url.searchParams.get('b');
      const until = Number(url.searchParams.get('until')) || Date.now();
      if (!/^\d+$/.test(a || '') || !/^\d+$/.test(b || '')) return sendJSON(res, 400, { error: 'Pilotes manquants' });
      const lapNo = (k) => (/^\d{1,3}$/.test(url.searchParams.get(k) || '') ? Number(url.searchParams.get(k)) : null);
      return sendJSON(res, 200, await compareLaps(hub, { a, b, until: Math.min(until, hub.clock()), la: lapNo('la'), lb: lapNo('lb') }));
    }

    // Pneus du week-end, records du circuit, météo, documents FIA (et leurs PDF), photos des pilotes, statistiques
    // détaillées et documents FIA de la Saison, zones et boucles de chronométrage du circuit : lus sur le serveur de
    // Paddock Live
    case 'GET /api/tyres':
    case 'GET /api/records':
    case 'GET /api/forecast':
    case 'GET /api/fia-docs':
    case 'GET /api/fia-pdf':
    case 'GET /api/headshot':
    case 'GET /api/season/stats':
    case 'GET /api/season/fia':
    case 'GET /api/zones':
    case 'GET /api/loops':
      return fromServer(res, url);

    case 'GET /api/circuit': {
      const key = Number(url.searchParams.get('key'));
      const year = yearOf(url.searchParams.get('year'));
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await circuit(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Tracé indisponible' });
    }

    case 'GET /api/changelog': {
      let text = '';
      try { text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { /* journal absent */ }
      return sendJSON(res, 200, { versions: parseChangelog(text) });
    }

    // Actualités : nouvelles de toutes les sources, gestion des sources
    case 'GET /api/news':
      return sendJSON(res, 200, newsSnapshot());
    case 'POST /api/news/refresh':
      refreshNews();
      return sendJSON(res, 200, { ok: true });
    // Article d'une actualité en mode lecture : ?u=<lien de l'article> -> titre, photo, texte (lu par le serveur de
    // Paddock Live)
    case 'GET /api/news/article':
      return fromServer(res, url, '/news/api/article');

    // Traduction d'avance des actualités : { lang: 'fr' | 'en' | null } (null = désactivée)
    case 'POST /api/news/translate': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      const body = await readBody(req);
      const lang = ['fr', 'en'].includes(body.lang) ? body.lang : null;
      if (getConfig().newsTranslateLang !== lang) saveConfig({ newsTranslateLang: lang });
      newsTranslator.sweep();
      return sendJSON(res, 200, { lang });
    }
    case 'POST /api/news/sources': {
      const body = await readBody(req);
      if (body.toggle) { setNewsSourceEnabled(String(body.toggle), !!body.on); return sendJSON(res, 200, { ok: true }); }
      return sendJSON(res, 400, { error: 'Requête invalide' });
    }

    case 'GET /api/season': {
      const year = yearOf(url.searchParams.get('year'));
      return sendJSON(res, 200, await season(year));
    }

    // Horaires des séances (rappels de l'interface) et calendrier .ics à importer dans un agenda
    case 'GET /api/schedule': {
      const year = yearOf(url.searchParams.get('year'));
      const d = await season(year);
      return sendJSON(res, 200, { year, races: d.races.map((r) => ({ round: r.round, name: r.name, locality: r.locality, country: r.country, circuitId: r.circuitId, lat: r.lat, lon: r.lon, sessions: r.sessions })) });
    }
    case 'GET /api/calendar.ics': {
      const year = yearOf(url.searchParams.get('year'));
      const round = Number(url.searchParams.get('round')) || null;
      const alarm = Math.max(0, Math.min(120, Number(url.searchParams.get('alarm') ?? 15) || 0));
      const d = await season(year);
      const body = buildIcs(d.races, { year, round, alarmMin: alarm, lang: url.searchParams.get('lang') === 'en' ? 'en' : 'fr' });
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="f1-${year}${round ? `-manche-${round}` : ''}.ics"`,
        'Cache-Control': 'no-store',
      });
      return res.end(body);
    }

    // Lumières connectées (expérimental) : réglages et commandes depuis cet ordinateur uniquement
    case 'GET /api/lights':
    case 'POST /api/lights':
    case 'POST /api/lights/discover':
    case 'POST /api/lights/pair':
    case 'GET /api/lights/devices':
    case 'POST /api/lights/set': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      try {
        if (route === 'GET /api/lights') return sendJSON(res, 200, lightsInfo());
        if (route === 'GET /api/lights/devices') return sendJSON(res, 200, { devices: await lightDevices() });
        if (route === 'POST /api/lights/discover') return sendJSON(res, 200, { bridges: await hueDiscover() });
        const body = await readBody(req);
        if (route === 'POST /api/lights') return sendJSON(res, 200, saveLights(body));
        if (route === 'POST /api/lights/pair') return sendJSON(res, 200, await huePair(String(body.ip || '').trim()));
        return sendJSON(res, 200, await setLights(String(body.state || ''), { force: !!body.force }));
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Sauvegarde des réglages (partie serveur, sans jeton ni clé) : depuis cet ordinateur uniquement
    case 'GET /api/backup':
    case 'POST /api/backup': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      if (route === 'GET /api/backup') return sendJSON(res, 200, exportServerSettings());
      return sendJSON(res, 200, importServerSettings(await readBody(req)));
    }

    // Mode créateur : comptes des réseaux sociaux (connexions) et page web du Studio, qui prépare et publie les posts
    case 'GET /api/social/accounts':
    case 'POST /api/social/accounts':
    case 'POST /api/social/tiktok/login':
    case 'POST /api/social/meta/login':
    case 'POST /api/social/tiktok2/login':
    case 'POST /api/social/youtube/login':
    case 'GET /api/social/studio':
    case 'POST /api/social/studio': {
      if (!isLoopback(req.socket.remoteAddress) || !creatorEnabled()) return sendJSON(res, 403, { error: 'Mode créateur désactivé' });
      try {
        if (route === 'GET /api/social/accounts') return sendJSON(res, 200, accountsInfo());
        if (route === 'GET /api/social/studio') return sendJSON(res, 200, studioInfo());
        if (route === 'POST /api/social/studio') {
          const b = await readBody(req, 1e4);
          return sendJSON(res, 200, b.off ? await disableStudio() : b.sync ? (await syncStudio({ force: true }), studioInfo()) : await enableStudio(String(b.code || '')));
        }
        if (route === 'POST /api/social/meta/login') return sendJSON(res, 200, { url: metaLoginUrl(req.socket.localPort, await readBody(req, 4e3)) });
        if (route === 'POST /api/social/tiktok/login') return sendJSON(res, 200, { url: tiktokLoginUrl(`http://127.0.0.1:${req.socket.localPort}`) });
        if (route === 'POST /api/social/tiktok2/login') return sendJSON(res, 200, { url: tiktokLoginUrl(`http://127.0.0.1:${req.socket.localPort}`, true) });
        if (route === 'POST /api/social/youtube/login') return sendJSON(res, 200, { url: youtubeLoginUrl(`http://127.0.0.1:${req.socket.localPort}`) });
        const body = await readBody(req, 1e6);
        const info = await saveAccount(String(body.network || ''), body);
        syncStudio();   // page web du créateur : comptes à jour
        return sendJSON(res, 200, info);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }
    // Traduction par le serveur Paddock Live : { to, items: [{ text, from, kind? }] } -> { out }
    case 'POST /api/translate': {
      const body = await readBody(req, 128e3);
      if (!Array.isArray(body.items) || typeof body.to !== 'string') return sendJSON(res, 400, { error: 'Requête invalide' });
      if (!cloud.available()) return sendJSON(res, 503, { error: 'Traduction en ligne indisponible' });
      const out = await Promise.all(body.items.slice(0, 80).map((it) => cloud.translate(it?.text, it?.from, body.to, it?.kind)));
      // Plafond du jour atteint ou serveur injoignable pendant l'envoi : l'interface traduit elle-même
      if (!cloud.available()) return sendJSON(res, 503, { error: 'Traduction en ligne indisponible', out });
      return sendJSON(res, 200, { out });
    }

    // Transcription d'une radio d'équipe par le serveur Paddock Live : ?u=<adresse d'archive> -> { text, d }
    case 'GET /api/radio-text': {
      const rel = archivePath(url.searchParams.get('u') || '');
      if (!rel || !/^\d{4}\/[\w\-./]+\.(mp3|m4a|aac)$/i.test(rel) || rel.includes('..')) return sendJSON(res, 400, { error: 'Radio invalide' });
      if (!cloudRadio.available()) return sendJSON(res, 503, { error: 'Transcription en ligne indisponible' });
      try {
        const r = await cloudRadio.transcribe(rel);
        return r ? sendJSON(res, 200, r) : sendJSON(res, 503, { error: 'Transcription en ligne indisponible' });
      } catch (err) {
        return sendJSON(res, err.status || 502, { error: err.message });
      }
    }

    // Son des caméras embarquées (fenêtre WAV de 30 s) : retranscrit par le serveur Paddock Live, avec l'heure de chaque
    // phrase -> { segments }
    case 'POST /api/radio-window': {
      const body = await readRaw(req, 2 * 1024 * 1024);
      let r;
      try {
        r = await request(`${SEASON_URL}/live/api/radio-window`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'Content-Length': body.length }, body, timeout: 60000 });
      } catch (err) {
        return sendJSON(res, 503, { error: `serveur de Paddock Live injoignable (${err.message})` });
      }
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(r.body);
    }

    // Statistiques d'utilisation anonymes : l'accord se donne sur l'ordinateur ; toutes les
    // fenêtres (téléphone compris) signalent les fonctions utilisées si c'est accepté
    case 'GET /api/stats':
      return sendJSON(res, 200, { ...stats.state(), canSet: isLoopback(req.socket.remoteAddress) });
    case 'POST /api/stats': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      const body = await readBody(req);
      if (typeof body.on !== 'boolean') return sendJSON(res, 400, { error: 'Réglage invalide' });
      stats.set(body.on);
      return sendJSON(res, 200, stats.state());
    }
    case 'POST /api/stats/events': {
      const body = await readBody(req, 64e3);
      return sendJSON(res, 200, { added: stats.fromClient(body.events, body.device, body.errors) });
    }

    // Mode créateur : depuis cet ordinateur uniquement
    case 'GET /api/creator':
      return sendJSON(res, 200, { enabled: isLoopback(req.socket.remoteAddress) && creatorEnabled() });
    case 'POST /api/creator': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      const body = await readBody(req, 1e6);
      if (body.off) return sendJSON(res, 200, { enabled: setCreator(null, false) });
      if (!setCreator(body.code)) return sendJSON(res, 403, { error: 'Code incorrect' });
      return sendJSON(res, 200, { enabled: true, restored: await restoreAccounts(body.code) });
    }

    // Pronostics entre amis (pole et podium de chaque Grand Prix) : dans un groupe en ligne seulement, comme la
    // version web (anciens pronostics gardés sur l'ordinateur : plus lus)
    case 'GET /api/predictions':
      return sendJSON(res, 200, { online: true });
    // Groupe en ligne : g = identifiant du groupe (création : POST sans g)
    case 'GET /api/predictions/online': {
      const r = await pronosOnline('GET', url.searchParams.get('g') || '', { query: `?${new URLSearchParams({ year: yearOf(url.searchParams.get('year')), tok: url.searchParams.get('tok') || '' })}` });
      return sendJSON(res, r.status, r.data);
    }
    case 'POST /api/predictions/online': {
      const { g, ...body } = await readBody(req, 1e4);
      const r = await pronosOnline('POST', g || 'new', { body });
      return sendJSON(res, r.status, r.data);
    }
    case 'DELETE /api/predictions/online': {
      const { g, ...body } = await readBody(req, 1e4);
      const r = await pronosOnline('DELETE', g || '', { body });
      return sendJSON(res, r.status, r.data);
    }
    // Question ou suggestion (Réglages → À propos), relayée au créateur
    case 'POST /api/feedback': {
      const r = await sendFeedback(await readBody(req, 2e4));
      return sendJSON(res, r.status, r.data);
    }
    // Pièce jointe du message (capture, vidéo), envoyée seule après lui
    case 'POST /api/feedback/file': {
      const r = await sendFeedbackFile(url.searchParams, String(req.headers['content-type'] || ''), await readRaw(req, 40e6));
      return sendJSON(res, r.status, r.data);
    }
    // Fond de carte du radar météo (OpenStreetMap, en cache)
    case 'GET /api/tile': {
      const [z, x, y] = ['z', 'x', 'y'].map((k) => Number(url.searchParams.get(k)));
      try {
        const png = await osmTile(z, x, y);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=604800' });
        return res.end(png);
      } catch (err) {
        return sendJSON(res, 404, { error: err.message });
      }
    }

    case 'GET /api/f1tv/content': {
      const meeting = url.searchParams.get('meeting'), session = url.searchParams.get('session');
      if (!meeting || !session) return sendJSON(res, 400, { error: 'Paramètres meeting et session requis' });
      return sendJSON(res, 200, await findSessionContent(meeting, session));
    }

    case 'GET /api/f1tv/play': {
      const token = getConfig().f1tvToken;
      const info = tokenInfo(token);
      if (!info.hasToken) return sendJSON(res, 401, { error: 'Aucun jeton F1 TV : connectez-vous dans Réglages.' });
      if (info.expired) return sendJSON(res, 401, { error: 'Jeton F1 TV expiré : reconnectez-vous dans Réglages.' });
      const contentId = url.searchParams.get('contentId');
      if (!contentId) return sendJSON(res, 400, { error: 'Paramètre contentId requis' });
      return sendJSON(res, 200, { ...(await playback(contentId, url.searchParams.get('channelId'), token)), account: { product: info.product, country: info.country } });
    }

    case 'POST /api/radio/allow': {
      // Station ajoutée par l'utilisateur : son hôte est autorisé dans le relais (et mémorisé).
      const body = await readBody(req);
      let host;
      try { host = new URL(body.url).host; } catch { return sendJSON(res, 400, { error: 'Adresse de flux invalide' }); }
      if (localTarget(new URL(body.url).hostname)) return sendJSON(res, 400, { error: 'Adresse locale refusée' });
      const hosts = [...new Set([...(getConfig().radioHosts || []), host])];
      saveConfig({ radioHosts: hosts });
      allowHost(host);
      return sendJSON(res, 200, { ok: true, host });
    }

    case 'GET /api/radio/resolve': {
      const target = url.searchParams.get('u') || '';
      if (!URL.canParse(target)) return sendJSON(res, 400, { error: 'Adresse invalide' });
      try {
        const stream = await resolvePlaylist(target);
        allowHost(new URL(stream).host);
        return sendJSON(res, 200, { url: stream });
      } catch (err) { return sendJSON(res, 400, { error: err.message }); }
    }

    case 'GET /api/f1tv/proxy':
    case 'POST /api/f1tv/proxy': {
      // Archives officielles (radios d'un replay) : même accès que les replays (F1 TV, miroir)
      const rel = req.method === 'GET' ? archivePath(url.searchParams.get('u') || '') : null;
      if (rel) return sendArchiveFile(res, rel);
      return f1tvProxy(req, res, url.searchParams.get('u') || '', getConfig().f1tvToken);
    }
    case 'GET /api/archive/file':
      return sendArchiveFile(res, url.searchParams.get('p') || '');

    // Diagnostic des données F1 : flux cachés testés en direct (server/feed-probe.js)
    case 'GET /api/feeds/probe':
      if (!isLoopback(req.socket.remoteAddress) || !creatorEnabled()) return sendJSON(res, 403, { error: 'Mode créateur désactivé' });
      return sendJSON(res, 200, probeState());

    // Diagnostic des données F1 : toute la séance lue dans les archives (gardé pour la session)
    case 'GET /api/feeds/diag': {
      // Mode créateur, sur l'ordinateur seulement : la lecture d'une séance entière peut prendre plusieurs secondes
      if (!isLoopback(req.socket.remoteAddress) || !creatorEnabled()) return sendJSON(res, 403, { error: 'Mode créateur désactivé' });
      const p = url.searchParams.get('path') || '';
      if (!/^\d{4}\/[\w\-./]+\/$/.test(p) || p.includes('..')) return sendJSON(res, 400, { error: 'Chemin invalide' });
      try {
        if (!feedDiags.has(p)) feedDiags.set(p, feedDiag(p).catch((err) => { feedDiags.delete(p); throw err; }));
        return sendJSON(res, 200, await feedDiags.get(p));
      } catch (err) {
        return sendJSON(res, err.status || 502, { error: err.message });
      }
    }

    case 'GET /api/recordings':
      return sendJSON(res, 200, listRecordings());

    case 'DELETE /api/recordings': {
      // Tout supprimer (sauf la séance en cours d'enregistrement)
      if (url.searchParams.get('all') === '1') { pruneRecordings(0, recorder?.file || null); return sendJSON(res, 200, { ok: true }); }
      const file = recordingPath(url.searchParams.get('id') || '');
      if (!file) return sendJSON(res, 404, { error: 'Enregistrement introuvable' });
      if (recorder?.file === file) return sendJSON(res, 409, { error: 'Enregistrement en cours' });
      fs.unlinkSync(file);
      return sendJSON(res, 200, { ok: true });
    }

    case 'GET /api/archive': {
      const year = yearOf(url.searchParams.get('year'));
      try {
        return sendJSON(res, 200, await seasonIndex(year));
      } catch (err) {
        return sendJSON(res, 502, { error: `Replays ${year} indisponibles : ${archiveError(year, err)}` });
      }
    }

    case 'POST /api/live':
      replay.stop();
      live.stop();
      live.start();
      return sendJSON(res, 200, { ok: true });

    case 'POST /api/replay': {
      const body = await readBody(req);
      let source;
      if (typeof body.local === 'string' && recordingPath(body.local)) source = { local: body.local };
      else if (typeof body.path === 'string' && /^\d{4}\/[\w\-./]+\/$/.test(body.path)) source = body.path;
      else return sendJSON(res, 400, { error: 'Session invalide' });
      live.stop();
      stats.record('session.replay');
      replay.start(source, body.startOffsetMs).catch((err) => console.warn('[replay]', err.message));
      return sendJSON(res, 202, { ok: true });
    }

    // Moments clés du replay en cours (départ, drapeaux, leaders, arrêts, incidents, pénalités…)
    case 'GET /api/sync/radios':
      return sendJSON(res, 200, hub.radioCaptures());

    case 'GET /api/replay/moments':
      return sendJSON(res, 200, { path: hub.source.path || null, moments: hub.source.mode === 'replay' ? (url.searchParams.get('lang') === 'en' ? replay.momentsEn : replay.moments) || [] : [] });

    case 'POST /api/replay/control': {
      const body = await readBody(req);
      if (body.action === 'pause') replay.pause();
      else if (body.action === 'resume') replay.resume();
      else if (body.action === 'seek' && Number.isFinite(body.toMs)) replay.seek(body.toMs);
      else if (body.action === 'skip' && Number.isFinite(body.deltaMs)) replay.seek(replay.position() + body.deltaMs);
      else if (body.action === 'speed' && Number.isFinite(body.speed)) replay.setSpeed(body.speed); else return sendJSON(res, 400, { error: 'Action inconnue' });
      return sendJSON(res, 200, { ok: true });
    }

    // Commandes à distance (Stream Deck, Bitfocus Companion…) : simples adresses à ouvrir depuis cet
    // ordinateur. do = delay+ / delay- / delay (s = secondes), pause / play / toggle / back / forward (replay)
    case 'GET /api/remote': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Commande disponible uniquement sur l\'ordinateur' });
      const act = (url.searchParams.get('do') || '').replace(' ', '+');   // « + » d'une adresse lu comme une espace
      const s = Number(url.searchParams.get('s'));
      if (/^delay[+-]?$/.test(act)) {
        const sign = act.endsWith('-') ? -1 : act === 'delay' ? 0 : 1;
        const step = (Number.isFinite(s) && s >= 0 ? s : 1) * 1000;
        return sendJSON(res, 200, { ok: true, delay: hub.setHostDelay(sign ? (hub.hostDelay ?? 0) + sign * step : step) / 1000 });
      }
      if (!['pause', 'play', 'toggle', 'back', 'forward'].includes(act)) return sendJSON(res, 400, { error: 'Commande inconnue' });
      if (!replay.isActive()) return sendJSON(res, 409, { error: 'Aucun replay en cours' });
      const paused = hub.pausedAt !== null;
      if (act === 'pause' || (act === 'toggle' && !paused)) replay.pause();
      else if (act === 'play' || act === 'toggle') replay.resume();
      else replay.seek(replay.position() + (act === 'back' ? -1 : 1) * (Number.isFinite(s) && s > 0 ? s : 10) * 1000);
      return sendJSON(res, 200, { ok: true, paused: hub.pausedAt !== null });
    }

    case 'GET /api/auth':
      return sendJSON(res, 200, authInfo());

    // Renouveler le jeton tout de suite (sinon fait automatiquement dans ses dernières 24 h)
    case 'POST /api/auth/renew':
      try {
        await renewF1tv({ force: true });
        return sendJSON(res, 200, authInfo());
      } catch (err) {
        renewState.lastError = err.message;
        return sendJSON(res, 502, { error: err.message });
      }

    case 'POST /api/auth': {
      const body = await readBody(req);
      const token = parseF1tvToken(body.token);
      if (!token) return sendJSON(res, 400, { error: 'Connexion F1 TV non reconnue : reconnectez-vous sur formula1.com.' });
      const info = tokenInfo(token);
      const expiredMsg = 'Connexion F1 TV expirée : reconnectez-vous sur formula1.com.';
      if (info.expired) {
        // Jeton périmé mais session formula1.com encore valide : on le renouvelle aussitôt
        const ses = sessionOf(token);
        if (!ses || (ses.expiresAt && ses.expiresAt < Date.now())) return sendJSON(res, 400, { error: expiredMsg });
        const previous = getConfig().f1tvToken;
        saveConfig({ f1tvToken: token });
        try { await renewF1tv({ force: true }); } catch {
          saveConfig({ f1tvToken: previous });
          return sendJSON(res, 400, { error: expiredMsg });
        }
      } else saveConfig({ f1tvToken: token });
      // Jeton reçu (extension : cookie du site F1 TV si celui du compte a expiré) échangé aussitôt contre le jeton
      // du compte, celui que donne la fenêtre de connexion et que la F1 accepte pour ses archives ; sinon gardé
      if (sessionOf(getConfig().f1tvToken)) await renewF1tv({ force: true, swap: true }).catch(() => {});
      resetRenewState();
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, authInfo());
    }

    // GPS laissé à un autre appareil du même compte F1 TV (version web…) : repris ici
    case 'POST /api/live/here':
      if (hub.source.mode === 'live') live.here();
      return sendJSON(res, 200, { ok: true });

    case 'DELETE /api/auth':
      saveConfig({ f1tvToken: null });
      resetRenewState();
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, { hasToken: false });

    default:
      return sendJSON(res, 404, { error: 'Route inconnue' });
  }
}

// Serveur principal, qui n'écoute que sur cet ordinateur : seules les adresses locales sont
// acceptées (un nom de domaine extérieur pointant vers 127.0.0.1 = attaque « DNS rebinding »).
// L'accès depuis le réseau local passe par son propre serveur, protégé par une clé.
const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(settings.host);

async function handler(req, res) {
  if (loopbackOnly && req.socket.server === server && !localHost(req.headers.host)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Hôte non autorisé');
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  // Retour des connexions TikTok, YouTube et Facebook (mode créateur) : page ouverte par le navigateur
  const oauthNet = { '/tiktok-callback/': ['TikTok', tiktokCallback], '/youtube-callback/': ['YouTube', youtubeCallback], '/meta-callback/': ['Facebook', metaCallback] }[url.pathname];
  if (oauthNet && isLoopback(req.socket.remoteAddress)) {
    const [name, callback] = oauthNet;
    let msg = `Compte ${name} connecté. Vous pouvez fermer cet onglet et revenir à Paddock Live.`;
    try {
      if (!creatorEnabled()) throw new Error('Mode créateur désactivé');
      await callback(url.searchParams);
      syncStudio();   // page web du créateur : compte reconnecté envoyé tout de suite
    } catch (err) { msg = `Connexion ${name} impossible : ${err.message}`; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Paddock Live</title><body style="font:16px system-ui;background:#0b0d12;color:#f3f5f9;display:grid;place-items:center;height:90vh"><p>${msg.replace(/[<>&]/g, '')}</p></body>`);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      sendJSON(res, err instanceof BadRequest ? 400 : err instanceof HttpError ? 502 : 500, { error: err.message });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const pathname = decodePath(url.pathname);
  if (pathname === null) { res.writeHead(400); res.end('Adresse invalide'); return; }
  serveStatic(req, res, pathname);
}

const server = http.createServer(handler);
const wss = new WebSocketServer({
  server, path: '/ws', perMessageDeflate: { threshold: 4096 },
  // Connexion depuis l'interface uniquement (pas depuis la page d'un autre site)
  verifyClient: ({ req }) => (!loopbackOnly || localHost(req.headers.host)) && sameSiteRequest({ origin: req.headers.origin, host: req.headers.host }),
});
// follow : overlay de streaming (OBS, Streamlabs, Meld Studio) : suit le délai TV de l'appli au lieu d'imposer le sien
wss.on('connection', (ws, req) => hub.addClient(ws, { host: isLoopback(req.socket.remoteAddress) && !/[?&]follow=1(&|$)/.test(req.url || '') }));
lan = createLan({ handler, onSocket: (ws) => hub.addClient(ws, { host: false }) });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Le port ${settings.port} est déjà utilisé (Paddock Live est peut-être déjà lancé ?). Utilisez PORT=3001 par exemple.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(settings.port, settings.host, () => {
  const shown = settings.host === '0.0.0.0' ? 'localhost' : settings.host;
  console.log(`\n  Paddock Live prêt : http://${shown}:${settings.port}\n`);
  const auth = tokenInfo(getConfig().f1tvToken);
  if (!auth.hasToken) console.log('  (Sans jeton F1 TV : positions GPS estimées à partir des chronos. Voir README.)\n');
  else if (auth.expired) console.log('  Le jeton F1 TV enregistré est expiré (renouvellement automatique tenté si la session formula1.com est encore valide).\n');
});

live.start();
startAutoRenew();
startStats(hub, live);

// Actualités : chaque nouvelle est envoyée tout de suite aux fenêtres ouvertes
startNews();
startStudioSync();
onNews((list) => {
  const str = JSON.stringify({ type: 'news', items: list });
  for (const c of hub.clients) hub.send(c, str);
});
// … et traduite d'avance par le serveur Paddock Live (langue choisie par l'interface de l'ordinateur)
startNewsTranslation(newsTranslator, onNews);

// Une erreur imprévue (réponse d'un site mal formée…) ne doit pas arrêter le dashboard en pleine
// séance : elle est consignée et le serveur continue
process.on('unhandledRejection', (err) => { console.error('[erreur]', err); stats.record('error.server'); stats.recordError(err); });
process.on('uncaughtException', (err) => { console.error('[erreur]', err); stats.record('error.server'); stats.recordError(err); });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    recorder?.close();
    lan?.stop();
    process.exit(0);
  });
}
