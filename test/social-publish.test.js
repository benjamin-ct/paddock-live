import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-social-'));
const { oauth1, accountsInfo, saveAccount, youtubeLoginUrl, youtubeCallback, tiktokLoginUrl, tiktokCallback, metaLoginUrl, metaCallback, META_REDIRECT } = await import('../server/social-publish.js');
const { saveConfig, getConfig } = await import('../server/config.js');
const { timing, publishFacebook, publishInstagram, publishThreads, withComment } = await import('../shared/meta-publish.js');
const { publishBluesky, replyBluesky } = await import('../shared/bluesky-publish.js');
const { youtubeSnippet, youtubeUpload } = await import('../shared/video-publish.js');
// Images envoyées par le Studio (PNG en base64), avec leur texte alternatif
const blobs = (images, alts = []) => images.map((b, i) => Object.assign(new Blob([Buffer.from(b, 'base64')], { type: 'image/png' }), { alt: alts[i] || '' }));

test('X : signature OAuth 1.0a (exemple de la documentation de X)', () => {
  const k = { apiKey: 'xvz1evFS4wEEPTGEFPHBog', apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', accessSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' };
  const h = oauth1('POST', 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true', k, {
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958,
    params: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  assert.match(h, /^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
});

test('comptes : jamais de clé ni de jeton renvoyé à l\'interface', async () => {
  saveConfig({ social: { x: { apiKey: 'k', apiSecret: 'secret-x', accessToken: 't', accessSecret: 's', username: '@moi' }, meta: { pageToken: 'jeton-page', pageName: 'Ma page', igId: '1', igUsername: 'moi' } } });
  const info = accountsInfo();
  assert.deepEqual(info.x, { connected: true, name: '@moi' });
  assert.equal(info.instagram.name, '@moi');
  const text = JSON.stringify(info);
  for (const s of ['secret-x', 'jeton-page']) assert.ok(!text.includes(s));
  await saveAccount('x', { remove: true });
  assert.equal(accountsInfo().x.connected, false);
  await assert.rejects(saveAccount('x', { apiKey: 'a' }), /4 clés/);
});

// Faux serveurs Meta : images déposées sur la page, conteneurs « en cours » puis prêts
function fakeMeta({ errorOn = null, blocked = false, lagged = false, caption = null } = {}) {
  const log = [];
  const polls = {};
  const published = new Set();
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const form = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body)
      : opts.body instanceof FormData ? Object.fromEntries([...opts.body].filter(([, v]) => typeof v === 'string')) : {};
    log.push({ method, path: u.pathname, form, fields: u.searchParams.get('fields') });
    const json = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) });
    if (method === 'POST' && u.pathname.endsWith('/photos')) return json({ id: `ph${++n}` });
    if (method === 'GET' && u.searchParams.get('fields') === 'images') return json({ images: [{ width: 1080, source: `https://cdn.test${u.pathname}.jpg` }, { width: 320, source: 'https://cdn.test/petite.jpg' }] });
    if (method === 'POST' && /\/(media|threads)$/.test(u.pathname)) {
      const id = `c${++n}`;
      if (form.media_type === 'CAROUSEL') {
        // Refusé si une image n'a pas fini d'être préparée (comportement de Threads)
        const notReady = form.children.split(',').filter((k) => (polls[k] || 0) < 2);
        if (notReady.length) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `Les enfants avec les ID ${notReady.join(',')} ne sont pas valides` } }) };
      }
      return json({ id });
    }
    if (method === 'GET' && /status/.test(u.searchParams.get('fields') || '')) {
      const id = u.pathname.split('/').pop();
      polls[id] = (polls[id] || 0) + 1;
      const field = u.searchParams.get('fields').startsWith('status_code') ? 'status_code' : 'status';
      if (errorOn === id) return json({ [field]: 'ERROR', ...(field === 'status' ? { error_message: 'Image illisible' } : { status: 'Error: Media download has failed.' }) });
      return json({ [field]: published.has(id) ? 'PUBLISHED' : polls[id] >= 2 ? 'FINISHED' : 'IN_PROGRESS' });
    }
    if (method === 'POST' && /(media_publish|threads_publish)$/.test(u.pathname)) {
      // Instagram en retard : conteneur pas encore marqué publié après la réponse
      if (!lagged) published.add(form.creation_id);
      // Publié, mais réponse en erreur (blocage d'activité d'Instagram)
      if (blocked) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 368, error_user_msg: 'Nous restreignons certaines activités afin de protéger notre communauté.' } }) };
      return json({ id: 'pub1' });
    }
    if (method === 'GET' && u.pathname.endsWith('/media') && (u.searchParams.get('fields') || '').startsWith('id,permalink')) return json({ data: [{ id: 'ig-post', permalink: 'https://example.test/p/ig', caption: caption ?? 'Ancien post', timestamp: new Date().toISOString() }] });
    if (method === 'POST' && u.pathname.endsWith('/feed')) return json({ id: 'page_post' });
    if (method === 'POST' && u.pathname.endsWith('/photo_stories')) return json({ success: true, post_id: `st${++n}` });
    if (u.searchParams.get('fields') === 'permalink') return json({ permalink: 'https://example.test/p/1' });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  return { log, polls };
}

