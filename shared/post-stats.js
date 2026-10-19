// Statistiques des posts publiés (journal des publications) et abonnés, lues chez chaque réseau :
// Instagram, Facebook et Threads (API de Meta), Bluesky (API publique). X : lecture payante,
// non utilisée (lien seulement). Partagé par l'appli et la page web du créateur. Chaque mesure
// indisponible (permission manquante, post supprimé) est simplement absente.
import { call, GRAPH, THREADS } from './meta-publish.js';

const BSKY = 'https://public.api.bsky.app/xrpc';
const safe = (p) => p.catch(() => null);
// Appel dont l'erreur est gardée (raison affichée quand aucune statistique n'est lisible)
const tryCall = (p, errs) => p.catch((err) => { errs.push(err.message); return null; });
// Raison lisible (note) pour les cas courants, l'erreur du réseau sinon
const NOTES = [
  [/does not exist|cannot be loaded|not found|could not find/i, 'Post supprimé ou introuvable'],
  [/too many subrequests/i, 'Trop de demandes d\'un coup : rechargez dans un instant'],
  [/#190|expired|session has been invalidated|invalid oauth/i, 'Connexion expirée : reconnectez le compte'],
  [/rate limit|request limit|\(#(4|17|32|613)\)/i, 'Limite du réseau atteinte : réessayez plus tard'],
  [/permission|\(#(10|200)\)/i, 'Autorisation manquante : reconnectez le compte'],
];
const unavailable = (errs) => {
  const error = errs[0] || 'refusé par le réseau';
  return { error, note: NOTES.find(([re]) => re.test(error))?.[1] || null };
};
const metric = (r, name) => r?.data?.find((m) => m.name === name)?.values?.[0]?.value ?? r?.data?.find((m) => m.name === name)?.total_value?.value ?? null;

async function instagram(meta, id) {
  const tok = { access_token: meta.pageToken };
  const errs = [];
  const [base, ins] = await Promise.all([
    tryCall(call(`${GRAPH}/${id}?${new URLSearchParams({ fields: 'like_count,comments_count', ...tok })}`), errs),
    tryCall(call(`${GRAPH}/${id}/insights?${new URLSearchParams({ metric: 'reach,saved,shares,views', ...tok })}`), errs),
  ]);
  if (!base && !ins) return unavailable(errs);
  return { likes: base?.like_count ?? null, comments: base?.comments_count ?? null, reach: metric(ins, 'reach'), views: metric(ins, 'views'), shares: metric(ins, 'shares'), saves: metric(ins, 'saved') };
}

// Valeur d'une mesure : nombre, ou total d'un détail (payant / naturel…)
const num = (v) => (v == null ? null : typeof v === 'object' ? Object.values(v).reduce((a, x) => a + (Number(x) || 0), 0) : Number(v));

async function facebook(meta, id) {
  const tok = { access_token: meta.pageToken };
  const errs = [];
  const insights = (metric) => tryCall(call(`${GRAPH}/${id}/insights?${new URLSearchParams({ metric, ...tok })}`), errs);
  // Vues et vues uniques des médias (mesures de Meta depuis la suppression des « impressions »),
  // ancienne mesure seulement si les nouvelles sont refusées
  const [base, now] = await Promise.all([
    tryCall(call(`${GRAPH}/${id}?${new URLSearchParams({ fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares', ...tok })}`), errs),
    insights('post_total_media_view_unique,post_media_view'),
  ]);
  const old = now ? null : await insights('post_impressions_unique');
  if (!base && !now && !old) return unavailable(errs);
  const out = { likes: base?.reactions?.summary?.total_count ?? null, comments: base?.comments?.summary?.total_count ?? null, shares: base?.shares?.count ?? 0, reach: num(metric(now, 'post_total_media_view_unique') ?? metric(old, 'post_impressions_unique')) };
  const views = num(metric(now, 'post_media_view'));
  if (views != null) out.views = views;
  return out;
}

async function threads(th, id) {
  const errs = [];
  const r = await tryCall(call(`${THREADS}/${id}/insights?${new URLSearchParams({ metric: 'views,likes,replies,reposts,quotes', access_token: th.token })}`), errs);
  if (!r) return unavailable(errs);
  return { views: metric(r, 'views'), likes: metric(r, 'likes'), comments: metric(r, 'replies'), shares: (metric(r, 'reposts') ?? 0) + (metric(r, 'quotes') ?? 0) };
}

async function blueskyPosts(uris) {
  const out = {};
  for (let i = 0; i < uris.length; i += 25) {
    const q = new URLSearchParams();
    for (const u of uris.slice(i, i + 25)) q.append('uris', u);
    const r = await safe(fetch(`${BSKY}/app.bsky.feed.getPosts?${q}`, { signal: AbortSignal.timeout(15000) }).then((x) => (x.ok ? x.json() : null)));
    for (const p of r?.posts || []) out[p.uri] = { likes: p.likeCount ?? 0, comments: p.replyCount ?? 0, shares: (p.repostCount ?? 0) + (p.quoteCount ?? 0) };
  }
  return out;
}

// Abonnés de chaque compte
export async function followers(acc) {
  const out = {};
  const m = acc.meta;
  const jobs = [];
  if (m?.igId) jobs.push(safe(call(`${GRAPH}/${m.igId}?${new URLSearchParams({ fields: 'followers_count', access_token: m.pageToken })}`)).then((r) => { if (r) out.instagram = r.followers_count ?? null; }));
  if (m?.pageId) jobs.push(safe(call(`${GRAPH}/${m.pageId}?${new URLSearchParams({ fields: 'followers_count,fan_count', access_token: m.pageToken })}`)).then((r) => { if (r) out.facebook = r.followers_count ?? r.fan_count ?? null; }));
  if (acc.threads?.token) jobs.push(safe(call(`${THREADS}/me/threads_insights?${new URLSearchParams({ metric: 'followers_count', access_token: acc.threads.token })}`)).then((r) => { const v = metric(r, 'followers_count'); if (v != null) out.threads = v; }));
  if (acc.bluesky?.handle) jobs.push(safe(fetch(`${BSKY}/app.bsky.actor.getProfile?actor=${encodeURIComponent(acc.bluesky.did || acc.bluesky.handle)}`).then((x) => (x.ok ? x.json() : null))).then((r) => { if (r) out.bluesky = r.followersCount ?? null; }));
  await Promise.all(jobs);
  return out;
}

// Statistiques des posts du journal (les plus récents d'abord, 30 au plus) : { posts: [{ …entrée, stats: { réseau: mesures } }], followers }
export async function postStats(history, acc, { limit = 30 } = {}) {
  const list = history.slice(0, limit);
  const bsky = await blueskyPosts(list.map((e) => e.nets?.bluesky?.id?.uri).filter(Boolean));
  const posts = await Promise.all(list.map(async (e) => {
    const stats = {};
    const n = e.nets || {};
    const jobs = [];
    if (n.instagram?.id && acc.meta?.pageToken) jobs.push(instagram(acc.meta, n.instagram.id).then((s) => { stats.instagram = s; }));
    if (n.facebook?.id && acc.meta?.pageToken) jobs.push(facebook(acc.meta, n.facebook.id).then((s) => { stats.facebook = s; }));
    if (n.threads?.id && acc.threads?.token) jobs.push(threads(acc.threads, n.threads.id).then((s) => { stats.threads = s; }));
    if (n.bluesky?.id?.uri) stats.bluesky = bsky[n.bluesky.id.uri] || null;
    await Promise.all(jobs);
    return { ...e, stats };
  }));
  return { posts, followers: await followers(acc) };
}
