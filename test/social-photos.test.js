import { test } from 'node:test';
import assert from 'node:assert/strict';
import { igPhotos, bskyPhotos, socialPhotos, isSocialImageHost, TEAM_INSTAGRAM, LOOK_WORDS } from '../analytics/social-photos.js';

test('photos Instagram d\'une écurie : photos et carrousels récents, sans vidéos', () => {
  const bd = { media: { data: [
    { media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', timestamp: '2026-10-20T10:00:00+0000' },
    { media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/v.mp4', timestamp: '2026-10-20T11:00:00+0000' },
    { media_type: 'CAROUSEL_ALBUM', timestamp: '2026-10-19T10:00:00+0000', children: { data: [
      { media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/b.jpg' }, { media_type: 'VIDEO', media_url: 'https://x/v.mp4' }] } },
    { media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/vieux.jpg', timestamp: '2026-09-01T10:00:00+0000' },
  ] } };
  const out = igPhotos(bd, 'cadillacf1', Date.parse('2026-10-15T00:00:00Z'));
  assert.deepEqual(out.map((p) => p.url.split('/').pop()), ['a.jpg', 'b.jpg']);
  assert.equal(out[0].src, 'Instagram @cadillacf1');
  assert.ok(TEAM_INSTAGRAM.ferrari.length && TEAM_INSTAGRAM.cadillac.length);
  // Livrée : seulement les posts dont la légende en parle
  bd.media.data[0].caption = 'Our special livery for the #USGP';
  bd.media.data[2].caption = 'Fans in Austin';
  assert.deepEqual(igPhotos(bd, 'haasf1team', Date.parse('2026-10-15T00:00:00Z'), LOOK_WORDS.livree).map((p) => p.url.split('/').pop()), ['a.jpg']);
  assert.ok(LOOK_WORDS.tenue.test('New race suit for Austin') && !LOOK_WORDS.livree.test('Fans in Austin'));
});

test('photos Bluesky : images des posts (et des citations avec photos), hôtes autorisés', async () => {
  const res = { posts: [
    { author: { handle: 'f1fan.bsky.social' }, indexedAt: '2026-10-20T10:00:00Z', embed: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did/1@jpeg' }] } },
    { author: { handle: 'autre.bsky.social' }, indexedAt: '2026-10-20T11:00:00Z', embed: { media: { images: [{ fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did/2@jpeg' }] } } },
    { author: { handle: 'texte.bsky.social' }, indexedAt: '2026-10-20T12:00:00Z' },
  ] };
  assert.deepEqual(bskyPhotos(res).map((p) => [p.src, p.url.slice(-6)]), [['Bluesky @f1fan.bsky.social', '1@jpeg'], ['Bluesky @autre.bsky.social', '2@jpeg']]);
  let asked = '';
  const r = await socialPhotos({ q: 'Cadillac livery', since: Date.parse('2026-10-16T00:00:00Z'), fetchFn: async (u) => { asked = u; return { ok: true, json: async () => res }; } });
  assert.equal(r.items.length, 2);
  assert.match(asked, /q=Cadillac\+livery.*since=2026-10-16/);
  assert.deepEqual((await socialPhotos({ teams: ['ferrari'] })).errors, ['Instagram : compte non relié']);
  assert.ok(isSocialImageHost('scontent-cdg4-1.cdninstagram.com') && isSocialImageHost('cdn.bsky.app') && !isSocialImageHost('evil.com'));
});
