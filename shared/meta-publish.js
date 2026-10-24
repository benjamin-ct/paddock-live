// Publication sur Facebook, Instagram et Threads (API de Meta), partagée par l'appli de bureau et la
// page web du créateur (serveur Paddock Live). Les jetons sont passés par l'appelant ; rien n'est
// gardé ici à part les adresses des images déjà déposées (une heure).
// Instagram et Threads vont chercher les images à une adresse publique : celle de la page Facebook,
// où elles sont déposées sans être publiées.

export const GRAPH = 'https://graph.facebook.com/v25.0';
export const THREADS = 'https://graph.threads.net/v1.0';
// Sujet des posts Threads (« > F1 Threads » à côté du nom, la communauté F1 de Threads) : sans lui, Threads prend le premier
// hashtag du texte (#F1)
export const THREADS_TOPIC = 'F1 Threads';
export const timing = { poll: 1500, maxPoll: 5000, readyMs: 4 * 60e3, visible: [8e3, 15e3, 20e3], threadsVideo: [30e3, 20e3, 30e3] };
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
    // debug_info : refus d'un envoi de fichier à Instagram (rupload)
    const msg = (typeof err === 'string' ? err : err?.error_user_msg || err?.message) || data?.debug_info?.message || data?.detail || data?.title || data?.errors?.[0]?.message || data?.error_description || `HTTP ${res.status}${data?.raw ? ` : ${String(data.raw).slice(0, 200)}` : ''}`;
    const e = new Error(String(msg).slice(0, 300));
    if (typeof err?.code === 'string') e.code = err.code;   // code de l'erreur (TikTok), pour un message clair
    throw e;
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

async function hostOne(img, m, fresh, withUrl = true) {
  const key = await digest(img, m.pageId);
  const hit = hostedCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < HOST_TTL) return hit;
  const form = new FormData();
  form.append('source', img, img.type === 'image/jpeg' ? 'image.jpg' : 'image.png');
  form.append('published', 'false');
  if (img.alt) form.append('alt_text_custom', img.alt);   // texte alternatif (photo du post Facebook)
  form.append('access_token', m.pageToken);
  const r = await call(`${GRAPH}/${m.pageId}/photos`, { method: 'POST', form });
  // Post Facebook : l'identifiant de la photo suffit (une demande de moins par image, limite du serveur)
  if (!withUrl) return { id: r.id };
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
export async function hostOnPage(meta, images, { fresh = false, withUrl = true } = {}) {
  if (!meta?.pageToken) throw new Error('Page Facebook non connectée (nécessaire aussi pour Instagram et Threads)');
  return mapLimit(images, 3, (img) => hostOne(img, meta, fresh, withUrl));
}

export async function publishFacebook(meta, text, images) {
  const hosted = await hostOnPage(meta, images, { fresh: true, withUrl: false });
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
    try { return (await makeItem(h, i)).id; } catch (err) { throw new Error(`Image ${i + 1} : ${err.message}`); }
  });
  await Promise.all(kids.map((id, i) => ready(status(id), field, `Image ${i + 1}`)));
  return kids;
}

// Texte alternatif d'une image (image.alt, lecteurs d'écran) : Instagram et Threads, images du fil
const altOf = (img) => (img?.alt ? { alt_text: String(img.alt).slice(0, 1000) } : {});

export async function publishInstagram(meta, text, images) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const hosted = await hostOnPage(meta, images.slice(0, 10));
  const tok = { access_token: meta.pageToken };
  const status = (id) => `${GRAPH}/${id}?${new URLSearchParams({ fields: 'status_code,status', ...tok })}`;
  const media = (form) => call(`${GRAPH}/${meta.igId}/media`, { method: 'POST', form: { ...form, ...tok } });
  let creation;
  if (hosted.length === 1) {
    creation = (await media({ image_url: hosted[0].url, caption: text, ...altOf(images[0]) })).id;
  } else {
    const kids = await carousel(hosted, (h, i) => media({ image_url: h.url, is_carousel_item: 'true', ...altOf(images[i]) }), status, 'status_code');
    creation = (await media({ media_type: 'CAROUSEL', children: kids.join(','), caption: text })).id;
  }
  await ready(status(creation), 'status_code', 'Post');
  let pub;
  try {
    pub = await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: creation, ...tok } });
  } catch (err) {
    // Instagram répond parfois une erreur (« Nous restreignons certaines activités… ») alors que le post est
    // bien en ligne, parfois quelques secondes plus tard : conteneur relu plusieurs fois, et dernier post du
    // compte comparé à la légende ; repris s'il est là (jamais republié en double)
    for (const ms of [0, ...timing.visible]) {
      if (ms) await wait(ms);
      const done = (await call(status(creation)).catch(() => ({}))).status_code === 'PUBLISHED';
      const last = (await call(`${GRAPH}/${meta.igId}/media?${new URLSearchParams({ fields: 'id,permalink,caption,timestamp', limit: '1', ...tok })}`).catch(() => ({}))).data?.[0] || {};
      const same = last.caption && last.caption.trim().slice(0, 80) === text.trim().slice(0, 80) && Date.now() - Date.parse(last.timestamp) < 15 * 60e3;
      if (done || same) return { url: last.permalink || `https://www.instagram.com/${meta.igUsername || ''}`, id: last.id || null };
    }
    throw err;
  }
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

