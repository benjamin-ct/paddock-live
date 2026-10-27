// Archives officielles de la F1 (livetiming.formula1.com/static/…) : replays, statistiques de la
// saison, records, pneus. Depuis octobre 2026, la F1 refuse l'accès anonyme (HTTP 401). On essaie
// donc, dans l'ordre : l'accès libre, l'accès avec la connexion F1 TV de l'utilisateur, puis le miroir
// public de FastF1. La dernière méthode qui a marché est essayée en premier les fois suivantes.
import { request, HttpError } from './net.js';
import { getConfig, tokenInfo } from './config.js';

export const STATIC = 'https://livetiming.formula1.com/static/';
export const MIRROR = 'https://livetiming-mirror.fastf1.dev/static/';

export class ArchiveLockedError extends HttpError {
  constructor(url, hasToken) {
    super(401, url);
    this.locked = true;
    this.message = hasToken
      ? 'la F1 refuse l\'accès à ses archives, même avec la connexion F1 TV'
      : 'la F1 réserve désormais ses archives aux abonnés : connectez votre compte F1 TV (Réglages → Compte F1 TV)';
  }
}

const METHODS = ['open', 'token', 'mirror'];
let preferred = 'open';

function f1tvToken() {
  const t = getConfig().f1tvToken;
  return t && !tokenInfo(t).expired ? t : null;
}

// Pour les tests : méthode préférée remise à zéro
export function resetArchiveAccess() { preferred = 'open'; }
export const archiveAccess = () => preferred;

// Corps brut d'un fichier d'archive (chemin relatif à /static/), ou erreur HttpError
export async function archiveGet(rel, { timeout = 30000, fetch = request, raw = false, token = f1tvToken() } = {}) {
  const order = [preferred, ...METHODS.filter((m) => m !== preferred)];
  let refused = false;
  let missing = null;
  for (const m of order) {
    if (m === 'token' && !token) continue;
    const url = (m === 'mirror' ? MIRROR : STATIC) + rel;
    // Jeton F1 TV : envoyé seulement à la F1 (en-tête standard et celui des services F1 TV)
    const headers = m === 'token' ? { Authorization: `Bearer ${token}`, ascendontoken: token } : {};
    const r = await fetch(url, { headers, timeout });
    if (r.status === 200) {
      preferred = m;
      return raw ? r.body : r.body.toString('utf8').replace(/^\uFEFF/, '');
    }
    if (r.status === 401 || r.status === 403) { refused = true; continue; }
    if (r.status === 404) { missing ??= new HttpError(404, url); continue; }
    throw new HttpError(r.status, url);   // erreur serveur, surcharge : l'appelant réessaie
  }
  // Refusé par la F1 (et absent du miroir) : archives fermées ; sinon le fichier n'existe pas
  if (refused) throw new ArchiveLockedError(STATIC + rel, !!token);
  throw missing || new HttpError(404, STATIC + rel);
}

export async function archiveJSON(rel, opts) {
  return JSON.parse(await archiveGet(rel, opts));
}

// Fichier d'archive servi tel quel à l'interface (radios d'équipe d'un replay : lecture, transcription)
const TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', json: 'application/json', jsonStream: 'text/plain' };
export async function sendArchiveFile(res, rel) {
  if (typeof rel !== 'string' || !/^\d{4}\/[\w\-./]+$/.test(rel) || rel.includes('..')) { res.writeHead(400); res.end('Chemin invalide'); return; }
  try {
    const body = await archiveGet(rel, { raw: true, timeout: 30000 });
    res.writeHead(200, { 'Content-Type': TYPES[rel.split('.').pop()] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'private, max-age=86400' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.status || 502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err.message);
  }
}

// Adresse d'archive (https://livetiming.formula1.com/static/…) -> chemin relatif, sinon null
export function archivePath(url) {
  return typeof url === 'string' && url.startsWith(STATIC) ? decodeURIComponent(url.slice(STATIC.length).split(/[?#]/)[0]) : null;
}

// Message lisible quand l'index des archives officielles d'une année est inaccessible (Replays)
export function archiveError(year, err) {
  if (err?.locked) return err.message;   // archives réservées aux abonnés F1 TV
  return err?.status === 403 || err?.status === 404
    ? `la F1 ne donne pas accès aux archives officielles de ${year}`
    : `archives officielles de la F1 injoignables (${err?.message || err}) ; nouvel essai dans quelques minutes`;
}
