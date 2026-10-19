import test from 'node:test';
import assert from 'node:assert/strict';
import { postStats } from '../shared/post-stats.js';

test('statistiques des posts : Instagram, Facebook, Threads, Bluesky et abonnés ; mesures absentes tolérées', async () => {
  const realFetch = globalThis.fetch;
  const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
  const denied = () => new Response(JSON.stringify({ error: { message: '(#10) Application does not have permission' } }), { status: 403 });
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const f = u.searchParams.get('fields');
    const m = u.searchParams.get('metric');
    if (u.pathname.endsWith('/ig17') && f === 'like_count,comments_count') return ok({ like_count: 120, comments_count: 4 });
    if (u.pathname.endsWith('/ig17/insights')) return ok({ data: [{ name: 'reach', values: [{ value: 3400 }] }, { name: 'views', total_value: { value: 5100 } }, { name: 'saved', values: [{ value: 9 }] }] });
    if (u.pathname.endsWith('/p_1') && f) return ok({ reactions: { summary: { total_count: 33 } }, comments: { summary: { total_count: 2 } } });
    if (u.pathname.endsWith('/p_1/insights')) return denied();   // read_insights absente
    if (u.pathname.endsWith('/p_2') && f) return ok({ reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 0 } }, shares: { count: 1 } });
    if (u.pathname.endsWith('/p_2/insights') && m === 'post_total_media_view_unique,post_media_view') return ok({ data: [{ name: 'post_total_media_view_unique', values: [{ value: 240 }] }, { name: 'post_media_view', values: [{ value: { paid: 0, organic: 310 } }] }] });
    if (u.pathname.endsWith('/p_3') && f) return ok({ reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } });
    if (u.pathname.endsWith('/p_3/insights') && m === 'post_impressions_unique') return ok({ data: [{ name: 'post_impressions_unique', values: [{ value: 77 }] }] });   // ancienne version de l'API
    if (u.pathname.endsWith('/th9/insights')) return ok({ data: [{ name: 'views', values: [{ value: 800 }] }, { name: 'likes', values: [{ value: 41 }] }, { name: 'replies', values: [{ value: 3 }] }, { name: 'reposts', values: [{ value: 2 }] }, { name: 'quotes', values: [{ value: 1 }] }] });
    if (u.pathname.endsWith('app.bsky.feed.getPosts')) return ok({ posts: [{ uri: 'at://a/p/1', likeCount: 7, replyCount: 1, repostCount: 2, quoteCount: 0 }] });
    if (u.pathname.endsWith('/igA') && f === 'followers_count') return ok({ followers_count: 1520 });
    if (u.pathname.endsWith('/pageA')) return ok({ followers_count: 300 });
    if (u.pathname.endsWith('/me/threads_insights')) return ok({ data: [{ name: 'followers_count', total_value: { value: 210 } }] });
    if (u.pathname.endsWith('app.bsky.actor.getProfile')) return ok({ followersCount: 55 });
    return denied();
  };
  try {
    const history = [{ key: 'k', at: 1, title: 'Post', nets: { instagram: { id: 'ig17' }, facebook: { id: 'p_1' }, threads: { id: 'th9' }, bluesky: { id: { uri: 'at://a/p/1', cid: 'c' } }, x: { id: '99', url: 'https://x.com/a/status/99' } } }];
    const r = await postStats(history, { meta: { pageToken: 't', pageId: 'pageA', igId: 'igA' }, threads: { token: 'u' }, bluesky: { handle: 'moi.bsky.social' } });
    const s = r.posts[0].stats;
    assert.deepEqual(s.instagram, { likes: 120, comments: 4, reach: 3400, views: 5100, shares: null, saves: 9 });
    assert.deepEqual(s.facebook, { likes: 33, comments: 2, shares: 0, reach: null });
    assert.deepEqual(s.threads, { views: 800, likes: 41, comments: 3, shares: 3 });
    assert.deepEqual(s.bluesky, { likes: 7, comments: 1, shares: 2 });
    assert.equal(s.x, undefined);
    assert.deepEqual(r.followers, { instagram: 1520, facebook: 300, threads: 210, bluesky: 55 });
    // Facebook : vues et vues uniques (nouvelles mesures de Meta), sinon ancienne portée
    const fb = await postStats([{ key: 'a', at: 2, nets: { facebook: { id: 'p_2' } } }, { key: 'b', at: 1, nets: { facebook: { id: 'p_3' } } }], { meta: { pageToken: 't' } });
    assert.deepEqual(fb.posts[0].stats.facebook, { likes: 5, comments: 0, shares: 1, reach: 240, views: 310 });
    assert.deepEqual(fb.posts[1].stats.facebook, { likes: 1, comments: 0, shares: 0, reach: 77 });
    // Refusé partout : raison du réseau gardée, avec un message lisible
    const gone = await postStats([{ key: 'c', at: 3, nets: { instagram: { id: 'zz' }, threads: { id: 'zz' } } }], { meta: { pageToken: 't' }, threads: { token: 'u' } });
    assert.deepEqual(gone.posts[0].stats.instagram, { error: '(#10) Application does not have permission', note: 'Autorisation manquante : reconnectez le compte' });
    assert.deepEqual(gone.posts[0].stats.threads, { error: '(#10) Application does not have permission', note: 'Autorisation manquante : reconnectez le compte' });
  } finally { globalThis.fetch = realFetch; }
});
