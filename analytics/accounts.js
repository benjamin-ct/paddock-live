// Comptes des réseaux connectés depuis le Studio (téléphone, sans l'appli de bureau) : Facebook et Instagram
// (connexion Facebook), TikTok (et son 2e compte, statistiques), YouTube, Threads, Bluesky ; retrait de n'importe quel
// compte. Un compte connecté ou retiré ici est « géré par le Studio » (vault.managed) : les envois de l'appli,
// anciennes versions comprises, ne le remplacent plus. F1 TV reste envoyé par l'appli.
import { call, GRAPH, THREADS } from '../shared/meta-publish.js';
import { bskySession } from '../shared/bluesky-publish.js';
import { tiktokOAuth, googleOAuth, tiktokTokens, youtubeTokens, YOUTUBE } from '../shared/video-publish.js';

// Même retour que l'appli (server/social-publish.js), déjà déclaré dans l'app Meta : le serveur reconnaît une
// connexion du Studio à son « state » (s.<32 hexa>) et renvoie le navigateur au Studio
export const META_REDIRECT = 'https://paddocklive.app/fb-callback';
const META_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management';
// TikTok et Google : adresse de retour du Studio, à déclarer dans leurs consoles (TikTok : Login Kit, Web ; Google :
// client OAuth « Application Web »)
export const STUDIO_REDIRECT = 'https://paddocklive.app/studio-callback';
export const STUDIO_STATE = /^s\.[0-9a-f]{32}$/;
export const LOGIN_TTL = 15 * 60e3;
// Comptes du coffre (clés) qu'on peut retirer ou gérer ici
const KEYS = ['meta', 'threads', 'threads2', 'bluesky', 'tiktok', 'tiktok2', 'youtube'];

const TIKTOK = 'https://open.tiktokapis.com/v2';
const TIKTOK_STATS = 'user.info.profile,user.info.stats,video.list';
const LOGINS = ['meta', 'tiktok', 'tiktok2', 'youtube'];

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const managed = (vault, key) => [...new Set([...(vault.managed || []), key])];
// Apps des réseaux : celles enregistrées dans le Studio, sinon les clés envoyées par l'appli avec le compte
const tiktokApp = (v) => v.tiktokApp || (v.tiktok?.clientKey ? { clientKey: v.tiktok.clientKey, clientSecret: v.tiktok.clientSecret } : null);
const youtubeApp = (v) => v.youtubeApp || (v.youtube?.clientId ? { clientId: v.youtube.clientId, clientSecret: v.youtube.clientSecret } : null);