const PNG = (k) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`image-${k}`)]).toString('base64');

test('Threads et Instagram : chaque image du carrousel est prête avant le carrousel, images déposées une seule fois', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  const meta = { pageId: 'page1', pageToken: 'jp', igId: 'ig1', igUsername: 'moi' };
  const th1 = { token: 'jt', userId: 'th1', username: 'moi' };
  try {
    const { log } = fakeMeta();
    const images = [PNG(1), PNG(2), PNG(3)];
    const alts = ['Podium : 1. Norris', 'Classement', 'Faits marquants'];
    const th = await publishThreads(th1, meta, 'Bonjour', blobs(images, alts));
    assert.equal(th.url, 'https://example.test/p/1');
    const kids = log.filter((l) => l.form.is_carousel_item === 'true');
    assert.equal(kids.length, 3);
    assert.ok(kids.every((k) => /^https:\/\/cdn\.test\/.+\.jpg$/.test(k.form.image_url) && k.form.media_type === 'IMAGE'));
    assert.deepEqual(kids.map((k) => k.form.alt_text).sort(), [...alts].sort());   // texte alternatif de chaque image
    const car = log.find((l) => l.form.media_type === 'CAROUSEL');
    assert.equal(car.form.text, 'Bonjour');
    assert.equal(car.form.topic_tag, 'F1 Threads');
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 3);

    // Instagram juste après : mêmes images, rien de redéposé sur la page
    log.length = 0;
    const ig = await publishInstagram(meta, 'Légende', blobs(images, alts));
    assert.equal(ig.url, 'https://example.test/p/1');
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 0);
    assert.equal(log.find((l) => l.form.media_type === 'CAROUSEL').form.caption, 'Légende');
    assert.deepEqual(log.filter((l) => l.form.is_carousel_item === 'true').map((l) => l.form.alt_text).sort(), [...alts].sort());
    assert.ok(log.some((l) => l.path.endsWith('/media_publish')));

    // Facebook : nouvel envoi (une photo jointe à un post ne peut pas l'être à un autre)
    log.length = 0;
    await publishFacebook(meta, 'Post', blobs(images, alts));
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 3);
    assert.deepEqual(log.filter((l) => l.path.endsWith('/photos')).map((l) => l.form.alt_text_custom).sort(), [...alts].sort());
    assert.equal(Object.keys(log.find((l) => l.path.endsWith('/feed')).form).filter((k) => k.startsWith('attached_media')).length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Instagram : post bien publié malgré une réponse en erreur (blocage d\'activité) compté comme publié', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  const { publishInstagram } = await import('../shared/meta-publish.js');
  const meta = { pageId: 'page8', pageToken: 'jp', igId: 'ig8', igUsername: 'moi' };
  const img = new Blob([Buffer.from(PNG(5), 'base64')], { type: 'image/png' });
  try {
    fakeMeta({ blocked: true });
    assert.deepEqual(await publishInstagram(meta, 'Légende', [img]), { url: 'https://example.test/p/ig', id: 'ig-post' });
    // Conteneur pas encore marqué publié, mais le dernier post du compte porte la légende : publié
    fakeMeta({ blocked: true, lagged: true, caption: 'Légende' });
    assert.deepEqual(await publishInstagram(meta, 'Légende', [img]), { url: 'https://example.test/p/ig', id: 'ig-post' });
    // Rien en ligne (dernier post différent) : l'erreur d'Instagram est bien rendue
    fakeMeta({ blocked: true, lagged: true });
    await assert.rejects(publishInstagram(meta, 'Légende', [img]), /restreignons/);
  } finally { globalThis.fetch = realFetch; }
});

test('Stories Instagram et Facebook : une story par image, dans l\'ordre', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  const { storyInstagram, storyFacebook } = await import('../shared/meta-publish.js');
  const meta = { pageId: 'page9', pageToken: 'jp', igId: 'ig9', igUsername: 'moi' };
  const imgs = [7, 8, 9].map((k) => new Blob([Buffer.from(PNG(k), 'base64')], { type: 'image/png' }));
  try {
    const { log } = fakeMeta();
    const ig = await storyInstagram(meta, imgs);
    assert.equal(ig.count, 3);
    assert.equal(ig.url, 'https://www.instagram.com/stories/moi/');
    const stories = log.filter((l) => l.form.media_type === 'STORIES');
    assert.equal(stories.length, 3);
    // Ordre gardé : 1re story = 1re image déposée
    const hosted = log.filter((l) => l.path.endsWith('/photos')).length;
    assert.equal(hosted, 3);
    assert.equal(new Set(stories.map((l) => l.form.image_url)).size, 3);
    assert.equal(log.filter((l) => l.path.endsWith('/media_publish')).length, 3);
    log.length = 0;
    const fb = await storyFacebook(meta, imgs);
    assert.equal(fb.count, 3);
    // Photos redéposées (non publiées), puis une story par photo
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 3);
    assert.equal(log.filter((l) => l.path.endsWith('/photo_stories')).length, 3);
    assert.ok(log.filter((l) => l.path.endsWith('/photo_stories')).every((l) => /^ph\d+$/.test(l.form.photo_id)));
  } finally { globalThis.fetch = realFetch; }
});