// Vidéo envoyée telle quelle à Instagram (envoi « resumable » : le fichier dans la requête, sans adresse à aller
// chercher), prête une fois préparée. fields : type et réglages du conteneur (Reel, Story)
async function igVideo(meta, video, fields, what) {
  const tok = { access_token: meta.pageToken };
  const c = await call(`${GRAPH}/${meta.igId}/media`, { method: 'POST', form: { ...fields, upload_type: 'resumable', ...tok } });
  await call(c.uri || `${GRAPH.replace('//graph.', '//rupload.').replace('.com/', '.com/ig-api-upload/')}/${c.id}`, { method: 'POST', headers: { Authorization: `OAuth ${meta.pageToken}`, offset: '0', file_size: String(video.size) }, body: video })
    .catch(async (err) => {
      // Refus de l'envoi, mais vidéo reçue et en traitement chez Instagram (« Media is still being processed ») :
      // on attend la fin comme d'habitude. Sinon, l'état du conteneur dit où ça bloque
      const s = await call(`${GRAPH}/${c.id}?${new URLSearchParams({ fields: 'status,status_code,video_status', ...tok })}`).catch(() => null);
      const upErr = s?.video_status?.uploading_phase?.error?.message;
      if (['IN_PROGRESS', 'FINISHED'].includes(s?.status_code) && !upErr) return;
      const at = [s?.status, upErr, s?.video_status?.processing_phase?.error?.message].filter(Boolean).join(' ; ');
      throw new Error(`Envoi de la vidéo à Instagram refusé : ${err.message}${at ? ` (${at})` : ''}`.slice(0, 300));
    });
  await ready(`${GRAPH}/${c.id}?${new URLSearchParams({ fields: 'status_code,status', ...tok })}`, 'status_code', what);
  return c.id;
}

// Story vidéo (une seule) : Instagram reçoit le fichier ; la page Facebook le reçoit en trois temps
// (ouverture, envoi du fichier, publication)
export async function storyVideoInstagram(meta, video) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const id = await igVideo(meta, video, { media_type: 'STORIES' }, 'Story');
  await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: id, access_token: meta.pageToken } });
  return { url: `https://www.instagram.com/stories/${meta.igUsername || ''}/`, id: null, count: 1 };
}
export async function storyVideoFacebook(meta, video) {
  const tok = { access_token: meta.pageToken };
  const s = await call(`${GRAPH}/${meta.pageId}/video_stories`, { method: 'POST', form: { upload_phase: 'start', ...tok } });
  await call(s.upload_url, { method: 'POST', headers: { Authorization: `OAuth ${meta.pageToken}`, offset: '0', file_size: String(video.size) }, body: video });
  await call(`${GRAPH}/${meta.pageId}/video_stories`, { method: 'POST', form: { upload_phase: 'finish', video_id: s.video_id, ...tok } });
  return { url: `https://www.facebook.com/${meta.pageId}`, id: null, count: 1 };
}

