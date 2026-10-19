// Publication sur Bluesky (AT Protocol, gratuit) : session avec un mot de passe d'application,
// images envoyées (4 au plus, 1 Mo chacune), post avec liens et hashtags cliquables, réponse au
// post (premier commentaire). Partagé par l'appli et la page web du créateur.
const XRPC = 'https://bsky.social/xrpc';
export const BSKY_MAX_IMAGE = 976 * 1024;

const enc = new TextEncoder();
async function xrpc(method, { token, json, body, type, query } = {}) {
  const url = `${XRPC}/${method}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const res = await fetch(url, {
    method: json || body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : type ? { 'Content-Type': type } : {}) },
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data.message || data.error || `Bluesky : erreur ${res.status}`).slice(0, 300));
  return data;
}

// Identifiant (pseudo.bsky.social ou e-mail) et mot de passe d'application -> session
export async function bskySession(acc) {
  if (!acc?.handle || !acc?.appPassword) throw new Error('Compte Bluesky non connecté');
  const s = await xrpc('com.atproto.server.createSession', { json: { identifier: acc.handle, password: acc.appPassword } });
  return { token: s.accessJwt, did: s.did, handle: s.handle };
}

// Liens et hashtags du texte, repérés en octets (UTF-8) comme le demande Bluesky
export function facets(text) {
  const out = [];
  const byteAt = (i) => enc.encode(text.slice(0, i)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/g)) {
    out.push({ index: { byteStart: byteAt(m.index), byteEnd: byteAt(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index + m[1].length;
    out.push({ index: { byteStart: byteAt(start), byteEnd: byteAt(start + 1 + m[2].length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] });
  }
  return out;
}

const postUrl = (handle, uri) => `https://bsky.app/profile/${handle}/post/${String(uri).split('/').pop()}`;

// images : [{ blob, width, height, alt }]
// external : carte de lien { url, title, description } (sans image) à la place des images
export async function publishBluesky(acc, text, images = [], external = null) {
  const s = await bskySession(acc);
  const imgs = [];
  for (const im of images.slice(0, 4)) {
    if (im.blob.size > BSKY_MAX_IMAGE) throw new Error('Image trop lourde pour Bluesky (1 Mo au plus)');
    const up = await xrpc('com.atproto.repo.uploadBlob', { token: s.token, body: im.blob, type: im.blob.type || 'image/jpeg' });
    imgs.push({ alt: im.alt || '', image: up.blob, ...(im.width && im.height ? { aspectRatio: { width: im.width, height: im.height } } : {}) });
  }
  const record = {
    $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['fr'], facets: facets(text),
    ...(imgs.length ? { embed: { $type: 'app.bsky.embed.images', images: imgs } } : {}),
    ...(!imgs.length && external ? { embed: { $type: 'app.bsky.embed.external', external: { uri: external.url, title: external.title || '', description: external.description || '' } } } : {}),
  };
  const r = await xrpc('com.atproto.repo.createRecord', { token: s.token, json: { repo: s.did, collection: 'app.bsky.feed.post', record } });
  return { url: postUrl(s.handle, r.uri), id: { uri: r.uri, cid: r.cid } };
}

// Réponse au post (premier commentaire)
export async function replyBluesky(acc, parent, text) {
  const s = await bskySession(acc);
  const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['fr'], facets: facets(text), reply: { root: parent, parent } };
  return xrpc('com.atproto.repo.createRecord', { token: s.token, json: { repo: s.did, collection: 'app.bsky.feed.post', record } });
}
