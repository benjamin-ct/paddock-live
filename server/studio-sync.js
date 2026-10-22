// Page web du créateur (/studio/ sur le serveur Paddock Live) : l'appli y envoie les comptes des
// réseaux (Facebook, Instagram, Threads, Bluesky, TikTok, YouTube) et la connexion F1 TV, chiffrés avec une clé dérivée du
// code du mode créateur, pour préparer et publier les posts depuis le téléphone, PC éteint.
// Le code n'est envoyé qu'à l'activation (vérifié contre son empreinte) ; ensuite seule la clé sert,
// gardée dans config.json comme les jetons eux-mêmes. Nouvel envoi automatique quand un jeton change.
import crypto from 'node:crypto';
import { getConfig, saveConfig, tokenInfo } from './config.js';
import { checkCode, creatorEnabled } from './creator.js';

export const STUDIO_URL = process.env.PADDOCK_STUDIO_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev';
// Adresse de la page à ouvrir dans le navigateur (l'appli garde STUDIO_URL pour ses appels)
export const STUDIO_PAGE = process.env.PADDOCK_STUDIO_PAGE ?? 'https://paddocklive.app/studio/';
const EVERY = 6 * 3600e3;

export const studioKey = (code) => crypto.pbkdf2Sync(String(code).trim().toUpperCase(), 'paddock-live-studio', 200000, 32, 'sha256').toString('base64url');

// Ce qui part sur le serveur : jetons des réseaux et connexion F1 TV valide. Clés secrètes d'app
// seulement pour TikTok et YouTube : leur jeton (24 h, 1 h) ne se renouvelle qu'avec elles, et le
// serveur envoie les vidéos du kit de lancement en brouillon même ordinateur éteint.
export function studioVault(c = getConfig()) {
  const s = c.social || {};
  const f1tv = c.f1tvToken && !tokenInfo(c.f1tvToken).expired ? c.f1tvToken : null;
  return {
    meta: s.meta?.pageToken ? { pageId: s.meta.pageId, pageName: s.meta.pageName, pageToken: s.meta.pageToken, igId: s.meta.igId, igUsername: s.meta.igUsername, pages: s.meta.pages || [] } : null,
    bluesky: s.bluesky?.appPassword ? { handle: s.bluesky.handle, appPassword: s.bluesky.appPassword, did: s.bluesky.did || '' } : null,
    threads: s.threads?.token ? { token: s.threads.token, userId: s.threads.userId, username: s.threads.username, expiresAt: s.threads.expiresAt || null } : null,
    threads2: s.threads2?.token ? { token: s.threads2.token, userId: s.threads2.userId, username: s.threads2.username, expiresAt: s.threads2.expiresAt || null } : null,
    ...Object.fromEntries(['tiktok', 'tiktok2'].map((k) => [k, s[k]?.refreshToken ? { clientKey: s[k].clientKey, clientSecret: s[k].clientSecret, accessToken: s[k].accessToken || '', expiresAt: s[k].expiresAt || 0, refreshToken: s[k].refreshToken, openId: s[k].openId || '', name: s[k].name || '' } : null])),
    youtube: s.youtube?.refreshToken ? { clientId: s.youtube.clientId, clientSecret: s.youtube.clientSecret, accessToken: s.youtube.accessToken || '', expiresAt: s.youtube.expiresAt || 0, refreshToken: s.youtube.refreshToken, name: s.youtube.name || '' } : null,
    f1tv,
    f1tvOff: !c.f1tvToken,   // F1 TV déconnecté dans l'appli (et pas seulement expiré, appli fermée)
  };
}
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function post(path, body, key, fetchFn = fetch, timeout = 20000) {
  const res = await fetchFn(`${STUDIO_URL}/studio/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Studio-Key': key } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Erreur ${res.status}`); e.status = res.status; throw e; }
  return j;
}

// Post écrit à la main dans l'appli : mise en forme par l'IA du serveur, comme sur la page web
export async function studioRewrite(text, { fetchFn } = {}) {
  const key = getConfig().studio?.key;
  if (!key) throw new Error('Mise en forme par l\'IA : activez d\'abord la page web (Publier sur mes réseaux → Comptes… → Page web)');
  return post('rewrite', { text: String(text || '').slice(0, 4000) }, key, fetchFn, 90000);
}

// Liens suivis par le serveur (clics comptés dans les statistiques du Studio) ; page web désactivée ou
// serveur injoignable : textes tels quels
export async function studioTrack(net, text = '', comment = '', { fetchFn, title } = {}) {
  const key = getConfig().studio?.key;
  if (!key || !/https?:\/\//.test(`${text} ${comment}`)) return { text, comment };
  try {
    const r = await post('links', { net, text, comment, ...(title ? { title } : {}) }, key, fetchFn, 8000);
    return { text: typeof r.text === 'string' ? r.text : text, comment: typeof r.comment === 'string' ? r.comment : comment };
  } catch {
    return { text, comment };
  }
}

export function studioInfo() {
  const st = getConfig().studio;
  return { enabled: !!st?.key, url: STUDIO_PAGE, at: st?.at || null, error: st?.error || null, f1tv: !!studioVault().f1tv };
}

export async function enableStudio(code, { fetchFn } = {}) {
  if (!checkCode(code)) throw new Error('Code incorrect');
  const key = studioKey(code);
  const vault = studioVault();
  await post('init', { code: String(code).trim(), key, vault }, null, fetchFn);
  saveConfig({ studio: { key, at: Date.now(), hash: digest(vault), error: null } });
  return studioInfo();
}

export async function disableStudio({ fetchFn } = {}) {
  const st = getConfig().studio;
  if (st?.key) await post('forget', {}, st.key, fetchFn).catch(() => {});
  saveConfig({ studio: null });
  return studioInfo();
}

// Nouvel envoi si les jetons ont changé (connexion, prolongation Threads, renouvellement F1 TV)
export async function syncStudio({ force = false, fetchFn } = {}) {
  const st = getConfig().studio;
  if (!st?.key || !creatorEnabled()) return false;
  const vault = studioVault();
  const h = digest(vault);
  if (!force && h === st.hash) return false;
  try {
    await post('sync', { vault }, st.key, fetchFn);
    saveConfig({ studio: { ...st, at: Date.now(), hash: h, error: null } });
    return true;
  } catch (err) {
    saveConfig({ studio: { ...st, error: err.status === 401 || err.status === 409 ? 'Page à réactiver (code changé ou données effacées)' : err.message } });
    return false;
  }
}

// Requête authentifiée vers la page web (si activée) ; null si désactivée ou injoignable
export async function studioCall(path, { body, fetchFn = fetch, timeout = 15000 } = {}) {
  const st = getConfig().studio;
  if (!st?.key || !creatorEnabled()) return null;
  try {
    const res = await fetchFn(`${STUDIO_URL}/studio/api/${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'X-Studio-Key': st.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Brouillons de posts, gardés par la page web (partagés avec le Studio) : réponse du serveur, ou son
// message d'erreur
export async function studioDrafts(path, body = null, { fetchFn = fetch } = {}) {
  const st = getConfig().studio;
  if (!st?.key || !creatorEnabled()) throw new Error('Activez la page web (téléphone) dans « Publier… » pour garder des brouillons');
  const res = await fetchFn(`${STUDIO_URL}/studio/api/${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'X-Studio-Key': st.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Page web indisponible (${res.status})`);
  return j;
}

export function startStudioSync() {
  setTimeout(() => syncStudio(), 30000).unref?.();
  setInterval(() => syncStudio(), EVERY).unref?.();
}