// Reel Instagram (montré aussi dans le fil). La préparation d'une vidéo prend souvent une à deux minutes.
// coverUrl : couverture (image publique), sinon une image choisie par Instagram
export async function reelInstagram(meta, video, caption, coverUrl = null) {
  if (!meta?.igId) throw new Error('Aucun compte Instagram professionnel relié à la page Facebook');
  const tok = { access_token: meta.pageToken };
  const reel = (cover) => igVideo(meta, video, { media_type: 'REELS', caption: String(caption || '').slice(0, 2200), ...(cover ? { cover_url: cover } : {}) }, 'Reel');
  // Refus avec la couverture (même vidéo acceptée en story) : un essai sans elle, image choisie par Instagram
  let note = null;
  const id = await reel(coverUrl).catch((err) => {
    if (!coverUrl) throw err;
    note = `Couverture refusée par Instagram (${err.message.slice(0, 120)}) : image choisie par Instagram`;
    return reel(null);
  });
  const pub = await call(`${GRAPH}/${meta.igId}/media_publish`, { method: 'POST', form: { creation_id: id, ...tok } });
  const link = await call(`${GRAPH}/${pub.id}?${new URLSearchParams({ fields: 'permalink', ...tok })}`).catch(() => ({}));
  return { url: link.permalink || `https://www.instagram.com/${meta.igUsername || ''}`, id: pub.id, ...(note ? { note } : {}) };
}

// ---------- Vidéo envoyée par le créateur (MP4 ou MOV) ----------
const GRAPH_VIDEO = GRAPH.replace('//graph.', '//graph-video.');
async function uploadVideo(meta, video, fields, thumb = null) {
  if (!meta?.pageToken) throw new Error('Page Facebook non connectée');
  const form = new FormData();
  form.append('source', video, video.type === 'video/quicktime' ? 'video.mov' : 'video.mp4');
  if (thumb) form.append('thumb', thumb, 'cover.jpg');
  for (const [k, v] of Object.entries({ ...fields, access_token: meta.pageToken })) form.append(k, v);
  return call(`${GRAPH_VIDEO}/${meta.pageId}/videos`, { method: 'POST', form });
}
// cover : couverture de la vidéo (JPEG), sinon une image choisie par Facebook
export async function publishFacebookVideo(meta, text, video, cover = null) {
  const r = await uploadVideo(meta, video, { description: text, published: 'true' }, cover);
  return { url: `https://www.facebook.com/${meta.pageId}/videos/${r.id}`, id: r.id };
}
// Threads lit la vidéo à une adresse publique (videoUrl : fichier gardé par le serveur Paddock Live)
// Refus (préparation ou publication) : un second essai sans le sujet « F1 Threads », note à l'appui
export async function publishThreadsVideo(th, videoUrl, text) {
  try { return await threadsVideo(th, videoUrl, text, THREADS_TOPIC); } catch (err) {
    const r = await threadsVideo(th, videoUrl, text, null).catch((e) => { throw new Error(`${e.message} (aussi sans le sujet « ${THREADS_TOPIC} »)`.slice(0, 300)); });
    return { ...r, note: `Publié sans le sujet « ${THREADS_TOPIC} » (refusé avec : ${err.message.slice(0, 100)})` };
  }
}
async function threadsVideo(th, videoUrl, text, topic) {
  const base = `${THREADS}/${th.userId}`;
  // Étape en échec nommée dans le message (les refus de Threads sont souvent un « unexpected error » sans détail)
  const step = (what) => (err) => { throw new Error(`${what} : ${err.message}`.slice(0, 300)); };
  const c = await call(`${base}/threads`, { method: 'POST', form: { media_type: 'VIDEO', video_url: videoUrl, text, ...(topic ? { topic_tag: topic } : {}), access_token: th.token } }).catch(step('Création du post Threads refusée'));
  const status = `${THREADS}/${c.id}?${new URLSearchParams({ fields: 'status,error_message', access_token: th.token })}`;
  await ready(status, 'status', 'Vidéo');
  // Vidéo prête : Threads demande encore une trentaine de secondes avant la publication (sinon « unexpected error ») ;
  // refus : nouvel essai plus tard, sauf si le post est en fait parti (conteneur « PUBLISHED »)
  let pub;
  for (const [i, ms] of timing.threadsVideo.entries()) {
    await wait(ms);
    try { pub = await call(`${base}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: th.token } }); break; } catch (err) {
      if ((await call(status).catch(() => ({}))).status === 'PUBLISHED') { pub = { id: null }; break; }
      if (i === timing.threadsVideo.length - 1) step('Publication sur Threads refusée')(err);
    }
  }
  if (!pub.id) return { url: `https://www.threads.net/@${th.username || ''}`, id: null };
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
    creation = (await container({ media_type: 'IMAGE', image_url: hosted[0].url, text, topic_tag: THREADS_TOPIC, ...altOf(images[0]) })).id;
  } else {
    const kids = await carousel(hosted, (h, i) => container({ media_type: 'IMAGE', image_url: h.url, is_carousel_item: 'true', ...altOf(images[i]) }), status, 'status');
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