test('Threads et Instagram : image refusée par le réseau, message clair', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  const meta = { pageId: 'page2', pageToken: 'jp', igId: 'ig1' };
  try {
    fakeMeta({ errorOn: 'c5' });   // 3 dépôts (ph1-3), 1re image c4, 2e image c5
    await assert.rejects(publishThreads({ token: 'jt', userId: 'th1' }, meta, 'x', blobs([PNG(4), PNG(5), PNG(6)])), /Image 2 refusé : Image illisible/);
    fakeMeta({ errorOn: 'c2' });   // images déjà déposées : 1re image c1, 2e image c2
    await assert.rejects(publishInstagram(meta, 'x', blobs([PNG(4), PNG(5), PNG(6)])), /Image 2 refusé : Error: Media download has failed/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Bluesky : images, liens et hashtags cliquables, lien de l\'article en réponse', async () => {
  const realFetch = globalThis.fetch;
  const records = [];
  const uploads = [];
  globalThis.fetch = async (url, opts = {}) => {
    const m = String(url).split('/xrpc/')[1];
    const ok = (d) => ({ ok: true, status: 200, json: async () => d });
    if (m === 'com.atproto.server.createSession') {
      const b = JSON.parse(opts.body);
      if (b.password !== 'mdp-app') return { ok: false, status: 401, json: async () => ({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }) };
      return ok({ accessJwt: 'jwt', did: 'did:plc:moi', handle: 'moi.bsky.social' });
    }
    if (m === 'com.atproto.repo.uploadBlob') { uploads.push(opts.headers['Content-Type']); return ok({ blob: { $type: 'blob', ref: { $link: `b${uploads.length}` }, mimeType: 'image/jpeg', size: 10 } }); }
    if (m === 'com.atproto.repo.createRecord') { const b = JSON.parse(opts.body); records.push(b.record); return ok({ uri: `at://did:plc:moi/app.bsky.feed.post/r${records.length}`, cid: `c${records.length}` }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    await assert.rejects(saveAccount('bluesky', { handle: 'moi.bsky.social', appPassword: 'faux' }), /Invalid identifier/);
    await saveAccount('bluesky', { handle: '@moi.bsky.social', appPassword: 'mdp-app' });
    assert.equal(accountsInfo().bluesky.name, '@moi.bsky.social');
    const acc = getConfig().social.bluesky;
    const jpeg = { blob: new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' }), width: 1080, height: 1350, alt: '' };
    const r = await withComment(() => publishBluesky(acc, 'TRANSFERT | Titre #F1 #BenjyPaddock', [jpeg, jpeg]), "Lire l'article : https://a.test/x", (id, t) => replyBluesky(acc, id, t));
    assert.equal(r.url, 'https://bsky.app/profile/moi.bsky.social/post/r1');
    assert.equal(r.comment, true);
    assert.deepEqual(uploads, ['image/jpeg', 'image/jpeg']);
    assert.equal(records[0].embed.images.length, 2);
    assert.deepEqual(records[0].embed.images[0].aspectRatio, { width: 1080, height: 1350 });
    assert.deepEqual(records[0].facets.map((f) => f.features[0].tag), ['F1', 'BenjyPaddock']);
    assert.deepEqual(records[1].reply.parent, { uri: 'at://did:plc:moi/app.bsky.feed.post/r1', cid: 'c1' });
    assert.equal(records[1].facets[0].features[0].uri, 'https://a.test/x');
    // Mot de passe jamais renvoyé à l'interface
    assert.ok(!JSON.stringify(accountsInfo()).includes('mdp-app'));
  } finally { globalThis.fetch = realFetch; }
});

test('Threads : post vérifié visible publiquement (page lue comme un aperçu de lien)', async () => {
  const { threadsVisible } = await import('../shared/meta-publish.js');
  const real = globalThis.fetch;
  const page = (title) => new Response(`<head><meta property="og:title" content="${title}" /></head>`, { status: 200 });
  try {
    let agent = '';
    globalThis.fetch = async (u, o) => { agent = o.headers['user-agent']; return page('Paddock Live (&#064;paddocklive) on Threads'); };
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0]), true);
    assert.match(agent, /facebookexternalhit/);
    // Page de connexion à chaque essai : caché ; visible au 2e essai : visible
    globalThis.fetch = async () => page('Threads &#x2022; Log in');
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0, 0]), false);
    let n = 0;
    globalThis.fetch = async () => page(++n < 2 ? 'Threads &#x2022; Log in' : 'Paddock Live (&#064;paddocklive) on Threads');
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0, 0]), true);
    // Page illisible : on ne sait pas
    globalThis.fetch = async () => { throw new Error('réseau'); };
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0]), null);
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', []), null);
  } finally { globalThis.fetch = real; }
});

