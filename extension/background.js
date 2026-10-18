// Paddock Live Companion : transmet la connexion F1 TV faite dans le navigateur (cookie
// « login-session » de formula1.com) à l'appli Paddock Live qui tourne sur cet ordinateur.
// Rien d'autre n'est lu, et rien ne part ailleurs que vers 127.0.0.1.
const api = globalThis.browser ?? globalThis.chrome;
const PORTS = [3000, 3001, 3002, 3010];   // ports essayés par l'appli de bureau au démarrage

async function session() {
  // Posé sur formula1.com ou l'un de ses sous-domaines (compte, F1 TV) : le plus durable
  const all = await api.cookies.getAll({ domain: 'formula1.com', name: 'login-session' });
  return all.sort((x, y) => (y.expirationDate || 0) - (x.expirationDate || 0))[0]?.value || null;
}

// Appli Paddock Live ouverte : { port, auth } (auth : état de sa connexion F1 TV), ou null
async function findApp() {
  for (const port of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/auth`, { signal: AbortSignal.timeout(1500) });
      const auth = await r.json();
      if (r.ok && 'hasToken' in auth) return { port, auth };
    } catch { /* port libre ou autre logiciel */ }
  }
  return null;
}

// État affiché par la fenêtre de l'extension ; send : transmet la connexion si elle a changé (ou
// toujours avec force)
async function sync({ send = true, force = false } = {}) {
  const value = await session();
  const app = await findApp();
  const out = { signedIn: !!value, app: app && { port: app.port, linked: !!app.auth.hasToken, expiresAt: app.auth.expiresAt || null } };
  if (!send || !value || !app) return out;
  const { sent } = await api.storage.local.get('sent');
  if (!force && sent === value) return out;
  try {
    const r = await fetch(`http://127.0.0.1:${app.port}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ...out, error: j.error || `HTTP ${r.status}` };
    await api.storage.local.set({ sent: value });
    return { ...out, app: { ...out.app, linked: true, expiresAt: j.expiresAt || null }, justSent: true };
  } catch (err) { return { ...out, error: String(err?.message || err) }; }
}

// Connexion (ou reconnexion) sur formula1.com : transmise aussitôt
api.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (!removed && cookie.name === 'login-session' && cookie.domain.endsWith('formula1.com')) sync();
});
// Appli lancée plus tard : rattrapé au démarrage du navigateur et toutes les 30 minutes
api.runtime.onStartup.addListener(() => sync());
api.runtime.onInstalled.addListener(() => { api.alarms.create('sync', { periodInMinutes: 30 }); sync(); });
api.alarms.onAlarm.addListener(() => sync());
api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'sync') return false;
  sync({ send: msg.send !== false, force: !!msg.force }).then(reply);
  return true;
});
