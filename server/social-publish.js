// Mode créateur : publication des posts sur les réseaux du propriétaire (X, Facebook, Instagram,
// Threads, brouillon vidéo TikTok, Short YouTube en privé). Les clés et jetons restent dans config.json sur cet ordinateur
// (jamais dans une sauvegarde des réglages) ; l'interface n'en voit que le nom du compte.
import crypto from 'node:crypto';
import { getConfig, saveConfig } from './config.js';
import { xLength } from '../shared/social.js';
import { studioTrack } from './studio-sync.js';
import { bskySession, publishBluesky, replyBluesky } from '../shared/bluesky-publish.js';
import { call, GRAPH, THREADS, timing, publishFacebook, publishInstagram, publishThreads, freshThreads, commentFacebook, replyThreads, withComment } from '../shared/meta-publish.js';
import { YOUTUBE, tiktokOAuth, googleOAuth, tiktokTokens, youtubeTokens, freshTiktok, freshYoutube, tiktokDraft, youtubeUpload, youtubeSnippet } from '../shared/video-publish.js';

const XAPI = 'https://api.x.com/2';
const TIKTOK = 'https://open.tiktokapis.com/v2';

const conf = () => getConfig().social || {};
const save = (net, v) => saveConfig({ social: { ...conf(), [net]: v } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Comptes ----------
export function accountsInfo() {
  const c = conf();
  return {
    x: { connected: !!c.x?.accessToken, name: c.x?.username || '' },
    facebook: { connected: !!c.meta?.pageToken, name: c.meta?.pageName || '' },
    instagram: { connected: !!c.meta?.igId, name: c.meta?.igUsername ? `@${c.meta.igUsername}` : '' },
    threads: { connected: !!c.threads?.token, name: c.threads?.username ? `@${c.threads.username}` : '', expiresAt: c.threads?.expiresAt || null },
    threads2: { connected: !!c.threads2?.token, name: c.threads2?.username ? `@${c.threads2.username}` : '' },
    bluesky: { connected: !!c.bluesky?.appPassword, name: c.bluesky?.handle ? `@${String(c.bluesky.handle).replace(/^@/, '')}` : '' },
    tiktok: { connected: !!c.tiktok?.refreshToken, name: c.tiktok?.name || '', configured: !!c.tiktok?.clientKey, direct: !!c.tiktok?.direct, stats: !!c.tiktok?.stats },
    tiktok2: { connected: !!c.tiktok2?.refreshToken, name: c.tiktok2?.name || '', configured: !!c.tiktok?.clientKey },
    youtube: { connected: !!c.youtube?.refreshToken, name: c.youtube?.name || '', configured: !!c.youtube?.clientId },
  };
}

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function saveAccount(net, b) {
  if (b.remove) {
    const c = { ...conf() };
    if (net === 'facebook' || net === 'instagram') delete c.meta; else delete c[net];
    saveConfig({ social: c });
    return accountsInfo();
  }
  if (net === 'x') {
    const k = { apiKey: str(b.apiKey), apiSecret: str(b.apiSecret), accessToken: str(b.accessToken), accessSecret: str(b.accessSecret) };
    if (Object.values(k).some((v) => !v)) throw new Error('Les 4 clés sont nécessaires');
    const me = await call(`${XAPI}/users/me`, { headers: { Authorization: oauth1('GET', `${XAPI}/users/me`, k) } });
    save('x', { ...k, username: me?.data?.username ? `@${me.data.username}` : '' });
  } else if (net === 'facebook' || net === 'instagram') {
    const appId = str(b.appId); const appSecret = str(b.appSecret); const userToken = str(b.userToken, 1000);
    if (!appId || !appSecret || !userToken) throw new Error('Identifiant de l\'app, clé secrète et jeton nécessaires (ou « Se connecter avec Facebook »)');
    // Jeton longue durée, puis jeton de la page (sans date d'expiration) et compte Instagram relié
    const long = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken })}`);
    const pages = await call(`${GRAPH}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token })}`);
    const list = pages?.data || [];
    const page = list.find((p) => p.id === str(b.pageId)) || list.find((p) => p.instagram_business_account) || list[0];
    if (!page) throw new Error('Aucune page Facebook accessible avec ce jeton');
    // Toutes les pages du compte (et leurs comptes Instagram) gardées pour les statistiques de chaque compte
    const all = list.slice(0, 10).map((p) => ({ pageId: p.id, pageName: p.name, pageToken: p.access_token, igId: p.instagram_business_account?.id || '', igUsername: p.instagram_business_account?.username || '' }));
    saveConfig({ social: { ...conf(), meta: { appId, appSecret, ...(str(b.configId) ? { configId: str(b.configId) } : {}), pageId: page.id, pageName: page.name, pageToken: page.access_token, igId: page.instagram_business_account?.id || '', igUsername: page.instagram_business_account?.username || '', pages: all } } });
  } else if (net === 'threads' || net === 'threads2') {
    // threads2 : deuxième compte Threads, pour ses statistiques dans le Studio (pas de publication)
    const appSecret = str(b.appSecret); const token = str(b.token, 1000);
    if (!appSecret || !token) throw new Error('Clé secrète Threads et jeton nécessaires');
    let long = { access_token: token, expires_in: 0 };
    try { long = await call(`https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: appSecret, access_token: token })}`); } catch { /* déjà un jeton longue durée */ }
    const me = await call(`${THREADS}/me?${new URLSearchParams({ fields: 'id,username', access_token: long.access_token })}`);
    save(net, { appSecret, token: long.access_token, expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : null, userId: me.id, username: me.username || '' });
  } else if (net === 'bluesky') {
    const handle = str(b.handle, 120).replace(/^@/, ''); const appPassword = str(b.appPassword, 100);
    if (!handle || !appPassword) throw new Error('Identifiant et mot de passe d\'application nécessaires');
    const s = await bskySession({ handle, appPassword });   // vérification
    save('bluesky', { handle: s.handle || handle, appPassword, did: s.did });
  } else if (net === 'tiktok') {
    const clientKey = str(b.clientKey); const clientSecret = str(b.clientSecret);
    if (!clientKey || !clientSecret) throw new Error('Client key et client secret nécessaires');
    // Vérification des clés : jeton de l'app (sans compte), refusé par TikTok si une clé est fausse
    // (autre réponse, ou TikTok injoignable : clés gardées, la connexion dira si elles conviennent)
    try {
      await tiktokOAuth({ client_key: clientKey, client_secret: clientSecret, grant_type: 'client_credentials' });
    } catch (err) {
      if (err.code === 'invalid_client' || /client.?(key|secret)|incorrect/i.test(err.message)) throw new Error(`Clés refusées par TikTok (${err.message}) : vérifiez le client key et le client secret`);
    }
    const prev = conf().tiktok || {};
    // direct : publication directe (autorisation video.publish, à activer dans l'app TikTok)
    const direct = b.direct === true;
    // stats : statistiques dans la page web (user.info.profile, user.info.stats, video.list)
    const stats = b.stats === true;
    // Autre app TikTok : l'ancienne connexion ne vaut plus
    save('tiktok', prev.clientKey && prev.clientKey !== clientKey ? { clientKey, clientSecret, direct, stats } : { ...prev, clientKey, clientSecret, direct, stats });
  } else if (net === 'youtube') {
    const clientId = str(b.clientId, 300); const clientSecret = str(b.clientSecret, 200);
    if (!clientId || !clientSecret) throw new Error('ID client et code secret du client nécessaires');
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('ID client inattendu : copiez celui qui se termine par « .apps.googleusercontent.com »');
    const prev = conf().youtube || {};
    // Autre client Google : l'ancienne connexion ne vaut plus
    save('youtube', prev.clientId && prev.clientId !== clientId ? { clientId, clientSecret } : { ...prev, clientId, clientSecret });
  } else throw new Error('Réseau inconnu');
  return accountsInfo();
}

// ---------- X : signature OAuth 1.0a (corps JSON ou multipart : non signé) ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function oauth1(method, url, k, { nonce = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000), params: extra = {} } = {}) {
  const u = new URL(url);
  const params = { oauth_consumer_key: k.apiKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(timestamp), oauth_token: k.accessToken, oauth_version: '1.0' };
  const all = [...Object.entries(params), ...u.searchParams.entries(), ...Object.entries(extra)].map(([a, b]) => [enc(a), enc(b)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(all.map(([a, b]) => `${a}=${b}`).join('&'))].join('&');
  const sig = crypto.createHmac('sha1', `${enc(k.apiSecret)}&${enc(k.accessSecret)}`).update(base).digest('base64');
  return `OAuth ${Object.entries({ ...params, oauth_signature: sig }).map(([a, b]) => `${enc(a)}="${enc(b)}"`).join(', ')}`;
}

async function publishX(text, images) {
  const k = conf().x;
  if (!k?.accessToken) throw new Error('Compte X non connecté');
  const auth = (method, url) => ({ Authorization: oauth1(method, url, k) });
  const ids = [];
  for (const img of images.slice(0, 4)) {
    const init = await call(`${XAPI}/media/upload/initialize`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/initialize`), json: { media_type: 'image/png', total_bytes: img.length, media_category: 'tweet_image' } });
    const id = init?.data?.id;
    const form = new FormData();
    form.append('segment_index', '0');
    form.append('media', new Blob([img], { type: 'image/png' }), 'image.png');
    await call(`${XAPI}/media/upload/${id}/append`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/${id}/append`), form });
    await call(`${XAPI}/media/upload/${id}/finalize`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/${id}/finalize`) });
    ids.push(id);
  }
  const post = await call(`${XAPI}/tweets`, { method: 'POST', headers: auth('POST', `${XAPI}/tweets`), json: { text, ...(ids.length ? { media: { media_ids: ids } } : {}) } });
  const user = String(k.username || '').replace('@', '') || 'i';
  return { url: `https://x.com/${user}/status/${post?.data?.id}`, id: post?.data?.id };
}