test('TikTok : clés vérifiées à l\'enregistrement, connexion effacée si l\'app change', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const b = new URLSearchParams(String(opts.body));
    assert.equal(String(url), 'https://open.tiktokapis.com/v2/oauth/token/');
    assert.equal(b.get('grant_type'), 'client_credentials');
    // TikTok refuse « …;charset=UTF-8 » (invalid_request)
    assert.equal(opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const d = b.get('client_secret') === 'bon' ? { access_token: 'clt', expires_in: 7200 } : { error: 'invalid_client', error_description: 'Client key or secret is incorrect.' };
    return { ok: !d.error, status: d.error ? 401 : 200, text: async () => JSON.stringify(d) };
  };
  try {
    await assert.rejects(saveAccount('tiktok', { clientKey: 'cle', clientSecret: 'faux' }), /Clés refusées par TikTok/);
    assert.equal(accountsInfo().tiktok.configured, false);
    await saveAccount('tiktok', { clientKey: 'cle', clientSecret: 'bon' });
    assert.deepEqual(accountsInfo().tiktok, { connected: false, name: '', configured: true, direct: false, stats: false });
    // Compte connecté puis clés d'une autre app : il faut se reconnecter
    const { getConfig } = await import('../server/config.js');
    saveConfig({ social: { ...getConfig().social, tiktok: { ...getConfig().social.tiktok, refreshToken: 'r', name: 'Moi' } } });
    await saveAccount('tiktok', { clientKey: 'cle', clientSecret: 'bon' });
    assert.equal(accountsInfo().tiktok.connected, true);
    await saveAccount('tiktok', { clientKey: 'autre', clientSecret: 'bon' });
    assert.equal(accountsInfo().tiktok.connected, false);
    // Publication directe : autorisation video.publish demandée seulement si elle est cochée
    assert.equal(new URL(tiktokLoginUrl('http://127.0.0.1:4321')).searchParams.get('scope'), 'user.info.basic,video.upload');
    await saveAccount('tiktok', { clientKey: 'autre', clientSecret: 'bon', direct: true });
    assert.equal(accountsInfo().tiktok.direct, true);
    assert.equal(new URL(tiktokLoginUrl('http://127.0.0.1:4321')).searchParams.get('scope'), 'user.info.basic,video.upload,video.publish');
    // Statistiques : profil, chiffres et liste des vidéos seulement si c'est coché
    await saveAccount('tiktok', { clientKey: 'autre', clientSecret: 'bon', stats: true });
    assert.equal(accountsInfo().tiktok.stats, true);
    assert.equal(new URL(tiktokLoginUrl('http://127.0.0.1:4321')).searchParams.get('scope'), 'user.info.basic,video.upload,user.info.profile,user.info.stats,video.list');
  } finally { globalThis.fetch = realFetch; }
});

test('TikTok : deuxième compte relié pour ses statistiques, sans toucher au premier', async () => {
  const realFetch = globalThis.fetch;
  const { getConfig } = await import('../server/config.js');
  const first = getConfig().social.tiktok;
  const login = new URL(tiktokLoginUrl('http://127.0.0.1:4321', true));
  assert.equal(login.searchParams.get('scope'), 'user.info.basic,user.info.profile,user.info.stats,video.list');
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const d = u.endsWith('/oauth/token/') ? (assert.equal(new URLSearchParams(String(opts.body)).get('grant_type'), 'authorization_code'), { access_token: 'a2', expires_in: 86400, refresh_token: 'r2', open_id: 'o2' })
      : { data: { user: { display_name: 'Paddock Live', username: 'paddockliveapp' } }, error: { code: 'ok' } };
    return { ok: true, status: 200, text: async () => JSON.stringify(d) };
  };
  try {
    await tiktokCallback(new URLSearchParams({ state: login.searchParams.get('state'), code: 'c' }));
    assert.deepEqual(accountsInfo().tiktok2, { connected: true, name: '@paddockliveapp', configured: true });
    assert.equal(getConfig().social.tiktok2.clientKey, first.clientKey);   // renouvelé avec les clés de l'app
    assert.deepEqual(getConfig().social.tiktok, first);
    await saveAccount('tiktok2', { remove: true });
    assert.equal(accountsInfo().tiktok2.connected, false);
  } finally { globalThis.fetch = realFetch; }
});

