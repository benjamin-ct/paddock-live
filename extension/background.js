// Paddock Live Companion : transmet la connexion F1 TV faite dans le navigateur (cookie
// « entitlement_token » de formula1.com, « login-session » sur l'ancien site) à l'appli Paddock Live
// qui tourne sur cet ordinateur.
// Rien d'autre n'est lu, et rien ne part ailleurs que vers 127.0.0.1 (l'appli reliée, voir pairing).
const api = globalThis.browser ?? globalThis.chrome;
const PORTS = [3000, 3001, 3002, 3010];   // ports essayés par l'appli de bureau au démarrage
const ORIGINS = ['https://*.formula1.com/*', 'http://127.0.0.1/*'];
const onF1 = (c) => /(^|\.)formula1\.com$/.test(c.domain.replace(/^\./, ''));

// Cookies de formula1.com lisibles, y compris cloisonnés (Chrome : partitionKey ; Firefox avec
// isolation : firstPartyDomain) ; une option inconnue du navigateur est simplement ignorée
async function f1Cookies(name) {
  const out = [];
  for (const extra of [{}, { partitionKey: {} }, { firstPartyDomain: null }]) {
    try { out.push(...await api.cookies.getAll({ ...(name ? { name } : { domain: 'formula1.com' }), ...extra })); } catch { /* option non prise en charge */ }
  }
  return out.filter(onF1);
}

// Cookies qui portent le jeton d'abonnement F1 TV : « login-session » (ancien site du compte, jeton dans
// un JSON) et « entitlement_token » (site F1 TV actuel, jeton seul)
const NAMES = ['login-session', 'entitlement_token'];
const b64json = (part) => JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g, '+').replace(/_/g, '/')))));
function unwrap(raw) {
  let s = String(raw || '').trim();
  if (/^%7B/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* tel quel */ } }
  if (s.startsWith('{')) { try { const o = JSON.parse(s); return { json: o, token: o?.data?.subscriptionToken || o?.subscriptionToken || '' }; } catch { return {}; } }
  return { token: s.replace(/^Bearer\s+/i, '') };
}
// Jeton d'abonnement F1 TV (JWT avec l'état de l'abonnement) encore valide contenu dans le cookie, ou
// null : jamais un autre jeton, qui casserait le direct dans l'appli, ni un jeton expiré (vieux cookie
// de l'ancien site), qui passerait avant la connexion du site actuel
function subscriptionToken(raw) {
  const t = unwrap(raw).token;
  const p = String(t || '').split('.');
  if (p.length !== 3) return null;
  try {
    const pl = b64json(p[1]);
    if (pl.exp && pl.exp * 1000 < Date.now()) return null;
    return pl.SubscriptionStatus || pl.subscriptionStatus || pl.SubscribedProduct ? t : null;
  } catch { return null; }
}
// Forme d'un cookie pour le diagnostic : noms des champs seulement, jamais leurs valeurs
function shape(raw) {
  const { json, token } = unwrap(raw);
  const p = String(token || '').split('.');
  if (p.length === 3) { try { return `JWT (${Object.keys(b64json(p[1])).join(', ')})`; } catch { /* pas un JWT */ } }
  if (json) return `JSON (${Object.keys(json).join(', ')})`;
  return `${String(raw || '').length} car.`;
}

async function session() {
  // Posé sur formula1.com ou l'un de ses sous-domaines (compte, F1 TV) : le plus durable d'abord
  for (const name of NAMES) {
    const all = (await f1Cookies(name)).sort((x, y) => (y.expirationDate || 0) - (x.expirationDate || 0));
    for (const c of all) { const t = subscriptionToken(c.value); if (t) return t; }
  }
  return null;
}