// Réponse à son propre post X (premier commentaire)
async function replyX(postId, text) {
  const k = conf().x;
  return call(`${XAPI}/tweets`, { method: 'POST', headers: { Authorization: oauth1('POST', `${XAPI}/tweets`, k) }, json: { text, reply: { in_reply_to_tweet_id: postId } } });
}

// ---------- Meta : Facebook, Instagram, Threads (code partagé avec la page web du créateur) ----------
export { timing };
// alt : texte alternatif de chaque image (lecteurs d'écran), repris par chaque réseau
const blobs = (images) => images.map((b) => Object.assign(new Blob([b], { type: 'image/png' }), { alt: b.alt || '' }));

async function threadsAccount() {
  const t = conf().threads;
  const fresh = await freshThreads(t);
  if (fresh !== t) save('threads', fresh);
  return fresh;
}

const pending = new Map();   // state -> { verifier, redirect, at, second | net }

// ---------- Facebook et Instagram : connexion Facebook (Facebook Login for Business) ----------
// Meta n'accepte que des adresses https : retour sur la page du site, qui renvoie le navigateur ici (port au
// début de « state »). Avec l'ID d'une configuration « Facebook Login for Business », ses autorisations ;
// sinon la liste ci-dessous. Le jeton obtenu suit ensuite le même chemin qu'un jeton collé à la main.
export const META_REDIRECT = 'https://paddocklive.app/fb-callback';
const META_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management';
export function metaLoginUrl(port, b = {}) {
  const m = conf().meta || {};
  const appId = str(b.appId) || m.appId || ''; const appSecret = str(b.appSecret) || m.appSecret || ''; const configId = str(b.configId) || m.configId || '';
  if (!/^\d{5,20}$/.test(appId) || !appSecret) throw new Error('Renseignez d\'abord l\'identifiant et la clé secrète de l\'app Meta');
  if (configId && !/^\d{5,20}$/.test(configId)) throw new Error('ID de configuration invalide (chiffres seulement)');
  const state = `${port}.${crypto.randomBytes(16).toString('hex')}`;
  pending.set(state, { net: 'meta', at: Date.now(), appId, appSecret, configId });
  return `${GRAPH.replace('//graph.', '//www.')}/dialog/oauth?${new URLSearchParams({ client_id: appId, redirect_uri: META_REDIRECT, state, response_type: 'code', ...(configId ? { config_id: configId } : { scope: META_SCOPES }) })}`;
}