test('YouTube : titre et description du Short (1re ligne, 100 caractères, sans chevrons, #Shorts)', () => {
  const s = youtubeSnippet(`${'A'.repeat(120)}\nLigne <deux>\n\n#F1`);
  assert.equal(s.title, 'A'.repeat(100));
  assert.equal(s.description, 'Ligne deux\n\n#F1\n\n#Shorts');
  assert.equal(youtubeSnippet('Titre #Shorts').description, '');
  assert.equal(youtubeSnippet('').title, 'Paddock');
});

test('YouTube : connexion Google (PKCE), Short envoyé en privé', async () => {
  const realFetch = globalThis.fetch;
  await assert.rejects(saveAccount('youtube', { clientId: 'abc', clientSecret: 's' }), /apps\.googleusercontent\.com/);
  await saveAccount('youtube', { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'secret-g' });
  assert.deepEqual(accountsInfo().youtube, { connected: false, name: '', configured: true });
  const login = new URL(youtubeLoginUrl('http://127.0.0.1:4321'));
  assert.equal(login.origin + login.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(login.searchParams.get('redirect_uri'), 'http://127.0.0.1:4321/youtube-callback/');
  assert.equal(login.searchParams.get('code_challenge_method'), 'S256');
  assert.match(login.searchParams.get('code_challenge'), /^[\w-]{43}$/);
  assert.match(login.searchParams.get('scope'), /youtube\.upload/);
  assert.equal(login.searchParams.get('access_type'), 'offline');
  const log = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    log.push({ u, opts });
    const json = (d, status = 200, headers = {}) => ({ ok: status < 300, status, headers: new Headers(headers), text: async () => JSON.stringify(d), json: async () => d });
    if (u === 'https://oauth2.googleapis.com/token') {
      const b = new URLSearchParams(String(opts.body));
      assert.equal(b.get('client_secret'), 'secret-g');
      if (b.get('grant_type') === 'authorization_code') {
        assert.equal(b.get('redirect_uri'), 'http://127.0.0.1:4321/youtube-callback/');
        assert.ok(b.get('code_verifier'));
        return json({ access_token: 'at1', expires_in: 3599, refresh_token: 'rt1' });
      }
      throw new Error('jeton déjà valable : pas de renouvellement attendu');
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/channels')) return json({ items: [{ snippet: { title: 'Benjy Paddock' } }] });
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      const meta = JSON.parse(opts.body);
      assert.equal(meta.status.privacyStatus, 'private');
      assert.equal(meta.snippet.title, 'Verstappen gagne');
      assert.equal(opts.headers['X-Upload-Content-Length'], '4');
      return json({}, 200, { location: 'https://upload.test/session1' });
    }
    if (u === 'https://upload.test/session1') {
      assert.equal(opts.method, 'PUT');
      assert.equal(opts.body.length, 4);
      return json({ id: 'vid42' });
    }
    throw new Error(`inattendu : ${u}`);
  };
  try {
    // Retour d'une autre demande (ou d'une demande TikTok) : refusé
    await assert.rejects(youtubeCallback(new URLSearchParams({ state: 'inconnu', code: 'c' })), /expirée/);
    await youtubeCallback(new URLSearchParams({ state: login.searchParams.get('state'), code: 'c' }));
    assert.deepEqual(accountsInfo().youtube, { connected: true, name: 'Benjy Paddock', configured: true });
    assert.ok(!JSON.stringify(accountsInfo()).includes('rt1'));
    const r = await youtubeUpload(getConfig().social.youtube.accessToken, Buffer.from('abcd'), 'video/mp4', 'Verstappen gagne\nLe récap');
    assert.equal(r.url, 'https://youtube.com/shorts/vid42');
    assert.match(r.note, /privé/);
  } finally { globalThis.fetch = realFetch; }
});

