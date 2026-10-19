// Publication sur Facebook, Instagram et Threads (API de Meta), partagée par l'appli de bureau et la
// page web du créateur (serveur Paddock Live). Les jetons sont passés par l'appelant ; rien n'est
// gardé ici à part les adresses des images déjà déposées (une heure).
// Instagram et Threads vont chercher les images à une adresse publique : celle de la page Facebook,
// où elles sont déposées sans être publiées.

export const GRAPH = 'https://graph.facebook.com/v25.0';
export const THREADS = 'https://graph.threads.net/v1.0';
// Sujet des posts Threads (« > F1 Thread » à côté du nom) : sans lui, Threads prend le premier
// hashtag du texte (#F1)
export const THREADS_TOPIC = 'F1 Thread';
export const timing = { poll: 1500, maxPoll: 5000, readyMs: 4 * 60e3, visible: [8e3, 15e3, 20e3] };
const HOST_TTL = 60 * 60e3;
const hostedCache = new Map();   // empreinte de l'image + page -> { id, url, at }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Requête HTTP : réponse JSON, message d'erreur de l'API sinon
export async function call(url, { method = 'GET', headers = {}, json, form, body } = {}) {
  const opts = { method, headers: { ...headers }, signal: AbortSignal.timeout(120000) };
  if (json !== undefined) { opts.body = JSON.stringify(json); opts.headers['Content-Type'] = 'application/json'; }
  else if (form) opts.body = form instanceof FormData ? form : new URLSearchParams(form);
  else if (body !== undefined) opts.body = body;
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  const err = data?.error;
  if (!res.ok || (err && (typeof err === 'string' || err.message || (err.code && err.code !== 'ok')))) {
    const msg = (typeof err === 'string' ? err : err?.error_user_msg || err?.message) || data?.detail || data?.title || data?.errors?.[0]?.message || data?.error_description || `HTTP ${res.status}`;
    throw new Error(String(msg).slice(0, 300));
  }
  return data;
}

// Tâches en parallèle (au plus `n` à la fois), résultats dans l'ordre
async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

// Empreinte du fichier (sans le recopier octet par octet : vidéos de 50 Mo sur le serveur)
async function digest(blob, salt) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return `${salt}:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function hostOne(img, m, fresh) {
  const key = await digest(img, m.pageId);
  const hit = hostedCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < HOST_TTL) return hit;
  const form = new FormData();
  form.append('source', img, img.type === 'image/jpeg' ? 'image.jpg' : 'image.png');
  form.append('published', 'false');
  form.append('access_token', m.pageToken);
  const r = await call(`${GRAPH}/${m.pageId}/photos`, { method: 'POST', form });
  const info = await call(`${GRAPH}/${r.id}?${new URLSearchParams({ fields: 'images', access_token: m.pageToken })}`);
  const best = (info.images || []).sort((a, b) => b.width - a.width)[0];
  if (!best?.source) throw new Error('Image déposée sur la page Facebook sans adresse publique');
  const h = { id: r.id, url: best.source, at: Date.now() };
  hostedCache.set(key, h);
  for (const [k, v] of hostedCache) if (Date.now() - v.at >= HOST_TTL) hostedCache.delete(k);
  return h;
}

// Images (Blob PNG ou JPEG) déposées sur la page, une heure de mémoire pour tous les réseaux d'une
// même publication. fresh : nouvel envoi obligatoire (une photo déjà jointe à un post Facebook ne
// peut pas l'être à un autre).
export async function hostOnPage(meta, images, { fresh = false } = {}) {
  if (!meta?.pageToken) throw new Error('Page Facebook non connectée (nécessaire aussi pour Instagram et Threads)');
  return mapLimit(images, 3, (img) => hostOne(img, meta, fresh));
}

export async function publishFacebook(meta, text, images) {
  const hosted = await hostOnPage(meta, images, { fresh: true });
  const form = { message: text, access_token: meta.pageToken };
  hosted.forEach((h, i) => { form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: h.id }); });
  const r = await call(`${GRAPH}/${meta.pageId}/feed`, { method: 'POST', form });
  return { url: `https://www.facebook.com/${r.id}`, id: r.id };
}

// Premier commentaire de la page sous son post (lien de l'article…) : permission
// pages_manage_engagement du jeton
export async function commentFacebook(meta, postId, text) {
  return call(`${GRAPH}/${postId}/comments`, { method: 'POST', form: { message: text, access_token: meta.pageToken } });
}