export async function metaCallback(params) {
  const p = pending.get(params.get('state'));
  if (!p || p.net !== 'meta' || Date.now() - p.at > 15 * 60e3) throw new Error('Demande de connexion expirée : recommencez depuis l\'application');
  pending.delete(params.get('state'));
  if (params.get('error')) throw new Error(params.get('error_reason') === 'user_denied' ? 'Connexion refusée dans Facebook' : params.get('error_description') || params.get('error'));
  const r = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: p.appId, client_secret: p.appSecret, redirect_uri: META_REDIRECT, code: params.get('code') || '' })}`);
  await saveAccount('facebook', { appId: p.appId, appSecret: p.appSecret, configId: p.configId, userToken: r.access_token, pageId: conf().meta?.pageId });
}

// ---------- TikTok : connexion (PKCE, retour sur cet ordinateur) et brouillon vidéo ----------
const STATS = 'user.info.profile,user.info.stats,video.list';

// second : deuxième compte, pour ses statistiques dans la page web (même app TikTok, aucune publication)
export function tiktokLoginUrl(origin, second = false) {
  const t = conf().tiktok;
  if (!t?.clientKey) throw new Error('Renseignez d\'abord le client key et le client secret TikTok');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const redirect = `${origin}/tiktok-callback/`;
  pending.set(state, { verifier, redirect, at: Date.now(), second });
  // TikTok (ordinateur) : défi PKCE = SHA-256 du vérificateur, en hexadécimal
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: t.clientKey, scope: second ? `user.info.basic,${STATS}` : `user.info.basic,video.upload${t.direct ? ',video.publish' : ''}${t.stats ? `,${STATS}` : ''}`, response_type: 'code', redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}

function storeTiktok(t, r) {
  save('tiktok', tiktokTokens(t, r));
  return conf().tiktok;
}

export async function tiktokCallback(params) {
  const p = pending.get(params.get('state'));
  if (!p || p.net || Date.now() - p.at > 15 * 60e3) throw new Error('Demande de connexion expirée : recommencez depuis l\'application');
  pending.delete(params.get('state'));
  if (params.get('error')) throw new Error([params.get('error'), params.get('error_description')].filter(Boolean).join(' : '));
  const t = conf().tiktok;
  const r = await tiktokOAuth({ client_key: t.clientKey, client_secret: t.clientSecret, code: params.get('code') || '', grant_type: 'authorization_code', redirect_uri: p.redirect, code_verifier: p.verifier });
  if (p.second) {
    const acc = tiktokTokens({ clientKey: t.clientKey, clientSecret: t.clientSecret }, r);
    const u = await call(`${TIKTOK}/user/info/?fields=display_name,username`, { headers: { Authorization: `Bearer ${acc.accessToken}` } }).catch(() => null);
    save('tiktok2', { ...acc, name: u?.data?.user?.username ? `@${u.data.user.username}` : u?.data?.user?.display_name || '' });
    return;
  }
  const saved = storeTiktok(t, r);
  try {
    const u = await call(`${TIKTOK}/user/info/?fields=display_name`, { headers: { Authorization: `Bearer ${saved.accessToken}` } });
    save('tiktok', { ...saved, name: u?.data?.user?.display_name || '' });
  } catch { /* nom facultatif */ }
}

async function tiktokToken() {
  const t = conf().tiktok;
  const fresh = await freshTiktok(t);
  if (fresh !== t) save('tiktok', fresh);
  return fresh.accessToken;
}

async function publishTiktok(video, mime) {
  if (!video?.length) throw new Error('Vidéo manquante');
  return tiktokDraft(await tiktokToken(), video, mime);
}

// ---------- YouTube : connexion Google (PKCE, retour sur cet ordinateur) et Short envoyé en privé ----------
export function youtubeLoginUrl(origin) {
  const y = conf().youtube;
  if (!y?.clientId) throw new Error('Renseignez d\'abord l\'ID client et le code secret Google');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const redirect = `${origin}/youtube-callback/`;
  pending.set(state, { verifier, redirect, at: Date.now(), net: 'youtube' });
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: y.clientId, redirect_uri: redirect, response_type: 'code', state, code_challenge: challenge, code_challenge_method: 'S256',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', access_type: 'offline', prompt: 'consent',
  })}`;
}

