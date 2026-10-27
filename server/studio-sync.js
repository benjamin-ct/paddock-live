// Page web du créateur (/studio/ sur le serveur Paddock Live) : l'appli y envoie les comptes des
// réseaux (Facebook, Instagram, Threads, Bluesky, TikTok, YouTube) et la connexion F1 TV, chiffrés avec une clé dérivée du
// code du mode créateur, pour préparer et publier les posts depuis le téléphone, PC éteint.
// Le code n'est envoyé qu'à l'activation (vérifié contre son empreinte) ; ensuite seule la clé sert,
// gardée dans config.json comme les jetons eux-mêmes. Nouvel envoi automatique quand un jeton change.
// S'y ajoute une copie de tous les comptes chiffrée ici (clé des comptes, jamais envoyée), reprise sur un nouvel ordinateur.
import crypto from 'node:crypto';
import { getConfig, saveConfig, tokenInfo } from './config.js';
import { accountsKey, checkCode, creatorEnabled, studioKey } from './creator.js';

export const STUDIO_URL = process.env.PADDOCK_STUDIO_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev';
// Adresse de la page à ouvrir dans le navigateur (l'appli garde STUDIO_URL pour ses appels)
export const STUDIO_PAGE = process.env.PADDOCK_STUDIO_PAGE ?? 'https://paddocklive.app/studio/';
const EVERY = 6 * 3600e3;

export { studioKey };

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

// Copie de tous les comptes (X et clés des apps comprises), chiffrée ici avec la clé des comptes : le serveur
// la garde sans pouvoir la lire, et la rend sur un nouvel ordinateur
function box(data, k) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(k, 'base64url'), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(data)), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}
function unbox(s, k) {
  const [iv, tag, ct] = String(s).split('.').map((b) => Buffer.from(b, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k, 'base64url'), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString());
}
// Envoi : coffre (ce dont le serveur se sert) et copie chiffrée des comptes ; empreinte calculée sur le contenu en clair
const sent = (c = getConfig()) => ({ vault: studioVault(c), accounts: c.social || {} });
const payload = (c = getConfig()) => ({ vault: studioVault(c), ...(c.studio?.box ? { accounts: box(c.social || {}, c.studio.box) } : {}) });

async function post(path, body, key, fetchFn = fetch, timeout = 20000) {
  const res = await fetchFn(`${STUDIO_URL}/studio/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Studio-Key': key } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Erreur ${res.status}`); e.status = res.status; throw e; }
  return j;
}

export function studioInfo() {
  const st = getConfig().studio;
  return { enabled: !!st?.key, url: STUDIO_PAGE, at: st?.at || null, error: st?.error || null, f1tv: !!studioVault().f1tv, backup: !!st?.box };
}

export async function enableStudio(code, { fetchFn } = {}) {
  if (!checkCode(code)) throw new Error('Code incorrect');
  const key = studioKey(code);
  const st = getConfig().studio;
  // Page déjà activée (avant la copie des comptes) : le code sert seulement à la clé de la copie
  if (st?.key === key) {
    saveConfig({ studio: { ...st, box: accountsKey(code) } });
    await syncStudio({ force: true, fetchFn });
    return studioInfo();
  }
  await restoreAccounts(code, { fetchFn });   // page déjà activée sur un autre ordinateur : ses comptes repris, pas écrasés
  const c = { ...getConfig(), studio: { box: accountsKey(code) } };
  await post('init', { code: String(code).trim(), key, ...payload(c) }, null, fetchFn);
  saveConfig({ studio: { key, box: c.studio.box, at: Date.now(), hash: digest(sent(c)), error: null } });
  return studioInfo();
}

// Nouvel ordinateur : comptes des réseaux et connexion F1 TV repris de la page web (activée ailleurs avec le
// même code), qui reste activée ici aussi ; un compte déjà connecté ici est gardé. Nombre de comptes repris
const connected = (v) => !!(v && (v.pageToken || v.token || v.appPassword || v.refreshToken || v.accessToken));
export async function restoreAccounts(code, { fetchFn = fetch } = {}) {
  const key = studioKey(code);
  const k = accountsKey(code);
  let r;
  try {
    const res = await fetchFn(`${STUDIO_URL}/studio/api/accounts`, { headers: { 'X-Studio-Key': key }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return 0;   // page jamais activée, désactivée, ou autre code
    r = await res.json();
  } catch { return 0; }
  let theirs = {};
  try { if (r.accounts) theirs = unbox(r.accounts, k); } catch { /* copie illisible : coffre seul */ }
  // Jetons du coffre par-dessus : le serveur a pu les renouveler
  for (const [n, v] of Object.entries(r.vault || {})) if (v && typeof v === 'object' && !Array.isArray(v)) theirs[n] = { ...theirs[n], ...v };
  const c = getConfig();
  const social = { ...c.social };
  let n = 0;
  for (const [net, v] of Object.entries(theirs)) if (connected(v) && !connected(social[net])) { social[net] = v; n++; }
  const f1tv = !c.f1tvToken && typeof r.vault?.f1tv === 'string' && !tokenInfo(r.vault.f1tv).expired ? r.vault.f1tv : null;
  saveConfig({ social, ...(f1tv ? { f1tvToken: f1tv } : {}), studio: { at: Date.now(), hash: null, ...c.studio, key, box: k, error: null } });
  return n + (f1tv ? 1 : 0);
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
  const h = digest(sent());
  if (!force && h === st.hash) return false;
  try {
    await post('sync', payload(), st.key, fetchFn);
    saveConfig({ studio: { ...st, at: Date.now(), hash: h, error: null } });
    return true;
  } catch (err) {
    saveConfig({ studio: { ...st, error: err.status === 401 || err.status === 409 ? 'Page à réactiver (code changé ou données effacées)' : err.message } });
    return false;
  }
}

export function startStudioSync() {
  setTimeout(() => syncStudio(), 30000).unref?.();
  setInterval(() => syncStudio(), EVERY).unref?.();
}
