// Configuration locale persistée dans config.json (non versionné).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dossier des données modifiables (config, cache, enregistrements). L'appli de bureau
// le place dans le profil utilisateur, car les fichiers du programme sont en lecture seule.
export const DATA_DIR = process.env.PADDOCK_DATA_DIR || ROOT;
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'config.json');

const defaults = {
  f1tvToken: null,
};

// Écriture complète ou rien : fichier temporaire renommé (une coupure pendant l'écriture laissait un fichier vide)
export function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

let current = { ...defaults };
try {
  current = { ...defaults, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch (err) {
  // Fichier abîmé : mis de côté (config.json.bad) avant d'être remplacé par les réglages par défaut
  if (err.code !== 'ENOENT') try { fs.copyFileSync(FILE, `${FILE}.bad`); } catch { /* illisible */ }
}

if (process.env.F1TV_TOKEN) current.f1tvToken = process.env.F1TV_TOKEN;

export const settings = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  maxDelayMs: (Number(process.env.MAX_DELAY_SECONDS) || 600) * 1000,
};

export function getConfig() {
  return current;
}

export function saveConfig(patch) {
  current = { ...current, ...patch };
  writeFileAtomic(FILE, JSON.stringify(current, null, 2));
  return current;
}

// Accepte : le JWT brut, la valeur (encodée ou non) du cookie "login-session" de formula1.com,
// ou un JSON contenant "subscriptionToken".
export function parseF1tvToken(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim().replace(/^["']|["']$/g, '');
  if (s.startsWith('%7B') || s.startsWith('%7b')) {
    try { s = decodeURIComponent(s); } catch { /* ignore */ }
  }
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      s = obj?.data?.subscriptionToken || obj?.subscriptionToken || '';
    } catch { return null; }
  }
  s = s.replace(/^Bearer\s+/i, '');
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(s) ? s : null;
}

export function tokenInfo(token) {
  if (!token) return { hasToken: false };
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const exp = payload.exp ? payload.exp * 1000 : null;
    return {
      hasToken: true,
      expiresAt: exp,
      expired: exp ? exp < Date.now() : false,
      subscription: payload.SubscriptionStatus || payload.subscriptionStatus || null,
      // Offre souscrite (« F1 TV Pro Annual », « F1 TV Access Monthly »…) et pays du compte
      product: payload.SubscribedProduct || payload.subscribedProduct || null,
      country: payload.ExternalAuthorizationsContextData || payload.country || null,
    };
  } catch {
    return { hasToken: true, expiresAt: null, expired: false };
  }
}