// Conteneur prêt : le réseau a fini de récupérer et de préparer l'image (sinon le carrousel ou la
// publication sont refusés). Statut relu toutes les 1,5 à 5 secondes, 4 minutes au plus.
async function ready(url, field, what) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    const s = await call(url);
    const v = s[field];
    if (v === 'FINISHED' || v === 'PUBLISHED') return;
    if (v === 'ERROR' || v === 'EXPIRED') {
      const detail = s.error_message || (typeof s.status === 'string' && s.status !== v ? s.status : '');
      throw new Error(`${what} refusé${detail ? ` : ${detail}` : ` (${v})`}`.slice(0, 300));
    }
    if (Date.now() - t0 >= timing.readyMs) throw new Error(`${what} : préparation trop longue, réessayez dans quelques minutes`);
    await wait(Math.min(timing.poll * (i + 1), timing.maxPoll));
  }
}

// Carrousel : images préparées en parallèle, chacune attendue, puis le carrousel lui-même
async function carousel(hosted, makeItem, status, field) {
  const kids = await mapLimit(hosted, 3, async (h, i) => {
    try { return (await makeItem(h)).id; } catch (err) { throw new Error(`Image ${i + 1} : ${err.message}`); }
  });
  await Promise.all(kids.map((id, i) => ready(status(id), field, `Image ${i + 1}`)));
  return kids;
}

export async function publishInstagram(meta, text, images) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const hosted = await hostOnPage(meta, images.slice(0, 10));
  const tok = { access_token: meta.pageToken };
  const status = (id) => `${GRAPH}/${id}?${new URLSearchParams({ fields: 'status_code,status', ...tok })}`;
  const media = (form) => call(`${GRAPH}/${meta.igId}/media`, { method: 'POST', form: { ...form, ...tok } });
  let creation;
  if (hosted.length === 1) {
    creation = (await media({ image_url: hosted[0].url, caption: text })).id;
  } else {
    const kids = await carousel(hosted, (h) => media({ image_url: h.url, is_carousel_item: 'true' }), status, 'status_code');
    creation = (await media({ media_type: 'CAROUSEL', children: kids.join(','), caption: text })).id;
  }
  await ready(status(creation), 'status_code', 'Post');
  const pub = await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: creation, ...tok } });
  const link = await call(`${GRAPH}/${pub.id}?${new URLSearchParams({ fields: 'permalink', ...tok })}`).catch(() => ({}));
  return { url: link.permalink || `https://www.instagram.com/${meta.igUsername || ''}`, id: pub.id };
}

// Stories (une par image, dans l'ordre) : Instagram (conteneur STORIES) et page Facebook (photo
// déposée sans être publiée, puis photo_stories). Mêmes autorisations que les posts.
export async function storyInstagram(meta, images) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const tok = { access_token: meta.pageToken };
  const hosted = await hostOnPage(meta, images.slice(0, 10));
  for (const [i, h] of hosted.entries()) {
    const c = await call(`${GRAPH}/${meta.igId}/media`, { method: 'POST', form: { media_type: 'STORIES', image_url: h.url, ...tok } });
    await ready(`${GRAPH}/${c.id}?${new URLSearchParams({ fields: 'status_code,status', ...tok })}`, 'status_code', `Story ${i + 1}`);
    await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: c.id, ...tok } });
  }
  return { url: `https://www.instagram.com/stories/${meta.igUsername || ''}/`, id: null, count: hosted.length };
}

export async function storyFacebook(meta, images) {
  const hosted = await hostOnPage(meta, images.slice(0, 10), { fresh: true });
  for (const h of hosted) await call(`${GRAPH}/${meta.pageId}/photo_stories`, { method: 'POST', form: { photo_id: h.id, access_token: meta.pageToken } });
  return { url: `https://www.facebook.com/${meta.pageId}`, id: null, count: hosted.length };
}

