// Alertes Paddock Live sur le téléphone (page /alertes/) : le message, chiffré par le serveur pour ce téléphone,
// donne le titre, le texte et l'adresse à ouvrir (cette page, ou l'article d'une grosse news).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data?.json() || {}; } catch { /* message illisible */ }
  e.waitUntil(self.registration.showNotification(m.title || 'Paddock Live', {
    body: m.body || '',
    tag: String(m.id || 'paddock-live'),
    icon: '/app/icon-512.png',
    data: { url: m.url || '/alertes/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url;
  try { url = new URL(e.notification.data?.url || '/alertes/', self.location.origin); } catch { return; }
  if (url.protocol !== 'https:') return;
  e.waitUntil(self.clients.openWindow(url.href));
});
