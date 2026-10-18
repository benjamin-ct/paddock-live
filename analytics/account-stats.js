// Statistiques des comptes (Studio) : pour chaque compte (Benjy Paddock, Paddock Live, d'après les
// pages de liens) et chaque réseau, abonnés et activité des 28 derniers jours, lus chez les réseaux
// avec les jetons du coffre. Une mesure refusée (permission, compte non relié) est absente, et le
// réseau dit pourquoi. TikTok et X ne donnent pas ces chiffres à l'appli : lien seulement.
import { PAGES } from './links/pages.mjs';
import { call, GRAPH, THREADS } from '../shared/meta-publish.js';
import { YOUTUBE } from '../shared/video-publish.js';

const BSKY = 'https://public.api.bsky.app/xrpc';
const DAYS = 28;
const NETS = ['instagram', 'facebook', 'threads', 'youtube', 'bluesky', 'tiktok', 'x'];
// Comptes suivis : Benjy Paddock puis Paddock Live, identifiants repris des pages de liens
export const ACCOUNTS = ['benjy', 'liens'].map((id) => ({
  name: PAGES[id].name,
  nets: Object.fromEntries(PAGES[id].nets.map(([k, , h, url]) => [k, { handle: h.replace(/^@/, '').toLowerCase(), url }])),
}));

