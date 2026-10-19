// Liens suivis dans les posts publiés : chaque adresse devient https://paddocklive.app/go/<id><réseau>
// (id : 8 caractères de l'empreinte SHA-256 de l'adresse, réseau : une lettre). Le serveur compte le clic
// (nombre par jour, sans cookie ni adresse IP) puis renvoie vers l'adresse d'origine.
export const GO = 'https://paddocklive.app/go/';
export const NET_CODE = { instagram: 'i', facebook: 'f', threads: 't', x: 'x', bluesky: 'b', tiktok: 'k', youtube: 'y' };
export const NET_OF = Object.fromEntries(Object.entries(NET_CODE).map(([n, c]) => [c, n]));
export const GO_RE = /^([A-Za-z0-9_-]{8})([a-z])$/;

// Adresses http(s) d'un texte, sans la ponctuation finale ni les liens déjà suivis
export const linksIn = (text) => [...new Set((String(text || '').match(/https?:\/\/[^\s<>"]+/g) || [])
  .map((u) => u.replace(/[.,;:!?)\]]+$/, '')))].filter((u) => !u.startsWith(GO) && u.length <= 2000);

export async function linkId(url) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)));
  return btoa(String.fromCharCode(...h)).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
}

// Texte avec ses liens remplacés par les liens suivis du réseau, et les adresses à enregistrer ({ id, url })
export async function trackText(text, net) {
  const links = await Promise.all(linksIn(text).map(async (url) => ({ id: await linkId(url), url })));
  let out = String(text || '');
  // Les plus longues d'abord : une adresse qui en prolonge une autre reste entière
  for (const { id, url } of [...links].sort((x, y) => y.url.length - x.url.length)) out = out.split(url).join(`${GO}${id}${NET_CODE[net] || 'o'}`);
  return { text: out, links };
}
