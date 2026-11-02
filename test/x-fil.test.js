import test from 'node:test';
import assert from 'node:assert/strict';
import { xSplit, xMoreText } from '../shared/social-draw.js';
import { cleanDraft } from '../shared/post-draft.js';
import { publishBluesky, replyBluesky } from '../shared/bluesky-publish.js';

const quali = ['couverture', 'podium', 'classement', 'vitesses', 'secteurs', 'duels', 'faits', 'question'];
const race = ['couverture', 'podium', 'classement', 'remontees', 'strategie', 'duels', 'faits', 'championnat', 'question'];

test('X et Bluesky : premier post de 4 images, la suite en réponse', () => {
  // Par défaut : couverture, podium, classement, meilleure image de données ; images de fin dans la suite, en dernier
  assert.deepEqual(xSplit(quali), { post: ['couverture', 'podium', 'classement', 'vitesses'], more: ['secteurs', 'duels', 'faits', 'question'] });
  assert.deepEqual(xSplit(race), { post: ['couverture', 'podium', 'classement', 'remontees'], more: ['strategie', 'duels', 'faits', 'question'] });
  assert.deepEqual(xSplit(['couverture', 'podium', 'classement', 'faits', 'question', 'abonnement']).more, ['question', 'abonnement']);
  // Tout tient dans le post : pas de suite
  assert.deepEqual(xSplit(['couverture', 'podium', 'classement', 'question']), { post: ['couverture', 'podium', 'classement', 'question'], more: [] });
  // Autres posts : les premières images, dans l'ordre
  assert.deepEqual(xSplit(['recapcover', 'recap-1', 'recap-2', 'recap-3', 'recap-4', 'recap-5']), { post: ['recapcover', 'recap-1', 'recap-2', 'recap-3'], more: ['recap-4', 'recap-5'] });
  // Choix du créateur : dans l'ordre des images, 4 au plus de chaque côté, images disparues ignorées
  assert.deepEqual(xSplit(quali, { post: ['faits', 'couverture'], more: ['secteurs', 'faits', 'disparue'] }), { post: ['couverture', 'faits'], more: ['secteurs'] });
  assert.equal(xSplit(quali, { post: quali, more: [] }).post.length, 4);
  // Plus aucune image du post (données changées) : choix par défaut
  assert.deepEqual(xSplit(quali, { post: ['disparue'], more: ['faits'] }), xSplit(quali));
  // Texte de la réponse d'après les noms des images
  assert.equal(xMoreText(['secteurs', 'faits', 'question']), '📊 La suite : meilleurs secteurs et faits marquants');
  assert.equal(xMoreText(['strategie', 'duels', 'faits']), '📊 La suite : stratégie des pneus, duels entre coéquipiers et faits marquants');
  assert.equal(xMoreText(['abonnement']), '📊 La suite');
});

test('brouillons : images de X gardées, anciens brouillons inchangés', () => {
  const id = '0b5c1e9a-1111-4a2b-9c3d-123456789abc';
  const old = cleanDraft({ id, d: { rows: [] }, skip: ['faits'] });
  assert.equal('xs' in old, false);
  assert.equal('xs' in cleanDraft({ id, d: {}, xs: null }), false);
  const dr = cleanDraft({ id, d: {}, xs: { post: ['couverture', 3, 'podium', 'classement', 'vitesses', 'en trop'], more: 'pas une liste' } });
  assert.deepEqual(dr.xs, { post: ['couverture', 'podium', 'classement', 'vitesses'], more: [] });
});

test('Bluesky : suite du fil en réponse au premier post, avec ses images et leur texte alternatif', async () => {
  const real = globalThis.fetch;
  const records = [];
  let uploads = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const m = String(url).split('/xrpc/')[1];
    const ok = (d) => ({ ok: true, status: 200, json: async () => d });
    if (m === 'com.atproto.server.createSession') return ok({ accessJwt: 'jwt', did: 'did:plc:moi', handle: 'moi.bsky.social' });
    if (m === 'com.atproto.repo.uploadBlob') return ok({ blob: { ref: { $link: `b${++uploads}` } } });
    if (m === 'com.atproto.repo.createRecord') { records.push(JSON.parse(opts.body).record); return ok({ uri: `at://did:plc:moi/app.bsky.feed.post/r${records.length}`, cid: `c${records.length}` }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const acc = { handle: 'moi.bsky.social', appPassword: 'mdp-app' };
    const img = (alt) => ({ blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' }), width: 1080, height: 1350, alt });
    const r = await publishBluesky(acc, 'Qualifs #F1', [img('Couverture'), img('Podium')]);
    await replyBluesky(acc, r.id, '📊 La suite : meilleurs secteurs', [img('Meilleurs secteurs'), img('Faits marquants')]);
    await replyBluesky(acc, r.id, 'Commentaire seul');
    assert.equal(uploads, 4);
    const root = { uri: 'at://did:plc:moi/app.bsky.feed.post/r1', cid: 'c1' };
    assert.deepEqual(records[1].reply, { root, parent: root });
    assert.equal(records[1].embed.$type, 'app.bsky.embed.images');
    assert.deepEqual(records[1].embed.images.map((i) => i.alt), ['Meilleurs secteurs', 'Faits marquants']);
    assert.deepEqual(records[1].embed.images[0].aspectRatio, { width: 1080, height: 1350 });
    assert.equal('embed' in records[2], false);   // réponse texte (premier commentaire) comme avant
  } finally { globalThis.fetch = real; }
});