const ok = (r) => r !== null && r !== undefined;
const sum = (list, f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
// Mesure Meta : total sur la période (metric_type=total_value) ou somme des valeurs par jour
const total = (r, name) => {
  const m = r?.data?.find((x) => x.name === name);
  if (!m) return null;
  if (m.total_value?.value != null) return Number(m.total_value.value);
  return m.values?.length ? sum(m.values, (v) => (typeof v.value === 'object' ? Object.values(v.value).reduce((a, x) => a + (Number(x) || 0), 0) : v.value)) : null;
};
const since = (now) => Math.floor((now - DAYS * 86400e3) / 1000);

// Instagram : compte relié (insights complets) ; sinon chiffres publics via « business discovery »
async function instagram(pages, handle, now) {
  const own = pages.find((p) => p.igUsername?.toLowerCase() === handle && p.igId);
  if (own) {
    const tok = { access_token: own.pageToken };
    // Chaque mesure à part : une mesure refusée ne fait pas échouer les autres
    const one = (metric) => call(`${GRAPH}/${own.igId}/insights?${new URLSearchParams({ metric, period: 'day', metric_type: 'total_value', since: since(now), until: Math.floor(now / 1000), ...tok })}`).then((r) => total(r, metric)).catch(() => null);
    const [base, reach, views, profileViews, engaged, interactions] = await Promise.all([
      call(`${GRAPH}/${own.igId}?${new URLSearchParams({ fields: 'followers_count,media_count', ...tok })}`),
      ...['reach', 'views', 'profile_views', 'accounts_engaged', 'total_interactions'].map(one),
    ]);
    return { followers: base.followers_count ?? null, posts: base.media_count ?? null, reach, views, profileViews, engaged, interactions };
  }
  const any = pages.find((p) => p.igId);
  if (!any) throw new Error('compte Instagram non relié');
  const r = await call(`${GRAPH}/${any.igId}?${new URLSearchParams({ fields: `business_discovery.username(${handle}){followers_count,media_count,media.limit(50){like_count,comments_count,timestamp}}`, access_token: any.pageToken })}`);
  const d = r.business_discovery || {};
  const recent = (d.media?.data || []).filter((m) => Date.parse(m.timestamp) > now - DAYS * 86400e3);
  return { followers: d.followers_count ?? null, posts: d.media_count ?? null, likes: sum(recent, (m) => m.like_count), comments: sum(recent, (m) => m.comments_count) };
}

// Facebook : page reliée (abonnés, vues et interactions des 28 derniers jours)
async function facebook(pages, handle) {
  for (const p of pages) {
    const tok = { access_token: p.pageToken };
    const base = await call(`${GRAPH}/${p.pageId}?${new URLSearchParams({ fields: 'username,followers_count,fan_count', ...tok })}`).catch(() => null);
    if (!base || (base.username || '').toLowerCase() !== handle) continue;
    // Chaque mesure à part : une mesure retirée par Meta ne fait pas échouer les autres
    const one = (metric) => call(`${GRAPH}/${p.pageId}/insights?${new URLSearchParams({ metric, period: 'days_28', ...tok })}`).then((r) => r?.data?.[0]?.values?.at(-1)?.value ?? null).catch(() => null);
    const [views, engaged, follows] = await Promise.all(['page_media_view', 'page_post_engagements', 'page_follows'].map(one));
    const n = (v) => (v == null ? null : typeof v === 'object' ? Object.values(v).reduce((a, x) => a + (Number(x) || 0), 0) : Number(v));
    return { followers: base.followers_count ?? base.fan_count ?? null, views: n(views), interactions: n(engaged), newFollowers: n(follows) };
  }
  throw new Error('page non reliée (reconnectez Meta dans l\'appli pour ajouter toutes vos pages)');
}

// Threads : compte relié (vues, j'aime, réponses, partages des 28 derniers jours)
async function threads(th, handle, now) {
  if (!th?.token) throw new Error('compte Threads non relié');
  if ((th.username || '').toLowerCase() !== handle) throw new Error('compte non relié (un seul compte Threads par connexion)');
  const r = await call(`${THREADS}/me/threads_insights?${new URLSearchParams({ metric: 'views,likes,replies,reposts,quotes,followers_count', since: since(now), until: Math.floor(now / 1000), access_token: th.token })}`);
  return { followers: total(r, 'followers_count'), views: total(r, 'views'), likes: total(r, 'likes'), comments: total(r, 'replies'), shares: (total(r, 'reposts') ?? 0) + (total(r, 'quotes') ?? 0) };
}

// YouTube : chaîne retrouvée par son identifiant (abonnés, vues et vidéos depuis la création)
async function youtube(token, handle) {
  if (!token) throw new Error('compte YouTube non relié');
  const r = await call(`${YOUTUBE}/channels?${new URLSearchParams({ part: 'statistics', forHandle: `@${handle}` })}`, { headers: { Authorization: `Bearer ${token}` } });
  const s = r.items?.[0]?.statistics;
  if (!s) throw new Error('chaîne introuvable');
  return { followers: s.hiddenSubscriberCount ? null : Number(s.subscriberCount), totalViews: Number(s.viewCount), posts: Number(s.videoCount) };
}

// Bluesky : profil public et posts des 28 derniers jours (sans connexion)
async function bluesky(handle, now, fetchFn) {
  const get = async (path) => { const r = await fetchFn(`${BSKY}/${path}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const [p, feed] = await Promise.all([get(`app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`), get(`app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=100&filter=posts_no_replies`).catch(() => ({ feed: [] }))]);
  const mine = (feed.feed || []).filter((x) => !x.reason && Date.parse(x.post?.indexedAt) > now - DAYS * 86400e3).map((x) => x.post);
  return { followers: p.followersCount ?? null, posts: p.postsCount ?? null, likes: sum(mine, (x) => x.likeCount), comments: sum(mine, (x) => x.replyCount), shares: sum(mine, (x) => (x.repostCount || 0) + (x.quoteCount || 0)) };
}

// v : coffre ; youtubeToken : jeton YouTube à jour (ou null) -> [{ name, nets: { réseau: { url, handle, stats | error | note } } }]
export async function accountStats(v, { youtubeToken = null, now = Date.now(), fetchFn = fetch } = {}) {
  const pages = v.meta ? [v.meta, ...(v.meta.pages || []).filter((p) => p.pageId !== v.meta.pageId)] : [];
  return Promise.all(ACCOUNTS.map(async (acc) => {
    const nets = {};
    await Promise.all(NETS.filter((n) => acc.nets[n]).map(async (n) => {
      const { handle, url } = acc.nets[n];
      const out = { url, handle };
      try {
        if (n === 'instagram') out.stats = await instagram(pages, handle, now);
        else if (n === 'facebook') out.stats = await facebook(pages, handle);
        else if (n === 'threads') out.stats = await threads(v.threads, handle, now);
        else if (n === 'youtube') out.stats = await youtube(youtubeToken, handle);
        else if (n === 'bluesky') out.stats = await bluesky(handle, now, fetchFn);
        else out.note = n === 'tiktok' ? 'chiffres non fournis par TikTok à l\'appli' : 'chiffres payants chez X';
        if (out.stats) out.stats = Object.fromEntries(Object.entries(out.stats).filter(([, x]) => ok(x) && !Number.isNaN(x)));
      } catch (err) { out.error = String(err?.message || err).slice(0, 160); }
      nets[n] = out;
    }));
    return { name: acc.name, nets: Object.fromEntries(NETS.filter((n) => nets[n]).map((n) => [n, nets[n]])) };
  }));
}
