// Protections des requêtes du serveur local contre les sites web malveillants ouverts dans le
// même navigateur : requêtes envoyées en douce vers l'API (image, formulaire), et « DNS rebinding »
// (un nom de domaine qui se fait passer pour 127.0.0.1 afin de lire les réponses).

// Noms d'hôte acceptés pour le serveur principal, qui n'écoute que sur cet ordinateur
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function hostName(hostHeader) {
  const h = String(hostHeader || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);   // [::1]:3000
  return h.replace(/:\d+$/, '');
}

// Hôte demandé par le navigateur : une adresse locale (pas un nom de domaine extérieur)
export function localHost(hostHeader) {
  return LOCAL_HOSTS.has(hostName(hostHeader));
}

// Appel d'API venu d'un autre site (balise image, formulaire, script d'une autre page) : refusé.
// Les navigateurs récents l'indiquent dans Sec-Fetch-Site ; « none » = adresse tapée par
// l'utilisateur ou favori. Sans cet en-tête (ancien navigateur, appli de bureau), on vérifie
// l'origine quand elle est fournie.
export function sameSiteRequest(headers) {
  const site = headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = headers.origin;
  if (!origin || origin === 'null') return !origin;
  try { return new URL(origin).host === headers.host; } catch { return false; }
}

// Extension de navigateur Paddock Live Companion (Chrome, Edge, Firefox, Safari) : elle seule peut
// transmettre la connexion F1 TV faite dans le navigateur (routes EXTENSION_ROUTES). Une page web ne
// peut pas se donner une telle origine.
export const EXTENSION_ROUTES = new Set(['GET /api/auth', 'POST /api/auth']);
export function extensionRequest(headers) {
  return /^(chrome|moz|safari-web)-extension:\/\/[\w.@-]+$/.test(String(headers.origin || ''));
}

// Chemin d'URL décodé, ou null s'il est mal formé (« %E0%A4%A » faisait planter le serveur)
export function decodePath(pathname) {
  try { return decodeURIComponent(pathname); } catch { return null; }
}

// Lien externe sûr à ouvrir : uniquement http(s) (pas de javascript:, file:, ni protocole système)
export function webUrl(u) {
  try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
}