// Clé partagée avec l'appli (depuis la 1.2.0) : donnée avec le premier envoi, puis l'appli prouve qu'elle la
// connaît avant chaque envoi. Un autre programme qui répond sur l'un de ces ports n'a pas la clé : rien ne lui
// est envoyé sans un clic sur « Envoyer » (qui relie l'appli trouvée, par exemple réinstallée)
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomKey = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function proof(key, nonce, port) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(`${nonce}:${port}`)));
}
async function pairing() {
  let { pairKey, paired } = await api.storage.local.get(['pairKey', 'paired']);
  if (!pairKey) { pairKey = randomKey(32); await api.storage.local.set({ pairKey }); }
  return { key: pairKey, paired: !!paired };
}

// Appli Paddock Live ouverte : { port, auth, known } (auth : état de sa connexion F1 TV ; known : appli reliée
// qui a prouvé connaître la clé, ou première trouvée tant qu'aucune n'est reliée), ou null
async function findApp() {
  const { key, paired } = await pairing();
  let other = null;
  for (const port of PORTS) {
    try {
      const nonce = randomKey(16);
      const r = await fetch(`http://127.0.0.1:${port}/api/auth?c=${nonce}`, { signal: AbortSignal.timeout(1500) });
      const auth = await r.json();
      if (!r.ok || !('hasToken' in auth)) continue;
      if (!paired || (auth.proof && auth.proof === await proof(key, nonce, port))) return { port, auth, known: true };
      other ||= { port, auth, known: false };
    } catch { /* port libre ou autre logiciel */ }
  }
  return other;
}

// État affiché par la fenêtre de l'extension ; send : transmet la connexion si elle a changé (ou
// toujours avec force)
async function sync({ send = true, force = false } = {}) {
  const value = await session();
  const app = await findApp();
  const access = await api.permissions.contains({ origins: ORIGINS }).catch(() => true);
  const out = { signedIn: !!value, access, app: app && { port: app.port, linked: !!app.auth.hasToken, expiresAt: app.auth.expiresAt || null, known: app.known } };
  // Pas de session trouvée : noms des cookies formula1.com visibles (jamais leurs valeurs), pour le diagnostic
  if (!value && access) {
    const all = await f1Cookies();
    out.seen = [...new Set(all.map((c) => (NAMES.includes(c.name) ? `${c.name} : ${shape(c.value)}` : c.name)))].sort();
  }
  if (!send || !value || !app || (!app.known && !force)) return out;
  const { sent } = await api.storage.local.get('sent');
  const { key, paired } = await pairing();
  // Déjà envoyée : seulement renvoyée pour relier une appli qui sait garder la clé (pairing)
  if (!force && sent === value && (paired || !app.auth.pairing)) return out;
  try {
    const r = await fetch(`http://127.0.0.1:${app.port}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value, pair: key }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ...out, error: j.error || `HTTP ${r.status}` };
    await api.storage.local.set({ sent: value, ...(j.paired ? { paired: true } : {}) });
    return { ...out, app: { ...out.app, linked: true, expiresAt: j.expiresAt || null, known: true }, justSent: true };
  } catch (err) { return { ...out, error: String(err?.message || err) }; }
}

// Connexion (ou reconnexion) sur formula1.com : transmise aussitôt
api.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (!removed && NAMES.includes(cookie.name) && onF1(cookie)) sync();
});
// Appli lancée plus tard : rattrapé au démarrage du navigateur et toutes les 30 minutes
api.runtime.onStartup.addListener(() => sync());
api.runtime.onInstalled.addListener(() => { api.alarms.create('sync', { periodInMinutes: 30 }); sync(); });
api.alarms.onAlarm.addListener(() => sync());
// Version web (web.js) : la connexion F1 TV, seulement pour les pages de Paddock Live
const WEB = /^https:\/\/app\.paddocklive\.app\//;
api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'f1tv-web') {
    if (!WEB.test(sender?.url || sender?.tab?.url || '')) return false;
    session().then((token) => reply({ token }), () => reply({}));
    return true;
  }
  if (msg?.type !== 'sync') return false;
  sync({ send: msg.send !== false, force: !!msg.force }).then(reply);
  return true;
});
