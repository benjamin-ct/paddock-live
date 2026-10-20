// Liens suivis dans les posts publiés : chaque adresse devient https://pdkl.app/<id><réseau>
// (id : 6 lettres ou chiffres tirés de l'empreinte SHA-256 de l'adresse, au moins une majuscule ou un
// chiffre pour ne jamais ressembler à une page du site ; réseau : une lettre). Le serveur compte le clic
// (nombre par jour, sans cookie ni adresse IP) puis renvoie vers l'adresse d'origine. Les anciens liens
// paddocklive.app/<id><réseau> et paddocklive.app/go/<id de 8 caractères><réseau> restent valables.
export const SITE = 'https://paddocklive.app/';
export const SHORT = 'https://pdkl.app/';
export const GO = `${SITE}go/`;
export const NET_CODE = { instagram: 'i', facebook: 'f', threads: 't', x: 'x', bluesky: 'b', tiktok: 'k', youtube: 'y' };
export const NET_OF = Object.fromEntries(Object.entries(NET_CODE).map(([n, c]) => [c, n]));
export const GO_RE = /^([A-Za-z0-9_-]{8})([a-z])$/;
export const SHORT_RE = /^((?=.{0,5}[A-Z0-9])[A-Za-z0-9]{6})([a-z])$/;
const isTracked = (u) => u.startsWith(GO) || [SITE, SHORT].some((s) => u.startsWith(s) && SHORT_RE.test(u.slice(s.length)));

// Adresses http(s) d'un texte, sans la ponctuation finale ni les liens déjà suivis
export const linksIn = (text) => [...new Set((String(text || '').match(/https?:\/\/[^\s<>"]+/g) || [])
  .map((u) => u.replace(/[.,;:!?)\]]+$/, '')))].filter((u) => !isTracked(u) && u.length <= 2000);

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export async function linkId(url) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)));
  const id = [...h.slice(0, 6)].map((b) => B62[b % 62]).join('');
  return /[A-Z0-9]/.test(id) ? id : B62[h[6] % 10] + id.slice(1);
}

// Lien court déjà dans le texte (case préremplie par le Studio ou l'appli) : lettre du réseau remise à
// celle du réseau de publication
const SHORT_IN = new RegExp(`${SHORT.replace(/[.]/g, '\\.')}((?=.{0,5}[A-Z0-9])[A-Za-z0-9]{6})[a-z](?![A-Za-z0-9])`, 'g');

// Texte avec ses liens remplacés par les liens suivis du réseau, et les adresses à enregistrer ({ id, url })
export async function trackText(text, net) {
  const links = await Promise.all(linksIn(text).map(async (url) => ({ id: await linkId(url), url })));
  let out = String(text || '').replace(SHORT_IN, (m, id) => `${SHORT}${id}${NET_CODE[net] || 'o'}`);
  // Les plus longues d'abord : une adresse qui en prolonge une autre reste entière
  for (const { id, url } of [...links].sort((x, y) => y.url.length - x.url.length)) out = out.split(url).join(`${SHORT}${id}${NET_CODE[net] || 'o'}`);
  return { text: out, links };
}
