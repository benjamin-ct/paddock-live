// Renouvellement automatique de la connexion F1 TV.
// Le jeton F1 TV (subscriptionToken) ne vaut que ~4 jours, mais il contient l'identifiant de la
// session du compte formula1.com (SessionId, valable ~30 jours après la connexion). Tant que cette
// session est valide, l'API compte de la F1 délivre un nouveau jeton : on le fait tout seul avant
// l'expiration, sans avoir à se reconnecter. Même requête que le site F1 TV lui-même.
import { request } from './net.js';
import { getConfig, saveConfig } from './config.js';

const RETRIEVE_URL = 'https://api.formula1.com/v1/account/Subscriber/RetrieveSubscriber';
// Clé publique et identifiant du site web formula1.com (présents dans les pages du site)
const API_KEY = 'fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7';
const SYSTEM_ID = '60a9ad84-e93d-480f-80d6-af37494f2e22';

const RENEW_BEFORE = 24 * 3600 * 1000;   // renouvelé dans les 24 dernières heures
const CHECK_EVERY = 20 * 60 * 1000;

const decode = (jwt) => {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
};

// Session du compte contenue dans le jeton : { id, expiresAt } (expiresAt null si inconnue)
export function sessionOf(token) {
  const id = decode(token)?.SessionId;
  if (typeof id !== 'string' || !id) return null;
  const inner = decode(id);
  return { id, expiresAt: inner?.exp ? inner.exp * 1000 : null };
}

export const state = { lastAttempt: 0, lastRenewal: 0, lastError: null, rejected: false };

// Demande un nouveau jeton à la F1. Renvoie le nouveau jeton, ou lève une erreur. swap : jeton échangé même
// s'il n'expire pas plus tard (jeton du site F1 TV contre celui du compte, voir POST /api/auth)
export async function renew({ force = false, swap = false, send = request } = {}) {
  const token = getConfig().f1tvToken;
  if (!token) throw new Error('Aucun jeton F1 TV');
  const exp = (decode(token)?.exp || 0) * 1000;
  if (!force && exp - Date.now() > RENEW_BEFORE) return null;
  const ses = sessionOf(token);
  if (!ses) throw new Error('Ce jeton ne permet pas le renouvellement automatique (pas d\'identifiant de session)');
  if (ses.expiresAt && ses.expiresAt < Date.now()) { state.rejected = true; throw new Error('Session formula1.com expirée : reconnectez-vous'); }
  state.lastAttempt = Date.now();
  const res = await send(RETRIEVE_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      apikey: API_KEY,
      'CD-SystemId': SYSTEM_ID,
      'cd-sessionid': ses.id,
      orderSubmitted: 'true',
    },
    body: '{}',
    timeout: 15000,
    redirects: 0,
  });
  if (res.status === 401 || res.status === 403) { state.rejected = true; throw new Error('La F1 a refusé le renouvellement : reconnectez-vous'); }
  if (res.status !== 200) throw new Error(`Renouvellement F1 TV : erreur ${res.status}`);
  let next = null;
  try { next = JSON.parse(res.body.toString('utf8'))?.data?.subscriptionToken; } catch { /* réponse illisible */ }
  const nextExp = (decode(next)?.exp || 0) * 1000;
  if (!next || (swap ? next === token : nextExp <= exp)) throw new Error('Renouvellement F1 TV : pas de nouveau jeton');
  // Le jeton a pu être remplacé entre-temps (nouvelle connexion) : on ne l'écrase pas
  if (getConfig().f1tvToken !== token) return null;
  saveConfig({ f1tvToken: next });
  state.lastRenewal = Date.now();
  state.lastError = null;
  state.rejected = false;
  console.log(`[f1tv] connexion renouvelée jusqu'au ${new Date(nextExp).toLocaleString('fr-FR')}`);
  return next;
}

// Vérification régulière (et au démarrage) ; nouvelle tentative plus tard en cas d'échec réseau
let timer = null;
export function startAutoRenew() {
  const tick = async () => {
    const token = getConfig().f1tvToken;
    if (!token || state.rejected) return;
    try { await renew(); } catch (err) {
      state.lastError = err.message;
      console.warn('[f1tv]', err.message);
    }
  };
  clearInterval(timer);
  timer = setInterval(tick, CHECK_EVERY);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
}

// Nouveau jeton enregistré à la main ou par la fenêtre de connexion : on repart de zéro
export function resetRenewState() {
  state.rejected = false;
  state.lastError = null;
}