// Reel Instagram : vidéo lue par Instagram à une adresse publique (fichier du site), montrée aussi
// dans le fil. La préparation d'une vidéo prend souvent une à deux minutes.
export async function reelInstagram(meta, videoUrl, caption) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const tok = { access_token: meta.pageToken };
  const c = await call(`${GRAPH}/${meta.igId}/media`, { method: 'POST', form: { media_type: 'REELS', video_url: videoUrl, caption: String(caption || '').slice(0, 2200), share_to_feed: 'true', ...tok } });
  await ready(`${GRAPH}/${c.id}?${new URLSearchParams({ fields: 'status_code,status', ...tok })}`, 'status_code', 'Reel');
  const pub = await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: c.id, ...tok } });
  const link = await call(`${GRAPH}/${pub.id}?${new URLSearchParams({ fields: 'permalink', ...tok })}`).catch(() => ({}));
  return { url: link.permalink || `https://www.instagram.com/${meta.igUsername || ''}`, id: pub.id };
}

// ---------- Vidéo envoyée par le créateur (MP4 ou MOV) ----------
// Déposée sur la page Facebook sans être publiée : son adresse publique sert à Instagram (Reel) et à
// Threads, comme pour les images. Prête quand Facebook a fini de la traiter.
const GRAPH_VIDEO = GRAPH.replace('//graph.', '//graph-video.');
async function uploadVideo(meta, video, fields) {
  if (!meta?.pageToken) throw new Error('Page Facebook non connectée (nécessaire aussi pour Instagram et Threads)');
  const form = new FormData();
  form.append('source', video, video.type === 'video/quicktime' ? 'video.mov' : 'video.mp4');
  for (const [k, v] of Object.entries({ ...fields, access_token: meta.pageToken })) form.append(k, v);
  return call(`${GRAPH_VIDEO}/${meta.pageId}/videos`, { method: 'POST', form });
}
export async function hostVideo(meta, video) {
  const key = await digest(video, `video:${meta?.pageId}`);
  const hit = hostedCache.get(key);
  if (hit && Date.now() - hit.at < HOST_TTL) return hit;
  const { id } = await uploadVideo(meta, video, { published: 'false' });
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    const s = await call(`${GRAPH}/${id}?${new URLSearchParams({ fields: 'status,source', access_token: meta.pageToken })}`);
    const st = s.status?.video_status;
    if (st === 'ready' && s.source) {
      const h = { id, url: s.source, at: Date.now() };
      hostedCache.set(key, h);
      return h;
    }
    if (st === 'error' || st === 'expired') throw new Error(`Vidéo refusée par Facebook${s.status?.processing_phase?.error?.message ? ` : ${s.status.processing_phase.error.message}` : ''}`.slice(0, 300));
    if (Date.now() - t0 >= timing.readyMs) throw new Error('Vidéo : préparation trop longue, réessayez dans quelques minutes');
    await wait(Math.min(timing.poll * (i + 1), timing.maxPoll));
  }
}
export async function publishFacebookVideo(meta, text, video) {
  const r = await uploadVideo(meta, video, { description: text, published: 'true' });
  return { url: `https://www.facebook.com/${meta.pageId}/videos/${r.id}`, id: r.id };
}
export async function publishThreadsVideo(th, meta, text, video) {
  const hosted = await hostVideo(meta, video);
  const base = `${THREADS}/${th.userId}`;
  const c = await call(`${base}/threads`, { method: 'POST', form: { media_type: 'VIDEO', video_url: hosted.url, text, topic_tag: THREADS_TOPIC, access_token: th.token } });
  await ready(`${THREADS}/${c.id}?${new URLSearchParams({ fields: 'status,error_message', access_token: th.token })}`, 'status', 'Vidéo');
  const pub = await call(`${base}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: th.token } });
  const link = await call(`${THREADS}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: th.token })}`).catch(() => ({}));
  const visible = link.permalink ? await threadsVisible(link.permalink, th.username) : null;
  return { url: link.permalink || `https://www.threads.net/@${th.username || ''}`, id: pub.id, visible };
}

// Jeton Threads de 60 jours : prolongé quand il reste moins de 10 jours. Renvoie le compte à jour
// (à enregistrer par l'appelant s'il a changé), ou le même si la prolongation échoue.
export async function freshThreads(th) {
  if (!th?.token) throw new Error('Compte Threads non connecté');
  if (!th.expiresAt || th.expiresAt - Date.now() >= 10 * 86400e3) return th;
  try {
    const r = await call(`https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: th.token })}`);
    return { ...th, token: r.access_token, expiresAt: Date.now() + (r.expires_in || 5184000) * 1000 };
  } catch { return th; }
}