test('vidéo du créateur : Reel et Story Instagram envoyés tels quels, vidéo Threads par son adresse, vidéo et story Facebook', async () => {
  const realFetch = globalThis.fetch;
  const { publishFacebookVideo, publishThreadsVideo, reelInstagram, storyVideoInstagram, storyVideoFacebook } = await import('../shared/meta-publish.js');
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [], threadsVideo: [1, 1, 1] });
  const meta = { pageId: 'page1', pageToken: 'jp', igId: 'ig1', igUsername: 'moi' };
  const log = [];
  let checks = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const form = opts.body instanceof FormData ? Object.fromEntries([...opts.body].map(([k, v]) => [k, typeof v === 'string' ? v : `<${v.type}>`]))
      : opts.body && !(opts.body instanceof Blob) ? Object.fromEntries(new URLSearchParams(String(opts.body))) : {};
    log.push({ host: u.hostname, path: u.pathname, form, query: Object.fromEntries(u.searchParams), headers: opts.headers, body: opts.body });
    const j = (o) => new Response(JSON.stringify(o));
    if (u.pathname.endsWith('/page1/video_stories')) return j(form.upload_phase === 'start' ? { video_id: 's1', upload_url: 'https://rupload.facebook.com/video-upload/v21.0/s1' } : { success: true, post_id: 'sp1' });
    if (u.hostname === 'rupload.facebook.com') return j({ success: true });
    if (u.pathname.endsWith('/page1/videos')) return j({ id: 'vid2' });
    if (u.pathname.endsWith('/ig1/media')) return j({ id: 'c1', uri: 'https://rupload.facebook.com/ig-api-upload/v25.0/c1' });
    if (u.pathname.endsWith('/threads')) return j({ id: 'c1' });
    if (u.pathname.endsWith('/c1')) return j(++checks < 2 ? { status_code: 'IN_PROGRESS' } : { status_code: 'FINISHED', status: 'FINISHED' });
    if (u.pathname.endsWith('/media_publish') || u.pathname.endsWith('/threads_publish')) return j({ id: 'p1' });
    if (u.pathname.endsWith('/p1')) return j({ permalink: 'https://example.test/p/1' });
    return j({});
  };
  try {
    const video = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3])], { type: 'video/mp4' });
    // Reel : conteneur « resumable », fichier envoyé à Instagram (aucune adresse à aller chercher), attendu, publié
    const reel = await reelInstagram(meta, video, 'Légende');
    assert.equal(reel.url, 'https://example.test/p/1');
    const c = log.find((l) => l.path.endsWith('/ig1/media')).form;
    assert.deepEqual([c.media_type, c.upload_type, c.caption, c.video_url], ['REELS', 'resumable', 'Légende', undefined]);
    const up = log.find((l) => l.host === 'rupload.facebook.com');
    assert.equal(up.path, '/ig-api-upload/v25.0/c1');
    assert.deepEqual([up.headers.Authorization, up.headers.offset, up.headers.file_size, up.body], ['OAuth jp', '0', String(video.size), video]);
    assert.ok(log.findIndex((l) => l.path.endsWith('/media_publish')) > log.findLastIndex((l) => l.path.endsWith('/c1') && l.query.fields));
    assert.equal(log.filter((l) => l.path.endsWith('/videos')).length, 0, 'rien de déposé sur la page Facebook');
    // Envoi du fichier refusé : la raison d'Instagram (debug_info) est montrée
    const ok = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(url);
      if (u.hostname === 'rupload.facebook.com') return new Response(JSON.stringify({ debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Request processing failed' } }), { status: 400 });
      if (u.searchParams.get('fields') === 'status,status_code,video_status') return new Response(JSON.stringify({ status: 'Error', status_code: 'ERROR', video_status: { uploading_phase: { status: 'error', error: { message: 'File not found' } } } }));
      return ok(url, opts);
    };
    await assert.rejects(reelInstagram(meta, video, 'Légende'), /Envoi de la vidéo à Instagram refusé : Request processing failed \(Error ; File not found\)/);
    // Envoi refusé mais vidéo reçue, encore en traitement : attendue puis publiée (pas d'erreur, pas de second essai)
    let busy = 0;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(url);
      if (u.hostname === 'rupload.facebook.com') return new Response(JSON.stringify({ debug_info: { message: 'Request processing failed' } }), { status: 400 });
      if (u.pathname.endsWith('/c1') && u.searchParams.get('fields') === 'status,status_code,video_status') { busy++; return new Response(JSON.stringify({ status: 'In Progress: Media is still being processed.', status_code: 'IN_PROGRESS', video_status: { uploading_phase: { status: 'complete' } } })); }
      return ok(url, opts);
    };
    const late = await reelInstagram(meta, video, 'Légende', 'https://img.test/cover.jpg');
    assert.deepEqual([late.url, late.note, busy], ['https://example.test/p/1', undefined, 1]);
    // Refus avec la couverture : un second essai sans elle, publié avec une note
    let tries = 0;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(url);
      if (u.hostname === 'rupload.facebook.com' && !tries++) return new Response(JSON.stringify({ debug_info: { message: 'Request processing failed' } }), { status: 400 });
      if (u.searchParams.get('fields') === 'status,status_code,video_status') return new Response(JSON.stringify({ status_code: 'ERROR' }));
      return ok(url, opts);
    };
    log.length = 0;
    const again = await reelInstagram(meta, video, 'Légende', 'https://img.test/cover.jpg');
    assert.equal(again.url, 'https://example.test/p/1');
    assert.match(again.note, /Couverture refusée par Instagram/);
    assert.deepEqual(log.filter((l) => l.path.endsWith('/ig1/media')).map((l) => l.form.cover_url), ['https://img.test/cover.jpg', undefined]);
    globalThis.fetch = ok;
    // Couverture : adresse publique pour le Reel
    await reelInstagram(meta, video, 'Légende', 'https://img.test/cover.jpg');
    assert.equal(log.findLast((l) => l.path.endsWith('/ig1/media')).form.cover_url, 'https://img.test/cover.jpg');
    // Publication refusée mais Reel en ligne quand même : repris sans erreur (« Réessayer » ne le republie pas)
    let refused = false;
    globalThis.fetch = async (url, opts = {}) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/media_publish')) { refused = true; return new Response(JSON.stringify({ error: { code: 368, error_user_msg: 'Nous restreignons certaines activités afin de protéger notre communauté.' } }), { status: 400 }); }
      if (refused && u.pathname.endsWith('/c1')) return new Response(JSON.stringify({ status_code: 'PUBLISHED' }));
      if (u.pathname.endsWith('/ig1/media') && opts.method !== 'POST') return new Response(JSON.stringify({ data: [{ id: 'r9', permalink: 'https://example.test/reel/9', caption: 'Légende', timestamp: new Date().toISOString() }] }));
      return ok(url, opts);
    };
    assert.deepEqual(await reelInstagram(meta, video, 'Légende'), { url: 'https://example.test/reel/9', id: 'r9' });
    globalThis.fetch = ok;
    // Threads : lit la vidéo à l'adresse donnée
    const th = await publishThreadsVideo({ token: 'jt', userId: 'th1', username: 'moi' }, 'https://video.test/v.mp4', 'Texte');
    assert.equal(th.url, 'https://example.test/p/1');
    const tc = log.find((l) => l.path.endsWith('/th1/threads')).form;
    assert.deepEqual([tc.media_type, tc.video_url, tc.text, tc.topic_tag], ['VIDEO', 'https://video.test/v.mp4', 'Texte', 'F1 Threads']);
    // Publication refusée (vidéo pas encore tout à fait prête) : nouvel essai ; refus à chaque fois : étape nommée
    const th2 = { token: 'jt', userId: 'th1', username: 'moi' };
    const base = globalThis.fetch;
    let refusals = 1;
    const refuse = async (url, opts) => (new URL(url).pathname.endsWith('/threads_publish') && refusals-- > 0 ? new Response(JSON.stringify({ error: { message: 'An unexpected error has occurred. Please retry your request later.' } }), { status: 500 }) : base(url, opts));
    globalThis.fetch = refuse;
    assert.equal((await publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte')).url, 'https://example.test/p/1');
    refusals = 9;
    await assert.rejects(publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte'), /^Error: Publication sur Threads refusée : An unexpected error.*\(aussi sans le sujet « F1 Threads »\)$/);
    // Refusée avec le sujet « F1 Threads » (3 essais) : nouveau post sans lui, publié avec une note
    refusals = 3;
    log.length = 0;
    const plain = await publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte');
    assert.equal(plain.url, 'https://example.test/p/1');
    assert.match(plain.note, /^Publié sans le sujet « F1 Threads »/);
    assert.deepEqual(log.filter((l) => l.path.endsWith('/th1/threads')).map((l) => l.form.topic_tag), ['F1 Threads', undefined]);
    // Sujet choisi (« . » et « & » retirés) ; vide : aucun sujet, et pas de second essai
    refusals = 0;
    log.length = 0;
    await publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte', 'Formule 1 & GP.');
    assert.equal(log.find((l) => l.path.endsWith('/th1/threads')).form.topic_tag, 'Formule 1 GP');
    refusals = 9;
    log.length = 0;
    await assert.rejects(publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte', ''), /^Error: Publication sur Threads refusée : An unexpected error has occurred\. Please retry your request later\.$/);
    assert.deepEqual(log.filter((l) => l.path.endsWith('/th1/threads')).map((l) => l.form.topic_tag), [undefined]);
    // Refus, mais le post est parti (conteneur « PUBLISHED ») : compté comme publié, sans nouvel essai
    refusals = 9;
    globalThis.fetch = async (url, opts) => (new URL(url).pathname.endsWith('/c1') && new URL(url).searchParams.get('fields') === 'status,error_message' && refusals < 9 ? new Response(JSON.stringify({ status: 'PUBLISHED' })) : refuse(url, opts));
    assert.deepEqual(await publishThreadsVideo(th2, 'https://video.test/v.mp4', 'Texte'), { url: 'https://www.threads.net/@moi', id: null });
    assert.equal(refusals, 8);
    globalThis.fetch = base;
    // Facebook : vidéo publiée avec le texte ; couverture jointe
    const fb = await publishFacebookVideo(meta, 'Post', video);
    assert.equal(fb.url, 'https://www.facebook.com/page1/videos/vid2');
    const pub = log.findLast((l) => l.path.endsWith('/page1/videos')).form;
    assert.deepEqual([pub.published, pub.description, pub.source], ['true', 'Post', '<video/mp4>']);
    assert.equal(pub.thumb, undefined);
    await publishFacebookVideo(meta, 'Post', video, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
    assert.equal(log.findLast((l) => l.path.endsWith('/page1/videos')).form.thumb, '<image/jpeg>');
    // Story vidéo : Instagram reçoit le fichier aussi, Facebook en trois temps
    log.length = 0;
    assert.equal((await storyVideoInstagram(meta, video)).count, 1);
    const st = log.find((l) => l.path.endsWith('/ig1/media')).form;
    assert.deepEqual([st.media_type, st.upload_type], ['STORIES', 'resumable']);
    assert.equal(log.find((l) => l.host === 'rupload.facebook.com').body, video);
    assert.ok(log.some((l) => l.path.endsWith('/ig1/media_publish')));
    log.length = 0;
    assert.equal((await storyVideoFacebook(meta, video)).count, 1);
    assert.deepEqual(log.map((l) => l.form.upload_phase || l.host), ['start', 'rupload.facebook.com', 'finish']);
    assert.deepEqual([log[1].headers.Authorization, log[1].headers.offset, log[1].headers.file_size, log[1].body], ['OAuth jp', '0', String(video.size), video]);
    assert.equal(log[2].form.video_id, 's1');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Facebook : connexion par Facebook Login, retour par la page du site, jeton de la page enregistré', async () => {
  const realFetch = globalThis.fetch;
  const { getConfig } = await import('../server/config.js');
  assert.throws(() => metaLoginUrl(4321, {}), /identifiant et la clé secrète/);
  // Configuration « Facebook Login for Business » : ses autorisations à la place de la liste
  let u = new URL(metaLoginUrl(4321, { appId: '123456789', appSecret: 's3cret', configId: '987654321' }));
  assert.equal(u.origin + u.pathname, 'https://www.facebook.com/v25.0/dialog/oauth');
  assert.equal(u.searchParams.get('config_id'), '987654321');
  assert.equal(u.searchParams.get('scope'), null);
  assert.equal(u.searchParams.get('redirect_uri'), META_REDIRECT);
  assert.match(u.searchParams.get('state'), /^4321\.[0-9a-f]{32}$/);
  assert.ok(!u.toString().includes('s3cret'));
  u = new URL(metaLoginUrl(4321, { appId: '123456789', appSecret: 's3cret' }));
  assert.match(u.searchParams.get('scope'), /instagram_content_publish/);
  const calls = [];
  globalThis.fetch = async (url) => {
    const x = new URL(url);
    calls.push(x.pathname + (x.searchParams.get('grant_type') ? `:${x.searchParams.get('grant_type')}` : ''));
    const d = x.pathname.endsWith('/oauth/access_token') && x.searchParams.get('code') ? (assert.equal(x.searchParams.get('redirect_uri'), META_REDIRECT), assert.equal(x.searchParams.get('client_secret'), 's3cret'), { access_token: 'court' })
      : x.pathname.endsWith('/oauth/access_token') ? (assert.equal(x.searchParams.get('fb_exchange_token'), 'court'), { access_token: 'long' })
      : { data: [{ id: 'p1', name: 'Paddock Live', access_token: 'jeton-page', instagram_business_account: { id: 'ig1', username: 'paddocklive' } }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(d) };
  };
  try {
    await metaCallback(new URLSearchParams({ state: u.searchParams.get('state'), code: 'c' }));
    assert.deepEqual(calls, ['/v25.0/oauth/access_token', '/v25.0/oauth/access_token:fb_exchange_token', '/v25.0/me/accounts']);
    assert.equal(getConfig().social.meta.pageToken, 'jeton-page');
    assert.equal(accountsInfo().instagram.name, '@paddocklive');
    // Demande déjà utilisée ou refusée dans Facebook : message clair
    await assert.rejects(metaCallback(new URLSearchParams({ state: u.searchParams.get('state'), code: 'c' })), /expirée/);
    const v = new URL(metaLoginUrl(4321, {}));   // identifiants déjà enregistrés
    await assert.rejects(metaCallback(new URLSearchParams({ state: v.searchParams.get('state'), error: 'access_denied', error_reason: 'user_denied' })), /refusée/);
  } finally { globalThis.fetch = realFetch; }
});

test('TikTok : publication directe refusée avant l\'audit, message qui dit quoi faire', async () => {
  const { tiktokDirect } = await import('../shared/video-publish.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines at https://developers.tiktok.com/doc/content-sharing-guidelines/' } }) });
  try {
    await assert.rejects(tiktokDirect('jeton', new Uint8Array(10), 'video/mp4', { title: 't', privacy: 'PUBLIC_TO_EVERYONE' }), /pas encore auditée.*Brouillon/);
  } finally { globalThis.fetch = realFetch; }
});