function storeYoutube(y, r) {
  save('youtube', youtubeTokens(y, r));
  return conf().youtube;
}

export async function youtubeCallback(params) {
  const p = pending.get(params.get('state'));
  if (!p || p.net !== 'youtube' || Date.now() - p.at > 15 * 60e3) throw new Error('Demande de connexion expirée : recommencez depuis l\'application');
  pending.delete(params.get('state'));
  if (params.get('error')) throw new Error(params.get('error') === 'access_denied' ? 'Accès refusé (vérifiez que votre compte Google est bien un utilisateur test du projet)' : params.get('error'));
  const y = conf().youtube;
  const r = await googleOAuth({ client_id: y.clientId, client_secret: y.clientSecret, code: params.get('code') || '', grant_type: 'authorization_code', redirect_uri: p.redirect, code_verifier: p.verifier });
  if (!r.refresh_token && !y.refreshToken) throw new Error('Google n\'a pas donné d\'accès durable : recommencez la connexion');
  const saved = storeYoutube(y, r);
  try {
    const ch = await call(`${YOUTUBE}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${saved.accessToken}` } });
    save('youtube', { ...saved, name: ch?.items?.[0]?.snippet?.title || '' });
  } catch { /* nom facultatif */ }
}

async function youtubeToken() {
  const y = conf().youtube;
  try {
    const fresh = await freshYoutube(y);
    if (fresh !== y) save('youtube', fresh);
    return fresh.accessToken;
  } catch (err) {
    // Accès retiré ou expiré (projet Google en mode « Test » : 7 jours) : il faut se reconnecter
    if (err.code === 'invalid_grant') {
      const { accessToken, refreshToken, expiresAt, ...keys } = y;
      save('youtube', keys);
      throw new Error('Connexion YouTube expirée : reconnectez-vous (Comptes… → YouTube)');
    }
    throw err;
  }
}

