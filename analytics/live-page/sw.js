// Alertes de la version web installée (app.paddocklive.app) : notifications SEULEMENT. Pas de cache ni de gestionnaire
// « fetch » : la page et ses fichiers viennent toujours du réseau (un cache figerait une version, test/live-web.test.js).
// Servi sous /live/sw.js avec l'en-tête Service-Worker-Allowed: / (analytics/worker.js), enregistré pour toute la page.
// Mêmes messages que la page /alertes/ (analytics/push-public.js) : titre, texte et adresse à ouvrir.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Adresse ouverte par la notification : la page des alertes du site (/alertes/, rappels, résultats, essai) ouvre la
// version web à son accueil ; l'article d'une grosse news (https) tel quel ; rien d'autre
function target(u, origin) {
  let url;
  try { url = new URL(u || '/', origin); } catch { return null; }
  if (url.protocol !== 'https:' && url.origin !== origin) return null;
  if (url.origin === origin && url.pathname.startsWith('/alertes')) return `${origin}/`;
  return url.href;
}

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data?.json() || {}; } catch { /* message illisible */ }
  e.waitUntil(self.registration.showNotification(m.title || 'Paddock Live', {
    body: m.body || '',
    tag: String(m.id || 'paddock-live'),
    icon: '/live/icon-512.png',
    data: { url: m.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = target(e.notification.data?.url, self.location.origin);
  if (!url) return;
  e.waitUntil((async () => {
    // Version web déjà ouverte : ramenée devant plutôt qu'une seconde fenêtre
    if (url === `${self.location.origin}/`) {
      const win = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).find((c) => new URL(c.url).origin === self.location.origin);
      if (win) return win.focus();
    }
    return self.clients.openWindow(url);
  })());
});
