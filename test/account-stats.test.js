import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStats, ACCOUNTS } from '../analytics/account-stats.js';

test('statistiques des comptes : chaque réseau des deux comptes, mesures refusées signalées', async () => {
  assert.deepEqual(ACCOUNTS.map((a) => a.name), ['Benjy Paddock', 'Paddock Live']);
  assert.equal(ACCOUNTS[1].nets.bluesky.handle, 'paddocklive.app');
  const real = globalThis.fetch;
  const now = Date.parse('2026-10-18T12:00:00Z');
  const j = (o, status = 200) => new Response(JSON.stringify(o), { status });
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const q = u.searchParams;
    if (u.hostname === 'graph.facebook.com') {
      if (u.pathname.endsWith('/ig1/insights')) return q.get('metric') === 'profile_views' ? j({ error: { message: 'refusé' } }, 400) : j({ data: [{ name: q.get('metric'), total_value: { value: 100 } }] });
      if (u.pathname.endsWith('/ig1') && q.get('fields').startsWith('business_discovery')) {
        assert.match(q.get('fields'), /username\(paddockliveapp\)/);
        return j({ business_discovery: { followers_count: 40, media_count: 5, media: { data: [{ like_count: 3, comments_count: 1, timestamp: '2026-10-10T10:00:00+0000' }, { like_count: 9, comments_count: 9, timestamp: '2026-08-01T10:00:00+0000' }] } } });
      }
      if (u.pathname.endsWith('/ig1')) return j({ followers_count: 120, media_count: 12 });
      if (/\/p[12]\/insights$/.test(u.pathname)) return j({ data: [{ name: q.get('metric'), values: [{ value: 7 }] }] });
      if (u.pathname.endsWith('/p1')) return j({ username: 'benjypaddock', followers_count: 30 });
      if (u.pathname.endsWith('/p2')) return j({ username: 'paddockliveapp', followers_count: 55 });
    }
    if (u.hostname === 'graph.threads.net') return j({ data: [{ name: 'views', total_value: { value: 900 } }, { name: 'followers_count', total_value: { value: 20 } }, { name: 'likes', total_value: { value: 15 } }] });
    if (u.hostname === 'www.googleapis.com') return j({ items: [{ statistics: { subscriberCount: q.get('forHandle') === '@benjypaddock' ? '8' : '3', viewCount: '500', videoCount: '4', hiddenSubscriberCount: false } }] });
    if (u.pathname.endsWith('getProfile')) return j({ followersCount: q.get('actor') === 'paddocklive.app' ? 11 : 22, postsCount: 6 });
    if (u.pathname.endsWith('getAuthorFeed')) return j({ feed: [{ post: { indexedAt: '2026-10-15T10:00:00Z', likeCount: 4, replyCount: 1, repostCount: 2, quoteCount: 0 } }, { reason: { $type: 'repost' }, post: { indexedAt: '2026-10-15T10:00:00Z', likeCount: 99 } }] });
    throw new Error(`inattendu : ${url}`);
  };
  try {
    const v = {
      meta: { pageId: 'p1', pageToken: 'tp1', igId: 'ig1', igUsername: 'benjypaddock', pages: [{ pageId: 'p1', pageToken: 'tp1', igId: 'ig1', igUsername: 'benjypaddock' }, { pageId: 'p2', pageToken: 'tp2', igId: '', igUsername: '' }] },
      threads: { token: 'th', username: 'benjypaddock' },
    };
    const [benjy, pl] = await accountStats(v, { youtubeToken: 'yt', now });
    assert.deepEqual(benjy.nets.instagram.stats, { followers: 120, posts: 12, reach: 100, views: 100, engaged: 100, interactions: 100 });
    assert.deepEqual(pl.nets.instagram.stats, { followers: 40, posts: 5, likes: 3, comments: 1 });   // 28 derniers jours seulement
    assert.equal(benjy.nets.facebook.stats.followers, 30);
    assert.equal(pl.nets.facebook.stats.followers, 55);
    assert.equal(pl.nets.facebook.stats.views, 7);
    assert.deepEqual(benjy.nets.threads.stats, { followers: 20, views: 900, likes: 15, shares: 0 });
    assert.match(pl.nets.threads.error, /non relié/);
    assert.equal(benjy.nets.youtube.stats.followers, 8);
    assert.equal(pl.nets.youtube.stats.totalViews, 500);
    assert.deepEqual(pl.nets.bluesky.stats, { followers: 11, posts: 6, likes: 4, comments: 1, shares: 2 });   // repartages exclus
    assert.match(benjy.nets.tiktok.note, /TikTok/);
    assert.equal(benjy.nets.x.url, 'https://x.com/benjypaddock');
    assert.deepEqual(Object.keys(benjy.nets), ['instagram', 'facebook', 'threads', 'youtube', 'bluesky', 'tiktok', 'x']);
  } finally { globalThis.fetch = real; }
});