// Adresse de connexion d'un réseau (state : s.<32 hexa>, gardé par le serveur)
export function loginUrl(net, vault, state) {
  if (!LOGINS.includes(net)) throw new Error('Réseau inconnu');
  if (net === 'meta') {
    const app = vault.metaApp;
    if (!app) throw new Error('Renseignez d\'abord l\'identifiant et la clé secrète de l\'app Meta');
    return `${GRAPH.replace('//graph.', '//www.')}/dialog/oauth?${new URLSearchParams({ client_id: app.appId, redirect_uri: META_REDIRECT, state, response_type: 'code', ...(app.configId ? { config_id: app.configId } : { scope: META_SCOPES }) })}`;
  }
  if (net === 'youtube') {
    const app = youtubeApp(vault);
    if (!app) throw new Error('Renseignez d\'abord l\'ID client et le code secret Google');
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: app.clientId, redirect_uri: STUDIO_REDIRECT, response_type: 'code', state,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', access_type: 'offline', prompt: 'consent' })}`;
  }
  const app = tiktokApp(vault);
  if (!app) throw new Error('Renseignez d\'abord le client key et le client secret TikTok');
  // 2e compte : statistiques seulement ; compte principal : envoi des vidéos, publication directe et statistiques si cochées
  const scope = net === 'tiktok2' ? `user.info.basic,${TIKTOK_STATS}` : `user.info.basic,video.upload${app.direct ? ',video.publish' : ''}${app.stats ? `,${TIKTOK_STATS}` : ''}`;
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: app.clientKey, scope, response_type: 'code', redirect_uri: STUDIO_REDIRECT, state })}`;
}

// Retour d'une connexion : code échangé, compte du réseau ajouté au coffre (géré par le Studio)
export async function finishLogin(net, vault, code) {
  if (net === 'meta') return { ...vault, meta: await metaAccount(vault.metaApp, code, vault.meta?.pageId), managed: managed(vault, 'meta') };
  if (net === 'youtube') {
    const app = youtubeApp(vault);
    const r = await googleOAuth({ client_id: app.clientId, client_secret: app.clientSecret, code, grant_type: 'authorization_code', redirect_uri: STUDIO_REDIRECT });
    if (!r.refresh_token) throw new Error('Google n\'a pas donné d\'accès durable : recommencez la connexion');
    const y = youtubeTokens({ clientId: app.clientId, clientSecret: app.clientSecret }, r);
    const ch = await call(`${YOUTUBE}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${y.accessToken}` } }).catch(() => null);
    return { ...vault, youtube: { ...y, name: ch?.items?.[0]?.snippet?.title || '' }, managed: managed(vault, 'youtube') };
  }
  const app = tiktokApp(vault);
  const r = await tiktokOAuth({ client_key: app.clientKey, client_secret: app.clientSecret, code, grant_type: 'authorization_code', redirect_uri: STUDIO_REDIRECT });
  const t = tiktokTokens({ clientKey: app.clientKey, clientSecret: app.clientSecret }, r);
  const u = (await call(`${TIKTOK}/user/info/?fields=display_name,username`, { headers: { Authorization: `Bearer ${t.accessToken}` } }).catch(() => null))?.data?.user;
  const name = net === 'tiktok2' && u?.username ? `@${u.username}` : u?.display_name || '';
  return { ...vault, [net]: { ...t, name }, managed: managed(vault, net) };
}

// Code de la connexion Facebook -> page choisie (celle d'avant, sinon celle qui a un Instagram) et toutes les pages
// du compte (statistiques), comme l'appli
export async function metaAccount(app, code, pageId = '') {
  const r = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: META_REDIRECT, code })}`);
  const long = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: r.access_token })}`);
  const list = (await call(`${GRAPH}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token })}`))?.data || [];
  const page = list.find((p) => p.id === pageId) || list.find((p) => p.instagram_business_account) || list[0];
  if (!page) throw new Error('Aucune page Facebook accessible avec ce compte');
  const one = (p) => ({ pageId: p.id, pageName: p.name, pageToken: p.access_token, igId: p.instagram_business_account?.id || '', igUsername: p.instagram_business_account?.username || '' });
  return { ...one(page), pages: list.slice(0, 10).map(one) };
}

// Réglage d'un compte depuis le Studio ({ net, … } ou { net, remove: true }) : nouveau coffre
export async function setAccount(vault, b) {
  const net = b?.net === 'facebook' || b?.net === 'instagram' ? 'meta' : b?.net;
  if (b?.remove) {
    if (!KEYS.includes(net)) throw new Error('Compte inconnu');
    const { [net]: _, ...rest } = vault;
    return { ...rest, managed: managed(vault, net) };
  }
  if (net === 'tiktok-app') {
    const clientKey = str(b.clientKey, 200), clientSecret = str(b.clientSecret, 200);
    if (!clientKey || !clientSecret) throw new Error('Client key et client secret nécessaires');
    return { ...vault, tiktokApp: { clientKey, clientSecret, direct: b.direct === true, stats: b.stats === true } };
  }
  if (net === 'youtube-app') {
    const clientId = str(b.clientId, 300), clientSecret = str(b.clientSecret, 200);
    if (!/\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) throw new Error('ID client (…apps.googleusercontent.com) et code secret nécessaires');
    return { ...vault, youtubeApp: { clientId, clientSecret } };
  }
  if (net === 'meta-app') {
    const appId = str(b.appId, 40), appSecret = str(b.appSecret, 200), configId = str(b.configId, 40);
    if (!/^\d{5,20}$/.test(appId) || !appSecret) throw new Error('Identifiant de l\'app (chiffres) et clé secrète nécessaires');
    if (configId && !/^\d{5,20}$/.test(configId)) throw new Error('ID de configuration invalide (chiffres seulement)');
    return { ...vault, metaApp: { appId, appSecret, ...(configId ? { configId } : {}) } };
  }
  if (net === 'bluesky') {
    const handle = str(b.handle, 120).replace(/^@/, ''), appPassword = str(b.appPassword, 100);
    if (!handle || !appPassword) throw new Error('Identifiant et mot de passe d\'application nécessaires');
    const s = await bskySession({ handle, appPassword });   // vérification
    return { ...vault, bluesky: { handle: s.handle || handle, appPassword, did: s.did }, managed: managed(vault, 'bluesky') };
  }
  if (net === 'threads' || net === 'threads2') {
    const appSecret = str(b.appSecret, 200), token = str(b.token, 1000);
    if (!appSecret || !token) throw new Error('Clé secrète Threads et jeton nécessaires');
    let long = { access_token: token, expires_in: 0 };
    try { long = await call(`https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: appSecret, access_token: token })}`); } catch { /* déjà un jeton longue durée */ }
    const me = await call(`${THREADS}/me?${new URLSearchParams({ fields: 'id,username', access_token: long.access_token })}`);
    return { ...vault, [net]: { token: long.access_token, userId: me.id, username: me.username || '', expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : null }, managed: managed(vault, net) };
  }
  throw new Error('Réseau inconnu');
}

// Envoi de l'appli : les comptes gérés par le Studio (connectés ou retirés ici) et l'app Meta du Studio restent
// ceux du coffre ; le reste vient de l'appli
export function fromApp(old, incoming) {
  const out = { ...incoming };
  for (const k of old.managed || []) { if (old[k]) out[k] = old[k]; else delete out[k]; }
  if (old.managed?.length) out.managed = old.managed;
  for (const k of ['metaApp', 'tiktokApp', 'youtubeApp']) if (old[k]) out[k] = old[k];
  return out;
}