export async function publishThreads(th, meta, text, images) {
  const token = th.token;
  const hosted = await hostOnPage(meta, images.slice(0, 20));
  const base = `${THREADS}/${th.userId}`;
  const status = (id) => `${THREADS}/${id}?${new URLSearchParams({ fields: 'status,error_message', access_token: token })}`;
  const container = (form) => call(`${base}/threads`, { method: 'POST', form: { ...form, access_token: token } });
  let creation;
  if (hosted.length === 1) {
    creation = (await container({ media_type: 'IMAGE', image_url: hosted[0].url, text, topic_tag: THREADS_TOPIC })).id;
  } else {
    const kids = await carousel(hosted, (h) => container({ media_type: 'IMAGE', image_url: h.url, is_carousel_item: 'true' }), status, 'status');
    creation = (await container({ media_type: 'CAROUSEL', children: kids.join(','), text, topic_tag: THREADS_TOPIC })).id;
  }
  await ready(status(creation), 'status', 'Post');
  const pub = await call(`${base}/threads_publish`, { method: 'POST', form: { creation_id: creation, access_token: token } });
  const link = await call(`${THREADS}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`).catch(() => ({}));
  const visible = link.permalink ? await threadsVisible(link.permalink, th.username) : null;
  return { url: link.permalink || `https://www.threads.net/@${th.username || ''}`, id: pub.id, visible };
}

// Post avec seulement le lien d'un article : Facebook et Threads affichent eux-mêmes sa carte (photo et
// titre que le site publie pour les aperçus), sans que l'image soit recopiée
export async function publishFacebookLink(meta, text, link) {
  const r = await call(`${GRAPH}/${meta.pageId}/feed`, { method: 'POST', form: { message: text, link, access_token: meta.pageToken } });
  return { url: `https://www.facebook.com/${r.id}`, id: r.id };
}
export async function publishThreadsLink(th, text, link) {
  const base = `${THREADS}/${th.userId}`;
  const c = await call(`${base}/threads`, { method: 'POST', form: { media_type: 'TEXT', text, link_attachment: link, topic_tag: THREADS_TOPIC, access_token: th.token } });
  await ready(`${THREADS}/${c.id}?${new URLSearchParams({ fields: 'status,error_message', access_token: th.token })}`, 'status', 'Post');
  const pub = await call(`${base}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: th.token } });
  const p = await call(`${THREADS}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: th.token })}`).catch(() => ({}));
  return { url: p.permalink || `https://www.threads.net/@${th.username || ''}`, id: pub.id };
}

// Le post est-il visible sans être connecté ? La page publique (lue comme un aperçu de lien) porte
// « (@compte) on Threads » ; un post caché ou introuvable renvoie la page de connexion. Plusieurs
// essais espacés (le temps que le post soit en ligne) ; null si la page n'a pas pu être lue.
export async function threadsVisible(url, username, delays = timing.visible) {
  let seen = null;
  for (const ms of delays) {
    await wait(ms);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'facebookexternalhit/1.1' }, redirect: 'follow' });
      if (!res.ok) continue;
      const html = await res.text();
      const title = (html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || '').replace(/&#0*64;/g, '@').replace(/&#x2022;/gi, '•');
      if (username ? title.includes(`@${username})`) : / on Threads$/.test(title)) return true;
      if (/Log in$/i.test(title)) seen = false;
    } catch { /* réessayé au tour suivant */ }
  }
  return seen;
}

// Réponse au post Threads (premier commentaire) : permission threads_manage_replies du jeton
export async function replyThreads(th, postId, text) {
  const token = th.token;
  const c = await call(`${THREADS}/${th.userId}/threads`, { method: 'POST', form: { media_type: 'TEXT', text, reply_to_id: postId, access_token: token } });
  await ready(`${THREADS}/${c.id}?${new URLSearchParams({ fields: 'status,error_message', access_token: token })}`, 'status', 'Commentaire');
  return call(`${THREADS}/${th.userId}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: token } });
}

// Publication puis premier commentaire ; un commentaire refusé ne fait pas échouer la publication
export async function withComment(post, comment, addComment) {
  const r = await post();
  if (!comment || !r.id) return r;
  try { await addComment(r.id, comment); return { ...r, comment: true }; } catch (err) {
    const msg = /permission|\(#10\)|\(#200\)|not authorized|scope/i.test(err.message) ? `${err.message} (permission manquante : régénérez le jeton avec les nouvelles autorisations)` : err.message;
    return { ...r, commentError: msg.slice(0, 300) };
  }
}
