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
    if (u.pathname.endsWith('/vid2') && f) return ok({ reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } } });
    if (u.pathname.endsWith('/vid2/video_insights')) return ok({ data: [{ name: 'total_video_views', values: [{ value: 900 }] }, { name: 'total_video_views_unique', values: [{ value: 640 }] }] });
    if (u.hostname === 'www.googleapis.com' && u.searchParams.get('id') === 'yt1') return ok({ items: [{ statistics: { viewCount: '150', likeCount: '9', commentCount: '2' } }] });
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
    // Vidéo de la page Facebook (video_insights), Short YouTube (jeton donné), TikTok : chiffres dans l'appli TikTok
    const vid = await postStats([{ key: 'v', at: 4, nets: { facebook: { id: 'vid2', url: 'https://www.facebook.com/page1/videos/vid2' }, youtube: { id: 'yt1' }, tiktok: { id: null, url: null } } }], { meta: { pageToken: 't' }, youtubeToken: 'ya' });
    assert.deepEqual(vid.posts[0].stats.facebook, { views: 900, reach: 640, likes: 12, comments: 3 });
    assert.deepEqual(vid.posts[0].stats.youtube, { views: 150, likes: 9, comments: 2 });
    assert.equal(vid.posts[0].stats.tiktok.note, 'Chiffres dans l\'appli TikTok');
    // Refusé partout : raison du réseau gardée, avec un message lisible
    const gone = await postStats([{ key: 'c', at: 3, nets: { instagram: { id: 'zz' }, threads: { id: 'zz' } } }], { meta: { pageToken: 't' }, threads: { token: 'u' } });
    assert.deepEqual(gone.posts[0].stats.instagram, { error: '(#10) Application does not have permission', note: 'Autorisation manquante : reconnectez le compte' });
    assert.deepEqual(gone.posts[0].stats.threads, { error: '(#10) Application does not have permission', note: 'Autorisation manquante : reconnectez le compte' });
  } finally { globalThis.fetch = realFetch; }
});

test('créneau conseillé : tranche horaire dont les posts ont le plus de réactions (heure de Paris)', async () => {
  const { bestSlot } = await import('../shared/post-history.js');
  const at = (h, day) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(h - 2).padStart(2, '0')}:30:00Z`);   // heure d'été : UTC+2
  const post = (h, day, likes) => ({ at: at(h, day), stats: { instagram: { likes, comments: 0 } } });
  const evening = [1, 2, 3, 4].map((d) => post(19, d, 100));
  const morning = [5, 6, 7, 8].map((d) => post(10, d, 20));
  assert.deepEqual(bestSlot([...evening, ...morning]), { from: 18, to: 21, n: 8, ratio: 1.7 });
  assert.equal(bestSlot(evening), null, 'trop peu de posts');
  assert.equal(bestSlot([...[1, 2, 3, 4].map((d) => post(19, d, 50)), ...[5, 6, 7, 8].map((d) => post(10, d, 50))]), null, 'pas d\'écart');
});

test('plan du week-end : posts faits d\'après le journal (séances et posts de la saison)', async () => {
  const { weekendPlan } = await import('../shared/post-history.js');
  const race = { round: 19, name: 'United States Grand Prix', date: '2026-10-25T19:00:00Z', sprint: true,
    sessions: [{ label: 'Sprint', t: '2026-10-24T17:00:00Z' }, { label: 'Qualifications', t: '2026-10-24T21:00:00Z' }] };
  const keys = ['raceweek:2026-19', 'session:2026/2026-10-25_United_States_Grand_Prix/2026-10-24_Sprint_Qualifying/', 'session:2026/2026-10-25_United_States_Grand_Prix/2026-10-25_Race/~k1', 'ratings:2026-18'];
  const plan = weekendPlan(race, 2026, keys);
  assert.deepEqual(plan.map((p) => [p.label, p.done]), [['Race Week', true], ['Programme du week-end', false], ['Résultats du sprint', false],
    ['Grille (qualifications)', false], ['Résultats de la course', true], ['Notes des pilotes', false], ['Course au titre', false]]);
  assert.equal(new Date(plan[0].at).toISOString(), '2026-10-19T08:00:00.000Z');   // lundi de la semaine
});

test('chiffres gardés : les posts relus remplacent les anciens, 60 au plus, les plus récents d\'abord', async () => {
  const { keepStats } = await import('../shared/post-history.js');
  const old = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}`, at: 1000 + i, stats: { instagram: { likes: i } } }));
  const kept = keepStats(old, [{ key: 'k59', at: 1059, stats: { instagram: { likes: 99 } } }, { key: 'neuf', at: 2000, stats: { x: { likes: 1 } } }, { key: 'vide', at: 3000, stats: {} }]);
  assert.equal(kept.length, 60);
  assert.deepEqual(kept.slice(0, 2).map((p) => [p.key, Object.values(p.stats)[0].likes]), [['neuf', 1], ['k59', 99]]);
  assert.ok(!kept.some((p) => p.key === 'k0' || p.key === 'vide'));
  assert.deepEqual(keepStats('abîmé', []), []);
});
