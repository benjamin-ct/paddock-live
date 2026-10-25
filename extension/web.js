// Paddock Live Companion sur la version web (app.paddocklive.app) : donne à la page la connexion F1 TV faite
// sur formula1.com, pour le GPS et la télémétrie de SON abonnement (relayés par le serveur Paddock Live avec ce
// seul compte, gardés en mémoire le temps de la séance). Rien d'autre n'est lu ni envoyé.
const api = globalThis.browser ?? globalThis.chrome;
async function give() {
  const r = await api.runtime.sendMessage({ type: 'f1tv-web' }).catch(() => null);
  if (r?.token) window.postMessage({ source: 'paddock-live-companion', type: 'f1tv', token: r.token }, location.origin);
}
// La page la demande à son ouverture ; renouvelée toutes les 30 minutes (jeton d'environ 4 jours)
window.addEventListener('message', (e) => {
  if (e.source === window && e.origin === location.origin && e.data?.source === 'paddock-live-web' && e.data.type === 'f1tv?') give();
});
give();
setInterval(give, 30 * 60e3);