export { youtubeSnippet };

async function publishYoutube(video, mime, text) {
  if (!video?.length) throw new Error('Vidéo manquante');
  return youtubeUpload(await youtubeToken(), video, mime, text);
}

// ---------- Publication ----------
export async function publish(net, { text = '', images = [], alts = [], video = null, mime = 'video/mp4', comment = '' }) {
  // Images PNG (ou JPEG pour Bluesky, 1 Mo au plus par image), avec leur texte alternatif
  const imgs = images.map((b, i) => Object.assign(Buffer.from(String(b), 'base64'), { alt: String((Array.isArray(alts) && alts[i]) || '').slice(0, 1000) })).filter((b) => b.length > 8 && (b.readUInt32BE(0) === 0x89504e47 || (net === 'bluesky' && b[0] === 0xff && b[1] === 0xd8)));
  // Liens suivis (clics comptés) ; premier commentaire (lien de l'article d'une news) : X, Facebook, Threads
  const { text: body, comment: note } = await studioTrack(net, String(text || ''), String(comment || '').trim().slice(0, 500));
  if (net === 'x') return withComment(() => publishX(xLength(body) > 280 ? body.slice(0, 280) : body, imgs), note, replyX);
  if (net === 'facebook') return withComment(() => publishFacebook(conf().meta, body, blobs(imgs)), note, (id, t) => commentFacebook(conf().meta, id, t));
  if (net === 'instagram') return publishInstagram(conf().meta, body.slice(0, 2200), blobs(imgs));
  if (net === 'bluesky') {
    const acc = conf().bluesky;
    const pics = imgs.map((b) => ({ blob: new Blob([b], { type: b[0] === 0xff ? 'image/jpeg' : 'image/png' }), width: 1080, height: 1350, alt: b.alt }));   // format X de shared/social-draw.js
    return withComment(() => publishBluesky(acc, [...body].slice(0, 300).join(''), pics), note, (id, t) => replyBluesky(acc, id, t));
  }
  if (net === 'threads') {
    const th = await threadsAccount();
    return withComment(() => publishThreads(th, conf().meta, body.slice(0, 500), blobs(imgs)), note, (id, t) => replyThreads(th, id, t));
  }
  const vid = video ? Buffer.from(String(video), 'base64') : null;
  const vmime = /^video\/(mp4|webm|quicktime)$/.test(mime) ? mime : 'video/mp4';
  if (net === 'tiktok') return publishTiktok(vid, vmime);
  if (net === 'youtube') return publishYoutube(vid, vmime, body);
  throw new Error('Réseau inconnu');
}
